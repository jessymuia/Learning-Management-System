'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, Button, Select, Table, EmptyState, Alert, Skeleton } from '@/components/ui';
import { api, auth, ApiException, type Course, type RosterEntry, type Member } from '@/lib/api';
import { UserPlus, X, Users2 } from 'lucide-react';

export default function EnrolmentsPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState('');
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState<Member[]>([]);
  const [picked, setPicked] = useState<Member | null>(null);

  const loadRoster = useCallback(async (courseId: string) => {
    if (!courseId) return;
    setRoster(await api.get<RosterEntry[]>(`/enrolments?courseId=${courseId}`).catch(() => []));
  }, []);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me(); setEmail(me.email);
        const c = await api.get<Course[]>('/courses').catch(() => []);
        setCourses(c);
        const initial = c[0]?.id ?? '';
        setCourse(initial);
        if (initial) await loadRoster(initial);
      } finally { setLoading(false); }
    })();
  }, [ready, loadRoster]);

  useEffect(() => { if (course) loadRoster(course); }, [course, loadRoster]);

  useEffect(() => {
    if (search.trim().length < 2) { setMatches([]); return; }
    const t = setTimeout(async () => {
      const res = await api.get<Member[]>(`/users?search=${encodeURIComponent(search)}`).catch(() => []);
      setMatches(res.filter((m) => !roster.some((r) => r.user_id === m.id)));
    }, 300);
    return () => clearTimeout(t);
  }, [search, roster]);

  async function enrol() {
    setError(null);
    if (!picked || !course) { setError('Search and pick a student by email.'); return; }
    try {
      await api.post('/enrolments', { courseId: course, userId: picked.id, type: 'manual' });
      setPicked(null); setSearch(''); setMatches([]);
      await loadRoster(course);
    } catch (err) { setError(err instanceof ApiException ? err.message : 'Could not enrol.'); }
  }

  async function setStatus(r: RosterEntry, status: 'active' | 'suspended') {
    try { await api.patch(`/enrolments/${r.id}/status`, { status }); await loadRoster(course); }
    catch (err) { setError(err instanceof ApiException ? err.message : 'Could not update.'); }
  }

  if (!ready) return null;
  const active = roster.filter((r) => r.status === 'active').length;

  return (
    <AppShell email={email}>
      <header className="page-head">
        <span className="eyebrow">Teaching · Enrolments</span>
        <h1>Manage enrolments</h1>
        <p className="muted">Add students by email and manage who's in this course.</p>
      </header>

      <div className="course-pick">
        <Select value={course} onChange={(e) => setCourse(e.target.value)} style={{ maxWidth: '22rem' }}>
          {courses.length === 0 ? <option>No courses</option>
            : courses.map((c) => <option key={c.id} value={c.id}>{c.shortname} — {c.fullname}</option>)}
        </Select>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="add-card">
        <h3><UserPlus size={18} /> Enrol a student</h3>
        <div className="add-row">
          <div className="search-wrap">
            {picked ? (
              <div className="chip">
                <span>{picked.email}</span>
                <button className="chip-x" onClick={() => { setPicked(null); setSearch(''); }}><X size={14} /></button>
              </div>
            ) : (
              <>
                <input className="ui-input" placeholder="Search a student by email…" value={search} onChange={(e) => setSearch(e.target.value)} />
                {matches.length > 0 && (
                  <ul className="matches">
                    {matches.map((m) => (
                      <li key={m.id}><button onClick={() => { setPicked(m); setMatches([]); }}>{m.email}</button></li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <Button onClick={enrol} disabled={!picked}>Enrol</Button>
        </div>
        <p className="faint hint">Search resolves the email to the student automatically.</p>
      </Card>

      <div className="roster-head">
        <h2>Roster</h2>
        <span className="faint">{active} active of {roster.length}</span>
      </div>
      {loading ? <Skeleton height="10rem" /> : roster.length === 0 ? (
        <Card><EmptyState icon={<Users2 size={36} />} title="No students enrolled" body="Add students using the search above." /></Card>
      ) : (
        <Table columns={['Student', 'Status', '']}>
          {roster.map((r) => (
            <tr key={r.id}>
              <td>{r.email}</td>
              <td><Badge tone={r.status === 'active' ? 'success' : 'neutral'}>{r.status}</Badge></td>
              <td>{r.status === 'active'
                ? <Button variant="danger" size="sm" onClick={() => setStatus(r, 'suspended')}>Suspend</Button>
                : <Button variant="ghost" size="sm" onClick={() => setStatus(r, 'active')}>Reactivate</Button>}</td>
            </tr>
          ))}
        </Table>
      )}

      <style jsx>{`
        .page-head { margin-bottom: 1.5rem; }
        .page-head h1 { margin-top: 0.3rem; }
        .course-pick { margin-bottom: 1.5rem; }
        :global(.add-card) { padding: 1.5rem; margin-bottom: 2rem; }
        .add-card h3 { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; }
        .add-row { display: flex; gap: 0.6rem; align-items: flex-start; }
        .search-wrap { position: relative; flex: 1; }
        .matches { position: absolute; z-index: 10; top: 100%; left: 0; right: 0; margin-top: 0.25rem; list-style: none;
          background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--shadow); max-height: 14rem; overflow-y: auto; }
        .matches button { width: 100%; text-align: left; padding: 0.6rem 0.85rem; background: none; border: none; cursor: pointer; font-size: 0.88rem; }
        .matches button:hover { background: var(--surface-sunken); }
        .chip { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.8rem;
          background: var(--accent-soft); border: 1px solid var(--accent); border-radius: var(--radius-sm); font-size: 0.9rem; }
        .chip-x { background: none; border: none; cursor: pointer; color: var(--ink-soft); display: grid; place-items: center; }
        .hint { font-size: 0.78rem; margin-top: 0.75rem; }
        .roster-head { display: flex; align-items: baseline; gap: 0.75rem; margin-bottom: 1rem; }
      `}</style>
    </AppShell>
  );
}
