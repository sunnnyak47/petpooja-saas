/**
 * Dashboard — MS RM Owner
 * Bloomberg Terminal × Premium Fintech
 * Expo SDK 54 · React Native 0.81 · Reanimated 3 · RNGH 2 · react-native-svg
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Platform,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  withDelay,
  interpolate,
  runOnJS,
  Easing,
  cancelAnimation,
  useAnimatedReaction,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Svg, {
  Circle,
  Rect,
  Defs,
  LinearGradient as SvgGrad,
  Stop,
  Polyline,
  Path,
  G,
  Text as SvgText,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import {
  useDashboard,
  useOrders,
  useUpdateOrderStatus,
} from '../../src/hooks/useApi';
import { Colors } from '../../src/constants/colors';
import { T } from '../../src/constants/typography';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_PAD = 16;
const HERO_W = SCREEN_W - CARD_PAD * 2;

// ─── Utility: format currency ─────────────────────────────────────────────────
function fmt(v) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
  return `₹${Math.round(v)}`;
}

// ─── Animated counter ─────────────────────────────────────────────────────────
function useAnimatedCounter(target, duration = 1200) {
  const [display, setDisplay] = useState(0);
  const progress = useSharedValue(0);

  useAnimatedReaction(
    () => progress.value,
    (val) => {
      const current = Math.round(val * target);
      runOnJS(setDisplay)(current);
    }
  );

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [target]);

  return display;
}

// ─── Skeleton pulse ───────────────────────────────────────────────────────────
function Skeleton({ w, h, radius = 8, style }) {
  const opacity = useSharedValue(0.25);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 750, easing: Easing.inOut(Easing.sine) }),
        withTiming(0.25, { duration: 750, easing: Easing.inOut(Easing.sine) })
      ),
      -1,
      false
    );
    return () => cancelAnimation(opacity);
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          width: w,
          height: h,
          borderRadius: radius,
          backgroundColor: Colors.surface2,
        },
        animStyle,
        style,
      ]}
    />
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Spark({ data = [], color = Colors.gold, w = 80, h = 30 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const rng = max - min || 1;

  const pts = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * w},${h - ((v - min) / rng) * (h - 4) - 2}`
    )
    .join(' ');

  // Area fill path
  const first = `0,${h}`;
  const last = `${w},${h}`;
  const areaPts = `${first} ${pts} ${last}`;

  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgGrad id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={color} stopOpacity="0.2" />
          <Stop offset="1" stopColor={color} stopOpacity="0.9" />
        </SvgGrad>
        <SvgGrad id={`area-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.25" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </SvgGrad>
      </Defs>
      <Path
        d={`M ${areaPts} Z`}
        fill={`url(#area-${color.replace('#', '')})`}
      />
      <Polyline
        points={pts}
        fill="none"
        stroke={`url(#sg-${color.replace('#', '')})`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Animated Ring Gauge ──────────────────────────────────────────────────────
function RingGauge({ pct = 0, size = 76, stroke = 6, color = Colors.indigo, value, label }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const progress = useSharedValue(0);
  const glowOpacity = useSharedValue(0.4);

  // Animated SVG stroke via JS-driven state
  const [dashVal, setDashVal] = useState(0);
  const [dotPos, setDotPos] = useState({ x: size / 2, y: stroke / 2 });

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(Math.min(pct, 1), {
      duration: 1400,
      easing: Easing.out(Easing.cubic),
    });

    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sine) }),
        withTiming(0.3, { duration: 900, easing: Easing.inOut(Easing.sine) })
      ),
      -1,
      false
    );
    return () => {
      cancelAnimation(progress);
      cancelAnimation(glowOpacity);
    };
  }, [pct]);

  useAnimatedReaction(
    () => progress.value,
    (val) => {
      const dash = circ * val;
      runOnJS(setDashVal)(dash);

      // Compute tip dot position (arc starts at top, goes clockwise)
      const angle = -Math.PI / 2 + 2 * Math.PI * val;
      const cx = size / 2 + r * Math.cos(angle);
      const cy = size / 2 + r * Math.sin(angle);
      runOnJS(setDotPos)({ x: cx, y: cy });
    }
  );

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          {/* Track */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color + '20'}
            strokeWidth={stroke}
            fill="none"
          />
          {/* Filled arc */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${dashVal} ${circ}`}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2},${size / 2}`}
          />
          {/* Glow dot at tip */}
          {dashVal > 2 && (
            <Circle
              cx={dotPos.x}
              cy={dotPos.y}
              r={stroke / 2 + 1.5}
              fill={color}
              opacity={0.9}
            />
          )}
        </Svg>

        {/* Glow halo around tip */}
        {dashVal > 2 && (
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: dotPos.x - (stroke + 6),
                top: dotPos.y - (stroke + 6),
                width: (stroke + 6) * 2,
                height: (stroke + 6) * 2,
                borderRadius: stroke + 6,
                backgroundColor: color,
              },
              glowStyle,
            ]}
          />
        )}

        {/* Center label */}
        <View style={styles.ringCenter}>
          <Text style={{ fontSize: 13, fontWeight: '700', color, lineHeight: 16 }}>
            {value}
          </Text>
        </View>
      </View>
      <Text style={[styles.ringLabel, { color: Colors.text3 }]}>{label}</Text>
    </View>
  );
}

