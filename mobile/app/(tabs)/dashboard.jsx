import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Animated, Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle, G, Rect, Defs, LinearGradient as SvgGrad, Stop,
  Polyline, Text as SvgText
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import api from '../../src/lib/api';
import { Colors } from '../../src/constants/colors';
import { T } from '../../src/constants/typography';

const { width } = Dimensions.get('window');

/* ─── Ring gauge ─── */
function Ring({ pct = 0, size = 68, stroke = 5, color = Colors.indigo, value, label }) {
  const r    = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(pct, 1);
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle cx={size/2} cy={size/2} r={r} stroke={color + '20'} strokeWidth={stroke} fill="none" />
          <Circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            rotation="-90" origin={`${size/2},${size/2}`} />
        </Svg>
        <View style={{ position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ ...T.numSm, color }}>{value}</Text>
        </View>
      </View>
      <Text style={[styles.ringLabel, { color: Colors.text3 }]}>{label}</Text>
    </View>
  );
}

/* ─── Sparkline ─── */
function Spark({ data = [], color = '#fff', w = 72, h = 28 }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1), min = Math.min(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - ((v - min) / rng) * (h - 2) - 1}`
  ).join(' ');
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgGrad id={`sg${color}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={color} stopOpacity="0.3" />
          <Stop offset="1" stopColor={color} stopOpacity="0.9" />
        </SvgGrad>
      </Defs>
      <Polyline points={pts} fill="none" stroke={`url(#sg${color})`} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/* ─── Bar chart ─── */
function Bars({ data = [], labels = [], color = Colors.indigo, h = 80 }) {
  const max  = Math.max(...data, 1);
  const bw   = ((width - 64) / data.length) - 5;
  return (
    <Svg width={width - 64} height={h + 18}>
      <Defs>
        <SvgGrad id="bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.9" />
          <Stop offset="1" stopColor={color} stopOpacity="0.25" />
        </SvgGrad>
      </Defs>
      {data.map((v, i) => {
        const bh = (v / max) * h;
        const x  = i * (bw + 5);
        return (
          <G key={i}>
            <Rect x={x} y={h - bh} width={bw} height={bh} rx={3} fill="url(#bg)" />
          </G>
        );
      })}
      {labels.map((l, i) => (
        <SvgText key={i} x={i * (bw + 5) + bw / 2} y={h + 13} fontSize="8"
          fill={Colors.text3} textAnchor="middle">{l}</SvgText>
      ))}
    </Svg>
  );
}

/* ─── Donut ─── */
function Donut({ segs = [], size = 100 }) {
  const r     = size / 2 - 12;
  const circ  = 2 * Math.PI * r;
  const total = segs.reduce((s, v) => s + v.v, 0) || 1;
  let off = 0;
  return (
    <Svg width={size} height={size}>
      {segs.map((s, i) => {
        const dash = (s.v / total) * circ;
        const el   = (
          <Circle key={i} cx={size/2} cy={size/2} r={r}
            stroke={s.c} strokeWidth={12} fill="none"
            strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="butt"
            rotation={-90 + (off / total) * 360} origin={`${size/2},${size/2}`} />
        );
        off += s.v;
        return el;
      })}
      <Circle cx={size/2} cy={size/2} r={r - 6} fill="white" />
    </Svg>
  );
}

