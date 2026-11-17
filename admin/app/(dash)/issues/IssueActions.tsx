'use client';
import { useActionState } from 'react';
import { cancelJobAction, dismissAlertAction, rematchAction, type FormState } from '@/app/actions';
import { Submit } from '@/components/Submit';

export function IssueActions({ alertId, jobId }: { alertId: string; jobId: string }) {
  const [rematch, rematchForm] = useActionState<FormState, FormData>(rematchAction, {});
  const [cancel, cancelForm] = useActionState<FormState, FormData>(cancelJobAction, {});
  const [dismiss, dismissForm] = useActionState<FormState, FormData>(dismissAlertAction, {});
  const state = [rematch, cancel, dismiss].find((s) => s.message);

  return (
    <>
      {state ? <div className={`alert ${state.ok ? 'alert-ok' : 'alert-error'}`}>{state.message}</div> : null}
      <div className="issue-actions">
        <form action={rematchForm}>
          <input type="hidden" name="jobId" value={jobId} />
          <input type="text" name="reason" required minLength={3} maxLength={200} placeholder="Why? e.g. mechanic not answering" aria-label="Reason for re-matching" />
          <Submit label="Find another mechanic" pendingLabel="Re-matching…" className="btn btn-small" />
        </form>
        <form action={cancelForm}>
          <input type="hidden" name="jobId" value={jobId} />
          <input type="text" name="reason" required minLength={3} maxLength={200} placeholder="e.g. customer no longer needs help" aria-label="Reason for cancelling" />
          <Submit label="Cancel request" pendingLabel="Cancelling…" className="btn btn-danger btn-small" />
        </form>
        <form action={dismissForm}>
          <input type="hidden" name="alertId" value={alertId} />
          <Submit label="Spoke to mechanic — close issue" pendingLabel="Closing…" className="btn btn-outline btn-small" />
        </form>
      </div>
    </>
  );
}
