// In-memory storage. No setup needed; everything is lost when the server restarts.
import { randomUUID } from 'node:crypto';
import { DEFAULT_CATALOG, DEFAULT_PRICING, type CatalogService, type PricingConfig } from '../catalog.js';
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
import { straightLineKm } from '../services/pricing.js';

const now = () => new Date().toISOString();

export function createMemoryRepo(): Repo {
  const users = new Map<string, User>();
  const otps: OtpRecord[] = [];
  const sessions = new Map<string, Session>();
  const documents = new Map<string, MechanicDocument>(); // key: userId:docType
  const services = new Map<string, string[]>();
  const catalog = new Map<string, CatalogService>(DEFAULT_CATALOG.map((s) => [s.key, { ...s }]));
  let pricing: PricingConfig = { ...DEFAULT_PRICING };
  const admins = new Map<string, Admin>();
  const audit: AuditEntry[] = [];
  const jobs = new Map<string, Job>();
  const offers: JobOffer[] = [];
  const points: LocationPoint[] = [];
  const alerts: JobAlert[] = [];
  const photos = new Map<string, JobPhoto>(); // key: jobId:kind
  const isActive = (j: Job) => ACTIVE_JOB_STATUSES.includes(j.status);
  const copyOffer = (o: JobOffer | undefined) => (o ? { ...o } : null);

  const repo: Repo = {
    async findUserByPhone(phone) {
      const u = [...users.values()].find((x) => x.phone === phone);
      return u ? { ...u } : null;
    },
    async findUserById(id) {
      const u = users.get(id);
      return u ? { ...u } : null;
    },
    async createUser(phone) {
      const user: User = {
        id: randomUUID(),
        phone,
        role: 'mechanic',
        status: 'onboarding',
        fullName: null,
        email: null,
        serviceArea: null,
        rejectionReason: null,
        submittedAt: null,
        reviewedAt: null,
        isOnline: false,
        lastLat: null,
        lastLng: null,
        lastSeenAt: null,
        avatarPath: null,
        createdAt: now(),
      };
      users.set(user.id, user);
      return { ...user };
    },
    async updateUser(id, patch) {
      const user = users.get(id);
      if (!user) throw new Error('user not found');
      Object.assign(user, patch);
      return { ...user };
    },
    async listMechanics({ status, search, limit, offset }) {
      const q = search?.trim().toLowerCase();
      const all = [...users.values()]
        .filter((u) => !status || u.status === status)
        .filter((u) => !q || u.phone.includes(q) || (u.fullName ?? '').toLowerCase().includes(q))
        // Oldest submission first, so the review queue is fair.
        .sort((a, b) => (a.submittedAt ?? a.createdAt).localeCompare(b.submittedAt ?? b.createdAt));
      return { rows: all.slice(offset, offset + limit).map((u) => ({ ...u })), total: all.length };
    },
    async countMechanicsByStatus() {
      const counts: Record<UserStatus, number> = { onboarding: 0, pending_review: 0, approved: 0, rejected: 0, suspended: 0 };
      for (const u of users.values()) counts[u.status] += 1;
      return counts;
    },

    async insertOtp(rec) {
      const otp: OtpRecord = { ...rec, id: randomUUID(), attempts: 0, consumedAt: null, createdAt: now() };
      otps.push(otp);
      return { ...otp };
    },
    async latestOtp(phone) {
      const list = otps.filter((o) => o.phone === phone);
      return list.length ? { ...list[list.length - 1] } : null;
    },
    async countOtpsSince(phone, sinceIso) {
      return otps.filter((o) => o.phone === phone && o.createdAt >= sinceIso).length;
    },
    async incrementOtpAttempts(id) {
      const otp = otps.find((o) => o.id === id);
      if (otp) otp.attempts += 1;
    },
    async consumeOtp(id) {
      const otp = otps.find((o) => o.id === id);
      if (otp) otp.consumedAt = now();
    },

    async createSession(s) {
      const session: Session = { ...s, id: randomUUID(), revokedAt: null, createdAt: now() };
      sessions.set(session.id, session);
      return { ...session };
    },
    async findSessionByHash(hash) {
      const s = [...sessions.values()].find((x) => x.refreshTokenHash === hash);
      return s ? { ...s } : null;
    },
    async revokeSession(id) {
      const s = sessions.get(id);
      if (s && !s.revokedAt) s.revokedAt = now();
    },
    async revokeAllSessions(userId) {
      for (const s of sessions.values()) if (s.userId === userId && !s.revokedAt) s.revokedAt = now();
    },

    async upsertDocument(doc) {
      const saved: MechanicDocument = {
        ...doc,
        status: 'uploaded',
        rejectionReason: null,
        uploadedAt: now(),
        reviewedAt: null,
      };
      documents.set(`${doc.userId}:${doc.docType}`, saved);
      return { ...saved };
    },
    async listDocuments(userId) {
      return [...documents.values()].filter((d) => d.userId === userId).map((d) => ({ ...d }));
    },
    async replaceServices(userId, keys) {
      services.set(userId, [...keys]);
    },
    async listServices(userId) {
      return (services.get(userId) ?? []).map((serviceKey) => ({ userId, serviceKey }));
    },

    async applyReview({ userId, adminId, documents: decisions, status, rejectionReason }) {
      const user = users.get(userId);
      if (!user || user.status !== 'pending_review') return null;
      const at = now();
      for (const d of decisions) {
        const doc = documents.get(`${userId}:${d.docType}`);
        if (doc) Object.assign(doc, { status: d.status, rejectionReason: d.reason, reviewedAt: at });
      }
      Object.assign(user, { status, rejectionReason, reviewedAt: at });
      audit.push({
        id: randomUUID(),
        adminId,
        action: status === 'approved' ? 'mechanic.approve' : 'mechanic.reject',
        targetUserId: userId,
        detail: { documents: decisions, reason: rejectionReason },
        createdAt: at,
      });
      return { ...user };
    },

    async listCatalog() {
      return [...catalog.values()].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => ({ ...s }));
    },
    async updateCatalogService(key, patch) {
      const s = catalog.get(key);
      if (!s) return null;
      Object.assign(s, patch);
      return { ...s };
    },
    async getPricing() {
      return { ...pricing };
    },
    async updatePricing(patch) {
      pricing = { ...pricing, ...patch, updatedAt: now() };
      return { ...pricing };
    },

    async findAdminByEmail(email) {
      const a = [...admins.values()].find((x) => x.email === email.toLowerCase());
      return a ? { ...a } : null;
    },
    async findAdminById(id) {
      const a = admins.get(id);
      return a ? { ...a } : null;
    },
    async createAdmin(a) {
      const admin: Admin = { ...a, email: a.email.toLowerCase(), id: randomUUID(), createdAt: now(), lastLoginAt: null };
      admins.set(admin.id, admin);
      return { ...admin };
    },
    async setAdminPassword(id, passwordHash) {
      const a = admins.get(id);
      if (a) a.passwordHash = passwordHash;
    },
    async touchAdminLogin(id) {
      const a = admins.get(id);
      if (a) a.lastLoginAt = now();
    },

    async createJob(input) {
      const job: Job = {
        ...input,
        serviceKeys: [...input.serviceKeys],
        id: randomUUID(),
        status: 'searching',
        mechanicId: null,
        distanceKm: null,
        travelRs: null,
        diagnosisNote: null,
        bill: null,
        totalRs: null,
        commissionRs: null,
        payoutRs: null,
        paidBy: null,
        mechanicRating: null,
        customerRating: null,
        createdAt: now(),
        acceptedAt: null,
        arrivedAt: null,
        completedAt: null,
        cancelledBy: null,
        cancelReason: null,
        cancelledAt: null,
        etaS: null,
      };
      jobs.set(job.id, job);
      return { ...job };
    },
    async findJob(id) {
      const j = jobs.get(id);
      return j ? { ...j } : null;
    },
    async updateJob(id, fromStatuses, patch) {
      const j = jobs.get(id);
      if (!j || !fromStatuses.includes(j.status)) return null;
      if (patch.status && ACTIVE_JOB_STATUSES.includes(patch.status) && (patch.mechanicId ?? j.mechanicId)) {
        const mid = patch.mechanicId ?? j.mechanicId;
        if ([...jobs.values()].some((x) => x.id !== id && x.mechanicId === mid && isActive(x))) throw new MechanicBusyError();
      }
      Object.assign(j, patch);
      return { ...j };
    },
    async acceptJob(jobId, mechanicId, distanceKm, travelRs) {
      const j = jobs.get(jobId);
      if (!j || j.status !== 'searching') return null;
      if ([...jobs.values()].some((x) => x.mechanicId === mechanicId && isActive(x))) throw new MechanicBusyError();
      Object.assign(j, { status: 'accepted', mechanicId, acceptedAt: now(), distanceKm, travelRs });
      for (const o of offers.filter((x) => x.jobId === jobId)) {
        if (o.mechanicId === mechanicId) Object.assign(o, { status: 'accepted', respondedAt: now() });
        else if (o.status === 'pending') Object.assign(o, { status: 'withdrawn', respondedAt: now() });
      }
      return { ...j };
    },
    async activeJobFor(mechanicId) {
      const j = [...jobs.values()].find((x) => x.mechanicId === mechanicId && isActive(x));
      return j ? { ...j } : null;
    },
    async listSearchingJobs(limit) {
      return [...jobs.values()]
        .filter((j) => j.status === 'searching')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, limit)
        .map((j) => ({ ...j }));
    },
    async findCandidates({ job, maxKm, roadFactor, seenAfter, limit }) {
      const catalog = await repo.listCatalog();
      const categoryOf = new Map(catalog.filter((c) => c.active).map((c) => [c.key, c.category]));
      const result = [];
      for (const u of users.values()) {
        if (!u.isOnline || u.status !== 'approved' || !u.lastSeenAt || u.lastSeenAt < seenAfter) continue;
        if (u.lastLat === null || u.lastLng === null) continue;
        const roadKm = Math.round(straightLineKm({ lat: job.lat, lng: job.lng }, { lat: u.lastLat, lng: u.lastLng }) * roadFactor * 10) / 10;
        if (roadKm > maxKm) continue;
        if ([...jobs.values()].some((j) => j.mechanicId === u.id && isActive(j))) continue;
        if (offers.some((o) => o.mechanicId === u.id && (o.status === 'pending' || o.jobId === job.id))) continue;
        const theirs = services.get(u.id) ?? [];
        const covers = job.serviceKeys.length
          ? job.serviceKeys.every((k) => theirs.includes(k))
          : job.issueCategory === 'other'
            ? theirs.length > 0
            : theirs.some((k) => categoryOf.get(k) === job.issueCategory);
        if (!covers) continue;
        const ratings = [...jobs.values()].filter((j) => j.mechanicId === u.id && j.mechanicRating !== null).map((j) => j.mechanicRating!);
        result.push({ mechanicId: u.id, roadKm, rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null });
      }
      return result
        .sort((a, b) => a.roadKm - b.roadKm || (b.rating ?? -1) - (a.rating ?? -1))
        .slice(0, limit);
    },
    async createOffer(o) {
      const clash = offers.some(
        (x) =>
          (x.jobId === o.jobId && x.mechanicId === o.mechanicId) ||
          (x.status === 'pending' && (x.jobId === o.jobId || x.mechanicId === o.mechanicId)),
      );
      if (clash) return null;
      const offer: JobOffer = { ...o, id: randomUUID(), status: 'pending', offeredAt: now(), respondedAt: null };
      offers.push(offer);
      return { ...offer };
    },
    async findOffer(jobId, mechanicId) {
      return copyOffer(offers.find((o) => o.jobId === jobId && o.mechanicId === mechanicId));
    },
    async hasPendingOffer(jobId) {
      return offers.some((o) => o.jobId === jobId && o.status === 'pending');
    },
    async updateOffer(id, fromStatuses, status) {
      const o = offers.find((x) => x.id === id);
      if (!o || !fromStatuses.includes(o.status)) return null;
      Object.assign(o, { status, respondedAt: now() });
      return { ...o };
    },
    async expireOffers(nowIso) {
      const expired = offers.filter((o) => o.status === 'pending' && o.expiresAt < nowIso);
      for (const o of expired) Object.assign(o, { status: 'expired', respondedAt: nowIso });
      return expired.map((o) => ({ ...o }));
    },
    async withdrawPendingOffers(jobId) {
      for (const o of offers) if (o.jobId === jobId && o.status === 'pending') Object.assign(o, { status: 'withdrawn', respondedAt: now() });
    },
    async currentOfferFor(mechanicId) {
      const mine = offers.filter((o) => o.mechanicId === mechanicId);
      const pending = mine.find((o) => o.status === 'pending');
      if (pending) return { ...pending };
      const missed = mine
        .filter((o) => o.status === 'expired' && jobs.get(o.jobId)?.status === 'searching')
        .sort((a, b) => b.offeredAt.localeCompare(a.offeredAt))[0];
      return copyOffer(missed);
    },
    async markStaleMechanicsOffline(seenBeforeIso) {
      let n = 0;
      for (const u of users.values()) {
        if (u.isOnline && (!u.lastSeenAt || u.lastSeenAt < seenBeforeIso)) {
          u.isOnline = false;
          n += 1;
        }
      }
      return n;
    },
    async addLocationPoint(p) {
      points.push({ ...p });
    },
    async listLocationPoints(jobId, limit) {
      return points
        .filter((p) => p.jobId === jobId)
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
        .slice(-limit)
        .map((p) => ({ ...p }));
    },
    async listJobsByStatus(statuses, limit) {
      return [...jobs.values()].filter((j) => statuses.includes(j.status)).slice(0, limit).map((j) => ({ ...j }));
    },
    async openAlert(a) {
      if (alerts.some((x) => x.jobId === a.jobId && x.kind === a.kind && !x.resolvedAt)) return null;
      const alert: JobAlert = { ...a, id: randomUUID(), createdAt: now(), resolvedAt: null, resolution: null, resolvedBy: null };
      alerts.push(alert);
      return { ...alert };
    },
    async listOpenAlerts() {
      return alerts.filter((a) => !a.resolvedAt).map((a) => ({ ...a }));
    },
    async findOpenAlert(jobId) {
      const a = alerts.find((x) => x.jobId === jobId && !x.resolvedAt);
      return a ? { ...a } : null;
    },
    async findAlert(id) {
      const a = alerts.find((x) => x.id === id);
      return a ? { ...a } : null;
    },
    async resolveAlerts(jobId, resolution, adminId) {
      let n = 0;
      for (const a of alerts) {
        if (a.jobId === jobId && !a.resolvedAt) {
          Object.assign(a, { resolvedAt: now(), resolution, resolvedBy: adminId ?? null });
          n += 1;
        }
      }
      return n;
    },
    async upsertJobPhoto(p) {
      const key = `${p.jobId}:${p.kind}`;
      const replacedPath = photos.get(key)?.storagePath ?? null;
      const photo: JobPhoto = { ...p, uploadedAt: now() };
      photos.set(key, photo);
      return { photo: { ...photo }, replacedPath };
    },
    async listJobPhotos(jobId) {
      return [...photos.values()].filter((p) => p.jobId === jobId).map((p) => ({ ...p }));
    },
    async mechanicStats(mechanicId, dayStartIso, offersSinceIso) {
      const done = [...jobs.values()].filter((j) => j.mechanicId === mechanicId && j.status === 'completed');
      const today = done.filter((j) => (j.completedAt ?? '') >= dayStartIso);
      const rated = [...jobs.values()].filter((j) => j.mechanicId === mechanicId && j.mechanicRating !== null);
      const recent = offers.filter((o) => o.mechanicId === mechanicId && o.offeredAt >= offersSinceIso);
      return {
        todayEarningsRs: today.reduce((s, j) => s + (j.payoutRs ?? 0), 0),
        todayJobs: today.length,
        totalJobs: done.length,
        rating: rated.length ? Math.round((rated.reduce((s, j) => s + j.mechanicRating!, 0) / rated.length) * 10) / 10 : null,
        ratingCount: rated.length,
        offers: {
          accepted: recent.filter((o) => o.status === 'accepted').length,
          declined: recent.filter((o) => o.status === 'declined').length,
          expired: recent.filter((o) => o.status === 'expired').length,
        },
      };
    },

    async insertAudit(e) {
      audit.push({ ...e, id: randomUUID(), createdAt: now() });
    },
    async listAudit({ targetUserId, limit }) {
      return audit
        .filter((e) => !targetUserId || e.targetUserId === targetUserId)
        .slice(-limit)
        .reverse()
        .map((e) => ({ ...e, adminName: admins.get(e.adminId)?.fullName }));
    },
  };
  return repo;
}

export function createMemoryFileStore(): FileStore {
  const files = new Map<string, Buffer>();
  return {
    async put(path, data) {
      files.set(path, data);
      return path;
    },
    async get(path) {
      return files.get(path) ?? null;
    },
    async remove(path) {
      files.delete(path);
    },
  };
}
