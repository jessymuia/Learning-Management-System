'use client';
import { useState } from 'react';
import { auth } from '@/lib/api';
import { KeyRound, ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [org, setOrg] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await auth.forgotPassword(org, email);
      setSent(true);
      // in dev the API returns the token so you can test without email
      if (res.devToken) setDevLink(`/reset-password?token=${res.devToken}`);
    } catch {
      setSent(true); // still show success (no enumeration)
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand"><KeyRound size={20} /><span>Atrium</span></div>
        {!sent ? (
          <>
            <h1>Reset your password</h1>
            <p className="muted">Enter your organization and email. We&apos;ll send a reset link.</p>
            <form onSubmit={submit}>
              <label>Organization</label>
              <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="acme" required />
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@acme.com" required />
              <button type="submit" disabled={busy || !org || !email}>{busy ? 'Sending…' : 'Send reset link'}</button>
            </form>
          </>
        ) : (
          <>
            <h1>Check your email</h1>
            <p className="muted">If that account exists, we&apos;ve sent a reset link. It expires in 1 hour.</p>
            {devLink && (
              <div className="dev-note">
                <p>Dev mode — use this link to reset:</p>
                <a href={devLink}>{devLink}</a>
              </div>
            )}
          </>
        )}
        <a className="back" href="/login"><ArrowLeft size={14} /> Back to sign in</a>
      </div>
      <style jsx>{`
        .auth-wrap { min-height: 100vh; display: grid; place-items: center; padding: 1.5rem;
          background: linear-gradient(160deg, #eef2ff, #f9fafb 60%); }
        .auth-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; box-shadow: 0 16px 48px rgba(17,24,39,0.1);
          width: 100%; max-width: 25rem; padding: 2.25rem; }
        .brand { display: flex; align-items: center; gap: 0.5rem; color: #4f46e5; font-weight: 700; font-size: 1.15rem; margin-bottom: 1.5rem; }
        h1 { font-size: 1.4rem; font-weight: 700; color: #111827; margin-bottom: 0.4rem; letter-spacing: -0.02em; }
        .muted { color: #6b7280; font-size: 0.9rem; margin-bottom: 1.5rem; }
        label { display: block; font-size: 0.82rem; font-weight: 600; color: #4b5563; margin-bottom: 0.35rem; }
        input { width: 100%; padding: 0.6rem 0.8rem; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 1rem; font-size: 0.92rem; }
        input:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,0.14); }
        button { width: 100%; padding: 0.7rem; background: #4f46e5; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
        button:hover:not(:disabled) { background: #4338ca; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .dev-note { background: #fef9c3; border: 1px solid #fde047; border-radius: 8px; padding: 0.85rem; font-size: 0.8rem; margin-bottom: 1rem; word-break: break-all; }
        .dev-note a { color: #4f46e5; }
        .back { display: inline-flex; align-items: center; gap: 0.3rem; color: #6b7280; font-size: 0.85rem; margin-top: 1.25rem; }
        .back:hover { color: #4f46e5; }
      `}</style>
    </div>
  );
}
