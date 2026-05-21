/**
 * Voice POS Service — Conversational LLM-powered order parsing
 * Uses Groq API (Llama 3.3 70B) for natural language understanding
 * Keeps legacy fuzzy parser as offline fallback
 */
const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const https = require('https');

/* ── Groq API caller ────────────────────────────────────────── */
async function callGroq(messages) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.1,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const content = parsed.choices?.[0]?.message?.content;
          resolve(JSON.parse(content));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/* ── Fetch menu items for outlet ────────────────────────────── */
async function getMenuItems(outletId) {
  const prisma = getDbClient();
  const items = await prisma.menuItem.findMany({
    where: { outlet_id: outletId, is_deleted: false, is_active: true },
    select: {
      id: true, name: true, base_price: true, food_type: true,
      description: true,
      variants: {
        where: { is_deleted: false },
        select: { id: true, name: true, price_addition: true },
      },
    },
    take: 200,
  });
  return items;
}

/* ── Language style guide for the LLM ────────────────────────── */
// Maps the BCP-47 locale chosen by the operator into a strict
// "respond ONLY in X" directive plus a fluency style note so the
// model doesn't slip into Hinglish when the user picked English.
const LANG_DIRECTIVES = {
  'en-IN': { name: 'English',           style: "Use clear, professional Indian English. Do NOT mix in Hindi, Hinglish, or Devanagari script. No 'kya', 'aur', 'theek hai', 'haan ji' etc. Confirmations should sound like a polished waiter." },
  'en-AU': { name: 'Australian English', style: 'Use polite Australian English. Friendly but professional, no slang heavier than "mate" or "no worries". No language mixing.' },
  'en-US': { name: 'American English',   style: 'Use clear American English. Professional, no language mixing.' },
  'en-GB': { name: 'British English',    style: 'Use polite British English. Professional, no language mixing.' },
  'hi-IN': { name: 'Hindi',              style: 'Use natural conversational Hindi (Devanagari script preferred when possible, transliteration acceptable). Do NOT mix in English unless you are quoting an item name that has no Hindi equivalent.' },
  'pa-IN': { name: 'Punjabi',            style: 'Use natural Punjabi. Do NOT mix in other languages.' },
  'ta-IN': { name: 'Tamil',              style: 'Use natural Tamil. Do NOT mix in other languages.' },
  'te-IN': { name: 'Telugu',             style: 'Use natural Telugu. Do NOT mix in other languages.' },
  'kn-IN': { name: 'Kannada',            style: 'Use natural Kannada. Do NOT mix in other languages.' },
  'ml-IN': { name: 'Malayalam',          style: 'Use natural Malayalam. Do NOT mix in other languages.' },
  'mr-IN': { name: 'Marathi',            style: 'Use natural Marathi. Do NOT mix in other languages.' },
  'gu-IN': { name: 'Gujarati',           style: 'Use natural Gujarati. Do NOT mix in other languages.' },
  'bn-IN': { name: 'Bengali',            style: 'Use natural Bengali. Do NOT mix in other languages.' },
  'ur-IN': { name: 'Urdu',               style: 'Use natural Urdu. Do NOT mix in other languages.' },
  'ar-SA': { name: 'Arabic',             style: 'Use natural Modern Standard Arabic. Do NOT mix in other languages.' },
};

function languageDirective(lang) {
  const d = LANG_DIRECTIVES[lang] || LANG_DIRECTIVES['en-IN'];
  return { name: d.name, style: d.style, code: lang };
}

