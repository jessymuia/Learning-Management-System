'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { auth, orgReports, type TeacherActivity } from '@/lib/api';

export default function TeachersPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [teachers, setTeachers] = useState<TeacherActivity[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [me, data] = await Promise.all([auth.me(), orgReports.teachers().catch(() => [])]);
        setEmail(me.email);
        setTeachers(data);
      } finally { setLoading(false); }
    })();
  }, [ready]);

  const filtered = teachers.filter(t => !search || t.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <AppShell email={email}>
      <div className="content">
        <div className="page-head">
          <p className="eyebrow">Management</p>
          <h1>Teachers</h1>
          <p className="muted">{teachers.length} teachers in your organisation</p>
        </div>
        <div className="field" style={{ maxWidth: 360, marginBottom: '1.5rem' }}>
          <input className="input" placeholder="Search by email…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {loading && <p className="muted">Loading teachers…</p>}
        {!loading && filtered.length === 0 && (
          <div className="empty-state"><div className="icon">🎓</div><h3>No teachers found</h3></div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="dashboard-table">
            <table>
              <thead><tr><th>Email</th><th>Courses</th><th>Students</th></tr></thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 500 }}>{t.email}</td>
                    <td>{t.courses}</td>
                    <td>{t.students}</td>
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
