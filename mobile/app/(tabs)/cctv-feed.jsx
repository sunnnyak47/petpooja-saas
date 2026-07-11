import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Pressable,
  Platform,
  Dimensions,
  RefreshControl,
  Modal,
  Alert,
  Linking,
  Image,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/context/ThemeContext';
import { useOutlet } from '../../src/context/OutletContext';
import { PressCard } from '../../src/components/PressCard';
import { EmptyState } from '../../src/components/EmptyState';
import SkeletonBox from '../../src/components/SkeletonBox';
import { useCameras, bustCache, isValidUrl } from '../../src/hooks/useCameras';

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_GAP = 12;
const H_PADDING = 16;
const TILE_W = (SCREEN_W - H_PADDING * 2 - GRID_GAP) / 2;
const TILE_H = Math.round(TILE_W * 0.72);
const SNAPSHOT_INTERVAL_MS = 5000;

const isWeb = Platform.OS === 'web';

// ─── Snapshot preview — refreshes an <Image> on an interval ──────────────────
function SnapshotPreview({ url, active }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tick, setTick] = useState(() => Date.now());
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!url || !active) return undefined;
    const id = setInterval(() => setTick(Date.now()), SNAPSHOT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [url, active]);

  const src = useMemo(() => (url ? bustCache(url, tick) : null), [url, tick]);

  if (!url || errored) {
    return (
      <View style={styles.previewFallback}>
        <Ionicons name="videocam-off-outline" size={26} color={colors.textMuted} />
        <Text style={styles.previewFallbackText}>
          {errored ? 'Preview unavailable' : 'No snapshot'}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: src }}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
      onError={() => setErrored(true)}
    />
  );
}

