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

  // Perceived luminance (0 = black, 255 = white) of a #rgb / #rrggbb color.
  const luminance = (hex) => {
    const h = hex.replace('#', '');
    const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const r = parseInt(f.slice(0, 2), 16);
    const g = parseInt(f.slice(2, 4), 16);
    const b = parseInt(f.slice(4, 6), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };

  test('Light bg is light, Dark bg is dark', () => {
    // Semantic check (not exact hex) so token tweaks don't break the suite.
    expect(luminance(LightColors.bg)).toBeGreaterThan(200);
    expect(luminance(DarkColors.bg)).toBeLessThan(60);
  });

  test('Light and Dark text contrast their backgrounds', () => {
    expect(luminance(LightColors.text)).toBeLessThan(120);   // dark text on light bg
    expect(luminance(DarkColors.text)).toBeGreaterThan(180); // light text on dark bg
  });
});
