# Petpooja ERP Work Sync
# Last Updated: 2026-04-28 IST
# Maintainer: Codex + Claude Code handoff

This is the working source of truth for continuing development across Codex and Claude Code. Read `AGENTS.md` first, then this file, then `PROJECT_STATUS.md`.

---

## Current Snapshot

- Phase: Phase 7+ production polish and expansion.
- Latest local branch: `main`.
- Latest GitHub `main`: `eff67c5c0c19f18efc4e48fed262e5bcac960402`.
- Latest visible commit: `eff67c5 feat: Australian Multi-Region Franchise — Phase 1-3 + Rostering + AU Integrations`.
- Repo remote: `git@github.com:sunnnyak47/petpooja-saas.git`.
- HTTPS push fallback works: `https://github.com/sunnnyak47/petpooja-saas.git`.

Current staged non-code files seen on 2026-04-28:
- `.DS_Store`
- `.claude/worktrees/festive-jepsen-ecffa7`
- `backend/.DS_Store`
- `backend/coverage/.DS_Store`

Do not include these in production commits unless the user explicitly asks. Clean or unstage them before the next code commit.

---

## Recent Completed Work

- Mock third-party integration endpoints for Zomato, Swiggy, Razorpay, WhatsApp, and Tally.
- Desktop offline sync conflict audit and deterministic conflict handling.
- Thermal printer LAN discovery with `node-thermal-printer`.
- Dynamic Pricing Engine.
- Hyperlocal Festival Mode.
- Staff Fraud Detection with risk scoring and silent owner alerts.
- Desktop frontend distribution sync for pricing, festival, and fraud features.
- Australian Multi-Region Franchise work: Phase 1-3, rostering, and AU integrations.

---

## Backend Updates

Runtime:
- Node.js 20+.
- Express backend entry: `backend/src/app.js`.
- Prisma/PostgreSQL with Redis support.

New/active modules:
- `backend/src/modules/pricing`
- `backend/src/modules/festival`
- `backend/src/modules/fraud`
- `backend/src/modules/ondc`
- `backend/src/modules/voice-pos`
- `backend/src/modules/central-kitchen`
- `backend/src/mock-integrations`

Mounted API areas:
- `/api/pricing`
- `/api/festival`
- `/api/fraud`
- `/api/ondc`
- `/api/voice-pos`
- `/api/integrations`
- `/mock`
- `/test/order-flow`

Mock test command:
```bash
cd /Users/sunnythakur/Desktop/Petpooja/backend
MODE=mock PORT=5099 npm start
curl http://127.0.0.1:5099/test/order-flow
```

Known backend note:
- Local startup may log Redis initialization failure if Redis env/service is unavailable. Mock endpoints do not require Redis.

---

## DMG / Electron Desktop Updates

Desktop app path:
- `desktop/`

Current package:
- Version: `2.0.3`
- Product name: `MS-RM System`
- App id: `com.petpoojaerp.app`
- Main process: `desktop/src/main.js`
- Preload bridge: `desktop/src/preload.js`
- Local SQLite: `desktop/src/database/localDB.js`
- Sync engine: `desktop/src/sync/syncEngine.js`

Local DMG artifacts currently present:
- `desktop/dist/MS-RM System-2.0.3.dmg`
- `desktop/dist/MS-RM System-2.0.3-arm64.dmg`
- `desktop/dist/MS-RM System-2.0.3.dmg.blockmap`
- `desktop/dist/MS-RM System-2.0.3-arm64.dmg.blockmap`
- `desktop/dist/latest-mac.yml`

Important:
- `desktop/dist/` is gitignored. DMG binaries are local release artifacts, not normal source commits.
- macOS signing is still a production blocker unless Apple Developer signing credentials are configured.
- Build command: `cd desktop && npm run build:mac`.
- Release helper: `scripts/release.sh`.

---

## Vercel Updates

Known frontend URLs:
- Restaurant POS/Dashboard: `https://petpooja-saas.vercel.app`
- SuperAdmin: `https://petpooja-admin.vercel.app`
- Kitchen route: `https://petpooja-saas.vercel.app/kitchen`

Expected deploy flow:
- Push to GitHub `main`.
- Vercel auto-deploys connected frontend projects.
- Verify the deployed app after each push because local source may be ahead of Vercel while deployment is building.

Frontend env:
```bash
VITE_API_URL=https://petpooja-saas.onrender.com/api
VITE_SOCKET_URL=https://petpooja-saas.onrender.com
```

---

## Render Updates

Known backend URL:
- `https://petpooja-saas.onrender.com`

Health endpoint:
- `https://petpooja-saas.onrender.com/health`

Expected deploy flow:
- Push backend changes to GitHub `main`.
- Render auto-deploys backend from the connected repo.
- Verify `/health`, `/api`, and any changed endpoints after deployment.

Mock deployment verification after Render finishes:
```bash
curl https://petpooja-saas.onrender.com/test/order-flow
```

---

## Supabase / PostgreSQL Updates

Current database role:
- Supabase/PostgreSQL is used through `DATABASE_URL`.
- Prisma schema lives at `backend/prisma/schema.prisma`.
- Raw SQL schema also exists at `backend/src/database/schema.sql`.

No local `supabase/` migration directory was present on 2026-04-28.

Rules to preserve:
- Multi-tenant queries must include `outlet_id` where applicable.
- Soft deletes only.
- Audit sensitive actions.

Before any DB deploy:
```bash
cd backend
npm run prisma:validate
```

---

## GitHub Updates

Repo:
- `sunnnyak47/petpooja-saas`

Latest known pushed `main`:
- `eff67c5c0c19f18efc4e48fed262e5bcac960402`

Recent important commits:
- `eff67c5 feat: Australian Multi-Region Franchise — Phase 1-3 + Rostering + AU Integrations`
- `b2d9a6e chore: sync desktop frontend-dist — Dynamic Pricing + Festival Mode + Fraud Detection`
- `1cbae4a feat: Staff Fraud Detection — 7-rule AI engine, risk scoring, silent WhatsApp owner alerts, staff risk profiles`
- `17d1323 feat: Hyperlocal Festival Mode — India/Australia calendar, state-specific modes (Sadhya/Lohri/Pongal), menu suggestions, theme activation`
- `c6da563 feat: Dynamic Pricing Engine — time/day/weather/season rules, live price computation, analytics`

Push command:
```bash
git push https://github.com/sunnnyak47/petpooja-saas.git main
```

---

## Next Work Queue

1. Clean staged non-code files before the next production commit.
2. Verify latest backend after Render deploy.
3. Verify latest frontend after Vercel deploy.
4. Test desktop DMG `2.0.3` install and first launch on macOS.
5. Configure macOS code signing for DMG release.
6. Add GitHub Actions for Windows installer build.
7. Add first-sync progress screen for empty SQLite hydration.
8. Expand Jest/Supertest coverage for new pricing, festival, fraud, mock integration, and AU modules.

---

## Start Here Prompt

Use this when handing off to another coding agent:

```text
Read AGENTS.md, WORK_SYNC.md, PROJECT_STATUS.md, and CURRENT_PROBLEMS.md first. Continue from the latest GitHub main commit eff67c5. Do not commit staged .DS_Store or Claude worktree metadata. Verify Render/Vercel after any push. Keep DMG artifacts local unless the user explicitly asks for release upload.
```
