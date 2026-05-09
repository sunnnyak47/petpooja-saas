import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { AuthProvider } from '../src/context/AuthContext';
import { AppModeProvider } from '../src/context/AppModeContext';
import { OutletProvider } from '../src/context/OutletContext';
import { queryClient, asyncStoragePersister } from '../src/lib/queryClient';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister, maxAge: 1000 * 60 * 60 * 24 }}
      >
        <AuthProvider>
          <AppModeProvider>
            <OutletProvider>
              <StatusBar style="dark" backgroundColor="#FFFFFF" />
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
            </OutletProvider>
          </AppModeProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
