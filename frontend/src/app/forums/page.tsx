'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { api, auth, type Enrolment, type Forum } from '@/lib/api';

export default function ForumsPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [forums, setForums] = useState<(Forum & { course: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me();
        setEmail(me.email);
        const courses = await api.get<Enrolment[]>('/enrolments/mine').catch(() => []);
        const all: (Forum & { course: string })[] = [];
        for (const c of courses) {
          const fs = await api.get<Forum[]>(`/forums?courseId=${c.course_id}`).catch(() => []);
          fs.forEach((f) => all.push({ ...f, course: c.fullname }));
        }
        setForums(all);
      } finally {
        setLoading(false);
      }
    })();
  }, [ready]);

  if (!ready) return null;

  return (
    <AppShell email={email}>
      <header className="page-head"><span className="eyebrow">Discussion</span><h1>Forums</h1></header>
      {loading ? <p className="faint">Loading…</p> : forums.length === 0 ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <h3>No forums yet</h3><p className="muted">Course discussion forums will appear here.</p>
        </div>
      ) : (
        <ul className="forum-list">
          {forums.map((f) => (
            <li key={f.id}>
              <a href={`/forums/${f.id}`} className="forum-row card">
                <div>
                  <div className="forum-name">{f.name}</div>
                  <div className="forum-course faint">{f.course}</div>
                </div>
                <span className={`badge ${f.type === 'qanda' ? 'badge-gold' : 'badge-draft'}`}>{f.type}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <style jsx>{`
        .page-head { margin-bottom: 1.75rem; } .page-head h1 { margin-top: 0.3rem; }
        .forum-list { list-style: none; display: flex; flex-direction: column; gap: 0.6rem; }
        .forum-row { display: flex; align-items: center; justify-content: space-between; padding: 1.1rem 1.25rem; transition: box-shadow 0.15s; }
        .forum-row:hover { box-shadow: var(--shadow); }
        .forum-name { font-weight: 600; } .forum-course { font-size: 0.8rem; margin-top: 0.1rem; }
      `}</style>
    </AppShell>
  );
}
