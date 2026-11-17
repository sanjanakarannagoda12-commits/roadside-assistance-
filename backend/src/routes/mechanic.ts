// Mechanic profile + onboarding (all require login):
//   GET  /me
//   PUT  /mechanic/profile               { fullName, email?, serviceArea }
//   POST /mechanic/documents/:docType    multipart field "file" (jpg/png/heic/pdf, ≤ 5 MB)
//   PUT  /mechanic/services              { serviceKeys: ["tyre_change", ...] }  (prices are set by Ridzo)
//   POST /mechanic/submit                → status becomes pending_review
//   POST /mechanic/availability          { online, lat?, lng? }  — only approved mechanics can go online
//   POST /mechanic/online  { lat, lng }   POST /mechanic/offline   (same thing, shorter)
//   POST /mechanic/location              { lat, lng, ... }  — sent every ~15 s while online (also the heartbeat)
//   GET  /mechanic/profile               PUT /mechanic/profile (above)
//   POST /mechanic/avatar  (multipart "file", JPG/PNG ≤ 2 MB)   GET /mechanic/avatar
//   GET  /mechanic/services              what I offer + Ridzo's full price list
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import type { FileStore, Repo, User } from '../db/types.js';
import { STALE_LOCATION_MS, type Dispatcher } from '../services/dispatch.js';
import { ApiError } from '../errors.js';
import { buildMe } from '../services/profile.js';
import {
  ALLOWED_DOC_MIME,
  MAX_DOC_BYTES,
  availabilityBody,
  docTypeParam,
  locationBody,
  profileBody,
  servicesBody,
  sriLankaLat,
  sriLankaLng,
} from '../validation.js';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') cb(null, true);
    else cb(new ApiError(400, 'invalid_file', 'Use a JPG or PNG photo.'));
  },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOC_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DOC_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new ApiError(400, 'invalid_file', 'Upload a JPG, PNG, HEIC photo or a PDF.'));
  },
});

