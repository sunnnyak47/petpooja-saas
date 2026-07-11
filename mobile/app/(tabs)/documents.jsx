import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Pressable,
  Platform,
  RefreshControl,
  Modal,
  Alert,
  Linking,
  KeyboardAvoidingView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  FadeIn,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/context/ThemeContext';
import { PressCard } from '../../src/components/PressCard';
import { EmptyState } from '../../src/components/EmptyState';
import SkeletonBox from '../../src/components/SkeletonBox';
import { useOutlet } from '../../src/context/OutletContext';
import {
  useDocuments,
  useUploadDocument,
  useDeleteDocument,
  getExpiryStatus,
  groupByCategory,
  formatFileSize,
  fileIconFor,
  DOC_CATEGORIES,
} from '../../src/hooks/useDocuments';

const CATEGORY_META = {
  License:     { color: '#2563eb', icon: 'ribbon-outline' },
  Contract:    { color: '#7c3aed', icon: 'reader-outline' },
  Certificate: { color: '#16a34a', icon: 'medal-outline' },
  Menu:        { color: '#d97706', icon: 'restaurant-outline' },
  Other:       { color: '#64748b', icon: 'folder-outline' },
};

// Flatten grouped sections into a single list of { type:'header' } / { type:'doc' }
// rows so a single FlashList renders sticky-ish category headers + rows.
function buildRows(sections) {
  const rows = [];
  for (const s of sections) {
    rows.push({ type: 'header', key: `h-${s.category}`, category: s.category, count: s.data.length });
    for (const doc of s.data) rows.push({ type: 'doc', key: doc.id, doc });
  }
  return rows;
}

