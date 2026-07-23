# High Timeline

High Timeline is an installable, offline-first personal journal for recording the changing shape of a self-reported cannabis session. It is neutral, private, and entirely local: no account, backend, analytics, advertising, location, or API key.

This is not a medical or sobriety test. It does not determine impairment or whether someone is safe to drive or operate machinery.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- A current Chromium, Firefox, or Safari browser with IndexedDB enabled

## Setup and development

```bash
npm install
npm run dev
```

Open the local URL Vite prints, normally `http://localhost:5173`.

## Checks and tests

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
npx playwright install chromium
npx playwright test
```

Vitest covers the pure interval/summary engine, deterministic ordering and boundaries, backup validation, and key React interactions. Playwright performs the complete multi-peak mobile journey, validates persistence and export, checks console/request failures, and writes verified screenshots to `artifacts/screenshots/`.

## Production build and offline preview

```bash
npm run build
npm run preview
```

Open the preview URL once while online so the service worker can precache the app shell. Then reload it offline using browser developer tools to verify the cached shell. PWA behavior is available in the production build, not the ordinary development server.

## Android APK

The Android project is a thin Capacitor shell around the same local-first web application. It does not add accounts, cloud sync, analytics, or location access.

With Android Studio installed (including its bundled JDK and Android SDK):

```bash
npm run android:apk
```

The debug APK is written to `artifacts/android/high-timeline-debug.apk`. The build helper compiles in the operating system’s temporary directory so it also works when the repository lives on an external macOS drive. The APK is intended for direct testing and is signed with the standard Android debug key, not a production release key.

## Main routes

- `/` — dashboard and active-session resume
- `/session/new` — quick session start
- `/session/:id/live` — one-handed live recording
- `/session/:id/summary` — derived recap and anonymous share card
- `/session/:id/edit` — safe timeline and boundary editing
- `/history` — searchable/filterable list or calendar layout
- `/insights` — local personal patterns and confidence-labelled product cards
- `/settings` — theme, haptics, backup/CSV, import, demo data, and deletion
- `/about` — privacy and safety explanation

## Local data and backups

Dexie stores the versioned journal schema in IndexedDB. Session totals are derived from timeline events and are never treated as independent source data. Preferences and onboarding completion use localStorage.

JSON backups contain `schemaVersion: 1` and are fully validated before a single replacement transaction. CSV exports are human-readable and escape spreadsheet formula prefixes. Import replaces the local journal only after a valid preview; it does not merge silently. Fictional demo sessions are marked and can be removed separately.

## PWA limitations

- iOS installation is initiated manually through Safari’s Share → Add to Home Screen flow.
- This MVP does not implement push notifications or background next-day reminders. A reminder can only be flagged in the journal.
- Web PWAs cannot provide a portable, reliable biometric lock; use device/browser protections.
- IndexedDB can be removed by browser storage clearing, private-browsing cleanup, or OS storage pressure. Export backups you control.
- The Web Share API varies by browser. Share cards fall back to a local PNG download.
- There is no cloud sync. Data does not move between devices unless explicitly exported and imported.

## Documentation

- [`docs/PRD.md`](docs/PRD.md) — product-facing requirements
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data flow, calculations, privacy, PWA, and tests
- [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) — implementation sequence
