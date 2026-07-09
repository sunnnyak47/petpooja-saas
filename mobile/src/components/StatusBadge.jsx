import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const STATUS_MAP = {
  pending:    { color: '#d97706', label: 'PENDING' },
  preparing:  { color: '#2563eb', label: 'PREPARING' },
  ready:      { color: '#16a34a', label: 'READY' },
  delivered:  { color: '#475569', label: 'DELIVERED' },
  cancelled:  { color: '#dc2626', label: 'CANCELLED' },
};

const DEFAULT = { color: '#94a3b8', label: 'UNKNOWN' };

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
