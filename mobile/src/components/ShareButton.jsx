import React, { useState } from 'react';
import { TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function ShareButton({ onPress, color = '#0f172a', size = 22 }) {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onPress();
    } catch (e) {
      Alert.alert('Export Failed', e.message || 'Unable to generate report');
    }
    setLoading(false);
  };

  return (
    <TouchableOpacity onPress={handlePress} hitSlop={12} style={{ padding: 4 }}>
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name="share-outline" size={size} color={color} />
      )}
    </TouchableOpacity>
  );
}
