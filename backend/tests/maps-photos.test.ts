// Google Routes integration (network faked) and job photos.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryFileStore, createMemoryRepo } from '../src/db/memoryRepo.js';
import { ROUTE_MATRIX_ENDPOINT, createGoogleMaps } from '../src/services/maps.js';
import type { Repo } from '../src/db/types.js';

const config = loadConfig({
  NODE_ENV: 'test',
  JWT_SECRET: 'test-jwt-secret-test-jwt-secret-1234',
  OTP_SECRET: 'test-otp-secret-test-otp-secret-1234',
  ENABLE_DEV_ROUTES: 'true',
});
const JOB = { lat: 7.2906, lng: 80.6337 };
const A = { lat: 7.295, lng: 80.635 }; // straight line ~0.5 km
const B = { lat: 7.3, lng: 80.64 }; //    straight line ~1.3 km
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const matrixResponse = (els: object[]) => new Response(JSON.stringify(els), { status: 200 });

describe('Google Routes client', () => {
  it('sends the documented request and matches results by originIndex', async () => {
    const fetchImpl = vi.fn(async () =>
      matrixResponse([
        // deliberately out of order
        { originIndex: 1, destinationIndex: 0, status: {}, condition: 'ROUTE_EXISTS', distanceMeters: 2300, duration: '420s' },
        { originIndex: 0, destinationIndex: 0, status: {}, condition: 'ROUTE_EXISTS', distanceMeters: 5100, duration: '900s' },
      ]),
    );
    const maps = createGoogleMaps('test-key-test-key-test-key', { fetchImpl: fetchImpl as any, log: () => {} });
    const r = await maps.routesTo([A, B], JOB, 1.3);
    expect(r).toEqual([
      { km: 5.1, durationS: 900, source: 'google' },
      { km: 2.3, durationS: 420, source: 'google' },
    ]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ROUTE_MATRIX_ENDPOINT);
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBe('test-key-test-key-test-key');
    expect(headers['X-Goog-FieldMask']).toContain('status');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE' });
    expect(body.origins[0].waypoint.location.latLng).toEqual({ latitude: A.lat, longitude: A.lng });
  });

  it('caches results and falls back to estimates when Google fails or finds no route', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls === 1) return matrixResponse([{ originIndex: 0, status: {}, condition: 'ROUTE_NOT_FOUND' }]);
      return new Response('quota exceeded', { status: 429 });
    }) as any;
    const maps = createGoogleMaps('test-key-test-key-test-key', { fetchImpl, log: () => {} });
    expect((await maps.routesTo([A], JOB, 1.3))[0].source).toBe('estimate'); // no route → estimate
    expect((await maps.routesTo([B], JOB, 1.3))[0].source).toBe('estimate'); // HTTP 429 → estimate

    const okFetch = vi.fn(async () =>
      matrixResponse([{ originIndex: 0, status: {}, condition: 'ROUTE_EXISTS', distanceMeters: 1000, duration: '120s' }]),
    );
    const ok = createGoogleMaps('test-key-test-key-test-key', { fetchImpl: okFetch as any, log: () => {} });
    await ok.routesTo([A], JOB, 1.3);
    const again = await ok.routesTo([A], JOB, 1.3); // same place within 2 min → cached, no second request
    expect(okFetch).toHaveBeenCalledTimes(1);
    expect(again[0]).toEqual({ km: 1, durationS: 120, source: 'google' });
  });
});

