import { networkInterfaces } from 'node:os';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { createMemoryFileStore, createMemoryRepo } from './db/memoryRepo.js';
import { createSupabaseClient, createSupabaseFileStore, createSupabaseRepo } from './db/supabaseRepo.js';
import { createSmsProvider } from './sms/index.js';

let config;
try {
  config = loadConfig();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

let repo, files;
if (config.DB_DRIVER === 'supabase') {
  const db = createSupabaseClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!);
  repo = createSupabaseRepo(db);
  files = createSupabaseFileStore(db, config.SUPABASE_STORAGE_BUCKET);
} else {
  repo = createMemoryRepo();
  files = createMemoryFileStore();
}

const app = createApp({ config, repo, files, sms: createSmsProvider(config) });

// Dispatcher heartbeat: times out 30 s offers, offers jobs to the next mechanic,
// gives up on old requests and switches off mechanics whose GPS went quiet.
const DISPATCH_TICK_MS = 2000;
let ticking = false;
setInterval(async () => {
  if (ticking) return; // never overlap two ticks
  ticking = true;
  try {
    await app.locals.dispatcher.tick();
  } catch (e) {
    console.error('[dispatch] tick failed:', (e as Error).message);
  } finally {
    ticking = false;
  }
}, DISPATCH_TICK_MS).unref();

app.listen(config.PORT, '0.0.0.0', () => {
  const lanIps = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);

  console.log(`\nRidzo API running`);
  console.log(`  Local:    http://localhost:${config.PORT}`);
  for (const ip of lanIps) console.log(`  Network:  http://${ip}:${config.PORT}   ← use this in the app's .env on a real phone`);
  console.log(`  Database: ${config.DB_DRIVER}${config.DB_DRIVER === 'memory' ? ' (data is lost on restart)' : ''}`);
  console.log(`  SMS:      ${config.SMS_PROVIDER}${config.SMS_PROVIDER === 'console' ? ' (codes are printed here)' : ''}`);
  if (config.ENABLE_DEV_ROUTES) console.log(`  Dev routes enabled: POST /dev/review, POST /dev/jobs (fake customer request)`);
  console.log('');
});