/** Checks the file's first bytes really match its claimed type (stops renamed files). */
function looksLike(mime: string, buf: Buffer): boolean {
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/png') return buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (mime === 'application/pdf') return buf.subarray(0, 4).toString('latin1') === '%PDF';
  if (mime === 'image/heic' || mime === 'image/heif') return buf.subarray(4, 8).toString('latin1') === 'ftyp';
  return false;
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

export function mechanicRouter(repo: Repo, files: FileStore, auth: RequestHandler, dispatcher: Dispatcher) {
  const r = Router();

  const assertCanEditOnboarding = (status: string) => {
    if (status !== 'onboarding' && status !== 'rejected') {
      throw new ApiError(409, 'onboarding_locked', 'Your documents are already submitted for review.');
    }
  };

  r.get('/me', auth, async (req, res) => {
    res.json(await buildMe(repo, req.user!));
  });

  r.get('/mechanic/profile', auth, async (req, res) => {
    const me = await buildMe(repo, req.user!);
    res.json({ ...me.user, hasAvatar: Boolean(req.user!.avatarPath) });
  });

  r.put('/mechanic/profile', auth, async (req, res) => {
    const body = profileBody.parse(req.body ?? {});
    const user = req.user!;
    // Once Ridzo has checked the NIC, the name must keep matching it.
    if ((user.status === 'approved' || user.status === 'suspended' || user.status === 'pending_review') && user.fullName && body.fullName !== user.fullName) {
      throw new ApiError(409, 'name_locked', 'Your name must match your NIC. Contact Ridzo support to change it.', {
        fields: { fullName: 'Contact Ridzo support to change your name' },
      });
    }
    const updated = await repo.updateUser(user.id, {
      fullName: body.fullName,
      email: body.email,
      serviceArea: body.serviceArea,
    });
    res.json(await buildMe(repo, updated));
  });

  r.post('/mechanic/avatar', auth, avatarUpload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file || file.size === 0) throw new ApiError(400, 'invalid_file', 'Choose a photo to upload.');
    if (!looksLike(file.mimetype, file.buffer)) throw new ApiError(400, 'invalid_file', "That file doesn't look like a real photo.");
    const path = `${req.user!.id}/avatar-${Date.now()}-${randomUUID().slice(0, 8)}.${EXT[file.mimetype]}`;
    await files.put(path, file.buffer, file.mimetype);
    const old = req.user!.avatarPath;
    const user = await repo.updateUser(req.user!.id, { avatarPath: path });
    if (old && old !== path) await files.remove(old).catch(() => {});
    res.json({ ok: true, me: await buildMe(repo, user) });
  });

  r.get('/mechanic/avatar', auth, async (req, res) => {
    const path = req.user!.avatarPath;
    const data = path ? await files.get(path) : null;
    if (!path || !data) throw new ApiError(404, 'not_found', 'No profile photo yet');
    res.set({ 'Content-Type': path.endsWith('.png') ? 'image/png' : 'image/jpeg', 'Cache-Control': 'private, max-age=300' });
    res.send(data);
  });

  r.get('/mechanic/services', auth, async (req, res) => {
    const [me, catalog] = await Promise.all([buildMe(repo, req.user!), repo.listCatalog()]);
    res.json({
      services: me.services,
      catalog: catalog.filter((c) => c.active).map(({ key, category, name, durationLabel, priceRs }) => ({ key, category, name, durationLabel, priceRs })),
    });
  });

  r.post('/mechanic/documents/:docType', auth, upload.single('file'), async (req, res) => {
    const docType = docTypeParam.parse(req.params.docType);
    assertCanEditOnboarding(req.user!.status);
    const file = req.file;
    if (!file) throw new ApiError(400, 'invalid_file', 'Choose a file to upload.');
    if (file.size === 0) throw new ApiError(400, 'invalid_file', 'That file is empty.');
    if (!looksLike(file.mimetype, file.buffer)) {
      throw new ApiError(400, 'invalid_file', "That file doesn't look like a real photo or PDF.");
    }

    const path = `${req.user!.id}/${docType}-${Date.now()}.${EXT[file.mimetype]}`;
    await files.put(path, file.buffer, file.mimetype);
    await repo.upsertDocument({
      userId: req.user!.id,
      docType,
      storagePath: path,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });
    res.json(await buildMe(repo, req.user!));
  });

  r.put('/mechanic/services', auth, async (req, res) => {
    const { serviceKeys } = servicesBody.parse(req.body ?? {});
    const available = new Set((await repo.listCatalog()).filter((c) => c.active).map((c) => c.key));
    const fields: Record<string, string> = {};
    const seen = new Set<string>();
    serviceKeys.forEach((key, i) => {
      if (!available.has(key)) fields[`serviceKeys.${i}`] = 'This service is not offered by Ridzo';
      else if (seen.has(key)) fields[`serviceKeys.${i}`] = 'Service listed twice';
      seen.add(key);
    });
    if (Object.keys(fields).length) {
      throw new ApiError(400, 'validation_error', Object.values(fields)[0], { fields });
    }
    await repo.replaceServices(req.user!.id, serviceKeys);
    res.json(await buildMe(repo, req.user!));
  });

  /** Going online needs approval AND a current location (the dispatcher matches by distance). */
  const setOnline = async (user: User, online: boolean, lat?: number, lng?: number) => {
    if (online && user.status !== 'approved') {
      const message =
        user.status === 'suspended'
          ? 'Your account is suspended. Contact Ridzo support.'
          : 'You can go online once Ridzo has approved your documents.';
      throw new ApiError(403, 'not_approved', message, { status: user.status });
    }
    if (online && (lat === undefined || lng === undefined)) {
      throw new ApiError(400, 'location_required', 'Turn on location so Ridzo can send you nearby jobs.');
    }
    const location = lat !== undefined && lng !== undefined ? { lastLat: lat, lastLng: lng } : {};
    const updated = await repo.updateUser(user.id, { isOnline: online, lastSeenAt: new Date().toISOString(), ...location });
    if (!online) await dispatcher.releaseOffersOf(user.id); // don't make a customer wait 30 s for nothing
    return { online: updated.isOnline, lastSeenAt: updated.lastSeenAt };
  };

  r.post('/mechanic/availability', auth, async (req, res) => {
    const { online, lat, lng } = availabilityBody.parse(req.body ?? {});
    res.json(await setOnline(req.user!, online, lat, lng));
  });

  r.post('/mechanic/online', auth, async (req, res) => {
    const { lat, lng } = z.object({ lat: sriLankaLat, lng: sriLankaLng }).parse(req.body ?? {});
    res.json(await setOnline(req.user!, true, lat, lng));
  });

  r.post('/mechanic/offline', auth, async (req, res) => {
    res.json(await setOnline(req.user!, false));
  });

  // Live location. Sent every ~15 s while online — from the app, or from the background task when the
  // mechanic is in another app / the screen is locked. It is also the "still here" heartbeat.
  r.post('/mechanic/location', auth, async (req, res) => {
    const body = locationBody.parse(req.body ?? {});
    const user = req.user!;
    const now = Date.now();
    const recordedMs = body.recordedAt ? new Date(body.recordedAt).getTime() : now;
    if (recordedMs > now + 60_000) throw new ApiError(400, 'validation_error', 'Location time is in the future.');
    const recordedAt = new Date(Math.min(recordedMs, now)).toISOString();

    // Background points can arrive late or out of order — never move the mechanic "back in time".
    const newest = !user.lastSeenAt || recordedAt >= user.lastSeenAt;
    const fresh = now - recordedMs < STALE_LOCATION_MS;
    let updated = user;
    if (newest && fresh) {
      // Location keeps an online mechanic online. It never switches anyone online by itself.
      updated = await repo.updateUser(user.id, { lastLat: body.lat, lastLng: body.lng, lastSeenAt: recordedAt });
    }

    // Record the route while on a job (customer tracking, ETA, disputes).
    const job = await repo.activeJobFor(user.id);
    if (job) {
      await repo.addLocationPoint({
        jobId: job.id,
        mechanicId: user.id,
        lat: body.lat,
        lng: body.lng,
        accuracyM: body.accuracyM ?? null,
        speedMps: body.speedMps ?? null,
        heading: body.heading ?? null,
        source: body.source,
        recordedAt,
      });
    }
    res.json({ online: updated.isOnline, accepted: newest && fresh, onJob: Boolean(job), lastSeenAt: updated.lastSeenAt });
  });

  r.post('/mechanic/submit', auth, async (req, res) => {
    assertCanEditOnboarding(req.user!.status);
    const me = await buildMe(repo, req.user!);
    if (me.onboarding.nextStep !== 'submit') {
      throw new ApiError(400, 'onboarding_incomplete', 'Finish all onboarding steps before submitting.', {
        nextStep: me.onboarding.nextStep,
      });
    }
    const user = await repo.updateUser(req.user!.id, {
      status: 'pending_review',
      rejectionReason: null,
      submittedAt: new Date().toISOString(),
    });
    res.json(await buildMe(repo, user));
  });

  return r;
}
