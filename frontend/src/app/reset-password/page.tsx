'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { auth } from '@/lib/api';
import { KeyRound, CheckCircle2 } from 'lucide-react';

function ResetForm() {
  const sp = useSearchParams();
  const token = sp.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      await auth.resetPassword(token, password);
      setDone(true);
    } catch {
      setError('This reset link is invalid or has expired. Request a new one.');
    } finally { setBusy(false); }
  }

  if (!token) {
    return <p className="muted">No reset token provided. Please use the link from your email.</p>;
  }

  if (done) {
    return (
      <div className="done">
        <CheckCircle2 size={40} className="done-icon" />
        <h1>Password reset</h1>
        <p className="muted">Your password has been changed. You can now sign in with your new password.</p>
        <a className="signin-btn" href="/login">Go to sign in</a>
      </div>
    );
  }

  return (
    <>
      <h1>Set a new password</h1>
      <p className="muted">Choose a strong password you haven&apos;t used before.</p>
      {error && <div className="err">{error}</div>}
      <form onSubmit={submit}>
        <label>New password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required />
        <label>Confirm password</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        <button type="submit" disabled={busy}>{busy ? 'Resetting…' : 'Reset password'}</button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand"><KeyRound size={20} /><span>Atrium</span></div>
        <Suspense fallback={<p className="muted">Loading…</p>}><ResetForm /></Suspense>
      </div>
      <style jsx>{`
        .auth-wrap { min-height: 100vh; display: grid; place-items: center; padding: 1.5rem;
          background: linear-gradient(160deg, #eef2ff, #f9fafb 60%); }
        .auth-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; box-shadow: 0 16px 48px rgba(17,24,39,0.1);
          width: 100%; max-width: 25rem; padding: 2.25rem; }
        .brand { display: flex; align-items: center; gap: 0.5rem; color: #4f46e5; font-weight: 700; font-size: 1.15rem; margin-bottom: 1.5rem; }
        :global(h1) { font-size: 1.4rem; font-weight: 700; color: #111827; margin-bottom: 0.4rem; letter-spacing: -0.02em; }
        :global(.muted) { color: #6b7280; font-size: 0.9rem; margin-bottom: 1.5rem; }
        :global(label) { display: block; font-size: 0.82rem; font-weight: 600; color: #4b5563; margin-bottom: 0.35rem; }
        :global(input) { width: 100%; padding: 0.6rem 0.8rem; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 1rem; font-size: 0.92rem; }
        :global(input:focus) { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,0.14); }
        :global(button) { width: 100%; padding: 0.7rem; background: #4f46e5; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
        :global(button:hover:not(:disabled)) { background: #4338ca; }
        :global(button:disabled) { opacity: 0.5; cursor: not-allowed; }
        :global(.err) { background: rgba(220,38,38,0.08); color: #dc2626; border: 1px solid rgba(220,38,38,0.2); border-radius: 8px; padding: 0.6rem 0.8rem; font-size: 0.85rem; margin-bottom: 1rem; }
        :global(.done) { text-align: center; }
        :global(.done-icon) { color: #059669; margin-bottom: 0.75rem; }
        :global(.signin-btn) { display: inline-block; margin-top: 1rem; padding: 0.6rem 1.5rem; background: #4f46e5; color: #fff; border-radius: 8px; font-weight: 600; }
      `}</style>
    </div>
  );
}
