/**
 * @fileoverview Language detection for multilingual answers (A→G item E). Detects
 * a target language the owner wants the answer in — from an explicit name
 * ("…in Hindi", "reply in Tamil") or from the script the question is written in
 * (Devanagari → Hindi, Tamil block → Tamil, …). The composer then instructs the
 * LLM to answer in that language while keeping every number/name exactly as the
 * grounded DATA has it. English is the default (returns null). Pure + no I/O.
 * @module modules/assistant/assistant.lang
 */

// Explicit language-name mentions (e.g. "how much did we sell today in hindi").
const NAME_PATTERNS = [
  ['Hindi', /\bhindi\b/i],
  ['Punjabi', /\bpunjabi\b/i],
  ['Tamil', /\btamil\b/i],
  ['Telugu', /\btelugu\b/i],
  ['Marathi', /\bmarathi\b/i],
  ['Bengali', /\b(?:bengali|bangla)\b/i],
  ['Gujarati', /\bgujarati\b/i],
  ['Kannada', /\bkannada\b/i],
  ['Malayalam', /\bmalayalam\b/i],
  ['Urdu', /\burdu\b/i],
  ['Spanish', /\bspanish\b/i],
  ['French', /\bfrench\b/i],
];

// Unicode script blocks → language (question typed in that script).
const SCRIPT_PATTERNS = [
  ['Tamil', /[஀-௿]/],
  ['Telugu', /[ఀ-౿]/],
  ['Kannada', /[ಀ-೿]/],
  ['Malayalam', /[ഀ-ൿ]/],
  ['Gujarati', /[઀-૿]/],
  ['Punjabi', /[਀-੿]/], // Gurmukhi
  ['Bengali', /[ঀ-৿]/],
  ['Hindi', /[ऀ-ॿ]/],   // Devanagari (Hindi/Marathi) → default Hindi
];

/** Target language for the answer, or null for English (the default). */
function detect(question) {
  const q = String(question || '');
  for (const [name, re] of SCRIPT_PATTERNS) if (re.test(q)) return name;
  for (const [name, re] of NAME_PATTERNS) if (re.test(q)) return name;
  return null;
}

module.exports = { detect, NAME_PATTERNS, SCRIPT_PATTERNS };
