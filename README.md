# VaultShare — Web client

Frontend of **VaultShare**, a zero-knowledge encrypted file collaboration platform
(HTI Computer Science graduation project, 2026).

Files are encrypted in the browser before upload. The server only ever stores ciphertext,
wrapped keys and an append-only audit chain, so nothing it holds is enough to read a file.

| | |
|---|---|
| Frontend | Fady Kaiser |
| Backend (ASP.NET Core 8) | Amir Wael |
| AppSec & pentest | Ammar Hassan |

## Stack

React 18 · TypeScript · Vite · React Router 6 · TanStack Query · Zustand · CSS Modules ·
Web Crypto API · MSW (mock API until the backend is ready)

Design: the Figma file "VaultShare — Cold Storage" (57 screens). All colours, type and spacing
come from its `design-tokens.json` and live in [`src/styles/tokens.css`](src/styles/tokens.css).

## Run it

Needs Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

| Command | What it does |
|---|---|
| `npm run dev` | dev server with hot reload |
| `npm run build` | type-check + production build into `dist/` |
| `npm run preview` | serve the production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

### Useful pages while developing

- `/vaults` — the app shell, data comes from the mock API
- `/dev/ui` — every component on one page (compare with Figma screen 55). Has a
  "Reset mock data" button.

## Mock API vs real backend

By default the app runs against a fake server inside the browser
([MSW](https://mswjs.io)), defined in [`src/mocks`](src/mocks). It answers the exact same
endpoints, with the exact same JSON, as the real ASP.NET API will.

To use the real backend, create `.env.local` (it is git-ignored):

```bash
VITE_USE_MOCKS=false
VITE_API_TARGET=https://localhost:7001
```

Vite proxies `/api` to `VITE_API_TARGET`, so the browser sees one origin and the refresh
cookie works without CORS. Nothing else in the frontend changes.

The API contract is section 10 of the roadmap PDF. In code it lives in
[`src/api/types.ts`](src/api/types.ts) (every DTO) and [`src/mocks/handlers`](src/mocks/handlers)
(how every endpoint answers).

## Project structure

```
src/
  App.tsx          all routes
  styles/          tokens.css (from figma), base.css, fonts.css
  components/      the design-system components + the 23 icons
  layouts/         AppShell (rail + topbar), AuthSplit, StepCard, PublicLayout
  features/        one folder per area: auth, vault, files, sharing, settings, admin
  crypto/          the only place encryption code is written (phase 2)
  api/             fetch client, DTO types, TanStack Query hooks
  mocks/           MSW fake server + its local "database"
  store/           Zustand stores (session keys live in memory only)
  hooks/ utils/
```

## Security rules for this codebase

- Passwords, private keys, file keys and plaintext never leave the browser and are never
  written to `localStorage`, logs or URLs.
- Encryption code only lives in `src/crypto`, API calls only in `src/api`.
- The unwrapped private key is held in memory and dropped on idle lock (15 min).

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Project setup, design tokens, components, layouts, routes, API client, mock server | done |
| 2 | Crypto module + onboarding & auth (13 screens) | |
| 3 | Vault & files I — upload/encrypt, download/decrypt, detail, versions, preview | |
| 4 | Vault & files II — rename/move, delete, bulk, favorites, recent, search, trash | |
| 5 | Sharing & permissions — share, step-up, secure links, members, invites | |
| 6 | Settings & admin — security, sessions, keys, notifications, team, storage, audit | |
| 7 | Mobile layouts, error/empty/loading states, accessibility pass, v1.0.0 | |
