/**
 * @fileoverview Australian Menu Templates Service
 */
const prisma = require('../../config/database').getDbClient();

const AU_MODERN_CASUAL = {
  name: 'Modern Australian Casual',
  region: 'AU',
  description: 'Contemporary Australian café-restaurant with brunch, mains, burgers, desserts and premium beverages',
  categories: [
    { id: 'breakfast', name: 'Breakfast & Brunch', description: 'Morning fare' },
    { id: 'mains', name: 'Mains', description: 'Lunch & dinner mains' },
    { id: 'burgers', name: 'Burgers & Sandwiches', description: 'Handheld favourites' },
    { id: 'desserts', name: 'Desserts', description: 'Sweet Australian treats' },
    { id: 'beverages', name: 'Beverages', description: 'Coffee, cold drinks & more' },
  ],
  items: [
    { category: 'breakfast', name: 'Smashed Avo on Multigrain Toast', base_price: 15.95, description: 'Creamy avocado, sourdough, cherry tomatoes, poached egg, dukkah', prep_time: 8, food_type: 'veg', tags: ['popular','vegan-option'] },
    { category: 'breakfast', name: 'Eggs Benedict on Ciabatta', base_price: 16.50, description: 'Poached eggs, Canadian bacon, Hollandaise sauce, toasted ciabatta', prep_time: 10, food_type: 'non_veg', tags: ['brunch-favourite'] },
    { category: 'breakfast', name: 'Big Brekky Plate', base_price: 22.50, description: 'Bacon, eggs, sausage, mushrooms, grilled tomato, toast, baked beans', prep_time: 15, food_type: 'non_veg', tags: ['hearty'] },
    { category: 'breakfast', name: 'Acai Bowl', base_price: 14.50, description: 'Blended acai, banana, topped with granola, fresh berries, honey drizzle', prep_time: 5, food_type: 'veg', tags: ['healthy','vegan'] },
    { category: 'mains', name: 'Grilled Barramundi & Chips', base_price: 28.95, description: 'Fresh barramundi fillet, hand-cut chips, garden salad, lemon butter sauce', prep_time: 15, food_type: 'non_veg', tags: ['seafood','popular'] },
    { category: 'mains', name: 'Grass-Fed Beef Steak', base_price: 32.50, description: '300g grass-fed Angus rump steak, chimichurri, mashed potato, seasonal greens', prep_time: 18, food_type: 'non_veg', tags: ['premium'] },
    { category: 'mains', name: 'Chicken Parmigiana', base_price: 24.95, description: 'Crumbed chicken breast, Napoli sauce, leg ham, melted mozzarella, chips & salad', prep_time: 15, food_type: 'non_veg', tags: ['aussie-classic','popular'] },
    { category: 'mains', name: 'Roasted Pumpkin Risotto', base_price: 22.50, description: 'Arborio rice, roasted pumpkin, sage, parmesan, toasted pine nuts', prep_time: 18, food_type: 'veg', tags: ['vegetarian'] },
    { category: 'burgers', name: 'Classic Beef Burger', base_price: 16.95, description: '180g beef patty, Australian cheddar, tomato, lettuce, pickles, aioli, brioche bun', prep_time: 12, food_type: 'non_veg', tags: [] },
    { category: 'burgers', name: 'Chicken Burger', base_price: 15.95, description: 'Crispy fried chicken, slaw, pickles, sriracha mayo, toasted bun', prep_time: 10, food_type: 'non_veg', tags: ['popular'] },
    { category: 'burgers', name: 'Mushroom & Haloumi Burger', base_price: 15.50, description: 'Grilled portobello mushroom, haloumi, roasted capsicum, rocket, truffle aioli', prep_time: 10, food_type: 'veg', tags: ['vegetarian'] },
    { category: 'desserts', name: 'Lamington', base_price: 7.95, description: 'Classic sponge cake, chocolate coating, shredded coconut, served with cream', prep_time: 3, food_type: 'veg', tags: ['aussie-classic'] },
    { category: 'desserts', name: 'Pavlova with Seasonal Berries', base_price: 12.50, description: 'Meringue base, whipped cream, fresh seasonal berries, passionfruit coulis', prep_time: 5, food_type: 'veg', tags: ['popular','aussie-classic'] },
    { category: 'desserts', name: 'Tim Tam Cheesecake', base_price: 11.00, description: 'Biscuit crumb base, cream cheese filling, Tim Tam crumble topping', prep_time: 3, food_type: 'veg', tags: [] },
    { category: 'beverages', name: 'Flat White', base_price: 5.50, description: 'Double espresso, velvety steamed milk — the Australian original', prep_time: 3, food_type: 'veg', tags: ['popular'] },
    { category: 'beverages', name: 'Long Black', base_price: 4.50, description: 'Double espresso over hot water, crema preserved', prep_time: 2, food_type: 'veg', tags: [] },
    { category: 'beverages', name: 'Iced Latte', base_price: 6.50, description: 'Espresso, cold milk, ice — available with oat or almond milk', prep_time: 3, food_type: 'veg', tags: [] },
    { category: 'beverages', name: 'Fresh Orange Juice', base_price: 7.50, description: 'Freshly squeezed orange juice, served chilled', prep_time: 3, food_type: 'veg', tags: ['healthy'] },
    { category: 'beverages', name: 'Sparkling Water', base_price: 4.00, description: '500ml sparkling mineral water', prep_time: 1, food_type: 'veg', tags: [] },
  ]
};

