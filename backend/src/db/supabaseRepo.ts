// Supabase (Postgres) storage. Uses the service-role key, so it must only ever run on the server.
// Tables are created by supabase/migrations/001_init.sql and 002_admin_pricing.sql.
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { CatalogService, PricingConfig } from '../catalog.js';
import {
  ACTIVE_JOB_STATUSES,
  MechanicBusyError,
  type Admin,
  type AuditEntry,
  type FileStore,
  type Job,
  type JobOffer,
  type LocationPoint,
  type JobAlert,
  type JobPhoto,
  type MechanicDocument,
  type OtpRecord,
  type Repo,
  type Session,
  type User,
  type UserStatus,
} from './types.js';
import type { DocType } from '../validation.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
const toUser = (r: any): User => ({
  id: r.id,
  phone: r.phone,
  role: r.role,
  status: r.status,
  fullName: r.full_name,
  email: r.email,
  serviceArea: r.service_area,
  rejectionReason: r.rejection_reason,
  submittedAt: r.submitted_at,
  reviewedAt: r.reviewed_at ?? null,
  isOnline: Boolean(r.is_online),
  lastLat: r.last_lat ?? null,
  lastLng: r.last_lng ?? null,
  lastSeenAt: r.last_seen_at ?? null,
  avatarPath: r.avatar_path ?? null,
  createdAt: r.created_at,
});

const USER_COLUMNS: Record<string, string> = {
  status: 'status',
  fullName: 'full_name',
  email: 'email',
  serviceArea: 'service_area',
  rejectionReason: 'rejection_reason',
  submittedAt: 'submitted_at',
  reviewedAt: 'reviewed_at',
  isOnline: 'is_online',
  lastLat: 'last_lat',
  lastLng: 'last_lng',
  lastSeenAt: 'last_seen_at',
  avatarPath: 'avatar_path',
};

const toJob = (r: any): Job => ({
  id: r.id,
  status: r.status,
  customerName: r.customer_name,
  customerPhone: r.customer_phone,
  vehicle: r.vehicle,
  vehicleType: r.vehicle_type,
  issueSummary: r.issue_summary,
  issueCategory: r.issue_category,
  serviceKeys: r.service_keys ?? [],
  lat: Number(r.lat),
  lng: Number(r.lng),
  address: r.address,
  paymentMethod: r.payment_method,
  estimateRs: r.estimate_rs,
  mechanicId: r.mechanic_id,
  distanceKm: r.distance_km === null ? null : Number(r.distance_km),
  travelRs: r.travel_rs,
  diagnosisNote: r.diagnosis_note,
  bill: r.bill,
  totalRs: r.total_rs,
  commissionRs: r.commission_rs,
  payoutRs: r.payout_rs,
  paidBy: r.paid_by,
  mechanicRating: r.mechanic_rating,
  customerRating: r.customer_rating,
  searchUntil: r.search_until,
  createdAt: r.created_at,
  acceptedAt: r.accepted_at,
  arrivedAt: r.arrived_at,
  completedAt: r.completed_at,
  cancelledBy: r.cancelled_by ?? null,
  cancelReason: r.cancel_reason ?? null,
  cancelledAt: r.cancelled_at ?? null,
  etaS: r.eta_s ?? null,
});

const toPhoto = (r: any): JobPhoto => ({
  jobId: r.job_id,
  kind: r.kind,
  storagePath: r.storage_path,
  mimeType: r.mime_type,
  sizeBytes: r.size_bytes,
  uploadedBy: r.uploaded_by,
  uploadedAt: r.uploaded_at,
});

const toAlert = (r: any): JobAlert => ({
  id: r.id,
  jobId: r.job_id,
  mechanicId: r.mechanic_id,
  kind: r.kind,
  lastLocationAt: r.last_location_at,
  createdAt: r.created_at,
  resolvedAt: r.resolved_at,
  resolution: r.resolution,
  resolvedBy: r.resolved_by,
});

