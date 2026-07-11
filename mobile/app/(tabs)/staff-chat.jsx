/**
 * Staff Chat — internal team messaging for the selected outlet.
 * Expo 54 · RN 0.81 · expo-router 6 · React 19
 *
 * Bubbles (mine right/blue, others left/slate) with sender name + time,
 * day separators, auto-scroll to newest, poll (5s) + native WS realtime,
 * optimistic send. MS-RM light/dark themed.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useAuth } from '../../src/context/AuthContext';
import { useOutlet } from '../../src/context/OutletContext';
import { useTheme } from '../../src/context/ThemeContext';
import {
  useStaffMessages,
  useSendMessage,
  useStaffChatRealtime,
  groupMessagesByDay,
  isMine,
  formatMessageTime,
} from '../../src/hooks/useStaffChat';

// ─── Avatar palette (deterministic per sender) ───────────────────────────────
const AVATAR_COLORS = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#ca8a04'];
function avatarColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DaySeparator({ label, colors }) {
  return (
    <View style={styles.dayRow}>
      <View style={[styles.dayPill, { backgroundColor: colors.pillBg }]}>
        <Text style={[styles.dayText, { color: colors.textSecondary }]}>{label}</Text>
      </View>
    </View>
  );
}

function MessageBubble({ msg, mine, showName, colors }) {
  const bubbleBg = mine ? colors.accent : colors.card;
  const textColor = mine ? '#ffffff' : colors.text;
  const metaColor = mine ? 'rgba(255,255,255,0.75)' : colors.textMuted;

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowOther]}
    >
      {!mine && (
        <View style={[styles.avatar, { backgroundColor: avatarColor(msg.user_name) }]}>
          <Text style={styles.avatarText}>{initials(msg.user_name)}</Text>
        </View>
      )}
      <View style={{ maxWidth: '78%' }}>
        {!mine && showName && (
          <Text style={[styles.senderName, { color: colors.textSecondary }]} numberOfLines={1}>
            {msg.user_name}
          </Text>
        )}
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: bubbleBg,
              borderColor: mine ? 'transparent' : colors.border,
              borderTopRightRadius: mine ? 4 : 16,
              borderTopLeftRadius: mine ? 16 : 4,
              opacity: msg.pending ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[styles.bubbleText, { color: textColor }]}>{msg.body}</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.metaTime, { color: metaColor }]}>
              {formatMessageTime(msg.created_at)}
            </Text>
            {mine && (
              <Ionicons
                name={msg.pending ? 'time-outline' : 'checkmark-done'}
                size={13}
                color={metaColor}
                style={{ marginLeft: 3 }}
              />
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

function ChatSkeleton({ colors }) {
  const rows = [
    { mine: false, w: 180 }, { mine: true, w: 140 }, { mine: false, w: 220 },
    { mine: false, w: 120 }, { mine: true, w: 190 }, { mine: true, w: 100 },
  ];
  return (
    <View style={{ padding: 16, gap: 14 }}>
      {rows.map((r, i) => (
        <View key={i} style={[styles.skelRow, { justifyContent: r.mine ? 'flex-end' : 'flex-start' }]}>
          {!r.mine && <View style={[styles.skelAvatar, { backgroundColor: colors.border }]} />}
          <View style={[styles.skelBubble, { width: r.w, backgroundColor: colors.border }]} />
        </View>
      ))}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function StaffChatScreen() {
  const { user } = useAuth();
  const { outletId, currentOutlet } = useOutlet();
  const { colors, isDark } = useTheme();

  const listRef = useRef(null);
  const [draft, setDraft] = useState('');

  const { data: messages = [], isLoading, isError, refetch, isRefetching } = useStaffMessages();
  const sendMutation = useSendMessage(user);
  useStaffChatRealtime();

  const rows = useMemo(() => groupMessagesByDay(messages), [messages]);
  const memberCount = messages.reduce((set, m) => set.add(m.user_id), new Set()).size;

  const scrollToEnd = useCallback((animated = true) => {
    // Guard: only scroll when there's content to avoid a range warning.
    if (rows.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
    }
  }, [rows.length]);

  const onSend = useCallback(() => {
    const body = draft.trim();
    if (!body || !outletId) return;
    setDraft('');
    sendMutation.mutate({ body });
    scrollToEnd(true);
  }, [draft, outletId, sendMutation, scrollToEnd]);

  const renderItem = useCallback(({ item, index }) => {
    if (item.type === 'day') return <DaySeparator label={item.label} colors={colors} />;
    const mine = isMine(item, user?.id);
    // Show the sender name only when the previous rendered row was a different
    // author (or a day separator) — collapses consecutive bubbles.
    const prev = rows[index - 1];
    const showName = !prev || prev.type === 'day' || prev.user_id !== item.user_id;
    return <MessageBubble msg={item} mine={mine} showName={showName} colors={colors} />;
  }, [rows, colors, user?.id]);

  const styon = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <View style={[styles.headerIcon, { backgroundColor: colors.accent + '18' }]}>
          <Ionicons name="chatbubbles" size={22} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            Staff Chat
          </Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]} numberOfLines={1}>
            {currentOutlet?.name ? `${currentOutlet.name} · ` : ''}
            {messages.length} message{messages.length === 1 ? '' : 's'}
            {memberCount > 0 ? ` · ${memberCount} in chat` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={() => refetch()} style={styles.headerBtn} hitSlop={10}>
          <Ionicons name="refresh" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Body */}
        {isLoading ? (
          <ChatSkeleton colors={colors} />
        ) : isError ? (
          <View style={styles.center}>
            <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.errTitle, { color: colors.text }]}>Couldn't load messages</Text>
            <Text style={[styles.errSub, { color: colors.textMuted }]}>
              Check your connection and try again.
            </Text>
            <TouchableOpacity style={[styon.retryBtn]} onPress={() => refetch()}>
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyEmoji}>💬</Text>
            <Text style={[styles.errTitle, { color: colors.text }]}>No messages yet — say hi 👋</Text>
            <Text style={[styles.errSub, { color: colors.textMuted }]}>
              Start the conversation with your team.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(item) => (item.type === 'day' ? item.id : item.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollToEnd(false)}
            onLayout={() => scrollToEnd(false)}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching && !isLoading}
                onRefresh={refetch}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }
          />
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View style={[styles.inputWrap, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Message your team…"
              placeholderTextColor={colors.textMuted}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={2000}
              onSubmitEditing={onSend}
              blurOnSubmit={false}
            />
          </View>
          <TouchableOpacity
            style={[
              styles.sendBtn,
              { backgroundColor: draft.trim() && outletId ? colors.accent : colors.border },
            ]}
            onPress={onSend}
            disabled={!draft.trim() || !outletId || sendMutation.isPending}
            activeOpacity={0.8}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color={draft.trim() && outletId ? '#fff' : colors.textMuted} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (colors) =>
  StyleSheet.create({
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.accent,
      paddingHorizontal: 20,
      paddingVertical: 11,
      borderRadius: 10,
      marginTop: 18,
    },
  });

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  headerSub: { fontSize: 12.5, marginTop: 1, fontWeight: '500' },
  headerBtn: { padding: 6 },

  listContent: { paddingVertical: 12, paddingHorizontal: 12, gap: 3 },

  dayRow: { alignItems: 'center', marginVertical: 10 },
  dayPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  dayText: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.2 },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 2, gap: 8 },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },

  avatar: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  avatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  senderName: { fontSize: 12, fontWeight: '700', marginBottom: 3, marginLeft: 4 },

  bubble: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bubbleText: { fontSize: 15, lineHeight: 20.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3 },
  metaTime: { fontSize: 10.5, fontWeight: '600' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 52, marginBottom: 14 },
  errTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  errSub: { fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 10 : 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    maxHeight: 120,
    justifyContent: 'center',
  },
  input: { fontSize: 15, lineHeight: 20, maxHeight: 110, padding: 0 },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },

  skelRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  skelAvatar: { width: 30, height: 30, borderRadius: 15 },
  skelBubble: { height: 40, borderRadius: 16 },
});
