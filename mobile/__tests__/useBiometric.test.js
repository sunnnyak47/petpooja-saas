jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  supportedAuthenticationTypesAsync: jest.fn().mockResolvedValue([1]),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2 },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue('false'),
  setItem: jest.fn().mockResolvedValue(null),
}));

describe('useBiometric module', () => {
  test('module exports useBiometric function', () => {
    const mod = require('../src/hooks/useBiometric');
    expect(typeof mod.useBiometric).toBe('function');
  });
});
