/**
 * AU dietary / allergen tag definitions.
 * Each tag maps to full Tailwind classes (no dynamic `bg-${color}` — Tailwind purges those).
 * Used by MenuPage, POSPage, and CustomerOrderPage when region === 'AU'.
 */

export const AU_DIETARY_TAGS = [
  { value: 'vegan',             label: 'Vegan',              abbr: 'VG', bg: 'bg-green-500/20',  text: 'text-green-400',  border: 'border-green-500/30',  bgLight: 'bg-green-50',  textLight: 'text-green-700',  borderLight: 'border-green-200' },
  { value: 'vegetarian',        label: 'Vegetarian',         abbr: 'V',  bg: 'bg-emerald-500/20',text: 'text-emerald-400',border: 'border-emerald-500/30',bgLight: 'bg-emerald-50',textLight: 'text-emerald-700',borderLight: 'border-emerald-200' },
  { value: 'gluten_free',       label: 'Gluten Free',        abbr: 'GF', bg: 'bg-amber-500/20',  text: 'text-amber-400',  border: 'border-amber-500/30',  bgLight: 'bg-amber-50',  textLight: 'text-amber-700',  borderLight: 'border-amber-200' },
  { value: 'dairy_free',        label: 'Dairy Free',         abbr: 'DF', bg: 'bg-blue-500/20',   text: 'text-blue-400',   border: 'border-blue-500/30',   bgLight: 'bg-blue-50',   textLight: 'text-blue-700',   borderLight: 'border-blue-200' },
  { value: 'contains_nuts',     label: 'Contains Nuts',      abbr: 'N',  bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', bgLight: 'bg-orange-50', textLight: 'text-orange-700', borderLight: 'border-orange-200' },
  { value: 'halal',             label: 'Halal',              abbr: 'H',  bg: 'bg-teal-500/20',   text: 'text-teal-400',   border: 'border-teal-500/30',   bgLight: 'bg-teal-50',   textLight: 'text-teal-700',   borderLight: 'border-teal-200' },
  { value: 'contains_shellfish',label: 'Contains Shellfish', abbr: 'SF', bg: 'bg-red-500/20',    text: 'text-red-400',    border: 'border-red-500/30',    bgLight: 'bg-red-50',    textLight: 'text-red-700',    borderLight: 'border-red-200' },
  { value: 'contains_soy',     label: 'Contains Soy',       abbr: 'SY', bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', bgLight: 'bg-yellow-50', textLight: 'text-yellow-700', borderLight: 'border-yellow-200' },
];

/** Lookup map: value -> tag object */
export const AU_TAG_MAP = Object.fromEntries(AU_DIETARY_TAGS.map(t => [t.value, t]));
