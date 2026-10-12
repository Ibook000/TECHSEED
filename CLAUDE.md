# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Identity

黎明职业大学信电学院学生会技术部 AI 招新系统 (Tech Dept AI Recruitment System)
Single-page app for running an AI-powered student club recruitment pipeline: student registration → AI interview → evaluation → admin review → WeChat group admission.

## Commands

```bash
npm install             # npm is the working path (package-lock.json is newer than bun.lock)
npm run dev             # tsx server.ts — Express mounts Vite middleware in-process, port 3000
npm run build           # vite build && esbuild server.ts -> dist/server.cjs
npm run start           # node dist/server.cjs  (NOT the prod entry point; see Deployment)
npm run lint            # tsc --noEmit — type check only, no ESLint
npm run clean           # rm -rf dist server.js — Unix-only `rm`, will fail under PowerShell
```

Notes:
- `bun.lock` exists and is valid, but **bun is not installed** in this environment. Don't run `bun run ...` unless you've installed it.
- Both lockfiles are present and out of sync in recency — pick npm unless you deliberately switch.
- No test runner is configured. `npm run lint` is the only automated check.
- **Verify before shipping: run `npm run lint` and `npm run build` together.**

### Deployment

Host `techseed` (114.132.230.159, Tencent Lighthouse), app at `/opt/techseed`.

Production runs under PM2 from `ecosystem.config.cjs`, not `npm run start`:
- process `techseed`, script `dist/server.cjs`, cwd `/opt/techseed`, `NODE_ENV=production`, **`PORT=80`** (changed from 3000 on 2026-09-09 when nginx was removed from that port)
- `max_memory_restart: 400M`, `autorestart: true`, `max_restarts: 10`, backoff 200ms

**npm, not bun, is the package manager on the host.** `ecosystem.config.cjs` has no `env_file`, so PM2 injects only `NODE_ENV` and `PORT` — everything else comes from `/opt/techseed/.env`. dotenv loads from `process.cwd()` at `server.ts:10`, so a new env var must be added there or it silently won't take effect. The `.env` there also documents that SenseNova hit its plan quota and the stack fell over to DeepSeek.

**Never upload `data/db.json` from this repo.** The repo copy is seed-only; the host file holds the live student records. Overwriting it wipes them and there is no warning. Precede any upload with `cp -a data/db.json /opt/techseed-backup/db.json.$(date +%Y%m%d-%H%M%S)`.

Deploys go: tar the `dist/` output → upload → stop PM2 → extract → restore the DB → `pm2 reload ecosystem.config.cjs --update-env && pm2 start techseed`. **Stop the process before touching `db.json`** — the DB is held in an in-memory singleton and a running process can rewrite the file with stale state. `--update-env` is required, since PM2 otherwise caches `PORT` per app.

Backups accumulate at `/opt/techseed-backup/` (db, .env, ecosystem, full tree tarball).

