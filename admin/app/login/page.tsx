import { LoginForm } from './LoginForm';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { expired } = await searchParams;
  return (
    <main className="login-wrap">
      <div className="card login-card">
        <div className="brand" style={{ padding: 0, marginBottom: 6, color: 'var(--text)' }}>
          Ridzo <span>Admin</span>
        </div>
        <p className="muted" style={{ marginBottom: 20 }}>
          Sign in to review mechanics and manage pricing.
        </p>
        {expired ? <div className="alert alert-warn">Your session ended. Please sign in again.</div> : null}
        <LoginForm />
      </div>
    </main>
  );
}
