-- ============================================
-- PETPOOJA ERP — COMPLETE DATABASE SCHEMA
-- PostgreSQL 16 | Production-Ready
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- AUTO-UPDATE TRIGGER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- CORE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE TRIGGER trg_roles_updated BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(150) NOT NULL,
  module VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE TRIGGER trg_permissions_updated BEFORE UPDATE ON permissions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role_id UUID NOT NULL REFERENCES roles(id),
  permission_id UUID NOT NULL REFERENCES permissions(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS outlets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  type VARCHAR(30) DEFAULT 'restaurant' CHECK (type IN ('restaurant','central_kitchen','cloud_kitchen','kiosk')),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(10),
  country VARCHAR(50) DEFAULT 'India',
  phone VARCHAR(15),
  email VARCHAR(150),
  gstin VARCHAR(20),
  fssai_number VARCHAR(20),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
  currency VARCHAR(5) DEFAULT 'INR',
  is_ac BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  opening_time TIME DEFAULT '09:00',
  closing_time TIME DEFAULT '23:00',
  owner_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_outlets_code ON outlets(code);
CREATE INDEX idx_outlets_active ON outlets(is_active) WHERE is_deleted = false;
CREATE TRIGGER trg_outlets_updated BEFORE UPDATE ON outlets FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE,
  phone VARCHAR(15) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  is_email_verified BOOLEAN DEFAULT false,
  is_phone_verified BOOLEAN DEFAULT false,
  last_login_at TIMESTAMPTZ,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_users_email ON users(email) WHERE is_deleted = false;
CREATE INDEX idx_users_phone ON users(phone) WHERE is_deleted = false;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  role_id UUID NOT NULL REFERENCES roles(id),
  outlet_id UUID REFERENCES outlets(id),
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false,
  UNIQUE(user_id, role_id, outlet_id)
);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_outlet ON user_roles(outlet_id);
CREATE TRIGGER trg_user_roles_updated BEFORE UPDATE ON user_roles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS outlet_zones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE TRIGGER trg_outlet_zones_updated BEFORE UPDATE ON outlet_zones FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS outlet_zone_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  zone_id UUID NOT NULL REFERENCES outlet_zones(id),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(zone_id, outlet_id)
);

