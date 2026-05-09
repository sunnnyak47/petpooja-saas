import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Pressable,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PressCard } from '../../src/components/PressCard';
import { EmptyState } from '../../src/components/EmptyState';

// ─── Constants ────────────────────────────────────────────────────────────────

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
};

const CATEGORIES = [
  { key: 'Gas', label: 'Gas', icon: 'flame-outline', color: '#FF6B35' },
  { key: 'Rent', label: 'Rent', icon: 'home-outline', color: '#9B59B6' },
  { key: 'Salaries', label: 'Salaries', icon: 'people-outline', color: C.indigo },
  { key: 'Groceries', label: 'Groceries', icon: 'basket-outline', color: C.success },
  { key: 'Maintenance', label: 'Maintenance', icon: 'construct-outline', color: C.gold },
  { key: 'Misc', label: 'Misc', icon: 'ellipsis-horizontal-outline', color: C.text3 },
];

const PAYMENT_METHODS = ['Cash', 'Card', 'Bank Transfer'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function catMeta(key) {
  return CATEGORIES.find(c => c.key === key) || CATEGORIES[5];
}

// ─── Mock data (May 2026) ─────────────────────────────────────────────────────

let _nextId = 100;
const MOCK_EXPENSES = [
  { id: _nextId++, category: 'Rent', description: 'Monthly shop rent', amount: 45000, date: '2026-05-01', method: 'Bank Transfer', notes: '' },
  { id: _nextId++, category: 'Salaries', description: 'Chef salaries - May', amount: 38000, date: '2026-05-01', method: 'Bank Transfer', notes: 'Two chefs' },
  { id: _nextId++, category: 'Salaries', description: 'Delivery staff wages', amount: 18000, date: '2026-05-02', method: 'Bank Transfer', notes: '' },
  { id: _nextId++, category: 'Gas', description: 'LPG cylinder refill x4', amount: 3600, date: '2026-05-03', method: 'Cash', notes: '' },
  { id: _nextId++, category: 'Groceries', description: 'Weekly vegetables & spices', amount: 4200, date: '2026-05-05', method: 'Cash', notes: '' },
  { id: _nextId++, category: 'Maintenance', description: 'AC servicing - kitchen', amount: 2500, date: '2026-05-05', method: 'Card', notes: 'Annual service' },
  { id: _nextId++, category: 'Groceries', description: 'Dairy & paneer stock', amount: 3100, date: '2026-05-06', method: 'Cash', notes: '' },
  { id: _nextId++, category: 'Misc', description: 'Packaging materials', amount: 1800, date: '2026-05-06', method: 'Card', notes: 'Zomato/Swiggy boxes' },
  { id: _nextId++, category: 'Gas', description: 'Piped gas bill', amount: 2200, date: '2026-05-07', method: 'Bank Transfer', notes: '' },
  { id: _nextId++, category: 'Groceries', description: 'Chicken & mutton stock', amount: 6500, date: '2026-05-07', method: 'Cash', notes: '' },
  { id: _nextId++, category: 'Maintenance', description: 'Grease trap cleaning', amount: 1200, date: '2026-05-07', method: 'Cash', notes: '' },
  { id: _nextId++, category: 'Misc', description: 'Staff uniform stitching', amount: 2800, date: '2026-05-04', method: 'Card', notes: '' },
  { id: _nextId++, category: 'Misc', description: 'Internet bill', amount: 999, date: '2026-05-04', method: 'Bank Transfer', notes: '' },
  { id: _nextId++, category: 'Groceries', description: 'Cooking oil bulk order', amount: 4800, date: '2026-05-03', method: 'Cash', notes: '' },
];

const MOCK_BUDGET = 140000;
const MOCK_REVENUE = 210000;

// ─── 7-day bar chart data (last 7 days) ──────────────────────────────────────

const DAILY_DATA = [
  { day: '1', amount: 83000 },
  { day: '2', amount: 18000 },
  { day: '3', amount: 7800 },
  { day: '4', amount: 3799 },
  { day: '5', amount: 7300 },
  { day: '6', amount: 5600 },
  { day: '7', amount: 5700 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByDate(expenses) {
  const today = '2026-05-07';
  const yesterday = '2026-05-06';
  const groups = {};
  expenses.forEach(e => {
    let label;
    if (e.date === today) label = 'Today';
    else if (e.date === yesterday) label = 'Yesterday';
    else label = 'Earlier this month';
    if (!groups[label]) groups[label] = [];
    groups[label].push(e);
  });
  const order = ['Today', 'Yesterday', 'Earlier this month'];
  return order.filter(k => groups[k]).map(k => ({ label: k, items: groups[k] }));
}

// ─── Mini bar chart ───────────────────────────────────────────────────────────

function MiniBarChart({ data }) {
  const max = Math.max(...data.map(d => d.amount), 1);
  return (
    <View style={barStyles.wrap}>
      {data.map((d, i) => {
        const pct = d.amount / max;
        return (
          <View key={i} style={barStyles.colWrap}>
            <View style={barStyles.track}>
              <View style={[barStyles.bar, { height: `${Math.max(pct * 100, 4)}%`, backgroundColor: pct > 0.6 ? C.error + 'CC' : C.indigo + 'CC' }]} />
            </View>
            <Text style={barStyles.dayLabel}>{d.day}</Text>
          </View>
        );
      })}
    </View>
  );
}

const barStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 60 },
  colWrap: { flex: 1, alignItems: 'center', gap: 4 },
  track: { flex: 1, width: '100%', justifyContent: 'flex-end', backgroundColor: C.border, borderRadius: 4, overflow: 'hidden' },
  bar: { width: '100%', borderRadius: 4 },
  dayLabel: { fontSize: 9, color: C.text3, textAlign: 'center' },
});

