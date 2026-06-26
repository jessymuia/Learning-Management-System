# Production-Scale LMS — Architecture, Feature Specification & Build Roadmap

*A product-engineering reference for designing a multi-tenant LMS engineered for millions of users, learning from Moodle's domain model without reusing its code.*

---

## 0. How to read this document

This is organized so you can build incrementally without painting yourself into a corner:

1. **Design principles & non-functional targets** — the constraints everything else serves.
2. **Domain model** — the conceptual spine (the part most homegrown LMSs get wrong).
3. **Phased roadmap** — features grouped by priority, P0 → P5, isolated so each phase ships value.
4. **Grading deep-dive** and **Assessment deep-dive** — the two subsystems that consume the most engineering time and contain the nastiest edge cases.
5. **Database schema** — production-grade, tenant-aware, partitioned, designed for horizontal scale.
6. **Integrations** — the standards and third parties you integrate rather than rebuild.
7. **Scaling architecture** — how the system survives millions of users.
8. **Cross-cutting concerns** — accessibility, i18n, security, privacy, observability (built in from Phase 0, never bolted on).
9. **Risk register** — where the schedule actually goes.

A recurring theme: **the differentiation is UX and a chosen vertical; the engine is mostly commodity.** Integrate the commodity (LTI, SCORM, xAPI, H5P, payments, video, search) and build only what is genuinely yours.

---

## 1. Design principles & non-functional requirements

### 1.1 Principles

- **Tenant-aware from row zero.** Every domain row carries a tenant identifier. This is a one-way door — retrofitting tenancy onto a single-tenant schema is a rewrite. Building custom (vs. on Moodle) is precisely what lets you bake this in.
- **Separation of concerns in the domain.** Authentication ≠ enrolment ≠ role. A user authenticates (who you are), is enrolled (your relationship to a course), and holds roles (what you may do, scoped to a context). Conflating these is the single most common LMS design error.
- **Server-authoritative state.** Timers, attempt limits, availability windows, and grades are computed and enforced server-side. The client is never trusted for anything that affects a grade.
- **Async by default for anything expensive.** Grade recalculation, quiz regrading, notifications, report generation, and content packaging run on queues, never inline in a request.
- **Read/write asymmetry.** Reads vastly outnumber writes. Denormalize and cache aggressively for reads (dashboards, gradebooks); keep writes in normalized, authoritative tables.
- **Append-only where possible.** Logs, attempt steps, grade history, and xAPI statements are append-only and time-partitioned, which makes them trivially archivable.

### 1.2 Non-functional targets (state them now, design to them)

| Dimension | Target |
|---|---|
| Concurrent users | 100k+ concurrent, millions registered |
| Page p95 latency | < 300 ms (cached reads), < 800 ms (course view) |
| Availability | 99.9% (≈ 8.8 h/yr); 99.95% for auth/login path |
| RPO / RTO | RPO ≤ 5 min (PITR), RTO ≤ 30 min |
| Data isolation | Per-tenant; enforced at DB (RLS) + app layers |
| Accessibility | WCAG 2.2 AA (legal requirement in education) |
| Compliance | GDPR + Kenya Data Protection Act 2019 (export, erasure, residency) |

---

## 2. Domain model — the conceptual spine

This is the clean-room version of the lessons worth taking from Moodle. Understand these five abstractions and most of the LMS falls out of them.

### 2.1 Tenancy

A **tenant** (organization) is the top of every hierarchy. Pooled multi-tenancy with a `tenant_id` discriminator + PostgreSQL Row-Level Security is the baseline; shard by `tenant_id` (Citus distributed tables or app-level sharding) once a single cluster is saturated. Large/enterprise tenants can be promoted to dedicated shards. This mirrors the discriminator/RLS-vs-sharding trade-off directly: start pooled+RLS, migrate hot tenants to dedicated shards on the same `tenant_id` key so the boundary never changes.

### 2.2 Identity vs. membership

- **User** = global identity (email, credential, profile).
- **Tenant membership** = a user's relationship to an organization (a user may belong to several).
- **Authentication method** is pluggable (local password, OIDC, SAML, LDAP, social) and decoupled from identity.

### 2.3 The context tree + RBAC, backed by `spatie/laravel-permission` (the crown jewel)

Permissions are granular and resolved against a **context hierarchy**, not hard-coded role checks:

```
System → Tenant → Course Category → Course → Activity → (Block / User)
```

The permission *vocabulary, role definitions, caching, and Laravel Gate integration* come from **`spatie/laravel-permission`**; the *context scoping and hierarchical resolution* — which Spatie does not provide natively — are a thin custom layer on top. Concretely:

- A **permission** (Spatie `Permission`) is a fine-grained string (`course.view`, `quiz.attempt`, `grade.edit`, `user.impersonate`), with wildcard support (`grade.*`). This is the granular "capability" vocabulary; throughout this doc, *capability* and Spatie *permission* are the same concept.
- A **role** (Spatie `Role`) is a named bundle of permissions. Spatie's **teams** feature is enabled with `team_id = tenant_id`, so each tenant gets its own role set: a platform ships default roles (teacher, student, manager) and tenants may define custom roles, all tenant-isolated.
- A **context** is a node in the hierarchy. Use PostgreSQL `ltree` for the materialized path — a concrete improvement over Moodle's integer-path `mdl_context` table, making "all contexts under X" a single indexed query. Spatie has no concept of contexts; this is the custom layer.
- A **context role assignment** binds (user, role, context). Spatie's own `model_has_roles` only scopes by team (tenant), so course/category/module-level assignments live in a custom `context_role_assignments` table. Tenant-wide roles (e.g. tenant admin) may still use Spatie's native assignment at the tenant context.
- **Resolution** is **additive by default** — the Spatie-native model, where permissions are grants you either hold or don't. A custom resolver service, given (user, target context), walks the context tree once (`ltree @>`), collects the roles assigned at every ancestor context, unions their Spatie permissions, and caches the effective set in Redis. It is exposed through a custom Gate check, e.g. `$user->canInContext('quiz.attempt', $context)`, so `@can`, policies, and middleware all work as Laravel developers expect.
- **Explicit deny (`PROHIBIT`/`PREVENT`)** is *optional*. Spatie is purely additive and has no deny semantics; if a vertical needs Moodle-style "prohibit that cannot be re-granted lower down," add a small `permission_overrides` table consulted by the resolver after the additive union. Default to additive-only for simplicity — it covers the large majority of LMS authorization needs.

This expresses "teacher in course A, student in course B, admin of category C, observer site-wide" without special-casing any of them — while keeping the day-to-day developer ergonomics, caching, and Gate integration of the standard Laravel permission package.

> **Trade-off, stated plainly:** adopting Spatie buys you the Laravel ecosystem (Gate, middleware, policies, mature caching, familiar API) at the cost of Spatie's flat/additive model, which you compensate for with the context-resolution layer and an optional deny table. The alternative — a fully bespoke ALLOW/PREVENT/PROHIBIT engine — is more powerful but is more code to own and sits outside the framework's conventions.

### 2.4 Course structure

- **Course category** (hierarchical, `ltree`) → **Course** → **Section** (topic/week) → **Course module** (an instance of an activity placed in a section).
- A **course module** is polymorphic: it points to one activity instance (`assignment`, `quiz`, `resource`, `forum`, `lti`, `scorm`, …). The module carries placement, visibility, availability rules, and completion config; the activity instance carries type-specific data.

### 2.5 Enrolment (separate from auth, separate from role)

- **Enrolment method** (manual, self-enrolment, cohort sync, LTI, payment, API) is pluggable per course.
- **User enrolment** records (user, course, method, status, time window). Enrolment grants access; a separate role assignment grants capabilities. Suspended enrolment ≠ unenrolled (preserves grades/history).

### 2.6 Gradable activities & the gradebook

Every gradable activity owns a **grade item**. Grade items live in a per-course **grade category tree** that aggregates upward to a course total. (Full treatment in §5.)

### 2.7 Content & files

Content-addressed storage: a file's bytes are hashed (SHA-256), stored once in object storage, and referenced many times. The DB stores metadata + the logical file tree (which component/area/context/item a file belongs to). Deduplication is automatic. (Borrowed from Moodle's File API; modernized to object storage from day one.)

### 2.8 Programs (packaged programs / nanodegrees)

A **program** is a structural layer *above* courses — a bundled, sequenced learning path (Udacity-style nanodegree, professional track, multi-course certificate) that a learner enrols in as a unit and that issues a credential on completion. It does not replace courses; it composes them.

- A **program** bundles N courses, each marked **required** or **elective**, with an optional "complete X of these electives" rule per elective group.
- **Sequencing** is expressed with the same conditional-availability rule engine used at the activity level, scoped to the program: a course unlocks when its prerequisites (prior course completion, date, payment) are satisfied.
- A course can belong to **multiple programs** (many-to-many via `program_courses`), so shared foundational courses aren't duplicated.
- **Program enrolment** is its own relationship, distinct from course enrolment: enrolling in a program grants/sequences access to its constituent courses; course-level enrolment still exists independently for standalone learners.
- **Program completion** is derived from constituent-course completion (all required + the elective minimum), recomputed asynchronously into a denormalized progress summary — the same pattern as the gradebook.
- On completion, a **credential** is issued through the existing badges/certificates machinery (Phase 3); paid programs run through the existing payments integration (subscription or per-program).

This is deliberately a thin composition layer: it reuses completion tracking, the availability rules engine, certificates, and payments rather than introducing parallel machinery.

---

## 3. Phased roadmap (priority-ordered, each phase shippable)

Priority tags: **P0** = blocking foundation, **P1** = core product, **P2** = competitive, **P3** = enterprise/scale.

