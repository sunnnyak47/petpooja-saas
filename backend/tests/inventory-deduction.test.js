/**
 * @fileoverview P0-1 Inventory deduction integration tests.
 * Verifies that recipe-based stock deduction runs atomically with order payment.
 * @module tests/inventory-deduction.test
 */

const { getDbClient } = require('../src/config/database');

let prisma;
let outletId;
let menuItemId;
let inventoryItemId;
let recipeId;

beforeAll(async () => {
  jest.setTimeout(30000);
  prisma = getDbClient();
  outletId = '718e40f0-e2fc-4c7f-879e-09c8651e2774';
});

afterAll(async () => {
  // Clean up test data
  if (recipeId) {
    await prisma.recipeIngredient.deleteMany({ where: { recipe_id: recipeId } });
    await prisma.recipe.delete({ where: { id: recipeId } }).catch(() => {});
  }
  if (menuItemId) {
    await prisma.menuItem.update({ where: { id: menuItemId }, data: { is_deleted: true } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('Recipe-based inventory deduction (P0-1)', () => {

  test('recipes exist in the database with ingredients', async () => {
    const recipes = await prisma.recipe.findMany({
      where: { is_deleted: false },
      include: { ingredients: true },
    });
    expect(recipes.length).toBeGreaterThanOrEqual(5);
    for (const recipe of recipes) {
      expect(recipe.ingredients.length).toBeGreaterThan(0);
      expect(recipe.menu_item_id).toBeTruthy();
    }
  });

  test('each recipe ingredient links to a valid inventory item', async () => {
    const recipes = await prisma.recipe.findMany({
      where: { is_deleted: false },
      include: { ingredients: { include: { inventory_item: true } } },
    });
    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredients) {
        expect(ingredient.inventory_item).toBeTruthy();
        expect(ingredient.inventory_item.name).toBeTruthy();
        expect(Number(ingredient.quantity)).toBeGreaterThan(0);
      }
    }
  });

  test('deductByRecipe decrements stock for an order with recipes', async () => {
    // 1. Find a menu item that has a recipe
    const recipe = await prisma.recipe.findFirst({
      where: { is_deleted: false },
      include: { ingredients: { include: { inventory_item: true } }, menu_item: true },
    });
    expect(recipe).toBeTruthy();

    // 2. Record current stock levels for this recipe's ingredients
    const stocksBefore = {};
    for (const ing of recipe.ingredients) {
      const stock = await prisma.inventoryStock.findFirst({
        where: { outlet_id: outletId, inventory_item_id: ing.inventory_item_id },
      });
      stocksBefore[ing.inventory_item_id] = stock ? Number(stock.current_stock) : 0;
    }

    // 3. Create a test order + order item using this menu item
    const testOrder = await prisma.order.create({
      data: {
        outlet_id: outletId,
        order_number: `TEST-DED-${Date.now()}`,
        order_type: 'dine_in',
        status: 'completed',
        subtotal: 100,
        grand_total: 100,
        order_items: {
          create: [{
            menu_item_id: recipe.menu_item_id,
            name: recipe.menu_item.name,
            quantity: 2,
            unit_price: 50,
            item_total: 100,
          }],
        },
      },
    });

    // 4. Run deductByRecipe
    const inventoryService = require('../src/modules/inventory/inventory.service');
    const result = await inventoryService.deductByRecipe(testOrder.id);

    expect(result.deducted).toBeGreaterThan(0);
    expect(result.deducted).toBe(recipe.ingredients.length);

    // 5. Verify stock decreased by correct amounts
    for (const ing of recipe.ingredients) {
      const stockAfter = await prisma.inventoryStock.findFirst({
        where: { outlet_id: outletId, inventory_item_id: ing.inventory_item_id },
      });
      const expectedDeduction = Number(ing.quantity) * 2; // qty 2
      const expected = stocksBefore[ing.inventory_item_id] - expectedDeduction;
      expect(Number(stockAfter.current_stock)).toBeCloseTo(expected, 2);
    }

    // 6. Verify stock transactions were created
    const transactions = await prisma.stockTransaction.findMany({
      where: { reference_id: testOrder.id, transaction_type: 'consumption' },
    });
    expect(transactions.length).toBe(recipe.ingredients.length);
    for (const txn of transactions) {
      expect(Number(txn.quantity)).toBeLessThan(0); // negative = consumption
    }

    // Cleanup: reverse stock changes and remove test order
    for (const ing of recipe.ingredients) {
      const consumeQty = Number(ing.quantity) * 2;
      await prisma.inventoryStock.update({
        where: {
          outlet_id_inventory_item_id: { outlet_id: outletId, inventory_item_id: ing.inventory_item_id },
        },
        data: { current_stock: { increment: consumeQty } },
      });
    }
    await prisma.stockTransaction.deleteMany({ where: { reference_id: testOrder.id } });
    await prisma.orderItem.deleteMany({ where: { order_id: testOrder.id } });
    await prisma.order.delete({ where: { id: testOrder.id } });
  });

  test('deductByRecipe skips items without recipes gracefully', async () => {
    // Create a menu item with no recipe
    const category = await prisma.menuCategory.findFirst({ where: { is_deleted: false } });
    const noRecipeItem = await prisma.menuItem.create({
      data: {
        outlet_id: outletId,
        category_id: category.id,
        name: `No-Recipe-Test-${Date.now()}`,
        base_price: 50,
      },
    });
    menuItemId = noRecipeItem.id;

    const testOrder = await prisma.order.create({
      data: {
        outlet_id: outletId,
        order_number: `TEST-NOREC-${Date.now()}`,
        order_type: 'dine_in',
        status: 'completed',
        subtotal: 50,
        grand_total: 50,
        order_items: {
          create: [{
            menu_item_id: noRecipeItem.id,
            name: noRecipeItem.name,
            quantity: 1,
            unit_price: 50,
            item_total: 50,
          }],
        },
      },
    });

    const inventoryService = require('../src/modules/inventory/inventory.service');
    const result = await inventoryService.deductByRecipe(testOrder.id);
    expect(result.deducted).toBe(0); // no recipe → nothing deducted
    expect(result.alerts).toEqual([]);

    // Cleanup
    await prisma.orderItem.deleteMany({ where: { order_id: testOrder.id } });
    await prisma.order.delete({ where: { id: testOrder.id } });
  });

  test('deductByRecipe throws NotFoundError for nonexistent order', async () => {
    const inventoryService = require('../src/modules/inventory/inventory.service');
    await expect(
      inventoryService.deductByRecipe('00000000-0000-0000-0000-000000000000')
    ).rejects.toThrow('Order not found');
  });

  test('processPayment deducts inventory atomically', async () => {
    // This tests the full flow: payment + deduction in one transaction
    const recipe = await prisma.recipe.findFirst({
      where: { is_deleted: false },
      include: { ingredients: true, menu_item: true },
    });

    // Record stock before
    const stocksBefore = {};
    for (const ing of recipe.ingredients) {
      const stock = await prisma.inventoryStock.findFirst({
        where: { outlet_id: outletId, inventory_item_id: ing.inventory_item_id },
      });
      stocksBefore[ing.inventory_item_id] = stock ? Number(stock.current_stock) : 0;
    }

    // Create order (unpaid)
    const table = await prisma.table.findFirst({
      where: { outlet_id: outletId, status: 'available', is_deleted: false },
    });

    const testOrder = await prisma.order.create({
      data: {
        outlet_id: outletId,
        order_number: `TEST-PAY-${Date.now()}`,
        order_type: 'dine_in',
        status: 'served',
        subtotal: 100,
        grand_total: 100,
        table_id: table?.id || null,
        order_items: {
          create: [{
            menu_item_id: recipe.menu_item_id,
            name: recipe.menu_item.name,
            quantity: 1,
            unit_price: 100,
            item_total: 100,
          }],
        },
      },
    });

    // If table was used, mark it occupied
    if (table) {
      await prisma.table.update({
        where: { id: table.id },
        data: { status: 'occupied', current_order_id: testOrder.id },
      });
    }

    // Process payment (includes atomic deduction now)
    const orderService = require('../src/modules/orders/order.service');
    const payResult = await orderService.processPayment(
      testOrder.id,
      { method: 'cash', amount: 100 },
      null
    );

    expect(payResult.payment).toBeTruthy();
    expect(payResult.order.is_paid).toBe(true);

    // Verify stock decreased
    for (const ing of recipe.ingredients) {
      const stockAfter = await prisma.inventoryStock.findFirst({
        where: { outlet_id: outletId, inventory_item_id: ing.inventory_item_id },
      });
      const expectedDeduction = Number(ing.quantity) * 1;
      expect(Number(stockAfter.current_stock)).toBeCloseTo(
        stocksBefore[ing.inventory_item_id] - expectedDeduction, 2
      );
    }

    // Cleanup: reverse stock, remove payment & order
    for (const ing of recipe.ingredients) {
      const consumeQty = Number(ing.quantity) * 1;
      await prisma.inventoryStock.update({
        where: {
          outlet_id_inventory_item_id: { outlet_id: outletId, inventory_item_id: ing.inventory_item_id },
        },
        data: { current_stock: { increment: consumeQty } },
      });
    }
    await prisma.stockTransaction.deleteMany({ where: { reference_id: testOrder.id } });
    await prisma.orderStatusHistory.deleteMany({ where: { order_id: testOrder.id } });
    await prisma.payment.deleteMany({ where: { order_id: testOrder.id } });
    await prisma.orderItem.deleteMany({ where: { order_id: testOrder.id } });
    if (table) {
      await prisma.table.update({
        where: { id: table.id },
        data: { status: 'available', current_order_id: null },
      }).catch(() => {});
    }
    await prisma.order.delete({ where: { id: testOrder.id } }).catch(() => {});
  });
});
