// Access tokens: short-lived JWTs (15 min) sent as "Authorization: Bearer ...".
// Refresh tokens: random, long-lived (30 days), stored hashed, rotated on every use.
// Re-using an already-rotated refresh token logs that user out everywhere (theft protection).
import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Repo } from '../db/types.js';
import { ApiError } from '../errors.js';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const ADMIN_TTL_SECONDS = 8 * 60 * 60; // one working day; admins log in again after that

// Each token says which app it is for, so a mechanic token can never be used on admin routes
// (and an admin token can't be used as a mechanic).
const APP_AUDIENCE = 'ridzo-app';
const ADMIN_AUDIENCE = 'ridzo-admin';
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export function createTokenService(repo: Repo, jwtSecret: string) {
  const signAccess = (userId: string, role: string) =>
    jwt.sign({ role }, jwtSecret, {
      subject: userId,
      audience: APP_AUDIENCE,
      expiresIn: ACCESS_TTL_SECONDS,
      algorithm: 'HS256',
    });

  return {
    async issue(userId: string, role: string): Promise<TokenPair> {
      const refreshToken = randomBytes(32).toString('base64url');
      await repo.createSession({
        userId,
        refreshTokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
      });
      return { accessToken: signAccess(userId, role), refreshToken, expiresIn: ACCESS_TTL_SECONDS };
    },

    verifyAccess(token: string): { userId: string; role: string } {
      try {
        const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'], audience: APP_AUDIENCE }) as jwt.JwtPayload;
        return { userId: payload.sub as string, role: payload.role as string };
      } catch {
        throw new ApiError(401, 'invalid_token', 'Your session has expired. Please log in again.');
      }
    },

    signAdmin(adminId: string): { token: string; expiresIn: number } {
      const token = jwt.sign({ role: 'admin' }, jwtSecret, {
        subject: adminId,
        audience: ADMIN_AUDIENCE,
        expiresIn: ADMIN_TTL_SECONDS,
        algorithm: 'HS256',
      });
      return { token, expiresIn: ADMIN_TTL_SECONDS };
    },

    verifyAdmin(token: string): { adminId: string } {
      try {
        const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'], audience: ADMIN_AUDIENCE }) as jwt.JwtPayload;
        return { adminId: payload.sub as string };
      } catch {
        throw new ApiError(401, 'invalid_token', 'Your admin session has expired. Please log in again.');
      }
    },

    async rotate(refreshToken: string): Promise<TokenPair> {
      const session = await repo.findSessionByHash(sha256(refreshToken));
      if (!session) throw new ApiError(401, 'invalid_refresh_token', 'Please log in again.');
      if (session.revokedAt) {
        await repo.revokeAllSessions(session.userId); // token reuse → assume stolen
        throw new ApiError(401, 'invalid_refresh_token', 'Please log in again.');
      }
      if (new Date(session.expiresAt).getTime() < Date.now()) {
        throw new ApiError(401, 'invalid_refresh_token', 'Your session has expired. Please log in again.');
      }
      const user = await repo.findUserById(session.userId);
      if (!user) throw new ApiError(401, 'invalid_refresh_token', 'Please log in again.');

      await repo.revokeSession(session.id);
      return this.issue(user.id, user.role);
    },

    async revoke(refreshToken: string): Promise<void> {
      const session = await repo.findSessionByHash(sha256(refreshToken));
      if (session) await repo.revokeSession(session.id);
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
