// Development-only helpers so you can test every login path before the admin dashboard exists.
// Only mounted when ENABLE_DEV_ROUTES=true (and never in production).
//   POST /dev/review          { phone, decision: "approve" | "reject", reason? }
//   POST /dev/jobs            pretend to be a customer: create a breakdown request → dispatch starts
//   GET  /dev/jobs/:id        what the customer would see (status, mechanic, offers so far)
//   POST /dev/jobs/:id/cancel  { reason? } the customer cancels
//   POST /dev/jobs/:id/rematch { reason? } the customer wants a different mechanic (e.g. theirs went dark)
//   POST /dev/jobs/:id/rate   { stars } the customer rates the mechanic
//   POST /dev/tick            run one dispatcher step now (normally every 2 s)
import { Router } from 'express';
import { z } from 'zod';
import type { FileStore, Repo } from '../db/types.js';
import type { Maps } from '../services/maps.js';
import { sendJobPhoto } from './jobs.js';
import { photoKindParam } from '../validation.js';
import type { Dispatcher } from '../services/dispatch.js';
import { createJobBody, rateBody } from '../validation.js';

import { ApiError } from '../errors.js';
import { sriLankanMobile } from '../validation.js';

const body = z.object({
  phone: sriLankanMobile,
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().min(5).max(300).optional(),
});

export function devRouter(repo: Repo, files: FileStore, dispatcher: Dispatcher, maps: Maps) {
  const r = Router();

  r.post('/review', async (req, res) => {
    const { phone, decision, reason } = body.parse(req.body ?? {});
    const user = await repo.findUserByPhone(phone);
    if (!user) throw new ApiError(404, 'not_found', `No account for ${phone}`);
    const updated = await repo.updateUser(user.id, {
      status: decision === 'approve' ? 'approved' : 'rejected',
      rejectionReason: decision === 'reject' ? reason ?? 'Your documents could not be verified.' : null,
    });
    res.json({ ok: true, phone, status: updated.status });
  });

  r.post('/jobs', async (req, res) => {
    const body = createJobBody.parse(req.body ?? {});
    const catalog = await repo.listCatalog();
    // Estimate = Ridzo's price for the requested services, or the cheapest service in that category.
    const inCategory = catalog.filter((c) => c.active && c.category === body.issueCategory).map((c) => c.priceRs);
    const estimateRs = body.serviceKeys.length
      ? body.serviceKeys.reduce((sum, k) => sum + (catalog.find((c) => c.key === k)?.priceRs ?? 0), 0)
      : inCategory.length
        ? Math.min(...inCategory)
        : 0;
    const { job, offer } = await dispatcher.createJob({ ...body, estimateRs });
    res.status(201).json({ jobId: job.id, status: job.status, offeredTo: offer?.mechanicId ?? null });
  });

  r.get('/jobs/:id', async (req, res) => {
    const job = await repo.findJob(z.uuid().parse(req.params.id));
    if (!job) throw new ApiError(404, 'not_found', 'Job not found');
    const [mechanic, route, alert, photos, pricing] = await Promise.all([
      job.mechanicId ? repo.findUserById(job.mechanicId) : null,
      repo.listLocationPoints(job.id, 500),
      repo.findOpenAlert(job.id),
      repo.listJobPhotos(job.id),
      repo.getPricing(),
    ]);
    // Live "X min away" — real road distance + traffic ETA when Google Maps is configured (cached 2 min).
    const left =
      mechanic?.lastLat != null && mechanic.lastLng != null && ['accepted', 'arrived'].includes(job.status)
        ? (await maps.routesTo([{ lat: mechanic.lastLat, lng: mechanic.lastLng }], { lat: job.lat, lng: job.lng }, pricing.roadFactor))[0]
        : null;
    res.json({
      id: job.id,
      status: job.status,
      // What the customer app's "your mechanic is on the way" map will show.
      mechanic: mechanic
        ? {
            id: mechanic.id,
            name: mechanic.fullName,
            phone: mechanic.phone,
            lat: mechanic.lastLat,
            lng: mechanic.lastLng,
            locationAt: mechanic.lastSeenAt,
            kmAway: left?.km ?? null,
            etaMin: left ? Math.max(1, Math.ceil(left.durationS / 60)) : null,
            etaSource: left?.source ?? null,
          }
        : null,
      route: { points: route.length, last: route.at(-1) ?? null },
      photos: { before: photos.some((p) => p.kind === 'before'), after: photos.some((p) => p.kind === 'after') },
      // What the customer app shows if the mechanic stops sharing location on the way.
      trackingLost: alert
        ? {
            since: alert.createdAt,
            message: "Your mechanic's location hasn't updated for a while. You can wait, call them, or find another mechanic.",
            canRematch: true,
          }
        : null,
      cancelledBy: job.cancelledBy,
      cancelReason: job.cancelReason,
      distanceKm: job.distanceKm,
      travelRs: job.travelRs,
      totalRs: job.totalRs,
      searchUntil: job.searchUntil,
    });
  });

  const customerReason = z.object({ reason: z.string().trim().min(3).max(200).optional() });

  r.post('/jobs/:id/cancel', async (req, res) => {
    const { reason } = customerReason.parse(req.body ?? {});
    const job = await repo.findJob(z.uuid().parse(req.params.id));
    if (!job) throw new ApiError(404, 'not_found', 'Job not found');
    await dispatcher.cancelForCustomer(job, reason ?? 'Customer cancelled', 'customer');
    res.json({ ok: true });
  });

  r.post('/jobs/:id/rematch', async (req, res) => {
    const { reason } = customerReason.parse(req.body ?? {});
    const job = await repo.findJob(z.uuid().parse(req.params.id));
    if (!job) throw new ApiError(404, 'not_found', 'Job not found');
    const reopened = await dispatcher.rematch(job, reason ?? 'Customer asked for another mechanic');
    res.json({ ok: true, status: reopened.status });
  });

  r.post('/jobs/:id/rate', async (req, res) => {
    const { stars } = rateBody.parse(req.body ?? {});
    const id = z.uuid().parse(req.params.id);
    const job = await repo.findJob(id);
    if (!job || job.status !== 'completed') throw new ApiError(409, 'invalid_state', 'Only completed jobs can be rated.');
    await repo.updateJob(id, ['completed'], { mechanicRating: stars });
    res.json({ ok: true });
  });

  // The customer can see the mechanic's before / after photos of their own vehicle.
  r.get('/jobs/:id/photos/:kind', async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await sendJobPhoto(repo, files, id, photoKindParam.parse(req.params.kind), res);
  });

  r.post('/tick', async (_req, res) => {
    res.json(await dispatcher.tick());
  });

  return r;
}
