/**
 * Customer CRM — PetPooja ERP
 * Phase 2: Connected to real /customers API
 * Expo SDK 54 · Expo Router 6 · Reanimated v4 · JSX
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Linking,
  Platform,
  KeyboardAvoidingView,
  Switch,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
} from 'react-native-reanimated';
import { PressCard } from '../../src/components/PressCard';
import { EmptyState } from '../../src/components/EmptyState';
import { T, R, FS, FW } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import {
  useCustomers,
  useCreateCustomer,
  useUpdateCustomer,
} from '../../src/hooks/useApi';

// ─── Constants ──────────────────────────────────────────────────────────────
const GOLD = '#f59e0b'; // amber-500 — VIP / loyalty gold

const EMPTY_FORM = {
  name: '',
  phone: '',
  email: '',
  birthday: '',
  anniversary: '',
  notes: '',
  isVIP: false,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const today = new Date();

function dateKey(d) {
  return d.toISOString().split('T')[0];
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isBirthdayToday(dob) {
  if (!dob) return false;
  const d = new Date(dob);
  return d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
}

function isAnniversaryToday(ann) {
  if (!ann) return false;
  const d = new Date(ann);
  return d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
}

function lastVisitDaysAgo(lastVisit) {
  if (!lastVisit) return 9999;
  return Math.round((today - new Date(lastVisit)) / (1000 * 60 * 60 * 24));
}

function isActiveThisMonth(lastVisit) {
  if (!lastVisit) return false;
  const d = new Date(lastVisit);
  return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
}

function isNewThisMonth(firstVisit) {
  if (!firstVisit) return false;
  const d = new Date(firstVisit);
  return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
}

/**
 * Normalise API field names → consistent UI shape.
 * Backend (GET /customers) returns: full_name, total_visits, total_spend (Decimal→string),
 * last_visit_at, date_of_birth, anniversary, segment ('new'|'regular'|'vip'|'lapsed'),
 * notes, created_at, and loyalty_points as a RELATION OBJECT { current_balance, ... }.
 */
function normalizeCustomer(c) {
  return {
    ...c,
    name:        c.full_name       ?? c.name        ?? '',
    visits:      c.total_visits    ?? c.visits      ?? 0,
    // total_spend is a Prisma Decimal → serialised as a string; coerce to Number.
    totalSpent:  Number(c.total_spend ?? c.total_spent ?? c.totalSpent ?? 0) || 0,
    lastVisit:   c.last_visit_at   ?? c.last_visit  ?? c.lastVisit ?? null,
    birthday:    c.date_of_birth   ?? c.dob         ?? c.birthday  ?? '',
    anniversary: c.anniversary     ?? '',
    // VIP is derived from the marketing segment, not a boolean column.
    isVIP:       c.segment === 'vip' || c.is_vip === true || c.isVIP === true,
    // loyalty_points is a relation object — never render it directly; read the scalar balance.
    loyaltyBalance: c.loyalty_points?.current_balance ?? 0,
    notes:       c.notes           ?? '',
    firstVisit:  c.created_at      ?? c.firstVisit   ?? null,
    orders:      Array.isArray(c.orders) ? c.orders : [],
    favouriteDish: c.favourite_dish ?? c.favouriteDish ?? '—',
  };
}

function avatarColor(visits) {
  if (visits >= 20) return '#1e3a5f';
  if (visits >= 10) return T.accentDark;
  if (visits >= 5)  return T.accent;
  if (visits >= 2)  return '#818cf8'; // indigo-400
  return '#c7d2fe';                   // indigo-200
}

function avatarTextColor(visits) {
  return visits >= 5 ? '#ffffff' : T.accentDark;
}

