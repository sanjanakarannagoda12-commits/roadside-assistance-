// "Mechanic went dark" alerts, customer re-match / cancel, and support actions.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryFileStore, createMemoryRepo } from '../src/db/memoryRepo.js';
import { hashPassword } from '../src/services/passwords.js';
import type { Repo } from '../src/db/types.js';
import type { Dispatcher } from '../src/services/dispatch.js';

const config = loadConfig({
  NODE_ENV: 'test',
  JWT_SECRET: 'test-jwt-secret-test-jwt-secret-1234',
  OTP_SECRET: 'test-otp-secret-test-otp-secret-1234',
  ENABLE_DEV_ROUTES: 'true',
});

const BREAKDOWN = { lat: 7.2906, lng: 80.6337 };
const NEAR = { lat: 7.295, lng: 80.635 };
const FURTHER = { lat: 7.33, lng: 80.65 };

let app: ReturnType<typeof createApp>;
let repo: Repo;
let dispatcher: Dispatcher;
let sms: { to: string; message: string }[];
let clock: number;
let passwordHash: string;
const tickClock = (ms: number) => {
  clock += ms;
  vi.setSystemTime(clock);
};

beforeAll(async () => {
  passwordHash = await hashPassword('admin-password-123');
});

beforeEach(async () => {
  clock = new Date('2026-03-10T10:00:00+05:30').getTime();
  vi.useFakeTimers({ now: clock, toFake: ['Date'] });
  sms = [];
  repo = createMemoryRepo();
  await repo.createAdmin({ email: 'ops@ridzo.lk', fullName: 'Ops Admin', passwordHash });
  app = createApp({
    config,
    repo,
    files: createMemoryFileStore(),
    sms: {
      async send(to, message) {
        sms.push({ to, message });
      },
    },
  });
  dispatcher = app.locals.dispatcher;
});
afterEach(() => vi.useRealTimers());

let seq = 0;
async function mechanic(at: { lat: number; lng: number }) {
  const phone = `07700001${String(++seq).padStart(2, '0')}`;
  tickClock(31_000);
  await request(app).post('/auth/otp/send').send({ phone }).expect(200);
  const code = sms.at(-1)!.message.match(/\d{6}/)![0];
  const v = (await request(app).post('/auth/otp/verify').send({ phone, code }).expect(200)).body;
  const auth = { Authorization: `Bearer ${v.accessToken}` };
  await request(app).put('/mechanic/profile').set(auth).send({ fullName: 'Kasun Perera', serviceArea: 'Kandy' }).expect(200);
  await repo.replaceServices(v.me.user.id, ['tyre_change']);
  await repo.updateUser(v.me.user.id, { status: 'approved' });
  await request(app).post('/mechanic/online').set(auth).send(at).expect(200);
  return { id: v.me.user.id as string, phone: v.me.user.phone as string, auth };
}

async function acceptedJob() {
  const near = await mechanic(NEAR);
  const far = await mechanic(FURTHER);
  const job = (
    await request(app)
      .post('/dev/jobs')
      .send({
        customerName: 'Nadeesha Perera',
        customerPhone: '0711234567',
        vehicle: 'Silver Corolla',
        vehicleType: 'Sedan',
        issueSummary: 'Flat tyre',
        issueCategory: 'tyre',
        ...BREAKDOWN,
        address: 'Kandy',
        paymentMethod: 'cash',
      })
      .expect(201)
  ).body;
  await request(app).post(`/jobs/${job.jobId}/accept`).set(near.auth).expect(200);
  return { jobId: job.jobId as string, near, far };
}

async function admin() {
  const res = await request(app).post('/admin/auth/login').send({ email: 'ops@ridzo.lk', password: 'admin-password-123' }).expect(200);
  return { Authorization: `Bearer ${res.body.token}` };
}

const customerView = async (jobId: string) => (await request(app).get(`/dev/jobs/${jobId}`)).body;

describe('mechanic goes dark on the way', () => {
  it('opens an alert after 10 min without location, texts the mechanic, and closes it when location returns', async () => {
    const { jobId, near } = await acceptedJob();

    tickClock(9 * 60_000);
    expect((await dispatcher.checkTracking(clock)).opened).toBe(0); // not yet
    expect((await customerView(jobId)).trackingLost).toBeNull();

    tickClock(2 * 60_000);
    expect((await dispatcher.checkTracking(clock)).opened).toBe(1);
    expect(sms.at(-1)).toMatchObject({ to: near.phone });
    expect(sms.at(-1)!.message).toContain("Nadeesha can't see you");
    expect((await customerView(jobId)).trackingLost).toMatchObject({ canRematch: true });
    expect((await dispatcher.checkTracking(clock)).opened).toBe(0); // only one alert, one SMS

    const a = await admin();
    const alerts = (await request(app).get('/admin/alerts').set(a).expect(200)).body.alerts;
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: 'tracking_lost', job: { id: jobId, customerPhone: '+94711234567' }, mechanic: { id: near.id } });
    expect(alerts[0].minutesSinceLocation).toBeGreaterThanOrEqual(10);
    expect((await request(app).get('/admin/stats').set(a)).body.openAlerts).toBe(1);

    // Mechanic opens the app again → location → alert closes by itself
    await request(app).post('/mechanic/location').set(near.auth).send({ lat: 7.293, lng: 80.634 }).expect(200);
    expect((await dispatcher.checkTracking(clock)).resolved).toBe(1);
    expect((await customerView(jobId)).trackingLost).toBeNull();
  });

  it('does not alert once the mechanic has arrived', async () => {
    const { jobId, near } = await acceptedJob();
    await request(app).post(`/jobs/${jobId}/arrived`).set(near.auth).expect(200);
    tickClock(30 * 60_000);
    expect((await dispatcher.checkTracking(clock)).opened).toBe(0);
  });
});

