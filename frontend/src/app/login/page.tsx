'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, api, ApiException } from '@/lib/api';

type LoginBrand = { name?: string; logoUrl?: string | null; primaryColor?: string };

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [tenantSlug, setTenantSlug] = useState('acme');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [brand, setBrand] = useState<LoginBrand | null>(null);

  // Fetch the organization's public branding so the login page reflects their
  // logo + primary color (white-label). Debounced on the slug field.
  useEffect(() => {
    if (!tenantSlug.trim()) { setBrand(null); return; }
    const t = setTimeout(async () => {
      try {
        const b = await api.get<LoginBrand>(`/branding/${tenantSlug}`, { auth: false });
        setBrand(b);
      } catch { setBrand(null); }
    }, 400);
    return () => clearTimeout(t);
  }, [tenantSlug]);

  const primary = brand?.primaryColor || '#4f46e5';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await auth.login(tenantSlug, email, password);
      } else {
        await auth.register(tenantSlug, email, password);
      }
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiException) setError(err.message);
      else setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <aside className="auth-aside">
        <div className="auth-aside-inner">
          <div className="mark">Atrium</div>
          <p className="thesis">
            A quiet place to learn.<br />
            Courses, programs, and the work between them — in one room.
          </p>
          <div className="aside-meta">
            <span className="eyebrow" style={{ color: 'rgba(250,248,244,0.55)' }}>
              For organizations & their learners
            </span>
          </div>
        </div>
      </aside>

      <main className="auth-main">
        <form className="auth-form" onSubmit={submit}>
          {brand && (brand.logoUrl || brand.name) && (
            <div className="brand-header">
              {brand.logoUrl
                ? <img src={brand.logoUrl} alt={brand.name || 'Logo'} className="brand-logo" />
                : <div className="brand-mark" style={{ background: primary }}>{(brand.name || 'A').charAt(0).toUpperCase()}</div>}
              {brand.name && <span className="brand-name">{brand.name}</span>}
            </div>
          )}
          <div className="auth-head">
            <h1>{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
            <p className="muted">
              {mode === 'login' ? 'Welcome back.' : 'Join your organization’s workspace.'}
            </p>
          </div>

          <div className="field">
            <label htmlFor="tenant">Organization</label>
            <input id="tenant" className="input" value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)} placeholder="acme" autoComplete="organization" />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@acme.com"
              autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
          </div>

          {error && <div className="auth-error" role="alert">{error}</div>}

          <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%', background: primary, borderColor: primary }}>
            {busy ? 'Just a moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <p className="auth-switch">
            {mode === 'login' ? (
              <>New here? <button type="button" onClick={() => setMode('register')}>Create an account</button></>
            ) : (
              <>Have an account? <button type="button" onClick={() => setMode('login')}>Sign in</button>
          <a href="/forgot-password" className="forgot-link">Forgot password?</a></>
            )}
          </p>
        </form>
          <div style={{marginTop:'1rem',textAlign:'center',fontSize:'0.8rem'}}><a href="/login/admin" style={{color:'var(--accent)'}}>Platform operator? Sign in here</a></div>
      </main>

      <style jsx>{`
        .brand-header { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.5rem; padding-bottom: 1.25rem; border-bottom: 1px solid var(--line); }
        .brand-logo { height: 2.5rem; max-width: 11rem; object-fit: contain; }
        .brand-mark { width: 2.5rem; height: 2.5rem; border-radius: 9px; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 1.1rem; }
        .brand-name { font-size: 1.1rem; font-weight: 700; color: var(--ink); }
        .forgot-link { display: block; text-align: center; margin-top: 1rem; font-size: 0.85rem; color: var(--accent); }
        .forgot-link:hover { text-decoration: underline; }
        .auth-wrap { display: grid; grid-template-columns: 1.1fr 1fr; min-height: 100vh; }
        .auth-aside {
          background: linear-gradient(160deg, #1a2236 0%, #10151f 100%);
          color: var(--paper); display: flex; align-items: center; padding: 3rem;
          position: relative; overflow: hidden;
        }
        .auth-aside::after {
          content: ''; position: absolute; inset: 0;
          background:
            radial-gradient(900px 400px at 80% -10%, rgba(37,99,168,0.30), transparent 60%),
            radial-gradient(500px 300px at 10% 110%, rgba(176,125,43,0.18), transparent 60%);
          pointer-events: none;
        }
        .auth-aside-inner { position: relative; z-index: 1; max-width: 26rem; }
        .mark {
          font-family: var(--serif); font-size: 1.6rem; font-weight: 600;
          letter-spacing: 0.02em; margin-bottom: 2.5rem;
        }
        .mark::after { content: '.'; color: var(--gold); }
        .thesis {
          font-family: var(--serif); font-size: 1.85rem; line-height: 1.3;
          color: rgba(250,248,244,0.95);
        }
        .aside-meta { margin-top: 2.5rem; }

        .auth-main { display: flex; align-items: center; justify-content: center; padding: 2rem; }
        .auth-form { width: 100%; max-width: 22rem; }
        .auth-head { margin-bottom: 1.75rem; }
        .auth-head h1 { font-size: 1.7rem; margin-bottom: 0.25rem; }
        .auth-error {
          background: rgba(168,68,58,0.09); border: 1px solid rgba(168,68,58,0.25);
          color: var(--rose); font-size: 0.85rem; padding: 0.6rem 0.75rem;
          border-radius: var(--radius-sm); margin-bottom: 1rem;
        }
        .auth-switch { margin-top: 1.25rem; font-size: 0.88rem; color: var(--ink-soft); text-align: center; }
        .auth-switch button {
          background: none; border: none; color: var(--accent); font-weight: 600;
          cursor: pointer; font-size: inherit; padding: 0;
        }
        .auth-switch button:hover { text-decoration: underline; }

        @media (max-width: 800px) {
          .auth-wrap { grid-template-columns: 1fr; }
          .auth-aside { display: none; }
        }
      `}</style>
    </div>
  );
}
