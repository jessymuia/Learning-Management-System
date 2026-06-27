'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { auth, api } from '@/lib/api';

type UserRow = { id: string; email: string; role?: string; tenant?: string; created_at?: string };

export default function AdminUsersPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [me, data] = await Promise.all([auth.me(), api.get<UserRow[]>('/operator/users').catch(() => [])]);
        setEmail(me.email);
        setUsers(data);
      } finally { setLoading(false); }
    })();
  }, [ready]);

  const filtered = users.filter(u => !search || u.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <AppShell email={email}>
      <div className="content">
        <div className="page-head">
          <p className="eyebrow">Platform Management</p>
          <h1>Users</h1>
          <p className="muted">{users.length} total users on the platform</p>
        </div>
        <div className="field" style={{ maxWidth: 360, marginBottom: '1.5rem' }}>
          <input className="input" placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {loading && <p className="muted">Loading users…</p>}
        {!loading && filtered.length === 0 && (
          <div className="empty-state"><div className="icon">👥</div><h3>No users found</h3></div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="dashboard-table">
            <table>
              <thead><tr><th>Email</th><th>Tenant</th><th>Role</th><th>Joined</th></tr></thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>{u.email}</td>
                    <td className="muted">{u.tenant ?? '—'}</td>
                    <td>{u.role ? <span className="badge badge-draft">{u.role}</span> : '—'}</td>
                    <td className="muted">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
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
