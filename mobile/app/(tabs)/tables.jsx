import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Modal,
  RefreshControl,
  Platform,
  Pressable,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { PressCard } from '../../src/components/PressCard';
import SkeletonBox from '../../src/components/SkeletonBox';
import { EmptyState } from '../../src/components/EmptyState';
import { useOfflineTables } from '../../src/hooks/useOfflineTables';
import { useOutlet } from '../../src/context/OutletContext';
import QRScanner from '../../src/components/QRScanner';

// ─── Constants ────────────────────────────────────────────────────────────────

const WAITERS = [
  { id: 'w1', name: 'Rahul Sharma',  initials: 'RS', color: '#0070F3' },
  { id: 'w2', name: 'Priya Patel',   initials: 'PP', color: '#9B59B6' },
  { id: 'w3', name: 'Amit Verma',    initials: 'AV', color: '#00B341' },
  { id: 'w4', name: 'Sneha Gupta',   initials: 'SG', color: '#F5A623' },
];

// NOW = 1:47 PM for consistent mock time display
const MOCK_TABLES = [
  {
    id: 't1',  number: 1,  capacity: 2, status: 'empty',
    waiterId: null,  covers: 0,  sinceMs: null,       amount: 0,
    orders: [],      guestName: null, reservedAt: null, mergedWith: [],
  },
  {
    id: 't2',  number: 2,  capacity: 4, status: 'occupied',
    waiterId: 'w1',  covers: 3,  sinceMs: Date.now() - 42 * 60000, amount: 1240,
    orders: [
      { name: 'Paneer Butter Masala', qty: 1, price: 320 },
      { name: 'Garlic Naan × 3',      qty: 3, price: 120 },
      { name: 'Lassi',                qty: 2, price: 80  },
      { name: 'Raita',                qty: 1, price: 60  },
    ],
    guestName: null, reservedAt: null, mergedWith: [],
  },
  {
    id: 't3',  number: 3,  capacity: 4, status: 'bill_pending',
    waiterId: 'w2',  covers: 4,  sinceMs: Date.now() - 97 * 60000, amount: 2850,
    orders: [
      { name: 'Dal Makhani',          qty: 1, price: 280 },
      { name: 'Butter Chicken',       qty: 2, price: 380 },
      { name: 'Jeera Rice',           qty: 2, price: 160 },
      { name: 'Tandoori Roti × 6',    qty: 6, price: 40  },
    ],
    guestName: null, reservedAt: null, mergedWith: [],
  },
  {
    id: 't4',  number: 4,  capacity: 6, status: 'empty',
    waiterId: null,  covers: 0,  sinceMs: null,        amount: 0,
    orders: [],      guestName: null, reservedAt: null, mergedWith: [],
  },
  {
    id: 't5',  number: 5,  capacity: 2, status: 'occupied',
    waiterId: 'w3',  covers: 2,  sinceMs: Date.now() - 22 * 60000, amount: 560,
    orders: [
      { name: 'Veg Biryani',          qty: 2, price: 220 },
      { name: 'Cold Coffee',          qty: 2, price: 110 },
    ],
    guestName: null, reservedAt: null, mergedWith: [],
  },
  {
    id: 't6',  number: 6,  capacity: 4, status: 'cleaning',
    waiterId: null,  covers: 0,  sinceMs: null,        amount: 0,
    orders: [],      guestName: null, reservedAt: null, mergedWith: [],
  },
  {
    id: 't7',  number: 7,  capacity: 8, status: 'occupied',
    waiterId: 'w1',  covers: 6,  sinceMs: Date.now() - 77 * 60000, amount: 3200,
    orders: [
      { name: 'Chicken Tikka',        qty: 2, price: 420 },
      { name: 'Kadai Paneer',         qty: 1, price: 300 },
      { name: 'Naan × 8',            qty: 8, price: 40  },
      { name: 'Fish Curry',           qty: 1, price: 380 },
      { name: 'Soft Drinks',          qty: 4, price: 60  },
    ],
    guestName: null, reservedAt: null, mergedWith: [],
  },
  {
    id: 't8',  number: 8,  capacity: 4, status: 'empty',
    waiterId: null,  covers: 0,  sinceMs: null,        amount: 0,
    orders: [],      guestName: null, reservedAt: null, mergedWith: [],
  },
  {
    id: 't9',  number: 9,  capacity: 2, status: 'bill_pending',
    waiterId: 'w2',  covers: 2,  sinceMs: Date.now() - 112 * 60000, amount: 780,
    orders: [
      { name: 'Masala Dosa',          qty: 2, price: 180 },
      { name: 'Filter Coffee',        qty: 2, price: 80  },
      { name: 'Idli Sambar',          qty: 1, price: 120 },
    ],
    guestName: null, reservedAt: null, mergedWith: [],
  },
  {
    id: 't10', number: 10, capacity: 6, status: 'empty',
    waiterId: null,  covers: 0,  sinceMs: null,        amount: 0,
    orders: [],      guestName: null, reservedAt: null, mergedWith: [],
  },
  {
    id: 't11', number: 11, capacity: 4, status: 'reserved',
    waiterId: 'w4',  covers: 0,  sinceMs: null,        amount: 0,
    orders: [],      guestName: 'Sharma Family', reservedAt: '2:00 PM', mergedWith: [],
  },
  {
    id: 't12', number: 12, capacity: 2, status: 'empty',
    waiterId: null,  covers: 0,  sinceMs: null,        amount: 0,
    orders: [],      guestName: null, reservedAt: null, mergedWith: [],
  },
];

