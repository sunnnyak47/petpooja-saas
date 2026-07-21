import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PressCard } from '../../src/components/PressCard';
import { EmptyState } from '../../src/components/EmptyState';
import api from '../../src/lib/api';
import { useCurrency } from '../../src/hooks/useCurrency';

// ─── Constants ────────────────────────────────────────────────────────────────
const C = {
  bg: '#f8fafc',
  surface: '#ffffff',
  border: '#e2e8f0',
  text1: '#0f172a',
  text2: '#475569',
  text3: '#94a3b8',
  gold: '#d97706',
  indigo: '#2563eb',
  success: '#16a34a',
  error: '#dc2626',
};

const ROLE_COLORS = {
  Manager:  { bg: '#eff6ff', text: '#2563eb' },
  Chef:     { bg: '#fffbeb', text: '#b45309' },
  Waiter:   { bg: '#f0f9ff', text: '#0369a1' },
  Cashier:  { bg: '#f0fdf4', text: '#15803d' },
};

const SHIFT_FILTERS = ['All', 'On Shift', 'Off Shift', 'Managers'];

const ROLES = ['Manager', 'Chef', 'Waiter', 'Cashier'];

// ─── Staff normalizer ─────────────────────────────────────────────────────────
// Maps a raw record from GET /staff into the shape this screen renders.
// Attendance fields the API doesn't provide default to honest zeros/nulls —
// never fabricated placeholder values.
const SHIFT_STATUSES = ['on_shift', 'off_shift', 'on_leave'];

function normalizeStaff(s) {
  const rawStatus = String(s.status ?? '').toLowerCase();
  const status = SHIFT_STATUSES.includes(rawStatus) ? rawStatus : 'off_shift';
  return {
    id: String(s.id ?? s._id ?? `staff-${Math.random().toString(36).slice(2)}`),
    name: s.name ?? s.full_name ?? 'Unnamed',
    phone: s.phone ?? s.phone_number ?? '',
    role: s.role ?? 'Waiter',
    status,
    clock_in: s.clock_in ?? null,
    hours_today: s.hours_today ?? 0,
    shift_start: s.shift_start ?? '',
    shift_end: s.shift_end ?? '',
    salary: s.salary ?? 0,
    orders_today: s.orders_today ?? 0,
    dishes_today: s.dishes_today ?? 0,
  };
}

