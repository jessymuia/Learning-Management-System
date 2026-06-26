'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { api, auth, ApiException, type Program, type ProgramUnit, type Course } from '@/lib/api';

export default function ProgramsUnitsPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [units, setUnits] = useState<ProgramUnit[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // create program form
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');

  // add-unit form
  const [addCourseId, setAddCourseId] = useState('');
  const [addReq, setAddReq] = useState('required');

  const loadUnits = useCallback(async (programId: string) => {
    const u = await api.get<ProgramUnit[]>(`/programs/${programId}/units`).catch(() => []);
    setUnits(u);
  }, []);

  const loadPrograms = useCallback(async () => {
    const p = await api.get<Program[]>('/programs').catch(() => []);
    setPrograms(p);
    if (p[0] && !selected) setSelected(p[0].id);
  }, [selected]);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me(); setEmail(me.email);
        await loadPrograms();
        const courses = await api.get<Course[]>('/courses').catch(() => []);
        setAllCourses(courses);
      }
      finally { setLoading(false); }
    })();
  }, [ready, loadPrograms]);

  useEffect(() => {
    if (!selected) return;
    loadUnits(selected);
  }, [selected, loadUnits]);

  async function addUnit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selected || !addCourseId) { setError('Pick a course to add.'); return; }
    try {
      await api.post(`/programs/${selected}/courses`, { courseId: addCourseId, requirement: addReq });
      setAddCourseId('');
      await loadUnits(selected);
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not add unit.');
    }
  }

  async function createProgram(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/programs', { title, slug: slug || title.toLowerCase().replace(/\s+/g, '-'), status: 'active' });
      setTitle(''); setSlug('');
      await loadPrograms();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not create program.');
    }
  }

  if (!ready) return null;

  return (
    <AppShell email={email}>
      <header className="page-head"><span className="eyebrow">Administration</span><h1>Programs &amp; Units</h1>
        <p className="muted">A program (e.g. a degree) is built from units (courses). A unit can be shared across several programs.</p></header>

      <form className="card create-card" onSubmit={createProgram}>
        <h3>New program</h3>
        <div className="create-row">
          <input className="input" placeholder="Title (e.g. BSc Computer Science)" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <input className="input" placeholder="slug (optional)" value={slug} onChange={(e) => setSlug(e.target.value)} />
          <button className="btn btn-primary" type="submit">Create</button>
        </div>
        {error && <div className="alert">{error}</div>}
      </form>

      {loading ? <p className="faint">Loading…</p> : programs.length === 0 ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <h3>No programs yet</h3><p className="muted">Create your first program above.</p>
        </div>
      ) : (
        <div className="layout">
          <aside className="prog-list">
            {programs.map((p) => (
              <button key={p.id} className={`prog-item ${selected === p.id ? 'active' : ''}`} onClick={() => setSelected(p.id)}>
                <span className="prog-title">{p.title}</span>
                <span className={`badge ${p.status === 'active' ? 'badge-active' : 'badge-draft'}`}>{p.status}</span>
              </button>
            ))}
          </aside>

          <section className="units-panel">
            <h2>Units in this program</h2>

            <form className="add-unit" onSubmit={addUnit}>
              <select className="input" value={addCourseId} onChange={(e) => setAddCourseId(e.target.value)}>
                <option value="">Add a unit…</option>
                {allCourses
                  .filter((c) => !units.some((u) => u.id === c.id))
                  .map((c) => <option key={c.id} value={c.id}>{c.shortname} — {c.fullname}</option>)}
              </select>
              <select className="input req-sel" value={addReq} onChange={(e) => setAddReq(e.target.value)}>
                <option value="required">required</option>
                <option value="elective">elective</option>
              </select>
              <button className="btn btn-primary" type="submit" disabled={!addCourseId}>Add unit</button>
            </form>
            {error && <div className="alert">{error}</div>}

            {units.length === 0 ? (
              <p className="faint">No units yet. Add one above.</p>
            ) : (
              <ul className="unit-list">
                {units.map((u) => (
                  <li key={u.id} className="unit-row card">
                    <div className="unit-main">
                      <span className="unit-code">{u.shortname}</span>
                      <span className="unit-name">{u.fullname}</span>
                    </div>
                    <div className="unit-tags">
                      <span className={`badge ${u.requirement === 'required' ? 'badge-active' : 'badge-gold'}`}>{u.requirement}</span>
                      {u.in_programs > 1 && (
                        <span className="shared" title={`Shared across ${u.in_programs} programs`}>↔ shared ({u.in_programs})</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <style jsx>{`
        .page-head { margin-bottom: 1.75rem; display: flex; flex-direction: column; gap: 0.3rem; }
        .page-head h1 { margin-top: 0.3rem; }
        .create-card { padding: 1.5rem; margin-bottom: 2rem; }
        .create-card h3 { margin-bottom: 1rem; }
        .create-row { display: flex; gap: 0.6rem; flex-wrap: wrap; }
        .create-row .input { flex: 1; min-width: 12rem; }
        .alert { background: rgba(168,68,58,0.09); color: var(--rose); padding: 0.5rem 0.8rem; border-radius: var(--radius-sm); margin-top: 0.75rem; font-size: 0.85rem; }
        .layout { display: grid; grid-template-columns: 16rem 1fr; gap: 2rem; }
        .prog-list { display: flex; flex-direction: column; gap: 0.4rem; }
        .prog-item { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.85rem 1rem;
          border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); cursor: pointer; text-align: left; }
        .prog-item.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
        .prog-title { font-weight: 600; font-size: 0.9rem; }
        .units-panel h2 { margin-bottom: 1rem; }
        .add-unit { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
        .add-unit .input { flex: 1; min-width: 10rem; }
        .add-unit .req-sel { flex: 0 0 8rem; }
        .alert { background: rgba(168,68,58,0.09); color: var(--rose); padding: 0.5rem 0.8rem; border-radius: var(--radius-sm); margin-bottom: 1rem; font-size: 0.85rem; }
        .unit-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
        .unit-row { display: flex; align-items: center; justify-content: space-between; padding: 0.9rem 1.1rem; }
        .unit-main { display: flex; flex-direction: column; gap: 0.15rem; }
        .unit-code { font-family: var(--mono); font-size: 0.75rem; color: var(--ink-faint); }
        .unit-name { font-weight: 500; }
        .unit-tags { display: flex; align-items: center; gap: 0.6rem; }
        .shared { font-size: 0.75rem; color: var(--accent); font-weight: 600; }
        @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } }
      `}</style>
    </AppShell>
  );
}
