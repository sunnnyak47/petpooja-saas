# Current Problems & Challenges

Last Updated: 2026-04-28 IST

---

## 1. Staged Non-Code Metadata

Current staged files are only metadata:
- `.DS_Store`
- `.claude/worktrees/festive-jepsen-ecffa7`
- `backend/.DS_Store`
- `backend/coverage/.DS_Store`

Required:
- Unstage/remove from the next production commit unless the user explicitly asks to keep them.

---

## 2. macOS DMG Code Signing

Current local DMG artifacts exist for `MS-RM System 2.0.3`, but signing credentials are not confirmed.

Required:
- Add Apple Developer certificate secrets for Electron Builder.
- Verify notarization flow before public distribution.

---

## 3. Deployment Verification Gap

GitHub main is ahead with many new modules, but Vercel/Render live deployment status must be verified after builds finish.

Required:
- Verify `https://petpooja-saas.onrender.com/health`.
- Verify frontend on `https://petpooja-saas.vercel.app`.
- Verify superadmin on `https://petpooja-admin.vercel.app`.

---

## 4. Desktop First-Sync UX

On first launch, SQLite may be empty until cloud sync hydrates menu/table/staff cache.

Required:
- Add first-sync progress screen before POS entry.
- Show clear retry state if backend is unreachable.

---

## 5. Windows Installer Pipeline

Windows build from macOS can fail because of Wine/native dependencies.

Required:
- Add GitHub Actions `windows-latest` build for `.exe`/NSIS installer.

---

## 6. Test Coverage

New modules need coverage:
- Dynamic pricing
- Festival mode
- Fraud detection
- Mock third-party integrations
- Australian franchise/rostering/integrations
- Desktop sync conflict paths

Required:
- Add focused Jest/Supertest coverage before calling Phase 7 fully complete.
