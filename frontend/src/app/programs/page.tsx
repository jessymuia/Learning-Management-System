'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, EmptyState, Skeleton } from '@/components/ui';
import { api, auth, type Program } from '@/lib/api';
import { Layers, ArrowRight } from 'lucide-react';

export default function ProgramsPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me(); setEmail(me.email);
        setPrograms(await api.get<Program[]>('/programs').catch(() => []));
      } finally { setLoading(false); }
    })();
  }, [ready]);

  if (!ready) return null;

  return (
    <AppShell email={email}>
      <header className="page-head">
        <span className="eyebrow">Catalog</span>
        <h1>Programs</h1>
        <p className="muted">Multi-course programs leading to a credential.</p>
      </header>

      {loading ? (
        <div className="grid">{[...Array(4)].map((_, i) => <Skeleton key={i} height="9rem" />)}</div>
      ) : programs.length === 0 ? (
        <Card><EmptyState icon={<Layers size={36} />} title="No programs yet" body="Programs offered by your organization will appear here." /></Card>
      ) : (
        <div className="grid">
          {programs.map((p) => (
            <a key={p.id} href={`/programs/${p.id}`}>
              <Card hover className="prog">
                <div className="prog-icon"><Layers size={22} /></div>
                <div className="prog-body">
                  <div className="prog-top">
                    <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>{p.status}</Badge>
                  </div>
                  <h3>{p.title}</h3>
                  <p className="muted prog-sub">{p.min_electives} elective{p.min_electives === 1 ? '' : 's'} required</p>
                  <span className="prog-link">View program <ArrowRight size={14} /></span>
                </div>
              </Card>
            </a>
          ))}
        </div>
      )}

      <style jsx>{`
        .page-head { margin-bottom: 1.75rem; }
        .page-head h1 { margin-top: 0.3rem; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem; }
        :global(.prog) { padding: 1.4rem; display: flex; gap: 1rem; }
        .prog-icon { width: 3rem; height: 3rem; border-radius: 12px; background: var(--accent-soft); color: var(--accent);
          display: grid; place-items: center; flex-shrink: 0; }
        .prog-body { flex: 1; min-width: 0; }
        .prog-top { margin-bottom: 0.5rem; }
        .prog-body h3 { font-size: 1.1rem; margin-bottom: 0.3rem; }
        .prog-sub { font-size: 0.85rem; margin-bottom: 0.6rem; }
        .prog-link { font-size: 0.82rem; color: var(--accent); font-weight: 600; display: inline-flex; align-items: center; gap: 0.25rem; }
      `}</style>
    </AppShell>
  );
}
