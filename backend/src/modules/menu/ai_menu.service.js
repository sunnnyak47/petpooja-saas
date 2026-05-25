/**
 * @fileoverview AI Menu Sync Service — Gemini Vision (gemini-1.5-flash, free 1500 req/day).
 * Pipeline: image → Gemini Vision (gemini-2.5-flash-lite) → structured JSON → DB.
 * Get a free API key at https://aistudio.google.com
 * @module modules/menu/ai_menu.service
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../../config/logger');
const { getDbClient } = require('../../config/database');
const { BadRequestError, RateLimitError, UnauthorizedError } = require('../../utils/errors');

/* ─────────────────────────────────────────────────────────────
   GEMINI CLIENT
───────────────────────────────────────────────────────────── */

function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new BadRequestError('GEMINI_API_KEY is not set in .env — get a free key at https://aistudio.google.com');
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
}

/**
 * Wrap a Gemini generateContent call with:
 *  - one automatic retry on transient 503 (model overloaded)
 *  - clear error messages for the common failure modes
 *
 * @param {object} model           the GenerativeModel returned by getGeminiModel()
 * @param {Array}  parts           array passed straight to model.generateContent
 * @returns {Promise<any>}         the Gemini response object
 */
async function geminiCall(model, parts) {
  const attempt = async () => model.generateContent(parts);
  try {
    return await attempt();
  } catch (err) {
    const msg = err?.message || '';
    // 503: Gemini overloaded — quick retry once with backoff
    if (msg.includes('503') || /currently experiencing high demand|overloaded/i.test(msg)) {
      logger.warn('Gemini 503 — retrying once after 2s');
      await new Promise(r => setTimeout(r, 2000));
      try {
        return await attempt();
      } catch (err2) {
        const msg2 = err2?.message || '';
        if (msg2.includes('503') || /high demand|overloaded/i.test(msg2)) {
          throw new RateLimitError('Gemini AI is overloaded right now — please try again in a minute.');
        }
        throw err2;
      }
    }
    if (msg.includes('429') || /quota|rate limit/i.test(msg)) {
      throw new RateLimitError('Gemini rate limit hit — wait 1 minute and try again (1500 free scans/day).');
    }
    if (msg.includes('leaked') || msg.includes('403')) {
      throw new UnauthorizedError('GEMINI_API_KEY is invalid or revoked. Get a fresh key at aistudio.google.com/app/apikey');
    }
    if (/API_KEY|not set/i.test(msg)) {
      throw new BadRequestError('GEMINI_API_KEY not set in backend .env — get a free key at aistudio.google.com/app/apikey');
    }
    throw err;
  }
}

/* ─────────────────────────────────────────────────────────────
   VISION EXTRACTION PROMPT
───────────────────────────────────────────────────────────── */

const MENU_PROMPT = `You are a restaurant menu data extractor. Look at this menu image carefully and extract ALL items.

Return ONLY a valid JSON object — no markdown, no explanation, just raw JSON.

Format:
{
  "categories": [
    {
      "name": "CATEGORY NAME",
      "items": [
        {
          "name": "Item Name",
          "description": "ingredients or description if shown",
          "base_price": 100,
          "food_type": "veg" or "non_veg",
          "variants": [
            { "name": "Regular", "price": 100, "price_addition": 0 },
            { "name": "Medium",  "price": 200, "price_addition": 100 },
            { "name": "Large",   "price": 300, "price_addition": 200 }
          ]
        }
      ]
    }
  ]
}

CRITICAL PRICE RULE (overrides everything else):
- base_price MUST be the whole-currency-unit value shown on the menu — rupees or dollars, NEVER cents/paise.
- The "/-" suffix used in Indian menus is just a style marker meaning "rupees only". Strip it. "40/-" means 40, not 4000.
- "Rs.100", "₹100", "₹ 100", "100/-", "INR 100" → base_price: 100.
- "A$8", "AU$8", "$8" → base_price: 8 (NOT 800).
- "A$6.50", "$6.50" → base_price: 6.50.
- "Rs.10.50" → base_price: 10.50.
- Strip currency symbols and decorative suffixes; output only the numeric value as-shown.
- NEVER multiply by 100 or add zeros. If you read "40", base_price is 40 — full stop.

Rules:
- Extract EVERY item visible — do not skip any.
- For pizzas with R / M / L columns: use variants named Regular, Medium, Large.
- For 2-size items: use Half / Full.
- base_price = the lowest / first price shown (still in whole units per the rule above).
- food_type: "non_veg" if item contains chicken, mutton, egg, fish, prawn; otherwise "veg".
- description: the ingredient line shown in parentheses or below the item name, if any.
- Ignore promotional text, daily offers, address, phone numbers, logos, QR codes.
- Include combo items and snacks as their own categories.
- Do NOT include "Extra Topping", "Extra Sauce", combo header rows in items list.
`;

