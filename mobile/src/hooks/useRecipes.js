/**
 * useRecipes — data + pure transforms for the Recipe Manager ("Standard recipes").
 *
 * Backend (inventory module, mounted at /api/inventory):
 *   GET  /inventory/recipes?outlet_id=            → list menu-item recipes
 *   POST /inventory/recipes/:menuItemId           → create/update recipe
 *        body: { name, yield_quantity, yield_unit, instructions,
 *                ingredients: [{ inventory_item_id, quantity, unit }] }
 *   GET  /inventory/recipes/:menuItemId/cost      → computed recipe cost
 *   GET  /inventory/stock?outlet_id=              → inventory items (ingredient picker)
 *   GET  /menu/items?outlet_id=                   → menu items to attach recipes to
 *
 * listRecipes response row shape (confirmed in inventory.controller.listRecipes):
 *   { id, menu_item_id, name, yield_quantity, yield_unit,
 *     menu_item: { id, name, base_price },
 *     ingredients: [{ id, quantity, unit,
 *                     inventory_item: { id, name, unit, cost_per_unit } }] }
 *
 * Every list-fetch is scoped by the SELECTED outlet (useOutlet().outletId) —
 * an owner's user row often has a null outlet_id, so we never rely on that.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useOutlet } from '../context/OutletContext';

// Units the backend Joi schema accepts for ingredients / yield.
export const RECIPE_UNITS = ['kg', 'g', 'l', 'ml', 'pcs', 'dozen', 'box'];

export const RECIPE_KEYS = {
  all: (outletId) => ['recipes', outletId],
  menu: (outletId) => ['recipes', 'menu', outletId],
  stock: (outletId) => ['recipes', 'stock', outletId],
};

// ─── Response unwrapping ──────────────────────────────────────────────────────
// The axios interceptor returns the { success, data, message } envelope; list
// endpoints may nest under data.items (paginated) or data (array).
function unwrapArray(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.items)) return res.items;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.data?.items)) return res.data.items;
  return [];
}

// ─── Pure transforms (unit-tested) ────────────────────────────────────────────

/** Coerce anything (Prisma Decimal string, number, null) to a finite number. */
export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Flatten a backend recipe row's ingredients into flat editor "lines".
 * @returns {{inventory_item_id, name, unit, quantity, cost_per_unit}[]}
 */
export function recipeToLines(recipe) {
  if (!recipe || !Array.isArray(recipe.ingredients)) return [];
  return recipe.ingredients.map((ing) => ({
    inventory_item_id: ing.inventory_item_id ?? ing.inventory_item?.id ?? null,
    name: ing.inventory_item?.name ?? 'Ingredient',
    unit: ing.unit ?? ing.inventory_item?.unit ?? 'pcs',
    quantity: num(ing.quantity),
    cost_per_unit: num(ing.inventory_item?.cost_per_unit),
  }));
}

/** Cost of a single ingredient line = quantity × unit cost. */
export function lineCost(line) {
  if (!line) return 0;
  return num(line.quantity) * num(line.cost_per_unit);
}

/** Total recipe cost across all ingredient lines, rounded to 2dp. */
export function recipeCost(lines) {
  if (!Array.isArray(lines)) return 0;
  const total = lines.reduce((sum, l) => sum + lineCost(l), 0);
  return Math.round(total * 100) / 100;
}

/**
 * Gross margin % of a menu item = (price − cost) / price × 100.
 * Returns 0 when price is 0/unknown (avoid divide-by-zero / Infinity).
 */
export function marginPercent(price, cost) {
  const p = num(price);
  const c = num(cost);
  if (p <= 0) return 0;
  return Math.round(((p - c) / p) * 1000) / 10; // 1dp
}

/** Money profit per item = price − cost (may be negative). */
export function marginValue(price, cost) {
  return Math.round((num(price) - num(cost)) * 100) / 100;
}

/** Map recipes keyed by their menu_item_id for O(1) lookup. */
export function mapRecipesByMenuItem(recipes) {
  const map = {};
  (recipes || []).forEach((r) => {
    const key = r.menu_item_id ?? r.menu_item?.id;
    if (key == null) return;
    // If duplicates exist (backend creates a new row per save), keep the LAST
    // (most-recent) — listRecipes orders by menu_item name, not time, so we
    // prefer the one with the most ingredients as the "live" recipe.
    const prev = map[key];
    if (!prev || (r.ingredients?.length || 0) >= (prev.ingredients?.length || 0)) {
      map[key] = r;
    }
  });
  return map;
}

/**
 * Merge the menu list with recipes → one row per menu item, enriched with recipe
 * status, computed cost and margin. This is the screen's primary data source so
 * items WITHOUT a recipe still appear (with a "No recipe" badge + CTA).
 */
