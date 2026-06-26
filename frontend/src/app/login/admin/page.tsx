'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, ApiException } from '@/lib/api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await auth.operatorLogin(email, password);
      router.replace('/operator');
    } catch (err) {
      if (err instanceof ApiException) setError(err.message);
      else setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="card">
        <span className="eyebrow">Platform · Super-admin</span>
        <h1>Operator sign-in</h1>
        <p className="muted">For platform operators who manage all organizations. No organization needed.</p>

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@platform.com" required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="alert">{error}</div>}
          <button className="btn btn-primary full" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in as operator'}
          </button>
        </form>

        <div className="alt">
          Not an operator? <a href="/login">Sign in to your organization</a>
        </div>
      </div>

      <style jsx>{`
        .wrap { min-height: 100vh; display: grid; place-items: center; padding: 2rem; background: var(--surface-sunken); }
        .card { width: 100%; max-width: 26rem; background: var(--surface); border: 1px solid var(--line);
          border-radius: var(--radius); padding: 2.25rem; box-shadow: var(--shadow); }
        .eyebrow { color: var(--accent); }
        h1 { margin: 0.4rem 0 0.5rem; }
        .muted { margin-bottom: 1.5rem; }
        .field { margin-bottom: 1rem; }
        .field label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem; }
        .field .input { width: 100%; }
        .alert { background: rgba(168,68,58,0.09); color: var(--rose); padding: 0.6rem 0.85rem;
          border-radius: var(--radius-sm); margin-bottom: 1rem; font-size: 0.85rem; }
        .full { width: 100%; }
        .alt { margin-top: 1.5rem; text-align: center; font-size: 0.85rem; color: var(--ink-faint); }
        .alt a { color: var(--accent); font-weight: 600; }
      `}</style>
    </div>
  );
}
