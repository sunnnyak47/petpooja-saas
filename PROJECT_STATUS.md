# 🚀 PETPOOJA ERP — PROJECT STATUS
# Last Updated: 2026-04-13 14:15:00 IST
# Updated by: Antigravity Agent
# 
# READ THIS FIRST before doing anything.
# This file tells you exactly where the 
# project is and what to do next.

---

## 📍 CURRENT STATUS
The project is in Phase 4 (Frontend) and Phase 6 (QR Tablet ordering). The core ERP foundation is production-ready, but the high-priority QR Order workflow is currently being refined to prevent auto-acceptance and solve audible alert issues.

Completion: 85% overall

Working & Deployed:
✅ Auth (JWT + Refresh + RBAC)
✅ Menu Management (Categories, Items, Variants, Addons, S3 Images)
✅ POS Terminal (Cart, Billing, Payment processing)
✅ Running Orders (Order tracking, Table management)
✅ Kitchen Display Screen (Real-time KOT display per station)
✅ Inventory (Stock tracking, Recipe-based auto-deduction)
✅ Reports (24+ comprehensive business reports)
✅ QR Code Generation (Dynamic QR per table)
✅ Customer CRM (Loyalty points & campaign logs)

In Progress:
🔄 QR Order Self-Ordering (Workflow refining: status transitions)
🔄 Audible alerts on POS (Solving browser autoplay restrictions)
🔄 Integrations (Aggregator sync fine-tuning)

Not Yet Built:
❌ Head Office Enterprise Suite (Central kitchen indents partially done)
❌ Offline Support (Local caching)
❌ Test Suite (Jest/Artillery suite scaffolded but needs coverage)

Known Bugs:
🐛 QR Orders reported as "auto-accepting" (Logic added to prevent this, but requires verification).
🐛 Missing notification chime on POS (Browser blocking AudioContext).

---

## 🌐 DEPLOYMENT URLS

Restaurant POS:    https://petpooja-saas.vercel.app
SuperAdmin Panel:  https://petpooja-admin.vercel.app
Backend API:       https://petpooja-saas.onrender.com
Kitchen Display:   https://petpooja-saas.vercel.app/kitchen

---

## 🔧 TECH STACK

Backend:   Node.js + Express + PostgreSQL + Redis
Frontend:  React + Vite + Tailwind CSS
ORM:       Prisma
Auth:      JWT (15m) + Refresh (7d)
Realtime:  Socket.io 4.x
Storage:   AWS S3
Deploy:    Vercel (frontend) + Render (backend)
Repo:      GitHub (already connected)

---

## 📁 PROJECT STRUCTURE

/Petpooja
├── backend/          → Express API
│   ├── src/
│   │   ├── modules/  → auth, menu, orders, inventory, customers, staff, reports, payments, integrations, headoffice, superadmin, online-orders
│   │   ├── middleware/ → auth, rateLimit, error, security, logger
│   │   ├── config/
│   │   ├── database/
│   │   ├── socket/
│   │   ├── utils/
│   │   └── app.js
│   └── prisma/       → schema.prisma
├── frontend/         → Restaurant POS + Dashboard
├── superadmin-frontend/ → SuperAdmin Panel
├── kitchen/          → Kitchen Display (KDS)
├── shared/           → Shared types and constants
├── GEMINI.md         → Root Agent rules (The Constitution)
├── PROJECT_STATUS.md → This file (The Memory)
└── docker-compose.yml

---

## 🗄️ DATABASE

DB Type: PostgreSQL 16
ORM: Prisma

Tables that EXIST (found in schema.prisma):
Role, Permission, RolePermission, HeadOffice, Subscription, Outlet, User, UserRole, OutletSetting, AuditLog, MenuCategory, MenuItem, ItemVariant, AddonGroup, ItemAddon, ItemCombo, ComboItem, MenuSchedule, OutletMenuOverride, TableArea, Table, Order, OrderItem, OrderItemAddon, OrderStatusHistory, KOT, KOTItem, TableReservation, InventoryItem, InventoryStock, StockTransaction, WastageLog, Supplier, Customer, LoyaltyTransaction, Recipe, RecipeIngredient, PurchaseOrder, POItem, GoodsReceivedNote, GRNItem, StaffProfile, StaffShift, AttendanceLog, StaffPermission, PaymentMethod, Payment, TaxConfig, InvoiceSequence, ReportsCache, DailySummary, FranchiseConfig, CentralKitchenIndent, TallyMapping, Campaign, CampaignLog, Discount

Tables that NEED ADDING:
- AnalyticsCache (for faster report generation)
- OfflineSyncLog (for offline-to-online reconciliation)

Last migration: Check `backend/prisma/migrations` folder.

---

## 🔌 API ENDPOINTS

Total routes: ~153

