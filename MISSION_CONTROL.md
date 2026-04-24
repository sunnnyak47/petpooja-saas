# 🎯 MISSION CONTROL - Master Handoff

Use the prompt below to transition this project to another AI agent (Claude Code, etc.). This prompt contains the exact context needed to continue.

---

## 📥 THE HANDOFF PROMPT (Copy/Paste this)

```markdown
# MISSION: CONTINUE PETPOOJA ERP DEVELOPMENT

You are picking up a production-grade Restaurant ERP (Petpooja clone). 
The project has a modular Node.js backend, a React frontend, and an Electron Desktop POS wrapper with an offline-first SQLite engine.

## CURRENT CONTEXT
- **Core Phase**: Phase 7 (Final Polish & Hardware).
- **Recent Milestone**: Finalized Desktop POS Shell with SQLite offline storage and background Sync Engine.
- **Critical Fixes**: Fixed "Blank Screen" issues by switching to HashRouter for Electron and correcting missing React imports in LoginPage.

## TECH STACK
- Backend: Node 20, Express, Prisma, PostgreSQL, Redis.
- Frontend: React 18, Vite, Tailwind, Redux Toolkit.
- Desktop: Electron 28, better-sqlite3 (Offline Engine).
- Deploy: Vercel (Frontend), Render (Backend).

## PROJECT STRUCTURE
- /backend: Modular API (auth, menu, orders, inventory, etc.)
- /frontend: Restaurant Dashboard & POS UI.
- /desktop: Electron wrapper + localDB logic + SyncEngine.
- /scripts: Build automation for installers.

## YOUR IMMEDIATE TASKS
1. Read `PROJECT_STATUS.md` for the latest checklist.
2. Read `ARCHITECTURE.md` to understand the Hybrid Cloud/Offline model.
3. **Current Active Problem**: The system is stable, but we need to finalize the "Sync Conflict Resolution" (what happens if an order is edited offline and deleted online?).
4. **Next Feature**: Implement local Thermal Printer discovery via the `node-thermal-printer` integration in `desktop/src/main.js`.

## CONSTITUTION
Always follow the rules in `AGENTS.md` (or `GEMINI.md`). Never use placeholders. Always write production-ready code. No Hard Deletes. Every query must have `outlet_id`.

Are you ready to continue? Begin by verifying the local database schema in `desktop/src/database/localDB.js`.
```

---

## 🔗 DOCUMENTATION LINKS
- [Architecture Overview](file:///Users/sunnythakur/Desktop/Petpooja/ARCHITECTURE.md)
- [Project Status & TODOs](file:///Users/sunnythakur/Desktop/Petpooja/PROJECT_STATUS.md)
- [Master Agent Rules](file:///Users/sunnythakur/Desktop/Petpooja/AGENTS.md)
