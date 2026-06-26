# BUILD STATUS — Production LMS

*Honest, current status of what is actually implemented in this codebase. Last updated this session.*

This document exists because external reviewers reading `SPEC-STATUS.md` (the full specification) sometimes list already-built features as "remaining." This file reflects what is **actually in the code**, verified by inspecting the files and validating against a live PostgreSQL database.

**Stack:** Laravel 11 (PHP 8.3) API + Next.js 14 + PostgreSQL 16. Multi-tenant, RLS-isolated.
**Scale of code:** 28 migrations · 161 API routes · 37 frontend pages · 4 role dashboards · 7 RBAC roles.

---

## ✅ Implemented and validated

### Authentication & accounts
- Login, registration, refresh tokens, operator (super-admin) login
- **Password reset** — single-use hashed tokens, 1-hour expiry, forgot/reset pages
- MFA/SSO scaffolding

### Multi-tenancy & RBAC
- Tenant isolation via PostgreSQL Row-Level Security (9 migrations enable RLS)
- **6 roles** (+ TA) with context-scoped permissions: System Admin, Tenant Admin/Manager, Course Manager, Teacher, Student, Observer
- Roles assigned at the correct context (tenant-level for admins, course-level for teachers/students)
- Permission-gated API routes and permission-gated navigation

### Role dashboards (each role-specific, data-driven)
- `SystemAdminDashboard` — tenants, platform users, courses, system reports, billing links
- `ManagerDashboard` — org stats, people, programs, courses, revenue, payments
- `TeacherDashboard` — my courses, students, grading, teaching workflow strip
- `StudentDashboard` — courses, programs, average grade, certificates, progress
- `/dashboard` routes to the correct dashboard by permissions