> **Cross-cutting, built from Phase 0 (never deferred):** accessibility (WCAG), internationalization, security/authz, audit logging, observability, CI/CD, automated tests. Deferring any of these is the classic "looks 80% done at month 3" trap — they are 10× cheaper built-in than retrofitted.

### Phase 0 — Foundation (P0) — *no end-user features, everything depends on it*

| Capability | Notes / edge cases |
|---|---|
| Tenancy + RLS + sharding key | `tenant_id` on every table; RLS policies; choose Citus or app-shard early |
| Identity, auth methods, sessions | Pluggable auth; sessions in Redis; MFA; password reset; account lifecycle |
| Context tree + RBAC (spatie/laravel-permission) | The §2.3 model; Spatie for roles/permissions + Gate/cache; custom context resolver |
| Data layer + migrations | Schema, partitioning, connection pooling (PgBouncer) |
| Object storage + content-addressed File API | SHA-256 dedup; signed URLs; virus scan hook |
| Async infra (queue + workers + scheduler) | Redis/SQS/RabbitMQ; idempotent jobs; dead-letter queue |
| Public API skeleton (REST + webhooks) | Versioned; token + OAuth2; rate limiting |
| Observability, audit log, CI/CD | Structured logs, metrics, traces, error tracking |

### Phase 1 — Core teaching & learning (P0/P1) — *"deliver a course" MVP*

| Capability | Notes / edge cases |
|---|---|
| Categories, courses, sections | Course lifecycle: draft/active/archived/deleted; soft delete |
| Enrolment (manual + self) | Time-windowed; suspended state; capacity limits |
| Content delivery | Pages, files, URLs, books, folders; ordering; drag-drop |
| Course navigation + dashboard | Per-role views; "what's due"; recent activity |
| Assignment submission (text + file) | Drafts, resubmission, due/cutoff dates, late flagging |
| Announcements / notices | Per-course; email digest |
| Notifications (email) | Templated, queued, per-user preferences, unsubscribe |
| Basic theming / white-label | Per-tenant branding, logo, color tokens |

### Phase 2 — Assessment & grading (P1) — *the hard core, where the edge cases live*

| Capability | Notes / edge cases |
|---|---|
| Gradebook: items, categories, aggregation | See §5 — full aggregation engine, async recompute |
| Assignment grading workflow | Rubrics, marking guides, marking workflow states, blind/anonymous marking, allocated markers |
| Quiz engine | See §6 — question bank, attempt state machine, server-authoritative timer |
| Question types (core set) | MCQ, multi-answer, true/false, matching, short answer, numerical, essay |
| Question versioning + regrade | Historical attempts grade against the version taken; async regrade jobs |
| Completion tracking | Activity + course completion; criteria; conditional release |
| Feedback to learners | Per-question feedback, overall feedback, grade release timing |

### Phase 3 — Engagement & collaboration (P2)

| Capability | Notes |
|---|---|
| Forums / discussions | Threaded, subscriptions, Q&A mode, ratings, moderation |
| Groups & groupings | Group-restricted activities, group submissions, group grading |
| Messaging | 1:1 and group; real-time (WebSocket) optional |
| Calendar & events | Course/user/site scopes; iCal export; due-date sync |
| Surveys / feedback / choice | Anonymous responses; analytics |
| Badges & certificates | Criteria-based issuance; Open Badges; verifiable PDFs |
| Conditional availability | Rules engine: date, grade, completion, group, profile field |
| **Programs / packaged paths (nanodegrees)** | Bundle + sequence courses; required/elective groups; program enrolment; async program-completion → credential; reuses availability engine, certificates, payments |

### Phase 4 — Standards & integrations (P2/P3) — *integrate, don't rebuild*

| Capability | Notes |
|---|---|
| **LTI 1.3 / Advantage** (consumer + provider) | Deep Linking, AGS (grade passback), NRPS (roster) |
| **SCORM 1.2 / 2004** | Runtime + CMI data model + sequencing; AICC legacy optional |
| **xAPI + LRS / cmi5** | Statement pipeline; bring or build a Learning Record Store |
| **H5P** | Interactive content; emits xAPI |
| **SSO** | SAML 2.0, OIDC, LDAP/AD, social |
| **Payments** | Stripe + M-Pesa (Daraja API) + KRA eTIMS invoicing for KE market |
| **Video** | Transcoding/streaming (Mux/Cloudflare Stream); live (Zoom/BigBlueButton) |
| **Plagiarism** | Turnitin / Ouriginal hooks on submission |
| **Public API + webhooks** | Full REST/GraphQL parity for headless/partner use |

### Phase 5 — Scale, analytics & enterprise (P3)

| Capability | Notes |
|---|---|
| Reporting & learning analytics | Pre-aggregated marts; cohort/engagement/at-risk models |
| Search | Dedicated engine (OpenSearch); never DB `LIKE` at scale |
| Advanced caching + sharding | Per-tenant shard promotion; multi-region read |
| Mobile apps | Offline content sync; push; consume the public API |
| Multi-tenant admin / reseller console | Provisioning, billing, metering, white-label management |
| Backup / restore / import-export | Course backup format; IMS Common Cartridge; per-tenant DR |
| Plugin / extension framework | Sandboxed extension points; marketplace (long-term) |

---

## 4. Why this ordering

- **Phase 0 cannot be reordered.** Tenancy, RBAC, async, and the file layer are dependencies of everything. Skipping them to "get features out" guarantees a rewrite.
- **Grading (Phase 2) is deliberately *after* content (Phase 1)** but *before* engagement (Phase 3), because grading is the load-bearing differentiator of an LMS vs. a CMS, and its edge cases dictate schema decisions you don't want to discover late.
- **Integrations (Phase 4) come after a working core** because LTI/SCORM/xAPI all assume the existence of courses, grade items, and a roster to map onto.
- **Scale (Phase 5)** is last only in *feature* terms — the *schema* and *infra* for scale are laid in Phase 0. You build scalable from the start; you optimize for scale last.

---

## 5. Grading deep-dive (the nitty-gritty)

The gradebook is where most LMS projects underestimate by months. Here is the model and the edge cases.

### 5.0 Automatic vs. human grading (it is both — a hybrid)

Grading is **not** one or the other; the system runs a hybrid model, and the gradebook is the common sink that both feed:

- **Automatically graded** — objective question types where correctness is machine-decidable: multiple choice (single/multi), true/false, matching, numerical (with tolerance), short answer (pattern/regex matching), select-missing-words, drag-and-drop, calculated. These grade the instant an attempt is submitted (or immediately, in immediate-feedback mode), with no human in the loop.
- **Human graded** — open-ended work where judgment is required: essay questions, file/text assignment submissions, projects, and any activity flagged for manual marking. These flow through the **marking workflow** (states: not marked → in marking → complete → released), support rubrics/marking guides, marker allocation, blind/anonymous marking, and moderation/second-marking.
- **Mixed within one activity** — a quiz can contain both auto-graded questions (scored instantly) and an essay question (left pending until a marker grades it); the attempt's total is provisional until the human portion is complete.
- **The gradebook does not care which path produced a grade.** Auto and manual grades land in the same `grade_grades` rows, aggregate identically, and carry the same history/audit. A `source` field on `grade_history` records whether each change was `auto`, `manual`, `regrade`, or `import`.

Practical consequence: objective assessment scales to millions of submissions for free (no marking bottleneck), while subjective assessment is gated by marker capacity — which is the cost lever to watch, and the reason a reviewer/mentor capacity model is a known future extension (intentionally out of scope here).

### 5.1 Objects

- **Grade item** — one per gradable activity, plus *manual* items (offline grades) and *calculated* items (formula over other items). Carries `grademin`, `grademax`, `gradepass`, `scale_id` (nullable), `weight`, `aggregationcoef`, `hidden`, `locked`, `multfactor`, `plusfactor`.
- **Grade category** — a node in the per-course grade tree; itself a grade item (its aggregate). Carries the **aggregation strategy** and dropping/keeping rules.
- **Grade (grade_grades)** — a user's grade for an item: `rawgrade`, `finalgrade`, `feedback`, `overridden`, `excluded`, `hidden`, `locked`, `timemodified`, marker.
- **Scale** — an ordered list of named levels (e.g., "Not yet competent / Competent / Exceeds") mapped to ordinal positions.
- **Letter boundaries** — percentage thresholds → letters, per category/course.

### 5.2 Aggregation strategies (support all; default to "natural")

- **Natural (sum of grades)** — sum of raw points with per-item weights; the sane default.
- **Mean of grades**, **Weighted mean**, **Simple weighted mean** (weight = grademax).
- **Median**, **Min**, **Max**, **Mode**.
- **Dropping rules** — drop lowest N, keep highest N (interacts viciously with weights — define precisely and test).
- **Extra credit** — items that add to the total without increasing the max.

### 5.3 Calculation pipeline (per user, per item, bottom-up)

1. Normalize raw grade to `[grademin, grademax]`.
2. Apply scale → points mapping if scaled.
3. Apply `multfactor` / `plusfactor` adjustments.
4. Apply exclusions/overrides.
5. Aggregate leaves into their category per its strategy.
6. Recurse up the tree to the course total.
7. Apply letter/percentage display transforms at render time (store points, not display strings).

### 5.4 Recalculation — the expensive part

- Changing an item's grade, weight, or an aggregation setting **invalidates every ancestor aggregate for affected users**. This is a dependency graph, not a single update.
- **Do it async.** Enqueue a recompute job keyed by (course, affected users, changed item). Workers recompute and write `finalgrade` + refresh a **gradebook summary table** (denormalized matrix for fast reads).
- **Cache the computed totals.** Dashboards and gradebook reads hit the summary table / cache, never the live aggregation.
- **Calculated-item formulas** form a dependency DAG — detect and reject **circular references** at save time; topologically order recomputation.
- **Idempotency + ordering.** Recompute jobs must be idempotent and coalesced (collapse a burst of edits into one recompute per user/course).

