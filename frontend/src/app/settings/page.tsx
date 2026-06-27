'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { auth, branding, type Branding } from '@/lib/api';

export default function SettingsPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [brandData, setBrandData] = useState<Branding | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [me, b] = await Promise.all([auth.me(), branding.mine().catch(() => null)]);
        setEmail(me.email);
        setBrandData(b);
      } finally { setLoading(false); }
    })();
  }, [ready]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!brandData) return;
    setSaving(true);
    try {
      await branding.save(brandData);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally { setSaving(false); }
  }

  return (
    <AppShell email={email}>
      <div className="content">
        <div className="page-head">
          <p className="eyebrow">System</p>
          <h1>Settings</h1>
        </div>
        {loading && <p className="muted">Loading settings…</p>}
        {!loading && brandData && (
          <div style={{ maxWidth: 540 }}>
            <div className="card" style={{ padding: '2rem' }}>
              <h2 style={{ marginBottom: '1.5rem' }}>Organisation Branding</h2>
              {saved && <div className="alert alert-success">Settings saved successfully.</div>}
              <form onSubmit={handleSave}>
                <div className="field">
                  <label>Organisation Name</label>
                  <input className="input" value={brandData.name ?? ''} onChange={e => setBrandData({ ...brandData, name: e.target.value })} placeholder="Your LMS name" />
                </div>
                <div className="field">
                  <label>Logo URL</label>
                  <input className="input" value={brandData.logoUrl ?? ''} onChange={e => setBrandData({ ...brandData, logoUrl: e.target.value })} placeholder="https://…" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="field">
                    <label>Primary Color</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input type="color" value={brandData.primaryColor} onChange={e => setBrandData({ ...brandData, primaryColor: e.target.value })} style={{ width: 40, height: 40, border: 'none', borderRadius: 8, cursor: 'pointer' }} />
                      <input className="input" value={brandData.primaryColor} onChange={e => setBrandData({ ...brandData, primaryColor: e.target.value })} style={{ flex: 1 }} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Accent Color</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input type="color" value={brandData.accentColor} onChange={e => setBrandData({ ...brandData, accentColor: e.target.value })} style={{ width: 40, height: 40, border: 'none', borderRadius: 8, cursor: 'pointer' }} />
                      <input className="input" value={brandData.accentColor} onChange={e => setBrandData({ ...brandData, accentColor: e.target.value })} style={{ flex: 1 }} />
                    </div>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ marginTop: '1rem' }}>
                  {saving ? 'Saving…' : 'Save Settings'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
