// Creates an admin for the admin web app, or resets an existing admin's password.
// Usage:  npm run admin:create -- you@example.com "Your Name"
// The password is typed in (hidden), never passed on the command line (it would end up in shell history).
import { createInterface } from 'node:readline';
import { loadConfig } from '../config.js';
import { createSupabaseClient, createSupabaseRepo } from '../db/supabaseRepo.js';
import { hashPassword } from '../services/passwords.js';
import { adminPassword } from '../validation.js';
import { z } from 'zod';

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Print the question, then hide everything typed after it.
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let muted = false;
    out._writeToOutput = (s: string) => {
      if (!muted || s.includes('\n')) out.output.write(muted ? '\n' : s);
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

const config = loadConfig();
if (config.DB_DRIVER !== 'supabase') {
  console.error('Admins are stored in Supabase. Set DB_DRIVER=supabase in backend/.env first.');
  process.exit(1);
}

const email = z.email().safeParse((process.argv[2] ?? '').trim().toLowerCase());
const fullName = (process.argv[3] ?? '').trim();
if (!email.success || fullName.length < 2) {
  console.error('Usage: npm run admin:create -- you@example.com "Your Name"');
  process.exit(1);
}

const repo = createSupabaseRepo(createSupabaseClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!));
const existing = await repo.findAdminByEmail(email.data);

const password = await askHidden(`${existing ? 'New password' : 'Password'} for ${email.data} (min 12 chars, letters + numbers): `);
const valid = adminPassword.safeParse(password);
if (!valid.success) {
  console.error(`❌ ${valid.error.issues[0].message}`);
  process.exit(1);
}
const again = await askHidden('Type it again: ');
if (again !== password) {
  console.error('❌ The passwords did not match.');
  process.exit(1);
}

const hash = await hashPassword(password);
if (existing) {
  await repo.setAdminPassword(existing.id, hash);
  console.log(`✅ Password updated for ${email.data}.`);
} else {
  await repo.createAdmin({ email: email.data, fullName, passwordHash: hash });
  console.log(`✅ Admin created: ${fullName} <${email.data}>. Log in at the admin web app.`);
}