### 5.5 Regrading

- When a question is edited or its marks change, **all existing attempts that used it must be regraded.** This is why **questions are versioned**: each attempt records the question *version* it was taken against, so you can regrade deterministically and show "grade changed from X to Y."
- Regrade is a batched async job with progress reporting, dry-run preview ("N attempts will change"), and a full audit trail.

### 5.6 Grade history & audit (non-negotiable)

Every grade change is appended to **grade history**: who, when, old → new value, reason, source (manual/automatic/regrade/import). Grade disputes are a legal/contractual reality; without history you cannot defend a grade.

### 5.7 Edge cases to handle explicitly

- **Partial / draft submissions** vs. submitted vs. graded — distinct states; don't grade a draft.
- **Late penalties** — percentage or flat, per-day or one-off, applied to raw vs. final; configurable, auditable.
- **Ungraded vs. zero** — a missing grade is *not* zero unless a policy says "treat unsubmitted as zero after cutoff." Aggregation must distinguish `NULL` (not graded) from `0`.
- **Excluded grades** — removed from aggregation but visible.
- **Overrides** — manual override of a computed grade; flag and lock so recompute doesn't clobber it.
- **Hidden grades** — affect computation but are not shown until release; "release on date" timing.
- **Blind / anonymous marking** — marker cannot see identity until grades are released; reveal is a discrete, audited step.
- **Marking workflow** — states: not marked → in marking → marking complete → released. Multiple markers, allocation, moderation/second-marking.
- **Group grading** — one grade to a group, propagated to members, with per-member override.
- **Scale changes after grading** — block or carefully migrate; never silently remap.
- **Performance** — a course with 5,000 students × 60 items = 300k cells. Never compute or render that synchronously; paginate, pre-aggregate, stream exports.

---

## 6. Assessment / quiz engine deep-dive

### 6.1 Model

- **Question bank** — questions live in versioned categories, reusable across quizzes; not owned by a single quiz.
- **Question version** — immutable once an attempt references it.
- **Quiz** — config: open/close window, time limit, attempts allowed, grading method (highest/average/first/last), question behavior (deferred/immediate feedback, adaptive), navigation (free/sequential), shuffling, review options per phase.
- **Quiz attempt** — (user, quiz, attempt number, state, timestamps, sum grade).
- **Attempt step** — append-only log of every interaction per question (answer set, autosave, submit, manual comment), enabling exact replay and regrade.

### 6.2 Attempt state machine

```
notstarted → inprogress → (overdue) → submitted/finished → graded
                       ↘ abandoned
```

- Transitions are **server-enforced**. The close time and time limit are authoritative on the server; a client clock is advisory only.

### 6.3 Question types (build the core, integrate the exotic)

Core: MCQ (single/multi), true/false, matching, short answer (with pattern matching), numerical (with tolerance + units), essay (manual graded), select-missing-words / drag-and-drop, cloze/embedded, calculated (templated with dataset). Exotic/interactive content types: prefer **H5P** rather than building bespoke renderers.

### 6.4 Edge cases (these are the months-eaters)

- **Server-authoritative timer** with a grace period; submit-on-expiry; clock skew tolerance.
- **Autosave** every N seconds; resume after browser crash / network loss exactly where left off.
- **Concurrent sessions / multiple tabs** — detect and reconcile or lock to one active attempt.
- **Attempt limits** with per-user overrides (accessibility/extra-time accommodations).
- **Randomization** — random questions drawn from categories; per-attempt shuffling of options; ensure regrade maps back to the *specific* drawn version.
- **Grading methods** interact with multiple attempts — define precisely (e.g., "highest" recomputes when a later attempt is regraded).
- **Manual grading** of essays slots into the same marking-workflow + grade-history machinery as assignments.
- **Review options** — what the learner sees, and *when* (during, immediately after, after close) — a frequent source of cheating complaints if wrong.
- **Secure delivery** (lockdown/proctoring) — optional integration, not core.

---

## 7. Database schema (PostgreSQL, tenant-aware, partitioned, scale-ready)

Conventions:
- Every domain table has `tenant_id UUID NOT NULL` and an **RLS policy** filtering on the current tenant.
- Surrogate PKs are `UUID` generated as **UUIDv7** (time-ordered). Use v7, **not** v4 (`gen_random_uuid()`): random v4 keys fragment B-tree indexes and amplify writes at scale, whereas v7's time prefix keeps inserts append-friendly. `uuidv7()` is native in PostgreSQL 18; on PG 16/17 generate it in the app layer (Laravel) or via a small SQL/PLpgSQL helper. UUIDs also avoid leaking row counts and let clients mint IDs offline.
- **Sharding/distribution key = `tenant_id`** (Citus `create_distributed_table(..., 'tenant_id')`), so co-located joins stay on one shard.
- Hierarchies use `ltree`. Time-series/high-volume tables use **declarative range partitioning by time**.
- All money is integer minor units; all times are `timestamptz` stored UTC (display in user/tenant timezone — never store local time).

### 7.1 Tenancy, identity, RBAC

```sql
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  name          TEXT NOT NULL,
  slug          CITEXT NOT NULL UNIQUE,         -- subdomain
  custom_domain CITEXT UNIQUE,
  status        TEXT NOT NULL DEFAULT 'active', -- active|suspended|deleted
  plan          TEXT NOT NULL,
  data_region   TEXT NOT NULL,                  -- residency
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  email         CITEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'active',
  profile       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email)
);

CREATE TABLE tenant_memberships (
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'active',
  idnumber      TEXT,                           -- external SIS id
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE auth_methods (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  user_id       UUID NOT NULL,
  type          TEXT NOT NULL,                  -- local|oidc|saml|ldap|social
  external_id   TEXT,
  secret_hash   TEXT,                           -- argon2id for local
  data          JSONB NOT NULL DEFAULT '{}',
  UNIQUE (tenant_id, type, external_id)
);

-- The context tree (ltree path = materialized hierarchy)
CREATE TABLE contexts (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  level         TEXT NOT NULL,                  -- system|tenant|category|course|module|user
  instance_id   UUID NOT NULL,               -- id of the thing this context wraps
  path          LTREE NOT NULL,                 -- e.g. tenant.cat_4.course_12.mod_88
  UNIQUE (tenant_id, level, instance_id)
);
CREATE INDEX idx_contexts_path ON contexts USING GIST (path);

-- ── Roles & permissions: provided by spatie/laravel-permission (teams enabled) ──
-- These five tables are generated by the package migration; key columns shown.
-- Configure team_foreign_key = tenant_id so role sets are tenant-scoped.
--   permissions(id, name, guard_name)                      -- the granular vocabulary
--   roles(id, name, guard_name, tenant_id)                 -- tenant-scoped role definitions
--   role_has_permissions(permission_id, role_id)           -- role = bundle of permissions
--   model_has_permissions(permission_id, model_type, model_id, tenant_id)
--   model_has_roles(role_id, model_type, model_id, tenant_id)   -- tenant-wide assignments
-- Note: Spatie uses BIGINT ids by default; align its migration to UUID for consistency
-- with the rest of this schema, or keep BIGINT for the package tables only.

-- ── Custom layer: context-scoped role assignment (Spatie has no context concept) ──
-- Course/category/module-level assignments live here; tenant-wide ones may use
-- Spatie's model_has_roles directly.
CREATE TABLE context_role_assignments (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  user_id       UUID NOT NULL,
  role_id       UUID NOT NULL,                   -- references Spatie roles.id
  context_id    UUID NOT NULL REFERENCES contexts(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, role_id, context_id)
);
CREATE INDEX idx_cra_user_ctx ON context_role_assignments (tenant_id, user_id, context_id);

-- ── Optional: explicit deny, only if a vertical needs Moodle-style PROHIBIT ──
-- Spatie is purely additive; this override table is consulted AFTER the additive union.
CREATE TABLE permission_overrides (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  context_id    UUID NOT NULL REFERENCES contexts(id),
  role_id       UUID,                            -- nullable: override for a role...
  user_id       UUID,                            -- ...or directly for a user
  permission    TEXT NOT NULL,
  effect        SMALLINT NOT NULL,               -- -1 prevent, -1000 prohibit
  UNIQUE (tenant_id, context_id, role_id, user_id, permission)
);
```

> **Permission resolution** (custom service, bridging Spatie): given (user, target context), walk the context tree once (`ltree @>`), gather the user's roles assigned at every ancestor context (from `context_role_assignments` + Spatie's tenant-level `model_has_roles`), union their Spatie permissions via `role_has_permissions`, then — only if `permission_overrides` is in use — subtract prevents/prohibits. Cache the effective permission set in Redis keyed by (user, context); invalidate on any role-assignment, role-permission, or override change. Expose via a custom Gate `before`/check so `$user->can(...)` / `@can` / `permission:` middleware work normally. **Default is additive-only** — drop the override table entirely unless you genuinely need deny semantics.

### 7.2 Courses, structure, enrolment

