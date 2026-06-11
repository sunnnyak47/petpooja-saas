/**
 * @fileoverview At-rest secret encryption helpers (AES-256-GCM).
 *
 * Used to protect sensitive secrets — e.g. OAuth access/refresh tokens — that
 * would otherwise be persisted in the database in plaintext. A DB leak or
 * backup must not expose usable credentials.
 *
 * Format of an encrypted value (all base64url, joined by ':'):
 *
 *     v1:<iv>:<authTag>:<ciphertext>
 *
 * The leading "v1:" makes values self-describing and lets decryptSecret()
 * detect (a) encrypted-vs-legacy-plaintext and (b) future scheme upgrades.
 *
 * Key: read from process.env.SECRETS_ENC_KEY (preferred) or TOKEN_ENC_KEY.
 * The key must decode to exactly 32 bytes from either hex or base64.
 *
 * Missing-key behaviour:
 *   - In production: throw a clear fatal error (fail closed — never silently
 *     store plaintext in prod).
 *   - In non-production: log a loud warning ONCE and fall back to returning the
 *     value unchanged, so local dev without the key still works and existing
 *     plaintext rows continue to read.
 *
 * Backward compatibility: decryptSecret() returns any value lacking the "v1:"
 * prefix unchanged, so pre-existing plaintext rows keep working until they are
 * next written (at which point they are encrypted).
 *
 * @module utils/crypto
 */
const crypto = require('crypto');
const logger = require('../config/logger');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // bytes — AES-256
const IV_LENGTH = 12; // bytes — recommended GCM nonce length
const VERSION = 'v1';
const PREFIX = `${VERSION}:`;

/** Cache the resolved key so we only decode / warn once. */
let cachedKey;
let keyResolved = false;
let warnedMissingKey = false;

/**
 * Returns true when running in a production environment.
 * @returns {boolean}
 */
function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Attempts to decode a raw key string (hex or base64) into a 32-byte Buffer.
 * @param {string} raw
 * @returns {Buffer|null} 32-byte key buffer, or null if it cannot be decoded
 */
function decodeKey(raw) {
  const trimmed = raw.trim();

  // Try hex first when it looks like hex of the right length.
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === KEY_LENGTH * 2) {
    return Buffer.from(trimmed, 'hex');
  }

  // Fall back to base64 / base64url.
  try {
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length === KEY_LENGTH) return buf;
  } catch (_) { /* fall through */ }

  return null;
}

/**
 * Resolves the encryption key from the environment, or null when absent/invalid.
 * Result is cached. Throws in production when the key is missing or malformed.
 * @returns {Buffer|null}
 */
function getKey() {
  if (keyResolved) return cachedKey;
  keyResolved = true;

  const raw = process.env.SECRETS_ENC_KEY || process.env.TOKEN_ENC_KEY || '';

  if (!raw) {
    if (isProduction()) {
      throw new Error(
        'SECRETS_ENC_KEY (or TOKEN_ENC_KEY) is required in production to encrypt ' +
        'secrets at rest. Provide a 32-byte key as hex (64 chars) or base64.'
      );
    }
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      logger.warn(
        '[crypto] SECRETS_ENC_KEY/TOKEN_ENC_KEY not set — secrets will be stored ' +
        'UNENCRYPTED. This is allowed only in non-production. Set a 32-byte key ' +
        '(hex or base64) before deploying.'
      );
    }
    cachedKey = null;
    return cachedKey;
  }

  const key = decodeKey(raw);
  if (!key) {
    // A malformed key is always fatal — silently falling back to plaintext when
    // someone *tried* to configure encryption would hide a real misconfig.
    throw new Error(
      'SECRETS_ENC_KEY/TOKEN_ENC_KEY is malformed — it must decode to exactly ' +
      '32 bytes from hex (64 hex chars) or base64.'
    );
  }

  cachedKey = key;
  return cachedKey;
}

/**
 * Encrypts a plaintext secret for storage.
 *
 * @param {string|null|undefined} plaintext
 * @returns {string|null|undefined} versioned ciphertext, or the input unchanged
 *   when there is nothing to encrypt (null/undefined/'') or when no key is
 *   configured in non-production.
 */
function encryptSecret(plaintext) {
  // Nothing to encrypt — preserve null/undefined/empty so callers that clear
  // tokens (e.g. on disconnect) keep behaving identically.
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return plaintext;
  }

  const value = String(plaintext);

  // Already encrypted — avoid double-wrapping (idempotent on our own output).
  if (value.startsWith(PREFIX)) return value;

  const key = getKey();
  if (!key) {
    // Non-production, no key: store as-is (warning already logged by getKey()).
    return value;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

/**
 * Decrypts a value produced by encryptSecret().
 *
 * Legacy/plaintext values (no "v1:" prefix) are returned unchanged so that
 * rows written before encryption was introduced keep working.
 *
 * @param {string|null|undefined} ciphertext
 * @returns {string|null|undefined} the decrypted plaintext, or the input
 *   unchanged for null/undefined/empty or legacy plaintext.
 */
function decryptSecret(ciphertext) {
  if (ciphertext === null || ciphertext === undefined || ciphertext === '') {
    return ciphertext;
  }

  const value = String(ciphertext);

  // Legacy plaintext — no version prefix — return as-is for backward compat.
  if (!value.startsWith(PREFIX)) return value;

  const parts = value.split(':');
  // Expected shape: v1:iv:tag:ciphertext
  if (parts.length !== 4) {
    throw new Error('[crypto] Malformed encrypted secret — unexpected segment count.');
  }

  const key = getKey();
  if (!key) {
    // We have an encrypted value but no key to decrypt it. This cannot be
    // silently treated as plaintext — surface a clear error.
    throw new Error(
      '[crypto] Encountered an encrypted secret but no SECRETS_ENC_KEY/' +
      'TOKEN_ENC_KEY is configured to decrypt it.'
    );
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64url');
  const authTag = Buffer.from(tagB64, 'base64url');
  const data = Buffer.from(dataB64, 'base64url');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = {
  encryptSecret,
  decryptSecret,
};
