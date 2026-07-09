import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

// DSN comes from app config (app.json → expo.extra.sentryDsn) or an
// EXPO_PUBLIC_SENTRY_DSN env var — never hardcoded. Absent/placeholder → no-op.
const SENTRY_DSN =
  Constants.expoConfig?.extra?.sentryDsn ||
  process.env.EXPO_PUBLIC_SENTRY_DSN ||
  '';

export function initSentry() {
  if (__DEV__) return; // Don't track errors in development
  if (!SENTRY_DSN || SENTRY_DSN.includes('placeholder')) return; // not configured

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: 0.2, // 20% performance sampling
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30000,
    attachStacktrace: true,
    beforeSend(event) {
      // Strip sensitive data
      if (event.request?.headers) {
        delete event.request.headers['Authorization'];
      }
      return event;
    },
  });
}

export function setUser(user) {
  if (__DEV__) return;
  if (user) {
    Sentry.setUser({
      id: String(user.id),
      email: user.email,
      username: user.full_name || user.name,
    });
  } else {
    Sentry.setUser(null);
  }
}

export function captureError(error, context = {}) {
  if (__DEV__) {
    console.error('[Sentry]', error, context);
    return;
  }
  Sentry.withScope((scope) => {
    Object.entries(context).forEach(([key, value]) => {
      scope.setExtra(key, value);
    });
    Sentry.captureException(error);
  });
}

export function addBreadcrumb(message, category = 'app', data = {}) {
  if (__DEV__) return;
  Sentry.addBreadcrumb({ message, category, data, level: 'info' });
}

export { Sentry };
