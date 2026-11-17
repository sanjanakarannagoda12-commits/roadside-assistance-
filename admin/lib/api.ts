// Talks to the Ridzo API from the admin server. Never imported by browser code.
// The admin's token lives in an httpOnly cookie, so browser JavaScript can't read or steal it.
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const SESSION_COOKIE = 'ridzo_admin';
const API_URL = (process.env.RIDZO_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function call(path: string, init: RequestInit & { token?: string } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  try {
    return await fetch(`${API_URL}${path}`, { ...init, headers, cache: 'no-store' });
  } catch {
    throw new ApiError(503, 'unreachable', `Can't reach the Ridzo API at ${API_URL}. Is it running (npm run api)?`);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'server_error', e.message ?? 'Something went wrong.', e.fields ?? {});
  }
  return body as T;
}

export async function getToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/** Admin API call with the signed-in admin's token. Sends to /login if the session is missing or expired. */
export async function adminApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  if (!token) redirect('/login');
  const res = await call(`/admin${path}`, { ...init, token });
  if (res.status === 401) redirect('/login?expired=1');
  return parse<T>(res);
}

/** Raw response (for streaming document files). */
export async function adminRaw(path: string): Promise<Response> {
  const token = await getToken();
  if (!token) return new Response('Not signed in', { status: 401 });
  return call(`/admin${path}`, { token });
}

export async function login(email: string, password: string) {
  const res = await call('/admin/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  return parse<{ token: string; expiresIn: number; admin: { id: string; email: string; fullName: string } }>(res);
}
