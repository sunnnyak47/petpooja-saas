# 🍽️ Petpooja ERP - Production Management System

Welcome to the Petpooja ERP repository. This is a multi-tenant, offline-first Restaurant Management System.

---

## 🚀 GETTING STARTED
If you are an AI agent taking over this project, please start here:

1. **[MISSION CONTROL (MASTER PROMPT)](./MISSION_CONTROL.md)**: Copy and paste the prompt in this file to begin.
2. **[PROJECT STATUS](./PROJECT_STATUS.md)**: Current roadmap, completed tasks, and TODOs.
3. **[ARCHITECTURE OVERVIEW](./ARCHITECTURE.md)**: Deep dive into the tech stack and offline-first engine.
4. **[CURRENT PROBLEMS](./CURRENT_PROBLEMS.md)**: Known bugs and high-priority technical debt.

---

## 📂 PROJECT STRUCTURE
- `/backend`: Node.js/Prisma API.
- `/frontend`: Main POS & Dashboard (React).
- `/desktop`: Electron Shell with SQLite Offline storage.
- `/superadmin-frontend`: Global platform control panel.
- `/kitchen`: Kitchen Display Screen (KDS).
- `/shared`: Shared business logic and constants.
- `/scripts`: Build automation.

---

## 🛠️ QUICK COMMANDS
- **Run Backend**: `cd backend && npm start`
- **Run Frontend**: `cd frontend && npm run dev`
- **Build Desktop**: `./scripts/build.sh [mac|win]`

---

## ⚖️ CONSTITUTION
Refer to **[AGENTS.md](./AGENTS.md)** for non-negotiable coding rules and the project constitution.
