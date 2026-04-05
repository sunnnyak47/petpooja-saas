-- ============================================
-- PETPOOJA ERP — SEED DATA
-- Test data for development environment
-- ============================================

-- Roles
INSERT INTO roles (name, display_name, description, is_system) VALUES
('super_admin', 'Super Administrator', 'Full system access across all outlets', true),
('owner', 'Restaurant Owner', 'Owner with access to all owned outlets', true),
('manager', 'Outlet Manager', 'Manages a single outlet', true),
('cashier', 'Cashier', 'POS billing and order management', true),
('kitchen_staff', 'Kitchen Staff', 'Kitchen display and order preparation', true),
('delivery_boy', 'Delivery Person', 'Delivery order management', true)
ON CONFLICT (name) DO NOTHING;

-- Permissions
INSERT INTO permissions (key, display_name, module) VALUES
('VIEW_DASHBOARD', 'View Dashboard', 'dashboard'),
('VIEW_REPORTS', 'View Reports', 'reports'),
('EXPORT_REPORTS', 'Export Reports', 'reports'),
('MANAGE_MENU', 'Manage Menu Items', 'menu'),
('MANAGE_CATEGORIES', 'Manage Categories', 'menu'),
('MANAGE_ORDERS', 'Manage Orders', 'orders'),
('CREATE_ORDER', 'Create Order', 'orders'),
('VOID_ORDER', 'Void an Order', 'orders'),
('PROCESS_REFUND', 'Process Refund', 'orders'),
('APPLY_DISCOUNT', 'Apply Discount', 'orders'),
('VIEW_INVENTORY', 'View Inventory', 'inventory'),
('MANAGE_INVENTORY', 'Manage Inventory', 'inventory'),
('MANAGE_SUPPLIERS', 'Manage Suppliers', 'inventory'),
('VIEW_CUSTOMERS', 'View Customers', 'customers'),
('MANAGE_CUSTOMERS', 'Manage Customers', 'customers'),
('MANAGE_CAMPAIGNS', 'Manage Campaigns', 'customers'),
('VIEW_STAFF', 'View Staff', 'staff'),
('MANAGE_STAFF', 'Manage Staff', 'staff'),
('MANAGE_ATTENDANCE', 'Manage Attendance', 'staff'),
('MANAGE_SETTINGS', 'Manage Settings', 'settings'),
('MANAGE_PAYMENTS', 'Manage Payments', 'payments'),
('OPEN_CASH_DRAWER', 'Open Cash Drawer', 'payments'),
('MANAGE_TABLES', 'Manage Tables', 'orders'),
('MANAGE_INTEGRATIONS', 'Manage Integrations', 'integrations'),
('VIEW_AUDIT_LOG', 'View Audit Log', 'settings')
ON CONFLICT (key) DO NOTHING;

