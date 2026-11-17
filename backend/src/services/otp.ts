// One-time codes for phone login/sign-up.
// - 6 digits, valid 5 minutes, only a keyed hash is stored
// - 30 s between sends, max 5 sends per number per hour
// - max 5 wrong attempts per code
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Repo } from '../db/types.js';
import type { SmsError, SmsProvider } from '../sms/index.js';
import { ApiError } from '../errors.js';

export const OTP_TTL_MS = 5 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 30 * 1000;
export const MAX_SENDS_PER_HOUR = 5;
export const MAX_ATTEMPTS = 5;

export function createOtpService(repo: Repo, sms: SmsProvider, secret: string) {
  const hash = (phone: string, code: string) => createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');

  return {
    async send(phone: string): Promise<{ resendInSeconds: number; expiresInSeconds: number }> {
      const latest = await repo.latestOtp(phone);
      if (latest) {
        const waitMs = RESEND_COOLDOWN_MS - (Date.now() - new Date(latest.createdAt).getTime());
        if (waitMs > 0) {
          const retryAfter = Math.ceil(waitMs / 1000);
          throw new ApiError(429, 'resend_too_soon', `Please wait ${retryAfter}s before requesting a new code.`, {
            retryAfterSeconds: retryAfter,
          });
        }
      }

      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      if ((await repo.countOtpsSince(phone, hourAgo)) >= MAX_SENDS_PER_HOUR) {
        throw new ApiError(429, 'too_many_codes', 'Too many codes requested. Please try again in an hour.');
      }

      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

      // Send first, save after: if the gateway fails, the user isn't stuck behind the
      // resend cooldown for a code that never arrived, and it doesn't count toward the hourly limit.
      try {
        await sms.send(phone, `Your Ridzo code is ${code}. Valid for 5 minutes. Do not share it with anyone.`);
      } catch (e) {
        const err = e as SmsError;
        console.error(`[sms] failed to send OTP via ${err.provider ?? 'sms'}: ${err.message}${err.detail ? ` — ${err.detail}` : ''}`);
        throw new ApiError(502, 'sms_failed', "We couldn't send the SMS right now. Please try again in a moment.");
      }

      await repo.insertOtp({
        phone,
        codeHash: hash(phone, code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      });

      return { resendInSeconds: RESEND_COOLDOWN_MS / 1000, expiresInSeconds: OTP_TTL_MS / 1000 };
    },

    /** Throws ApiError if the code is wrong/expired; resolves if it's valid (and marks it used). */
    async verify(phone: string, code: string): Promise<void> {
      const otp = await repo.latestOtp(phone);
      if (!otp || otp.consumedAt || new Date(otp.expiresAt).getTime() < Date.now()) {
        throw new ApiError(400, 'expired_code', 'This code has expired. Tap "Resend code" to get a new one.');
      }
      if (otp.attempts >= MAX_ATTEMPTS) {
        throw new ApiError(429, 'too_many_attempts', 'Too many wrong attempts. Tap "Resend code" to get a new one.');
      }

      const expected = Buffer.from(otp.codeHash, 'hex');
      const actual = Buffer.from(hash(phone, code), 'hex');
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        await repo.incrementOtpAttempts(otp.id);
        const left = MAX_ATTEMPTS - otp.attempts - 1;
        throw new ApiError(
          400,
          'invalid_code',
          left > 0
            ? `That code isn't right. ${left} attempt${left === 1 ? '' : 's'} left.`
            : 'Too many wrong attempts. Tap "Resend code" to get a new one.',
          { attemptsLeft: Math.max(left, 0) },
        );
      }

      await repo.consumeOtp(otp.id);
    },
  };
}

export type OtpService = ReturnType<typeof createOtpService>;
