// End-to-end API tests for sign-up, login, onboarding and validation.
// Runs against the in-memory database; codes are captured instead of sent by SMS.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryFileStore, createMemoryRepo } from '../src/db/memoryRepo.js';
import type { SmsProvider } from '../src/sms/index.js';

const config = loadConfig({
  NODE_ENV: 'test',
  JWT_SECRET: 'test-jwt-secret-test-jwt-secret-1234',
  OTP_SECRET: 'test-otp-secret-test-otp-secret-1234',
  ENABLE_DEV_ROUTES: 'true',
});

let app: ReturnType<typeof createApp>;
let lastCode: Record<string, string>;

beforeEach(() => {
  vi.useRealTimers();
  lastCode = {};
  const sms: SmsProvider = {
    async send(to, message) {
      lastCode[to] = message.match(/\d{6}/)![0];
    },
  };
  app = createApp({ config, repo: createMemoryRepo(), files: createMemoryFileStore(), sms });
});

const PHONE = '0771234567';
const E164 = '+94771234567';

async function login(phone = PHONE) {
  await request(app).post('/auth/otp/send').send({ phone }).expect(200);
  const e164 = `+94${phone.replace(/^0/, '')}`;
  const res = await request(app).post('/auth/otp/verify').send({ phone, code: lastCode[e164] }).expect(200);
  return res.body as { accessToken: string; refreshToken: string; isNewUser: boolean; me: any };
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

async function completeOnboarding(token: string) {
  await request(app)
    .put('/mechanic/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Kasun Ranasinghe', serviceArea: 'Kandy' })
    .expect(200);
  for (const doc of ['nic', 'license', 'certificate', 'toolkit']) {
    await request(app)
      .post(`/mechanic/documents/${doc}`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', JPEG, { filename: `${doc}.jpg`, contentType: 'image/jpeg' })
      .expect(200);
  }
  await request(app)
    .put('/mechanic/services')
    .set('Authorization', `Bearer ${token}`)
    .send({ serviceKeys: ['tyre_change'] })
    .expect(200);
}

describe('phone validation', () => {
  it.each(['0771234567', '771234567', '+94771234567', '94 77 123 4567'])('accepts %s', async (phone) => {
    const res = await request(app).post('/auth/otp/send').send({ phone }).expect(200);
    expect(res.body.phone).toBe(E164);
  });

  it.each(['', '12345', '0112345678', '07712345678', 'abc'])('rejects %s', async (phone) => {
    const res = await request(app).post('/auth/otp/send').send({ phone }).expect(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.fields.phone).toMatch(/Sri Lankan mobile/);
  });
});

describe('sign up (new number)', () => {
  it('creates the account on first verify and starts onboarding', async () => {
    const { isNewUser, me, accessToken, refreshToken } = await login();
    expect(isNewUser).toBe(true);
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
    expect(me.user.phone).toBe(E164);
    expect(me.user.status).toBe('onboarding');
    expect(me.onboarding.nextStep).toBe('details');
  });

  it('walks through every onboarding step to pending review', async () => {
    const { accessToken } = await login();
    const auth = { Authorization: `Bearer ${accessToken}` };

    let me = (await request(app).put('/mechanic/profile').set(auth).send({ fullName: '  Kasun   Ranasinghe ', email: 'K@Mail.com', serviceArea: 'Kandy' }).expect(200)).body;
    expect(me.user.fullName).toBe('Kasun Ranasinghe');
    expect(me.user.email).toBe('k@mail.com');
    expect(me.onboarding.nextStep).toBe('documents');

    // submitting too early is refused
    await request(app).post('/mechanic/submit').set(auth).expect(400);

    await completeOnboarding(accessToken);
    me = (await request(app).post('/mechanic/submit').set(auth).expect(200)).body;
    expect(me.user.status).toBe('pending_review');
    expect(me.onboarding.nextStep).toBeNull();

    // documents are locked once submitted
    await request(app)
      .post('/mechanic/documents/nic')
      .set(auth)
      .attach('file', JPEG, { filename: 'nic.jpg', contentType: 'image/jpeg' })
      .expect(409);
  });
});

describe('login (existing number)', () => {
  it('returns the same account with isNewUser=false and its status', async () => {
    const first = await login();
    await completeOnboarding(first.accessToken);
    await request(app).post('/mechanic/submit').set('Authorization', `Bearer ${first.accessToken}`).expect(200);

    await new Promise((r) => setTimeout(r, 0));
    vi.useFakeTimers({ now: Date.now() + 31_000, toFake: ['Date'] });
    const second = await login();
    expect(second.isNewUser).toBe(false);
    expect(second.me.user.id).toBe(first.me.user.id);
    expect(second.me.user.status).toBe('pending_review');
  });

  it('approved mechanics land on approved status', async () => {
    const first = await login();
    await completeOnboarding(first.accessToken);
    await request(app).post('/mechanic/submit').set('Authorization', `Bearer ${first.accessToken}`).expect(200);
    await request(app).post('/dev/review').send({ phone: PHONE, decision: 'approve' }).expect(200);

    const me = (await request(app).get('/me').set('Authorization', `Bearer ${first.accessToken}`).expect(200)).body;
    expect(me.user.status).toBe('approved');
  });
});

describe('OTP security', () => {
  it('rejects a wrong code and counts attempts', async () => {
    await request(app).post('/auth/otp/send').send({ phone: PHONE }).expect(200);
    const wrong = lastCode[E164] === '111111' ? '222222' : '111111';
    const res = await request(app).post('/auth/otp/verify').send({ phone: PHONE, code: wrong }).expect(400);
    expect(res.body.error.code).toBe('invalid_code');
    expect(res.body.error.attemptsLeft).toBe(4);
  });

  it('locks the code after 5 wrong attempts, even if the right code is then entered', async () => {
    await request(app).post('/auth/otp/send').send({ phone: PHONE }).expect(200);
    const right = lastCode[E164];
    const wrong = right === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) await request(app).post('/auth/otp/verify').send({ phone: PHONE, code: wrong });
    const res = await request(app).post('/auth/otp/verify').send({ phone: PHONE, code: right }).expect(429);
    expect(res.body.error.code).toBe('too_many_attempts');
  });

  it('a code can only be used once', async () => {
    await request(app).post('/auth/otp/send').send({ phone: PHONE }).expect(200);
    const code = lastCode[E164];
    await request(app).post('/auth/otp/verify').send({ phone: PHONE, code }).expect(200);
    const res = await request(app).post('/auth/otp/verify').send({ phone: PHONE, code }).expect(400);
    expect(res.body.error.code).toBe('expired_code');
  });

  it('expires codes after 5 minutes', async () => {
    await request(app).post('/auth/otp/send').send({ phone: PHONE }).expect(200);
    vi.useFakeTimers({ now: Date.now() + 5 * 60 * 1000 + 1000, toFake: ['Date'] });
    const res = await request(app).post('/auth/otp/verify').send({ phone: PHONE, code: lastCode[E164] }).expect(400);
    expect(res.body.error.code).toBe('expired_code');
  });

  it('enforces a 30 s resend cooldown', async () => {
    await request(app).post('/auth/otp/send').send({ phone: PHONE }).expect(200);
    const res = await request(app).post('/auth/otp/send').send({ phone: PHONE }).expect(429);
    expect(res.body.error.code).toBe('resend_too_soon');
    expect(res.body.error.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('rejects malformed codes', async () => {
    const res = await request(app).post('/auth/otp/verify').send({ phone: PHONE, code: '12ab' }).expect(400);
    expect(res.body.error.fields.code).toMatch(/6 digits/);
  });
});

describe('sessions', () => {
  it('requires a token for protected routes', async () => {
    await request(app).get('/me').expect(401);
    await request(app).get('/me').set('Authorization', 'Bearer not-a-token').expect(401);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const { refreshToken } = await login();
    const rotated = (await request(app).post('/auth/refresh').send({ refreshToken }).expect(200)).body;
    expect(rotated.refreshToken).not.toBe(refreshToken);

    // old token reused → rejected, and the new one is revoked too
    await request(app).post('/auth/refresh').send({ refreshToken }).expect(401);
    await request(app).post('/auth/refresh').send({ refreshToken: rotated.refreshToken }).expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const { refreshToken } = await login();
    await request(app).post('/auth/logout').send({ refreshToken }).expect(200);
    await request(app).post('/auth/refresh').send({ refreshToken }).expect(401);
  });
});

describe('onboarding validation', () => {
  it('validates profile fields', async () => {
    const { accessToken } = await login();
    const res = await request(app)
      .put('/mechanic/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'K1', email: 'not-an-email', serviceArea: 'Mars' })
      .expect(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'fullName', 'serviceArea']);
  });

  it('requires first and last name', async () => {
    const { accessToken } = await login();
    const res = await request(app)
      .put('/mechanic/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Kasun', serviceArea: 'Kandy' })
      .expect(400);
    expect(res.body.error.fields.fullName).toMatch(/first and last/);
  });

  it('rejects files that are not really images/PDFs', async () => {
    const { accessToken } = await login();
    const res = await request(app)
      .post('/mechanic/documents/nic')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('hello world'), { filename: 'nic.jpg', contentType: 'image/jpeg' })
      .expect(400);
    expect(res.body.error.code).toBe('invalid_file');
  });

  it('rejects unsupported file types and unknown document types', async () => {
    const { accessToken } = await login();
    await request(app)
      .post('/mechanic/documents/nic')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('x'), { filename: 'nic.txt', contentType: 'text/plain' })
      .expect(400);
    await request(app)
      .post('/mechanic/documents/passport')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', JPEG, { filename: 'p.jpg', contentType: 'image/jpeg' })
      .expect(400);
  });

  it('validates the chosen services (prices come from Ridzo, not the mechanic)', async () => {
    const { accessToken } = await login();
    const auth = { Authorization: `Bearer ${accessToken}` };
    await request(app).put('/mechanic/services').set(auth).send({ serviceKeys: [] }).expect(400);
    await request(app).put('/mechanic/services').set(auth).send({ serviceKeys: ['space_travel'] }).expect(400);
    await request(app).put('/mechanic/services').set(auth).send({ serviceKeys: ['tyre_change', 'tyre_change'] }).expect(400);
    // the old format (mechanic sets prices) is refused
    await request(app).put('/mechanic/services').set(auth).send({ services: [{ key: 'tyre_change', priceRs: 9999 }] }).expect(400);

    const me = (await request(app).put('/mechanic/services').set(auth).send({ serviceKeys: ['tyre_change', 'lockout'] }).expect(200)).body;
    expect(me.services.map((s: any) => [s.key, s.priceRs])).toEqual([
      ['tyre_change', 4000],
      ['lockout', 7500],
    ]);
  });
});
