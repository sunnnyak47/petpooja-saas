/**
 * Assistant — the read-only AI helper ("Ask"), feature parity with the web panel.
 * Expo 54 · RN 0.81 · expo-router 6 · React 19.
 *
 * A chat screen over POST /assistant/ask: ask questions about the SELECTED
 * outlet's sales, stock, menu, customers, forecasts, etc. Read-only — it never
 * changes anything. Data + pure transforms live in src/hooks/useAssistant.js.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';

import { useTheme } from '../../src/context/ThemeContext';
import { useAssistant } from '../../src/hooks/useAssistant';

// Tapping a proactive alert asks the assistant the matching question, so the
// full grounded answer lands in the chat thread.
const ALERT_Q = {
  low_stock: "what's running low on stock?",
  sales_drop: 'how are sales this week?',
  tax_due: 'how much GST or BAS do I owe?',
  fraud_open: 'any fraud alerts?',
};

export default function AssistantScreen() {
  const { colors, isDark } = useTheme();
  const { messages, send, isPending, examples, resolved, confirmAction, cancelAction, isActing, alerts } = useAssistant();
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);

  // Auto-scroll to the newest message / typing indicator.
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages.length, isPending]);

  const submit = useCallback(
    (q) => {
      const t = String(q ?? input).trim();
      if (!t || isPending) return;
      send(t);
      setInput('');
    },
    [input, isPending, send],
  );

  const s = styles(colors);
  const empty = messages.length === 0;
  const sevColor = (sev) => (sev === 'high' ? '#dc2626' : sev === 'medium' ? '#d97706' : colors.accent);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.headerBg} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={s.headerTitleWrap}>
          <View style={s.headerRow}>
            <Ionicons name="sparkles" size={18} color={colors.accent} />
            <Text style={s.headerTitle}>Assistant</Text>
          </View>
          <Text style={s.headerSub}>Ask about your business · read-only</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={s.flex}
          contentContainerStyle={[s.scrollBody, empty && alerts.length === 0 && s.scrollBodyEmpty]}
          keyboardShouldPersistTaps="handled"
        >
          {alerts.length > 0 && (
            <View style={s.alertBlock}>
              <Text style={s.alertHeading}>Needs your attention</Text>
              {alerts.map((al) => (
                <TouchableOpacity
                  key={al.key}
                  activeOpacity={0.7}
                  onPress={() => submit(ALERT_Q[al.key] || al.title)}
                  style={[s.alertCard, { borderLeftColor: sevColor(al.severity) }]}
                >
                  <Text style={s.alertTitle}>{al.title}</Text>
                  <Text style={s.alertMsg}>{al.message}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {empty ? (
            <View style={s.intro}>
              <View style={s.introIcon}>
                <Ionicons name="sparkles" size={28} color={colors.accent} />
              </View>
              <Text style={s.introTitle}>Ask me about your business</Text>
              <Text style={s.introText}>
                Sales, stock, your menu, top customers, forecasts and more — grounded in your live data. I can look things up, but I never change anything.
              </Text>
              <View style={s.chips}>
                {examples.map((ex) => (
                  <TouchableOpacity key={ex} style={s.chip} activeOpacity={0.7} onPress={() => submit(ex)}>
                    <Text style={s.chipText}>{ex}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            messages.map((m) => (
              <Animated.View
                key={m.id}
                entering={FadeInDown.duration(180)}
                style={[s.bubbleRow, m.role === 'user' ? s.rowUser : s.rowBot]}
              >
                <View style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleBot]}>
                  <Text style={[s.bubbleText, m.role === 'user' ? s.bubbleTextUser : s.bubbleTextBot]}>{m.text}</Text>
                  {m.clarify && Array.isArray(m.clarify.options) && m.clarify.options.length > 0 && (
                    <View style={s.clarifyRow}>
                      {m.clarify.options.map((o, oi) => (
                        <TouchableOpacity key={oi} activeOpacity={0.7} style={s.clarifyChip} onPress={() => submit(o.query)}>
                          <Text style={s.clarifyChipText}>{o.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {m.action && m.action.token ? (
                    resolved?.[m.id] === 'done' ? (
                      <Text style={s.actionResolved}>✓ Actioned</Text>
                    ) : resolved?.[m.id] === 'cancelled' ? (
                      <Text style={s.actionResolved}>Cancelled</Text>
                    ) : (
                      <View style={s.actionRow}>
                        <Pressable
                          onPress={() => confirmAction(m.id, m.action.token)}
                          disabled={resolved?.[m.id] === 'pending' || isActing}
                          style={[s.actionBtn, m.action.warn ? s.actionWarn : s.actionConfirm, (resolved?.[m.id] === 'pending' || isActing) && { opacity: 0.6 }]}
                        >
                          <Text style={s.actionConfirmText}>{resolved?.[m.id] === 'pending' ? 'Working…' : (m.action.warn ? 'Yes, send' : 'Confirm')}</Text>
                        </Pressable>
                        <Pressable onPress={() => cancelAction(m.id)} disabled={resolved?.[m.id] === 'pending'} style={[s.actionBtn, s.actionCancel]}>
                          <Text style={s.actionCancelText}>Cancel</Text>
                        </Pressable>
                      </View>
                    )
                  ) : null}
                </View>
              </Animated.View>
            ))
          )}

          {isPending && (
            <View style={[s.bubbleRow, s.rowBot]}>
              <View style={[s.bubble, s.bubbleBot, s.typing]}>
                <ActivityIndicator size="small" color={colors.textMuted} />
                <Text style={s.typingText}>Thinking…</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input bar */}
        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask a question…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => submit()}
            editable={!isPending}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || isPending) && s.sendBtnDisabled]}
            onPress={() => submit()}
            disabled={!input.trim() || isPending}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = (c) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: c.headerBg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    backBtn: { padding: 4, marginRight: 4 },
    headerTitleWrap: { flex: 1 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: c.text },
    headerSub: { fontSize: 12, color: c.textMuted, marginTop: 1 },

    scrollBody: { padding: 16, paddingBottom: 24, gap: 10 },
    scrollBodyEmpty: { flexGrow: 1, justifyContent: 'center' },

    // Proactive alerts
    alertBlock: { gap: 8, marginBottom: 6 },
    alertHeading: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: c.textMuted },
    alertCard: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderLeftWidth: 3, borderRadius: 12, padding: 12 },
    alertTitle: { fontSize: 13.5, fontWeight: '600', color: c.text },
    alertMsg: { fontSize: 12.5, color: c.textMuted, lineHeight: 18, marginTop: 3 },

    // Clarify quick-pick chips (e.g. "which customer?")
    clarifyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    clarifyChip: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg },
    clarifyChipText: { fontSize: 12.5, color: c.text, fontWeight: '500' },

    // Empty / intro
    intro: { alignItems: 'center', paddingHorizontal: 8 },
    introIcon: {
      width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.pillBg, marginBottom: 14,
    },
    introTitle: { fontSize: 18, fontWeight: '700', color: c.text, textAlign: 'center' },
    introText: { fontSize: 14, color: c.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 8, maxWidth: 320 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 20 },
    chip: {
      borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, backgroundColor: c.card,
      borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9,
    },
    chipText: { fontSize: 13, color: c.text, fontWeight: '500' },

    // Chat bubbles
    bubbleRow: { flexDirection: 'row' },
    rowUser: { justifyContent: 'flex-end' },
    rowBot: { justifyContent: 'flex-start' },
    bubble: { maxWidth: '86%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
    bubbleUser: { backgroundColor: c.accent, borderBottomRightRadius: 4 },
    bubbleBot: {
      backgroundColor: c.card, borderBottomLeftRadius: 4,
      borderWidth: StyleSheet.hairlineWidth, borderColor: c.border,
    },
    bubbleText: { fontSize: 15, lineHeight: 21 },
    bubbleTextUser: { color: '#fff' },
    bubbleTextBot: { color: c.text },
    actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    actionBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
    actionConfirm: { backgroundColor: c.primary || c.accent || '#2563eb' },
    actionWarn: { backgroundColor: '#dc2626' },
    actionConfirmText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    actionCancel: { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
    actionCancelText: { color: c.textMuted, fontWeight: '700', fontSize: 13 },
    actionResolved: { marginTop: 8, fontSize: 12, color: c.textMuted },
    typing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    typingText: { fontSize: 14, color: c.textMuted },

    // Input
    inputBar: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 8,
      paddingHorizontal: 12, paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.headerBg,
    },
    input: {
      flex: 1, maxHeight: 120, minHeight: 44,
      backgroundColor: c.inputBg, borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth, borderColor: c.border,
      paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
      fontSize: 15, color: c.text,
    },
    sendBtn: {
      width: 44, height: 44, borderRadius: 22, backgroundColor: c.accent,
      alignItems: 'center', justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.4 },
  });
