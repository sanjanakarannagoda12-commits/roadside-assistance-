import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../errors.js';
import type { TokenService } from '../services/tokens.js';
import type { Admin, Repo, User } from '../db/types.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      admin?: Admin;
    }
  }
}

const bearer = (req: Request) => {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
};

/** Requires a valid mechanic-app access token and loads the user onto req.user. */
export function requireAuth(tokens: TokenService, repo: Repo) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = bearer(req);
    if (!token) throw new ApiError(401, 'missing_token', 'Please log in.');
    const { userId } = tokens.verifyAccess(token);
    const user = await repo.findUserById(userId);
    if (!user) throw new ApiError(401, 'invalid_token', 'Please log in again.');
    req.user = user;
    next();
  };
}

/** Requires a valid admin token (admin web app) and loads the admin onto req.admin. */
export function requireAdmin(tokens: TokenService, repo: Repo) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = bearer(req);
    if (!token) throw new ApiError(401, 'missing_token', 'Please log in.');
    const { adminId } = tokens.verifyAdmin(token);
    const admin = await repo.findAdminById(adminId);
    if (!admin) throw new ApiError(401, 'invalid_token', 'Please log in again.');
    req.admin = admin;
    next();
  };
}
