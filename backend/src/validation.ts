// Input validation rules for every request body.
// The mobile app has matching rules in utils/validation.ts — keep the two in sync.
import { z } from 'zod';

/** Accepts 771234567 / 0771234567 / 94771234567 / +94 77 123 4567 and returns "+94771234567". */
export const sriLankanMobile = z
  .string({ error: 'Phone number is required' })
  .trim()
  .transform((raw, ctx) => {
    let digits = raw.replace(/[^0-9]/g, '');
    if (digits.startsWith('94')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = digits.slice(1);
    if (!/^7[0-9]{8}$/.test(digits)) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid Sri Lankan mobile number, e.g. 77 123 4567' });
      return z.NEVER;
    }
    return `+94${digits}`;
  });

export const otpCode = z
  .string({ error: 'Code is required' })
  .trim()
  .regex(/^[0-9]{6}$/, 'The code must be 6 digits');

export const sendOtpBody = z.object({ phone: sriLankanMobile });
export const verifyOtpBody = z.object({ phone: sriLankanMobile, code: otpCode });
export const refreshBody = z.object({ refreshToken: z.string().min(20, 'Refresh token is required') });

export const fullName = z
  .string({ error: 'Full name is required' })
  .transform((v) => v.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(3, 'Full name must be at least 3 characters')
      .max(60, 'Full name must be 60 characters or less')
      .regex(/^[\p{L} .'-]+$/u, 'Use letters only (spaces, dots, hyphens and apostrophes are fine)')
      .refine((v) => v.split(' ').filter(Boolean).length >= 2, 'Enter your first and last name'),
  );

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(120, 'Email must be 120 characters or less')
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.union([z.null(), z.email('Enter a valid email address')]));

export const SERVICE_AREAS = [
  'Colombo',
  'Gampaha',
  'Kalutara',
  'Kandy',
  'Matale',
  'Nuwara Eliya',
  'Galle',
  'Matara',
  'Hambantota',
  'Jaffna',
  'Kilinochchi',
  'Mannar',
  'Vavuniya',
  'Mullaitivu',
  'Batticaloa',
  'Ampara',
  'Trincomalee',
  'Kurunegala',
  'Puttalam',
  'Anuradhapura',
  'Polonnaruwa',
  'Badulla',
  'Monaragala',
  'Ratnapura',
  'Kegalle',
] as const;

export const profileBody = z.object({
  fullName,
  email: optionalEmail,
  serviceArea: z.enum(SERVICE_AREAS, { error: 'Choose your service area (district)' }),
});

export const MIN_SERVICE_PRICE_RS = 200;
export const MAX_SERVICE_PRICE_RS = 100_000;

/** Mechanics only choose which services they do. Ridzo sets the prices (admin web app). */
export const servicesBody = z.object({
  serviceKeys: z
    .array(z.string().regex(/^[a-z0-9_]{2,40}$/, 'Unknown service'), { error: 'Choose the services you offer' })
    .min(1, 'Choose at least one service you offer')
    .max(30),
});

/** Sri Lanka (with a small margin): rejects 0,0 and obviously fake locations. */
export const sriLankaLat = z.number().min(5.5, 'Location is outside Sri Lanka').max(10.2, 'Location is outside Sri Lanka');
export const sriLankaLng = z.number().min(79.3, 'Location is outside Sri Lanka').max(82.2, 'Location is outside Sri Lanka');

export const availabilityBody = z.object({
  online: z.boolean({ error: 'online must be true or false' }),
  lat: sriLankaLat.optional(),
  lng: sriLankaLng.optional(),
});

export const quoteBody = z
  .object({
    serviceKeys: z.array(z.string()).min(1, 'Choose at least one service').max(10),
    distanceKm: z.number().min(0).max(500).optional(),
    from: z.object({ lat: sriLankaLat, lng: sriLankaLng }).optional(),
    to: z.object({ lat: sriLankaLat, lng: sriLankaLng }).optional(),
    at: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((b) => b.distanceKm !== undefined || (b.from && b.to), {
    message: 'Send distanceKm, or both from and to locations',
    path: ['distanceKm'],
  });

export const DOC_TYPES = ['nic', 'license', 'certificate', 'toolkit'] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const docTypeParam = z.enum(DOC_TYPES, { error: 'Unknown document type' });

export const ALLOWED_DOC_MIME = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf'];
export const MAX_DOC_BYTES = 5 * 1024 * 1024; // 5 MB

// ─── Admin ──────────────────────────────────────────────────────────────────

export const adminLoginBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Password is required').max(200),
});

export const adminPassword = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(200)
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), 'Use letters and numbers');

const reason = z.string().trim().min(3, 'Give a short reason (at least 3 characters)').max(200, 'Keep the reason under 200 characters');

const docDecision = z.discriminatedUnion(
  'status',
  [z.object({ status: z.literal('approved') }), z.object({ status: z.literal('rejected'), reason })],
  { error: 'Approve or reject this document' },
);