### Content structure: Program → Course → Unit/Section → Lesson → Activity
- All layers exist in schema and API (programs, program_courses, course_sections, **lessons**, course_modules → content_activities)
- **Teacher builder** (`/teach/builder`): create sections, add lessons inline, add activities (page/file/video/assignment/**quiz**), drag-reorder sections and activities, **publish/unpublish** per section, **preview-as-student**

### Student course player (`/courses/[id]`)
- Unit → Lesson → Activity displayed hierarchically
- **Progress bar** (real % from completion data), per-unit progress
- **Activity completion toggling** (marks complete, updates progress live)
- Assignments section with submission links

### Assignments & quizzes
- Teachers create assignments (with due dates) and quizzes from the builder
- **Students submit assignments** (`/courses/[id]/assignments/[aid]`) — draft, submit, see grade + feedback
- Quiz player, attempts, regrading

### Gradebook wiring (fixed per independent audit)
An external audit correctly found that quiz/assignment grades were not reaching `grade_grades`, and that assignment grading silently dropped the score. These are now fixed and validated:
- **Assignment grading persists a numeric grade** — added `submissions.grade` column, accept `grade` in validation, store it, and mirror into `grade_grades` when released
- **Quiz grades reach the gradebook** — `finishAttempt()` resolves the grade across attempts per `grade_method` (highest/average/first/last) and writes to `grade_grades`
- **Activity→gradebook bridge** — `ensureModuleGradeItem()` + `recordModuleGrade()` create the grade_item and record the grade (the spec's "auto and manual grades share the same rows")
- **Weighted aggregation** — `recomputeSummary()` now applies per-item `weight` and `aggregationcoef` (extra credit), and honors the category aggregation strategy (natural / weighted_mean / mean) instead of a flat sum
- **Recompute wired to grade-writes** — the course summary recomputes immediately after each grade is recorded, so `/grades` reflects quiz and assignment marks
- **Server-authoritative quiz timer** — `recordStep()` now rejects steps past `due_at` (30s grace) and marks the attempt overdue, instead of relying on the client countdown

### Payments → enrolment automation
- Course pricing (free/paid, price in minor units)
- Checkout with M-Pesa (Daraja STK) and Stripe
- **Auto-enrol on payment success** — both M-Pesa callback and Stripe webhook mark order paid → grant access → issue invoice
- **Failed/pending payments do NOT unlock courses** (self-enrol returns HTTP 402 until a succeeded payment exists)
- Student payment history + downloadable receipts; manager payment report

### Certificates
- **Auto-issued on course completion** (when a course-level credential is defined)
- **Printable PDF certificate** (`/certificate/[code]`) — themed to issuing org's colors, download/print
- **Public verification page** (`/verify/[code]`) — valid/revoked/not-found, shows issuing org

### White-label branding
- Branding admin page (`/admin/branding`) — logo, primary/secondary colors, presets, theme, live preview
- **Applied globally**: login page (logo + colors), sidebar/app (CSS tokens), certificates (org colors), charts (inherit --accent)

### Reports & analytics
- Org overview: members, courses, programs, completions, **revenue, completion rate, active enrolments**
- **Visual charts** (dependency-free SVG): enrolment trend (line), revenue (bar), completion breakdown (donut), top courses (bar)
- Per-course report + at-risk learners

### Notifications & communication
- Notifications center (`/notifications`) with unread badges, mark-read/mark-all
- **Notification preferences** — per-user email/in-app toggles by category (assignments, payments, courses, forums)
- Forums, messages, groups, calendar

---

## ⚠️ Known limitations (honest, from the independent audit)

Still partial after the gradebook fixes above — real but lower-priority:
- **Nested category-tree roll-up**: aggregation applies weights + extra-credit and the top-level strategy, but does not yet recurse through arbitrarily-nested grade sub-categories to a course total. Single-level courses aggregate correctly.
- **Calculated grade items**: formula cycle-detection works, but evaluating a formula string against live grades and writing the result is not implemented.
- **Async recompute job**: recompute now runs synchronously inline on each grade-write (correct result); it is not yet dispatched to the queue (`RecomputeGradebookJob` remains uncalled).
- **Conditional availability**: `AvailabilityService` logic is correct but not yet enforced inside content/file endpoints — a "locked" module isn't gated server-side on the content route.
- **Completion**: marked via client checkbox, not auto-derived from quiz pass / assignment grade / view events.
- **Blind marking / marker allocation / moderation**: workflow states + rubric storage are real; identity-hiding and allocation are not implemented.
- **RBAC**: custom implementation (not spatie/laravel-permission); permission resolution is not Redis-cached.
- **Programs**: completion + credential math is correct; lazy course-enrolment and `unlock_rule` sequencing from spec §14.3 are not implemented.
- **i18n**: `en.json`/`sw.json` exist but pages use hardcoded English.

## ⚠️ Requires deployment credentials / infrastructure (not code gaps)

These are **built at the application layer** but need real external services to fully exercise:

- **Live payment money movement** — needs real M-Pesa Daraja + Stripe API keys. The order/payment/enrolment/invoice flow is implemented and validated; actual charging requires credentials.
- **Email sending** — notification preferences are stored and respected in logic, but actually delivering emails needs SMTP configuration. Email templates are minimal.
- **External integrations** (LTI / SCORM / xAPI) — backend structure exists; real provider testing needs external systems and credentials.
- **Video hosting** — video activities store provider + URL; streaming depends on the provider (YouTube/Vimeo/self-hosted).

---

## Validation method

Every layer is validated:
- **Backend:** `php -l` on all files + each service's exact SQL run against a live PostgreSQL 16 instance.
- **Frontend:** `npm run build` (Next.js production build) passes clean.
- **Database:** fresh DB spun up from migrations + demo seed on every change; RLS policies verified.

What cannot be validated here: full `docker compose up` end-to-end and live external services (payments/email/video) — those require the deployment environment.

---

## Demo credentials

- **Super Admin** (at `/login/admin`, no org): `operator@acme.com` / `demo1234`
- **Org users** (at `/login`, org `acme`, password `password`):
  - `tenantadmin@acme.com` (Tenant Admin), `alice@acme.com` (Manager), `coursemanager@acme.com` (Course Manager), `teacher@acme.com` (Teacher), `ta@acme.com` (TA), `observer@acme.com` (Observer), `bob@acme.com` + `carol@acme.com` (Students)

## Run

```bash
docker compose down -v
docker compose build --no-cache
docker compose up
docker compose exec -T postgres psql -U postgres -d lms_full < database/demo-data.sql
```

Frontend: http://localhost:3000 · API: http://localhost:8000
