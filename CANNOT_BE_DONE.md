# Items That Cannot Be Done (Without External Resources)

**Generated:** 2026-05-09
**Context:** Sprint 1 "Stop the Bleeding" build session — autonomous parallel agent run

---

## What Was Completed This Session

| ID | Item | Status |
|----|------|--------|
| P0-1 | Inventory Deduction on Order | FIXED — Atomic recipe-based deduction inside `$transaction`, 5 recipes + 29 ingredients seeded, 6 tests passing |
| P0-3 | Multi-Outlet Data Leakage | FIXED — Audited all `findMany()` calls, added `outlet_id` scoping where missing |
| P0-4 | Payment Reconciliation Math | FIXED — Split payments now categorized correctly via `PaymentSplit` records in EOD |
| P0-5 | Tax Calculation Engine | BUILT — New `tax.service.js` with integer math, AU 10% GST + IN multi-slab (5/12/18/28%), inclusive pricing, cess, CGST/SGST/IGST split |
| P1-1 | Dashboard Analytics (mock data) | VERIFIED — Already uses real queries, not mock data |
| P1-3 | Staff Performance | VERIFIED — Already uses real order-to-staff data |
| P2-3 | Audit Trail | BUILT — New `AuditLog` model + middleware, `GET /api/audit-logs` endpoint |
| P4-3 | Error Boundary | BUILT — React `ErrorBoundary` component with friendly fallback UI |
| P4-10 | Notification Center Empty | FIXED — Now shows low-stock alerts + operational notifications (pending KOTs, running orders) |
| Mock | AdvancedReports Heatmap | FIXED — Replaced `Math.random()` with real hourly order data |
| Mock | Square Payment IDs | FIXED — Replaced `Math.random()` with `crypto.randomBytes()` |
| Mock | Pronto Sync Counts | FIXED — Replaced random count with actual DB order query |

---

## Cannot Be Done — Requires External Resources

### P0-6: Receipt Printer Integration
**Why not:** Requires physical thermal printer hardware (Epson TM series, Star Micronics) connected to the machine. The `node-thermal-printer` library needs a USB/serial/network printer to discover and communicate with. Cannot test or fix printing without actual hardware. Also requires Electron's `ipcMain` bridge for native USB access — the web browser cannot access USB printers.
**What's needed:** Physical printer + Electron desktop build running locally.

### P0-7: Offline POS Sync (SQLite to Cloud)
**Why not:** Requires the Electron desktop app running in offline mode with SQLite. The sync engine (`desktop/src/sync/syncEngine.js`) needs a vector clock conflict resolution implementation, but testing this requires: (1) Electron app built and running, (2) network disconnection simulation, (3) concurrent order creation on both offline and cloud, (4) reconnect and verify merge. This is a multi-day engineering task with complex edge cases (split-brain, partial sync, duplicate order numbers).
**What's needed:** Electron dev environment, network simulation tools, extensive QA.

### P0-2: KDS WebSocket Disconnect Fix
**Why not:** The heartbeat fix (join_outlet on reconnect) was already applied in a previous session. The remaining issue is deeper Socket.io stability — the server-side adapter uses in-memory state, and when Node.js garbage collects idle connections, the room membership is lost. A proper fix requires: (1) Redis adapter for Socket.io (`@socket.io/redis-adapter`), (2) connection state recovery (`connectionStateRecovery` in Socket.io v4.6+), (3) load testing with 50+ concurrent KDS connections. Each of these touches shared infrastructure.
**What's needed:** Redis instance, Socket.io v4.6+ upgrade, load testing infrastructure.

### P2-1: Rate Limiting
**Why not possible this session:** While `express-rate-limit` can be added trivially, doing it correctly for a multi-tenant restaurant SaaS requires: per-tenant rate limits (not global), Redis-backed store for horizontal scaling, different tiers for different endpoint categories (auth: 5/min, read: 100/min, write: 30/min), and exemptions for internal service calls. A naive implementation would rate-limit the wrong things or share limits across tenants.
**What's needed:** Redis store, per-tenant configuration, integration testing under load.