/* ── Build system prompt ────────────────────────────────────── */
function buildSystemPrompt(menuItems, langCode = 'en-IN') {
  const menuText = menuItems.map(item => {
    let line = `- ID:${item.id} | "${item.name}" | ₹${item.base_price} | ${item.food_type}`;
    if (item.variants?.length > 0) {
      const vars = item.variants.map(v => `${v.name}(₹${Number(item.base_price) + Number(v.price_addition)})`).join(', ');
      line += ` | variants: [${vars}]`;
    }
    return line;
  }).join('\n');

  const lang = languageDirective(langCode);

  return `You are a restaurant POS voice ordering assistant. Your job is to manage a customer's cart based on what the waiter says.

OUTPUT LANGUAGE (HARD RULE — overrides every other instruction):
- Every word of the "response" field MUST be written in ${lang.name} (locale ${lang.code}).
- ${lang.style}
- The waiter may speak in a different language; still match items by meaning, but write the reply ONLY in ${lang.name}.
- The "changes" array entries should also be in ${lang.name}.
- Item names from the MENU are kept verbatim (do not translate menu item names).

MENU:
${menuText}

RULES:
1. Parse the waiter's speech in any language and match items to the menu — handle typos, abbreviations, and regional names.
2. Extract quantities (one/two/three, ek/do/teen, onnu/rendu/moonu, etc.).
3. If an item has variants and none is specified, ask which variant in "response" (in ${lang.name}) and set action="needs_variant".
4. Handle corrections:
   - "remove paneer" → remove from cart
   - "make it 3" / "teen karo" → update last item quantity
   - "sab hatao" / "clear cart" / "start over" → empty cart, action="cleared"
   - "confirm" / "ho gaya" / "done" / "order karo" / "yes" → action="confirm"
5. Extract item-level notes ("no onion", "extra spicy", "bina pyaz") and put them in the item's notes field — translate the note INTO ${lang.name} so the kitchen receipt reads cleanly.
6. If unclear, ask one short clarifying question in ${lang.name}.
7. Keep "response" SHORT — at most one or two sentences.
8. ALWAYS return valid JSON matching the schema exactly.
9. Detect TABLE NUMBER: "table 3", "table number 5", "teen number table" → number into table_number.
10. Detect ORDER TYPE: "takeaway"/"parcel"/"packing"/"ghar ke liye" → "takeaway"; "dine in"/"andar baithenge" → "dine_in".
11. Detect CUSTOMER NAME: "Ram ka order", "Priya ke liye" → customer_name.

RESPONSE SCHEMA:
{
  "cart": [{"menu_item_id":"...","name":"...","quantity":1,"variant_id":null,"variant_name":null,"unit_price":0,"notes":"","food_type":"veg"}],
  "response": "reply in ${lang.name} only",
  "action": "continue|needs_variant|confirm|cleared",
  "unmatched": ["words not on menu"],
  "changes": ["human readable list of what changed, in ${lang.name}"],
  "table_number": null,
  "order_type": null,
  "customer_name": null
}`;
}

/* ── Main conversational parse function ─────────────────────── */
async function conversationalParse(outletId, transcript, conversationHistory, currentCart, language = 'en-IN') {
  const menuItems = await getMenuItems(outletId);

  if (!menuItems.length) {
    return {
      cart: currentCart || [],
      response: 'No menu items found. Please add items to your menu first.',
      action: 'continue',
      unmatched: [],
      changes: [],
    };
  }

  const systemPrompt = buildSystemPrompt(menuItems, language);

  // Build cart context message
  const cartContext = currentCart?.length > 0
    ? `\n\nCURRENT CART:\n${currentCart.map(i => `- ${i.name} ×${i.quantity}${i.variant_name ? ` (${i.variant_name})` : ''}${i.notes ? ` [${i.notes}]` : ''}`).join('\n')}`
    : '\n\nCURRENT CART: (empty)';

  const messages = [
    { role: 'system', content: systemPrompt + cartContext },
    ...conversationHistory,
    { role: 'user', content: transcript },
  ];

  try {
    const result = await callGroq(messages);

    // Validate and sanitise
    if (!result.cart) result.cart = currentCart || [];
    if (!result.response) result.response = 'Got it!';
    if (!result.action) result.action = 'continue';
    if (!result.unmatched) result.unmatched = [];
    if (!result.changes) result.changes = [];
    if (result.table_number === undefined) result.table_number = null;
    if (result.order_type === undefined) result.order_type = null;
    if (result.customer_name === undefined) result.customer_name = null;

    // Ensure prices are filled from menu for any items the LLM matched
    result.cart = result.cart.map(cartItem => {
      const menuItem = menuItems.find(m => m.id === cartItem.menu_item_id);
      if (menuItem) {
        const variant = cartItem.variant_id
          ? menuItem.variants?.find(v => v.id === cartItem.variant_id)
          : null;
        return {
          ...cartItem,
          unit_price: variant
            ? Number(menuItem.base_price) + Number(variant.price_addition)
            : Number(menuItem.base_price),
          food_type: cartItem.food_type || menuItem.food_type,
        };
      }
      return cartItem;
    });

    logger.info(`[VoicePOS] Turn parsed via Groq — action: ${result.action}, cart items: ${result.cart.length}`);
    return result;

  } catch (err) {
    logger.error(`[VoicePOS] Groq API error: ${err.message}`);
    // Fallback: return current cart unchanged with error message
    return {
      cart: currentCart || [],
      response: "Sorry, I didn't catch that. Could you repeat?",
      action: 'continue',
      unmatched: [],
      changes: [],
      error: err.message,
    };
  }
}

