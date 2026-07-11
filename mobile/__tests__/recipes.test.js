/**
 * Unit tests for the Recipe Manager pure transforms (src/hooks/useRecipes.js).
 * We only exercise the deterministic, side-effect-free helpers — the react-query
 * hooks are not invoked here, so we mock the api module to keep imports clean.
 */
jest.mock('../src/lib/api', () => ({ __esModule: true, default: {} }));
// useRecipes imports OutletContext (→ AsyncStorage) at module load. The pure
// transforms under test don't touch it, so stub the context to keep imports clean.
jest.mock('../src/context/OutletContext', () => ({ useOutlet: () => ({ outletId: 'test-outlet' }) }));

import {
  num,
  recipeToLines,
  lineCost,
  recipeCost,
  marginPercent,
  marginValue,
  mapRecipesByMenuItem,
  buildRecipeRows,
  filterRows,
  summarize,
  linesToPayload,
  RECIPE_UNITS,
} from '../src/hooks/useRecipes';

// A backend-shaped recipe row (matches inventory.controller.listRecipes).
const recipeA = {
  id: 'r1',
  menu_item_id: 'm1',
  name: 'Paneer Tikka Recipe',
  yield_quantity: '1',
  yield_unit: 'pcs',
  menu_item: { id: 'm1', name: 'Paneer Tikka', base_price: '250' },
  ingredients: [
    { id: 'i1', quantity: '0.2', unit: 'kg', inventory_item: { id: 'inv1', name: 'Paneer', unit: 'kg', cost_per_unit: '400' } },
    { id: 'i2', quantity: '0.05', unit: 'kg', inventory_item: { id: 'inv2', name: 'Spice Mix', unit: 'kg', cost_per_unit: '200' } },
  ],
};

const menuItems = [
  { id: 'm1', name: 'Paneer Tikka', base_price: '250', category: { name: 'Starters' } },
  { id: 'm2', name: 'Plain Naan', base_price: '40', category: 'Breads' },
];

describe('num', () => {
  test('coerces Decimal strings and guards non-finite', () => {
    expect(num('12.5')).toBe(12.5);
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num('abc')).toBe(0);
    expect(num(Infinity)).toBe(0);
  });
});

describe('recipeToLines', () => {
  test('flattens ingredients to editor lines', () => {
    const lines = recipeToLines(recipeA);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      inventory_item_id: 'inv1',
      name: 'Paneer',
      unit: 'kg',
      quantity: 0.2,
      cost_per_unit: 400,
    });
  });

  test('returns [] for a recipe with no ingredients', () => {
    expect(recipeToLines(null)).toEqual([]);
    expect(recipeToLines({})).toEqual([]);
  });
});

describe('cost math', () => {
  test('lineCost = quantity × unit cost', () => {
    expect(lineCost({ quantity: 0.2, cost_per_unit: 400 })).toBe(80);
    expect(lineCost(null)).toBe(0);
  });

  test('recipeCost sums lines and rounds to 2dp', () => {
    // 0.2*400 + 0.05*200 = 80 + 10 = 90
    expect(recipeCost(recipeToLines(recipeA))).toBe(90);
    expect(recipeCost([{ quantity: 0.333, cost_per_unit: 3 }])).toBe(1); // 0.999 → 1.00 rounded
    expect(recipeCost([])).toBe(0);
    expect(recipeCost(null)).toBe(0);
  });
});

describe('margin', () => {
  test('marginPercent = (price-cost)/price*100, 1dp', () => {
    expect(marginPercent(250, 90)).toBe(64); // 160/250 = 64%
    expect(marginPercent(100, 55)).toBe(45);
  });

  test('guards divide-by-zero and negative margins', () => {
    expect(marginPercent(0, 90)).toBe(0);
    expect(marginPercent(null, 90)).toBe(0);
    expect(marginPercent(50, 80)).toBe(-60); // loss-making item
  });

  test('marginValue = price - cost', () => {
    expect(marginValue(250, 90)).toBe(160);
    expect(marginValue(40, 55)).toBe(-15);
  });
});

describe('mapRecipesByMenuItem', () => {
  test('keys recipes by menu_item_id', () => {
    const map = mapRecipesByMenuItem([recipeA]);
    expect(map.m1).toBe(recipeA);
  });

  test('prefers the row with more ingredients on duplicate menu ids', () => {
    const dupSmall = { ...recipeA, id: 'r2', ingredients: [recipeA.ingredients[0]] };
    const map = mapRecipesByMenuItem([dupSmall, recipeA]);
    expect(map.m1.id).toBe('r1'); // richer recipe wins
  });

  test('ignores rows without a menu id', () => {
    expect(mapRecipesByMenuItem([{ id: 'x' }])).toEqual({});
    expect(mapRecipesByMenuItem(null)).toEqual({});
  });
});

