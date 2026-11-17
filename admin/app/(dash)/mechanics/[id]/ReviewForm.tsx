'use client';
// One card per document: preview, then Approve / Reject (+ reason). Submitting saves all four at once.
// If any document is rejected, the mechanic is sent back to re-upload just those ones.
import { useActionState, useState } from 'react';
import { reviewAction, type FormState } from '@/app/actions';
import { Submit } from '@/components/Submit';
import type { MechanicDetail } from '@/lib/types';

type Doc = MechanicDetail['documents'][number];

const QUICK_REASONS = ['Photo is blurry', 'Corners are cut off', 'Document has expired', 'Name does not match', 'Wrong document'];

export function ReviewForm({ mechanicId, documents, canReview }: { mechanicId: string; documents: Doc[]; canReview: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(reviewAction, {});
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const rejectedCount = Object.values(choice).filter((c) => c === 'rejected').length;
  const allDecided = documents.every((d) => choice[d.docType]);

  return (
    <form action={action}>
      <input type="hidden" name="mechanicId" value={mechanicId} />
      {state.message ? (
        <div className={`alert ${state.ok ? 'alert-ok' : 'alert-error'}`} role="status">
          {state.message}
        </div>
      ) : null}

      <div className="docs">
        {documents.map((d) => {
          const src = `/api/documents/${mechanicId}/${d.docType}`;
          const isImage = d.mimeType === 'image/jpeg' || d.mimeType === 'image/png';
          const fieldErr = state.fields?.[`documents.${d.docType}`];
          const reasonErr = state.fields?.[`documents.${d.docType}.reason`];
          const current = canReview ? choice[d.docType] : d.status;
          return (
            <div key={d.docType} className={`doc ${current === 'rejected' ? 'is-rejected' : current === 'approved' ? 'is-approved' : ''}`}>
              <a className="doc-preview" href={d.uploaded ? src : undefined} target="_blank" rel="noreferrer" title="Open full size">
                {!d.uploaded ? (
                  <span className="muted small">Not uploaded</span>
                ) : isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={d.label} loading="lazy" />
                ) : (
                  <span className="muted small">{d.mimeType === 'application/pdf' ? 'PDF' : 'HEIC photo'} — click to open</span>
                )}
              </a>
              <div className="doc-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{d.label}</strong>
                  {!canReview && d.status ? <span className={`badge badge-${d.status}`}>{d.status === 'uploaded' ? 'Not checked' : d.status}</span> : null}
                </div>
                {!canReview && d.reason ? <p className="small" style={{ color: 'var(--danger)' }}>{d.reason}</p> : null}

                {canReview && d.uploaded ? (
                  <>
                    <div className="choice" role="radiogroup" aria-label={`${d.label} decision`}>
                      {(['approved', 'rejected'] as const).map((v) => (
                        <label key={v}>
                          <input
                            type="radio"
                            name={`${d.docType}.status`}
                            value={v}
                            checked={choice[d.docType] === v}
                            onChange={() => setChoice((c) => ({ ...c, [d.docType]: v }))}
                          />
                          <span>{v === 'approved' ? '✓ Approve' : '✕ Reject'}</span>
                        </label>
                      ))}
                    </div>
                    {fieldErr && !choice[d.docType] ? <div className="field-error">{fieldErr}</div> : null}
                    {choice[d.docType] === 'rejected' ? (
                      <div>
                        <input
                          type="text"
                          name={`${d.docType}.reason`}
                          placeholder="Reason the mechanic will see"
                          maxLength={200}
                          value={reasons[d.docType] ?? ''}
                          onChange={(e) => setReasons((r) => ({ ...r, [d.docType]: e.target.value }))}
                          className={reasonErr ? 'invalid' : ''}
                          aria-label={`Why is the ${d.label} rejected?`}
                        />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                          {QUICK_REASONS.map((r) => (
                            <button
                              key={r}
                              type="button"
                              className="tab"
                              style={{ padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}
                              onClick={() => setReasons((x) => ({ ...x, [d.docType]: r }))}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                        {reasonErr ? <div className="field-error">{reasonErr}</div> : null}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {canReview ? (
        <div style={{ marginTop: 16 }}>
          {rejectedCount > 0 ? (
            <div className="field">
              <label htmlFor="note">Message to the mechanic (optional)</label>
              <input id="note" name="note" type="text" maxLength={300} placeholder="e.g. Please retake the photos in daylight" />
              <div className="hint">Shown in the app above the documents to fix.</div>
            </div>
          ) : null}
          <div className="row-actions">
            <Submit
              label={!allDecided ? 'Save review' : rejectedCount ? `Send back to fix (${rejectedCount})` : 'Approve mechanic'}
              pendingLabel="Saving…"
              className={rejectedCount ? 'btn btn-danger' : 'btn'}
            />
            <span className="muted small">The mechanic gets an SMS with the result.</span>
          </div>
        </div>
      ) : null}
    </form>
  );
}
