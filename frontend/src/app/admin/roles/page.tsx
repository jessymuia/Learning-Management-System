'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { auth, api, type Role } from '@/lib/api';

export default function RolesPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [me, data] = await Promise.all([auth.me(), api.get<Role[]>('/roles').catch(() => [])]);
        setEmail(me.email);
        setRoles(data);
      } finally { setLoading(false); }
    })();
  }, [ready]);

  return (
    <AppShell email={email}>
      <div className="content">
        <div className="page-head">
          <p className="eyebrow">Platform Management</p>
          <h1>Roles &amp; Permissions</h1>
        </div>
        {loading && <p className="muted">Loading roles…</p>}
        {!loading && roles.length === 0 && (
          <div className="empty-state"><div className="icon">🛡️</div><h3>No roles defined</h3></div>
        )}
        {!loading && roles.length > 0 && (
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {roles.map(r => (
              <div key={r.id} className="card" style={{ padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '0.5rem', textTransform: 'capitalize' }}>{r.name.replace(/_/g, ' ')}</h3>
                {r.permissions && (
                  <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {r.permissions.split(',').slice(0, 8).map((p, i) => (
                      <span key={i} className="badge badge-draft" style={{ fontSize: '0.7rem' }}>{p.trim()}</span>
                    ))}
                    {r.permissions.split(',').length > 8 && <span className="faint" style={{ fontSize: '0.78rem' }}>+{r.permissions.split(',').length - 8} more</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
