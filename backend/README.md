# Production LMS — Backend API (Laravel) · Module 1: Foundation

Pure API server (PHP 8.3 + Laravel 11 + PostgreSQL). Next.js consumes it; the
backend has no Blade pages. This module delivers the **foundation**: the
tenant-RLS request contract, JWT auth, and the first tenant-scoped resource.

## Stack
- PHP 8.3 + Laravel 11
- PostgreSQL (the validated multi-tenant LMS schema, 18 SQL migrations)
- JWT auth (firebase/php-jwt) — access + refresh tokens
- Connects as the **non-owner `lms_app`** role so PostgreSQL RLS is enforced

## Why this can't be pre-built for you
`vendor/` is intentionally absent — Composer/Packagist were network-blocked in
the build environment, so dependencies are installed on your machine. Everything
else (every source file, config, route) is here and PHP-syntax-checked. The SQL
the app runs (auth lookups + the RLS `withTenant` path) was validated live
against PostgreSQL.

## Setup (on your machine, where Packagist is reachable)
```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
# edit .env: DB_* (point at lms_app), JWT_SECRET
php artisan serve            # http://localhost:8000
```

The database is shared with the schema package — apply the 18 migrations and run
`seed.sql` (creates the `lms_app` role + `acme` tenant) from the `database/`
folder first. The app connects as **lms_app** (non-owner) — never as the owner,
or RLS is bypassed.

## The one thing that matters most: `TenantContext`
`app/Support/TenantContext.php` exposes `withTenant($tenantId, $fn)`. Every
tenant-scoped query runs inside it: it opens a transaction, sets
`app.current_tenant`, runs your callback, commits/rolls back. `withSystem($fn)`
bypasses RLS for the few legitimate cross-tenant operations (global identity
lookup during login/registration).

## Endpoints in this module
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | – | DB connectivity |
| GET | `/api` | – | API banner |
| POST | `/api/auth/register` | – | Create user + membership + local credential |
| POST | `/api/auth/login` | – | Email + password → JWT (scoped to a tenant) |
| POST | `/api/auth/refresh` | – | Refresh token → new access token |
| GET | `/api/auth/me` | Bearer | Current identity + tenant |
| GET | `/api/users` | Bearer | Members of the caller's tenant (RLS-isolated) |
| GET | `/api/users/{id}` | Bearer | One member (tenant-bounded) |

Request bodies use `tenantSlug`, e.g.:
```bash
curl -X POST localhost:8000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"tenantSlug":"acme","email":"alice@acme.com","password":"password123"}'
```

## Layout
```
backend/
├── app/
│   ├── Http/
│   │   ├── Controllers/Api/ (AuthController, UserController, Controller)
│   │   └── Middleware/Authenticate.php
│   ├── Services/ (AuthService, TokenService)
│   └── Support/TenantContext.php   ← the RLS contract
├── config/   (app, database, cors, lms)
├── routes/   (api.php, web.php, console.php)
├── bootstrap/app.php               ← middleware + JSON error envelope
├── composer.json
└── .env.example
```

## Next module (Module 2 — Courses)
`/api/tenants`, `/api/categories`, `/api/courses`, `/api/enrolments`,
`/api/content`, plus the contextual RBAC resolver wired into a Gate/middleware.

---

# Module 2 — Courses (API-1)

Adds the course domain and the **contextual RBAC guard** on top of Module 1.

## New endpoints
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/tenants/me` | auth | Current tenant profile |
| POST | `/api/tenants` | (control-plane) | Provision a tenant + root context |
| GET | `/api/categories` | auth | List course categories (ltree) |
| POST | `/api/categories` | `course.manage` | Create a category |
| GET | `/api/courses` | auth | List courses (filter: status, categoryId) |
| GET | `/api/courses/{id}` | auth | One course |
| POST | `/api/courses` | `course.manage` | Create course (+ context node + course-total grade item) |
| PATCH | `/api/courses/{id}` | `course.manage` @course | Update course |
| DELETE | `/api/courses/{id}` | `course.manage` @course | Soft-delete course |
| GET | `/api/enrolments?courseId=` | auth | Enrolments for a course |
| GET | `/api/enrolments/mine` | auth | My enrolments |
| POST | `/api/enrolments` | `enrol.manage` | Enrol a user (manual) |
| POST | `/api/enrolments/{id}/suspend` | `enrol.manage` | Suspend (preserves grades) |
| GET | `/api/content?courseId=` | auth | List content activities |
| POST | `/api/content` | `course.manage` | Add content (page/file/url/video) |

## RBAC (the crown jewel)
`app/Services/RbacService.php` resolves effective permissions by walking the
ltree context tree (ancestor-or-self), unioning role permissions, subtracting
deny overrides — the same logic proven in SQL. `app/Http/Middleware/Authorize.php`
enforces it: routes declare `authorize:permission,scope` where scope is `tenant`
or `course:id`. Creating a course also creates its context node so roles can be
scoped to that course.

## How to grant a user permission to manage courses
After registering a user, run (from the `database/` folder):
```bash
psql -d lms_full -v email="alice@acme.com" -f grant-manager.sql
```

## Validated (SQL against live PostgreSQL)
- `alice` (manager) → `course.manage = true`; `dave` (no role) → `false`.
- Course creation inserts the course row, its context node, and its course-total
  grade item in one transaction — all under RLS as the `lms_app` role.

---

# Module 3 — Assessment & Grading (the hard core)

The spec's heaviest module (§5, §6): gradebook with aggregation, the quiz engine
with versioned questions and a server-authoritative attempt state machine, and
assignments with the marking workflow. Same API-first style; same TenantContext
RLS contract.

## Gradebook
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/grades/items?courseId=` | auth | Grade items in a course |
| POST | `/api/grades/items` | `grade.edit` | Create a grade item |
| POST | `/api/grades/categories` | `grade.edit` | Create a grade category (aggregation strategy) |
| POST | `/api/grades` | `grade.edit` | Set a grade (appends grade_history) |
| POST | `/api/grades/recompute` | `grade.edit` | Recompute the gradebook_summary |
| GET | `/api/grades/summary?courseId=&userId=` | auth | Read the denormalized summary |

