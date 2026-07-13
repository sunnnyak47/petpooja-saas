# Superadmin Fixes — Tracking Log

Running log of every super-admin fix/change, so each item is documented before/while it's changed. Covers **both** deploy targets:

- **Main-app super-admin** — role `super_admin` inside `frontend/` → served on **Vercel (main)** AND bundled into the **desktop DMG** (`desktop/frontend-dist`). A fix here ships to both once the frontend is rebuilt.
- **Standalone admin app** — `superadmin-frontend/` → Vercel project **`petpooja-admin`** (Vercel-only, NOT in the DMG).
- **Backend** — `backend/src/modules/superadmin/` (routes `/api/superadmin/*`) → Render.

**Status legend:** 🔴 open · 🟡 in progress · 🟢 fixed in code · ✅ deployed (note where: Vercel / DMG / Render)

---

## SA-001 — "Analytics" tab shows the "Restaurant Chains" interface (same screen)

**Where:** Main-app super-admin sidebar → affects **Vercel (main) + DMG**.

**Symptom:** Clicking **Analytics** shows the exact same page as **Restaurant Chains**.

**Root cause (traced):**
- Sidebar `frontend/src/layouts/DashboardLayout.jsx`:
  - line 38 — `Analytics` → path `/`
  - line 39 — `Restaurant Chains` → path `/super-admin`
- Route `/` (index) → `<HomeRedirect/>` (`frontend/src/App.jsx:254`), and for `super_admin` HomeRedirect `return <SuperAdminPage/>` (`App.jsx:176`).
- Route `/super-admin` → `<SuperAdminPage/>` (`App.jsx:301`).
- `SuperAdminPage.jsx` IS the Restaurant-Chains management list (`activeTab` defaults to `'chains'`, fetches `/ho/chains`).
- ⇒ Both nav items render the **identical `SuperAdminPage`** → identical screen.

**Fix (implemented):** New page **`frontend/src/pages/PlatformAnalyticsPage.jsx`** — a platform overview dashboard bound to `/superadmin/dashboard` (KPIs: total restaurants, active licenses, expiring soon, MRR; revenue growth; platform health; live activity stream) + `/superadmin/live-stats` (platform-wide orders/revenue today). Theme-aware (main-app `.card` + CSS vars, light/dark). Wired in `frontend/src/App.jsx`: `HomeRedirect` now returns `<PlatformAnalyticsPage/>` for `super_admin` (was `<SuperAdminPage/>`). `/super-admin` still renders `SuperAdminPage` (chains). One shared-frontend change → applies to Vercel + DMG.

**Files:** `frontend/src/pages/PlatformAnalyticsPage.jsx` (new), `frontend/src/App.jsx` (import + HomeRedirect).

**Status:** 🟢 fixed in code — `npm run build` clean. ⏳ **Not yet deployed** — needs: Vercel = commit + push to `main`; DMG = rebuild. NOTE: the working tree also holds the uncommitted offline-POS changeset, so deploying must be coordinated (see below).

---
## SA-002 — Feature Access missing toggles for newer AU/IN modules

**Where:** Super-admin → Feature Access (main app) + the owner nav it controls → **Vercel (main) + DMG**.

**Symptom:** The enable/disable list has fewer features than the app now ships — no toggle for Accounting, Payroll, and other AU/IN region modules.

**Root cause (traced):**
- `FeatureAccessPage.jsx` renders `feature_definitions` from `GET /superadmin/chains/:id/features`, which returns `superadminService.ALL_FEATURES` (`backend/.../superadmin/services/onboarding.service.js:614`). That catalog had 28 modules and was missing the newer region ones.
- Those modules existed in the app but the owner nav gated them all on the generic `reports`/`menu` keys (`frontend/src/layouts/DashboardLayout.jsx`), so even a toggle wouldn't have controlled them.

**Fix (implemented):**
- **Backend** `ALL_FEATURES`: added 8 entries in a new **"Finance & Compliance"** group with a `region` tag — `financials`(AU), `accounting`(AU), `payroll`(AU), `fixed_assets`(AU), `budgets`(AU), `gst_returns`(IN), `customer_invoices`, `menu_analytics`. New features default ON (existing chains keep them), so no regression.
- **Frontend nav** (`DashboardLayout.jsx`, both owner nav arrays): repointed those items from `reports`/`menu` to their own feature keys, so a super-admin toggle now actually shows/hides the module (still region-gated by AU/IN as before).
- **FeatureAccessPage.jsx:** added the "Finance & Compliance" category color + an AU/IN region badge on each toggle card.

**Files:** `backend/src/modules/superadmin/services/onboarding.service.js`, `frontend/src/layouts/DashboardLayout.jsx`, `frontend/src/pages/FeatureAccessPage.jsx`.

