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
  Platform,
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
import { useTheme } from '../../src/context/ThemeContext';
import { chartColors } from '../../src/constants/theme';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Convert a #rgb / #rrggbb color into its {r,g,b} components so we can build
// theme-aware rgba() strings (e.g. accent-tinted chart gradients / heatmap).
function hexToRgb(hex) {
  let h = String(hex || '#000000').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const int = parseInt(h, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

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
  const { colors } = useTheme();
  const rs = useMemo(() => makeRsStyles(colors), [colors]);
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

function makeRsStyles(colors) {
  return StyleSheet.create({
    track: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 4,
      position: 'relative',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    indicator: {
      position: 'absolute',
      top: 4,
      left: 4,
      height: 32,
      borderRadius: 9,
      backgroundColor: colors.pillBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pill: {
      height: 32,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1,
    },
    pillText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
    pillTextActive: { color: colors.text, fontWeight: '700' },
  });
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, change, index }) {
  const { colors } = useTheme();
  const kpi = useMemo(() => makeKpiStyles(colors), [colors]);
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
  const changeColor = up ? colors.success : colors.error;

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

function makeKpiStyles(colors) {
  return StyleSheet.create({
    card: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    label: { fontSize: 10, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
    value: { fontSize: 17, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
    trendRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
    trendText: { fontSize: 11, fontWeight: '700' },
  });
}

// ─── Revenue Area Chart ────────────────────────────────────────────────────────

function RevenueChart({ data, labels }) {
  const { colors } = useTheme();
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
        {...(Platform.OS !== 'web'
          ? {
              onResponderMove: (e) => handleTouch(e),
              onStartShouldSetResponder: () => true,
              onMoveShouldSetResponder: () => true,
            }
          : {})}
      >
        <Defs>
          <SvgLinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors.accent} stopOpacity="0.15" />
            <Stop offset="100%" stopColor={colors.accent} stopOpacity="0" />
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
              stroke={colors.border}
              strokeWidth="0.5"
              strokeDasharray="3 4"
            />
            <SvgText
              x={CHART_PADDING_L - 4}
              y={g.y + 4}
              textAnchor="end"
              fontSize="9"
              fill={colors.textMuted}
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
              fill={colors.textMuted}
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
            stroke={colors.accent}
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
              stroke={colors.accent}
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.6"
            />
            <Circle
              cx={tooltip.x}
              cy={tooltip.y}
              r="5"
              fill={colors.accent}
              stroke={colors.card}
              strokeWidth="2"
            />
            {/* Tooltip box */}
            <Rect
              x={Math.min(tooltip.x - 32, w - CHART_PADDING_R - 68)}
              y={tooltip.y - 42}
              width={68}
              height={28}
              rx="6"
              fill={colors.card}
              stroke={colors.border}
              strokeWidth="1"
            />
            <SvgText
              x={Math.min(tooltip.x - 32, w - CHART_PADDING_R - 68) + 34}
              y={tooltip.y - 32}
              textAnchor="middle"
              fontSize="9"
              fill={colors.textMuted}
            >
              {tooltip.label}
            </SvgText>
            <SvgText
              x={Math.min(tooltip.x - 32, w - CHART_PADDING_R - 68) + 34}
              y={tooltip.y - 20}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill={colors.accent}
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
  const { colors } = useTheme();
  const dn = useMemo(() => makeDnStyles(colors), [colors]);
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
          stroke={colors.border}
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
          fill={colors.text}
        >
          {total}
        </SvgText>
        <SvgText
          x={CX}
          y={CY + 10}
          textAnchor="middle"
          fontSize="10"
          fill={colors.textMuted}
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

function makeDnStyles(colors) {
  return StyleSheet.create({
    container: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    legend: { flex: 1, gap: 10 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    legendLabel: { flex: 1, fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
    legendVal: { fontSize: 13, fontWeight: '700', color: colors.text },
  });
}

// ─── Top Item Row (for FlashList) ─────────────────────────────────────────────

function TopItemRow({ item, index, maxRevenue }) {
  const { colors } = useTheme();
  const ti = useMemo(() => makeTiStyles(colors), [colors]);
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

  const rankColors = [colors.text, colors.textSecondary, colors.textMuted];
  const rankColor = index < 3 ? rankColors[index] : colors.textMuted;

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

function makeTiStyles(colors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 16, gap: 10 },
    rankWrap: { width: 22, alignItems: 'center', paddingTop: 2 },
    rank: { fontSize: 13, fontWeight: '800' },
    info: { flex: 1 },
    nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
    name: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text, marginRight: 8 },
    revenue: { fontSize: 13, fontWeight: '700', color: colors.accent },
    barTrack: { height: 4, backgroundColor: colors.borderLight, borderRadius: 2, overflow: 'hidden' },
    barFill: { height: 4, backgroundColor: colors.accent, borderRadius: 2 },
    qty: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  });
}

// ─── Peak Hours Heatmap ────────────────────────────────────────────────────────

function PeakHeatmap({ data }) {
  const { colors } = useTheme();
  const { r: accentR, g: accentG, b: accentB } = useMemo(
    () => hexToRgb(colors.accent),
    [colors.accent]
  );
  // data: 7 rows (days) × 8 cols (hour slots)
  const CELL_W = (CHART_W - 32) / 8; // 8 time slots
  const CELL_H = 26;
  const LABEL_W = 24;
  const hours = ['8a', '10a', '12p', '2p', '4p', '6p', '8p', '10p'];
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const svgW = CHART_W - 16;
  const svgH = CELL_H * 7 + 20 + 4; // 7 day rows + hour header + gap

  function heatColor(val) {
    // 0 → very light accent, 1 → full accent
    const opacity = 0.05 + Math.pow(val, 0.6) * 0.85;
    return `rgba(${accentR},${accentG},${accentB},${opacity.toFixed(2)})`;
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
          fill={colors.textMuted}
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
          fill={i >= 5 ? colors.accent : colors.textMuted}
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
  const { colors } = useTheme();
  const sh = useMemo(() => makeShStyles(colors), [colors]);
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

function makeShStyles(colors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    accent: { width: 3, height: 18, borderRadius: 2, backgroundColor: colors.text },
    title: { fontSize: 13, fontWeight: '800', color: colors.text, textTransform: 'uppercase', letterSpacing: 0.6 },
    sub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  });
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const accentRgb = useMemo(() => hexToRgb(colors.accent), [colors.accent]);
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState('7D');
  const [refreshKey, setRefreshKey] = useState(0);
  const scrollRef = useRef(null);

  const apiRange = RANGE_MAP[range];
  const { data: apiData, isLoading, refetch, isRefetching } = useReports(apiRange);

  // Use API data when present. When the report API returns empty we render a
  // clean empty state — we never fabricate revenue / orders / heatmap values.
  // Missing individual fields fall back to legitimate zeros / empty arrays.
  const data = useMemo(() => {
    const raw = apiData?.data ?? apiData;
    const hasData = !!(
      raw &&
      (raw.total_revenue != null || (raw.revenue_series?.length ?? 0) > 0)
    );
    if (!hasData) return null;
    return {
      revenue_series: [],
      revenue_labels: [],
      total_revenue: 0,
      total_orders: 0,
      avg_order_value: 0,
      best_day: '—',
      revenue_change: 0,
      orders_change: 0,
      avg_order_change: 0,
      best_day_change: 0,
      order_types: [],
      top_items: [],
      peak_hours: [],
      ...raw,
    };
  }, [apiData]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    refetch();
  }, [refetch]);

  const maxRevenue = useMemo(
    () => Math.max(...(data?.top_items ?? []).map((i) => i.revenue), 1),
    [data?.top_items]
  );

  // Give donut segments a stable chart color when the API doesn't supply one.
  const orderTypeSegments = useMemo(
    () =>
      (data?.order_types ?? []).map((seg, i) => ({
        ...seg,
        color: seg.color ?? chartColors[i % chartColors.length],
      })),
    [data?.order_types]
  );

  const headerOpacity = useSharedValue(0);
  useEffect(() => {
    headerOpacity.value = withTiming(1, { duration: 500 });
  }, []);
  const headerStyle = useAnimatedStyle(() => ({ opacity: headerOpacity.value }));

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <Animated.View style={[s.headerContent, headerStyle]}>
          <View>
            <Text style={s.headerEye}>MS RM OWNER</Text>
            <Text style={s.headerTitle}>Analytics</Text>
          </View>
          <TouchableOpacity onPress={handleRefresh} style={s.refreshBtn}>
            <Ionicons name="refresh-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </Animated.View>

        {/* Range Selector */}
        <View style={s.rangeWrap}>
          <RangeSelector selected={range} onChange={setRange} />
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {data ? (
          <>
            {/* ── KPI Cards ─────────────────────────────────────── */}
            <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.delay(100).duration(400) : undefined}>
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
              entering={Platform.OS !== 'web' ? FadeInDown.delay(150).duration(400) : undefined}
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
              entering={Platform.OS !== 'web' ? FadeInDown.delay(200).duration(400) : undefined}
            >
              <SectionHeader title="Order Mix" subtitle="by type" />
              <DonutChart
                key={`donut-${range}-${refreshKey}`}
                segments={orderTypeSegments}
                total={data.total_orders ?? 0}
              />
            </Animated.View>

            {/* ── Top Items ──────────────────────────────────────── */}
            <Animated.View
              style={[s.card, s.cardNoPad]}
              entering={Platform.OS !== 'web' ? FadeInDown.delay(250).duration(400) : undefined}
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
              entering={Platform.OS !== 'web' ? FadeInDown.delay(300).duration(400) : undefined}
            >
              <SectionHeader title="Peak Hours" subtitle="Mon–Sun · 8am–10pm" />
              <PeakHeatmap
                key={`heat-${range}-${refreshKey}`}
                data={data.peak_hours ?? []}
              />
              {/* Color scale legend */}
              <View style={s.heatLegend}>
                <Text style={s.heatLegendText}>Low</Text>
                <LinearGradient
                  colors={[
                    `rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0.05)`,
                    `rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0.4)`,
                    colors.accent,
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.heatGradBar}
                />
                <Text style={s.heatLegendText}>High</Text>
              </View>
            </Animated.View>
          </>
        ) : (
          /* ── Empty state — no fabricated numbers ─────────────── */
          <View style={s.emptyWrap}>
            <Ionicons name="bar-chart-outline" size={48} color={colors.textMuted} />
            <Text style={s.emptyTitle}>No data for this period</Text>
            <Text style={s.emptySub}>
              {isLoading
                ? 'Loading…'
                : 'Try a different range or check back once you have activity.'}
            </Text>
          </View>
        )}

        {/* ── Footer stamp ────────────────────────────────────── */}
        <Text style={s.stamp}>
          {isLoading
            ? 'Loading live data…'
            : data
            ? `Live · Updated just now`
            : ''}
        </Text>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },

    header: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      backgroundColor: colors.headerBg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
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
      color: colors.textMuted,
      letterSpacing: 1.5,
      marginBottom: 2,
    },
    headerTitle: {
      fontSize: 26,
      fontWeight: '900',
      color: colors.text,
      letterSpacing: -0.5,
    },
    refreshBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rangeWrap: { marginTop: 4 },

    scroll: { flex: 1 },
    content: { padding: 16, gap: 14 },

    kpiRow: { flexDirection: 'row', gap: 8 },

    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    cardNoPad: { padding: 0 },

    divider: {
      height: 1,
      backgroundColor: colors.borderLight,
      marginHorizontal: 16,
    },

    heatLegend: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
    },
    heatLegendText: { fontSize: 10, color: colors.textMuted },
    heatGradBar: {
      flex: 1,
      height: 6,
      borderRadius: 3,
    },

    emptyWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
      gap: 10,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.2,
    },
    emptySub: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: 32,
    },

    stamp: {
      fontSize: 11,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 4,
      letterSpacing: 0.3,
    },
  });
}