// ─── Expiry badge ─────────────────────────────────────────────────────────────
function ExpiryBadge({ expiresAt }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { status, days } = getExpiryStatus(expiresAt);
  if (status === 'none') return null;

  let bg, fg, label;
  if (status === 'expired') {
    bg = colors.error + '18'; fg = colors.error; label = `Expired ${Math.abs(days)}d ago`;
  } else if (status === 'soon') {
    bg = colors.warning + '18'; fg = colors.warning; label = days === 0 ? 'Expires today' : `Expires in ${days}d`;
  } else {
    bg = colors.success + '18'; fg = colors.success; label = 'Valid';
  }

  return (
    <View style={[styles.expiryBadge, { backgroundColor: bg }]}>
      <Ionicons
        name={status === 'ok' ? 'shield-checkmark' : 'alert-circle'}
        size={12}
        color={fg}
      />
      <Text style={[styles.expiryText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// ─── Document row ─────────────────────────────────────────────────────────────
function DocumentRow({ doc, onOpen, onDelete }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isWeb = Platform.OS === 'web';
  const meta = CATEGORY_META[doc.category] || CATEGORY_META.Other;
  const icon = fileIconFor(doc.file_type, doc.name);

  return (
    <Animated.View
      entering={isWeb ? undefined : FadeIn.duration(220)}
      style={styles.rowWrapper}
    >
      <PressCard style={styles.rowInner} onPress={() => onOpen(doc)} scaleDown={0.98}>
        <View style={[styles.fileIconBox, { backgroundColor: meta.color + '18' }]}>
          <Ionicons name={icon} size={22} color={meta.color} />
        </View>

        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={styles.rowName} numberOfLines={1}>{doc.name}</Text>
          <View style={styles.rowMetaLine}>
            <Text style={styles.rowMetaText}>{formatFileSize(doc.file_size)}</Text>
            {doc.created_at ? (
              <>
                <Text style={styles.dotSep}>·</Text>
                <Text style={styles.rowMetaText}>
                  {new Date(doc.created_at).toLocaleDateString()}
                </Text>
              </>
            ) : null}
          </View>
          <View style={styles.badgeRow}>
            <ExpiryBadge expiresAt={doc.expires_at} />
          </View>
        </View>

        <TouchableOpacity
          onPress={() => onDelete(doc)}
          style={styles.deleteBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </PressCard>
    </Animated.View>
  );
}

// ─── Category header row ──────────────────────────────────────────────────────
function CategoryHeader({ category, count }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const meta = CATEGORY_META[category] || CATEGORY_META.Other;
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={meta.icon} size={15} color={meta.color} />
      <Text style={styles.sectionTitle}>{category}</Text>
      <View style={styles.sectionCountPill}>
        <Text style={styles.sectionCountText}>{count}</Text>
      </View>
    </View>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function DocumentsSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <SkeletonBox width={140} height={20} borderRadius={6} color={colors.pillBg} />
      {[0, 1, 2, 3].map((i) => (
        <SkeletonBox key={i} width="100%" height={80} borderRadius={16} color={colors.pillBg} />
      ))}
    </View>
  );
}

// ─── Upload sheet ─────────────────────────────────────────────────────────────
function UploadSheet({ visible, onClose, onSubmit, isUploading }) {
  const { colors } = useTheme();
  const modalStyles = useMemo(() => makeModalStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('License');
  const [expiry, setExpiry] = useState('');       // YYYY-MM-DD
  const [file, setFile] = useState(null);          // { uri, name, mimeType }

  useEffect(() => {
    if (visible) {
      setName('');
      setCategory('License');
      setExpiry('');
      setFile(null);
    }
  }, [visible]);

  // Pick a file (PDF/image/doc) from the device via expo-document-picker. The
  // hook's buildDocumentFormData expects { uri, name, mimeType }.
  const pickFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*',
               'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) return;
      setFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size });
      // Prefill the name from the filename (sans extension) if the user hasn't typed one.
      if (!name.trim() && asset.name) {
        setName(asset.name.replace(/\.[^.]+$/, ''));
      }
    } catch (err) {
      Alert.alert('Could not pick file', err?.message || 'Please try again.');
    }
  }, [name]);

  const validExpiry = useMemo(() => {
    if (!expiry.trim()) return true;
    return /^\d{4}-\d{2}-\d{2}$/.test(expiry.trim()) && !isNaN(new Date(expiry).getTime());
  }, [expiry]);

  const handleSubmit = useCallback(() => {
    if (!name.trim()) return Alert.alert('Validation', 'Document name is required.');
    if (!file) return Alert.alert('No file', 'Select a file to upload first.');
    if (!validExpiry) return Alert.alert('Validation', 'Expiry must be a valid YYYY-MM-DD date.');
    onSubmit({
      file,
      name: name.trim(),
      category,
      expires_at: expiry.trim() ? new Date(expiry.trim()).toISOString() : null,
    });
  }, [name, file, category, expiry, validExpiry, onSubmit]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={modalStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handleBar} />
          <View style={modalStyles.sheetHeader}>
            <Text style={modalStyles.sheetTitle}>Upload Document</Text>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={modalStyles.scrollContent}
          >
            {/* File picker */}
            <TouchableOpacity style={modalStyles.filePicker} onPress={pickFile} activeOpacity={0.8}>
              <Ionicons
                name={file ? 'document-attach' : 'cloud-upload-outline'}
                size={22}
                color={colors.accent}
              />
              <Text style={modalStyles.filePickerText} numberOfLines={1}>
                {file ? file.name : 'Choose a file (PDF, image)…'}
              </Text>
            </TouchableOpacity>

            {/* Name */}
            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.fieldLabel}>Document Name</Text>
              <TextInput
                style={modalStyles.input}
                placeholder="e.g. FSSAI License 2026"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* Category */}
            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.fieldLabel}>Category</Text>
              <View style={modalStyles.pillsRow}>
                {DOC_CATEGORIES.map((cat) => {
                  const active = category === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[modalStyles.categoryPill, active && modalStyles.categoryPillActive]}
                      onPress={() => setCategory(cat)}
                      activeOpacity={0.75}
                    >
                      <Text style={[modalStyles.categoryPillText, active && modalStyles.categoryPillTextActive]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Expiry */}
            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.fieldLabel}>Expiry Date (optional)</Text>
              <TextInput
                style={[modalStyles.input, !validExpiry && { borderColor: colors.error }]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                value={expiry}
                onChangeText={setExpiry}
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
              />
              <Text style={modalStyles.hint}>Used to warn you before licenses expire.</Text>
            </View>

            <TouchableOpacity
              style={[modalStyles.saveBtn, isUploading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={isUploading}
              activeOpacity={0.85}
            >
              <Text style={modalStyles.saveBtnText}>
                {isUploading ? 'Uploading…' : 'Upload Document'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── FAB ──────────────────────────────────────────────────────────────────────
function FAB({ onPress, bottomOffset }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scale = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    scale.value = withDelay(300, withSpring(1, { damping: 10, stiffness: 160 }));
  }, []);
  const fabStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.fab, { bottom: 24 + bottomOffset }, fabStyle]}>
      <PressCard onPress={onPress} style={styles.fabInner} scaleDown={0.9}>
        <View style={styles.fabGradient}>
          <Ionicons name="add" size={28} color="#fff" />
        </View>
      </PressCard>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DocumentsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { outletId } = useOutlet();
  const [search, setSearch] = useState('');
  const [uploadVisible, setUploadVisible] = useState(false);

  const { data, isLoading, refetch, isRefetching, isError } = useDocuments();
  const { mutate: uploadDoc, isPending: isUploading } = useUploadDocument();
  const { mutate: deleteDoc } = useDeleteDocument();

  const allDocs = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allDocs;
    return allDocs.filter(
      (d) =>
        d.name?.toLowerCase().includes(q) ||
        d.category?.toLowerCase().includes(q)
    );
  }, [allDocs, search]);

  const sections = useMemo(() => groupByCategory(filtered), [filtered]);
  const rows = useMemo(() => buildRows(sections), [sections]);

  const expiringCount = useMemo(
    () =>
      allDocs.filter((d) => {
        const s = getExpiryStatus(d.expires_at).status;
        return s === 'soon' || s === 'expired';
      }).length,
    [allDocs]
  );

  const openFile = useCallback((doc) => {
    if (!doc.file_url) {
      Alert.alert('Unavailable', 'This document has no file URL.');
      return;
    }
    Linking.openURL(doc.file_url).catch(() =>
      Alert.alert('Cannot open', 'Unable to open this file on your device.')
    );
  }, []);

  const confirmDelete = useCallback(
    (doc) => {
      Alert.alert('Delete document', `Remove "${doc.name}"? This cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteDoc(doc.id, {
              onError: (err) =>
                Alert.alert('Error', err?.message ?? 'Failed to delete document.'),
            }),
        },
      ]);
    },
    [deleteDoc]
  );

  const handleUpload = useCallback(
    (payload) => {
      if (!outletId) {
        Alert.alert('No outlet', 'Select an outlet before uploading documents.');
        return;
      }
      uploadDoc(payload, {
        onSuccess: () => setUploadVisible(false),
        onError: (err) =>
          Alert.alert('Upload failed', err?.message ?? 'Could not upload the document.'),
      });
    },
    [outletId, uploadDoc]
  );

  const renderItem = useCallback(
    ({ item }) => {
      if (item.type === 'header') {
        return <CategoryHeader category={item.category} count={item.count} />;
      }
      return <DocumentRow doc={item.doc} onOpen={openFile} onDelete={confirmDelete} />;
    },
    [openFile, confirmDelete]
  );

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.headerTitle}>Documents</Text>
          <Text style={styles.headerSubtitle}>Licenses & files</Text>
        </View>
        <DocumentsSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Documents</Text>
            <Text style={styles.headerSubtitle}>
              Licenses & files{allDocs.length ? ` · ${allDocs.length}` : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
            <Ionicons name="refresh-outline" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search documents…"
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
      </View>

      {/* Expiry warning banner */}
      {expiringCount > 0 && (
        <View style={styles.warnBanner}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.warnBannerText}>
            {expiringCount} document{expiringCount > 1 ? 's' : ''} expiring soon or expired
          </Text>
        </View>
      )}

      {/* Error state */}
      {isError && allDocs.length === 0 ? (
        <EmptyState
          icon="⚠️"
          title="Couldn't load documents"
          subtitle="Check your connection and try again."
          action={{ label: 'Retry', onPress: refetch }}
        />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          estimatedItemSize={92}
          getItemType={(item) => item.type}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 120 + insets.bottom,
          }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="📄"
              title={search ? 'No matches' : 'No documents yet'}
              subtitle={
                search
                  ? 'Try a different search term.'
                  : 'Upload licenses, contracts and certificates to keep them handy.'
              }
              action={search ? undefined : { label: 'Upload Document', onPress: () => setUploadVisible(true) }}
            />
          }
        />
      )}

      <FAB onPress={() => setUploadVisible(true)} bottomOffset={insets.bottom} />

      <UploadSheet
        visible={uploadVisible}
        onClose={() => setUploadVisible(false)}
        onSubmit={handleUpload}
        isUploading={isUploading}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: 0.3 },
  headerSubtitle: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: 3 },
  refreshBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 2,
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

  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.error + '18',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  warnBannerText: { fontSize: 13, fontWeight: '600', color: colors.error, flex: 1 },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingTop: 18,
    paddingBottom: 8,
    paddingHorizontal: 2,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.textSecondary, letterSpacing: 0.3 },
  sectionCountPill: {
    backgroundColor: colors.pillBg,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 1,
    minWidth: 22,
    alignItems: 'center',
  },
  sectionCountText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },

  // Document row
  rowWrapper: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 80,
  },
  fileIconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: { fontSize: 15, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
  rowMetaLine: { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 6 },
  rowMetaText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  dotSep: { fontSize: 12, color: colors.textMuted },
  badgeRow: { flexDirection: 'row', marginTop: 7 },
  expiryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  expiryText: { fontSize: 11, fontWeight: '700' },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

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
});

const makeModalStyles = (colors) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
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

  filePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    borderRadius: 14,
    backgroundColor: colors.accent + '0d',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  filePickerText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.accent },

  fieldGroup: { gap: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.card,
  },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryPill: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  categoryPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  categoryPillText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  categoryPillTextActive: { color: '#fff' },
  saveBtn: {
    height: 48,
    backgroundColor: colors.accent,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
