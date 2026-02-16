import crypto from 'crypto';

const ALGORITHM_GCM = 'aes-256-gcm';
const ALGORITHM_CBC = 'aes-256-cbc';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const GCM_PREFIX = 'gcm:';

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'ENCRYPTION_KEY environment variable is required in production. ' +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    // Deterministic fallback for development only — data survives restarts but is NOT secure.
    console.warn(
      '[crypto] WARNING: ENCRYPTION_KEY is not set. Using insecure development fallback. ' +
      'Set ENCRYPTION_KEY in .env for persistent, secure encryption.'
    );
    return 'a'.repeat(64);
  }
  return key;
}

const ENCRYPTION_KEY = getEncryptionKey();

function deriveKeyBuffer(): Buffer {
  return Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
}

/**
 * Encrypt a string using AES-256-GCM (authenticated encryption).
 * Output format: gcm:<iv_hex>:<ciphertext_hex>:<auth_tag_hex>
 */
export function encrypt(text: string): string {
  const key = deriveKeyBuffer();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM_GCM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return GCM_PREFIX + iv.toString('hex') + ':' + encrypted + ':' + authTag;
}

/**
 * Decrypt a string. Supports both:
 * - AES-256-GCM format: gcm:<iv>:<ciphertext>:<authTag>
 * - Legacy AES-256-CBC format: <iv>:<ciphertext> (backward-compatible)
 */
export function decrypt(text: string): string {
  const key = deriveKeyBuffer();

  if (text.startsWith(GCM_PREFIX)) {
    const payload = text.slice(GCM_PREFIX.length);
    const parts = payload.split(':');
    if (parts.length < 3) {
      throw new Error('Invalid GCM ciphertext format');
    }
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[parts.length - 1], 'hex');
    const encryptedText = parts.slice(1, -1).join(':');

    const decipher = crypto.createDecipheriv(ALGORITHM_GCM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Legacy AES-256-CBC — backward compatibility for data encrypted before upgrade
  const parts = text.split(':');
  const iv = Buffer.from(parts.shift()!, 'hex');
  const encryptedText = parts.join(':');

  const decipher = crypto.createDecipheriv(ALGORITHM_CBC, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
