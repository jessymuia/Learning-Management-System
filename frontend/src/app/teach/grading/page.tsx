'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { Card, Button, Badge, Field, Input, Textarea, Modal, Alert, EmptyState, Skeleton, Select } from '@/components/ui';
import { api, auth, ApiException, type Submission, type Course, type AssignmentRow } from '@/lib/api';
import { ClipboardCheck, FileText } from 'lucide-react';

function GradingInner() {
  const ready = useRequireAuth();
  const sp = useSearchParams();
  const [email, setEmail] = useState<string>();
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState('');
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [assignmentId, setAssignmentId] = useState(sp.get('assignment') || '');
  const [subs, setSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  const [active, setActive] = useState<Submission | null>(null);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me(); setEmail(me.email);
        const c = await api.get<Course[]>('/courses').catch(() => []);
        setCourses(c);
        if (c[0]) setCourse(c[0].id);
      } finally { setLoading(false); }
    })();
  }, [ready]);

  // load assignments when course changes
  useEffect(() => {
    if (!course) return;
    api.get<AssignmentRow[]>(`/assignments?courseId=${course}`).then(setAssignments).catch(() => setAssignments([]));
  }, [course]);

  const loadSubs = useCallback(async (aid: string) => {
    if (!aid) { setSubs([]); return; }
    const s = await api.get<Submission[]>(`/assignments/${aid}/submissions`).catch(() => []);
    setSubs(s);
  }, []);

  useEffect(() => { if (assignmentId) loadSubs(assignmentId); }, [assignmentId, loadSubs]);

  function openGrade(s: Submission) {
    setActive(s);
    setScore(s.grade != null ? String(s.grade) : '');
    setFeedback(s.feedback ?? '');
    setError(null);
  }

  async function save() {
    if (!active) return;
    setSaving(true); setError(null);
    try {
      await api.post(`/submissions/${active.id}/grade`, {
        grade: score === '' ? null : Number(score),
        feedback: feedback ? { comment: feedback } : undefined,
        workflowState: 'released',
      });
      setActive(null);
      await loadSubs(assignmentId);
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not save grade.');
    } finally { setSaving(false); }
  }

  if (!ready) return null;

  const graded = subs.filter((s) => s.workflow_state === 'released' || s.grade != null).length;

  return (
    <AppShell email={email}>
      <header className="page-head">
        <span className="eyebrow">Teaching</span>
        <h1>Grading</h1>
        <p className="muted">Pick a course and assignment, then grade each submission.</p>
      </header>

      <div className="pickers">
        <Field label="Course">
          <Select value={course} onChange={(e) => { setCourse(e.target.value); setAssignmentId(''); setSubs([]); }}>
            {courses.length === 0 ? <option>No courses</option> : courses.map((c) => <option key={c.id} value={c.id}>{c.shortname} — {c.fullname}</option>)}
          </Select>
        </Field>
        <Field label="Assignment">
          <Select value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
            <option value="">Select an assignment…</option>
            {assignments.map((a) => <option key={a.id} value={a.id}>{a.title} ({a.graded_count}/{a.submission_count} graded)</option>)}
          </Select>
        </Field>
      </div>

      {loading ? (
        <Skeleton height="10rem" />
      ) : !assignmentId ? (
        <Card><EmptyState icon={<ClipboardCheck size={40} />} title="Select an assignment"
          body={assignments.length === 0 ? 'This course has no assignments yet. Create one in the Course Builder.' : 'Choose an assignment above to see its submissions.'} /></Card>
      ) : subs.length === 0 ? (
        <Card><EmptyState icon={<FileText size={40} />} title="No submissions yet"
          body="When students submit this assignment, they'll appear here to grade." /></Card>
      ) : (
        <>
          <div className="grade-progress">
            <Badge tone={graded === subs.length ? 'success' : 'warning'}>{graded} of {subs.length} graded</Badge>
          </div>
          <div className="sub-list">
            {subs.map((s) => (
              <Card key={s.id} hover className="sub-card" onClick={() => openGrade(s)}>
                <div className="sub-main">
                  <div className="sub-icon"><FileText size={18} /></div>
                  <div>
                    <div className="sub-email">{s.email ?? 'Student'}</div>
                    <div className="sub-state faint">{s.is_late ? 'Late · ' : ''}{s.state}</div>
                  </div>
                </div>
                <div className="sub-right">
                  {(s.workflow_state === 'released' || s.grade != null)
                    ? <Badge tone="success">{s.grade != null ? `${s.grade}` : 'Graded'}</Badge>
                    : <Badge tone="neutral">Needs grading</Badge>}
                  <Button size="sm" variant="ghost">Grade</Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Modal open={!!active} onClose={() => setActive(null)} title={`Grade — ${active?.email ?? 'submission'}`}
        footer={<>
          <Button variant="ghost" onClick={() => setActive(null)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save grade'}</Button>
        </>}>
        {error && <Alert tone="error">{error}</Alert>}
        {active?.text_content && (
          <div className="submission-text">
            <span className="faint" style={{ fontSize: '0.78rem' }}>Submission</span>
            <p>{active.text_content}</p>
          </div>
        )}
        <Field label="Score"><Input type="number" value={score} onChange={(e) => setScore(e.target.value)} placeholder="0–100" /></Field>
        <Field label="Feedback"><Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={4} placeholder="Comments for the student…" /></Field>
      </Modal>

      <style jsx>{`
        .page-head { margin-bottom: 1.5rem; }
        .page-head h1 { margin-top: 0.3rem; }
        .pickers { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
        .grade-progress { margin-bottom: 1rem; }
        .sub-list { display: flex; flex-direction: column; gap: 0.75rem; }
        :global(.sub-card) { padding: 1rem 1.2rem; display: flex; align-items: center; justify-content: space-between; }
        .sub-main { display: flex; align-items: center; gap: 0.85rem; }
        .sub-icon { width: 2.2rem; height: 2.2rem; border-radius: 8px; background: var(--surface-sunken); color: var(--ink-soft); display: grid; place-items: center; }
        .sub-email { font-weight: 600; font-size: 0.92rem; }
        .sub-state { font-size: 0.78rem; margin-top: 0.1rem; }
        .sub-right { display: flex; align-items: center; gap: 0.75rem; }
        .submission-text { background: var(--surface-sunken); padding: 0.85rem 1rem; border-radius: var(--radius-sm); margin-bottom: 1rem; }
        .submission-text p { margin-top: 0.3rem; font-size: 0.9rem; }
        @media (max-width: 700px) { .pickers { grid-template-columns: 1fr; } }
      `}</style>
    </AppShell>
  );
}

export default function GradingPage() {
  return <Suspense fallback={null}><GradingInner /></Suspense>;
}
