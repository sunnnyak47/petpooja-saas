/**
 * @fileoverview Voice POS Service — multilingual speech-to-cart parsing.
 * Supports Hindi, Punjabi, Tamil, Telugu, Kannada, Marathi, Gujarati, Bengali,
 * English (Indian + Australian). Zero cloud dependency — pure local NLP.
 * @module modules/voice-pos/voice-pos.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

/* ─────────────────────────────────────────────────────────────
   NUMBER WORD DICTIONARIES  (all → integer)
───────────────────────────────────────────────────────────── */
const NUMBER_WORDS = {
  // English
  zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,
  ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,
  sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,
  'twenty one':21,'twenty two':22,'twenty three':23,'twenty four':24,'twenty five':25,

  // Hindi / Urdu
  ek:1, do:2, dho:2, teen:3, char:4, paanch:5, panch:5, chhe:6, chhay:6,
  saat:7, sat:7, aath:8, ath:8, nau:9, das:10,
  gyarah:11, barah:12, terah:13, chaudah:14, pandrah:15,
  solah:16, satrah:17, atharah:18, unnis:19, bees:20,
  ikkis:21, baais:22, teis:23, chaubis:24, pachchis:25,

  // Punjabi
  ik:1, ikk:1, tinn:3, panj:5, chhe:6, satt:7, att:8,

  // Tamil
  onnu:1, rendu:2, moonu:3, naalu:4, anju:5, aaru:6, ezhu:7, ettu:8,
  onbathu:9, pathu:10, onbadhu:9, patthu:10,
  'oru':1, 'irandu':2, 'mounru':3, 'nangu':4,

  // Telugu
  okati:1, rendu:2, moodu:3, nalugu:4, aidu:5, aaru:6, edu:7,
  enimidi:8, tommidi:9, padi:10,

  // Kannada
  ondu:1, eradu:2, muru:3, nalku:4, aidu:5, aaru:6, elu:7,
  entu:8, ombattu:9, hattu:10,

  // Marathi
  ek:1, don:2, teen:3, char:4, paach:5, saha:6, saat:7, aath:8, nau:9, daha:10,

  // Gujarati
  ek:1, be:2, tran:3, char:4, paanch:5, chha:6, saat:7, aath:8, nav:9, das:10,

  // Bengali
  ek:1, dui:2, teen:3, char:4, pach:5, choy:6, saat:7, aat:8, noy:9, dosh:10,

  // Extra spoken variants
  'ek number':1, 'ek plate':1, 'ek glass':1, 'ek cup':1,
  'do number':2, 'do plate':2, 'teen number':3,
  'half':0.5, 'quarter':0.25,
};

/* ─────────────────────────────────────────────────────────────
   QUANTITY EXTRACTORS
───────────────────────────────────────────────────────────── */

/**
 * Extracts a leading quantity from a token string.
 * Returns { qty, rest } where rest is remaining text.
 */
function extractQuantity(text) {
  // Digit first (e.g. "2 butter chicken", "३ naan")
  const digitMatch = text.match(/^(\d+)\s+(.+)/);
  if (digitMatch) return { qty: parseInt(digitMatch[1]), rest: digitMatch[2].trim() };

  // Word numbers — try longest match first
  const sortedKeys = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length);
  for (const word of sortedKeys) {
    if (text.toLowerCase().startsWith(word + ' ')) {
      return { qty: NUMBER_WORDS[word], rest: text.slice(word.length).trim() };
    }
    if (text.toLowerCase() === word) {
      return { qty: NUMBER_WORDS[word], rest: '' };
    }
  }

  return { qty: 1, rest: text.trim() };
}

/* ─────────────────────────────────────────────────────────────
   FUZZY MATCHING
───────────────────────────────────────────────────────────── */

/** Levenshtein distance */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