/* ── Upsell suggestions via Groq ────────────────────────────── */
async function getUpsellSuggestions(outletId, cart) {
  if (!cart?.length) return [];
  try {
    const menuItems = await getMenuItems(outletId);
    if (!menuItems.length) return [];

    // Only suggest items NOT already in cart
    const cartIds = new Set(cart.map(i => i.menu_item_id));
    const available = menuItems.filter(m => !cartIds.has(m.id));
    if (!available.length) return [];

    const cartSummary = cart.map(i => `${i.name} x${i.quantity}`).join(', ');
    const menuSummary = available.slice(0, 60).map(m =>
      `ID:${m.id}|"${m.name}"|₹${m.base_price}|${m.food_type}`
    ).join('\n');

    const messages = [
      {
        role: 'system',
        content: `You are a restaurant upsell assistant. Suggest 2-3 complementary items that pair well with the customer's order. Be concise.`,
      },
      {
        role: 'user',
        content: `Current order: ${cartSummary}\n\nAvailable items:\n${menuSummary}\n\nSuggest 2-3 complementary items. Return JSON: {"suggestions":[{"menu_item_id":"...","name":"...","unit_price":0,"food_type":"veg","reason":"pairs well with X"}]}`,
      },
    ];

    const result = await callGroq(messages);
    const suggestions = (result.suggestions || []).slice(0, 3).map(s => {
      const menuItem = menuItems.find(m => m.id === s.menu_item_id);
      if (!menuItem) return null;
      return {
        menu_item_id: menuItem.id,
        name: menuItem.name,
        unit_price: Number(menuItem.base_price),
        food_type: menuItem.food_type,
        reason: s.reason || '',
      };
    }).filter(Boolean);

    logger.info(`[VoicePOS] Upsell: ${suggestions.length} suggestions for cart of ${cart.length}`);
    return suggestions;
  } catch (err) {
    logger.warn(`[VoicePOS] Upsell error (non-fatal): ${err.message}`);
    return [];
  }
}

/* ── Place order directly from Voice POS ───────────────────── */
async function placeVoiceOrder({ outletId, cart, orderType, tableId, staffId, customerName }) {
  const { createOrder } = require('../orders/order.service');

  const orderData = {
    outlet_id: outletId,
    order_type: orderType || 'dine_in',
    table_id:   tableId  || null,
    source:     'pos',
    notes:      customerName ? `Voice order — Customer: ${customerName}` : 'Voice order',
    items: cart.map(item => ({
      menu_item_id: item.menu_item_id,
      variant_id:   item.variant_id  || null,
      quantity:     item.quantity,
      notes:        item.notes       || null,
      addons:       [],
    })),
  };

  const result = await createOrder(orderData, staffId);
  logger.info(`[VoicePOS] Order placed — #${result.order.order_number} (${orderData.order_type}) ${cart.length} items`);
  return result;
}

/* ── Supported languages ────────────────────────────────────── */
function getSupportedLanguages() {
  return [
    { code: 'en-IN', label: 'English (India)',     flag: '🇮🇳' },
    { code: 'hi-IN', label: 'हिंदी (Hindi)',        flag: '🇮🇳' },
    { code: 'pa-IN', label: 'ਪੰਜਾਬੀ (Punjabi)',    flag: '🇮🇳' },
    { code: 'ta-IN', label: 'தமிழ் (Tamil)',        flag: '🇮🇳' },
    { code: 'te-IN', label: 'తెలుగు (Telugu)',      flag: '🇮🇳' },
    { code: 'kn-IN', label: 'ಕನ್ನಡ (Kannada)',     flag: '🇮🇳' },
    { code: 'ml-IN', label: 'മലയാളം (Malayalam)',  flag: '🇮🇳' },
    { code: 'mr-IN', label: 'मराठी (Marathi)',      flag: '🇮🇳' },
    { code: 'gu-IN', label: 'ગુજરાતી (Gujarati)',  flag: '🇮🇳' },
    { code: 'bn-IN', label: 'বাংলা (Bengali)',      flag: '🇮🇳' },
    { code: 'ur-IN', label: 'اردو (Urdu)',          flag: '🇮🇳' },
    { code: 'en-AU', label: 'English (Australia)', flag: '🇦🇺' },
    { code: 'en-US', label: 'English (US)',         flag: '🇺🇸' },
  ];
}

module.exports = { conversationalParse, getSupportedLanguages, getUpsellSuggestions, placeVoiceOrder };
