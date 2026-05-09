/**
 * Reservations & Bookings — PetPooja ERP
 * Expo SDK 54 · Expo Router 6 · Reanimated v4 · JSX
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Platform,
  Linking,
  Switch,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeInDown,
} from 'react-native-reanimated';
import { PressCard } from '../../src/components/PressCard';
import { EmptyState } from '../../src/components/EmptyState';

// ─── Theme ─────────────────────────────────────────────────────────────────
const C = {
  bg: '#F7F7F7',
  surface: '#FFFFFF',
  border: '#EAEAEA',
  text1: '#000000',
  text2: '#444444',
  text3: '#888888',
  gold: '#F5A623',
  indigo: '#0070F3',
  success: '#00B341',
  error: '#EE0000',
  amber: '#F59E0B',
  blue: '#3B82F6',
  grey: '#9CA3AF',
};

// ─── Mock Data ──────────────────────────────────────────────────────────────
const today = new Date();
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);

function dateKey(d) {
  return d.toISOString().split('T')[0];
}

const INITIAL_RESERVATIONS = [
  {
    id: 'r1',
    guestName: 'Arjun Sharma',
    phone: '9811234567',
    partySize: 4,
    date: dateKey(today),
    time: '7:30 PM',
    status: 'Confirmed',
    table: 'T-5',
    notes: 'Birthday celebration — need a cake',
    type: 'Reservation',
  },
  {
    id: 'r2',
    guestName: 'Priya Mehta',
    phone: '9867456789',
    partySize: 2,
    date: dateKey(today),
    time: '8:00 PM',
    status: 'Pending',
    table: '',
    notes: 'Anniversary dinner, window seat preferred',
    type: 'Reservation',
  },
  {
    id: 'r3',
    guestName: 'Rahul Gupta',
    phone: '9998887776',
    partySize: 6,
    date: dateKey(today),
    time: '1:00 PM',
    status: 'Seated',
    table: 'T-2',
    notes: 'Corporate lunch',
    type: 'Reservation',
  },
  {
    id: 'r4',
    guestName: 'Sneha Patel',
    phone: '9123456780',
    partySize: 3,
    date: dateKey(today),
    time: '2:30 PM',
    status: 'No-Show',
    table: 'T-7',
    notes: '',
    type: 'Reservation',
  },
  {
    id: 'r5',
    guestName: 'Walk-in',
    phone: '',
    partySize: 5,
    date: dateKey(today),
    time: '12:30 PM',
    status: 'Seated',
    table: 'T-3',
    notes: 'Family lunch',
    type: 'Walk-in',
  },
  {
    id: 'r6',
    guestName: 'Vikram Nair',
    phone: '9765432100',
    partySize: 2,
    date: dateKey(tomorrow),
    time: '7:00 PM',
    status: 'Confirmed',
    table: 'T-6',
    notes: 'Allergic to peanuts',
    type: 'Reservation',
  },
  {
    id: 'r7',
    guestName: 'Kavya Reddy',
    phone: '9876543211',
    partySize: 8,
    date: dateKey(tomorrow),
    time: '8:30 PM',
    status: 'Pending',
    table: '',
    notes: 'Office party',
    type: 'Reservation',
  },
];

const TABLES = ['T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6', 'T-7', 'T-8'];

const STATUS_META = {
  Confirmed: { color: C.success, bg: '#E6F9ED', icon: 'checkmark-circle' },
  Pending:   { color: C.amber,   bg: '#FEF3C7', icon: 'time' },
  Cancelled: { color: C.error,   bg: '#FEECEC', icon: 'close-circle' },
  Seated:    { color: C.blue,    bg: '#EFF6FF', icon: 'person' },
  'No-Show': { color: C.grey,    bg: '#F3F4F6', icon: 'ban' },
};

function buildNext7Days() {
  const days = [];
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push({
      key: dateKey(d),
      day: names[d.getDay()],
      date: d.getDate(),
      month: months[d.getMonth()],
      isToday: i === 0,
    });
  }
  return days;
}

const DAYS = buildNext7Days();

const EMPTY_FORM = {
  guestName: '',
  phone: '',
  partySize: 2,
  date: dateKey(today),
  time: '',
  table: '',
  notes: '',
  sendWhatsApp: false,
  type: 'Reservation',
};

// ─── Component ──────────────────────────────────────────────────────────────
export default function ReservationsScreen() {
  const insets = useSafeAreaInsets();
  const [reservations, setReservations] = useState(INITIAL_RESERVATIONS);
  const [selectedDay, setSelectedDay] = useState(dateKey(today));
  const [filterType, setFilterType] = useState('All'); // 'All' | 'Walk-in' | 'Reservation'
  const [modalVisible, setModalVisible] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const filtered = useMemo(() => {
    return reservations.filter(r => {
      if (r.date !== selectedDay) return false;
      if (filterType === 'All') return true;
      return r.type === filterType;
    });
  }, [reservations, selectedDay, filterType]);

  const stats = useMemo(() => {
    const todayAll = reservations.filter(r => r.date === dateKey(today));
    return {
      total: todayAll.length,
      confirmed: todayAll.filter(r => r.status === 'Confirmed').length,
      pending: todayAll.filter(r => r.status === 'Pending').length,
    };
  }, [reservations]);

  const formatDate = useCallback(() => {
    const opts = { weekday: 'long', day: 'numeric', month: 'long' };
    return today.toLocaleDateString('en-IN', opts);
  }, []);

  function updateStatus(id, status) {
    setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  }

  function openWhatsApp(phone, name, time, date) {
    const msg = `Hi ${name}! Your reservation at PetPooja Restaurant is confirmed for ${date} at ${time}. We look forward to seeing you! 🍽️`;
    Linking.openURL(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`).catch(() =>
      Alert.alert('WhatsApp not installed')
    );
  }

  function saveReservation() {
    if (!form.guestName.trim()) {
      Alert.alert('Required', 'Please enter guest name');
      return;
    }
    if (!form.time.trim()) {
      Alert.alert('Required', 'Please enter time');
      return;
    }
    const newR = {
      id: 'r' + Date.now(),
      guestName: form.guestName.trim(),
      phone: form.phone.trim(),
      partySize: form.partySize,
      date: form.date,
      time: form.time.trim(),
      status: 'Pending',
      table: form.table,
      notes: form.notes.trim(),
      type: form.type,
    };
    setReservations(prev => [newR, ...prev]);
    if (form.sendWhatsApp && form.phone) {
      openWhatsApp(form.phone, form.guestName, form.time, form.date);
    }
    setForm(EMPTY_FORM);
    setModalVisible(false);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Reservations</Text>
          <Text style={styles.headerSub}>{formatDate()}</Text>
        </View>
        <TouchableOpacity style={styles.headerIcon}>
          <Ionicons name="notifications-outline" size={22} color={C.text2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Stats Row ── */}
        {Platform.OS !== 'web' ? (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.statsRow}>
            <StatCard label="Today's Bookings" value={stats.total} icon="calendar" iconColor={C.indigo} />
            <StatCard label="Confirmed" value={stats.confirmed} icon="checkmark-circle" iconColor={C.success} />
            <StatCard label="Pending" value={stats.pending} icon="time" iconColor={C.amber} />
          </Animated.View>
        ) : (
          <View style={styles.statsRow}>
            <StatCard label="Today's Bookings" value={stats.total} icon="calendar" iconColor={C.indigo} />
            <StatCard label="Confirmed" value={stats.confirmed} icon="checkmark-circle" iconColor={C.success} />
            <StatCard label="Pending" value={stats.pending} icon="time" iconColor={C.amber} />
          </View>
        )}

        {/* ── Date Selector ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateScroll}
        >
          {DAYS.map(d => {
            const active = d.key === selectedDay;
            return (
              <TouchableOpacity
                key={d.key}
                onPress={() => setSelectedDay(d.key)}
                style={[styles.datePill, active && styles.datePillActive]}
              >
                <Text style={[styles.datePillDay, active && styles.datePillTextActive]}>
                  {d.isToday ? 'Today' : d.day}
                </Text>
                <Text style={[styles.datePillNum, active && styles.datePillTextActive]}>
                  {d.date} {d.month}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Filter Toggle ── */}
        <View style={styles.filterRow}>
          {['All', 'Reservation', 'Walk-in'].map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilterType(f)}
              style={[styles.filterPill, filterType === f && styles.filterPillActive]}
            >
              <Text style={[styles.filterPillText, filterType === f && styles.filterPillTextActive]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Reservation List ── */}
        {filtered.length === 0 ? (
          <EmptyState
            icon="📅"
            title="No bookings"
            subtitle="No reservations found for this day."
            action={{ label: '+ Add Reservation', onPress: () => setModalVisible(true) }}
          />
        ) : (
          filtered.map((r, i) => (
            <ReservationCard
              key={r.id}
              reservation={r}
              index={i}
              expanded={expandedId === r.id}
              onExpand={() => setExpandedId(expandedId === r.id ? null : r.id)}
              onConfirm={() => updateStatus(r.id, 'Confirmed')}
              onCancel={() => updateStatus(r.id, 'Cancelled')}
              onSeat={() => updateStatus(r.id, 'Seated')}
              onNoShow={() => updateStatus(r.id, 'No-Show')}
              onWhatsApp={() => openWhatsApp(r.phone, r.guestName, r.time, r.date)}
            />
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── FAB ── */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 90 }]}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* ── Add Reservation Modal ── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>New Reservation</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={C.text2} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Type Toggle */}
              <View style={styles.formTypeRow}>
                {['Reservation', 'Walk-in'].map(t => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setForm(f => ({ ...f, type: t }))}
                    style={[styles.typeBtn, form.type === t && styles.typeBtnActive]}
                  >
                    <Text style={[styles.typeBtnText, form.type === t && styles.typeBtnTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <FormField label="Guest Name *" placeholder="e.g. Arjun Sharma" value={form.guestName}
                onChangeText={v => setForm(f => ({ ...f, guestName: v }))} />
              <FormField label="Phone Number" placeholder="10-digit mobile" value={form.phone}
                onChangeText={v => setForm(f => ({ ...f, phone: v }))} keyboardType="phone-pad" />

              {/* Party Size stepper */}
              <Text style={styles.fieldLabel}>Party Size</Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setForm(f => ({ ...f, partySize: Math.max(1, f.partySize - 1) }))}
                >
                  <Ionicons name="remove" size={20} color={C.text1} />
                </TouchableOpacity>
                <Text style={styles.stepperVal}>{form.partySize}</Text>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setForm(f => ({ ...f, partySize: f.partySize + 1 }))}
                >
                  <Ionicons name="add" size={20} color={C.text1} />
                </TouchableOpacity>
              </View>

              <FormField label="Date" placeholder="YYYY-MM-DD" value={form.date}
                onChangeText={v => setForm(f => ({ ...f, date: v }))} />
              <FormField label="Time *" placeholder="e.g. 7:30 PM" value={form.time}
                onChangeText={v => setForm(f => ({ ...f, time: v }))} />

              {/* Table picker */}
              <Text style={styles.fieldLabel}>Assign Table</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={() => setForm(f => ({ ...f, table: '' }))}
                  style={[styles.tablePill, !form.table && styles.tablePillActive]}
                >
                  <Text style={[styles.tablePillText, !form.table && styles.tablePillTextActive]}>None</Text>
                </TouchableOpacity>
                {TABLES.map(t => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setForm(f => ({ ...f, table: t }))}
                    style={[styles.tablePill, form.table === t && styles.tablePillActive]}
                  >
                    <Text style={[styles.tablePillText, form.table === t && styles.tablePillTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <FormField label="Notes" placeholder="Special requests, allergies…" value={form.notes}
                onChangeText={v => setForm(f => ({ ...f, notes: v }))} multiline />

              {/* WhatsApp toggle */}
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Send WhatsApp Confirmation</Text>
                  <Text style={styles.toggleSub}>Message sent to guest's number</Text>
                </View>
                <Switch
                  value={form.sendWhatsApp}
                  onValueChange={v => setForm(f => ({ ...f, sendWhatsApp: v }))}
                  trackColor={{ true: C.success, false: C.border }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={saveReservation}>
                <Text style={styles.saveBtnText}>Save Reservation</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function StatCard({ label, value, icon, iconColor }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: iconColor + '18' }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ReservationCard({
  reservation: r,
  index,
  expanded,
  onExpand,
  onConfirm,
  onCancel,
  onSeat,
  onNoShow,
  onWhatsApp,
}) {
  const meta = STATUS_META[r.status] || STATUS_META.Pending;

  const content = (
    <View style={styles.resCard}>
      {/* Top row */}
      <View style={styles.resCardTop}>
        <View style={styles.resTimeWrap}>
          <Text style={styles.resTime}>{r.time}</Text>
          {r.type === 'Walk-in' && (
            <View style={styles.walkinBadge}>
              <Text style={styles.walkinBadgeText}>Walk-in</Text>
            </View>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={12} color={meta.color} />
          <Text style={[styles.statusText, { color: meta.color }]}>{r.status}</Text>
        </View>
      </View>

      {/* Guest info */}
      <View style={styles.resGuestRow}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{r.guestName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.resGuestName}>{r.guestName}</Text>
          {r.phone ? (
            <Text style={styles.resGuestPhone}>{r.phone}</Text>
          ) : null}
        </View>
        <View style={styles.partySizeWrap}>
          <Text style={styles.partySizeText}>👥 {r.partySize}</Text>
        </View>
      </View>

      {/* Table + Notes */}
      <View style={styles.resMeta}>
        {r.table ? (
          <View style={styles.resMetaChip}>
            <Ionicons name="restaurant-outline" size={12} color={C.text3} />
            <Text style={styles.resMetaChipText}>{r.table}</Text>
          </View>
        ) : null}
        {r.notes ? (
          <View style={[styles.resMetaChip, { flex: 1 }]}>
            <Ionicons name="document-text-outline" size={12} color={C.text3} />
            <Text style={styles.resMetaChipText} numberOfLines={1}>{r.notes}</Text>
          </View>
        ) : null}
      </View>

      {/* Expanded actions */}
      {expanded && (
        <View style={styles.actionRow}>
          {r.status === 'Pending' && (
            <ActionBtn label="Confirm" icon="checkmark-circle-outline" color={C.success} onPress={onConfirm} />
          )}
          {(r.status === 'Confirmed' || r.status === 'Pending') && (
            <ActionBtn label="Seat Now" icon="person-outline" color={C.indigo} onPress={onSeat} />
          )}
          {(r.status === 'Confirmed' || r.status === 'Pending') && (
            <ActionBtn label="No-Show" icon="ban-outline" color={C.grey} onPress={onNoShow} />
          )}
          {r.status !== 'Cancelled' && r.status !== 'No-Show' && (
            <ActionBtn label="Cancel" icon="close-circle-outline" color={C.error} onPress={onCancel} />
          )}
          {r.phone ? (
            <ActionBtn label="WhatsApp" icon="logo-whatsapp" color="#25D366" onPress={onWhatsApp} />
          ) : null}
        </View>
      )}

      {/* Expand toggle */}
      <TouchableOpacity style={styles.expandBtn} onPress={onExpand}>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={C.text3}
        />
      </TouchableOpacity>
    </View>
  );

  if (Platform.OS !== 'web') {
    return (
      <Animated.View entering={FadeInDown.delay(index * 60).duration(350)}>
        <PressCard style={styles.resCardWrap} onPress={onExpand}>
          {content}
        </PressCard>
      </Animated.View>
    );
  }

  return (
    <PressCard style={styles.resCardWrap} onPress={onExpand}>
      {content}
    </PressCard>
  );
}

function ActionBtn({ label, icon, color, onPress }) {
  return (
    <TouchableOpacity style={[styles.actionBtnWrap, { borderColor: color + '40' }]} onPress={onPress}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.actionBtnText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function FormField({ label, placeholder, value, onChangeText, keyboardType, multiline }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMulti]}
        placeholder={placeholder}
        placeholderTextColor={C.text3}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 20 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: C.text1, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: C.text3, marginTop: 2 },
  headerIcon: { padding: 6 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 4 },
  statCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statVal: { fontSize: 22, fontWeight: '700', color: C.text1, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: C.text3, textAlign: 'center', marginTop: 2 },

  // Date selector
  dateScroll: { paddingVertical: 14, paddingRight: 20, gap: 8 },
  datePill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    minWidth: 68,
  },
  datePillActive: { backgroundColor: C.text1, borderColor: C.text1 },
  datePillDay: { fontSize: 11, color: C.text3, fontWeight: '500' },
  datePillNum: { fontSize: 13, color: C.text2, fontWeight: '700', marginTop: 2 },
  datePillTextActive: { color: '#FFFFFF' },

  // Filter
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  filterPillActive: { backgroundColor: C.text1, borderColor: C.text1 },
  filterPillText: { fontSize: 13, fontWeight: '600', color: C.text2 },
  filterPillTextActive: { color: '#FFFFFF' },

  // Reservation Card
  resCardWrap: { marginBottom: 12 },
  resCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  resCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  resTimeWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resTime: { fontSize: 16, fontWeight: '700', color: C.text1 },
  walkinBadge: {
    backgroundColor: C.gold + '22',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  walkinBadgeText: { fontSize: 10, color: C.gold, fontWeight: '700' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
  resGuestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.indigo + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: C.indigo },
  resGuestName: { fontSize: 15, fontWeight: '700', color: C.text1 },
  resGuestPhone: { fontSize: 12, color: C.text3, marginTop: 1 },
  partySizeWrap: {
    backgroundColor: C.bg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  partySizeText: { fontSize: 13, fontWeight: '600', color: C.text2 },
  resMeta: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  resMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.bg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  resMetaChipText: { fontSize: 12, color: C.text3 },

  // Action buttons inside card
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  actionBtnWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: C.bg,
  },
  actionBtnText: { fontSize: 12, fontWeight: '600' },
  expandBtn: { alignItems: 'center', marginTop: 8 },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.text1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },

  // Modal Sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
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
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: C.text1 },

  // Form
  formTypeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 4,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  typeBtnActive: { backgroundColor: C.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  typeBtnText: { fontSize: 14, fontWeight: '600', color: C.text3 },
  typeBtnTextActive: { color: C.text1 },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: C.text2, marginBottom: 6 },
  fieldInput: {
    backgroundColor: C.bg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: C.text1,
    borderWidth: 1,
    borderColor: C.border,
  },
  fieldInputMulti: { height: 80, textAlignVertical: 'top', paddingTop: 11 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14 },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperVal: { fontSize: 20, fontWeight: '700', color: C.text1, minWidth: 28, textAlign: 'center' },
  tablePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    marginRight: 8,
  },
  tablePillActive: { backgroundColor: C.text1, borderColor: C.text1 },
  tablePillText: { fontSize: 13, fontWeight: '600', color: C.text2 },
  tablePillTextActive: { color: '#FFFFFF' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginBottom: 14,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: C.text1 },
  toggleSub: { fontSize: 12, color: C.text3, marginTop: 2 },
  saveBtn: {
    backgroundColor: C.text1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