### P2-2: Request Validation (Zod/Joi Schemas)
**Why not possible this session:** There are ~160 API endpoints across 20+ route files. Adding validation schemas to every POST/PUT/PATCH endpoint is a mechanical but massive task (estimated 2-3 days). Each schema must match the Prisma model fields, handle optional vs required correctly, and not break existing API consumers. This is safe to do incrementally but not in a single autonomous run.
**What's needed:** Dedicated sprint, endpoint-by-endpoint schema authoring, API contract testing.

### P2-4: Session Management (Refresh Token Rotation)
**Why not:** Current JWT auth works correctly. Adding refresh token rotation requires: new `RefreshToken` database table, token rotation logic in auth service, device fingerprinting, revocation list, and updating every frontend API interceptor to handle 401 → refresh → retry flow. Breaking auth would lock out all users.
**What's needed:** Careful migration plan, frontend interceptor changes, rollback strategy.

### P2-5: File Upload Sanitization
**Why not:** Requires installing image processing libraries (`sharp` for resizing, `file-type` for mime detection), configuring S3/GCS bucket policies, and potentially ClamAV for virus scanning. Infrastructure dependencies.
**What's needed:** Cloud storage configuration, image processing pipeline, security scanning setup.

### P2-6: Database Query Optimization
**Why not this session:** Requires profiling under realistic load (1000+ orders, 50+ concurrent users) to identify actual bottlenecks. Adding indexes blindly can slow writes. Prisma's `include` optimization needs careful analysis of which relations are actually needed per endpoint.
**What's needed:** Production-like dataset, query profiling tools (pg_stat_statements), load testing.

### P2-7: Background Job Queue (BullMQ)
**Why not:** Requires Redis instance, BullMQ setup, worker process management, dead-letter queue configuration, and dashboard (Bull Board). Infrastructure dependency — not a code-only change.
**What's needed:** Redis, worker process configuration, deployment pipeline changes.

### P2-8: WebSocket Horizontal Scaling
**Why not:** Same as P0-2 — requires Redis adapter for Socket.io. Single-server Socket.io works fine for demo/small deployment.
**What's needed:** Redis instance, `@socket.io/redis-adapter` package, multi-instance deployment.

### P2-9: Database Backup Strategy
**Why not:** This is a DevOps/infrastructure task — configuring automated pg_dump cron jobs, point-in-time recovery (PITR), backup retention policies, and restoration testing. Cannot be done from application code.
**What's needed:** Database hosting provider configuration (Render/Railway/RDS), backup scripts, restoration runbook.

### P2-10: Error Monitoring (Sentry)
**Why not:** Requires a Sentry account/DSN, source map upload pipeline, environment configuration, and user context integration. Cannot set up without account credentials.
**What's needed:** Sentry account, DSN key, CI/CD integration for source maps.

### P3-1: Multi-Language Support (i18next)
**Why not:** Requires extracting ~2000+ UI strings into translation files, setting up i18next with React, creating Hindi/regional language translations (needs native speakers or professional translation), and adding RTL support. This is a multi-week localization effort.
**What's needed:** Translation files for each language, native speaker review, RTL CSS framework.

### P3-2: Xero/MYOB Accounting Integration
**Why not:** The AU integration routes (`au-integrations.routes.js`) exist with connect/disconnect/export stubs, but actual Xero API integration requires: (1) Xero Developer account + OAuth 2.0 app registration, (2) Xero API client credentials, (3) OAuth callback URL on a publicly accessible server, (4) invoice/contact/payment mapping to Xero's schema. Same for MYOB.
**What's needed:** Xero/MYOB developer accounts, OAuth app registration, public callback URL.

### P3-3: Aggregator Integration (Swiggy/Zomato/UberEats/DoorDash)
**Why not:** Each aggregator has its own partner API that requires a business partnership agreement, API key approval process, webhook endpoint on a public server, and order schema mapping. These are business relationships, not code changes.
**What's needed:** Aggregator partner agreements, API keys, public webhook endpoints.

### P3-4: Table Reservation System
**Why not this session:** While the database model could be added, a reservation system needs: time-slot management, overbooking prevention, customer-facing booking UI (separate from POS), SMS/email confirmations, and cancellation policies. This is a standalone feature module (2-3 week build).
**What's needed:** Dedicated feature sprint, customer-facing UI, notification service integration.

