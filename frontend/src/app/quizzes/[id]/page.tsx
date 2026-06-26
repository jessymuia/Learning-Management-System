'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { api, auth, ApiException, type QuizAttempt, type QuizSlot } from '@/lib/api';

export default function QuizPlayerPage() {
  const ready = useRequireAuth();
  const params = useParams();
  const quizId = String(params.id);
  const [email, setEmail] = useState<string>();
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [slots, setSlots] = useState<QuizSlot[]>([]);
  const [answers, setAnswers] = useState<Record<number, unknown>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>>();
  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const loadAttempt = useCallback(async () => {
    const list = await api.get<QuizAttempt[]>(`/quizzes/${quizId}/attempts`).catch(() => []);
    const live = list.find((a) => a.state === 'inprogress' || a.state === 'overdue');
    if (live) {
      setAttempt(live);
      const s = await api.get<QuizSlot[]>(`/quizzes/${quizId}/slots`).catch(() => []);
      setSlots(s);
      const steps = await api.get<{ slot_num: number; response: unknown }[]>(`/attempts/${live.id}/steps`).catch(() => []);
      const restored: Record<number, unknown> = {};
      const savedMap: Record<number, boolean> = {};
      steps.forEach((st) => { restored[st.slot_num] = st.response; savedMap[st.slot_num] = true; });
      setAnswers(restored);
      setSaved(savedMap);
    }
  }, [quizId]);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try { const me = await auth.me(); setEmail(me.email); await loadAttempt(); }
      finally { setLoading(false); }
    })();
  }, [ready, loadAttempt]);

  useEffect(() => {
    if (!attempt?.due_at) { setRemaining(null); return; }
    const tick = () => {
      const ms = new Date(attempt.due_at as string).getTime() - Date.now();
      const s = Math.max(0, Math.floor(ms / 1000));
      setRemaining(s);
      if (s === 0) finish();
    };
    tick();
    timer.current = setInterval(tick, 1000);
    return () => clearInterval(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt?.due_at]);

  async function start() {
    setError(null);
    try {
      const a = await api.post<QuizAttempt>(`/quizzes/${quizId}/attempts`);
      setAttempt(a);
      const s = await api.get<QuizSlot[]>(`/quizzes/${quizId}/slots`).catch(() => []);
      setSlots(s); setAnswers({}); setSaved({}); setCurrent(0);
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not start attempt.');
    }
  }

  function setAnswer(slotNum: number, value: unknown) {
    setAnswers((p) => ({ ...p, [slotNum]: value }));
    setSaved((p) => ({ ...p, [slotNum]: false }));
    if (saveTimers.current[slotNum]) clearTimeout(saveTimers.current[slotNum]);
    saveTimers.current[slotNum] = setTimeout(() => autosave(slotNum, value), 600);
  }

  async function autosave(slotNum: number, value: unknown) {
    if (!attempt) return;
    try {
      await api.post(`/attempts/${attempt.id}/steps`, { slotNum, response: value, action: 'save' });
      setSaved((p) => ({ ...p, [slotNum]: true }));
    } catch { setSaved((p) => ({ ...p, [slotNum]: false })); }
  }

  async function finish() {
    if (!attempt || submitted) return;
    setSubmitted(true);
    clearInterval(timer.current);
    try {
      await Promise.all(Object.entries(answers).map(([slot, val]) =>
        api.post(`/attempts/${attempt.id}/steps`, { slotNum: Number(slot), response: val, action: 'submit' }).catch(() => {})
      ));
      await api.post(`/attempts/${attempt.id}/finish`);
      setAttempt(null);
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not submit.');
      setSubmitted(false);
    }
  }

  if (!ready) return null;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const slot = slots[current];

  return (
    <AppShell email={email}>
      <a href="/courses" className="back">← Courses</a>
      <header className="quiz-head"><span className="eyebrow">Assessment</span><h1>Quiz</h1></header>
      {error && <div className="alert" role="alert">{error}</div>}

      {loading ? <p className="faint">Loading…</p>
      : submitted ? (
        <div className="card done-card">
          <div className="check" aria-hidden>✓</div>
          <h2>Attempt submitted</h2>
          <p className="muted">Your answers were saved and submitted for grading.</p>
        </div>
      ) : !attempt ? (
        <section className="start card">
          <h2>Ready when you are</h2>
          <p className="muted">Your answers autosave as you go. The timer is enforced by the server.</p>
          <button className="btn btn-primary" onClick={start} style={{ marginTop: '1rem' }}>Start attempt</button>
        </section>
      ) : (
        <>
          <div className="player-top">
            <div className="progress">Question {current + 1} of {slots.length || 1}</div>
            {remaining != null && <div className={`timer ${remaining < 60 ? 'urgent' : ''}`}>{fmt(remaining)}</div>}
          </div>
          {slot ? (
            <section className="question card">
              <div className="q-text">{slot.questiontext}</div>
              <QuestionInput slot={slot} value={answers[slot.slot_num]} onChange={(v) => setAnswer(slot.slot_num, v)} />
              <div className="save-hint faint">
                {saved[slot.slot_num] ? 'Saved ✓' : answers[slot.slot_num] != null ? 'Saving…' : 'Not answered'}
              </div>
            </section>
          ) : <p className="faint">No questions in this quiz.</p>}
          <nav className="q-nav">
            <button className="btn btn-ghost" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>Previous</button>
            {current < slots.length - 1
              ? <button className="btn btn-primary" onClick={() => setCurrent((c) => c + 1)}>Next</button>
              : <button className="btn btn-primary" onClick={finish}>Submit attempt</button>}
          </nav>
          <div className="q-dots">
            {slots.map((s, i) => (
              <button key={s.slot_num} className={`dot ${i === current ? 'active' : ''} ${saved[s.slot_num] ? 'answered' : ''}`}
                onClick={() => setCurrent(i)} aria-label={`Question ${i + 1}`} />
            ))}
          </div>
        </>
      )}

      <style jsx>{`
        .back { font-size: 0.85rem; color: var(--accent); font-weight: 600; display: inline-block; margin-bottom: 1.25rem; }
        .quiz-head { margin-bottom: 1.5rem; } .quiz-head h1 { margin-top: 0.3rem; }
        .alert { background: rgba(168,68,58,0.09); border: 1px solid rgba(168,68,58,0.25); color: var(--rose);
          padding: 0.7rem 1rem; border-radius: var(--radius-sm); margin-bottom: 1.25rem; font-size: 0.88rem; }
        .start, .done-card { padding: 2rem; text-align: center; }
        .done-card .check { width: 3rem; height: 3rem; border-radius: 50%; background: var(--sage); color: #fff;
          display: grid; place-items: center; font-size: 1.5rem; margin: 0 auto 1rem; }
        .player-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
        .progress { font-size: 0.85rem; color: var(--ink-soft); font-weight: 600; }
        .timer { font-family: var(--mono); font-size: 1.4rem; font-weight: 600; color: var(--ink); }
        .timer.urgent { color: var(--rose); }
        .question { padding: 1.75rem; margin-bottom: 1.5rem; }
        .q-text { font-size: 1.1rem; font-weight: 500; margin-bottom: 1.25rem; }
        .save-hint { font-size: 0.78rem; margin-top: 1rem; }
        .q-nav { display: flex; justify-content: space-between; margin-bottom: 1.5rem; }
        .q-dots { display: flex; gap: 0.4rem; flex-wrap: wrap; }
        .dot { width: 1.6rem; height: 1.6rem; border-radius: 50%; border: 1px solid var(--line);
          background: var(--surface); cursor: pointer; font-size: 0; }
        .dot.answered { background: var(--sage); border-color: var(--sage); }
        .dot.active { box-shadow: 0 0 0 2px var(--accent); }
      `}</style>
    </AppShell>
  );
}