// ─── Camera tile ─────────────────────────────────────────────────────────────
function CameraTile({ camera, onLive, onEdit }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Animated.View
      entering={isWeb ? undefined : FadeIn.duration(220)}
      style={styles.tile}
    >
      <View style={styles.tilePreview}>
        <SnapshotPreview url={camera.snapshotUrl} active />

        {/* Top gradient-ish overlay row: LIVE badge + edit */}
        <View style={styles.tileTopRow}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
          <TouchableOpacity
            style={styles.tileEditBtn}
            onPress={() => onEdit(camera)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="ellipsis-horizontal" size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Play button */}
        <PressCard style={styles.playBtn} onPress={() => onLive(camera)} scaleDown={0.9}>
          <Ionicons name="play" size={22} color="#fff" />
        </PressCard>
      </View>

      <View style={styles.tileFooter}>
        <Text style={styles.tileName} numberOfLines={1}>
          {camera.name}
        </Text>
        <TouchableOpacity style={styles.tileLiveBtn} onPress={() => onLive(camera)}>
          <Ionicons name="expand-outline" size={13} color={colors.accent} />
          <Text style={styles.tileLiveText}>Live</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── Live viewer modal (no WebView available → deep-links + snapshot) ────────
// react-native-webview is NOT in package.json, so live RTSP/HLS playback is
// delegated to the OS via Linking.openURL (VLC / browser / native player). The
// modal itself shows the enlarged, faster-refreshing snapshot as a live proxy.
function LiveModal({ camera, visible, onClose }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [tick, setTick] = useState(() => Date.now());
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!visible || !camera?.snapshotUrl) return undefined;
    setErrored(false);
    const id = setInterval(() => setTick(Date.now()), 2000);
    return () => clearInterval(id);
  }, [visible, camera?.snapshotUrl]);

  const openExternally = useCallback(async () => {
    if (!camera?.streamUrl) return;
    try {
      const ok = await Linking.canOpenURL(camera.streamUrl);
      if (!ok) {
        // rtsp:// often reports false even when a player exists — try anyway.
        await Linking.openURL(camera.streamUrl);
        return;
      }
      await Linking.openURL(camera.streamUrl);
    } catch {
      Alert.alert(
        'Cannot open stream',
        'No app on this device can open the stream URL. Install a player such as VLC that supports RTSP/HLS.'
      );
    }
  }, [camera]);

  if (!camera) return null;
  const snap = camera.snapshotUrl ? bustCache(camera.snapshotUrl, tick) : null;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
      <View style={styles.liveRoot}>
        {/* Header */}
        <View style={[styles.liveHeader, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={styles.liveClose} hitSlop={10}>
            <Ionicons name="chevron-down" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.liveTitle} numberOfLines={1}>{camera.name}</Text>
            <View style={styles.liveSubRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveSubText}>Live preview</Text>
            </View>
          </View>
        </View>

        {/* Stage */}
        <View style={styles.liveStage}>
          {snap && !errored ? (
            <Image
              source={{ uri: snap }}
              style={styles.liveImage}
              resizeMode="contain"
              onError={() => setErrored(true)}
            />
          ) : (
            <View style={styles.liveFallback}>
              <Ionicons name="videocam-outline" size={48} color="#64748b" />
              <Text style={styles.liveFallbackTitle}>
                {camera.snapshotUrl ? 'Snapshot unavailable' : 'No snapshot configured'}
              </Text>
              <Text style={styles.liveFallbackText}>
                Open the full stream in your external player below.
              </Text>
            </View>
          )}
        </View>

        {/* Controls */}
        <View style={[styles.liveControls, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.liveUrlRow}>
            <Ionicons name="link-outline" size={14} color="#94a3b8" />
            <Text style={styles.liveUrl} numberOfLines={1}>{camera.streamUrl}</Text>
          </View>
          <TouchableOpacity style={styles.liveOpenBtn} onPress={openExternally} activeOpacity={0.85}>
            <Ionicons name="open-outline" size={18} color="#fff" />
            <Text style={styles.liveOpenText}>Open stream in player</Text>
          </TouchableOpacity>
          <Text style={styles.liveHint}>
            RTSP/HLS opens in an external app (e.g. VLC). Snapshot refreshes here every 2s.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

// ─── Add / Edit camera sheet ─────────────────────────────────────────────────
function CameraFormModal({ visible, camera, onClose, onSave, onDelete }) {
  const { colors } = useTheme();
  const modalStyles = useMemo(() => makeModalStyles(colors), [colors]);
  const isEdit = !!camera;
  const [name, setName] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [snapshotUrl, setSnapshotUrl] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setErrors({});
    if (camera) {
      setName(camera.name ?? '');
      setStreamUrl(camera.streamUrl ?? '');
      setSnapshotUrl(camera.snapshotUrl ?? '');
    } else {
      setName('');
      setStreamUrl('');
      setSnapshotUrl('');
    }
  }, [visible, camera]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const res = await onSave({ name, streamUrl, snapshotUrl });
    setSaving(false);
    if (res && res.ok === false) {
      setErrors(res.errors || {});
      return;
    }
    onClose();
  }, [name, streamUrl, snapshotUrl, onSave, onClose]);

  const confirmDelete = useCallback(() => {
    Alert.alert('Remove camera', `Remove "${camera?.name}" from this outlet?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          onDelete(camera.id);
          onClose();
        },
      },
    ]);
  }, [camera, onDelete, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={modalStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handleBar} />
          <View style={modalStyles.sheetHeader}>
            <Text style={modalStyles.sheetTitle}>{isEdit ? 'Edit Camera' : 'Add Camera'}</Text>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={modalStyles.scrollContent}
          >
            {/* Name */}
            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.fieldLabel}>Camera Name</Text>
              <TextInput
                style={[modalStyles.input, errors.name && modalStyles.inputError]}
                placeholder="e.g. Kitchen Entrance"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
                returnKeyType="next"
              />
              {errors.name ? <Text style={modalStyles.errText}>{errors.name}</Text> : null}
            </View>

            {/* Stream URL */}
            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.fieldLabel}>Stream URL (RTSP / HTTP)</Text>
              <TextInput
                style={[modalStyles.input, errors.streamUrl && modalStyles.inputError]}
                placeholder="rtsp://192.168.1.10:554/stream1"
                placeholderTextColor={colors.textMuted}
                value={streamUrl}
                onChangeText={setStreamUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="next"
              />
              {errors.streamUrl ? <Text style={modalStyles.errText}>{errors.streamUrl}</Text> : null}
            </View>

            {/* Snapshot URL */}
            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.fieldLabel}>Snapshot / MJPEG URL (optional)</Text>
              <TextInput
                style={[modalStyles.input, errors.snapshotUrl && modalStyles.inputError]}
                placeholder="http://192.168.1.10/snapshot.jpg"
                placeholderTextColor={colors.textMuted}
                value={snapshotUrl}
                onChangeText={setSnapshotUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
              />
              {errors.snapshotUrl ? (
                <Text style={modalStyles.errText}>{errors.snapshotUrl}</Text>
              ) : (
                <Text style={modalStyles.helpText}>
                  Used for the tile preview. Leave blank if your camera has no still image.
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={[modalStyles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={modalStyles.saveBtnText}>{isEdit ? 'Save Changes' : 'Add Camera'}</Text>
              )}
            </TouchableOpacity>

            {isEdit && (
              <TouchableOpacity style={modalStyles.deleteBtn} onPress={confirmDelete} activeOpacity={0.8}>
                <Ionicons name="trash-outline" size={16} color={colors.error} />
                <Text style={modalStyles.deleteText}>Remove Camera</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function CctvSkeleton() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.grid}>
      {[0, 1, 2, 3].map((i) => (
        <SkeletonBox key={i} width={TILE_W} height={TILE_H + 44} borderRadius={16} color={colors.pillBg} />
      ))}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function CctvFeedScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { outletId, currentOutlet } = useOutlet();
  const { cameras, isLoading, error, addCamera, editCamera, removeCamera, reload } =
    useCameras(outletId);

  const [refreshing, setRefreshing] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState(null); // null = add
  const [liveCamera, setLiveCamera] = useState(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cameras;
    return cameras.filter((c) => c.name?.toLowerCase().includes(q));
  }, [cameras, search]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const openAdd = useCallback(() => {
    setEditing(null);
    setFormVisible(true);
  }, []);

  const openEdit = useCallback((cam) => {
    setEditing(cam);
    setFormVisible(true);
  }, []);

  const handleSave = useCallback(
    (input) => (editing ? editCamera(editing.id, input) : addCamera(input)),
    [editing, addCamera, editCamera]
  );

  const onlineCount = useMemo(
    () => cameras.filter((c) => isValidUrl(c.streamUrl)).length,
    [cameras]
  );

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>CCTV Feed</Text>
            <Text style={styles.headerSub}>
              {currentOutlet?.name ? `${currentOutlet.name} · ` : ''}
              {cameras.length} camera{cameras.length === 1 ? '' : 's'}
              {onlineCount ? ` · ${onlineCount} ready` : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={openAdd} style={styles.headerAddBtn} activeOpacity={0.85}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {cameras.length > 0 && (
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search cameras…"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <CctvSkeleton />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: H_PADDING,
            paddingBottom: 120 + insets.bottom,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        >
          {filtered.length === 0 ? (
            search.trim() ? (
              <EmptyState
                icon="🔍"
                title="No matches"
                subtitle={`No camera named "${search.trim()}".`}
              />
            ) : (
              <EmptyState
                icon="📹"
                title="No cameras configured"
                subtitle="Add your camera's RTSP/HTTP stream URL to monitor your outlet live."
                action={{ label: 'Add Camera', onPress: openAdd }}
              />
            )
          ) : (
            <View style={styles.grid}>
              {filtered.map((cam) => (
                <CameraTile key={cam.id} camera={cam} onLive={setLiveCamera} onEdit={openEdit} />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* FAB */}
      {!isLoading && cameras.length > 0 && (
        <View style={[styles.fab, { bottom: 24 + insets.bottom }]}>
          <PressCard onPress={openAdd} style={styles.fabInner} scaleDown={0.9}>
            <View style={styles.fabGradient}>
              <Ionicons name="add" size={28} color="#fff" />
            </View>
          </PressCard>
        </View>
      )}

      <CameraFormModal
        visible={formVisible}
        camera={editing}
        onClose={() => setFormVisible(false)}
        onSave={handleSave}
        onDelete={removeCamera}
      />

      <LiveModal
        camera={liveCamera}
        visible={!!liveCamera}
        onClose={() => setLiveCamera(null)}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: 0.3 },
  headerSub: { fontSize: 13, color: colors.textSecondary, marginTop: 3, fontWeight: '500' },
  headerAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.error + '18',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  errorBannerText: { fontSize: 13, color: colors.error, fontWeight: '600', flex: 1 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    padding: isWeb ? H_PADDING : 0,
  },

  // Tile
  tile: {
    width: TILE_W,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  tilePreview: {
    width: '100%',
    height: TILE_H,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewFallback: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  previewFallbackText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  tileTopRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15,23,42,0.6)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f87171' },
  liveBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.6 },
  tileEditBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(15,23,42,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(37,99,235,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  tileFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tileName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text, marginRight: 8 },
  tileLiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.accent + '14',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  tileLiveText: { fontSize: 12, fontWeight: '700', color: colors.accent },

  // FAB
  fab: { position: 'absolute', right: 20 },
  fabInner: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Live modal
  liveRoot: { flex: 1, backgroundColor: '#0b1120' },
  liveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  liveClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  liveSubRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  liveSubText: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  liveStage: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  liveImage: { width: '100%', height: '100%' },
  liveFallback: { alignItems: 'center', gap: 8, paddingHorizontal: 32 },
  liveFallbackTitle: { fontSize: 15, fontWeight: '700', color: '#e2e8f0', marginTop: 6 },
  liveFallbackText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 19 },
  liveControls: { paddingHorizontal: 20, paddingTop: 16, backgroundColor: '#0b1120', gap: 12 },
  liveUrlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  liveUrl: { flex: 1, fontSize: 12, color: '#cbd5e1', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  liveOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  liveOpenText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  liveHint: { fontSize: 11, color: '#64748b', textAlign: 'center', lineHeight: 16 },
});

// ─── Modal styles ────────────────────────────────────────────────────────────
const makeModalStyles = (colors) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  handleBar: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.pillBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { padding: 20, gap: 16, paddingBottom: 36 },
  fieldGroup: { gap: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.card,
  },
  inputError: { borderColor: colors.error },
  errText: { fontSize: 12, color: colors.error, fontWeight: '600', marginTop: 2 },
  helpText: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  saveBtn: {
    height: 48,
    backgroundColor: colors.accent,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.error + '40',
    backgroundColor: colors.error + '18',
  },
  deleteText: { fontSize: 14, fontWeight: '700', color: colors.error },
});
