// Everything the API needs from storage. Two implementations:
//   memoryRepo.ts   — in-process, no setup, wiped on restart (tests + quick local runs)
//   supabaseRepo.ts — real Postgres via Supabase
import type { DocType } from '../validation.js';
import type { CatalogService, PricingConfig } from '../catalog.js';

export type UserStatus = 'onboarding' | 'pending_review' | 'approved' | 'rejected' | 'suspended';

export interface User {
  id: string;
  phone: string; // E.164, e.g. +94771234567
  role: 'mechanic';
  status: UserStatus;
  fullName: string | null;
  email: string | null;
  serviceArea: string | null;
  rejectionReason: string | null; // also used as the suspension reason
  submittedAt: string | null;
  reviewedAt: string | null;
  isOnline: boolean;
  lastLat: number | null;
  lastLng: number | null;
  lastSeenAt: string | null;
  avatarPath: string | null;
  createdAt: string;
}

export interface OtpRecord {
  id: string;
  phone: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  consumedAt: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

/** uploaded = waiting for an admin; approved / rejected = an admin has checked it. */
export type DocStatus = 'uploaded' | 'approved' | 'rejected';

export interface MechanicDocument {
  userId: string;
  docType: DocType;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  status: DocStatus;
  rejectionReason: string | null;
  uploadedAt: string;
  reviewedAt: string | null;
}

export interface MechanicService {
  userId: string;
  serviceKey: string;
}

export interface Admin {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuditEntry {
  id: string;
  adminId: string;
  adminName?: string;
  action: string;
  targetUserId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface ReviewInput {
  userId: string;
  adminId: string;
  documents: { docType: DocType; status: 'approved' | 'rejected'; reason: string | null }[];
  status: 'approved' | 'rejected';
  rejectionReason: string | null;
}

export interface MechanicListFilter {
  status?: UserStatus;
  search?: string; // phone or name
  limit: number;
  offset: number;
}

export type UserPatch = Partial<Omit<User, 'id' | 'phone' | 'createdAt' | 'role'>>;

// ─── Jobs & dispatch ────────────────────────────────────────────────────────

export type JobStatus =
  | 'searching'
  | 'accepted'
  | 'arrived'
  | 'in_progress'
  | 'bill_sent'
  | 'completed'
  | 'no_mechanic'
  | 'cancelled';

/** Thrown by acceptJob when the mechanic already has an active job. */
export class MechanicBusyError extends Error {
  constructor() {
    super('mechanic already has an active job');
  }
}

export const ACTIVE_JOB_STATUSES: JobStatus[] = ['accepted', 'arrived', 'in_progress', 'bill_sent'];

export interface Job {
  id: string;
  status: JobStatus;
  customerName: string;
  customerPhone: string;
  vehicle: string;
  vehicleType: string;
  issueSummary: string;
  issueCategory: 'tyre' | 'battery' | 'engine' | 'lockout' | 'other';
  serviceKeys: string[];
  lat: number;
  lng: number;
  address: string;
  paymentMethod: 'card' | 'cash';
  estimateRs: number;
  mechanicId: string | null;
  distanceKm: number | null;
  travelRs: number | null;
  diagnosisNote: string | null;
  bill: Record<string, unknown> | null;
  totalRs: number | null;
  commissionRs: number | null;
  payoutRs: number | null;
  paidBy: 'card' | 'cash' | null;
  mechanicRating: number | null;
  customerRating: number | null;
  searchUntil: string;
  createdAt: string;
  acceptedAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  cancelledBy: 'customer' | 'admin' | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  etaS: number | null; // driving time quoted when accepted
}

export type NewJob = Pick<
  Job,
  | 'customerName'
  | 'customerPhone'
  | 'vehicle'
  | 'vehicleType'
  | 'issueSummary'
  | 'issueCategory'
  | 'serviceKeys'
  | 'lat'
  | 'lng'
  | 'address'
  | 'paymentMethod'
  | 'estimateRs'
  | 'searchUntil'
>;

export type JobPatch = Partial<
  Pick<
    Job,
    | 'status'
    | 'mechanicId'
    | 'diagnosisNote'
    | 'bill'
    | 'totalRs'
    | 'commissionRs'
    | 'payoutRs'
    | 'paidBy'
    | 'customerRating'
    | 'mechanicRating'
    | 'arrivedAt'
    | 'completedAt'
    | 'distanceKm'
    | 'travelRs'
    | 'acceptedAt'
    | 'searchUntil'
    | 'cancelledBy'
    | 'cancelReason'
    | 'cancelledAt'
    | 'etaS'
  >
>;

export type PhotoKind = 'before' | 'after';

export interface JobPhoto {
  jobId: string;
  kind: PhotoKind;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
}

export type AlertResolution = 'location_restored' | 'rematched' | 'cancelled' | 'job_moved_on' | 'dismissed';

export interface JobAlert {
  id: string;
  jobId: string;
  mechanicId: string;
  kind: 'tracking_lost';
  lastLocationAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolution: AlertResolution | null;
  resolvedBy: string | null;
}

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'withdrawn';

export interface JobOffer {
  id: string;
  jobId: string;
  mechanicId: string;
  status: OfferStatus;
  distanceKm: number;
  durationS: number | null;
  distanceSource: 'google' | 'estimate';
  travelRs: number;
  offeredAt: string;
  expiresAt: string;
  respondedAt: string | null;
}

export interface Candidate {
  mechanicId: string;
  roadKm: number;
  rating: number | null;
}

export interface CandidateQuery {
  job: Job;
  maxKm: number;
  roadFactor: number;
  seenAfter: string;
  limit: number;
}

export interface LocationPoint {
  jobId: string;
  mechanicId: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  speedMps: number | null;
  heading: number | null;
  source: 'foreground' | 'background';
  recordedAt: string;
}

export interface MechanicStats {
  todayEarningsRs: number;
  todayJobs: number;
  totalJobs: number;
  rating: number | null;
  ratingCount: number;
  offers: { accepted: number; declined: number; expired: number }; // last 30 days
}

export interface Repo {
  // users
  findUserByPhone(phone: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  createUser(phone: string): Promise<User>;
  updateUser(id: string, patch: UserPatch): Promise<User>;
  listMechanics(filter: MechanicListFilter): Promise<{ rows: User[]; total: number }>;
  countMechanicsByStatus(): Promise<Record<UserStatus, number>>;

  // otp
  insertOtp(rec: Omit<OtpRecord, 'id' | 'attempts' | 'consumedAt' | 'createdAt'>): Promise<OtpRecord>;
  latestOtp(phone: string): Promise<OtpRecord | null>;
  countOtpsSince(phone: string, sinceIso: string): Promise<number>;
  incrementOtpAttempts(id: string): Promise<void>;
  consumeOtp(id: string): Promise<void>;

  // sessions
  createSession(s: Omit<Session, 'id' | 'revokedAt' | 'createdAt'>): Promise<Session>;
  findSessionByHash(hash: string): Promise<Session | null>;
  revokeSession(id: string): Promise<void>;
  revokeAllSessions(userId: string): Promise<void>;

  // onboarding
  /** Saves a (re)uploaded document. Status goes back to "uploaded" and any old rejection is cleared. */
  upsertDocument(doc: Pick<MechanicDocument, 'userId' | 'docType' | 'storagePath' | 'mimeType' | 'sizeBytes'>): Promise<MechanicDocument>;
  listDocuments(userId: string): Promise<MechanicDocument[]>;
  replaceServices(userId: string, serviceKeys: string[]): Promise<void>;
  listServices(userId: string): Promise<MechanicService[]>;

  // review (admin) — atomic: documents + account status + audit log, only if still pending_review
  applyReview(input: ReviewInput): Promise<User | null>;

  // price list + pricing settings (admin-editable)
  listCatalog(): Promise<CatalogService[]>;
  updateCatalogService(key: string, patch: Partial<Pick<CatalogService, 'priceRs' | 'active' | 'name' | 'durationLabel'>>): Promise<CatalogService | null>;
  getPricing(): Promise<PricingConfig>;
  updatePricing(patch: Partial<Omit<PricingConfig, 'updatedAt'>>): Promise<PricingConfig>;

  // admins
  findAdminByEmail(email: string): Promise<Admin | null>;
  findAdminById(id: string): Promise<Admin | null>;
  createAdmin(a: Pick<Admin, 'email' | 'fullName' | 'passwordHash'>): Promise<Admin>;
  setAdminPassword(id: string, passwordHash: string): Promise<void>;
  touchAdminLogin(id: string): Promise<void>;

  // jobs & dispatch
  createJob(job: NewJob): Promise<Job>;
  findJob(id: string): Promise<Job | null>;
  /** Updates only if the job is currently in one of `fromStatuses` (null = not updated). */
  updateJob(id: string, fromStatuses: JobStatus[], patch: JobPatch): Promise<Job | null>;
  /** Atomic: first mechanic wins. Null if the job is no longer searching. Throws 'busy' if the mechanic already has a job. */
  acceptJob(jobId: string, mechanicId: string, distanceKm: number, travelRs: number): Promise<Job | null>;
  activeJobFor(mechanicId: string): Promise<Job | null>;
  listSearchingJobs(limit: number): Promise<Job[]>;
  findCandidates(q: CandidateQuery): Promise<Candidate[]>;
  /** Null if the job already has a pending offer, or the mechanic already has one / was already asked. */
  createOffer(
    o: Pick<JobOffer, 'jobId' | 'mechanicId' | 'distanceKm' | 'durationS' | 'distanceSource' | 'travelRs' | 'expiresAt'>,
  ): Promise<JobOffer | null>;
  findOffer(jobId: string, mechanicId: string): Promise<JobOffer | null>;
  hasPendingOffer(jobId: string): Promise<boolean>;
  /** Updates only if the offer is in one of `fromStatuses`. */
  updateOffer(id: string, fromStatuses: OfferStatus[], status: OfferStatus): Promise<JobOffer | null>;
  /** Marks every pending offer past its deadline as expired and returns them. */
  expireOffers(nowIso: string): Promise<JobOffer[]>;
  withdrawPendingOffers(jobId: string): Promise<void>;
  /** The mechanic's pending offer, else their most recent timed-out offer for a job that is still searching. */
  currentOfferFor(mechanicId: string): Promise<JobOffer | null>;
  markStaleMechanicsOffline(seenBeforeIso: string): Promise<number>;
  /** Route recording while on a job. */
  addLocationPoint(p: LocationPoint): Promise<void>;
  listLocationPoints(jobId: string, limit: number): Promise<LocationPoint[]>;
  /** Jobs in one of these states (small set — active jobs only). */
  listJobsByStatus(statuses: JobStatus[], limit: number): Promise<Job[]>;
  /** Null if an open alert of that kind already exists for the job. */
  openAlert(a: Pick<JobAlert, 'jobId' | 'mechanicId' | 'kind' | 'lastLocationAt'>): Promise<JobAlert | null>;
  listOpenAlerts(): Promise<JobAlert[]>;
  findOpenAlert(jobId: string): Promise<JobAlert | null>;
  findAlert(id: string): Promise<JobAlert | null>;
  /** Closes the open alert(s) of a job. Returns how many were closed. */
  resolveAlerts(jobId: string, resolution: AlertResolution, adminId?: string): Promise<number>;

  // job photos
  /** Saves (or replaces) a job photo. Returns the previous storage path, if any, so it can be deleted. */
  upsertJobPhoto(p: Omit<JobPhoto, 'uploadedAt'>): Promise<{ photo: JobPhoto; replacedPath: string | null }>;
  listJobPhotos(jobId: string): Promise<JobPhoto[]>;
  mechanicStats(mechanicId: string, dayStartIso: string, offersSinceIso: string): Promise<MechanicStats>;

  // audit log
  insertAudit(e: Omit<AuditEntry, 'id' | 'createdAt' | 'adminName'>): Promise<void>;
  listAudit(filter: { targetUserId?: string; limit: number }): Promise<AuditEntry[]>;
}

export interface FileStore {
  /** Saves a private file and returns its storage path. */
  put(path: string, data: Buffer, contentType: string): Promise<string>;
  /** Reads a private file (admins viewing documents). Null if missing. */
  get(path: string): Promise<Buffer | null>;
  remove(path: string): Promise<void>;
}
