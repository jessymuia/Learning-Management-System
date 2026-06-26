# Multi-Tenant LMS — Database Schema (Phases 0–5)

Production-grade PostgreSQL 16+ migrations for a multi-tenant LMS engineered for
millions of users. **Every statement was applied and tested against a live
PostgreSQL 16.14 instance**; the full 18-file set was clean-rebuilt from scratch
with zero errors and audited (PKs, FKs, RLS, partitions). Apply in numeric order.

## Files (apply in order)

| # | File | Phase | What it builds |
|---|------|-------|----------------|
| 00 | `00_uuidv7.sql` | 0 | Portable **monotonic** UUIDv7 generator (drop on PG18) |
| 01 | `01_foundation.sql` | 0 | Extensions, RLS plumbing (`app_current_tenant`/`app_bypass_rls`), shared triggers |
| 02 | `02_tenancy_identity.sql` | 0 | `tenants`, global `users`, `tenant_memberships`, `auth_methods` |
| 03 | `03_rbac.sql` | 0 | Spatie-equivalent RBAC + `ltree` context tree + context role assignments + optional deny |
| 04 | `04_files_async_audit.sql` | 0 | Content-addressed `files`/`file_blobs`, `audit_log`, `event_log`, `async_jobs` |
| 05 | `05_partitions.sql` | 0 | Monthly partition management helpers |
| 06 | `06_rls.sql` | 0 | RLS tenant-isolation policies (Phase-0 tables) |
| 07 | `07_courses_enrolment.sql` | 1 | Categories, courses, sections, polymorphic modules, enrolment, announcements |
| 08 | `08_grading.sql` | 2 | Gradebook: scales, rubrics, category tree, items, grades, history, summary, letters |
| 09 | `09_assessment.sql` | 2 | Question bank + versions, quizzes, slots, attempts, steps, assignments, submissions, completion |
| 10 | `10_immutability_triggers.sql` | 2 | Enforce immutable referenced question-versions + append-only logs |
| 11 | `11_engagement.sql` | 3 | Groups/groupings, forums, messaging, calendar, surveys/feedback/choice, availability rules |
| 12 | `12_credentials_programs.sql` | 3 | Badges/certificates, programs, cohorts, program courses/enrolments/progress |
| 13 | `13_content_video.sql` | 1/4 | Content activities + video sources (provider/gated delivery model) |
| 14 | `14_integrations.sql` | 4 | LTI 1.3, SCORM, payments (Stripe/M-Pesa/eTIMS), webhooks, xAPI |
| 15 | `15_control_plane.sql` | 5 | Plans, subscriptions, usage metering, resellers, backups (operator-scoped) |
| 16 | `16_rls_all.sql` | — | Extend RLS to every tenant-scoped table (Phases 1–4) |
| 17 | `17_partitions_all.sql` | — | Register all 8 partitioned parents for monthly management |

## Apply
```bash
for f in 00_uuidv7 01_foundation 02_tenancy_identity 03_rbac 04_files_async_audit \
         05_partitions 06_rls 07_courses_enrolment 08_grading 09_assessment \
         10_immutability_triggers 11_engagement 12_credentials_programs \
         13_content_video 14_integrations 15_control_plane 16_rls_all 17_partitions_all; do
  psql -v ON_ERROR_STOP=1 -f $f.sql
done
psql -c "SELECT ensure_month_partitions(3);"   # provision partitions before first write
```

## Runtime contract the application MUST honour

1. **Set the tenant per transaction** (after PgBouncer checkout), before any query:
   `SELECT set_config('app.current_tenant', '<tenant-uuid>', true);`
   RLS filters every tenant-scoped table on this. Forget it → you see nothing.
2. **Connect as a non-owner role.** Owner/superuser bypass RLS unless FORCE is
   set (it is) — but never run the app as the table owner regardless.
3. **Trusted ETL/maintenance** may opt out within a transaction:
   `SELECT set_config('app.bypass_rls', 'on', true);`
4. **UUIDv7**: PKs default to `uuidv7()`. On PG18 drop the function in `00_` and
   the native one takes over. App-side minting (Laravel) is equally valid.
5. **Partitions**: schedule `ensure_month_partitions()` nightly so next month
   exists before its first row. Detach + archive old partitions to ClickHouse.

## What was validated against live PostgreSQL (all green)