/* ─────────────────────────────────────────────────────────────
   MAIN OCR via Gemini Vision
───────────────────────────────────────────────────────────── */

async function scanMenuImage(imageBuffer, mimeType) {
  logger.info('AI Menu Scan started via Gemini Vision');

  const model = getGeminiModel();
  const mime = mimeType || 'image/jpeg';

  const result = await geminiCall(model, [
    MENU_PROMPT,
    { inlineData: { data: imageBuffer.toString('base64'), mimeType: mime } },
  ]);

  const raw = result.response.text().trim();
  logger.info('Gemini response received', { chars: raw.length, preview: raw.slice(0, 200) });

  // Strip markdown code fences if Gemini wraps in ```json ... ```
  const jsonStr = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  let structured;
  try {
    structured = JSON.parse(jsonStr);
  } catch (e) {
    logger.error('JSON parse failed', { raw: raw.slice(0, 500) });
    throw new BadRequestError('Gemini returned invalid JSON — try again or use a clearer photo.');
  }

  if (!structured.categories || !Array.isArray(structured.categories)) {
    structured = { categories: [] };
  }

  // Sanitise numeric fields
  for (const cat of structured.categories) {
    cat.items = (cat.items || []).map(item => ({
      ...item,
      base_price: parseFloat(item.base_price) || 0,
      variants: (item.variants || []).map((v, i) => ({
        name: v.name || `Size ${i + 1}`,
        price: parseFloat(v.price) || 0,
        price_addition: parseFloat(v.price_addition) ?? (i === 0 ? 0 : parseFloat(v.price) - parseFloat((cat.items.find(x => x.name === item.name) || item).base_price)),
      })),
      food_type: item.food_type === 'non_veg' ? 'non_veg' : 'veg',
      description: item.description || '',
      addons: [],
    }));
  }

  const totalItems = structured.categories.reduce((s, c) => s + c.items.length, 0);
  logger.info('Menu extraction complete', {
    categories: structured.categories.length,
    items: totalItems,
  });

  return structured;
}

/* ─────────────────────────────────────────────────────────────
   SYNC REVIEWED MENU TO DB
───────────────────────────────────────────────────────────── */

/* ─── small input sanitisers — schema has tight VarChars + Decimals.
       Bad Gemini output (long descriptions in the food_type field,
       names over 200 chars, etc.) is silently truncated/normalised
       so the whole sync doesn't abort on one ugly row. */
const VALID_FOOD_TYPES = new Set(['veg', 'non_veg', 'egg']);
const trimTo = (s, n) => {
  if (!s && s !== 0) return '';
  const str = String(s).trim();
  return str.length > n ? str.slice(0, n) : str;
};
const cleanFoodType = (v) => VALID_FOOD_TYPES.has(String(v || '').toLowerCase())
  ? String(v).toLowerCase() : 'veg';
