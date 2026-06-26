# Run the entire stack with ONE command

## Prerequisites
Just **Docker Desktop** (or Docker Engine + Compose). Nothing else — no PHP,
Node, Postgres, or Composer needed on your machine; the containers carry it all.

## Launch
From the project root:

```bash
docker compose up
```

That's it. The first run builds images and takes a few minutes; after that it's
fast. You'll see logs from all five services.

## What comes up
| Service   | URL / port              | What it is                          |
|-----------|-------------------------|-------------------------------------|
| frontend  | http://localhost:3000   | The Next.js app (start here)        |
| api       | http://localhost:8000   | The Laravel REST + GraphQL API      |
| postgres  | localhost:5432          | DB — auto-migrated + seeded + demo  |
| redis     | localhost:6379          | Cache / queue / sessions            |
| worker    | (no port)               | Background job worker               |

On first boot the database container automatically:
1. applies all 23 migrations in order,
2. seeds the `lms_app` role, the `acme` tenant, and the manager/student roles.

**Demo/test data is NOT loaded** — the stack always starts clean. You load test
data manually, only when you want it (see below).

## Log in (clean start)
Because the stack starts with no demo users, open http://localhost:3000 and
**register your own account**. Then make it a manager so you can create courses:

```bash
docker compose exec postgres psql -U postgres -d lms_full -v email="'you@acme.com'" -f /seed/grant-manager.sql
```

## Load demo/test data manually (optional)
The stack never auto-loads demo data. When you want a ready-made course + users
to click through, run this **after** the stack is up:

```bash
docker compose exec postgres psql -U postgres -d lms_full -f /seed/demo-data.sql
```

Demo logins after loading: `demo+alice@acme.com` / `password` (instructor),
`demo+bob@acme.com` / `password` (student).

Remove the demo data again at any time (leaves your real data untouched):

```bash
docker compose exec postgres psql -U postgres -d lms_full -f /seed/demo-data-remove.sql
```

## Common controls
```bash
docker compose up -d            # run in the background
docker compose logs -f api      # follow the API logs
docker compose down             # stop everything (keeps the database)
docker compose down -v          # stop + WIPE the database (fresh start next up)
```

## Before using this for real
The compose file ships dev secrets (APP_KEY, JWT_SECRET) for convenience.
**Change them** before exposing this anywhere — set your own values in the
`api` and `worker` environment blocks, and swap Postgres/Redis for managed
instances.
