import { View, Image, ActivityIndicator, StyleSheet } from 'react-native';

/**
 * SplashFallback — a JS-rendered clone of the native splash screen.
 *
 * WHY THIS EXISTS: the root layout can't paint the real app until (a) the
 * web-parity fonts finish loading and (b) the persisted theme preference is
 * read back from AsyncStorage. During that gap the old code did `return null`,
 * which paints a transparent root over a root view that has no background —
 * so the user saw the blue native splash blink to WHITE, then the app appeared.
 * That white blink is the "launch glitch".
 *
 * This view fills the screen with the EXACT splash background (#2563eb) and the
 * same splash icon, so the native-splash → JS handoff is visually seamless.
 * Keep the colour and image in sync with app.json > expo.splash.
 */
const SPLASH_BG = '#2563eb';

export default function SplashFallback() {
  return (
    <View style={styles.root}>
      <Image
        source={require('../../assets/images/splash-icon.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <ActivityIndicator color="#ffffff" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SPLASH_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 140, height: 140 },
  spinner: { marginTop: 28 },
});
