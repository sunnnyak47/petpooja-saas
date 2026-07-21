/**
 * responsive — device-width scaling so screens look right on ANY phone
 * (small Android → large iPhone), iOS or Android.
 *
 * Sizes are authored against a 390pt-wide base (iPhone 14). `useScreenScale`
 * returns a factor `k` and an `s(n)` helper that scales a number to the current
 * device width, CLAMPED so text/icons never get absurdly small on tiny phones
 * or oversized on big ones. Pure + hook — no native imports beyond RN's
 * Dimensions hook.
 */
import { useWindowDimensions } from 'react-native';

export const BASE_WIDTH = 390;

/** Clamp helper. */
export function clamp(n, lo, hi) {
  return Math.min(Math.max(n, lo), hi);
}

/**
 * Scale a size to a device width. `min`/`max` bound the factor so it stays sane.
 * Exported (pure) for unit tests; the hook below wires it to the live width.
 */
export function scaleSize(width, size, min = 0.85, max = 1.15) {
  const k = clamp((width || BASE_WIDTH) / BASE_WIDTH, min, max);
  return Math.round(size * k);
}

/**
 * Hook: live device-width scale.
 * @returns {{ k:number, width:number, s:(n:number)=>number }}
 */
export function useScreenScale(min = 0.85, max = 1.15) {
  const { width } = useWindowDimensions();
  const k = clamp((width || BASE_WIDTH) / BASE_WIDTH, min, max);
  return { k, width, s: (n) => Math.round(n * k) };
}