// Floor plan positions — (left, top) in px on a 360-wide canvas (height ~480)
const FLOOR_POSITIONS = {
  t1:  { left: 20,  top: 20  },
  t2:  { left: 115, top: 20  },
  t3:  { left: 210, top: 20  },
  t4:  { left: 305, top: 20  },  // partially offscreen → scroll
  t5:  { left: 20,  top: 130 },
  t6:  { left: 115, top: 130 },
  t7:  { left: 210, top: 130 },
  t8:  { left: 305, top: 130 },
  t9:  { left: 20,  top: 240 },
  t10: { left: 115, top: 240 },
  t11: { left: 210, top: 240 },
  t12: { left: 305, top: 240 },
};

// ─── Status Config ────────────────────────────────────────────────────────────

const STATUS = {
  empty:        { label: 'Empty',        color: '#00B341', bg: '#EDFBF3', icon: 'checkmark-circle-outline' },
  occupied:     { label: 'Occupied',     color: '#0070F3', bg: '#EBF3FF', icon: 'people'                   },
  reserved:     { label: 'Reserved',     color: '#F5A623', bg: '#FFF8EB', icon: 'calendar-outline'         },
  bill_pending: { label: 'Bill Pending', color: '#EE0000', bg: '#FFEBEB', icon: 'receipt-outline'          },
  cleaning:     { label: 'Cleaning',     color: '#888888', bg: '#F5F5F5', icon: 'construct-outline'        },
};

const ALL_STATUSES = ['empty', 'occupied', 'reserved', 'bill_pending', 'cleaning'];

