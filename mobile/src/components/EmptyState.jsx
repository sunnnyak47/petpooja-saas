import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * EmptyState — shown when a list/screen has no data
 *
 * Props:
 *   icon      — emoji string e.g. "📋"
 *   title     — bold heading
 *   subtitle  — muted description
 *   action    — optional { label: string, onPress: fn } for a CTA button
 */
export function EmptyState({ icon = '📭', title = 'Nothing here', subtitle, action }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {action ? (
        <View style={styles.btn}>
          <Text style={styles.btnText} onPress={action.onPress}>
            {action.label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  icon: {
    fontSize: 52,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  btn: {
    marginTop: 20,
    backgroundColor: '#000000',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default EmptyState;
