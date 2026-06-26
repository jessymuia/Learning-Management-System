'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { api, auth, type TenantOverview } from '@/lib/api';

export default function AdminPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [stats, setStats] = useState<TenantOverview | null>(null);
  const [usage, setUsage] = useState<{ metric: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me();
        setEmail(me.email);
        const [s, u] = await Promise.all([
          api.get<TenantOverview>('/reports/tenant').catch(() => null),
          api.get<{ metric: string; value: number }[]>('/admin/usage').catch(() => []),
        ]);
        setStats(s);
        setUsage(u);
      } finally {
        setLoading(false);
      }
    })();
  }, [ready]);

  if (!ready) return null;

  const cards = stats ? [
    { label: 'Active courses', value: stats.active_courses },
    { label: 'Active members', value: stats.active_members },
    { label: 'Active programs', value: stats.active_programs },
    { label: 'Completions', value: stats.course_completions },
  ] : [];

  return (
    <AppShell email={email}>
      <header className="page-head"><span className="eyebrow">Administration</span><h1>Tenant overview</h1></header>
      {loading ? <p className="faint">Loading…</p> : !stats ? (
        <div className="card" style={{ padding: '2rem' }}><h3>No access</h3><p className="muted">You need manager rights to view tenant reporting.</p></div>
      ) : (
        <>
          <div className="stat-grid">
            {cards.map((c) => (
              <div key={c.label} className="stat-card card">
                <div className="stat-value">{c.value}</div>
                <div className="stat-label">{c.label}</div>
              </div>
            ))}
          </div>
          <section className="usage">
            <h2>Usage metering</h2>
            {usage.length === 0 ? <p className="faint">No usage recorded this period.</p> : (
              <table className="usage-table card">
                <thead><tr><th>Metric</th><th>Value</th></tr></thead>
                <tbody>{usage.map((u) => <tr key={u.metric}><td>{u.metric}</td><td>{u.value}</td></tr>)}</tbody>
              </table>
            )}
          </section>
        </>
      )}
      <style jsx>{`
        .page-head { margin-bottom: 1.75rem; } .page-head h1 { margin-top: 0.3rem; }
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1.25rem; margin-bottom: 2.5rem; }
        .stat-card { padding: 1.5rem; text-align: center; }
        .stat-value { font-family: var(--serif); font-size: 2.6rem; font-weight: 600; color: var(--accent); line-height: 1; }
        .stat-label { font-size: 0.8rem; color: var(--ink-faint); margin-top: 0.5rem; }
        .usage h2 { margin-bottom: 1rem; }
        .usage-table { width: 100%; border-collapse: collapse; overflow: hidden; }
        .usage-table th { text-align: left; padding: 0.85rem 1.25rem; background: var(--surface-sunken); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-faint); }
        .usage-table td { padding: 0.85rem 1.25rem; border-top: 1px solid var(--line); }
      `}</style>
    </AppShell>
  );
}