/** Similarity score 0–1 (1 = perfect match) */
function similarity(a, b) {
  const norm_a = a.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const norm_b = b.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  if (!norm_a || !norm_b) return 0;
  if (norm_b.includes(norm_a) || norm_a.includes(norm_b)) return 0.92;
  const dist = levenshtein(norm_a, norm_b);
  return Math.max(0, 1 - dist / Math.max(norm_a.length, norm_b.length));
}

/** Build phonetic aliases for an item name */
function buildAliases(name) {
  const lower = name.toLowerCase().trim();
  const aliases = [lower];

  // Remove common suffixes for matching
  aliases.push(lower.replace(/\s+(masala|curry|gravy|fry|roast|special|style|tadka)$/, '').trim());

  // Common transliteration pairs (Indian restaurant items)
  const transliterations = {
    'paneer':    ['paner', 'panir', 'pneer'],
    'chicken':   ['chiken', 'chikin', 'murgh', 'murg'],
    'butter':    ['butr', 'makkhan'],
    'naan':      ['naan', 'nan', 'naan'],
    'roti':      ['chapati', 'chapatti', 'bread'],
    'biryani':   ['biriyani', 'biriani', 'briyani', 'birani'],
    'tikka':     ['tika', 'tikha'],
    'dal':       ['daal', 'dhal', 'lentil'],
    'lassi':     ['lasi', 'lassy'],
    'chai':      ['tea', 'chay', 'chhai'],
    'paratha':   ['paratha', 'parata', 'parota'],
    'samosa':    ['samosa', 'samoosa', 'samousa'],
    'dosa':      ['dosai', 'dhosa'],
    'idli':      ['idly', 'iddli'],
    'vada':      ['wada', 'vade', 'wade'],
    'raita':     ['rayta', 'raitha'],
    'chutney':   ['chatni', 'chutni'],
    'gulab':     ['gulaab'],
    'kheer':     ['keer', 'khir'],
    'halwa':     ['halva', 'halua'],
    'shahi':     ['sahi'],
    'korma':     ['qorma', 'kurma'],
    'vindaloo':  ['vindalou', 'vindalo'],
    'jalfrezi':  ['jalfrazy'],
    'saag':      ['sag', 'palak saag'],
    'palak':     ['spinach', 'palask'],
    'aloo':      ['alu', 'potato', 'aaalu'],
    'gobi':      ['goby', 'cauliflower', 'gobhi'],
    'matar':     ['matter', 'peas', 'mattar'],
    'malai':     ['cream', 'malahi'],
    'kofta':     ['kofte', 'koftay'],
    'kulfi':     ['qulfi'],
    'mango':     ['aam', 'keri'],
    'rice':      ['chawal', 'bhat', 'bhaat'],
    'water':     ['pani', 'jal'],
    'soft drink':['cold drink', 'soda', 'cola'],
  };

  for (const [key, variants] of Object.entries(transliterations)) {
    if (lower.includes(key)) {
      for (const v of variants) {
        aliases.push(lower.replace(key, v));
      }
    }
    for (const v of variants) {
      if (lower.includes(v)) {
        aliases.push(lower.replace(v, key));
      }
    }
  }

  return [...new Set(aliases)];
}

/* ─────────────────────────────────────────────────────────────
   TRANSCRIPT SEGMENTATION
───────────────────────────────────────────────────────────── */

/** Split transcript into per-item segments */
function segmentTranscript(transcript) {
  const lower = transcript.toLowerCase()
    .replace(/[,।،]/g, ' ')      // commas, devanagari danda, Arabic comma
    .replace(/\s+/g, ' ')
    .trim();

  // Conjunctions that separate items across all target languages
  const SEP = [
    ' and ', ' aur ', ' or ', ' phir ', ' saath mein ', ' ke saath ',
    ' with ', ' tatha ', ' evam ', ' mattu ', ' matrum ',
    ' va ', ' aani ', ' hag ', '  ',
  ];

  let parts = [lower];
  for (const sep of SEP) {
    parts = parts.flatMap(p => p.split(sep));
  }

  return parts.map(p => p.trim()).filter(Boolean);
}

/* ─────────────────────────────────────────────────────────────
   MAIN PARSE FUNCTION
───────────────────────────────────────────────────────────── */

