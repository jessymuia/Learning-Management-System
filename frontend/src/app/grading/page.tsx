'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { auth, teacher, type PendingGrade } from '@/lib/api';

export default function GradingPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [pending, setPending] = useState<PendingGrade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [me, overview] = await Promise.all([auth.me(), teacher.overview().catch(() => null)]);
        setEmail(me.email);
        setPending(overview?.pending ?? []);
      } finally { setLoading(false); }
    })();
  }, [ready]);

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';

  return (
    <AppShell email={email}>
      <div className="content">
        <div className="page-head">
          <p className="eyebrow">Teaching</p>
          <h1>Grading</h1>
          <p className="muted">{pending.length} submission{pending.length !== 1 ? 's' : ''} awaiting review</p>
        </div>
        {loading && <p className="muted">Loading submissions…</p>}
        {!loading && pending.length === 0 && (
          <div className="empty-state"><div className="icon">✅</div><h3>All caught up!</h3><p>No submissions are waiting for grading.</p></div>
        )}
        {!loading && pending.length > 0 && (
          <div className="dashboard-table">
            <table>
              <thead><tr><th>Student</th><th>Assignment</th><th>Course</th><th>Submitted</th><th>Late?</th></tr></thead>
              <tbody>
                {pending.map(p => (
                  <tr key={p.submission_id}>
                    <td style={{ fontWeight: 500 }}>{p.student}</td>
                    <td>{p.title}</td>
                    <td className="muted">{p.course}</td>
                    <td className="muted">{fmt(p.submitted_at)}</td>
                    <td>{p.is_late ? <span className="badge badge-overdue">Late</span> : <span className="badge badge-active">On time</span>}</td>
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