describe('dispatch with real road distance', () => {
  let app: ReturnType<typeof createApp>;
  let repo: Repo;
  let lastCode: Record<string, string>;
  let clock = new Date('2026-03-10T10:00:00+05:30').getTime();

  beforeEach(() => {
    vi.useFakeTimers({ now: clock, toFake: ['Date'] });
    lastCode = {};
    repo = createMemoryRepo();
    // A is closer as the crow flies but behind a river: 9 km / 22 min by road. B is 2 km / 6 min.
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const { origins } = JSON.parse(init.body as string);
      return matrixResponse(
        origins.map((o: any, i: number) =>
          o.waypoint.location.latLng.latitude === A.lat
            ? { originIndex: i, status: {}, condition: 'ROUTE_EXISTS', distanceMeters: 9000, duration: '1320s' }
            : { originIndex: i, status: {}, condition: 'ROUTE_EXISTS', distanceMeters: 2000, duration: '360s' },
        ),
      );
    }) as any;
    app = createApp({
      config,
      repo,
      files: createMemoryFileStore(),
      maps: createGoogleMaps('test-key-test-key-test-key', { fetchImpl, log: () => {} }),
      sms: {
        async send(to, m) {
          const c = m.match(/\d{6}/);
          if (c) lastCode[to] = c[0];
        },
      },
    });
  });
  afterEach(() => vi.useRealTimers());

  let seq = 0;
  async function mechanic(at: { lat: number; lng: number }) {
    const phone = `07700002${String(++seq).padStart(2, '0')}`;
    clock += 31_000;
    vi.setSystemTime(clock);
    await request(app).post('/auth/otp/send').send({ phone }).expect(200);
    const v = (await request(app).post('/auth/otp/verify').send({ phone, code: lastCode[`+94${phone.slice(1)}`] }).expect(200)).body;
    const auth = { Authorization: `Bearer ${v.accessToken}` };
    await request(app).put('/mechanic/profile').set(auth).send({ fullName: 'Kasun Perera', serviceArea: 'Kandy' }).expect(200);
    await repo.replaceServices(v.me.user.id, ['tyre_change']);
    await repo.updateUser(v.me.user.id, { status: 'approved' });
    await request(app).post('/mechanic/online').set(auth).send(at).expect(200);
    return { id: v.me.user.id as string, auth };
  }

  it('offers the job to whoever arrives first by road, and prices travel on the road distance', async () => {
    await mechanic(A);
    const b = await mechanic(B);
    const job = (
      await request(app)
        .post('/dev/jobs')
        .send({ customerName: 'Nadeesha Perera', customerPhone: '0711234567', vehicle: 'Corolla', vehicleType: 'Sedan', issueSummary: 'Flat tyre', issueCategory: 'tyre', ...JOB, address: 'Kandy', paymentMethod: 'cash' })
        .expect(201)
    ).body;
    expect(job.offeredTo).toBe(b.id);
    const offer = (await request(app).get('/mechanic/offers/current').set(b.auth)).body.offer;
    expect(offer).toMatchObject({ distanceKm: 2, etaMin: 6, distanceSource: 'google', travelRs: 500 });

    const accepted = (await request(app).post(`/jobs/${job.jobId}/accept`).set(b.auth).expect(200)).body.job;
    expect(accepted).toMatchObject({ distanceKm: 2, etaMin: 6 });
    expect((await request(app).get('/health')).body.maps).toBe('google');
  });

  it('stores before/after photos privately, requires the before photo, and replaces on retake', async () => {
    const b = await mechanic(B);
    const job = (
      await request(app)
        .post('/dev/jobs')
        .send({ customerName: 'Nadeesha Perera', customerPhone: '0711234567', vehicle: 'Corolla', vehicleType: 'Sedan', issueSummary: 'Flat tyre', issueCategory: 'tyre', ...JOB, address: 'Kandy', paymentMethod: 'cash' })
        .expect(201)
    ).body;
    await request(app).post(`/jobs/${job.jobId}/accept`).set(b.auth).expect(200);

    // Not before arriving
    await request(app).post(`/jobs/${job.jobId}/photos/before`).set(b.auth).attach('file', JPEG, { filename: 'b.jpg', contentType: 'image/jpeg' }).expect(409);
    await request(app).post(`/jobs/${job.jobId}/arrived`).set(b.auth).expect(200);
    await request(app).post(`/jobs/${job.jobId}/photos/before`).set(b.auth).attach('file', Buffer.from('not a photo'), { filename: 'b.jpg', contentType: 'image/jpeg' }).expect(400);
    await request(app).post(`/jobs/${job.jobId}/photos/sideways`).set(b.auth).attach('file', JPEG, { filename: 'b.jpg', contentType: 'image/jpeg' }).expect(400);

    const up = (await request(app).post(`/jobs/${job.jobId}/photos/before`).set(b.auth).attach('file', JPEG, { filename: 'b.jpg', contentType: 'image/jpeg' }).expect(200)).body;
    expect(up.job.photos).toEqual({ before: true, after: false });
    // retake
    await request(app).post(`/jobs/${job.jobId}/photos/before`).set(b.auth).attach('file', JPEG, { filename: 'b2.jpg', contentType: 'image/jpeg' }).expect(200);
    expect(await repo.listJobPhotos(job.jobId)).toHaveLength(1);

    const img = await request(app).get(`/jobs/${job.jobId}/photos/before`).set(b.auth).expect(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(img.headers['cache-control']).toContain('no-store');
    await request(app).get(`/jobs/${job.jobId}/photos/before`).expect(401); // private

    await request(app).post(`/jobs/${job.jobId}/start`).set(b.auth).send({}).expect(200);
    await request(app).post(`/jobs/${job.jobId}/photos/after`).set(b.auth).attach('file', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' }).expect(200);
    expect((await request(app).get(`/dev/jobs/${job.jobId}`)).body.photos).toEqual({ before: true, after: true });
    await request(app).get(`/dev/jobs/${job.jobId}/photos/after`).expect(200); // the customer can see it
  });
});
