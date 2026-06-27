'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { auth, operator, type PlatformActivityItem } from '@/lib/api';

export default function AuditLogsPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [logs, setLogs] = useState<PlatformActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [me, activity] = await Promise.all([auth.me(), operator.activity().catch(() => null)]);
        setEmail(me.email);
        setLogs([...(activity?.activity ?? []), ...(activity?.security ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      } finally { setLoading(false); }
    })();
  }, [ready]);

  const fmt = (d: string) => new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <AppShell email={email}>
      <div className="content">
        <div className="page-head">
          <p className="eyebrow">Operations</p>
          <h1>Audit Logs</h1>
        </div>
        {loading && <p className="muted">Loading audit logs…</p>}
        {!loading && logs.length === 0 && (
          <div className="empty-state"><div className="icon">📋</div><h3>No audit events</h3><p>Platform activity will appear here.</p></div>
        )}
        {!loading && logs.length > 0 && (
          <div className="dashboard-table">
            <table>
              <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Tenant</th><th>IP</th></tr></thead>
              <tbody>
                {logs.map((l, i) => (
                  <tr key={i}>
                    <td className="muted" style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{fmt(l.created_at)}</td>
                    <td style={{ fontWeight: 500, fontSize: '0.88rem' }}>{l.actor_email ?? 'System'}</td>
                    <td><span className="badge badge-draft">{l.action}</span></td>
                    <td className="muted">{l.target_type ?? '—'}</td>
                    <td className="muted">{l.tenant_name ?? '—'}</td>
                    <td><code style={{ fontSize: '0.78rem' }}>{l.ip ?? '—'}</code></td>
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