describe('customer re-match and cancel', () => {
  it('re-matches to another mechanic; the first is told and never offered it again', async () => {
    const { jobId, near, far } = await acceptedJob();
    tickClock(11 * 60_000);
    await request(app).post('/mechanic/location').set(far.auth).send(FURTHER).expect(200); // far is still around
    await dispatcher.checkTracking(clock);

    await request(app).post(`/dev/jobs/${jobId}/rematch`).send({ reason: 'Mechanic not moving' }).expect(200);
    expect(sms.some((m) => m.to === near.phone && m.message.includes('given to another mechanic'))).toBe(true);

    // The first mechanic's app learns it's no longer theirs
    const mine = (await request(app).get(`/jobs/${jobId}/mine`).set(near.auth).expect(200)).body;
    expect(mine.state).toBe('reassigned');
    expect((await request(app).get('/mechanic/active-job').set(near.auth)).body.job).toBeNull();
    await request(app).post(`/jobs/${jobId}/arrived`).set(near.auth).expect(404);

    // The job is offered to the next mechanic; the alert is closed
    const offer = (await request(app).get('/mechanic/offers/current').set(far.auth)).body.offer;
    expect(offer.jobId).toBe(jobId);
    expect((await customerView(jobId))).toMatchObject({ status: 'searching', trackingLost: null });
  });

  it('customer cancels: the mechanic is told and the job is closed', async () => {
    const { jobId, near } = await acceptedJob();
    await request(app).post(`/dev/jobs/${jobId}/cancel`).send({ reason: 'Fixed it myself' }).expect(200);
    const mine = (await request(app).get(`/jobs/${jobId}/mine`).set(near.auth)).body;
    expect(mine).toMatchObject({ state: 'cancelled' });
    expect(sms.at(-1)!.message).toContain('cancelled the request');
    expect(await customerView(jobId)).toMatchObject({ status: 'cancelled', cancelledBy: 'customer', cancelReason: 'Fixed it myself' });
  });

  it("can't re-match once the job has started", async () => {
    const { jobId, near } = await acceptedJob();
    await request(app).post(`/jobs/${jobId}/arrived`).set(near.auth).expect(200);
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    await request(app).post(`/jobs/${jobId}/photos/before`).set(near.auth).attach('file', JPEG, { filename: 'b.jpg', contentType: 'image/jpeg' }).expect(200);
    await request(app).post(`/jobs/${jobId}/start`).set(near.auth).send({}).expect(200);
    await request(app).post(`/dev/jobs/${jobId}/rematch`).send({}).expect(409);
  });
});

describe('support actions', () => {
  it('support can re-match, cancel or dismiss, and every action is audited', async () => {
    const a = await admin();
    const first = await acceptedJob();
    tickClock(11 * 60_000);
    await dispatcher.checkTracking(clock);

    await request(app).post(`/admin/jobs/${first.jobId}/rematch`).set(a).send({}).expect(400); // reason required
    await request(app).post(`/admin/jobs/${first.jobId}/rematch`).set(a).send({ reason: 'Mechanic unreachable by phone' }).expect(200);
    expect((await request(app).get('/admin/alerts').set(a)).body.alerts).toHaveLength(0);

    const history = (await request(app).get(`/admin/mechanics/${first.near.id}`).set(a)).body.history;
    expect(history[0]).toMatchObject({ action: 'job.rematch' });

    // dismiss
    const second = await acceptedJob();
    tickClock(11 * 60_000);
    await dispatcher.checkTracking(clock);
    const alert = (await request(app).get('/admin/alerts').set(a)).body.alerts.find((x: any) => x.job.id === second.jobId);
    await request(app).post(`/admin/alerts/${alert.id}/dismiss`).set(a).expect(200);
    await request(app).post(`/admin/alerts/${alert.id}/dismiss`).set(a).expect(404);

    // cancel on the customer's behalf
    await request(app).post(`/admin/jobs/${second.jobId}/cancel`).set(a).send({ reason: 'Customer called support' }).expect(200);
    expect(await customerView(second.jobId)).toMatchObject({ status: 'cancelled', cancelledBy: 'admin' });
  });
});
