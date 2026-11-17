import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { STATUS_LABEL, formatDate, type MechanicStatus, type MechanicSummary } from '@/lib/types';

const TABS: (MechanicStatus | 'all')[] = ['pending_review', 'approved', 'rejected', 'onboarding', 'suspended', 'all'];

export default async function MechanicsPage({ searchParams }: PageProps<'/mechanics'>) {
  const sp = await searchParams;
  const status = typeof sp.status === 'string' && sp.status in STATUS_LABEL ? (sp.status as MechanicStatus) : undefined;
  const search = typeof sp.search === 'string' ? sp.search.slice(0, 40) : '';
  const page = Math.max(1, Number(sp.page) || 1);

  const qs = new URLSearchParams({ page: String(page) });
  if (status) qs.set('status', status);
  if (search) qs.set('search', search);

  const [list, stats] = await Promise.all([
    adminApi<{ rows: MechanicSummary[]; total: number; page: number; pageSize: number }>(`/mechanics?${qs}`),
    adminApi<{ mechanics: Record<MechanicStatus, number> }>('/stats'),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const link = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ status, search: search || undefined, ...p })) if (v) q.set(k, v);
    return `/mechanics${q.size ? `?${q}` : ''}`;
  };
  const isQueue = status === 'pending_review';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isQueue ? 'Review queue' : 'Mechanics'}</h1>
          <p className="muted">
            {isQueue ? 'Oldest submissions first. Open one to check their documents.' : `${list.total} mechanic${list.total === 1 ? '' : 's'}`}
          </p>
        </div>
        <form method="get" action="/mechanics" style={{ display: 'flex', gap: 8 }}>
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input type="search" name="search" defaultValue={search} placeholder="Name or phone" aria-label="Search mechanics" maxLength={40} style={{ width: 220 }} />
          <button className="btn btn-outline btn-small">Search</button>
        </form>
      </div>

      <div className="tabs">
        {TABS.map((t) => {
          const count = t === 'all' ? Object.values(stats.mechanics).reduce((a, b) => a + b, 0) : stats.mechanics[t];
          const active = (t === 'all' && !status) || t === status;
          return (
            <Link key={t} className={`tab${active ? ' active' : ''}`} href={link({ status: t === 'all' ? '' : t, page: undefined })}>
              {t === 'all' ? 'All' : STATUS_LABEL[t]} · {count}
            </Link>
          );
        })}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {list.rows.length === 0 ? (
          <div className="empty">{isQueue ? 'Nothing to review right now. 🎉' : 'No mechanics match.'}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Area</th>
                  <th>Status</th>
                  <th>{isQueue ? 'Submitted' : 'Joined'}</th>
                  <th>Online</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/mechanics/${m.id}`} style={{ fontWeight: 600 }}>
                        {m.fullName ?? 'No name yet'}
                      </Link>
                    </td>
                    <td>{m.phone}</td>
                    <td>{m.serviceArea ?? '—'}</td>
                    <td>
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="muted">{formatDate(isQueue ? m.submittedAt : m.createdAt)}</td>
                    <td>
                      <span className="dot" style={{ background: m.isOnline ? 'var(--success)' : 'var(--border)' }} aria-label={m.isOnline ? 'Online' : 'Offline'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pages > 1 ? (
        <div className="pager">
          {page > 1 ? <Link className="btn btn-outline btn-small" href={link({ page: String(page - 1) })}>Previous</Link> : null}
          <span className="muted small">Page {page} of {pages}</span>
          {page < pages ? <Link className="btn btn-outline btn-small" href={link({ page: String(page + 1) })}>Next</Link> : null}
        </div>
      ) : null}
    </>
  );
}
