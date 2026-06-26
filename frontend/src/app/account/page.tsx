'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { Card, Button, Alert } from '@/components/ui';
import { api, auth, ApiException } from '@/lib/api';
import { ShieldCheck, Download, User } from 'lucide-react';

export default function AccountPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [mfa, setMfa] = useState<{ secret: string; otpauth: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<'success' | 'error'>('success');

  useEffect(() => { auth.me().then((m) => setEmail(m.email)); }, []);

  if (!ready) return null;

  async function enableMfa() {
    setMsg(null);
    try { setMfa(await api.post<{ secret: string; otpauth: string }>('/account/mfa/enable')); }
    catch (e) { setMsgTone('error'); setMsg(e instanceof ApiException ? e.message : 'Failed.'); }
  }

  async function exportData() {
    setMsg(null);
    try {
      const data = await api.get('/privacy/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'my-data.json'; a.click();
      URL.revokeObjectURL(url);
      setMsgTone('success'); setMsg('Your data export has downloaded.');
    } catch (e) { setMsgTone('error'); setMsg(e instanceof ApiException ? e.message : 'Failed.'); }
  }

  return (
    <AppShell email={email}>
      <header className="page-head">
        <span className="eyebrow">Settings</span>
        <h1>Account &amp; privacy</h1>
        <p className="muted">Manage your security and data.</p>
      </header>

      {msg && <Alert tone={msgTone}>{msg}</Alert>}

      <Card className="acct-card">
        <div className="acct-id">
          <div className="acct-avatar">{(email || '?').charAt(0).toUpperCase()}</div>
          <div>
            <div className="acct-email">{email}</div>
            <div className="muted acct-sub">Signed in</div>
          </div>
        </div>
      </Card>

      <Card className="acct-card">
        <div className="sec-head"><ShieldCheck size={20} /><h3>Two-factor authentication</h3></div>
        <p className="muted sec-desc">Add a second layer of security with an authenticator app.</p>
        {mfa ? (
          <div className="mfa-box">
            <p className="muted">Scan this secret in your authenticator app:</p>
            <code className="mfa-secret">{mfa.secret}</code>
          </div>
        ) : (
          <Button variant="ghost" onClick={enableMfa}>Enable 2FA</Button>
        )}
      </Card>

      <Card className="acct-card">
        <div className="sec-head"><Download size={20} /><h3>Your data</h3></div>
        <p className="muted sec-desc">Download a copy of your personal data (GDPR / Kenya DPA).</p>
        <Button variant="ghost" onClick={exportData}><Download size={15} /> Export my data</Button>
      </Card>

      <style jsx>{`
        .page-head { margin-bottom: 1.75rem; }
        .page-head h1 { margin-top: 0.3rem; }
        :global(.acct-card) { padding: 1.5rem; margin-bottom: 1.25rem; }
        .acct-id { display: flex; align-items: center; gap: 1rem; }
        .acct-avatar { width: 3rem; height: 3rem; border-radius: 50%; background: var(--accent); color: #fff;
          display: grid; place-items: center; font-weight: 700; font-size: 1.1rem; }
        .acct-email { font-weight: 600; font-size: 1.05rem; }
        .acct-sub { font-size: 0.82rem; margin-top: 0.15rem; }
        .sec-head { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.4rem; color: var(--accent); }
        .sec-head h3 { color: var(--ink); }
        .sec-desc { font-size: 0.88rem; margin-bottom: 1rem; }
        .mfa-box { background: var(--surface-sunken); border-radius: var(--radius-sm); padding: 1rem; }
        .mfa-secret { display: inline-block; font-family: var(--mono); font-size: 1rem; margin-top: 0.5rem;
          background: var(--surface); padding: 0.5rem 0.85rem; border-radius: 6px; border: 1px solid var(--line); letter-spacing: 0.05em; }
      `}</style>
    </AppShell>
  );
}
