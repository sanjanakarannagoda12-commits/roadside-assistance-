// Talks to the Ridzo Node.js API.
// - Base URL comes from EXPO_PUBLIC_API_URL (see .env.example)
// - Tokens are kept in the device's secure storage (Keychain / Keystore)
// - Expired access tokens are refreshed automatically once, then the request is retried
import * as SecureStore from 'expo-secure-store';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

// Release builds (APK / store) must only ever talk to an HTTPS server — tokens and documents travel
// over this connection. Plain http:// is only allowed while developing (Expo Go / dev builds).
export const INSECURE_API_URL = !__DEV__ && !API_URL.startsWith('https://');
if (INSECURE_API_URL) {
  console.error(`[api] Refusing insecure API_URL in a release build: ${API_URL}`);
}

const ACCESS_KEY = 'ridzo.accessToken';
const REFRESH_KEY = 'ridzo.refreshToken';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

// ─── Token storage ──────────────────────────────────────────────────────────

let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export async function saveTokens(tokens: { accessToken: string; refreshToken: string }) {
  accessToken = tokens.accessToken;
  await SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
}

export async function loadTokens(): Promise<boolean> {
  accessToken = await SecureStore.getItemAsync(ACCESS_KEY);
  return Boolean(accessToken || (await SecureStore.getItemAsync(REFRESH_KEY)));
}

export async function clearTokens() {
  accessToken = null;
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export const getRefreshToken = () => SecureStore.getItemAsync(REFRESH_KEY);

/** Current access token, for things that can't go through api() — e.g. <Image> headers. */
export const getAccessToken = () => accessToken;

/** Called when the refresh token is rejected — the app should go back to Login. */
export function setOnSessionExpired(cb: (() => void) | null) {
  onSessionExpired = cb;
}

// ─── Requests ───────────────────────────────────────────────────────────────

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  // Several requests may fail at once — share a single refresh.
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return false;
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        await saveTokens(await res.json());
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  }
  return refreshing;
}

type Options = { method?: string; body?: unknown; form?: FormData; auth?: boolean; timeoutMs?: number };

export async function api<T>(path: string, opts: Options = {}, retried = false): Promise<T> {
  const { method = 'GET', body, form, auth = true, timeoutMs = 20000 } = opts;
  if (INSECURE_API_URL) {
    throw new ApiError(0, 'insecure_server', 'This build is set up with an insecure server address. Please install the latest Ridzo app.');
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new ApiError(0, 'timeout', 'The server took too long to respond. Please try again.');
    }
    // In development, show the real cause — a failed request isn't always a connection problem.
    if (__DEV__) console.warn(`[api] ${method} ${path} failed:`, e);
    throw new ApiError(
      0,
      'network',
      `Can't reach the Ridzo server. Check your internet connection${
        __DEV__ ? ` (API: ${API_URL} · ${(e as Error)?.message ?? e})` : ''
      }.`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 && auth && !retried) {
    if (await refreshTokens()) return api<T>(path, opts, true);
    await clearTokens();
    onSessionExpired?.();
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json?.error ?? {};
    const { code, message, fields, ...rest } = e;
    throw new ApiError(res.status, code ?? 'server_error', message ?? 'Something went wrong. Please try again.', fields ?? {}, rest);
  }
  return json as T;
}

/** Turns "services.0.priceRs"-style server field keys into the last segment ("priceRs"). */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError)) return {};
  return Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k.split('.').pop() ?? k, v]));
}

export const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
