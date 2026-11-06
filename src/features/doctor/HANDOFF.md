# Doctor module handoff (Claude → Codex)

Status: **both public exports are ready** and build. Write scope respected: only
`Frontend/src/features/doctor/**` was changed. No dependencies, env files, shared
files or git state were touched.

This does **not** declare global authentication complete: the real workspace was
verified only against mocked contract responses, not live Google/Supabase/API.

## Public exports (`src/features/doctor/index.ts`)

```tsx
// Synthetic demo — mount only at #/demo/doctor (as App.tsx already does).
export interface DoctorAppProps { onExit: () => void }
export function DoctorApp(props: DoctorAppProps): React.JSX.Element;

// Real workspace — mount only when auth status is ready and /me role === 'doctor'.
export interface DoctorAccountWorkspaceProps { profile: AccountProfile; onExit: () => void }
export function DoctorAccountWorkspace(props: DoctorAccountWorkspaceProps): React.JSX.Element;
```

`DoctorAccountWorkspace` reads `session.access_token` and `signOut` from the shared
`useAuth()`, and calls only `accountApi.getDoctorCode / rotateDoctorCode /
listConnections / updateConnection`. It never renders demo fixtures; every failure
shows an error with retry. It renders inside `AccountLayout` (no own BrandMark/theme
header, no full-viewport height).

## Files

| Area | Files |
| --- | --- |
| Root (coordinator) | `index.ts`, `DoctorApp.tsx`, `contracts.ts`, `types.ts`, `fixtures.ts` (demo only), `format.ts`, `doctor.css` |
| Shared | `shared/DoctorDialog.tsx` (native modal: Tab containment, Escape, focus restore, native-close sync), `shared/files.ts`, `shared/testHarness.ts` |
| Demo auth | `auth/*` — login/register demo; now states that real doctor access is invitation-only, with a link to `#/doctor` |
| Demo workspace | `workspace/*` — backlog table/cards, filters, sort, demo states, panels |
| Demo suggestion | `suggestions/*` — message, photo preview/remove, validation, sending/error/success |
| Real workspace | `account/DoctorAccountWorkspace.tsx`, `ConnectionQrPanel.tsx`, `ConnectionRequestsPanel.tsx`, `useDoctorConnectionCode.ts`, `useConnectionRequests.ts`, `connectionLogic.ts`, `qrEncoder.ts`, `doctor-account.css` |

## Real workspace behaviour

- Header from the server profile (name, email, "Doctor role verified by MedFlow"), Patient area (`onExit`) and Sign out (shared `signOut`).
- **Connection requests**: pending first (oldest waiting first), history newest first; all four statuses labelled. Accept/Reject only on pending, accessible names include the patient. Per-request pending/error state, ref guard against duplicate PATCH, list updated only from the server's returned record. `409` → refresh + "already processed" notice (no success claimed); `401` → message, shared auth handles re-sign-in via `medflow:session-expired`; other errors keep the request with retry. Reads abort the previous in-flight read; refresh every 30 s while visible and on `visibilitychange`; timers/listeners cleaned up.
- **Connection QR**: link validated before display (`checkConnectionUrl`): HTTPS (HTTP only on loopback), no credentials, no query string, hash exactly `#/connect/{code}`, code `[A-Za-z0-9_-]{8,256}`. Invalid link → error, nothing shown. Copy link (clipboard, with select fallback). Regenerate requires confirmation (focus on "Keep current QR"), close/Escape blocked while rotating, display replaced only after server success; failure keeps the old QR.
- Patients / Messages / Documents: explicit "Not available yet" panels, no records.

## Requests for Codex / other teams

1. **QR encoder dependency (needs your decision).** No encoder was added. `account/qrEncoder.ts` is the only seam: implement `encodeQrModules(text)` with an approved library and set `QR_ENCODER_AVAILABLE = true`; SVG rendering (dark-on-white in both themes) and SVG download are already wired. Until then the QR area honestly says the image is unavailable and Download is disabled. Suggested candidates to evaluate: a small, maintained, zero-dependency encoder producing a module matrix (e.g. `qrcode-generator` or `uqr`); no external image service.
2. **Connection code format.** The contract calls the code opaque; the UI accepts `[A-Za-z0-9_-]{8,256}`. Backend should confirm (or tell us to relax it).
3. **Patient backlog/messages/documents APIs** are not in `AUTH_INTEGRATION.md`; panels stay unavailable until contracts exist.
4. No shared-file changes are required.

## Commands and results (run from `Frontend/`)

| Command | Result |
| --- | --- |
| `npm.cmd run build` | pass |
| `npm.cmd run lint` (no `--fix`) | pass, 0 warnings |
| `node --experimental-strip-types --no-warnings src/features/doctor/auth/registrationValidation.test.ts` | 10 passed |
| `… src/features/doctor/workspace/patientQuery.test.ts` | 15 passed |
| `… src/features/doctor/suggestions/suggestionValidation.test.ts` | 12 passed |
| `… src/features/doctor/account/connectionLogic.test.ts` | 10 passed |

Browser checks: headless Chrome driven over the DevTools protocol (no new dependency); scripts kept outside the repo.

- **Real workspace — 54/54**, Vite dev server with synthetic env (`VITE_SUPABASE_URL=https://medflow-auth.test`, `VITE_API_BASE_URL=https://medflow-api.test`), Supabase and API intercepted with synthetic responses. Covered: valid doctor; patient blocked; missing session; expired session (401); backend unavailable (503) for `/me`, list and QR; invalid/non-HTTPS QR URL; rotation failure and success; empty requests; accept success; reject failure → retry; 409 conflict refresh; triple-click → one PATCH; visibility refresh; list failure keeps last list; Bearer header present; no fixtures anywhere; no unexpected network requests; sign out.
- **Demo — 65/65**, production preview at `#/demo/doctor`: login/register validation, credential and photo file validation (type, 10 MB, empty), pending-verification copy, counts/search/filter/sort/no-results/loading/error, View/Add patient, suggestion sending/error/success with object-URL revocation, nested mobile dialogs, Escape and focus restoration, Tab containment, logout, return to `#/demo/patient`, no network beyond same-origin static GETs.

Viewport/state matrix (both Light and Dark, no horizontal overflow asserted on every screen):

| Width × height | Demo login / register / workspace | Real requests + QR (long names) |
| --- | --- | --- |
| 320×700, 360×740, 390×844 | ✓ | ✓ |
| 768×1024, 1024×768, 1440×900 | ✓ | ✓ |
| 844×390 (landscape) | ✓ | ✓ |
| 640/720 wide (≈ 200% zoom of 1280/1440) | ✓ | ✓ |

Real-workspace buttons were asserted ≥ 44 px tall at every size.

## Limitations

- 200% zoom was approximated by narrow viewports; browser text-only enlargement and real devices/screen readers were not tested.
- Mocked responses prove UI behaviour against the written contract only — not live Google sign-in, Supabase, backend authorization or database transactions.
- Fixes made during integration: undefined `--space-5` token replaced by module-local `--doctor-space-5`; CSS import order fixed so `doctor.css` loads before sub-module CSS (the desktop "View patients" button was visible before).