/* ─── Stat row (for performance section) ─── */
function StatBar({ label, val, pct, color }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={[styles.statVal, { color }]}>{val}</Text>
      </View>
      <View style={styles.statTrack}>
        <View style={[styles.statFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const WK  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const FMT = (n) => n >= 1000 ? `₹${(n/1000).toFixed(1)}k` : `₹${Math.round(n)}`;

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState([]);
  const [stats,  setStats]  = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      const res   = await api.get('/orders?limit=20');
      const items = res.data?.items || res.data || [];
      setOrders(items.slice(0, 7));
      const total   = res.data?.total || items.length;
      const active  = items.filter(o => o.status === 'active').length;
      const revenue = items.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
      setStats({ total, active, revenue, avg: total ? revenue / total : 0 });
    } catch { setStats({ total: 0, active: 0, revenue: 0, avg: 0 }); }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => {
    load();
    Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const donut = [
    { v: 45, c: Colors.indigo  },
    { v: 30, c: Colors.gold    },
    { v: 15, c: Colors.success },
    { v: 10, c: Colors.error   },
  ];
  const donutMeta = ['Dine-in','Takeaway','Delivery','Other'];

  const statusColor = (s) => ({
    completed: Colors.success, active: Colors.indigo,
    confirmed: Colors.indigo, paid: Colors.success,
    preparing: Colors.warning, created: Colors.text3,
  }[s] || Colors.text3);

  return (
    <Animated.ScrollView
      style={[styles.root, { opacity: fade }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.gold} />}
    >

      {/* ── Header ── */}
      <LinearGradient colors={['#05090F','#0A1628','#0D1F3C']} style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.headerDecor1} />
        <View style={styles.headerDecor2} />

        {/* Top row */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greet}>{greet()}</Text>
            <Text style={styles.name}>{user?.full_name || user?.email?.split('@')[0]}</Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.avatarBtn}>
            <LinearGradient colors={['#5B5EF4','#3535C0']} style={styles.avatar}>
              <Text style={styles.avatarTxt}>{(user?.full_name||'U')[0].toUpperCase()}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Live pill */}
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text style={styles.liveTxt}>Live</Text>
          <Text style={styles.liveSep}>·</Text>
          <Text style={styles.liveDate}>{new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</Text>
        </View>

        {/* Hero cards */}
        <View style={styles.heroRow}>
          <View style={[styles.heroCard, { borderTopColor: Colors.goldBright }]}>
            <Text style={styles.heroLbl}>Total revenue</Text>
            <Text style={styles.heroNum}>{stats ? FMT(stats.revenue) : '—'}</Text>
            <View style={styles.heroBottom}>
              <Text style={styles.heroTrend}>▲ 8%</Text>
              <Spark data={[30,45,40,60,55,72,65]} color={Colors.goldBright} />
            </View>
          </View>
          <View style={[styles.heroCard, { borderTopColor: Colors.success }]}>
            <Text style={styles.heroLbl}>Active orders</Text>
            <Text style={[styles.heroNum, { color: Colors.success }]}>{stats?.active ?? '—'}</Text>
            <View style={styles.heroBottom}>
              <Text style={[styles.heroTrend, { color: Colors.success }]}>▲ 12%</Text>
              <Spark data={[4,6,5,8,7,9,11]} color={Colors.success} />
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* ── Body ── */}
      <View style={styles.body}>

        {/* KPI rings */}
        <View style={styles.card}>
          <View style={styles.ringRow}>
            <Ring pct={0.72} color={Colors.indigo}  value={String(stats?.total ?? 0)} label="Orders" />
            <View style={styles.ringDivider} />
            <Ring pct={0.54} color={Colors.gold}    value={stats ? `₹${Math.round(stats.avg)}` : '—'} label="Avg ticket" />
            <View style={styles.ringDivider} />
            <Ring pct={0.67} color={Colors.success} value="12/18" label="Tables" />
          </View>
        </View>

        {/* Bar chart */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View>
              <Text style={styles.cardTitle}>Weekly revenue</Text>
              <Text style={styles.cardSub}>Last 7 days</Text>
            </View>
            <View style={styles.badgeGreen}>
              <Text style={styles.badgeGreenTxt}>↑ 18% vs last week</Text>
            </View>
          </View>
          <Bars data={[42,67,55,80,95,110,88]} labels={WK} color={Colors.indigo} h={80} />
          <Text style={styles.chartNote}>Peak day: Saturday</Text>
        </View>

        {/* Donut */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Order mix</Text>
          <Text style={styles.cardSub}>By type · today</Text>
          <View style={styles.donutRow}>
            <Donut segs={donut} size={110} />
            <View style={styles.donutLegend}>
              {donut.map((d, i) => (
                <View key={i} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: d.c }]} />
                  <Text style={styles.legendLbl}>{donutMeta[i]}</Text>
                  <Text style={[styles.legendPct, { color: d.c }]}>{d.v}%</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Recent orders */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View>
              <Text style={styles.cardTitle}>Recent orders</Text>
              <Text style={styles.cardSub}>{orders.length} latest transactions</Text>
            </View>
          </View>
          {orders.length === 0
            ? <Text style={styles.empty}>No orders yet</Text>
            : orders.map((o, i) => {
                const sc = statusColor(o.status);
                const amt = parseFloat(o.total_amount || 0);
                return (
                  <View key={o.id} style={[styles.orderRow, i === orders.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={[styles.orderIcon, { backgroundColor: sc + '14' }]}>
                      <Text style={[styles.orderIconTxt, { color: sc }]}>{(o.order_number || '').slice(-4)}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.orderNum} numberOfLines={1}>{o.order_number || `#${o.id?.slice(0,8)}`}</Text>
                      <Text style={styles.orderType}>{o.table_number ? `Table ${o.table_number}` : o.order_type || 'Dine-in'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={styles.orderAmt}>₹{Math.round(amt)}</Text>
                      <Text style={[styles.orderStatus, { color: sc }]}>{o.status}</Text>
                    </View>
                  </View>
                );
              })
          }
        </View>

        {/* Performance */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Performance</Text>
          <Text style={[styles.cardSub, { marginBottom: 16 }]}>Today vs target</Text>
          <StatBar label="Revenue target"  val="₹7.6k / ₹12k" pct={0.63} color={Colors.indigo}  />
          <StatBar label="Order target"    val="20 / 100"      pct={0.20} color={Colors.success} />
          <StatBar label="Customer score"  val="4.6 / 5.0"     pct={0.92} color={Colors.gold}    />
        </View>

      </View>
      <View style={{ height: 16 + insets.bottom }} />
    </Animated.ScrollView>
  );
}

function greet() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F5FA' },

  /* Header */
  header: { paddingHorizontal: 20, paddingBottom: 20, overflow: 'hidden', position: 'relative' },
  headerDecor1: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: Colors.indigo, opacity: 0.07, top: -50, right: -40 },
  headerDecor2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: Colors.gold, opacity: 0.05, bottom: -30, left: -10 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  greet: { color: 'rgba(255,255,255,0.45)', ...T.label },
  name:  { color: '#fff', fontSize: 20, fontWeight: '600', letterSpacing: -0.2, marginTop: 2 },

  avatarBtn: {},
  avatar: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { color: '#fff', fontSize: 14, fontWeight: '600' },

  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  liveDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  liveTxt:  { color: Colors.success, ...T.labelSm, fontWeight: '600' },
  liveSep:  { color: 'rgba(255,255,255,0.2)', ...T.labelSm },
  liveDate: { color: 'rgba(255,255,255,0.35)', ...T.labelSm },

  heroRow:  { flexDirection: 'row', gap: 10 },
  heroCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12, padding: 14, borderTopWidth: 2,
  },
  heroLbl:    { color: 'rgba(255,255,255,0.4)', ...T.caption, marginBottom: 6 },
  heroNum:    { color: Colors.goldBright, fontSize: 20, fontWeight: '600', letterSpacing: -0.5, marginBottom: 8 },
  heroBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  heroTrend:  { color: Colors.goldBright, ...T.labelSm, fontWeight: '600' },

  /* Body */
  body: { padding: 14, gap: 12 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    shadowColor: '#0A1628', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  cardHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  cardTitle: { color: Colors.text1, fontSize: 14, fontWeight: '600', letterSpacing: -0.1 },
  cardSub:   { color: Colors.text3, ...T.caption, marginTop: 2 },

  badgeGreen: { backgroundColor: Colors.successBg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeGreenTxt: { color: Colors.success, ...T.labelSm, fontWeight: '600' },

  chartNote: { color: Colors.text3, ...T.caption, marginTop: 8 },

  /* KPI rings */
  ringRow:     { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  ringLabel:   { ...T.caption, marginTop: 6, textAlign: 'center' },
  ringDivider: { width: 1, height: 48, backgroundColor: Colors.border },

  /* Donut */
  donutRow:    { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 14 },
  donutLegend: { flex: 1, gap: 10 },
  legendRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot:   { width: 7, height: 7, borderRadius: 3.5 },
  legendLbl:   { flex: 1, color: Colors.text2, ...T.label },
  legendPct:   { ...T.label, fontWeight: '600' },

  /* Orders */
  orderRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  orderIcon:   { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  orderIconTxt:{ fontSize: 10, fontWeight: '700' },
  orderNum:    { color: Colors.text1, ...T.label, fontWeight: '600' },
  orderType:   { color: Colors.text3, ...T.caption, marginTop: 2 },
  orderAmt:    { color: Colors.text1, ...T.numXs },
  orderStatus: { ...T.caption, fontWeight: '500' },

  empty: { color: Colors.text3, ...T.body, textAlign: 'center', paddingVertical: 20 },

  /* Performance bars */
  statLabel: { color: Colors.text2, ...T.label },
  statVal:   { ...T.label, fontWeight: '600' },
  statTrack: { height: 4, backgroundColor: '#F1F5F9', borderRadius: 2, overflow: 'hidden' },
  statFill:  { height: 4, borderRadius: 2 },
});