export function buildRecipeRows(menuItems, recipes) {
  const byItem = mapRecipesByMenuItem(recipes);
  return (menuItems || []).map((m) => {
    const recipe = byItem[m.id] || null;
    const lines = recipeToLines(recipe);
    const price = num(m.base_price ?? m.price);
    const cost = recipeCost(lines);
    const hasRecipe = lines.length > 0;
    return {
      id: m.id,
      name: m.name ?? 'Untitled',
      category: m.category?.name ?? (typeof m.category === 'string' ? m.category : ''),
      price,
      hasRecipe,
      recipeId: recipe?.id ?? null,
      recipeName: recipe?.name ?? '',
      yieldQuantity: num(recipe?.yield_quantity) || 1,
      yieldUnit: recipe?.yield_unit ?? 'pcs',
      ingredientCount: lines.length,
      lines,
      cost,
      margin: hasRecipe ? marginPercent(price, cost) : null,
      marginMoney: hasRecipe ? marginValue(price, cost) : null,
    };
  });
}

/** Filter + search the built rows for the list UI. */
export function filterRows(rows, { query = '', filter = 'all' } = {}) {
  const q = query.trim().toLowerCase();
  return (rows || []).filter((r) => {
    if (filter === 'with' && !r.hasRecipe) return false;
    if (filter === 'without' && r.hasRecipe) return false;
    if (q && !(`${r.name} ${r.category}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

/** Aggregate stats for the header/summary strip. */
export function summarize(rows) {
  const total = rows.length;
  const withRecipe = rows.filter((r) => r.hasRecipe);
  const margins = withRecipe.map((r) => r.margin).filter((m) => Number.isFinite(m));
  const avgMargin = margins.length
    ? Math.round((margins.reduce((a, b) => a + b, 0) / margins.length) * 10) / 10
    : 0;
  return {
    total,
    withCount: withRecipe.length,
    withoutCount: total - withRecipe.length,
    avgMargin,
  };
}

/** Build the POST body from editor state. Throws when invalid. */
export function linesToPayload(lines, { name = '', yieldQuantity = 1, yieldUnit = 'pcs' } = {}) {
  const valid = (lines || []).filter(
    (l) => l.inventory_item_id && num(l.quantity) > 0,
  );
  return {
    name: (name || '').trim() || undefined,
    yield_quantity: num(yieldQuantity) > 0 ? num(yieldQuantity) : 1,
    yield_unit: RECIPE_UNITS.includes(yieldUnit) ? yieldUnit : 'pcs',
    ingredients: valid.map((l) => ({
      inventory_item_id: l.inventory_item_id,
      quantity: num(l.quantity),
      unit: RECIPE_UNITS.includes(l.unit) ? l.unit : 'pcs',
    })),
  };
}

// ─── Queries / mutations ──────────────────────────────────────────────────────

/** All recipes for the selected outlet. */
export function useRecipes() {
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: RECIPE_KEYS.all(outletId),
    queryFn: async () => {
      const res = await api.get('/inventory/recipes', { params: { outlet_id: outletId } });
      return unwrapArray(res);
    },
    enabled: !!outletId,
    staleTime: 60 * 1000,
  });
}

/** Menu items for the selected outlet (rows to attach recipes to). */
export function useRecipeMenu() {
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: RECIPE_KEYS.menu(outletId),
    queryFn: async () => {
      const res = await api.get('/menu/items', { params: { outlet_id: outletId, limit: 500 } });
      return unwrapArray(res);
    },
    enabled: !!outletId,
    staleTime: 60 * 1000,
  });
}

/** Inventory items for the selected outlet (ingredient picker). */
export function useRecipeIngredients() {
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: RECIPE_KEYS.stock(outletId),
    queryFn: async () => {
      const res = await api.get('/inventory/stock', { params: { outlet_id: outletId, limit: 500 } });
      return unwrapArray(res).map((it) => ({
        id: it.id,
        name: it.name,
        unit: it.unit ?? 'pcs',
        cost_per_unit: num(it.cost_per_unit ?? it.price),
        current_stock: num(it.current_stock),
      }));
    },
    enabled: !!outletId,
    staleTime: 60 * 1000,
  });
}

/** Save (create/update) a recipe for a menu item. */
export function useSaveRecipe() {
  const qc = useQueryClient();
  const { outletId } = useOutlet();
  return useMutation({
    mutationFn: ({ menuItemId, payload }) =>
      api.post(`/inventory/recipes/${menuItemId}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECIPE_KEYS.all(outletId) });
    },
  });
}
