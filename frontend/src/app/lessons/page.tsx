'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { auth, api } from '@/lib/api';

type Lesson = { id: string; title: string; section_id: string; sort_order: number };

export default function LessonsPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me();
        setEmail(me.email);
        const courses = await api.get<{ id: string }[]>('/courses').catch(() => []);
        if (courses.length > 0) {
          const all = await Promise.all(
            courses.slice(0, 5).map(c => api.get<Lesson[]>(`/courses/${c.id}/lessons`).catch(() => []))
          );
          setLessons(all.flat());
        }
      } finally { setLoading(false); }
    })();
  }, [ready]);

  return (
    <AppShell email={email}>
      <div className="content">
        <div className="page-head">
          <p className="eyebrow">Content</p>
          <h1>Lessons</h1>
        </div>
        {loading && <p className="muted">Loading lessons…</p>}
        {!loading && lessons.length === 0 && (
          <div className="empty-state"><div className="icon">📖</div><h3>No lessons available</h3><p>Lessons from your courses will appear here.</p></div>
        )}
        {!loading && lessons.length > 0 && (
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {lessons.map((l, i) => (
              <div key={l.id} className="card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', color: 'var(--accent)', fontWeight: 700, fontSize: '0.9rem' }}>{i + 1}</div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>{l.title}</h3>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
