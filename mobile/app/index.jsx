import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useAppMode } from '../src/context/AppModeContext';
import { View, ActivityIndicator } from 'react-native';

// Roles that get the mode-selection screen (POS vs Owner)
const OWNER_ROLES = ['owner', 'super_admin'];

export default function Index() {
  const { user, loading } = useAuth();
  const { mode, loading: modeLoading } = useAppMode();

  if (loading || modeLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#000000" />
      </View>
    );
  }

  // Not logged in → login
  if (!user) return <Redirect href="/login" />;

  // Cashier / waiter → POS only (no mode picker)
  if (!OWNER_ROLES.includes(user.role)) {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  // Owner / super_admin with a saved mode preference → go straight there
  if (mode === 'owner') return <Redirect href="/(owner)/home" />;
  if (mode === 'pos') return <Redirect href="/(tabs)/dashboard" />;

  // First time → show mode picker
  return <Redirect href="/mode-select" />;
}
