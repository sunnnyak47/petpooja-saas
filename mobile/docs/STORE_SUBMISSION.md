# Mobile store submission runbook (iOS + Android)

The app is **code-complete and emulator-verified**. What's left is entirely
**accounts, keys and store assets you supply** — no app code change is needed to
submit. This is the ordered checklist. Build/submit uses EAS (`eas.json` profiles
`development` / `preview` / `production` already exist).

Bundle IDs (already set in `app.json`): iOS `com.petpooja.owner`,
Android `com.petpooja.owner`.

---

## 0. Accounts (long lead-time — start first)
- [ ] **Apple Developer Program** — organisation enrolment needs a **D-U-N-S**
      number (can take 1–2 weeks). US$99/yr.
- [ ] **Google Play Console** — one-time US$25. New personal accounts must run a
      **14-day closed test with ≥12 testers** before production access — start
      this early.

## 1. Push notifications
- [ ] **Android (FCM):** in Firebase, add an Android app `com.petpooja.owner`,
      download `google-services.json`, drop it at `mobile/google-services.json`,
      then set in `app.json` → `android.googleServicesFile: "./google-services.json"`.
      (Left unset today so builds don't fail on the missing file — see the note in
      `app.json`'s `extra._notes`.)
- [ ] **iOS (APNs):** generate an APNs Auth Key (`.p8`) in the Apple Developer
      portal and upload it via `eas credentials` (Expo manages it — do **not**
      commit the `.p8`).
- The app's registration code (`src/lib/useNotifications.js`) and the backend
      Expo sender are already wired; delivery just needs these keys + a physical
      device (simulators can't receive push).

## 2. Crash reporting
- [ ] Create a Sentry project, then set the DSN **without editing code**: either
      `expo.extra.sentryDsn` in `app.json`, or an `EXPO_PUBLIC_SENTRY_DSN` EAS
      env/secret. Empty = disabled (safe). Wiring is in `src/lib/sentry.js`.

## 3. Submit credentials (referenced by `eas.json` → submit.production)
- [ ] **Android:** create a Play service account, grant it release permissions,
      download the JSON to `mobile/google-services-key.json` (git-ignored — never
      commit).
- [ ] **iOS:** set EAS secrets/env `EXPO_APPLE_ID`, `EXPO_ASC_APP_ID`,
      `EXPO_APPLE_TEAM_ID` (the iOS submit block reads these).

## 4. Store listing
- [ ] Copy is drafted in `mobile/store/listing.md` — paste into App Store Connect
      and the Play Console, adjust per market (AU vs IN).
- [ ] **Privacy Policy URL must be live** before submission (both stores reject
      without it) — publish the marketing sites first.
- [ ] Complete **Apple Privacy** + **Play Data Safety** forms (mirror
      `listing.md` → data-safety section).

## 5. Screenshots
Put device screenshots in `mobile/store/screenshots/<ios|android>/`.
- iOS: 6.7" (1290×2796) and 6.5" (1242×2688) — required. iPad optional.
- Android: phone (min 2, up to 8), plus a 1024×500 feature graphic.
- Capture from a seeded demo outlet (dashboard, POS, KDS, reports) — not real
  customer data.

## 6. Build & submit
```bash
cd mobile
# Android production app-bundle
eas build --platform android --profile production
eas submit --platform android --profile production

# iOS production build
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

## 7. Verify before release
- [ ] Install the production build on a **physical** iPhone + Android device
- [ ] Log in, take a test order offline, reconnect → confirm sync
- [ ] Send a test push from the backend → confirm it arrives on the device
- [ ] Confirm a forced error shows up in Sentry
- [ ] AU build shows A$/GST; IN build shows ₹/GST

---

### Reality check
Nothing here is code work — it's accounts (Apple/Google), keys (FCM/APNs/Sentry),
and store assets. Budget the **14-day Play closed test** and **D-U-N-S wait** into
your timeline; they gate the store date more than anything in the app.