const EMPTY_FORM = {
  name: '',
  phone: '',
  role: 'Waiter',
  shift_start: '09:00',
  shift_end: '18:00',
  salary: '',
};

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useStaff() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const res = await api.get('/staff');
        const raw = res?.data?.items ?? res?.data ?? res?.items ?? res;
        const list = Array.isArray(raw) ? raw : [];
        if (!cancelled) setStaff(list.map(normalizeStaff));
      } catch (err) {
        if (!cancelled) {
          setError(err);
          setStaff([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clockToggle = useCallback((id) => {
    setStaff((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (s.status === 'on_shift') {
          return { ...s, status: 'off_shift', clock_in: null };
        }
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        return { ...s, status: 'on_shift', clock_in: `${hh}:${mm}` };
      })
    );
  }, []);

  const addStaff = useCallback((form) => {
    setStaff((prev) => [
      ...prev,
      {
        id: `s${Date.now()}`,
        name: form.name.trim(),
        phone: form.phone.trim(),
        role: form.role,
        status: 'off_shift',
        clock_in: null,
        hours_today: 0,
        shift_start: form.shift_start,
        shift_end: form.shift_end,
        salary: parseInt(form.salary, 10) || 0,
        orders_today: 0,
        dishes_today: 0,
      },
    ]);
  }, []);

  const updateStaff = useCallback((id, form) => {
    setStaff((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              name: form.name.trim(),
              phone: form.phone.trim(),
              role: form.role,
              shift_start: form.shift_start,
              shift_end: form.shift_end,
              salary: parseInt(form.salary, 10) || 0,
            }
          : s
      )
    );
  }, []);

  return { staff, loading, error, clockToggle, addStaff, updateStaff };
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, role, size = 44 }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const rc = ROLE_COLORS[role] || { bg: '#f1f5f9', text: C.text3 };
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: rc.bg }]}>
      <Text style={[styles.avatarText, { color: rc.text, fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    on_shift:  { label: 'On Shift',  bg: '#f0fdf4', color: C.success },
    off_shift: { label: 'Off Shift', bg: '#f1f5f9', color: C.text3   },
    on_leave:  { label: 'On Leave',  bg: '#fffbeb', color: C.gold    },
  };
  const s = map[status] || map.off_shift;
  return (
    <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
      <Text style={[styles.statusBadgeText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

// ─── Staff Card ───────────────────────────────────────────────────────────────
function StaffCard({ member, onClockToggle, onLongPress }) {
  const canToggle = member.status !== 'on_leave';
  const rc = ROLE_COLORS[member.role] || { bg: '#f1f5f9', text: C.text3 };

  return (
    <PressCard
      style={styles.staffCard}
      onPress={() => {}}
      onLongPress={() => onLongPress(member)}
      scaleDown={0.98}
    >
      <View style={styles.staffCardInner}>
        <Avatar name={member.name} role={member.role} />
        <View style={styles.staffInfo}>
          <View style={styles.staffNameRow}>
            <Text style={styles.staffName}>{member.name}</Text>
            <StatusBadge status={member.status} />
          </View>
          <View style={styles.staffMetaRow}>
            <View style={[styles.rolePill, { backgroundColor: rc.bg }]}>
              <Text style={[styles.rolePillText, { color: rc.text }]}>{member.role}</Text>
            </View>
            {member.status === 'on_shift' && member.clock_in && (
              <Text style={styles.clockInText}>
                <Ionicons name="log-in-outline" size={11} color={C.text3} /> In {member.clock_in}
              </Text>
            )}
            {member.hours_today > 0 && (
              <Text style={styles.hoursText}>{member.hours_today}h today</Text>
            )}
          </View>
          {/* Performance mini-stats */}
          {member.role === 'Waiter' && member.orders_today > 0 && (
            <Text style={styles.perfText}>
              <Ionicons name="receipt-outline" size={11} color={C.indigo} /> {member.orders_today} orders handled
            </Text>
          )}
          {member.role === 'Chef' && member.dishes_today > 0 && (
            <Text style={styles.perfText}>
              <Ionicons name="flame-outline" size={11} color={C.gold} /> {member.dishes_today} dishes prepared
            </Text>
          )}
        </View>
        {canToggle && (
          <TouchableOpacity
            style={[
              styles.clockBtn,
              { backgroundColor: member.status === 'on_shift' ? '#fef2f2' : '#f0fdf4' },
            ]}
            onPress={() => onClockToggle(member.id)}
            activeOpacity={0.75}
          >
            <Ionicons
              name={member.status === 'on_shift' ? 'log-out-outline' : 'log-in-outline'}
              size={16}
              color={member.status === 'on_shift' ? C.error : C.success}
            />
            <Text
              style={[
                styles.clockBtnText,
                { color: member.status === 'on_shift' ? C.error : C.success },
              ]}
            >
              {member.status === 'on_shift' ? 'Out' : 'In'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </PressCard>
  );
}

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────
function StaffModal({ visible, editingMember, onClose, onSave }) {
  const { symbol } = useCurrency();
  const [form, setForm] = useState(EMPTY_FORM);

  React.useEffect(() => {
    if (editingMember) {
      setForm({
        name: editingMember.name,
        phone: editingMember.phone,
        role: editingMember.role,
        shift_start: editingMember.shift_start,
        shift_end: editingMember.shift_end,
        salary: String(editingMember.salary),
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [editingMember, visible]);

  const slideY = useSharedValue(300);
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 220 });
      slideY.value = withSpring(0, { damping: 22, stiffness: 260 });
    } else {
      opacity.value = withTiming(0, { duration: 180 });
      slideY.value = withTiming(300, { duration: 200 });
    }
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slideY.value }] }));

  function handleSave() {
    if (!form.name.trim()) return;
    onSave(form);
    onClose();
  }

  const setField = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View style={[styles.modalBackdrop, backdropStyle]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[styles.sheet, sheetStyle]}>
          {/* Handle */}
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{editingMember ? 'Edit Staff' : 'Add Staff'}</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.textInput}
              value={form.name}
              onChangeText={setField('name')}
              placeholder="Full name"
              placeholderTextColor={C.text3}
            />

            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput
              style={styles.textInput}
              value={form.phone}
              onChangeText={setField('phone')}
              placeholder="10-digit number"
              placeholderTextColor={C.text3}
              keyboardType="number-pad"
              maxLength={10}
            />

            <Text style={styles.fieldLabel}>Role</Text>
            <View style={styles.roleSelector}>
              {ROLES.map((r) => {
                const active = form.role === r;
                const rc = ROLE_COLORS[r];
                return (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.roleSelectorPill,
                      { backgroundColor: active ? rc.bg : C.bg, borderColor: active ? rc.text : C.border },
                    ]}
                    onPress={() => setField('role')(r)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.roleSelectorText, { color: active ? rc.text : C.text3 }]}>{r}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Shift Start</Text>
                <TextInput
                  style={styles.textInput}
                  value={form.shift_start}
                  onChangeText={setField('shift_start')}
                  placeholder="09:00"
                  placeholderTextColor={C.text3}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Shift End</Text>
                <TextInput
                  style={styles.textInput}
                  value={form.shift_end}
                  onChangeText={setField('shift_end')}
                  placeholder="18:00"
                  placeholderTextColor={C.text3}
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Monthly Salary ({symbol})</Text>
            <TextInput
              style={styles.textInput}
              value={form.salary}
              onChangeText={setField('salary')}
              placeholder="e.g. 20000"
              placeholderTextColor={C.text3}
              keyboardType="number-pad"
            />

            <TouchableOpacity style={styles.saveButton} onPress={handleSave} activeOpacity={0.85}>
              <Text style={styles.saveButtonText}>{editingMember ? 'Save Changes' : 'Add Staff Member'}</Text>
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Attendance Timeline ──────────────────────────────────────────────────────
function AttendanceTimeline({ staff }) {
  const onShiftToday = staff.filter((s) => s.clock_in);
  if (onShiftToday.length === 0) return null;

  return (
    <View style={styles.timelineSection}>
      <Text style={styles.sectionTitle}>Today's Clock-ins</Text>
      <View style={styles.timelineCard}>
        {onShiftToday.map((s, idx) => {
          const rc = ROLE_COLORS[s.role] || { bg: '#f1f5f9', text: C.text3 };
          return (
            <View key={s.id} style={[styles.timelineRow, idx < onShiftToday.length - 1 && styles.timelineRowBorder]}>
              <View style={[styles.timelineDot, { backgroundColor: rc.bg }]}>
                <Text style={[styles.timelineDotText, { color: rc.text }]}>
                  {s.name.split(' ')[0][0]}{s.name.split(' ')[1]?.[0] ?? ''}
                </Text>
              </View>
              <View style={styles.timelineInfo}>
                <Text style={styles.timelineName}>{s.name}</Text>
                <Text style={styles.timelineRole}>{s.role}</Text>
              </View>
              <Text style={styles.timelineTime}>{s.clock_in}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function StaffScreen() {
  const insets = useSafeAreaInsets();
  const { staff, loading, error, clockToggle, addStaff, updateStaff } = useStaff();
  const [activeFilter, setActiveFilter] = useState('All');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMember, setEditingMember] = useState(null);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

  const totalStaff = staff.length;
  const onShiftCount = staff.filter((s) => s.status === 'on_shift').length;
  const attendancePct = totalStaff > 0 ? Math.round((onShiftCount / totalStaff) * 100) : 0;

  const filtered = staff.filter((s) => {
    if (activeFilter === 'On Shift')  return s.status === 'on_shift';
    if (activeFilter === 'Off Shift') return s.status === 'off_shift' || s.status === 'on_leave';
    if (activeFilter === 'Managers')  return s.role === 'Manager';
    return true;
  });

  function handleLongPress(member) {
    setEditingMember(member);
    setModalVisible(true);
  }

  function handleSave(form) {
    if (editingMember) {
      updateStaff(editingMember.id, form);
    } else {
      addStaff(form);
    }
  }

  function openAdd() {
    setEditingMember(null);
    setModalVisible(true);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Staff</Text>
            <Text style={styles.headerSub}>{today}</Text>
          </View>
        </View>

        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { flex: 1 }]}>
            <Text style={styles.summaryNum}>{totalStaff}</Text>
            <Text style={styles.summaryLabel}>Total Staff</Text>
          </View>
          <View style={[styles.summaryCard, { flex: 1 }]}>
            <Text style={[styles.summaryNum, { color: C.success }]}>{onShiftCount}</Text>
            <Text style={styles.summaryLabel}>On Shift</Text>
          </View>
          <View style={[styles.summaryCard, { flex: 1 }]}>
            <Text style={[styles.summaryNum, { color: C.indigo }]}>{attendancePct}%</Text>
            <Text style={styles.summaryLabel}>Attendance</Text>
          </View>
        </View>

        {/* Filter pills */}
        <ScrollView
          horizontal
        style={{ flexGrow: 0, flexShrink: 0 }}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {SHIFT_FILTERS.map((f) => {
            const active = activeFilter === f;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.filterPill, active && styles.filterPillActive]}
                onPress={() => setActiveFilter(f)}
                activeOpacity={0.75}
              >
                <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{f}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Staff list */}
        {error ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load staff"
            subtitle={error.message || 'Please check your connection and try again.'}
          />
        ) : loading ? (
          <EmptyState icon="hourglass-outline" title="Loading staff…" subtitle="Fetching your team" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title={staff.length === 0 ? 'No staff yet' : 'No staff found'}
            subtitle={
              staff.length === 0
                ? 'Add your first team member with the + button'
                : 'Try a different filter'
            }
          />
        ) : (
          filtered.map((member) => (
            <StaffCard
              key={member.id}
              member={member}
              onClockToggle={clockToggle}
              onLongPress={handleLongPress}
            />
          ))
        )}

        {/* Attendance timeline */}
        <AttendanceTimeline staff={staff} />

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 24 }]} onPress={openAdd} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>

      {/* Modal */}
      <StaffModal
        visible={modalVisible}
        editingMember={editingMember}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text1,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    color: C.text3,
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryNum: {
    fontSize: 22,
    fontWeight: '800',
    color: C.text1,
  },
  summaryLabel: {
    fontSize: 11,
    color: C.text3,
    marginTop: 2,
    fontWeight: '500',
  },
  filterRow: {
    gap: 8,
    marginBottom: 16,
    paddingBottom: 2,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  filterPillActive: {
    backgroundColor: C.indigo,
    borderColor: C.indigo,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text2,
  },
  filterPillTextActive: {
    color: '#FFF',
  },
  staffCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  staffCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '700',
  },
  staffInfo: {
    flex: 1,
    gap: 4,
  },
  staffNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  staffName: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text1,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  staffMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rolePill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rolePillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  clockInText: {
    fontSize: 11,
    color: C.text3,
  },
  hoursText: {
    fontSize: 11,
    color: C.text3,
  },
  perfText: {
    fontSize: 11,
    color: C.text3,
    marginTop: 1,
  },
  clockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  clockBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text1,
    marginBottom: 10,
  },
  timelineSection: {
    marginTop: 24,
  },
  timelineCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  timelineRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  timelineDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotText: {
    fontSize: 12,
    fontWeight: '700',
  },
  timelineInfo: {
    flex: 1,
  },
  timelineName: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text1,
  },
  timelineRole: {
    fontSize: 12,
    color: C.text3,
    marginTop: 1,
  },
  timelineTime: {
    fontSize: 14,
    fontWeight: '700',
    color: C.indigo,
    fontVariant: ['tabular-nums'],
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.indigo,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.indigo,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '90%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text1,
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text2,
    marginBottom: 6,
    marginTop: 12,
  },
  textInput: {
    backgroundColor: C.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: C.text1,
  },
  roleSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleSelectorPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  roleSelectorText: {
    fontSize: 13,
    fontWeight: '600',
  },
  timeRow: {
    flexDirection: 'row',
    marginTop: 0,
  },
  saveButton: {
    backgroundColor: C.indigo,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
});
