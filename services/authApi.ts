// services/authApi.ts
//
// Phone + OTP auth and mechanic onboarding, backed by the Node.js API (backend/).
// Login and sign-up are ONE flow:
//   1. sendOtp(phone)          → server texts a 6-digit code
//   2. verifyOtp(phone, code)  → server creates the account if the number is new,
//                                returns tokens + "me" (status + onboarding progress)
// The app then routes with routeForMe(me).
import { File } from 'expo-file-system';
import { api, clearTokens, getRefreshToken, saveTokens } from './apiClient';

export { normaliseSriLankanMobile } from '../utils/validation';

export type AccountStatus = 'onboarding' | 'pending_review' | 'approved' | 'rejected' | 'suspended';
export type DocType = 'nic' | 'license' | 'certificate' | 'toolkit';
export type NextStep = 'details' | 'documents' | 'services' | 'submit' | null;

/** One verification document. null in `documents` = not uploaded yet. */
export interface DocState {
  status: 'uploaded' | 'approved' | 'rejected'; // uploaded = waiting for Ridzo to check it
  reason: string | null; // why Ridzo rejected it, e.g. "Photo is blurry"
  uploadedAt: string;
}

/** A service the mechanic offers. The price is set by Ridzo, not the mechanic. */
export interface MeService {
  key: string;
  category: string;
  name: string;
  durationLabel: string;
  priceRs: number;
}

export interface Me {
  user: {
    id: string;
    phone: string;
    role: string;
    status: AccountStatus;
    fullName: string | null;
    email: string | null;
    serviceArea: string | null;
    rejectionReason: string | null;
  };
  onboarding: {
    detailsComplete: boolean;
    documents: Record<DocType, DocState | null>;
    documentsToFix: DocType[]; // missing or rejected — must be (re)uploaded before submitting
    documentsComplete: boolean;
    servicesComplete: boolean;
    nextStep: NextStep;
  };
  services: MeService[];
  availability: { online: boolean; canGoOnline: boolean; lastSeenAt: string | null };
}

export interface Catalog {
  specialties: { category: string; label: string }[];
  services: MeService[]; // Ridzo's price list
  serviceAreas: string[];
}

export const RESEND_COOLDOWN_SECONDS = 30;
export const OTP_LENGTH = 6;

/** "771234567" → "77 123 4567" */
export const formatSriLankanMobile = (nineDigits: string) =>
  `${nineDigits.slice(0, 2)} ${nineDigits.slice(2, 5)} ${nineDigits.slice(5)}`;

// ─── Auth ───────────────────────────────────────────────────────────────────

export async function sendOtp(phone: string): Promise<{ resendInSeconds: number }> {
  return api('/auth/otp/send', { method: 'POST', body: { phone }, auth: false });
}

export async function verifyOtp(phone: string, code: string): Promise<{ isNewUser: boolean; me: Me }> {
  const res = await api<{ accessToken: string; refreshToken: string; isNewUser: boolean; me: Me }>(
    '/auth/otp/verify',
    { method: 'POST', body: { phone, code }, auth: false },
  );
  await saveTokens(res);
  return { isNewUser: res.isNewUser, me: res.me };
}

export async function logout(): Promise<void> {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    // A logged-out mechanic must not keep receiving jobs.
    await api('/mechanic/availability', { method: 'POST', body: { online: false } }).catch(() => {});
    await api('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }).catch(() => {});
  }
  await clearTokens();
}

export const getMe = () => api<Me>('/me');

// ─── Onboarding ─────────────────────────────────────────────────────────────

export const getCatalog = () => api<Catalog>('/catalog', { auth: false });

export const saveProfile = (body: { fullName: string; email: string; serviceArea: string }) =>
  api<Me>('/mechanic/profile', { method: 'PUT', body });

export function uploadDocument(docType: DocType, file: { uri: string; name: string; mimeType: string }) {
  // Expo SDK 58 replaces global fetch with expo/fetch, which does NOT accept React Native's old
  // `{ uri, name, type }` FormData parts. It accepts any part that has `bytes()`, and sends its
  // `name` and `type` as the filename and content-type — so we read the file via expo-file-system
  // and pass the mime type we already validated (instead of guessing it from the extension).
  const source = new File(file.uri);
  const part = { name: file.name, type: file.mimeType, size: source.size, bytes: () => source.bytes() };
  const form = new FormData();
  form.append('file', part as unknown as Blob);
  return api<Me>(`/mechanic/documents/${docType}`, { method: 'POST', form, timeoutMs: 60000 });
}

/** Which services the mechanic offers. Prices come from Ridzo's price list. */
/** New profile photo (JPG/PNG, max 2 MB). Same upload format as documents (see uploadDocument). */
export function uploadAvatar(file: { uri: string; name: string; mimeType: string }) {
  const source = new File(file.uri);
  const part = { name: file.name, type: file.mimeType, size: source.size, bytes: () => source.bytes() };
  const form = new FormData();
  form.append('file', part as unknown as Blob);
  return api<{ ok: true; me: Me }>('/mechanic/avatar', { method: 'POST', form, timeoutMs: 60000 });
}

export const saveServices = (serviceKeys: string[]) =>
  api<Me>('/mechanic/services', { method: 'PUT', body: { serviceKeys } });

export const submitForReview = () => api<Me>('/mechanic/submit', { method: 'POST' });

// ─── Availability ───────────────────────────────────────────────────────────

/** Go online / offline. The server refuses "online" unless Ridzo has approved the mechanic (403 not_approved). */
export const setAvailability = (online: boolean, location?: { lat: number; lng: number }) =>
  api<{ online: boolean; lastSeenAt: string }>('/mechanic/availability', {
    method: 'POST',
    body: { online, ...location },
  });

// ─── Routing ────────────────────────────────────────────────────────────────

const STEP_ROUTES: Record<Exclude<NextStep, null>, string> = {
  details: 'BasicDetails',
  documents: 'VerifyDocuments',
  services: 'SpecialtiesPricing',
  submit: 'SpecialtiesPricing',
};

/** The screen a signed-in mechanic should land on. */
export function routeForMe(me: Me): string {
  switch (me.user.status) {
    case 'approved':
      return 'HomeMechanic';
    case 'pending_review':
    case 'rejected':
    case 'suspended':
      return 'UnderReview';
    case 'onboarding':
      return STEP_ROUTES[me.onboarding.nextStep ?? 'details'];
  }
}
