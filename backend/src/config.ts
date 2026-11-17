// Loads and validates environment variables once at startup.
// The server refuses to start with a clear message if something required is missing.
import 'dotenv/config';
import { z } from 'zod';

// Treat empty values in .env (e.g. "SUPABASE_URL=") as not set.
const opt = <T extends z.ZodTypeAny>(t: T) => z.preprocess((v) => (v === '' ? undefined : v), t.optional());

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),

    // memory = no setup, data is lost on restart (good for a first test)
    // supabase = real Postgres database + file storage
    DB_DRIVER: z.enum(['memory', 'supabase']).default('memory'),
    SUPABASE_URL: opt(z.url()),
    SUPABASE_SERVICE_ROLE_KEY: opt(z.string().min(20)),
    SUPABASE_STORAGE_BUCKET: z.string().default('mechanic-documents'),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    OTP_SECRET: z.string().min(32, 'OTP_SECRET must be at least 32 characters'),

    // console = print the code in this terminal instead of sending an SMS (free, for development)
    SMS_PROVIDER: z.enum(['console', 'textlk']).default('console'),
    TEXTLK_API_TOKEN: opt(z.string()),
    TEXTLK_SENDER_ID: opt(z.string().max(11)),

    // Google Routes API for real road distance + traffic-aware ETA. Without it, distances are
    // estimated (straight line × road factor). Restrict the key to the Routes API in Google Cloud.
    GOOGLE_MAPS_API_KEY: opt(z.string().min(20)),
    GOOGLE_MAPS_TRAFFIC: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    // Adds /dev/* helper routes (approve/reject a mechanic). Never enabled in production.
    ENABLE_DEV_ROUTES: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .superRefine((env, ctx) => {
    if (env.DB_DRIVER === 'supabase') {
      if (!env.SUPABASE_URL) ctx.addIssue({ code: 'custom', path: ['SUPABASE_URL'], message: 'required when DB_DRIVER=supabase' });
      if (!env.SUPABASE_SERVICE_ROLE_KEY)
        ctx.addIssue({ code: 'custom', path: ['SUPABASE_SERVICE_ROLE_KEY'], message: 'required when DB_DRIVER=supabase' });
    }
    if (env.SMS_PROVIDER === 'textlk') {
      if (!env.TEXTLK_API_TOKEN) {
        ctx.addIssue({ code: 'custom', path: ['TEXTLK_API_TOKEN'], message: 'required when SMS_PROVIDER=textlk (Text.lk dashboard → Developers)' });
      }
      if (!env.TEXTLK_SENDER_ID) {
        ctx.addIssue({ code: 'custom', path: ['TEXTLK_SENDER_ID'], message: 'required when SMS_PROVIDER=textlk (e.g. RIDZO once approved, or TextLKDemo for a quick test)' });
      }
      // Text.lk's FAQ: the demo sender "must not be used to send OTPs or any production-related messages".
      if (env.NODE_ENV === 'production' && env.TEXTLK_SENDER_ID === 'TextLKDemo') {
        ctx.addIssue({ code: 'custom', path: ['TEXTLK_SENDER_ID'], message: 'TextLKDemo is not allowed in production — use your approved sender ID' });
      }
    }
    if (env.NODE_ENV === 'production' && env.SMS_PROVIDER === 'console') {
      ctx.addIssue({ code: 'custom', path: ['SMS_PROVIDER'], message: 'console SMS is not allowed in production' });
    }
  });

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration (check backend/.env):\n${lines.join('\n')}`);
  }
  const config = parsed.data;
  if (config.NODE_ENV === 'production') config.ENABLE_DEV_ROUTES = false;
  return config;
}