describe('buildRecipeRows', () => {
  test('merges menu with recipes, computes cost + margin', () => {
    const rows = buildRecipeRows(menuItems, [recipeA]);
    expect(rows).toHaveLength(2);

    const paneer = rows.find((r) => r.id === 'm1');
    expect(paneer.hasRecipe).toBe(true);
    expect(paneer.price).toBe(250);
    expect(paneer.cost).toBe(90);
    expect(paneer.margin).toBe(64);
    expect(paneer.marginMoney).toBe(160);
    expect(paneer.ingredientCount).toBe(2);
    expect(paneer.category).toBe('Starters');

    const naan = rows.find((r) => r.id === 'm2');
    expect(naan.hasRecipe).toBe(false);
    expect(naan.margin).toBeNull();
    expect(naan.cost).toBe(0);
    expect(naan.category).toBe('Breads');
  });

  test('handles empty inputs', () => {
    expect(buildRecipeRows(null, null)).toEqual([]);
    expect(buildRecipeRows([], [recipeA])).toEqual([]);
  });
});

describe('filterRows', () => {
  const rows = buildRecipeRows(menuItems, [recipeA]);

  test('filter=with keeps only recipe-backed items', () => {
    const out = filterRows(rows, { filter: 'with' });
    expect(out.map((r) => r.id)).toEqual(['m1']);
  });

  test('filter=without keeps only recipe-less items', () => {
    const out = filterRows(rows, { filter: 'without' });
    expect(out.map((r) => r.id)).toEqual(['m2']);
  });

  test('search matches name and category, case-insensitive', () => {
    expect(filterRows(rows, { query: 'paneer' }).map((r) => r.id)).toEqual(['m1']);
    expect(filterRows(rows, { query: 'breads' }).map((r) => r.id)).toEqual(['m2']);
    expect(filterRows(rows, { query: 'zzz' })).toEqual([]);
  });
});

describe('summarize', () => {
  test('counts recipes and averages margin', () => {
    const rows = buildRecipeRows(menuItems, [recipeA]);
    const stats = summarize(rows);
    expect(stats.total).toBe(2);
    expect(stats.withCount).toBe(1);
    expect(stats.withoutCount).toBe(1);
    expect(stats.avgMargin).toBe(64);
  });

  test('avgMargin is 0 when nothing is costed', () => {
    const rows = buildRecipeRows(menuItems, []);
    expect(summarize(rows).avgMargin).toBe(0);
  });
});

describe('linesToPayload', () => {
  test('builds a valid POST body, dropping incomplete lines', () => {
    const lines = [
      { inventory_item_id: 'inv1', quantity: '0.2', unit: 'kg' },
      { inventory_item_id: 'inv2', quantity: 0, unit: 'kg' },       // qty 0 → dropped
      { inventory_item_id: null, quantity: 5, unit: 'kg' },          // no id → dropped
    ];
    const payload = linesToPayload(lines, { name: ' House Curry ', yieldQuantity: 2, yieldUnit: 'l' });
    expect(payload.name).toBe('House Curry');
    expect(payload.yield_quantity).toBe(2);
    expect(payload.yield_unit).toBe('l');
    expect(payload.ingredients).toEqual([
      { inventory_item_id: 'inv1', quantity: 0.2, unit: 'kg' },
    ]);
  });

  test('normalizes bad units to pcs and empty name to undefined', () => {
    const payload = linesToPayload(
      [{ inventory_item_id: 'inv1', quantity: 1, unit: 'gallon' }],
      { name: '   ', yieldQuantity: 0, yieldUnit: 'nope' },
    );
    expect(payload.name).toBeUndefined();
    expect(payload.yield_quantity).toBe(1); // 0 → default 1
    expect(payload.yield_unit).toBe('pcs');
    expect(payload.ingredients[0].unit).toBe('pcs');
  });

  test('every RECIPE_UNIT is accepted verbatim', () => {
    RECIPE_UNITS.forEach((u) => {
      const p = linesToPayload([{ inventory_item_id: 'x', quantity: 1, unit: u }], { yieldUnit: u });
      expect(p.ingredients[0].unit).toBe(u);
      expect(p.yield_unit).toBe(u);
    });
  });
});