const FILTER_PILLS = [
  { key: 'all',          label: 'All'          },
  { key: 'occupied',     label: 'Occupied'     },
  { key: 'bill_pending', label: 'Bill Pending' },
  { key: 'reserved',     label: 'Reserved'     },
  { key: 'empty',        label: 'Empty'        },
  { key: 'cleaning',     label: 'Cleaning'     },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatAmount = (n) =>
  n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${n}`;

const elapsedMins = (sinceMs) => {
  if (!sinceMs) return 0;
  return Math.floor((Date.now() - sinceMs) / 60000);
};

const formatElapsed = (sinceMs) => {
  const m = elapsedMins(sinceMs);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
};

const getWaiter = (waiterId) => WAITERS.find(w => w.id === waiterId) || null;

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TablesSkeleton() {
  return (
    <View style={{ padding: 20, gap: 16 }}>
      <SkeletonBox width="55%" height={26} borderRadius={6} color="#F0F0F0" />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        {[0, 1, 2, 3].map(i => (
          <SkeletonBox key={i} width={72} height={36} borderRadius={999} color="#F0F0F0" />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <SkeletonBox key={i} width="47%" height={110} borderRadius={16} color="#F0F0F0" />
        ))}
      </View>
    </View>
  );
}

// ─── WaiterBadge ─────────────────────────────────────────────────────────────

function WaiterBadge({ waiterId, size = 22 }) {
  const w = getWaiter(waiterId);
  if (!w) return null;
  return (
    <View style={[styles.waiterBadge, { width: size, height: size, borderRadius: size / 2, backgroundColor: w.color }]}>
      <Text style={[styles.waiterBadgeText, { fontSize: size * 0.36 }]}>{w.initials}</Text>
    </View>
  );
}

// ─── GridTableCard ────────────────────────────────────────────────────────────

function GridTableCard({ table, onPress, onLongPress, mergeMode, mergeSourceId }) {
  const st = STATUS[table.status] || STATUS.empty;
  const isOccupied = table.status === 'occupied';
  const isBill = table.status === 'bill_pending';
  const isReserved = table.status === 'reserved';
  const isActive = isOccupied || isBill;
  const isMergeTarget = mergeMode && table.id !== mergeSourceId && table.status !== 'empty';
  const isMergeSource = mergeMode && table.id === mergeSourceId;

  return (
    <Pressable
      onPress={() => onPress(table)}
      onLongPress={() => onLongPress(table)}
      delayLongPress={400}
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: st.color },
        pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
        isMergeTarget && styles.cardMergeTarget,
        isMergeSource && styles.cardMergeSource,
      ]}
    >
      {/* Top row */}
      <View style={styles.cardTopRow}>
        <Text style={styles.tableNum}>T-{table.number}</Text>
        <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
          <Ionicons name={st.icon} size={10} color={st.color} />
          <Text style={[styles.statusBadgeText, { color: st.color }]}>{st.label}</Text>
        </View>
      </View>

      {/* Capacity */}
      <View style={styles.capacityRow}>
        <Ionicons name="people-outline" size={12} color="#888888" />
        <Text style={styles.capacityText}>{table.capacity} seats</Text>
      </View>

      {/* Occupied content */}
      {isActive && (
        <View style={styles.cardContent}>
          <View style={styles.cardRow}>
            <Ionicons name="time-outline" size={11} color="#888888" />
            <Text style={styles.cardMeta}>{formatElapsed(table.sinceMs)}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.cardMeta}>👥 {table.covers}</Text>
          </View>
          <Text style={styles.amountText}>{formatAmount(table.amount)}</Text>
        </View>
      )}

      {/* Reserved */}
      {isReserved && (
        <View style={styles.cardContent}>
          <Text style={styles.guestName} numberOfLines={1}>{table.guestName}</Text>
          <View style={styles.cardRow}>
            <Ionicons name="time-outline" size={11} color="#888888" />
            <Text style={styles.cardMeta}>At {table.reservedAt}</Text>
          </View>
        </View>
      )}

      {/* Empty / Cleaning */}
      {!isActive && !isReserved && (
        <View style={styles.centerStatus}>
          <Text style={[styles.centerStatusText, { color: st.color }]}>{st.label}</Text>
        </View>
      )}

      {/* Waiter badge bottom right */}
      {table.waiterId && (
        <View style={styles.waiterCorner}>
          <WaiterBadge waiterId={table.waiterId} size={24} />
        </View>
      )}

      {/* Merged indicator */}
      {table.mergedWith && table.mergedWith.length > 0 && (
        <View style={styles.mergedTag}>
          <Ionicons name="git-merge-outline" size={9} color="#0070F3" />
          <Text style={styles.mergedTagText}>+T{table.mergedWith.join(', T')}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ─── FloorTableCard ───────────────────────────────────────────────────────────

function FloorTableCard({ table, onPress, onLongPress, mergeMode, mergeSourceId, position }) {
  const st = STATUS[table.status] || STATUS.empty;
  const isActive = table.status === 'occupied' || table.status === 'bill_pending';
  const isMergeSource = mergeMode && table.id === mergeSourceId;
  const isMergeTarget = mergeMode && table.id !== mergeSourceId && table.status !== 'empty';

  return (
    <Pressable
      onPress={() => onPress(table)}
      onLongPress={() => onLongPress(table)}
      delayLongPress={400}
      style={({ pressed }) => [
        styles.floorCard,
        {
          left: position.left,
          top: position.top,
          borderColor: st.color,
          backgroundColor: st.bg,
        },
        pressed && { opacity: 0.8 },
        isMergeSource && { borderWidth: 3, borderStyle: 'dashed' },
        isMergeTarget && { borderWidth: 3 },
      ]}
    >
      <Text style={[styles.floorNum, { color: st.color }]}>{table.number}</Text>
      {isActive && (
        <Text style={[styles.floorCovers, { color: st.color }]}>👥{table.covers}</Text>
      )}
      {table.status === 'reserved' && (
        <Text style={[styles.floorCovers, { color: st.color }]}>📅</Text>
      )}
      {table.waiterId && (
        <View style={styles.floorWaiter}>
          <WaiterBadge waiterId={table.waiterId} size={16} />
        </View>
      )}
    </Pressable>
  );
}

// ─── QuickActionsSheet ────────────────────────────────────────────────────────

function QuickActionsSheet({ table, visible, onClose, onAction }) {
  if (!table) return null;
  const st = STATUS[table.status] || STATUS.empty;

  const actions = [
    { key: 'empty',    icon: 'checkmark-circle-outline', label: 'Mark Empty',    color: '#00B341' },
    { key: 'cleaning', icon: 'construct-outline',        label: 'Mark Cleaning', color: '#888888' },
    { key: 'assign',   icon: 'person-add-outline',       label: 'Assign Waiter', color: '#0070F3' },
    { key: 'bill',     icon: 'receipt-outline',          label: 'Generate Bill', color: '#EE0000' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Table {table.number} — Quick Actions</Text>
          <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
            <Text style={[styles.statusBadgeText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>
        <View style={styles.quickGrid}>
          {actions.map(a => (
            <TouchableOpacity
              key={a.key}
              style={styles.quickItem}
              onPress={() => { onAction(table, a.key); onClose(); }}
            >
              <View style={[styles.quickIcon, { backgroundColor: a.color + '18' }]}>
                <Ionicons name={a.icon} size={22} color={a.color} />
              </View>
              <Text style={styles.quickLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

// ─── TableDetailModal ─────────────────────────────────────────────────────────

function TableDetailModal({
  table, visible, onClose, onUpdateStatus, onUpdateCovers,
  onAssignWaiter, onMerge, tables, mergeMode, setMergeMode,
}) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [showWaiterPicker, setShowWaiterPicker] = useState(false);

  useEffect(() => {
    if (!table || !table.sinceMs) return;
    setElapsed(elapsedMins(table.sinceMs));
    const interval = setInterval(() => setElapsed(elapsedMins(table.sinceMs)), 30000);
    return () => clearInterval(interval);
  }, [table]);

  if (!table) return null;
  const st = STATUS[table.status] || STATUS.empty;
  const isActive = table.status === 'occupied' || table.status === 'bill_pending';
  const waiter = getWaiter(table.waiterId);

  const orderTotal = table.orders.reduce((s, o) => s + o.price * o.qty, 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { maxHeight: '90%' }]}>
        <View style={styles.sheetHandle} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.sheetTitle}>Table {table.number}</Text>
            {isActive && table.sinceMs && (
              <Text style={styles.sheetSubtitle}>
                <Ionicons name="time-outline" size={11} color="#888" /> Occupied {elapsed} min
              </Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
              <Ionicons name={st.icon} size={11} color={st.color} />
              <Text style={[styles.statusBadgeText, { color: st.color }]}>{st.label}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color="#444" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Waiter row */}
          <View style={styles.detailGrid}>
            <View style={styles.detailRow}>
              <View style={styles.detailLeft}>
                <Ionicons name="person-outline" size={14} color="#888" />
                <Text style={styles.detailLabel}>Waiter</Text>
              </View>
              <TouchableOpacity
                style={styles.waiterPickerBtn}
                onPress={() => setShowWaiterPicker(v => !v)}
              >
                {waiter ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <WaiterBadge waiterId={table.waiterId} size={20} />
                    <Text style={styles.detailValue}>{waiter.name}</Text>
                  </View>
                ) : (
                  <Text style={[styles.detailValue, { color: '#888' }]}>Unassigned</Text>
                )}
                <Ionicons name="chevron-down" size={13} color="#888" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </View>

            {showWaiterPicker && (
              <View style={styles.waiterDropdown}>
                <TouchableOpacity
                  style={styles.waiterOption}
                  onPress={() => { onAssignWaiter(table.id, null); setShowWaiterPicker(false); }}
                >
                  <Text style={[styles.waiterOptionText, { color: '#888' }]}>None</Text>
                </TouchableOpacity>
                {WAITERS.map(w => (
                  <TouchableOpacity
                    key={w.id}
                    style={[styles.waiterOption, table.waiterId === w.id && styles.waiterOptionActive]}
                    onPress={() => { onAssignWaiter(table.id, w.id); setShowWaiterPicker(false); }}
                  >
                    <WaiterBadge waiterId={w.id} size={20} />
                    <Text style={styles.waiterOptionText}>{w.name}</Text>
                    {table.waiterId === w.id && (
                      <Ionicons name="checkmark" size={14} color="#0070F3" style={{ marginLeft: 'auto' }} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Covers stepper */}
            <View style={styles.detailRow}>
              <View style={styles.detailLeft}>
                <Ionicons name="people-outline" size={14} color="#888" />
                <Text style={styles.detailLabel}>Covers</Text>
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => onUpdateCovers(table.id, Math.max(0, table.covers - 1))}
                >
                  <Ionicons name="remove" size={14} color="#000" />
                </TouchableOpacity>
                <Text style={styles.stepValue}>{table.covers}</Text>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => onUpdateCovers(table.id, Math.min(table.capacity, table.covers + 1))}
                >
                  <Ionicons name="add" size={14} color="#000" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={styles.detailLeft}>
                <Ionicons name="people-circle-outline" size={14} color="#888" />
                <Text style={styles.detailLabel}>Capacity</Text>
              </View>
              <Text style={styles.detailValue}>{table.capacity} seats</Text>
            </View>

            {table.amount > 0 && (
              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Ionicons name="cash-outline" size={14} color="#888" />
                  <Text style={styles.detailLabel}>Amount</Text>
                </View>
                <Text style={[styles.detailValue, { color: '#0070F3', fontWeight: '700' }]}>
                  ₹{table.amount.toLocaleString()}
                </Text>
              </View>
            )}

            {table.reservedAt && (
              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Ionicons name="time-outline" size={14} color="#888" />
                  <Text style={styles.detailLabel}>
                    {table.status === 'reserved' ? 'Reserved at' : 'Seated since'}
                  </Text>
                </View>
                <Text style={styles.detailValue}>{table.reservedAt}</Text>
              </View>
            )}

            {table.guestName && (
              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Ionicons name="person-circle-outline" size={14} color="#888" />
                  <Text style={styles.detailLabel}>Guest</Text>
                </View>
                <Text style={styles.detailValue}>{table.guestName}</Text>
              </View>
            )}
          </View>

          {/* Status changer */}
          <Text style={styles.sectionLabel}>Change Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20 }}>
              {ALL_STATUSES.map(s => {
                const cfg = STATUS[s];
                const active = table.status === s;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.statusChip,
                      active
                        ? { backgroundColor: cfg.color, borderColor: cfg.color }
                        : { backgroundColor: cfg.bg, borderColor: cfg.color + '55' },
                    ]}
                    onPress={() => !active && onUpdateStatus(table.id, s)}
                  >
                    <Ionicons name={cfg.icon} size={12} color={active ? '#fff' : cfg.color} />
                    <Text style={[styles.statusChipText, { color: active ? '#fff' : cfg.color }]}>
                      {cfg.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Orders */}
          {table.orders.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Current Orders</Text>
              <View style={styles.ordersList}>
                {table.orders.map((o, i) => (
                  <View key={i} style={styles.orderItem}>
                    <Text style={styles.orderName} numberOfLines={1}>{o.name}</Text>
                    <Text style={styles.orderPrice}>₹{(o.price * o.qty).toLocaleString()}</Text>
                  </View>
                ))}
                <View style={[styles.orderItem, styles.orderTotal]}>
                  <Text style={styles.orderTotalLabel}>Total</Text>
                  <Text style={styles.orderTotalValue}>₹{orderTotal.toLocaleString()}</Text>
                </View>
              </View>
            </>
          )}

          {/* Action buttons */}
          {/* Take Order — shown for empty/reserved tables (start a fresh order) */}
          {(table.status === 'empty' || table.status === 'reserved') && (
            <TouchableOpacity
              style={[styles.btnSolid, { marginBottom: 8, backgroundColor: '#000' }]}
              onPress={() => {
                onUpdateStatus(table.id, 'occupied');
                onClose();
                router.push({
                  pathname: '/pos',
                  params: {
                    table_id: table.id,
                    table_name: `T${table.number}`,
                    order_type: 'dine_in',
                  },
                });
              }}
            >
              <Ionicons name="add-circle-outline" size={15} color="#fff" />
              <Text style={styles.btnSolidText}>Take Order</Text>
            </TouchableOpacity>
          )}

          {/* Add More Items — shown for occupied tables */}
          {table.status === 'occupied' && (
            <TouchableOpacity
              style={[styles.btnOutline, { marginBottom: 8, borderColor: '#0070F3' }]}
              onPress={() => {
                onClose();
                router.push({
                  pathname: '/pos',
                  params: {
                    table_id: table.id,
                    table_name: `T${table.number}`,
                    order_type: 'dine_in',
                  },
                });
              }}
            >
              <Ionicons name="add-outline" size={15} color="#0070F3" />
              <Text style={[styles.btnOutlineText, { color: '#0070F3' }]}>Add More Items</Text>
            </TouchableOpacity>
          )}

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.btnOutline}
              onPress={() => { onClose(); router.push('/orders'); }}
            >
              <Ionicons name="list-outline" size={15} color="#000" />
              <Text style={styles.btnOutlineText}>View Full Order</Text>
            </TouchableOpacity>

            {isActive && (
              <TouchableOpacity
                style={styles.btnSolid}
                onPress={() => {
                  onUpdateStatus(table.id, 'bill_pending');
                  onClose();
                  router.push('/billing');
                }}
              >
                <Ionicons name="receipt" size={15} color="#fff" />
                <Text style={styles.btnSolidText}>Generate Bill</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.btnOutline, { flex: 1 }]}
              onPress={() => {
                setMergeMode(true);
                onClose();
              }}
            >
              <Ionicons name="git-merge-outline" size={15} color="#0070F3" />
              <Text style={[styles.btnOutlineText, { color: '#0070F3' }]}>Merge Table</Text>
            </TouchableOpacity>

            {(table.status === 'bill_pending' || table.status === 'cleaning') && (
              <TouchableOpacity
                style={[styles.btnOutline, { flex: 1, borderColor: '#888' }]}
                onPress={() => { onUpdateStatus(table.id, 'cleaning'); onClose(); }}
              >
                <Ionicons name="construct-outline" size={15} color="#888" />
                <Text style={[styles.btnOutlineText, { color: '#888' }]}>Mark Cleaning</Text>
              </TouchableOpacity>
            )}
          </View>

          {table.status === 'cleaning' && (
            <TouchableOpacity
              style={[styles.btnOutline, { borderColor: '#00B341', marginHorizontal: 0, marginBottom: 10 }]}
              onPress={() => { onUpdateStatus(table.id, 'empty'); onClose(); }}
            >
              <Ionicons name="checkmark-circle-outline" size={15} color="#00B341" />
              <Text style={[styles.btnOutlineText, { color: '#00B341' }]}>Mark Cleaned</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 16 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TablesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { outletId } = useOutlet();
  const { tables: offlineTables, isLoading: tablesLoading, refresh: refreshTables, updateStatus } = useOfflineTables(outletId);

  const [tables, setTables] = useState([]);
  const [filter, setFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'floor'
  const [selectedTable, setSelectedTable] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [quickTable, setQuickTable] = useState(null);
  const [quickVisible, setQuickVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState(null);
  const [showQRScanner, setShowQRScanner] = useState(false);

  // Populate tables from offline SQLite cache
  useEffect(() => {
    if (offlineTables && offlineTables.length > 0) {
      setTables(offlineTables.map(t => ({
        id: t.id,
        name: t.name,
        section: t.section || 'Main',
        capacity: t.capacity || 4,
        status: t.status || 'available',
        // Keep other fields the UI expects with defaults
        waiter: null,
        covers: 0,
        order_id: null,
        time_seated: null,
        ...t, // spread any extra fields from cache
      })));
    }
  }, [offlineTables]);

  // Fallback to mock data if offline cache is empty (first launch / no sync yet)
  useEffect(() => {
    if (!offlineTables || offlineTables.length === 0) {
      setTables(MOCK_TABLES);
    }
  }, []);

  // Loading state: use tablesLoading from hook, with a minimum display time
  useEffect(() => {
    if (!tablesLoading) {
      const t = setTimeout(() => setLoading(false), 400);
      return () => clearTimeout(t);
    }
  }, [tablesLoading]);

  // ── Derived counts ──────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    const c = { all: tables.length };
    ALL_STATUSES.forEach(s => { c[s] = tables.filter(t => t.status === s).length; });
    return c;
  }, [tables]);

  const occupiedCount = (counts.occupied || 0) + (counts.bill_pending || 0);

  const filteredTables = useMemo(() => {
    if (filter === 'all') return tables;
    return tables.filter(t => t.status === filter);
  }, [tables, filter]);

  // Pairs for grid layout
  const gridRows = useMemo(() => {
    const pairs = [];
    for (let i = 0; i < filteredTables.length; i += 2) {
      pairs.push([filteredTables[i], filteredTables[i + 1] || null]);
    }
    return pairs;
  }, [filteredTables]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refreshTables().finally(() => {
      setTimeout(() => setRefreshing(false), 400);
    });
  }, [refreshTables]);

  const handleUpdateStatus = useCallback((id, newStatus) => {
    setTables(prev => prev.map(t =>
      t.id === id
        ? {
            ...t,
            status: newStatus,
            sinceMs: newStatus === 'occupied' ? Date.now() : t.sinceMs,
            amount:  newStatus === 'empty' ? 0 : t.amount,
            covers:  newStatus === 'empty' ? 0 : t.covers,
            waiterId: newStatus === 'empty' ? null : t.waiterId,
            mergedWith: newStatus === 'empty' ? [] : t.mergedWith,
          }
        : t
    ));
    // Persist status change to SQLite
    updateStatus(id, newStatus);
  }, [updateStatus]);

  const handleUpdateCovers = useCallback((id, covers) => {
    setTables(prev => prev.map(t => t.id === id ? { ...t, covers } : t));
  }, []);

  const handleAssignWaiter = useCallback((id, waiterId) => {
    setTables(prev => prev.map(t => t.id === id ? { ...t, waiterId } : t));
  }, []);

  const handleCardPress = useCallback((table) => {
    if (mergeMode) {
      // First tap sets source, second tap on a different table merges
      if (!mergeSourceId) {
        setMergeSourceId(table.id);
        return;
      }
      if (table.id === mergeSourceId) {
        setMergeMode(false);
        setMergeSourceId(null);
        return;
      }
      // Execute merge
      setTables(prev => prev.map(t => {
        if (t.id === mergeSourceId) {
          return {
            ...t,
            covers: t.covers + table.covers,
            amount: t.amount + table.amount,
            orders: [...t.orders, ...table.orders],
            mergedWith: [...t.mergedWith, table.number],
          };
        }
        if (t.id === table.id) {
          return { ...t, status: 'empty', covers: 0, amount: 0, orders: [], mergedWith: [] };
        }
        return t;
      }));
      setMergeMode(false);
      setMergeSourceId(null);
      return;
    }
    setSelectedTable(table);
    setDetailVisible(true);
  }, [mergeMode, mergeSourceId]);

  const handleLongPress = useCallback((table) => {
    setQuickTable(table);
    setQuickVisible(true);
  }, []);

  const handleQuickAction = useCallback((table, action) => {
    if (action === 'empty')    handleUpdateStatus(table.id, 'empty');
    if (action === 'cleaning') handleUpdateStatus(table.id, 'cleaning');
    if (action === 'bill') {
      handleUpdateStatus(table.id, 'bill_pending');
      router.push('/billing');
    }
    if (action === 'assign') {
      setSelectedTable(table);
      setDetailVisible(true);
    }
  }, [handleUpdateStatus, router]);

  const handleQRScan = useCallback((tableId, scannedOutletId) => {
    // Find the table by ID and open its detail modal
    const found = tables.find(t => t.id === tableId);
    if (found) {
      setSelectedTable(found);
      setDetailVisible(true);
    } else {
      // Table not found locally — could be from a different outlet
      Alert.alert('Table Not Found', 'This table QR belongs to a different outlet or is not yet synced.');
    }
  }, [tables]);

  // ── Merge mode cancel bar ───────────────────────────────────────────────────

  const MergeBar = () => (
    <View style={styles.mergeBar}>
      <Ionicons name="git-merge-outline" size={16} color="#0070F3" />
      <Text style={styles.mergeBarText}>
        {mergeSourceId
          ? `T-${tables.find(t => t.id === mergeSourceId)?.number} selected — tap another table to merge`
          : 'Tap a table to start merge'}
      </Text>
      <TouchableOpacity onPress={() => { setMergeMode(false); setMergeSourceId(null); }}>
        <Text style={styles.mergeBarCancel}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Summary bar ─────────────────────────────────────────────────────────────

  const SummaryBar = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.summaryContainer}
      style={styles.summaryRow}
    >
      {ALL_STATUSES.map(s => {
        const cfg = STATUS[s];
        const n = counts[s] || 0;
        if (n === 0) return null;
        return (
          <View key={s} style={[styles.summaryPill, { backgroundColor: cfg.bg }]}>
            <View style={[styles.summaryDot, { backgroundColor: cfg.color }]} />
            <Text style={[styles.summaryPillText, { color: cfg.color }]}>
              {n} {cfg.label}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );

  // ── Floor plan view ─────────────────────────────────────────────────────────

  const FloorPlanView = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0070F3" />}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.floorCanvas}>
          {/* Legend */}
          <View style={styles.floorLegend}>
            {ALL_STATUSES.map(s => {
              const cfg = STATUS[s];
              return (
                <View key={s} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: cfg.color }]} />
                  <Text style={styles.legendText}>{cfg.label}</Text>
                </View>
              );
            })}
          </View>

          {/* Table cards */}
          {tables.map(table => {
            const pos = FLOOR_POSITIONS[table.id];
            if (!pos) return null;
            return (
              <FloorTableCard
                key={table.id}
                table={table}
                position={pos}
                onPress={handleCardPress}
                onLongPress={handleLongPress}
                mergeMode={mergeMode}
                mergeSourceId={mergeSourceId}
              />
            );
          })}
        </View>
      </ScrollView>
    </ScrollView>
  );

  // ── Grid view ───────────────────────────────────────────────────────────────

  const GridView = () => (
    <ScrollView
      contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0070F3" />}
    >
      {filteredTables.length === 0 ? (
        <EmptyState icon="🪑" title="No tables found" subtitle="Try a different filter" />
      ) : (
        gridRows.map((pair, idx) => (
          <View key={idx} style={styles.gridRow}>
            {pair[0] && (
              <View style={styles.cardWrap}>
                <GridTableCard
                  table={pair[0]}
                  onPress={handleCardPress}
                  onLongPress={handleLongPress}
                  mergeMode={mergeMode}
                  mergeSourceId={mergeSourceId}
                />
              </View>
            )}
            {pair[1] ? (
              <View style={styles.cardWrap}>
                <GridTableCard
                  table={pair[1]}
                  onPress={handleCardPress}
                  onLongPress={handleLongPress}
                  mergeMode={mergeMode}
                  mergeSourceId={mergeSourceId}
                />
              </View>
            ) : (
              <View style={styles.cardWrap} />
            )}
          </View>
        ))
      )}
    </ScrollView>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7F7" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tables</Text>
        <View style={styles.headerRight}>
          {/* View toggle */}
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === 'grid' && styles.toggleBtnActive]}
              onPress={() => setViewMode('grid')}
            >
              <Ionicons name="grid-outline" size={16} color={viewMode === 'grid' ? '#fff' : '#444'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === 'floor' && styles.toggleBtnActive]}
              onPress={() => setViewMode('floor')}
            >
              <Ionicons name="map-outline" size={16} color={viewMode === 'floor' ? '#fff' : '#444'} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.iconBtn} onPress={onRefresh}>
            <Ionicons name="refresh-outline" size={20} color="#000" />
          </TouchableOpacity>

          <View style={styles.occupiedBadge}>
            <Text style={styles.occupiedBadgeText}>{occupiedCount}/{tables.length}</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <TablesSkeleton />
      ) : (
        <>
          {/* Summary bar */}
          <SummaryBar />

          {/* Merge mode banner */}
          {mergeMode && <MergeBar />}

          {/* Filter pills — only in grid mode */}
          {viewMode === 'grid' && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillsContainer}
              style={styles.pillsRow}
            >
              {FILTER_PILLS.map((pill) => {
                const active = filter === pill.key;
                const count = pill.key === 'all' ? counts.all : (counts[pill.key] ?? 0);
                return (
                  <TouchableOpacity
                    key={pill.key}
                    style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
                    onPress={() => setFilter(pill.key)}
                  >
                    <Text style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}>
                      {pill.label}
                    </Text>
                    <View style={[styles.pillCount, active ? styles.pillCountActive : styles.pillCountInactive]}>
                      <Text style={[styles.pillCountText, active && { color: '#fff' }]}>{count}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {viewMode === 'grid' ? <GridView /> : <FloorPlanView />}
        </>
      )}

      {/* Table Detail Modal */}
      <TableDetailModal
        table={selectedTable}
        visible={detailVisible}
        onClose={() => { setDetailVisible(false); setSelectedTable(null); }}
        onUpdateStatus={handleUpdateStatus}
        onUpdateCovers={handleUpdateCovers}
        onAssignWaiter={handleAssignWaiter}
        tables={tables}
        mergeMode={mergeMode}
        setMergeMode={(v) => { setMergeMode(v); if (v) setMergeSourceId(null); }}
      />

      {/* Quick Actions Sheet */}
      <QuickActionsSheet
        table={quickTable}
        visible={quickVisible}
        onClose={() => setQuickVisible(false)}
        onAction={handleQuickAction}
      />

      {/* QR Scan FAB */}
      <TouchableOpacity
        style={styles.qrFab}
        onPress={() => setShowQRScanner(true)}
      >
        <Ionicons name="qr-code-outline" size={22} color="#fff" />
      </TouchableOpacity>

      <QRScanner
        visible={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onScan={handleQRScan}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F7F7F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  occupiedBadge: {
    backgroundColor: '#EBF3FF',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  occupiedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0070F3',
  },

  // ── View toggle ─────────────────────────────────────────────────────────────
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    padding: 2,
  },
  toggleBtn: {
    width: 32,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#000000',
  },

  // ── Summary bar ─────────────────────────────────────────────────────────────
  summaryRow: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
    maxHeight: 44,
  },
  summaryContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 5,
  },
  summaryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  summaryPillText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Merge banner ─────────────────────────────────────────────────────────────
  mergeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EBF3FF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#CCE0FF',
  },
  mergeBarText: {
    flex: 1,
    fontSize: 12,
    color: '#0070F3',
    fontWeight: '500',
  },
  mergeBarCancel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EE0000',
  },

  // ── Filter pills ─────────────────────────────────────────────────────────────
  pillsRow: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
    maxHeight: 52,
  },
  pillsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 5,
  },
  pillActive: {
    backgroundColor: '#000000',
  },
  pillInactive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  pillTextInactive: {
    color: '#444444',
  },
  pillCount: {
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  pillCountActive: {
    backgroundColor: '#333333',
  },
  pillCountInactive: {
    backgroundColor: '#F0F0F0',
  },
  pillCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#888888',
  },

  // ── Grid ─────────────────────────────────────────────────────────────────────
  grid: {
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  cardWrap: {
    flex: 1,
  },

  // ── Grid card ────────────────────────────────────────────────────────────────
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    borderLeftWidth: 4,
    padding: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    minHeight: 120,
    flexDirection: 'column',
  },
  cardMergeTarget: {
    borderColor: '#0070F3',
    borderWidth: 2,
    borderLeftWidth: 4,
  },
  cardMergeSource: {
    borderColor: '#F5A623',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderLeftWidth: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  tableNum: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 3,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  capacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 6,
  },
  capacityText: {
    fontSize: 11,
    color: '#888888',
  },
  cardContent: {
    gap: 3,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cardMeta: {
    fontSize: 11,
    color: '#888888',
  },
  dot: {
    fontSize: 10,
    color: '#CCCCCC',
    marginHorizontal: 1,
  },
  amountText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.4,
    marginTop: 2,
  },
  guestName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
  centerStatus: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  centerStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  waiterCorner: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  mergedTag: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#EBF3FF',
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  mergedTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0070F3',
  },

  // ── Waiter badge ─────────────────────────────────────────────────────────────
  waiterBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  waiterBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // ── Floor plan ───────────────────────────────────────────────────────────────
  floorCanvas: {
    width: 400,
    height: 360,
    backgroundColor: '#F0F0F0',
    margin: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    position: 'relative',
  },
  floorLegend: {
    position: 'absolute',
    bottom: -44,
    left: 0,
    right: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    color: '#444444',
    fontWeight: '500',
  },
  floorCard: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  floorNum: {
    fontSize: 20,
    fontWeight: '900',
  },
  floorCovers: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  floorWaiter: {
    position: 'absolute',
    bottom: 4,
    right: 4,
  },

  // ── Modal / Sheet ────────────────────────────────────────────────────────────
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 10,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#DDDDDD',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.4,
  },
  sheetSubtitle: {
    fontSize: 11,
    color: '#888888',
    marginTop: 2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Detail grid ──────────────────────────────────────────────────────────────
  detailGrid: {
    backgroundColor: '#F7F7F7',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: '#888888',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
  },

  // ── Waiter picker ────────────────────────────────────────────────────────────
  waiterPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  waiterDropdown: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    marginBottom: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  waiterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  waiterOptionActive: {
    backgroundColor: '#EBF3FF',
  },
  waiterOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#000000',
  },

  // ── Stepper ──────────────────────────────────────────────────────────────────
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  stepBtn: {
    width: 32,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },

  // ── Status chips ─────────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Orders list ──────────────────────────────────────────────────────────────
  ordersList: {
    backgroundColor: '#F7F7F7',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 20,
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  orderName: {
    flex: 1,
    fontSize: 13,
    color: '#444444',
    marginRight: 10,
  },
  orderPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
  },
  orderTotal: {
    borderBottomWidth: 0,
    paddingTop: 10,
  },
  orderTotalLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
  },
  orderTotalValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0070F3',
  },

  // ── Action buttons ───────────────────────────────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  btnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
    minHeight: 46,
    paddingVertical: 10,
  },
  btnOutlineText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
  btnSolid: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#000000',
    borderRadius: 12,
    minHeight: 46,
    paddingVertical: 10,
  },
  btnSolidText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Quick actions sheet ───────────────────────────────────────────────────────
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 8,
  },
  quickItem: {
    width: '47%',
    alignItems: 'center',
    backgroundColor: '#F7F7F7',
    borderRadius: 16,
    paddingVertical: 18,
    gap: 8,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
  },

  // ── QR Scan FAB ───────────────────────────────────────────────────────────────
  qrFab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
});
