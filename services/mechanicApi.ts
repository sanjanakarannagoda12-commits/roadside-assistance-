// services/mechanicApi.ts
//
// Jobs, dispatch, dashboard and location — real API calls (backend/src/routes/jobs.ts).
// Earnings and card-payment status are still mocked until payments are built.

import { File } from 'expo-file-system';
import { getMe } from './authApi';
import { api } from './apiClient';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Dashboard ──────────────────────────────────────────────────────────────

export interface MechanicDashboardSummary {
  todayEarningsRs: number;
  todayJobs: number;
  totalJobs: number;
  rating: number | null; // null until a customer rates you
  ratingCount: number;
  specialty: string;
  acceptanceRate: number | null; // 0–1 over the last 30 days
}

// GET /mechanic/dashboard
export const getDashboardSummary = () => api<MechanicDashboardSummary>('/mechanic/dashboard');

// ─── Online status & location ───────────────────────────────────────────────

// POST /mechanic/online — the server refuses unless approved; needs a location.
export const goOnline = (pos: { lat: number; lng: number }) =>
  api<{ online: boolean }>('/mechanic/online', { method: 'POST', body: pos });

// POST /mechanic/offline — also hands any job being offered to you to the next mechanic.
export const goOffline = () => api<{ online: boolean }>('/mechanic/offline', { method: 'POST' });

export interface LocationFix {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  speedMps?: number | null;
  heading?: number | null;
  recordedAt?: string; // when the phone took the reading
  source?: 'foreground' | 'background';
}

// POST /mechanic/location — every ~15 s while online (also the heartbeat), from the app or the background task.
export const sendLocation = (fix: LocationFix) =>
  api<{ online: boolean; accepted: boolean; onJob: boolean }>('/mechanic/location', { method: 'POST', body: fix });

// ─── Services the mechanic offers (Ridzo's prices) ─────────────────────────

export type IssueCategory = 'tyre' | 'battery' | 'engine' | 'lockout' | 'other';

export interface MechanicService {
  id: string;
  name: string;
  category: IssueCategory;
  durationLabel: string; // e.g. "10–20 mins"
  priceRs: number; // set by Ridzo admins, same for every mechanic
}

// The services the mechanic ticked, with Ridzo's current prices (GET /me).
export async function getMyServices(): Promise<MechanicService[]> {
  const me = await getMe();
  return me.services.map((s) => ({
    id: s.key,
    name: s.name,
    category: s.category as IssueCategory,
    durationLabel: s.durationLabel,
    priceRs: s.priceRs,
  }));
}

// ─── Job offers ─────────────────────────────────────────────────────────────

export type PaymentMethod = 'card' | 'cash';

export interface JobRequest {
  id: string; // job id
  customerName: string;
  customerPhone: string; // empty until you accept
  vehicle: string;
  vehicleType: string;
  issueSummary: string;
  issueCategory: IssueCategory;
  distanceKm: number;
  etaMin: number;
  estimateRs: number; // Ridzo's price for the likely service
  travelRs: number; // travel charge, locked when you accept
  paymentMethod: PaymentMethod;
  location: { lat: number; lng: number; address: string };
  status?: string; // job status once accepted
  photos?: { before: boolean; after: boolean }; // already uploaded for this job
  distanceSource?: 'google' | 'estimate'; // google = real road distance + traffic ETA
  /** Offers only: pending = within the 30 s; missed = time ran out but you can still accept. */
  offerState?: 'pending' | 'missed';
  secondsLeft?: number;
}

/** How long the mechanic has to answer before the job is also offered to the next mechanic. */
export const REQUEST_TIMEOUT_SECONDS = 30;

type OfferDto = Omit<JobRequest, 'id' | 'customerPhone' | 'offerState'> & { jobId: string; state: 'pending' | 'missed' };
type JobDto = Omit<JobRequest, 'offerState' | 'secondsLeft'> & { status: string };

const fromOffer = (o: OfferDto): JobRequest => ({ ...o, id: o.jobId, customerPhone: '', offerState: o.state });

// GET /mechanic/offers/current — polled while online (push notifications will replace this).
export async function getCurrentOffer(): Promise<JobRequest | null> {
  const { offer } = await api<{ offer: OfferDto | null }>('/mechanic/offers/current');
  return offer ? fromOffer(offer) : null;
}