CREATE TABLE IF NOT EXISTS outlet_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT NOT NULL,
  data_type VARCHAR(20) DEFAULT 'string' CHECK (data_type IN ('string','number','boolean','json')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false,
  UNIQUE(outlet_id, setting_key)
);
CREATE INDEX idx_outlet_settings_outlet ON outlet_settings(outlet_id);
CREATE TRIGGER trg_outlet_settings_updated BEFORE UPDATE ON outlet_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  outlet_id UUID REFERENCES outlets(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_outlet ON audit_log(outlet_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);

-- ============================================
-- MENU TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS menu_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon_url VARCHAR(500),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  parent_id UUID REFERENCES menu_categories(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_menu_categories_outlet ON menu_categories(outlet_id);
CREATE INDEX idx_menu_categories_order ON menu_categories(display_order);
CREATE TRIGGER trg_menu_categories_updated BEFORE UPDATE ON menu_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS menu_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  category_id UUID NOT NULL REFERENCES menu_categories(id),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  short_code VARCHAR(20),
  image_url VARCHAR(500),
  base_price DECIMAL(10,2) NOT NULL CHECK (base_price >= 0),
  food_type VARCHAR(15) DEFAULT 'veg' CHECK (food_type IN ('veg','non_veg','egg')),
  cuisine VARCHAR(50),
  kitchen_station VARCHAR(30) DEFAULT 'KITCHEN' CHECK (kitchen_station IN ('KITCHEN','BAR','COLD','DESSERT','GRILL')),
  gst_rate DECIMAL(5,2) DEFAULT 5.00,
  hsn_code VARCHAR(10) DEFAULT '9963',
  is_active BOOLEAN DEFAULT true,
  is_available BOOLEAN DEFAULT true,
  is_bestseller BOOLEAN DEFAULT false,
  is_new BOOLEAN DEFAULT false,
  is_spicy BOOLEAN DEFAULT false,
  is_recommended BOOLEAN DEFAULT false,
  allergen_info TEXT,
  preparation_time_min INTEGER DEFAULT 15,
  calories INTEGER,
  display_order INTEGER DEFAULT 0,
  tags JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_menu_items_outlet ON menu_items(outlet_id);
CREATE INDEX idx_menu_items_category ON menu_items(category_id);
CREATE INDEX idx_menu_items_station ON menu_items(kitchen_station);
CREATE INDEX idx_menu_items_active ON menu_items(is_active, is_available) WHERE is_deleted = false;
CREATE TRIGGER trg_menu_items_updated BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS item_variants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  name VARCHAR(100) NOT NULL,
  price_addition DECIMAL(10,2) DEFAULT 0 CHECK (price_addition >= 0),
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_item_variants_item ON item_variants(menu_item_id);
CREATE TRIGGER trg_item_variants_updated BEFORE UPDATE ON item_variants FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS addon_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  name VARCHAR(100) NOT NULL,
  min_selection INTEGER DEFAULT 0,
  max_selection INTEGER DEFAULT 5,
  is_required BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_addon_groups_outlet ON addon_groups(outlet_id);
CREATE TRIGGER trg_addon_groups_updated BEFORE UPDATE ON addon_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS item_addons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  addon_group_id UUID NOT NULL REFERENCES addon_groups(id),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) DEFAULT 0 CHECK (price >= 0),
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_item_addons_group ON item_addons(addon_group_id);
CREATE INDEX idx_item_addons_item ON item_addons(menu_item_id);
CREATE TRIGGER trg_item_addons_updated BEFORE UPDATE ON item_addons FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS item_combo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  image_url VARCHAR(500),
  combo_price DECIMAL(10,2) NOT NULL CHECK (combo_price >= 0),
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_item_combo_outlet ON item_combo(outlet_id);
CREATE TRIGGER trg_item_combo_updated BEFORE UPDATE ON item_combo FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS combo_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  combo_id UUID NOT NULL REFERENCES item_combo(id),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_combo_items_combo ON combo_items(combo_id);

CREATE TABLE IF NOT EXISTS menu_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_menu_schedules_item ON menu_schedules(menu_item_id);
CREATE TRIGGER trg_menu_schedules_updated BEFORE UPDATE ON menu_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS outlet_menu_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  override_price DECIMAL(10,2),
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false,
  UNIQUE(outlet_id, menu_item_id)
);
CREATE INDEX idx_outlet_menu_overrides_outlet ON outlet_menu_overrides(outlet_id);
CREATE TRIGGER trg_outlet_menu_overrides_updated BEFORE UPDATE ON outlet_menu_overrides FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ORDER TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS table_areas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  name VARCHAR(100) NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_table_areas_outlet ON table_areas(outlet_id);
CREATE TRIGGER trg_table_areas_updated BEFORE UPDATE ON table_areas FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS tables (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  area_id UUID REFERENCES table_areas(id),
  table_number VARCHAR(20) NOT NULL,
  seating_capacity INTEGER DEFAULT 4,
  status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available','occupied','reserved','blocked')),
  current_order_id UUID,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false,
  UNIQUE(outlet_id, table_number)
);
CREATE INDEX idx_tables_outlet ON tables(outlet_id);
CREATE INDEX idx_tables_status ON tables(status);
CREATE TRIGGER trg_tables_updated BEFORE UPDATE ON tables FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  order_number VARCHAR(30) NOT NULL UNIQUE,
  order_type VARCHAR(20) DEFAULT 'dine_in' CHECK (order_type IN ('dine_in','takeaway','delivery','online','qr_order')),
  status VARCHAR(25) DEFAULT 'created' CHECK (status IN ('created','confirmed','preparing','ready','served','paid','cancelled','voided','refunded')),
  table_id UUID REFERENCES tables(id),
  customer_id UUID,
  staff_id UUID REFERENCES users(id),
  subtotal DECIMAL(12,2) DEFAULT 0,
  discount_type VARCHAR(15) CHECK (discount_type IN ('percentage','flat')),
  discount_value DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  discount_reason TEXT,
  coupon_code VARCHAR(50),
  loyalty_points_used INTEGER DEFAULT 0,
  loyalty_discount DECIMAL(10,2) DEFAULT 0,
  taxable_amount DECIMAL(12,2) DEFAULT 0,
  cgst DECIMAL(10,2) DEFAULT 0,
  sgst DECIMAL(10,2) DEFAULT 0,
  igst DECIMAL(10,2) DEFAULT 0,
  total_tax DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(12,2) DEFAULT 0,
  round_off DECIMAL(5,2) DEFAULT 0,
  grand_total DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  source VARCHAR(20) DEFAULT 'pos' CHECK (source IN ('pos','qr','online','kiosk','app')),
  aggregator VARCHAR(20),
  aggregator_order_id VARCHAR(100),
  is_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES users(id),
  cancel_reason TEXT,
  void_reason TEXT,
  voided_by UUID REFERENCES users(id),
  invoice_number VARCHAR(50),
  invoice_url VARCHAR(500),
  daily_sequence INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_orders_outlet ON orders(outlet_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_table ON orders(table_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_aggregator ON orders(aggregator, aggregator_order_id);
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  variant_id UUID REFERENCES item_variants(id),
  name VARCHAR(200) NOT NULL,
  variant_name VARCHAR(100),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL,
  variant_price DECIMAL(10,2) DEFAULT 0,
  addons_total DECIMAL(10,2) DEFAULT 0,
  item_total DECIMAL(10,2) NOT NULL,
  gst_rate DECIMAL(5,2) DEFAULT 5.00,
  item_tax DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  is_kot_sent BOOLEAN DEFAULT false,
  kot_id UUID,
  kitchen_station VARCHAR(30) DEFAULT 'KITCHEN',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','sent','preparing','ready','served','cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_menu ON order_items(menu_item_id);
CREATE TRIGGER trg_order_items_updated BEFORE UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS order_item_addons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_item_id UUID NOT NULL REFERENCES order_items(id),
  addon_id UUID NOT NULL REFERENCES item_addons(id),
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_order_item_addons_item ON order_item_addons(order_item_id);

CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  from_status VARCHAR(25),
  to_status VARCHAR(25) NOT NULL,
  changed_by UUID REFERENCES users(id),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_order_status_history_order ON order_status_history(order_id);

CREATE TABLE IF NOT EXISTS kot (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  kot_number VARCHAR(20) NOT NULL,
  station VARCHAR(30) DEFAULT 'KITCHEN',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','preparing','ready','completed')),
  items_count INTEGER DEFAULT 0,
  printed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_kot_outlet ON kot(outlet_id);
CREATE INDEX idx_kot_order ON kot(order_id);
CREATE INDEX idx_kot_status ON kot(status);
CREATE INDEX idx_kot_created ON kot(created_at);
CREATE TRIGGER trg_kot_updated BEFORE UPDATE ON kot FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS kot_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kot_id UUID NOT NULL REFERENCES kot(id),
  order_item_id UUID NOT NULL REFERENCES order_items(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','preparing','ready')),
  ready_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_kot_items_kot ON kot_items(kot_id);
CREATE TRIGGER trg_kot_items_updated BEFORE UPDATE ON kot_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS table_reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  table_id UUID NOT NULL REFERENCES tables(id),
  customer_name VARCHAR(150),
  customer_phone VARCHAR(15),
  party_size INTEGER DEFAULT 2,
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 90,
  status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed','seated','completed','cancelled','no_show')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_table_reservations_outlet ON table_reservations(outlet_id);
CREATE INDEX idx_table_reservations_date ON table_reservations(reservation_date);
CREATE TRIGGER trg_table_reservations_updated BEFORE UPDATE ON table_reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- INVENTORY TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  name VARCHAR(200) NOT NULL,
  sku VARCHAR(50),
  category VARCHAR(50),
  unit VARCHAR(20) NOT NULL DEFAULT 'kg' CHECK (unit IN ('kg','g','l','ml','pcs','dozen','box')),
  cost_per_unit DECIMAL(10,2) DEFAULT 0,
  min_threshold DECIMAL(10,2) DEFAULT 0,
  max_threshold DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_inventory_items_outlet ON inventory_items(outlet_id);
CREATE TRIGGER trg_inventory_items_updated BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS inventory_stock (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  current_stock DECIMAL(12,3) DEFAULT 0,
  last_updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false,
  UNIQUE(outlet_id, inventory_item_id)
);
CREATE INDEX idx_inventory_stock_outlet ON inventory_stock(outlet_id);
CREATE TRIGGER trg_inventory_stock_updated BEFORE UPDATE ON inventory_stock FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS stock_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('purchase','consumption','wastage','adjustment','transfer_in','transfer_out')),
  quantity DECIMAL(12,3) NOT NULL,
  unit_cost DECIMAL(10,2),
  reference_type VARCHAR(30),
  reference_id UUID,
  reason TEXT,
  performed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_stock_transactions_outlet ON stock_transactions(outlet_id);
CREATE INDEX idx_stock_transactions_item ON stock_transactions(inventory_item_id);
CREATE INDEX idx_stock_transactions_created ON stock_transactions(created_at);

CREATE TABLE IF NOT EXISTS wastage_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  quantity DECIMAL(12,3) NOT NULL,
  reason TEXT NOT NULL,
  logged_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_wastage_log_outlet ON wastage_log(outlet_id);
CREATE TRIGGER trg_wastage_log_updated BEFORE UPDATE ON wastage_log FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(150),
  phone VARCHAR(15),
  email VARCHAR(150),
  address TEXT,
  gstin VARCHAR(20),
  pan VARCHAR(12),
  payment_terms VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_suppliers_outlet ON suppliers(outlet_id);
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  po_number VARCHAR(30) NOT NULL UNIQUE,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','sent','partial','received','cancelled')),
  total_amount DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  expected_date DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_purchase_orders_outlet ON purchase_orders(outlet_id);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE TRIGGER trg_purchase_orders_updated BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS po_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  ordered_quantity DECIMAL(12,3) NOT NULL,
  unit_cost DECIMAL(10,2) NOT NULL,
  received_quantity DECIMAL(12,3) DEFAULT 0,
  total_cost DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_po_items_po ON po_items(purchase_order_id);

CREATE TABLE IF NOT EXISTS goods_received_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id),
  grn_number VARCHAR(30) NOT NULL UNIQUE,
  received_by UUID REFERENCES users(id),
  received_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_grn_outlet ON goods_received_notes(outlet_id);
CREATE TRIGGER trg_grn_updated BEFORE UPDATE ON goods_received_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS grn_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grn_id UUID NOT NULL REFERENCES goods_received_notes(id),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  po_item_id UUID REFERENCES po_items(id),
  received_quantity DECIMAL(12,3) NOT NULL,
  unit_cost DECIMAL(10,2),
  quality_status VARCHAR(20) DEFAULT 'accepted' CHECK (quality_status IN ('accepted','rejected','partial')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_grn_items_grn ON grn_items(grn_id);

CREATE TABLE IF NOT EXISTS recipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) UNIQUE,
  name VARCHAR(200),
  yield_quantity DECIMAL(10,3) DEFAULT 1,
  yield_unit VARCHAR(20) DEFAULT 'pcs',
  instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_recipes_menu_item ON recipes(menu_item_id);
CREATE TRIGGER trg_recipes_updated BEFORE UPDATE ON recipes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES recipes(id),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  quantity DECIMAL(12,3) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);

-- ============================================
-- CUSTOMER TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone VARCHAR(15) NOT NULL UNIQUE,
  full_name VARCHAR(150),
  email VARCHAR(150),
  date_of_birth DATE,
  anniversary DATE,
  gender VARCHAR(10) CHECK (gender IN ('male','female','other')),
  dietary_preference VARCHAR(20) CHECK (dietary_preference IN ('veg','non_veg','vegan','jain')),
  allergens TEXT,
  total_visits INTEGER DEFAULT 0,
  total_spend DECIMAL(12,2) DEFAULT 0,
  avg_order_value DECIMAL(10,2) DEFAULT 0,
  last_visit_at TIMESTAMPTZ,
  segment VARCHAR(20) DEFAULT 'new' CHECK (segment IN ('new','regular','vip','lapsed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_segment ON customers(segment);
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  label VARCHAR(50) DEFAULT 'home',
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(10),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_customer_addresses_customer ON customer_addresses(customer_id);
CREATE TRIGGER trg_customer_addresses_updated BEFORE UPDATE ON customer_addresses FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS loyalty_points (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) UNIQUE,
  total_earned INTEGER DEFAULT 0,
  total_redeemed INTEGER DEFAULT 0,
  current_balance INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_loyalty_points_customer ON loyalty_points(customer_id);
CREATE TRIGGER trg_loyalty_points_updated BEFORE UPDATE ON loyalty_points FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  order_id UUID REFERENCES orders(id),
  type VARCHAR(10) NOT NULL CHECK (type IN ('earn','redeem','expire','adjust')),
  points INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_loyalty_transactions_customer ON loyalty_transactions(customer_id);
CREATE INDEX idx_loyalty_transactions_outlet ON loyalty_transactions(outlet_id);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID REFERENCES outlets(id),
  name VARCHAR(200) NOT NULL,
  type VARCHAR(20) DEFAULT 'sms' CHECK (type IN ('sms','email','whatsapp','push')),
  target_segment VARCHAR(20) CHECK (target_segment IN ('all','new','regular','vip','lapsed','birthday')),
  message_template TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','failed','cancelled')),
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_campaigns_outlet ON campaigns(outlet_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS campaign_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent','delivered','failed','bounced')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_campaign_logs_campaign ON campaign_logs(campaign_id);

-- ============================================
-- STAFF TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS staff_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  employee_code VARCHAR(20),
  department VARCHAR(50),
  designation VARCHAR(100),
  manager_pin VARCHAR(10),
  hourly_rate DECIMAL(8,2),
  monthly_salary DECIMAL(10,2),
  photo_url VARCHAR(500),
  emergency_contact VARCHAR(15),
  blood_group VARCHAR(5),
  join_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false,
  UNIQUE(user_id, outlet_id)
);
CREATE INDEX idx_staff_profiles_outlet ON staff_profiles(outlet_id);
CREATE INDEX idx_staff_profiles_user ON staff_profiles(user_id);
CREATE TRIGGER trg_staff_profiles_updated BEFORE UPDATE ON staff_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS staff_shifts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  name VARCHAR(50) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_staff_shifts_outlet ON staff_shifts(outlet_id);
CREATE TRIGGER trg_staff_shifts_updated BEFORE UPDATE ON staff_shifts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS attendance_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  shift_id UUID REFERENCES staff_shifts(id),
  clock_in TIMESTAMPTZ NOT NULL,
  clock_out TIMESTAMPTZ,
  clock_in_lat DECIMAL(10,7),
  clock_in_lng DECIMAL(10,7),
  clock_out_lat DECIMAL(10,7),
  clock_out_lng DECIMAL(10,7),
  hours_worked DECIMAL(5,2),
  is_overtime BOOLEAN DEFAULT false,
  overtime_hours DECIMAL(5,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_attendance_log_user ON attendance_log(user_id);
CREATE INDEX idx_attendance_log_outlet ON attendance_log(outlet_id);
CREATE INDEX idx_attendance_log_date ON attendance_log(clock_in);
CREATE TRIGGER trg_attendance_log_updated BEFORE UPDATE ON attendance_log FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS staff_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  permission_key VARCHAR(100) NOT NULL,
  is_granted BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false,
  UNIQUE(user_id, outlet_id, permission_key)
);
CREATE INDEX idx_staff_permissions_user ON staff_permissions(user_id);
CREATE TRIGGER trg_staff_permissions_updated BEFORE UPDATE ON staff_permissions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- FINANCE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  method VARCHAR(30) NOT NULL CHECK (method IN ('cash','card_pine_labs','upi_razorpay','paytm','wallet','loyalty_points','online_prepaid')),
  display_name VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false,
  UNIQUE(outlet_id, method)
);
CREATE INDEX idx_payment_methods_outlet ON payment_methods(outlet_id);
CREATE TRIGGER trg_payment_methods_updated BEFORE UPDATE ON payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  method VARCHAR(30) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  transaction_id VARCHAR(100),
  gateway_response JSONB,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','success','failed','refunded','partial_refund')),
  refund_amount DECIMAL(12,2) DEFAULT 0,
  refund_id VARCHAR(100),
  refund_reason TEXT,
  processed_by UUID REFERENCES users(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_payments_outlet ON payments(outlet_id);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created ON payments(created_at);
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS payment_splits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES payments(id),
  method VARCHAR(30) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  transaction_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'success',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_payment_splits_payment ON payment_splits(payment_id);

CREATE TABLE IF NOT EXISTS tax_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  name VARCHAR(50) NOT NULL,
  rate DECIMAL(5,2) NOT NULL,
  type VARCHAR(10) DEFAULT 'gst' CHECK (type IN ('gst','vat','service_charge','cess')),
  is_inclusive BOOLEAN DEFAULT false,
  apply_on VARCHAR(20) DEFAULT 'all' CHECK (apply_on IN ('all','food','beverage','tobacco')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_tax_config_outlet ON tax_config(outlet_id);
CREATE TRIGGER trg_tax_config_updated BEFORE UPDATE ON tax_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS invoice_sequences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  financial_year VARCHAR(10) NOT NULL,
  last_sequence INTEGER DEFAULT 0,
  prefix VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(outlet_id, financial_year)
);
CREATE INDEX idx_invoice_sequences_outlet ON invoice_sequences(outlet_id);
CREATE TRIGGER trg_invoice_sequences_updated BEFORE UPDATE ON invoice_sequences FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- REPORTING TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS reports_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  report_name VARCHAR(100) NOT NULL,
  params_hash VARCHAR(64) NOT NULL,
  data JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(outlet_id, report_name, params_hash)
);
CREATE INDEX idx_reports_cache_outlet ON reports_cache(outlet_id);
CREATE INDEX idx_reports_cache_expires ON reports_cache(expires_at);

CREATE TABLE IF NOT EXISTS daily_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  summary_date DATE NOT NULL,
  total_orders INTEGER DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  total_tax DECIMAL(10,2) DEFAULT 0,
  total_discount DECIMAL(10,2) DEFAULT 0,
  dine_in_orders INTEGER DEFAULT 0,
  takeaway_orders INTEGER DEFAULT 0,
  delivery_orders INTEGER DEFAULT 0,
  online_orders INTEGER DEFAULT 0,
  cash_collected DECIMAL(12,2) DEFAULT 0,
  card_collected DECIMAL(12,2) DEFAULT 0,
  upi_collected DECIMAL(12,2) DEFAULT 0,
  other_collected DECIMAL(12,2) DEFAULT 0,
  covers INTEGER DEFAULT 0,
  avg_order_value DECIMAL(10,2) DEFAULT 0,
  void_count INTEGER DEFAULT 0,
  void_amount DECIMAL(10,2) DEFAULT 0,
  refund_count INTEGER DEFAULT 0,
  refund_amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(outlet_id, summary_date)
);
CREATE INDEX idx_daily_summaries_outlet ON daily_summaries(outlet_id);
CREATE INDEX idx_daily_summaries_date ON daily_summaries(summary_date);
CREATE TRIGGER trg_daily_summaries_updated BEFORE UPDATE ON daily_summaries FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ENTERPRISE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS outlet_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE TRIGGER trg_outlet_groups_updated BEFORE UPDATE ON outlet_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS outlet_group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES outlet_groups(id),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, outlet_id)
);

