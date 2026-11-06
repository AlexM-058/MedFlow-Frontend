# MedFlow Frontend

React + TypeScript + Vite. One responsive web app for patients and doctors
(Capacitor wraps the same build for Android).

## Run

```sh
npm install
npm run dev        # http://localhost:5173 — opens on the patient AI chat
npm run build      # tsc -b && vite build
npm run lint
```

From the superproject: `python Make.py run Frontend`.

## UI preview scope

Patient chat and sample doctor suggestion with **local synthetic data only**.
Assistant replies are simulated and labelled in the UI. Messages are not sent
to a doctor or persisted; reloading or leaving the patient route clears the demo.
No real authentication, backend calls, storage uploads or AI are connected.

- `#/patient` (default): patient conversation. **Doctor suggestion · Demo** opens
  a side panel on desktop and a dedicated dialog on mobile; closing it preserves
  the conversation and restores keyboard focus.
- `#/doctor`: reserved for Claude's independently developed doctor module. Until
  that module is present, this route shows an explicit work-in-progress page.
  The **Doctor demo** link and browser Back/Forward work with hash navigation.

The root `CLAUDE_PLAN.md` and `CODEX_PLAN.md` define exclusive write ownership.
Backend, Database and AI remain with the backend team. Medical safety rules and
doctor-authored content must stay separate from generated assistant text.

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
