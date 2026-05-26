# PetPooja Mobile App — Build Plan

Last updated: 2026-05-26
Platform: Expo SDK 54 / React Native 0.81.5 / Expo Router 6

---

## What Already Works (✅ Production-Ready)

| Feature | Screen | API Status |
|---------|--------|------------|
| Auth (login, session, biometric) | `login.jsx`, `AuthContext` | ✅ Real API |
| Mode selection (POS vs Owner) | `mode-select.jsx` | ✅ Local |
| Onboarding wizard | `onboarding.jsx` | ✅ Real API |
| Owner analytics dashboard | `(owner)/home.jsx` | ✅ Real API |
| Owner reports | `(owner)/reports.jsx` | ✅ Real API |
| Owner staff (attendance, labour) | `(owner)/staff.jsx` | ✅ Real API |
| Owner inventory monitoring | `(owner)/inventory.jsx` | ✅ Real API |
| Owner approvals | `(owner)/approvals.jsx` | ✅ Real API |
| Tables management | `(tabs)/tables.jsx` | ✅ Offline-first SQLite |
| Menu browsing | `(tabs)/menu-items.jsx` | ✅ Offline-first SQLite |
| Billing / payment | `(tabs)/billing.jsx` | ✅ Offline-first SQLite |
| KOT kitchen display | `(tabs)/kot.jsx` | ✅ Working UI |
| Orders list | `(tabs)/orders.jsx` | ✅ Working UI |
| Staff dashboard | `(tabs)/dashboard.jsx` | ✅ Working UI |
| Real-time WebSocket bridge | `RealtimeBridge` in layout | ✅ Live |
| Offline sync engine | `syncEngine.js` | ✅ Running |
| 14 custom hooks | `src/hooks/` | ✅ Implemented |
| 15 shared UI components | `src/components/` | ✅ Implemented |

---

## Build Roadmap (Priority Order)

---

### 🔴 Phase 1 — POS Order Creation  ← CURRENT
**The most critical missing feature. Staff cannot take new orders from scratch.**

The app has tables, menu, billing, and KOT screens — but no screen to open a table,
browse the menu, add items to a cart, and place a new order.

**What to build:**
- New screen: `(tabs)/pos.jsx` — Full POS terminal
  - Order type selector (Dine-In / Takeaway / Delivery)
  - Table picker (for dine-in)
  - Category tabs with offline menu (from `useOfflineMenu`)
  - 2-column item grid with veg/non-veg indicator
  - Inline +/- quantity controls per item
  - Sticky cart bar at bottom
  - Cart bottom sheet with order notes and Place Order button
  - Calls `useCreateOfflineOrder` → works offline, syncs when online
- Add "Take Order" / "Add Items" button to `tables.jsx` table detail modal
- Register `pos` as hidden screen in `(tabs)/_layout.jsx`

**Files to create/modify:**
- `app/(tabs)/pos.jsx` ← NEW
- `app/(tabs)/_layout.jsx` ← add pos as hidden screen
- `app/(tabs)/tables.jsx` ← add "Take Order" button navigating to /pos

**Status: ✅ IMPLEMENTED** (pos.jsx + layout update)

---

### 🟠 Phase 2 — Customers Screen (Real API)
**Currently 100% mock data. Needs real `/customers` endpoint.**

**What to build:**
- Replace `INITIAL_CUSTOMERS` with `useQuery(() => api.get('/customers?outlet_id=...'))`
- Add, edit, view history — call real mutation endpoints
- Loyalty points display from `customers.loyalty_points`
- Birthday / anniversary filters using real data
- Customer search by phone/name via `/customers?search=...`

**Files to modify:**
- `app/(tabs)/customers.jsx`

---

### 🟠 Phase 3 — Delivery Orders (Real API)
**Currently mock data with platform tabs (Zomato/Swiggy/Direct).**

**What to build:**
- Connect to `/orders?order_type=delivery&outlet_id=...`
- Auto-accept countdown logic (accept within 60s)
- Status progression: received → preparing → out_for_delivery → delivered
- Reject modal with reasons → call `PATCH /orders/:id/status`
- Revenue breakdown by platform

**Files to modify:**
- `app/(tabs)/delivery-orders.jsx`

---

### 🟡 Phase 4 — EOD Report (Real API)
**Currently mock data with beautiful visualisation.**

**What to build:**
- Connect to `useEODPreview(outletId, date)` and `useEODHistory(outletId)` 
  hooks already defined in `useOwnerApi.js`
- "Close Day" button → `POST /eod/close`
- Email/WhatsApp share using real data
- Date navigation between past EOD reports

**Files to modify:**
- `app/(tabs)/eod.jsx`

---

### 🟡 Phase 5 — Push Notifications
**Push token registration exists (`useNotifications`) but notification types not wired.**

**What to build:**
- Register Expo push token with backend `POST /staff/push-token`
- Notification types to handle:
  - `NEW_ORDER` → navigate to orders
  - `ORDER_READY` → navigate to orders
  - `LOW_STOCK` → navigate to inventory (owner)
  - `APPROVAL_REQUEST` → navigate to approvals (owner)
  - `EOD_REMINDER` → show EOD reminder at 10 PM
- Background notification handler for foreground + background
- Notification settings toggle in profile screen

**Files to modify:**
- `src/hooks/useNotifications.js`
- `app/(owner)/profile.jsx`
- Backend: add push-token endpoint if missing

---

