import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { logoutAction } from '@/app/actions';
import type { MechanicStatus } from '@/lib/types';

export default async function DashLayout({ children }: LayoutProps<'/'>) {
  const [me, stats] = await Promise.all([
    adminApi<{ fullName: string; email: string }>('/me'),
    adminApi<{ mechanics: Record<MechanicStatus, number>; openAlerts: number }>('/stats'),
  ]);
  const pending = stats.mechanics.pending_review;

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          Ridzo <span>Admin</span>
        </div>
        <Link className="nav-link" href="/mechanics?status=pending_review">
          Review queue {pending > 0 ? <span className="nav-count">{pending}</span> : null}
        </Link>
        <Link className="nav-link" href="/issues">
          Live issues {stats.openAlerts > 0 ? <span className="nav-count nav-count-danger">{stats.openAlerts}</span> : null}
        </Link>
        <Link className="nav-link" href="/mechanics">
          All mechanics
        </Link>
        <Link className="nav-link" href="/pricing">
          Pricing
        </Link>
        <div className="sidebar-foot">
          <div style={{ color: '#fff', fontWeight: 600 }}>{me.fullName}</div>
          <div style={{ marginBottom: 8 }}>{me.email}</div>
          <form action={logoutAction}>
            <button className="btn btn-outline btn-small" type="submit">
              Log out
            </button>
          </form>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
