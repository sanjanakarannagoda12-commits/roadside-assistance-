// Admin API, used by the admin web app (admin/). Every route except login needs an admin token.
//   POST  /admin/auth/login                          { email, password }
//   GET   /admin/me
//   GET   /admin/stats                               mechanic counts by status
//   GET   /admin/mechanics?status=&search=&page=     review queue / search
//   GET   /admin/mechanics/:id                       profile, documents, services, history
//   GET   /admin/mechanics/:id/documents/:docType    the document file itself (private)
//   POST  /admin/mechanics/:id/review                approve / reject each document
//   POST  /admin/mechanics/:id/suspend               { reason }
//   POST  /admin/mechanics/:id/reinstate
//   GET   /admin/catalog            PATCH /admin/catalog/:key      Ridzo's price list
//   GET   /admin/pricing            PUT   /admin/pricing           travel formula + commission
//   GET   /admin/alerts                                    live issues (e.g. mechanic went dark on the way)
//   POST  /admin/alerts/:id/dismiss                        checked, nothing to do
//   POST  /admin/jobs/:id/rematch     { reason }           give the customer another mechanic
//   POST  /admin/jobs/:id/cancel      { reason }           cancel on the customer's behalf
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { FileStore, Repo, User } from '../db/types.js';
import type { SmsProvider } from '../sms/index.js';
import type { TokenService } from '../services/tokens.js';
import type { Dispatcher } from '../services/dispatch.js';
import type { Maps } from '../services/maps.js';
import { sendJobPhoto } from './jobs.js';
import { photoKindParam } from '../validation.js';
import { ApiError } from '../errors.js';
import { DUMMY_HASH_PROMISE, verifyPassword } from '../services/passwords.js';
import { travelCharge } from '../services/pricing.js';
import { maskPhone } from '../sms/index.js';
import {
  DOC_TYPES,
  adminLoginBody,
  catalogPatchBody,
  docTypeParam,
  mechanicListQuery,
  pricingPatchBody,
  reviewBody,
  suspendBody,
  type DocType,
} from '../validation.js';

export const DOC_LABELS: Record<DocType, string> = {
  nic: 'NIC',
  license: 'Driving licence',
  certificate: 'Trade certificate',
  toolkit: 'Toolkit photo',
};

const PAGE_SIZE = 25;
const idParam = z.uuid({ error: 'Unknown mechanic' });

const mechanicSummary = (u: User) => ({
  id: u.id,
  phone: u.phone,
  fullName: u.fullName,
  serviceArea: u.serviceArea,
  status: u.status,
  submittedAt: u.submittedAt,
  reviewedAt: u.reviewedAt,
  isOnline: u.isOnline,
  createdAt: u.createdAt,
});

