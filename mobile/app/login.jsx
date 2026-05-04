import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat,
  withSequence, withDelay, Easing, interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, {
  Polygon, Defs, RadialGradient, LinearGradient as SvgGrad,
  Stop, Circle, Ellipse, Line,
} from 'react-native-svg';
import { useAuth } from '../src/context/AuthContext';

const { width, height } = Dimensions.get('window');
const cx = width / 2;

const ease = Easing.inOut(Easing.sin);

/* ── Crystal gem ─────────────────────────────────── */
function Crystal({ size = 148, rotateY }) {
  const s = size, h = size;
  const top = [s/2, 0], bot = [s/2, h];
  const ml  = [0,       h*0.38], mr  = [s,       h*0.38];
  const mml = [s*0.22,  h*0.62], mmr = [s*0.78,  h*0.62];
  const mid = [s/2,     h*0.45];
  const pts = (arr) => arr.map(p => p.join(',')).join(' ');

  const style = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${rotateY.value * 360}deg` }],
  }));

  return (
    <Animated.View style={[{ width: s, height: h }, style]}>
      <Svg width={s} height={h} viewBox={`0 0 ${s} ${h}`}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="40%" r="60%">
            <Stop offset="0%" stopColor="#A0A4FF" stopOpacity="0.9" />
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
        <Polygon points={pts([top, ml,  mid])} fill="url(#f1)" opacity={0.65} />
        <Polygon points={pts([top, mr,  mid])} fill="url(#f2)" opacity={0.6}  />
        <Polygon points={pts([bot, mml, mid])} fill="url(#f3)" opacity={0.65} />
        <Polygon points={pts([bot, mmr, mid])} fill="url(#f6)" opacity={0.55} />
        <Polygon points={pts([top, ml, mml, mid])} fill="url(#f4)" opacity={0.7} />
        <Polygon points={pts([top, mr, mmr, mid])} fill="url(#f5)" opacity={0.65} />
        <Polygon points={pts([ml, mml, mid])}      fill="url(#f1)" opacity={0.5} />
        <Polygon points={pts([mr, mmr, mid])}      fill="url(#f2)" opacity={0.45} />
        <Polygon points={pts([top, mid, ml])}      fill="url(#f4)" opacity={0.55} />
        <Polygon points={pts([top, ml, mid, mr])}  fill="url(#glow)" opacity={0.35} />
        {[[top,ml],[top,mr],[top,mid],[ml,mid],[mr,mid],[mml,mid],[mmr,mid],[ml,mml],[mr,mmr],[mml,bot],[mmr,bot]].map(([a,b],i) => (
          <Line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="rgba(255,255,255,0.18)" strokeWidth="0.8" />
        ))}
        <Ellipse cx={s*0.4} cy={h*0.28} rx={s*0.12} ry={h*0.07} fill="white" opacity={0.28} />
      </Svg>
    </Animated.View>
  );
}

/* ── Orbit rings ─────────────────────────────────── */
function OrbitRings({ orbit1, orbit2 }) {
  const s1 = useAnimatedStyle(() => ({
    transform: [{ perspective: 400 }, { rotateX: '72deg' }, { rotateZ: `${orbit1.value * 360}deg` }],
  }));
  const s2 = useAnimatedStyle(() => ({
    transform: [{ perspective: 400 }, { rotateX: '65deg' }, { rotateZ: `${orbit2.value * -360}deg` }],
  }));
  return (
    <View style={styles.orbitWrap} pointerEvents="none">
      <Animated.View style={[styles.ring, styles.ring1, s1]}>
        <Svg width={260} height={260} viewBox="0 0 260 260">
          <Circle cx={130} cy={130} r={125} stroke="rgba(91,94,244,0.35)" strokeWidth="1.5" fill="none" strokeDasharray="8 6" />
          <Circle cx={130} cy={5}   r={4}   fill="#5B5EF4" opacity={0.9} />
          <Circle cx={130} cy={255} r={3}   fill="#C9A84C" opacity={0.7} />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.ring, styles.ring2, s2]}>
        <Svg width={190} height={190} viewBox="0 0 190 190">
          <Circle cx={95} cy={95} r={90} stroke="rgba(201,168,76,0.3)" strokeWidth="1" fill="none" strokeDasharray="4 8" />
          <Circle cx={95} cy={5}  r={3.5} fill="#10C98A" opacity={0.9} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/* ── Particles ───────────────────────────────────── */
const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: Math.random() * width,
  y: Math.random() * height,
  r: 1 + Math.random() * 2.2,
  color: ['#5B5EF4','#C9A84C','#10C98A','#FFFFFF'][Math.floor(Math.random() * 4)],
  dur: 2500 + Math.random() * 2500,
  delay: Math.random() * 1500,
}));

function Particle({ x, y, r, color, dur, delay }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay,
      withRepeat(withSequence(
        withTiming(1, { duration: dur, easing: ease }),
        withTiming(0, { duration: dur, easing: ease }),
      ), -1)
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.4, 1], [0.05, 0.5, 0.05]),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [0, -16]) }],
  }));
  return (
    <Animated.View style={[styles.particle, { left: x, top: y, width: r*2, height: r*2, borderRadius: r, backgroundColor: color }, style]} />
  );
}

/* ── Main screen ─────────────────────────────────── */
export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [focusE, setFocusE]     = useState(false);
  const [focusP, setFocusP]     = useState(false);

  // Shared values — all run on UI thread
  const floatY  = useSharedValue(0);
  const crystalR = useSharedValue(0);
  const orbit1  = useSharedValue(0);
  const orbit2  = useSharedValue(0);
  const cardY   = useSharedValue(60);
  const cardO   = useSharedValue(0);
  const topY    = useSharedValue(-40);
  const topO    = useSharedValue(0);

  useEffect(() => {
    // Float — runs purely on UI thread at 60fps
    floatY.value = withRepeat(
      withSequence(
        withTiming(-14, { duration: 2800, easing: ease }),
        withTiming(0,   { duration: 2800, easing: ease }),
      ), -1
    );
    // Crystal rotation
    crystalR.value = withRepeat(withTiming(1, { duration: 7000, easing: Easing.linear }), -1);
    // Orbits
    orbit1.value = withRepeat(withTiming(1, { duration: 5500, easing: Easing.linear }), -1);
    orbit2.value = withRepeat(withTiming(1, { duration: 4000, easing: Easing.linear }), -1);
    // Entrance
    topY.value  = withDelay(100, withTiming(0,  { duration: 700, easing: Easing.out(Easing.cubic) }));
    topO.value  = withDelay(100, withTiming(1,  { duration: 700 }));
    cardY.value = withDelay(350, withTiming(0,  { duration: 800, easing: Easing.out(Easing.cubic) }));
    cardO.value = withDelay(350, withTiming(1,  { duration: 800 }));
  }, []);

  const floatStyle  = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));
  const topStyle    = useAnimatedStyle(() => ({ transform: [{ translateY: topY.value }], opacity: topO.value }));
  const cardStyle   = useAnimatedStyle(() => ({ transform: [{ translateY: cardY.value }], opacity: cardO.value }));
  const shadowScale = useAnimatedStyle(() => ({
    transform: [{ scaleX: interpolate(floatY.value, [-14, 0], [1.1, 0.85]) }],
  }));

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) { Alert.alert('Required', 'Enter your email and password.'); return; }
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)/dashboard');
    } catch (err) {
      Alert.alert('Sign in failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <LinearGradient colors={['#03050A','#060D1C','#0A1628','#050B18']} style={styles.root}>

        {PARTICLES.map(p => <Particle key={p.id} {...p} />)}

        {/* Grid floor */}
        <Svg style={[StyleSheet.absoluteFill, { top: height * 0.54 }]} width={width} height={height * 0.5}>
          {Array.from({ length: 8 }, (_, i) => (
            <Line key={`v${i}`} x1={(i/7)*width} y1={0} x2={cx} y2={height*0.18}
              stroke="rgba(91,94,244,0.1)" strokeWidth="0.7" />
          ))}
          {Array.from({ length: 5 }, (_, j) => {
            const py = ((j+1)/5)*height*0.18, lr = (j+1)/5;
            return <Line key={`h${j}`} x1={cx - lr*cx} y1={py} x2={cx + lr*cx} y2={py}
              stroke="rgba(91,94,244,0.08)" strokeWidth="0.6" />;
          })}
        </Svg>

        {/* Ambient glows */}
        <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
          <Defs>
            <RadialGradient id="amb1" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#5B5EF4" stopOpacity="0.22" />
              <Stop offset="100%" stopColor="#5B5EF4" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="amb2" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#C9A84C" stopOpacity="0.14" />
              <Stop offset="100%" stopColor="#C9A84C" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse cx={cx} cy={height*0.3} rx={220} ry={200} fill="url(#amb1)" />
          <Ellipse cx={cx*1.7} cy={height*0.7} rx={180} ry={160} fill="url(#amb2)" />
        </Svg>

        {/* Brand */}
        <Animated.View style={[styles.top, topStyle]}>
          <Text style={styles.brand}>MS RM</Text>
          <Text style={styles.brandSub}>Restaurant Management System</Text>
        </Animated.View>

        {/* Crystal scene */}
        <View style={styles.scene}>
          <OrbitRings orbit1={orbit1} orbit2={orbit2} />
          <Animated.View style={floatStyle}>
            <Crystal size={148} rotateY={crystalR} />
          </Animated.View>
          <Animated.View style={[styles.shadowBlob, shadowScale]}>
            <Svg width={160} height={20}>
              <Defs>
                <RadialGradient id="sh" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor="#5B5EF4" stopOpacity="0.5" />
                  <Stop offset="100%" stopColor="#000" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Ellipse cx={80} cy={10} rx={80} ry={10} fill="url(#sh)" />
            </Svg>
          </Animated.View>
        </View>

        {/* Login card */}
        <Animated.View style={[styles.cardWrap, cardStyle]}>
          <LinearGradient colors={['rgba(255,255,255,0.35)','rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cardGloss} />
          <View style={styles.chrome}>
            <View style={[styles.dot, { backgroundColor: '#FF5F56' }]} />
            <View style={[styles.dot, { backgroundColor: '#FFBD2E' }]} />
            <View style={[styles.dot, { backgroundColor: '#27C93F' }]} />
            <Text style={styles.chromeTag}>Owner Access</Text>
          </View>

          <Text style={styles.cardTitle}>Welcome back</Text>
          <Text style={styles.cardSub}>Sign in to your command centre</Text>

          <View style={styles.field}>
            <Text style={styles.fieldLbl}>Email address</Text>
            <View style={[styles.inputRow, focusE && styles.inputRowFocus]}>
              <Text style={styles.inputPre}>@</Text>
              <TextInput style={styles.input} placeholder="admin@demo.com"
                placeholderTextColor="#94A3B8" value={email} onChangeText={setEmail}
                keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
                onFocus={() => setFocusE(true)} onBlur={() => setFocusE(false)} />
              {email.includes('@') && <Text style={styles.ok}>✓</Text>}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLbl}>Password</Text>
            <View style={[styles.inputRow, focusP && styles.inputRowFocus]}>
              <Text style={styles.inputPre}>••</Text>
              <TextInput style={styles.input} placeholder="Your password"
                placeholderTextColor="#94A3B8" value={password} onChangeText={setPassword}
                secureTextEntry
                onFocus={() => setFocusP(true)} onBlur={() => setFocusP(false)} />
            </View>
          </View>

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
  particle: { position: 'absolute' },
  top: { alignItems: 'center', zIndex: 10 },
  brand: { color: '#FFFFFF', fontSize: 22, fontWeight: '600', letterSpacing: 3 },
  brandSub: { color: 'rgba(255,255,255,0.28)', fontSize: 10, fontWeight: '400', letterSpacing: 1, marginTop: 4 },
  scene: { alignItems: 'center', justifyContent: 'center', height: 200, width, zIndex: 5 },
  orbitWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center', width, height: 220 },
  ring: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ring1: { width: 260, height: 260 },
  ring2: { width: 190, height: 190 },
  shadowBlob: { marginTop: -4 },
  cardWrap: { width: '100%', zIndex: 20, backgroundColor: 'rgba(10,18,40,0.92)', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  cardGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  chrome: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 18 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chromeTag: { marginLeft: 'auto', color: 'rgba(255,255,255,0.25)', fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  cardTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '600', marginBottom: 4 },
  cardSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 20 },
  field: { marginBottom: 14 },
  fieldLbl: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '600', letterSpacing: 0.8, marginBottom: 6, textTransform: 'uppercase' },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, height: 46 },
  inputRowFocus: { borderColor: 'rgba(201,168,76,0.5)', backgroundColor: 'rgba(201,168,76,0.06)' },
  inputPre: { color: 'rgba(255,255,255,0.3)', fontSize: 14, marginRight: 8 },
  input: { flex: 1, color: '#FFFFFF', fontSize: 14, height: 46 },
  ok: { color: '#10C98A', fontSize: 14 },
  ctaOuter: { marginTop: 8, borderRadius: 12, overflow: 'hidden' },
  cta: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaTxt: { color: '#06100A', fontSize: 15, fontWeight: '700' },
  ctaArrow: { color: '#06100A', fontSize: 18, fontWeight: '700' },
  lock: { color: 'rgba(255,255,255,0.2)', fontSize: 10, textAlign: 'center', marginTop: 16 },
});
