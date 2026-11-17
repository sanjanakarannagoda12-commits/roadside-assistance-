// Admin review (per-document), suspension, Ridzo price list, and the "only approved can go online" rule.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryFileStore, createMemoryRepo } from '../src/db/memoryRepo.js';
import { hashPassword } from '../src/services/passwords.js';
import type { Repo } from '../src/db/types.js';

const config = loadConfig({
  NODE_ENV: 'test',
  JWT_SECRET: 'test-jwt-secret-test-jwt-secret-1234',
  OTP_SECRET: 'test-otp-secret-test-otp-secret-1234',
});

const ADMIN_EMAIL = 'ops@ridzo.lk';
const ADMIN_PASSWORD = 'correct-horse-42';
let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword(ADMIN_PASSWORD);
});

let app: ReturnType<typeof createApp>;
let repo: Repo;
let sent: { to: string; message: string }[];

beforeEach(async () => {
  sent = [];
  repo = createMemoryRepo();
  await repo.createAdmin({ email: ADMIN_EMAIL, fullName: 'Ops Admin', passwordHash });
  app = createApp({
    config,
    repo,
    files: createMemoryFileStore(),
    sms: {
      async send(to, message) {
        sent.push({ to, message });
      },
    },
  });
});

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const ALL_OK = { nic: { status: 'approved' }, license: { status: 'approved' }, certificate: { status: 'approved' }, toolkit: { status: 'approved' } };