**Open item: nginx is still enabled at boot.** It was killed to free port 80, and `nginx` is not systemd-managed here (`systemctl` reports it `inactive` while the processes still listen — it's driven directly by the BT panel at `/www/server/panel`). So `systemctl stop nginx` would not have worked; the processes were killed outright. But the init scripts survive at `/etc/rc.d/init.d/nginx` and `/etc/init.d/nginx` with `chkconfig` reporting `enabled`, so **a host reboot brings nginx back onto :80 and the app cannot bind**. `chkconfig --del nginx` was attempted during the 2026-09-09 deploy and blocked by the permission classifier — still needs doing, plus `/etc/init.d/bt` should be checked since the panel also starts nginx.

## Architecture

**Monolithic single-process app** — Express serves both the API and the SPA. `server.ts` (~21KB) contains all 40 routes inline, not in a router.

```
src/        React 19 + TS frontend (Vite-compiled)
server/
  db/       JSON file database (data/db.json) — all state, no external DB
  services/
    recruitment.ts  Business logic (registration, interview flow, admit/reject, scoring)
    ai.ts           LLM integration layer
server.ts   All Express API routes + Vite middleware (dev) / static serving (prod)
```

`@/*` maps to project root (`tsconfig.json` paths `./*` + `vite.config.ts` resolve.alias). No `baseUrl`. Frontend imports `.js` specifiers for TS files (`allowImportingTsExtensions` + `moduleResolution: bundler`), matching the server-side pattern.

### Database (`data/db.json`)

`DatabaseSchema` has 11 collections: `admin_users`, `recruitment_batches`, `candidates`, `interviews`, `ai_evaluations`, `manual_reviews`, `candidate_notes`, `wechat_group_qrs`, `candidate_status_history`, `ai_prompts`, `admin_passwords`.

- **`save()` is not atomic and not locked** — one synchronous `fs.writeFileSync` of the whole ~210KB file (`server/db/index.ts:196-202`). No temp-file+rename, no fsync. A mid-write crash can leave a truncated DB.
- **`save()` swallows errors** — on failure it only `console.error`s; in-memory state stays mutated while disk holds the old snapshot, and every caller still returns success to the HTTP layer. Divergence only surfaces on restart.
- **Some mutations double-write** — `createCandidate` and `updateCandidateStatus` each call `recordStatusHistory` (which saves) *and* then save again.
- **Getters return live internal references, not copies.** Mutations to returned objects only persist because the caller then happens to invoke a save-emitting method — a convention, not an invariant. New code must respect this or data is silently lost.
- **One concurrency guard does exist**: `serializeInterviewOp(candidateId)` in `recruitment.ts` queues interview create/complete operations per candidate. Registration and status writes are not serialized.
- Every status change is audited: `recordStatusHistory` unshifts `{fromStatus, toStatus, operator, reason, timestamp}`; `createCandidate` records a self-transition `REGISTERED → REGISTERED`.

Seed on first run: **two** batches (`batch-2026` active + archived `batch-2025`), one admin user `admin`, three default prompts, one SVG data-URI WeChat QR placeholder (`qr-2026-1`), and `ai_settings` (which **copies all `OPENAI_*`/`FALLBACK_OPENAI_*` env keys into the plaintext DB** at seed time). The auth signing secret is not seeded — `ensureAuthSecret()` generates and persists it on first start.

`admin_passwords` is not written at seed time; it is initialized lazily in `verifyPassword()` when `ADMIN_DEFAULT_PASSWORD` is configured. Fresh or passwordless databases require that environment variable before the server starts; the project ships no universal initial password. `clearCandidateData()` preserves existing passwords.

`clearCandidateData()` wipes candidates/interviews/evaluations/reviews/notes/history but preserves batches, prompts, QR codes, users, and `ai_settings`.

### LLM Integration (`server/services/ai.ts`)

**Two tiers. No fallback provider — OpenAI-compatible endpoint only, anything it can't do goes to the heuristic engine.**

1. **OpenAI-compatible endpoint**, any provider (SenseNova, DeepSeek, Qwen, Ollama, ...). Multiple keys supported via comma-separated `OPENAI_*_API_KEY`. A second pool comes from `FALLBACK_OPENAI_API_KEY` / `FALLBACK_OPENAI_BASE_URL` / `FALLBACK_OPENAI_MODEL`, applied when the primary fails.
2. **Heuristic scoring engine** — deterministic weighted math, no network. Always functional.

- **DB overrides env**: `ai_settings` in the DB takes precedence over `.env`, and changes apply immediately without restart. The AI settings admin UI writes here.
- Timeout 75s (accommodates reasoning models). Internal concurrency limiter, default 10, env `LLM_MAX_CONCURRENT`.
- The LLM is used for interview-question generation *and* final evaluation, not scoring alone.

### Candidate Status Pipeline

The real enum (`src/types.ts:1-15`) has **15 values** — do not assume the shorter list below is exhaustive, and don't drop branches when handling it:

```
REGISTERED → AI_INTERVIEWING → AI_COMPLETED → AI_RECOMMENDED | AI_NOT_RECOMMENDED
  → WAITING_MANUAL_INTERVIEW → MANUAL_INTERVIEWING
  → MANUAL_PASSED → QR_AVAILABLE → GROUP_JOIN_PENDING → GROUP_JOIN_CONFIRMED → ADMITTED
```

Terminal/off-path: `MANUAL_REJECTED`, `MANUAL_WAITLIST`.

### Evaluation Dimensions

Weights are enforced in the heuristic engine, not only in the prompt (`ai.ts:758-760`):

- learning 25% · initiative 20% · logic 20% · technology_interest 15% · communication 10% · technical_foundation 10%
- Grade: S ≥ 90, A ≥ 80, B ≥ 70, C < 70

## API Design

All 40 routes are under `/api/`. The `candidateId` doubles as the interview session id (`intv-${candidateId}`).

- `POST /api/candidates` — register. Dedupe is two-pass (`recruitment.ts:39-45`): look up studentId within the batch first, then fall back to a **global** search across all batches. A studentId that appears in any batch blocks re-registration elsewhere, and the existing record is returned with `isNew: false`.
- `POST /api/interviews` · `POST /api/interviews/:id/answer` · `POST /api/interviews/:id/complete` — AI interview; start/resume, submit answer → next question, run evaluation
- `PATCH /api/candidates/:id/status` — admin status update (records history)
- `POST /api/candidates/:id/admit|reject` — final decision
- `POST /api/candidates/:id/join-confirm` — student confirms WeChat group join
- `GET /api/wechat-qr?candidateId=X` — student path, returns the QR only if status is `MANUAL_PASSED`, `QR_AVAILABLE`, `GROUP_JOIN_PENDING`, `GROUP_JOIN_CONFIRMED`, or `ADMITTED` (`recruitment.ts:280-286`). Querying with a bare `?batchId=X` and no `candidateId` skips the admission check entirely, so that branch now requires admin auth.
- `GET /api/export/candidates.csv` — CSV export
- Also present: `/api/auth/*`, `/api/recruitment-batches/*`, `/api/prompts/*`, `/api/ai-settings`, `/api/upload-logo`, `/api/dashboard/stats`, `/api/health`

### Admin auth (enforced)

`POST /api/auth/login` issues an HMAC-SHA256 signed token over `<username>.<expiryEpochMs>`, format `adm.<payload>.<sig>`. The signing secret lives in `db.json` (`auth_secret`), generated once via `randomBytes(32)` and persisted so tokens survive PM2's `max_memory_restart` restarts; `AUTH_TOKEN_SECRET` in the environment always overrides it. TTL is 12h.

**Verification matters here**: the previous format was `token_${user}_${Date.now()}` and contained no secret — any visitor could mint a valid token by guessing the shape. Only `timingSafeEqual` on a signature over a secret fixes that; checking the format alone does not.

The auth gate is an **allowlist of public routes** in `server.ts` (`PUBLIC_ROUTES` + `isPublicRoute`), fail-closed: any `/api/*` path not listed requires a valid token, including routes added later. Two things to know when editing it:
- `req.route` is undefined in middleware before a route matches, so matching is done against segment patterns (`:x` spans any segment) rather than `req.route.path`.
- Tokens are read from the `Authorization` header only. There is deliberately no `?token=` fallback: the CSV export downloads via `fetch` + `Blob` (see `CandidateList.tsx`) precisely so the token never appears in a URL — a URL token leaks into browser history, proxy logs and `Referer` headers.
- The frontend wraps `window.fetch` once in `src/lib/auth.ts` (installed from `main.tsx`) to attach the Bearer token. The server allowlist is the real boundary; the wrapper just prevents admin pages from silently 401ing.
- `AdminLoginModal.tsx` is dead code — `setIsAdminLoginOpen(true)` is never called. The only live login surface is `AdminLoginPage.tsx`, which persists the token.

Student-side routes stay public because students carry no credential; they identify themselves by 学号. For those, responses are **redacted on the way out** (`redactCandidate`, `redactInterview` in `server.ts`): contact details and per-round AI `analysis` are stripped, so guessing someone's candidate id no longer yields their phone or WeChat.

Passwords are stored as scrypt hashes (`scrypt:<salt>:<digest>`), verified with `timingSafeEqual`. Legacy plaintext entries in older databases are checked and **upgraded in place on first successful login**. A fresh or passwordless database requires `ADMIN_DEFAULT_PASSWORD`; no universal initial password is shipped.

No rate limiting, CSRF, helmet, or CORS config. The only request hardening is `express.json({ limit: '10mb' })`.

### Security regression suite

The current repository does not include the local `devtest/security_test.mjs` script. Do not describe the 74 local assertions as part of the public repository; the README lists the available lint and build checks.

## Dual Portal Routing

A single React component tree with manual view switching — **no router library**, and no URL deep-linking to a specific candidate.

- View is decided by path (`/admin`, `/status`, `/`) and held in React state, with `popstate`/`hashchange` listeners for back/forward.
- `Ctrl+Shift+A` jumps to admin. The handler has **no `e.target` guard**, so firing it while typing in the interview textarea or a form field yanks the user to admin mid-keystroke.
- **There are no query params anywhere in the frontend** — `URLSearchParams`/`location.search` are never read. A shared `/status` link renders an empty screen on any fresh device, because `App.tsx` requires a `candidateSession`.
- Candidate identity travels two ways: typed by hand (学号 → `GET /api/candidates/by-student-id/:studentId`), or auto-restored from `localStorage` (`tech_last_student_id`, `tech_last_candidate_name`).
- Shareable links therefore carry nothing. If shareable status links are wanted, the frontend would need to honor something like `/status?s=<学号>` — today it can't.

## UI Design

- TailwindCSS v4.1.14 via `@tailwindcss/vite`; entry is `@import "tailwindcss";` in `src/index.css`. No `tailwind.config.*`, and none is needed.
- **Theme tokens are declared but inert.** `src/index.css:5-10` defines `--color-accent: #EAB308`, `--color-accent-light: #FACC15`, `--color-accent-dark: #CA8A04`, `--color-bg-primary: #FAFAFA`, `--color-bg-surface/--color-bg-card: #FFFFFF` — but there is **no `@theme` block**, so `bg-accent` / `text-accent` utilities do not exist. Every component hardcodes hex inline, e.g. `bg-[#EAB308]`. Editing `index.css` changes nothing in the UI. If you want a real token system, add an `@theme` block first.
- Background is `#FAFAFA` (zinc-50) with `#18181B` (zinc-900) text.
- Icons: `lucide-react` (10+ files). Charts: `recharts` v3 — the entire admin analytics layer (radar/bar/pie in `AdminDashboard.tsx` and `CandidateDetailModal.tsx`). `canvas-confetti` fires once, on successful join-confirm.
- Chinese-primary UI, with intentional English uppercase brand/technical labels (`TECHSEED 2026`, `TRACKS`, `STEP 01`, `ROUND n/n`).

### Dependencies that are installed but never imported

`motion` (animations are Tailwind `transition-*` classes), `autoprefixer` (Tailwind v4 doesn't use PostCSS; no `postcss.config.*`). Safe to remove.

### Stale lockfile

`bun.lock` still contains the `@google/genai` subtree (genai plus ~15 transitive packages), but **bun is not installed**, so the lockfile can't be regenerated here. `package.json` and `package-lock.json` are already clean. Hand-editing `bun.lock` is not safe — the transitive deps (`google-auth-library`, `protobufjs`, `p-retry`, `ws`, ...) may be shared with other packages. Install bun and run `bun install` to reconcile it.

## Operational Gotchas

- `data/db.json` is committed and contains live data, including seeded plaintext admin passwords and copies of the API keys from `.env`.
- `metadata.json` is an AI Studio applet manifest — platform boilerplate, not app code.
- `APP_URL` in `.env` is never read by any code. The server binds `0.0.0.0`; the real public URL is configured nowhere in the repo.
- `DISABLE_HMR=true` disables both HMR and file watching (`vite.config.ts`). A comment there says not to modify it.
- Package is still named `react-example`; the duplicate lockfile and AI Studio manifest are scaffolding residue.
