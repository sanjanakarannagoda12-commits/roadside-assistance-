'use server';
// Every form in the admin app submits to one of these. Each one calls the Ridzo API with the
// signed-in admin's token, and the API does the real permission checks and validation.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ApiError, SESSION_COOKIE, adminApi, login } from '@/lib/api';
import type { DocType } from '@/lib/types';

export interface FormState {
  ok?: boolean;
  message?: string;
  fields?: Record<string, string>;
}

const fail = (e: unknown): FormState => {
  if (e instanceof ApiError) return { ok: false, message: e.message, fields: e.fields };
  throw e; // redirects and unexpected errors
};

const text = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();

// Which mechanic / service a form is about comes from a hidden field. The API re-checks it
// (unknown or malformed ids get a 400/404), so a tampered value can't do anything extra.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mechanicIdOf = (fd: FormData) => {
  const id = text(fd, 'mechanicId');
  if (!UUID.test(id)) throw new ApiError(400, 'validation_error', 'Unknown mechanic.');
  return id;
};

// ─── Session ────────────────────────────────────────────────────────────────

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = text(fd, 'email');
  const password = String(fd.get('password') ?? '');
  if (!email || !password) return { ok: false, message: 'Enter your email and password.' };

  try {
    const { token, expiresIn } = await login(email, password);
    (await cookies()).set(SESSION_COOKIE, token, {
      httpOnly: true, // browser JavaScript can't read it
      secure: process.env.NODE_ENV === 'production', // HTTPS only once deployed
      sameSite: 'strict', // not sent on requests from other sites
      path: '/',
      maxAge: expiresIn,
    });
  } catch (e) {
    return fail(e);
  }
  redirect('/'); // outside try: redirect works by throwing
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}

// ─── Mechanic review ────────────────────────────────────────────────────────

const DOCS: DocType[] = ['nic', 'license', 'certificate', 'toolkit'];

export async function reviewAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const fields: Record<string, string> = {};
  const documents: Record<string, { status: string; reason?: string }> = {};
  for (const doc of DOCS) {
    const status = text(fd, `${doc}.status`);
    const reason = text(fd, `${doc}.reason`);
    if (status !== 'approved' && status !== 'rejected') fields[`documents.${doc}`] = 'Approve or reject this document';
    else if (status === 'rejected' && reason.length < 3) fields[`documents.${doc}.reason`] = 'Tell the mechanic what is wrong';
    documents[doc] = status === 'rejected' ? { status, reason } : { status };
  }
  if (Object.keys(fields).length) return { ok: false, message: 'Check the highlighted documents.', fields };

  try {
    const mechanicId = mechanicIdOf(fd);
    const note = text(fd, 'note');
    const res = await adminApi<{ mechanic: { status: string }; notified: boolean }>(`/mechanics/${mechanicId}/review`, {
      method: 'POST',
      body: JSON.stringify({ documents, ...(note ? { note } : {}) }),
    });
    revalidatePath('/', 'layout');
    const what = res.mechanic.status === 'approved' ? 'Approved — the mechanic can now go online.' : 'Sent back to the mechanic to fix.';
    return { ok: true, message: `${what} ${res.notified ? 'SMS sent.' : 'SMS could not be sent (check the API log).'}` };
  } catch (e) {
    return fail(e);
  }
}

export async function suspendAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const mechanicId = mechanicIdOf(fd);
    await adminApi(`/mechanics/${mechanicId}/suspend`, { method: 'POST', body: JSON.stringify({ reason: text(fd, 'reason') }) });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Suspended and taken offline.' };
  } catch (e) {
    return fail(e);
  }
}

export async function reinstateAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const mechanicId = mechanicIdOf(fd);
    await adminApi(`/mechanics/${mechanicId}/reinstate`, { method: 'POST' });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Reinstated. The mechanic can go online again.' };
  } catch (e) {
    return fail(e);
  }
}

// ─── Pricing ────────────────────────────────────────────────────────────────

const num = (fd: FormData, key: string) => {
  const v = text(fd, key);
  return v === '' ? NaN : Number(v);
};

export async function pricingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const body = {
    travelBaseRs: num(fd, 'travelBaseRs'),
    travelBaseKm: num(fd, 'travelBaseKm'),
    travelPerKmRs: num(fd, 'travelPerKmRs'),
    travelCapRs: num(fd, 'travelCapRs'),
    nightMultiplier: num(fd, 'nightMultiplier'),
    nightStartHour: num(fd, 'nightStartHour'),
    nightEndHour: num(fd, 'nightEndHour'),
    roadFactor: num(fd, 'roadFactor'),
    maxRadiusKm: num(fd, 'maxRadiusKm'),
    commissionRate: Math.round(num(fd, 'commissionPercent') * 100) / 10000, // form shows %, API takes 0–0.5
    commissionOnTravel: fd.get('commissionOnTravel') === 'on',
  };
  const fields = Object.fromEntries(
    Object.entries(body)
      .filter(([, v]) => typeof v === 'number' && !Number.isFinite(v))
      .map(([k]) => [k === 'commissionRate' ? 'commissionPercent' : k, 'Enter a number']),
  );
  if (Object.keys(fields).length) return { ok: false, message: 'Fill in every field.', fields };

  try {
    await adminApi('/pricing', { method: 'PUT', body: JSON.stringify(body) });
    revalidatePath('/pricing');
    return { ok: true, message: 'Saved. New quotes use these settings straight away.' };
  } catch (e) {
    const state = fail(e);
    if (state.fields?.commissionRate) state.fields.commissionPercent = state.fields.commissionRate;
    return state;
  }
}

export async function serviceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const key = text(fd, 'key');
  if (!/^[a-z0-9_]{2,40}$/.test(key)) return { ok: false, message: 'Unknown service.' };
  const priceRs = num(fd, 'priceRs');
  if (!Number.isInteger(priceRs)) return { ok: false, message: 'Enter a whole number of rupees.' };
  try {
    await adminApi(`/catalog/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      body: JSON.stringify({ priceRs, active: fd.get('active') === 'on' }),
    });
    revalidatePath('/pricing');
    return { ok: true, message: 'Saved' };
  } catch (e) {
    return fail(e);
  }
}

// ─── Live issues ────────────────────────────────────────────────────────────

const jobIdOf = (fd: FormData) => {
  const id = text(fd, 'jobId');
  if (!UUID.test(id)) throw new ApiError(400, 'validation_error', 'Unknown job.');
  return id;
};

export async function rematchAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await adminApi(`/jobs/${jobIdOf(fd)}/rematch`, { method: 'POST', body: JSON.stringify({ reason: text(fd, 'reason') }) });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Looking for another mechanic. The first mechanic was told by SMS.' };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelJobAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await adminApi(`/jobs/${jobIdOf(fd)}/cancel`, { method: 'POST', body: JSON.stringify({ reason: text(fd, 'reason') }) });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Request cancelled. The mechanic was told by SMS.' };
  } catch (e) {
    return fail(e);
  }
}

export async function dismissAlertAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = text(fd, 'alertId');
  if (!UUID.test(id)) return { ok: false, message: 'Unknown issue.' };
  try {
    await adminApi(`/alerts/${id}/dismiss`, { method: 'POST' });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Closed.' };
  } catch (e) {
    return fail(e);
  }
}
