// Matching / dispatch, live location, the job lifecycle and the dashboard.
// Time is controlled with fake Date so 30 s timeouts and 3 min GPS limits can be tested instantly.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryFileStore, createMemoryRepo } from '../src/db/memoryRepo.js';
import type { Repo } from '../src/db/types.js';
import type { Dispatcher } from '../src/services/dispatch.js';

const config = loadConfig({
  NODE_ENV: 'test',
  JWT_SECRET: 'test-jwt-secret-test-jwt-secret-1234',
  OTP_SECRET: 'test-otp-secret-test-otp-secret-1234',
  ENABLE_DEV_ROUTES: 'true',
});

// Breakdown on Peradeniya Rd, Kandy
const BREAKDOWN = { lat: 7.2906, lng: 80.6337 };
const NEAR = { lat: 7.295, lng: 80.635 }; //  ~0.7 km by road
const FURTHER = { lat: 7.33, lng: 80.65 }; // ~6 km by road
const COLOMBO = { lat: 6.9271, lng: 79.8612 }; // ~120 km
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

let app: ReturnType<typeof createApp>;
let repo: Repo;
let dispatcher: Dispatcher;
let lastCode: Record<string, string>;
let clock: number;

const tickClock = (ms: number) => {
  clock += ms;
  vi.setSystemTime(clock);
};

beforeEach(() => {
  clock = new Date('2026-03-10T10:00:00+05:30').getTime(); // 10 am in Sri Lanka (day rate)
  vi.useFakeTimers({ now: clock, toFake: ['Date'] });
  lastCode = {};
  repo = createMemoryRepo();
  app = createApp({
    config,
    repo,
    files: createMemoryFileStore(),
    sms: {
      async send(to, m) {
        const code = m.match(/\d{6}/);
        if (code) lastCode[to] = code[0];
      },
    },
  });
  dispatcher = app.locals.dispatcher;
});
afterEach(() => vi.useRealTimers());

let phoneSeq = 0;
/** An approved mechanic, online at `at`, offering `services`. */
async function mechanic(at: { lat: number; lng: number } | null, services = ['tyre_change', 'puncture_repair'], name = 'Kasun Perera') {
  const phone = `07700000${String(++phoneSeq).padStart(2, '0')}`;
  const e164 = `+94${phone.slice(1)}`;
  tickClock(31_000); // OTP resend cooldown is per phone, but keep tests independent of order
  await request(app).post('/auth/otp/send').send({ phone }).expect(200);
  const v = (await request(app).post('/auth/otp/verify').send({ phone, code: lastCode[e164] }).expect(200)).body;
  const auth = { Authorization: `Bearer ${v.accessToken}` };
  await request(app).put('/mechanic/profile').set(auth).send({ fullName: name, serviceArea: 'Kandy' }).expect(200);
  await repo.replaceServices(v.me.user.id, services);
  await repo.updateUser(v.me.user.id, { status: 'approved' });
  if (at) await request(app).post('/mechanic/online').set(auth).send(at).expect(200);
  return { id: v.me.user.id as string, auth };
}

async function customerRequest(extra: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/dev/jobs')
    .send({
      customerName: 'Nadeesha Perera',
      customerPhone: '0711234567',
      vehicle: 'Silver Corolla',
      vehicleType: 'Sedan',
      issueSummary: 'Flat tyre on the highway',
      issueCategory: 'tyre',
      ...BREAKDOWN,
      address: 'Peradeniya Rd, Kandy',
      paymentMethod: 'cash',
      ...extra,
    })
    .expect(201);
  return res.body as { jobId: string; status: string; offeredTo: string | null };
}

const currentOffer = async (auth: Record<string, string>) => (await request(app).get('/mechanic/offers/current').set(auth).expect(200)).body.offer;

