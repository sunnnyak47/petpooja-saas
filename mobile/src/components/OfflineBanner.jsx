import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';

export function OfflineBanner() {
  const netInfo = useNetInfo();
  if (netInfo.isConnected !== false) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>You're offline — showing cached data</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#333',
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: { color: '#FFF', fontSize: 12, fontWeight: '600' },
});
