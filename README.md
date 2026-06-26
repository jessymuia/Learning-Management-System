# Production LMS (PHP / Laravel + Next.js)

Multi-tenant Learning Management System.

- **`backend/`** — Laravel 11 REST API (PHP 8.3). API-first; no Blade pages.
- **`database/`** — PostgreSQL schema (18 migrations), seed, helper scripts.
- **`frontend/`** — Next.js client (login, dashboard, courses, programs, grades). ✅

```
Browser ──> Next.js (:3000) ──REST──> Laravel API (:8000/api) ──> PostgreSQL
```

## Quickstart

### 1. Database
```bash
cd database
chmod +x setup-db.sh
PGUSER=postgres ./setup-db.sh        # creates lms_full, applies schema, seeds lms_app + acme tenant
```

### 2. Backend (Laravel)
```bash
cd ../backend
composer install
cp .env.example .env
php artisan key:generate
# edit .env: DB_* point at the lms_app role, set JWT_SECRET
php artisan serve                    # http://localhost:8000
```

### 3. Try it
```bash
curl http://localhost:8000/health

curl -X POST http://localhost:8000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"tenantSlug":"acme","email":"alice@acme.com","password":"password123"}'

curl -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"tenantSlug":"acme","email":"alice@acme.com","password":"password123"}'
# copy accessToken, then:
curl http://localhost:8000/api/users -H "Authorization: Bearer <token>"
```

## Security model (don't skip)
Tenant isolation is enforced by PostgreSQL Row-Level Security. Laravel connects
as the **non-owner `lms_app`** role and sets `app.current_tenant` per request
inside a transaction (`app/Support/TenantContext.php`). Point the app at a
superuser/owner role and RLS is bypassed — always use `lms_app`.

## Status
- **Module 1 — Foundation**: tenant-RLS contract, JWT auth, users. ✅
- **Module 2 — Courses**: tenants, categories, courses, enrolments, content,
  + contextual RBAC guard. ✅
- **Module 3 — Assessment & grading**: gradebook + aggregation, quiz engine
  (versioned questions, attempt state machine), assignments + marking workflow. ✅
- **Module 4 — Engagement**: programs/nanodegrees (completion → credential),
  forums (threaded), groups. ✅
- **Module 5 — Integrations**: video (provider/gated), commerce (orders/payments/
  invoices), LTI 1.3, SCORM, webhooks. ✅
- **Module 6 — Scale/admin**: reporting/analytics, event stream, control plane
  (metering, subscriptions, backups). ✅

**Backend: 104 API routes, 32 services.** All 6 modules + spec gap-fill:
course structure, completion cascade, availability rules, credentials,
notifications, messaging, calendar, choices/feedback, and the xAPI statement
pipeline.
**Frontend (Next.js): 13 routes, builds cleanly** — login, dashboard, courses,
course detail, programs, grades, credentials, calendar, messages, quiz player,
and instructor authoring (teach + course editor).

> Module 5 note: integration adapters' external API calls (Stripe, M-Pesa, LTI
> handshake, eTIMS) run where credentials exist — the data layer is built and
> validated; the third-party calls are isolated behind provider refs.
> Module 6 note: the heavy scale infra (ClickHouse, OpenSearch, Citus, Redis,
> durable queues) is layered in at deployment; this backend is the OLTP source
> of truth and the summary tables they feed from.

> Note: `backend/vendor/` is not included (Composer was network-blocked at build
> time). Run `composer install` on your machine. All source is present and
> syntax-checked; the SQL/RLS the app relies on was validated against live PostgreSQL.
