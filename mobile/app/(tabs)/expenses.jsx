import React, { useState, useCallback, useEffect } from 'react';
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
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PressCard } from '../../src/components/PressCard';
import { EmptyState } from '../../src/components/EmptyState';
import SkeletonBox from '../../src/components/SkeletonBox';
import { useExpenses, useCreateExpense, useDeleteExpense } from '../../src/hooks/useApi';
import { useOutlet } from '../../src/context/OutletContext';
import { useCurrency } from '../../src/hooks/useCurrency';

// ─── Constants ────────────────────────────────────────────────────────────────

const C = {
  bg: '#F7F7F7',
  surface: '#FFFFFF',
  border: '#EAEAEA',
  text1: '#0f172a',
  text2: '#444444',
  text3: '#888888',
  gold: '#F5A623',
  indigo: '#2563eb',
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByDate(expenses) {
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
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

function buildDailyData(expenses, month, year) {
  const daysInMonth = new Date(year, month, 0).getDate();
  // Show last 7 days of the month (or all days if fewer than 7)
  const days = Array.from({ length: Math.min(7, daysInMonth) }, (_, i) => {
    const day = daysInMonth - 6 + i;
    return { day: String(Math.max(day, 1)), amount: 0 };
  });
  expenses.forEach(e => {
    const d = parseInt((e.date || '').slice(8, 10), 10);
    const idx = days.findIndex(x => parseInt(x.day, 10) === d);
    if (idx !== -1) days[idx].amount += e.amount;
  });
  return days;
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
  const { symbol } = useCurrency();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Groceries');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('Cash');
  const [notes, setNotes] = useState('');

  function handleSave() {
    if (!amount || !description) return;
    onSave({ amount: parseFloat(amount), description, category, date, method, notes });
    setAmount('');
    setDescription('');
    setCategory('Groceries');
    setDate(new Date().toISOString().slice(0, 10));
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
            <Text style={modalStyles.label}>Amount ({symbol})</Text>
            <View style={modalStyles.inputWrap}>
              <Text style={modalStyles.rupeePrefix}>{symbol}</Text>
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
  const { symbol } = useCurrency();
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
            <Text style={expStyles.amount}>{symbol}{expense.amount.toLocaleString()}</Text>
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
  const { outletId } = useOutlet();
  const { symbol } = useCurrency();

  // Month navigation — start at current month
  const now = new Date();
  const [monthIndex, setMonthIndex] = useState(now.getMonth()); // 0-indexed
  const [year,       setYear]       = useState(now.getFullYear());

  // Local budget (editable, not persisted)
  const [budget,        setBudget]        = useState(140000);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput,   setBudgetInput]   = useState('140000');
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);

  // API
  const { data, isLoading, refetch } = useExpenses({
    outlet_id: outletId,
    month:     monthIndex + 1,  // API expects 1-indexed
    year,
  });
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();

  // Local optimistic state — seeded from API, overridden for instant feedback
  const [localExpenses, setLocalExpenses] = useState(null);
  useEffect(() => {
    setLocalExpenses(null); // reset when month changes so API data shows
  }, [monthIndex, year]);

  const expenses     = localExpenses ?? (data?.items ?? []);
  const total        = data?.total_amount ?? expenses.reduce((s, e) => s + e.amount, 0);
  const budgetPct    = total / budget;
  const overBudget   = total > budget;

  // Month navigation
  function prevMonth() {
    if (monthIndex === 0) { setMonthIndex(11); setYear(y => y - 1); }
    else setMonthIndex(m => m - 1);
  }
  function nextMonth() {
    if (monthIndex === 11) { setMonthIndex(0); setYear(y => y + 1); }
    else setMonthIndex(m => m + 1);
  }

  // Delete — optimistic
  function handleDeleteExpense(id) {
    setLocalExpenses(prev => (prev ?? expenses).filter(e => e.id !== id));
    deleteExpense.mutate(id);
  }

  // Create — calls API then invalidates
  async function handleAddExpense(exp) {
    try {
      await createExpense.mutateAsync({
        outlet_id:      outletId,
        title:          exp.description,   // screen field → API field
        amount:         exp.amount,
        category:       exp.category,
        expense_date:   exp.date,
        payment_method: exp.method,
        notes:          exp.notes,
      });
      setLocalExpenses(null); // let React Query refresh
    } catch (_) {
      // optimistic fallback: add to local list so it shows immediately
      setLocalExpenses(prev => [
        { id: `tmp_${Date.now()}`, ...exp },
        ...(prev ?? expenses),
      ]);
    }
    setShowAddModal(false);
  }

  function saveBudget() {
    const val = parseFloat(budgetInput);
    if (!isNaN(val) && val > 0) setBudget(val);
    setEditingBudget(false);
  }

  const onRefresh = async () => {
    setRefreshing(true);
    setLocalExpenses(null);
    await refetch();
    setRefreshing(false);
  };

  const groups = groupByDate(expenses);

  // Category totals
  const catTotals = CATEGORIES.map(cat => ({
    ...cat,
    total: expenses.filter(e => e.category === cat.key).reduce((s, e) => s + e.amount, 0),
  }));

  // Daily chart
  const dailyData = buildDailyData(expenses, monthIndex + 1, year);

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
              ? `Over budget by ${symbol}${(total - budget).toLocaleString()}`
              : `${Math.round(budgetPct * 100)}% of budget used — spend carefully`}
          </Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.indigo} />}
      >

        {/* Loading skeleton */}
        {isLoading && !localExpenses && (
          <View style={{ gap: 10, marginBottom: 14 }}>
            <SkeletonBox width="100%" height={90} borderRadius={16} />
            <SkeletonBox width="100%" height={60} borderRadius={16} />
            <SkeletonBox width="100%" height={56} borderRadius={14} />
            <SkeletonBox width="100%" height={56} borderRadius={14} />
            <SkeletonBox width="100%" height={56} borderRadius={14} />
          </View>
        )}

        {/* Summary cards */}
        {!isLoading && (
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { flex: 1.3 }]}>
              <View style={[styles.sumIcon, { backgroundColor: '#FFF0F0' }]}>
                <Ionicons name="trending-down-outline" size={16} color={C.error} />
              </View>
              <Text style={styles.sumValue}>{symbol}{total.toLocaleString()}</Text>
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
                  <Text style={styles.sumValue}>{symbol}{budget.toLocaleString()}</Text>
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
                {overBudget ? '-' : '+'}{symbol}{Math.abs(budget - total).toLocaleString()}
              </Text>
              <Text style={styles.sumLabel}>{overBudget ? 'Over budget' : 'Under budget'}</Text>
            </View>
          </View>
        )}

        {/* Category pills */}
        {!isLoading && catTotals.some(c => c.total > 0) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>By Category</Text>
            <ScrollView horizontal
        style={{ flexGrow: 0, flexShrink: 0 }} showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {catTotals.filter(c => c.total > 0).map(cat => (
                  <View key={cat.key} style={[styles.catPill, { backgroundColor: cat.color + '18', borderColor: cat.color + '40' }]}>
                    <Ionicons name={cat.icon} size={14} color={cat.color} />
                    <Text style={[styles.catPillLabel, { color: cat.color }]}>{cat.label}</Text>
                    <Text style={[styles.catPillAmt, { color: cat.color }]}>{symbol}{cat.total.toLocaleString()}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* 7-day trend */}
        {!isLoading && dailyData.some(d => d.amount > 0) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>7-Day Trend (last 7 days of month)</Text>
            <MiniBarChart data={dailyData} />
            <Text style={styles.chartNote}>Higher bars = more spending that day</Text>
          </View>
        )}

        {/* Expense list */}
        {!isLoading && (
          groups.length === 0 ? (
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
          )
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