Aggregation matches the spec edge cases: NULL (ungraded) is skipped (never 0),
excluded grades are removed; `natural` sums, `mean` supports drop-lowest /
keep-highest. Validated live: 30 + 40 + NULL + 50(excluded) → **70**.

## Quiz engine
| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/api/questions` | `quiz.manage` | Create question (+ immutable v1) |
| POST | `/api/questions/{id}/versions` | `quiz.manage` | New immutable version (regrade-safe) |
| POST | `/api/quizzes` | `quiz.manage` | Create a quiz |
| POST | `/api/quizzes/{id}/slots` | `quiz.manage` | Add a question slot |
| GET | `/api/quizzes/{id}/attempts` | auth | My attempts |
| POST | `/api/quizzes/{id}/attempts` | auth | Start attempt (server sets due_at) |
| POST | `/api/attempts/{id}/steps` | auth | Append an interaction (autosave/submit) |
| POST | `/api/attempts/{id}/finish` | auth | Finish; server computes sumgrade |

Questions are versioned immutably — each attempt step pins the
`question_version_id` so regrades are deterministic. The timer is
server-authoritative (`due_at` computed server-side, never the client clock).

## Assignments + marking workflow
| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/api/assignments` | `course.manage` | Create an assignment |
| PUT | `/api/assignments/{id}/submission` | auth | Save a draft |
| POST | `/api/assignments/{id}/submit` | auth | Submit (server cutoff + late flag) |
| GET | `/api/assignments/{id}/submission` | auth | My submission |
| GET | `/api/assignments/{id}/submissions` | `grade.edit` | All submissions (marker view) |
| POST | `/api/submissions/{id}/grade` | `grade.edit` | Grade (rubric, feedback, workflow) |

Submission state: draft → submitted → graded → returned. Marking workflow:
notmarked → inmarking → complete → released.

## Validated (SQL against live PostgreSQL, as lms_app under RLS)
- Gradebook natural aggregation skipping NULL + excluded → 70 ✓
- Question versioning: v1 immutable, current pointer advances to v2 ✓
- Quiz attempt: server-set due_at, inprogress → finished ✓
- Caught & fixed a schema match: `question_versions.questiontext` is `jsonb`.

---

# Module 4 — Engagement & Collaboration

Phase 3 of the spec: programs/nanodegrees (the composition layer above courses),
forums, and groups. Same API-first style, same TenantContext RLS contract.

## Programs / nanodegrees (the centerpiece)
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/programs` | auth | List programs |
| POST | `/api/programs` | `course.manage` | Create a program |
| POST | `/api/programs/{id}/courses` | `course.manage` | Add a course (required/elective) |
| POST | `/api/programs/{id}/enrolments` | auth | Enrol in a program (self or specified user) |
| POST | `/api/programs/{id}/recompute` | `course.manage` | Recompute a user's progress |
| GET | `/api/programs/{id}/progress?userId=` | auth | Read program progress |

Completion is event-driven and idempotent (spec §7.7): when constituent courses
complete, progress recomputes; once all required courses + the elective minimum
are satisfied, the program flips to completed and a credential is issued (once).
Electives must belong to an `elective_group` (enforced). Validated live: a
2-required + 2-elective (min 1) program goes 0% → complete correctly.

## Forums
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/forums?courseId=` | auth | Forums in a course |
| POST | `/api/forums` | `course.manage` | Create a forum |
| GET | `/api/forums/{id}/discussions` | auth | Discussions in a forum |
| POST | `/api/forums/{id}/discussions` | auth | Start a discussion (+ opening post) |
| GET | `/api/discussions/{id}/posts` | auth | Posts in a discussion (threaded) |
| POST | `/api/discussions/{id}/posts` | auth | Reply (parentId for threading) |