function initials(name) {
  const parts = (name || '').trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name || 'U').slice(0, 2).toUpperCase();
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function CustomersScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const outletId = user?.outlet_id;

  const [search, setSearch]               = useState('');
  const [debouncedSearch, setDebounced]   = useState('');
  const [filter, setFilter]               = useState('All');
  const [expandedId, setExpandedId]       = useState(null);
  const [modalVisible, setModalVisible]   = useState(false);
  const [editTarget, setEditTarget]       = useState(null);   // customer id being edited
  const [form, setForm]                   = useState(EMPTY_FORM);
  const [alertDismissed, setAlertDismissed] = useState(false);

  // Debounce search input → API call
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // ── API ──────────────────────────────────────────────────────────────────
  const {
    data: rawCustomers = [],
    isLoading,
    isRefetching,
    refetch,
  } = useCustomers({
    outlet_id: outletId,
    search:    debouncedSearch || undefined,
    limit:     100,
  });

  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer();
  const isSaving       = createMutation.isPending || updateMutation.isPending;

  // Normalise raw API response
  const customers = useMemo(
    () => (Array.isArray(rawCustomers) ? rawCustomers : []).map(normalizeCustomer),
    [rawCustomers],
  );

  // Birthday / anniversary alerts for today
  const celebratingToday = useMemo(() =>
    customers.flatMap(c => {
      const arr = [];
      if (isBirthdayToday(c.birthday))
        arr.push({ id: c.id + '_bday', msg: `🎂 ${c.name}'s Birthday today!`, phone: c.phone, name: c.name });
      if (isAnniversaryToday(c.anniversary))
        arr.push({ id: c.id + '_ann',  msg: `💍 ${c.name}'s Anniversary today!`, phone: c.phone, name: c.name });
      return arr;
    }),
  [customers]);

  const stats = useMemo(() => ({
    total:  customers.length,
    vip:    customers.filter(c => c.isVIP).length,
    active: customers.filter(c => isActiveThisMonth(c.lastVisit)).length,
  }), [customers]);

  // Local filter — VIP / Regular / New applied on top of API search results
  const filtered = useMemo(() => {
    let list = customers;
    if (filter === 'VIP')     list = list.filter(c => c.isVIP);
    else if (filter === 'Regular') list = list.filter(c => !c.isVIP && c.visits >= 3);
    else if (filter === 'New')     list = list.filter(c => isNewThisMonth(c.firstVisit));
    return list;
  }, [customers, filter]);

  // ── Actions ───────────────────────────────────────────────────────────────
  function openWhatsApp(phone, name) {
    const msg = `Hi ${name}! Thanks for being a valued guest at our restaurant. We miss you! Come visit us soon. 🍽️`;
    Linking.openURL(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`).catch(() =>
      Alert.alert('WhatsApp not installed')
    );
  }

  function openCall(phone) {
    Linking.openURL(`tel:+91${phone}`).catch(() => Alert.alert('Cannot make call'));
  }

  function openEditModal(customer) {
    setEditTarget(customer.id);
    setForm({
      name:        customer.name        ?? '',
      phone:       customer.phone       ?? '',
      email:       customer.email       ?? '',
      birthday:    customer.birthday    ?? '',
      anniversary: customer.anniversary ?? '',
      notes:       customer.notes       ?? '',
      isVIP:       customer.isVIP       ?? false,
    });
    setModalVisible(true);
  }

  function openAddModal() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }

  async function saveCustomer() {
    if (!form.name.trim())  { Alert.alert('Required', 'Please enter customer name');  return; }
    if (!form.phone.trim()) { Alert.alert('Required', 'Please enter phone number');   return; }

    // Field names must match the backend Joi schema (customer.validation.js);
    // unknown keys are stripped (stripUnknown), so `name`/`dob`/`is_vip` were silently dropped.
    const payload = {
      full_name:     form.name.trim(),
      phone:         form.phone.trim(),
      email:         form.email.trim()       || undefined,
      date_of_birth: form.birthday.trim()    || undefined,
      anniversary:   form.anniversary.trim() || undefined,
      notes:         form.notes.trim()       || undefined,
      // VIP maps to the marketing segment enum; only set it when enabling VIP.
      ...(form.isVIP ? { segment: 'vip' } : {}),
    };

    try {
      if (editTarget) {
        await updateMutation.mutateAsync({ id: editTarget, data: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      setModalVisible(false);
      setForm(EMPTY_FORM);
      setEditTarget(null);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save customer');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Customers</Text>
        <TouchableOpacity style={styles.addIconBtn} onPress={openAddModal}>
          <Ionicons name="person-add-outline" size={22} color={T.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ── Search Bar ── */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={T.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, phone or email…"
          placeholderTextColor={T.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {isRefetching && (
          <ActivityIndicator size="small" color={T.accent} style={{ marginRight: 4 }} />
        )}
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={T.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={T.accent}
            colors={[T.accent]}
          />
        }
      >
        {/* ── Birthday / Anniversary Alert ── */}
        {!alertDismissed && celebratingToday.length > 0 && (
          <View style={styles.alertBanner}>
            <View style={{ flex: 1 }}>
              {celebratingToday.map(a => (
                <View key={a.id} style={styles.alertRow}>
                  <Text style={styles.alertText}>{a.msg}</Text>
                  <TouchableOpacity onPress={() => openWhatsApp(a.phone, a.name)}>
                    <Text style={styles.alertAction}>Send Wish</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <TouchableOpacity onPress={() => setAlertDismissed(true)} style={styles.alertClose}>
              <Ionicons name="close" size={18} color={T.warning} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Stats Row ── */}
        {Platform.OS !== 'web' ? (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.statsRow}>
            <CrmStat label="Total"         value={stats.total}  icon="people" color={T.accent}   />
            <CrmStat label="VIP"           value={stats.vip}    icon="star"   color={GOLD}        />
            <CrmStat label="Active / Month" value={stats.active} icon="pulse"  color={T.success}  />
          </Animated.View>
        ) : (
          <View style={styles.statsRow}>
            <CrmStat label="Total"         value={stats.total}  icon="people" color={T.accent}   />
            <CrmStat label="VIP"           value={stats.vip}    icon="star"   color={GOLD}        />
            <CrmStat label="Active / Month" value={stats.active} icon="pulse"  color={T.success}  />
          </View>
        )}

        {/* ── Filter Pills ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {['All', 'VIP', 'Regular', 'New'].map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterPill, filter === f && styles.filterPillActive]}
            >
              {f === 'VIP' && (
                <Ionicons
                  name="star"
                  size={12}
                  color={filter === f ? '#ffffff' : GOLD}
                  style={{ marginRight: 4 }}
                />
              )}
              <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Customer List ── */}
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={T.accent} />
            <Text style={styles.loadingText}>Loading customers…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="👤"
            title="No customers found"
            subtitle={search ? `No results for "${search}"` : 'Add your first customer.'}
            action={{ label: '+ Add Customer', onPress: openAddModal }}
          />
        ) : (
          filtered.map((c, i) => (
            <CustomerCard
              key={c.id}
              customer={c}
              index={i}
              expanded={expandedId === c.id}
              onExpand={() => setExpandedId(expandedId === c.id ? null : c.id)}
              onCall={() => openCall(c.phone)}
              onWhatsApp={() => openWhatsApp(c.phone, c.name)}
              onEdit={() => openEditModal(c)}
            />
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── FAB ── */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 90 }]}
        onPress={openAddModal}
      >
        <Ionicons name="person-add" size={24} color="#ffffff" />
      </TouchableOpacity>

      {/* ── Add / Edit Modal ── */}
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
              <Text style={styles.sheetTitle}>
                {editTarget ? 'Edit Customer' : 'New Customer'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={T.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <FormField
                label="Full Name *"
                placeholder="e.g. Arjun Sharma"
                value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))}
              />
              <FormField
                label="Phone *"
                placeholder="10-digit mobile"
                value={form.phone}
                onChangeText={v => setForm(f => ({ ...f, phone: v }))}
                keyboardType="phone-pad"
              />
              <FormField
                label="Email"
                placeholder="email@example.com"
                value={form.email}
                onChangeText={v => setForm(f => ({ ...f, email: v }))}
                keyboardType="email-address"
              />
              <FormField
                label="Birthday"
                placeholder="YYYY-MM-DD"
                value={form.birthday}
                onChangeText={v => setForm(f => ({ ...f, birthday: v }))}
              />
              <FormField
                label="Anniversary"
                placeholder="YYYY-MM-DD"
                value={form.anniversary}
                onChangeText={v => setForm(f => ({ ...f, anniversary: v }))}
              />
              <FormField
                label="Notes"
                placeholder="Preferences, allergies, special requests…"
                value={form.notes}
                onChangeText={v => setForm(f => ({ ...f, notes: v }))}
                multiline
              />

              {/* VIP Toggle */}
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Mark as VIP</Text>
                  <Text style={styles.toggleSub}>VIP customers get priority and rewards</Text>
                </View>
                <Switch
                  value={form.isVIP}
                  onValueChange={v => setForm(f => ({ ...f, isVIP: v }))}
                  trackColor={{ true: GOLD, false: T.border }}
                  thumbColor="#ffffff"
                />
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, isSaving && { opacity: 0.65 }]}
                onPress={saveCustomer}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {editTarget ? 'Save Changes' : 'Add Customer'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function CrmStat({ label, value, icon, color }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: color + '1a' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function CustomerCard({ customer: c, index, expanded, onExpand, onCall, onWhatsApp, onEdit }) {
  // loyaltyBalance is the scalar current_balance extracted in normalizeCustomer.
  // NEVER read c.loyalty_points here — it is a relation OBJECT and crashes inside <Text>.
  const loyaltyPts     = c.loyaltyBalance ?? 0;
  const daysInactive   = lastVisitDaysAgo(c.lastVisit);
  const showInactive   = daysInactive >= 30 && !c.isVIP && c.visits >= 3;
  const bgColor        = avatarColor(c.visits);
  const txtColor       = avatarTextColor(c.visits);

  const content = (
    <View style={styles.custCard}>
      {/* Top row */}
      <View style={styles.custTop}>
        <View style={[styles.avatar, { backgroundColor: bgColor }]}>
          <Text style={[styles.avatarText, { color: txtColor }]}>{initials(c.name)}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.custName}>{c.name}</Text>
            {c.isVIP && (
              <View style={styles.vipBadge}>
                <Ionicons name="star" size={10} color={GOLD} />
                <Text style={styles.vipText}>VIP</Text>
              </View>
            )}
          </View>
          <Text style={styles.custPhone}>{c.phone}</Text>
        </View>

        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={onCall}>
            <Ionicons name="call" size={16} color={T.success} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={onWhatsApp}>
            <Ionicons name="logo-whatsapp" size={16} color="#25d366" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats bar */}
      <View style={styles.custStats}>
        <View style={styles.custStatItem}>
          <Text style={styles.custStatVal}>{c.visits}</Text>
          <Text style={styles.custStatLabel}>Visits</Text>
        </View>
        <View style={styles.custStatDivider} />
        <View style={styles.custStatItem}>
          <Text style={styles.custStatVal}>₹{(c.totalSpent || 0).toLocaleString('en-IN')}</Text>
          <Text style={styles.custStatLabel}>Spent</Text>
        </View>
        <View style={styles.custStatDivider} />
        <View style={styles.custStatItem}>
          <Text style={styles.custStatVal}>{loyaltyPts}</Text>
          <Text style={styles.custStatLabel}>Points</Text>
        </View>
        <View style={styles.custStatDivider} />
        <View style={styles.custStatItem}>
          <Text style={styles.custStatVal} numberOfLines={1}>
            {c.lastVisit ? formatDate(c.lastVisit) : '—'}
          </Text>
          <Text style={styles.custStatLabel}>Last Visit</Text>
        </View>
      </View>

      {/* Favourite dish */}
      {c.favouriteDish && c.favouriteDish !== '—' && (
        <View style={styles.favRow}>
          <Ionicons name="heart" size={12} color={T.danger} />
          <Text style={styles.favText}>{c.favouriteDish}</Text>
        </View>
      )}

      {/* Inactive re-engagement prompt */}
      {showInactive && (
        <View style={styles.inactiveAlert}>
          <Ionicons name="alert-circle-outline" size={14} color={T.warning} />
          <Text style={styles.inactiveAlertText}>
            Hasn't visited in {daysInactive} days — send a re-engagement message
          </Text>
        </View>
      )}

      {/* Expanded profile */}
      {expanded && (
        <View style={styles.expandedWrap}>
          <View style={styles.expandedDivider} />

          <Text style={styles.sectionLabel}>Profile</Text>
          <View style={styles.profileGrid}>
            {c.email      ? <ProfileRow icon="mail-outline"          value={c.email} /> : null}
            {c.birthday   ? <ProfileRow icon="gift-outline"          value={`Birthday: ${formatDate(c.birthday)}`} /> : null}
            {c.anniversary ? <ProfileRow icon="heart-outline"        value={`Anniversary: ${formatDate(c.anniversary)}`} /> : null}
            {c.notes      ? <ProfileRow icon="document-text-outline" value={c.notes} /> : null}
            {c.firstVisit ? <ProfileRow icon="trending-up-outline"   value={`Member since ${formatDate(c.firstVisit)}`} /> : null}
          </View>

          {/* Order history */}
          {c.orders.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Recent Orders</Text>
              {c.orders.map((o, oi) => (
                <View key={oi} style={styles.orderRow}>
                  <View style={styles.orderDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderItems} numberOfLines={2}>{o.items}</Text>
                    <Text style={styles.orderMeta}>
                      {formatDate(o.date)} · ₹{(o.amount || 0).toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}

          <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
            <Ionicons name="create-outline" size={15} color={T.accent} />
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Expand toggle */}
      <TouchableOpacity style={styles.expandToggle} onPress={onExpand}>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={T.textMuted} />
      </TouchableOpacity>
    </View>
  );

  if (Platform.OS !== 'web') {
    return (
      <Animated.View entering={FadeInDown.delay(index * 60).duration(350)}>
        <PressCard style={styles.custCardWrap} onPress={onExpand}>
          {content}
        </PressCard>
      </Animated.View>
    );
  }
  return (
    <PressCard style={styles.custCardWrap} onPress={onExpand}>
      {content}
    </PressCard>
  );
}

function ProfileRow({ icon, value }) {
  return (
    <View style={styles.profileRow}>
      <Ionicons name={icon} size={14} color={T.textMuted} />
      <Text style={styles.profileRowText}>{value}</Text>
    </View>
  );
}

function FormField({ label, placeholder, value, onChangeText, keyboardType, multiline }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMulti]}
        placeholder={placeholder}
        placeholderTextColor={T.textMuted}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        autoCapitalize={keyboardType === 'email-address' || keyboardType === 'phone-pad' ? 'none' : 'words'}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: T.pageBg },
  scroll: { paddingHorizontal: 20, paddingBottom: 20 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: T.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTitle: { fontSize: FS['2xl'], fontWeight: FW.bold, color: T.textPrimary, letterSpacing: -0.5 },
  addIconBtn:  { padding: 6 },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.cardBg,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: R.xl,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: T.border,
  },
  searchIcon:  { marginRight: 8 },
  searchInput: { flex: 1, fontSize: FS.base, color: T.textPrimary },

  // Loading
  loadingWrap: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { fontSize: FS.sm, color: T.textMuted },

  // Birthday/anniversary alert banner
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: T.warningBg,
    borderRadius: R.xl,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: T.warning + '50',
  },
  alertRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  alertText:  { fontSize: FS.sm, fontWeight: FW.semibold, color: T.warningText, flex: 1 },
  alertAction: { fontSize: 12, fontWeight: FW.bold, color: T.warning, marginLeft: 8 },
  alertClose:  { padding: 2, marginLeft: 8 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 4 },
  statCard: {
    flex: 1,
    backgroundColor: T.cardBg,
    borderRadius: R['2xl'],
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.border,
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  statIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statVal:      { fontSize: FS.xl, fontWeight: FW.bold, color: T.textPrimary, letterSpacing: -0.5 },
  statLabel:    { fontSize: FS.xs, color: T.textMuted, textAlign: 'center', marginTop: 2 },

  // Filter pills
  filterScroll: { paddingVertical: 12, gap: 8, paddingRight: 20 },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: R.full,
    backgroundColor: T.cardBg,
    borderWidth: 1,
    borderColor: T.border,
  },
  filterPillActive:     { backgroundColor: T.accent, borderColor: T.accent },
  filterPillText:       { fontSize: FS.sm, fontWeight: FW.semibold, color: T.textSecondary },
  filterPillTextActive: { color: '#ffffff' },

  // Customer Card
  custCardWrap: { marginBottom: 12 },
  custCard: {
    backgroundColor: T.cardBg,
    borderRadius: R['2xl'],
    padding: 16,
    borderWidth: 1,
    borderColor: T.border,
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  custTop:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar:     { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: FS.lg, fontWeight: FW.extrabold },
  nameRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  custName:   { fontSize: FS.base, fontWeight: FW.bold, color: T.textPrimary },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: GOLD + '22',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: R.full,
  },
  vipText:      { fontSize: 10, fontWeight: FW.bold, color: GOLD },
  custPhone:    { fontSize: 12, color: T.textMuted, marginTop: 2 },
  quickActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: R.lg,
    backgroundColor: T.pageBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: T.border,
  },

  // Customer stats bar
  custStats: {
    flexDirection: 'row',
    backgroundColor: T.pageBg,
    borderRadius: R.xl,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginBottom: 10,
  },
  custStatItem:    { flex: 1, alignItems: 'center' },
  custStatVal:     { fontSize: 12, fontWeight: FW.bold, color: T.textPrimary },
  custStatLabel:   { fontSize: 10, color: T.textMuted, marginTop: 2 },
  custStatDivider: { width: 1, backgroundColor: T.border },

  // Favourite dish
  favRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  favText: { fontSize: 12, color: T.textSecondary },

  // Inactive alert
  inactiveAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: T.warningBg,
    borderRadius: R.md,
    padding: 8,
    marginTop: 4,
  },
  inactiveAlertText: { fontSize: 11, color: T.warningText, flex: 1, lineHeight: 16 },

  // Expanded profile
  expandedWrap:    { marginTop: 4 },
  expandedDivider: { height: 1, backgroundColor: T.border, marginBottom: 12 },
  sectionLabel: {
    fontSize: FS.xs,
    fontWeight: FW.bold,
    color: T.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  profileGrid:    { gap: 6 },
  profileRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  profileRowText: { fontSize: FS.sm, color: T.textSecondary, flex: 1, lineHeight: 18 },
  orderRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  orderDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: T.accent, marginTop: 5 },
  orderItems:     { fontSize: FS.sm, color: T.textPrimary, fontWeight: FW.medium, lineHeight: 18 },
  orderMeta:      { fontSize: 11, color: T.textMuted, marginTop: 2 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: R.md,
    backgroundColor: T.accentSoft,
    marginTop: 10,
  },
  editBtnText:  { fontSize: FS.sm, fontWeight: FW.semibold, color: T.accent },
  expandToggle: { alignItems: 'center', marginTop: 8 },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },

  // Modal Sheet
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: T.cardBg,
    borderTopLeftRadius: R['3xl'],
    borderTopRightRadius: R['3xl'],
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '92%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sheetTitle: { fontSize: FS.lg, fontWeight: FW.bold, color: T.textPrimary },

  // Form
  fieldWrap:  { marginBottom: 14 },
  fieldLabel: { fontSize: FS.sm, fontWeight: FW.semibold, color: T.textSecondary, marginBottom: 6 },
  fieldInput: {
    backgroundColor: T.pageBg,
    borderRadius: R.lg,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: FS.base,
    color: T.textPrimary,
    borderWidth: 1,
    borderColor: T.border,
  },
  fieldInputMulti: { height: 80, textAlignVertical: 'top', paddingTop: 11 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: T.border,
    marginBottom: 14,
  },
  toggleLabel: { fontSize: 14, fontWeight: FW.semibold, color: T.textPrimary },
  toggleSub:   { fontSize: 12, color: T.textMuted, marginTop: 2 },
  saveBtn: {
    backgroundColor: T.accent,
    borderRadius: R.xl,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  saveBtnText: { color: '#ffffff', fontSize: FS.base, fontWeight: FW.bold },
});
