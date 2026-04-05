# PETPOOJA ERP — MASTER AGENT CONSTITUTION
# This file governs ALL agents in this project.
# Never deviate from these rules under any circumstance.

---

## 🏗️ PROJECT IDENTITY
You are building a production-grade Restaurant ERP 
system equivalent to Petpooja.com — used by 100,000+ 
restaurants across India, UAE, and South Africa.

This is NOT a demo. NOT a prototype. 
This is PRODUCTION-READY software.

---

## 🔧 TECH STACK (LOCKED — NEVER CHANGE)
- Backend:    Node.js 20 LTS + Express.js 4.x
- Database:   PostgreSQL 16 + Redis 7
- ORM:        Prisma 5.x
- Frontend:   React 18 + Vite + Tailwind CSS 3.x
- State:      Redux Toolkit + React Query
- Realtime:   Socket.io 4.x
- Auth:       JWT (access 15min) + Refresh (7 days)
- Storage:    AWS S3 + CloudFront CDN
- Mobile:     React Native 0.73 (Expo)
- Desktop:    Electron 28 (POS wrapper)
- Testing:    Jest + Supertest + Artillery
- Deploy:     Docker + Docker Compose + AWS

---

## 📁 PROJECT STRUCTURE (LOCKED)
/petpooja-erp
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── menu/
│   │   │   ├── orders/
│   │   │   ├── inventory/
│   │   │   ├── customers/
│   │   │   ├── staff/
│   │   │   ├── reports/
│   │   │   ├── payments/
│   │   │   ├── integrations/
│   │   │   └── headoffice/
│   │   ├── database/
│   │   ├── utils/
│   │   └── app.js
│   ├── tests/
│   ├── package.json
│   └── .env.example
├── frontend/        (POS + Owner Dashboard)
├── kitchen/         (Kitchen Display Screen)
├── mobile/          (React Native owner app)
├── shared/          (types, constants, utils)
├── docker-compose.yml
├── GEMINI.md        (this file)
└── README.md

---

## ⚖️ NON-NEGOTIABLE CODE RULES

### Quality Rules
- NEVER write placeholder comments like:
  "// TODO", "// add logic here", "// implement this"
- NEVER write incomplete functions
- ALWAYS write complete, working, production code
- ALWAYS add try/catch on every async function
- ALWAYS validate ALL inputs with Joi before processing
- ALWAYS use parameterized queries (zero SQL injection)
- ALWAYS add JSDoc comments on every function
- ALWAYS handle edge cases explicitly

### Database Rules
- Every table MUST have:
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
- ALWAYS use soft deletes (is_deleted = true)
- NEVER hard delete any record
- outlet_id MUST exist on every multi-tenant table
- ALWAYS index: outlet_id, created_at, foreign keys

### API Rules
- Follow RESTful conventions strictly
- Always return: { success, data, message, meta }
- HTTP codes: 200/201 success, 400 validation, 
  401 auth, 403 forbidden, 404 not found, 500 server
- Pagination on all list endpoints:
  ?page=1&limit=20&sort=created_at&order=desc
- Filter support on all list endpoints

### Security Rules
- helmet.js on all routes
- Rate limit: 100/min general, 5/min auth
- CORS: whitelist only
- JWT secret minimum 256-bit from env
- Bcrypt rounds: 12
- Sanitize all user inputs
- Log all sensitive actions to audit_log table

### Multi-Tenant Rules
- Every DB query MUST include outlet_id filter
- Owner sees ALL outlets
- Manager sees ONLY their outlet
- Cashier sees ONLY current outlet POS data
- Never leak data across outlets

---

## 🗄️ DATABASE SCHEMA REFERENCE

### Core Tables (must exist before any module):
users, roles, permissions, user_roles,
outlets, outlet_zones, outlet_settings,
audit_log

### Menu Tables:
menu_categories, menu_items, item_variants,
item_addons, item_combo, combo_items,
menu_schedules, outlet_menu_overrides

### Order Tables:
orders, order_items, order_item_addons,
order_status_history, kot, kot_items,
tables, table_areas, table_reservations

### Inventory Tables:
inventory_items, inventory_stock,
stock_transactions, wastage_log,
suppliers, purchase_orders, po_items,
goods_received_notes, grn_items

### Customer Tables:
customers, customer_addresses,
loyalty_points, loyalty_transactions,
campaigns, campaign_logs

### Staff Tables:
staff_profiles, staff_shifts,
attendance_log, staff_permissions

### Finance Tables:
payments, payment_splits, payment_methods,
tax_config, invoice_sequences

### Reporting Tables:
reports_cache, daily_summaries

### Enterprise Tables:
franchise_config, outlet_groups,
central_kitchen_indents, ck_dispatch_notes

---

## 🔌 SOCKET.IO EVENT NAMES (LOCKED)
// Orders
'new_order'              → new order created
'order_status_change'    → order status updated
'new_kot'               → KOT generated
'kot_item_ready'        → item marked ready
'order_complete'        → full order complete

// Tables
'table_status_change'   → table occupied/free

// Inventory
'low_stock_alert'       → stock below threshold

// Online Orders
'new_online_order'      → aggregator order arrived
'online_order_accepted' → order accepted

// Sync
'menu_updated'          → menu changed at HO level

---

## 💳 PAYMENT METHODS
cash | card_pine_labs | upi_razorpay | 
paytm | wallet | loyalty_points | 
split (multiple methods) | online_prepaid

---

## 🧾 GST RULES (INDIA)
- Same state: CGST (9%) + SGST (9%)
- Different state: IGST (18%)
- Restaurant default: 5% GST (no ITC)
- AC restaurant > ₹7500: 18% GST
- Invoice number: FY-OUTLET-SEQUENCE
  (resets every April 1)
- HSN code: 9963 (restaurant services)
- Mandatory fields: GSTIN, HSN, tax breakdowns

---

## 📋 PHASE EXECUTION ORDER
Phases must be completed in this sequence.
Never skip a phase. Never start phase N+1 
before phase N is verified working.

PHASE 1: Database Schema + Project Scaffold
PHASE 2: Auth + Core Backend APIs (parallel)
PHASE 3: Remaining Backend Modules (parallel)  
PHASE 4: All Frontend Interfaces (parallel)
PHASE 5: Third-Party Integrations (parallel)
PHASE 6: Advanced Modules (parallel)
PHASE 7: Security + Testing + Deployment

---

## ✅ DEFINITION OF "DONE" FOR EACH PHASE
A phase is ONLY done when:
1. All code is written (no placeholders)
2. Server starts without errors
3. All endpoints return correct responses
4. Browser Agent screenshot confirms UI works
5. No console errors or warnings
6. Basic happy-path test passes

---

## 🚫 THINGS AGENTS MUST NEVER DO
- Never delete files without explicit instruction
- Never change the tech stack
- Never skip error handling
- Never hardcode secrets or API keys
- Never use 'any' type in TypeScript
- Never write code that works only in dev
- Never ignore a failing test
- Never proceed to next phase if current has errors
