import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  Animated, Dimensions, Easing
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, {
  Polygon, Defs, RadialGradient, LinearGradient as SvgGrad,
  Stop, Circle, Ellipse, Line, G, Path
} from 'react-native-svg';
import { useAuth } from '../src/context/AuthContext';

const { width, height } = Dimensions.get('window');
const cx = width / 2;

/* ════════════════════════════════════════
   3-D CRYSTAL GEM — SVG facet drawing
   ════════════════════════════════════════ */
function Crystal({ size = 160, anim }) {
  const s = size;
  const h = s;
  // Crystal points
  const top    = [s / 2, 0];
  const bot    = [s / 2, h];
  const ml     = [0,        h * 0.38];
  const mr     = [s,        h * 0.38];
  const mml    = [s * 0.22, h * 0.62];
  const mmr    = [s * 0.78, h * 0.62];
  const mid    = [s / 2,    h * 0.45];

  const pts = (arr) => arr.map(p => p.join(',')).join(' ');

  // Rotate the whole crystal via animated transform
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={{ width: s, height: h, transform: [{ rotateY: rotate }] }}>
      <Svg width={s} height={h} viewBox={`0 0 ${s} ${h}`}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="40%" r="60%">
            <Stop offset="0%"   stopColor="#A0A4FF" stopOpacity="0.9" />
            <Stop offset="100%" stopColor="#3535C0" stopOpacity="0.1" />
          </RadialGradient>
          <SvgGrad id="f1" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#8888FF" stopOpacity="0.95" />
            <Stop offset="100%" stopColor="#3535C0" stopOpacity="0.8" />
          </SvgGrad>
          <SvgGrad id="f2" x1="1" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#C9A84C" stopOpacity="0.9" />
            <Stop offset="100%" stopColor="#6D4E10" stopOpacity="0.7" />
          </SvgGrad>
          <SvgGrad id="f3" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0%" stopColor="#10C98A" stopOpacity="0.85" />
            <Stop offset="100%" stopColor="#065C3D" stopOpacity="0.6" />
          </SvgGrad>
          <SvgGrad id="f4" x1="0.5" y1="0" x2="0.5" y2="1">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <Stop offset="100%" stopColor="#8888FF" stopOpacity="0.3" />
          </SvgGrad>
          <SvgGrad id="f5" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#F0F0FF" stopOpacity="0.7" />
            <Stop offset="100%" stopColor="#5B5EF4" stopOpacity="0.5" />
          </SvgGrad>
          <SvgGrad id="f6" x1="1" y1="1" x2="0" y2="0">
            <Stop offset="0%" stopColor="#FFD580" stopOpacity="0.6" />
            <Stop offset="100%" stopColor="#C9A84C" stopOpacity="0.4" />
          </SvgGrad>
        </Defs>

        {/* Back facets (lower z) */}
        <Polygon points={pts([top, ml,  mid])} fill="url(#f1)" opacity={0.65} />
        <Polygon points={pts([top, mr,  mid])} fill="url(#f2)" opacity={0.6}  />
        <Polygon points={pts([bot, mml, mid])} fill="url(#f3)" opacity={0.65} />
        <Polygon points={pts([bot, mmr, mid])} fill="url(#f6)" opacity={0.55} />

        {/* Mid facets */}
        <Polygon points={pts([top, ml,  mml, mid])} fill="url(#f4)" opacity={0.7} />
        <Polygon points={pts([top, mr,  mmr, mid])} fill="url(#f5)" opacity={0.65} />

        {/* Front highlight facets */}
        <Polygon points={pts([ml, mml, mid])}       fill="url(#f1)" opacity={0.5} />
        <Polygon points={pts([mr, mmr, mid])}       fill="url(#f2)" opacity={0.45} />
        <Polygon points={pts([top, mid, ml])}       fill="url(#f4)" opacity={0.55} />

        {/* Top sheen */}
        <Polygon points={pts([top, ml, mid, mr])}   fill="url(#glow)" opacity={0.35} />

        {/* Edges */}
        {[
          [top, ml], [top, mr], [top, mid],
          [ml, mid], [mr, mid], [mml, mid], [mmr, mid],
          [ml, mml], [mr, mmr], [mml, bot], [mmr, bot],
        ].map(([a, b], i) => (
          <Line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
            stroke="rgba(255,255,255,0.18)" strokeWidth="0.8" />
        ))}

        {/* Inner glow highlight */}
        <Ellipse cx={s * 0.4} cy={h * 0.28} rx={s * 0.12} ry={h * 0.07}
          fill="white" opacity={0.28} />
      </Svg>
    </Animated.View>
  );
}

