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
| `npm test` | unit tests (crypto module, file chunking, secure links, version diff) |

### Demo accounts (mock server)

All four have real keys (made by `scripts/make-mock-seed.ts`) and the same password:

| Email | Password |
|---|---|
| `jack@northgate.io` (admin) | `northgate-vault-2026` |
| `maya@northgate.io` · `ilan@northgate.io` · `sam@northgate.io` | `northgate-vault-2026` |

There is no mail server and no phone in mock mode, so two dashed orange boxes help you
click through. They only exist when `VITE_USE_MOCKS=true`:

- **Mock inbox** on the verify-email and forgot-password pages: shows the code / link the
  "server" sent.
- **Mock authenticator** on the 2FA pages: shows the code an authenticator app would show.
  A real app works too — scan the QR code on the setup page.

Jack also has the ten recovery codes from Figma screen 07 (`4KQ2-9WFH`, `8ZJ5-3MTA`, …).
Recovery words for each demo user are in [`src/mocks/seed-keys.json`](src/mocks/seed-keys.json).
A pending invite for a new user is at `/invite/demo-invite-2026`.

The demo vaults hold 18 files that were encrypted for real when the mock database was
created (Product Legal has 12; `contract-northgate-2026.pdf` has 4 versions with notes).
Uploaded files are stored as ciphertext in IndexedDB (`vaultshare-mock-blobs`), the mock's
stand-in for an S3 bucket.

- **Mock object storage** box on a file's detail page: flips one byte of chunk 1 in storage
  so you can watch the integrity check reject it. Click it again to put the byte back.
- Reloading the page locks the vault on purpose (the private key only lives in memory).
  Sign in again, or navigate with the sidebar instead of the address bar.
- The trash starts with 5 files at different ages, so the purge countdown shows all three
  colours; files past 30 days are purged automatically the next time a list loads.
- Moving a file to another vault re-wraps its keys for that vault's members. Sign in as Ilan
  (Engineering) to open a file Jack moved there; Maya (Legal only) no longer finds it.
- Search runs in the browser on decrypted names and notes; the words are kept in memory, not
  in the URL, and never sent to the API.
- **Sharing:** Maya owns a "Partner deals" vault Jack isn't in, and shared two of its files
  with him (see *Shared with me*). Jack shared three Engineering / Board files out (see
  *Shared by me*). Sharing, changing roles, inviting, revoking and links ask for the second
  factor again: the dialog has the same "Fill it in" box as sign-in.
- **A secure link that works in any browser, even a private window:**
  `http://localhost:5173/s/demoLink2026Nq4vXr8TkP2mW7sYb3Hd#k=nzwad-C0XSKIrDHwXUFAKrxLKna5cZ2RxIosyYQ2oQs`
  (every browser seeds this one). Links you create yourself only open in the same browser
  while the API is mocked, because the mock "server" lives in that browser's storage.
- **Invite flow for someone new:** open `/invite/demo-invite-2026` (for nora@northgate.io),
  create the account, then sign in as Maya or Jack: Product Legal shows "waiting for their
  keys" with a button that wraps them. After that Nora can open the files.
- **Settings and admin:** Jack is the organisation's administrator (*Administration* in the
  menu under his name). Sam is a regular member: the audit log shows him only his own
  events, and the admin page isn't in his menu. Jack starts with four signed-in devices, so
  *Sessions & devices* has something to revoke.
- The bell counts unread notifications. File names in them are decrypted in the browser;
  the server only writes `{file}` and the file id.
- *Profile → Change password* seals the same private key again under the new password, in
  the browser. Lock (menu → Lock now) and unlock with the new one to see it worked.
- *Encryption keys → Rotate key pair* re-wraps every data key Jack holds (about 40) to a new
  key pair and shows new twelve words. Files keep opening afterwards.
- **Mock database** box on the audit log page edits one entry in the middle of the chain the
  way someone with database access could. *Verify chain* then names the broken entry. Click
  the box again to undo it.
- *Administration → ⋯ → Suspend* ends that person's sessions at once, and signing in tells
  them an administrator suspended the account.
- When the mock data format changes the database is rebuilt on its own (it was in phases 3,
  4, 5 and 6), so files you uploaded earlier disappear. `/dev/ui` → "Reset mock data" does the same.

### Useful pages while developing

- `/` landing · `/signup` · `/signin` · `/forgot`
- `/vaults` — the app shell (needs sign-in)
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
  crypto/          the only place encryption code is written (Argon2id, HKDF, AES-GCM, RSA-OAEP)
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
| 2 | Crypto module + onboarding & auth (13 screens) | done |
| 3 | Vault & files I — upload/encrypt, download/decrypt, detail, versions, preview | done |
| 4 | Vault & files II — rename/move, delete, bulk, favorites, recent, search, trash | done |
| 5 | Sharing & permissions — share, step-up, secure links, members, invites | done |
| 6 | Settings & admin — security, sessions, keys, notifications, team, storage, audit | done |
| 7 | Mobile layouts, error/empty/loading states, accessibility pass, v1.0.0 | |
