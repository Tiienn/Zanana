# Architecture and data model

## Application shape

React + TypeScript runs as a Vite PWA. React Router owns the URL-level screens. Dexie wraps a versioned IndexedDB database; `useLiveQuery` keeps screens synchronized with local mutations. No runtime network calls are used by application features.

## Storage

Schema version 1 has `sessions`, `events`, and `effects` tables. Sessions store boundaries and optional recap metadata. Timeline events are immutable-in-spirit journal facts that can be edited or removed; each has an ISO timestamp and monotonic `sequence` for deterministic ordering. Effects are definitions, with each `EFFECTS_UPDATE` event storing the complete active set at that moment. Preferences and onboarding state use localStorage because they are tiny device settings rather than journal records.

## Calculation rules

`src/domain/timeline.ts` is the source of truth. It stable-sorts state events by timestamp then sequence, collapses consecutive duplicate states, and creates intervals ending at the next state change or the session end/supplied `now`. Non-state events never split state intervals.

A peak is one contiguous visit to the peak band (`SUPER_HIGH` or `TOO_HIGH`). A direct transition between those two states remains one peak; leaving the band and later re-entering starts another. Super-high and too-high durations are summed independently. Missing milestones remain `null` and render as “Not recorded.” Every edit or deletion invokes the same full derivation.

## Privacy and sharing

Data remains on-device. JSON exports are schema-versioned and validated fully before a single database transaction replaces data. CSV exports escape spreadsheet-sensitive cells. Share cards are rendered locally to canvas; dates, times, notes, IDs, and product names are omitted by default.

## PWA behavior

`vite-plugin-pwa` generates the manifest and service worker. The app shell and static assets use precaching, so visited production builds reopen offline. There are no push notifications or background synchronization. iOS installation must be initiated from Safari’s Share menu; biometric locking is not available in this web MVP.

## Testing

Vitest covers timeline boundaries and backup validation/round trips. React Testing Library covers important UI interactions. Playwright drives the full multi-peak journey with a test-only clock exposed only in development/test mode. Production code continues to use real timestamps.
