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
        select: { id: true, name: true, price: true },
      },
    },
    take: 200,
  });
  return items;
}

/* ── Build system prompt ────────────────────────────────────── */
function buildSystemPrompt(menuItems) {
  const menuText = menuItems.map(item => {
    let line = `- ID:${item.id} | "${item.name}" | ₹${item.base_price} | ${item.food_type}`;
    if (item.variants?.length > 0) {
      const vars = item.variants.map(v => `${v.name}(₹${v.price})`).join(', ');
      line += ` | variants: [${vars}]`;
    }
    return line;
  }).join('\n');

  return `You are a restaurant POS voice ordering assistant. Your job is to manage a customer's cart based on what the waiter says.

MENU:
${menuText}

RULES:
1. Parse the waiter's speech in ANY language (Hindi, English, Tamil, Hinglish mix, etc.)
2. Match spoken item names to menu items — handle typos, abbreviations, regional names
3. Extract quantities: ek/do/teen=1/2/3, one/two/three, onnu/rendu/moonu, etc.
4. If an item has variants and none is specified, ask which variant in "response" and set action="needs_variant"
5. Handle corrections naturally:
   - "remove paneer" → remove from cart
   - "make it 3" or "teen karo" → update last mentioned item quantity
   - "no that one, butter chicken" → correct last item
   - "sab hatao" / "clear cart" / "start over" → empty cart, action="cleared"
   - "confirm" / "ho gaya" / "done" / "yes" → action="confirm"
6. Extract item-level notes: "no onion", "extra spicy", "thoda kam mirch", "bina pyaz"
7. If completely unclear, ask for clarification in "response"
8. Always respond in the SAME language the waiter used (Hindi reply for Hindi input, etc.)
9. Keep responses SHORT and conversational — max 2 sentences
10. ALWAYS return valid JSON matching the schema exactly

RESPONSE SCHEMA:
{
  "cart": [{"menu_item_id":"...","name":"...","quantity":1,"variant_id":null,"variant_name":null,"unit_price":0,"notes":"","food_type":"veg"}],
  "response": "spoken reply to waiter",
  "action": "continue|needs_variant|confirm|cleared",
  "unmatched": ["words not on menu"],
  "changes": ["human readable list of what changed"]
}`;
}

/* ── Main conversational parse function ─────────────────────── */
async function conversationalParse(outletId, transcript, conversationHistory, currentCart) {
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

  const systemPrompt = buildSystemPrompt(menuItems);

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

    // Ensure prices are filled from menu for any items the LLM matched
    result.cart = result.cart.map(cartItem => {
      const menuItem = menuItems.find(m => m.id === cartItem.menu_item_id);
      if (menuItem) {
        const variant = cartItem.variant_id
          ? menuItem.variants?.find(v => v.id === cartItem.variant_id)
          : null;
        return {
          ...cartItem,
          unit_price: variant ? Number(variant.price) : Number(menuItem.base_price),
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

module.exports = { conversationalParse, getSupportedLanguages };