function QuestionInput({ slot, value, onChange }: { slot: QuizSlot; value: unknown; onChange: (v: unknown) => void }) {
  if (slot.qtype === 'mcq' || slot.qtype === 'truefalse') {
    const opts = slot.choices ?? (slot.qtype === 'truefalse'
      ? [{ id: 'true', label: 'True' }, { id: 'false', label: 'False' }] : []);
    return (
      <div className="opts">
        {opts.map((o) => (
          <label key={o.id} className={`opt ${value === o.id ? 'sel' : ''}`}>
            <input type="radio" name={`q${slot.slot_num}`} checked={value === o.id} onChange={() => onChange(o.id)} />
            <span>{o.label}</span>
          </label>
        ))}
        <style jsx>{`
          .opts { display: flex; flex-direction: column; gap: 0.5rem; }
          .opt { display: flex; align-items: center; gap: 0.6rem; padding: 0.75rem 1rem; border: 1px solid var(--line);
            border-radius: var(--radius-sm); cursor: pointer; transition: border-color 0.12s, background 0.12s; }
          .opt.sel { border-color: var(--accent); background: rgba(37,99,168,0.05); }
        `}</style>
      </div>
    );
  }
  if (slot.qtype === 'multichoice') {
    const opts = slot.choices ?? [];
    const arr = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (id: string) => onChange(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
    return (
      <div className="opts">
        {opts.map((o) => (
          <label key={o.id} className={`opt ${arr.includes(o.id) ? 'sel' : ''}`}>
            <input type="checkbox" checked={arr.includes(o.id)} onChange={() => toggle(o.id)} />
            <span>{o.label}</span>
          </label>
        ))}
        <style jsx>{`
          .opts { display: flex; flex-direction: column; gap: 0.5rem; }
          .opt { display: flex; align-items: center; gap: 0.6rem; padding: 0.75rem 1rem; border: 1px solid var(--line);
            border-radius: var(--radius-sm); cursor: pointer; }
          .opt.sel { border-color: var(--accent); background: rgba(37,99,168,0.05); }
        `}</style>
      </div>
    );
  }
  if (slot.qtype === 'numerical' || slot.qtype === 'shortanswer') {
    return (
      <input className="input" type={slot.qtype === 'numerical' ? 'number' : 'text'}
        value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="Your answer" />
    );
  }
  return (
    <textarea className="input" rows={6} value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)} placeholder="Write your answer…" />
  );
}
