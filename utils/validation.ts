// Input validation for every form in the app.
// These mirror the server rules in backend/src/validation.ts — keep the two in sync.
// Each validator returns an error message, or null when the value is valid.

export type Validator = (value: string) => string | null;

/** "0771234567" / "+94 77 123 4567" → "771234567", or null if not a Sri Lankan mobile. */
export function normaliseSriLankanMobile(input: string): string | null {
  let digits = input.replace(/[^0-9]/g, '');
  if (digits.startsWith('94')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return /^7[0-9]{8}$/.test(digits) ? digits : null;
}

export const validatePhone: Validator = (v) => {
  if (!v.trim()) return 'Enter your mobile number';
  return normaliseSriLankanMobile(v) ? null : 'Enter a valid Sri Lankan mobile number, e.g. 77 123 4567';
};

export const validateOtp: Validator = (v) => (/^[0-9]{6}$/.test(v) ? null : 'Enter the 6-digit code');

export const cleanName = (v: string) => v.trim().replace(/\s+/g, ' ');

export const validateFullName: Validator = (raw) => {
  const v = cleanName(raw);
  if (!v) return 'Enter your full name';
  if (v.length < 3) return 'Full name must be at least 3 characters';
  if (v.length > 60) return 'Full name must be 60 characters or less';
  if (!/^[\p{L} .'-]+$/u.test(v)) return 'Use letters only (spaces, dots, hyphens and apostrophes are fine)';
  if (v.split(' ').filter(Boolean).length < 2) return 'Enter your first and last name';
  return null;
};

export const validateOptionalEmail: Validator = (raw) => {
  const v = raw.trim();
  if (!v) return null;
  if (v.length > 120) return 'Email must be 120 characters or less';
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : 'Enter a valid email address';
};

export const validateRequiredChoice =
  (label: string): Validator =>
  (v) =>
    v ? null : `Choose your ${label}`;

export const MIN_SERVICE_PRICE_RS = 200;
export const MAX_SERVICE_PRICE_RS = 100_000;

export const validatePrice = (raw: string, min = MIN_SERVICE_PRICE_RS, max = MAX_SERVICE_PRICE_RS): string | null => {
  const v = raw.trim();
  if (!v) return 'Enter a price';
  if (!/^[0-9]+$/.test(v)) return 'Use whole rupees only (no decimals)';
  const n = parseInt(v, 10);
  if (n < min) return `Minimum is Rs ${min.toLocaleString('en-US')}`;
  if (n > max) return `Maximum is Rs ${max.toLocaleString('en-US')}`;
  return null;
};

/** Keeps only digits — use on numeric inputs' onChangeText. */
export const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '');

// Documents
export const ALLOWED_DOC_MIME = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf'];
export const MAX_DOC_BYTES = 5 * 1024 * 1024;

export function validateDocument(file: { mimeType?: string | null; size?: number | null }): string | null {
  if (!file.mimeType || !ALLOWED_DOC_MIME.includes(file.mimeType)) return 'Upload a JPG, PNG, HEIC photo or a PDF';
  if (file.size != null && file.size > MAX_DOC_BYTES) return 'File is too large (max 5 MB)';
  if (file.size === 0) return 'That file is empty';
  return null;
}

// Job flow
export const validatePartName: Validator = (raw) => {
  const v = raw.trim();
  if (!v) return 'Enter the part or fee name';
  if (v.length < 2) return 'Name is too short';
  if (v.length > 40) return 'Keep it under 40 characters';
  return null;
};

export const MAX_NOTE_LENGTH = 500;
