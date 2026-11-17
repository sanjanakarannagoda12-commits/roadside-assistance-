'use client';
import { useActionState } from 'react';
import { reinstateAction, suspendAction, type FormState } from '@/app/actions';
import { Submit } from '@/components/Submit';

export function SuspendPanel({ mechanicId, suspended }: { mechanicId: string; suspended: boolean }) {
  const [sState, suspend] = useActionState<FormState, FormData>(suspendAction, {});
  const [rState, reinstate] = useActionState<FormState, FormData>(reinstateAction, {});
  const state = suspended ? rState : sState;

  return (
    <>
      <h2>{suspended ? 'Reinstate' : 'Suspend'}</h2>
      {state.message ? <div className={`alert ${state.ok ? 'alert-ok' : 'alert-error'}`}>{state.message}</div> : null}
      {suspended ? (
        <form action={reinstate} className="row-actions">
          <input type="hidden" name="mechanicId" value={mechanicId} />
          <Submit label="Reinstate mechanic" />
          <span className="muted small">They can go online again straight away.</span>
        </form>
      ) : (
        <form action={suspend}>
          <input type="hidden" name="mechanicId" value={mechanicId} />
          <div className="field">
            <label htmlFor="reason">Reason</label>
            <input id="reason" name="reason" type="text" required minLength={3} maxLength={200} placeholder="e.g. Repeated customer complaints" />
            {state.fields?.reason ? <div className="field-error">{state.fields.reason}</div> : null}
            <div className="hint">Takes them offline immediately and blocks them from going online.</div>
          </div>
          <Submit label="Suspend mechanic" className="btn btn-danger" />
        </form>
      )}
    </>
  );
}