// ─── Add Expense Modal ────────────────────────────────────────────────────────

function AddExpenseModal({ visible, onClose, onSave }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Groceries');
  const [date, setDate] = useState('2026-05-07');
  const [method, setMethod] = useState('Cash');
  const [notes, setNotes] = useState('');

  function handleSave() {
    if (!amount || !description) return;
    onSave({ amount: parseFloat(amount), description, category, date, method, notes });
    setAmount('');
    setDescription('');
    setCategory('Groceries');
    setDate('2026-05-07');
    setMethod('Cash');
    setNotes('');
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={modalStyles.overlay} onPress={onClose}>
          <Pressable style={modalStyles.sheet} onPress={e => e.stopPropagation()}>
            <View style={modalStyles.handle} />
            <Text style={modalStyles.title}>Add Expense</Text>

            {/* Amount */}
            <Text style={modalStyles.label}>Amount (₹)</Text>
            <View style={modalStyles.inputWrap}>
              <Text style={modalStyles.rupeePrefix}>₹</Text>
              <TextInput
                style={modalStyles.input}
                keyboardType="numeric"
                placeholder="0"
                value={amount}
                onChangeText={setAmount}
                placeholderTextColor={C.text3}
              />
            </View>

            {/* Description */}
            <Text style={modalStyles.label}>Description</Text>
            <TextInput
              style={[modalStyles.input, modalStyles.inputFull]}
              placeholder="e.g. Vegetable purchase"
              value={description}
              onChangeText={setDescription}
              placeholderTextColor={C.text3}
            />

            {/* Category */}
            <Text style={modalStyles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[
                      modalStyles.catPill,
                      { borderColor: cat.color },
                      category === cat.key && { backgroundColor: cat.color },
                    ]}
                    onPress={() => setCategory(cat.key)}
                  >
                    <Text style={[modalStyles.catPillText, { color: category === cat.key ? '#fff' : cat.color }]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Date */}
            <Text style={modalStyles.label}>Date</Text>
            <TextInput
              style={[modalStyles.input, modalStyles.inputFull]}
              placeholder="YYYY-MM-DD"
              value={date}
              onChangeText={setDate}
              placeholderTextColor={C.text3}
            />

            {/* Payment method */}
            <Text style={modalStyles.label}>Payment Method</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {PAYMENT_METHODS.map(m => (
                <TouchableOpacity
                  key={m}
                  style={[
                    modalStyles.methodPill,
                    method === m && modalStyles.methodPillActive,
                  ]}
                  onPress={() => setMethod(m)}
                >
                  <Text style={[modalStyles.methodText, method === m && modalStyles.methodTextActive]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Notes */}
            <Text style={modalStyles.label}>Notes (optional)</Text>
            <TextInput
              style={[modalStyles.input, modalStyles.inputFull, { height: 60 }]}
              placeholder="Any additional notes..."
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholderTextColor={C.text3}
            />

            <TouchableOpacity
              style={[modalStyles.saveBtn, (!amount || !description) && modalStyles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!amount || !description}
            >
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={modalStyles.saveBtnText}>Save Expense</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text1,
    marginBottom: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: C.text3,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  rupeePrefix: {
    fontSize: 16,
    color: C.text2,
    marginRight: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: C.text1,
    paddingVertical: 12,
  },
  inputFull: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    color: C.text1,
  },
  catPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  catPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  methodPill: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  methodPillActive: {
    backgroundColor: C.indigo,
    borderColor: C.indigo,
  },
  methodText: {
    fontSize: 13,
    color: C.text2,
    fontWeight: '600',
  },
  methodTextActive: {
    color: '#fff',
  },
  saveBtn: {
    backgroundColor: C.indigo,
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  saveBtnDisabled: {
    backgroundColor: C.border,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});

// ─── Expense Row ──────────────────────────────────────────────────────────────

function ExpenseRow({ expense, onDelete }) {
  const [swiped, setSwiped] = useState(false);
  const cm = catMeta(expense.category);

  const methodIcon = {
    'Cash': 'cash-outline',
    'Card': 'card-outline',
    'Bank Transfer': 'swap-horizontal-outline',
  }[expense.method] || 'wallet-outline';

  return (
    <View style={expStyles.rowWrap}>
      <PressCard
        style={expStyles.row}
        onPress={() => setSwiped(s => !s)}
        scaleDown={0.98}
      >
        <View style={[expStyles.iconCircle, { backgroundColor: cm.color + '18' }]}>
          <Ionicons name={cm.icon} size={20} color={cm.color} />
        </View>
        <View style={expStyles.rowInfo}>
          <View style={expStyles.rowTop}>
            <Text style={expStyles.desc} numberOfLines={1}>{expense.description}</Text>
            <Text style={expStyles.amount}>₹{expense.amount.toLocaleString()}</Text>
          </View>
          <View style={expStyles.rowBottom}>
            <View style={[expStyles.catBadge, { backgroundColor: cm.color + '18' }]}>
              <Text style={[expStyles.catBadgeText, { color: cm.color }]}>{expense.category}</Text>
            </View>
            <View style={expStyles.methodChip}>
              <Ionicons name={methodIcon} size={11} color={C.text3} />
              <Text style={expStyles.methodChipText}>{expense.method}</Text>
            </View>
          </View>
        </View>
      </PressCard>
      {swiped && (
        <TouchableOpacity style={expStyles.deleteBtn} onPress={() => onDelete(expense.id)}>
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={expStyles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const expStyles = StyleSheet.create({
  rowWrap: {
    flexDirection: 'row',
    marginBottom: 8,
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  desc: { fontSize: 13, fontWeight: '600', color: C.text1, flex: 1, marginRight: 8 },
  amount: { fontSize: 14, fontWeight: '700', color: C.text1 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  catBadgeText: { fontSize: 10, fontWeight: '700' },
  methodChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  methodChipText: { fontSize: 10, color: C.text3 },
  deleteBtn: {
    backgroundColor: C.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 4,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
  },
  deleteBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const [expenses, setExpenses] = useState(MOCK_EXPENSES);
  const [budget, setBudget] = useState(MOCK_BUDGET);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(MOCK_BUDGET));
  const [monthIndex, setMonthIndex] = useState(4); // May (0-indexed)
  const [year, setYear] = useState(2026);
  const [showAddModal, setShowAddModal] = useState(false);

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const budgetPct = total / budget;
  const overBudget = total > budget;

  function prevMonth() {
    if (monthIndex === 0) { setMonthIndex(11); setYear(y => y - 1); }
    else setMonthIndex(m => m - 1);
  }
  function nextMonth() {
    if (monthIndex === 11) { setMonthIndex(0); setYear(y => y + 1); }
    else setMonthIndex(m => m + 1);
  }

  function handleDeleteExpense(id) {
    setExpenses(prev => prev.filter(e => e.id !== id));
  }

  function handleAddExpense(exp) {
    setExpenses(prev => [{ id: _nextId++, ...exp }, ...prev]);
    setShowAddModal(false);
  }

  function saveBudget() {
    const val = parseFloat(budgetInput);
    if (!isNaN(val) && val > 0) setBudget(val);
    setEditingBudget(false);
  }

  const groups = groupByDate(expenses);

  // Category totals
  const catTotals = CATEGORIES.map(cat => ({
    ...cat,
    total: expenses.filter(e => e.category === cat.key).reduce((s, e) => s + e.amount, 0),
  }));

  // P&L bar widths
  const maxBar = Math.max(total, MOCK_REVENUE);
  const revPct = MOCK_REVENUE / maxBar;
  const expPct = total / maxBar;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Expenses</Text>
        <View style={styles.monthSelector}>
          <TouchableOpacity onPress={prevMonth} style={styles.monthArrow}>
            <Ionicons name="chevron-back" size={18} color={C.text2} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{MONTHS[monthIndex]} {year}</Text>
          <TouchableOpacity onPress={nextMonth} style={styles.monthArrow}>
            <Ionicons name="chevron-forward" size={18} color={C.text2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Budget alert banner */}
      {budgetPct >= 0.8 && (
        <View style={[styles.alertBanner, overBudget && styles.alertBannerRed]}>
          <Ionicons name={overBudget ? 'alert-circle' : 'warning-outline'} size={16} color={overBudget ? C.error : C.gold} />
          <Text style={[styles.alertText, overBudget && styles.alertTextRed]}>
            {overBudget
              ? `Over budget by ₹${(total - budget).toLocaleString()}`
              : `${Math.round(budgetPct * 100)}% of budget used — spend carefully`}
          </Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { flex: 1.3 }]}>
            <View style={[styles.sumIcon, { backgroundColor: '#FFF0F0' }]}>
              <Ionicons name="trending-down-outline" size={16} color={C.error} />
            </View>
            <Text style={styles.sumValue}>₹{total.toLocaleString()}</Text>
            <Text style={styles.sumLabel}>Total Expenses</Text>
          </View>

          <View style={[styles.summaryCard, { flex: 1.2, marginHorizontal: 10 }]}>
            {editingBudget ? (
              <>
                <TextInput
                  style={styles.budgetInput}
                  keyboardType="numeric"
                  value={budgetInput}
                  onChangeText={setBudgetInput}
                  autoFocus
                  onBlur={saveBudget}
                  onSubmitEditing={saveBudget}
                />
                <Text style={styles.sumLabel}>Budget</Text>
              </>
            ) : (
              <TouchableOpacity onPress={() => { setEditingBudget(true); setBudgetInput(String(budget)); }}>
                <View style={[styles.sumIcon, { backgroundColor: '#EBF4FF', alignSelf: 'center' }]}>
                  <Ionicons name="create-outline" size={16} color={C.indigo} />
                </View>
                <Text style={styles.sumValue}>₹{budget.toLocaleString()}</Text>
                <Text style={styles.sumLabel}>Budget (tap to edit)</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.summaryCard, { flex: 1 }]}>
            <View style={[styles.sumIcon, { backgroundColor: overBudget ? '#FFF0F0' : '#EDFBF3' }]}>
              <Ionicons
                name={overBudget ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'}
                size={16}
                color={overBudget ? C.error : C.success}
              />
            </View>
            <Text style={[styles.sumValue, { color: overBudget ? C.error : C.success }]}>
              {overBudget ? '-' : '+'}₹{Math.abs(budget - total).toLocaleString()}
            </Text>
            <Text style={styles.sumLabel}>{overBudget ? 'Over budget' : 'Under budget'}</Text>
          </View>
        </View>

        {/* P&L mini view */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Revenue vs Expenses</Text>
          <View style={styles.plRow}>
            <Text style={styles.plLabel}>Revenue</Text>
            <View style={styles.plTrack}>
              <View style={[styles.plBar, { width: `${revPct * 100}%`, backgroundColor: C.success }]} />
            </View>
            <Text style={styles.plAmount}>₹{MOCK_REVENUE.toLocaleString()}</Text>
          </View>
          <View style={styles.plRow}>
            <Text style={styles.plLabel}>Expenses</Text>
            <View style={styles.plTrack}>
              <View style={[styles.plBar, { width: `${expPct * 100}%`, backgroundColor: overBudget ? C.error : C.gold }]} />
            </View>
            <Text style={styles.plAmount}>₹{total.toLocaleString()}</Text>
          </View>
          <View style={styles.plDivider} />
          <View style={styles.plRow}>
            <Text style={[styles.plLabel, { fontWeight: '700', color: C.text1 }]}>Net Profit</Text>
            <View style={{ flex: 1 }} />
            <Text style={[styles.plAmount, { fontWeight: '700', color: MOCK_REVENUE > total ? C.success : C.error }]}>
              ₹{Math.abs(MOCK_REVENUE - total).toLocaleString()} {MOCK_REVENUE > total ? '▲' : '▼'}
            </Text>
          </View>
        </View>

        {/* Category pills */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>By Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {catTotals.filter(c => c.total > 0).map(cat => (
                <View key={cat.key} style={[styles.catPill, { backgroundColor: cat.color + '18', borderColor: cat.color + '40' }]}>
                  <Ionicons name={cat.icon} size={14} color={cat.color} />
                  <Text style={[styles.catPillLabel, { color: cat.color }]}>{cat.label}</Text>
                  <Text style={[styles.catPillAmt, { color: cat.color }]}>₹{cat.total.toLocaleString()}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* 7-day trend */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>7-Day Trend (May 1–7)</Text>
          <MiniBarChart data={DAILY_DATA} />
          <Text style={styles.chartNote}>Higher bars = more spending that day</Text>
        </View>

        {/* Expense list */}
        {groups.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="No expenses yet"
            subtitle="Tap + to log your first expense for the month"
          />
        ) : (
          groups.map(group => (
            <View key={group.label} style={styles.group}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              {group.items.map(exp => (
                <ExpenseRow key={exp.id} expense={exp} onDelete={handleDeleteExpense} />
              ))}
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        onPress={() => setShowAddModal(true)}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <AddExpenseModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleAddExpense}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text1,
    flex: 1,
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  monthArrow: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: C.bg,
  },
  monthLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text2,
    minWidth: 110,
    textAlign: 'center',
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF8EB',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5A62330',
  },
  alertBannerRed: {
    backgroundColor: '#FFF0F0',
    borderBottomColor: '#EE000030',
  },
  alertText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.gold,
    flex: 1,
  },
  alertTextRed: {
    color: C.error,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  summaryCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  sumIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  sumValue: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text1,
    textAlign: 'center',
  },
  sumLabel: {
    fontSize: 9,
    color: C.text3,
    marginTop: 2,
    textAlign: 'center',
  },
  budgetInput: {
    fontSize: 15,
    fontWeight: '700',
    color: C.indigo,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.indigo,
    paddingVertical: 2,
    marginBottom: 4,
    width: 80,
    alignSelf: 'center',
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text1,
    marginBottom: 14,
  },
  plRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  plLabel: {
    width: 66,
    fontSize: 12,
    color: C.text2,
  },
  plTrack: {
    flex: 1,
    height: 10,
    backgroundColor: C.border,
    borderRadius: 999,
    overflow: 'hidden',
  },
  plBar: {
    height: 10,
    borderRadius: 999,
  },
  plAmount: {
    width: 72,
    fontSize: 12,
    fontWeight: '600',
    color: C.text1,
    textAlign: 'right',
  },
  plDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 6,
  },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  catPillLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  catPillAmt: {
    fontSize: 12,
    fontWeight: '700',
  },
  chartNote: {
    fontSize: 10,
    color: C.text3,
    marginTop: 8,
    textAlign: 'center',
  },
  group: {
    marginBottom: 10,
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
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
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