const AU_FINE_DINING = {
  name: 'Fine Dining Australian',
  region: 'AU',
  description: 'Upscale Australian fine dining — premium ingredients, elevated presentation',
  categories: [
    { id: 'entrees', name: 'Entrées', description: 'Sophisticated starters' },
    { id: 'mains', name: 'Mains', description: 'Signature main courses' },
    { id: 'sides', name: 'Sides', description: 'À la carte accompaniments' },
    { id: 'desserts', name: 'Desserts', description: 'Artisan desserts' },
    { id: 'wine', name: 'Wine & Beverages', description: 'Curated wine list' },
  ],
  items: [
    { category: 'entrees', name: 'Seared Scallops', base_price: 24.00, description: 'King scallops, cauliflower purée, crispy capers, micro herbs', prep_time: 12, food_type: 'non_veg', tags: ['premium','seafood'] },
    { category: 'entrees', name: 'Wagyu Beef Tartare', base_price: 22.00, description: 'Grade 9+ wagyu, truffle aioli, quail egg, sourdough crostini', prep_time: 10, food_type: 'non_veg', tags: ['premium'] },
    { category: 'entrees', name: 'Burrata & Heirloom Tomato', base_price: 18.00, description: 'Fresh burrata, heirloom tomatoes, basil oil, aged balsamic', prep_time: 5, food_type: 'veg', tags: ['vegetarian'] },
    { category: 'mains', name: 'Eye Fillet (200g)', base_price: 55.00, description: 'Grass-fed eye fillet, bordelaise sauce, truffle potato gratin, broccolini', prep_time: 25, food_type: 'non_veg', tags: ['premium','signature'] },
    { category: 'mains', name: 'Pan-Seared Barramundi', base_price: 42.00, description: 'Wild-caught barramundi, lemon beurre blanc, asparagus, baby potato', prep_time: 18, food_type: 'non_veg', tags: ['seafood'] },
    { category: 'mains', name: 'Roasted Duck Breast', base_price: 48.00, description: 'Duck breast, cherry jus, celeriac purée, pickled red cabbage', prep_time: 22, food_type: 'non_veg', tags: ['premium'] },
    { category: 'sides', name: 'Truffle Fries', base_price: 12.00, description: 'Crispy shoestring fries, truffle oil, parmesan, fresh herbs', prep_time: 8, food_type: 'veg', tags: [] },
    { category: 'sides', name: 'Rocket & Parmesan Salad', base_price: 10.00, description: 'Baby rocket, shaved parmesan, lemon dressing', prep_time: 3, food_type: 'veg', tags: [] },
    { category: 'desserts', name: 'Chocolate Fondant', base_price: 16.00, description: 'Warm dark chocolate fondant, vanilla bean ice cream', prep_time: 12, food_type: 'veg', tags: ['popular'] },
    { category: 'desserts', name: 'Pavlova Deluxe', base_price: 18.00, description: 'Individual meringue, Chantilly cream, passionfruit, exotic fruits', prep_time: 5, food_type: 'veg', tags: ['aussie-classic'] },
    { category: 'wine', name: 'Penfolds Bin 389 (Glass)', base_price: 22.00, description: 'Cabernet Shiraz — Barossa Valley, South Australia', prep_time: 1, food_type: 'veg', tags: ['premium'] },
    { category: 'wine', name: 'Sav Blanc, Marlborough (Glass)', base_price: 14.00, description: 'Crisp New Zealand Sauvignon Blanc', prep_time: 1, food_type: 'veg', tags: [] },
  ]
};

