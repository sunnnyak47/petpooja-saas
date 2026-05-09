import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { captureError } from '../lib/sentry';

export class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    captureError(error, { componentStack: errorInfo.componentStack });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="bug" size={56} color="#EE0000" />
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          <TouchableOpacity style={styles.btn} onPress={this.handleReset}>
            <Text style={styles.btnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#FFF' },
  title: { fontSize: 20, fontWeight: '800', color: '#000', marginTop: 16 },
  message: { fontSize: 14, color: '#888', marginTop: 8, textAlign: 'center', lineHeight: 20 },
  btn: { marginTop: 24, backgroundColor: '#000', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 10 },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});
