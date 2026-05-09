/**
 * Customer CRM — PetPooja ERP
 * Expo SDK 54 · Expo Router 6 · Reanimated v4 · JSX
 */

import React, { useState, useMemo, useCallback } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeInDown,
  FadeIn,
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
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const today = new Date();

function dateKey(d) {
  return d.toISOString().split('T')[0];
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dateKey(d);
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

// Avatar color gets darker the more visits a customer has
function avatarColor(visits) {
  if (visits >= 20) return '#1E3A5F';
  if (visits >= 10) return '#2563EB';
  if (visits >= 5)  return '#0070F3';
  if (visits >= 2)  return '#60A5FA';
  return '#93C5FD';
}

function avatarTextColor(visits) {
  return visits >= 5 ? '#FFFFFF' : '#1E3A5F';
}

function initials(name) {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ─── Mock Data ─────────────────────────────────────────────────────────────
const INITIAL_CUSTOMERS = [
  {
    id: 'c1',
    name: 'Arjun Sharma',
    phone: '9811234567',
    email: 'arjun.sharma@gmail.com',
    birthday: '1990-05-07',
    anniversary: '2015-08-14',
    notes: 'Prefers window seat. Loves butter chicken.',
    isVIP: true,
    visits: 28,
    totalSpent: 42600,
    lastVisit: daysAgo(2),
    firstVisit: '2022-01-15',
    favouriteDish: 'Butter Chicken',
    orders: [
      { date: daysAgo(2), amount: 1840, items: 'Butter Chicken, Garlic Naan ×2, Lassi' },
      { date: daysAgo(10), amount: 2100, items: 'Dal Makhani, Tandoori Roti ×4, Gulab Jamun' },
      { date: daysAgo(22), amount: 980, items: 'Paneer Tikka, Coke' },
    ],
  },
  {
    id: 'c2',
    name: 'Priya Mehta',
    phone: '9867456789',
    email: 'priya.mehta@outlook.com',
    birthday: '1995-11-22',
    anniversary: '',
    notes: 'Vegetarian. No onion no garlic.',
    isVIP: true,
    visits: 19,
    totalSpent: 28300,
    lastVisit: daysAgo(5),
    firstVisit: '2022-03-08',
    favouriteDish: 'Palak Paneer',
    orders: [
      { date: daysAgo(5), amount: 1560, items: 'Palak Paneer, Roti ×3, Mango Lassi' },
      { date: daysAgo(18), amount: 1200, items: 'Mix Veg Thali' },
    ],
  },
  {
    id: 'c3',
    name: 'Rahul Gupta',
    phone: '9998887776',
    email: 'rahul.gupta@hotmail.com',
    birthday: '1988-03-15',
    anniversary: '2013-02-14',
    notes: 'Corporate account. Always brings team for lunch.',
    isVIP: false,
    visits: 11,
    totalSpent: 18700,
    lastVisit: daysAgo(35),
    firstVisit: '2023-01-10',
    favouriteDish: 'Chicken Biryani',
    orders: [
      { date: daysAgo(35), amount: 3400, items: 'Chicken Biryani ×3, Raita ×3, Gulab Jamun ×3' },
      { date: daysAgo(60), amount: 4200, items: 'Family Platter, Naan ×6, Dessert Combo' },
    ],
  },
  {
    id: 'c4',
    name: 'Sneha Patel',
    phone: '9123456780',
    email: 'sneha.patel@gmail.com',
    birthday: '1993-07-04',
    anniversary: '2018-12-25',
    notes: 'Allergic to nuts.',
    isVIP: false,
    visits: 7,
    totalSpent: 9800,
    lastVisit: daysAgo(8),
    firstVisit: '2023-06-01',
    favouriteDish: 'Pasta Arabiata',
    orders: [
      { date: daysAgo(8), amount: 1100, items: 'Pasta Arabiata, Garlic Bread, Cold Coffee' },
      { date: daysAgo(30), amount: 890, items: 'Margherita Pizza, Pepsi' },
    ],
  },
  {
    id: 'c5',
    name: 'Vikram Nair',
    phone: '9765432100',
    email: 'vikram.nair@yahoo.com',
    birthday: '1985-09-18',
    anniversary: '',
    notes: 'High value, always orders full table for 6.',
    isVIP: true,
    visits: 22,
    totalSpent: 54200,
    lastVisit: daysAgo(1),
    firstVisit: '2021-11-20',
    favouriteDish: 'Lamb Rogan Josh',
    orders: [
      { date: daysAgo(1), amount: 5800, items: 'Lamb Rogan Josh ×2, Biryani ×2, Naan ×6, Dessert' },
      { date: daysAgo(14), amount: 4400, items: 'Mixed Grill Platter ×2, Dal, Roti ×8' },
    ],
  },
  {
    id: 'c6',
    name: 'Kavya Reddy',
    phone: '9876543211',
    email: 'kavya.reddy@gmail.com',
    birthday: '1997-05-07',   // birthday today!
    anniversary: '',
    notes: 'New customer. Came for office party.',
    isVIP: false,
    visits: 2,
    totalSpent: 4200,
    lastVisit: daysAgo(3),
    firstVisit: daysAgo(3),
    favouriteDish: 'Paneer Butter Masala',
    orders: [
      { date: daysAgo(3), amount: 4200, items: 'Office party order — Biryani ×6, Paneer ×2, Dessert ×6' },
    ],
  },
  {
    id: 'c7',
    name: 'Rohan Verma',
    phone: '9988776655',
    email: 'rohan.v@gmail.com',
    birthday: '1992-06-30',
    anniversary: '2019-02-10',
    notes: 'Prefers less spicy food.',
    isVIP: false,
    visits: 5,
    totalSpent: 6700,
    lastVisit: daysAgo(15),
    firstVisit: '2023-09-01',
    favouriteDish: 'Dal Tadka',
    orders: [
      { date: daysAgo(15), amount: 1450, items: 'Dal Tadka, Jeera Rice, Coke' },
      { date: daysAgo(40), amount: 980, items: 'Veg Thali' },
    ],
  },
  {
    id: 'c8',
    name: 'Ananya Singh',
    phone: '9112233445',
    email: 'ananya.singh@gmail.com',
    birthday: '2000-01-10',
    anniversary: '',
    notes: 'Student, visits on weekends.',
    isVIP: false,
    visits: 3,
    totalSpent: 3200,
    lastVisit: daysAgo(6),
    firstVisit: daysAgo(45),
    favouriteDish: 'Pav Bhaji',
    orders: [
      { date: daysAgo(6), amount: 680, items: 'Pav Bhaji, Masala Chai ×2' },
      { date: daysAgo(20), amount: 1100, items: 'Chole Bhature, Lassi' },
    ],
  },
  {
    id: 'c9',
    name: 'Deepak Joshi',
    phone: '9654321098',
    email: 'deepak.joshi@gmail.com',
    birthday: '1980-12-05',
    anniversary: '2005-05-07',  // anniversary today!
    notes: 'Senior executive. Requests private dining room.',
    isVIP: true,
    visits: 14,
    totalSpent: 31500,
    lastVisit: daysAgo(4),
    firstVisit: '2022-07-15',
    favouriteDish: 'Mutton Biryani',
    orders: [
      { date: daysAgo(4), amount: 2800, items: 'Mutton Biryani, Salan, Dessert Platter' },
      { date: daysAgo(25), amount: 3600, items: 'Private dining — Kebab Platter, Biryani ×2' },
    ],
  },
];

const EMPTY_FORM = {
  name: '',
  phone: '',
  email: '',
  birthday: '',
  anniversary: '',
  notes: '',
  isVIP: false,
};

// ─── Component ──────────────────────────────────────────────────────────────
export default function CustomersScreen() {
  const insets = useSafeAreaInsets();
  const [customers, setCustomers] = useState(INITIAL_CUSTOMERS);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All'); // All / VIP / Regular / New
  const [expandedId, setExpandedId] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [alertDismissed, setAlertDismissed] = useState(false);

  // Birthday / anniversary alerts
  const celebratingToday = useMemo(() =>
    customers.filter(c =>
      (isBirthdayToday(c.birthday) && `🎂 ${c.name}'s Birthday today!`) ||
      (isAnniversaryToday(c.anniversary) && `💍 ${c.name}'s Anniversary today!`)
    ).flatMap(c => {
      const arr = [];
      if (isBirthdayToday(c.birthday)) arr.push({ id: c.id + '_bday', msg: `🎂 ${c.name}'s Birthday today!`, phone: c.phone, name: c.name });
      if (isAnniversaryToday(c.anniversary)) arr.push({ id: c.id + '_ann', msg: `💍 ${c.name}'s Anniversary today!`, phone: c.phone, name: c.name });
      return arr;
    }),
  [customers]);

  const stats = useMemo(() => ({
    total: customers.length,
    vip: customers.filter(c => c.isVIP).length,
    active: customers.filter(c => isActiveThisMonth(c.lastVisit)).length,
  }), [customers]);

  const filtered = useMemo(() => {
    let list = customers;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    }
    if (filter === 'VIP') list = list.filter(c => c.isVIP);
    else if (filter === 'Regular') list = list.filter(c => !c.isVIP && c.visits >= 3);
    else if (filter === 'New') list = list.filter(c => isNewThisMonth(c.firstVisit));
    return list;
  }, [customers, search, filter]);

  function openWhatsApp(phone, name) {
    const msg = `Hi ${name}! Thanks for being a valued guest at PetPooja Restaurant. We miss you! Come visit us soon. 🍽️`;
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
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      birthday: customer.birthday,
      anniversary: customer.anniversary,
      notes: customer.notes,
      isVIP: customer.isVIP,
    });
    setModalVisible(true);
  }

  function openAddModal() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }

  function saveCustomer() {
    if (!form.name.trim()) { Alert.alert('Required', 'Please enter customer name'); return; }
    if (!form.phone.trim()) { Alert.alert('Required', 'Please enter phone number'); return; }

    if (editTarget) {
      setCustomers(prev => prev.map(c =>
        c.id === editTarget ? { ...c, ...form } : c
      ));
    } else {
      setCustomers(prev => [{
        id: 'c' + Date.now(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        birthday: form.birthday.trim(),
        anniversary: form.anniversary.trim(),
        notes: form.notes.trim(),
        isVIP: form.isVIP,
        visits: 0,
        totalSpent: 0,
        lastVisit: null,
        firstVisit: dateKey(today),
        favouriteDish: '—',
        orders: [],
      }, ...prev]);
    }

    setModalVisible(false);
    setForm(EMPTY_FORM);
    setEditTarget(null);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Customers</Text>
        <TouchableOpacity style={styles.addIconBtn} onPress={openAddModal}>
          <Ionicons name="person-add-outline" size={22} color={C.text2} />
        </TouchableOpacity>
      </View>

      {/* ── Search Bar ── */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={C.text3} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, phone or email…"
          placeholderTextColor={C.text3}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={C.text3} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
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
              <Ionicons name="close" size={18} color={C.amber} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Stats Row ── */}
        {Platform.OS !== 'web' ? (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.statsRow}>
            <CrmStat label="Total" value={stats.total} icon="people" color={C.indigo} />
            <CrmStat label="VIP" value={stats.vip} icon="star" color={C.gold} />
            <CrmStat label="Active / Month" value={stats.active} icon="pulse" color={C.success} />
          </Animated.View>
        ) : (
          <View style={styles.statsRow}>
            <CrmStat label="Total" value={stats.total} icon="people" color={C.indigo} />
            <CrmStat label="VIP" value={stats.vip} icon="star" color={C.gold} />
            <CrmStat label="Active / Month" value={stats.active} icon="pulse" color={C.success} />
          </View>
        )}

        {/* ── Filter Pills ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {['All', 'VIP', 'Regular', 'New'].map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterPill, filter === f && styles.filterPillActive]}
            >
              {f === 'VIP' && <Ionicons name="star" size={12} color={filter === f ? '#FFFFFF' : C.gold} style={{ marginRight: 4 }} />}
              <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Customer List ── */}
        {filtered.length === 0 ? (
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
        <Ionicons name="person-add" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* ── Add/Edit Modal ── */}
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
              <Text style={styles.sheetTitle}>{editTarget ? 'Edit Customer' : 'New Customer'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={C.text2} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <FormField label="Full Name *" placeholder="e.g. Arjun Sharma" value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))} />
              <FormField label="Phone *" placeholder="10-digit mobile" value={form.phone}
                onChangeText={v => setForm(f => ({ ...f, phone: v }))} keyboardType="phone-pad" />
              <FormField label="Email" placeholder="email@example.com" value={form.email}
                onChangeText={v => setForm(f => ({ ...f, email: v }))} keyboardType="email-address" />
              <FormField label="Birthday" placeholder="YYYY-MM-DD" value={form.birthday}
                onChangeText={v => setForm(f => ({ ...f, birthday: v }))} />
              <FormField label="Anniversary" placeholder="YYYY-MM-DD" value={form.anniversary}
                onChangeText={v => setForm(f => ({ ...f, anniversary: v }))} />
              <FormField label="Notes" placeholder="Preferences, allergies, special requests…" value={form.notes}
                onChangeText={v => setForm(f => ({ ...f, notes: v }))} multiline />

              {/* VIP Toggle */}
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Mark as VIP</Text>
                  <Text style={styles.toggleSub}>VIP customers get priority and rewards</Text>
                </View>
                <Switch
                  value={form.isVIP}
                  onValueChange={v => setForm(f => ({ ...f, isVIP: v }))}
                  trackColor={{ true: C.gold, false: C.border }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={saveCustomer}>
                <Text style={styles.saveBtnText}>{editTarget ? 'Save Changes' : 'Add Customer'}</Text>
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
      <View style={[styles.statIconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function CustomerCard({ customer: c, index, expanded, onExpand, onCall, onWhatsApp, onEdit }) {
  const loyaltyPts = c.visits * 10;
  const daysInactive = lastVisitDaysAgo(c.lastVisit);
  const showInactiveAlert = daysInactive >= 30 && !c.isVIP && c.visits >= 3;
  const bgColor = avatarColor(c.visits);
  const txtColor = avatarTextColor(c.visits);

  const content = (
    <View style={styles.custCard}>
      {/* Top row */}
      <View style={styles.custTop}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: bgColor }]}>
          <Text style={[styles.avatarText, { color: txtColor }]}>{initials(c.name)}</Text>
        </View>

        {/* Name block */}
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.custName}>{c.name}</Text>
            {c.isVIP && (
              <View style={styles.vipBadge}>
                <Ionicons name="star" size={10} color={C.gold} />
                <Text style={styles.vipText}>VIP</Text>
              </View>
            )}
          </View>
          <Text style={styles.custPhone}>{c.phone}</Text>
        </View>

        {/* Quick actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={onCall}>
            <Ionicons name="call" size={16} color={C.success} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={onWhatsApp}>
            <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.custStats}>
        <View style={styles.custStatItem}>
          <Text style={styles.custStatVal}>{c.visits}</Text>
          <Text style={styles.custStatLabel}>Visits</Text>
        </View>
        <View style={styles.custStatDivider} />
        <View style={styles.custStatItem}>
          <Text style={styles.custStatVal}>₹{c.totalSpent.toLocaleString('en-IN')}</Text>
          <Text style={styles.custStatLabel}>Spent</Text>
        </View>
        <View style={styles.custStatDivider} />
        <View style={styles.custStatItem}>
          <Text style={styles.custStatVal}>{loyaltyPts}</Text>
          <Text style={styles.custStatLabel}>Points</Text>
        </View>
        <View style={styles.custStatDivider} />
        <View style={styles.custStatItem}>
          <Text style={styles.custStatVal}>{c.lastVisit ? formatDate(c.lastVisit) : '—'}</Text>
          <Text style={styles.custStatLabel}>Last Visit</Text>
        </View>
      </View>

      {/* Favourite dish */}
      <View style={styles.favRow}>
        <Ionicons name="heart" size={12} color={C.error} />
        <Text style={styles.favText}>{c.favouriteDish}</Text>
      </View>

      {/* Inactive alert */}
      {showInactiveAlert && (
        <View style={styles.inactiveAlert}>
          <Ionicons name="alert-circle-outline" size={14} color={C.amber} />
          <Text style={styles.inactiveAlertText}>Hasn't visited in {daysInactive} days — send a re-engagement message</Text>
        </View>
      )}

      {/* Expanded profile */}
      {expanded && (
        <View style={styles.expandedWrap}>
          <View style={styles.expandedDivider} />

          {/* Profile details */}
          <Text style={styles.sectionLabel}>Profile</Text>
          <View style={styles.profileGrid}>
            {c.email ? <ProfileRow icon="mail-outline" value={c.email} /> : null}
            {c.birthday ? <ProfileRow icon="gift-outline" value={`Birthday: ${formatDate(c.birthday)}`} /> : null}
            {c.anniversary ? <ProfileRow icon="heart-outline" value={`Anniversary: ${formatDate(c.anniversary)}`} /> : null}
            {c.notes ? <ProfileRow icon="document-text-outline" value={c.notes} /> : null}
            <ProfileRow icon="trending-up-outline" value={`Member since ${formatDate(c.firstVisit)}`} />
          </View>

          {/* Order history */}
          <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Recent Orders</Text>
          {c.orders.length === 0 ? (
            <Text style={styles.noOrdersText}>No orders yet</Text>
          ) : (
            c.orders.map((o, oi) => (
              <View key={oi} style={styles.orderRow}>
                <View style={styles.orderDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderItems} numberOfLines={2}>{o.items}</Text>
                  <Text style={styles.orderMeta}>{formatDate(o.date)} · ₹{o.amount.toLocaleString('en-IN')}</Text>
                </View>
              </View>
            ))
          )}

          {/* Edit button */}
          <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
            <Ionicons name="create-outline" size={15} color={C.indigo} />
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Expand toggle */}
      <TouchableOpacity style={styles.expandToggle} onPress={onExpand}>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={C.text3} />
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
      <Ionicons name={icon} size={14} color={C.text3} />
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
        placeholderTextColor={C.text3}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
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
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: C.text1, letterSpacing: -0.5 },
  addIconBtn: { padding: 6 },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: C.text1 },

  // Birthday/anniversary alert banner
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: C.amber + '50',
  },
  alertRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  alertText: { fontSize: 13, fontWeight: '600', color: '#92400E', flex: 1 },
  alertAction: { fontSize: 12, fontWeight: '700', color: C.amber, marginLeft: 8 },
  alertClose: { padding: 2, marginLeft: 8 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 4 },
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
  statIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statVal: { fontSize: 20, fontWeight: '700', color: C.text1, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: C.text3, textAlign: 'center', marginTop: 2 },

  // Filter pills
  filterScroll: { paddingVertical: 12, gap: 8, paddingRight: 20 },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
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

  // Customer Card
  custCardWrap: { marginBottom: 12 },
  custCard: {
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
  custTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  custName: { fontSize: 15, fontWeight: '700', color: C.text1 },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: C.gold + '22',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  vipText: { fontSize: 10, fontWeight: '700', color: C.gold },
  custPhone: { fontSize: 12, color: C.text3, marginTop: 2 },
  quickActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },

  // Customer stats bar
  custStats: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginBottom: 10,
  },
  custStatItem: { flex: 1, alignItems: 'center' },
  custStatVal: { fontSize: 12, fontWeight: '700', color: C.text1 },
  custStatLabel: { fontSize: 10, color: C.text3, marginTop: 2 },
  custStatDivider: { width: 1, backgroundColor: C.border },

  // Favourite dish
  favRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  favText: { fontSize: 12, color: C.text2 },

  // Inactive alert
  inactiveAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  inactiveAlertText: { fontSize: 11, color: '#92400E', flex: 1, lineHeight: 16 },

  // Expanded profile
  expandedWrap: { marginTop: 4 },
  expandedDivider: { height: 1, backgroundColor: C.border, marginBottom: 12 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  profileGrid: { gap: 6 },
  profileRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  profileRowText: { fontSize: 13, color: C.text2, flex: 1, lineHeight: 18 },
  noOrdersText: { fontSize: 13, color: C.text3, fontStyle: 'italic' },
  orderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  orderDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.indigo, marginTop: 5 },
  orderItems: { fontSize: 13, color: C.text1, fontWeight: '500', lineHeight: 18 },
  orderMeta: { fontSize: 11, color: C.text3, marginTop: 2 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: C.indigo + '12',
    marginTop: 10,
  },
  editBtnText: { fontSize: 13, fontWeight: '600', color: C.indigo },
  expandToggle: { alignItems: 'center', marginTop: 8 },

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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '92%',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: C.text1 },

  // Form fields
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
