# ⚠️ CURRENT PROBLEMS & CHALLENGES

This document tracks known issues, edge cases, and technical debt that need immediate attention.

---

## 1. 🔄 Sync Conflict Resolution (High Priority)
**Problem**: We have a "Last Write Wins" strategy currently.
- **Scenario**: A cashier edits an order offline. Meanwhile, the restaurant manager deletes that same order from the Cloud Dashboard.
- **Impact**: When the cashier comes online, the sync engine will try to "Update" a non-existent order or recreate a deleted one.
- **Required**: Implement a `deleted_at` timestamp check in `syncEngine.js` before pushing local updates.

## 2. 🖨️ Thermal Printer Discovery (Medium Priority)
**Problem**: The Setup Wizard asks for a Printer IP, but there is no "Test Print" or "Discovery" button.
- **Impact**: Non-technical cashiers might enter the wrong IP and get no feedback until a real order fails.
- **Required**: Add a `print-test` IPC handler in `main.js` that `SetupWizard.jsx` can call to verify connectivity.

## 3. 🍎 macOS Code Signing (Production Blocker)
**Problem**: The generated `.dmg` is unsigned.
- **Impact**: Users will see "App is damaged" or "Unknown Developer" warnings on macOS Sequoia and Sonoma.
- **Required**: Need a **p12 certificate** from Apple Developer Program to be injected into `electron-builder` (usually via GitHub Secrets).

## 4. ⚡ Database Hydration Lag (UI/UX)
**Problem**: On first launch, the local SQLite is empty. The first sync can take 3-5 seconds to download a large menu (500+ items).
- **Impact**: The POS might show "No items found" for a few seconds.
- **Required**: Add a "First Sync" progress bar to the `SetupWizard` before letting the user enter the POS.

## 5. 🪟 Windows Wine Compatibility
**Problem**: Building the Windows `.exe` on macOS via Wine is failing due to `FreeType` library issues.
- **Impact**: Cannot generate Windows installers from a Mac dev environment.
- **Required**: Set up **GitHub Actions** (windows-latest runner) to handle `.exe` generation.
