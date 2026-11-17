// Text.lk provider tests — the network is faked, no real SMS is sent.
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createTextLkSms, maskPhone, SmsError, TEXTLK_ENDPOINT, type SmsProvider } from '../src/sms/index.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryFileStore, createMemoryRepo } from '../src/db/memoryRepo.js';

const jsonResponse = (status: number, body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

const ok = { status: 'success', message: 'Your message was successfully delivered', data: { uid: 'abc', cost: '1', sms_count: 1 } };

describe('Text.lk provider', () => {
  it('sends the documented request format', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, ok));
    const sms = createTextLkSms('token-123', 'RIDZO', { fetchImpl: fetchImpl as any, log: () => {} });

    await sms.send('+94771234567', 'Your Ridzo code is 123456.');

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TEXTLK_ENDPOINT);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-123');
    expect(JSON.parse(init.body as string)).toEqual({
      recipient: '94771234567', // no "+"
      sender_id: 'RIDZO',
      type: 'plain',
      message: 'Your Ridzo code is 123456.',
    });
  });

  it('treats {"status":"error"} as a failure even with HTTP 200', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { status: 'error', message: 'Insufficient balance' }));
    const sms = createTextLkSms('t', 'RIDZO', { fetchImpl: fetchImpl as any, log: () => {} });
    const err = await sms.send('+94771234567', 'x').catch((e) => e);
    expect(err).toBeInstanceOf(SmsError);
    expect(err.detail).toContain('Insufficient balance');
  });

  it('fails on HTTP errors and non-JSON bodies', async () => {
    const sms = createTextLkSms('t', 'RIDZO', {
      fetchImpl: (async () => jsonResponse(401, '<html>Unauthenticated</html>')) as any,
      log: () => {},
    });
    const err = await sms.send('+94771234567', 'x').catch((e) => e);
    expect(err).toBeInstanceOf(SmsError);
    expect(err.detail).toContain('HTTP 401');
  });

  it('fails cleanly when Text.lk is unreachable or slow', async () => {
    const unreachable = createTextLkSms('t', 'RIDZO', {
      fetchImpl: (async () => {
        throw new TypeError('fetch failed');
      }) as any,
      log: () => {},
    });
    await expect(unreachable.send('+94771234567', 'x')).rejects.toBeInstanceOf(SmsError);

    const slow = createTextLkSms('t', 'RIDZO', {
      fetchImpl: ((_: string, init: RequestInit) =>
        new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))) as any,
      timeoutMs: 20,
      log: () => {},
    });
    const err = await slow.send('+94771234567', 'x').catch((e) => e);
    expect(err.detail).toBe('timed out');
  });

  it('never logs the message (it contains the OTP)', async () => {
    const lines: string[] = [];
    const sms = createTextLkSms('t', 'RIDZO', { fetchImpl: (async () => jsonResponse(200, ok)) as any, log: (m) => lines.push(m) });
    await sms.send('+94771234567', 'Your Ridzo code is 654321.');
    expect(lines.join('\n')).not.toContain('654321');
    expect(lines.join('\n')).toContain(maskPhone('+94771234567'));
  });
});

describe('OTP send when the SMS gateway fails', () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret-test-jwt-secret-1234',
    OTP_SECRET: 'test-otp-secret-test-otp-secret-1234',
  });

  it('returns sms_failed and does not lock the user behind the resend cooldown', async () => {
    let fail = true;
    const sms: SmsProvider = {
      async send() {
        if (fail) throw new SmsError('Text.lk rejected the message', 'textlk', 'HTTP 200: Insufficient balance');
      },
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = createApp({ config, repo: createMemoryRepo(), files: createMemoryFileStore(), sms });

    const res = await request(app).post('/auth/otp/send').send({ phone: '0771234567' }).expect(502);
    expect(res.body.error.code).toBe('sms_failed');
    expect(res.body.error.message).not.toContain('balance'); // gateway details stay in server logs

    // Gateway recovers → the user can retry immediately (no 30 s cooldown from the failed attempt).
    fail = false;
    await request(app).post('/auth/otp/send').send({ phone: '0771234567' }).expect(200);
    errorSpy.mockRestore();
  });
});

describe('config', () => {
  const base = {
    JWT_SECRET: 'test-jwt-secret-test-jwt-secret-1234',
    OTP_SECRET: 'test-otp-secret-test-otp-secret-1234',
    SMS_PROVIDER: 'textlk',
  };
  it('requires a token and sender ID for Text.lk', () => {
    expect(() => loadConfig({ ...base })).toThrow(/TEXTLK_API_TOKEN[\s\S]*TEXTLK_SENDER_ID/);
  });
  it('blocks the demo sender in production', () => {
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', TEXTLK_API_TOKEN: 'x', TEXTLK_SENDER_ID: 'TextLKDemo' }),
    ).toThrow(/TextLKDemo is not allowed/);
  });
});
