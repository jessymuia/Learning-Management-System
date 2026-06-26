# Production LMS — Frontend (Next.js)

The learner/instructor web client. A Next.js 14 (App Router) + TypeScript SPA
that consumes the Laravel API — no server-rendered coupling to the backend, it
talks to `/api` over JSON with JWT bearer auth.

## Design
"Atrium" — a focused study environment. Ink-navy + warm paper palette with a
restrained gold accent for achievement; serif display (Iowan/Palatino) over a
clean system sans. The dashboard's signature is a "what's next" focal panel that
treats the learner's next task as the hero rather than a generic stat grid.
Responsive to mobile, visible keyboard focus, reduced-motion respected.

## Stack
- Next.js 14 (App Router), React 18, TypeScript
- No UI framework — hand-built components + CSS (design tokens in `globals.css`)
- `src/lib/api.ts` — typed API client (envelope `{data}`/`{error}`, token storage)

## Run it
The backend must be running first (see ../backend). Then:
```bash
cd frontend
npm install
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_BASE if backend isn't :8000
npm run dev                        # http://localhost:3000
```
`next.config.mjs` proxies `/api/*` to the Laravel backend (default
`http://localhost:8000`), so there are no CORS issues in dev.

## Pages
| Route | Purpose |
|---|---|
| `/login` | Sign in / register (split-panel brand entry) |
| `/dashboard` | "What's next" focal panel + your courses & programs |
| `/courses` | Course catalog (cards) |
| `/courses/[id]` | Course detail + content list |
| `/programs` | Programs / nanodegrees |
| `/grades` | Per-course grade summary with progress bars |

## Auth flow
`auth.login()` / `auth.register()` call the API, store the JWT in
sessionStorage, and redirect to `/dashboard`. `useRequireAuth()` guards
authenticated pages (redirects to `/login` if no token). The API client attaches
`Authorization: Bearer <token>` automatically.

## Validated
`npm run build` compiles cleanly — all 8 routes build and TypeScript
type-checks pass.

## Notes
- This is the core learner/instructor surface. Instructor authoring flows (create
  course, build quiz, mark submissions) and the quiz player are natural next
  additions — the API endpoints for them already exist in the backend.
- Next.js shows a security advisory recommending Next 15; for local dev this is
  fine. Bump to Next 15 before production deployment.