-- Role-Permission mappings (owner gets all, manager gets most, cashier gets limited)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'owner'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'manager' AND p.key NOT IN ('MANAGE_SETTINGS', 'MANAGE_INTEGRATIONS')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'cashier' AND p.key IN (
  'CREATE_ORDER', 'MANAGE_ORDERS', 'APPLY_DISCOUNT',
  'OPEN_CASH_DRAWER', 'VIEW_CUSTOMERS', 'VIEW_INVENTORY'
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'kitchen_staff' AND p.key IN ('MANAGE_ORDERS')
ON CONFLICT DO NOTHING;

-- Outlets
INSERT INTO outlets (name, code, type, address_line1, city, state, pincode, phone, email, gstin, fssai_number, is_ac) VALUES
('Petpooja Mumbai Central', 'MUM01', 'restaurant', '123 Marine Drive', 'Mumbai', 'Maharashtra', '400001', '9876543210', 'mumbai@petpooja.com', '27AABCU9603R1ZM', '11521999000001', true),
('Petpooja Delhi Connaught', 'DEL01', 'restaurant', '45 Connaught Place', 'New Delhi', 'Delhi', '110001', '9876543211', 'delhi@petpooja.com', '07AABCU9603R1ZN', '07521999000002', false),
('Petpooja Bangalore Indiranagar', 'BLR01', 'restaurant', '78 12th Main Indiranagar', 'Bangalore', 'Karnataka', '560038', '9876543212', 'bangalore@petpooja.com', '29AABCU9603R1ZP', '29521999000003', true)
ON CONFLICT (code) DO NOTHING;

-- Admin User (password: Admin@12345 — bcrypt 12 rounds)
INSERT INTO users (full_name, email, phone, password_hash, is_active, is_email_verified, is_phone_verified) VALUES
('Super Admin', 'admin@petpooja.com', '9999999999', '$2b$12$WEtHuXJQ1KP5LYqE9QjjfOoWYk8gccSbfb9vSOq7B7V6SahLTSwpK', true, true, true),
('Rahul Sharma', 'rahul@petpooja.com', '9876543210', '$2b$12$WEtHuXJQ1KP5LYqE9QjjfOoWYk8gccSbfb9vSOq7B7V6SahLTSwpK', true, true, true),
('Priya Manager', 'priya@petpooja.com', '9876543220', '$2b$12$WEtHuXJQ1KP5LYqE9QjjfOoWYk8gccSbfb9vSOq7B7V6SahLTSwpK', true, true, true),
('Amit Cashier', 'amit@petpooja.com', '9876543230', '$2b$12$WEtHuXJQ1KP5LYqE9QjjfOoWYk8gccSbfb9vSOq7B7V6SahLTSwpK', true, true, true)
ON CONFLICT (phone) DO NOTHING;

-- User Roles
INSERT INTO user_roles (user_id, role_id, outlet_id, is_primary)
SELECT u.id, r.id, o.id, true FROM users u, roles r, outlets o WHERE u.email = 'admin@petpooja.com' AND r.name = 'super_admin' AND o.code = 'MUM01'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id, outlet_id, is_primary)
SELECT u.id, r.id, o.id, true FROM users u, roles r, outlets o WHERE u.email = 'rahul@petpooja.com' AND r.name = 'owner' AND o.code = 'MUM01'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id, outlet_id, is_primary)
SELECT u.id, r.id, o.id, true FROM users u, roles r, outlets o WHERE u.email = 'priya@petpooja.com' AND r.name = 'manager' AND o.code = 'MUM01'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id, outlet_id, is_primary)
SELECT u.id, r.id, o.id, true FROM users u, roles r, outlets o WHERE u.email = 'amit@petpooja.com' AND r.name = 'cashier' AND o.code = 'MUM01'
ON CONFLICT DO NOTHING;

-- Table Areas & Tables for Mumbai outlet
INSERT INTO table_areas (outlet_id, name, display_order)
SELECT o.id, 'Main Hall', 1 FROM outlets o WHERE o.code = 'MUM01'
ON CONFLICT DO NOTHING;

INSERT INTO table_areas (outlet_id, name, display_order)
SELECT o.id, 'Outdoor', 2 FROM outlets o WHERE o.code = 'MUM01'
ON CONFLICT DO NOTHING;

-- Tables
DO $$
DECLARE
  outlet_id UUID;
  area_id UUID;
BEGIN
  SELECT id INTO outlet_id FROM outlets WHERE code = 'MUM01';
  SELECT id INTO area_id FROM table_areas WHERE outlet_id = outlet_id AND name = 'Main Hall' LIMIT 1;

  FOR i IN 1..10 LOOP
    INSERT INTO tables (outlet_id, area_id, table_number, seating_capacity, display_order)
    VALUES (outlet_id, area_id, 'T' || i, CASE WHEN i <= 5 THEN 4 ELSE 6 END, i)
    ON CONFLICT (outlet_id, table_number) DO NOTHING;
  END LOOP;
END $$;

-- Menu Categories for Mumbai
DO $$
DECLARE
  oid UUID;
BEGIN
  SELECT id INTO oid FROM outlets WHERE code = 'MUM01';

  INSERT INTO menu_categories (outlet_id, name, display_order, is_active) VALUES
  (oid, 'Starters', 1, true),
  (oid, 'Main Course', 2, true),
  (oid, 'Breads', 3, true),
  (oid, 'Rice & Biryani', 4, true),
  (oid, 'Chinese', 5, true),
  (oid, 'Soups', 6, true),
  (oid, 'Salads', 7, true),
  (oid, 'Desserts', 8, true),
  (oid, 'Beverages', 9, true),
  (oid, 'Mocktails', 10, true);
END $$;

-- Menu Items
DO $$
DECLARE
  oid UUID;
  cat_starters UUID;
  cat_main UUID;
  cat_breads UUID;
  cat_rice UUID;
  cat_beverages UUID;
  cat_desserts UUID;
