/**
 * AES-256-GCM encryption/decryption for PII fields.
 *
 * Encryption key is derived from the ENCRYPTION_KEY or APP_ENCRYPTION_KEY
 * environment variable (64 hex chars = 32 bytes raw). Each encryption
 * generates a random 16-byte IV.
 *
 * Storage format: base64(iv + ciphertext + authTag)
 *   - iv:      16 bytes
 *   - authTag: 16 bytes
 */

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_ENCODING: BufferEncoding = 'hex';
const OUTPUT_ENCODING: BufferEncoding = 'base64';

// ---------------------------------------------------------------------------
// Key retrieval
// ---------------------------------------------------------------------------

/**
 * Get the encryption key from environment variables.
 *
 * Supports both ENCRYPTION_KEY and APP_ENCRYPTION_KEY for compatibility.
 *
 * @returns 32-byte Buffer
 * @throws if key is not set or invalid
 */
function getKey(): Buffer {
  const keyHex =
    process.env.APP_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error(
      'Encryption key not set. Set APP_ENCRYPTION_KEY (or ENCRYPTION_KEY) ' +
        'to a 64-character hex string (32 bytes).',
    );
  }

  const key = Buffer.from(keyHex, KEY_ENCODING);

  if (key.length !== 32) {
    throw new Error(
      `Invalid encryption key length: expected 32 bytes (64 hex chars), got ${key.length} bytes.`,
    );
  }

  return key;
}

// ---------------------------------------------------------------------------
// Core encrypt / decrypt
// ---------------------------------------------------------------------------

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * Returns a base64-encoded string with the format: iv:authTag:ciphertext
 *
 * @param plaintext - Text to encrypt
 * @returns Base64-encoded encrypted payload in format "iv:authTag:ciphertext"
 * @throws if plaintext is empty or key is not configured
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty string');
  }

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let ciphertext = cipher.update(plaintext, 'utf8', OUTPUT_ENCODING);
  ciphertext += cipher.final(OUTPUT_ENCODING);

  const authTag = cipher.getAuthTag().toString(OUTPUT_ENCODING);

  // Format: iv:authTag:ciphertext  (each component base64-encoded)
  return `${iv.toString(OUTPUT_ENCODING)}:${authTag}:${ciphertext}`;
}

/**
 * Decrypt a payload previously encrypted with `encrypt()`.
 *
 * @param encrypted - Base64-encoded payload in format "iv:authTag:ciphertext"
 * @returns Decrypted plaintext
 * @throws if the payload is tampered, malformed, or key is invalid
 */
export function decrypt(encrypted: string): string {
  if (!encrypted) {
    throw new Error('Cannot decrypt empty string');
  }

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'Invalid encrypted payload format. Expected "iv:authTag:ciphertext".',
    );
  }

  const [ivB64, authTagB64, ciphertextB64] = parts as [
    string,
    string,
    string,
  ];

  const key = getKey();
  const iv = Buffer.from(ivB64, OUTPUT_ENCODING);
  const authTag = Buffer.from(authTagB64, OUTPUT_ENCODING);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertextB64, OUTPUT_ENCODING, 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

// ---------------------------------------------------------------------------
// Phone number convenience wrappers
// ---------------------------------------------------------------------------

/**
 * Encrypt a phone number.
 *
 * @param phone - Phone number (e.g., "+919876543210")
 * @returns Encrypted payload in format "iv:authTag:ciphertext"
 */
export function encryptPhone(phone: string): string {
  return encrypt(phone);
}

/**
 * Decrypt an encrypted phone number.
 *
 * @param encrypted - Previously encrypted phone payload
 * @returns Plaintext phone number
 */
export function decryptPhone(encrypted: string): string {
  return decrypt(encrypted);
}

/**
 * Mask a phone number for display purposes.
 *
 * Shows only the first two and last two digits.
 * E.g., "+919876543210" → "+91XXXXXXXX10"
 *
 * @param phone - Plaintext or masked phone number
 * @returns Masked phone string
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 6) {
    return phone || '';
  }

  const countryCodeMatch = phone.match(/^(\+?\d{1,3})/);
  const countryCode = countryCodeMatch ? countryCodeMatch[1]! : '';
  const nationalNumber = countryCode
    ? phone.slice(countryCode.length)
    : phone;

  if (nationalNumber.length < 4) {
    return phone;
  }

  const visiblePrefix = nationalNumber.slice(0, 2);
  const visibleSuffix = nationalNumber.slice(-2);
  const maskedMiddle = 'X'.repeat(Math.max(0, nationalNumber.length - 4));

  return `${countryCode}${visiblePrefix}${maskedMiddle}${visibleSuffix}`;
}
