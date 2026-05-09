import { analytics } from '../src/lib/analytics';

// Mock api
jest.mock('../src/lib/api', () => ({
  __esModule: true,
  default: { post: jest.fn().mockResolvedValue({}) },
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(null),
}));

describe('Analytics', () => {
  beforeEach(() => {
    analytics.queue = [];
  });

  test('track adds event to queue', () => {
    analytics.track('test_event', { key: 'value' });
    expect(analytics.queue).toHaveLength(1);
    expect(analytics.queue[0].event).toBe('test_event');
    expect(analytics.queue[0].properties.key).toBe('value');
  });

  test('screenView tracks screen_view event', () => {
    analytics.screenView('Home');
    expect(analytics.queue).toHaveLength(1);
    expect(analytics.queue[0].event).toBe('screen_view');
    expect(analytics.queue[0].properties.screen).toBe('Home');
  });

  test('action tracks user_action event', () => {
    analytics.action('button_tap', { button: 'export' });
    expect(analytics.queue).toHaveLength(1);
    expect(analytics.queue[0].event).toBe('user_action');
    expect(analytics.queue[0].properties.action).toBe('button_tap');
  });

  test('events have timestamp and sessionDuration', () => {
    analytics.track('test');
    expect(analytics.queue[0].timestamp).toBeDefined();
    expect(typeof analytics.queue[0].sessionDuration).toBe('number');
  });

  test('flush clears queue', async () => {
    analytics.track('event1');
    analytics.track('event2');
    expect(analytics.queue).toHaveLength(2);
    await analytics.flush();
    expect(analytics.queue).toHaveLength(0);
  });
});