async function adminToken() {
  const res = await request(app).post('/admin/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }).expect(200);
  return { Authorization: `Bearer ${res.body.token}` };
}

/** Signs up a mechanic and submits them for review. Returns their auth header and id. */
async function pendingMechanic(phone = '0771234567') {
  await request(app).post('/auth/otp/send').send({ phone }).expect(200);
  const code = sent.at(-1)!.message.match(/\d{6}/)![0];
  const login = (await request(app).post('/auth/otp/verify').send({ phone, code }).expect(200)).body;
  const auth = { Authorization: `Bearer ${login.accessToken}` };
  await request(app).put('/mechanic/profile').set(auth).send({ fullName: 'Kasun Ranasinghe', serviceArea: 'Kandy' }).expect(200);
  for (const doc of ['nic', 'license', 'certificate', 'toolkit']) {
    await request(app).post(`/mechanic/documents/${doc}`).set(auth).attach('file', JPEG, { filename: `${doc}.jpg`, contentType: 'image/jpeg' }).expect(200);
  }
  await request(app).put('/mechanic/services').set(auth).send({ serviceKeys: ['tyre_change'] }).expect(200);
  await request(app).post('/mechanic/submit').set(auth).expect(200);
  return { auth, id: login.me.user.id as string };
}

describe('admin login', () => {
  it('accepts the right password and refuses wrong ones with the same message', async () => {
    await adminToken();
    const wrongPw = await request(app).post('/admin/auth/login').send({ email: ADMIN_EMAIL, password: 'nope' }).expect(401);
    const wrongEmail = await request(app).post('/admin/auth/login').send({ email: 'x@ridzo.lk', password: ADMIN_PASSWORD }).expect(401);
    expect(wrongPw.body.error.message).toBe(wrongEmail.body.error.message);
  });

  it('keeps mechanic and admin tokens apart', async () => {
    const { auth: mechanic } = await pendingMechanic();
    const admin = await adminToken();
    await request(app).get('/admin/mechanics').expect(401);
    await request(app).get('/admin/mechanics').set(mechanic).expect(401);
    await request(app).get('/me').set(admin).expect(401);
  });
});

describe('per-document review', () => {
  it('rejects one document with a reason, the mechanic sees it and must replace it', async () => {
    const { auth, id } = await pendingMechanic();
    const admin = await adminToken();

    const queue = (await request(app).get('/admin/mechanics?status=pending_review').set(admin).expect(200)).body;
    expect(queue.rows.map((r: any) => r.id)).toEqual([id]);

    const file = await request(app).get(`/admin/mechanics/${id}/documents/nic`).set(admin).expect(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['cache-control']).toContain('no-store');

    const review = (
      await request(app)
        .post(`/admin/mechanics/${id}/review`)
        .set(admin)
        .send({ documents: { ...ALL_OK, nic: { status: 'rejected', reason: 'Photo is blurry' } } })
        .expect(200)
    ).body;
    expect(review.mechanic.status).toBe('rejected');
    expect(review.notified).toBe(true);
    expect(sent.at(-1)!.message).toContain('re-upload your NIC');

    // What the mechanic app sees
    let me = (await request(app).get('/me').set(auth).expect(200)).body;
    expect(me.user.status).toBe('rejected');
    expect(me.onboarding.documents.nic).toMatchObject({ status: 'rejected', reason: 'Photo is blurry' });
    expect(me.onboarding.documents.license.status).toBe('approved');
    expect(me.onboarding.documentsToFix).toEqual(['nic']);
    expect(me.onboarding.nextStep).toBe('documents');

    // Can't resubmit until the NIC is replaced
    await request(app).post('/mechanic/submit').set(auth).expect(400);
    me = (
      await request(app).post('/mechanic/documents/nic').set(auth).attach('file', JPEG, { filename: 'nic.jpg', contentType: 'image/jpeg' }).expect(200)
    ).body;
    expect(me.onboarding.documents.nic).toMatchObject({ status: 'uploaded', reason: null });
    await request(app).post('/mechanic/submit').set(auth).expect(200);

    // Second review approves everything
    const approved = (await request(app).post(`/admin/mechanics/${id}/review`).set(admin).send({ documents: ALL_OK }).expect(200)).body;
    expect(approved.mechanic.status).toBe('approved');
    expect(approved.history.map((h: any) => h.action)).toEqual(['mechanic.approve', 'mechanic.reject']);
    expect(sent.at(-1)!.message).toContain('approved');
  });

  it('requires a reason for every rejected document and a decision for every document', async () => {
    const { id } = await pendingMechanic();
    const admin = await adminToken();
    await request(app).post(`/admin/mechanics/${id}/review`).set(admin).send({ documents: { ...ALL_OK, nic: { status: 'rejected' } } }).expect(400);
    await request(app).post(`/admin/mechanics/${id}/review`).set(admin).send({ documents: { nic: { status: 'approved' } } }).expect(400);
  });

  it('refuses to review someone who is not pending (e.g. a second admin clicking too late)', async () => {
    const { id } = await pendingMechanic();
    const admin = await adminToken();
    await request(app).post(`/admin/mechanics/${id}/review`).set(admin).send({ documents: ALL_OK }).expect(200);
    const again = await request(app).post(`/admin/mechanics/${id}/review`).set(admin).send({ documents: ALL_OK }).expect(409);
    expect(again.body.error.code).toBe('not_pending');
    await request(app).get('/admin/mechanics/not-a-uuid').set(admin).expect(400);
  });
});

describe('only approved mechanics can go online', () => {
  it('blocks pending mechanics, allows approved ones, and suspension forces them offline', async () => {
    const { auth, id } = await pendingMechanic();
    const admin = await adminToken();

    const KANDY = { lat: 7.29, lng: 80.63 };
    const blocked = await request(app).post('/mechanic/availability').set(auth).send({ online: true, ...KANDY }).expect(403);
    expect(blocked.body.error.code).toBe('not_approved');

    await request(app).post(`/admin/mechanics/${id}/review`).set(admin).send({ documents: ALL_OK }).expect(200);
    const on = await request(app).post('/mechanic/availability').set(auth).send({ online: true, lat: 7.29, lng: 80.63 }).expect(200);
    expect(on.body.online).toBe(true);
    expect((await request(app).get('/me').set(auth)).body.availability).toMatchObject({ online: true, canGoOnline: true });

    await request(app).post(`/admin/mechanics/${id}/suspend`).set(admin).send({ reason: 'Customer complaints' }).expect(200);
    const me = (await request(app).get('/me').set(auth)).body;
    expect(me.user.status).toBe('suspended');
    expect(me.availability.online).toBe(false);
    await request(app).post('/mechanic/availability').set(auth).send({ online: true, ...KANDY }).expect(403);
    await request(app).post('/mechanic/availability').set(auth).send({ online: false }).expect(200); // going offline is always fine

    await request(app).post(`/admin/mechanics/${id}/reinstate`).set(admin).expect(200);
    const noGps = await request(app).post('/mechanic/availability').set(auth).send({ online: true }).expect(400);
    expect(noGps.body.error.code).toBe('location_required');
    await request(app).post('/mechanic/availability').set(auth).send({ online: true, ...KANDY }).expect(200);
  });

  it('rejects locations outside Sri Lanka', async () => {
    const { auth } = await pendingMechanic();
    await request(app).post('/mechanic/availability').set(auth).send({ online: false, lat: 0, lng: 0 }).expect(400);
  });
});

describe('Ridzo price list and pricing settings', () => {
  it('admin price changes show up for mechanics and in /catalog', async () => {
    const { auth } = await pendingMechanic();
    const admin = await adminToken();

    await request(app).patch('/admin/catalog/tyre_change').set(admin).send({ priceRs: 4500 }).expect(200);
    await request(app).patch('/admin/catalog/tyre_change').set(admin).send({ priceRs: 50 }).expect(400);
    await request(app).patch('/admin/catalog/unknown').set(admin).send({ priceRs: 500 }).expect(404);

    expect((await request(app).get('/me').set(auth)).body.services[0].priceRs).toBe(4500);
    const catalog = (await request(app).get('/catalog')).body;
    expect(catalog.services.find((s: any) => s.key === 'tyre_change').priceRs).toBe(4500);

    // A hidden service disappears from /catalog and can't be chosen
    await request(app).patch('/admin/catalog/lockout').set(admin).send({ active: false }).expect(200);
    expect((await request(app).get('/catalog')).body.specialties.map((s: any) => s.category)).not.toContain('lockout');
    await request(app).put('/mechanic/services').set(auth).send({ serviceKeys: ['lockout'] }).expect(400);
  });

  it('updates the travel formula and refuses a cap below the base fee', async () => {
    const admin = await adminToken();
    const res = (await request(app).put('/admin/pricing').set(admin).send({ travelPerKmRs: 100 }).expect(200)).body;
    expect(res.pricing.travelPerKmRs).toBe(100);
    expect(res.examples.find((e: any) => e.distanceKm === 10).dayRs).toBe(1200); // 500 + 7 × 100
    await request(app).put('/admin/pricing').set(admin).send({ travelCapRs: 100 }).expect(400);
    await request(app).put('/admin/pricing').set(admin).send({ commissionRate: 0.9 }).expect(400);

    const quote = (await request(app).post('/pricing/quote').send({ serviceKeys: ['tyre_change'], distanceKm: 10, at: '2026-03-10T14:00:00+05:30' })).body;
    expect(quote.travel.travelRs).toBe(1200);
  });
});
