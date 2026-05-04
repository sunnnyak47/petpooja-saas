import { useState, useEffect, useRef } from 'react';

let NetInfo = null;
try {
  NetInfo = require('@react-native-community/netinfo').default;
} catch {
  NetInfo = null;
}

function showToast(message) {
  try {
    const ToastAndroid = require('react-native').ToastAndroid;
    const Platform = require('react-native').Platform;
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }
  } catch {
    // not Android
  }

  try {
    const Alert = require('react-native').Alert;
    Alert.alert('', message, [{ text: 'OK' }], { cancelable: true });
  } catch {
    // no-op
  }
}

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const prevOnline = useRef(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (!NetInfo) return;

    const handleState = (state) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      const connecting =
        state.isConnected === true && state.isInternetReachable === null;

      setIsConnecting(connecting);

      if (initialized.current && online !== prevOnline.current) {
        showToast(online ? 'Back online' : 'No internet connection');
      }

      prevOnline.current = online;
      setIsOnline(online);
    };

    NetInfo.fetch().then((state) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      setIsOnline(online);
      prevOnline.current = online;
      initialized.current = true;
    });

    const unsubscribe = NetInfo.addEventListener(handleState);
    return unsubscribe;
  }, []);

  return { isOnline, isConnecting };
}
