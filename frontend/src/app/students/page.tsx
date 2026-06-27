'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { auth, teacher, type TeacherStudent } from '@/lib/api';

export default function StudentsPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [me, data] = await Promise.all([auth.me(), teacher.students().catch(() => [])]);
        setEmail(me.email);
        setStudents(data);
      } finally { setLoading(false); }
    })();
  }, [ready]);

  const filtered = students.filter(s => !search || s.email.toLowerCase().includes(search.toLowerCase()) || s.course.toLowerCase().includes(search.toLowerCase()));

  return (
    <AppShell email={email}>
      <div className="content">
        <div className="page-head">
          <p className="eyebrow">Teaching</p>
          <h1>Students</h1>
          <p className="muted">{students.length} enrolled across your courses</p>
        </div>
        <div className="field" style={{ maxWidth: 360, marginBottom: '1.5rem' }}>
          <input className="input" placeholder="Search by email or course…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {loading && <p className="muted">Loading students…</p>}
        {!loading && filtered.length === 0 && (
          <div className="empty-state"><div className="icon">👤</div><h3>No students found</h3></div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="dashboard-table">
            <table>
              <thead><tr><th>Email</th><th>Course</th><th>Status</th><th>Progress</th><th>Grade</th></tr></thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id + s.course_id}>
                    <td style={{ fontWeight: 500 }}>{s.email}</td>
                    <td className="muted">{s.course}</td>
                    <td><span className={`badge ${s.status === 'active' ? 'badge-active' : 'badge-draft'}`}>{s.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${s.total_activities ? Math.round((s.done_activities / s.total_activities) * 100) : 0}%`, background: 'var(--sage)', borderRadius: 3 }} />
                        </div>
                        <span className="faint" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{s.total_activities ? Math.round((s.done_activities / s.total_activities) * 100) : 0}%</span>
                      </div>
                    </td>
                    <td>{s.grade_pct != null ? `${Math.round(s.grade_pct)}%` : '—'}</td>
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
