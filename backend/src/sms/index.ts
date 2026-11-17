// SMS sending, behind one small interface so the gateway can be swapped
// (Text.lk today; SMSGo / Notify.lk later) by changing SMS_PROVIDER.
import type { Config } from '../config.js';

export interface SmsProvider {
  /** Sends one SMS. Resolves when the gateway accepted it; throws SmsError otherwise. */
  send(toE164: string, message: string): Promise<void>;
}

export class SmsError extends Error {
  constructor(
    message: string,
    public provider: string,
    public detail?: string,
  ) {
    super(message);
  }
}

/** Development only: prints the SMS in the server terminal instead of sending it. */
export function createConsoleSms(): SmsProvider {
  return {
    async send(to, message) {
      console.log(`\n📱 [SMS → ${to}] ${message}\n`);
    },
  };
}

// ─── Text.lk ────────────────────────────────────────────────────────────────
// Docs: https://text.lk/docs/send-sms/
//   POST https://app.text.lk/api/v3/sms/send
//   Authorization: Bearer <API token from dashboard → Developers>
//   { recipient: "94771234567", sender_id: "RIDZO", type: "plain", message: "..." }
// Success: { status: "success", data: { uid, status, cost, sms_count } }
// Failure: { status: "error", message: "..." }  — HTTP status is not documented,
// so we always check the JSON "status" field, not just res.ok.
//
// We use type "plain" and generate the code ourselves (services/otp.ts) rather than Text.lk's
// {{OTP6}} feature, so codes are hashed in our database and we can switch gateways freely.

export const TEXTLK_ENDPOINT = 'https://app.text.lk/api/v3/sms/send';
const TEXTLK_TIMEOUT_MS = 15_000;

type FetchLike = typeof fetch;

export function createTextLkSms(
  apiToken: string,
  senderId: string,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number; log?: (msg: string) => void } = {},
): SmsProvider {
  const doFetch = opts.fetchImpl ?? fetch;
  const log = opts.log ?? ((m: string) => console.log(m));

  return {
    async send(to, message) {
      const recipient = to.replace(/^\+/, ''); // +94771234567 → 94771234567
      let res: Response;
      try {
        res = await doFetch(TEXTLK_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ recipient, sender_id: senderId, type: 'plain', message }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? TEXTLK_TIMEOUT_MS),
        });
      } catch (e) {
        const reason = (e as Error)?.name === 'TimeoutError' ? 'timed out' : (e as Error)?.message;
        throw new SmsError('Could not reach Text.lk', 'textlk', reason);
      }

      const raw = await res.text();
      let body: { status?: string; message?: string; data?: { uid?: string; cost?: string; sms_count?: number } } = {};
      try {
        body = JSON.parse(raw);
      } catch {
        // non-JSON (e.g. an HTML error page)
      }

      if (!res.ok || body.status !== 'success') {
        throw new SmsError(
          'Text.lk rejected the message',
          'textlk',
          `HTTP ${res.status}: ${body.message ?? raw.slice(0, 200)}`,
        );
      }

      // Never log the message itself — it contains the OTP.
      log(`[sms] Text.lk accepted SMS to ${maskPhone(to)} (uid ${body.data?.uid ?? '?'}, cost ${body.data?.cost ?? '?'})`);
    },
  };
}

/** +94771234567 → +9477****567 */
export const maskPhone = (p: string) => p.replace(/^(\+?\d{4})\d+(\d{3})$/, '$1****$2');

export function createSmsProvider(config: Config): SmsProvider {
  if (config.SMS_PROVIDER === 'textlk') return createTextLkSms(config.TEXTLK_API_TOKEN!, config.TEXTLK_SENDER_ID!);
  return createConsoleSms();
}
