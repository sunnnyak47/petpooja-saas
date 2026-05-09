import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { AppModeProvider } from '../src/context/AppModeContext';
import { OutletProvider } from '../src/context/OutletContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { queryClient, asyncStoragePersister } from '../src/lib/queryClient';
import LockScreen from '../src/components/LockScreen';

function RootContent() {
  const { isLocked } = useAuth();
  const { isDark, colors } = useTheme();

  return (
    <AppModeProvider>
      <OutletProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.bg} />
        <Stack
          screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="mode-select" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(owner)" />
          <Stack.Screen name="+not-found" />
        </Stack>
        {isLocked && <LockScreen />}
      </OutletProvider>
    </AppModeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: asyncStoragePersister, maxAge: 1000 * 60 * 60 * 24 }}
        >
          <AuthProvider>
            <RootContent />
          </AuthProvider>
        </PersistQueryClientProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
