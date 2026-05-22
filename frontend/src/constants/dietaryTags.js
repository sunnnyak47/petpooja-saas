/**
 * Dietary / allergen tag definitions for the menu builder.
 *
 * Two preset lists — one for Australian outlets (Western dietary focus
 * like Gluten Free, Dairy Free, Vegan, Halal, allergen-warnings) and
 * one for Indian outlets (cultural + dietary like Jain, No Onion-Garlic,
 * Pure Veg, Sattvic alongside allergens).
 *
 * Plus an API for the owner to add their own custom tags. Custom tags
 * are stored per outlet in localStorage so they show up next time.
 */

/* ─────────────────────────────────────────────────────────────
   PRESETS — AUSTRALIA
───────────────────────────────────────────────────────────── */
export const AU_DIETARY_TAGS = [
  // Diet style
  { value: 'vegan',            label: 'Vegan',            abbr: 'VG',  bg: 'bg-green-500/20',   text: 'text-green-400',   border: 'border-green-500/30',   bgLight: 'bg-green-50',   textLight: 'text-green-700',   borderLight: 'border-green-200' },
  { value: 'vegetarian',       label: 'Vegetarian',       abbr: 'V',   bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', bgLight: 'bg-emerald-50', textLight: 'text-emerald-700', borderLight: 'border-emerald-200' },
  { value: 'plant_based',      label: 'Plant-Based',      abbr: 'PB',  bg: 'bg-lime-500/20',    text: 'text-lime-400',    border: 'border-lime-500/30',    bgLight: 'bg-lime-50',    textLight: 'text-lime-700',    borderLight: 'border-lime-200' },
  { value: 'keto',             label: 'Keto Friendly',    abbr: 'K',   bg: 'bg-purple-500/20',  text: 'text-purple-400',  border: 'border-purple-500/30',  bgLight: 'bg-purple-50',  textLight: 'text-purple-700',  borderLight: 'border-purple-200' },
  { value: 'low_carb',         label: 'Low Carb',         abbr: 'LC',  bg: 'bg-indigo-500/20',  text: 'text-indigo-400',  border: 'border-indigo-500/30',  bgLight: 'bg-indigo-50',  textLight: 'text-indigo-700',  borderLight: 'border-indigo-200' },
  { value: 'low_fodmap',       label: 'Low FODMAP',       abbr: 'LF',  bg: 'bg-cyan-500/20',    text: 'text-cyan-400',    border: 'border-cyan-500/30',    bgLight: 'bg-cyan-50',    textLight: 'text-cyan-700',    borderLight: 'border-cyan-200' },
  { value: 'sugar_free',       label: 'Sugar Free',       abbr: 'SF',  bg: 'bg-pink-500/20',    text: 'text-pink-400',    border: 'border-pink-500/30',    bgLight: 'bg-pink-50',    textLight: 'text-pink-700',    borderLight: 'border-pink-200' },
  // Allergen / sensitivity
  { value: 'gluten_free',      label: 'Gluten Free',      abbr: 'GF',  bg: 'bg-amber-500/20',   text: 'text-amber-400',   border: 'border-amber-500/30',   bgLight: 'bg-amber-50',   textLight: 'text-amber-700',   borderLight: 'border-amber-200' },
  { value: 'dairy_free',       label: 'Dairy Free',       abbr: 'DF',  bg: 'bg-blue-500/20',    text: 'text-blue-400',    border: 'border-blue-500/30',    bgLight: 'bg-blue-50',    textLight: 'text-blue-700',    borderLight: 'border-blue-200' },
  { value: 'contains_nuts',    label: 'Contains Nuts',    abbr: 'N',   bg: 'bg-orange-500/20',  text: 'text-orange-400',  border: 'border-orange-500/30',  bgLight: 'bg-orange-50',  textLight: 'text-orange-700',  borderLight: 'border-orange-200' },
  { value: 'contains_eggs',    label: 'Contains Eggs',    abbr: 'E',   bg: 'bg-yellow-500/20',  text: 'text-yellow-400',  border: 'border-yellow-500/30',  bgLight: 'bg-yellow-50',  textLight: 'text-yellow-700',  borderLight: 'border-yellow-200' },
  { value: 'contains_soy',     label: 'Contains Soy',     abbr: 'SY',  bg: 'bg-yellow-600/20',  text: 'text-yellow-500',  border: 'border-yellow-600/30',  bgLight: 'bg-yellow-100', textLight: 'text-yellow-800', borderLight: 'border-yellow-300' },
  { value: 'contains_shellfish',label:'Contains Shellfish',abbr: 'SH', bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/30',     bgLight: 'bg-red-50',     textLight: 'text-red-700',     borderLight: 'border-red-200' },
  { value: 'contains_fish',    label: 'Contains Fish',    abbr: 'F',   bg: 'bg-sky-500/20',     text: 'text-sky-400',     border: 'border-sky-500/30',     bgLight: 'bg-sky-50',     textLight: 'text-sky-700',     borderLight: 'border-sky-200' },
  { value: 'contains_sesame',  label: 'Contains Sesame',  abbr: 'SE',  bg: 'bg-stone-500/20',   text: 'text-stone-400',   border: 'border-stone-500/30',   bgLight: 'bg-stone-50',   textLight: 'text-stone-700',   borderLight: 'border-stone-200' },
  { value: 'contains_wheat',   label: 'Contains Wheat',   abbr: 'W',   bg: 'bg-amber-600/20',   text: 'text-amber-500',   border: 'border-amber-600/30',   bgLight: 'bg-amber-100',  textLight: 'text-amber-800',  borderLight: 'border-amber-300' },
  // Religious / sourcing
  { value: 'halal',            label: 'Halal',            abbr: 'H',   bg: 'bg-teal-500/20',    text: 'text-teal-400',    border: 'border-teal-500/30',    bgLight: 'bg-teal-50',    textLight: 'text-teal-700',    borderLight: 'border-teal-200' },
  { value: 'kosher',           label: 'Kosher',           abbr: 'KO',  bg: 'bg-violet-500/20',  text: 'text-violet-400',  border: 'border-violet-500/30',  bgLight: 'bg-violet-50',  textLight: 'text-violet-700',  borderLight: 'border-violet-200' },
  { value: 'organic',          label: 'Organic',          abbr: 'O',   bg: 'bg-green-600/20',   text: 'text-green-500',   border: 'border-green-600/30',   bgLight: 'bg-green-100',  textLight: 'text-green-800',  borderLight: 'border-green-300' },
  { value: 'locally_sourced',  label: 'Locally Sourced',  abbr: 'LS',  bg: 'bg-emerald-600/20', text: 'text-emerald-500', border: 'border-emerald-600/30', bgLight: 'bg-emerald-100',textLight: 'text-emerald-800',borderLight: 'border-emerald-300' },
  // Heat
  { value: 'spicy',            label: 'Spicy',            abbr: '🌶',   bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/30',     bgLight: 'bg-red-50',     textLight: 'text-red-700',     borderLight: 'border-red-200' },
];

/* ─────────────────────────────────────────────────────────────
   PRESETS — INDIA
───────────────────────────────────────────────────────────── */
export const IN_DIETARY_TAGS = [
  // Cultural diet
  { value: 'pure_veg',         label: 'Pure Veg',         abbr: 'V',   bg: 'bg-green-500/20',   text: 'text-green-400',   border: 'border-green-500/30',   bgLight: 'bg-green-50',   textLight: 'text-green-700',   borderLight: 'border-green-200' },
  { value: 'contains_egg',     label: 'Contains Egg',     abbr: 'E',   bg: 'bg-yellow-500/20',  text: 'text-yellow-400',  border: 'border-yellow-500/30',  bgLight: 'bg-yellow-50',  textLight: 'text-yellow-700',  borderLight: 'border-yellow-200' },
  { value: 'non_veg',          label: 'Non-Veg',          abbr: 'NV',  bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/30',     bgLight: 'bg-red-50',     textLight: 'text-red-700',     borderLight: 'border-red-200' },
  { value: 'jain',             label: 'Jain',             abbr: 'J',   bg: 'bg-amber-500/20',   text: 'text-amber-400',   border: 'border-amber-500/30',   bgLight: 'bg-amber-50',   textLight: 'text-amber-700',   borderLight: 'border-amber-200' },
  { value: 'sattvic',          label: 'Sattvic',          abbr: 'ST',  bg: 'bg-orange-500/20',  text: 'text-orange-400',  border: 'border-orange-500/30',  bgLight: 'bg-orange-50',  textLight: 'text-orange-700',  borderLight: 'border-orange-200' },
  { value: 'onion_garlic_free',label: 'Onion-Garlic Free',abbr: 'OGF', bg: 'bg-lime-500/20',    text: 'text-lime-400',    border: 'border-lime-500/30',    bgLight: 'bg-lime-50',    textLight: 'text-lime-700',    borderLight: 'border-lime-200' },
  { value: 'halal',            label: 'Halal',            abbr: 'H',   bg: 'bg-teal-500/20',    text: 'text-teal-400',    border: 'border-teal-500/30',    bgLight: 'bg-teal-50',    textLight: 'text-teal-700',    borderLight: 'border-teal-200' },
  // Allergens
  { value: 'gluten_free',      label: 'Gluten Free',      abbr: 'GF',  bg: 'bg-amber-500/20',   text: 'text-amber-400',   border: 'border-amber-500/30',   bgLight: 'bg-amber-50',   textLight: 'text-amber-700',   borderLight: 'border-amber-200' },
  { value: 'lactose_free',     label: 'Lactose Free',     abbr: 'LF',  bg: 'bg-blue-500/20',    text: 'text-blue-400',    border: 'border-blue-500/30',    bgLight: 'bg-blue-50',    textLight: 'text-blue-700',    borderLight: 'border-blue-200' },
  { value: 'contains_nuts',    label: 'Contains Nuts',    abbr: 'N',   bg: 'bg-orange-500/20',  text: 'text-orange-400',  border: 'border-orange-500/30',  bgLight: 'bg-orange-50',  textLight: 'text-orange-700',  borderLight: 'border-orange-200' },
  { value: 'diabetic_friendly',label: 'Diabetic Friendly',abbr: 'DF',  bg: 'bg-cyan-500/20',    text: 'text-cyan-400',    border: 'border-cyan-500/30',    bgLight: 'bg-cyan-50',    textLight: 'text-cyan-700',    borderLight: 'border-cyan-200' },
  // Sourcing / cooking
  { value: 'cow_ghee',         label: 'Made in Cow Ghee', abbr: 'CG',  bg: 'bg-yellow-600/20',  text: 'text-yellow-500',  border: 'border-yellow-600/30',  bgLight: 'bg-yellow-100', textLight: 'text-yellow-800', borderLight: 'border-yellow-300' },
  { value: 'tandoori',         label: 'Tandoori',         abbr: 'T',   bg: 'bg-red-600/20',     text: 'text-red-500',     border: 'border-red-600/30',     bgLight: 'bg-red-100',    textLight: 'text-red-800',    borderLight: 'border-red-300' },
  // Heat
  { value: 'spicy',            label: 'Spicy',            abbr: '🌶',   bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/30',     bgLight: 'bg-red-50',     textLight: 'text-red-700',     borderLight: 'border-red-200' },
  { value: 'less_spicy',       label: 'Less Spicy',       abbr: 'LS',  bg: 'bg-pink-500/20',    text: 'text-pink-400',    border: 'border-pink-500/30',    bgLight: 'bg-pink-50',    textLight: 'text-pink-700',    borderLight: 'border-pink-200' },
  // Specials
  { value: 'bestseller',       label: 'Bestseller',       abbr: '⭐',   bg: 'bg-yellow-500/20',  text: 'text-yellow-400',  border: 'border-yellow-500/30',  bgLight: 'bg-yellow-50',  textLight: 'text-yellow-700',  borderLight: 'border-yellow-200' },
  { value: 'chefs_special',    label: "Chef's Special",   abbr: 'CS',  bg: 'bg-violet-500/20',  text: 'text-violet-400',  border: 'border-violet-500/30',  bgLight: 'bg-violet-50',  textLight: 'text-violet-700',  borderLight: 'border-violet-200' },
];

/* ─────────────────────────────────────────────────────────────
   CUSTOM TAGS — per-outlet localStorage
───────────────────────────────────────────────────────────── */
const CUSTOM_TAGS_KEY = 'msrm_custom_dietary_tags';

// Rotating colour palette assigned to new custom tags by hash of the value.
// Uses the exact Tailwind class shapes used above so the picker stays consistent.
const CUSTOM_PALETTE = [
  { bg: 'bg-rose-500/20',     text: 'text-rose-400',     border: 'border-rose-500/30',     bgLight: 'bg-rose-50',     textLight: 'text-rose-700',     borderLight: 'border-rose-200' },
  { bg: 'bg-fuchsia-500/20',  text: 'text-fuchsia-400',  border: 'border-fuchsia-500/30',  bgLight: 'bg-fuchsia-50',  textLight: 'text-fuchsia-700',  borderLight: 'border-fuchsia-200' },
  { bg: 'bg-purple-500/20',   text: 'text-purple-400',   border: 'border-purple-500/30',   bgLight: 'bg-purple-50',   textLight: 'text-purple-700',   borderLight: 'border-purple-200' },
  { bg: 'bg-indigo-500/20',   text: 'text-indigo-400',   border: 'border-indigo-500/30',   bgLight: 'bg-indigo-50',   textLight: 'text-indigo-700',   borderLight: 'border-indigo-200' },
  { bg: 'bg-cyan-500/20',     text: 'text-cyan-400',     border: 'border-cyan-500/30',     bgLight: 'bg-cyan-50',     textLight: 'text-cyan-700',     borderLight: 'border-cyan-200' },
  { bg: 'bg-teal-500/20',     text: 'text-teal-400',     border: 'border-teal-500/30',     bgLight: 'bg-teal-50',     textLight: 'text-teal-700',     borderLight: 'border-teal-200' },
];

function paletteFor(value) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return CUSTOM_PALETTE[h % CUSTOM_PALETTE.length];
}

function labelToValue(label) {
  return (label || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function labelToAbbr(label) {
  const words = (label || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function loadCustomTags(outletId) {
  try {
    const all = JSON.parse(localStorage.getItem(CUSTOM_TAGS_KEY) || '{}');
    return Array.isArray(all[outletId]) ? all[outletId] : [];
  } catch { return []; }
}

export function saveCustomTags(outletId, tags) {
  try {
    const all = JSON.parse(localStorage.getItem(CUSTOM_TAGS_KEY) || '{}');
    all[outletId] = tags;
    localStorage.setItem(CUSTOM_TAGS_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('dietary-tags-changed', { detail: { outletId } }));
  } catch { /* localStorage may be unavailable in some embedded views */ }
}

/**
 * Build a fully-typed custom-tag object from a freeform label.
 * Reuses an existing preset (AU/IN merged) if the label matches one.
 */
export function makeCustomTag(label) {
  const value = labelToValue(label);
  if (!value) return null;
  // Check existing presets — if the label already matches one, reuse it.
  const existing = [...AU_DIETARY_TAGS, ...IN_DIETARY_TAGS].find(t => t.value === value);
  if (existing) return existing;
  return {
    value,
    label: label.trim(),
    abbr: labelToAbbr(label),
    custom: true,
    ...paletteFor(value),
  };
}

/**
 * Return preset list for region + any custom tags the outlet has saved,
 * de-duplicated by `value`. This is what the picker renders.
 */
export function getDietaryTagsFor(region, outletId) {
  const presets = region === 'AU' ? AU_DIETARY_TAGS : IN_DIETARY_TAGS;
  const custom = loadCustomTags(outletId);
  const seen = new Set(presets.map(t => t.value));
  const merged = [...presets];
  for (const t of custom) {
    if (!seen.has(t.value)) { merged.push(t); seen.add(t.value); }
  }
  return merged;
}

/* ─────────────────────────────────────────────────────────────
   BACK-COMPAT — AU_TAG_MAP previously used by POSPage etc.
───────────────────────────────────────────────────────────── */
export const AU_TAG_MAP = Object.fromEntries(AU_DIETARY_TAGS.map(t => [t.value, t]));
export const IN_TAG_MAP = Object.fromEntries(IN_DIETARY_TAGS.map(t => [t.value, t]));

/** Convenience lookup — also pulls custom tags for the outlet if any. */
export function getTagMap(region, outletId) {
  const list = getDietaryTagsFor(region, outletId);
  return Object.fromEntries(list.map(t => [t.value, t]));
}