**Phase 0**
- UUIDv7: correct version/variant bits, time-decodable prefix, 100k-unique,
  monotonic within a millisecond (index locality under bursts).
- Identity: NULL idnumbers coexist; duplicate SIS id rejected per tenant; single
  local credential enforced; local-without-secret rejected.
- Contextual RBAC: teacher-in-A / student-in-B resolve to different capability
  sets; a category-level role inherits into child courses; a scoped PROHIBIT
  removes a capability in one course only. GiST `(tenant_id, path)` index used
  for ancestor queries at 20k contexts (no seq scan, tenant-bounded).
- RLS: per-tenant read isolation; cross-tenant write blocked by WITH CHECK;
  global tables (`users`, `tenants`, `permissions`) correctly exempt.

**Phase 2 (the hard core)**
- Gradebook aggregation: **natural sum skips NULL (≠0) and excluded grades**
  (verified = 70); **mean + drop-lowest** drops the lowest then averages
  (verified = 80). These are the spec's nastiest edge cases.
- Question versioning: a historical attempt pins to the exact
  `question_version_id` taken; editing the question creates v2 while the attempt
  still resolves v1 data — regrade-deterministic. A DB trigger makes referenced
  versions immutable while unreferenced drafts stay editable.

**Phase 3**
- Program completion recompute through the full lifecycle: 0% → required-done
  50% (still inprogress) → +1 elective 75% → +2nd elective **100% completed**,
  credential stamped idempotently, program_enrolment flipped to completed.

**Whole schema**
- Clean rebuild of all 18 files in order: zero errors.
- 77 base tables + 8 partitioned parents, **every one with a primary key**.
- **185 FKs, all valid (0 broken)**; 91 CHECK constraints; 198 indexes;
  77 RLS policies; 36 triggers; 8 partitioned parents × 5 monthly partitions.
- Cross-phase RLS: a `courses ⋈ gradebook_summary` join returns only the
  active tenant's rows; a direct probe for another tenant's known value returns
  0 rows.

## Design conventions (applied uniformly)

- `tenant_id UUID NOT NULL` + RLS on every domain table; **global** `users`,
  `tenants`, `permissions` carry no RLS (identity ≠ membership ≠ role).
- UUIDv7 PKs for index locality. Money = integer minor units. Times = `timestamptz` UTC.
- `ltree` + composite GiST `(tenant_id, path)` for every hierarchy (contexts,
  categories, grade tree).
- High-volume/append-only tables (`audit_log`, `event_log`, `grade_history`,
  `attempt_steps`, `lti_launches`, `webhook_deliveries`, `xapi_statements`,
  `usage_metering`) are **monthly range-partitioned**; their PKs include the
  partition key as PostgreSQL requires.
- Composite indexes lead with `tenant_id`, matching access patterns.

## Reference functions included (correctness oracles)

These encode the semantics the async PHP/queue workers implement; they are
proven here so the rules are pinned, and are safe to keep as SQL fallbacks:

- `effective_permissions(user, context)` — contextual RBAC resolver (ltree walk).
- `aggregate_category(tenant, course, user, category)` — gradebook aggregation.
- `recompute_program_progress(tenant, program, user)` — program completion.
- `create_month_partition()` / `ensure_month_partitions()` — partition lifecycle.

## Control plane note (Phase 5)
`plans`, `tenant_subscriptions`, `usage_metering`, `resellers`, `backups` are
**operator-scoped**, sit above the engine, and deliberately carry **no tenant
RLS** (the operator sees across tenants). In production they may live in a
separate database/service; they're schematized here for completeness.

## Deviations from the draft §7 schema (deliberate, tested)
- Monotonic UUIDv7 (not just time-ordered).
- RLS actually written and proven (the draft only specified it).
- `users` global (the draft's intent, made explicit).
- Spatie tables materialized with UUID keys so the custom context layer can FK in.
- Partitioned-table PKs include the partition key (the draft's bare `id` PK
  cannot be created on a partitioned table).
- Added integrity the draft lacked: status/format/email/hash CHECKs, single
  live quiz-attempt partial unique index, one-course-total-per-course index,
  exactly-one-target on permission_overrides, idempotency keys on async_jobs.
- `audit_log` (compliance) split from `event_log` (analytics).
- Immutability + append-only enforced by triggers, not just app discipline.
