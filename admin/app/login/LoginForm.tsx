'use client';
import { useActionState } from 'react';
import { loginAction, type FormState } from '@/app/actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <form action={action} noValidate>
      {state.message ? <div className="alert alert-error" role="alert">{state.message}</div> : null}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required maxLength={120} autoFocus />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={200} />
      </div>
      <button className="btn" style={{ width: '100%' }} disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="hint" style={{ marginTop: 14 }}>
        No account? An existing admin runs <code>npm run admin:create</code> in the backend folder.
      </p>
    </form>
  );
}
