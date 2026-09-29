# Prisma Migrate — one-time production baseline

This repo now deploys schema changes with **`prisma migrate deploy`** instead of
`prisma db push --accept-data-loss` (which could silently drop data on every
deploy). Migrations live in `backend/prisma/migrations/`:

- `0_init/` — a baseline snapshot of the schema **as it already exists in
  production today** (generated with
  `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`,
  before the PushToken model was added). It is never meant to be *executed*
  against prod — only marked as applied.
- `20260926000001_add_push_tokens/` — the first real migration (persistent Expo
  push-token registry). `migrate deploy` will apply this one.

## What the owner must run ONCE before the first deploy of this change

The production database already contains every table in `0_init`, so Prisma
must be told that baseline is "already applied" (otherwise `migrate deploy`
would try to re-create existing tables and fail):

```bash
# From backend/, with DATABASE_URL pointing at the PRODUCTION database:
npx prisma migrate resolve --applied 0_init
```

This inserts a single row into the `_prisma_migrations` bookkeeping table and
touches nothing else. Run it exactly once. After that, every Render deploy
(`buildCommand` in render.yaml) runs `npx prisma migrate deploy`, which applies
only new, never-applied migration folders — starting with
`20260926000001_add_push_tokens`.

The same applies to any long-lived non-prod environment that was previously
managed by `db push` (staging, a persistent local DB): baseline it once with
the same command. A **fresh/empty** database needs no baseline — `migrate
deploy` will run `0_init` and everything after it.

## Day-to-day workflow from now on

```bash
# 1. Edit prisma/schema.prisma
# 2. Create a migration against your LOCAL dev database:
npx prisma migrate dev --name describe_your_change
# 3. Commit the new prisma/migrations/<timestamp>_describe_your_change/ folder.
# 4. Deploy — Render runs `prisma migrate deploy` automatically.
```

Never run `prisma db push` against production again, and never edit an
already-committed migration folder.

Notes:
- The schema uses `gen_random_uuid()`, built into PostgreSQL 13+. On older
  Postgres you must `CREATE EXTENSION pgcrypto;` first (Render's Postgres is
  new enough).
- `npx prisma db seed` still runs on deploy (idempotent upserts of
  roles/permissions/system config), unchanged from the previous flow.