export const reviewBody = z.object({
  documents: z.object(
    { nic: docDecision, license: docDecision, certificate: docDecision, toolkit: docDecision },
    { error: 'Review every document' },
  ),
  note: z.string().trim().max(300).optional(),
});

export const suspendBody = z.object({ reason });

export const MECHANIC_STATUSES = ['onboarding', 'pending_review', 'approved', 'rejected', 'suspended'] as const;

export const mechanicListQuery = z.object({
  status: z.enum(MECHANIC_STATUSES).optional(),
  search: z
    .string()
    .trim()
    .max(40)
    .regex(/^[\p{L}0-9 +.'-]*$/u, 'Search by name or phone')
    .optional()
    .transform((v) => v || undefined),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export const catalogPatchBody = z
  .object({
    priceRs: z
      .number()
      .int('Price must be a whole number of rupees')
      .min(MIN_SERVICE_PRICE_RS, `Minimum price is Rs ${MIN_SERVICE_PRICE_RS}`)
      .max(MAX_SERVICE_PRICE_RS, `Maximum price is Rs ${MAX_SERVICE_PRICE_RS.toLocaleString('en-US')}`),
    active: z.boolean(),
    name: z.string().trim().min(2).max(60),
    durationLabel: z.string().trim().min(1).max(30),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, 'Nothing to change');

const wholeRs = (max: number) => z.number().int('Use whole rupees').min(0).max(max);
const hour = z.number().int().min(0, 'Hour must be 0–23').max(23, 'Hour must be 0–23');

export const pricingPatchBody = z
  .object({
    travelBaseRs: wholeRs(10_000),
    travelBaseKm: z.number().min(0).max(50),
    travelPerKmRs: wholeRs(1_000),
    travelCapRs: wholeRs(50_000),
    nightMultiplier: z.number().min(1, 'Must be at least 1 (no change)').max(3),
    nightStartHour: hour,
    nightEndHour: hour,
    roadFactor: z.number().min(1).max(3),
    maxRadiusKm: z.number().min(1).max(100),
    commissionRate: z.number().min(0).max(0.5, 'Commission can be at most 50%'),
    commissionOnTravel: z.boolean(),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, 'Nothing to change');

// ─── Live location, jobs, billing ───────────────────────────────────────────

export const locationBody = z.object({
  lat: sriLankaLat,
  lng: sriLankaLng,
  accuracyM: z.number().min(0).max(100_000).nullable().optional(),
  // Phones report -1 for "unknown" heading/speed; treat anything negative as unknown.
  heading: z.number().max(360).nullable().optional().transform((v) => (v == null || v < 0 ? null : v)),
  speedMps: z.number().max(100).nullable().optional().transform((v) => (v == null || v < 0 ? null : v)),
  /** When the phone took the reading (background points can arrive late or in batches). */
  recordedAt: z.iso.datetime({ offset: true }).optional(),
  source: z.enum(['foreground', 'background']).default('foreground'),
});

export const ISSUE_CATEGORIES = ['tyre', 'battery', 'engine', 'lockout', 'other'] as const;

/** A customer's breakdown request (dev route today; the customer app later). */
export const createJobBody = z.object({
  customerName: z.string().trim().min(2).max(60),
  customerPhone: sriLankanMobile,
  vehicle: z.string().trim().min(2).max(60),
  vehicleType: z.string().trim().min(2).max(30),
  issueSummary: z.string().trim().min(3).max(140),
  issueCategory: z.enum(ISSUE_CATEGORIES),
  serviceKeys: z.array(z.string().regex(/^[a-z0-9_]{2,40}$/)).max(10).default([]),
  lat: sriLankaLat,
  lng: sriLankaLng,
  address: z.string().trim().min(2).max(200),
  paymentMethod: z.enum(['card', 'cash']),
});

export const startJobBody = z.object({
  issueCategory: z.enum(ISSUE_CATEGORIES).optional(),
  note: z.string().trim().max(500, 'Keep the note under 500 characters').optional(),
});

export const billBody = z.object({
  serviceKeys: z.array(z.string().regex(/^[a-z0-9_]{2,40}$/)).min(1, 'Choose at least one service').max(10),
  parts: z
    .array(
      z.object({
        name: z.string().trim().min(2, 'Part name is too short').max(60),
        priceRs: z.number().int('Use whole rupees').min(1).max(200_000),
      }),
    )
    .max(20)
    .default([]),
  discountRs: z.number().int().min(0).max(1_000_000).default(0),
});

export const completeBody = z.object({ paidBy: z.enum(['card', 'cash']) });
export const cancelJobBody = z.object({ reason: z.string().trim().min(3, 'Tell us why').max(200) });
export const rateBody = z.object({ stars: z.number().int().min(1).max(5) });

export const PHOTO_KINDS = ['before', 'after'] as const;
export const photoKindParam = z.enum(PHOTO_KINDS, { error: 'Photo must be "before" or "after"' });
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
