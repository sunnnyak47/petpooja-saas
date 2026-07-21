/**
 * Unit tests for the pure responsive scaling math (lib/responsive). No RN render.
 * Locks that sizes scale with device width and stay clamped so nothing gets
 * absurd on tiny phones or big ones.
 */
import { clamp, scaleSize, BASE_WIDTH } from '../src/lib/responsive';

describe('clamp', () => {
  test('bounds a value', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('scaleSize', () => {
  test('is 1:1 at the base width', () => {
    expect(scaleSize(BASE_WIDTH, 40)).toBe(40);
    expect(scaleSize(390, 26)).toBe(26);
  });

  test('scales down on smaller phones', () => {
    expect(scaleSize(360, 40)).toBe(37); // 40 * (360/390)
    expect(scaleSize(375, 48)).toBeLessThan(48); // iPhone SE
  });

  test('scales up modestly on larger phones', () => {
    expect(scaleSize(430, 40)).toBe(44); // 40 * (430/390 = 1.10)
  });

  test('clamps so it never gets absurd', () => {
    expect(scaleSize(280, 40)).toBe(34); // 0.72 → floored to 0.85 → 34
    expect(scaleSize(1200, 40)).toBe(46); // huge → capped at 1.15 → 46
  });

  test('falls back to the base when width is missing', () => {
    expect(scaleSize(undefined, 40)).toBe(40);
    expect(scaleSize(0, 40)).toBe(40);
  });

  test('honours custom min/max bounds', () => {
    expect(scaleSize(300, 40, 1, 1)).toBe(40); // forced to 1x
  });
});