**Status:** 🟢 fixed in code — backend `node --check` OK, frontend `npm run build` clean. ⏳ Not yet deployed (Vercel commit + push; Render commit for the backend catalog; DMG rebuild) — batched with SA-001.

---
## SA-003 — Announcement/Broadcast type colours swapped (Warning vs Maintenance)

**Where:** Announcements + Broadcast Center (compose) → Vercel (main) + DMG.
**Root cause:** `AnnouncementsPage.jsx` and `BroadcastPage.jsx` had `warning = amber (#f59e0b)`, `maintenance = red (#ef4444)`.
**Fix:** swapped → `warning = red (#ef4444)` (more urgent), `maintenance = amber (#f59e0b)`, in both files (colour + bg).
**Status:** 🟢 fixed in code — build clean. ⏳ deploy (Vercel + DMG).

## SA-005 — Revenue Analytics needed a hard refresh to update

**Where:** Super-admin → Revenue Analytics → Vercel (main) + DMG.
**Root cause:** `RevenueAnalyticsPage` query had `staleTime: 5min`, no `refetchInterval` → values only updated on remount/hard reload.
**Fix:** `staleTime: 15s` + `refetchInterval: 30s` + `refetchOnWindowFocus: true` → live/soft updates; the Refresh button already soft-refetches.
**Status:** 🟢 fixed in code — build clean. ⏳ deploy (Vercel + DMG).

## SA-007 — Platform Staff: role dropdown blank on create

**Where:** Super-admin → Platform Staff → Vercel (main) + DMG.
**Root cause (most likely):** the dropdown is fed by `GET /superadmin/staff/roles`. The frontend wiring is correct (interceptor unwraps to body; `.then(r=>r.data)` yields the array), and `super_admin` bypasses the permission — so a blank list points to the endpoint being **unavailable on the deployed backend (Render deploy lag)** or the acting account lacking scope.
**Fix:** `PlatformStaffPage.jsx` — `roleList` now falls back to a built-in list of platform roles (Platform Admin / Support Agent / Billing Manager / Super Admin) when the API returns none, so the dropdown is never blank. Deploying the backend also restores the live list.
**Status:** 🟢 fixed in code (resilient) — build clean. ⏳ deploy (Vercel + DMG); backend redeploy recommended.

## SA-004 — Invoicing "Generate Invoices" → "Access Denied: SuperAdmin only" for a super-admin

**Where:** Super-admin → Invoicing → backend `POST /superadmin/invoices/generate`.
**Diagnosis (NOT yet a code change):** the message is emitted by `requirePlatformPermission` / `isSuperAdmin` (`backend/src/middleware/auth.middleware.js:175-206`) ONLY when `!isPlatformRole(req.user.role)` — i.e. the acting JWT's `role` is **not a platform role at all** (not `super_admin` / `platform_*`). A genuine `super_admin` bypasses every permission (line 198), so generate would succeed. ⇒ the account being used (Sunnnyt71@gmail.com) is authenticated with a **non-platform role** (e.g. a restaurant `owner`/`admin`) even though the super-admin UI is showing.
**Multiple-superadmin check:** cannot be run from here (no prod DB access). Verify via the super-admin **All Users** / **Platform Staff** page: confirm which account actually holds `role = 'super_admin'`. If Sunnnyt71@gmail.com is NOT that account, that's the conflict — set its `role` to `super_admin` (or grant it the `platform_billing`/`sa.billing.manage` scope) and re-login to refresh the JWT.
**ROOT CAUSE FOUND (from Render env):** `SUPERADMIN_EMAIL = sunnnyt71@gmail.com` — so that account IS meant to be the super-admin. But `prisma/seed.js` **renamed** the legacy super-admin's email to `SUPERADMIN_EMAIL`; since `sunnnyt71@gmail.com` already existed (as an owner), the rename hit the `@unique` email constraint and failed — leaving `super_admin` on `admin@petpooja.com` and `sunnnyt71@gmail.com` as a plain owner (403 everywhere). Login builds the JWT from the `is_primary` role (`auth.service:226`).

**Fix (implemented — code + data):**
- **Seed rewritten** (`prisma/seed.js`): find-or-create the super-admin BY EMAIL (no rename/collision); grant super_admin as the **primary** role; demote the user's other roles; and **demote every other super_admin** (legacy `admin@petpooja.com`). Idempotent — safe to re-run; runs on every Render deploy.
- **Immediate SQL** provided for Supabase (promote sunnnyt71 to primary super_admin, demote admin@petpooja.com) for a no-deploy fix. After either path: **log out/in** to refresh the JWT.