CREATE TABLE IF NOT EXISTS franchise_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  franchise_fee_type VARCHAR(20) DEFAULT 'percentage' CHECK (franchise_fee_type IN ('percentage','flat')),
  franchise_fee_value DECIMAL(10,2) DEFAULT 0,
  calculate_on VARCHAR(10) DEFAULT 'gross' CHECK (calculate_on IN ('gross','net')),
  billing_cycle VARCHAR(10) DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','quarterly','annually')),
  contract_start DATE,
  contract_end DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_franchise_config_outlet ON franchise_config(outlet_id);
CREATE TRIGGER trg_franchise_config_updated BEFORE UPDATE ON franchise_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS central_kitchen_indents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requesting_outlet_id UUID NOT NULL REFERENCES outlets(id),
  ck_outlet_id UUID NOT NULL REFERENCES outlets(id),
  indent_number VARCHAR(30) NOT NULL UNIQUE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','dispatched','received','cancelled')),
  total_items INTEGER DEFAULT 0,
  notes TEXT,
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_ck_indents_requesting ON central_kitchen_indents(requesting_outlet_id);
CREATE INDEX idx_ck_indents_ck ON central_kitchen_indents(ck_outlet_id);
CREATE TRIGGER trg_ck_indents_updated BEFORE UPDATE ON central_kitchen_indents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS ck_indent_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  indent_id UUID NOT NULL REFERENCES central_kitchen_indents(id),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  requested_quantity DECIMAL(12,3) NOT NULL,
  approved_quantity DECIMAL(12,3),
  dispatched_quantity DECIMAL(12,3),
  received_quantity DECIMAL(12,3),
  unit VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ck_indent_items_indent ON ck_indent_items(indent_id);

CREATE TABLE IF NOT EXISTS ck_dispatch_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  indent_id UUID NOT NULL REFERENCES central_kitchen_indents(id),
  dispatch_number VARCHAR(30) NOT NULL UNIQUE,
  dispatched_by UUID REFERENCES users(id),
  dispatched_at TIMESTAMPTZ DEFAULT NOW(),
  received_by UUID REFERENCES users(id),
  received_at TIMESTAMPTZ,
  vehicle_number VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);
CREATE INDEX idx_ck_dispatch_indent ON ck_dispatch_notes(indent_id);
CREATE TRIGGER trg_ck_dispatch_updated BEFORE UPDATE ON ck_dispatch_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add FK from orders to customers after customers table exists
ALTER TABLE orders ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id);

-- ============================================
-- SCHEMA COMPLETE
-- ============================================
