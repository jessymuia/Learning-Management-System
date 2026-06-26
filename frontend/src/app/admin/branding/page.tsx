'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { Card, Button, Field, Input, Alert, Skeleton } from '@/components/ui';
import { auth, branding as brandingApi, type Branding } from '@/lib/api';
import { Palette, Image as ImageIcon, Check } from 'lucide-react';

const PRESETS = [
  { name: 'Indigo', primary: '#4f46e5', accent: '#059669' },
  { name: 'Blue', primary: '#2563eb', accent: '#10b981' },
  { name: 'Emerald', primary: '#059669', accent: '#d97706' },
  { name: 'Purple', primary: '#7c3aed', accent: '#ec4899' },
  { name: 'Rose', primary: '#e11d48', accent: '#2563eb' },
  { name: 'Slate', primary: '#475569', accent: '#0ea5e9' },
];

export default function BrandingPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primary, setPrimary] = useState('#4f46e5');
  const [accent, setAccent] = useState('#059669');
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me(); setEmail(me.email);
        const b = await brandingApi.mine().catch(() => null);
        if (b) {
          setDisplayName(b.name ?? '');
          setLogoUrl(b.logoUrl ?? '');
          setPrimary(b.primaryColor ?? '#4f46e5');
          setAccent(b.accentColor ?? '#059669');
          setTheme(b.defaultTheme ?? 'light');
        }
      } finally { setLoading(false); }
    })();
  }, [ready]);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const payload: Partial<Branding> & { displayName?: string; logoUrl?: string } = {
        primaryColor: primary, accentColor: accent, defaultTheme: theme,
      };
      if (displayName) payload.displayName = displayName;
      if (logoUrl) payload.logoUrl = logoUrl;
      await brandingApi.save(payload);
      // apply immediately so the admin sees the change live
      document.documentElement.style.setProperty('--accent', primary);
      document.documentElement.style.setProperty('--sage', accent);
      setMsg('Branding saved. Your organization\u2019s colors are now applied across the app.');
    } catch {
      setMsg('Could not save branding.');
    } finally { setSaving(false); }
  }

  if (!ready) return null;

  return (
    <AppShell email={email}>
      <header className="page-head">
        <span className="eyebrow">White-label</span>
        <h1>Organization branding</h1>
        <p className="muted">Customize how your organization&apos;s LMS looks — logo, colors, and default theme.</p>
      </header>

      {msg && <Alert tone="success">{msg}</Alert>}

      {loading ? <Skeleton height="20rem" /> : (
        <div className="brand-grid">
          <div className="brand-left">
            <Card className="bsec">
              <div className="bsec-head"><ImageIcon size={18} /><h3>Identity</h3></div>
              <Field label="Display name" hint="shown in the sidebar"><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="ABC School" /></Field>
              <Field label="Logo URL" hint="a link to your logo image (optional)"><Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" /></Field>
            </Card>

            <Card className="bsec">
              <div className="bsec-head"><Palette size={18} /><h3>Colors</h3></div>
              <p className="muted bsec-desc">Quick presets, or pick custom colors below.</p>
              <div className="presets">
                {PRESETS.map((p) => (
                  <button key={p.name} className="preset" onClick={() => { setPrimary(p.primary); setAccent(p.accent); }}
                    title={p.name}>
                    <span className="swatch" style={{ background: p.primary }} />
                    <span className="swatch" style={{ background: p.accent }} />
                    <span className="preset-name">{p.name}</span>
                    {primary === p.primary && accent === p.accent && <Check size={14} className="preset-check" />}
                  </button>
                ))}
              </div>
              <div className="color-row">
                <Field label="Primary (sidebar, buttons, links)">
                  <div className="color-input">
                    <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} />
                    <Input value={primary} onChange={(e) => setPrimary(e.target.value)} />
                  </div>
                </Field>
                <Field label="Secondary (badges, accents)">
                  <div className="color-input">
                    <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
                    <Input value={accent} onChange={(e) => setAccent(e.target.value)} />
                  </div>
                </Field>
              </div>
              <Field label="Default theme">
                <div className="theme-toggle-row">
                  <button className={theme === 'light' ? 'tt active' : 'tt'} onClick={() => setTheme('light')}>☀ Light</button>
                  <button className={theme === 'dark' ? 'tt active' : 'tt'} onClick={() => setTheme('dark')}>☾ Dark</button>
                </div>
              </Field>
              <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save branding'}</Button>
            </Card>
          </div>

          {/* live preview */}
          <Card className="bsec preview">
            <div className="bsec-head"><h3>Preview</h3></div>
            <div className="pv-shell" style={{ ['--pv-primary' as string]: primary, ['--pv-accent' as string]: accent }}>
              <div className="pv-side">
                <div className="pv-logo">{(displayName || 'A').charAt(0).toUpperCase()}</div>
                <div className="pv-nav"><span className="pv-link active">Dashboard</span><span className="pv-link">Courses</span><span className="pv-link">Grades</span></div>
              </div>
              <div className="pv-body">
                <div className="pv-title">{displayName || 'Your organization'}</div>
                <button className="pv-btn">Primary button</button>
                <div className="pv-badges"><span className="pv-badge">Badge</span><span className="pv-link2">A link</span></div>
              </div>
            </div>
          </Card>
        </div>
      )}

      <style jsx>{`
        .page-head { margin-bottom: 1.75rem; }
        .page-head h1 { margin-top: 0.3rem; }
        .brand-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start; }
        @media (max-width: 900px) { .brand-grid { grid-template-columns: 1fr; } }
        .brand-left { display: flex; flex-direction: column; gap: 1.5rem; }
        :global(.bsec) { padding: 1.5rem; }
        .bsec-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; color: var(--accent); }
        .bsec-head h3 { color: var(--ink); }
        .bsec-desc { font-size: 0.85rem; margin-bottom: 0.85rem; }
        .presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; margin-bottom: 1.25rem; }
        .preset { position: relative; display: flex; align-items: center; gap: 0.3rem; padding: 0.5rem 0.6rem;
          border: 1px solid var(--line); border-radius: 9px; background: var(--surface); cursor: pointer; font-size: 0.8rem; }
        .preset:hover { border-color: var(--accent); }
        .swatch { width: 0.9rem; height: 0.9rem; border-radius: 3px; }
        .preset-name { margin-left: 0.2rem; }
        .preset-check { color: var(--accent); margin-left: auto; }
        .color-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        @media (max-width: 520px) { .color-row { grid-template-columns: 1fr; } }
        .color-input { display: flex; gap: 0.5rem; align-items: center; }
        .color-input input[type=color] { width: 2.6rem; height: 2.6rem; border: 1px solid var(--line); border-radius: 8px; background: none; cursor: pointer; flex-shrink: 0; padding: 0; }
        .theme-toggle-row { display: flex; gap: 0.5rem; }
        .tt { flex: 1; padding: 0.6rem; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); cursor: pointer; font-weight: 600; font-size: 0.88rem; color: var(--ink-soft); }
        .tt.active { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-deep); }

        .pv-shell { display: flex; height: 16rem; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
        .pv-side { width: 38%; background: var(--pv-primary); padding: 1rem 0.75rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .pv-logo { width: 2rem; height: 2rem; border-radius: 7px; background: rgba(255,255,255,0.25); color: #fff; display: grid; place-items: center; font-weight: 700; }
        .pv-nav { display: flex; flex-direction: column; gap: 0.3rem; }
        .pv-link { color: rgba(255,255,255,0.8); font-size: 0.8rem; padding: 0.35rem 0.5rem; border-radius: 6px; }
        .pv-link.active { background: rgba(255,255,255,0.22); color: #fff; font-weight: 600; }
        .pv-body { flex: 1; padding: 1.25rem; background: var(--surface); }
        .pv-title { font-weight: 700; font-size: 1.05rem; margin-bottom: 1rem; }
        .pv-btn { background: var(--pv-primary); color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 7px; font-weight: 600; font-size: 0.85rem; cursor: default; }
        .pv-badges { display: flex; align-items: center; gap: 0.75rem; margin-top: 1rem; }
        .pv-badge { background: var(--pv-accent); color: #fff; font-size: 0.72rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 999px; }
        .pv-link2 { color: var(--pv-primary); font-weight: 600; font-size: 0.85rem; }
      `}</style>
    </AppShell>
  );
}
