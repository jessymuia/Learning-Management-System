'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { api, auth, ApiException, type IntegrationSetting } from '@/lib/api';

// field definitions per provider (label, key, secret?)
const FIELDS: Record<string, { title: string; fields: { key: string; label: string; secret?: boolean; placeholder?: string }[] }> = {
  stripe: { title: 'Stripe (card payments)', fields: [
    { key: 'publishable_key', label: 'Publishable key', placeholder: 'pk_live_…' },
    { key: 'secret_key', label: 'Secret key', secret: true, placeholder: 'sk_live_…' },
    { key: 'webhook_secret', label: 'Webhook signing secret', secret: true, placeholder: 'whsec_…' },
  ]},
  mpesa: { title: 'M-Pesa (Daraja)', fields: [
    { key: 'env', label: 'Environment (sandbox/production)', placeholder: 'sandbox' },
    { key: 'consumer_key', label: 'Consumer key' },
    { key: 'consumer_secret', label: 'Consumer secret', secret: true },
    { key: 'shortcode', label: 'Shortcode' },
    { key: 'passkey', label: 'Passkey', secret: true },
    { key: 'callback_url', label: 'Callback URL', placeholder: 'https://…/api/payments/mpesa/callback' },
    { key: 'callback_secret', label: 'Callback secret', secret: true },
  ]},
  mux: { title: 'Mux (video)', fields: [
    { key: 'signing_key_id', label: 'Signing key ID' },
    { key: 'signing_key', label: 'Signing key (base64)', secret: true },
  ]},
  smtp: { title: 'Email (SMTP)', fields: [
    { key: 'host', label: 'Host', placeholder: 'smtp.example.com' },
    { key: 'port', label: 'Port', placeholder: '587' },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', secret: true },
    { key: 'from_address', label: 'From address', placeholder: 'noreply@…' },
  ]},
  sso_oidc: { title: 'SSO (OIDC)', fields: [
    { key: 'issuer', label: 'Issuer URL' },
    { key: 'client_id', label: 'Client ID' },
    { key: 'client_secret', label: 'Client secret', secret: true },
    { key: 'redirect_uri', label: 'Redirect URI' },
  ]},
};

export default function IntegrationsPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [settings, setSettings] = useState<IntegrationSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.get<IntegrationSetting[]>('/settings/integrations');
      setSettings(s);
    } catch (err) {
      if (err instanceof ApiException && (err.status === 403 || err.status === 401)) setDenied(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    (async () => { const m = await auth.me(); setEmail(m.email); await load(); setLoading(false); })();
  }, [ready, load]);

  function edit(s: IntegrationSetting) {
    setOpen(s.provider);
    setDraft({ ...s.config, enabled: s.enabled ? 'true' : 'false' });
    setSavedMsg(null);
  }

  async function save(provider: string) {
    setError(null); setSavedMsg(null);
    try {
      const payload: Record<string, unknown> = { ...draft, enabled: draft.enabled === 'true' };
      await api.put(`/settings/integrations/${provider}`, payload);
      setSavedMsg('Saved. Secrets are stored securely and never shown again.');
      setOpen(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not save.');
    }
  }

  if (!ready) return null;

  if (denied) {
    return (
      <AppShell email={email}>
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center', maxWidth: '34rem', margin: '3rem auto' }}>
          <div style={{ fontSize: '2rem' }}>🔒</div>
          <h2>Admins only</h2>
          <p className="muted">Integration settings are managed by your organization's administrators.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell email={email}>
      <header className="page-head"><span className="eyebrow">Administration</span><h1>Integration settings</h1>
        <p className="muted">Connect payments, video, email, and SSO for your organization. Secrets are stored securely and never displayed after saving.</p></header>

      {error && <div className="alert">{error}</div>}
      {savedMsg && <div className="ok">{savedMsg}</div>}

      {loading ? <p className="faint">Loading…</p> : (
        <div className="cards">
          {settings.map((s) => {
            const def = FIELDS[s.provider];
            if (!def) return null;
            const configured = Object.values(s.secrets_set).some(Boolean) || Object.keys(s.config).length > 0;
            return (
              <div key={s.provider} className="card intg">
                <div className="intg-head">
                  <h3>{def.title}</h3>
                  <span className={`badge ${s.enabled ? 'badge-active' : configured ? 'badge-gold' : 'badge-draft'}`}>
                    {s.enabled ? 'enabled' : configured ? 'configured' : 'not set'}
                  </span>
                </div>

                {open === s.provider ? (
                  <div className="form">
                    {def.fields.map((f) => (
                      <div key={f.key} className="field">
                        <label>{f.label}{f.secret && <span className="lock"> 🔒</span>}</label>
                        <input className="input"
                          type={f.secret ? 'password' : 'text'}
                          placeholder={f.secret && s.secrets_set[f.key] ? '•••••••• (set — leave blank to keep)' : (f.placeholder || '')}
                          value={f.secret ? (draft[f.key] ?? '') : (draft[f.key] ?? '')}
                          onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                      </div>
                    ))}
                    <label className="toggle">
                      <input type="checkbox" checked={draft.enabled === 'true'}
                        onChange={(e) => setDraft({ ...draft, enabled: e.target.checked ? 'true' : 'false' })} />
                      <span>Enabled</span>
                    </label>
                    <div className="actions">
                      <button className="btn btn-primary" onClick={() => save(s.provider)}>Save</button>
                      <button className="btn btn-ghost" onClick={() => setOpen(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="status-list">
                      {def.fields.filter((f) => f.secret).map((f) => (
                        <span key={f.key} className={`chip ${s.secrets_set[f.key] ? 'set' : ''}`}>
                          {f.label}: {s.secrets_set[f.key] ? 'set' : '—'}
                        </span>
                      ))}
                    </div>
                    <button className="btn btn-ghost" onClick={() => edit(s)}>Configure</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .page-head { margin-bottom: 1.75rem; display: flex; flex-direction: column; gap: 0.3rem; }
        .page-head h1 { margin-top: 0.3rem; }
        .alert { background: rgba(168,68,58,0.09); color: var(--rose); padding: 0.6rem 0.9rem; border-radius: var(--radius-sm); margin-bottom: 1rem; font-size: 0.88rem; }
        .ok { background: rgba(79,122,104,0.1); color: var(--sage); padding: 0.6rem 0.9rem; border-radius: var(--radius-sm); margin-bottom: 1rem; font-size: 0.88rem; }
        .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.25rem; }
        .intg { padding: 1.4rem; }
        .intg-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
        .intg-head h3 { margin: 0; font-size: 1rem; }
        .status-list { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1rem; }
        .chip { font-size: 0.72rem; padding: 0.2rem 0.5rem; border-radius: 4px; background: var(--surface-sunken); color: var(--ink-faint); }
        .chip.set { background: rgba(79,122,104,0.12); color: var(--sage); }
        .form { display: flex; flex-direction: column; gap: 0.75rem; }
        .field { display: flex; flex-direction: column; gap: 0.3rem; }
        .field label { font-size: 0.8rem; font-weight: 600; }
        .lock { font-size: 0.7rem; }
        .toggle { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; }
        .actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
      `}</style>
    </AppShell>
  );
}
