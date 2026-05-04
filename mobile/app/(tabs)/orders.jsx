import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Pressable,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  interpolate,
  Extrapolation,
  runOnJS,
  FadeIn,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { useOrders, useUpdateOrderStatus } from '../../src/hooks/useApi';
import { Colors } from '../../src/constants/colors';
import { T } from '../../src/constants/typography';

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_TABS = ['All', 'Pending', 'Preparing', 'Ready', 'Delivered'];

const STATUS_COLORS = {
  pending: Colors.warning,
  preparing: Colors.indigo,
  ready: Colors.success,
  delivered: Colors.text3,
  cancelled: Colors.error,
};

const STATUS_GRADIENT = {
  pending:   [Colors.warning,  '#B87A10'],
  preparing: [Colors.indigo,   '#3A3DC0'],
  ready:     [Colors.success,  '#0A8A60'],
  delivered: [Colors.text3,    Colors.text4],
  cancelled: [Colors.error,    '#A02020'],
};

const NEXT_STATUS = {
  pending:   'preparing',
  preparing: 'ready',
  ready:     'delivered',
};

const SWIPE_THRESHOLD = 80;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr || now).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── SVG Empty State ──────────────────────────────────────────────────────────

function EmptyIllustration() {
  return (
    <Svg width={120} height={120} viewBox="0 0 120 120" fill="none">
      <Circle cx="60" cy="60" r="50" fill={Colors.surface2} />
      {/* plate */}
      <Circle cx="60" cy="68" r="28" fill="none" stroke={Colors.border} strokeWidth="3" />
      <Circle cx="60" cy="68" r="20" fill="none" stroke={Colors.border} strokeWidth="1.5" />
      {/* fork */}
      <G stroke={Colors.text3} strokeWidth="2" strokeLinecap="round">
        <Path d="M44 38 L44 54" />
        <Path d="M41 38 L41 46 Q44 50 47 46 L47 38" />
        {/* knife */}
        <Path d="M76 38 L76 54" />
        <Path d="M76 38 Q80 42 78 47 L76 54" />
      </G>
      {/* steam lines */}
      <G stroke={Colors.text4} strokeWidth="1.5" strokeLinecap="round">
        <Path d="M50 30 Q52 27 50 24" />
        <Path d="M60 28 Q62 25 60 22" />
        <Path d="M70 30 Q72 27 70 24" />
      </G>
    </Svg>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 750 }),
        withTiming(0.35, { duration: 750 })
      ),
      -1,
      false
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.card, animStyle]}>
      <View style={[styles.skeletonLeftBorder, { backgroundColor: Colors.border }]} />
      <View style={{ flex: 1, padding: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
          <View>
            <View style={[styles.skeletonBar, { width: 100, height: 13, marginBottom: 6 }]} />
            <View style={[styles.skeletonBar, { width: 70, height: 10 }]} />
          </View>
          <View style={[styles.skeletonBar, { width: 55, height: 22, borderRadius: 6 }]} />
        </View>
        <View style={[styles.skeletonBar, { width: '90%', height: 10, marginBottom: 6 }]} />
        <View style={[styles.skeletonBar, { width: '75%', height: 10, marginBottom: 6 }]} />
        <View style={[styles.skeletonBar, { width: '55%', height: 10, marginBottom: 14 }]} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={[styles.skeletonBar, { width: 80, height: 26, borderRadius: 8 }]} />
          <View style={[styles.skeletonBar, { width: 110, height: 26, borderRadius: 8 }]} />
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Pulsing Dot ─────────────────────────────────────────────────────────────

function PulsingDot({ color = Colors.success }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 600 }),
        withTiming(1, { duration: 600 })
      ),
      -1,
      false
    );
  }, []);

  const outerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: interpolate(scale.value, [1, 1.4], [0.6, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: color },
          outerStyle,
        ]}
      />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ orders }) {
  const counts = {
    pending:   orders.filter((o) => (o.status || '').toLowerCase() === 'pending').length,
    preparing: orders.filter((o) => (o.status || '').toLowerCase() === 'preparing').length,
    ready:     orders.filter((o) => (o.status || '').toLowerCase() === 'ready').length,
  };

  const pills = [
    { label: 'Pending',   count: counts.pending,   color: Colors.warning },
    { label: 'Preparing', count: counts.preparing, color: Colors.indigo },
    { label: 'Ready',     count: counts.ready,     color: Colors.success },
  ];

  return (
    <View style={styles.statsBar}>
      {pills.map((p, i) => (
        <React.Fragment key={p.label}>
          <View style={[styles.statsPill, { backgroundColor: p.color + '20' }]}>
            <View style={[styles.statsDot, { backgroundColor: p.color }]} />
            <Text style={[T.label, { color: p.color }]}>
              {p.label}
            </Text>
            <Text style={[T.numXs, { color: p.color, marginLeft: 4 }]}>
              {p.count}
            </Text>
          </View>
          {i < pills.length - 1 && (
            <View style={styles.statsDivider} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

// ─── Filter Tabs ──────────────────────────────────────────────────────────────

function FilterTabs({ activeTab, onSelect }) {
  const tabWidths = useRef({});
  const tabOffsets = useRef({});
  const indicatorX = useSharedValue(0);
  const indicatorW = useSharedValue(0);
  const [measured, setMeasured] = useState(false);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorW.value,
  }));

  function onTabLayout(tab, x, w) {
    tabOffsets.current[tab] = x;
    tabWidths.current[tab] = w;
    if (Object.keys(tabOffsets.current).length === STATUS_TABS.length) {
      // All tabs measured — animate to active
      const ax = tabOffsets.current[activeTab] ?? 0;
      const aw = tabWidths.current[activeTab] ?? 0;
      indicatorX.value = ax;
      indicatorW.value = aw;
      setMeasured(true);
    }
  }

  function handleSelect(tab) {
    onSelect(tab);
    const ax = tabOffsets.current[tab] ?? 0;
    const aw = tabWidths.current[tab] ?? 0;
    indicatorX.value = withSpring(ax, { damping: 20, stiffness: 200 });
    indicatorW.value = withSpring(aw, { damping: 20, stiffness: 200 });
  }

  return (
    <View style={styles.tabsWrapper}>
      {measured && (
        <Animated.View style={[styles.tabIndicator, indicatorStyle]} />
      )}
      {STATUS_TABS.map((tab) => (
        <TouchableOpacity
          key={tab}
          onPress={() => handleSelect(tab)}
          onLayout={(e) => {
            onTabLayout(tab, e.nativeEvent.layout.x, e.nativeEvent.layout.width);
          }}
          style={styles.tab}
          activeOpacity={0.75}
        >
          <Text
            style={[
              T.label,
              { color: activeTab === tab ? Colors.gold : Colors.text3 },
            ]}
          >
            {tab}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────

const OrderCard = React.memo(function OrderCard({ item: o, onAdvance, index }) {
  const status   = (o.status || 'pending').toLowerCase();
  const color    = STATUS_COLORS[status] || Colors.text3;
  const next     = NEXT_STATUS[status];
  const canAdvance = !!next;

  // Entrance animation — slide in from right, staggered
  const translateX = useSharedValue(60);
  const entryOpacity = useSharedValue(0);

  useEffect(() => {
    const delay = Math.min(index, 7) * 60;
    const timer = setTimeout(() => {
      translateX.value = withSpring(0, { damping: 18, stiffness: 160 });
      entryOpacity.value = withTiming(1, { duration: 280 });
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  const entryStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: entryOpacity.value,
  }));

  // Swipe gesture
  const swipeX = useSharedValue(0);
  const REVEAL_COLOR = canAdvance ? (STATUS_COLORS[next] || Colors.success) : Colors.text3;

  const panGesture = Gesture.Pan()
    .activeOffsetX([8, 9999]) // only trigger on rightward swipe start
    .onUpdate((e) => {
      if (!canAdvance) return;
      swipeX.value = Math.max(0, Math.min(e.translationX, 140));
    })
    .onEnd(() => {
      if (!canAdvance) return;
      if (swipeX.value > SWIPE_THRESHOLD) {
        runOnJS(onAdvance)(o.id || o._id, status);
        swipeX.value = withSpring(0, { damping: 20 });
      } else {
        swipeX.value = withSpring(0, { damping: 18 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.value }],
  }));

  const revealOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(swipeX.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));

  const items = o.items || [];
  const shownItems = items.slice(0, 3);
  const extraCount = items.length - 3;

  return (
    <Animated.View style={entryStyle}>
      {/* Reveal layer behind card */}
      <Animated.View style={[styles.revealLayer, { backgroundColor: REVEAL_COLOR + '28' }, revealOpacity]}>
        <View style={[styles.revealIcon, { backgroundColor: REVEAL_COLOR + '40' }]}>
          <Text style={{ color: REVEAL_COLOR, fontSize: 16 }}>→</Text>
        </View>
        <Text style={[T.label, { color: REVEAL_COLOR, marginLeft: 8 }]}>
          {next ? `Mark ${next.charAt(0).toUpperCase() + next.slice(1)}` : ''}
        </Text>
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.card, cardStyle]}>
          {/* Left colored border */}
          <View style={[styles.cardLeftBorder, { backgroundColor: color }]} />

          <View style={styles.cardContent}>
            {/* Top row */}
            <View style={styles.cardHeader}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[T.h2, { color: Colors.text1 }]} numberOfLines={1}>
                  {o.table_number ? `Table ${o.table_number}` : (o.order_type || 'Dine-in')}
                </Text>
                <Text style={[T.caption, { color: Colors.text3, marginTop: 2 }]}>
                  #{String(o.id || o._id || '').slice(-8)} · {timeAgo(o.created_at)}
                </Text>
              </View>
              <Text style={[T.numSm, { color: Colors.gold }]}>
                ₹{Number(o.total_amount || o.total || 0).toFixed(0)}
              </Text>
            </View>

            {/* Items */}
            <View style={styles.itemsBlock}>
              {shownItems.map((item, i) => (
                <View key={i} style={styles.itemRow}>
                  <Text style={[T.body, { color: Colors.text2, flex: 1 }]} numberOfLines={1}>
                    <Text style={[T.body, { color: Colors.text3 }]}>
                      {item.quantity || item.qty || 1}×{' '}
                    </Text>
                    {item.name || item.item_name || 'Item'}
                  </Text>
                  <Text style={[T.bodySm, { color: Colors.text3 }]}>
                    ₹{Number(item.price || item.amount || 0).toFixed(0)}
                  </Text>
                </View>
              ))}
              {extraCount > 0 && (
                <Text style={[T.caption, { color: Colors.text3, marginTop: 3 }]}>
                  +{extraCount} more item{extraCount > 1 ? 's' : ''}
                </Text>
              )}
            </View>

            {/* Bottom row */}
            <View style={styles.cardFooter}>
              {/* Status badge */}
              <View
                style={[
                  styles.statusBadge,
                  { borderColor: color + '45', backgroundColor: color + '16' },
                ]}
              >
                <View style={[styles.statusDot, { backgroundColor: color }]} />
                <Text style={[T.overline, { color }]}>{status}</Text>
              </View>

              {/* Advance button */}
              {canAdvance && (
                <TouchableOpacity
                  onPress={() => onAdvance(o.id || o._id, status)}
                  style={styles.advanceBtnWrap}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={STATUS_GRADIENT[next] || [Colors.indigo, '#3A3DC0']}
                    style={styles.advanceBtnInner}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text style={[T.label, { color: '#fff' }]}>
                      {next.charAt(0).toUpperCase() + next.slice(1)} →
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
});

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ label }) {
  const floatY = useSharedValue(0);

  useEffect(() => {
    floatY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 1600 }),
        withTiming(0, { duration: 1600 })
      ),
      -1,
      false
    );
  }, []);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
  }));

  return (
    <View style={styles.emptyWrap}>
      <Animated.View style={floatStyle}>
        <EmptyIllustration />
      </Animated.View>
      <Text style={[T.h2, { color: Colors.text2, marginTop: 20 }]}>
        No {label === 'All' ? '' : label.toLowerCase() + ' '}orders
      </Text>
      <Text style={[T.body, { color: Colors.text3, marginTop: 6, textAlign: 'center' }]}>
        Pull down to refresh, or check another status tab
      </Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function Orders() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab]   = useState('All');
  const [search, setSearch]         = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const searchWidth = useSharedValue(0);
  const searchOpacity = useSharedValue(0);

  const statusParam = activeTab === 'All' ? undefined : activeTab.toLowerCase();
  const { data, isLoading, refetch, isRefetching } = useOrders(
    statusParam ? { status: statusParam } : {}
  );
  const { mutate: updateStatus } = useUpdateOrderStatus();

  const orders  = data?.data || data?.orders || (Array.isArray(data) ? data : []);
  const filtered = search.trim()
    ? orders.filter((o) => {
        const q = search.toLowerCase();
        return (
          String(o.id || o._id || '').toLowerCase().includes(q) ||
          (o.order_type || '').toLowerCase().includes(q) ||
          String(o.table_number || '').includes(q)
        );
      })
    : orders;

  const handleAdvance = useCallback(
    (orderId, currentStatus) => {
      updateStatus({ orderId, status: NEXT_STATUS[currentStatus] });
    },
    [updateStatus]
  );

  function toggleSearch() {
    if (searchOpen) {
      setSearch('');
      searchWidth.value  = withTiming(0, { duration: 220 });
      searchOpacity.value = withTiming(0, { duration: 200 });
      setSearchOpen(false);
    } else {
      setSearchOpen(true);
      searchWidth.value  = withTiming(1, { duration: 250 });
      searchOpacity.value = withTiming(1, { duration: 240 });
    }
  }

  const searchBarStyle = useAnimatedStyle(() => ({
    flex: searchWidth.value,
    opacity: searchOpacity.value,
  }));

  const liveCount = orders.filter((o) =>
    ['pending', 'preparing', 'ready'].includes((o.status || '').toLowerCase())
  ).length;

  const renderItem = useCallback(
    ({ item, index }) => (
      <OrderCard item={item} onAdvance={handleAdvance} index={index} />
    ),
    [handleAdvance]
  );

  const keyExtractor = useCallback(
    (o) => String(o.id || o._id || Math.random()),
    []
  );

  const Separator = useCallback(() => <View style={{ height: 12 }} />, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>

        {/* ── Header ── */}
        <LinearGradient
          colors={['#0D1F3C', '#0A1628', Colors.bg]}
          style={[styles.header, { paddingTop: insets.top + 10 }]}
        >
          {/* Title row */}
          <View style={styles.titleRow}>
            <View style={styles.titleLeft}>
              <Text style={[T.h1, { color: Colors.text1 }]}>Orders</Text>
              {liveCount > 0 && (
                <View style={styles.liveBadge}>
                  <PulsingDot color={Colors.success} />
                  <Text style={[T.labelSm, { color: Colors.success, marginLeft: 5 }]}>
                    {liveCount} live
                  </Text>
                </View>
              )}
            </View>

            {/* Search toggle + input */}
            <View style={styles.searchRow}>
              <Animated.View style={[styles.searchInput, searchBarStyle]}>
                {searchOpen && (
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Table, order ID..."
                    placeholderTextColor={Colors.text3}
                    style={[T.body, { flex: 1, color: Colors.text1 }]}
                    autoFocus
                  />
                )}
              </Animated.View>
              <TouchableOpacity
                onPress={toggleSearch}
                style={styles.searchToggle}
                activeOpacity={0.75}
              >
                <Text style={{ color: Colors.text2, fontSize: 16 }}>
                  {searchOpen ? '✕' : '⌕'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Stats bar */}
          {!isLoading && orders.length > 0 && <StatsBar orders={orders} />}

          {/* Filter tabs */}
          <FilterTabs activeTab={activeTab} onSelect={setActiveTab} />
        </LinearGradient>

        {/* ── Content ── */}
        {isLoading ? (
          <View style={{ padding: 16, gap: 12 }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : (
          <FlashList
            data={filtered}
            estimatedItemSize={180}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: insets.bottom + 90,
            }}
            ItemSeparatorComponent={Separator}
            refreshing={isRefetching}
            onRefresh={refetch}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<EmptyState label={activeTab} />}
          />
        )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header
  header: {
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '18',
    borderColor: Colors.success + '40',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchInput: {
    backgroundColor: Colors.surface2,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 7 : 4,
    minWidth: 0,
    overflow: 'hidden',
  },
  searchToggle: {
    width: 34,
    height: 34,
    backgroundColor: Colors.surface2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Stats bar
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  statsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
    gap: 5,
  },
  statsDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statsDivider: {
    width: 1,
    height: 12,
    backgroundColor: Colors.border,
  },

  // Tabs
  tabsWrapper: {
    flexDirection: 'row',
    position: 'relative',
    marginBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    backgroundColor: Colors.gold,
    borderRadius: 1,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },

  // Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  cardLeftBorder: {
    width: 3,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  cardContent: {
    flex: 1,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  itemsBlock: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 9,
    marginBottom: 11,
    gap: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  advanceBtnWrap: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  advanceBtnInner: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },

  // Swipe reveal
  revealLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
  },
  revealIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Skeleton
  skeletonLeftBorder: {
    width: 3,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  skeletonBar: {
    backgroundColor: Colors.surface2,
    borderRadius: 5,
  },

  // Empty
  emptyWrap: {
    marginTop: 60,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
});
