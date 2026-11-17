// Login and sign-up are ONE flow:
//   POST /auth/otp/send    { phone }         → texts a code
//   POST /auth/otp/verify  { phone, code }   → creates the account if new, returns tokens + "me"
//   POST /auth/refresh     { refreshToken }  → new token pair (rotation)
//   POST /auth/logout      { refreshToken }  → revokes that session
import { Router } from 'express';
import type { Repo } from '../db/types.js';
import type { OtpService } from '../services/otp.js';
import type { TokenService } from '../services/tokens.js';
import { buildMe } from '../services/profile.js';
import { refreshBody, sendOtpBody, verifyOtpBody } from '../validation.js';

export function authRouter(repo: Repo, otp: OtpService, tokens: TokenService) {
  const r = Router();

  r.post('/otp/send', async (req, res) => {
    const { phone } = sendOtpBody.parse(req.body ?? {});
    const result = await otp.send(phone);
    res.json({ ok: true, phone, ...result });
  });

  r.post('/otp/verify', async (req, res) => {
    const { phone, code } = verifyOtpBody.parse(req.body ?? {});
    await otp.verify(phone, code);

    let user = await repo.findUserByPhone(phone);
    const isNewUser = !user;
    if (!user) user = await repo.createUser(phone);

    const pair = await tokens.issue(user.id, user.role);
    res.json({ ...pair, isNewUser, me: await buildMe(repo, user) });
  });

  r.post('/refresh', async (req, res) => {
    const { refreshToken } = refreshBody.parse(req.body ?? {});
    res.json(await tokens.rotate(refreshToken));
  });

  r.post('/logout', async (req, res) => {
    const parsed = refreshBody.safeParse(req.body ?? {});
    if (parsed.success) await tokens.revoke(parsed.data.refreshToken);
    res.json({ ok: true });
  });

  return r;
}
