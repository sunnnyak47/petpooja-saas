import { LightColors, DarkColors } from '../src/constants/colors';

describe('Color Constants', () => {
  test('LightColors has all required keys', () => {
    const requiredKeys = ['bg', 'card', 'text', 'textSecondary', 'textMuted', 'border', 'accent', 'success', 'warning', 'error', 'headerBg', 'tabBar'];
    requiredKeys.forEach(key => {
      expect(LightColors).toHaveProperty(key);
      expect(typeof LightColors[key]).toBe('string');
    });
  });

  test('DarkColors has all required keys', () => {
    const requiredKeys = ['bg', 'card', 'text', 'textSecondary', 'textMuted', 'border', 'accent', 'success', 'warning', 'error', 'headerBg', 'tabBar'];
    requiredKeys.forEach(key => {
      expect(DarkColors).toHaveProperty(key);
      expect(typeof DarkColors[key]).toBe('string');
    });
  });

  test('Light and Dark have same keys', () => {
    const lightKeys = Object.keys(LightColors).sort();
    const darkKeys = Object.keys(DarkColors).sort();
    expect(lightKeys).toEqual(darkKeys);
  });

  test('Light bg is light, Dark bg is dark', () => {
    expect(LightColors.bg).toBe('#F7F7F7');
    expect(DarkColors.bg).toBe('#0A0A0A');
  });
});