export function adminRouter(deps: {
  repo: Repo;
  files: FileStore;
  sms: SmsProvider;
  tokens: TokenService;
  dispatcher: Dispatcher;
  maps: Maps;
  requireAdmin: RequestHandler;
}) {
  const { repo, files, sms, tokens, dispatcher, maps, requireAdmin } = deps;
  const r = Router();

  /** SMS the mechanic about a decision. Never fails the request — the decision is already saved. */
  const notify = async (user: User, message: string) => {
    try {
      await sms.send(user.phone, message);
      return true;
    } catch (e) {
      console.error(`[admin] could not SMS ${maskPhone(user.phone)}: ${(e as Error).message}`);
      return false;
    }
  };

  const loadMechanic = async (id: string) => {
    const user = await repo.findUserById(idParam.parse(id));
    if (!user) throw new ApiError(404, 'not_found', 'Mechanic not found');
    return user;
  };

  const mechanicDetail = async (user: User) => {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [docs, chosen, catalog, history, stats] = await Promise.all([
      repo.listDocuments(user.id),
      repo.listServices(user.id),
      repo.listCatalog(),
      repo.listAudit({ targetUserId: user.id, limit: 20 }),
      repo.mechanicStats(user.id, new Date().toISOString(), since30d),
    ]);
    const answered = stats.offers.accepted + stats.offers.declined + stats.offers.expired;
    const keys = new Set(chosen.map((s) => s.serviceKey));
    return {
      mechanic: { ...mechanicSummary(user), email: user.email, rejectionReason: user.rejectionReason, lastSeenAt: user.lastSeenAt },
      documents: DOC_TYPES.map((t) => {
        const d = docs.find((x) => x.docType === t);
        return {
          docType: t,
          label: DOC_LABELS[t],
          uploaded: Boolean(d),
          status: d?.status ?? null,
          reason: d?.rejectionReason ?? null,
          mimeType: d?.mimeType ?? null,
          sizeBytes: d?.sizeBytes ?? null,
          uploadedAt: d?.uploadedAt ?? null,
          reviewedAt: d?.reviewedAt ?? null,
        };
      }),
      services: catalog.filter((c) => keys.has(c.key)).map((c) => ({ key: c.key, name: c.name, category: c.category, priceRs: c.priceRs })),
      history,
      stats: {
        completedJobs: stats.totalJobs,
        rating: stats.rating,
        ratingCount: stats.ratingCount,
        offersLast30Days: stats.offers,
        acceptanceRate: answered ? Math.round((stats.offers.accepted / answered) * 100) / 100 : null,
      },
    };
  };

  // ─── Auth ─────────────────────────────────────────────────────────────────

  r.post('/auth/login', async (req, res) => {
    const { email, password } = adminLoginBody.parse(req.body ?? {});
    const admin = await repo.findAdminByEmail(email);
    // Always run the slow hash check, so response time doesn't reveal whether the email exists.
    const ok = await verifyPassword(password, admin?.passwordHash ?? (await DUMMY_HASH_PROMISE));
    if (!admin || !ok) throw new ApiError(401, 'invalid_login', 'Wrong email or password.');
    await repo.touchAdminLogin(admin.id);
    const { token, expiresIn } = tokens.signAdmin(admin.id);
    res.json({ token, expiresIn, admin: { id: admin.id, email: admin.email, fullName: admin.fullName } });
  });

  r.use(requireAdmin);

  r.get('/me', (req, res) => {
    const a = req.admin!;
    res.json({ id: a.id, email: a.email, fullName: a.fullName });
  });

  r.get('/stats', async (_req, res) => {
    const [mechanics, alerts] = await Promise.all([repo.countMechanicsByStatus(), repo.listOpenAlerts()]);
    res.json({ mechanics, openAlerts: alerts.length });
  });

  // ─── Live issues ──────────────────────────────────────────────────────────

  const jobIdParam = z.uuid({ error: 'Unknown job' });
  const reasonBody = z.object({ reason: z.string().trim().min(3, 'Give a short reason').max(200) });

  r.get('/alerts', async (_req, res) => {
    const [alerts, pricing] = await Promise.all([repo.listOpenAlerts(), repo.getPricing()]);
    const rows = await Promise.all(
      alerts.map(async (a) => {
        const [job, m] = await Promise.all([repo.findJob(a.jobId), repo.findUserById(a.mechanicId)]);
        const route =
          job && m?.lastLat != null && m.lastLng != null
            ? (await maps.routesTo([{ lat: m.lastLat, lng: m.lastLng }], { lat: job.lat, lng: job.lng }, pricing.roadFactor))[0]
            : null;
        const kmAway = route?.km ?? null;
        return {
          id: a.id,
          kind: a.kind,
          createdAt: a.createdAt,
          minutesSinceLocation: m?.lastSeenAt ? Math.floor((Date.now() - new Date(m.lastSeenAt).getTime()) / 60000) : null,
          job: job && {
            id: job.id,
            status: job.status,
            customerName: job.customerName,
            customerPhone: job.customerPhone,
            issueSummary: job.issueSummary,
            address: job.address,
            acceptedAt: job.acceptedAt,
          },
          mechanic: m && {
            id: m.id,
            name: m.fullName,
            phone: m.phone,
            lastSeenAt: m.lastSeenAt,
            kmAway,
            etaMin: route ? Math.max(1, Math.ceil(route.durationS / 60)) : null,
          },
        };
      }),
    );
    res.json({ alerts: rows });
  });

  r.post('/alerts/:id/dismiss', async (req, res) => {
    const alert = await repo.findAlert(z.uuid().parse(req.params.id));
    if (!alert || alert.resolvedAt) throw new ApiError(404, 'not_found', 'This issue is already closed.');
    await repo.resolveAlerts(alert.jobId, 'dismissed', req.admin!.id);
    await repo.insertAudit({ adminId: req.admin!.id, action: 'alert.dismiss', targetUserId: alert.mechanicId, detail: { jobId: alert.jobId } });
    res.json({ ok: true });
  });

  const loadJob = async (id: unknown) => {
    const job = await repo.findJob(jobIdParam.parse(id));
    if (!job) throw new ApiError(404, 'not_found', 'Job not found');
    return job;
  };

  r.get('/jobs/:id/photos/:kind', async (req, res) => {
    await sendJobPhoto(repo, files, jobIdParam.parse(req.params.id), photoKindParam.parse(req.params.kind), res);
  });

  r.post('/jobs/:id/rematch', async (req, res) => {
    const { reason } = reasonBody.parse(req.body ?? {});
    const job = await loadJob(req.params.id);
    const previous = job.mechanicId;
    const reopened = await dispatcher.rematch(job, reason, req.admin!.id);
    await repo.insertAudit({ adminId: req.admin!.id, action: 'job.rematch', targetUserId: previous, detail: { jobId: job.id, reason } });
    res.json({ ok: true, status: reopened.status });
  });

  r.post('/jobs/:id/cancel', async (req, res) => {
    const { reason } = reasonBody.parse(req.body ?? {});
    const job = await loadJob(req.params.id);
    await dispatcher.cancelForCustomer(job, reason, 'admin', req.admin!.id);
    await repo.insertAudit({ adminId: req.admin!.id, action: 'job.cancel', targetUserId: job.mechanicId, detail: { jobId: job.id, reason } });
    res.json({ ok: true });
  });

  // ─── Mechanics ────────────────────────────────────────────────────────────

  r.get('/mechanics', async (req, res) => {
    const { status, search, page } = mechanicListQuery.parse(req.query);
    const { rows, total } = await repo.listMechanics({ status, search, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
    res.json({ rows: rows.map(mechanicSummary), total, page, pageSize: PAGE_SIZE });
  });

  r.get('/mechanics/:id', async (req, res) => {
    res.json(await mechanicDetail(await loadMechanic(req.params.id)));
  });

  r.get('/mechanics/:id/documents/:docType', async (req, res) => {
    const user = await loadMechanic(req.params.id);
    const docType = docTypeParam.parse(req.params.docType);
    const doc = (await repo.listDocuments(user.id)).find((d) => d.docType === docType);
    const data = doc ? await files.get(doc.storagePath) : null;
    if (!doc || !data) throw new ApiError(404, 'not_found', 'Document not uploaded');
    res.set({
      'Content-Type': doc.mimeType,
      'Content-Disposition': `inline; filename="${docType}.${doc.storagePath.split('.').pop()}"`,
      'Cache-Control': 'private, no-store',
    });
    res.send(data);
  });

  r.post('/mechanics/:id/review', async (req, res) => {
    const user = await loadMechanic(req.params.id);
    const body = reviewBody.parse(req.body ?? {});
    if (user.status !== 'pending_review') {
      throw new ApiError(409, 'not_pending', 'This mechanic is not waiting for review (someone may have just reviewed them).');
    }

    const decisions = DOC_TYPES.map((t) => {
      const d = body.documents[t];
      return { docType: t, status: d.status, reason: d.status === 'rejected' ? d.reason : null };
    });
    const rejected = decisions.filter((d) => d.status === 'rejected');
    const status = rejected.length ? 'rejected' : 'approved';
    const rejectionReason = rejected.length
      ? body.note || `Please re-upload: ${rejected.map((d) => DOC_LABELS[d.docType]).join(', ')}.`
      : null;

    const updated = await repo.applyReview({ userId: user.id, adminId: req.admin!.id, documents: decisions, status, rejectionReason });
    if (!updated) {
      throw new ApiError(409, 'not_pending', 'This mechanic is not waiting for review (someone may have just reviewed them).');
    }

    const notified = await notify(
      updated,
      status === 'approved'
        ? 'Ridzo: Your mechanic account is approved. Open the app and tap Go online to start receiving jobs.'
        : `Ridzo: Please re-upload your ${rejected.map((d) => DOC_LABELS[d.docType]).join(', ')}. Open the app to see why and resubmit.`,
    );
    res.json({ ...(await mechanicDetail(updated)), notified });
  });

  r.post('/mechanics/:id/suspend', async (req, res) => {
    const user = await loadMechanic(req.params.id);
    const { reason } = suspendBody.parse(req.body ?? {});
    if (user.status !== 'approved') throw new ApiError(409, 'not_approved', 'Only approved mechanics can be suspended.');
    const updated = await repo.updateUser(user.id, { status: 'suspended', isOnline: false, rejectionReason: reason });
    await repo.insertAudit({ adminId: req.admin!.id, action: 'mechanic.suspend', targetUserId: user.id, detail: { reason } });
    const notified = await notify(updated, 'Ridzo: Your mechanic account has been suspended. Contact Ridzo support for details.');
    res.json({ ...(await mechanicDetail(updated)), notified });
  });

  r.post('/mechanics/:id/reinstate', async (req, res) => {
    const user = await loadMechanic(req.params.id);
    if (user.status !== 'suspended') throw new ApiError(409, 'not_suspended', 'This mechanic is not suspended.');
    const updated = await repo.updateUser(user.id, { status: 'approved', rejectionReason: null });
    await repo.insertAudit({ adminId: req.admin!.id, action: 'mechanic.reinstate', targetUserId: user.id, detail: {} });
    const notified = await notify(updated, 'Ridzo: Your mechanic account is active again. Open the app to go online.');
    res.json({ ...(await mechanicDetail(updated)), notified });
  });

  // ─── Price list ───────────────────────────────────────────────────────────

  r.get('/catalog', async (_req, res) => {
    res.json({ services: await repo.listCatalog() });
  });

  r.patch('/catalog/:key', async (req, res) => {
    const patch = catalogPatchBody.parse(req.body ?? {});
    const before = (await repo.listCatalog()).find((s) => s.key === req.params.key);
    if (!before) throw new ApiError(404, 'not_found', 'Service not found');
    const after = await repo.updateCatalogService(before.key, patch);
    await repo.insertAudit({
      adminId: req.admin!.id,
      action: 'catalog.update',
      targetUserId: null,
      detail: { key: before.key, before: pick(before, Object.keys(patch)), after: patch },
    });
    res.json({ service: after });
  });

  // ─── Travel formula + commission ──────────────────────────────────────────

  const withExamples = async () => {
    const pricing = await repo.getPricing();
    // A fixed noon / midnight (Sri Lanka time) so the examples don't depend on when you look.
    const day = new Date('2026-01-01T12:00:00+05:30');
    const night = new Date('2026-01-01T23:30:00+05:30');
    const examples = [2, 5, 10, pricing.maxRadiusKm].map((km) => ({
      distanceKm: km,
      dayRs: travelCharge(km, pricing, day).travelRs,
      nightRs: travelCharge(km, pricing, night).travelRs,
    }));
    return { pricing, examples };
  };

  r.get('/pricing', async (_req, res) => {
    res.json(await withExamples());
  });

  r.put('/pricing', async (req, res) => {
    const patch = pricingPatchBody.parse(req.body ?? {});
    const before = await repo.getPricing();
    const next = { ...before, ...patch };
    if (next.travelCapRs < next.travelBaseRs) {
      throw new ApiError(400, 'validation_error', 'The travel cap must be at least the base call-out fee.', {
        fields: { travelCapRs: 'Must be at least the base call-out fee' },
      });
    }
    await repo.updatePricing(patch);
    await repo.insertAudit({
      adminId: req.admin!.id,
      action: 'pricing.update',
      targetUserId: null,
      detail: { before: pick(before, Object.keys(patch)), after: patch },
    });
    res.json(await withExamples());
  });

  return r;
}

function pick<T extends object>(obj: T, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, (obj as Record<string, unknown>)[k]]));
}