// ─── Animated 3D Hero Revenue Card ───────────────────────────────────────────
function HeroRevenueCard({ revenue, orders, avgOrder, revenuePct, weekData }) {
  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);
  const scale = useSharedValue(1);

  const displayRevenue = useAnimatedCounter(revenue, 1400);
  const displayOrders = useAnimatedCounter(orders, 1000);
  const displayAvg = useAnimatedCounter(Math.round(avgOrder), 1200);

  const tiltGesture = Gesture.Pan()
    .onBegin(() => {
      scale.value = withSpring(1.01, { damping: 20 });
    })
    .onUpdate((e) => {
      rotateY.value = interpolate(
        e.translationX,
        [-HERO_W / 2, HERO_W / 2],
        [-12, 12]
      );
      rotateX.value = interpolate(
        e.translationY,
        [-80, 80],
        [8, -8]
      );
    })
    .onEnd(() => {
      rotateX.value = withSpring(0, { damping: 15, stiffness: 120 });
      rotateY.value = withSpring(0, { damping: 15, stiffness: 120 });
      scale.value = withSpring(1, { damping: 20 });
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { rotateX: `${rotateX.value}deg` },
      { rotateY: `${rotateY.value}deg` },
      { scale: scale.value },
    ],
  }));

  const pctDisplay = Math.round(revenuePct * 100);

  return (
    <GestureDetector gesture={tiltGesture}>
      <Animated.View style={[styles.heroCard3d, cardStyle]}>
        {/* Base gradient */}
        <LinearGradient
          colors={['#1C2E50', '#0D1F3C', '#080F1E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Gold shimmer overlay */}
        <LinearGradient
          colors={[Colors.gold + '08', 'transparent', Colors.gold + '05']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
        />

        {/* Header row */}
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.heroEyebrow}>TODAY'S REVENUE</Text>
            <Text style={styles.heroRevenue}>
              {fmt(displayRevenue)}
            </Text>
          </View>
          <View style={styles.targetBadge}>
            <Text style={styles.targetBadgeText}>{pctDisplay}% target</Text>
          </View>
        </View>

        {/* Sparkline */}
        <View style={{ marginTop: 8, marginBottom: 12 }}>
          <Spark data={weekData} color={Colors.gold} w={HERO_W - 40} h={44} />
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <LinearGradient
            colors={[Colors.goldDim, Colors.gold, Colors.goldBright]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${pctDisplay}%` }]}
          />
        </View>

        {/* Mini stats row */}
        <View style={styles.heroStats}>
          <View style={styles.heroStatItem}>
            <Text style={styles.heroStatValue}>{displayOrders}</Text>
            <Text style={styles.heroStatLabel}>Orders</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStatItem}>
            <Text style={styles.heroStatValue}>₹{displayAvg}</Text>
            <Text style={styles.heroStatLabel}>Avg Value</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStatItem}>
            <Text style={[styles.heroStatValue, { color: Colors.success }]}>
              {pctDisplay}%
            </Text>
            <Text style={styles.heroStatLabel}>vs Target</Text>
          </View>
        </View>

        {/* Glassmorphism border glow */}
        <View style={styles.glassBorderTop} />
        <View style={styles.glassBorderLeft} />
      </Animated.View>
    </GestureDetector>
  );
}

// ─── Floating Stat Pill ───────────────────────────────────────────────────────
function StatPill({ label, value, color, sparkData, index }) {
  const translateY = useSharedValue(20);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const delay = index * 120;
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) })
    );
    translateY.value = withDelay(
      delay,
      withSpring(0, { damping: 18, stiffness: 180 })
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.statPill, { borderColor: color + '30' }, animStyle]}>
      <LinearGradient
        colors={[color + '15', color + '05']}
        style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
      />
      <View style={[styles.statPillDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.statPillLabel, { color: Colors.text3 }]}>{label}</Text>
        <Text style={[styles.statPillValue, { color }]}>{value}</Text>
      </View>
      <Spark data={sparkData} color={color} w={44} h={22} />
    </Animated.View>
  );
}

// ─── Animated Weekly Bar Chart ────────────────────────────────────────────────
function WeeklyBars({ data = [] }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const max = Math.max(...data, 1);
  const CHART_H = 100;
  const CHART_W = SCREEN_W - CARD_PAD * 2 - 32;
  const barW = 26;
  const totalBars = Math.min(data.length, 7);
  const gap = CHART_W / totalBars;

  const [activeBar, setActiveBar] = useState(data.length - 1);
  const [barHeights, setBarHeights] = useState(new Array(totalBars).fill(0));

  useEffect(() => {
    // Staggered bar growth
    data.slice(0, totalBars).forEach((v, i) => {
      setTimeout(() => {
        const bh = Math.max((v / max) * CHART_H, 4);
        setBarHeights((prev) => {
          const next = [...prev];
          next[i] = bh;
          return next;
        });
      }, i * 80);
    });
  }, [data.join(',')]);

  const todayVal = data[data.length - 1] || 0;

  return (
    <View>
      <Svg width={CHART_W} height={CHART_H + 40}>
        <Defs>
          {data.slice(0, totalBars).map((_, i) => (
            <SvgGrad key={i} id={`bar${i}`} x1="0" y1="0" x2="0" y2="1">
              <Stop
                offset="0"
                stopColor={i === activeBar ? Colors.gold : Colors.indigo}
                stopOpacity="1"
              />
              <Stop
                offset="1"
                stopColor={i === activeBar ? Colors.goldDim : Colors.indigoDim}
                stopOpacity="0.3"
              />
            </SvgGrad>
          ))}
        </Defs>

        {data.slice(0, totalBars).map((v, i) => {
          const bh = barHeights[i];
          const x = i * gap + (gap - barW) / 2;
          const isActive = i === activeBar;
          return (
            <G key={i}>
              {/* Bar shadow */}
              {isActive && (
                <Rect
                  x={x + 2}
                  y={CHART_H - bh + 4}
                  width={barW}
                  height={bh}
                  rx={6}
                  fill={Colors.gold}
                  opacity={0.2}
                />
              )}
              {/* Bar */}
              <Rect
                x={x}
                y={CHART_H - bh}
                width={barW}
                height={bh}
                rx={6}
                fill={`url(#bar${i})`}
                onPress={() => setActiveBar(i)}
              />
              {/* Day label */}
              <SvgText
                x={x + barW / 2}
                y={CHART_H + 18}
                textAnchor="middle"
                fontSize={10}
                fill={isActive ? Colors.gold : Colors.text3}
                fontWeight={isActive ? '700' : '400'}
              >
                {days[i] || `D${i + 1}`}
              </SvgText>
            </G>
          );
        })}
      </Svg>

      {/* Tooltip for active bar */}
      {activeBar !== null && data[activeBar] !== undefined && (
        <View
          style={[
            styles.barTooltip,
            {
              left:
                activeBar * (CHART_W / totalBars) +
                (CHART_W / totalBars - barW) / 2 -
                16,
            },
          ]}
        >
          <LinearGradient
            colors={[Colors.surface2, Colors.surface]}
            style={[StyleSheet.absoluteFill, { borderRadius: 8 }]}
          />
          <Text style={styles.tooltipText}>{fmt(data[activeBar])}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Stat bar (channel mix) ───────────────────────────────────────────────────
function StatBar({ label, pct = 0, color, delay = 0 }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setWidth(Math.round(pct * 100));
    }, delay + 200);
    return () => clearTimeout(t);
  }, [pct]);

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={styles.statBarRow}>
        <Text style={[styles.statBarLabel, { color: Colors.text2 }]}>{label}</Text>
        <Text style={[styles.statBarPct, { color }]}>{Math.round(pct * 100)}%</Text>
      </View>
      <View style={styles.statTrack}>
        <LinearGradient
          colors={[color + 'aa', color]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.statFill, { width: `${width}%` }]}
        />
      </View>
    </View>
  );
}

