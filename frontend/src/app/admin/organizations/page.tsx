'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { auth, operator, type PlatformTenant } from '@/lib/api';

export default function OrganizationsPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [search, setSearch] = useState('');
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

  const filtered = tenants.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase()));

  async function toggleStatus(id: string, current: string) {
    const next = current === 'active' ? 'suspended' : 'active';
    await operator.setStatus(id, next).catch(() => {});
    setTenants(prev => prev.map(t => t.id === id ? { ...t, status: next } : t));
  }

  return (
    <AppShell email={email}>
      <div className="content">
        <div className="page-head">
          <p className="eyebrow">Platform Management</p>
          <h1>Organizations</h1>
          <p className="muted">{tenants.length} organizations on this platform</p>
        </div>
        <div className="field" style={{ maxWidth: 360, marginBottom: '1.5rem' }}>
          <input className="input" placeholder="Search organizations…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {loading && <p className="muted">Loading organizations…</p>}
        {!loading && filtered.length === 0 && (
          <div className="empty-state"><div className="icon">🏢</div><h3>No organizations found</h3></div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="dashboard-table">
            <table>
              <thead><tr><th>Name</th><th>Slug</th><th>Plan</th><th>Members</th><th>Courses</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td><code style={{ fontSize: '0.82rem', background: 'var(--surface-sunken)', padding: '2px 6px', borderRadius: 4 }}>{t.slug}</code></td>
                    <td><span className="badge badge-gold">{t.plan}</span></td>
                    <td>{t.members}</td>
                    <td>{t.courses}</td>
                    <td><span className={`badge ${t.status === 'active' ? 'badge-active' : 'badge-overdue'}`}>{t.status}</span></td>
                    <td><button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }} onClick={() => toggleStatus(t.id, t.status)}>{t.status === 'active' ? 'Suspend' : 'Reactivate'}</button></td>
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