BEGIN
  SELECT id INTO oid FROM outlets WHERE code = 'MUM01';
  SELECT id INTO cat_starters FROM menu_categories WHERE outlet_id = oid AND name = 'Starters' LIMIT 1;
  SELECT id INTO cat_main FROM menu_categories WHERE outlet_id = oid AND name = 'Main Course' LIMIT 1;
  SELECT id INTO cat_breads FROM menu_categories WHERE outlet_id = oid AND name = 'Breads' LIMIT 1;
  SELECT id INTO cat_rice FROM menu_categories WHERE outlet_id = oid AND name = 'Rice & Biryani' LIMIT 1;
  SELECT id INTO cat_beverages FROM menu_categories WHERE outlet_id = oid AND name = 'Beverages' LIMIT 1;
  SELECT id INTO cat_desserts FROM menu_categories WHERE outlet_id = oid AND name = 'Desserts' LIMIT 1;

  -- Starters
  INSERT INTO menu_items (outlet_id, category_id, name, base_price, food_type, kitchen_station, gst_rate, is_bestseller) VALUES
  (oid, cat_starters, 'Paneer Tikka', 280, 'veg', 'GRILL', 5.00, true),
  (oid, cat_starters, 'Chicken Tikka', 320, 'non_veg', 'GRILL', 5.00, true),
  (oid, cat_starters, 'Hara Bhara Kebab', 220, 'veg', 'KITCHEN', 5.00, false),
  (oid, cat_starters, 'Fish Amritsari', 350, 'non_veg', 'KITCHEN', 5.00, false),
  (oid, cat_starters, 'Crispy Corn', 200, 'veg', 'KITCHEN', 5.00, true),
  (oid, cat_starters, 'Tandoori Chicken', 380, 'non_veg', 'GRILL', 5.00, false);

  -- Main Course
  INSERT INTO menu_items (outlet_id, category_id, name, base_price, food_type, kitchen_station, gst_rate) VALUES
  (oid, cat_main, 'Butter Chicken', 350, 'non_veg', 'KITCHEN', 5.00),
  (oid, cat_main, 'Paneer Butter Masala', 280, 'veg', 'KITCHEN', 5.00),
  (oid, cat_main, 'Dal Makhani', 220, 'veg', 'KITCHEN', 5.00),
  (oid, cat_main, 'Chicken Biryani', 320, 'non_veg', 'KITCHEN', 5.00),
  (oid, cat_main, 'Palak Paneer', 260, 'veg', 'KITCHEN', 5.00),
  (oid, cat_main, 'Mutton Rogan Josh', 420, 'non_veg', 'KITCHEN', 5.00);

  -- Breads
  INSERT INTO menu_items (outlet_id, category_id, name, base_price, food_type, kitchen_station, gst_rate) VALUES
  (oid, cat_breads, 'Butter Naan', 60, 'veg', 'KITCHEN', 5.00),
  (oid, cat_breads, 'Garlic Naan', 80, 'veg', 'KITCHEN', 5.00),
  (oid, cat_breads, 'Tandoori Roti', 40, 'veg', 'KITCHEN', 5.00),
  (oid, cat_breads, 'Cheese Naan', 100, 'veg', 'KITCHEN', 5.00);

  -- Rice
  INSERT INTO menu_items (outlet_id, category_id, name, base_price, food_type, kitchen_station, gst_rate) VALUES
  (oid, cat_rice, 'Steamed Rice', 120, 'veg', 'KITCHEN', 5.00),
  (oid, cat_rice, 'Jeera Rice', 150, 'veg', 'KITCHEN', 5.00),
  (oid, cat_rice, 'Veg Biryani', 250, 'veg', 'KITCHEN', 5.00),
  (oid, cat_rice, 'Chicken Fried Rice', 220, 'non_veg', 'KITCHEN', 5.00);

  -- Beverages
  INSERT INTO menu_items (outlet_id, category_id, name, base_price, food_type, kitchen_station, gst_rate) VALUES
  (oid, cat_beverages, 'Masala Chai', 50, 'veg', 'BAR', 5.00),
  (oid, cat_beverages, 'Cold Coffee', 150, 'veg', 'BAR', 5.00),
  (oid, cat_beverages, 'Fresh Lime Soda', 100, 'veg', 'BAR', 5.00),
  (oid, cat_beverages, 'Mango Lassi', 120, 'veg', 'BAR', 5.00);

  -- Desserts
  INSERT INTO menu_items (outlet_id, category_id, name, base_price, food_type, kitchen_station, gst_rate) VALUES
  (oid, cat_desserts, 'Gulab Jamun', 100, 'veg', 'DESSERT', 5.00),
  (oid, cat_desserts, 'Rasmalai', 120, 'veg', 'DESSERT', 5.00),
  (oid, cat_desserts, 'Brownie with Ice Cream', 180, 'egg', 'DESSERT', 5.00);
END $$;