export type OfferState = 'pending' | 'missed' | 'accepted' | 'declined' | 'taken' | 'closed';

// GET /jobs/:id/offer — is this offer still open?
export const getOfferState = (jobId: string) => api<{ state: OfferState }>(`/jobs/${jobId}/offer`);

// POST /jobs/:id/accept — first mechanic wins (409 job_taken otherwise). Works after the 30 s too.
export async function acceptRequest(jobId: string): Promise<JobRequest> {
  const { job } = await api<{ job: JobDto }>(`/jobs/${jobId}/accept`, { method: 'POST' });
  return job;
}

// POST /jobs/:id/decline
export async function declineRequest(jobId: string): Promise<void> {
  await api(`/jobs/${jobId}/decline`, { method: 'POST' });
}

// GET /mechanic/active-job — resume after the app was closed.
export async function getActiveJob(): Promise<JobRequest | null> {
  const { job } = await api<{ job: JobDto | null }>('/mechanic/active-job');
  return job;
}

/** Which screen to reopen for a job that was in progress when the app closed. */
export const RESUME_ROUTE: Record<string, string> = {
  accepted: 'NavigateToCustomer',
  arrived: 'Diagnose',
  in_progress: 'SelectServices',
  bill_sent: 'SelectServices', // the bill can be re-sent
};

// GET /jobs/:id/mine — is this job still mine? (the customer may cancel, or be re-matched if I went dark)
export const getJobOwnership = (jobId: string) =>
  api<{ state: 'yours' | 'completed' | 'cancelled' | 'reassigned'; status: string; message: string | null }>(
    `/jobs/${jobId}/mine`,
  );

// ─── Job steps ──────────────────────────────────────────────────────────────

// POST /jobs/:id/cancel — the job goes to another mechanic.
export async function cancelJob(jobId: string, reason = 'Mechanic cancelled'): Promise<void> {
  await api(`/jobs/${jobId}/cancel`, { method: 'POST', body: { reason } });
}

// POST /jobs/:id/arrived
export async function markArrived(jobId: string): Promise<void> {
  await api(`/jobs/${jobId}/arrived`, { method: 'POST' });
}

// POST /jobs/:id/photos/:kind — stored privately; the before photo is required to start the job.
// Same upload format as documents (expo/fetch needs a part with bytes(), see authApi.uploadDocument).
export async function uploadJobPhoto(jobId: string, kind: 'before' | 'after', uri: string, mimeType = 'image/jpeg') {
  const source = new File(uri);
  const type = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
  const part = { name: `${kind}.${type === 'image/png' ? 'png' : 'jpg'}`, type, size: source.size, bytes: () => source.bytes() };
  const form = new FormData();
  form.append('file', part as unknown as Blob);
  await api(`/jobs/${jobId}/photos/${kind}`, { method: 'POST', form, timeoutMs: 60000 });
}

// POST /jobs/:id/start — the before photo must already be uploaded (uploadJobPhoto).
export async function startJob(
  jobId: string,
  payload: { issue: IssueCategory | null; note: string; beforePhotoUri: string | null },
): Promise<void> {
  await api(`/jobs/${jobId}/start`, {
    method: 'POST',
    body: { ...(payload.issue ? { issueCategory: payload.issue } : {}), ...(payload.note ? { note: payload.note } : {}) },
  });
}

// ─── Billing & payment ─────────────────────────────────────────────────────

export interface BillLine {
  label: string;
  amountRs: number;
}

export interface Bill {
  services: BillLine[];
  parts: BillLine[];
  travelRs: number;
  subtotalRs: number;
  discountRs: number;
  totalRs: number;
  commissionRate: number;
  commissionRs: number;
  payoutRs: number;
}

/**
 * Ridzo's cut. Display only — the server recalculates every bill with the admin's current settings
 * (backend/src/services/pricing.ts), so these must match its defaults.
 */
export const RIDZO_COMMISSION_RATE = 0.1;

/**
 * Same rules as the server:
 * - the travel charge can't be discounted and goes 100% to the mechanic (no commission on it)
 * - commission is taken on services + parts − discount
 */
