# Patient connections handoff (Claude → Codex)

Status: **implemented and verified against mocks: 67/67 browser checks, 10/10 unit tests,
build and lint pass** (re-run after the merge `7508e23`). This does not claim backend integration
is finished; only Codex can confirm it against live Supabase/Backend.

Write scope: only `Frontend/src/features/connections/**`. No dependencies, shared files,
env files or git index changes. Exports unchanged: `PatientConnectPage({ code })`, `PatientAccountPage()`.

## Files

| File | Change |
| --- | --- |
| `connectionSync.ts` (new) | Pure rules: `RequestSync` (session generation + read/mutation ordering), `applyServerRequest`, `sortPatientRequests`, `newlyAccepted`, `requestForDoctor`, `describeMutationFailure` |
| `connectionSync.test.ts`, `testHarness.ts` (new) | 10 Node tests, no framework |
| `usePatientConnections.ts` | Rewritten (see below) |
| `useProfileRefresh.ts` (new) | Explicit care-team refresh with pending state and duplicate guard |
| `format.ts` (new) | Request date / last-updated formatting, device locale |
| `PatientAccountPage.tsx`, `PatientConnectPage.tsx`, `ConnectionStatus.tsx`, `connections.css` | Per-request pending/error/retry, refresh pending states, quiet live regions in lists |

## Bugs fixed

1. A mutation result that arrived after an account/token change was written into the next session's list and could trigger its profile refresh. Each operation now has a generation ticket, and stale results are dropped.
2. A read started before a completed mutation, or an older refresh, could restore an outdated status. Ordering rules now reject them.
3. Polling aborted and restarted the running read every 15 s, so on slow networks the list never loaded. Now only one read runs at a time, polling skips while a read or mutation is running, and nothing polls while the tab is hidden.
4. The busy flag was global and there was no pending text for cancel/refresh. State is now per request (`Cancelling…`, `Sending request…`, `Refreshing…`, `Updating care team…`).
5. After 409 or another error, useful context was lost. The error now stays on the request, the server state is reloaded, and retry is offered only when it can succeed. A 410/404 link blocks the request button.
6. pending → accepted: the profile is refreshed once per accepted request, only for the current session. "Accepted but not in care team yet" offers an explicit **Update care team**.

The preview, the return to the same code after Google, and the explicit **Request connection** are unchanged. Preview, login and polling never POST.

## Requests for primary (Codex)

Both earlier requests are now in `46f6e0a`: background `refreshProfile` keeps the profile, and the
mutations accept `AbortSignal`. The hook already passes the signal (`MutationApi`), so a cancelled
mutation also stops the network request. Nothing else is needed from shared files. Still to do
(Codex, live services): the real flow patient Google → request → doctor accept → doctor appears
in `activeDoctors`.

## Verification (from `Frontend/`)

| Command | Result |
| --- | --- |
| `npm run build` | pass (only the existing >500 kB chunk warning) |
| `npm run lint` (no `--fix`) | pass |
| `node --experimental-strip-types --no-warnings src/features/connections/connectionSync.test.ts` | 10 passed |

Browser (headless Chrome over CDP, mocked API/Supabase, separate ports 4176 and 4177 for the unconfigured env): **67/67 passed**.

Covered:
- invalid, revoked (410) and unavailable (503) links;
- Google return to the same code without a POST;
- a triple click sends a single POST/PATCH;
- pending, accepted (profile refreshed once), rejected and cancelled states;
- POST 503 retry, POST 410, cancel 503 and cancel 409;
- a doctor account on the patient route;
- an expired session (401);
- a delayed list after an account switch (BroadcastChannel `SIGNED_IN`);
- sign-out during a read;
- no overlapping reads;
- no polling while hidden, a refresh when the tab becomes visible, and timers cleaned up on leave;
- the unconfigured environment;
- keyboard reach;
- 320, 360, 390, 768, 1024 and 1440 px in Light and Dark with long text: no overflow, 44 px targets.

Resolved after the first report (both were test errors, not product bugs):
1. The extra `/me` for B came from the previous page while the next test was loading, after the
   counters were reset. The trace confirms that no `/me` runs after the delayed cancel is released.
   The check now counts only the current page.
2. The focus-ring check counted `body` when Tab wrapped around. It now checks only page buttons and
   links, and all of them have a visible ring.

Not tested: live Google/Supabase/backend, real devices, screen readers, browser text-only zoom.
