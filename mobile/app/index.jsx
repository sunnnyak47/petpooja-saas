import { useState, useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useAppMode } from '../src/context/AppModeContext';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Roles that get the two-surface experience (POS vs Owner) and the mode picker.
const OWNER_ROLES = ['owner', 'super_admin', 'manager'];

// Single source of truth for the default surface when the user has NOT saved a
// mode yet. POS-only roles (cashier / waiter / kitchen) always land in POS;
// owner-capable roles return null so the onboarding / mode-select flow runs.
function defaultModeForRole(role) {
  if (OWNER_ROLES.includes(role)) return null;
  return 'pos';
}

export default function Index() {
  const { user, loading } = useAuth();
  const { mode, loading: modeLoading } = useAppMode();
  const [onboardingDone, setOnboardingDone] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('onboarding_complete')
      .then((val) => setOnboardingDone(val === 'true'))
      // If storage is unreadable, treat as "not onboarded" rather than hang the
      // gate forever on a blank spinner — the router can then proceed safely.
      .catch(() => setOnboardingDone(false));
  }, []);

  if (loading || modeLoading || onboardingDone === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Not logged in → login.
  if (!user) return <Redirect href="/login" />;

  // Effective mode: saved preference first, else a role-derived default.
  const effectiveMode = mode || defaultModeForRole(user.role);

  // POS-only roles (cashier / waiter / kitchen) → straight to POS, no picker.
  if (!OWNER_ROLES.includes(user.role)) {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  // Owner-capable role with a saved / resolved mode → go straight there.
  if (effectiveMode === 'owner') return <Redirect href="/(owner)/home" />;
  if (effectiveMode === 'pos') return <Redirect href="/(tabs)/dashboard" />;

  // First-time owner-capable user who hasn't seen onboarding → onboarding.
  if (!onboardingDone) return <Redirect href="/onboarding" />;

  // Onboarded but no mode chosen yet → mode picker.
  return <Redirect href="/mode-select" />;
}
