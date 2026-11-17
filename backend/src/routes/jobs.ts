// Jobs, from the mechanic's side (all need a mechanic login):
//   GET  /mechanic/offers/current     the job being offered to me right now (or one I missed that's still open)
//   GET  /jobs/:id/offer              is this offer still open? (polled by the Incoming request screen)
//   POST /jobs/:id/accept             atomic — first mechanic wins; works after the 30 s too if still open
//   POST /jobs/:id/decline
//   GET  /mechanic/active-job         resume the current job after an app restart
//   GET  /jobs/:id/mine               is this job still mine? (cancelled by the customer / given to someone else)
//   POST /jobs/:id/arrived            accepted → arrived
//   POST /jobs/:id/photos/:kind       multipart "file" (JPG/PNG ≤ 5 MB) — kind = before | after
//   GET  /jobs/:id/photos/:kind       the photo itself
//   POST /jobs/:id/start              arrived → in_progress   { issueCategory?, note? }  — needs the before photo
//   POST /jobs/:id/bill               → bill_sent              { serviceKeys, parts, discountRs }  (server calculates every amount)
//   POST /jobs/:id/complete           bill_sent → completed    { paidBy }
//   POST /jobs/:id/cancel             accepted/arrived → back to searching for another mechanic   { reason }
//   POST /jobs/:id/rate-customer      { stars }
//   GET  /mechanic/dashboard          today's earnings, jobs today, rating, specialty, acceptance rate
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import type { FileStore, Job, JobStatus, PhotoKind, Repo, User } from '../db/types.js';
import type { Dispatcher } from '../services/dispatch.js';
import { ApiError } from '../errors.js';
import { SPECIALTIES } from '../catalog.js';
import { computeBill } from '../services/pricing.js';
import { jobView, offerView } from '../services/jobViews.js';
import { MAX_PHOTO_BYTES, billBody, cancelJobBody, completeBody, photoKindParam, rateBody, startJobBody } from '../validation.js';

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') cb(null, true);
    else cb(new ApiError(400, 'invalid_file', 'Use a JPG or PNG photo.'));
  },
});

const isRealImage = (mime: string, b: Buffer) =>
  mime === 'image/jpeg'
    ? b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
    : b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

/** Which job steps each photo can be taken in. */
const PHOTO_STATES: Record<PhotoKind, JobStatus[]> = {
  before: ['arrived', 'in_progress'],
  after: ['in_progress', 'bill_sent'],
};

const jobId = z.uuid({ error: 'Unknown job' });

/** Midnight today in Sri Lanka, as an ISO timestamp. */
export function sriLankaDayStart(at = new Date()): string {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(at); // YYYY-MM-DD
  return new Date(`${ymd}T00:00:00+05:30`).toISOString();
}