## Groups
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/groups?courseId=` | auth | Groups in a course |
| POST | `/api/groups` | `course.manage` | Create a group |
| GET | `/api/groups/{id}/members` | auth | Group members |
| POST | `/api/groups/{id}/members` | `course.manage` | Add a member |

## Validated (SQL against live PostgreSQL, as lms_app under RLS)
- Program completion lifecycle: required + elective-minimum → completed ✓
- Forum threading: reply links to parent post ✓
- Group membership with roles ✓
- Caught & fixed two schema rules: course_completion.state is text
  ('inprogress'|'complete'); program electives require an elective_group.

---

# Module 5 — Standards & Integrations

Phase 4 of the spec: video delivery, payments, LTI 1.3, SCORM, webhooks. These
are adapters to external services — the data layer is built and validated here;
the actual third-party API calls (Stripe charge, M-Pesa STK push, LTI JWT
handshake, eTIMS) run where credentials exist (your env/secrets), not in this
build sandbox. That boundary is intentional and documented per endpoint.

## Video (the provider/gated decision, spec §7.6)
| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/api/videos` | `course.manage` | Attach a video source to a content activity |
| GET | `/api/videos/{id}/playback` | auth | Playback instructions (embed vs signed) |

`provider` selects the player (youtube/vimeo/mux/cloudflare_stream/self);
`gated` selects delivery (false = open embed, true = signed token). Open
providers default ungated, managed providers default gated. Playback returns an
embed URL for open videos, a signed-token placeholder for gated ones (real
signing uses the managed provider's key in production).

## Commerce (orders / payments / invoices, spec §8)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/orders` | auth | Create an order (pending) |
| GET | `/api/orders/{id}` | auth | Order status |
| POST | `/api/orders/{id}/payments` | auth | Record a provider payment result |

On a `succeeded` payment the order is fulfilled in one transaction: status→paid,
enrolment granted (course or program), invoice issued — idempotent by
provider_ref. Money is integer minor units; Stripe + M-Pesa + manual providers.
Validated live: pending → paid → enrolled + invoiced, idempotent.

## LTI 1.3
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET/POST | `/api/lti/registrations` | `course.manage` (POST) | Tool registrations |
| POST | `/api/lti/registrations/{id}/launch` | auth | Begin a launch (nonce/state) |

## SCORM
| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/api/scorm/packages` | `course.manage` | Register a package |
| GET/PUT | `/api/scorm/packages/{id}/tracks` | auth | CMI runtime tracking |

## Webhooks
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET/POST | `/api/webhooks` | `course.manage` | Subscribe / list outbound webhooks |

## Validated (SQL against live PostgreSQL, as lms_app under RLS)
- Commerce: order pending → payment succeeded → paid + enrolled + invoiced,
  idempotent by provider_ref ✓
- Video: youtube→ungated, mux→gated ✓
- Webhook event matching via jsonb_exists ✓
- Caught & fixed: jsonb `?` operator clashes with the PDO `?` placeholder —
  switched to `jsonb_exists(events, ?)`.

---

# Module 6 — Scale, Analytics & Enterprise (final backend module)

Phase 5: reporting/analytics, the append-only event stream, and the control
plane (metering, subscriptions, backups). Reads denormalized summary tables
rather than computing live (the spec's read/write asymmetry).

## Reporting / analytics
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/reports/tenant` | `course.manage` | Tenant rollup (courses, members, programs, completions) |
| GET | `/api/reports/courses/{id}` | `grade.view` | Course overview (enrolment, completion, avg grade) |
| GET | `/api/reports/courses/{id}/at-risk` | `grade.view` | At-risk learners (low/no grade) |

## Control plane (metering / subscription / backups)
These tables have **RLS off** (operator-level), so the services use
`withSystem()` rather than `withTenant()`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/usage?period=` | Tenant usage (summed per metric) |
| POST | `/api/admin/usage` | Record a usage metric (append-only) |
| GET | `/api/admin/subscription` | Current plan/subscription |
| GET | `/api/admin/backups` | Backup records |
| POST | `/api/admin/backups` | Request a course/tenant backup |

## Validated (SQL against live PostgreSQL, as lms_app)
- Reporting: 2 enrolments, 1 completed, avg grade 60.00, 1 at-risk ✓
- Metering append-and-sum (control plane, RLS off): 10 + 5 → 15 ✓
- Caught & fixed: usage_metering has no (tenant,metric,period) unique key —
  switched from ON CONFLICT upsert to append-only insert + sum-on-read.

## Notes on the heavy infra (per spec §4, §9, §12)
The spec's scale tier — ClickHouse marts, OpenSearch, Citus sharding, SQS/
RabbitMQ workers, Redis caching — is layered in at deployment. This backend
provides the OLTP source of truth and the summary tables those systems feed
from. The reporting endpoints aggregate the OLTP summaries directly (correct for
moderate scale); at large scale they'd read the ClickHouse marts instead, with
the same response shapes.