const cleanPrice = (v) => {
  const n = parseFloat(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;   // 2dp
};

async function syncMenu(outletId, data) {
  const prisma = getDbClient();
  const results = {
    categoriesCreated: 0,
    itemsCreated: 0,
    variantsCreated: 0,
    addonsCreated: 0,
    combosCreated: 0,
    errors: [],
  };

  // Large menu imports (250+ items × variants) can exceed Prisma's default
  // 5s interactive transaction timeout. Bump both the wait + max-run timeouts.
  await prisma.$transaction(async (tx) => {
    for (const catData of (data.categories || [])) {
      const catName = trimTo(catData.name, 100) || 'Uncategorised';

      let category = await tx.menuCategory.findFirst({
        where: { outlet_id: outletId, name: catName, is_deleted: false },
      });
      if (!category) {
        category = await tx.menuCategory.create({
          data: {
            name: catName,
            outlet_id: outletId,
            display_order: results.categoriesCreated,
          },
        });
        results.categoriesCreated++;
      }

      for (const itemData of (catData.items || [])) {
        const itemName = trimTo(itemData.name, 200);
        if (!itemName) {
          results.errors.push(`Empty item name skipped in "${catName}"`);
          continue;
        }

        let item;
        try {
          item = await tx.menuItem.create({
            data: {
              name: itemName,
              description: trimTo(itemData.description || '', 2000),
              short_code: trimTo(itemData.short_code || '', 20) || null,
              image_url: itemData.image_url || null,
              base_price: cleanPrice(itemData.base_price),
              category_id: category.id,
              outlet_id: outletId,
              food_type: cleanFoodType(itemData.food_type),
              kitchen_station: 'KITCHEN',
              is_active: true,
              is_available: true,
            },
          });
          results.itemsCreated++;
        } catch (err) {
          results.errors.push(`${itemName}: ${err.message?.split('\n')[0]?.slice(0, 200)}`);
          continue;
        }

        // ── Variants (R/M/L, Half/Full, etc.) ─────────────────────
        let variantIdx = 0;
        for (const v of (itemData.variants || [])) {
          const vName = trimTo(v.name, 100) || `Size ${variantIdx + 1}`;
          try {
            await tx.itemVariant.create({
              data: {
                menu_item_id: item.id,
                name: vName,
                price_addition: cleanPrice(v.price_addition ?? v.price ?? 0),
                is_active: true,
                is_default: variantIdx === 0,
                display_order: variantIdx,
              },
            });
            results.variantsCreated++;
          } catch (err) {
            results.errors.push(`${itemName} / variant ${vName}: ${err.message?.split('\n')[0]?.slice(0, 150)}`);
          }
          variantIdx++;
        }

        // ── Addons — one AddonGroup per item, populated with ItemAddons.
        //     Schema fields are min_selection/max_selection (NOT min_select),
        //     and the Prisma model name is itemAddon (NOT addonItem).
        if (itemData.addons?.length > 0) {
          let group;
          try {
            group = await tx.addonGroup.create({
              data: {
                name: 'Add-ons',
                outlet_id: outletId,
                is_required: false,
                min_selection: 0,
                max_selection: itemData.addons.length,
              },
            });
          } catch (err) {
            results.errors.push(`${itemName} addon-group: ${err.message?.slice(0, 150)}`);
            continue;
          }

          let addonIdx = 0;
          for (const a of itemData.addons) {
            const aName = trimTo(a.name, 100);
            if (!aName) continue;
            try {
              await tx.itemAddon.create({
                data: {
                  addon_group_id: group.id,
                  menu_item_id: item.id,   // required FK
                  name: aName,
                  price: cleanPrice(a.price),
                  is_active: true,
                  display_order: addonIdx,
                },
              });
              results.addonsCreated++;
            } catch (err) {
              results.errors.push(`${itemName} / addon ${aName}: ${err.message?.slice(0, 150)}`);
            }
            addonIdx++;
          }
        }
      }
    }

    // ── Combos — handled separately if Gemini returned a top-level
    //    combos array (some templates use {categories:[…], combos:[…]}).
    //    We also catch "Combos" or "Combo" categories and treat their
    //    items as combos pointing back at the rest of the menu.
    for (const c of (data.combos || [])) {
      const comboName = trimTo(c.name, 200);
      if (!comboName) continue;
      try {
        await tx.itemCombo.create({
          data: {
            outlet_id: outletId,
            name: comboName,
            description: trimTo(c.description || '', 2000),
            combo_price: cleanPrice(c.price ?? c.combo_price ?? 0),
            is_active: true,
          },
        });
        results.combosCreated++;
      } catch (err) {
        results.errors.push(`combo ${comboName}: ${err.message?.slice(0, 150)}`);
      }
    }
  }, {
    maxWait: 30000,      // wait up to 30s to acquire a connection
    timeout: 240000,     // allow the tx itself to run up to 4 min for large bulk imports
  });

  logger.info('Menu sync complete', results);
  return results;
}

/* ═════════════════════════════════════════════════════════════
   ADDITIONAL INPUT MODES — all funnel into the same JSON schema
   so the frontend Review screen handles every result the same way.
═════════════════════════════════════════════════════════════ */

/**
 * Shared Gemini text-prompt → structured-menu helper.
 * Used by the text / URL / CSV importers.
 */
async function structureMenuFromText(rawText, sourceHint = 'menu text') {
  if (!rawText || !rawText.trim()) {
    throw new BadRequestError('No text content was extracted to parse.');
  }
  const model = getGeminiModel();
  const prompt = `${MENU_PROMPT}

CRITICAL PRICE RULE for the input below:
- Prices in the input may use any currency symbol: A$, AU$, $, ₹, Rs., £, €.
- "A$8" means 8 dollars (base_price: 8) — NOT 800 cents.
- "A$22" means 22 dollars (base_price: 22) — NOT 2200.
- "A$8.50" means 8.50 dollars (base_price: 8.50).
- "Rs.100" or "₹100" means 100 (base_price: 100).
- Treat base_price as a whole-currency-unit number (dollars or rupees), NEVER in cents/paise.
- Strip the currency symbol; output only the numeric value.

INPUT (${sourceHint}):
"""
${rawText.slice(0, 50000)}
"""

Treat the input above the same way you would a photo of a menu. Extract every item.`;

  const result = await geminiCall(model, [prompt]);

  const raw = result.response.text().trim();
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let structured;
  try {
    structured = JSON.parse(jsonStr);
  } catch (e) {
    logger.error('Gemini text→JSON parse failed', { raw: raw.slice(0, 500) });
    throw new BadRequestError('Gemini returned invalid JSON — try again with cleaner input.');
  }
  if (!structured.categories || !Array.isArray(structured.categories)) {
    structured = { categories: [] };
  }

  // Sanitise — same shape as scanMenuImage
  for (const cat of structured.categories) {
    cat.items = (cat.items || []).map(item => ({
      ...item,
      base_price: parseFloat(item.base_price) || 0,
      variants: (item.variants || []).map((v, i) => ({
        name: v.name || `Size ${i + 1}`,
        price: parseFloat(v.price) || 0,
        price_addition: parseFloat(v.price_addition ?? 0) || 0,
      })),
      food_type: item.food_type === 'non_veg' ? 'non_veg' : 'veg',
      description: item.description || '',
      addons: [],
    }));
  }
  return structured;
}

/**
 * Mode 2: PDF upload. Gemini Vision handles application/pdf natively.
 */
async function scanMenuPdf(pdfBuffer) {
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new BadRequestError('Empty PDF upload.');
  }
  logger.info('AI Menu Scan started via Gemini PDF', { bytes: pdfBuffer.length });

  const model = getGeminiModel();
  const result = await geminiCall(model, [
    MENU_PROMPT,
    { inlineData: { data: pdfBuffer.toString('base64'), mimeType: 'application/pdf' } },
  ]);

  const raw = result.response.text().trim();
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let structured;
  try { structured = JSON.parse(jsonStr); }
  catch (e) { throw new BadRequestError('Gemini returned invalid JSON from the PDF — try a different file.'); }
  if (!structured.categories || !Array.isArray(structured.categories)) structured = { categories: [] };

  for (const cat of structured.categories) {
    cat.items = (cat.items || []).map(item => ({
      ...item,
      base_price: parseFloat(item.base_price) || 0,
      variants: (item.variants || []).map((v, i) => ({
        name: v.name || `Size ${i + 1}`,
        price: parseFloat(v.price) || 0,
        price_addition: parseFloat(v.price_addition ?? 0) || 0,
      })),
      food_type: item.food_type === 'non_veg' ? 'non_veg' : 'veg',
      description: item.description || '',
      addons: [],
    }));
  }
  return structured;
}

