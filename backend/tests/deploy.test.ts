// Deployment safety rules: staging vs production, secret-protected test tools, proxy IPs.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryFileStore, createMemoryRepo } from '../src/db/memoryRepo.js';

const base = {
  JWT_SECRET: 'test-jwt-secret-test-jwt-secret-1234',
  OTP_SECRET: 'test-otp-secret-test-otp-secret-1234',
};
const TOKEN = 'dev-token-dev-token-dev-token-123456';
const make = (env: Record<string, string>) =>
  createApp({ config: loadConfig({ ...base, ...env }), repo: createMemoryRepo(), files: createMemoryFileStore(), sms: { async send() {} } });

describe('environments', () => {
  it('production: no console SMS, no demo sender, never any test tools', () => {
    expect(() => loadConfig({ ...base, APP_ENV: 'production' })).toThrow(/console SMS is not allowed/);
    const cfg = loadConfig({
      ...base,
      APP_ENV: 'production',
      SMS_PROVIDER: 'textlk',
      TEXTLK_API_TOKEN: 'x',
      TEXTLK_SENDER_ID: 'RIDZO',
      ENABLE_DEV_ROUTES: 'true',
      DEV_ROUTES_TOKEN: TOKEN,
    });
    expect(cfg.ENABLE_DEV_ROUTES).toBe(false);
  });

  it('NODE_ENV=production on its own still means production', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'production', SMS_PROVIDER: 'textlk', TEXTLK_API_TOKEN: 'x', TEXTLK_SENDER_ID: 'RIDZO' }).APP_ENV).toBe('production');
  });

  it('staging: test tools need a long secret token', () => {
    expect(() => loadConfig({ ...base, APP_ENV: 'staging', ENABLE_DEV_ROUTES: 'true' })).toThrow(/DEV_ROUTES_TOKEN/);
    expect(() => loadConfig({ ...base, APP_ENV: 'staging', ENABLE_DEV_ROUTES: 'true', DEV_ROUTES_TOKEN: 'short' })).toThrow(/32 characters/);
    expect(loadConfig({ ...base, APP_ENV: 'staging', NODE_ENV: 'production', ENABLE_DEV_ROUTES: 'true', DEV_ROUTES_TOKEN: TOKEN }).APP_ENV).toBe('staging');
  });
});

describe('secret-protected test tools', () => {
  const app = make({ APP_ENV: 'staging', ENABLE_DEV_ROUTES: 'true', DEV_ROUTES_TOKEN: TOKEN });

  it('look like they do not exist without the token', async () => {
    const res = await request(app).post('/dev/tick').expect(404);
    expect(res.body.error.code).toBe('not_found');
    await request(app).post('/dev/tick').set('x-dev-token', 'wrong').expect(404);
    await request(app).post('/dev/tick').set('x-dev-token', TOKEN).expect(200);
  });

  it('health shows the environment', async () => {
    expect((await request(app).get('/health')).body.env).toBe('staging');
  });
});

describe('behind a proxy', () => {
  it('uses the real client IP only when TRUST_PROXY is on', async () => {
    const trusted = make({ TRUST_PROXY: 'true' });
    const untrusted = make({});
    expect(trusted.get('trust proxy')).toBe(1);
    expect(untrusted.get('trust proxy')).toBeFalsy();
  });
});
