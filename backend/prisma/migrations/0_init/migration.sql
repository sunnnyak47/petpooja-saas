-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "head_offices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "legal_name" VARCHAR(200),
    "gstin" VARCHAR(15),
    "pan" VARCHAR(10),
    "contact_email" VARCHAR(150) NOT NULL,
    "contact_phone" VARCHAR(15) NOT NULL,
    "logo_url" VARCHAR(500),
    "primary_color" VARCHAR(10) DEFAULT '#4F46E5',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "setup_completed" BOOLEAN NOT NULL DEFAULT false,
    "plan" VARCHAR(50) NOT NULL DEFAULT 'TRIAL',
    "default_gst_slab" VARCHAR(10) DEFAULT '5',
    "fssai" VARCHAR(20),
    "fssai_expiry" DATE,
    "gst_inclusive" BOOLEAN NOT NULL DEFAULT false,
    "gst_type" VARCHAR(20) DEFAULT 'REGULAR',
    "is_ac" BOOLEAN NOT NULL DEFAULT false,
    "language" VARCHAR(20) DEFAULT 'en',
    "metadata" JSONB DEFAULT '{}',
    "razorpay_key" VARCHAR(100),
    "serves_alcohol" BOOLEAN NOT NULL DEFAULT false,
    "service_charge_pct" DECIMAL(5,2) DEFAULT 0,
    "swiggy_id" VARCHAR(100),
    "tally_enabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp_number" VARCHAR(15),
    "zomato_id" VARCHAR(100),
    "abn" VARCHAR(20),
    "acn" VARCHAR(15),
    "country_code" VARCHAR(2) NOT NULL DEFAULT 'IN',
    "currency" VARCHAR(5) NOT NULL DEFAULT 'INR',
    "region" VARCHAR(5) NOT NULL DEFAULT 'IN',
    "regulations_profile" VARCHAR(20) NOT NULL DEFAULT 'INDIA',
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',

    CONSTRAINT "head_offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "head_office_id" UUID NOT NULL,
    "plan_name" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "billing_cycle" VARCHAR(20) NOT NULL DEFAULT 'monthly',
    "amount" DECIMAL(10,2) NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_payment_at" TIMESTAMPTZ(6),
    "next_billing_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "plan_id" UUID,
    "region" VARCHAR(5) NOT NULL DEFAULT 'IN',
    "currency" VARCHAR(5) NOT NULL DEFAULT 'INR',
    "trial_ends_at" TIMESTAMPTZ(6),
    "grace_until" TIMESTAMPTZ(6),
    "suspended_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "razorpay_customer_id" VARCHAR(64),
    "razorpay_mandate_id" VARCHAR(64),

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "region" VARCHAR(5) NOT NULL DEFAULT 'IN',
    "currency" VARCHAR(5) NOT NULL DEFAULT 'INR',
    "txn_fee_percent" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "flat_fee_per_txn" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "free_txns_monthly" INTEGER NOT NULL DEFAULT 0,
    "base_monthly_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "monthly_min_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "monthly_cap_fee" DECIMAL(10,2),
    "rate_rules" JSONB DEFAULT '{}',
    "tax_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_label" VARCHAR(20) DEFAULT 'GST',
    "max_outlets" INTEGER,
    "max_users" INTEGER,
    "features" JSONB DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_usage_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "head_office_id" UUID NOT NULL,
    "outlet_id" UUID,
    "subscription_id" UUID,
    "event_type" VARCHAR(40) NOT NULL DEFAULT 'order_completed',
    "channel" VARCHAR(30),
    "source_type" VARCHAR(30) NOT NULL,
    "source_id" VARCHAR(64) NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fee_percent" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "flat_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'INR',
    "billing_period" VARCHAR(7) NOT NULL,
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "invoiced" BOOLEAN NOT NULL DEFAULT false,
    "invoice_id" UUID,
    "metadata" JSONB DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_number" VARCHAR(40) NOT NULL,
    "head_office_id" UUID NOT NULL,
    "subscription_id" UUID,
    "billing_period" VARCHAR(7) NOT NULL,
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'INR',
    "txn_count" INTEGER NOT NULL DEFAULT 0,
    "gross_volume" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "issued_at" TIMESTAMPTZ(6),
    "due_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "razorpay_order_id" VARCHAR(64),
    "razorpay_payment_id" VARCHAR(64),
    "payment_link_url" VARCHAR(500),
    "pdf_url" VARCHAR(500),
    "notes" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_invoice_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "channel" VARCHAR(30),
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unit_label" VARCHAR(30),
    "gross_volume" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "head_office_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "type" VARCHAR(30) NOT NULL DEFAULT 'restaurant',
    "address_line1" VARCHAR(255),
    "address_line2" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "pincode" VARCHAR(10),
    "country" VARCHAR(50) NOT NULL DEFAULT 'India',
    "phone" VARCHAR(15),
    "email" VARCHAR(150),
    "gstin" VARCHAR(20),
    "fssai_number" VARCHAR(20),
    "abn" VARCHAR(11),
    "acn" VARCHAR(9),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    "currency" VARCHAR(5) NOT NULL DEFAULT 'INR',
    "is_ac" BOOLEAN NOT NULL DEFAULT false,
    "logo_url" VARCHAR(500),
    "primary_color" VARCHAR(10),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "opening_time" TIME(6),
    "closing_time" TIME(6),
    "owner_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "bill_footer" TEXT,
    "bill_header" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "printer_ip" VARCHAR(50),
    "printer_type" VARCHAR(30) DEFAULT 'THERMAL',
    "tables_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "subtype" VARCHAR(40),
    "gst" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "chart_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "source" VARCHAR(30) NOT NULL,
    "source_id" UUID,
    "reference" VARCHAR(60),
    "memo" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "description" VARCHAR(200),

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" VARCHAR(20) NOT NULL DEFAULT 'bank',
    "paid_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "journal_entry_id" UUID,
    "created_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "bill_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_period_locks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "locked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_by" UUID,
    "note" TEXT,

    CONSTRAINT "accounting_period_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "bsb" VARCHAR(10),
    "account_number" VARCHAR(30),
    "gl_account_code" VARCHAR(10) NOT NULL DEFAULT '091',
    "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "txn_date" DATE NOT NULL,
    "description" VARCHAR(300),
    "amount" DECIMAL(14,2) NOT NULL,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "matched_journal_line_id" UUID,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "pay_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "gross_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paye_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "super_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pay_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pay_run_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "staff_id" UUID,
    "staff_name" VARCHAR(150),
    "gross" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paye" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "super_amt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "category" VARCHAR(60),
    "purchase_date" DATE NOT NULL,
    "cost" DECIMAL(14,2) NOT NULL,
    "salvage_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "useful_life_months" INTEGER NOT NULL DEFAULT 60,
    "method" VARCHAR(20) NOT NULL DEFAULT 'straight_line',
    "accumulated_depreciation" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_disposed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depreciation_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "journal_entry_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "depreciation_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bas_lodgements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "g1" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "a1" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "g11" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "b1" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_gst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "reference" VARCHAR(60),
    "lodged_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "bas_lodgements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "fy_year" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "budget_id" UUID NOT NULL,
    "account_code" VARCHAR(10) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "invoice_number" VARCHAR(40) NOT NULL,
    "customer_id" UUID,
    "customer_name" VARCHAR(150),
    "issue_date" DATE NOT NULL,
    "due_date" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "journal_entry_id" UUID,
    "buyer_gstin" VARCHAR(20),
    "buyer_state" VARCHAR(100),
    "place_of_supply" VARCHAR(50),
    "einvoice_irn" VARCHAR(80),
    "einvoice_ack_no" VARCHAR(40),
    "einvoice_ack_date" TIMESTAMPTZ(6),
    "einvoice_qr" TEXT,
    "einvoice_status" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "customer_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_invoice_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "customer_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "head_office_id" UUID,
    "full_name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(150),
    "phone" VARCHAR(15) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "avatar_url" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(6),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "reset_password_expires" TIMESTAMPTZ(6),
    "reset_password_token" VARCHAR(255),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "outlet_id" UUID,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "setting_key" VARCHAR(100) NOT NULL,
    "setting_value" TEXT NOT NULL,
    "data_type" VARCHAR(20) NOT NULL DEFAULT 'string',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "outlet_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "outlet_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50),
    "entity_id" UUID,
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "icon_url" VARCHAR(500),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "parent_id" UUID,
    "station" VARCHAR(20) NOT NULL DEFAULT 'KITCHEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "short_code" VARCHAR(20),
    "image_url" TEXT,
    "base_price" DECIMAL(10,2) NOT NULL,
    "food_type" VARCHAR(15) NOT NULL DEFAULT 'veg',
    "cuisine" VARCHAR(50),
    "kitchen_station" VARCHAR(30) NOT NULL DEFAULT 'KITCHEN',
    "gst_rate" DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    "hsn_code" VARCHAR(10) NOT NULL DEFAULT '9963',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_bestseller" BOOLEAN NOT NULL DEFAULT false,
    "is_new" BOOLEAN NOT NULL DEFAULT false,
    "is_spicy" BOOLEAN NOT NULL DEFAULT false,
    "is_recommended" BOOLEAN NOT NULL DEFAULT false,
    "allergen_info" TEXT,
    "preparation_time_min" INTEGER NOT NULL DEFAULT 15,
    "calories" INTEGER,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "external_id" VARCHAR(100),

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "menu_item_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "price_addition" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "external_id" VARCHAR(100),

    CONSTRAINT "item_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addon_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "min_selection" INTEGER NOT NULL DEFAULT 0,
    "max_selection" INTEGER NOT NULL DEFAULT 5,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "addon_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_addons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "addon_group_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "external_id" VARCHAR(100),

    CONSTRAINT "item_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_combo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "combo_price" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "item_combo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combo_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "combo_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "combo_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "menu_item_id" UUID NOT NULL,
    "day_of_week" INTEGER,
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "menu_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_menu_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "override_price" DECIMAL(10,2),
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "outlet_menu_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_areas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "color" VARCHAR(30) NOT NULL DEFAULT '#1e293b',
    "pos_x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pos_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 400,
    "height" INTEGER NOT NULL DEFAULT 300,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "table_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tables" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "area_id" UUID,
    "table_number" VARCHAR(20) NOT NULL,
    "seating_capacity" INTEGER NOT NULL DEFAULT 4,
    "status" VARCHAR(20) NOT NULL DEFAULT 'available',
    "current_order_id" UUID,
    "auto_free_at" TIMESTAMPTZ(6),
    "cleaning_started_at" TIMESTAMPTZ(6),
    "reminder_count" INTEGER NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "pos_x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pos_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 80,
    "height" INTEGER NOT NULL DEFAULT 80,
    "shape" VARCHAR(20) NOT NULL DEFAULT 'square',
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "order_number" VARCHAR(30) NOT NULL,
    "order_type" VARCHAR(20) NOT NULL DEFAULT 'dine_in',
    "status" VARCHAR(25) NOT NULL DEFAULT 'created',
    "table_id" UUID,
    "customer_id" UUID,
    "staff_id" UUID,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_type" VARCHAR(15),
    "discount_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_reason" TEXT,
    "coupon_code" VARCHAR(50),
    "loyalty_points_used" INTEGER NOT NULL DEFAULT 0,
    "loyalty_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxable_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "round_off" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "source" VARCHAR(20) NOT NULL DEFAULT 'pos',
    "aggregator" VARCHAR(20),
    "aggregator_order_id" VARCHAR(100),
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "void_reason" TEXT,
    "voided_by" UUID,
    "customer_name" VARCHAR(150),
    "customer_phone" VARCHAR(15),
    "delivery_address" TEXT,
    "invoice_number" VARCHAR(50),
    "invoice_url" VARCHAR(500),
    "daily_sequence" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "variant_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "variant_name" VARCHAR(100),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "variant_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "addons_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "item_total" DECIMAL(10,2) NOT NULL,
    "gst_rate" DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    "item_tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "is_kot_sent" BOOLEAN NOT NULL DEFAULT false,
    "kot_id" UUID,
    "kitchen_station" VARCHAR(30) NOT NULL DEFAULT 'KITCHEN',
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_addons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_item_id" UUID NOT NULL,
    "addon_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "from_status" VARCHAR(25),
    "to_status" VARCHAR(25) NOT NULL,
    "changed_by" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "kot_number" VARCHAR(20) NOT NULL,
    "station" VARCHAR(30) NOT NULL DEFAULT 'KITCHEN',
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "items_count" INTEGER NOT NULL DEFAULT 0,
    "printed_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "kot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kot_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kot_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "ready_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "kot_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "customer_name" VARCHAR(150),
    "customer_phone" VARCHAR(15),
    "party_size" INTEGER NOT NULL DEFAULT 2,
    "reservation_date" DATE NOT NULL,
    "reservation_time" TIME(6) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 90,
    "status" VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "table_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "sku" VARCHAR(50),
    "category" VARCHAR(50),
    "unit" VARCHAR(20) NOT NULL DEFAULT 'kg',
    "cost_per_unit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "min_threshold" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "max_threshold" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "auto_order_enabled" BOOLEAN NOT NULL DEFAULT false,
    "preferred_supplier_id" UUID,
    "reorder_qty" DECIMAL(10,2),

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_stock" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "current_stock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "last_updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "inventory_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "transaction_type" VARCHAR(20) NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_cost" DECIMAL(10,2),
    "reference_type" VARCHAR(30),
    "reference_id" UUID,
    "reason" TEXT,
    "performed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wastage_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "logged_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "wastage_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contact_person" VARCHAR(150),
    "phone" VARCHAR(15),
    "email" VARCHAR(150),
    "address" TEXT,
    "gstin" VARCHAR(20),
    "abn" VARCHAR(11),
    "pan" VARCHAR(12),
    "payment_terms" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "supplier_id" UUID,
    "po_number" VARCHAR(30) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "terms" TEXT,
    "reference_number" VARCHAR(50),
    "expected_date" DATE,
    "delivery_date" DATE,
    "pdf_path" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchase_order_id" UUID NOT NULL,
    "inventory_item_id" UUID,
    "item_name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(50),
    "ordered_quantity" DECIMAL(12,3) NOT NULL,
    "unit" VARCHAR(20) NOT NULL DEFAULT 'kg',
    "unit_cost" DECIMAL(10,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "received_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "hsn_code" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "po_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_presets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "default_quantity" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "unit" VARCHAR(20) NOT NULL DEFAULT 'kg',
    "default_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sku" VARCHAR(50),
    "hsn_code" VARCHAR(20),
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "preferred_supplier_id" UUID,
    "notes" TEXT,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_send_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "po_id" UUID,
    "phone" VARCHAR(20) NOT NULL,
    "message" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'sent',
    "wa_message_id" VARCHAR(100),
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_send_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_received_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "grn_number" VARCHAR(30) NOT NULL,
    "received_by" UUID,
    "received_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "goods_received_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grn_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "grn_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "po_item_id" UUID,
    "received_quantity" DECIMAL(12,3) NOT NULL,
    "unit_cost" DECIMAL(10,2),
    "quality_status" VARCHAR(20) NOT NULL DEFAULT 'accepted',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grn_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "menu_item_id" UUID NOT NULL,
    "name" VARCHAR(200),
    "yield_quantity" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "yield_unit" VARCHAR(20) NOT NULL DEFAULT 'pcs',
    "instructions" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipe_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" VARCHAR(15) NOT NULL,
    "full_name" VARCHAR(150),
    "email" VARCHAR(150),
    "date_of_birth" DATE,
    "anniversary" DATE,
    "gender" VARCHAR(10),
    "dietary_preference" VARCHAR(20),
    "allergens" TEXT,
    "total_visits" INTEGER NOT NULL DEFAULT 0,
    "total_spend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "avg_order_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "last_visit_at" TIMESTAMPTZ(6),
    "segment" VARCHAR(20) NOT NULL DEFAULT 'new',
    "notes" TEXT,
    "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
    "consent_at" TIMESTAMPTZ(6),
    "consent_source" VARCHAR(50),
    "anonymised_at" TIMESTAMPTZ(6),
    "head_office_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "label" VARCHAR(50) NOT NULL DEFAULT 'home',
    "address_line1" VARCHAR(255) NOT NULL,
    "address_line2" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "pincode" VARCHAR(10),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_points" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "total_earned" INTEGER NOT NULL DEFAULT 0,
    "total_redeemed" INTEGER NOT NULL DEFAULT 0,
    "current_balance" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "loyalty_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "order_id" UUID,
    "type" VARCHAR(10) NOT NULL,
    "points" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "description" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'sms',
    "target_segment" VARCHAR(20),
    "message_template" TEXT NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'sent',
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "employee_code" VARCHAR(20),
    "department" VARCHAR(50),
    "designation" VARCHAR(100),
    "manager_pin" VARCHAR(10),
    "employment_type" VARCHAR(20),
    "contract_end_date" DATE,
    "join_date" DATE,
    "end_date" DATE,
    "hourly_rate" DECIMAL(8,2),
    "monthly_salary" DECIMAL(10,2),
    "photo_url" VARCHAR(500),
    "date_of_birth" DATE,
    "gender" VARCHAR(20),
    "nationality" VARCHAR(60),
    "address" VARCHAR(500),
    "blood_group" VARCHAR(5),
    "emergency_contact" VARCHAR(15),
    "emergency_contact_name" VARCHAR(100),
    "emergency_relationship" VARCHAR(50),
    "bank_bsb" VARCHAR(10),
    "bank_account" VARCHAR(20),
    "bank_account_name" VARCHAR(100),
    "tax_file_number" VARCHAR(20),
    "superannuation_fund" VARCHAR(100),
    "super_member_number" VARCHAR(50),
    "right_to_work_checked" BOOLEAN DEFAULT false,
    "visa_type" VARCHAR(50),
    "visa_expiry" DATE,
    "induction_completed" BOOLEAN DEFAULT false,
    "induction_date" DATE,
    "wwcc_number" VARCHAR(50),
    "wwcc_expiry" DATE,
    "rsa_number" VARCHAR(50),
    "rsa_expiry" DATE,
    "food_safety_cert" VARCHAR(50),
    "food_safety_expiry" DATE,
    "police_check_date" DATE,
    "police_check_expiry" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_shifts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "staff_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "shift_id" UUID,
    "clock_in" TIMESTAMPTZ(6) NOT NULL,
    "clock_out" TIMESTAMPTZ(6),
    "clock_in_lat" DECIMAL(10,7),
    "clock_in_lng" DECIMAL(10,7),
    "clock_out_lat" DECIMAL(10,7),
    "clock_out_lng" DECIMAL(10,7),
    "hours_worked" DECIMAL(5,2),
    "is_overtime" BOOLEAN NOT NULL DEFAULT false,
    "overtime_hours" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "attendance_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "permission_key" VARCHAR(100) NOT NULL,
    "is_granted" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "staff_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "working_days" INTEGER NOT NULL DEFAULT 0,
    "present_days" INTEGER NOT NULL DEFAULT 0,
    "absent_days" INTEGER NOT NULL DEFAULT 0,
    "total_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "overtime_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "basic_salary" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "overtime_pay" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "net_salary" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "salary_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_otps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "otp" VARCHAR(6) NOT NULL,
    "action" VARCHAR(10) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "method" VARCHAR(30) NOT NULL,
    "display_name" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "method" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "transaction_id" VARCHAR(100),
    "gateway_response" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "refund_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refund_id" VARCHAR(100),
    "refund_reason" TEXT,
    "processed_by" UUID,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "order_id" UUID,
    "payment_id" UUID,
    "provider" VARCHAR(20) NOT NULL DEFAULT 'tyro',
    "our_ref" VARCHAR(64) NOT NULL,
    "mid" VARCHAR(32),
    "tid" VARCHAR(16),
    "type" VARCHAR(20) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "cashout_cents" INTEGER NOT NULL DEFAULT 0,
    "base_amount_cents" INTEGER,
    "tip_cents" INTEGER NOT NULL DEFAULT 0,
    "surcharge_cents" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "tyro_reference" VARCHAR(100),
    "authorisation_code" VARCHAR(20),
    "card_type" VARCHAR(20),
    "elided_pan" VARCHAR(30),
    "rrn" VARCHAR(40),
    "raw_response" JSONB,
    "merchant_receipt" TEXT,
    "customer_receipt" TEXT,
    "signature_required" BOOLEAN NOT NULL DEFAULT false,
    "error_code" VARCHAR(40),
    "error_message" TEXT,
    "initiated_by" UUID,
    "initiated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terminal_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_splits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "method" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "transaction_id" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL DEFAULT 'success',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "type" VARCHAR(10) NOT NULL DEFAULT 'gst',
    "is_inclusive" BOOLEAN NOT NULL DEFAULT false,
    "apply_on" VARCHAR(20) NOT NULL DEFAULT 'all',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tax_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "financial_year" VARCHAR(10) NOT NULL,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "prefix" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports_cache" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "report_name" VARCHAR(100) NOT NULL,
    "params_hash" VARCHAR(64) NOT NULL,
    "data" JSONB NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "summary_date" DATE NOT NULL,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "total_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "dine_in_orders" INTEGER NOT NULL DEFAULT 0,
    "takeaway_orders" INTEGER NOT NULL DEFAULT 0,
    "delivery_orders" INTEGER NOT NULL DEFAULT 0,
    "online_orders" INTEGER NOT NULL DEFAULT 0,
    "cash_collected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "card_collected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "upi_collected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other_collected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "covers" INTEGER NOT NULL DEFAULT 0,
    "avg_order_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "void_count" INTEGER NOT NULL DEFAULT 0,
    "void_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "refund_count" INTEGER NOT NULL DEFAULT 0,
    "refund_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "daily_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eod_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "report_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "total_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "void_count" INTEGER NOT NULL DEFAULT 0,
    "void_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refund_count" INTEGER NOT NULL DEFAULT 0,
    "refund_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dine_in_orders" INTEGER NOT NULL DEFAULT 0,
    "dine_in_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "takeaway_orders" INTEGER NOT NULL DEFAULT 0,
    "takeaway_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "delivery_orders" INTEGER NOT NULL DEFAULT 0,
    "delivery_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "online_orders" INTEGER NOT NULL DEFAULT 0,
    "online_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cash_system" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "card_system" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "upi_system" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other_system" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "opening_cash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "denomination_count" JSONB,
    "cash_actual" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cash_difference" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "top_items" JSONB,
    "discrepancy_reason" TEXT,
    "notes" TEXT,
    "closed_by" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eod_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "owner_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "outlet_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "franchise_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "franchise_fee_type" VARCHAR(20) NOT NULL DEFAULT 'percentage',
    "franchise_fee_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "calculate_on" VARCHAR(10) NOT NULL DEFAULT 'gross',
    "billing_cycle" VARCHAR(10) NOT NULL DEFAULT 'monthly',
    "contract_start" DATE,
    "contract_end" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "franchise_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "central_kitchen_indents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requesting_outlet_id" UUID NOT NULL,
    "ck_outlet_id" UUID NOT NULL,
    "indent_number" VARCHAR(30) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "requested_by" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "central_kitchen_indents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "central_kitchen_indent_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "indent_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "requested_quantity" DECIMAL(10,3) NOT NULL,
    "approved_quantity" DECIMAL(10,3),
    "dispatched_quantity" DECIMAL(10,3),
    "unit" VARCHAR(20) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "central_kitchen_indent_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "pos_method" VARCHAR(50) NOT NULL,
    "tally_ledger_name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tally_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "type" VARCHAR(20) NOT NULL,
    "value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "min_order_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "max_discount" DECIMAL(10,2),
    "applicable_on" VARCHAR(20) NOT NULL DEFAULT 'all',
    "applicable_ids" JSONB NOT NULL DEFAULT '[]',
    "channels" JSONB NOT NULL DEFAULT '["pos", "online"]',
    "start_date" TIMESTAMPTZ(6),
    "end_date" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "auto_apply" BOOLEAN NOT NULL DEFAULT false,
    "max_uses" INTEGER,
    "max_uses_per_customer" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_usages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "discount_id" UUID NOT NULL,
    "order_id" UUID,
    "customer_id" UUID,
    "amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ondc_seller_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "rejection_reason" TEXT,
    "store_name" VARCHAR(200),
    "store_description" TEXT,
    "store_category" VARCHAR(100),
    "cuisine_types" TEXT,
    "logo_url" VARCHAR(500),
    "fssai_number" VARCHAR(20),
    "fssai_expiry" DATE,
    "gstin" VARCHAR(15),
    "pan" VARCHAR(10),
    "bank_account_name" VARCHAR(150),
    "bank_account_number" VARCHAR(30),
    "bank_ifsc" VARCHAR(15),
    "bank_name" VARCHAR(100),
    "service_radius_km" DECIMAL(5,2),
    "min_order_value" DECIMAL(10,2) DEFAULT 0,
    "delivery_enabled" BOOLEAN NOT NULL DEFAULT true,
    "pickup_enabled" BOOLEAN NOT NULL DEFAULT true,
    "operating_hours" JSONB DEFAULT '{}',
    "bpp_id" VARCHAR(200),
    "provider_id" VARCHAR(200),
    "subscriber_id" VARCHAR(200),
    "tnc_accepted" BOOLEAN NOT NULL DEFAULT false,
    "tnc_accepted_at" TIMESTAMPTZ(6),
    "auto_accept" BOOLEAN NOT NULL DEFAULT false,
    "prep_time_minutes" INTEGER NOT NULL DEFAULT 30,
    "submitted_at" TIMESTAMPTZ(6),
    "verified_at" TIMESTAMPTZ(6),
    "went_live_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ondc_seller_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ondc_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "seller_profile_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "ondc_order_id" VARCHAR(200) NOT NULL,
    "bap_id" VARCHAR(200),
    "bap_uri" VARCHAR(500),
    "transaction_id" VARCHAR(200),
    "message_id" VARCHAR(200),
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "customer_name" VARCHAR(150),
    "customer_phone" VARCHAR(15),
    "delivery_address" TEXT,
    "delivery_lat" DECIMAL(10,7),
    "delivery_lng" DECIMAL(10,7),
    "items_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxes" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payment_method" VARCHAR(30),
    "payment_status" VARCHAR(30),
    "items" JSONB NOT NULL DEFAULT '[]',
    "accepted_at" TIMESTAMPTZ(6),
    "rejected_at" TIMESTAMPTZ(6),
    "rejection_reason" VARCHAR(300),
    "prep_time_minutes" INTEGER,
    "ready_at" TIMESTAMPTZ(6),
    "picked_up_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "raw_payload" JSONB,
    "internal_order_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ondc_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 10,
    "trigger_type" VARCHAR(30) NOT NULL,
    "time_start" VARCHAR(5),
    "time_end" VARCHAR(5),
    "days_of_week" JSONB DEFAULT '[]',
    "weather_trigger" VARCHAR(20),
    "season_trigger" VARCHAR(20),
    "item_target" VARCHAR(20) NOT NULL DEFAULT 'all',
    "target_ids" JSONB DEFAULT '[]',
    "target_tag" VARCHAR(50),
    "action_type" VARCHAR(20) NOT NULL,
    "action_value" DECIMAL(6,2) NOT NULL,
    "action_unit" VARCHAR(10) NOT NULL DEFAULT 'percent',
    "max_discount_amt" DECIMAL(10,2),
    "min_order_value" DECIMAL(10,2),
    "valid_from" TIMESTAMPTZ(6),
    "valid_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rule_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rule_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "original_price" DECIMAL(10,2) NOT NULL,
    "applied_price" DECIMAL(10,2) NOT NULL,
    "saving" DECIMAL(10,2) NOT NULL,
    "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_rule_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "festival_modes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "festival_key" VARCHAR(50) NOT NULL,
    "festival_name" VARCHAR(100) NOT NULL,
    "country" VARCHAR(5) NOT NULL DEFAULT 'IN',
    "region" VARCHAR(80),
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "special_mode" VARCHAR(50),
    "theme" JSONB,
    "menu_suggestions" JSONB,
    "offer_structure" JSONB,
    "custom_banner" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "festival_modes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "staff_id" UUID,
    "alert_type" VARCHAR(60) NOT NULL,
    "severity" VARCHAR(10) NOT NULL DEFAULT 'medium',
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB,
    "risk_score" INTEGER NOT NULL DEFAULT 50,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "is_dismissed" BOOLEAN NOT NULL DEFAULT false,
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_note" TEXT,
    "wa_notified" BOOLEAN NOT NULL DEFAULT false,
    "wa_notified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fraud_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "region" VARCHAR(5) NOT NULL,
    "description" TEXT,
    "categories" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rosters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "roster_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "shift_id" UUID,
    "date" DATE NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "role_label" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'assigned',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roster_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_availability" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "staff_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_certifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "staff_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "cert_type" VARCHAR(100) NOT NULL,
    "provider" VARCHAR(200),
    "issue_date" DATE NOT NULL,
    "expiry_date" DATE NOT NULL,
    "cert_number" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aggregator_sync_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "platform" VARCHAR(30) NOT NULL,
    "sync_type" VARCHAR(30) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'success',
    "items_synced" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "payload" JSONB,
    "response" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aggregator_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_cache" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "cache_key" VARCHAR(200) NOT NULL,
    "data" JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "org_name" VARCHAR(200) NOT NULL,
    "abn" VARCHAR(20),
    "address" TEXT,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'AUD',
    "country_code" VARCHAR(5) NOT NULL DEFAULT 'AU',
    "timezone" VARCHAR(50),
    "is_connected" BOOLEAN NOT NULL DEFAULT true,
    "last_synced" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "xero_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xero_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "transaction_ref" VARCHAR(30) NOT NULL,
    "date" DATE NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "reference" VARCHAR(50),
    "account_code" VARCHAR(10) NOT NULL,
    "account_name" VARCHAR(200) NOT NULL,
    "account_type" VARCHAR(30) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "contact" VARCHAR(200),
    "amount_incl_gst" DECIMAL(12,2) NOT NULL,
    "gst" DECIMAL(12,2) NOT NULL,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'AUD',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xero_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_bank_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "account_name" VARCHAR(200) NOT NULL,
    "account_number" VARCHAR(20) NOT NULL,
    "bsb" VARCHAR(10),
    "opening_balance" DECIMAL(12,2) NOT NULL,
    "opening_date" DATE NOT NULL,
    "current_balance" DECIMAL(12,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xero_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_balance_sheet_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "as_at_date" DATE NOT NULL,
    "account_code" VARCHAR(10) NOT NULL,
    "account_name" VARCHAR(200) NOT NULL,
    "account_type" VARCHAR(30) NOT NULL,
    "sub_type" VARCHAR(30) NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xero_balance_sheet_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "invoice_number" VARCHAR(30) NOT NULL,
    "contact" VARCHAR(200) NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL,
    "amount_due" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'AUD',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xero_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_bas_returns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "quarter" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "gst_collected" DECIMAL(12,2) NOT NULL,
    "gst_paid" DECIMAL(12,2) NOT NULL,
    "net_gst" DECIMAL(12,2) NOT NULL,
    "payg_withheld" DECIMAL(12,2) NOT NULL,
    "total_payable" DECIMAL(12,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "lodged_date" DATE,
    "due_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xero_bas_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contact_type" VARCHAR(20) NOT NULL,
    "abn" VARCHAR(20),
    "email" VARCHAR(200),
    "phone" VARCHAR(30),
    "address" TEXT,
    "city" VARCHAR(100),
    "state" VARCHAR(10),
    "postcode" VARCHAR(10),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "total_spend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transaction_count" INTEGER NOT NULL DEFAULT 0,
    "first_transaction" DATE,
    "last_transaction" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xero_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_tracking_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xero_tracking_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_tracking_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xero_tracking_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_tracking_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "revenue" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,
    "transaction_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xero_tracking_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500),
    "amount" DECIMAL(12,2) NOT NULL,
    "category" VARCHAR(50) NOT NULL DEFAULT 'Misc',
    "expense_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_method" VARCHAR(30) NOT NULL DEFAULT 'Cash',
    "notes" TEXT,
    "created_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_daily_counters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outlet_daily_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" VARCHAR(10) NOT NULL DEFAULT 'backend',
    "level" VARCHAR(10) NOT NULL DEFAULT 'error',
    "message" TEXT NOT NULL,
    "name" VARCHAR(160),
    "stack" TEXT,
    "status_code" INTEGER,
    "method" VARCHAR(10),
    "path" VARCHAR(500),
    "request_id" VARCHAR(100),
    "user_id" UUID,
    "head_office_id" UUID,
    "outlet_id" UUID,
    "user_agent" TEXT,
    "url" VARCHAR(1000),
    "fingerprint" VARCHAR(64),
    "count" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "order_id" UUID,
    "credit_note_no" VARCHAR(40) NOT NULL,
    "status" VARCHAR(15) NOT NULL DEFAULT 'issued',
    "reason" TEXT,
    "customer_name" VARCHAR(150),
    "customer_phone" VARCHAR(15),
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'INR',
    "linked_payment_id" UUID,
    "notes" TEXT,
    "issued_by" UUID,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "credit_note_id" UUID NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "credit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "reference" VARCHAR(100),
    "settlement_date" DATE NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'INR',
    "gross_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fees" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_on_fees" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(15) NOT NULL DEFAULT 'open',
    "matched_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "variance_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_count" INTEGER NOT NULL DEFAULT 0,
    "matched_count" INTEGER NOT NULL DEFAULT 0,
    "unmatched_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "imported_by" UUID,
    "reconciled_by" UUID,
    "reconciled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "settlement_id" UUID NOT NULL,
    "transaction_id" VARCHAR(100),
    "order_ref" VARCHAR(100),
    "type" VARCHAR(15) NOT NULL DEFAULT 'payment',
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "match_status" VARCHAR(15) NOT NULL DEFAULT 'unmatched',
    "matched_payment_id" UUID,
    "variance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "raw" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "settlement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_dispatches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "order_id" UUID,
    "provider" VARCHAR(20) NOT NULL,
    "external_id" VARCHAR(100),
    "quote_id" VARCHAR(100),
    "status" VARCHAR(25) NOT NULL DEFAULT 'created',
    "fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'AUD',
    "pickup_name" VARCHAR(150),
    "pickup_address" TEXT,
    "dropoff_name" VARCHAR(150),
    "dropoff_phone" VARCHAR(20),
    "dropoff_address" TEXT,
    "tracking_url" VARCHAR(500),
    "courier_name" VARCHAR(120),
    "courier_phone" VARCHAR(20),
    "eta" TIMESTAMPTZ(6),
    "raw" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "delivery_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "restaurant" VARCHAR(200),
    "email" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(30),
    "region" VARCHAR(20),
    "outlets" VARCHAR(20),
    "current_system" VARCHAR(100),
    "message" TEXT,
    "source" VARCHAR(30) NOT NULL DEFAULT 'website',
    "status" VARCHAR(20) NOT NULL DEFAULT 'new',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_message" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "user_name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "staff_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID,
    "head_office_id" UUID,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "file_url" TEXT NOT NULL,
    "file_type" TEXT,
    "file_size" INTEGER,
    "expires_at" TIMESTAMPTZ(6),
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "head_offices_contact_email_key" ON "head_offices"("contact_email");

-- CreateIndex
CREATE INDEX "subscriptions_head_office_id_idx" ON "subscriptions"("head_office_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_plans_code_key" ON "billing_plans"("code");

-- CreateIndex
CREATE INDEX "billing_plans_region_idx" ON "billing_plans"("region");

-- CreateIndex
CREATE INDEX "billing_usage_events_head_office_id_billing_period_idx" ON "billing_usage_events"("head_office_id", "billing_period");

-- CreateIndex
CREATE INDEX "billing_usage_events_subscription_id_billing_period_idx" ON "billing_usage_events"("subscription_id", "billing_period");

-- CreateIndex
CREATE INDEX "billing_usage_events_invoiced_idx" ON "billing_usage_events"("invoiced");

-- CreateIndex
CREATE UNIQUE INDEX "billing_usage_events_source_type_source_id_event_type_key" ON "billing_usage_events"("source_type", "source_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_invoice_number_key" ON "subscription_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "subscription_invoices_status_idx" ON "subscription_invoices"("status");

-- CreateIndex
CREATE INDEX "subscription_invoices_head_office_id_idx" ON "subscription_invoices"("head_office_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_head_office_id_billing_period_key" ON "subscription_invoices"("head_office_id", "billing_period");

-- CreateIndex
CREATE INDEX "subscription_invoice_lines_invoice_id_idx" ON "subscription_invoice_lines"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "outlets_code_key" ON "outlets"("code");

-- CreateIndex
CREATE INDEX "chart_accounts_outlet_id_type_idx" ON "chart_accounts"("outlet_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "chart_accounts_outlet_id_code_key" ON "chart_accounts"("outlet_id", "code");

-- CreateIndex
CREATE INDEX "journal_entries_outlet_id_entry_date_idx" ON "journal_entries"("outlet_id", "entry_date");

-- CreateIndex
CREATE INDEX "journal_entries_source_source_id_idx" ON "journal_entries"("source", "source_id");

-- CreateIndex
CREATE INDEX "journal_lines_entry_id_idx" ON "journal_lines"("entry_id");

-- CreateIndex
CREATE INDEX "journal_lines_account_id_idx" ON "journal_lines"("account_id");

-- CreateIndex
CREATE INDEX "bill_payments_outlet_id_purchase_order_id_idx" ON "bill_payments"("outlet_id", "purchase_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_period_locks_outlet_id_period_key" ON "accounting_period_locks"("outlet_id", "period");

-- CreateIndex
CREATE INDEX "bank_accounts_outlet_id_idx" ON "bank_accounts"("outlet_id");

-- CreateIndex
CREATE INDEX "bank_statement_lines_outlet_id_bank_account_id_idx" ON "bank_statement_lines"("outlet_id", "bank_account_id");

-- CreateIndex
CREATE INDEX "bank_statement_lines_bank_account_id_reconciled_idx" ON "bank_statement_lines"("bank_account_id", "reconciled");

-- CreateIndex
CREATE INDEX "pay_runs_outlet_id_period_start_idx" ON "pay_runs"("outlet_id", "period_start");

-- CreateIndex
CREATE INDEX "payslips_pay_run_id_idx" ON "payslips"("pay_run_id");

-- CreateIndex
CREATE INDEX "fixed_assets_outlet_id_idx" ON "fixed_assets"("outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "depreciation_entries_asset_id_period_key" ON "depreciation_entries"("asset_id", "period");

-- CreateIndex
CREATE INDEX "bas_lodgements_outlet_id_period_start_idx" ON "bas_lodgements"("outlet_id", "period_start");

-- CreateIndex
CREATE INDEX "budgets_outlet_id_idx" ON "budgets"("outlet_id");

-- CreateIndex
CREATE INDEX "budget_lines_budget_id_idx" ON "budget_lines"("budget_id");

-- CreateIndex
CREATE INDEX "customer_invoices_outlet_id_status_idx" ON "customer_invoices"("outlet_id", "status");

-- CreateIndex
CREATE INDEX "customer_invoice_lines_invoice_id_idx" ON "customer_invoice_lines"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_reset_password_token_key" ON "users"("reset_password_token");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_outlet_id_key" ON "user_roles"("user_id", "role_id", "outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_settings_outlet_id_setting_key_key" ON "outlet_settings"("outlet_id", "setting_key");

-- CreateIndex
CREATE INDEX "audit_log_outlet_id_idx" ON "audit_log"("outlet_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_user_id_idx" ON "audit_log"("user_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "menu_items_outlet_id_is_available_idx" ON "menu_items"("outlet_id", "is_available");

-- CreateIndex
CREATE INDEX "menu_items_category_id_idx" ON "menu_items"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_menu_overrides_outlet_id_menu_item_id_key" ON "outlet_menu_overrides"("outlet_id", "menu_item_id");

-- CreateIndex
CREATE INDEX "tables_outlet_id_status_idx" ON "tables"("outlet_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tables_outlet_id_table_number_key" ON "tables"("outlet_id", "table_number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_outlet_id_status_idx" ON "orders"("outlet_id", "status");

-- CreateIndex
CREATE INDEX "orders_outlet_id_created_at_idx" ON "orders"("outlet_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_outlet_id_is_paid_idx" ON "orders"("outlet_id", "is_paid");

-- CreateIndex
CREATE INDEX "orders_table_id_idx" ON "orders"("table_id");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_menu_item_id_idx" ON "order_items"("menu_item_id");

-- CreateIndex
CREATE INDEX "order_items_kot_id_idx" ON "order_items"("kot_id");

-- CreateIndex
CREATE INDEX "kot_outlet_id_status_idx" ON "kot"("outlet_id", "status");

-- CreateIndex
CREATE INDEX "kot_order_id_idx" ON "kot"("order_id");

-- CreateIndex
CREATE INDEX "kot_items_kot_id_idx" ON "kot_items"("kot_id");

-- CreateIndex
CREATE INDEX "kot_items_order_item_id_idx" ON "kot_items"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_stock_outlet_id_inventory_item_id_key" ON "inventory_stock"("outlet_id", "inventory_item_id");

-- CreateIndex
CREATE INDEX "stock_transactions_outlet_id_created_at_idx" ON "stock_transactions"("outlet_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_transactions_reference_type_reference_id_idx" ON "stock_transactions"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "stock_transactions_inventory_item_id_idx" ON "stock_transactions"("inventory_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_po_number_key" ON "purchase_orders"("po_number");

-- CreateIndex
CREATE INDEX "purchase_orders_outlet_id_status_idx" ON "purchase_orders"("outlet_id", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_outlet_id_created_at_idx" ON "purchase_orders"("outlet_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "item_presets_outlet_id_category_idx" ON "item_presets"("outlet_id", "category");

-- CreateIndex
CREATE INDEX "item_presets_outlet_id_use_count_idx" ON "item_presets"("outlet_id", "use_count" DESC);

-- CreateIndex
CREATE INDEX "whatsapp_send_logs_outlet_id_created_at_idx" ON "whatsapp_send_logs"("outlet_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "goods_received_notes_grn_number_key" ON "goods_received_notes"("grn_number");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_menu_item_id_key" ON "recipes"("menu_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "customers_head_office_id_idx" ON "customers"("head_office_id");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_points_customer_id_key" ON "loyalty_points"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_user_id_outlet_id_key" ON "staff_profiles"("user_id", "outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_permissions_user_id_outlet_id_permission_key_key" ON "staff_permissions"("user_id", "outlet_id", "permission_key");

-- CreateIndex
CREATE UNIQUE INDEX "salary_records_user_id_outlet_id_month_year_key" ON "salary_records"("user_id", "outlet_id", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_outlet_id_method_key" ON "payment_methods"("outlet_id", "method");

-- CreateIndex
CREATE INDEX "payments_outlet_id_created_at_idx" ON "payments"("outlet_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "terminal_transactions_outlet_id_initiated_at_idx" ON "terminal_transactions"("outlet_id", "initiated_at" DESC);

-- CreateIndex
CREATE INDEX "terminal_transactions_order_id_idx" ON "terminal_transactions"("order_id");

-- CreateIndex
CREATE INDEX "terminal_transactions_tyro_reference_idx" ON "terminal_transactions"("tyro_reference");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_transactions_outlet_id_our_ref_key" ON "terminal_transactions"("outlet_id", "our_ref");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_sequences_outlet_id_financial_year_key" ON "invoice_sequences"("outlet_id", "financial_year");

-- CreateIndex
CREATE UNIQUE INDEX "reports_cache_outlet_id_report_name_params_hash_key" ON "reports_cache"("outlet_id", "report_name", "params_hash");

-- CreateIndex
CREATE UNIQUE INDEX "daily_summaries_outlet_id_summary_date_key" ON "daily_summaries"("outlet_id", "summary_date");

-- CreateIndex
CREATE INDEX "eod_reports_outlet_id_report_date_idx" ON "eod_reports"("outlet_id", "report_date");

-- CreateIndex
CREATE UNIQUE INDEX "eod_reports_outlet_id_report_date_key" ON "eod_reports"("outlet_id", "report_date");

-- CreateIndex
CREATE UNIQUE INDEX "central_kitchen_indents_indent_number_key" ON "central_kitchen_indents"("indent_number");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key");

-- CreateIndex
CREATE UNIQUE INDEX "tally_mappings_outlet_id_pos_method_key" ON "tally_mappings"("outlet_id", "pos_method");

-- CreateIndex
CREATE INDEX "discounts_outlet_id_idx" ON "discounts"("outlet_id");

-- CreateIndex
CREATE INDEX "discounts_code_idx" ON "discounts"("code");

-- CreateIndex
CREATE INDEX "discount_usages_discount_id_idx" ON "discount_usages"("discount_id");

-- CreateIndex
CREATE UNIQUE INDEX "ondc_seller_profiles_outlet_id_key" ON "ondc_seller_profiles"("outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "ondc_orders_ondc_order_id_key" ON "ondc_orders"("ondc_order_id");

-- CreateIndex
CREATE INDEX "ondc_orders_outlet_id_idx" ON "ondc_orders"("outlet_id");

-- CreateIndex
CREATE INDEX "ondc_orders_status_idx" ON "ondc_orders"("status");

-- CreateIndex
CREATE INDEX "pricing_rules_outlet_id_is_active_idx" ON "pricing_rules"("outlet_id", "is_active");

-- CreateIndex
CREATE INDEX "pricing_rule_applications_rule_id_idx" ON "pricing_rule_applications"("rule_id");

-- CreateIndex
CREATE INDEX "pricing_rule_applications_outlet_id_idx" ON "pricing_rule_applications"("outlet_id");

-- CreateIndex
CREATE INDEX "festival_modes_outlet_id_idx" ON "festival_modes"("outlet_id");

-- CreateIndex
CREATE INDEX "festival_modes_festival_key_idx" ON "festival_modes"("festival_key");

-- CreateIndex
CREATE INDEX "fraud_alerts_outlet_id_created_at_idx" ON "fraud_alerts"("outlet_id", "created_at");

-- CreateIndex
CREATE INDEX "fraud_alerts_staff_id_idx" ON "fraud_alerts"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_templates_name_region_key" ON "menu_templates"("name", "region");

-- CreateIndex
CREATE INDEX "rosters_outlet_id_start_date_idx" ON "rosters"("outlet_id", "start_date");

-- CreateIndex
CREATE INDEX "roster_assignments_roster_id_date_idx" ON "roster_assignments"("roster_id", "date");

-- CreateIndex
CREATE INDEX "roster_assignments_staff_id_date_idx" ON "roster_assignments"("staff_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "staff_availability_staff_id_day_of_week_key" ON "staff_availability"("staff_id", "day_of_week");

-- CreateIndex
CREATE INDEX "staff_certifications_staff_id_expiry_date_idx" ON "staff_certifications"("staff_id", "expiry_date");

-- CreateIndex
CREATE INDEX "staff_certifications_outlet_id_idx" ON "staff_certifications"("outlet_id");

-- CreateIndex
CREATE INDEX "aggregator_sync_logs_outlet_id_platform_idx" ON "aggregator_sync_logs"("outlet_id", "platform");

-- CreateIndex
CREATE INDEX "analytics_cache_outlet_id_expires_at_idx" ON "analytics_cache"("outlet_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_cache_outlet_id_cache_key_key" ON "analytics_cache"("outlet_id", "cache_key");

-- CreateIndex
CREATE INDEX "xero_connections_outlet_id_idx" ON "xero_connections"("outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_accounts_connection_id_code_key" ON "xero_accounts"("connection_id", "code");

-- CreateIndex
CREATE INDEX "xero_transactions_connection_id_date_idx" ON "xero_transactions"("connection_id", "date");

-- CreateIndex
CREATE INDEX "xero_transactions_connection_id_category_idx" ON "xero_transactions"("connection_id", "category");

-- CreateIndex
CREATE INDEX "xero_transactions_connection_id_account_type_idx" ON "xero_transactions"("connection_id", "account_type");

-- CreateIndex
CREATE INDEX "xero_transactions_connection_id_contact_idx" ON "xero_transactions"("connection_id", "contact");

-- CreateIndex
CREATE UNIQUE INDEX "xero_transactions_connection_id_transaction_ref_key" ON "xero_transactions"("connection_id", "transaction_ref");

-- CreateIndex
CREATE UNIQUE INDEX "xero_bank_accounts_connection_id_account_number_key" ON "xero_bank_accounts"("connection_id", "account_number");

-- CreateIndex
CREATE INDEX "xero_balance_sheet_lines_connection_id_as_at_date_idx" ON "xero_balance_sheet_lines"("connection_id", "as_at_date");

-- CreateIndex
CREATE INDEX "xero_invoices_connection_id_status_idx" ON "xero_invoices"("connection_id", "status");

-- CreateIndex
CREATE INDEX "xero_invoices_connection_id_due_date_idx" ON "xero_invoices"("connection_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "xero_invoices_connection_id_invoice_number_key" ON "xero_invoices"("connection_id", "invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "xero_bas_returns_connection_id_year_quarter_key" ON "xero_bas_returns"("connection_id", "year", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "xero_contacts_connection_id_name_key" ON "xero_contacts"("connection_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "xero_tracking_categories_connection_id_name_key" ON "xero_tracking_categories"("connection_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "xero_tracking_options_category_id_name_key" ON "xero_tracking_options"("category_id", "name");

-- CreateIndex
CREATE INDEX "xero_tracking_summaries_connection_id_year_month_idx" ON "xero_tracking_summaries"("connection_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "xero_tracking_summaries_connection_id_option_id_year_month_key" ON "xero_tracking_summaries"("connection_id", "option_id", "year", "month");

-- CreateIndex
CREATE INDEX "expenses_outlet_id_expense_date_idx" ON "expenses"("outlet_id", "expense_date");

-- CreateIndex
CREATE INDEX "expenses_outlet_id_category_idx" ON "expenses"("outlet_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_daily_counters_outlet_id_day_key" ON "outlet_daily_counters"("outlet_id", "day");

-- CreateIndex
CREATE INDEX "error_logs_resolved_last_seen_at_idx" ON "error_logs"("resolved", "last_seen_at" DESC);

-- CreateIndex
CREATE INDEX "error_logs_fingerprint_idx" ON "error_logs"("fingerprint");

-- CreateIndex
CREATE INDEX "error_logs_source_level_idx" ON "error_logs"("source", "level");

-- CreateIndex
CREATE INDEX "credit_notes_outlet_id_issued_at_idx" ON "credit_notes"("outlet_id", "issued_at" DESC);

-- CreateIndex
CREATE INDEX "credit_notes_order_id_idx" ON "credit_notes"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_outlet_id_credit_note_no_key" ON "credit_notes"("outlet_id", "credit_note_no");

-- CreateIndex
CREATE INDEX "credit_note_lines_credit_note_id_idx" ON "credit_note_lines"("credit_note_id");

-- CreateIndex
CREATE INDEX "settlements_outlet_id_settlement_date_idx" ON "settlements"("outlet_id", "settlement_date" DESC);

-- CreateIndex
CREATE INDEX "settlements_outlet_id_status_idx" ON "settlements"("outlet_id", "status");

-- CreateIndex
CREATE INDEX "settlement_lines_settlement_id_idx" ON "settlement_lines"("settlement_id");

-- CreateIndex
CREATE INDEX "settlement_lines_transaction_id_idx" ON "settlement_lines"("transaction_id");

-- CreateIndex
CREATE INDEX "delivery_dispatches_outlet_id_created_at_idx" ON "delivery_dispatches"("outlet_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "delivery_dispatches_order_id_idx" ON "delivery_dispatches"("order_id");

-- CreateIndex
CREATE INDEX "delivery_dispatches_provider_external_id_idx" ON "delivery_dispatches"("provider", "external_id");

-- CreateIndex
CREATE INDEX "leads_status_created_at_idx" ON "leads"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "staff_message_outlet_id_created_at_idx" ON "staff_message"("outlet_id", "created_at");

-- CreateIndex
CREATE INDEX "document_outlet_id_idx" ON "document"("outlet_id");

-- CreateIndex
CREATE INDEX "document_head_office_id_idx" ON "document"("head_office_id");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_head_office_id_fkey" FOREIGN KEY ("head_office_id") REFERENCES "head_offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "billing_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_usage_events" ADD CONSTRAINT "billing_usage_events_head_office_id_fkey" FOREIGN KEY ("head_office_id") REFERENCES "head_offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_usage_events" ADD CONSTRAINT "billing_usage_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_usage_events" ADD CONSTRAINT "billing_usage_events_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "subscription_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_head_office_id_fkey" FOREIGN KEY ("head_office_id") REFERENCES "head_offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoice_lines" ADD CONSTRAINT "subscription_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "subscription_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_head_office_id_fkey" FOREIGN KEY ("head_office_id") REFERENCES "head_offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_accounts" ADD CONSTRAINT "chart_accounts_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_pay_run_id_fkey" FOREIGN KEY ("pay_run_id") REFERENCES "pay_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoice_lines" ADD CONSTRAINT "customer_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "customer_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_head_office_id_fkey" FOREIGN KEY ("head_office_id") REFERENCES "head_offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_settings" ADD CONSTRAINT "outlet_settings_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "menu_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_groups" ADD CONSTRAINT "addon_groups_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_addons" ADD CONSTRAINT "item_addons_addon_group_id_fkey" FOREIGN KEY ("addon_group_id") REFERENCES "addon_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_addons" ADD CONSTRAINT "item_addons_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_combo" ADD CONSTRAINT "item_combo_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "item_combo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_schedules" ADD CONSTRAINT "menu_schedules_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_menu_overrides" ADD CONSTRAINT "outlet_menu_overrides_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_menu_overrides" ADD CONSTRAINT "outlet_menu_overrides_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_areas" ADD CONSTRAINT "table_areas_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "table_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "item_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_addons" ADD CONSTRAINT "order_item_addons_addon_id_fkey" FOREIGN KEY ("addon_id") REFERENCES "item_addons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_addons" ADD CONSTRAINT "order_item_addons_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kot" ADD CONSTRAINT "kot_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kot" ADD CONSTRAINT "kot_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kot_items" ADD CONSTRAINT "kot_items_kot_id_fkey" FOREIGN KEY ("kot_id") REFERENCES "kot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kot_items" ADD CONSTRAINT "kot_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_reservations" ADD CONSTRAINT "table_reservations_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_reservations" ADD CONSTRAINT "table_reservations_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_preferred_supplier_id_fkey" FOREIGN KEY ("preferred_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wastage_log" ADD CONSTRAINT "wastage_log_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wastage_log" ADD CONSTRAINT "wastage_log_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_items" ADD CONSTRAINT "po_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_items" ADD CONSTRAINT "po_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_presets" ADD CONSTRAINT "item_presets_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_presets" ADD CONSTRAINT "item_presets_preferred_supplier_id_fkey" FOREIGN KEY ("preferred_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_send_logs" ADD CONSTRAINT "whatsapp_send_logs_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_send_logs" ADD CONSTRAINT "whatsapp_send_logs_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_received_notes" ADD CONSTRAINT "goods_received_notes_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_received_notes" ADD CONSTRAINT "goods_received_notes_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "goods_received_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_points" ADD CONSTRAINT "loyalty_points_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_logs" ADD CONSTRAINT "campaign_logs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_log" ADD CONSTRAINT "attendance_log_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_log" ADD CONSTRAINT "attendance_log_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "staff_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_log" ADD CONSTRAINT "attendance_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_permissions" ADD CONSTRAINT "staff_permissions_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_permissions" ADD CONSTRAINT "staff_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_records" ADD CONSTRAINT "salary_records_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_records" ADD CONSTRAINT "salary_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_otps" ADD CONSTRAINT "attendance_otps_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_otps" ADD CONSTRAINT "attendance_otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_transactions" ADD CONSTRAINT "terminal_transactions_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_transactions" ADD CONSTRAINT "terminal_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_transactions" ADD CONSTRAINT "terminal_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_transactions" ADD CONSTRAINT "terminal_transactions_initiated_by_fkey" FOREIGN KEY ("initiated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_splits" ADD CONSTRAINT "payment_splits_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_config" ADD CONSTRAINT "tax_config_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports_cache" ADD CONSTRAINT "reports_cache_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_summaries" ADD CONSTRAINT "daily_summaries_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_reports" ADD CONSTRAINT "eod_reports_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_reports" ADD CONSTRAINT "eod_reports_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franchise_config" ADD CONSTRAINT "franchise_config_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "central_kitchen_indents" ADD CONSTRAINT "central_kitchen_indents_ck_outlet_id_fkey" FOREIGN KEY ("ck_outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "central_kitchen_indents" ADD CONSTRAINT "central_kitchen_indents_requesting_outlet_id_fkey" FOREIGN KEY ("requesting_outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "central_kitchen_indent_items" ADD CONSTRAINT "central_kitchen_indent_items_indent_id_fkey" FOREIGN KEY ("indent_id") REFERENCES "central_kitchen_indents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "central_kitchen_indent_items" ADD CONSTRAINT "central_kitchen_indent_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tally_mappings" ADD CONSTRAINT "tally_mappings_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_usages" ADD CONSTRAINT "discount_usages_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ondc_seller_profiles" ADD CONSTRAINT "ondc_seller_profiles_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ondc_orders" ADD CONSTRAINT "ondc_orders_seller_profile_id_fkey" FOREIGN KEY ("seller_profile_id") REFERENCES "ondc_seller_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rule_applications" ADD CONSTRAINT "pricing_rule_applications_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "pricing_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "festival_modes" ADD CONSTRAINT "festival_modes_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_assignments" ADD CONSTRAINT "roster_assignments_roster_id_fkey" FOREIGN KEY ("roster_id") REFERENCES "rosters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_assignments" ADD CONSTRAINT "roster_assignments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_availability" ADD CONSTRAINT "staff_availability_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_certifications" ADD CONSTRAINT "staff_certifications_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_certifications" ADD CONSTRAINT "staff_certifications_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aggregator_sync_logs" ADD CONSTRAINT "aggregator_sync_logs_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_cache" ADD CONSTRAINT "analytics_cache_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_connections" ADD CONSTRAINT "xero_connections_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_accounts" ADD CONSTRAINT "xero_accounts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "xero_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_transactions" ADD CONSTRAINT "xero_transactions_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "xero_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_bank_accounts" ADD CONSTRAINT "xero_bank_accounts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "xero_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_balance_sheet_lines" ADD CONSTRAINT "xero_balance_sheet_lines_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "xero_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_invoices" ADD CONSTRAINT "xero_invoices_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "xero_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_bas_returns" ADD CONSTRAINT "xero_bas_returns_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "xero_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_contacts" ADD CONSTRAINT "xero_contacts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "xero_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_tracking_categories" ADD CONSTRAINT "xero_tracking_categories_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "xero_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_tracking_options" ADD CONSTRAINT "xero_tracking_options_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "xero_tracking_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_tracking_summaries" ADD CONSTRAINT "xero_tracking_summaries_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "xero_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_tracking_summaries" ADD CONSTRAINT "xero_tracking_summaries_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "xero_tracking_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