const AU_CAFE = {
  name: 'Café & Bakery',
  region: 'AU',
  description: 'Neighbourhood café with artisan baked goods, all-day breakfast and specialty coffee',
  categories: [
    { id: 'baked', name: 'Bakery', description: 'Freshly baked daily' },
    { id: 'breakfast', name: 'All-Day Breakfast', description: 'Served all day' },
    { id: 'coffee', name: 'Coffee & Tea', description: 'Specialty coffee program' },
    { id: 'smoothies', name: 'Smoothies & Juices', description: 'Fresh blends' },
  ],
  items: [
    { category: 'baked', name: 'Croissant', base_price: 5.50, description: 'Buttery all-butter croissant, baked fresh daily', prep_time: 2, food_type: 'veg', tags: [] },
    { category: 'baked', name: 'Vegemite & Cheese Scroll', base_price: 5.00, description: 'Soft scroll dough, Vegemite, melted cheddar', prep_time: 2, food_type: 'veg', tags: ['aussie-classic'] },
    { category: 'baked', name: 'Banana Bread Slice', base_price: 6.00, description: 'Moist banana bread with walnuts, served warm with butter', prep_time: 3, food_type: 'veg', tags: ['popular'] },
    { category: 'breakfast', name: 'Smashed Avo Toast', base_price: 14.00, description: 'Sourdough, smashed avo, feta, cherry tomatoes, dukkah', prep_time: 7, food_type: 'veg', tags: ['popular'] },
    { category: 'breakfast', name: 'Poached Eggs on Toast', base_price: 12.00, description: 'Two poached eggs, sourdough, hollandaise, baby spinach', prep_time: 8, food_type: 'veg', tags: [] },
    { category: 'coffee', name: 'Flat White', base_price: 5.00, description: 'Double ristretto, silky steamed milk', prep_time: 3, food_type: 'veg', tags: ['popular'] },
    { category: 'coffee', name: 'Oat Latte', base_price: 6.00, description: 'Single origin espresso, creamy oat milk', prep_time: 3, food_type: 'veg', tags: ['vegan','popular'] },
    { category: 'coffee', name: 'Chai Latte', base_price: 5.50, description: 'Spiced chai blend, steamed milk, cinnamon', prep_time: 3, food_type: 'veg', tags: [] },
    { category: 'smoothies', name: 'Berry Blast', base_price: 8.50, description: 'Mixed berries, banana, almond milk, honey', prep_time: 4, food_type: 'veg', tags: ['vegan'] },
    { category: 'smoothies', name: 'Green Detox', base_price: 9.00, description: 'Spinach, cucumber, green apple, ginger, lemon', prep_time: 4, food_type: 'veg', tags: ['healthy','vegan'] },
  ]
};

const menuTemplatesService = {
  async seedTemplates() {
    const templates = [AU_MODERN_CASUAL, AU_FINE_DINING, AU_CAFE];
    for (const tpl of templates) {
      await prisma.menuTemplate.upsert({
        where: { name_region: { name: tpl.name, region: tpl.region } },
        create: tpl,
        update: { categories: tpl.categories, items: tpl.items, description: tpl.description },
      });
    }
    return { seeded: templates.length };
  },

  async listTemplates(region) {
    return prisma.menuTemplate.findMany({
      where: { region: region || undefined, is_active: true },
      orderBy: { name: 'asc' },
    });
  },

  async applyTemplate(outletId, templateName) {
    const tpl = await prisma.menuTemplate.findFirst({
      where: { name: templateName, is_active: true },
    });
    if (!tpl) throw new Error(`Template "${templateName}" not found`);

    // Create categories
    const categoryMap = {};
    for (const cat of tpl.categories) {
      const created = await prisma.menuCategory.create({
        data: {
          outlet_id: outletId,
          name: cat.name,
          description: cat.description || null,
          is_active: true,
          display_order: tpl.categories.indexOf(cat),
        }
      });
      categoryMap[cat.id] = created.id;
    }

    // Create items
    let itemsCreated = 0;
    for (const item of tpl.items) {
      const categoryId = categoryMap[item.category];
      if (!categoryId) continue;
      await prisma.menuItem.create({
        data: {
          outlet_id: outletId,
          category_id: categoryId,
          name: item.name,
          description: item.description || null,
          base_price: item.base_price,
          food_type: item.food_type || 'veg',
          preparation_time_min: item.prep_time || 10,
          is_active: true,
          tags: item.tags || [],
        }
      });
      itemsCreated++;
    }

    return {
      template: tpl.name,
      categories_created: Object.keys(categoryMap).length,
      items_created: itemsCreated,
    };
  }
};

module.exports = menuTemplatesService;
