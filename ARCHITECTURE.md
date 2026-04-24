# 🏗️ Petpooja ERP - System Architecture

This document explains the high-level architecture of the Petpooja ERP system, including the hybrid Web/Desktop model and the Offline-First engine.

---

## 🌍 OVERALL TOPOLOGY
The system follows a **Cloud-Edge Hybrid** model.
- **Cloud**: Central PostgreSQL/Redis database + Node.js API (Render/Supabase).
- **Edge (Web)**: React application for remote management and QR ordering.
- **Edge (Desktop)**: Electron-wrapped POS terminal for stable, local operations.

---

## 💻 DESKTOP POS ARCHITECTURE (`/desktop`)
The desktop app is more than a browser wrapper; it is a full offline node.

### 1. Electron Shell
- **Main Process (`main.js`)**: Manages window state, auto-updates, and background services.
- **Preload (`preload.js`)**: Secure bridge (contextBridge) exposing hardware and database APIs.
- **Sync Engine (`syncEngine.js`)**: Orchestrates background data reconciliation.

### 2. Offline Database (`localDB.js`)
- Uses **SQLite (`better-sqlite3`)** for local persistence.
- Stores: Outlets, Menu, Categories, Tables, Orders, KOTs, and Staff.
- **Write-Ahead Logging (WAL)**: Enabled for high-concurrency performance.

### 3. Sync Strategy
- **Upload**: Pending orders are saved locally with a `sync_status = 'pending'`. The engine attempts to push them to the cloud API as soon as `isOnline` is true.
- **Download**: On app startup or network restoration, the app fetches the latest Menu and Table configurations from the cloud and overwrites the local SQLite cache.

---

## 🎨 FRONTEND DESIGN SYSTEM
Built with **React 18 + Vite + Tailwind CSS**.

### Dynamic Branding
The system fetches branding config (Name, Logo, Colors) from the SuperAdmin API.
- `useBranding.js`: Hook used across all panels to apply the current tenant/platform identity.
- `ThemeContext.jsx`: Manages the 10-theme selector logic and CSS variable injection.

### Routing Logic
- **Browser**: Uses `BrowserRouter` (standard).
- **Desktop**: Uses `HashRouter` to prevent issues with the `file://` protocol in packaged builds.

---

## 🛠️ BACKEND ARCHITECTURE
Standard **Modular Monolith** pattern.

### Directory: `/backend/src/modules`
Each feature is encapsulated:
- `auth/`: JWT + RBAC logic.
- `menu/`: Hierarchy management (Category > Item > Variant).
- `orders/`: Transactional logic for POS, QR, and Online orders.
- `inventory/`: Recipe-based stock deduction.
- `superadmin/`: Global platform control.

---

## 🔌 REALTIME ENGINE (Socket.io)
Namespaces are used to isolate traffic:
- `/orders`: POS terminal updates (New QR order alerts).
- `/kitchen`: KDS display updates (New KOTs).

---

## 🏗️ BUILD PIPELINE (`/scripts`)
- `build.sh`: A unified script to build the React frontend, copy it to the Electron resources, and package the cross-platform installers (.dmg/.exe).
