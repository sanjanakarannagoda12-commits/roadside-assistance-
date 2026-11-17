import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, adminApi } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate, formatRs, type MechanicDetail } from '@/lib/types';
import { ReviewForm } from './ReviewForm';
import { SuspendPanel } from './SuspendPanel';

const ACTION_LABEL: Record<string, string> = {
  'mechanic.approve': 'Approved',
  'mechanic.reject': 'Sent back to fix',
  'mechanic.suspend': 'Suspended',
  'mechanic.reinstate': 'Reinstated',
};

export default async function MechanicPage({ params }: PageProps<'/mechanics/[id]'>) {
  const { id } = await params;
  let data: MechanicDetail;
  try {
    data = await adminApi<MechanicDetail>(`/mechanics/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const { mechanic: m, documents, services, history, stats } = data;
  const o = stats.offersLast30Days;
  const pending = m.status === 'pending_review';

  return (
    <>
      <p className="small" style={{ marginBottom: 8 }}>
        <Link href={pending ? '/mechanics?status=pending_review' : '/mechanics'}>← {pending ? 'Review queue' : 'All mechanics'}</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>{m.fullName ?? 'No name yet'}</h1>
          <div className="row-actions">
            <StatusBadge status={m.status} />
            <span className="muted">{m.phone}</span>
            {m.isOnline ? <span className="badge badge-approved">● Online</span> : null}
          </div>
        </div>
      </div>

      {m.status === 'rejected' && m.rejectionReason ? (
        <div className="alert alert-error">Waiting for the mechanic to fix: {m.rejectionReason}</div>
      ) : null}
      {m.status === 'suspended' ? <div className="alert alert-error">Suspended: {m.rejectionReason}</div> : null}
      {m.status === 'onboarding' ? (
        <div className="alert alert-warn">Still signing up — they haven&apos;t submitted for review yet.</div>
      ) : null}

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <section className="card">
          <h2>Details</h2>
          <dl className="kv">
            <dt>Phone</dt>
            <dd>{m.phone}</dd>
            <dt>Email</dt>
            <dd>{m.email ?? '—'}</dd>
            <dt>Service area</dt>
            <dd>{m.serviceArea ?? '—'}</dd>
            <dt>Joined</dt>
            <dd>{formatDate(m.createdAt)}</dd>
            <dt>Submitted</dt>
            <dd>{formatDate(m.submittedAt)}</dd>
            <dt>Last reviewed</dt>
            <dd>{formatDate(m.reviewedAt)}</dd>
            <dt>Last seen</dt>
            <dd>{formatDate(m.lastSeenAt)}</dd>
            <dt>Jobs completed</dt>
            <dd>{stats.completedJobs}</dd>
            <dt>Rating</dt>
            <dd>{stats.rating ? `★ ${stats.rating} (${stats.ratingCount})` : 'No ratings yet'}</dd>
            <dt>Acceptance (30 days)</dt>
            <dd>
              {stats.acceptanceRate === null
                ? 'No offers yet'
                : `${Math.round(stats.acceptanceRate * 100)}% — ${o.accepted} accepted, ${o.declined} declined, ${o.expired} timed out`}
            </dd>
          </dl>
        </section>
        <section className="card">
          <h2>Services ({services.length})</h2>
          {services.length === 0 ? (
            <p className="muted">None chosen yet.</p>
          ) : (
            <dl className="kv">
              {services.map((s) => (
                <div key={s.key} style={{ display: 'contents' }}>
                  <dt>{s.name}</dt>
                  <dd>{formatRs(s.priceRs)}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="hint" style={{ marginTop: 10 }}>
            Prices come from the <Link href="/pricing">Ridzo price list</Link>.
          </p>
        </section>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2>Documents</h2>
        <ReviewForm mechanicId={m.id} documents={documents} canReview={pending} />
      </section>

      {m.status === 'approved' || m.status === 'suspended' ? (
        <section className="card" style={{ marginBottom: 16 }}>
          <SuspendPanel mechanicId={m.id} suspended={m.status === 'suspended'} />
        </section>
      ) : null}

      <section className="card">
        <h2>History</h2>
        {history.length === 0 ? (
          <p className="muted">No admin actions yet.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {history.map((h) => (
              <li key={h.id} style={{ marginBottom: 6 }}>
                <strong>{ACTION_LABEL[h.action] ?? h.action}</strong> by {h.adminName ?? 'an admin'}{' '}
                <span className="muted">· {formatDate(h.createdAt)}</span>
                {typeof h.detail.reason === 'string' && h.detail.reason ? <div className="muted small">{h.detail.reason}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