**Status:** 🟢 fixed — seed `node --check` OK. Apply via re-seed (next deploy or Render Shell `node prisma/seed.js`) OR the one-off SQL. Resolves SA-004 + SA-008 (audit/error/invoicing) together. No prod DB access from here, so the owner runs the SQL / triggers the re-seed.

## SA-006 — Support Tickets: no owner-side module to raise/view tickets

**Where:** Owner apps (IN + AU) — Vercel (main) + DMG; backend.
**Diagnosis:** the super-admin has a Support Tickets manager, and the backend `/superadmin/support-tickets` endpoints are **super-admin-only**. There is **no owner-facing** support page/nav, and no owner-scoped endpoint, so restaurant owners have no way to submit a ticket — the super-admin inbox can only ever be empty of owner-raised tickets.
**Fix (proposed — feature build):** add (a) an owner-scoped backend endpoint (`POST/GET /support/tickets` under normal auth, tenant-scoped to the owner's head office), (b) an owner-side "Support / Help" page + nav link in the main app, (c) surface owner-raised tickets in the existing super-admin Support Tickets page.
**Fix (implemented):**
- **Backend** new module `backend/src/modules/support/` (routes + controller + validation), mounted `/api/support` in `app.js`. Owner-scoped (normal `authenticate`), tenant-scoped to `req.user.head_office_id`: `GET /support/tickets` (my chain's tickets), `POST /support/tickets` (raise — stamps chain_id/name + owner email), `POST /support/tickets/:id/reply` (owner reply, ownership-checked). Reuses the super-admin `superadminService` ticket store (same SystemConfig array), so owner tickets appear in the super-admin Support inbox automatically — no super-admin change.
- **Frontend** new `frontend/src/pages/SupportPage.jsx` (list my tickets, raise ticket modal, status/priority badges, threaded replies), route `/support` in `App.jsx`, and a **Support** nav item added to BOTH owner navs (`ownerNav` = IN, `ownerNavAU` = AU) so it shows for both countries.

**Files:** `backend/src/modules/support/{routes,controller,validation}.js`, `backend/src/app.js`, `frontend/src/pages/SupportPage.jsx`, `frontend/src/App.jsx`, `frontend/src/layouts/DashboardLayout.jsx`.

**Status:** 🟢 fixed in code — backend `node --check` + ticket methods verified; frontend build clean. ⏳ deploy (Render backend + Vercel + DMG).

---
## SA-008 — Audit Trail + Error Monitor "Could not load data" (⇒ same root cause as SA-004)

**Where:** Super-admin → Audit Trail (`/platform-audit-log` → `PlatformAuditLogPage` → `GET /superadmin/audit-log`) and Error Monitor (`/error-dashboard` → `ErrorDashboardPage` → `GET /monitoring/stats` + `/monitoring/errors`).

**Investigation (definitive):**
- Verified the code is correct: `getPlatformAuditLog` + `getAuditLog` both exist (and `getAuditLog` try/catches → `[]`, never 500); `ErrorLog` model exists (`schema.prisma:2673`); `/monitoring/stats` route exists. No code bug.
- **Probed the live backend unauthenticated** — `/superadmin/audit-log`, `/monitoring/stats`, `/monitoring/errors`, `/superadmin/invoices/generate` **all return 401** (mounted + auth-required), NOT 404. So **not a deploy gap** either.
- ⇒ "Could not load data" is a **403** — the acting account (Sunnnyt71@gmail.com) is authenticated but the backend does not see it as `super_admin`. All three endpoints are `sa.audit.view` / `sa.billing.manage`-gated; a true `super_admin` bypasses everything (`auth.middleware:198`).

**Root cause = SA-004.** The **real** super-admin is the seeded account `process.env.SUPERADMIN_EMAIL` (default `admin@petpooja.com`, `prisma/seed.js:80`). Sunnnyt71@gmail.com is a different account whose backend role isn't `super_admin`, while the frontend still renders the super-admin UI off a cached `user.role`.

**Resolution (no code change — data/account):**
1. **Log in as the real super-admin** (`SUPERADMIN_EMAIL` / `admin@petpooja.com`) → Audit, Error Monitor, and Invoicing all work immediately; OR
2. Grant Sunnnyt71 the `super_admin` role in the DB (add a `user_roles` row: role `super_admin`, `outlet_id = null`) — requires DB access (cannot be done from here); then log out/in to refresh the JWT.

**Status:** 🟡 diagnosed — **not a code fix.** Optional code polish available on request: make the Audit/Error pages show "Your account lacks super-admin permission" instead of the generic "Could not load data" on a 403.

---
<!-- Add new entries below as SA-009, … -->