/**
 * Parse a voice transcript and match against outlet menu.
 * @param {string} outletId
 * @param {string} transcript - raw speech transcript
 * @returns {Promise<{matched: object[], unmatched: string[], transcript: string}>}
 */
async function parseTranscript(outletId, transcript) {
  const prisma = getDbClient();

  // Load active menu items
  const menuItems = await prisma.menuItem.findMany({
    where: { outlet_id: outletId, is_active: true, is_deleted: false },
    select: {
      id: true, name: true, base_price: true, food_type: true,
      kitchen_station: true, is_available: true,
      variants: { select: { id: true, name: true, price: true }, take: 1 },
    },
  });

  if (!menuItems.length) {
    return { matched: [], unmatched: [], transcript, error: 'No menu items found for outlet' };
  }

  // Build alias index
  const aliasIndex = menuItems.map(item => ({
    item,
    aliases: buildAliases(item.name),
  }));

  // Segment the transcript
  const segments = segmentTranscript(transcript);
  const matched = [];
  const unmatched = [];

  for (const segment of segments) {
    if (!segment || segment.length < 2) continue;

    const { qty, rest } = extractQuantity(segment);
    const searchText = rest || segment;

    if (!searchText || searchText.length < 2) continue;

    // Score every menu item against this segment
    let bestScore = 0;
    let bestItem = null;

    for (const { item, aliases } of aliasIndex) {
      for (const alias of aliases) {
        const score = similarity(searchText, alias);
        if (score > bestScore) {
          bestScore = score;
          bestItem = item;
        }
      }
    }

    const CONFIDENCE_THRESHOLD = 0.45;
    if (bestItem && bestScore >= CONFIDENCE_THRESHOLD) {
      // Merge with existing matched item if same menu_item_id
      const existingIdx = matched.findIndex(m => m.menu_item_id === bestItem.id);
      if (existingIdx >= 0) {
        matched[existingIdx].quantity += qty;
      } else {
        matched.push({
          menu_item_id: bestItem.id,
          name: bestItem.name,
          base_price: Number(bestItem.base_price),
          food_type: bestItem.food_type,
          kitchen_station: bestItem.kitchen_station,
          quantity: qty,
          variant_id: null,
          variant_price: 0,
          addons: [],
          confidence: Math.round(bestScore * 100),
          spoken_as: segment,
        });
      }
    } else {
      unmatched.push(searchText);
    }
  }

  logger.info('Voice POS parse complete', {
    outletId,
    transcript: transcript.slice(0, 80),
    matched: matched.length,
    unmatched: unmatched.length,
  });

  return { matched, unmatched, transcript };
}

/**
 * Get supported languages list.
 */
function getSupportedLanguages() {
  return [
    { code: 'en-IN', label: 'English (India)',     flag: '🇮🇳' },
    { code: 'en-AU', label: 'English (Australia)', flag: '🇦🇺' },
    { code: 'en-US', label: 'English (US)',         flag: '🇺🇸' },
    { code: 'hi-IN', label: 'Hindi',                flag: '🇮🇳' },
    { code: 'pa-IN', label: 'Punjabi',              flag: '🇮🇳' },
    { code: 'ta-IN', label: 'Tamil',                flag: '🇮🇳' },
    { code: 'te-IN', label: 'Telugu',               flag: '🇮🇳' },
    { code: 'kn-IN', label: 'Kannada',              flag: '🇮🇳' },
    { code: 'ml-IN', label: 'Malayalam',            flag: '🇮🇳' },
    { code: 'mr-IN', label: 'Marathi',              flag: '🇮🇳' },
    { code: 'gu-IN', label: 'Gujarati',             flag: '🇮🇳' },
    { code: 'bn-IN', label: 'Bengali',              flag: '🇮🇳' },
    { code: 'ur-IN', label: 'Urdu',                 flag: '🇮🇳' },
  ];
}

module.exports = { parseTranscript, getSupportedLanguages };
