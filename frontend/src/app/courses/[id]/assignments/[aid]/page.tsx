'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { Card, Button, Badge, Textarea, Alert, Skeleton } from '@/components/ui';
import { auth, assignments as asgApi, type MySubmission } from '@/lib/api';
import { ArrowLeft, FileText, CheckCircle2, Clock } from 'lucide-react';

export default function AssignmentSubmitPage() {
  const ready = useRequireAuth();
  const params = useParams();
  const courseId = params.id as string;
  const aid = params.aid as string;

  const [email, setEmail] = useState<string>();
  const [sub, setSub] = useState<MySubmission>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me(); setEmail(me.email);
        const s = await asgApi.mySubmission(aid).catch(() => null);
        setSub(s);
        if (s?.text_content && typeof s.text_content === 'object') {
          setText((s.text_content as { body?: string }).body ?? '');
        }
      } finally { setLoading(false); }
    })();
  }, [ready, aid]);

  const submitted = sub?.workflow_state === 'submitted' || sub?.workflow_state === 'released' || !!sub?.submitted_at;
  const graded = sub?.workflow_state === 'released';

  async function saveDraft() {
    setBusy(true); setMsg(null);
    try {
      await asgApi.saveDraft(aid, { body: text });
      setMsg('Draft saved. You can come back and submit later.');
    } catch { setMsg('Could not save draft.'); }
    finally { setBusy(false); }
  }

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      await asgApi.saveDraft(aid, { body: text });
      await asgApi.submit(aid);
      const s = await asgApi.mySubmission(aid).catch(() => null);
      setSub(s);
      setMsg('Submitted! Your teacher will grade it.');
    } catch { setMsg('Could not submit. Please try again.'); }
    finally { setBusy(false); }
  }

  if (!ready) return null;

  return (
    <AppShell email={email}>
      <a className="back" href={`/courses/${courseId}`}><ArrowLeft size={14} /> Back to course</a>

      {loading ? <Skeleton height="18rem" /> : (
        <>
          <header className="page-head">
            <div className="head-icon"><FileText size={22} /></div>
            <div>
              <h1>Assignment submission</h1>
              <p className="muted">
                {graded ? 'This assignment has been graded.'
                  : submitted ? 'You have submitted this assignment.'
                  : 'Write your response below and submit when ready.'}
              </p>
            </div>
            {submitted && <Badge tone={graded ? 'success' : 'info'}>{graded ? 'Graded' : 'Submitted'}</Badge>}
          </header>

          {msg && <Alert tone="success">{msg}</Alert>}

          {graded && sub?.feedback && (
            <Card className="feedback-card">
              <h3><CheckCircle2 size={16} /> Teacher feedback</h3>
              <p>{(sub.feedback as { comment?: string }).comment ?? 'Your submission has been graded.'}</p>
            </Card>
          )}

          <Card className="submit-card">
            <label className="lbl">Your response</label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your assignment response here…"
              rows={12}
              disabled={submitted}
            />
            {sub?.is_late && <p className="late"><Clock size={14} /> This submission was marked late.</p>}

            {!submitted ? (
              <div className="actions">
                <Button onClick={submit} disabled={busy || !text.trim()}>{busy ? 'Submitting…' : 'Submit assignment'}</Button>
                <Button variant="ghost" onClick={saveDraft} disabled={busy}>Save draft</Button>
              </div>
            ) : (
              <p className="submitted-note">
                <CheckCircle2 size={16} /> Submitted{sub?.submitted_at ? ` on ${new Date(sub.submitted_at).toLocaleString()}` : ''}.
              </p>
            )}
          </Card>
        </>
      )}

      <style jsx>{`
        .back { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.85rem; color: var(--ink-soft); font-weight: 500; margin-bottom: 1.25rem; }
        .back:hover { color: var(--accent); }
        .page-head { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
        .head-icon { width: 3rem; height: 3rem; border-radius: 12px; background: var(--accent); color: #fff; display: grid; place-items: center; flex-shrink: 0; }
        .page-head h1 { font-size: 1.5rem; }
        :global(.feedback-card) { padding: 1.25rem; margin-bottom: 1.25rem; background: rgba(5,150,105,0.06); border-color: rgba(5,150,105,0.2); }
        :global(.feedback-card) h3 { display: flex; align-items: center; gap: 0.4rem; color: var(--sage); margin-bottom: 0.5rem; }
        :global(.submit-card) { padding: 1.5rem; }
        .lbl { display: block; font-size: 0.85rem; font-weight: 600; color: var(--ink-soft); margin-bottom: 0.5rem; }
        .actions { display: flex; gap: 0.75rem; margin-top: 1.25rem; }
        .late { display: flex; align-items: center; gap: 0.4rem; color: var(--gold); font-size: 0.85rem; margin-top: 0.75rem; }
        .submitted-note { display: flex; align-items: center; gap: 0.5rem; color: var(--sage); font-weight: 500; margin-top: 1.25rem; }
      `}</style>
    </AppShell>
  );
}