// ─── Order Card with slide-in + swipe gesture ─────────────────────────────────
const STATUS_COLORS = {
  pending: Colors.warning,
  preparing: Colors.indigo,
  ready: Colors.success,
  delivered: Colors.text3,
  cancelled: Colors.error,
};

const STATUS_NEXT = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
  delivered: 'delivered',
  cancelled: 'cancelled',
};

function OrderCard({ item: o, onStatusChange, index }) {
  const translateX = useSharedValue(SCREEN_W);
  const swipeX = useSharedValue(0);
  const swipeScale = useSharedValue(1);
  const swipeOpacity = useSharedValue(0);

  const status = (o.status || 'pending').toLowerCase();
  const statusColor = STATUS_COLORS[status] || Colors.text3;
  const nextStatus = STATUS_NEXT[status];
  const canAdvance = nextStatus !== status;

  useEffect(() => {
    translateX.value = withDelay(
      index * 60,
      withSpring(0, { damping: 20, stiffness: 200 })
    );
  }, []);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([10, SCREEN_W])
    .onUpdate((e) => {
      if (!canAdvance) return;
      swipeX.value = Math.max(0, Math.min(e.translationX, 80));
      swipeOpacity.value = interpolate(swipeX.value, [0, 60], [0, 1]);
    })
    .onEnd((e) => {
      if (!canAdvance) {
        swipeX.value = withSpring(0);
        return;
      }
      if (e.translationX > 55) {
        swipeX.value = withSpring(0);
        swipeOpacity.value = withTiming(0);
        runOnJS(onStatusChange)(o.id || o._id, status);
      } else {
        swipeX.value = withSpring(0);
        swipeOpacity.value = withTiming(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateX: swipeX.value * 0.4 },
    ],
  }));

  const actionStyle = useAnimatedStyle(() => ({
    opacity: swipeOpacity.value,
    transform: [{ scale: interpolate(swipeOpacity.value, [0, 1], [0.8, 1]) }],
  }));

  const total = Number(o.total_amount || o.total || 0);
  const orderId = String(o.id || o._id || '').slice(-6);
  const itemCount = o.items_count ?? o.items?.length ?? '–';
  const tableOrType = o.table_number ? `Table ${o.table_number}` : o.order_type || 'Dine-in';

  return (
    <GestureDetector gesture={swipeGesture}>
      <Animated.View style={[styles.orderCardWrap, cardStyle]}>
        {/* Swipe action indicator */}
        <Animated.View style={[styles.swipeAction, actionStyle]}>
          <LinearGradient
            colors={[STATUS_COLORS[nextStatus] + '30', STATUS_COLORS[nextStatus] + '10']}
            style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
          />
          <Text style={[styles.swipeActionText, { color: STATUS_COLORS[nextStatus] }]}>
            → {nextStatus}
          </Text>
        </Animated.View>

        <LinearGradient
          colors={[Colors.surface, Colors.surface + 'F0']}
          style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
        />

        <View style={styles.orderCard}>
          {/* Status dot */}
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />

          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.orderTitle}>{tableOrType}</Text>
            <Text style={styles.orderSub}>
              #{orderId} · {itemCount} items
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end', gap: 5 }}>
            <Text style={styles.orderAmount}>₹{total.toFixed(0)}</Text>
            <TouchableOpacity
              onPress={() => onStatusChange(o.id || o._id, status)}
              style={[
                styles.statusPill,
                {
                  borderColor: statusColor + '50',
                  backgroundColor: statusColor + '18',
                },
              ]}
              activeOpacity={0.7}
            >
              <View style={[styles.statusPillDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusPillText, { color: statusColor }]}>
                {status}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}
