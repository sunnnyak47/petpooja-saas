import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  Dimensions, Pressable,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat,
  withSequence, withDelay, Easing, interpolate, withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Defs, Pattern, Rect, RadialGradient, Stop, Ellipse, Circle } from 'react-native-svg';
import { useAuth } from '../src/context/AuthContext';
import { Colors } from '../src/constants/colors';

const { width, height } = Dimensions.get('window');

/* ── Animated grid background ───────────────────────── */
function GridBackground() {
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
      <Defs>
        <Pattern id="grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
          <Rect width="40" height="40" fill="none" />
          <Rect x="0" y="0" width="40" height="1" fill="rgba(30,58,95,0.45)" />
          <Rect x="0" y="0" width="1" height="40" fill="rgba(30,58,95,0.45)" />
        </Pattern>
        <RadialGradient id="fade" cx="50%" cy="50%" r="60%">
          <Stop offset="0%" stopColor="#050A14" stopOpacity="0" />
          <Stop offset="100%" stopColor="#050A14" stopOpacity="1" />
        </RadialGradient>
        <RadialGradient id="glow1" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#1E3A5F" stopOpacity="0.35" />
          <Stop offset="100%" stopColor="#1E3A5F" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="glow2" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#C9A84C" stopOpacity="0.12" />
          <Stop offset="100%" stopColor="#C9A84C" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* Grid tile */}
      <Rect width={width} height={height} fill="url(#grid)" />
      {/* Vignette fade */}
      <Rect width={width} height={height} fill="url(#fade)" />
      {/* Ambient glows */}
      <Ellipse cx={width * 0.5} cy={height * 0.22} rx={260} ry={200} fill="url(#glow1)" />
      <Ellipse cx={width * 0.8} cy={height * 0.75} rx={200} ry={160} fill="url(#glow2)" />
    </Svg>
  );
}

/* ── Live pulse dot ──────────────────────────────────── */
function LivePulse() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.7);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.6, { duration: 900, easing: Easing.out(Easing.ease) }),
        withTiming(1,   { duration: 900, easing: Easing.in(Easing.ease) }),
      ), -1
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.1, { duration: 900 }),
        withTiming(0.7, { duration: 900 }),
      ), -1
    );
  }, []);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.liveRow}>
      <View style={styles.liveDotWrap}>
        <Animated.View style={[styles.liveDotRing, ringStyle]} />
        <View style={styles.liveDot} />
      </View>
      <Text style={styles.liveText}>LIVE SYSTEM</Text>
    </View>
  );
}

/* ── Fork+Knife SVG brand mark ───────────────────────── */
function BrandIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 48 48">
      <Defs>
        <RadialGradient id="iconGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#F0C040" stopOpacity="0.25" />
          <Stop offset="100%" stopColor="#C9A84C" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx="24" cy="24" r="24" fill="url(#iconGlow)" />
      {/* Fork */}
      <Rect x="13" y="6" width="2" height="10" rx="1" fill="#C9A84C" />
      <Rect x="17" y="6" width="2" height="10" rx="1" fill="#C9A84C" />
      <Rect x="21" y="6" width="2" height="10" rx="1" fill="#C9A84C" />
      <Rect x="13" y="16" width="10" height="2" rx="1" fill="#C9A84C" />
      <Rect x="16" y="18" width="2" height="24" rx="1" fill="#C9A84C" />
      {/* Knife */}
      <Rect x="30" y="6" width="2.5" height="22" rx="1.25" fill="#F0C040" />
      <Rect x="27" y="6" width="5" height="14" rx="2.5" fill="none" stroke="#F0C040" strokeWidth="1.2" />
      <Rect x="30" y="28" width="2.5" height="14" rx="1.25" fill="#F0C040" />
    </Svg>
  );
}