describe('matching', () => {
  it('offers the job to the nearest suitable mechanic first, one at a time', async () => {
    const far = await mechanic(FURTHER);
    const near = await mechanic(NEAR);
    await mechanic(COLOMBO); // too far
    await mechanic(NEAR, ['battery_jump']); // doesn't do tyres
    const pending = await mechanic(null); // approved but offline

    const job = await customerRequest();
    expect(job.offeredTo).toBe(near.id);

    const offer = await currentOffer(near.auth);
    expect(offer).toMatchObject({ jobId: job.jobId, state: 'pending', secondsLeft: 30, customerName: 'Nadeesha P.', travelRs: 500 });
    expect(offer.customerPhone).toBeUndefined(); // hidden until accepted
    expect(await currentOffer(far.auth)).toBeNull(); // only one mechanic is asked at a time
    expect(await currentOffer(pending.auth)).toBeNull();
  });

  it('when requested services are given, only mechanics offering all of them qualify', async () => {
    const tyresOnly = await mechanic(NEAR, ['tyre_change']);
    const both = await mechanic(FURTHER, ['tyre_change', 'battery_jump']);
    const job = await customerRequest({ serviceKeys: ['tyre_change', 'battery_jump'] });
    expect(job.offeredTo).toBe(both.id);
    expect(await currentOffer(tyresOnly.auth)).toBeNull();
  });

  it('prefers the better-rated mechanic when two are the same distance away', async () => {
    const a = await mechanic(NEAR, undefined, 'Amal Silva');
    const b = await mechanic(NEAR, undefined, 'Bimal Silva');
    // b has a 5-star completed job in the past
    const past = await repo.createJob({
      customerName: 'X Y', customerPhone: '+94711111111', vehicle: 'Car', vehicleType: 'Sedan', issueSummary: 'Flat',
      issueCategory: 'tyre', serviceKeys: [], ...BREAKDOWN, address: 'Kandy', paymentMethod: 'cash', estimateRs: 0,
      searchUntil: new Date(clock).toISOString(),
    });
    await repo.updateJob(past.id, ['searching'], { status: 'completed', mechanicId: b.id, mechanicRating: 5 });
    const job = await customerRequest();
    expect(job.offeredTo).toBe(b.id);
    expect(a.id).not.toBe(b.id);
  });

  it('switches mechanics offline when their location goes quiet for 5 minutes, and skips them', async () => {
    const quiet = await mechanic(NEAR);
    const active = await mechanic(FURTHER);
    tickClock(4 * 60_000);
    await request(app).post('/mechanic/location').set(active.auth).send({ ...FURTHER, source: 'background' }).expect(200);
    tickClock(90_000); // quiet: 5.5 min since last location, active: 1.5 min
    const r = await dispatcher.tick();
    expect(r.wentOffline).toBe(1);
    expect((await request(app).get('/me').set(quiet.auth)).body.availability.online).toBe(false);
    expect((await customerRequest()).offeredTo).toBe(active.id);
  });

  it('tells the customer when nobody accepts within 5 minutes', async () => {
    const job = await customerRequest();
    expect(job.offeredTo).toBeNull();
    tickClock(5 * 60_000 + 1000);
    await dispatcher.tick();
    expect((await request(app).get(`/dev/jobs/${job.jobId}`)).body.status).toBe('no_mechanic');
  });
});

