## Restaurant ERP – Module Specs (Agent Context)

M1: ORDER CAPTURE
Fast POS screen. Supports: table/counter/takeaway/delivery/drive-thru/online. Features: one-tap bestsellers, item search, modifiers (size/spice/add-ons/exclusions), combos, split items/bills/seats, order notes, reorder, qty edit, hold/fire/send-later. Connects: KDS, printer, payment, inventory, online channels.

M2: MENU MANAGEMENT
CRUD for menu items. Supports: categories/subcategories, modifier groups, combo rules, time-based menus, location-based menus, out-of-stock toggle, price/happy-hour overrides, tax/service charge, photos/descriptions. Syncs to: all terminals, kiosks, web, delivery apps, QR.

M3: TABLE & FLOOR MANAGEMENT
Dine-in floor plan UI. Features: table map, status (open/occupied/dirty/reserved/paid), server assignment, course progress, transfer/merge tables, split checks, reservation link. Connects: host stand, kitchen timing, payment.

M4: KITCHEN WORKFLOW
Order fulfillment screen. Supports: KDS or printer, station routing (grill/bar/dessert/packing), color-coded status, rush flags, expo screen, prep time tracking, fire-by-course, reprint, hold/unhold. Flow: order → station → expo → ready → pickup/serve.

M5: ONLINE ORDERING
Web+mobile ordering portal. Supports: scheduled orders, pickup/delivery/QR dine-in/curbside, order acceptance controls, prep time ETA, auto menu sync, order throttling, delivery zones, min order value, upsells, customer accounts/guest checkout. Feeds into same POS queue.

M6: PAYMENT PROCESSING
Checkout module. Supports: cash/card/contactless/wallet, split tender, partial payments, tips, refunds/voids, pre-auth tab, gift cards, store credit, surcharge rules, receipt email/SMS. Connects: payment gateway, bank settlement, accounting, reporting.

M7: CUSTOMER MANAGEMENT
CRM profile store. Supports: profile, order history, loyalty points, favorites, dietary notes, marketing consent, birthday offers, corporate accounts. Connects: online ordering, loyalty engine, email/SMS marketing.

M8: INVENTORY CONTROL
Stock tracking engine. Supports: stock counts, ingredient-level depletion per sale, recipe mapping, low-stock alerts, auto-reorder, waste/spoilage entry, purchase receiving, vendor management, batch tracking. Auto-deducts on each order.

M9: STAFF & SHIFT MANAGEMENT
HR/ops module. Supports: clock in/out, roles/permissions, shift scheduling, sales-by-employee, tip tracking, cash drawer access, break tracking, void/discount/refund approvals, performance metrics. Connects: payroll, labor reports, access control.

M10: REPORTING & ANALYTICS
Owner dashboard. Shows: sales by hour/day/week/item/category, top/slow sellers, server performance, discount/refund reports, tax summaries, online vs in-store, margin/food cost estimates, peak time analysis, repeat customer rate. Pulls from all modules.

M11: DISCOUNTS & PROMOTIONS
Promo engine. Supports: happy hour, coupon codes, auto discounts, loyalty rewards, combo pricing, BOGO, employee meals, channel-specific promos. Works across POS, web, kiosk, delivery.

M12: MULTI-LOCATION
Central control for chains. Supports: central menu with local overrides, location-specific pricing, shared customer/loyalty pool, inter-store reporting, inventory transfers, separate tax rules, branch-level role management. One admin dashboard.

M13: HARDWARE COMPATIBILITY
Device integration layer. Supports: touchscreen terminals, tablets, receipt printers, kitchen printers, cash drawers, barcode scanners, KDS screens, customer display screens, card readers, weighing scales. Plug-and-play target.

M14: INTEGRATIONS
External API layer. Connects: payment gateways, accounting software, delivery platforms (Zomato/Swiggy), loyalty apps, CRM, SMS/email providers, tax tools, reservation systems, payroll tools, webhooks for automation.

M15: SECURITY & ACCESS CONTROL
Permission and audit layer. Supports: role-based permissions, manager approval flows, audit trail, PIN/NFC login, offline mode, data backup, fraud detection, device management.

M16: OFFLINE MODE
Resilience layer. Maintains: order taking, kitchen ticket printing, staff ops during outage. Queues payments for sync. Auto-syncs orders/payments/inventory on reconnect.

M17: UX & DESIGN SYSTEM
UI standards. Requirements: large tap targets, ≤3 taps per order, color-coded states, fast search, short training curve, pre-submit error warnings, custom shortcuts, favorites. All modules share one unified UI shell.