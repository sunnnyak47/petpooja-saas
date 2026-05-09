import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useBiometric } from '../hooks/useBiometric';

export default function LockScreen() {
  const { setIsLocked, touchActivity, logout } = useAuth();
  const { isEnabled, biometricType, authenticate } = useBiometric();

  const handleBiometric = async () => {
    const result = await authenticate();
    if (result.success) {
      touchActivity();
      setIsLocked(false);
    }
  };

  // Auto-trigger biometric prompt when lock screen appears
  useEffect(() => {
    if (isEnabled) {
      handleBiometric();
    }
  }, [isEnabled]);

  const handleSignIn = () => {
    setIsLocked(false);
    logout();
    router.replace('/login');
  };

  const biometricIcon = biometricType === 'face' ? 'scan' : 'finger-print';
  const biometricLabel = biometricType === 'face' ? 'Face ID' : 'Fingerprint';

  return (
    <View style={s.container}>
      <View style={s.content}>
        {/* Logo */}
        <View style={s.logoWrap}>
          <Ionicons name="restaurant" size={48} color="#FFF" />
        </View>
        <Text style={s.brand}>PetPooja</Text>

        {/* Message */}
        <Text style={s.title}>Session Expired</Text>
        <Text style={s.subtitle}>
          Your session has timed out due to inactivity.
          {'\n'}Please verify your identity to continue.
        </Text>

        {/* Biometric button */}
        {isEnabled && (
          <TouchableOpacity style={s.biometricBtn} onPress={handleBiometric} activeOpacity={0.7}>
            <Ionicons name={biometricIcon} size={28} color="#FFF" />
            <Text style={s.biometricText}>Unlock with {biometricLabel}</Text>
          </TouchableOpacity>
        )}

        {/* Fallback / Sign In */}
        <TouchableOpacity style={s.signInBtn} onPress={handleSignIn} activeOpacity={0.7}>
          <Text style={s.signInText}>
            {isEnabled ? 'Use Password Instead' : 'Sign In'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logoWrap: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  brand: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 1,
    marginBottom: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 40,
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 16,
  },
  biometricText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  signInBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  signInText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
});