describe('decline and time-out', () => {
  it('a decline moves the job straight to the next mechanic', async () => {
    const near = await mechanic(NEAR);
    const far = await mechanic(FURTHER);
    const job = await customerRequest();
    await request(app).post(`/jobs/${job.jobId}/decline`).set(near.auth).expect(200);
    expect((await currentOffer(far.auth)).jobId).toBe(job.jobId);
    expect(await currentOffer(near.auth)).toBeNull(); // declined jobs don't come back
  });

  it('after 30 s the job goes to the next mechanic, but the first can STILL accept while it is open', async () => {
    const near = await mechanic(NEAR);
    const far = await mechanic(FURTHER);
    const job = await customerRequest();

    tickClock(31_000);
    await dispatcher.tick();
    expect((await currentOffer(far.auth)).state).toBe('pending'); // next mechanic is being asked

    const missed = await currentOffer(near.auth);
    expect(missed).toMatchObject({ jobId: job.jobId, state: 'missed' });

    // First mechanic changes their mind and accepts after the time-out
    const accepted = (await request(app).post(`/jobs/${job.jobId}/accept`).set(near.auth).expect(200)).body.job;
    expect(accepted).toMatchObject({ status: 'accepted', customerPhone: '+94711234567', travelRs: 500 });

    // ...so the second mechanic's offer is withdrawn
    expect((await request(app).get(`/jobs/${job.jobId}/offer`).set(far.auth)).body.state).toBe('taken');
    const late = await request(app).post(`/jobs/${job.jobId}/accept`).set(far.auth).expect(409);
    expect(late.body.error.code).toBe('job_taken');
    expect(await currentOffer(far.auth)).toBeNull();
  });

  it('accept is atomic: when two mechanics accept at the same moment, exactly one wins', async () => {
    const a = await mechanic(NEAR);
    const b = await mechanic(FURTHER);
    const job = await customerRequest();
    tickClock(31_000);
    await dispatcher.tick(); // a timed out (can still accept), b now has the pending offer

    const results = await Promise.all([
      request(app).post(`/jobs/${job.jobId}/accept`).set(a.auth),
      request(app).post(`/jobs/${job.jobId}/accept`).set(b.auth),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.status === 200)!.body.job;
    expect([a.id, b.id]).toContain((await request(app).get(`/dev/jobs/${job.jobId}`)).body.mechanic.id);
    expect(winner.status).toBe('accepted');
  });

  it("can't accept a job that was never offered, or once the request is closed", async () => {
    const near = await mechanic(NEAR);
    const stranger = await mechanic(COLOMBO);
    const job = await customerRequest();
    await request(app).post(`/jobs/${job.jobId}/accept`).set(stranger.auth).expect(404);
    await request(app).post(`/dev/jobs/${job.jobId}/cancel`).expect(200);
    const res = await request(app).post(`/jobs/${job.jobId}/accept`).set(near.auth).expect(409);
    expect(res.body.error.code).toBe('job_closed');
  });

  it('going offline hands a pending offer to the next mechanic immediately', async () => {
    const near = await mechanic(NEAR);
    const far = await mechanic(FURTHER);
    const job = await customerRequest();
    await request(app).post('/mechanic/offline').set(near.auth).expect(200);
    expect((await currentOffer(far.auth)).jobId).toBe(job.jobId);
  });

  it('a busy mechanic is not offered another job and cannot take two', async () => {
    const m = await mechanic(NEAR);
    const first = await customerRequest();
    await request(app).post(`/jobs/${first.jobId}/accept`).set(m.auth).expect(200);
    const second = await customerRequest({ customerPhone: '0712222222' });
    expect(second.offeredTo).toBeNull();
  });
});

describe('job lifecycle and dashboard', () => {
  it('runs a job end to end; the server calculates the bill and the dashboard updates', async () => {
    const m = await mechanic(NEAR);
    const job = await customerRequest();
    await request(app).post(`/jobs/${job.jobId}/accept`).set(m.auth).expect(200);

    // App restart → resume
    expect((await request(app).get('/mechanic/active-job').set(m.auth)).body.job.id).toBe(job.jobId);

    // Steps must happen in order
    await request(app).post(`/jobs/${job.jobId}/start`).set(m.auth).send({}).expect(409);
    await request(app).post(`/jobs/${job.jobId}/arrived`).set(m.auth).expect(200);
    // A before photo is required to start
    const noPhoto = await request(app).post(`/jobs/${job.jobId}/start`).set(m.auth).send({}).expect(400);
    expect(noPhoto.body.error.code).toBe('before_photo_required');
    await request(app).post(`/jobs/${job.jobId}/photos/before`).set(m.auth).attach('file', JPEG, { filename: 'b.jpg', contentType: 'image/jpeg' }).expect(200);
    await request(app).post(`/jobs/${job.jobId}/start`).set(m.auth).send({ note: 'Rear left tyre, nail' }).expect(200);

    // Only the mechanic's own services, at Ridzo's price; amounts from the app are ignored
    await request(app).post(`/jobs/${job.jobId}/bill`).set(m.auth).send({ serviceKeys: ['battery_jump'] }).expect(400);
    const billed = (
      await request(app)
        .post(`/jobs/${job.jobId}/bill`)
        .set(m.auth)
        .send({ serviceKeys: ['tyre_change'], parts: [{ name: 'Tyre valve', priceRs: 300 }], discountRs: 0, totalRs: 1 })
        .expect(200)
    ).body.bill;
    expect(billed).toMatchObject({ servicesRs: 4000, partsRs: 300, travelRs: 500, totalRs: 4800, commissionRs: 430, payoutRs: 4370 });

    await request(app).post(`/jobs/${job.jobId}/complete`).set(m.auth).send({ paidBy: 'cash' }).expect(200);
    await request(app).post(`/jobs/${job.jobId}/rate-customer`).set(m.auth).send({ stars: 5 }).expect(200);
    await request(app).post(`/dev/jobs/${job.jobId}/rate`).send({ stars: 4 }).expect(200);
    expect((await request(app).get('/mechanic/active-job').set(m.auth)).body.job).toBeNull();

    const dash = (await request(app).get('/mechanic/dashboard').set(m.auth).expect(200)).body;
    expect(dash).toMatchObject({
      todayEarningsRs: 4370,
      todayJobs: 1,
      rating: 4,
      specialty: 'Tyres',
      acceptanceRate: 1,
    });
  });

  it('acceptance rate counts declines and time-outs', async () => {
    const m = await mechanic(NEAR);
    const j1 = await customerRequest();
    await request(app).post(`/jobs/${j1.jobId}/decline`).set(m.auth).expect(200);
    await customerRequest({ customerPhone: '0712222222' });
    tickClock(31_000);
    await dispatcher.tick(); // expired
    const j3 = await customerRequest({ customerPhone: '0713333333' });
    await request(app).post(`/jobs/${j3.jobId}/accept`).set(m.auth).expect(200);
    const dash = (await request(app).get('/mechanic/dashboard').set(m.auth)).body;
    expect(dash.offersLast30Days).toEqual({ accepted: 1, declined: 1, expired: 1 });
    expect(dash.acceptanceRate).toBe(0.33);
  });

  it('if the mechanic cancels after accepting, the job goes to someone else', async () => {
    const near = await mechanic(NEAR);
    const far = await mechanic(FURTHER);
    const job = await customerRequest();
    await request(app).post(`/jobs/${job.jobId}/accept`).set(near.auth).expect(200);
    await request(app).post(`/jobs/${job.jobId}/cancel`).set(near.auth).send({ reason: 'Bike broke down' }).expect(200);
    expect((await currentOffer(far.auth)).jobId).toBe(job.jobId);
    expect((await request(app).get(`/dev/jobs/${job.jobId}`)).body.status).toBe('searching');
  });
});

describe('location tracking', () => {
  it('updates location without switching anyone online, and rejects places outside Sri Lanka', async () => {
    const m = await mechanic(null);
    const res = await request(app).post('/mechanic/location').set(m.auth).send(NEAR).expect(200);
    expect(res.body.online).toBe(false);
    await request(app).post('/mechanic/location').set(m.auth).send({ lat: 51.5, lng: -0.12 }).expect(400);
    await request(app).post('/mechanic/online').set(m.auth).send({}).expect(400);
  });

  it('accepts background points, ignores late/out-of-order ones, and rejects future timestamps', async () => {
    const m = await mechanic(NEAR);
    const at = (msAgo: number) => new Date(clock - msAgo).toISOString();
    // newer point from the background task (heading/speed -1 = unknown on phones)
    let r = await request(app)
      .post('/mechanic/location')
      .set(m.auth)
      .send({ ...FURTHER, source: 'background', recordedAt: at(0), heading: -1, speedMps: -1, accuracyM: 12 })
      .expect(200);
    expect(r.body.accepted).toBe(true);
    // a delayed point taken earlier arrives afterwards → must not move the mechanic back
    r = await request(app).post('/mechanic/location').set(m.auth).send({ ...NEAR, source: 'background', recordedAt: at(60_000) }).expect(200);
    expect(r.body.accepted).toBe(false);
    const job = await customerRequest();
    expect((await currentOffer(m.auth)).distanceKm).toBeGreaterThan(5); // still at FURTHER
    expect(job.offeredTo).toBe(m.id);
    await request(app).post('/mechanic/location').set(m.auth).send({ ...NEAR, recordedAt: new Date(clock + 5 * 60_000).toISOString() }).expect(400);
  });

  it('records the route while on a job so the customer can follow the mechanic', async () => {
    const m = await mechanic(FURTHER);
    const job = await customerRequest();
    // before accepting: no route
    await request(app).post('/mechanic/location').set(m.auth).send(FURTHER).expect(200);
    await request(app).post(`/jobs/${job.jobId}/accept`).set(m.auth).expect(200);
    for (const p of [
      { lat: 7.32, lng: 80.645 },
      { lat: 7.305, lng: 80.64 },
      { lat: 7.295, lng: 80.636 },
    ]) {
      tickClock(15_000);
      const r = await request(app).post('/mechanic/location').set(m.auth).send({ ...p, source: 'background' }).expect(200);
      expect(r.body.onJob).toBe(true);
    }
    const seen = (await request(app).get(`/dev/jobs/${job.jobId}`)).body;
    expect(seen.route.points).toBe(3);
    expect(seen.route.last).toMatchObject({ lat: 7.295, source: 'background' });
    expect(seen.mechanic.kmAway).toBeLessThan(1.5);
    expect(seen.mechanic.etaMin).toBeGreaterThanOrEqual(1);
    expect(seen.mechanic.etaSource).toBe('estimate'); // no Google key in tests
  });
});

describe('profile', () => {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

  it('locks the name after approval but allows email and area changes', async () => {
    const m = await mechanic(null);
    const locked = await request(app).put('/mechanic/profile').set(m.auth).send({ fullName: 'Someone Else', serviceArea: 'Kandy' }).expect(409);
    expect(locked.body.error.code).toBe('name_locked');
    const ok = await request(app)
      .put('/mechanic/profile')
      .set(m.auth)
      .send({ fullName: 'Kasun Perera', email: 'kasun@mail.com', serviceArea: 'Matale' })
      .expect(200);
    expect(ok.body.user).toMatchObject({ email: 'kasun@mail.com', serviceArea: 'Matale' });
  });

  it('uploads and serves a profile photo', async () => {
    const m = await mechanic(null);
    await request(app).get('/mechanic/avatar').set(m.auth).expect(404);
    await request(app).post('/mechanic/avatar').set(m.auth).attach('file', Buffer.from('nope'), { filename: 'a.png', contentType: 'image/png' }).expect(400);
    await request(app).post('/mechanic/avatar').set(m.auth).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' }).expect(200);
    const img = await request(app).get('/mechanic/avatar').set(m.auth).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect((await request(app).get('/mechanic/profile').set(m.auth)).body.hasAvatar).toBe(true);
  });
});
