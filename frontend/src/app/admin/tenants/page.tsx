'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { auth, operator, type PlatformTenant } from '@/lib/api';

export default function TenantsPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [me, data] = await Promise.all([auth.me(), operator.tenants().catch(() => [])]);
        setEmail(me.email);
        setTenants(data);
      } finally { setLoading(false); }
    })();
  }, [ready]);

  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <AppShell email={email}>
      <div className="content">
        <div className="page-head">
          <p className="eyebrow">Platform Management</p>
          <h1>Tenants</h1>
          <p className="muted">{tenants.length} tenants registered</p>
        </div>
        {loading && <p className="muted">Loading tenants…</p>}
        {!loading && tenants.length === 0 && (
          <div className="empty-state"><div className="icon">🏛️</div><h3>No tenants yet</h3></div>
        )}
        {!loading && tenants.length > 0 && (
          <div className="dashboard-table">
            <table>
              <thead><tr><th>Name</th><th>Slug</th><th>Plan</th><th>Members</th><th>Courses</th><th>Created</th><th>Status</th></tr></thead>
              <tbody>
                {tenants.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td><code style={{ fontSize: '0.82rem', background: 'var(--surface-sunken)', padding: '2px 6px', borderRadius: 4 }}>{t.slug}</code></td>
                    <td><span className="badge badge-gold">{t.plan}</span></td>
                    <td>{t.members}</td>
                    <td>{t.courses}</td>
                    <td className="muted">{fmt(t.created_at)}</td>
                    <td><span className={`badge ${t.status === 'active' ? 'badge-active' : 'badge-overdue'}`}>{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
