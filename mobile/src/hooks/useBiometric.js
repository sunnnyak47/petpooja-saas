import { useState, useEffect, useCallback } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';

export function useBiometric() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState(null);

  useEffect(() => {
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setIsAvailable(compatible && enrolled);

      if (compatible) {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('face');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType('fingerprint');
        }
      }

      const enabled = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
      setIsEnabled(enabled === 'true');
    })();
  }, []);

  const authenticate = useCallback(async () => {
    if (!isAvailable) return { success: false, error: 'Biometrics not available' };

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Verify your identity',
      cancelLabel: 'Use Password',
      disableDeviceFallback: false,
      fallbackLabel: 'Use Passcode',
    });

    return result;
  }, [isAvailable]);

  const toggleBiometric = useCallback(async (enable) => {
    if (enable) {
      const result = await authenticate();
      if (result.success) {
        await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
        setIsEnabled(true);
        return true;
      }
      return false;
    } else {
      await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'false');
      setIsEnabled(false);
      return true;
    }
  }, [authenticate]);

  return { isAvailable, isEnabled, biometricType, authenticate, toggleBiometric };
}
