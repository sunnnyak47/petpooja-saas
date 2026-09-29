# AU Data Residency — cutover runbook

**Why:** The launch audit flagged that Australian customer personal information is
currently hosted **offshore** — the Postgres database is a Supabase project in
Tokyo (`aws-1-ap-northeast-1`), object storage defaults to AWS `ap-south-1`
(Mumbai), and the Render web service has no region pinned. Under **Australian
Privacy Principle 8 (APP 8)** you must take reasonable steps before disclosing
personal information overseas, and many AU hospitality buyers expect data held in
Australia. This runbook moves **data at rest** (DB + object storage + backups)
into Australia.

**Good news — the code is already region-agnostic.** Every region/bucket/host is
driven by environment variables (`DATABASE_URL`, `AWS_REGION`, `AWS_S3_BUCKET`,
`SUPABASE_URL`, `SUPABASE_REGION`, `SUPABASE_STORAGE_BUCKET`,
`SUPABASE_S3_ENDPOINT`, backup secrets). **No code change is needed to move
regions** — this is an infrastructure + env-var cutover you (the owner) run
against your Supabase / AWS / Render accounts. Claude has no access to those
consoles and never touches the production database.

---

## Decisions to make first

1. **Database region.** Recommended: a **new Supabase project in `ap-southeast-2`
   (Sydney)**. (Alternative: AWS RDS Postgres in `ap-southeast-2` — more ops
   overhead, only if you're leaving Supabase.)
2. **Object storage region.** A new **S3 bucket in `ap-southeast-2`** (or a
   Supabase Storage bucket on the Sydney project).
3. **Compute region — the one real trade-off.** **Render has no Australian
   region** (options are Oregon, Ohio, Virginia, Frankfurt, Singapore). Pick
   **Singapore** as the nearest. Result: *data at rest* is in Australia (what
   APP 8 and buyer expectations mostly care about) while *compute/processing*
   transits Singapore. That is a normal, disclosable arrangement — the privacy
   policy's "Overseas disclosure" section must name it (see step 8). If you need
   compute in AU too, you'd move the API to a host with a Sydney region (AWS
   ap-southeast-2 / Fly.io syd / GCP australia-southeast1) — out of scope here.
4. **Maintenance window.** The offline-first **desktop POS keeps venues trading
   during the cutover** (orders queue locally and sync on reconnect), so you can
   run this during a low-traffic window without stopping sales. Cloud/mobile POS
   sessions will see a short read-only/last window — announce ~30–60 min.

---

## Cutover — ordered steps

### 1. Create the Sydney database
- Create a new Supabase project, region **Sydney (ap-southeast-2)**.
- Copy its connection string (session pooler, IPv4) — this becomes the new
  `DATABASE_URL`.

### 2. Freeze writes (short window)
- Put the API into maintenance (Render: scale to 0 or a maintenance flag), or
  announce a read-only window. Desktop POS venues keep trading offline.

### 3. Dump Tokyo → restore Sydney
```bash
# Dump only your application data (exclude Supabase-internal schemas)
pg_dump "$TOKYO_DATABASE_URL" \
  --format=custom --no-owner --no-privileges \
  --schema=public \
  --file=petpooja_$(date +%Y%m%d).dump

# Restore into the Sydney project
pg_restore --no-owner --no-privileges --clean --if-exists \
  --dbname="$SYDNEY_DATABASE_URL" \
  petpooja_$(date +%Y%m%d).dump
```
> Use the **direct** (non-pooler) connection string for `pg_dump`/`pg_restore`;
> the pooler can truncate long-running restores.

### 4. Baseline Prisma migrations on the new DB
This repo now uses Prisma Migrate (`backend/prisma/migrations/`). The restored DB
already has the tables, so mark the existing migrations as applied instead of
re-running them:
```bash
cd backend
DATABASE_URL="$SYDNEY_DATABASE_URL" npx prisma migrate resolve --applied 0_init
DATABASE_URL="$SYDNEY_DATABASE_URL" npx prisma migrate resolve --applied 20260926000001_add_push_tokens
# then confirm nothing is pending:
DATABASE_URL="$SYDNEY_DATABASE_URL" npx prisma migrate status
```
(See `backend/prisma/MIGRATION_BASELINE.md` for the same pattern.) The seed
(`backend/prisma/seed.js`) is idempotent — only run it on a genuinely empty DB.

### 5. Create the Sydney object-storage bucket
- **S3:** create a bucket in `ap-southeast-2`, then copy existing assets:
  ```bash
  aws s3 sync s3://<old-mumbai-bucket> s3://<new-sydney-bucket> \
    --source-region ap-south-1 --region ap-southeast-2
  ```
- **or Supabase Storage:** create the `uploads` bucket on the Sydney project and
  migrate objects.

### 6. Point Render at the new region + env
- Recreate the Render web service in **Singapore** (nearest to Sydney), or set
  its region if recreating.
- Update env vars (the app reads all of these — no code change):
  | Var | New value |
  |---|---|
  | `DATABASE_URL` | Sydney Supabase pooler string |
  | `SUPABASE_URL` | Sydney project URL |
  | `SUPABASE_REGION` | `ap-southeast-2` |
  | `SUPABASE_STORAGE_BUCKET` | your Sydney bucket |
  | `SUPABASE_S3_ENDPOINT` | Sydney `…storage.supabase.co/storage/v1/s3` (or leave unset to auto-derive) |
  | `AWS_REGION` | `ap-southeast-2` (if using AWS S3) |
  | `AWS_S3_BUCKET` | new Sydney bucket |
- Deploy. The build now runs `prisma migrate deploy` (safe/idempotent).

### 7. Repoint backups to Sydney
The nightly backup workflow (`.github/workflows/db-backup.yml`) already reads
region/bucket from secrets — just update them:
- `BACKUP_DATABASE_URL` → Sydney DB
- `BACKUP_S3_BUCKET` → a bucket **also in `ap-southeast-2`**
- `AWS_REGION` → `ap-southeast-2`

### 8. Flip the privacy disclosure
After cutover, update `website/src/pages/privacy.astro` §5 (there's an inline
HTML comment marking exactly what to change) so it states data is hosted in
Australia with some overseas processing (compute/CDN/analytics).

---

## Verify (post-cutover checklist)
- [ ] `GET /health`, `/health/ready`, `/health/live` green on the new service
- [ ] Log in; create a **test order**; confirm it persists and KOT/KDS fire
- [ ] Upload a menu image → confirm it lands in the **Sydney** bucket and serves
- [ ] `prisma migrate status` shows all applied, nothing pending
- [ ] Trigger the backup workflow once → confirm the dump lands in the Sydney bucket
- [ ] Confirm the frontend/mobile point at the same API and work end-to-end

## Rollback
Keep the **Tokyo database read-only for ~7 days** (don't delete it). If a problem
surfaces, revert the Render env vars to the Tokyo `DATABASE_URL` + old bucket and
redeploy — no schema change is involved, so rollback is just an env flip. Once
the Sydney stack has run clean for a week, decommission Tokyo.

---

## Residual notes for your privacy policy / due diligence
- **Data at rest** (DB, object storage, backups): **Australia** after this cutover.
- **Compute/processing**: **Singapore** (Render) — disclose in APP 8 section.
- **Analytics**: Google (GA4) — overseas; already disclosed.
- **CDN/edge** (Vercel for the marketing sites): overseas edge — low-risk, but
  keep it named in the disclosure.