const JOB_COLUMNS: Record<string, string> = {
  status: 'status',
  mechanicId: 'mechanic_id',
  diagnosisNote: 'diagnosis_note',
  bill: 'bill',
  totalRs: 'total_rs',
  commissionRs: 'commission_rs',
  payoutRs: 'payout_rs',
  paidBy: 'paid_by',
  customerRating: 'customer_rating',
  mechanicRating: 'mechanic_rating',
  arrivedAt: 'arrived_at',
  completedAt: 'completed_at',
  distanceKm: 'distance_km',
  travelRs: 'travel_rs',
  acceptedAt: 'accepted_at',
  searchUntil: 'search_until',
  cancelledBy: 'cancelled_by',
  cancelReason: 'cancel_reason',
  cancelledAt: 'cancelled_at',
  etaS: 'eta_s',
};

const toOffer = (r: any): JobOffer => ({
  id: r.id,
  jobId: r.job_id,
  mechanicId: r.mechanic_id,
  status: r.status,
  distanceKm: Number(r.distance_km),
  durationS: r.duration_s ?? null,
  distanceSource: r.distance_source ?? 'estimate',
  travelRs: r.travel_rs,
  offeredAt: r.offered_at,
  expiresAt: r.expires_at,
  respondedAt: r.responded_at,
});

/** Postgres unique_violation — used to detect "someone else got there first". */
const isUniqueViolation = (error: any) => error?.code === '23505';

const toOtp = (r: any): OtpRecord => ({
  id: r.id,
  phone: r.phone,
  codeHash: r.code_hash,
  expiresAt: r.expires_at,
  attempts: r.attempts,
  consumedAt: r.consumed_at,
  createdAt: r.created_at,
});

const toSession = (r: any): Session => ({
  id: r.id,
  userId: r.user_id,
  refreshTokenHash: r.refresh_token_hash,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
  createdAt: r.created_at,
});

const toDoc = (r: any): MechanicDocument => ({
  userId: r.user_id,
  docType: r.doc_type as DocType,
  storagePath: r.storage_path,
  mimeType: r.mime_type,
  sizeBytes: r.size_bytes,
  status: r.status,
  rejectionReason: r.rejection_reason ?? null,
  uploadedAt: r.uploaded_at,
  reviewedAt: r.reviewed_at ?? null,
});

const toCatalog = (r: any): CatalogService => ({
  key: r.key,
  category: r.category,
  name: r.name,
  durationLabel: r.duration_label,
  priceRs: r.price_rs,
  active: r.active,
  sortOrder: r.sort_order,
});

const toPricing = (r: any): PricingConfig => ({
  travelBaseRs: r.travel_base_rs,
  travelBaseKm: Number(r.travel_base_km),
  travelPerKmRs: r.travel_per_km_rs,
  travelCapRs: r.travel_cap_rs,
  nightMultiplier: Number(r.night_multiplier),
  nightStartHour: r.night_start_hour,
  nightEndHour: r.night_end_hour,
  roadFactor: Number(r.road_factor),
  maxRadiusKm: Number(r.max_radius_km),
  commissionRate: Number(r.commission_rate),
  commissionOnTravel: r.commission_on_travel,
  updatedAt: r.updated_at,
});

const PRICING_COLUMNS: Record<string, string> = {
  travelBaseRs: 'travel_base_rs',
  travelBaseKm: 'travel_base_km',
  travelPerKmRs: 'travel_per_km_rs',
  travelCapRs: 'travel_cap_rs',
  nightMultiplier: 'night_multiplier',
  nightStartHour: 'night_start_hour',
  nightEndHour: 'night_end_hour',
  roadFactor: 'road_factor',
  maxRadiusKm: 'max_radius_km',
  commissionRate: 'commission_rate',
  commissionOnTravel: 'commission_on_travel',
};

const toAdmin = (r: any): Admin => ({
  id: r.id,
  email: r.email,
  fullName: r.full_name,
  passwordHash: r.password_hash,
  createdAt: r.created_at,
  lastLoginAt: r.last_login_at,
});

const mapPatch = (patch: Record<string, unknown>, columns: Record<string, string>) => {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && columns[k]) row[columns[k]] = v;
  return row;
};

function check<T>(res: { data: T; error: any }, what: string): T {
  if (res.error) throw new Error(`Supabase ${what} failed: ${res.error.message}`);
  return res.data;
}