export function computeBill(services: BillLine[], parts: BillLine[], discountRs: number, travelRs = 0): Bill {
  const workRs = [...services, ...parts].reduce((sum, l) => sum + l.amountRs, 0);
  const safeDiscount = Math.min(Math.max(discountRs, 0), workRs);
  const subtotalRs = workRs + travelRs;
  const totalRs = subtotalRs - safeDiscount;
  const commissionRs = Math.round((workRs - safeDiscount) * RIDZO_COMMISSION_RATE);
  return {
    services,
    parts,
    travelRs,
    subtotalRs,
    discountRs: safeDiscount,
    totalRs,
    commissionRate: RIDZO_COMMISSION_RATE,
    commissionRs,
    payoutRs: totalRs - commissionRs,
  };
}

// POST /jobs/:id/bill — the server recalculates every amount from Ridzo's prices.
export async function sendBill(
  jobId: string,
  input: { serviceKeys: string[]; parts: { name: string; priceRs: number }[]; discountRs: number },
): Promise<Bill> {
  const { bill } = await api<{ bill: Bill }>(`/jobs/${jobId}/bill`, { method: 'POST', body: input });
  return bill;
}

export type PaymentStatus = 'pending' | 'paid';

// Mock-only until the payment gateway exists: card payments "arrive" 8 s after the bill is sent.
const billSentAt: Record<string, number> = {};
export function markBillSent(jobId: string) {
  billSentAt[jobId] = Date.now();
}

// TODO(payments): GET /jobs/:id/payment-status, set by the gateway webhook.
export async function getPaymentStatus(jobId: string, method: PaymentMethod): Promise<PaymentStatus> {
  await delay(200);
  if (method === 'cash') return 'pending'; // cash is only ever confirmed by the mechanic
  const sent = billSentAt[jobId] ?? Date.now();
  return Date.now() - sent > 8000 ? 'paid' : 'pending';
}

// POST /jobs/:id/complete
export async function completeJob(jobId: string, paidBy: PaymentMethod): Promise<void> {
  await api(`/jobs/${jobId}/complete`, { method: 'POST', body: { paidBy } });
}

export const confirmCashPayment = (jobId: string) => completeJob(jobId, 'cash');

// POST /jobs/:id/rate-customer
export async function rateCustomer(jobId: string, stars: number): Promise<void> {
  await api(`/jobs/${jobId}/rate-customer`, { method: 'POST', body: { stars } });
}

// ─── Earnings ───────────────────────────────────────────────────────────────

export interface EarningsJob {
  id: string;
  title: string; // e.g. "Tyre change"
  area: string; // e.g. "Kandy"
  dateLabel: string; // e.g. "Today, 10:42"
  payoutRs: number;
  paymentMethod: PaymentMethod;
}

export interface EarningsSummary {
  weekPayoutRs: number;
  weekJobs: number;
  todayPayoutRs: number;
  pendingPayoutRs: number; // card payments not yet paid out to the mechanic
  recentJobs: EarningsJob[];
}

// GET /mechanic/:mechanicId/earnings?range=week
export async function getEarnings(): Promise<EarningsSummary> {
  await delay(500);
  return {
    weekPayoutRs: 28600,
    weekJobs: 14,
    todayPayoutRs: 4250,
    pendingPayoutRs: 9800,
    recentJobs: [
      { id: 'j1', title: 'Tyre change', area: 'Kandy', dateLabel: 'Today, 10:42', payoutRs: 4000, paymentMethod: 'card' },
      { id: 'j2', title: 'Battery jump', area: 'Peradeniya', dateLabel: 'Today, 08:15', payoutRs: 900, paymentMethod: 'cash' },
      { id: 'j3', title: 'Locksmith', area: 'Kandy', dateLabel: 'Yesterday', payoutRs: 15000, paymentMethod: 'card' },
      { id: 'j4', title: 'Puncture repair', area: 'Katugastota', dateLabel: 'Mon', payoutRs: 2500, paymentMethod: 'cash' },
      { id: 'j5', title: 'Engine diagnosis', area: 'Kandy', dateLabel: 'Sun', payoutRs: 6200, paymentMethod: 'card' },
    ],
  };
}

export const formatRs = (n: number) => `Rs ${Math.round(n).toLocaleString('en-US')}`;