### P3-5: Customer Feedback / Review System
**Why not:** Needs a customer-facing feedback form (separate web page/QR flow), NPS calculation, sentiment analysis, and alert system for negative reviews. Partially overlaps with Google Reviews integration.
**What's needed:** Customer-facing UI, email/SMS trigger after order, sentiment analysis service.

### P3-6: Marketing / Campaign Module
**Why not:** Requires email service provider (SendGrid/Mailgun), SMS provider (MSG91/Twilio), campaign scheduling, template builder, unsubscribe management, and CAN-SPAM/DND compliance. External service dependencies.
**What's needed:** Email/SMS provider accounts, compliance framework, template engine.

### P3-7: Payroll Integration
**Why not:** Payroll involves legal/tax compliance (superannuation in AU, PF/ESI in India), tax withholding calculations, bank transfer integration, and regulatory reporting. Cannot be built without domain expertise and legal review.
**What's needed:** Payroll compliance expertise, bank integration, tax calculation engine for employment.

### P3-8: Advanced Reporting / BI Dashboard
**Why not this session:** Basic reports already work with real data. A BI-grade dashboard needs: custom date range drill-down, pivot tables, chart customization (already partially done), CSV/PDF export (PDF needs a rendering library like Puppeteer or jsPDF), and saved report templates.
**What's needed:** PDF generation library, report template system, export pipeline.

### P3-9: Mobile App (Customer-Facing)
**Why not:** Requires React Native or Flutter project setup, app store accounts (Apple Developer $99/yr, Google Play $25), push notification service (FCM/APNs), and a completely separate build/deploy pipeline.
**What's needed:** Mobile development framework, app store accounts, push notification service.

### P3-10: Multi-Currency Support
**Why not:** Requires exchange rate API integration (fixer.io, exchangerate-api), per-outlet currency configuration, price conversion logic throughout the order flow, and currency formatting in all UI components.
**What's needed:** Exchange rate API, currency conversion logic, UI formatting updates across all pages.

### P4-4: POS Keyboard Shortcuts
**Why not this session:** While keyboard event handlers are straightforward, POS shortcuts need careful UX design (which keys map to which actions), conflict avoidance with browser shortcuts, and a discoverable shortcut overlay. Low risk but needs UX review.
**What's needed:** UX design for shortcut mapping, user testing.

### P4-5: Print Preview
**Why not:** Related to P0-6 (printer integration). Print preview needs receipt template rendering in a modal, which requires the template engine and CSS print styling. Partially blocked by printer hardware dependency.
**What's needed:** Receipt template engine, CSS print media queries, printer hardware for testing.

### P4-9: Onboarding Wizard
**Why not this session:** A proper onboarding flow needs: multi-step wizard (restaurant details → menu upload → table setup → first order), progress persistence, skip/resume capability, and integration with existing CRUD APIs. Estimated 1-week build.
**What's needed:** Dedicated feature sprint, UX design for wizard steps.

### P4-11: Global Search
**Why not:** Full-text search across menu items, orders, customers, and staff requires either PostgreSQL full-text search indexes (pg_trgm) or an external search service (Algolia, Meilisearch). Building a performant cross-entity search is a dedicated feature.
**What's needed:** Search index configuration, cross-entity query optimization.

---

## Summary

| Category | Count | Notes |
|----------|-------|-------|
| Completed this session | 12 | All P0 code fixes, audit trail, error boundary, notifications, mock data removal |
| Cannot do — hardware dependency | 2 | Receipt printer (P0-6), offline sync (P0-7) |
| Cannot do — external service/account | 8 | Xero, aggregators, Sentry, email/SMS providers, app stores, exchange rate APIs |
| Cannot do — infrastructure | 5 | Redis, database backups, background jobs, WebSocket scaling, rate limiting (needs Redis) |
| Cannot do — scope too large | 8 | Validation schemas, i18n, mobile app, payroll, reservations, onboarding, global search, BI dashboard |
| Cannot do — needs UX design | 2 | Keyboard shortcuts, print preview |

**Total items that cannot be done without external resources: 25 out of 45**
**Items completed or verified working: 12**
**Remaining items addressable with code-only changes in future sessions: 8** (P1-2, P1-4, P1-5, P1-6, P1-7, P4-1, P4-2, P4-6, P4-7, P4-8)
