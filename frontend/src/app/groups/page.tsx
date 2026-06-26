'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { api, auth, type Enrolment, type Group } from '@/lib/api';

export default function GroupsPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [groups, setGroups] = useState<(Group & { course: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me();
        setEmail(me.email);
        const courses = await api.get<Enrolment[]>('/enrolments/mine').catch(() => []);
        const all: (Group & { course: string })[] = [];
        for (const c of courses) {
          const gs = await api.get<Group[]>(`/groups?courseId=${c.course_id}`).catch(() => []);
          gs.forEach((g) => all.push({ ...g, course: c.fullname }));
        }
        setGroups(all);
      } finally { setLoading(false); }
    })();
  }, [ready]);

  if (!ready) return null;

  return (
    <AppShell email={email}>
      <header className="page-head"><span className="eyebrow">Collaboration</span><h1>Groups</h1></header>
      {loading ? <p className="faint">Loading…</p> : groups.length === 0 ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <h3>No groups</h3><p className="muted">Course groups you belong to will appear here.</p>
        </div>
      ) : (
        <div className="group-grid">
          {groups.map((g) => (
            <div key={g.id} className="group-card card">
              <div className="g-icon" aria-hidden>◎</div>
              <h3>{g.name}</h3>
              <p className="faint" style={{ fontSize: '0.8rem' }}>{g.course}</p>
            </div>
          ))}
        </div>
      )}
      <style jsx>{`
        .page-head { margin-bottom: 1.75rem; } .page-head h1 { margin-top: 0.3rem; }
        .group-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1.25rem; }
        .group-card { padding: 1.5rem; }
        .g-icon { font-size: 1.6rem; color: var(--accent); margin-bottom: 0.5rem; }
      `}</style>
    </AppShell>
  );
}