OrderCard.displayName = 'OrderCard';
const MemoOrderCard = React.memo(OrderCard);

// ─── Spinning logo for pull-to-refresh ───────────────────────────────────────
function RefreshLogo({ refreshing }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (refreshing) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 800, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(rotation);
      rotation.value = withTiming(0, { duration: 200 });
    }
  }, [refreshing]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={[styles.refreshLogo, spinStyle]}>
      <LinearGradient
        colors={[Colors.gold, Colors.goldBright]}
        style={styles.refreshLogoInner}
      >
        <Text style={styles.refreshLogoText}>M</Text>
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Dashboard skeleton ───────────────────────────────────────────────────────
function DashboardSkeleton({ insets }) {
  return (
    <ScrollView
      contentContainerStyle={{
        padding: CARD_PAD,
        gap: 12,
        paddingTop: insets.top + 80,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Skeleton w="100%" h={200} radius={20} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} w={(SCREEN_W - 48) / 3} h={72} radius={14} />
        ))}
      </View>
      <Skeleton w="100%" h={160} radius={14} style={{ marginTop: 8 }} />
      <Skeleton w="100%" h={130} radius={14} />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} w="100%" h={68} radius={14} />
      ))}
    </ScrollView>
  );
}

// ─── LIVE indicator ───────────────────────────────────────────────────────────
function LiveDot() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.6, { duration: 600, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 600, easing: Easing.in(Easing.quad) })
      ),
      -1,
      false
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 600 }),
        withTiming(1, { duration: 600 })
      ),
      -1,
      false
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, []);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: Colors.success + '40',
        }}
      />
      <Animated.View
        style={[
          {
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: Colors.success,
          },
          dotStyle,
        ]}
      />
    </View>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? (
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const scrollRef = useRef(null);

  const {
    data: dashData,
    isLoading: dashLoading,
    refetch: refetchDash,
    isRefetching,
  } = useDashboard();

  const {
    data: ordersData,
    isLoading: ordersLoading,
    refetch: refetchOrders,
  } = useOrders({ limit: 30, status: 'active' });

  const { mutate: updateStatus } = useUpdateOrderStatus();

  const onRefresh = useCallback(async () => {
    await Promise.all([refetchDash(), refetchOrders()]);
  }, [refetchDash, refetchOrders]);

  const handleStatusChange = useCallback(
    (orderId, currentStatus) => {
      const next = STATUS_NEXT[currentStatus.toLowerCase()] || 'pending';
      updateStatus({ orderId, status: next });
    },
    [updateStatus]
  );

  // ── Extract data ──────────────────────────────────────────────────────────
  const d = useMemo(() => dashData?.data || dashData || {}, [dashData]);

  const revenue = Number(d.today_revenue || d.revenue || 0);
  const orders = Number(d.total_orders || d.orders_count || 0);
  const avgOrder = orders > 0 ? revenue / orders : 0;
  const activeOrders = Number(d.active_orders || d.pending_orders || 0);
  const revenueTarget = Number(d.revenue_target || 50000);
  const revenuePct = Math.min(revenue / revenueTarget, 1);

  const weekData = useMemo(
    () => d.weekly_revenue || [4200, 5800, 3900, 7100, 6300, 8200, revenue || 5000],
    [d.weekly_revenue, revenue]
  );

  const orderList = useMemo(
    () => ordersData?.data || ordersData?.orders || ordersData || [],
    [ordersData]
  );

  const satisfaction = Number(d.satisfaction || 0.88);
  const tableTurn = Number(d.table_turn || 0.72);
  const dineInPct = Number(d.dine_in_pct || 0.55);
  const takeawayPct = Number(d.takeaway_pct || 0.28);
  const deliveryPct = Number(d.delivery_pct || 0.17);

  // Mini sparklines for stat pills
  const weekMini = weekData.slice(-5);
  const orderMini = weekData.map((v) => v * 0.08);
  const avgMini = weekData.map((v) => v * 0.012);

  if (dashLoading && !d.today_revenue) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <DashboardSkeleton insets={insets} />
      </View>
    );
  }

  const renderOrderItem = ({ item, index }) => (
    <MemoOrderCard
      item={item}
      onStatusChange={handleStatusChange}
      index={index}
    />
  );

  const renderSeparator = () => <View style={{ height: 8 }} />;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        {/* ── Fixed Header ─────────────────────────────────────────────── */}
        <LinearGradient
          colors={['#0D1F3C', '#0A1628', Colors.bg + 'F8']}
          style={[styles.header, { paddingTop: insets.top + 8 }]}
        >
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.brandLabel}>MS RM OWNER</Text>
              <Text style={styles.restaurantName}>
                {user?.name || user?.restaurant_name || 'Dashboard'}
              </Text>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.liveChip}>
                <LiveDot />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
              <TouchableOpacity onPress={logout} style={styles.exitBtn} activeOpacity={0.7}>
                <Text style={styles.exitText}>Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>

        {/* ── Scrollable Body ──────────────────────────────────────────── */}
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor="transparent"
              title=""
              progressViewOffset={insets.top + 56}
            />
          }
          contentContainerStyle={{
            paddingTop: 8,
            paddingBottom: insets.bottom + 90,
          }}
        >
          {/* Pull indicator */}
          {isRefetching && (
            <View style={styles.refreshRow}>
              <RefreshLogo refreshing={isRefetching} />
            </View>
          )}

          {/* ── Floating Stat Pills ───────────────────────────────────── */}
          <View style={styles.pillsRow}>
            <StatPill
              label="Revenue"
              value={fmt(revenue)}
              color={Colors.gold}
              sparkData={weekMini}
              index={0}
            />
            <StatPill
              label="Orders"
              value={String(orders)}
              color={Colors.indigo}
              sparkData={orderMini}
              index={1}
            />
            <StatPill
              label="Avg Order"
              value={`₹${Math.round(avgOrder)}`}
              color={Colors.success}
              sparkData={avgMini}
              index={2}
            />
          </View>

          {/* ── 3D Hero Revenue Card ──────────────────────────────────── */}
          <View style={styles.section}>
            <HeroRevenueCard
              revenue={revenue}
              orders={orders}
              avgOrder={avgOrder}
              revenuePct={revenuePct}
              weekData={weekData}
            />
          </View>

          {/* ── Ring Gauges ───────────────────────────────────────────── */}
          <View style={styles.section}>
            <SectionHeader title="Performance" subtitle="Live metrics" />
            <View style={styles.card}>
              <View style={styles.ringsRow}>
                <RingGauge
                  pct={revenuePct}
                  value={`${Math.round(revenuePct * 100)}%`}
                  label="Revenue"
                  color={Colors.gold}
                />
                <RingGauge
                  pct={Math.min(orders / 100, 1)}
                  value={String(orders)}
                  label="Orders"
                  color={Colors.indigo}
                />
                <RingGauge
                  pct={satisfaction}
                  value={`${Math.round(satisfaction * 100)}%`}
                  label="Rating"
                  color={Colors.success}
                />
                <RingGauge
                  pct={tableTurn}
                  value={`${Math.round(tableTurn * 100)}%`}
                  label="Tables"
                  color={Colors.warning}
                />
              </View>
            </View>
          </View>

          {/* ── Weekly Bar Chart ──────────────────────────────────────── */}
          <View style={styles.section}>
            <SectionHeader title="Weekly Revenue" subtitle="Tap a bar for details" />
            <View style={styles.card}>
              <WeeklyBars data={weekData} />
            </View>
          </View>

          {/* ── Channel Mix ───────────────────────────────────────────── */}
          <View style={styles.section}>
            <SectionHeader title="Channel Mix" />
            <View style={styles.card}>
              <StatBar label="Dine-in" pct={dineInPct} color={Colors.indigo} delay={0} />
              <StatBar label="Takeaway" pct={takeawayPct} color={Colors.gold} delay={150} />
              <StatBar label="Delivery" pct={deliveryPct} color={Colors.success} delay={300} />
            </View>
          </View>

          {/* ── Live Orders ───────────────────────────────────────────── */}
          <View style={styles.section}>
            <SectionHeader
              title="Live Orders"
              subtitle={
                activeOrders > 0
                  ? `${activeOrders} active · swipe right to advance`
                  : 'Swipe right to advance status'
              }
            />
            {ordersLoading ? (
              <View style={{ gap: 8 }}>
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} w="100%" h={68} radius={14} />
                ))}
              </View>
            ) : orderList.length === 0 ? (
              <View style={[styles.card, styles.emptyCard]}>
                <Text style={styles.emptyIcon}>🍽</Text>
                <Text style={styles.emptyText}>No active orders right now</Text>
                <Text style={styles.emptySubtext}>New orders will appear here in real-time</Text>
              </View>
            ) : (
              <FlashList
                data={orderList}
                estimatedItemSize={76}
                keyExtractor={(o) => String(o.id || o._id || Math.random())}
                renderItem={renderOrderItem}
                ItemSeparatorComponent={renderSeparator}
                scrollEnabled={false}
              />
            )}
          </View>
        </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Header
  header: {
    paddingHorizontal: CARD_PAD,
    paddingBottom: 14,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  brandLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: Colors.gold,
    marginBottom: 2,
  },
  restaurantName: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text1,
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.successBg,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.success,
    letterSpacing: 1.2,
  },
  exitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  exitText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text3,
  },

  // Pull to refresh
  refreshRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  refreshLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  refreshLogoInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshLogoText: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.primary,
  },

  // Stat pills row
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: CARD_PAD,
    marginBottom: 4,
    marginTop: 4,
  },
  statPill: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
    minHeight: 64,
  },
  statPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statPillLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statPillValue: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  // Layout
  section: {
    paddingHorizontal: CARD_PAD,
    marginTop: 18,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text1,
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: Colors.text3,
    fontWeight: '500',
  },

  // 3D Hero card
  heroCard3d: {
    width: HERO_W,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.goldDim + '50',
    overflow: 'hidden',
    // Shadow
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: Colors.text3,
    marginBottom: 4,
  },
  heroRevenue: {
    fontSize: 40,
    fontWeight: '900',
    color: Colors.gold,
    letterSpacing: -1.5,
    lineHeight: 44,
  },
  targetBadge: {
    backgroundColor: Colors.goldDim + '30',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.goldDim + '50',
  },
  targetBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.gold,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.surface2,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text1,
    letterSpacing: -0.5,
  },
  heroStatLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: Colors.text3,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  heroStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  // Glassmorphism edges
  glassBorderTop: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 1,
  },
  glassBorderLeft: {
    position: 'absolute',
    top: 24,
    bottom: 24,
    left: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 1,
  },

  // Ring gauges
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 6,
  },
  ringCenter: {
    position: 'absolute',
    inset: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 6,
    letterSpacing: 0.3,
  },

  // Bar chart tooltip
  barTooltip: {
    position: 'absolute',
    top: -32,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  tooltipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.gold,
  },

  // Stat bars
  statBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statBarLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  statBarPct: {
    fontSize: 13,
    fontWeight: '700',
  },
  statTrack: {
    height: 6,
    backgroundColor: Colors.surface2,
    borderRadius: 3,
    overflow: 'hidden',
  },
  statFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Order cards
  orderCardWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  swipeAction: {
    position: 'absolute',
    inset: 0,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 20,
    borderRadius: 14,
    overflow: 'hidden',
    zIndex: 0,
  },
  swipeActionText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    zIndex: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 2,
  },
  orderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text1,
    letterSpacing: -0.1,
  },
  orderSub: {
    fontSize: 11,
    color: Colors.text3,
    marginTop: 2,
    fontWeight: '500',
  },
  orderAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.gold,
    letterSpacing: -0.3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusPillDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Empty state
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text2,
  },
  emptySubtext: {
    fontSize: 12,
    color: Colors.text3,
    textAlign: 'center',
  },
});
