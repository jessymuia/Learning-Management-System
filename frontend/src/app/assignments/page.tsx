'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { auth, api } from '@/lib/api';

type AssignmentRow = { id: string; title: string; due_at: string | null; course?: string; submission_count?: number; graded_count?: number };

export default function AssignmentsPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [items, setItems] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [me, data] = await Promise.all([
          auth.me(),
          api.get<AssignmentRow[]>('/assignments').catch(() => []),
        ]);
        setEmail(me.email);
        setItems(data);
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [ready]);

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const isOverdue = (d: string | null) => d ? new Date(d) < new Date() : false;

  return (
    <AppShell email={email}>
      <div className="content">
        <div className="page-head">
          <p className="eyebrow">Learning</p>
          <h1>Assignments</h1>
        </div>
        {loading && <p className="muted">Loading assignments…</p>}
        {error && <div className="alert alert-error">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="empty-state"><div className="icon">📋</div><h3>No assignments yet</h3><p>Assignments from your courses will appear here.</p></div>
        )}
        {!loading && items.length > 0 && (
          <div className="dashboard-table">
            <table>
              <thead><tr><th>Title</th><th>Course</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {items.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.title}</td>
                    <td className="muted">{a.course ?? '—'}</td>
                    <td style={{ color: isOverdue(a.due_at) ? 'var(--rose)' : 'inherit' }}>{fmt(a.due_at)}</td>
                    <td><span className={`badge ${isOverdue(a.due_at) ? 'badge-overdue' : 'badge-active'}`}>{isOverdue(a.due_at) ? 'Overdue' : 'Pending'}</span></td>
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
