/**
 * Output sanitization utility for EstateFlow CRM.
 *
 * Recursively strips or masks sensitive fields from API response objects
 * before they reach clients. Handles nested objects and arrays.
 *
 * Default sensitive fields include PII and secrets:
 *   phone, email, whatsapp_number, bank_details, PAN, Aadhaar,
 *   password_hash, password, token, secret, api_key, etc.
 */

import type { SanitizeOptions } from '@/types/security';

// ---------------------------------------------------------------------------
// Default sensitive fields
// ---------------------------------------------------------------------------

const DEFAULT_SENSITIVE_FIELDS = new Set([
  // PII
  'phone',
  'email',
  'whatsapp_number',
  'bank_details',
  'pan',
  'aadhaar',
  'aadhar',
  'ssn',
  'credit_card',
  'cvv',
  'pin',
  // Auth secrets
  'password_hash',
  'password',
  'token',
  'secret',
  'api_key',
  'access_token',
  'refresh_token',
  // Crypto
  'encryption_key',
  'private_key',
  'public_key',
  'jwt_secret',
  'signing_key',
  // Personal data
  'date_of_birth',
  'dob',
]);

// ---------------------------------------------------------------------------
// Sanitize function
// ---------------------------------------------------------------------------

/**
 * Sanitize a response object by removing or masking sensitive fields.
 *
 * Recursively traverses the object tree. Arrays are mapped over.
 * Objects have their keys checked against the sensitive fields list
 * (case-insensitive).
 *
 * @param data    - Response data object to sanitize
 * @param options - Optional sanitization settings
 * @returns Sanitized copy of the data (original is not mutated)
 */
export function sanitizeResponse<T extends Record<string, unknown>>(
  data: T,
  options?: SanitizeOptions,
): Partial<T> {
  const mode = options?.mode || 'strip';
  const additionalFields = options?.additionalFields || [];

  const sensitiveFields = new Set([
    ...DEFAULT_SENSITIVE_FIELDS,
    ...additionalFields.map((f) => f.toLowerCase()),
  ]);

  return sanitizeRecursive(data, sensitiveFields, mode) as Partial<T>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Recursively sanitize a value.
 */
function sanitizeRecursive(
  value: unknown,
  sensitiveFields: Set<string>,
  mode: 'strip' | 'mask',
): unknown {
  // Handle arrays
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeRecursive(item, sensitiveFields, mode));
  }

  // Handle objects
  if (value !== null && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const keyLower = key.toLowerCase();

      if (sensitiveFields.has(keyLower)) {
        if (mode === 'mask') {
          sanitized[key] = '***';
        }
        // In 'strip' mode, we skip the key entirely
        continue;
      }

      // Recurse into nested objects
      sanitized[key] = sanitizeRecursive(val, sensitiveFields, mode);
    }
    return sanitized;
  }

  // Primitives pass through
  return value;
}
