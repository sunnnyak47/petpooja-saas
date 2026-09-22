import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { AppModeProvider } from '../src/context/AppModeContext';
import { OutletProvider } from '../src/context/OutletContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { SyncProvider } from '../src/context/SyncContext';
import { queryClient, asyncStoragePersister } from '../src/lib/queryClient';
import LockScreen from '../src/components/LockScreen';
import SplashFallback from '../src/components/SplashFallback';
import { initSentry, setUser as setSentryUser } from '../src/lib/sentry';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

initSentry();

function RootContent() {
  const { isLocked, user } = useAuth();
  const { isDark, colors, applyBrandColor, loaded: themeLoaded } = useTheme();

  useEffect(() => {
    setSentryUser(user);
  }, [user]);

  // Brand the accent from the tenant's primary_color (mirrors the web app).
  useEffect(() => {
    applyBrandColor(user?.primary_color);
  }, [user, applyBrandColor]);

  // Hold the seamless blue splash until the persisted theme preference has been
  // read back. Painting before this resolves makes a dark-theme user see a
  // light→dark flash on every cold start.
  if (!themeLoaded) return <SplashFallback />;

  return (
    <AppModeProvider>
      <OutletProvider>
        <SyncProvider>
          <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.bg} />
          <Stack
            screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            <Stack.Screen name="mode-select" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(owner)" />
            <Stack.Screen name="+not-found" />
          </Stack>
          {isLocked && <LockScreen />}
        </SyncProvider>
      </OutletProvider>
    </AppModeProvider>
  );
}

export default function RootLayout() {
  // Load web-parity fonts (Inter + JetBrains Mono) before rendering.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  // Render a seamless clone of the native splash (same blue, same icon) instead
  // of `null` — `null` briefly paints the transparent root as white between the
  // native splash and the app. Proceed on fontError too, so a font-CDN hiccup
  // degrades to system fonts rather than hanging on the splash forever.
  if (!fontsLoaded && !fontError) return <SplashFallback />;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ErrorBoundary>
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
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