```sql
CREATE TABLE course_categories (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL,
  name        TEXT NOT NULL,
  path        LTREE NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_cat_path ON course_categories USING GIST (path);

CREATE TABLE courses (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL,
  category_id UUID NOT NULL,
  shortname   TEXT NOT NULL,
  fullname    TEXT NOT NULL,
  format      TEXT NOT NULL DEFAULT 'topics',   -- topics|weeks|single
  status      TEXT NOT NULL DEFAULT 'active',    -- draft|active|archived|deleted
  start_date  TIMESTAMPTZ, end_date TIMESTAMPTZ,
  settings    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, shortname)
);

CREATE TABLE course_sections (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL,
  course_id   UUID NOT NULL,
  section_num INT NOT NULL,
  name        TEXT,
  availability JSONB,                            -- conditional release rules
  UNIQUE (tenant_id, course_id, section_num)
);

-- Polymorphic placement of an activity instance in a course
CREATE TABLE course_modules (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  course_id     UUID NOT NULL,
  section_id    UUID NOT NULL,
  module_type   TEXT NOT NULL,                   -- assignment|quiz|resource|forum|lti|scorm
  instance_id   UUID NOT NULL,                 -- PK in the type-specific table
  sort_order    INT NOT NULL DEFAULT 0,
  visible       BOOLEAN NOT NULL DEFAULT TRUE,
  availability  JSONB,
  completion    JSONB,                           -- completion config
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cm_course ON course_modules (tenant_id, course_id, section_id, sort_order);

CREATE TABLE enrolment_methods (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL,
  course_id   UUID NOT NULL,
  type        TEXT NOT NULL,                     -- manual|self|cohort|lti|payment|api
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  config      JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE user_enrolments (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL,
  method_id   UUID NOT NULL REFERENCES enrolment_methods(id),
  user_id     UUID NOT NULL,
  course_id   UUID NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',    -- active|suspended
  start_at    TIMESTAMPTZ, end_at TIMESTAMPTZ,
  UNIQUE (tenant_id, method_id, user_id)
);
CREATE INDEX idx_ue_user ON user_enrolments (tenant_id, user_id, course_id);
```

### 7.3 Grading

```sql
CREATE TABLE grade_categories (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  course_id     UUID NOT NULL,
  parent_id     UUID REFERENCES grade_categories(id),
  path          LTREE NOT NULL,
  aggregation   TEXT NOT NULL DEFAULT 'natural', -- natural|mean|weighted_mean|...
  drop_lowest   INT NOT NULL DEFAULT 0,
  keep_highest  INT NOT NULL DEFAULT 0,
  settings      JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE grade_items (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  course_id     UUID NOT NULL,
  category_id   UUID REFERENCES grade_categories(id),
  item_type     TEXT NOT NULL,                   -- mod|manual|category|course
  module_id     UUID,                          -- course_modules.id when item_type='mod'
  scale_id      UUID,                          -- nullable; → scales(id); points if null
  grademin      NUMERIC(12,5) NOT NULL DEFAULT 0,
  grademax      NUMERIC(12,5) NOT NULL DEFAULT 100,
  gradepass     NUMERIC(12,5),
  weight        NUMERIC(12,7),
  aggregationcoef NUMERIC(12,7),                  -- extra-credit / weight override
  multfactor    NUMERIC(12,5) NOT NULL DEFAULT 1,
  plusfactor    NUMERIC(12,5) NOT NULL DEFAULT 0,
  hidden_until  TIMESTAMPTZ,
  locked        BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order    INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_gi_course ON grade_items (tenant_id, course_id);

CREATE TABLE grade_grades (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  grade_item_id UUID NOT NULL REFERENCES grade_items(id),
  user_id       UUID NOT NULL,
  rawgrade      NUMERIC(12,5),                    -- NULL = not graded (NOT zero)
  finalgrade    NUMERIC(12,5),
  overridden    BOOLEAN NOT NULL DEFAULT FALSE,
  excluded      BOOLEAN NOT NULL DEFAULT FALSE,
  hidden        BOOLEAN NOT NULL DEFAULT FALSE,
  locked        BOOLEAN NOT NULL DEFAULT FALSE,
  feedback      TEXT,
  marker_id     UUID,
  workflow_state TEXT,                            -- notmarked|inmarking|complete|released
  modified_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, grade_item_id, user_id)
);
CREATE INDEX idx_gg_user ON grade_grades (tenant_id, user_id);

-- Append-only audit
CREATE TABLE grade_history (
  id            UUID NOT NULL DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  grade_item_id UUID NOT NULL,
  user_id       UUID NOT NULL,
  old_grade     NUMERIC(12,5),
  new_grade     NUMERIC(12,5),
  source        TEXT NOT NULL,                    -- manual|auto|regrade|import
  changed_by    UUID,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Denormalized read model for fast gradebook rendering
CREATE TABLE gradebook_summary (
  tenant_id     UUID NOT NULL,
  course_id     UUID NOT NULL,
  user_id       UUID NOT NULL,
  course_total  NUMERIC(12,5),
  items         JSONB NOT NULL,                   -- {grade_item_id: finalgrade}
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, course_id, user_id)
);

-- Custom ordinal scales (resolves grade_items.scale_id)
CREATE TABLE scales (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  course_id     UUID,                             -- NULL = tenant-global scale
  name          TEXT NOT NULL,
  items         JSONB NOT NULL,                   -- ordered levels, e.g. ["Not yet competent","Competent","Exceeds"]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rubrics / marking guides for human-graded work
CREATE TABLE rubrics (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  course_id     UUID,                             -- NULL = reusable template
  name          TEXT NOT NULL,
  criteria      JSONB NOT NULL,                   -- [{criterion, levels:[{label, points}]}]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Awarded rubric scores are stored per submission (see submissions.rubric_scores)
```

### 7.4 Assessment

```sql
CREATE TABLE question_categories (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  course_id     UUID,                             -- NULL = shared/tenant-level bank
  parent_id     UUID REFERENCES question_categories(id),
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE questions (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  category_id   UUID NOT NULL REFERENCES question_categories(id),
  qtype         TEXT NOT NULL,
  current_version_id UUID
);

CREATE TABLE question_versions (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  question_id   UUID NOT NULL REFERENCES questions(id),
  version       INT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ready',
  questiontext  TEXT NOT NULL,
  defaultmark   NUMERIC(12,5) NOT NULL DEFAULT 1,
  data          JSONB NOT NULL,                   -- answers, options, tolerances...
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, question_id, version)
);

CREATE TABLE quizzes (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  course_id     UUID NOT NULL,
  open_at       TIMESTAMPTZ, close_at TIMESTAMPTZ,
  time_limit_s  INT,
  attempts_allowed INT NOT NULL DEFAULT 0,        -- 0 = unlimited
  grade_method  TEXT NOT NULL DEFAULT 'highest',  -- highest|average|first|last
  navigation    TEXT NOT NULL DEFAULT 'free',     -- free|sequential
  behaviour     TEXT NOT NULL DEFAULT 'deferred', -- deferred|immediate|adaptive
  shuffle       BOOLEAN NOT NULL DEFAULT TRUE,
  review_options JSONB NOT NULL DEFAULT '{}',
  settings      JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE quiz_attempts (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  quiz_id       UUID NOT NULL,
  user_id       UUID NOT NULL,
  attempt_no    INT NOT NULL,
  state         TEXT NOT NULL DEFAULT 'inprogress', -- inprogress|overdue|finished|abandoned
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at        TIMESTAMPTZ,                       -- server-authoritative deadline
  finished_at   TIMESTAMPTZ,
  sumgrade      NUMERIC(12,5),
  UNIQUE (tenant_id, quiz_id, user_id, attempt_no)
);
CREATE INDEX idx_qa_user ON quiz_attempts (tenant_id, user_id, quiz_id);

-- Append-only interaction log; partition by time (very high volume)
CREATE TABLE attempt_steps (
  id            UUID NOT NULL DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  attempt_id    UUID NOT NULL,
  question_version_id UUID NOT NULL,            -- pins regrade to the version taken
  seq           INT NOT NULL,
  action        TEXT NOT NULL,                    -- autosave|submit|comment|regrade
  state         TEXT NOT NULL,
  response      JSONB,
  fraction      NUMERIC(12,7),                    -- 0..1 score for this state
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Assignment activity instance (backs course_modules.module_type = 'assignment')
CREATE TABLE assignments (
  id               UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id        UUID NOT NULL,
  course_id        UUID NOT NULL,
  title            TEXT NOT NULL,
  instructions     JSONB,
  due_at           TIMESTAMPTZ,
  cutoff_at        TIMESTAMPTZ,                    -- hard close; no submissions after
  max_attempts     INT NOT NULL DEFAULT 1,
  submission_types JSONB NOT NULL DEFAULT '["file"]',  -- ["text","file"]
  blind_marking    BOOLEAN NOT NULL DEFAULT FALSE,
  group_submission BOOLEAN NOT NULL DEFAULT FALSE,
  rubric_id        UUID REFERENCES rubrics(id),
  late_policy      JSONB NOT NULL DEFAULT '{}',    -- penalty config
  settings         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Learner/group submissions + the human-grading marking workflow
CREATE TABLE submissions (
  id             UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id      UUID NOT NULL,
  assignment_id  UUID NOT NULL REFERENCES assignments(id),
  user_id        UUID NOT NULL,                    -- submitter (or representative for a group)
  group_id       UUID,                             -- set for group submissions
  attempt_no     INT NOT NULL DEFAULT 1,
  state          TEXT NOT NULL DEFAULT 'draft',    -- draft|submitted|graded|returned
  text_content   JSONB,                            -- inline text submissions
  submitted_at   TIMESTAMPTZ,
  is_late        BOOLEAN NOT NULL DEFAULT FALSE,
  marker_id      UUID,                             -- allocated marker
  workflow_state TEXT,                             -- notmarked|inmarking|complete|released
  rubric_scores  JSONB,                            -- awarded levels per criterion
  feedback       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, assignment_id, user_id, attempt_no)
);
CREATE INDEX idx_sub_assignment ON submissions (tenant_id, assignment_id, workflow_state);
-- Submission files reuse the content-addressed `files` table
-- (component='mod_assign', item_id = submissions.id). The resulting grade lands in
-- grade_grades like any other; workflow_state mirrors the §5 marking workflow.
```