-- Sample Customers
INSERT INTO customers (phone, full_name, email, total_visits, total_spend, segment) VALUES
('9000000001', 'Vikram Patel', 'vikram@gmail.com', 15, 12500.00, 'vip'),
('9000000002', 'Anjali Desai', 'anjali@gmail.com', 8, 6200.00, 'regular'),
('9000000003', 'Rohit Kumar', 'rohit@gmail.com', 2, 1800.00, 'new'),
('9000000004', 'Sneha Iyer', 'sneha@gmail.com', 25, 22000.00, 'vip'),
('9000000005', 'Karan Mehta', 'karan@gmail.com', 1, 450.00, 'new')
ON CONFLICT (phone) DO NOTHING;

-- Loyalty Points for customers
INSERT INTO loyalty_points (customer_id, total_earned, total_redeemed, current_balance)
SELECT id, 1250, 200, 1050 FROM customers WHERE phone = '9000000001'
ON CONFLICT DO NOTHING;

INSERT INTO loyalty_points (customer_id, total_earned, total_redeemed, current_balance)
SELECT id, 620, 0, 620 FROM customers WHERE phone = '9000000002'
ON CONFLICT DO NOTHING;

-- Payment Methods for Mumbai outlet
INSERT INTO payment_methods (outlet_id, method, display_name, is_active, sort_order)
SELECT o.id, m.method, m.display_name, true, m.sort_order
FROM outlets o,
(VALUES
  ('cash', 'Cash', 1),
  ('card_pine_labs', 'Card', 2),
  ('upi_razorpay', 'UPI', 3),
  ('paytm', 'Paytm', 4),
  ('wallet', 'Wallet', 5),
  ('loyalty_points', 'Loyalty Points', 6),
  ('online_prepaid', 'Online Prepaid', 7)
) AS m(method, display_name, sort_order)
WHERE o.code = 'MUM01'
ON CONFLICT (outlet_id, method) DO NOTHING;

-- Tax Config
INSERT INTO tax_config (outlet_id, name, rate, type, apply_on, is_active)
SELECT o.id, 'GST 5%', 5.00, 'gst', 'all', true FROM outlets o WHERE o.code = 'MUM01'
ON CONFLICT DO NOTHING;

-- Suppliers
DO $$
DECLARE
  oid UUID;
BEGIN
  SELECT id INTO oid FROM outlets WHERE code = 'MUM01';

  INSERT INTO suppliers (outlet_id, name, contact_person, phone, email, payment_terms) VALUES
  (oid, 'Fresh Farms Pvt Ltd', 'Ramesh Gupta', '9111000001', 'fresh@farms.com', 'Net 15'),
  (oid, 'Metro Wholesale', 'Suresh Kumar', '9111000002', 'metro@wholesale.com', 'Net 30'),
  (oid, 'Spice World Traders', 'Ahmed Khan', '9111000003', 'spice@world.com', 'COD');
END $$;

-- Inventory Items
DO $$
DECLARE
  oid UUID;
BEGIN
  SELECT id INTO oid FROM outlets WHERE code = 'MUM01';

  INSERT INTO inventory_items (outlet_id, name, category, unit, cost_per_unit, min_threshold) VALUES
  (oid, 'Chicken Breast', 'Meat', 'kg', 280, 5),
  (oid, 'Paneer', 'Dairy', 'kg', 320, 3),
  (oid, 'Onion', 'Vegetables', 'kg', 40, 10),
  (oid, 'Tomato', 'Vegetables', 'kg', 50, 10),
  (oid, 'Basmati Rice', 'Grains', 'kg', 120, 20),
  (oid, 'Wheat Flour', 'Grains', 'kg', 45, 15),
  (oid, 'Cooking Oil', 'Oil', 'l', 150, 10),
  (oid, 'Butter', 'Dairy', 'kg', 480, 2),
  (oid, 'Cream', 'Dairy', 'l', 200, 3),
  (oid, 'Garam Masala', 'Spices', 'kg', 600, 1);
END $$;

-- Stock levels
INSERT INTO inventory_stock (outlet_id, inventory_item_id, current_stock)
SELECT i.outlet_id, i.id, CASE
  WHEN i.name = 'Chicken Breast' THEN 25
  WHEN i.name = 'Paneer' THEN 15
  WHEN i.name = 'Onion' THEN 50
  WHEN i.name = 'Tomato' THEN 40
  WHEN i.name = 'Basmati Rice' THEN 100
  WHEN i.name = 'Wheat Flour' THEN 60
  WHEN i.name = 'Cooking Oil' THEN 30
  WHEN i.name = 'Butter' THEN 8
  WHEN i.name = 'Cream' THEN 10
  WHEN i.name = 'Garam Masala' THEN 3
  ELSE 10
END
FROM inventory_items i
WHERE i.outlet_id = (SELECT id FROM outlets WHERE code = 'MUM01')
ON CONFLICT (outlet_id, inventory_item_id) DO NOTHING;

-- ============================================
-- SEED COMPLETE
-- ============================================
