/**
 * Offers & Discounts Screen
 * Expo 54 · RN 0.81 · Reanimated 4 · JSX
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
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

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Mock Data ────────────────────────────────────────────────────────────────

const INITIAL_OFFERS = [
  {
    id: '1',
    name: 'Happy Hour Special',
    type: 'Happy Hour',
    discountType: 'percent',
    discountValue: 20,
    timeRange: '3:00 PM – 6:00 PM',
    dateRange: 'Daily',
    usageLimit: 999,
    usageCount: 72,
    active: true,
    appliedOn: 'Dine-in',
    conditions: 'Min order ₹300. Beverages only.',
    items: ['Mocktails', 'Fresh Juices', 'Lassi', 'Cold Coffee'],
    redemptionHistory: [
      { date: 'Today', count: 14, savings: 1280 },
      { date: 'Yesterday', count: 18, savings: 1640 },
    ],
  },
  {
    id: '2',
    name: 'Thali Combo Deal',
    type: 'Combo',
    discountType: 'flat',
    discountValue: 120,
    timeRange: '12:00 PM – 3:30 PM',
    dateRange: 'Mon – Fri',
    usageLimit: 50,
    usageCount: 31,
    active: true,
    appliedOn: 'All',
    conditions: 'Thali + Dessert only.',
    items: ['Rajasthani Thali', 'South Indian Thali', 'Gulab Jamun', 'Kheer'],
    redemptionHistory: [
      { date: 'Today', count: 9, savings: 1080 },
      { date: 'Yesterday', count: 12, savings: 1440 },
    ],
  },
  {
    id: '3',
    name: 'WELCOME100',
    type: 'Coupon',
    discountType: 'flat',
    discountValue: 100,
    timeRange: 'All Day',
    dateRange: '01 May – 31 May 2026',
    usageLimit: 200,
    usageCount: 68,
    active: true,
    appliedOn: 'Delivery',
    conditions: 'Min order ₹500. New users only.',
    items: ['All Menu'],
    redemptionHistory: [
      { date: 'Today', count: 7, savings: 700 },
      { date: 'Yesterday', count: 11, savings: 1100 },
    ],
  },
  {
    id: '4',
    name: 'Eid Mubarak Feast',
    type: 'Festival',
    discountType: 'percent',
    discountValue: 15,
    timeRange: 'All Day',
    dateRange: '01 Apr – 15 Apr 2026',
    usageLimit: 300,
    usageCount: 300,
    active: false,
    appliedOn: 'All',
    conditions: 'Above ₹800.',
    items: ['Biryani Section', 'Kebab Section'],
    redemptionHistory: [
      { date: '15 Apr', count: 44, savings: 8800 },
    ],
  },
  {
    id: '5',
    name: 'Loyalty Gold Reward',
    type: 'Loyalty',
    discountType: 'flat',
    discountValue: 200,
    timeRange: 'All Day',
    dateRange: 'Ongoing',
    usageLimit: null,
    usageCount: 142,
    active: true,
    appliedOn: 'All',
    conditions: 'Gold members only. Min ₹1000.',
    items: ['All Menu'],
    redemptionHistory: [
      { date: 'Today', count: 3, savings: 600 },
      { date: 'Yesterday', count: 5, savings: 1000 },
    ],
  },
  {
    id: '6',
    name: 'Weekend Brunch Special',
    type: 'Combo',
    discountType: 'percent',
    discountValue: 25,
    timeRange: '9:00 AM – 12:00 PM',
    dateRange: 'Sat & Sun',
    usageLimit: 40,
    usageCount: 0,
    active: false,
    appliedOn: 'Dine-in',
    conditions: 'Brunch menu only.',
    items: ['Brunch Specials', 'Fresh Juices'],
    redemptionHistory: [],
  },
  {
    id: '7',
    name: 'SUMMER30',
    type: 'Coupon',
    discountType: 'percent',
    discountValue: 30,
    timeRange: 'All Day',
    dateRange: '01 May – 31 May 2026',
    usageLimit: 500,
    usageCount: 23,
    active: true,
    appliedOn: 'Takeaway',
    conditions: 'Min ₹400.',
    items: ['All Menu'],
    redemptionHistory: [
      { date: 'Today', count: 5, savings: 1500 },
    ],
  },
  {
    id: '8',
    name: 'Family Platter Discount',
    type: 'Combo',
    discountType: 'flat',
    discountValue: 250,
    timeRange: '6:00 PM – 10:00 PM',
    dateRange: 'Daily',
    usageLimit: 30,
    usageCount: 11,
    active: true,
    appliedOn: 'Dine-in',
    conditions: 'Family platters only. Min 4 people.',
    items: ['Family Platters', 'Naan Basket'],
    redemptionHistory: [
      { date: 'Today', count: 2, savings: 500 },
      { date: 'Yesterday', count: 3, savings: 750 },
    ],
  },
];

const TYPE_COLORS = {
  'Happy Hour': '#F5A623',
  'Combo': '#0070F3',
  'Coupon': '#9B59B6',
  'Festival': '#EE0000',
  'Loyalty': '#00B341',
  'Flat Discount': '#444',
};

const TYPE_ICONS = {
  'Happy Hour': 'beer-outline',
  'Combo': 'grid-outline',
  'Coupon': 'pricetag-outline',
  'Festival': 'sparkles-outline',
  'Loyalty': 'star-outline',
  'Flat Discount': 'cash-outline',
};

const FILTERS = ['All', 'Active', 'Scheduled', 'Expired'];

// ─── Create Offer Modal ───────────────────────────────────────────────────────

const OFFER_TYPES = ['Happy Hour', 'Combo', 'Coupon', 'Flat Discount'];
const APPLY_ON = ['All', 'Dine-in', 'Takeaway', 'Delivery'];

function CreateOfferModal({ visible, onClose, onCreate }) {
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
      conditions: form.minOrder ? `Min order ₹${form.minOrder}` : '',
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
              <Ionicons name="close" size={22} color="#000" />
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
                        color={form.offerType === t ? '#fff' : (TYPE_COLORS[t] || '#444')}
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
                  placeholderTextColor="#888"
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
                        placeholderTextColor="#888"
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
                        {dt === 'percent' ? '% Percentage' : '₹ Flat Amount'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>
                  {form.discountType === 'percent' ? 'Discount (%)' : 'Discount Amount (₹)'}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={form.discountType === 'percent' ? '20' : '100'}
                  placeholderTextColor="#888"
                  value={form.discountValue}
                  onChangeText={v => update('discountValue', v)}
                  keyboardType="numeric"
                />
                <Text style={styles.fieldLabel}>Minimum Order Value (₹)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="300 (optional)"
                  placeholderTextColor="#888"
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
                    placeholderTextColor="#888"
                    value={form.dateFrom}
                    onChangeText={v => update('dateFrom', v)}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="To: 31 May 2026"
                    placeholderTextColor="#888"
                    value={form.dateTo}
                    onChangeText={v => update('dateTo', v)}
                  />
                </View>
                <Text style={styles.fieldLabel}>Time Range (optional)</Text>
                <View style={styles.rowInputs}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="From: 3:00 PM"
                    placeholderTextColor="#888"
                    value={form.timeFrom}
                    onChangeText={v => update('timeFrom', v)}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="To: 6:00 PM"
                    placeholderTextColor="#888"
                    value={form.timeTo}
                    onChangeText={v => update('timeTo', v)}
                  />
                </View>
                <Text style={styles.fieldLabel}>Usage Limit (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 100 (leave blank for unlimited)"
                  placeholderTextColor="#888"
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
                          : `₹${form.discountValue} OFF`
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
  const typeColor = TYPE_COLORS[offer.type] || '#444';
  const discountLabel =
    offer.discountType === 'percent'
      ? `${offer.discountValue}% OFF`
      : `₹${offer.discountValue} OFF`;
  const usagePct = offer.usageLimit ? (offer.usageCount / offer.usageLimit) * 100 : null;

  return (
    <View style={styles.offerCard}>
      <TouchableOpacity activeOpacity={0.9} onPress={onExpand}>
        <View style={styles.offerTop}>
          <View style={[styles.typeBadge, { backgroundColor: typeColor + '18' }]}>
            <Ionicons name={TYPE_ICONS[offer.type] || 'pricetag-outline'} size={13} color={typeColor} />
            <Text style={[styles.typeBadgeText, { color: typeColor }]}>{offer.type}</Text>
          </View>
          <Switch
            value={offer.active}
            onValueChange={() => onToggle(offer.id)}
            trackColor={{ false: '#EAEAEA', true: '#0070F320' }}
            thumbColor={offer.active ? '#0070F3' : '#fff'}
            style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
          />
        </View>

        <Text style={styles.offerName}>{offer.name}</Text>
        <Text style={styles.offerDiscount}>{discountLabel}</Text>

        <View style={styles.offerMeta}>
          <View style={styles.offerMetaItem}>
            <Ionicons name="time-outline" size={13} color="#888" />
            <Text style={styles.offerMetaText}>{offer.timeRange}</Text>
          </View>
          <View style={styles.offerMetaItem}>
            <Ionicons name="calendar-outline" size={13} color="#888" />
            <Text style={styles.offerMetaText}>{offer.dateRange}</Text>
          </View>
        </View>

        <View style={styles.offerBottom}>
          <View style={styles.offerUsage}>
            <Text style={styles.offerUsageText}>
              {offer.usageCount}{offer.usageLimit ? `/${offer.usageLimit}` : ''} used
            </Text>
            {usagePct !== null && (
              <View style={styles.usageBg}>
                <View
                  style={[
                    styles.usageFill,
                    {
                      width: `${Math.min(usagePct, 100)}%`,
                      backgroundColor: usagePct > 85 ? '#EE0000' : '#0070F3',
                    },
                  ]}
                />
              </View>
            )}
          </View>
          <View style={[styles.applyBadge]}>
            <Text style={styles.applyBadgeText}>{offer.appliedOn}</Text>
          </View>
        </View>

        <View style={styles.expandToggle}>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#888" />
          <Text style={styles.expandText}>{expanded ? 'Hide details' : 'Show details'}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.expandedSection}>
          <View style={styles.expandDivider} />
          <Text style={styles.expandSubTitle}>Applicable Items</Text>
          <View style={styles.itemChipsRow}>
            {offer.items.map((it, i) => (
              <View key={i} style={styles.itemChip}>
                <Text style={styles.itemChipText}>{it}</Text>
              </View>
            ))}
          </View>
          {offer.conditions ? (
            <>
              <Text style={styles.expandSubTitle}>Conditions</Text>
              <Text style={styles.conditionsText}>{offer.conditions}</Text>
            </>
          ) : null}
          {offer.redemptionHistory.length > 0 && (
            <>
              <Text style={styles.expandSubTitle}>Redemption History</Text>
              {offer.redemptionHistory.map((r, i) => (
                <View key={i} style={styles.historyRow}>
                  <Text style={styles.historyDate}>{r.date}</Text>
                  <Text style={styles.historyCount}>{r.count} uses</Text>
                  <Text style={styles.historyAmt}>₹{r.savings.toLocaleString('en-IN')} saved</Text>
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
  const [offers, setOffers] = useState(INITIAL_OFFERS);
  const [filter, setFilter] = useState('All');
  const [expandedId, setExpandedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [happyHourOn, setHappyHourOn] = useState(true);

  const enter = Platform.OS !== 'web';

  const handleToggle = useCallback((id) => {
    setOffers(prev => prev.map(o => o.id === id ? { ...o, active: !o.active } : o));
  }, []);

  const handleCreate = useCallback((newOffer) => {
    setOffers(prev => [newOffer, ...prev]);
  }, []);

  const filteredOffers = useMemo(() => {
    switch (filter) {
      case 'Active': return offers.filter(o => o.active);
      case 'Scheduled': return offers.filter(o => !o.active && o.usageCount === 0);
      case 'Expired': return offers.filter(o => !o.active && o.usageCount > 0);
      default: return offers;
    }
  }, [offers, filter]);

  const activeCount = offers.filter(o => o.active).length;
  const todayRedemptions = offers.reduce((sum, o) => {
    const today = o.redemptionHistory.find(r => r.date === 'Today');
    return sum + (today ? today.count : 0);
  }, 0);
  const todayImpact = offers.reduce((sum, o) => {
    const today = o.redemptionHistory.find(r => r.date === 'Today');
    return sum + (today ? today.savings : 0);
  }, 0);

  const todayActiveDeals = offers.filter(o => o.active);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Offers & Discounts</Text>
        <TouchableOpacity style={styles.headerBtn}>
          <Ionicons name="options-outline" size={20} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Happy Hour Quick Toggle */}
        <Animated.View
          entering={enter ? FadeInDown.delay(0).springify() : undefined}
          style={styles.happyHourBar}>
          <View style={styles.happyHourLeft}>
            <Ionicons name="beer-outline" size={22} color="#F5A623" style={{ marginRight: 10 }} />
            <View>
              <Text style={styles.happyHourTitle}>Happy Hour</Text>
              <Text style={styles.happyHourSub}>3:00 PM – 6:00 PM · 20% OFF Beverages</Text>
            </View>
          </View>
          <Switch
            value={happyHourOn}
            onValueChange={setHappyHourOn}
            trackColor={{ false: '#EAEAEA', true: '#F5A62330' }}
            thumbColor={happyHourOn ? '#F5A623' : '#fff'}
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
                  style={[styles.dealChip, { backgroundColor: (TYPE_COLORS[o.type] || '#444') + '18' }]}>
                  <Ionicons
                    name={TYPE_ICONS[o.type] || 'pricetag-outline'}
                    size={13}
                    color={TYPE_COLORS[o.type] || '#444'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.dealChipText, { color: TYPE_COLORS[o.type] || '#444' }]}>
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
            <Ionicons name="flash-outline" size={20} color="#0070F3" />
            <Text style={styles.summaryVal}>{activeCount}</Text>
            <Text style={styles.summaryLbl}>Active Offers</Text>
          </View>
          <View style={styles.summaryCard}>
            <Ionicons name="refresh-outline" size={20} color="#F5A623" />
            <Text style={styles.summaryVal}>{todayRedemptions}</Text>
            <Text style={styles.summaryLbl}>Redemptions Today</Text>
          </View>
          <View style={styles.summaryCard}>
            <Ionicons name="trending-down-outline" size={20} color="#EE0000" />
            <Text style={styles.summaryVal}>₹{(todayImpact / 1000).toFixed(1)}K</Text>
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

        {/* Offers List */}
        {filteredOffers.length === 0 ? (
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
  root: { flex: 1, backgroundColor: '#F7F7F7' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 20 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 8,
    backgroundColor: '#F7F7F7',
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#000' },
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
    backgroundColor: '#F5A62310',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#F5A62330',
  },
  happyHourLeft: { flexDirection: 'row', alignItems: 'center' },
  happyHourTitle: { fontSize: 15, fontWeight: '700', color: '#000' },
  happyHourSub: { fontSize: 12, color: '#888', marginTop: 2 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#000', marginBottom: 10 },

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
  summaryVal: { fontSize: 18, fontWeight: '700', color: '#000' },
  summaryLbl: { fontSize: 10, color: '#888', textAlign: 'center' },

  filterRow: { flexDirection: 'row', gap: 8 },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#EAEAEA',
  },
  filterPillActive: { backgroundColor: '#000', borderColor: '#000' },
  filterPillText: { fontSize: 13, fontWeight: '600', color: '#444' },
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
  offerName: { fontSize: 16, fontWeight: '700', color: '#000', marginBottom: 2 },
  offerDiscount: { fontSize: 22, fontWeight: '800', color: '#000', marginBottom: 10 },
  offerMeta: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  offerMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  offerMetaText: { fontSize: 12, color: '#888' },
  offerBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  offerUsage: { flex: 1, marginRight: 12 },
  offerUsageText: { fontSize: 12, color: '#444', marginBottom: 4 },
  usageBg: { height: 5, borderRadius: 3, backgroundColor: '#EAEAEA', width: '100%' },
  usageFill: { height: 5, borderRadius: 3 },
  applyBadge: {
    backgroundColor: '#F7F7F7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  applyBadgeText: { fontSize: 11, color: '#444', fontWeight: '600' },
  expandToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  expandText: { fontSize: 12, color: '#888' },

  expandedSection: { marginTop: 4 },
  expandDivider: { height: 1, backgroundColor: '#EAEAEA', marginVertical: 12 },
  expandSubTitle: { fontSize: 12, fontWeight: '700', color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  itemChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  itemChip: {
    backgroundColor: '#F7F7F7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  itemChipText: { fontSize: 12, color: '#444' },
  conditionsText: { fontSize: 13, color: '#444', marginBottom: 12 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  historyDate: { fontSize: 13, color: '#888', flex: 1 },
  historyCount: { fontSize: 13, color: '#444', fontWeight: '600', flex: 1, textAlign: 'center' },
  historyAmt: { fontSize: 13, color: '#00B341', fontWeight: '700', flex: 1, textAlign: 'right' },

  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#000',
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
    backgroundColor: '#EAEAEA',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#000' },

  stepRow: { flexDirection: 'row', alignItems: 'center' },
  stepIndicatorWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EAEAEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: '#000' },
  stepDotText: { fontSize: 13, fontWeight: '700', color: '#888' },
  stepDotTextActive: { color: '#fff' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#EAEAEA', marginHorizontal: 4 },
  stepLineActive: { backgroundColor: '#000' },
  stepLabel: { fontSize: 13, color: '#888', marginTop: 8, marginBottom: 4 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 8, marginTop: 12 },
  input: {
    borderWidth: 1.5,
    borderColor: '#EAEAEA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#000',
    backgroundColor: '#F7F7F7',
    marginBottom: 4,
  },
  rowInputs: { flexDirection: 'row', gap: 10 },
  couponRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 4 },
  genBtn: {
    backgroundColor: '#000',
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
    borderColor: '#EAEAEA',
    backgroundColor: '#F7F7F7',
  },
  typeCardSelected: { backgroundColor: '#000', borderColor: '#000' },
  typeCardText: { fontSize: 13, fontWeight: '600', color: '#444' },
  typeCardTextSelected: { color: '#fff' },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#EAEAEA',
    backgroundColor: '#F7F7F7',
  },
  pillActive: { backgroundColor: '#000', borderColor: '#000' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#444' },
  pillTextActive: { color: '#fff' },

  summaryBox: {
    backgroundColor: '#F7F7F7',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    gap: 6,
  },
  summaryBoxTitle: { fontSize: 13, fontWeight: '700', color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryBoxRow: { fontSize: 13 },
  summaryKey: { color: '#888', fontWeight: '600' },
  summaryVal: { color: '#000' },

  sheetFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#EAEAEA',
  },
  backBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#EAEAEA',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  backBtnText: { fontSize: 15, fontWeight: '600', color: '#444' },
  nextBtn: {
    flex: 2,
    backgroundColor: '#000',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  nextBtnDisabled: { backgroundColor: '#EAEAEA' },
  nextBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  createBtn: {
    flex: 2,
    backgroundColor: '#00B341',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  createBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