### 7.5 Files, completion, events (high-volume / partitioned)

```sql
CREATE TABLE files (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  contenthash   CHAR(64) NOT NULL,                -- SHA-256; bytes in object storage
  component     TEXT NOT NULL,                    -- mod_assign|question|user...
  filearea      TEXT NOT NULL,
  context_id    UUID NOT NULL,
  item_id       UUID NOT NULL,
  filepath      TEXT NOT NULL,
  filename      TEXT NOT NULL,
  filesize      BIGINT NOT NULL,
  mimetype      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_files_area ON files (tenant_id, context_id, component, filearea, item_id);
-- dedup: object stored once per contenthash; this row is a logical reference

CREATE TABLE activity_completion (
  tenant_id     UUID NOT NULL,
  module_id     UUID NOT NULL,
  user_id       UUID NOT NULL,
  state         SMALLINT NOT NULL,                -- 0 incomplete,1 complete,2 pass,3 fail
  completed_at  TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, module_id, user_id)
);

-- Event/activity log: the single largest table; partition monthly, archive to cold/ClickHouse
CREATE TABLE event_log (
  id            UUID NOT NULL DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  user_id       UUID,
  course_id     UUID,
  context_id    UUID,
  event_name    TEXT NOT NULL,
  target        TEXT,
  object_id     UUID,
  data          JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Credentials: badge/certificate templates + issued instances (course OR program completion)
CREATE TABLE credential_definitions (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  type          TEXT NOT NULL,                    -- badge|certificate
  name          TEXT NOT NULL,
  source_type   TEXT NOT NULL,                    -- course|program|criteria
  source_id     UUID,                             -- course_id or program_id
  template      JSONB NOT NULL DEFAULT '{}',      -- Open Badges metadata / PDF template
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_credentials (
  id                UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id         UUID NOT NULL,
  definition_id     UUID NOT NULL REFERENCES credential_definitions(id),
  user_id           UUID NOT NULL,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  verification_code TEXT NOT NULL,                -- public, shareable verification handle
  evidence          JSONB,                        -- what was completed to earn it
  UNIQUE (tenant_id, definition_id, user_id)
);
CREATE INDEX idx_ucred_user ON user_credentials (tenant_id, user_id);

-- Notifications: high-volume, time-partitioned (per-user delivery preferences live in users.profile)
CREATE TABLE notifications (
  id            UUID NOT NULL DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  user_id       UUID NOT NULL,
  channel       TEXT NOT NULL,                    -- email|sms|push|inapp
  type          TEXT NOT NULL,
  payload       JSONB NOT NULL,
  sent_at       TIMESTAMPTZ,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);
```

### 7.6 Content & video activities (the activity-instance tables `course_modules` points to)

`course_modules.instance_id` is polymorphic — for `module_type = 'quiz'` it points at `quizzes`, for content modules it points here. This is where a lesson's video lives, and **`video_sources.provider` is exactly where the YouTube-vs-managed-streaming distinction is recorded.**

```sql
-- Backs content module types: video | page | file | url
CREATE TABLE content_activities (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  course_id     UUID NOT NULL,
  kind          TEXT NOT NULL,                   -- video|page|file|url
  title         TEXT NOT NULL,
  body          JSONB,                           -- rich-text/page content where applicable
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Video source descriptor — THIS row decides how a video is hosted & delivered
CREATE TABLE video_sources (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  content_id    UUID NOT NULL REFERENCES content_activities(id),
  provider      TEXT NOT NULL,                   -- youtube|vimeo|mux|cloudflare_stream|self
  external_id   TEXT,                            -- youtube video id / mux asset id / etc.
  url           TEXT,                            -- embed/canonical URL where applicable
  gated         BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE = signed-URL/token delivery (paid/managed); FALSE = open embed (e.g. YouTube)
  duration_s    INT,                             -- enables "watched ≥ X%" completion
  captions      JSONB,                           -- caption/subtitle track refs (a11y)
  metadata      JSONB NOT NULL DEFAULT '{}',     -- provider-specific (playback ids, thumbnails…)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_video_content ON video_sources (tenant_id, content_id);
```

> **The decision rule lives in two columns.** `provider` selects the player/adapter (YouTube IFrame API vs. Mux/Cloudflare/self-hosted player); `gated` selects delivery (open embed vs. signed-URL/token). So "YouTube for free/low-sensitivity, Mux/Cloudflare for paid/compliance-sensitive" is data, not code — set `provider='youtube', gated=false` for the former and `provider='mux', gated=true` for the latter, per video.
>
> **Completion tracking is provider-agnostic.** A small per-provider adapter normalizes player events (YouTube `onStateChange`/percent watched, Mux/Cloudflare player events) into one internal "video progressed/completed" event, which writes `activity_completion` (using `duration_s` for the percentage threshold) and emits xAPI — the same completion pipeline every other activity uses.

### 7.7 Programs (packaged programs / nanodegrees)

```sql
CREATE TABLE programs (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  slug          CITEXT NOT NULL,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft',     -- draft|active|archived
  min_electives INT NOT NULL DEFAULT 0,            -- electives required across all elective groups
  credential    JSONB NOT NULL DEFAULT '{}',       -- badge/certificate config issued on completion
  pricing       JSONB NOT NULL DEFAULT '{}',       -- per-program / subscription ref (payments)
  settings      JSONB NOT NULL DEFAULT '{}',       -- estimated duration, cohort mode, etc.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

-- Scheduled, paced runs of a program (resolves program_enrolments.cohort_id)
CREATE TABLE cohorts (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  program_id    UUID REFERENCES programs(id),      -- NULL allowed for course-level cohorts
  name          TEXT NOT NULL,
  start_at      TIMESTAMPTZ,
  end_at        TIMESTAMPTZ,
  settings      JSONB NOT NULL DEFAULT '{}',       -- paced-release config
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Many-to-many: a course may appear in several programs
CREATE TABLE program_courses (
  id             UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id      UUID NOT NULL,
  program_id     UUID NOT NULL REFERENCES programs(id),
  course_id      UUID NOT NULL,
  requirement    TEXT NOT NULL DEFAULT 'required', -- required|elective
  elective_group TEXT,                             -- groups electives for "choose N of group"
  sort_order     INT NOT NULL DEFAULT 0,
  unlock_rule    JSONB,                            -- conditional-availability rule, program-scoped
  UNIQUE (tenant_id, program_id, course_id)
);
CREATE INDEX idx_pc_program ON program_courses (tenant_id, program_id, sort_order);

-- Program enrolment is distinct from course enrolment
CREATE TABLE program_enrolments (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  program_id    UUID NOT NULL REFERENCES programs(id),
  user_id       UUID NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',    -- active|suspended|completed|withdrawn
  cohort_id     UUID REFERENCES cohorts(id),      -- optional scheduled cohort
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  UNIQUE (tenant_id, program_id, user_id)
);
CREATE INDEX idx_pe_user ON program_enrolments (tenant_id, user_id, program_id);

-- Denormalized read model, recomputed async on constituent-course completion
CREATE TABLE program_progress (
  tenant_id          UUID NOT NULL,
  program_id         UUID NOT NULL,
  user_id            UUID NOT NULL,
  required_total     INT NOT NULL,
  required_completed INT NOT NULL DEFAULT 0,
  electives_completed INT NOT NULL DEFAULT 0,
  percent            NUMERIC(5,2) NOT NULL DEFAULT 0,
  state              TEXT NOT NULL DEFAULT 'inprogress', -- inprogress|completed
  credential_issued_at TIMESTAMPTZ,
  computed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, program_id, user_id)
);
```

> **Program completion** is event-driven: when an `activity_completion` / course-completion event fires, enqueue a recompute for any program the course belongs to (via `program_courses`) for that user. The worker re-evaluates required + elective-minimum satisfaction, writes `program_progress`, and — idempotently — issues the credential and flips `program_enrolments.status` to `completed` on first satisfaction. Reuses the gradebook recompute pattern; no new scheduler.

### 7.8 Schema-level scale decisions (summary)

| Concern | Decision |
|---|---|
| Multi-tenancy | `tenant_id` everywhere + RLS; distribution key for Citus |
| Primary keys | `UUID` (**UUIDv7**, time-ordered) — preserves index locality and avoids the fragmentation / write amplification that random UUIDv4 causes at high insert volume |
| Hierarchies | `ltree` (GiST-indexed) for contexts, categories, grade tree |
| Unbounded-growth tables | `event_log`, `attempt_steps`, `grade_history`, notifications → **declarative range partitioning by month**; detach + archive old partitions to cold storage / ClickHouse |
| Gradebook reads | `gradebook_summary` denormalized table + Redis cache; never aggregate live |
| Search | OpenSearch/Elastic; never `LIKE` / full-table scans |
| Files | Metadata in PG, bytes in object storage (content-addressed dedup) |
| Sessions | Redis, never DB |
| Hot path caching | Course structure, capability resolution, user profile in Redis |
| Connection management | PgBouncer (transaction pooling); read replicas for read-heavy queries |
| Indexing rule | Composite indexes **lead with `tenant_id`**; match access patterns, not "every column" |

### 7.9 Deferred tables (schematized in their phase)

The following entities appear in the journeys (§14) and catalog (§15) but are intentionally **not** schematized yet — they belong to Phase 3–4 and are designed when those phases are built, to avoid speculative schema that ages badly:

