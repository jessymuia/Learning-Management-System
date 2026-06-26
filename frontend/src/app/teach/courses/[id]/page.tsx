'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { api, auth, ApiException, type Course, type Section } from '@/lib/api';

type Content = { id: string; kind: string; title: string };

export default function TeachCoursePage() {
  const ready = useRequireAuth();
  const params = useParams();
  const courseId = String(params.id);
  const [email, setEmail] = useState<string>();
  const [course, setCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sectionName, setSectionName] = useState('');
  const [contentTitle, setContentTitle] = useState('');
  const [contentKind, setContentKind] = useState('page');

  const load = useCallback(async () => {
    const [c, secs, items] = await Promise.all([
      api.get<Course>(`/courses/${courseId}`).catch(() => null),
      api.get<Section[]>(`/courses/${courseId}/sections`).catch(() => []),
      api.get<Content[]>(`/content?courseId=${courseId}`).catch(() => []),
    ]);
    setCourse(c);
    setSections(secs);
    setContent(items);
  }, [courseId]);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me();
        setEmail(me.email);
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, load]);

  async function addSection(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/courses/${courseId}/sections`, { name: sectionName });
      setSectionName('');
      await load();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not add section.');
    }
  }

  async function addContent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/content', { courseId, kind: contentKind, title: contentTitle });
      setContentTitle('');
      await load();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not add content.');
    }
  }

  if (!ready) return null;

  return (
    <AppShell email={email}>
      <a href="/teach" className="back">← Your courses</a>
      {loading ? (
        <p className="faint">Loading…</p>
      ) : !course ? (
        <div className="card" style={{ padding: '2rem' }}><h3>Course not found</h3></div>
      ) : (
        <>
          <header className="course-head">
            <span className="eyebrow">{course.shortname} · Editing</span>
            <h1>{course.fullname}</h1>
          </header>

          {error && <div className="alert" role="alert">{error}</div>}

          <div className="cols">
            <section className="col">
              <h2>Sections</h2>
              <form className="inline-form" onSubmit={addSection}>
                <input className="input" value={sectionName} onChange={(e) => setSectionName(e.target.value)}
                  placeholder="e.g. Week 1" required />
                <button className="btn btn-primary" type="submit">Add</button>
              </form>
              {sections.length === 0 ? (
                <p className="faint">No sections yet.</p>
              ) : (
                <ul className="list">
                  {sections.map((s) => (
                    <li key={s.id} className="list-row">
                      <span className="num">{s.section_num}</span>
                      <span>{s.name || `Section ${s.section_num}`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="col">
              <h2>Content</h2>
              <form className="inline-form" onSubmit={addContent}>
                <select className="input" value={contentKind} onChange={(e) => setContentKind(e.target.value)}>
                  <option value="page">Page</option>
                  <option value="file">File</option>
                  <option value="url">URL</option>
                  <option value="video">Video</option>
                </select>
                <input className="input" value={contentTitle} onChange={(e) => setContentTitle(e.target.value)}
                  placeholder="Title" required />
                <button className="btn btn-primary" type="submit">Add</button>
              </form>
              {content.length === 0 ? (
                <p className="faint">No content yet.</p>
              ) : (
                <ul className="list">
                  {content.map((c) => (
                    <li key={c.id} className="list-row">
                      <span className="kind-tag">{c.kind}</span>
                      <span>{c.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      <style jsx>{`
        .back { font-size: 0.85rem; color: var(--accent); font-weight: 600; display: inline-block; margin-bottom: 1.25rem; }
        .course-head { margin-bottom: 1.75rem; }
        .course-head h1 { margin-top: 0.3rem; }
        .alert { background: rgba(168,68,58,0.09); border: 1px solid rgba(168,68,58,0.25); color: var(--rose);
          padding: 0.6rem 0.85rem; border-radius: var(--radius-sm); margin-bottom: 1.25rem; font-size: 0.85rem; }
        .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
        .col h2 { margin-bottom: 1rem; }
        .inline-form { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
        .inline-form .input { flex: 1; }
        .list { list-style: none; display: flex; flex-direction: column; gap: 0.4rem; }
        .list-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 0.9rem;
          background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); font-size: 0.9rem; }
        .num { width: 1.6rem; height: 1.6rem; display: grid; place-items: center; background: var(--surface-sunken);
          border-radius: 50%; font-size: 0.78rem; font-weight: 600; color: var(--ink-soft); }
        .kind-tag { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;
          color: var(--accent); background: rgba(37,99,168,0.1); padding: 0.15rem 0.45rem; border-radius: 4px; }
        @media (max-width: 760px) { .cols { grid-template-columns: 1fr; gap: 1.5rem; } }
      `}</style>
    </AppShell>
  );
}
