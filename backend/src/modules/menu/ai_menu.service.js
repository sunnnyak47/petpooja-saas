/**
 * @fileoverview AI Menu Sync Service — Gemini Vision (gemini-1.5-flash, free 1500 req/day).
 * Pipeline: image → Gemini Vision (gemini-2.5-flash-lite) → structured JSON → DB.
 * Get a free API key at https://aistudio.google.com
 * @module modules/menu/ai_menu.service
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../../config/logger');
const { getDbClient } = require('../../config/database');

/* ─────────────────────────────────────────────────────────────
   GEMINI CLIENT
───────────────────────────────────────────────────────────── */

function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in .env — get a free key at https://aistudio.google.com');
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
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

Rules:
- Extract EVERY item visible — do not skip any.
- For pizzas with R / M / L columns: use variants named Regular, Medium, Large.
- For 2-size items: use Half / Full.
- base_price = the lowest / first price shown.
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

  let result;
  try {
    result = await model.generateContent([
      MENU_PROMPT,
      { inlineData: { data: imageBuffer.toString('base64'), mimeType: mime } },
    ]);
  } catch (err) {
    if (err.message?.includes('limit: 0') || err.message?.includes('free_tier')) {
      throw new Error('Gemini API key has no free quota. Get a fresh key from aistudio.google.com/app/apikey and set GEMINI_API_KEY in .env');
    }
    if (err.message?.includes('429') || err.message?.includes('quota')) {
      throw new Error('Gemini rate limit hit — wait 1 minute and try again (1500 free scans/day)');
    }
    if (err.message?.includes('API_KEY') || err.message?.includes('not set')) {
      throw new Error('GEMINI_API_KEY not set in backend .env — get a free key at aistudio.google.com/app/apikey');
    }
    throw err;
  }

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
    throw new Error('Gemini returned invalid JSON — try again or use a clearer photo.');
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

async function syncMenu(outletId, data) {
  const prisma = getDbClient();
  const results = { categoriesCreated: 0, itemsCreated: 0, variantsCreated: 0, addonsCreated: 0 };

  await prisma.$transaction(async (tx) => {
    for (const catData of data.categories) {
      let category = await tx.menuCategory.findFirst({
        where: { outlet_id: outletId, name: catData.name },
      });
      if (!category) {
        category = await tx.menuCategory.create({
          data: { name: catData.name, outlet_id: outletId, display_order: results.categoriesCreated },
        });
        results.categoriesCreated++;
      }

      for (const itemData of catData.items) {
        const item = await tx.menuItem.create({
          data: {
            name: itemData.name,
            description: itemData.description || '',
            base_price: parseFloat(itemData.base_price) || 0,
            category_id: category.id,
            outlet_id: outletId,
            food_type: itemData.food_type || 'veg',
            kitchen_station: 'KITCHEN',
            is_active: true,
          },
        });
        results.itemsCreated++;

        for (const v of (itemData.variants || [])) {
          await tx.itemVariant.create({
            data: {
              menu_item_id: item.id,
              name: v.name,
              price_addition: parseFloat(v.price_addition ?? v.price ?? 0),
              is_active: true,
            },
          });
          results.variantsCreated++;
        }

        if (itemData.addons?.length > 0) {
          const group = await tx.addonGroup.create({
            data: {
              name: 'Add-ons',
              outlet_id: outletId,
              is_required: false,
              min_select: 0,
              max_select: itemData.addons.length,
              menu_items: { connect: { id: item.id } },
            },
          });
          for (const a of itemData.addons) {
            await tx.addonItem.create({
              data: { addon_group_id: group.id, name: a.name, price: parseFloat(a.price || 0), is_active: true },
            });
            results.addonsCreated++;
          }
        }
      }
    }
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
    throw new Error('No text content was extracted to parse.');
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

  let result;
  try {
    result = await model.generateContent([prompt]);
  } catch (err) {
    if (err.message?.includes('429') || err.message?.includes('quota')) {
      throw new Error('Gemini rate limit hit — wait 1 minute and try again');
    }
    if (err.message?.includes('leaked') || err.message?.includes('403')) {
      throw new Error('GEMINI_API_KEY is invalid or revoked. Get a fresh key at aistudio.google.com/app/apikey');
    }
    throw err;
  }

  const raw = result.response.text().trim();
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let structured;
  try {
    structured = JSON.parse(jsonStr);
  } catch (e) {
    logger.error('Gemini text→JSON parse failed', { raw: raw.slice(0, 500) });
    throw new Error('Gemini returned invalid JSON — try again with cleaner input.');
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
    throw new Error('Empty PDF upload.');
  }
  logger.info('AI Menu Scan started via Gemini PDF', { bytes: pdfBuffer.length });

  const model = getGeminiModel();
  let result;
  try {
    result = await model.generateContent([
      MENU_PROMPT,
      { inlineData: { data: pdfBuffer.toString('base64'), mimeType: 'application/pdf' } },
    ]);
  } catch (err) {
    if (err.message?.includes('429') || err.message?.includes('quota')) {
      throw new Error('Gemini rate limit hit — wait 1 minute and try again');
    }
    if (err.message?.includes('leaked') || err.message?.includes('403')) {
      throw new Error('GEMINI_API_KEY is invalid or revoked. Get a fresh key at aistudio.google.com/app/apikey');
    }
    throw err;
  }

  const raw = result.response.text().trim();
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let structured;
  try { structured = JSON.parse(jsonStr); }
  catch (e) { throw new Error('Gemini returned invalid JSON from the PDF — try a different file.'); }
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
    throw new Error('URL must start with http:// or https://');
  }

  // ── Seed page ─────────────────────────────────────────────
  const seedHtml = await fetchHtml(url, 12000);
  if (!seedHtml) throw new Error('Could not fetch the URL (4xx/5xx or network error).');
  const seedText = stripHtml(seedHtml);
  const seedTitleMatch = seedHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const seedTitle = seedTitleMatch ? stripHtml(seedTitleMatch[1]) : '';

  if (!crawl) {
    if (seedText.length < 50) {
      throw new Error('Page had almost no text — menu may be loaded by JavaScript. Try the URL of the actual menu page.');
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
    throw new Error('All fetched pages were almost empty — the menu is likely rendered by JavaScript.');
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
  if (!csvBuffer || csvBuffer.length === 0) throw new Error('Empty file.');
  const text = csvBuffer.toString('utf8');
  if (!text.trim()) throw new Error('File contained no text.');
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
