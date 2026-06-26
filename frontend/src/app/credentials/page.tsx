'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, EmptyState, Skeleton } from '@/components/ui';
import { api, auth, type Credential } from '@/lib/api';
import { Award, ShieldCheck } from 'lucide-react';

export default function CredentialsPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [creds, setCreds] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me(); setEmail(me.email);
        setCreds(await api.get<Credential[]>('/credentials/mine').catch(() => []));
      } finally { setLoading(false); }
    })();
  }, [ready]);

  if (!ready) return null;

  return (
    <AppShell email={email}>
      <header className="page-head">
        <span className="eyebrow">Achievements</span>
        <h1>Credentials</h1>
        <p className="muted">Badges and certificates you've earned.</p>
      </header>

      {loading ? (
        <div className="cred-grid">{[...Array(3)].map((_, i) => <Skeleton key={i} height="11rem" />)}</div>
      ) : creds.length === 0 ? (
        <Card><EmptyState icon={<Award size={36} />} title="No credentials yet"
          body="Complete a course or program to earn your first credential." /></Card>
      ) : (
        <div className="cred-grid">
          {creds.map((c) => (
            <Card key={c.id} className="cred">
              <div className="cred-ribbon"><Award size={26} /></div>
              <div className="cred-body">
                <Badge tone="warning">{c.type}</Badge>
                <h3>{c.name}</h3>
                <p className="muted cred-date">Issued {new Date(c.issued_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <div className="cred-verify">
                  <ShieldCheck size={14} />
                  <a className="mono verify-link" href={`/verify/${c.verification_code}`} target="_blank" rel="noopener noreferrer">{c.verification_code}</a>
                </div>
                <a className="cert-download" href={`/certificate/${c.verification_code}`} target="_blank" rel="noopener noreferrer">Download certificate →</a>
              </div>
            </Card>
          ))}
        </div>
      )}

      <style jsx>{`
        .page-head { margin-bottom: 1.75rem; }
        .page-head h1 { margin-top: 0.3rem; }
        .cred-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem; }
        :global(.cred) { overflow: hidden; }
        .cred-ribbon { height: 4.5rem; background: linear-gradient(120deg, var(--gold), #a8741f); color: #fff;
          display: flex; align-items: center; padding: 0 1.3rem; }
        .cred-body { padding: 1.3rem; }
        .cred-body h3 { font-size: 1.15rem; margin: 0.6rem 0 0.4rem; }
        .cred-date { font-size: 0.84rem; margin-bottom: 0.85rem; }
        .cert-download { display: inline-block; margin-top: 0.75rem; font-size: 0.82rem; font-weight: 600; color: var(--accent); }
        .cert-download:hover { text-decoration: underline; }
        .verify-link { color: var(--accent); }
        .verify-link:hover { text-decoration: underline; }
        .cred-verify { display: flex; align-items: center; gap: 0.4rem; padding-top: 0.85rem;
          border-top: 1px solid var(--line); color: var(--ink-soft); font-size: 0.8rem; }
        .mono { font-family: var(--mono); }
      `}</style>
    </AppShell>
  );
}
