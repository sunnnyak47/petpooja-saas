import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

const EVENTS_KEY = 'analytics_events';
const BATCH_SIZE = 20;

class Analytics {
  constructor() {
    this.queue = [];
    this.sessionStart = Date.now();
  }

  track(event, properties = {}) {
    const entry = {
      event,
      properties,
      timestamp: new Date().toISOString(),
      sessionDuration: Math.floor((Date.now() - this.sessionStart) / 1000),
    };

    this.queue.push(entry);

    if (__DEV__) {
      console.log('[Analytics]', event, properties);
    }

    // Auto-flush when batch is full
    if (this.queue.length >= BATCH_SIZE) {
      this.flush();
    }
  }

  screenView(screenName) {
    this.track('screen_view', { screen: screenName });
  }

  action(actionName, details = {}) {
    this.track('user_action', { action: actionName, ...details });
  }

  async flush() {
    if (this.queue.length === 0) return;

    const events = [...this.queue];
    this.queue = [];

    try {
      // Try sending to backend
      await api.post('/analytics/events', { events });
    } catch {
      // Store locally if offline
      try {
        const existing = await AsyncStorage.getItem(EVENTS_KEY);
        const stored = existing ? JSON.parse(existing) : [];
        stored.push(...events);
        // Keep max 500 events locally
        const trimmed = stored.slice(-500);
        await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(trimmed));
      } catch {}
    }
  }

  async flushStored() {
    try {
      const stored = await AsyncStorage.getItem(EVENTS_KEY);
      if (!stored) return;
      const events = JSON.parse(stored);
      if (events.length > 0) {
        await api.post('/analytics/events', { events });
        await AsyncStorage.removeItem(EVENTS_KEY);
      }
    } catch {}
  }
}

export const analytics = new Analytics();
