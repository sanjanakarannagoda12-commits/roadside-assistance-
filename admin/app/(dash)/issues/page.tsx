import { adminApi } from '@/lib/api';
import { formatDate, type LiveAlert } from '@/lib/types';
import { AutoRefresh } from '@/components/AutoRefresh';
import { IssueActions } from './IssueActions';

export default async function IssuesPage() {
  const { alerts } = await adminApi<{ alerts: LiveAlert[] }>('/alerts');

  return (
    <>
      <AutoRefresh seconds={20} />
      <div className="page-head">
        <div>
          <h1>Live issues</h1>
          <p className="muted">
            Mechanics on the way to a customer who stopped sharing their location for 10+ minutes. Issues close by
            themselves when the location comes back.
          </p>
        </div>
        <span className="muted small">Refreshes every 20 s</span>
      </div>

      {alerts.length === 0 ? (
        <div className="card empty">No live issues. Every mechanic on a job is sharing their location. ✅</div>
      ) : (
        <div className="grid">
          {alerts.map((a) => (
            <section key={a.id} className="card issue">
              <div className="row-actions" style={{ justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0 }}>
                  No location for {a.minutesSinceLocation ?? '?'} min — {a.mechanic?.name ?? 'Unknown mechanic'}
                </h2>
                <span className="muted small">Alert opened {formatDate(a.createdAt)}</span>
              </div>

              <div className="issue-grid">
                <div>
                  <div className="issue-label">Mechanic</div>
                  <div>{a.mechanic?.name ?? '—'}</div>
                  {a.mechanic ? <a href={`tel:${a.mechanic.phone}`}>{a.mechanic.phone}</a> : null}
                  <div className="muted small">
                    Last location {formatDate(a.mechanic?.lastSeenAt ?? null)}
                    {a.mechanic?.kmAway != null ? ` · ${a.mechanic.kmAway} km from the customer then` : ''}
                  </div>
                </div>
                <div>
                  <div className="issue-label">Customer</div>
                  <div>{a.job?.customerName ?? '—'}</div>
                  {a.job ? <a href={`tel:${a.job.customerPhone}`}>{a.job.customerPhone}</a> : null}
                  <div className="muted small">{a.job?.address}</div>
                </div>
                <div>
                  <div className="issue-label">Job</div>
                  <div>{a.job?.issueSummary ?? '—'}</div>
                  <div className="muted small">Accepted {formatDate(a.job?.acceptedAt ?? null)}</div>
                </div>
              </div>

              <p className="small muted" style={{ marginBottom: 12 }}>
                Suggested: call the mechanic first. If you can&apos;t reach them, re-match the customer with another
                mechanic.
              </p>
              {a.job ? <IssueActions alertId={a.id} jobId={a.job.id} /> : null}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
