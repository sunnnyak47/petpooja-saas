/**
 * Offers & Discounts Screen
 * Expo 54 · RN 0.81 · Reanimated 4 · JSX
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Modal,
  TextInput,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import PressCard from '../../src/components/PressCard';
import SkeletonBox from '../../src/components/SkeletonBox';
import EmptyState from '../../src/components/EmptyState';
import { useDiscounts, useCreateDiscount, useUpdateDiscount, useDeleteDiscount } from '../../src/hooks/useApi';
import { useOutlet } from '../../src/context/OutletContext';
import { useCurrency } from '../../src/hooks/useCurrency';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Type Maps ────────────────────────────────────────────────────────────────

// Keyed off the backend discount `type` enum: percentage | flat | bogo | buy_x_get_y
// (see backend/src/modules/discounts/discount.validation.js). Legacy display-string
// keys are kept only for optimistic/local cards created before the server round-trips.
const TYPE_COLORS = {
  percentage: '#2563eb',
  flat: '#16a34a',
  bogo: '#2563eb',
  buy_x_get_y: '#d97706',
  // legacy display strings
  'Happy Hour': '#d97706',
  'Combo': '#2563eb',
  'Coupon': '#2563eb',
  'Flat Discount': '#16a34a',
};

const TYPE_ICONS = {
  percentage: 'pricetag-outline',
  flat: 'cash-outline',
  bogo: 'gift-outline',
  buy_x_get_y: 'gift-outline',
  // legacy display strings
  'Happy Hour': 'beer-outline',
  'Combo': 'grid-outline',
  'Coupon': 'pricetag-outline',
  'Flat Discount': 'cash-outline',
};

const TYPE_LABELS = {
  percentage: 'Percentage',
  flat: 'Flat',
  bogo: 'BOGO',
  buy_x_get_y: 'Buy X Get Y',
};

const FILTERS = ['All', 'Active', 'Scheduled', 'Expired'];

// ─── Create Offer Modal ───────────────────────────────────────────────────────

const OFFER_TYPES = ['Happy Hour', 'Combo', 'Coupon', 'Flat Discount'];
const APPLY_ON = ['All', 'Dine-in', 'Takeaway', 'Delivery'];

function CreateOfferModal({ visible, onClose, onCreate }) {
  const { symbol } = useCurrency();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    offerType: '',
    name: '',
    discountType: 'percent',
    discountValue: '',
    minOrder: '',
    couponCode: '',
    dateFrom: '',
    dateTo: '',
    timeFrom: '',
    timeTo: '',
    usageLimit: '',
    appliedOn: 'All',
  });

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const generateCode = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    update('couponCode', code);
  };

  const handleCreate = () => {
    if (!form.offerType || !form.name || !form.discountValue) return;
    onCreate({
      id: String(Date.now()),
      name: form.name,
      type: form.offerType,
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      timeRange: form.timeFrom && form.timeTo ? `${form.timeFrom} – ${form.timeTo}` : 'All Day',
      dateRange: form.dateFrom && form.dateTo ? `${form.dateFrom} – ${form.dateTo}` : 'Ongoing',
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      usageCount: 0,
      active: true,
      appliedOn: form.appliedOn,
      conditions: form.minOrder ? `Min order ${symbol}${form.minOrder}` : '',
      items: ['All Menu'],
      redemptionHistory: [],
    });
    setForm({
      offerType: '', name: '', discountType: 'percent', discountValue: '',
      minOrder: '', couponCode: '', dateFrom: '', dateTo: '',
      timeFrom: '', timeTo: '', usageLimit: '', appliedOn: 'All',
    });
    setStep(1);
    onClose();
  };

  const stepTitles = ['Offer Type', 'Discount Details', 'Validity', 'Applicable On'];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Create Offer</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#0f172a" />
            </TouchableOpacity>
          </View>

          {/* Step Indicators */}
          <View style={styles.stepRow}>
            {[1, 2, 3, 4].map(s => (
              <View key={s} style={styles.stepIndicatorWrap}>
                <View style={[styles.stepDot, step >= s && styles.stepDotActive]}>
                  <Text style={[styles.stepDotText, step >= s && styles.stepDotTextActive]}>
                    {s}
                  </Text>
                </View>
                {s < 4 && <View style={[styles.stepLine, step > s && styles.stepLineActive]} />}
              </View>
            ))}
          </View>
          <Text style={styles.stepLabel}>Step {step}: {stepTitles[step - 1]}</Text>

          <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 16 }}>
            {/* Step 1: Type Selection */}
            {step === 1 && (
              <View>
                <Text style={styles.fieldLabel}>Select Offer Type</Text>
                <View style={styles.typeGrid}>
                  {OFFER_TYPES.map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeCard, form.offerType === t && styles.typeCardSelected]}
                      onPress={() => update('offerType', t)}>
                      <Ionicons
                        name={TYPE_ICONS[t] || 'pricetag-outline'}
                        size={24}
                        color={form.offerType === t ? '#fff' : (TYPE_COLORS[t] || '#475569')}
                      />
                      <Text style={[styles.typeCardText, form.offerType === t && styles.typeCardTextSelected]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>Offer Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Happy Hour Special"
                  placeholderTextColor="#94a3b8"
                  value={form.name}
                  onChangeText={v => update('name', v)}
                />
                {form.offerType === 'Coupon' && (
                  <>
                    <Text style={styles.fieldLabel}>Coupon Code</Text>
                    <View style={styles.couponRow}>
                      <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                        placeholder="e.g. SUMMER30"
                        placeholderTextColor="#94a3b8"
                        value={form.couponCode}
                        onChangeText={v => update('couponCode', v.toUpperCase())}
                        autoCapitalize="characters"
                      />
                      <TouchableOpacity style={styles.genBtn} onPress={generateCode}>
                        <Text style={styles.genBtnText}>Auto</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* Step 2: Discount Details */}
            {step === 2 && (
              <View>
                <Text style={styles.fieldLabel}>Discount Type</Text>
                <View style={styles.pillRow}>
                  {['percent', 'flat'].map(dt => (
                    <TouchableOpacity
                      key={dt}
                      style={[styles.pill, form.discountType === dt && styles.pillActive]}
                      onPress={() => update('discountType', dt)}>
                      <Text style={[styles.pillText, form.discountType === dt && styles.pillTextActive]}>
                        {dt === 'percent' ? '% Percentage' : `${symbol} Flat Amount`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>
                  {form.discountType === 'percent' ? 'Discount (%)' : `Discount Amount (${symbol})`}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={form.discountType === 'percent' ? '20' : '100'}
                  placeholderTextColor="#94a3b8"
                  value={form.discountValue}
                  onChangeText={v => update('discountValue', v)}
                  keyboardType="numeric"
                />
                <Text style={styles.fieldLabel}>Minimum Order Value ({symbol})</Text>
                <TextInput
                  style={styles.input}
                  placeholder="300 (optional)"
                  placeholderTextColor="#94a3b8"
                  value={form.minOrder}
                  onChangeText={v => update('minOrder', v)}
                  keyboardType="numeric"
                />
              </View>
            )}

            {/* Step 3: Validity */}
            {step === 3 && (
              <View>
                <Text style={styles.fieldLabel}>Date Range</Text>
                <View style={styles.rowInputs}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="From: 01 May 2026"
                    placeholderTextColor="#94a3b8"
                    value={form.dateFrom}
                    onChangeText={v => update('dateFrom', v)}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="To: 31 May 2026"
                    placeholderTextColor="#94a3b8"
                    value={form.dateTo}
                    onChangeText={v => update('dateTo', v)}
                  />
                </View>
                <Text style={styles.fieldLabel}>Time Range (optional)</Text>
                <View style={styles.rowInputs}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="From: 3:00 PM"
                    placeholderTextColor="#94a3b8"
                    value={form.timeFrom}
                    onChangeText={v => update('timeFrom', v)}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="To: 6:00 PM"
                    placeholderTextColor="#94a3b8"
                    value={form.timeTo}
                    onChangeText={v => update('timeTo', v)}
                  />
                </View>
                <Text style={styles.fieldLabel}>Usage Limit (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 100 (leave blank for unlimited)"
                  placeholderTextColor="#94a3b8"
                  value={form.usageLimit}
                  onChangeText={v => update('usageLimit', v)}
                  keyboardType="numeric"
                />
              </View>
            )}

            {/* Step 4: Applicable On */}
            {step === 4 && (
              <View>
                <Text style={styles.fieldLabel}>Apply Offer On</Text>
                <View style={styles.pillRow}>
                  {APPLY_ON.map(ao => (
                    <TouchableOpacity
                      key={ao}
                      style={[styles.pill, form.appliedOn === ao && styles.pillActive]}
                      onPress={() => update('appliedOn', ao)}>
                      <Text style={[styles.pillText, form.appliedOn === ao && styles.pillTextActive]}>{ao}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryBoxTitle}>Preview</Text>
                  <Text style={styles.summaryBoxRow}>
                    <Text style={styles.summaryKey}>Name: </Text>
                    <Text style={styles.summaryVal}>{form.name || '—'}</Text>
                  </Text>
                  <Text style={styles.summaryBoxRow}>
                    <Text style={styles.summaryKey}>Type: </Text>
                    <Text style={styles.summaryVal}>{form.offerType || '—'}</Text>
                  </Text>
                  <Text style={styles.summaryBoxRow}>
                    <Text style={styles.summaryKey}>Discount: </Text>
                    <Text style={styles.summaryVal}>
                      {form.discountValue
                        ? form.discountType === 'percent'
                          ? `${form.discountValue}% OFF`
                          : `${symbol}${form.discountValue} OFF`
                        : '—'}
                    </Text>
                  </Text>
                  <Text style={styles.summaryBoxRow}>
                    <Text style={styles.summaryKey}>Valid: </Text>
                    <Text style={styles.summaryVal}>{form.dateFrom || 'Ongoing'}</Text>
                  </Text>
                  <Text style={styles.summaryBoxRow}>
                    <Text style={styles.summaryKey}>Applied On: </Text>
                    <Text style={styles.summaryVal}>{form.appliedOn}</Text>
                  </Text>
                </View>
              </View>
            )}

            <View style={{ height: 16 }} />
          </ScrollView>

          {/* Step Navigation */}
          <View style={styles.sheetFooter}>
            {step > 1 && (
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(s => s - 1)}>
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
            )}
            {step < 4 ? (
              <TouchableOpacity
                style={[styles.nextBtn, step === 1 && !form.offerType && styles.nextBtnDisabled]}
                onPress={() => setStep(s => s + 1)}
                disabled={step === 1 && !form.offerType}>
                <Text style={styles.nextBtnText}>Next</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
                <Ionicons name="checkmark" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.createBtnText}>Create Offer</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Offer Card ───────────────────────────────────────────────────────────────

function OfferCard({ offer, onToggle, expanded, onExpand }) {
  const { symbol } = useCurrency();
  const typeColor = TYPE_COLORS[offer.type] || '#475569';
  // Support both normalized API shape (type + value) and legacy UI shape (discountType + discountValue)
  const discountLabel = (() => {
    const val = offer.value ?? offer.discountValue ?? 0;
    // Backend `type` enum: percentage | flat | bogo | buy_x_get_y
    if (offer.type === 'flat' || offer.discountType === 'flat') {
      return `${symbol}${val} OFF`;
    }
    if (offer.type === 'bogo' || offer.type === 'buy_x_get_y') {
      return 'Buy 1 Get 1';
    }
    return `${val}% OFF`;
  })();
  const usageCount = offer.usageCount ?? offer.usage_count ?? 0;
  const usageLimit = offer.usageLimit ?? offer.max_uses ?? null;
  const usagePct = usageLimit ? (usageCount / usageLimit) * 100 : null;
  const isActive = offer.is_active ?? offer.active ?? true;

  // Build display strings from normalized API fields
  const timeRange = offer.timeRange
    ?? (offer.start_time && offer.end_time ? `${offer.start_time} – ${offer.end_time}` : 'All Day');
  const dateRange = offer.dateRange
    ?? (offer.start_date && offer.end_date ? `${offer.start_date} – ${offer.end_date}` : 'Ongoing');
  const appliedOn = offer.appliedOn ?? 'All';
  const conditions = offer.conditions ?? (offer.min_order_value ? `Min order ${symbol}${offer.min_order_value}` : '');
  const items = offer.items ?? ['All Menu'];
  const redemptionHistory = offer.redemptionHistory ?? [];

  return (
    <View style={styles.offerCard}>
      <TouchableOpacity activeOpacity={0.9} onPress={onExpand}>
        <View style={styles.offerTop}>
          <View style={[styles.typeBadge, { backgroundColor: typeColor + '18' }]}>
            <Ionicons name={TYPE_ICONS[offer.type] || 'pricetag-outline'} size={13} color={typeColor} />
            <Text style={[styles.typeBadgeText, { color: typeColor }]}>{TYPE_LABELS[offer.type] ?? offer.type}</Text>
          </View>
          <Switch
            value={isActive}
            onValueChange={() => onToggle(offer.id)}
            trackColor={{ false: '#e2e8f0', true: '#2563eb20' }}
            thumbColor={isActive ? '#2563eb' : '#fff'}
            style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
          />
        </View>

        <Text style={styles.offerName}>{offer.name}</Text>
        <Text style={styles.offerDiscount}>{discountLabel}</Text>

        <View style={styles.offerMeta}>
          <View style={styles.offerMetaItem}>
            <Ionicons name="time-outline" size={13} color="#94a3b8" />
            <Text style={styles.offerMetaText}>{timeRange}</Text>
          </View>
          <View style={styles.offerMetaItem}>
            <Ionicons name="calendar-outline" size={13} color="#94a3b8" />
            <Text style={styles.offerMetaText}>{dateRange}</Text>
          </View>
        </View>

        <View style={styles.offerBottom}>
          <View style={styles.offerUsage}>
            <Text style={styles.offerUsageText}>
              {usageCount}{usageLimit ? `/${usageLimit}` : ''} used
            </Text>
            {usagePct !== null && (
              <View style={styles.usageBg}>
                <View
                  style={[
                    styles.usageFill,
                    {
                      width: `${Math.min(usagePct, 100)}%`,
                      backgroundColor: usagePct > 85 ? '#dc2626' : '#2563eb',
                    },
                  ]}
                />
              </View>
            )}
          </View>
          <View style={[styles.applyBadge]}>
            <Text style={styles.applyBadgeText}>{appliedOn}</Text>
          </View>
        </View>

        {(offer.code ?? offer.coupon_code) ? (
          <View style={styles.couponBadgeRow}>
            <Ionicons name="pricetag-outline" size={12} color="#2563eb" />
            <Text style={styles.couponBadgeText}>{offer.code ?? offer.coupon_code}</Text>
          </View>
        ) : null}

        <View style={styles.expandToggle}>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#94a3b8" />
          <Text style={styles.expandText}>{expanded ? 'Hide details' : 'Show details'}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.expandedSection}>
          <View style={styles.expandDivider} />
          <Text style={styles.expandSubTitle}>Applicable Items</Text>
          <View style={styles.itemChipsRow}>
            {items.map((it, i) => (
              <View key={i} style={styles.itemChip}>
                <Text style={styles.itemChipText}>{it}</Text>
              </View>
            ))}
          </View>
          {conditions ? (
            <>
              <Text style={styles.expandSubTitle}>Conditions</Text>
              <Text style={styles.conditionsText}>{conditions}</Text>
            </>
          ) : null}
          {redemptionHistory.length > 0 && (
            <>
              <Text style={styles.expandSubTitle}>Redemption History</Text>
              {redemptionHistory.map((r, i) => (
                <View key={i} style={styles.historyRow}>
                  <Text style={styles.historyDate}>{r.date}</Text>
                  <Text style={styles.historyCount}>{r.count} uses</Text>
                  <Text style={styles.historyAmt}>{symbol}{r.savings.toLocaleString('en-IN')} saved</Text>
                </View>
              ))}
            </>
          )}
        </Animated.View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function OffersScreen() {
  const insets = useSafeAreaInsets();
  const { outletId } = useOutlet();
  const { symbol } = useCurrency();

  // ─── API hooks ────────────────────────────────────────────────────────────
  const { data, isLoading, isError, refetch } = useDiscounts({ outlet_id: outletId });
  const createDiscount = useCreateDiscount();
  const updateDiscount = useUpdateDiscount();
  const deleteDiscount = useDeleteDiscount();

  // ─── Local state for optimistic updates ───────────────────────────────────
  const [localOffers, setLocalOffers] = useState(null);
  useEffect(() => { if (data) setLocalOffers(data); }, [data]);
  const offers = localOffers ?? data ?? [];

  const [filter, setFilter] = useState('All');
  const [expandedId, setExpandedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const enter = Platform.OS !== 'web';

  // ─── Happy Hour: first discount of type happy_hour ────────────────────────
  const happyHourOffer = offers.find(o => o.type === 'happy_hour' || o.type === 'Happy Hour');
  const happyHourOn = happyHourOffer ? (happyHourOffer.is_active ?? happyHourOffer.active ?? false) : false;
  const happyHourSub = happyHourOffer
    ? (() => {
        const t = happyHourOffer.start_time && happyHourOffer.end_time
          ? `${happyHourOffer.start_time} – ${happyHourOffer.end_time}`
          : (happyHourOffer.timeRange ?? 'All Day');
        const v = happyHourOffer.value ?? happyHourOffer.discountValue ?? '';
        return `${t}${v ? ` · ${v}% OFF` : ''}`;
      })()
    : '3:00 PM – 6:00 PM · 20% OFF Beverages';

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleToggle = useCallback((id) => {
    setLocalOffers(prev => (prev ?? []).map(o => o.id === id ? { ...o, is_active: !(o.is_active ?? o.active), active: !(o.is_active ?? o.active) } : o));
    const offer = (localOffers ?? []).find(o => o.id === id);
    if (offer) {
      updateDiscount.mutate({ id, is_active: !(offer.is_active ?? offer.active), outlet_id: outletId });
    }
  }, [localOffers, updateDiscount, outletId]);

  const handleCreate = useCallback((formData) => {
    // Backend discount `type` is percentage | flat | bogo | buy_x_get_y — NOT the UI
    // offer category ('Happy Hour'/'Combo'/'Coupon'). Derive it from the discount
    // mechanism the form actually captured (percent vs flat amount).
    const backendType = formData.discountType === 'flat' ? 'flat' : 'percentage';
    const numValue = parseFloat(formData.discountValue ?? formData.value ?? 0) || 0;
    // Backend field is `code` (uppercase, ≤20), not `coupon_code`.
    const code = (formData.couponCode ?? formData.coupon_code ?? '').toUpperCase() || null;

    const optimisticId = `temp_${Date.now()}`;
    const optimistic = {
      ...formData,
      id: optimisticId,
      type: backendType,
      value: numValue,
      code,
      is_active: true,
      active: true,
      usage_count: 0,
      usageCount: 0,
    };
    setLocalOffers(prev => [optimistic, ...(prev ?? [])]);
    setShowCreate(false);
    createDiscount.mutate(
      {
        name: formData.name,
        type: backendType,
        value: numValue,
        min_order_value: parseFloat(formData.minOrder ?? formData.min_order_value ?? 0) || 0,
        max_uses: parseInt(formData.usageLimit ?? formData.max_uses) || null,
        start_date: formData.dateFrom || formData.start_date || null,
        end_date: formData.dateTo || formData.end_date || null,
        code,
        outlet_id: outletId,
      },
      { onError: () => setLocalOffers(prev => (prev ?? []).filter(o => o.id !== optimisticId)) }
    );
  }, [createDiscount, outletId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // ─── Filter logic (client-side) ────────────────────────────────────────────
  const filteredOffers = useMemo(() => {
    const now = new Date();
    switch (filter) {
      case 'Active':
        return offers.filter(o => (o.is_active ?? o.active) === true);
      case 'Scheduled':
        return offers.filter(o => {
          const active = o.is_active ?? o.active;
          const startDate = o.start_date ?? o.dateFrom;
          return !active && startDate && new Date(startDate) > now;
        });
      case 'Expired':
        return offers.filter(o => {
          const endDate = o.end_date ?? o.dateTo;
          return endDate && new Date(endDate) < now;
        });
      default:
        return offers;
    }
  }, [offers, filter]);

  // ─── Summary stats ────────────────────────────────────────────────────────
  const activeCount = offers.filter(o => (o.is_active ?? o.active) === true).length;
  const todayRedemptions = offers.reduce((sum, o) => {
    const history = o.redemptionHistory ?? [];
    const today = history.find(r => r.date === 'Today');
    return sum + (today ? today.count : 0);
  }, 0);
  const todayImpact = offers.reduce((sum, o) => {
    const history = o.redemptionHistory ?? [];
    const today = history.find(r => r.date === 'Today');
    return sum + (today ? today.savings : 0);
  }, 0);

  const todayActiveDeals = offers.filter(o => (o.is_active ?? o.active) === true);

  // ─── Loading / error states ────────────────────────────────────────────────
  const showSkeleton = isLoading && !localOffers?.length;
  const showError = isError && !localOffers?.length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Offers & Discounts</Text>
        <TouchableOpacity style={styles.headerBtn}>
          <Ionicons name="options-outline" size={20} color="#0f172a" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }>

        {/* Happy Hour Quick Toggle */}
        <Animated.View
          entering={enter ? FadeInDown.delay(0).springify() : undefined}
          style={styles.happyHourBar}>
          <View style={styles.happyHourLeft}>
            <Ionicons name="beer-outline" size={22} color="#d97706" style={{ marginRight: 10 }} />
            <View>
              <Text style={styles.happyHourTitle}>Happy Hour</Text>
              <Text style={styles.happyHourSub}>{happyHourSub}</Text>
            </View>
          </View>
          <Switch
            value={happyHourOn}
            onValueChange={() => happyHourOffer && handleToggle(happyHourOffer.id)}
            trackColor={{ false: '#e2e8f0', true: '#d9770630' }}
            thumbColor={happyHourOn ? '#d97706' : '#fff'}
          />
        </Animated.View>

        {/* Today's Active Deals Banner */}
        <Animated.View entering={enter ? FadeInDown.delay(50).springify() : undefined}>
          <Text style={styles.sectionTitle}>Today's Active Deals</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            <View style={styles.dealChipsRow}>
              {todayActiveDeals.map((o) => (
                <View
                  key={o.id}
                  style={[styles.dealChip, { backgroundColor: (TYPE_COLORS[o.type] || '#475569') + '18' }]}>
                  <Ionicons
                    name={TYPE_ICONS[o.type] || 'pricetag-outline'}
                    size={13}
                    color={TYPE_COLORS[o.type] || '#475569'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.dealChipText, { color: TYPE_COLORS[o.type] || '#475569' }]}>
                    {o.name}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </Animated.View>

        {/* Summary Cards */}
        <Animated.View
          entering={enter ? FadeInDown.delay(100).springify() : undefined}
          style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Ionicons name="flash-outline" size={20} color="#2563eb" />
            <Text style={styles.summaryVal}>{activeCount}</Text>
            <Text style={styles.summaryLbl}>Active Offers</Text>
          </View>
          <View style={styles.summaryCard}>
            <Ionicons name="refresh-outline" size={20} color="#d97706" />
            <Text style={styles.summaryVal}>{todayRedemptions}</Text>
            <Text style={styles.summaryLbl}>Redemptions Today</Text>
          </View>
          <View style={styles.summaryCard}>
            <Ionicons name="trending-down-outline" size={20} color="#dc2626" />
            <Text style={styles.summaryVal}>{symbol}{(todayImpact / 1000).toFixed(1)}K</Text>
            <Text style={styles.summaryLbl}>Discount Given</Text>
          </View>
        </Animated.View>

        {/* Filter Pills */}
        <Animated.View entering={enter ? FadeInDown.delay(140).springify() : undefined}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={styles.filterRow}>
              {FILTERS.map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterPill, filter === f && styles.filterPillActive]}
                  onPress={() => setFilter(f)}>
                  <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>
                    {f}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </Animated.View>

        {/* Skeleton loading */}
        {showSkeleton && (
          <View>
            {[0, 1, 2].map(i => (
              <View key={i} style={[styles.offerCard, { marginBottom: 14 }]}>
                <SkeletonBox width="60%" height={18} borderRadius={8} style={{ marginBottom: 10 }} />
                <SkeletonBox width="40%" height={28} borderRadius={8} style={{ marginBottom: 10 }} />
                <SkeletonBox width="80%" height={14} borderRadius={8} style={{ marginBottom: 6 }} />
                <SkeletonBox width="50%" height={14} borderRadius={8} />
              </View>
            ))}
          </View>
        )}

        {/* Error state */}
        {showError && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={40} color="#dc2626" />
            <Text style={styles.errorText}>Failed to load offers</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Offers List */}
        {!showSkeleton && !showError && (
          filteredOffers.length === 0 ? (
            <EmptyState
              icon="pricetag-outline"
              title="No offers found"
              subtitle="Try a different filter or create a new offer"
            />
          ) : (
            filteredOffers.map((offer, i) => (
              <Animated.View
                key={offer.id}
                entering={enter ? FadeInDown.delay(160 + i * 40).springify() : undefined}>
                <OfferCard
                  offer={offer}
                  onToggle={handleToggle}
                  expanded={expandedId === offer.id}
                  onExpand={() => setExpandedId(id => id === offer.id ? null : offer.id)}
                />
              </Animated.View>
            ))
          )
        )}

        <View style={{ height: 90 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        onPress={() => setShowCreate(true)}
        activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Create Offer Modal */}
      <CreateOfferModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 20 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 8,
    backgroundColor: '#f8fafc',
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  happyHourBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#d9770610',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#d9770630',
  },
  happyHourLeft: { flexDirection: 'row', alignItems: 'center' },
  happyHourTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  happyHourSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 10 },

  dealChipsRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  dealChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  dealChipText: { fontSize: 13, fontWeight: '600' },

  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryVal: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  summaryLbl: { fontSize: 10, color: '#94a3b8', textAlign: 'center' },

  filterRow: { flexDirection: 'row', gap: 8 },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  filterPillActive: { backgroundColor: '#2563eb', borderColor: '#e2e8f0' },
  filterPillText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  filterPillTextActive: { color: '#fff' },

  offerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  offerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 4,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  offerName: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  offerDiscount: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  offerMeta: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  offerMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  offerMetaText: { fontSize: 12, color: '#94a3b8' },
  offerBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  offerUsage: { flex: 1, marginRight: 12 },
  offerUsageText: { fontSize: 12, color: '#475569', marginBottom: 4 },
  usageBg: { height: 5, borderRadius: 3, backgroundColor: '#e2e8f0', width: '100%' },
  usageFill: { height: 5, borderRadius: 3 },
  applyBadge: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  applyBadgeText: { fontSize: 11, color: '#475569', fontWeight: '600' },
  expandToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  expandText: { fontSize: 12, color: '#94a3b8' },

  expandedSection: { marginTop: 4 },
  expandDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 12 },
  expandSubTitle: { fontSize: 12, fontWeight: '700', color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  itemChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  itemChip: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  itemChipText: { fontSize: 12, color: '#475569' },
  conditionsText: { fontSize: 13, color: '#475569', marginBottom: 12 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  historyDate: { fontSize: 13, color: '#94a3b8', flex: 1 },
  historyCount: { fontSize: 13, color: '#475569', fontWeight: '600', flex: 1, textAlign: 'center' },
  historyAmt: { fontSize: 13, color: '#16a34a', fontWeight: '700', flex: 1, textAlign: 'right' },

  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 8,
  },

  // Sheet / Modal
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },

  stepRow: { flexDirection: 'row', alignItems: 'center' },
  stepIndicatorWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: '#2563eb' },
  stepDotText: { fontSize: 13, fontWeight: '700', color: '#94a3b8' },
  stepDotTextActive: { color: '#fff' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#e2e8f0', marginHorizontal: 4 },
  stepLineActive: { backgroundColor: '#2563eb' },
  stepLabel: { fontSize: 13, color: '#94a3b8', marginTop: 8, marginBottom: 4 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 8, marginTop: 12 },
  input: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    marginBottom: 4,
  },
  rowInputs: { flexDirection: 'row', gap: 10 },
  couponRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 4 },
  genBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  genBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 4,
  },
  typeCard: {
    width: (SCREEN_W - 88) / 2,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  typeCardSelected: { backgroundColor: '#2563eb', borderColor: '#e2e8f0' },
  typeCardText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  typeCardTextSelected: { color: '#fff' },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  pillActive: { backgroundColor: '#2563eb', borderColor: '#e2e8f0' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  pillTextActive: { color: '#fff' },

  summaryBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    gap: 6,
  },
  summaryBoxTitle: { fontSize: 13, fontWeight: '700', color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryBoxRow: { fontSize: 13 },
  summaryKey: { color: '#94a3b8', fontWeight: '600' },
  summaryVal: { color: '#0f172a' },

  sheetFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  backBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  backBtnText: { fontSize: 15, fontWeight: '600', color: '#475569' },
  nextBtn: {
    flex: 2,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  nextBtnDisabled: { backgroundColor: '#e2e8f0' },
  nextBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  createBtn: {
    flex: 2,
    backgroundColor: '#16a34a',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  createBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  couponBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  couponBadgeText: { fontSize: 12, color: '#2563eb', fontWeight: '700' },

  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  errorText: { fontSize: 15, color: '#475569', fontWeight: '600' },
  retryBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