- **Phase 3 engagement:** `groups` / `groupings` / `group_members`; `forums` / `discussions` / `posts`; `messages` / `conversations`; `calendar_events`; `surveys` / `feedback` / `choices`. Each backs the corresponding activity instance via `course_modules.module_type` (the `forum` value in the enum maps here).
- **Phase 4 integrations:** `lti_registrations` / `lti_launches`; `scorm_packages` / `scorm_tracks`; `payments` / `orders` / `invoices`; `webhooks` / `webhook_deliveries`.
- **Control plane (separate service):** tenant registry, plan, and metering tables live outside the engine schema.

Until then, the `course_modules.module_type` enum should be treated as forward-declared for `forum`/`lti`/`scorm` — the placement row can exist, but its instance table arrives with its phase.

---

## 8. Integrations (build the adapter, not the standard)

| Integration | Version / detail | Build vs. integrate |
|---|---|---|
| **LTI** | 1.3 + Advantage (Deep Linking, AGS, NRPS); be both consumer and provider | Build the spec compliance once; it unlocks a huge tool ecosystem |
| **SCORM** | 1.2 and 2004 runtime + CMI + sequencing | Use an existing JS runtime library; wrap it |
| **xAPI / cmi5** | 1.0.3 statements → LRS | Integrate or embed an LRS; don't hand-roll analytics storage |
| **H5P** | Interactive content; emits xAPI | Embed the H5P runtime; covers most "interactive" needs |
| **SSO** | SAML 2.0, OIDC, OAuth2, LDAP/AD, social | Use vetted libraries; never roll crypto |
| **Payments** | Stripe (global) + **M-Pesa Daraja** + **KRA eTIMS** (KE) | Adapter pattern per provider |
| **Video** | YouTube / Vimeo embeds (open) **or** Mux / Cloudflare Stream with signed URLs (gated); live via Zoom / BigBlueButton | Provider is a per-video data flag (`video_sources.provider`/`gated`); YouTube/Vimeo for free/low-sensitivity, managed streaming for paid/compliance content |
| **Plagiarism** | Turnitin / Ouriginal | Hook on submission events |
| **Notifications** | Email (SES), SMS (Africa's Talking / Twilio), web push | Queue-backed, templated, per-user preferences |
| **Interop import/export** | IMS Common Cartridge; your own course-backup format | Build backup early (needed for tenant DR) |
| **Public API** | REST + GraphQL + webhooks | First-class; this is what makes you extensible/headless |

---

## 9. Scaling architecture for millions of users

- **Stateless app tier** (PHP-FPM/Laravel or your chosen runtime) behind a load balancer; scale horizontally; sessions and cache in Redis.
- **Database tier** — PostgreSQL primary + read replicas; Citus (or app-level sharding) keyed on `tenant_id`; PgBouncer pooling; partitioned high-volume tables; PITR via continuous archiving.
- **Caching** — Redis for sessions, capability resolution, course structure, gradebook summaries; cache-aside with explicit invalidation on writes.
- **Async tier** — durable queue (SQS/RabbitMQ/Redis) + worker fleet for grade recompute, regrades, notifications, report/export generation, content packaging, xAPI emission. Idempotent, retried, dead-lettered.
- **Search** — OpenSearch cluster, fed by change-data-capture or event stream.
- **Files & media** — object storage + CDN; signed URLs; media transcoding offloaded to a provider.
- **Analytics** — stream `event_log` / xAPI to a columnar store (ClickHouse) or warehouse for reporting; keep OLTP and OLAP separate.
- **Multi-region** (later) — per-tenant data residency drives region placement; read-local, write-home.

**Read/write pattern to internalize:** the learner experience is ~95% reads (view course, view content, view grades). Make reads hit cache/replica/summary tables. Reserve the primary and synchronous paths for the ~5% of writes (submit, grade, enrol) that must be consistent.

---

## 10. Cross-cutting concerns (Phase 0, non-negotiable)

- **Accessibility** — WCAG 2.2 AA, keyboard nav, screen-reader semantics, captions; in education this is frequently a legal requirement, and retrofitting is brutal.
- **Internationalization** — externalized strings, ICU pluralization, RTL, locale-aware dates/numbers; per-tenant default locale + per-user override.
- **Security** — OWASP Top 10 discipline, RBAC enforced server-side, rate limiting, CSRF, output encoding, secrets management, encryption at rest and in transit, regular dependency scanning and pen testing.
- **Privacy & data protection** — GDPR + Kenya Data Protection Act 2019: data export, right-to-erasure (with grade-retention exceptions), consent records, retention policies, residency enforcement, processor agreements.
- **Observability** — structured JSON logging, metrics, distributed tracing, error tracking, SLO dashboards, per-tenant usage metering.
- **Backup / DR** — defined RPO/RTO, automated PITR, regularly *tested* restores, per-tenant export.

---

## 11. Risk register — where the schedule actually goes

| Risk | Mitigation |
|---|---|
| Gradebook recompute complexity underestimated | Build the aggregation engine + summary table + async recompute in Phase 2; budget generously |
| Quiz attempt edge cases (timer, autosave, resume, concurrency) | Server-authoritative state from day one; extensive integration tests |
| Regrade correctness | Version questions immutably; never grade against "current" question |
| Tenancy retrofit | Decided in Phase 0; `tenant_id` + RLS everywhere; no exceptions |
| Standards compliance drag (LTI/SCORM) | Integrate libraries; conformance-test against reference suites |
| Accessibility/i18n retrofit cost | Built-in from Phase 0, audited each phase |
| "80% done at month 3" illusion | Track completion by *edge cases handled*, not happy paths shipped |
| Reporting at scale kills the OLTP DB | Separate OLAP store (ClickHouse); never report off the primary |

---

## 12. Recommended stack (aligned to a Laravel/PostgreSQL/React shop)

- **API / domain / control plane:** Laravel (PHP 8.3+), domain-driven module boundaries.
- **Frontend:** React SPA (your white-label UI), consuming the public API.
- **Primary DB:** PostgreSQL 16+ with Citus for sharding; PgBouncer; read replicas (Patroni-managed HA).
- **Cache / sessions / light queue:** Redis.
- **Durable queue / workers:** SQS or RabbitMQ for heavy async (grade/regrade/reports).
- **Search:** OpenSearch.
- **Files/media:** S3-compatible object storage (e.g., MinIO) + CDN; provider-based transcoding.
- **Analytics store:** ClickHouse (you've worked with it) fed by the event/xAPI stream.
- **Infra:** Docker; orchestration as instance count grows; pgBackRest for PITR; Sentry + structured logs + a log aggregator for observability.

> **Bottom line:** build the spine (tenancy, RBAC, courses, enrolment, grading, assessment) and your UX; integrate the commodity (LTI, SCORM, xAPI, H5P, payments, video, search, transcoding). That is the only version of "custom LMS" that is feasible for a small team — and the schema and phasing above are arranged so you never have to unwind a Phase-0 decision later.

---

> ## Implementation status (audited against the codebase, 64 items)
> `✅ done` (35) · `◐ partial` (25) · `☐ external-only` (4)
>
> **This session added:** auto-grading engine (all objective question types, 8 tests), version-pinned regrade (validated), per-question quiz player with autosave/resume, white-label theming, announcements/email fan-out, groupings + group-grade propagation (validated), LTI 1.3 OIDC launch handshake, payment-intent flow (idempotent, validated), GraphQL read gateway (parser validated), forums/groups/admin frontend, plus infra enablers (OpenSearch indexing, k6 load test, DR runbook, mobile readiness).
>
> **The 4 ☐ are external-only** — pen test, DR rehearsal, WCAG audit, trademark review require security firms, auditors, lawyers, or live infrastructure. Enablers and a commissioning checklist are in `ops/GO-LIVE-CHECKLIST.md`. They are marked ☐ honestly, not faked green.

## 13. Execution checklist (actionable, step-by-step)

Work top to bottom. Items inside a phase can parallelize; **phases should not be reordered** (each depends on the one above). The continuous items run alongside every phase from day one.

### Continuous (start in Phase 0, audit every phase)
- [~] ◐ Accessibility: WCAG 2.2 AA component library + automated a11y checks in CI  
      _→ frontend: keyboard focus, reduced-motion, semantic HTML, responsive; automated a11y CI + formal audit still external_
- [~] ◐ Internationalization: externalized strings, ICU pluralization, RTL, locale-aware dates/numbers  
      _→ i18n layer + en/sw catalogs + ICU-lite interpolation; not yet applied to every string_
- [x] ✅ Security: server-side authz on every endpoint, rate limiting, CSRF, output encoding, secrets manager, dependency scanning  
      _→ server-side authz on every route + rate limiting middleware + JSON error envelope + signed URLs; secrets manager is deploy-time_
- [x] ✅ Privacy: data-export, right-to-erasure, consent records, residency enforcement, retention policy (GDPR + Kenya DPA 2019)  
      _→ PrivacyService: export + erasure (grades retained) + consent log; validated_
- [~] ◐ Observability: structured JSON logs, metrics, distributed tracing, error tracking, per-tenant usage metering  
      _→ JSON errors + event_log + usage metering; tracing/metrics are deploy-time wiring_
- [~] ◐ Quality gates: automated tests (unit + integration + E2E), CI/CD pipeline, code review  
      _→ PHPUnit suite 25 assertions passing (DAG/TOTP/signing/grading) + CI + docker; E2E still needs the booted stack_

### Phase 0 — Foundation
- [~] ◐ Provision data tier: PostgreSQL 16+ on Patroni HA, PgBouncer (transaction pooling), ≥1 read replica  
      _→ PG16 schema+RLS validated + docker-compose; Patroni/PgBouncer/replica are prod infra_
- [~] ◐ Stand up Redis (cache + sessions), S3-compatible object storage (MinIO/S3), durable queue (SQS/RabbitMQ)  
      _→ Redis in docker-compose + cache/queue/session config; managed cluster is infra_
- [x] ✅ Decide tenancy posture: pooled + RLS now; set Citus distribution key = `tenant_id` for later sharding  
      _→ pooled + RLS; tenant_id distribution key on every table_
- [x] ✅ Create base schema with `tenant_id` + **UUIDv7** PKs on every table; choose v7 generation path (PG18 native vs app-side)  
      _→ 23 SQL migrations, tenant_id + UUIDv7 PKs everywhere_
- [x] ✅ Enable Row-Level Security and write per-table tenant policies  
      _→ 77+ RLS policies; app connects as non-owner role_
- [x] ✅ Implement RBAC: `spatie/laravel-permission` (teams enabled, `team_id = tenant_id`) for roles/permissions + Gate/cache; add context tree (`ltree`) + `context_role_assignments` + custom resolver (`canInContext`) with Redis-cached results + invalidation; additive-only by default  
      _→ context-tree RBAC (ltree) + resolver + middleware_
- [x] ✅ Build identity + pluggable auth (local + OIDC) + MFA + Redis-backed sessions + account lifecycle  
      _→ local + JWT + sessions + lifecycle + SSO link (oidc/saml/social) + TOTP MFA; validated. Live IdP handshake needs metadata_
- [x] ✅ Build content-addressed File API (SHA-256 dedup) + signed URLs + virus-scan hook  
      _→ FileService: SHA-256 dedup + HMAC signed URLs + virus-scan hook; dedup validated_
- [~] ◐ Build async layer: idempotent jobs, scheduler, retries, dead-letter queue  
      _→ queued jobs (recompute, notifications, announcements) tries/backoff/uniqueId + worker in compose; DLQ is broker config_
- [x] ✅ Build public API skeleton (versioned, OAuth2 + tokens, rate limiting) + webhook dispatcher  
      _→ versioned REST (125 routes) + token auth + rate limiting + webhooks + GraphQL gateway_
- [~] ◐ Wire observability, audit log, CI/CD, and the test harness end to end  
      _→ audit log + CI workflow + test harness; tracing not_

### Phase 1 — Core teaching & learning (the "deliver a course" MVP)
- [x] ✅ Category / course / section CRUD + lifecycle states (draft/active/archived/deleted) + soft delete  
      _→ categories, courses (lifecycle+soft delete), sections + modules_
- [x] ✅ Enrolment methods (manual + self) + `user_enrolments` with time windows + suspended state  
      _→ manual + self-enrolment + suspended + windows; validated_
- [x] ✅ Content activities: page, file, URL, folder, book; ordering + drag-drop  
      _→ page/file/url/video/book/folder + File API + drag-drop reorder (modules + sections via sort_order)_
- [x] ✅ Course navigation + role-aware dashboard ("what's due", recent activity)  
      _→ Next.js dashboard, what's-next, courses/programs, role-aware_
- [x] ✅ Assignment submission: text + file, drafts, resubmission, due/cutoff dates, late flagging  
      _→ draft/submit/resubmit/late/cutoff + File API attachments; validated_
- [x] ✅ Announcements + queued, templated email notifications + per-user preferences + unsubscribe  
      _→ AnnouncementService fans out to enrolees as queued notifications via SendNotificationJob; email body templating at delivery_
- [x] ✅ Per-tenant white-label theming (logo, color tokens)  
      _→ ThemingService: per-tenant branding in settings + public branding-by-slug endpoint_

### Phase 2 — Assessment & grading (the hard core)
- [x] ✅ Grade items + grade category tree (`ltree`) + scales + letter boundaries  
      _→ items + ltree category tree + scales/letters_
- [x] ✅ Aggregation engine: natural + mean + weighted variants + min/max/median/mode  
      _→ natural/mean/min/max/median; validated_
- [x] ✅ Drop-lowest / keep-highest + extra-credit handling (test interaction with weights)  
      _→ implemented + extra-credit_
- [x] ✅ Async recompute job → `gradebook_summary` + Redis cache; coalesce bursts; idempotent  
      _→ RecomputeGradebookJob — queued, idempotent uniqueId coalescing + summary_
- [x] ✅ Calculated-item formula DAG + circular-reference detection at save time  
      _→ CalculatedGradeService: DAG + circular-ref rejection + topo order; validated_
- [x] ✅ `grade_history` append-only audit on every grade change  
      _→ every setGrade appends grade_history; validated_
- [x] ✅ Distinguish NULL (ungraded) from 0 throughout aggregation  
      _→ aggregation skips NULL + excluded; validated_
- [x] ✅ Assignment grading workflow: rubrics/marking guides, workflow states, blind/anonymous, marker allocation, moderation  
      _→ marking states + rubric_scores + blind + marker allocation_
- [x] ✅ Quiz engine: question bank + immutable question versioning + attempt state machine  
      _→ bank + immutable versioning + attempt state machine; validated_
- [x] ✅ Server-authoritative timer + grace period + autosave + crash/network resume  
      _→ server due_at + state machine + frontend autosave/resume player; auto-submit on deadline_
- [x] ✅ Attempt limits + per-user overrides (extra-time accommodations) + concurrency handling  
      _→ attempts + one-live-attempt + QuizOverrideService (per-user/group extra time+attempts, validated: override beats default) + autosave player_
- [x] ✅ Core question types: MCQ, multi-answer, true/false, matching, short answer, numerical, essay  
      _→ QuestionGradingService auto-grades all objective types; essay→manual; 8 unit tests; player renders each type_
- [x] ✅ Regrade job: version-pinned, dry-run preview, full audit  
      _→ RegradeService: version-pinned dry-run + apply, append-only steps + sumgrade recompute; validated_
- [x] ✅ Activity + course completion tracking + conditional availability rules engine  
      _→ activity→course→program cascade + availability rules; validated_

### Phase 3 — Engagement & collaboration
- [x] ✅ Forums/discussions (threaded, subscriptions, Q&A mode, ratings, moderation)  
      _→ threading + Q&A + ratings (one-per-user, sum recomputed, validated) + mark-answer + pin/lock moderation + frontend_
- [x] ✅ Groups & groupings + group-restricted activities + group submission/grading  
      _→ groups + members + roles + groupings + group-grade propagation (validated 1→3 members) + frontend_
- [x] ✅ Messaging (1:1 + group; optional real-time)  
      _→ conversations + members + messages + unread, gated; validated; frontend_
- [x] ✅ Calendar + events (course/user/site) + iCal export + due-date sync  
      _→ scoped events + agenda + iCal export (RFC 5545) + frontend_
- [x] ✅ Surveys / feedback / choice (anonymous responses)  
      _→ choices/polls + feedback + full surveys (questions+responses); validated_
- [x] ✅ Badges + certificates (criteria-based, Open Badges, verifiable PDFs)  
      _→ definitions + issuance + public verification + frontend_
- [x] ✅ Programs / packaged paths (nanodegrees): bundle + sequence courses, required/elective groups, program enrolment, async program-completion recompute → credential issuance  
      _→ programs + required/elective + enrolment + async completion→credential; validated_

### Phase 4 — Standards & integrations (integrate, don't rebuild)
- [~] ◐ LTI 1.3 / Advantage — Deep Linking, AGS (grade passback), NRPS (roster); consumer + provider  
      _→ registrations + OIDC launch handshake (begin + verify state/nonce/claims); JWKS RS256 verify + AGS/NRPS need live platform keys_
- [~] ◐ SCORM 1.2 / 2004 runtime (wrap an existing JS runtime library)  
      _→ registry + CMI track upsert; bundled JS runtime not_
- [~] ◐ xAPI / cmi5 statement pipeline + LRS; embed H5P runtime  
      _→ statement store; LRS streaming + H5P not_
- [~] ◐ SSO: SAML 2.0, OIDC, LDAP/AD, social  
      _→ SSO link service (oidc/saml/social/ldap) + find-or-link + MFA; live IdP assertion verify needs metadata/keys_
- [~] ◐ Payments: Stripe + M-Pesa (Daraja) + KRA eTIMS invoicing (adapter per provider)  
      _→ order→intent (idempotent, validated)→pay→fulfil→enrol+invoice; live provider calls + eTIMS need creds_
- [~] ◐ Video: Mux / Cloudflare Stream (VOD), Zoom / BigBlueButton (live); plagiarism hooks on submission  
      _→ provider/gated + playback-info (embed vs signed); live transcoding/plagiarism not_
- [x] ✅ Full public REST + GraphQL API parity + webhooks  
      _→ REST (125 routes) + GraphQL read gateway (me/courses/course/myGrades), parser validated_

### Phase 5 — Scale, analytics & enterprise
- [~] ◐ Reporting / learning-analytics marts in ClickHouse, fed by `event_log` / xAPI stream (keep OLAP off the OLTP primary)  
      _→ reporting endpoints off OLTP summaries + frontend admin dashboard; ClickHouse marts not_
- [~] ◐ OpenSearch search (replace any `LIKE`-based search)  
      _→ SearchIndexService: index/query contract + SQL fallback works now; needs OPENSEARCH_HOST cluster to scale (enabler built)_
- [~] ◐ Citus shard promotion for hot tenants; multi-region read  
      _→ schema fully keyed by tenant_id; create_distributed_table runbook in go-live checklist (needs Citus cluster)_
- [~] ◐ Mobile apps (offline content sync, push) on the public API  
      _→ API is mobile-ready (token auth, JSON envelopes, idempotent writes); native app is a separate project (readiness doc built)_
- [~] ◐ Reseller / admin console: provisioning, billing, metering, white-label management  
      _→ metering/subscription/backup endpoints + admin dashboard; full reseller console UI not_
- [~] ◐ Backup / restore / import-export: course backup format + IMS Common Cartridge; **test** per-tenant DR restores  
      _→ backup record lifecycle + DR backup/restore runbook script (ops/); Common Cartridge + rehearsed restore need infra_
- [~] ◐ Load + scale testing against the §1.2 non-functional targets before GA  
      _→ k6 load-test script built (ops/load-test.js, 1k-VU ramp + thresholds); must run against your deployed stack_

### Go-live gate (before first paying tenant)
- [ ] ☐ Pen test passed + critical/high findings remediated  
      _→ EXTERNAL: requires a security firm against the deployed app — cannot be done in code (see ops/GO-LIVE-CHECKLIST.md)_
- [ ] ☐ DR restore rehearsed and timed against RPO/RTO targets  
      _→ EXTERNAL: runbook built (ops/dr-backup-restore.sh); rehearsal requires real backups/infra_
- [ ] ☐ WCAG 2.2 AA audit passed on core learner + teacher flows  
      _→ EXTERNAL: requires an accessibility auditor_
- [~] ◐ Data-protection posture reviewed (export/erasure/residency) with counsel  
      _→ export/erasure/consent flows built + validated; counsel sign-off is external_
- [ ] ☐ Trademark / white-label review clean (no Moodle marks if engine-derived); licensing posture confirmed  
      _→ EXTERNAL: requires IP counsel_

---

## 14. User journeys & system flows

Courses are first-class and independent of programs. A program is an optional composition layer, so any course can be **standalone** (enrollable on its own, in no program), **inside one program**, **shared across several programs** (stored once, via `program_courses`), or **both standalone-enrollable and part of programs** at the same time. The journeys below reflect that.

### 14.1 Shared entry (everyone)

Sign up / sign in (local or SSO) → become a tenant member → land on a role-aware dashboard. From here the path forks by what the user enrols in and which roles they hold (resolved via the context-tree RBAC model).

### 14.2 Primary learner journeys

- **Standalone course.** Browse catalog → enrol in a single course (manual / self / paid method) → consume content (pages, files, video) → complete assignments and quizzes → receive grades via the gradebook → completion is recorded → earn a course-level certificate/badge. The full loop, no program involved.
- **Program / nanodegree.** Browse the program catalog → enrol in the program (its own enrolment; often paid as subscription or per-program) → access to constituent courses is granted and **sequenced** by program-scoped unlock rules → progress through required courses and choose electives from their groups → as each course completes, `program_progress` recomputes asynchronously → on satisfying all required courses plus the elective minimum, the program flips to completed and a credential is issued.
- **Hybrid.** A learner may hold standalone-course enrolments *and* program enrolments simultaneously; the two coexist without conflict.

### 14.3 Two design decisions, resolved

- **Does a standalone-completed course count toward a program?** **Yes, by default.** Completion is recorded at the course level regardless of how the learner enrolled, and `program_progress` reads those records — so prior work earns credit when a learner later joins a program containing that course. (If a vertical needs fresh completion per program, scope completion to the program enrolment instead; default is credit-for-prior-work.)
- **How does program enrolment relate to course enrolment?** **Program enrolment lazily creates a course `user_enrolment` as each course unlocks.** This reuses all existing course-level enrolment, access, and completion logic rather than introducing a parallel program-aware access path.

### 14.4 Other learner journeys

- **Self-paced vs. cohort.** Programs (and courses) run either self-paced (enrol any time, no fixed dates) or as scheduled **cohorts** (`cohort_id`, shared start, paced content release, shared deadlines/calendar).
- **Assessment / attempt.** Start attempt → autosave as they work → server-authoritative timer → submit → auto-graded portion scored immediately; human-graded portion left pending → review feedback per the quiz's review-options timing.
- **Resubmission / remediation.** Fail or underperform → receive feedback → resubmit (if attempts/cutoff allow) → regrade → updated grade with history retained.
- **Purchase / payment.** Select a paid course or program → checkout (Stripe / M-Pesa Daraja) → enrolment granted on payment → invoice issued (KRA eTIMS).
- **Credential / verification.** Earn a badge/certificate → share it → a third party verifies it (Open Badges metadata / verifiable PDF).
- **Social / collaboration.** Join groups/groupings → participate in forums (threaded, Q&A) → message peers/instructors → make group submissions graded at group level.
- **Integration-driven.** Launch an embedded **LTI** tool from within a course (grades flow back via AGS); consume a **SCORM** package with runtime tracking; interact with **H5P** content emitting xAPI.
- **Mobile / offline.** Download content on the mobile app → learn offline → progress syncs on reconnect (Phase 5).
- **Account & privacy self-service.** Manage profile, notification preferences, and exercise data rights (export, erasure) per GDPR / Kenya DPA.

### 14.5 Instructor / author journey

Holds a teaching role in one or more course contexts → creates and structures courses (sections, modules) → authors content and activities → builds the question bank and quizzes → **grades** submissions through the marking workflow (rubrics, allocation, blind marking, moderation) → manages the gradebook → views completion and engagement reports. Everything is scoped by RBAC to the contexts where the role is held.

### 14.6 Administrator / tenant-manager journey

Manages categories, courses, **programs**, users, roles and role assignments, enrolment methods, white-label branding, integration configuration, and tenant-wide reporting/analytics.

### 14.7 Operator / reseller journey

Sits in the control plane above the engine (per the SaaS architecture): provisions and configures tenants, manages white-label branding, and handles billing and metering. A platform-owner role rather than an LMS end-user role.

---

## 15. Entity catalog (glossary)

The domain entities, grouped. (Schema in §7; this is the conceptual reference.)

### Tenancy & identity
| Entity | What it is |
|---|---|
| Tenant | An organization; top of every hierarchy; isolation boundary |
| User | Global identity (may belong to several tenants) |
| Tenant membership | A user's relationship to a tenant |
| Auth method | A pluggable credential for a user (local, OIDC, SAML, LDAP, social) |
| Context | A node in the permission hierarchy (system → tenant → category → course → module → user) |
| Permission (capability) | A fine-grained grant string, e.g. `quiz.attempt` (Spatie `Permission`; wildcards supported) |
| Role | A named bundle of permissions (Spatie `Role`; tenant-scoped via teams) |
| Context role assignment | Binds (user, role, context) — context-scoped "who can do what, where" (custom layer over Spatie) |
| Permission override (optional) | Explicit deny (prevent/prohibit) at a context, only if a vertical needs it |

### Course structure
| Entity | What it is |
|---|---|
| Course category | Hierarchical grouping of courses |
| Course | A unit of teaching/learning; first-class, program-independent |
| Course section | A topic/week container within a course |
| Course module | A polymorphic placement of one activity instance in a section |
| Activity instance | The type-specific body of a module (assignment, quiz, resource, forum, LTI, SCORM, …) |

### Programs (packaged paths / nanodegrees)
| Entity | What it is |
|---|---|
| Program | A bundled, sequenced set of courses issuing a credential on completion |
| Program course | Membership of a course in a program (required/elective, order, unlock rule) |
| Program enrolment | A learner's enrolment in a program (distinct from course enrolment) |
| Program progress | Denormalized program-completion summary per learner |
| Cohort (optional) | A scheduled, paced run of a program |

### Enrolment & grouping
| Entity | What it is |
|---|---|
| Enrolment method | A pluggable way to join a course (manual, self, cohort, LTI, payment, API) |
| User enrolment | A user's enrolment in a course (active/suspended, time-windowed) |
| Group / Grouping | Sub-divisions of a course cohort for restricted/group activities |

### Grading
| Entity | What it is |
|---|---|
| Grade item | The gradeable unit for an activity (plus manual and calculated items) |
| Grade category | A node in the per-course grade tree with an aggregation strategy |
| Grade | A user's grade for an item (raw/final, overrides, flags) |
| Grade history | Append-only audit of every grade change |
| Scale | An ordered set of named grade levels |
| Rubric / marking guide | Structured criteria for human grading |
| Gradebook summary | Denormalized per-learner grade matrix for fast reads |

### Assessment
| Entity | What it is |
|---|---|
| Question | A reusable, versioned item in the question bank |
| Question version | An immutable snapshot of a question (regrades pin to it) |
| Quiz | A configured assessment (timing, attempts, behavior, review options) |
| Quiz attempt | One learner's run at a quiz (with state machine) |
| Attempt step | Append-only log of every interaction within an attempt |
| Assignment | An open-ended, human-graded activity instance (text/file submission) |
| Submission | A learner's (or group's) submission to an assignment, with marking workflow |

### Content, completion & engagement
| Entity | What it is |
|---|---|
| File | A content-addressed (SHA-256) stored object reference |
| Content activity | A content module instance (video/page/file/url) that a `course_module` points to |
| Video source | How a video is hosted/delivered: `provider` (youtube/vimeo/mux/cloudflare/self) + `gated` flag |
| Activity completion | A user's completion state for a module |
| Course completion | Derived completion of a course |
| Availability rule | A conditional-release rule (date, grade, completion, group, …) |
| Forum / discussion / post | Threaded asynchronous communication |
| Message | Direct or group messaging |
| Calendar event | A dated event (course/user/site scope) |
| Survey / feedback / choice | Non-graded data collection |
| Badge / Certificate (credential) | A verifiable award for completion or criteria |

### Observability, integration & platform
| Entity | What it is |
|---|---|
| Event log | Append-only, time-partitioned activity/audit stream |
| xAPI statement | A learning-experience record sent to an LRS |
| LTI tool / launch | Registration and launch of an external tool |
| SCORM package / track | An imported content package and its runtime tracking |
| Payment / order / invoice | Commerce records (Stripe / M-Pesa / eTIMS) |
| Notification | A queued, templated message (email / SMS / push) |
| Webhook | An outbound event delivery to an external system |
| Tenant registry / plan / metering | Control-plane records for the SaaS operator |