/* ════════════════════════════════════════
   ORBIT RINGS — 3-D perspective rings
   ════════════════════════════════════════ */
function OrbitRings({ anim1, anim2 }) {
  const rot1 = anim1.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rot2 = anim2.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });

  return (
    <View style={styles.orbitWrap} pointerEvents="none">
      {/* Outer ring */}
      <Animated.View style={[styles.ring, styles.ring1, { transform: [{ perspective: 400 }, { rotateX: '72deg' }, { rotateZ: rot1 }] }]}>
        <Svg width={260} height={260} viewBox="0 0 260 260">
          <Circle cx={130} cy={130} r={125} stroke="rgba(91,94,244,0.35)" strokeWidth="1.5" fill="none" strokeDasharray="8 6" />
          <Circle cx={130} cy={5}   r={4}   fill="#5B5EF4" opacity={0.9} />
          <Circle cx={130} cy={255} r={3}   fill="#C9A84C" opacity={0.7} />
        </Svg>
      </Animated.View>
      {/* Inner ring */}
      <Animated.View style={[styles.ring, styles.ring2, { transform: [{ perspective: 400 }, { rotateX: '65deg' }, { rotateZ: rot2 }] }]}>
        <Svg width={190} height={190} viewBox="0 0 190 190">
          <Circle cx={95} cy={95} r={90} stroke="rgba(201,168,76,0.3)" strokeWidth="1" fill="none" strokeDasharray="4 8" />
          <Circle cx={95} cy={5}  r={3.5} fill="#10C98A" opacity={0.9} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/* ════════════════════════════════════════
   FLOATING PARTICLES
   ════════════════════════════════════════ */
const PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  x: Math.random() * width,
  y: Math.random() * height,
  r: 1 + Math.random() * 2.5,
  color: ['#5B5EF4','#C9A84C','#10C98A','#FFFFFF','#F05252'][Math.floor(Math.random() * 5)],
  dur: 2800 + Math.random() * 3000,
  delay: Math.random() * 2000,
  dy: 6 + Math.random() * 10,
}));

function Particle({ x, y, r, color, dur, delay }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(anim, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, []);
  const ty      = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const opacity = anim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.1, 0.55, 0.1] });
  return (
    <Animated.View style={[styles.particle, { left: x, top: y, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: color, transform: [{ translateY: ty }], opacity }]} />
  );
}

/* ════════════════════════════════════════
   GRID LINES (3-D floor feel)
   ════════════════════════════════════════ */
function Grid() {
  const lines = [];
  const cols = 7, rows = 5;
  const gw = width, gh = height * 0.5;
  for (let i = 0; i <= cols; i++) {
    lines.push(<Line key={`v${i}`} x1={(i / cols) * gw} y1={0} x2={cx} y2={gh * 0.35} stroke="rgba(91,94,244,0.12)" strokeWidth="0.7" />);
  }
  for (let j = 1; j <= rows; j++) {
    const py = (j / rows) * gh * 0.35;
    const lr = (j / rows);
    lines.push(<Line key={`h${j}`} x1={cx - lr * cx} y1={py} x2={cx + lr * cx} y2={py} stroke="rgba(91,94,244,0.1)" strokeWidth="0.6" />);
  }
  return (
    <Svg style={[StyleSheet.absoluteFill, { top: height * 0.54 }]} width={gw} height={gh}>
      {lines}
    </Svg>
  );
}

/* ════════════════════════════════════════
   SHADOW BLOB under crystal
   ════════════════════════════════════════ */
function ShadowBlob({ anim }) {
  const scale = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.88, 1, 0.88] });
  return (
    <Animated.View style={[styles.shadowBlob, { transform: [{ scaleX: scale }] }]}>
      <Svg width={160} height={20} viewBox="0 0 160 20">
        <Defs>
          <RadialGradient id="sh" cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor="#5B5EF4" stopOpacity="0.5" />
            <Stop offset="100%" stopColor="#000"    stopOpacity="0"   />
          </RadialGradient>
        </Defs>
        <Ellipse cx={80} cy={10} rx={80} ry={10} fill="url(#sh)" />
      </Svg>
    </Animated.View>
  );
}

/* ════════════════════════════════════════
   MAIN SCREEN
   ════════════════════════════════════════ */
