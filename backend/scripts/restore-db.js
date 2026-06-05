#!/usr/bin/env node
/**
 * @fileoverview Database restore — pg_restore a backup into DATABASE_URL.
 *
 * DESTRUCTIVE: this drops and recreates objects in the target database. It is
 * deliberately hard to run by accident:
 *   - You must pass --confirm (or set RESTORE_CONFIRM=yes).
 *   - It prints the target host/database before doing anything.
 *
 * Usage:
 *   node scripts/restore-db.js ./backups/msrm-20260606-020000.dump --confirm
 *   node scripts/restore-db.js --from-s3 --confirm            # latest in bucket
 *   node scripts/restore-db.js --from-s3 db-backups/msrm-....dump --confirm
 *
 * Env: DATABASE_URL (required, the RESTORE TARGET), plus the same BACKUP_S3_*
 * / AWS_* vars as backup-db.js when using --from-s3.
 *
 * @module scripts/restore-db
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function log(msg) { console.log(`[restore-db] ${msg}`); }
function fail(msg) { console.error(`[restore-db] ERROR: ${msg}`); process.exit(1); }

/**
 * Best-effort redaction of a Postgres URL for display (drops the password).
 * @param {string} url
 * @returns {string}
 */
function describeTarget(url) {
  try {
    const u = new URL(url);
    return `${u.username ? u.username + '@' : ''}${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch (_) {
    return '(unparseable DATABASE_URL)';
  }
}

/**
 * Download a backup from S3/R2 to a temp file.
 * @param {string|null} explicitKey - specific key, or null to pick the latest
 * @returns {Promise<string>} local temp path
 */
async function downloadFromS3(explicitKey) {
  const bucket = process.env.BACKUP_S3_BUCKET;
  if (!bucket) fail('--from-s3 requires BACKUP_S3_BUCKET.');

  const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    ...(process.env.AWS_ENDPOINT_URL ? { endpoint: process.env.AWS_ENDPOINT_URL, forcePathStyle: true } : {}),
  });

  let key = explicitKey;
  if (!key) {
    const prefix = (process.env.BACKUP_S3_PREFIX || 'db-backups').replace(/\/+$/, '') + '/';
    const list = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
    const dumps = (list.Contents || [])
      .map((o) => o.Key)
      .filter((k) => k && k.endsWith('.dump'))
      .sort(); // timestamped names sort chronologically
    if (dumps.length === 0) fail(`no .dump objects under s3://${bucket}/${prefix}`);
    key = dumps[dumps.length - 1];
    log(`latest backup resolved to ${key}`);
  }

  const tmp = path.join(os.tmpdir(), path.basename(key));
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(tmp);
    res.Body.pipe(ws);
    res.Body.on('error', reject);
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
  log(`downloaded to ${tmp}`);
  return tmp;
}

/**
 * Run pg_restore from a dump file into the target DATABASE_URL.
 * @param {string} dbUrl
 * @param {string} file
 * @returns {Promise<void>}
 */
function runPgRestore(dbUrl, file) {
  return new Promise((resolve, reject) => {
    const args = ['--dbname', dbUrl, '--clean', '--if-exists', '--no-owner', '--no-privileges', file];
    const child = spawn('pg_restore', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', (err) => {
      if (err.code === 'ENOENT') reject(new Error('pg_restore not found on PATH. Install postgresql-client.'));
      else reject(err);
    });
    // pg_restore exits non-zero on benign "does not exist, skipping" notices
    // with --clean on a fresh DB; treat <= 1 as success and surface higher.
    child.on('close', (code) => (code <= 1 ? resolve() : reject(new Error(`pg_restore exited ${code}`))));
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const confirmed = argv.includes('--confirm') || process.env.RESTORE_CONFIRM === 'yes';
  const fromS3 = argv.includes('--from-s3');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) fail('DATABASE_URL (restore target) is not set.');

  // Resolve the source file.
  let file;
  if (fromS3) {
    const positional = argv.find((a) => !a.startsWith('--'));
    file = await downloadFromS3(positional || null);
  } else {
    file = argv.find((a) => !a.startsWith('--'));
    if (!file) fail('Pass a dump file path, or use --from-s3.');
    if (!fs.existsSync(file)) fail(`file not found: ${file}`);
  }

  log(`RESTORE TARGET → ${describeTarget(dbUrl)}`);
  log(`SOURCE         → ${file}`);

  if (!confirmed) {
    fail('Refusing to run without confirmation. Re-run with --confirm (or RESTORE_CONFIRM=yes). '
      + 'This will OVERWRITE the target database above.');
  }

  log('restoring (this drops & recreates objects)…');
  await runPgRestore(dbUrl, file);
  log('restore complete.');
}

main().catch((err) => fail(err.message));
