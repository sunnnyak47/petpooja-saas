/**
 * @fileoverview Durable file storage abstraction for uploaded assets
 * (logos, menu images, etc).
 *
 * Order of preference:
 *   1. Supabase Storage  — via its S3-compatible endpoint (reuses the AWS SDK,
 *      no extra dependency). Configured with SUPABASE_URL + S3 access keys.
 *   2. AWS S3            — the legacy path (config/aws.js).
 *   3. (caller) local disk — each upload route catches a thrown error and
 *      writes to ./uploads for local dev. Ephemeral on hosts like Render.
 *
 * Public URL shape for Supabase (bucket must be public):
 *   {SUPABASE_URL}/storage/v1/object/public/{bucket}/{key}
 *
 * @module config/storage
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const logger = require('./logger');
const { uploadToS3 } = require('./aws');

const SB_RAW = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY_ID = process.env.SUPABASE_S3_ACCESS_KEY_ID || '';
const SB_SECRET = process.env.SUPABASE_S3_SECRET_ACCESS_KEY || '';
const SB_REGION = process.env.SUPABASE_REGION || 'us-east-1';
const SB_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';

// Derive the project ref (first host label) so we can build both hosts Supabase
// uses: the S3 endpoint lives on <ref>.storage.supabase.co, public object URLs
// on <ref>.supabase.co. Accepting either form of SUPABASE_URL keeps it foolproof.
let SB_REF = '';
try { if (SB_RAW) SB_REF = new URL(SB_RAW).hostname.split('.')[0]; } catch { SB_REF = ''; }

const SB_PUBLIC_BASE = SB_REF ? `https://${SB_REF}.supabase.co` : SB_RAW;
const SB_S3_ENDPOINT = process.env.SUPABASE_S3_ENDPOINT
  || (SB_REF ? `https://${SB_REF}.storage.supabase.co/storage/v1/s3` : `${SB_RAW}/storage/v1/s3`);

/** @returns {boolean} whether Supabase Storage credentials are present. */
function isSupabaseConfigured() {
  return !!(SB_RAW && SB_KEY_ID && SB_SECRET);
}

let sbClient = null;
function getSupabaseClient() {
  if (!sbClient) {
    sbClient = new S3Client({
      forcePathStyle: true,
      region: SB_REGION,
      endpoint: SB_S3_ENDPOINT,
      credentials: { accessKeyId: SB_KEY_ID, secretAccessKey: SB_SECRET },
    });
  }
  return sbClient;
}

/**
 * Upload a buffer to Supabase Storage and return its public URL.
 * @returns {Promise<{key:string, url:string}>}
 */
async function uploadToSupabase(fileBuffer, originalName, folder, contentType = 'application/octet-stream') {
  const ext = path.extname(originalName || '').toLowerCase() || '';
  const key = `${folder}/${uuidv4()}${ext}`;
  await getSupabaseClient().send(new PutObjectCommand({
    Bucket: SB_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
    CacheControl: 'max-age=31536000',
  }));
  const url = `${SB_PUBLIC_BASE}/storage/v1/object/public/${SB_BUCKET}/${key}`;
  logger.info('File uploaded to Supabase Storage', { key, folder, size: fileBuffer.length });
  return { key, url };
}

/**
 * Upload a file to the best available durable backend.
 * Throws if no remote backend succeeds — callers handle a local-disk fallback.
 * @param {Buffer} fileBuffer
 * @param {string} originalName
 * @param {string} folder - logical folder, e.g. 'branding' | 'menu-items'
 * @param {string} [contentType]
 * @returns {Promise<{key:string, url:string}>}
 */
async function uploadFile(fileBuffer, originalName, folder, contentType = 'application/octet-stream') {
  if (isSupabaseConfigured()) {
    try {
      return await uploadToSupabase(fileBuffer, originalName, folder, contentType);
    } catch (err) {
      logger.warn('Supabase upload failed, falling back to S3', { error: err.message });
    }
  }
  return uploadToS3(fileBuffer, originalName, folder, contentType);
}

module.exports = { uploadFile, uploadToSupabase, isSupabaseConfigured };
