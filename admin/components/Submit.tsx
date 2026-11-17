'use client';
// A submit button that shows progress while its form's server action runs.
import { useFormStatus } from 'react-dom';

export function Submit({ label, pendingLabel, className = 'btn' }: { label: string; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (pendingLabel ?? 'Saving…') : label}
    </button>
  );
}