Auth routes:
- POST /api/auth/login
- POST /api/auth/refresh-token
- POST /api/auth/logout
- POST /api/auth/register (onboarding)

Order routes:
- POST /api/orders
- GET /api/orders
- POST /api/orders/:id/items (add to running order)
- POST /api/orders/tables/:id/transfer
- POST /api/kitchen/:id/ready (KDS interaction)

QR Order routes:
- GET /api/online-orders/menu/:outlet_id (public menu)
- POST /api/online-orders/place (place QR order)
- PUT /api/online-orders/:id/accept (staff verification)

SuperAdmin routes:
- GET /api/superadmin/dashboard
- POST /api/superadmin/restaurants/onboard

---

## 🔑 ENVIRONMENT VARIABLES NEEDED

### Backend (.env on Render):
```
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=[64+ chars]
JWT_REFRESH_SECRET=[64+ chars]
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=...
AWS_REGION=ap-south-1
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
MSG91_AUTH_KEY=...
RESTAURANT_APP_URL=https://petpooja-saas.vercel.app
SUPERADMIN_URL=https://petpooja-admin.vercel.app
QR_MENU_BASE_URL=https://petpooja-saas.vercel.app
```

### Frontend (.env on Vercel):
```
VITE_API_URL=https://petpooja-saas.onrender.com/api
VITE_SOCKET_URL=https://petpooja-saas.onrender.com
```

### SuperAdmin (.env on Vercel):
```
VITE_API_URL=https://petpooja-saas.onrender.com/api
VITE_RESTAURANT_APP_URL=https://petpooja-saas.vercel.app
```

---

## ✅ COMPLETED FEATURES (DETAILED)

### Phase 1 — Foundation ✅
- PostgreSQL schema: 60+ tables
- Project scaffold: Modular backend + separate frontends
- Docker compose: Full local dev environment

### Phase 2 — Core Backend ✅
AUTH:
- JWT Access (15m) + Refresh (7d)
- Full RBAC (Owner, Manager, Cashier, Kitchen, SuperAdmin)

MENU:
- Hierarchical categories
- Variant/Addon price logic
- S3 powered image uploading

ORDERS:
- Multi-station KOT generation
- Real-time KDS socket integration
- Bill splitting and payment reconciliation

### Phase 3 ✅
- CRM: Customer profiling and loyalty point tracking
- Attendance: Staff clock-in/out via ID/Phone
- Reports: 24+ reports including sales, wastage, inventory, and staff performance

---

## 🔄 CURRENT ACTIVE PROBLEM

Problem description:
QR orders were being "auto-accepted" (appearing in KDS before staff approved them). Also, staff reported missing notification sounds on the POS when orders arrived.

Files involved:
- `backend/src/modules/online-orders/online-order.service.js`
- `backend/src/modules/orders/order.service.js`
- `frontend/src/components/POS/IncomingOrderAlert.jsx` (Sound logic)
- `frontend/src/layouts/DashboardLayout.jsx` (AudioContext unlock)

What was tried:
1. Updated `pending` status enforcement in backend.
2. Added `generateKOT` block for pending orders.
3. Implemented Web Audio API + AudioContext unlocking in Dashboard.

What needs to happen next:
Verifying the fix on live deployment. Staff must interact with the dashboard once (any click) to "unlock" the audio for the first order alert chime.

---

## 📋 PENDING FEATURES QUEUE

Priority 1 (do first):
1. Finalize Socket.io heartbeat to prevent KDS disconnection.
2. Add "Order Ready" SMS notification to customers.

Priority 2 (do after P1):
3. Head Office "Bulk Menu Push" across multiple outlets.

Priority 3 (future):
4. AI-based demand forecasting.

---

## 🐛 KNOWN BUGS

Bug 1: Browser Audio Autoplay Policy blocking POS chime.
File: `frontend/src/components/POS/IncomingOrderAlert.jsx`
Status: Fix deployed, needs manual interaction to unlock.

Bug 2: Rapid clicking on "Accept & KOT" can trigger duplicate KOTs.
File: `backend/src/modules/orders/order.service.js`  
Status: Fix known (need transaction serializable or unique constraint improvement).

---

## 📝 AGENT HANDOFF NOTES

What the next agent needs to know:
1. Always keep `outlet_id` scoping in every database query (multi-tenancy).
2. Socket.io uses specific namespaces: `/orders` for POS/Dashboard, `/kitchen` for KDS.
3. Don't use `Audio` constructor for beeps; use the `AudioContext` provided in `DashboardLayout` because it's already "unlocked" by the user's first click.

Files the next agent must read first:
1. GEMINI.md (project constitution)
2. PROJECT_STATUS.md (this file)  
3. `backend/src/modules/online-orders/online-order.service.js`

First command for next agent:
"Verify the QR order flow: Place an order from customer UI, check if POS beeps, check if KDS is empty, click Accept, then check if KDS populates."
