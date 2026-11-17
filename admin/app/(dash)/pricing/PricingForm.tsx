'use client';
import { useActionState } from 'react';
import { pricingAction, type FormState } from '@/app/actions';
import { Submit } from '@/components/Submit';
import type { PricingConfig } from '@/lib/types';

type NumField = {
  name: string;
  label: string;
  value: number;
  step: string;
  min: number;
  max: number;
  hint?: string;
};

export function PricingForm({ pricing: p }: { pricing: PricingConfig }) {
  const [state, action] = useActionState<FormState, FormData>(pricingAction, {});

  const groups: { title: string; fields: NumField[] }[] = [
    {
      title: 'Travel charge',
      fields: [
        { name: 'travelBaseRs', label: 'Call-out fee (Rs)', value: p.travelBaseRs, step: '10', min: 0, max: 10000 },
        { name: 'travelBaseKm', label: 'Covers first (km)', value: p.travelBaseKm, step: '0.5', min: 0, max: 50 },
        { name: 'travelPerKmRs', label: 'Per km after that (Rs)', value: p.travelPerKmRs, step: '5', min: 0, max: 1000 },
        { name: 'travelCapRs', label: 'Maximum travel charge (Rs)', value: p.travelCapRs, step: '50', min: 0, max: 50000 },
      ],
    },
    {
      title: 'Night rate (Sri Lanka time)',
      fields: [
        { name: 'nightMultiplier', label: 'Night multiplier', value: p.nightMultiplier, step: '0.05', min: 1, max: 3, hint: '1.25 = +25%' },
        { name: 'nightStartHour', label: 'Starts at (hour)', value: p.nightStartHour, step: '1', min: 0, max: 23 },
        { name: 'nightEndHour', label: 'Ends at (hour)', value: p.nightEndHour, step: '1', min: 0, max: 23, hint: 'Same as start = no night rate' },
      ],
    },
    {
      title: 'Distance & commission',
      fields: [
        { name: 'maxRadiusKm', label: 'Max distance (km)', value: p.maxRadiusKm, step: '1', min: 1, max: 100 },
        { name: 'roadFactor', label: 'Road distance factor', value: p.roadFactor, step: '0.05', min: 1, max: 3, hint: 'Straight line × this' },
        { name: 'commissionPercent', label: 'Ridzo commission (%)', value: Math.round(p.commissionRate * 1000) / 10, step: '0.5', min: 0, max: 50 },
      ],
    },
  ];

  return (
    <form action={action} noValidate>
      {state.message ? <div className={`alert ${state.ok ? 'alert-ok' : 'alert-error'}`}>{state.message}</div> : null}
      {groups.map((g) => (
        <fieldset key={g.title} style={{ border: 0, padding: 0, margin: '0 0 6px' }}>
          <legend className="muted small" style={{ fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
            {g.title}
          </legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0 12px' }}>
            {g.fields.map((f) => {
              const err = state.fields?.[f.name];
              return (
                <div className="field" key={f.name}>
                  <label htmlFor={f.name}>{f.label}</label>
                  <input
                    id={f.name}
                    name={f.name}
                    type="number"
                    inputMode="decimal"
                    defaultValue={f.value}
                    step={f.step}
                    min={f.min}
                    max={f.max}
                    required
                    className={err ? 'invalid' : ''}
                  />
                  {err ? <div className="field-error">{err}</div> : f.hint ? <div className="hint">{f.hint}</div> : null}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400, marginBottom: 16 }}>
        <input type="checkbox" name="commissionOnTravel" defaultChecked={p.commissionOnTravel} />
        Take commission on the travel charge too
      </label>
      <Submit label="Save pricing" />
    </form>
  );
}
