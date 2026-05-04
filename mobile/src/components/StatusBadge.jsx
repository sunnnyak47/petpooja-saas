import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const STATUS_MAP = {
  pending:    { color: '#F5A623', label: 'PENDING' },
  preparing:  { color: '#5B5EF4', label: 'PREPARING' },
  ready:      { color: '#10C98A', label: 'READY' },
  delivered:  { color: '#5A7090', label: 'DELIVERED' },
  cancelled:  { color: '#F05252', label: 'CANCELLED' },
};

const DEFAULT = { color: '#A8B8D0', label: 'UNKNOWN' };

/**
 * StatusBadge
 * Colored pill showing order / item status.
 *
 * Props:
 *   status (string) – one of: pending | preparing | ready | delivered | cancelled
 */
export default function StatusBadge({ status = '' }) {
  const key = status.toLowerCase().trim();
  const config = STATUS_MAP[key] ?? { ...DEFAULT, label: status.toUpperCase() };

  return (
    <View style={[styles.pill, { borderColor: config.color + '40', backgroundColor: config.color + '18' }]}>
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <Text style={[styles.label, { color: config.color }]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});