### 🟡 Phase 6 — Owner Alerts (Real API)
**`alerts.jsx` exists but unclear if fully connected.**

**What to build:**
- Connect to `useAlertBadges(outletId)` from `useOwnerApi.js`
- Alert types: low_stock, high_transaction, fraud_flag, staff_clock_in
- Mark as read → mutation
- Alert settings screen for configuring thresholds

**Files to modify:**
- `app/(owner)/alerts.jsx`
- `app/(owner)/alert-settings.jsx`

---

### 🟡 Phase 7 — Expenses & Purchase Orders (Real API)
**Both screens currently mock or stub.**

**Expenses:**
- Connect to `GET /expenses?outlet_id=...`
- Add expense form → `POST /expenses`
- Category breakdown chart
- Monthly totals

**Purchase Orders:**
- Connect to `GET /purchase-orders?outlet_id=...`
- Create PO → `POST /purchase-orders`
- Receive stock → `PATCH /purchase-orders/:id/receive`

**Files to modify:**
- `app/(tabs)/expenses.jsx`
- `app/(tabs)/purchase-orders.jsx`

---

### 🟢 Phase 8 — Reservations (Real API)
**Reservations screen likely stub. Needs real `/reservations` endpoint.**

**What to build:**
- Calendar/time slot view for upcoming reservations
- Create reservation → `POST /reservations`
- Guest arrival → update table status
- Cancellation flow

**Files to modify:**
- `app/(tabs)/reservations.jsx`

---

### 🟢 Phase 9 — Offers & Discounts (Real API)
**Offers screen likely stub. Needs real `/promotions` or `/discounts` endpoint.**

**What to build:**
- Active offers list with validity dates
- Apply offer at POS (auto-suggestion during billing)
- Owner can toggle offers on/off from mobile

**Files to modify:**
- `app/(tabs)/offers.jsx`

---

### 🔵 Phase 10 — Thermal Printer Integration
**No printer support currently. Critical for kitchen and billing receipts.**

**What to build:**
- Bluetooth printer discovery and pairing
- KOT template: table number, items, special notes, timestamp
- Bill receipt template: items, taxes, payment mode, outlet logo
- Printer settings in outlet-settings screen
- Auto-print KOT on order placement (optional toggle)

**New dependency:** `react-native-thermal-receipt-printer-image-qr` or `expo-print`

**Files to create/modify:**
- `src/lib/printer.js` ← NEW
- `app/(tabs)/pos.jsx` ← add print KOT toggle
- `app/(tabs)/billing.jsx` ← add print receipt button
- `app/(owner)/outlet-settings.jsx` ← printer config

---

### 🔵 Phase 11 — QR Table Scanner
**Quick table identification by scanning QR code on table.**

**What to build:**
- Camera-based QR scanner component using `expo-barcode-scanner`
- QR format: `petpooja://table/{outlet_id}/{table_id}`
- Scan → auto-fill table in POS screen
- Floating scan button on Tables screen

**Files to create/modify:**
- `src/components/QRScanner.jsx` ← NEW
- `app/(tabs)/tables.jsx` ← add scan button
- `app/(tabs)/pos.jsx` ← QR scan shortcut

---

### 🔵 Phase 12 — Owner Live Dashboard (Real-time)
**Owner home is good but analytics update on pull-to-refresh only.**

**What to build:**
- Real-time metrics via Socket.io `owner:live-stats` event
- Animated counter for revenue ticking up in real-time
- Live order status board (rolling last 5 orders)
- Alert badge auto-updates without refresh

**Files to modify:**
- `app/(owner)/home.jsx`
- `src/hooks/useRealtimeOwner.js`

---

## Technical Architecture Notes

### Offline-First Strategy
- All POS operations write to SQLite first (instant, works offline)
- Sync engine pushes to server every 5 min or when coming online
- Menu + tables pulled down at login and every 30 min
- Conflict resolution: server wins for menus/tables, client wins for orders

### API Pattern
```js
// api.js interceptor unwraps to { success, data, message, meta }
// so api.get() returns that object directly, NOT an Axios response
const r = await api.get('/orders?outlet_id=...');
// r.data = the array/object, r.meta = pagination info
```

### Navigation
- `(tabs)/` — Staff/POS stack, accessed by non-owner roles + owners in POS mode
- `(owner)/` — Owner analytics stack, accessed by owners + super_admin in owner mode
- Hidden screens registered in layout but navigated to via `router.push('/screen-name')`
- Pass params via `router.push({ pathname: '/pos', params: { table_id: '...' } })`
- Read with `const { table_id } = useLocalSearchParams()`

### WatermelonDB vs expo-sqlite
- WatermelonDB schema: `orders`, `inventory`, `dashboard_cache` tables
- expo-sqlite (raw): `offline_orders`, `offline_order_items`, `tables_cache`, `menu_cache`
- The SQLite raw DB is the primary offline store for real-time POS ops

---

## Implementation Progress

- [x] Phase 1: POS Order Creation (`pos.jsx`)
- [x] Phase 2: Customers Real API
- [x] Phase 3: Delivery Orders Real API
- [x] Phase 4: EOD Report Real API
- [x] Phase 5: Push Notifications
- [x] Phase 6: Owner Alerts
- [x] Phase 7: Expenses + Purchase Orders
- [x] Phase 8: Reservations
- [x] Phase 9: Offers & Discounts
- [x] Phase 10: Thermal Printer
- [x] Phase 11: QR Table Scanner
- [x] Phase 12: Owner Live Dashboard
