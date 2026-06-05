#!/usr/bin/env node
/**
 * @fileoverview Database backup — pg_dump (custom format) → local file → optional S3.
 *
 * Designed to run from a scheduler (GitHub Actions nightly, cron, or manually
 * `npm run backup:db`). Pluggable and fail-safe:
 *   - Requires DATABASE_URL and the `pg_dump` binary; without them it exits 1.
 *   - S3 upload only happens when BACKUP_S3_BUCKET (+ AWS creds) are set. When
 *     not configured it keeps the local dump and exits 0 — a backup still
 *     exists, it just isn't shipped offsite.
 *
 * Restore with the companion script: `node scripts/restore-db.js <file>`.
 *
 * Env:
 *   DATABASE_URL          (required)  Postgres connection string.
 *   BACKUP_DIR            (optional)  Local output dir. Default backend/backups.
 *   BACKUP_RETAIN         (optional)  Local dumps to keep. Default 7.
 *   BACKUP_S3_BUCKET      (optional)  Enables offsite upload when set.
 *   BACKUP_S3_PREFIX      (optional)  Key prefix. Default 'db-backups'.
 *   AWS_REGION            (optional)  Default 'ap-south-1' (Mumbai).
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_ENDPOINT_URL (S3 or R2).
 *
 * @module scripts/backup-db
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/** Timestamp like 20260606-143000 (UTC). */
function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

function log(msg, extra) {
  const line = `[backup-db] ${msg}`;
  if (extra !== undefined) console.log(line, extra);
  else console.log(line);
}

function fail(msg) {
  console.error(`[backup-db] ERROR: ${msg}`);
  process.exit(1);
}

/**
 * Run pg_dump into a custom-format file.
 * @param {string} dbUrl
 * @param {string} outPath
 * @returns {Promise<void>}
 */
function runPgDump(dbUrl, outPath) {
  return new Promise((resolve, reject) => {
    // --no-owner / --no-privileges → restores cleanly across differing roles.
    const args = ['--dbname', dbUrl, '-Fc', '--no-owner', '--no-privileges', '-f', outPath];
    const child = spawn('pg_dump', args, { stdio: ['ignore', 'inherit', 'pipe'] });

    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('pg_dump not found on PATH. Install the postgresql-client package.'));
      } else {
        reject(err);
      }
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exited ${code}: ${stderr.trim() || 'unknown error'}`));
    });
  });
}

/**
 * Prune local dumps beyond the retention count (newest kept).
 * @param {string} dir
 * @param {number} keep
 */
function pruneLocal(dir, keep) {
  let files;
  try {
    files = fs.readdirSync(dir)
      .filter((f) => f.startsWith('msrm-') && f.endsWith('.dump'))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
  } catch (_) {
    return;
  }
  for (const { f } of files.slice(keep)) {
    try {
      fs.unlinkSync(path.join(dir, f));
      log(`pruned old local backup: ${f}`);
    } catch (_) { /* best effort */ }
  }
}

/**
 * Upload a file to S3 / S3-compatible storage (e.g. Cloudflare R2).
 * @param {string} filePath
 * @param {string} key
 * @returns {Promise<void>}
 */
async function uploadToS3(filePath, key) {
  // Lazy-require so the script runs with zero AWS config when S3 is disabled.
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

  const client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    ...(process.env.AWS_ENDPOINT_URL ? { endpoint: process.env.AWS_ENDPOINT_URL, forcePathStyle: true } : {}),
  });

  await client.send(new PutObjectCommand({
    Bucket: process.env.BACKUP_S3_BUCKET,
    Key: key,
    Body: fs.createReadStream(filePath),
    ContentType: 'application/octet-stream',
  }));
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) fail('DATABASE_URL is not set.');

  const dir = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });

  const filename = `msrm-${stamp()}.dump`;
  const outPath = path.join(dir, filename);

  const started = Date.now();
  log(`starting pg_dump → ${outPath}`);
  await runPgDump(dbUrl, outPath);

  const { size } = fs.statSync(outPath);
  if (size === 0) fail('pg_dump produced an empty file — aborting.');
  const sizeMb = (size / 1048576).toFixed(2);
  log(`dump complete: ${sizeMb} MB in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (process.env.BACKUP_S3_BUCKET) {
    const key = `${(process.env.BACKUP_S3_PREFIX || 'db-backups').replace(/\/+$/, '')}/${filename}`;
    try {
      log(`uploading to s3://${process.env.BACKUP_S3_BUCKET}/${key}`);
      await uploadToS3(outPath, key);
      log('offsite upload OK');
    } catch (err) {
      // A failed offsite upload is a real failure — we want the scheduler to
      // alert. The local dump is still on disk for manual recovery.
      fail(`S3 upload failed (local dump kept at ${outPath}): ${err.message}`);
    }
  } else {
    log('BACKUP_S3_BUCKET not set — keeping local dump only (no offsite copy).');
  }

  pruneLocal(dir, Number(process.env.BACKUP_RETAIN || 7));
  log('done.');
}

main().catch((err) => fail(err.message));