/**
 * Mode 3: Paste / typed text — owner pastes a menu from email, Word, etc.
 */
async function parseMenuFromText(text) {
  return structureMenuFromText(text, 'pasted text from owner');
}

/* ─────────────────────────────────────────────────────────────
   URL crawler internals
───────────────────────────────────────────────────────────── */

/** One-shot fetch with timeout. Returns the HTML string or null on failure. */
async function fetchHtml(url, timeoutMs = 12000) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 MSRM-MenuBot/1.0' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch (_) {
    return null;
  }
}

/** Convert HTML → plain text by stripping scripts/styles/tags. */
function stripHtml(html) {
  return (html || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Path tokens that strongly suggest a menu page (multilingual considered later).
const MENU_KEYWORDS = [
  'menu', 'menus', 'food', 'eat', 'eats',
  'lunch', 'dinner', 'breakfast', 'brunch',
  'starters', 'entrees', 'mains', 'sides', 'desserts', 'dessert',
  'specials', 'kids', 'drinks', 'beverages', 'cocktails', 'wine', 'beer',
  'pizza', 'pizzas', 'pasta', 'burgers', 'salads', 'sandwiches',
  'snacks', 'coffee', 'tea', 'order',
];

// Anti-patterns — paths that look menu-ish but aren't (cart/checkout/blog/auth).
const MENU_BLOCKLIST = [
  'cart', 'checkout', 'account', 'login', 'signin', 'signup', 'register',
  'contact', 'about', 'blog', 'news', 'careers', 'jobs', 'press',
  'gallery', 'reservation', 'reservations', 'book', 'booking',
  'privacy', 'terms', 'faq', 'help', 'support',
  'instagram', 'facebook', 'twitter', 'tiktok', 'youtube', 'linkedin',
];

/**
 * Returns true if a URL is likely a menu sub-page.
 * Considers path tokens, link text, and excludes obvious non-menu paths.
 */
function looksLikeMenuLink(href, linkText, basePath) {
  const path = (href || '').toLowerCase();
  const text = (linkText || '').toLowerCase();

  // Exclude if path or text matches a blocklist token.
  for (const bad of MENU_BLOCKLIST) {
    const re = new RegExp(`(?:^|[\\/_-])${bad}(?:[\\/_-]|$)`, 'i');
    if (re.test(path) || re.test(text)) return false;
  }
  // Include if path or text contains a menu keyword.
  for (const good of MENU_KEYWORDS) {
    const re = new RegExp(`(?:^|[\\/_-])${good}(?:[\\/_-]|$|\\b)`, 'i');
    if (re.test(path) || re.test(text)) return true;
  }
  return false;
}

/**
 * Discover menu sub-pages by scraping <a href> elements from the seed HTML.
 * Filters to same-origin, dedupes, scores by likelihood, and caps the list.
 *
 * @param {string} seedUrl  URL the user pasted
 * @param {string} html     HTML of the seed page
 * @param {number} cap      Maximum sub-pages to follow
 * @returns {string[]} ordered list of candidate menu URLs (excluding seed)
 */
function discoverMenuLinks(seedUrl, html, cap = 10) {
  const base = new URL(seedUrl);
  const found = new Map();   // canonical href → linkText

  // Extract <a> tags. Tolerant regex — Gemini doesn't need perfection.
  const re = /<a\b[^>]*\bhref\s*=\s*(['"])([^'"]+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const rawHref = m[2];
    const innerText = m[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    let absolute;
    try {
      absolute = new URL(rawHref, seedUrl).toString();
    } catch (_) { continue; }
    // Same origin only.
    const u = new URL(absolute);
    if (u.origin !== base.origin) continue;
    // Drop fragment + trailing slash for dedup.
    u.hash = '';
    const canonical = u.toString().replace(/\/+$/, '');
    if (canonical === seedUrl.replace(/\/+$/, '')) continue;
    if (found.has(canonical)) continue;
    if (!looksLikeMenuLink(u.pathname + u.search, innerText, base.pathname)) continue;
    found.set(canonical, innerText);
    if (found.size >= cap * 3) break; // hard limit to avoid huge pages
  }

  // Rank: paths containing 'menu' first, then by ascending depth (shorter paths
  // usually mean main category pages), capped at `cap`.
  return [...found.keys()]
    .sort((a, b) => {
      const aM = /menu/i.test(a) ? 0 : 1;
      const bM = /menu/i.test(b) ? 0 : 1;
      if (aM !== bM) return aM - bM;
      const aDepth = new URL(a).pathname.split('/').filter(Boolean).length;
      const bDepth = new URL(b).pathname.split('/').filter(Boolean).length;
      return aDepth - bDepth;
    })
    .slice(0, cap);
}

/**
 * Mode 4: Fetch URL → strip HTML → parse with Gemini.
 * When `crawl=true`, also discovers and fetches up to 10 menu sub-pages on
 * the same domain, then concatenates all text into one prompt.
 *
 * @param {string} url
 * @param {object} opts
 * @param {boolean} [opts.crawl=true]   follow menu-like links on the same domain
 * @param {number}  [opts.maxPages=10]
 * @returns {Promise<object>} structured menu
 */
async function parseMenuFromUrl(url, opts = {}) {
  const { crawl = true, maxPages = 10 } = opts;
  if (!/^https?:\/\//i.test(url || '')) {
    throw new BadRequestError('URL must start with http:// or https://');
  }

  // ── Seed page ─────────────────────────────────────────────
  const seedHtml = await fetchHtml(url, 12000);
  if (!seedHtml) throw new BadRequestError('Could not fetch the URL (4xx/5xx or network error).');
  const seedText = stripHtml(seedHtml);
  const seedTitleMatch = seedHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const seedTitle = seedTitleMatch ? stripHtml(seedTitleMatch[1]) : '';

  if (!crawl) {
    if (seedText.length < 50) {
      throw new BadRequestError('Page had almost no text — menu may be loaded by JavaScript. Try the URL of the actual menu page.');
    }
    return structureMenuFromText(seedText, `webpage: ${url}`);
  }

  // ── Discover + fetch sub-pages in parallel ────────────────
  const subUrls = discoverMenuLinks(url, seedHtml, maxPages);
  logger.info('Crawler: discovered sub-pages', { seed: url, count: subUrls.length, urls: subUrls });

  let combinedText = `[Source: ${url}]\n[Page title: ${seedTitle}]\n\n${seedText}`;
  const visitedPages = [{ url, chars: seedText.length, ok: true }];

  if (subUrls.length > 0) {
    const results = await Promise.allSettled(
      subUrls.map(u => fetchHtml(u, 10000).then(html => ({ url: u, html })))
    );
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value?.html) {
        visitedPages.push({ url: r.value?.url || '?', chars: 0, ok: false });
        continue;
      }
      const t = stripHtml(r.value.html);
      if (t.length < 80) {
        visitedPages.push({ url: r.value.url, chars: t.length, ok: false });
        continue;
      }
      const title = (r.value.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1];
      combinedText += `\n\n────────\n[Source: ${r.value.url}]\n[Page title: ${stripHtml(title)}]\n\n${t}`;
      visitedPages.push({ url: r.value.url, chars: t.length, ok: true });
    }
  }

  if (combinedText.length < 200) {
    throw new BadRequestError('All fetched pages were almost empty — the menu is likely rendered by JavaScript.');
  }

  // Cap total payload sent to Gemini.
  if (combinedText.length > 200000) combinedText = combinedText.slice(0, 200000);

  logger.info('Crawler: combined text ready', { totalChars: combinedText.length, pages: visitedPages.filter(p => p.ok).length });
  const result = await structureMenuFromText(
    combinedText,
    `${visitedPages.filter(p => p.ok).length} page(s) crawled from ${new URL(url).origin}`
  );
  // Surface which pages contributed (frontend can show this in the review screen)
  result._crawl = { seedUrl: url, visitedPages };
  return result;
}

/**
 * Mode 5: CSV/TSV upload. Convert tabular text → Gemini text prompt.
 * We don't try to guess columns ourselves — Gemini reads it like a menu.
 */
async function parseMenuFromCsv(csvBuffer, mimetype = 'text/csv') {
  if (!csvBuffer || csvBuffer.length === 0) throw new BadRequestError('Empty file.');
  const text = csvBuffer.toString('utf8');
  if (!text.trim()) throw new BadRequestError('File contained no text.');
  // Hint Gemini about the structure
  const hint = `tabular data (likely CSV or TSV export from another POS / spreadsheet).
Common column names include: name, item, category, price, base_price, type, food_type, variant, size, description, veg, half, full, regular, medium, large.
If you see Half/Full or R/M/L columns, treat them as variants of the same item.`;
  return structureMenuFromText(`${hint}\n\nDATA:\n${text}`, mimetype);
}

module.exports = {
  scanMenuImage,
  scanMenuPdf,
  parseMenuFromText,
  parseMenuFromUrl,
  parseMenuFromCsv,
  syncMenu,
};
