import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import type { Config } from './config.js';
import type { FileStore, Repo } from './db/types.js';
import type { SmsProvider } from './sms/index.js';
import { createOtpService } from './services/otp.js';
import { createTokenService } from './services/tokens.js';
import { requireAdmin, requireAuth } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { mechanicRouter } from './routes/mechanic.js';
import { devRouter } from './routes/dev.js';
import { adminRouter } from './routes/admin.js';
import { jobsRouter } from './routes/jobs.js';
import { createDispatcher } from './services/dispatch.js';
import { createMaps, type Maps } from './services/maps.js';
import { ApiError, errorHandler } from './errors.js';
import { SPECIALTIES } from './catalog.js';
import { SERVICE_AREAS, quoteBody } from './validation.js';
import { quote } from './services/pricing.js';

export interface Deps {
  config: Config;
  repo: Repo;
  files: FileStore;
  sms: SmsProvider;
  /** Optional override (tests). Defaults to Google Routes when GOOGLE_MAPS_API_KEY is set, else estimates. */
  maps?: Maps;
}

export function createApp({ config, repo, files, sms, maps = createMaps(config) }: Deps) {
  const app = express();
  const otp = createOtpService(repo, sms, config.OTP_SECRET);
  const tokens = createTokenService(repo, config.JWT_SECRET);
  const auth = requireAuth(tokens, repo);
  const dispatcher = createDispatcher(repo, config.NODE_ENV === 'test' ? undefined : console.log, sms, maps);
  app.locals.dispatcher = dispatcher; // server.ts runs dispatcher.tick() every few seconds

  app.disable('x-powered-by');
  // Behind Render/Railway/Fly's proxy: trust exactly one hop so req.ip is the real client (rate limits).
  if (config.TRUST_PROXY) app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  const limiter = (windowMin: number, limit: number) =>
    rateLimit({
      windowMs: windowMin * 60 * 1000,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: () => {
        throw new ApiError(429, 'rate_limited', 'Too many requests. Please wait a few minutes and try again.');
      },
    });

  // Per-IP limits on login endpoints (per-phone limits live in the OTP service).
  if (config.NODE_ENV !== 'test') {
    app.use('/auth', limiter(15, 40));
    app.use('/admin/auth', limiter(15, 10));
  }

  app.get('/health', (_req, res) => {
    res.json({ ok: true, env: config.APP_ENV, db: config.DB_DRIVER, sms: config.SMS_PROVIDER, maps: maps.provider });
  });

  // Public reference data the app needs for onboarding forms. Prices are Ridzo's (set by admins).
  app.get('/catalog', async (_req, res) => {
    const services = (await repo.listCatalog()).filter((s) => s.active);
    res.json({
      specialties: SPECIALTIES.filter((sp) => services.some((s) => s.category === sp.category)),
      services: services.map(({ key, category, name, durationLabel, priceRs }) => ({ key, category, name, durationLabel, priceRs })),
      serviceAreas: SERVICE_AREAS,
    });
  });

  // Upfront price for a job: Ridzo's service prices + travel charge. Apps only display it.
  app.post('/pricing/quote', async (req, res) => {
    const body = quoteBody.parse(req.body ?? {});
    const [catalog, pricing] = await Promise.all([repo.listCatalog(), repo.getPricing()]);
    const distanceKm = body.distanceKm ?? (await maps.routesTo([body.from!], body.to!, pricing.roadFactor))[0].km;
    res.json(quote({ serviceKeys: body.serviceKeys, distanceKm, at: body.at ? new Date(body.at) : undefined }, catalog, pricing));
  });

  app.use('/auth', authRouter(repo, otp, tokens));
  app.use('/admin', adminRouter({ repo, files, sms, tokens, dispatcher, maps, requireAdmin: requireAdmin(tokens, repo) }));
  app.use('/', mechanicRouter(repo, files, auth, dispatcher));
  app.use('/', jobsRouter(repo, files, dispatcher, auth));
  if (config.ENABLE_DEV_ROUTES) {
    // On a deployed server the test tools are locked behind a secret header.
    const devToken = config.DEV_ROUTES_TOKEN;
    const devGuard: express.RequestHandler = (req, _res, next) => {
      const given = req.get('x-dev-token') ?? '';
      const ok = !devToken || (given.length === devToken.length && timingSafeEqual(Buffer.from(given), Buffer.from(devToken)));
      next(ok ? undefined : new ApiError(404, 'not_found', 'Route not found')); // don't reveal they exist
    };
    app.use('/dev', devGuard, devRouter(repo, files, dispatcher, maps));
  }

  app.use((_req, _res, next) => next(new ApiError(404, 'not_found', 'Route not found')));
  app.use(errorHandler);
  return app;
}
