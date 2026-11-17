import { STATUS_LABEL, type MechanicStatus } from '@/lib/types';

export function StatusBadge({ status }: { status: MechanicStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}
