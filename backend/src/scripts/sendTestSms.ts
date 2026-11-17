// Sends ONE real test SMS through Text.lk using the settings in backend/.env.
// Usage:  npm run sms:test -- 0771234567
// Costs one SMS unit. Does not touch the database or create an OTP.
import 'dotenv/config';
import { createTextLkSms, SmsError } from '../sms/index.js';
import { sriLankanMobile } from '../validation.js';

const token = process.env.TEXTLK_API_TOKEN;
const sender = process.env.TEXTLK_SENDER_ID;
const parsed = sriLankanMobile.safeParse(process.argv[2] ?? '');

if (!token || !sender) {
  console.error('Set TEXTLK_API_TOKEN and TEXTLK_SENDER_ID in backend/.env first.');
  process.exit(1);
}
if (!parsed.success) {
  console.error('Usage: npm run sms:test -- 0771234567   (a Sri Lankan mobile number)');
  process.exit(1);
}

try {
  await createTextLkSms(token, sender).send(parsed.data, 'Ridzo test message: your Text.lk SMS gateway is connected.');
  console.log(`✅ Sent to ${parsed.data} from "${sender}". Check the phone.`);
} catch (e) {
  const err = e as SmsError;
  console.error(`❌ ${err.message}${err.detail ? `\n   ${err.detail}` : ''}`);
  process.exit(1);
}
