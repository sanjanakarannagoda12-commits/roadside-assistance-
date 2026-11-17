'use client';
import { useActionState } from 'react';
import { serviceAction, type FormState } from '@/app/actions';
import { Submit } from '@/components/Submit';
import type { CatalogService } from '@/lib/types';

export function ServiceRow({ service: s }: { service: CatalogService }) {
  const [state, action] = useActionState<FormState, FormData>(serviceAction, {});
  const formId = `svc-${s.key}`;
  return (
    <tr style={s.active ? undefined : { opacity: 0.6 }}>
      <td style={{ fontWeight: 600 }}>{s.name}</td>
      <td className="muted">{s.category}</td>
      <td className="muted">{s.durationLabel}</td>
      <td>
        <input
          form={formId}
          name="priceRs"
          type="number"
          step="50"
          min={200}
          max={100000}
          defaultValue={s.priceRs}
          aria-label={`${s.name} price in rupees`}
          style={{ width: 110 }}
          className={state.ok === false ? 'invalid' : ''}
        />
        {state.ok === false ? <div className="field-error">{state.message}</div> : null}
      </td>
      <td>
        <input form={formId} name="active" type="checkbox" defaultChecked={s.active} aria-label={`Offer ${s.name}`} />
      </td>
      <td>
        <form id={formId} action={action} className="row-actions">
          <input type="hidden" name="key" value={s.key} />
          <Submit label="Save" className="btn btn-outline btn-small" />
          {state.ok ? <span className="small" style={{ color: 'var(--success)' }}>✓</span> : null}
        </form>
      </td>
    </tr>
  );
}
