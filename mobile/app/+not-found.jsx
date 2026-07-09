import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router, usePathname } from 'expo-router';

export default function NotFound() {
  const path = usePathname();

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🔍</Text>
      <Text style={styles.title}>Page Not Found</Text>
      <Text style={styles.subtitle}>{path}</Text>
      <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(tabs)/dashboard')}>
        <Text style={styles.btnText}>Go to Dashboard</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#111111', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#888888', marginBottom: 32, textAlign: 'center' },
  btn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