export default function LoginScreen() {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [focusE,   setFocusE]   = useState(false);
  const [focusP,   setFocusP]   = useState(false);

  // Crystal Y-float
  const floatY  = useRef(new Animated.Value(0)).current;
  // Crystal rotate
  const crystalR = useRef(new Animated.Value(0)).current;
  // Orbit rings
  const orbit1   = useRef(new Animated.Value(0)).current;
  const orbit2   = useRef(new Animated.Value(0)).current;
  // Card entrance
  const cardY    = useRef(new Animated.Value(60)).current;
  const cardO    = useRef(new Animated.Value(0)).current;
  // Top entrance
  const topY     = useRef(new Animated.Value(-40)).current;
  const topO     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Float animation
    Animated.loop(Animated.sequence([
      Animated.timing(floatY, { toValue: -14, duration: 2800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(floatY, { toValue: 0,   duration: 2800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();

    // Crystal slow Y-rotation
    Animated.loop(
      Animated.timing(crystalR, { toValue: 1, duration: 7000, easing: Easing.linear, useNativeDriver: true })
    ).start();

    // Orbit rings
    Animated.loop(
      Animated.timing(orbit1, { toValue: 1, duration: 5500, easing: Easing.linear, useNativeDriver: true })
    ).start();
    Animated.loop(
      Animated.timing(orbit2, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true })
    ).start();

    // Entrance
    Animated.parallel([
      Animated.timing(topY,  { toValue: 0, duration: 700, delay: 100, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(topO,  { toValue: 1, duration: 700, delay: 100, useNativeDriver: true }),
      Animated.timing(cardY, { toValue: 0, duration: 800, delay: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(cardO, { toValue: 1, duration: 800, delay: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) { Alert.alert('Required', 'Enter your email and password.'); return; }
    setLoading(true);
    try { await login(email.trim(), password); router.replace('/(tabs)/dashboard'); }
    catch (err) { Alert.alert('Sign in failed', err.message); }
    finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Deep space background */}
      <LinearGradient colors={['#03050A','#060D1C','#0A1628','#050B18']} style={styles.root}>

        {/* Particles */}
        {PARTICLES.map(p => <Particle key={p.id} {...p} />)}

        {/* 3-D perspective grid floor */}
        <Grid />

        {/* Ambient glow blobs */}
        <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
          <Defs>
            <RadialGradient id="amb1" cx="50%" cy="50%">
              <Stop offset="0%" stopColor="#5B5EF4" stopOpacity="0.22" />
              <Stop offset="100%" stopColor="#5B5EF4" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="amb2" cx="50%" cy="50%">
              <Stop offset="0%" stopColor="#C9A84C" stopOpacity="0.14" />
              <Stop offset="100%" stopColor="#C9A84C" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse cx={cx} cy={height * 0.3} rx={220} ry={200} fill="url(#amb1)" />
          <Ellipse cx={cx * 1.7} cy={height * 0.7} rx={180} ry={160} fill="url(#amb2)" />
        </Svg>

        {/* ── Top: Brand ── */}
        <Animated.View style={[styles.top, { transform: [{ translateY: topY }], opacity: topO }]}>
          <Text style={styles.brand}>MS RM</Text>
          <Text style={styles.brandSub}>Restaurant Management System</Text>
        </Animated.View>

        {/* ── 3-D Crystal scene ── */}
        <View style={styles.scene}>
          <OrbitRings anim1={orbit1} anim2={orbit2} />
          <Animated.View style={{ transform: [{ translateY: floatY }] }}>
            <Crystal size={148} anim={crystalR} />
          </Animated.View>
          <ShadowBlob anim={floatY} />
        </View>

        {/* ── Login card ── */}
        <Animated.View style={[styles.cardWrap, { transform: [{ translateY: cardY }, { perspective: 900 }, { rotateX: '2deg' }], opacity: cardO }]}>
          {/* Top gloss line */}
          <LinearGradient colors={['rgba(255,255,255,0.35)','rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cardGloss} />

          {/* Window chrome */}
          <View style={styles.chrome}>
            <View style={[styles.dot, { backgroundColor: '#FF5F56' }]} />
            <View style={[styles.dot, { backgroundColor: '#FFBD2E' }]} />
            <View style={[styles.dot, { backgroundColor: '#27C93F' }]} />
            <Text style={styles.chromeTag}>Owner Access</Text>
          </View>

          <Text style={styles.cardTitle}>Welcome back</Text>
          <Text style={styles.cardSub}>Sign in to your command centre</Text>

          {/* Email */}
          <View style={styles.field}>
            <Text style={styles.fieldLbl}>Email address</Text>
            <View style={[styles.inputRow, focusE && styles.inputRowFocus]}>
              <Text style={styles.inputPre}>@</Text>
              <TextInput
                style={styles.input}
                placeholder="admin@demo.com"
                placeholderTextColor="#94A3B8"
                value={email} onChangeText={setEmail}
                keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
                onFocus={() => setFocusE(true)} onBlur={() => setFocusE(false)}
              />
              {email.includes('@') && <Text style={styles.ok}>✓</Text>}
            </View>
          </View>

          {/* Password */}
          <View style={styles.field}>
            <Text style={styles.fieldLbl}>Password</Text>
            <View style={[styles.inputRow, focusP && styles.inputRowFocus]}>
              <Text style={styles.inputPre}>••</Text>
              <TextInput
                style={styles.input}
                placeholder="Your password"
                placeholderTextColor="#94A3B8"
                value={password} onChangeText={setPassword}
                secureTextEntry
                onFocus={() => setFocusP(true)} onBlur={() => setFocusP(false)}
              />
            </View>
          </View>

          {/* CTA */}
          <TouchableOpacity onPress={handleLogin} disabled={loading} activeOpacity={0.82} style={styles.ctaOuter}>
            <LinearGradient colors={['#C9A84C','#96721E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
              {loading
                ? <ActivityIndicator color="#06100A" size="small" />
                : <><Text style={styles.ctaTxt}>Sign in</Text><Text style={styles.ctaArrow}>→</Text></>
              }
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.lock}>🔒  Secured · 256-bit encrypted session</Text>
        </Animated.View>

      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 32, paddingHorizontal: 20 },

  /* Particles */
  particle: { position: 'absolute' },

  /* Brand */
  top:      { alignItems: 'center', zIndex: 10 },
  brand:    { color: '#FFFFFF', fontSize: 22, fontWeight: '600', letterSpacing: 3 },
  brandSub: { color: 'rgba(255,255,255,0.28)', fontSize: 10, fontWeight: '400', letterSpacing: 1, marginTop: 4 },

  /* Crystal scene */
  scene:     { alignItems: 'center', justifyContent: 'center', height: 200, width: width, zIndex: 5 },
  orbitWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center', width: width, height: 220 },
  ring:      { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ring1:     { width: 260, height: 260 },
  ring2:     { width: 190, height: 190 },
  shadowBlob:{ marginTop: -4 },

  /* Card */
  cardWrap: {
    width: '100%', zIndex: 20,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 22,
    paddingHorizontal: 22, paddingTop: 18, paddingBottom: 22,
    overflow: 'hidden',
    shadowColor: '#5B5EF4',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.22,
    shadowRadius: 48,
    elevation: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  cardGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 },

  /* Chrome */
  chrome:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 18 },
  dot:       { width: 10, height: 10, borderRadius: 5 },
  chromeTag: { marginLeft: 'auto', color: '#94A3B8', fontSize: 9, fontWeight: '500', letterSpacing: 1.5, textTransform: 'uppercase' },

  cardTitle: { color: '#0A1628', fontSize: 19, fontWeight: '600', letterSpacing: -0.3, marginBottom: 3 },
  cardSub:   { color: '#94A3B8', fontSize: 12, fontWeight: '400', marginBottom: 22 },

  field:     { marginBottom: 13 },
  fieldLbl:  { color: '#64748B', fontSize: 11, fontWeight: '500', letterSpacing: 0.2, marginBottom: 7 },
  inputRow:  {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11,
    backgroundColor: '#F8FAFC',
  },
  inputRowFocus: { borderColor: '#5B5EF4', backgroundColor: '#F5F5FF' },
  inputPre:  { color: '#94A3B8', fontSize: 12, fontWeight: '500', minWidth: 14, textAlign: 'center' },
  input:     { flex: 1, color: '#0A1628', fontSize: 14, fontWeight: '400' },
  ok:        { color: '#10C98A', fontSize: 13, fontWeight: '600' },

  ctaOuter:  {
    marginTop: 6, marginBottom: 16, borderRadius: 10, overflow: 'hidden',
    shadowColor: '#C9A84C', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 10,
  },
  cta:      { paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  ctaTxt:   { color: '#06100A', fontSize: 14, fontWeight: '600', letterSpacing: 0.2 },
  ctaArrow: { color: '#06100A', fontSize: 17, fontWeight: '500' },

  lock: { color: '#94A3B8', fontSize: 10, fontWeight: '400', textAlign: 'center', letterSpacing: 0.2 },
});
