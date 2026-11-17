// Streams a mechanic's private document to a signed-in admin (used by <img> and "Open file").
// The browser never gets the API token; this server adds it from the httpOnly cookie.
import { adminRaw } from '@/lib/api';

const ID = /^[0-9a-f-]{36}$/i;
const DOCS = new Set(['nic', 'license', 'certificate', 'toolkit']);

export async function GET(_req: Request, ctx: RouteContext<'/api/documents/[id]/[docType]'>) {
  const { id, docType } = await ctx.params;
  if (!ID.test(id) || !DOCS.has(docType)) return new Response('Not found', { status: 404 });

  const res = await adminRaw(`/mechanics/${id}/documents/${docType}`);
  if (!res.ok) return new Response(res.status === 401 ? 'Please sign in again' : 'Not found', { status: res.status });

  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
      'Content-Disposition': res.headers.get('Content-Disposition') ?? 'inline',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
