# MedFlow Frontend

React + TypeScript + Vite. One responsive web app for patients and doctors
(Capacitor wraps the same build for Android).

## Run

```sh
npm install
npm run dev        # http://localhost:5173 — opens on Google sign-in
npm run build      # tsc -b && vite build
npm run lint
```

From the superproject: `python Make.py run Frontend`.

## Authentication and QR connections

Real account routes use Supabase Google OAuth with PKCE and the backend API
contract in the root `AUTH_INTEGRATION.md`. Copy `.env.example` to `.env` and
configure the public Supabase URL/key and `VITE_API_BASE_URL`. Secret/service-role
keys never belong in the frontend. QR images are generated locally using `uqr`.

- `#/home` (default): separate Patient and Doctor entry points in the same app.
- `#/patient`: patient Google sign-in, then the verified patient's care team and
  connection requests. Initial patient profile creation belongs to the backend.
- `#/connect/{code}`: public doctor preview, Google sign-in if needed, then an
  explicit request for connection. Scanning or signing in never sends a request.
  Pending requests refresh while the tab is visible; the doctor must accept.
- `#/doctor/invite/{token}`: Google sign-in with the invited email, followed by
  explicit invitation acceptance. The backend validates and consumes the invite.
- `#/doctor`: server-verified doctor access only. Claude's real QR/request module
  plugs in through `DoctorAccountWorkspace`, now delivered with request approval
  and locally generated/scannable QR codes. The existing DoctorApp is a separate
  synthetic demo.

Configure the Supabase/Google provider and exact Supabase redirect allowlist.
The application callback is `${APP_ORIGIN}${BASE_URL}auth/callback` (normally
`http://localhost:5173/auth/callback` during local development). The Google Cloud
OAuth callback points to Supabase, not this app callback. Hosting must return
the SPA for the callback path. Login returns to a strictly allowlisted internal
destination stored in session storage for 15 minutes; callback codes are removed
from the URL. Real login must run in a normal browser rather than an embedded
preview. Gmail reading scopes are not requested. Android deep links come later.

All real routes fail closed if account services, configuration or role checks
fail. They never enter a synthetic workspace as a fallback. Account backend APIs,
migrations and operator tooling are implemented; see Backend/AUTH_SETUP.md and
root AUTH_INTEGRATION.md. Google is enabled in the existing project. Synthetic
live-account integration tests passed and their fixtures were removed. Google
consent with the user's own account and production hosting remain separate checks.
See root CLAUDE_NEXT_TASK.md for Claude's current patient-connection UX task.

Run the return-destination checks without a test framework:

```sh
node --experimental-strip-types src/auth/navigation.test.ts
```

Check local configuration without displaying keys:

```sh
npm run auth:check
npm run auth:check -- --online
```

The optional online check reads the existing project's public Auth settings and
reports whether Google is enabled. It does not change Supabase settings or prove
that the Google OAuth consent/redirect configuration or backend `/me` is ready.

## Separate UI demos

Patient chat and sample doctor suggestion with **local synthetic data only**.
Assistant replies are simulated and labelled in the UI. Messages are not sent
to a doctor or persisted; reloading or leaving the patient route clears the demo.
These demo routes make no medical backend calls, storage uploads or real AI calls.

- `#/demo/patient`: patient conversation. **Doctor suggestion · Demo** opens
  a side panel on desktop and a dedicated dialog on mobile; closing it preserves
  the conversation and restores keyboard focus.
- `#/demo/doctor`: Claude's independently developed synthetic doctor module.
  The **Doctor demo** link and browser Back/Forward work with hash navigation.
- `#/demo/scan`: local document capture from camera/files, preview and explicit
  confirmation. Documents stay local; this demo does not upload to the backend.
- `#/demo/care`: complete synthetic care scenario (context, prescription review,
  confirmed reminders, intake, doctor summary and feedback). State is in memory
  and resets on reload; see `src/features/care-scenario/HANDOFF.md` and the root
  `DEMO_RUNBOOK.md`. This route does not call live AI or persist to Supabase.

The root `HANDOFF.md` is the current continuation checklist; `WORK_ALLOCATION.md`
defines ownership. Claude handles most implementation; Codex handles connected
services and integration. AI changes remain coordinated with that module's team.
Medical safety rules and doctor-authored content must stay separate from generated
assistant text.

### Responsive preview

Use **Mobile Preview: Show** in VS Code and point it at the Vite URL shown in the
terminal (normally `http://127.0.0.1:5173/`). The UI uses fluid flex layouts,
relative spacing, readable maximum widths and dynamic viewport height rather
than a fixed phone canvas. Check 320, 360, 390, 768, 1024 and 1440 CSS px, both
themes, landscape and zoom. The suggestion changes layout at 48rem.

Reference images in `figma-references/` are ignored development inputs, not app
assets. Local Playwright screenshots/checks live in the ignored superproject
`output/playwright/` directory. A browser preview does not replace real-device
testing for virtual keyboards, cameras and system notifications.

## Where things live

| What | Path |
| --- | --- |
| Brand config (name, logos, primary / on-primary colors) | `src/brand/brand.config.ts` |
| Brand assets (placeholders today) | `public/brand/` |
| Design tokens (neutral, brand, status — separate groups) | `src/styles/tokens.css` |
| Theme contract (storage key, values, fallback, pre-paint script) | `src/theme/themeContract.ts` |
| Chat service interface (swap point for the API) | `src/features/chat/chatService.ts` |
| Mock data / simulated replies | `src/mocks/chat.mock.ts` |

### Branding assets

Placeholders created for Phase 1 (temporary):

- `public/brand/medflow-symbol-placeholder.svg` — symbol, shown below 640 px
- `public/brand/medflow-logo-placeholder-light.svg` / `-dark.svg` — symbol + wordmark lockup

Original assets still needed: the symbol-only `Medflow_No_Logo` (expected at
`public/brand/Medflow_No_Logo.svg`) and the full MedFlow logo (Light and Dark
variants). Drop them into `public/brand/` and update the paths in `brand.config.ts`.

Quicksand is used when installed on the device; otherwise the system sans-serif.

### Theme

Light, Dark and System (default). The choice is stored in `localStorage`
(`medflow.theme-preference`); System follows the OS setting live. A script
generated from `themeContract.ts` is injected into `index.html` by
`vite.config.ts` so the first paint already uses the right theme.

### Mock-only test hook

A message containing `[simulate-error]` makes the mock reply fail, to exercise
the error/retry state. It exists only in `src/mocks/chat.mock.ts`.
