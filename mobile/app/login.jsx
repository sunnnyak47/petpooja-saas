import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  Pressable, StatusBar,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { warmup } from '../src/lib/api';

/* ── Design tokens — aligned 1:1 with the web MS-RM theme ─────────────── */
const C = {
  bg:           '#f8fafc',   // slate-50  (web page bg)
  card:         '#ffffff',
  border:       '#e2e8f0',   // slate-200
  text:         '#0f172a',   // slate-900 (was pure black)
  textSec:      '#475569',   // slate-600
  textMuted:    '#94a3b8',   // slate-400
  accent:       '#2563eb',   // blue-600  (web --accent)
  btnBg:        '#2563eb',   // MS-RM blue (was pure black)
  btnText:      '#ffffff',
  inputBg:      '#ffffff',
  inputBorder:  '#e2e8f0',
  inputFocus:   '#2563eb',   // accent focus ring (was black)
  error:        '#dc2626',   // red-600
  success:      '#16a34a',   // green-600
  placeholder:  '#94a3b8',
};

/* ── Simple input with animated border ──────────────── */
function Input({ value, onChangeText, placeholder, icon, secure, keyboardType, rightElement }) {
  const [focused, setFocused] = useState(false);
  const borderAnim = useSharedValue(0);

  useEffect(() => {
    borderAnim.value = withTiming(focused ? 1 : 0, { duration: 300 });
  }, [focused]);

  const wrapStyle = useAnimatedStyle(() => ({
    borderColor: borderAnim.value > 0.5 ? C.inputFocus : C.inputBorder,
  }));

  return (
    <Animated.View style={[styles.inputWrap, wrapStyle]}>
      <Ionicons name={icon} size={16} color={C.textMuted} style={styles.inputIcon} />
      <TextInput
        style={styles.inputText}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.placeholder}
        secureTextEntry={secure}
        keyboardType={keyboardType || 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        selectionColor={C.text}
      />
      {rightElement && <View style={styles.inputRight}>{rightElement}</View>}
    </Animated.View>
  );
}

/* ── Main login screen ───────────────────────────────── */
export default function LoginScreen() {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  /* Entrance animations */
  const logoO = useSharedValue(0);
  const logoY = useSharedValue(-16);
  const formY = useSharedValue(40);
  const formO = useSharedValue(0);

  useEffect(() => {
    warmup(); // wake a possibly cold-started backend while the user types
    logoO.value = withTiming(1, { duration: 480 });
    logoY.value = withSpring(0, { damping: 22, stiffness: 280 });
    setTimeout(() => {
      formY.value = withSpring(0, { damping: 22, stiffness: 280 });
      formO.value = withTiming(1, { duration: 400 });
    }, 120);
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoO.value,
    transform: [{ translateY: logoY.value }],
  }));
  const formStyle = useAnimatedStyle(() => ({
    opacity: formO.value,
    transform: [{ translateY: formY.value }],
  }));

  /* Button press scale */
  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      // Delegate routing to the index router (app/index.jsx) — it is the single
      // authority that picks owner vs POS surface from role + saved app_mode,
      // and handles the onboarding / mode-select flow. Previously this hard-
      // routed EVERYONE to the POS dashboard, ignoring role and saved mode.
      router.replace('/');
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
        color={C.textMuted}
      />
    </Pressable>
  );

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Top brand section ── */}
        <Animated.View style={[styles.topSection, logoStyle]}>
          {/* Logo mark */}
          <View style={styles.logoBox}>
            <Ionicons name="restaurant-outline" size={24} color="#FFFFFF" />
          </View>

          <Text style={styles.brandName}>MS-RM</Text>
          <Text style={styles.brandTagline}>RESTAURANT MANAGEMENT SYSTEM</Text>

          <View style={styles.separator} />

          <Text style={styles.statsText}>
            Orders · Tables · Inventory · Reports — one dashboard
          </Text>
        </Animated.View>

        {/* ── Form card ── */}
        <Animated.View style={[styles.card, formStyle]}>
          <Text style={styles.cardTitle}>Sign in</Text>
          <Text style={styles.cardSubtitle}>Access your restaurant dashboard</Text>

          <View style={styles.fields}>
            <Input
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              icon="at-outline"
              keyboardType="email-address"
            />

            <View style={styles.fieldGap} />

            <Input
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              icon="lock-closed-outline"
              secure={!showPass}
              rightElement={eyeToggle}
            />
          </View>

          <TouchableOpacity style={styles.forgotRow} activeOpacity={0.7}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          {/* Sign in button */}
          <Animated.View style={btnStyle}>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => {
                btnScale.value = withSpring(0.97, { damping: 18, stiffness: 400 }, () => {
                  btnScale.value = withSpring(1, { damping: 18, stiffness: 400 });
                });
                handleLogin();
              }}
              disabled={loading}
              activeOpacity={1}
            >
              {loading ? (
                <ActivityIndicator color={C.btnText} size="small" />
              ) : (
                <Text style={styles.btnText}>Sign in →</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>

        {/* ── Footer ── */}
        <Text style={styles.footer}>Secured · v1.0.0</Text>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────── */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  kav: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 24,
  },

  /* Top brand */
  topSection: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
  },
  logoBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  brandName: {
    color: C.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 2,
  },
  brandTagline: {
    color: C.textSec,
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 4,
  },
  separator: {
    width: 40,
    height: 1,
    backgroundColor: C.border,
    marginVertical: 14,
  },
  statsText: {
    color: C.textMuted,
    fontSize: 11,
    letterSpacing: 0.2,
  },

  /* Card */
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 24,
    paddingVertical: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: {
    color: C.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSubtitle: {
    color: C.textSec,
    fontSize: 14,
    marginBottom: 22,
  },

  /* Fields */
  fields: {},
  fieldGap: { height: 12 },

  /* Input */
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  inputText: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    height: 44,
  },
  inputRight: {
    marginLeft: 8,
  },

  /* Forgot */
  forgotRow: {
    alignItems: 'flex-end',
    marginTop: 10,
    marginBottom: 6,
  },
  forgotText: {
    color: C.accent,
    fontSize: 12,
  },

  /* Error */
  errorText: {
    color: C.error,
    fontSize: 12,
    marginTop: 8,
    marginBottom: 4,
  },

  /* Button */
  btn: {
    backgroundColor: C.btnBg,
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  btnText: {
    color: C.btnText,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  /* Footer */
  footer: {
    color: C.placeholder,
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 8,
  },
});