/* ── Shimmer button ──────────────────────────────────── */
function ShimmerButton({ onPress, loading, disabled }) {
  const shimmerX = useSharedValue(-width);

  useEffect(() => {
    shimmerX.value = withRepeat(
      withSequence(
        withDelay(1800, withTiming(width, { duration: 900, easing: Easing.inOut(Easing.ease) })),
        withTiming(-width, { duration: 0 }),
      ), -1
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.88}
      style={styles.btnOuter}
    >
      <LinearGradient
        colors={['#0F1D35', '#162840']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.btnInner}
      >
        {/* Gold gradient border via absolute overlay */}
        <LinearGradient
          colors={['#C9A84C', '#F0C040', '#C9A84C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.btnBorder}
        />
        {/* Shimmer sweep */}
        <Animated.View style={[styles.shimmerTrack, shimmerStyle]} pointerEvents="none">
          <LinearGradient
            colors={['rgba(240,192,64,0)', 'rgba(240,192,64,0.18)', 'rgba(240,192,64,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.shimmer}
          />
        </Animated.View>

        {loading ? (
          <ActivityIndicator color={Colors.gold} size="small" />
        ) : (
          <View style={styles.btnContent}>
            <Text style={styles.btnText}>Sign in</Text>
            <Ionicons name="arrow-forward" size={16} color={Colors.gold} style={{ marginLeft: 8 }} />
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

/* ── Floating label input ─────────────────────────────── */
function FloatingInput({ label, value, onChangeText, icon, secureEntry, keyboardType, autoCapitalize, rightElement }) {
  const [focused, setFocused] = useState(false);
  const labelAnim = useSharedValue(value ? 1 : 0);
  const borderAnim = useSharedValue(0);

  const hasValue = value.length > 0;

  useEffect(() => {
    labelAnim.value = withTiming(focused || hasValue ? 1 : 0, { duration: 180 });
    borderAnim.value = withTiming(focused ? 1 : 0, { duration: 200 });
  }, [focused, hasValue]);

  const labelStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(labelAnim.value, [0, 1], [0, -22]) },
      { scale: interpolate(labelAnim.value, [0, 1], [1, 0.82]) },
    ],
    color: focused
      ? Colors.gold
      : `rgba(90,112,144,${interpolate(labelAnim.value, [0, 1], [1, 0.9])})`,
  }));

  const borderStyle = useAnimatedStyle(() => ({
    borderBottomColor: interpolate(borderAnim.value, [0, 1], [0, 1]) > 0.5
      ? Colors.gold
      : Colors.border,
    borderBottomWidth: interpolate(borderAnim.value, [0, 1], [1, 1.8]),
  }));

  return (
    <Animated.View style={[styles.floatField, borderStyle]}>
      <View style={styles.floatIconWrap}>
        <Ionicons name={icon} size={15} color={focused ? Colors.gold : Colors.text3} />
      </View>
      <View style={styles.floatInner}>
        <Animated.Text style={[styles.floatLabel, labelStyle]}>{label}</Animated.Text>
        <TextInput
          style={styles.floatInput}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureEntry}
          keyboardType={keyboardType || 'default'}
          autoCapitalize={autoCapitalize || 'none'}
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          selectionColor={Colors.gold}
        />
      </View>
      {rightElement && <View style={styles.floatRight}>{rightElement}</View>}
    </Animated.View>
  );
}

/* ── Main login screen ───────────────────────────────── */
export default function LoginScreen() {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // Entrance animations
  const topY  = useSharedValue(-32);
  const topO  = useSharedValue(0);
  const formY = useSharedValue(48);
  const formO = useSharedValue(0);

  useEffect(() => {
    topY.value  = withDelay(80,  withTiming(0, { duration: 680, easing: Easing.out(Easing.cubic) }));
    topO.value  = withDelay(80,  withTiming(1, { duration: 680 }));
    formY.value = withDelay(300, withTiming(0, { duration: 720, easing: Easing.out(Easing.cubic) }));
    formO.value = withDelay(300, withTiming(1, { duration: 720 }));
  }, []);

  const topStyle  = useAnimatedStyle(() => ({ opacity: topO.value,  transform: [{ translateY: topY.value  }] }));
  const formStyle = useAnimatedStyle(() => ({ opacity: formO.value, transform: [{ translateY: formY.value }] }));

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)/dashboard');
    } catch (err) {
      setError(err.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const eyeToggle = (
    <Pressable onPress={() => setShowPass(v => !v)} hitSlop={12}>
      <Ionicons
        name={showPass ? 'eye-off-outline' : 'eye-outline'}
        size={18}
        color={Colors.text3}
      />
    </Pressable>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <GridBackground />

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* ── Top brand section (40%) ── */}
        <Animated.View style={[styles.topSection, topStyle]}>
          <View style={styles.iconWrap}>
            <BrandIcon />
          </View>

          <Text style={styles.brandName}>MS-RM</Text>
          <Text style={styles.brandTagline}>Restaurant Management System</Text>

          <View style={styles.statsStrip}>
            <Text style={styles.statsText}>₹2.4Cr processed</Text>
            <View style={styles.statsDot} />
            <Text style={styles.statsText}>12k orders</Text>
            <View style={styles.statsDot} />
            <Text style={styles.statsText}>48 outlets active</Text>
          </View>

          <LivePulse />
        </Animated.View>

        {/* ── Form section ── */}
        <Animated.View style={[styles.formSection, formStyle]}>
          {/* Subtle top edge gloss */}
          <LinearGradient
            colors={['rgba(240,192,64,0.06)', 'transparent']}
            style={styles.formGloss}
          />

          <Text style={styles.formTitle}>Owner Access</Text>
          <Text style={styles.formSubtitle}>Restricted to verified restaurant owners</Text>

          <View style={styles.fields}>
            <FloatingInput
              label="Email address"
              value={email}
              onChangeText={setEmail}
              icon="at-outline"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <View style={{ marginTop: 28 }}>
              <FloatingInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                icon="lock-closed-outline"
                secureEntry={!showPass}
                rightElement={eyeToggle}
              />
            </View>

            <TouchableOpacity style={styles.forgotRow} activeOpacity={0.7}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={14} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <ShimmerButton onPress={handleLogin} loading={loading} disabled={loading} />

          <Text style={styles.securityText}>Secured with 256-bit AES · v1.0.0</Text>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────── */
const FORM_RADIUS = 24;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050A14',
  },
  kav: {
    flex: 1,
    justifyContent: 'space-between',
  },

  /* Top section */
  topSection: {
    flex: 0.42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(201,168,76,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  brandName: {
    color: Colors.text1,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  brandTagline: {
    color: Colors.text3,
    fontSize: 11,
    fontWeight: '400',
    letterSpacing: 1.6,
    marginTop: 5,
    textTransform: 'uppercase',
  },
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  statsText: {
    color: Colors.gold,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
    opacity: 0.85,
  },
  statsDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.goldDim,
  },

  /* Live pulse */
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 7,
    backgroundColor: 'rgba(16,201,138,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16,201,138,0.18)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  liveDotWrap: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDotRing: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  liveText: {
    color: Colors.success,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },

  /* Form section */
  formSection: {
    flex: 0.58,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: FORM_RADIUS,
    borderTopRightRadius: FORM_RADIUS,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  formGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    borderTopLeftRadius: FORM_RADIUS,
    borderTopRightRadius: FORM_RADIUS,
  },
  formTitle: {
    color: Colors.text1,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  formSubtitle: {
    color: Colors.text3,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 28,
  },
  fields: {
    marginBottom: 8,
  },

  /* Floating label input */
  floatField: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 10,
    minHeight: 58,
  },
  floatIconWrap: {
    marginRight: 10,
    marginBottom: 2,
    width: 20,
    alignItems: 'center',
  },
  floatInner: {
    flex: 1,
    position: 'relative',
    justifyContent: 'flex-end',
  },
  floatLabel: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    fontSize: 14,
    transformOrigin: 'left bottom',
  },
  floatInput: {
    color: Colors.text1,
    fontSize: 14,
    height: 28,
    padding: 0,
  },
  floatRight: {
    marginLeft: 10,
    marginBottom: 4,
  },
  forgotRow: {
    alignItems: 'flex-end',
    marginTop: 14,
  },
  forgotText: {
    color: Colors.text3,
    fontSize: 12,
  },

  /* Error */
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(240,82,82,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,82,82,0.2)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 14,
    marginTop: 4,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    flex: 1,
  },

  /* Shimmer button */
  btnOuter: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  btnBorder: {
    position: 'absolute',
    inset: 0,
    top: 0, left: 0, right: 0, bottom: 0,
  },
  btnInner: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 1.2,
    borderRadius: 11,
    overflow: 'hidden',
  },
  shimmerTrack: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 120,
  },
  shimmer: {
    flex: 1,
    width: 120,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnText: {
    color: Colors.gold,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.6,
  },

  /* Footer */
  securityText: {
    color: Colors.text4,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 20,
    letterSpacing: 0.4,
  },
});
