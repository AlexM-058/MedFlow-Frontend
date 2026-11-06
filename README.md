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

## Phase 1 scope

Foundation + patient AI chat with **local mock data only**. No authentication,
routing, backend calls, storage uploads or real AI. Assistant replies are
simulated and labelled as such in the UI.

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