export function createSupabaseClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function createSupabaseRepo(db: SupabaseClient): Repo {
  return {
    async findUserByPhone(phone) {
      const data = check(await db.from('users').select('*').eq('phone', phone).maybeSingle(), 'findUserByPhone');
      return data ? toUser(data) : null;
    },
    async findUserById(id) {
      const data = check(await db.from('users').select('*').eq('id', id).maybeSingle(), 'findUserById');
      return data ? toUser(data) : null;
    },
    async createUser(phone) {
      return toUser(check(await db.from('users').insert({ phone }).select('*').single(), 'createUser'));
    },
    async updateUser(id, patch) {
      const row = mapPatch(patch, USER_COLUMNS);
      return toUser(check(await db.from('users').update(row).eq('id', id).select('*').single(), 'updateUser'));
    },
    async listMechanics({ status, search, limit, offset }) {
      let q = db.from('users').select('*', { count: 'exact' }).eq('role', 'mechanic');
      if (status) q = q.eq('status', status);
      // Search text is already limited to letters, digits, spaces and + . ' - by validation,
      // so it can't break out of the PostgREST filter syntax.
      if (search) q = q.or(`phone.ilike.*${search}*,full_name.ilike.*${search}*`);
      const res = await q
        .order('submitted_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1);
      if (res.error) throw new Error(`Supabase listMechanics failed: ${res.error.message}`);
      return { rows: (res.data ?? []).map(toUser), total: res.count ?? 0 };
    },
    async countMechanicsByStatus() {
      const statuses: UserStatus[] = ['onboarding', 'pending_review', 'approved', 'rejected', 'suspended'];
      const counts = await Promise.all(
        statuses.map(async (s) => {
          const res = await db.from('users').select('id', { count: 'exact', head: true }).eq('role', 'mechanic').eq('status', s);
          if (res.error) throw new Error(`Supabase countMechanicsByStatus failed: ${res.error.message}`);
          return [s, res.count ?? 0] as const;
        }),
      );
      return Object.fromEntries(counts) as Record<UserStatus, number>;
    },

    async insertOtp(rec) {
      const data = check(
        await db
          .from('otp_codes')
          .insert({ phone: rec.phone, code_hash: rec.codeHash, expires_at: rec.expiresAt })
          .select('*')
          .single(),
        'insertOtp',
      );
      return toOtp(data);
    },
    async latestOtp(phone) {
      const data = check(
        await db
          .from('otp_codes')
          .select('*')
          .eq('phone', phone)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        'latestOtp',
      );
      return data ? toOtp(data) : null;
    },
    async countOtpsSince(phone, sinceIso) {
      const res = await db
        .from('otp_codes')
        .select('id', { count: 'exact', head: true })
        .eq('phone', phone)
        .gte('created_at', sinceIso);
      if (res.error) throw new Error(`Supabase countOtpsSince failed: ${res.error.message}`);
      return res.count ?? 0;
    },
    async incrementOtpAttempts(id) {
      check(await db.rpc('increment_otp_attempts', { otp_id: id }), 'incrementOtpAttempts');
    },
    async consumeOtp(id) {
      check(await db.from('otp_codes').update({ consumed_at: new Date().toISOString() }).eq('id', id), 'consumeOtp');
    },

    async createSession(s) {
      const data = check(
        await db
          .from('sessions')
          .insert({ user_id: s.userId, refresh_token_hash: s.refreshTokenHash, expires_at: s.expiresAt })
          .select('*')
          .single(),
        'createSession',
      );
      return toSession(data);
    },
    async findSessionByHash(hash) {
      const data = check(
        await db.from('sessions').select('*').eq('refresh_token_hash', hash).maybeSingle(),
        'findSessionByHash',
      );
      return data ? toSession(data) : null;
    },
    async revokeSession(id) {
      check(
        await db.from('sessions').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('revoked_at', null),
        'revokeSession',
      );
    },
    async revokeAllSessions(userId) {
      check(
        await db
          .from('sessions')
          .update({ revoked_at: new Date().toISOString() })
          .eq('user_id', userId)
          .is('revoked_at', null),
        'revokeAllSessions',
      );
    },

    async upsertDocument(doc) {
      const data = check(
        await db
          .from('mechanic_documents')
          .upsert(
            {
              user_id: doc.userId,
              doc_type: doc.docType,
              storage_path: doc.storagePath,
              mime_type: doc.mimeType,
              size_bytes: doc.sizeBytes,
              status: 'uploaded',
              rejection_reason: null,
              reviewed_at: null,
              uploaded_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,doc_type' },
          )
          .select('*')
          .single(),
        'upsertDocument',
      );
      return toDoc(data);
    },
    async listDocuments(userId) {
      const data = check(await db.from('mechanic_documents').select('*').eq('user_id', userId), 'listDocuments');
      return (data ?? []).map(toDoc);
    },
    async replaceServices(userId, keys) {
      check(await db.rpc('replace_mechanic_services', { p_user_id: userId, p_service_keys: keys }), 'replaceServices');
    },
    async listServices(userId) {
      const data = check(await db.from('mechanic_services').select('*').eq('user_id', userId), 'listServices');
      return (data ?? []).map((r: any) => ({ userId: r.user_id, serviceKey: r.service_key }));
    },

    async applyReview({ userId, adminId, documents, status, rejectionReason }) {
      const data = check(
        await db.rpc('admin_review_mechanic', {
          p_user_id: userId,
          p_admin_id: adminId,
          p_documents: documents.map((d) => ({ doc_type: d.docType, status: d.status, reason: d.reason })),
          p_status: status,
          p_reason: rejectionReason,
        }),
        'applyReview',
      ) as any[];
      return data?.length ? toUser(data[0]) : null;
    },

    async listCatalog() {
      const data = check(await db.from('service_catalog').select('*').order('sort_order'), 'listCatalog');
      return (data ?? []).map(toCatalog);
    },
    async updateCatalogService(key, patch) {
      const row = mapPatch(patch, { priceRs: 'price_rs', active: 'active', name: 'name', durationLabel: 'duration_label' });
      const data = check(
        await db.from('service_catalog').update(row).eq('key', key).select('*').maybeSingle(),
        'updateCatalogService',
      );
      return data ? toCatalog(data) : null;
    },
    async getPricing() {
      return toPricing(check(await db.from('pricing_config').select('*').eq('id', 1).single(), 'getPricing'));
    },
    async updatePricing(patch) {
      const row = mapPatch(patch, PRICING_COLUMNS);
      return toPricing(check(await db.from('pricing_config').update(row).eq('id', 1).select('*').single(), 'updatePricing'));
    },

    async findAdminByEmail(email) {
      const data = check(
        await db.from('admins').select('*').eq('email', email.toLowerCase()).maybeSingle(),
        'findAdminByEmail',
      );
      return data ? toAdmin(data) : null;
    },
    async findAdminById(id) {
      const data = check(await db.from('admins').select('*').eq('id', id).maybeSingle(), 'findAdminById');
      return data ? toAdmin(data) : null;
    },
    async createAdmin(a) {
      const data = check(
        await db
          .from('admins')
          .insert({ email: a.email.toLowerCase(), full_name: a.fullName, password_hash: a.passwordHash })
          .select('*')
          .single(),
        'createAdmin',
      );
      return toAdmin(data);
    },
    async setAdminPassword(id, passwordHash) {
      check(await db.from('admins').update({ password_hash: passwordHash }).eq('id', id), 'setAdminPassword');
    },
    async touchAdminLogin(id) {
      check(await db.from('admins').update({ last_login_at: new Date().toISOString() }).eq('id', id), 'touchAdminLogin');
    },

    async createJob(j) {
      const data = check(
        await db
          .from('jobs')
          .insert({
            customer_name: j.customerName,
            customer_phone: j.customerPhone,
            vehicle: j.vehicle,
            vehicle_type: j.vehicleType,
            issue_summary: j.issueSummary,
            issue_category: j.issueCategory,
            service_keys: j.serviceKeys,
            lat: j.lat,
            lng: j.lng,
            address: j.address,
            payment_method: j.paymentMethod,
            estimate_rs: j.estimateRs,
            search_until: j.searchUntil,
          })
          .select('*')
          .single(),
        'createJob',
      );
      return toJob(data);
    },
    async findJob(id) {
      const data = check(await db.from('jobs').select('*').eq('id', id).maybeSingle(), 'findJob');
      return data ? toJob(data) : null;
    },
    async updateJob(id, fromStatuses, patch) {
      const res = await db.from('jobs').update(mapPatch(patch, JOB_COLUMNS)).eq('id', id).in('status', fromStatuses).select('*').maybeSingle();
      if (isUniqueViolation(res.error)) throw new MechanicBusyError();
      const data = check(res, 'updateJob');
      return data ? toJob(data) : null;
    },
    async acceptJob(jobId, mechanicId, distanceKm, travelRs) {
      const res = await db.rpc('accept_job', {
        p_job_id: jobId,
        p_mechanic_id: mechanicId,
        p_distance_km: distanceKm,
        p_travel_rs: travelRs,
      });
      if (isUniqueViolation(res.error)) throw new MechanicBusyError();
      const data = check(res, 'acceptJob') as any[];
      return data?.length ? toJob(data[0]) : null;
    },
    async activeJobFor(mechanicId) {
      const data = check(
        await db.from('jobs').select('*').eq('mechanic_id', mechanicId).in('status', ACTIVE_JOB_STATUSES).maybeSingle(),
        'activeJobFor',
      );
      return data ? toJob(data) : null;
    },
    async listSearchingJobs(limit) {
      const data = check(
        await db.from('jobs').select('*').eq('status', 'searching').order('created_at').limit(limit),
        'listSearchingJobs',
      );
      return (data ?? []).map(toJob);
    },
    async findCandidates({ job, maxKm, roadFactor, seenAfter, limit }) {
      const data = check(
        await db.rpc('dispatch_candidates', {
          p_job_id: job.id,
          p_lat: job.lat,
          p_lng: job.lng,
          p_max_km: maxKm,
          p_road_factor: roadFactor,
          p_category: job.issueCategory,
          p_service_keys: job.serviceKeys,
          p_seen_after: seenAfter,
          p_limit: limit,
        }),
        'findCandidates',
      ) as any[];
      return (data ?? []).map((r) => ({
        mechanicId: r.mechanic_id,
        roadKm: Number(r.road_km),
        rating: r.rating === null ? null : Number(r.rating),
      }));
    },
    async createOffer(o) {
      const res = await db
        .from('job_offers')
        .insert({
          job_id: o.jobId,
          mechanic_id: o.mechanicId,
          distance_km: o.distanceKm,
          duration_s: o.durationS,
          distance_source: o.distanceSource,
          travel_rs: o.travelRs,
          expires_at: o.expiresAt,
        })
        .select('*')
        .single();
      if (isUniqueViolation(res.error)) return null; // another offer won the race
      return toOffer(check(res, 'createOffer'));
    },
    async findOffer(jobId, mechanicId) {
      const data = check(
        await db.from('job_offers').select('*').eq('job_id', jobId).eq('mechanic_id', mechanicId).maybeSingle(),
        'findOffer',
      );
      return data ? toOffer(data) : null;
    },
    async hasPendingOffer(jobId) {
      const res = await db.from('job_offers').select('id', { count: 'exact', head: true }).eq('job_id', jobId).eq('status', 'pending');
      if (res.error) throw new Error(`Supabase hasPendingOffer failed: ${res.error.message}`);
      return (res.count ?? 0) > 0;
    },
    async updateOffer(id, fromStatuses, status) {
      const data = check(
        await db
          .from('job_offers')
          .update({ status, responded_at: new Date().toISOString() })
          .eq('id', id)
          .in('status', fromStatuses)
          .select('*')
          .maybeSingle(),
        'updateOffer',
      );
      return data ? toOffer(data) : null;
    },
    async expireOffers(nowIso) {
      const data = check(
        await db
          .from('job_offers')
          .update({ status: 'expired', responded_at: nowIso })
          .eq('status', 'pending')
          .lt('expires_at', nowIso)
          .select('*'),
        'expireOffers',
      );
      return (data ?? []).map(toOffer);
    },
    async withdrawPendingOffers(jobId) {
      check(
        await db
          .from('job_offers')
          .update({ status: 'withdrawn', responded_at: new Date().toISOString() })
          .eq('job_id', jobId)
          .eq('status', 'pending'),
        'withdrawPendingOffers',
      );
    },
    async currentOfferFor(mechanicId) {
      const pending = check(
        await db.from('job_offers').select('*').eq('mechanic_id', mechanicId).eq('status', 'pending').maybeSingle(),
        'currentOfferFor',
      );
      if (pending) return toOffer(pending);
      // A timed-out offer is still acceptable while the job is searching.
      const missed = check(
        await db
          .from('job_offers')
          .select('*, jobs!inner(status)')
          .eq('mechanic_id', mechanicId)
          .eq('status', 'expired')
          .eq('jobs.status', 'searching')
          .order('offered_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        'currentOfferFor',
      );
      return missed ? toOffer(missed) : null;
    },
    async markStaleMechanicsOffline(seenBeforeIso) {
      const data = check(
        await db
          .from('users')
          .update({ is_online: false })
          .eq('is_online', true)
          .or(`last_seen_at.is.null,last_seen_at.lt.${seenBeforeIso}`)
          .select('id'),
        'markStaleMechanicsOffline',
      );
      return (data ?? []).length;
    },
    async addLocationPoint(p) {
      check(
        await db.from('job_location_points').insert({
          job_id: p.jobId,
          mechanic_id: p.mechanicId,
          lat: p.lat,
          lng: p.lng,
          accuracy_m: p.accuracyM,
          speed_mps: p.speedMps,
          heading: p.heading,
          source: p.source,
          recorded_at: p.recordedAt,
        }),
        'addLocationPoint',
      );
    },
    async listLocationPoints(jobId, limit) {
      const data = check(
        await db
          .from('job_location_points')
          .select('*')
          .eq('job_id', jobId)
          .order('recorded_at', { ascending: false })
          .limit(limit),
        'listLocationPoints',
      );
      return (data ?? []).reverse().map(
        (r: any): LocationPoint => ({
          jobId: r.job_id,
          mechanicId: r.mechanic_id,
          lat: Number(r.lat),
          lng: Number(r.lng),
          accuracyM: r.accuracy_m === null ? null : Number(r.accuracy_m),
          speedMps: r.speed_mps === null ? null : Number(r.speed_mps),
          heading: r.heading === null ? null : Number(r.heading),
          source: r.source,
          recordedAt: r.recorded_at,
        }),
      );
    },
    async listJobsByStatus(statuses, limit) {
      const data = check(await db.from('jobs').select('*').in('status', statuses).limit(limit), 'listJobsByStatus');
      return (data ?? []).map(toJob);
    },
    async openAlert(a) {
      const res = await db
        .from('job_alerts')
        .insert({ job_id: a.jobId, mechanic_id: a.mechanicId, kind: a.kind, last_location_at: a.lastLocationAt })
        .select('*')
        .single();
      if (isUniqueViolation(res.error)) return null; // already open
      return toAlert(check(res, 'openAlert'));
    },
    async listOpenAlerts() {
      const data = check(
        await db.from('job_alerts').select('*').is('resolved_at', null).order('created_at'),
        'listOpenAlerts',
      );
      return (data ?? []).map(toAlert);
    },
    async findOpenAlert(jobId) {
      const data = check(
        await db.from('job_alerts').select('*').eq('job_id', jobId).is('resolved_at', null).maybeSingle(),
        'findOpenAlert',
      );
      return data ? toAlert(data) : null;
    },
    async findAlert(id) {
      const data = check(await db.from('job_alerts').select('*').eq('id', id).maybeSingle(), 'findAlert');
      return data ? toAlert(data) : null;
    },
    async resolveAlerts(jobId, resolution, adminId) {
      const data = check(
        await db
          .from('job_alerts')
          .update({ resolved_at: new Date().toISOString(), resolution, resolved_by: adminId ?? null })
          .eq('job_id', jobId)
          .is('resolved_at', null)
          .select('id'),
        'resolveAlerts',
      );
      return (data ?? []).length;
    },
    async upsertJobPhoto(p) {
      const prev = check(
        await db.from('job_photos').select('storage_path').eq('job_id', p.jobId).eq('kind', p.kind).maybeSingle(),
        'upsertJobPhoto',
      ) as any;
      const data = check(
        await db
          .from('job_photos')
          .upsert(
            {
              job_id: p.jobId,
              kind: p.kind,
              storage_path: p.storagePath,
              mime_type: p.mimeType,
              size_bytes: p.sizeBytes,
              uploaded_by: p.uploadedBy,
              uploaded_at: new Date().toISOString(),
            },
            { onConflict: 'job_id,kind' },
          )
          .select('*')
          .single(),
        'upsertJobPhoto',
      );
      return { photo: toPhoto(data), replacedPath: prev?.storage_path ?? null };
    },
    async listJobPhotos(jobId) {
      const data = check(await db.from('job_photos').select('*').eq('job_id', jobId), 'listJobPhotos');
      return (data ?? []).map(toPhoto);
    },
    async mechanicStats(mechanicId, dayStartIso, offersSinceIso) {
      const [today, total, rated, recent] = await Promise.all([
        db.from('jobs').select('payout_rs').eq('mechanic_id', mechanicId).eq('status', 'completed').gte('completed_at', dayStartIso),
        db.from('jobs').select('id', { count: 'exact', head: true }).eq('mechanic_id', mechanicId).eq('status', 'completed'),
        db.from('jobs').select('mechanic_rating').eq('mechanic_id', mechanicId).not('mechanic_rating', 'is', null),
        db.from('job_offers').select('status').eq('mechanic_id', mechanicId).gte('offered_at', offersSinceIso),
      ]);
      for (const r of [today, total, rated, recent]) if (r.error) throw new Error(`Supabase mechanicStats failed: ${r.error.message}`);
      const ratings = (rated.data ?? []).map((r: any) => r.mechanic_rating as number);
      const statuses = (recent.data ?? []).map((r: any) => r.status as string);
      return {
        todayEarningsRs: (today.data ?? []).reduce((s: number, r: any) => s + (r.payout_rs ?? 0), 0),
        todayJobs: (today.data ?? []).length,
        totalJobs: total.count ?? 0,
        rating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
        ratingCount: ratings.length,
        offers: {
          accepted: statuses.filter((x) => x === 'accepted').length,
          declined: statuses.filter((x) => x === 'declined').length,
          expired: statuses.filter((x) => x === 'expired').length,
        },
      };
    },

    async insertAudit(e) {
      check(
        await db.from('admin_audit_log').insert({
          admin_id: e.adminId,
          action: e.action,
          target_user_id: e.targetUserId,
          detail: e.detail,
        }),
        'insertAudit',
      );
    },
    async listAudit({ targetUserId, limit }) {
      let q = db.from('admin_audit_log').select('*, admins(full_name)');
      if (targetUserId) q = q.eq('target_user_id', targetUserId);
      const data = check(await q.order('created_at', { ascending: false }).limit(limit), 'listAudit');
      return (data ?? []).map(
        (r: any): AuditEntry => ({
          id: r.id,
          adminId: r.admin_id,
          adminName: r.admins?.full_name,
          action: r.action,
          targetUserId: r.target_user_id,
          detail: r.detail ?? {},
          createdAt: r.created_at,
        }),
      );
    },
  };
}

export function createSupabaseFileStore(db: SupabaseClient, bucket: string): FileStore {
  return {
    async put(path, data, contentType) {
      const res = await db.storage.from(bucket).upload(path, data, { contentType, upsert: true });
      if (res.error) throw new Error(`Supabase storage upload failed: ${res.error.message}`);
      return path;
    },
    async get(path) {
      const res = await db.storage.from(bucket).download(path);
      if (res.error || !res.data) return null;
      return Buffer.from(await res.data.arrayBuffer());
    },
    async remove(path) {
      await db.storage.from(bucket).remove([path]);
    },
  };
}