export function jobsRouter(repo: Repo, files: FileStore, dispatcher: Dispatcher, auth: RequestHandler) {
  const r = Router();

  /** Loads a job that belongs to this mechanic and is in one of the allowed states. */
  const myJob = async (id: unknown, user: User, allowed: JobStatus[]): Promise<Job> => {
    const job = await repo.findJob(jobId.parse(id));
    if (!job || job.mechanicId !== user.id) throw new ApiError(404, 'not_found', 'Job not found');
    if (!allowed.includes(job.status)) {
      throw new ApiError(409, 'invalid_state', `This job is ${job.status.replace('_', ' ')}, so that step isn't possible.`, {
        status: job.status,
      });
    }
    return job;
  };

  const move = async (job: Job, from: JobStatus[], patch: Parameters<Repo['updateJob']>[2]) => {
    const updated = await repo.updateJob(job.id, from, patch);
    if (!updated) throw new ApiError(409, 'invalid_state', 'This job changed. Please refresh.');
    return updated;
  };

  // ─── Offers ───────────────────────────────────────────────────────────────

  r.get('/mechanic/offers/current', auth, async (req, res) => {
    const offer = await repo.currentOfferFor(req.user!.id);
    const job = offer ? await repo.findJob(offer.jobId) : null;
    res.json({ offer: offer && job && job.status === 'searching' ? offerView(offer, job) : null });
  });

  r.get('/jobs/:id/offer', auth, async (req, res) => {
    const id = jobId.parse(req.params.id);
    const [offer, job] = await Promise.all([repo.findOffer(id, req.user!.id), repo.findJob(id)]);
    if (!offer || !job) throw new ApiError(404, 'not_found', 'This job was not offered to you.');
    let state: string;
    if (job.mechanicId === req.user!.id && offer.status === 'accepted') state = 'accepted';
    else if (offer.status === 'declined') state = 'declined';
    else if (job.status !== 'searching') state = job.mechanicId ? 'taken' : 'closed';
    else state = offerView(offer, job).state; // pending | missed — both can still be accepted
    res.json({ state, offer: offerView(offer, job) });
  });

  r.post('/jobs/:id/accept', auth, async (req, res) => {
    const job = await dispatcher.accept(jobId.parse(req.params.id), req.user!);
    res.json({ job: jobView(job) });
  });

  r.post('/jobs/:id/decline', auth, async (req, res) => {
    await dispatcher.decline(jobId.parse(req.params.id), req.user!);
    res.json({ ok: true });
  });

  // ─── Active job ───────────────────────────────────────────────────────────

  r.get('/mechanic/active-job', auth, async (req, res) => {
    const job = await repo.activeJobFor(req.user!.id);
    res.json({ job: job ? jobView(job, await repo.listJobPhotos(job.id)) : null });
  });

  r.get('/jobs/:id/mine', auth, async (req, res) => {
    const id = jobId.parse(req.params.id);
    const job = await repo.findJob(id);
    if (!job) throw new ApiError(404, 'not_found', 'Job not found');
    const me = req.user!.id;
    let state: 'yours' | 'completed' | 'cancelled' | 'reassigned';
    let message: string | null = null;
    if (job.mechanicId === me && job.status === 'completed') state = 'completed';
    else if (job.mechanicId === me && job.status === 'cancelled') {
      state = 'cancelled';
      message = 'The customer cancelled this request. You don\'t need to go.';
    } else if (job.mechanicId === me) state = 'yours';
    else {
      const offer = await repo.findOffer(id, me);
      if (!offer) throw new ApiError(404, 'not_found', 'Job not found');
      state = 'reassigned';
      message = 'This request was given to another mechanic. You don\'t need to go.';
    }
    res.json({ state, status: job.status, message });
  });

  r.post('/jobs/:id/arrived', auth, async (req, res) => {
    const job = await myJob(req.params.id, req.user!, ['accepted']);
    res.json({ job: jobView(await move(job, ['accepted'], { status: 'arrived', arrivedAt: new Date().toISOString() })) });
  });

  // ─── Photos ───────────────────────────────────────────────────────────────

  r.post('/jobs/:id/photos/:kind', auth, photoUpload.single('file'), async (req, res) => {
    const kind = photoKindParam.parse(req.params.kind);
    const job = await myJob(req.params.id, req.user!, PHOTO_STATES[kind]);
    const file = req.file;
    if (!file || file.size === 0) throw new ApiError(400, 'invalid_file', 'Take a photo first.');
    if (!isRealImage(file.mimetype, file.buffer)) throw new ApiError(400, 'invalid_file', "That file doesn't look like a real photo.");
    const path = `jobs/${job.id}/${kind}-${Date.now()}-${randomUUID().slice(0, 8)}.${file.mimetype === 'image/png' ? 'png' : 'jpg'}`;
    await files.put(path, file.buffer, file.mimetype);
    const { replacedPath } = await repo.upsertJobPhoto({
      jobId: job.id,
      kind,
      storagePath: path,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedBy: req.user!.id,
    });
    if (replacedPath && replacedPath !== path) await files.remove(replacedPath).catch(() => {}); // a retake replaces the old one
    res.json({ job: jobView(job, await repo.listJobPhotos(job.id)) });
  });

  r.get('/jobs/:id/photos/:kind', auth, async (req, res) => {
    const kind = photoKindParam.parse(req.params.kind);
    const job = await myJob(req.params.id, req.user!, ['arrived', 'in_progress', 'bill_sent', 'completed']);
    await sendJobPhoto(repo, files, job.id, kind, res);
  });

  r.post('/jobs/:id/start', auth, async (req, res) => {
    const body = startJobBody.parse(req.body ?? {});
    const job = await myJob(req.params.id, req.user!, ['arrived']);
    // The before photo protects the mechanic if the customer later says something was damaged.
    if (!(await repo.listJobPhotos(job.id)).some((p) => p.kind === 'before')) {
      throw new ApiError(400, 'before_photo_required', 'Take a "before" photo of the vehicle first.');
    }
    res.json({ job: jobView(await move(job, ['arrived'], { status: 'in_progress', diagnosisNote: body.note || null })) });
  });

  r.post('/jobs/:id/bill', auth, async (req, res) => {
    const body = billBody.parse(req.body ?? {});
    // Can be re-sent (e.g. the mechanic fixes a mistake) until the customer has paid.
    const job = await myJob(req.params.id, req.user!, ['in_progress', 'bill_sent']);
    const [catalog, mine, pricing] = await Promise.all([repo.listCatalog(), repo.listServices(req.user!.id), repo.getPricing()]);
    const offered = new Set(mine.map((s) => s.serviceKey));
    const byKey = new Map(catalog.filter((c) => c.active).map((c) => [c.key, c]));
    const bad = body.serviceKeys.find((k) => !byKey.has(k) || !offered.has(k));
    if (bad) throw new ApiError(400, 'validation_error', `"${bad}" is not one of your services.`);
    if (new Set(body.serviceKeys).size !== body.serviceKeys.length) {
      throw new ApiError(400, 'validation_error', 'A service is listed twice.');
    }

    // Every amount is calculated here from Ridzo's prices — never trusted from the app.
    const bill = computeBill(
      {
        services: body.serviceKeys.map((k) => ({ label: byKey.get(k)!.name, amountRs: byKey.get(k)!.priceRs })),
        parts: body.parts.map((p) => ({ label: p.name, amountRs: p.priceRs })),
        travelRs: job.travelRs ?? 0,
        discountRs: body.discountRs,
      },
      pricing,
    );
    const updated = await move(job, ['in_progress', 'bill_sent'], {
      status: 'bill_sent',
      bill: { ...bill, serviceKeys: body.serviceKeys },
      totalRs: bill.totalRs,
      commissionRs: bill.commissionRs,
      payoutRs: bill.payoutRs,
    });
    res.json({ job: jobView(updated), bill });
  });

  r.post('/jobs/:id/complete', auth, async (req, res) => {
    const { paidBy } = completeBody.parse(req.body ?? {});
    const job = await myJob(req.params.id, req.user!, ['bill_sent']);
    // TODO(payments): card payments must be confirmed by the payment gateway's webhook, not the mechanic.
    const updated = await move(job, ['bill_sent'], { status: 'completed', paidBy, completedAt: new Date().toISOString() });
    res.json({ job: jobView(updated) });
  });

  r.post('/jobs/:id/cancel', auth, async (req, res) => {
    const { reason } = cancelJobBody.parse(req.body ?? {});
    const job = await myJob(req.params.id, req.user!, ['accepted', 'arrived']);
    await dispatcher.cancelByMechanic(job, req.user!.id);
    console.log(`[jobs] mechanic ${req.user!.id.slice(0, 8)} cancelled job ${job.id.slice(0, 8)}: ${reason}`);
    res.json({ ok: true });
  });

  r.post('/jobs/:id/rate-customer', auth, async (req, res) => {
    const { stars } = rateBody.parse(req.body ?? {});
    const job = await myJob(req.params.id, req.user!, ['completed']);
    await move(job, ['completed'], { customerRating: stars });
    res.json({ ok: true });
  });

  // ─── Dashboard ────────────────────────────────────────────────────────────

  r.get('/mechanic/dashboard', auth, async (req, res) => {
    const user = req.user!;
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [stats, mine, catalog] = await Promise.all([
      repo.mechanicStats(user.id, sriLankaDayStart(), since30d),
      repo.listServices(user.id),
      repo.listCatalog(),
    ]);
    const categories = new Set(mine.map((s) => catalog.find((c) => c.key === s.serviceKey)?.category).filter(Boolean));
    const labels = SPECIALTIES.filter((s) => categories.has(s.category)).map((s) => s.label);
    const answered = stats.offers.accepted + stats.offers.declined + stats.offers.expired;
    res.json({
      todayEarningsRs: stats.todayEarningsRs,
      todayJobs: stats.todayJobs,
      totalJobs: stats.totalJobs,
      rating: stats.rating, // null until a customer rates them
      ratingCount: stats.ratingCount,
      specialty: labels.length > 2 ? `${labels.slice(0, 2).join(' & ')} +${labels.length - 2}` : labels.join(' & ') || '—',
      acceptanceRate: answered ? Math.round((stats.offers.accepted / answered) * 100) / 100 : null,
      offersLast30Days: stats.offers,
      online: user.isOnline,
    });
  });

  return r;
}

/** Streams a private job photo. Used by the mechanic, the admin app and (later) the customer app. */
export async function sendJobPhoto(repo: Repo, files: FileStore, jobId: string, kind: PhotoKind, res: import('express').Response) {
  const photo = (await repo.listJobPhotos(jobId)).find((p) => p.kind === kind);
  const data = photo ? await files.get(photo.storagePath) : null;
  if (!photo || !data) throw new ApiError(404, 'not_found', `No ${kind} photo yet`);
  res.set({ 'Content-Type': photo.mimeType, 'Cache-Control': 'private, no-store' });
  res.send(data);
}
