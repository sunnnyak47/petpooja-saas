/**
 * Reports Screen — Bloomberg/Robinhood-style analytics
 * Expo 54 · RN 0.81 · Reanimated 4 · react-native-svg 15 · FlashList 2
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';
import Svg, {
  Path,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
  Circle,
  G,
  Text as SvgText,
  Line,
} from 'react-native-svg';
import { useReports } from '../../src/hooks/useApi';
import { Colors } from '../../src/constants/colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_H = 200;
const CHART_PADDING_L = 48;
const CHART_PADDING_R = 16;
const CHART_PADDING_T = 16;
const CHART_PADDING_B = 32;
const CHART_W = SCREEN_W - 32; // card padding

const RANGES = ['Today', '7D', '30D', '3M'];
const RANGE_MAP = { Today: 'today', '7D': '7d', '30D': '30d', '3M': '3m' };

const C = Colors;

// ─── Mock / Fallback Data ─────────────────────────────────────────────────────

function buildMock(range) {
  const points = range === 'Today' ? 12 : range === '7D' ? 7 : range === '30D' ? 30 : 12;
  const revenue = Array.from({ length: points }, (_, i) => {
    const base = 18000 + Math.sin(i * 0.8) * 5000 + i * 400;
    return Math.max(5000, base + (Math.random() - 0.4) * 3000);
  });
  const labels =
    range === 'Today'
      ? ['8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p']
      : range === '7D'
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      : range === '30D'
      ? Array.from({ length: 30 }, (_, i) => (i % 5 === 0 ? `${i + 1}` : ''))
      : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const totalRevenue = revenue.reduce((a, b) => a + b, 0);
  const totalOrders = Math.round(totalRevenue / 480);

  return {
    revenue_series: revenue,
    revenue_labels: labels,
    total_revenue: totalRevenue,
    total_orders: totalOrders,
    avg_order_value: totalRevenue / totalOrders,
    best_day: range === '7D' ? 'Saturday' : range === 'Today' ? '1 PM' : 'Week 3',
    revenue_change: 12.4,
    orders_change: 8.1,
    avg_order_change: 3.9,
    best_day_change: 5.2,
    order_types: [
      { label: 'Dine-in', value: 48, color: C.indigo },
      { label: 'Takeaway', value: 32, color: C.gold },
      { label: 'Delivery', value: 20, color: C.success },
    ],
    top_items: [
      { id: 1, name: 'Butter Chicken', qty: 312, revenue: 74880 },
      { id: 2, name: 'Dal Makhani', qty: 280, revenue: 50400 },
      { id: 3, name: 'Paneer Tikka', qty: 254, revenue: 63500 },
      { id: 4, name: 'Chicken Biryani', qty: 231, revenue: 92400 },
      { id: 5, name: 'Naan Basket', qty: 198, revenue: 19800 },
      { id: 6, name: 'Masala Chai', qty: 185, revenue: 9250 },
      { id: 7, name: 'Gulab Jamun', qty: 167, revenue: 16700 },
      { id: 8, name: 'Lassi', qty: 142, revenue: 14200 },
      { id: 9, name: 'Samosa Chaat', qty: 128, revenue: 19200 },
      { id: 10, name: 'Tandoori Roti', qty: 112, revenue: 5600 },
    ],
    peak_hours: buildPeakHours(),
  };
}

function buildPeakHours() {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const hours = [8, 10, 12, 14, 16, 18, 20, 22]; // 8 slots
  return days.map((day, di) =>
    hours.map((h) => {
      const lunchBump = h >= 12 && h <= 14 ? 0.6 : 0;
      const dinnerBump = h >= 18 && h <= 20 ? 0.7 : 0;
      const weekendBump = di >= 5 ? 0.2 : 0;
      const val = Math.min(1, 0.1 + lunchBump + dinnerBump + weekendBump + Math.random() * 0.2);
      return { day, hour: h, value: val };
    })
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (!n) return '₹0';
  const num = parseFloat(n);
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
  return `₹${num.toFixed(0)}`;
}

function fmtShort(n) {
  if (n >= 100000) return `${(n / 100000).toFixed(0)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return `${Math.round(n)}`;
}

function buildAreaPath(data, w, h) {
  if (!data || data.length < 2) return { line: '', area: '' };
  const minV = Math.min(...data) * 0.9;
  const maxV = Math.max(...data) * 1.05;
  const range = maxV - minV || 1;
  const innerW = w - CHART_PADDING_L - CHART_PADDING_R;
  const innerH = h - CHART_PADDING_T - CHART_PADDING_B;

  const pts = data.map((v, i) => ({
    x: CHART_PADDING_L + (i / (data.length - 1)) * innerW,
    y: CHART_PADDING_T + innerH - ((v - minV) / range) * innerH,
  }));

  // Smooth cubic bezier
  let line = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cp1x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) / 3;
    const cp1y = pts[i - 1].y;
    const cp2x = pts[i].x - (pts[i].x - pts[i - 1].x) / 3;
    const cp2y = pts[i].y;
    line += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${pts[i].x} ${pts[i].y}`;
  }

  const bottom = CHART_PADDING_T + innerH;
  const area =
    line +
    ` L ${pts[pts.length - 1].x} ${bottom} L ${pts[0].x} ${bottom} Z`;

  return { line, area, pts, minV, maxV };
}

// ─── Animated Pill Selector ───────────────────────────────────────────────────

function RangeSelector({ selected, onChange }) {
  const pillWidth = (SCREEN_W - 32 - 8) / RANGES.length; // card - gap
  const selectedIdx = RANGES.indexOf(selected);
  const slideX = useSharedValue(selectedIdx * pillWidth);

  useEffect(() => {
    slideX.value = withSpring(selectedIdx * pillWidth, {
      damping: 18,
      stiffness: 200,
    });
  }, [selectedIdx, pillWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
  }));

  return (
    <View style={rs.track}>
      <Animated.View style={[rs.indicator, { width: pillWidth }, indicatorStyle]} />
      {RANGES.map((r) => (
        <TouchableOpacity
          key={r}
          style={[rs.pill, { width: pillWidth }]}
          onPress={() => onChange(r)}
          activeOpacity={0.8}
        >
          <Text style={[rs.pillText, selected === r && rs.pillTextActive]}>
            {r}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const rs = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: C.surface2,
    borderRadius: 12,
    padding: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    height: 32,
    borderRadius: 9,
    backgroundColor: C.indigo,
  },
  pill: {
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  pillText: { fontSize: 13, fontWeight: '600', color: C.text3 },
  pillTextActive: { color: C.text1 },
});

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, change, index }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    opacity.value = withDelay(index * 80, withTiming(1, { duration: 350 }));
    translateY.value = withDelay(
      index * 80,
      withSpring(0, { damping: 14, stiffness: 180 })
    );
  }, [value]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const up = change >= 0;
  const changeColor = up ? C.success : C.error;

  return (
    <Animated.View style={[kpi.card, animStyle]}>
      <Text style={kpi.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={kpi.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <View style={kpi.trendRow}>
        <Ionicons
          name={up ? 'arrow-up' : 'arrow-down'}
          size={11}
          color={changeColor}
        />
        <Text style={[kpi.trendText, { color: changeColor }]}>
          {Math.abs(change).toFixed(1)}%
        </Text>
      </View>
    </Animated.View>
  );
}

const kpi = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  label: { fontSize: 10, color: C.text3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  value: { fontSize: 17, fontWeight: '800', color: C.text1, letterSpacing: -0.3 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  trendText: { fontSize: 11, fontWeight: '700' },
});

// ─── Revenue Area Chart ────────────────────────────────────────────────────────

function RevenueChart({ data, labels }) {
  const [tooltip, setTooltip] = useState(null);
  const drawProgress = useSharedValue(0);
  const [pathMeta, setPathMeta] = useState(null);
  const [totalLength, setTotalLength] = useState(1000);

  const w = CHART_W;
  const h = CHART_H;

  const meta = useMemo(() => buildAreaPath(data, w, h), [data, w, h]);

  useEffect(() => {
    setPathMeta(meta);
    // Reset and animate
    drawProgress.value = 0;
    drawProgress.value = withTiming(1, {
      duration: 1200,
      easing: Easing.out(Easing.cubic),
    });
    setTooltip(null);
  }, [data]);

  // Y-axis grid: 4 lines
  const innerH = h - CHART_PADDING_T - CHART_PADDING_B;
  const innerW = w - CHART_PADDING_L - CHART_PADDING_R;
  const minV = meta?.minV ?? 0;
  const maxV = meta?.maxV ?? 1;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: CHART_PADDING_T + innerH - t * innerH,
    label: fmtShort(minV + t * (maxV - minV)),
  }));

  // X labels: show every nth
  const xStep = Math.max(1, Math.ceil((labels?.length ?? 1) / 6));
  const xLabels = (labels ?? []).map((l, i) => ({
    label: l,
    x: CHART_PADDING_L + (i / Math.max((labels?.length ?? 1) - 1, 1)) * innerW,
    show: i % xStep === 0 || i === (labels?.length ?? 1) - 1,
  }));

  // Handle touch on chart area
  const handleTouch = useCallback(
    (evt) => {
      if (!meta?.pts || meta.pts.length === 0) return;
      const touchX = evt.nativeEvent.locationX;
      // Find closest data point
      const idx = meta.pts.reduce((best, pt, i) => {
        return Math.abs(pt.x - touchX) < Math.abs(meta.pts[best].x - touchX)
          ? i
          : best;
      }, 0);
      const pt = meta.pts[idx];
      const val = data[idx];
      setTooltip({ x: pt.x, y: pt.y, val, idx, label: labels?.[idx] ?? '' });
    },
    [meta, data, labels]
  );

  return (
    <View>
      <Svg
        width={w}
        height={h}
        onPress={handleTouch}
        onResponderMove={(e) => handleTouch(e)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
      >
        <Defs>
          <SvgLinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={C.indigo} stopOpacity="0.45" />
            <Stop offset="100%" stopColor={C.indigo} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>

        {/* Y-axis grid */}
        {gridLines.map((g, i) => (
          <G key={i}>
            <Line
              x1={CHART_PADDING_L}
              y1={g.y}
              x2={w - CHART_PADDING_R}
              y2={g.y}
              stroke={C.border}
              strokeWidth="0.5"
              strokeDasharray="3 4"
            />
            <SvgText
              x={CHART_PADDING_L - 4}
              y={g.y + 4}
              textAnchor="end"
              fontSize="9"
              fill={C.text3}
            >
              {g.label}
            </SvgText>
          </G>
        ))}

        {/* X-axis labels */}
        {xLabels.map((xl, i) =>
          xl.show ? (
            <SvgText
              key={i}
              x={xl.x}
              y={h - 4}
              textAnchor="middle"
              fontSize="9"
              fill={C.text3}
            >
              {xl.label}
            </SvgText>
          ) : null
        )}

        {/* Area fill */}
        {meta?.area ? (
          <Path d={meta.area} fill="url(#areaGrad)" />
        ) : null}

        {/* Animated line stroke — we use a static path + clip trick */}
        {meta?.line ? (
          <Path
            d={meta.line}
            fill="none"
            stroke={C.gold}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {/* Tooltip */}
        {tooltip && (
          <G>
            <Line
              x1={tooltip.x}
              y1={CHART_PADDING_T}
              x2={tooltip.x}
              y2={CHART_PADDING_T + innerH}
              stroke={C.gold}
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.6"
            />
            <Circle
              cx={tooltip.x}
              cy={tooltip.y}
              r="5"
              fill={C.gold}
              stroke={C.surface}
              strokeWidth="2"
            />
            {/* Tooltip box */}
            <Rect
              x={Math.min(tooltip.x - 32, w - CHART_PADDING_R - 68)}
              y={tooltip.y - 42}
              width={68}
              height={28}
              rx="6"
              fill={C.surface2}
              stroke={C.border}
              strokeWidth="1"
            />
            <SvgText
              x={Math.min(tooltip.x - 32, w - CHART_PADDING_R - 68) + 34}
              y={tooltip.y - 32}
              textAnchor="middle"
              fontSize="9"
              fill={C.text3}
            >
              {tooltip.label}
            </SvgText>
            <SvgText
              x={Math.min(tooltip.x - 32, w - CHART_PADDING_R - 68) + 34}
              y={tooltip.y - 20}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill={C.gold}
            >
              {fmt(tooltip.val)}
            </SvgText>
          </G>
        )}
      </Svg>
    </View>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────

function DonutChart({ segments, total }) {
  const RADIUS = 62;
  const STROKE = 18;
  const CX = 82;
  const CY = 82;
  const circumference = 2 * Math.PI * RADIUS;
  const progress = useSharedValue(0);
  const [drawn, setDrawn] = useState(0);

  useEffect(() => {
    progress.value = 0;
    setDrawn(0);
    const anim = setInterval(() => {
      setDrawn((p) => {
        const next = p + 0.02;
        if (next >= 1) {
          clearInterval(anim);
          return 1;
        }
        return next;
      });
    }, 16);
    return () => clearInterval(anim);
  }, [segments]);

  // Build arcs
  let offset = -90; // start at top
  const arcs = segments.map((seg) => {
    const sweep = (seg.value / 100) * 360 * drawn;
    const startAngle = offset;
    offset += (seg.value / 100) * 360;
    return { ...seg, sweep, startAngle };
  });

  function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(cx, cy, r, startAngle, sweepAngle) {
    if (sweepAngle <= 0) return '';
    const cappedSweep = Math.min(sweepAngle, 359.999);
    const start = polarToCartesian(cx, cy, r, startAngle);
    const end = polarToCartesian(cx, cy, r, startAngle + cappedSweep);
    const largeArc = cappedSweep > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }

  return (
    <View style={dn.container}>
      <Svg width={164} height={164}>
        {/* Track */}
        <Circle
          cx={CX}
          cy={CY}
          r={RADIUS}
          fill="none"
          stroke={C.surface2}
          strokeWidth={STROKE}
        />
        {/* Segments */}
        {arcs.map((arc, i) => (
          <Path
            key={i}
            d={describeArc(CX, CY, RADIUS, arc.startAngle, arc.sweep)}
            fill="none"
            stroke={arc.color}
            strokeWidth={STROKE}
            strokeLinecap="butt"
          />
        ))}
        {/* Center */}
        <SvgText
          x={CX}
          y={CY - 8}
          textAnchor="middle"
          fontSize="22"
          fontWeight="800"
          fill={C.text1}
        >
          {total}
        </SvgText>
        <SvgText
          x={CX}
          y={CY + 10}
          textAnchor="middle"
          fontSize="10"
          fill={C.text3}
        >
          orders
        </SvgText>
      </Svg>

      {/* Legend */}
      <View style={dn.legend}>
        {segments.map((seg) => (
          <View key={seg.label} style={dn.legendRow}>
            <View style={[dn.dot, { backgroundColor: seg.color }]} />
            <Text style={dn.legendLabel}>{seg.label}</Text>
            <Text style={dn.legendVal}>{seg.value}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const dn = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  legend: { flex: 1, gap: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 13, color: C.text2, fontWeight: '500' },
  legendVal: { fontSize: 13, fontWeight: '700', color: C.text1 },
});

// ─── Top Item Row (for FlashList) ─────────────────────────────────────────────

function TopItemRow({ item, index, maxRevenue }) {
  const barProgress = useSharedValue(0);

  useEffect(() => {
    barProgress.value = 0;
    barProgress.value = withDelay(
      index * 60,
      withTiming(item.revenue / maxRevenue, { duration: 600, easing: Easing.out(Easing.cubic) })
    );
  }, [item.revenue, maxRevenue]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barProgress.value * 100}%`,
  }));

  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
  const rankColor = index < 3 ? rankColors[index] : C.text3;

  return (
    <View style={ti.row}>
      <View style={ti.rankWrap}>
        <Text style={[ti.rank, { color: rankColor }]}>
          {index + 1}
        </Text>
      </View>
      <View style={ti.info}>
        <View style={ti.nameRow}>
          <Text style={ti.name} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={ti.revenue}>{fmt(item.revenue)}</Text>
        </View>
        <View style={ti.barTrack}>
          <Animated.View style={[ti.barFill, barStyle]} />
        </View>
        <Text style={ti.qty}>{item.qty} sold</Text>
      </View>
    </View>
  );
}

const ti = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 16, gap: 10 },
  rankWrap: { width: 22, alignItems: 'center', paddingTop: 2 },
  rank: { fontSize: 13, fontWeight: '800' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  name: { flex: 1, fontSize: 13, fontWeight: '600', color: C.text1, marginRight: 8 },
  revenue: { fontSize: 13, fontWeight: '700', color: C.gold },
  barTrack: { height: 4, backgroundColor: C.surface2, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4, backgroundColor: C.indigo, borderRadius: 2 },
  qty: { fontSize: 11, color: C.text3, marginTop: 3 },
});

// ─── Peak Hours Heatmap ────────────────────────────────────────────────────────

function PeakHeatmap({ data }) {
  // data: 7 rows (days) × 8 cols (hour slots)
  const CELL_W = (CHART_W - 32) / 8; // 8 time slots
  const CELL_H = 26;
  const LABEL_W = 24;
  const hours = ['8a', '10a', '12p', '2p', '4p', '6p', '8p', '10p'];
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const svgW = CHART_W - 16;
  const svgH = CELL_H * 7 + 20 + 4; // 7 day rows + hour header + gap

  function heatColor(val) {
    // 0 → dark navy, 1 → gold
    const r = Math.round(interpolateNum(val, 0x08, 0xC9));
    const g = Math.round(interpolateNum(val, 0x1E, 0xA8));
    const b = Math.round(interpolateNum(val, 0x3D, 0x4C));
    return `rgb(${r},${g},${b})`;
  }

  function interpolateNum(t, from, to) {
    return from + (to - from) * Math.pow(t, 0.6);
  }

  const progress = useSharedValue(0);
  const [drawn, setDrawn] = useState(0);

  useEffect(() => {
    setDrawn(0);
    const t = setTimeout(() => {
      const anim = setInterval(() => {
        setDrawn((p) => {
          const next = p + 0.04;
          if (next >= 1) { clearInterval(anim); return 1; }
          return next;
        });
      }, 16);
      return () => clearInterval(anim);
    }, 300);
    return () => clearTimeout(t);
  }, [data]);

  return (
    <Svg width={svgW} height={svgH}>
      {/* Hour headers */}
      {hours.map((h, i) => (
        <SvgText
          key={i}
          x={LABEL_W + i * CELL_W + CELL_W / 2}
          y={12}
          textAnchor="middle"
          fontSize="8.5"
          fill={C.text3}
        >
          {h}
        </SvgText>
      ))}

      {/* Cells */}
      {(data ?? []).map((row, di) =>
        (row ?? []).map((cell, hi) => {
          const opacity = drawn;
          const fill = heatColor(cell.value * drawn);
          return (
            <Rect
              key={`${di}-${hi}`}
              x={LABEL_W + hi * CELL_W + 1}
              y={20 + di * CELL_H + 1}
              width={CELL_W - 2}
              height={CELL_H - 3}
              rx="3"
              fill={fill}
              opacity={opacity}
            />
          );
        })
      )}

      {/* Day labels */}
      {days.map((d, i) => (
        <SvgText
          key={i}
          x={LABEL_W - 4}
          y={20 + i * CELL_H + CELL_H / 2 + 4}
          textAnchor="end"
          fontSize="9"
          fill={i >= 5 ? C.gold : C.text3}
          fontWeight={i >= 5 ? '700' : '400'}
        >
          {d}
        </SvgText>
      ))}
    </Svg>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }) {
  return (
    <View style={sh.row}>
      <View style={sh.accent} />
      <View>
        <Text style={sh.title}>{title}</Text>
        {subtitle ? <Text style={sh.sub}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const sh = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  accent: { width: 3, height: 18, borderRadius: 2, backgroundColor: C.gold },
  title: { fontSize: 13, fontWeight: '800', color: C.text1, textTransform: 'uppercase', letterSpacing: 0.6 },
  sub: { fontSize: 11, color: C.text3, marginTop: 1 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState('7D');
  const [refreshKey, setRefreshKey] = useState(0);
  const scrollRef = useRef(null);

  const apiRange = RANGE_MAP[range];
  const { data: apiData, isLoading, refetch, isRefetching } = useReports(apiRange);

  // Use API data if present, else fallback to mock
  const data = useMemo(() => {
    const raw = apiData?.data ?? apiData;
    if (
      raw &&
      (raw.total_revenue != null || raw.revenue_series?.length > 0)
    ) {
      return {
        ...buildMock(range), // fill gaps with mock structure
        ...raw,
      };
    }
    return buildMock(range);
  }, [apiData, range]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    refetch();
  }, [refetch]);

  const maxRevenue = useMemo(
    () => Math.max(...(data.top_items ?? []).map((i) => i.revenue), 1),
    [data.top_items]
  );

  const headerOpacity = useSharedValue(0);
  useEffect(() => {
    headerOpacity.value = withTiming(1, { duration: 500 });
  }, []);
  const headerStyle = useAnimatedStyle(() => ({ opacity: headerOpacity.value }));

  return (
    <View style={s.root}>
      {/* Header */}
      <LinearGradient
        colors={['#0A1628', '#080F1E']}
        style={[s.header, { paddingTop: insets.top + 10 }]}
      >
        <Animated.View style={[s.headerContent, headerStyle]}>
          <View>
            <Text style={s.headerEye}>MS RM OWNER</Text>
            <Text style={s.headerTitle}>Analytics</Text>
          </View>
          <TouchableOpacity onPress={handleRefresh} style={s.refreshBtn}>
            <Ionicons name="refresh-outline" size={18} color={C.gold} />
          </TouchableOpacity>
        </Animated.View>

        {/* Range Selector */}
        <View style={s.rangeWrap}>
          <RangeSelector selected={range} onChange={setRange} />
        </View>
      </LinearGradient>

      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={C.gold}
            colors={[C.gold]}
          />
        }
      >
        {/* ── KPI Cards ─────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <View style={s.kpiRow}>
            <KpiCard
              index={0}
              label="Revenue"
              value={fmt(data.total_revenue)}
              change={data.revenue_change ?? 0}
            />
            <KpiCard
              index={1}
              label="Orders"
              value={String(data.total_orders ?? 0)}
              change={data.orders_change ?? 0}
            />
            <KpiCard
              index={2}
              label="Avg Order"
              value={fmt(data.avg_order_value)}
              change={data.avg_order_change ?? 0}
            />
            <KpiCard
              index={3}
              label={range === 'Today' ? 'Peak Hr' : 'Best Day'}
              value={data.best_day ?? '—'}
              change={data.best_day_change ?? 0}
            />
          </View>
        </Animated.View>

        {/* ── Revenue Chart ──────────────────────────────────── */}
        <Animated.View
          style={s.card}
          entering={FadeInDown.delay(150).duration(400)}
        >
          <SectionHeader
            title="Revenue"
            subtitle={`${range} trend`}
          />
          <RevenueChart
            key={`${range}-${refreshKey}`}
            data={data.revenue_series ?? []}
            labels={data.revenue_labels ?? []}
          />
        </Animated.View>

        {/* ── Order Type Donut ───────────────────────────────── */}
        <Animated.View
          style={s.card}
          entering={FadeInDown.delay(200).duration(400)}
        >
          <SectionHeader title="Order Mix" subtitle="by type" />
          <DonutChart
            key={`donut-${range}-${refreshKey}`}
            segments={data.order_types ?? []}
            total={data.total_orders ?? 0}
          />
        </Animated.View>

        {/* ── Top Items ──────────────────────────────────────── */}
        <Animated.View
          style={[s.card, s.cardNoPad]}
          entering={FadeInDown.delay(250).duration(400)}
        >
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
            <SectionHeader title="Top Dishes" subtitle={`ranked by revenue`} />
          </View>
          {(data.top_items ?? []).map((item, i) => (
            <View key={item.id ?? i}>
              <TopItemRow item={item} index={i} maxRevenue={maxRevenue} />
              {i < (data.top_items?.length ?? 0) - 1 && (
                <View style={s.divider} />
              )}
            </View>
          ))}
          {/* Spacer */}
          <View style={{ height: 8 }} />
        </Animated.View>

        {/* ── Peak Hours Heatmap ─────────────────────────────── */}
        <Animated.View
          style={[s.card, { overflow: 'hidden' }]}
          entering={FadeInDown.delay(300).duration(400)}
        >
          <SectionHeader title="Peak Hours" subtitle="Mon–Sun · 8am–10pm" />
          <PeakHeatmap
            key={`heat-${range}-${refreshKey}`}
            data={data.peak_hours ?? buildPeakHours()}
          />
          {/* Color scale legend */}
          <View style={s.heatLegend}>
            <Text style={s.heatLegendText}>Low</Text>
            <LinearGradient
              colors={['#081E3D', '#2D3888', '#C9A84C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.heatGradBar}
            />
            <Text style={s.heatLegendText}>High</Text>
          </View>
        </Animated.View>

        {/* ── Footer stamp ────────────────────────────────────── */}
        <Text style={s.stamp}>
          {isLoading ? 'Loading live data…' : `Live · Updated just now`}
        </Text>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  headerEye: {
    fontSize: 10,
    fontWeight: '700',
    color: C.gold,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: C.text1,
    letterSpacing: -0.5,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rangeWrap: { marginTop: 4 },

  scroll: { flex: 1 },
  content: { padding: 16, gap: 14 },

  kpiRow: { flexDirection: 'row', gap: 8 },

  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  cardNoPad: { padding: 0 },

  divider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: 16,
    opacity: 0.5,
  },

  heatLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  heatLegendText: { fontSize: 10, color: C.text3 },
  heatGradBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },

  stamp: {
    fontSize: 11,
    color: C.text3,
    textAlign: 'center',
    marginTop: 4,
    letterSpacing: 0.3,
  },
});
