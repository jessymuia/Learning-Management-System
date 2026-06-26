'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { api, auth, ApiException, type Course } from '@/lib/api';

type QType = 'mcq' | 'truefalse' | 'shortanswer' | 'numerical' | 'essay';

function QuizAuthorInner() {
  const ready = useRequireAuth();
  const sp = useSearchParams();
  const courseId = sp.get('course') || '';
  const [email, setEmail] = useState<string>();
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState(courseId);
  const [quizName, setQuizName] = useState('');
  const [timeLimit, setTimeLimit] = useState('');
  const [quizId, setQuizId] = useState<string | null>(null);
  const [catId, setCatId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<{ id: string; text: string; type: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // new question form
  const [qtype, setQtype] = useState<QType>('mcq');
  const [qtext, setQtext] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [tfAnswer, setTfAnswer] = useState('true');
  const [textAnswer, setTextAnswer] = useState('');
  const [mark, setMark] = useState('1');

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const m = await auth.me(); setEmail(m.email);
      const c = await api.get<Course[]>('/courses').catch(() => []);
      setCourses(c);
      if (!course && c[0]) setCourse(c[0].id);
    })();
  }, [ready]);

  async function createQuiz() {
    setError(null); setMsg(null);
    if (!course || !quizName) { setError('Pick a course and name the quiz.'); return; }
    try {
      const q = await api.post<{ id: string }>('/quizzes', {
        courseId: course, name: quizName,
        timeLimitS: timeLimit ? Number(timeLimit) * 60 : undefined,
      });
      setQuizId(q.id);
      // ensure a question-bank category exists for this course
      const cat = await api.post<{ id: string }>('/question-categories', { courseId: course, name: `${quizName} bank` });
      setCatId(cat.id);
      setMsg('Quiz created. Now add questions below.');
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not create quiz.');
    }
  }

  function buildData(): Record<string, unknown> {
    if (qtype === 'mcq') return { options: options.filter(Boolean), correct };
    if (qtype === 'truefalse') return { correct: tfAnswer === 'true' };
    if (qtype === 'shortanswer') return { accepted: [textAnswer] };
    if (qtype === 'numerical') return { answer: Number(textAnswer), tolerance: 0 };
    return {}; // essay → manual
  }

  async function addQuestion() {
    setError(null); setMsg(null);
    if (!quizId || !catId) { setError('Create the quiz first.'); return; }
    if (!qtext) { setError('Enter the question text.'); return; }
    try {
      const question = await api.post<{ id: string }>('/questions', {
        categoryId: catId, qtype, questiontext: qtext,
        defaultmark: Number(mark), data: buildData(),
      });
      await api.post(`/questions/${question.id}/versions`, {
        questiontext: qtext, data: buildData(), defaultmark: Number(mark),
      });
      await api.post(`/quizzes/${quizId}/slots`, { questionId: question.id, maxmark: Number(mark) });
      setQuestions((prev) => [...prev, { id: question.id, text: qtext, type: qtype }]);
      setQtext(''); setOptions(['', '', '', '']); setCorrect(0); setTextAnswer('');
      setMsg('Question added to the quiz.');
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not add question.');
    }
  }

  if (!ready) return null;

  return (
    <AppShell email={email}>
      <header className="page-head"><span className="eyebrow">Teaching · Quiz</span><h1>Quiz authoring</h1>
        <p className="muted">Create a quiz, then add questions with their answer keys.</p></header>

      {error && <div className="alert">{error}</div>}
      {msg && <div className="ok">{msg}</div>}

      {!quizId ? (
        <section className="card step">
          <h3>1 · New quiz</h3>
          <div className="row">
            <select className="input" value={course} onChange={(e) => setCourse(e.target.value)}>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.shortname} — {c.fullname}</option>)}
            </select>
            <input className="input" placeholder="Quiz name" value={quizName} onChange={(e) => setQuizName(e.target.value)} />
            <input className="input time" type="number" placeholder="mins" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} />
            <button className="btn btn-primary" onClick={createQuiz}>Create quiz</button>
          </div>
          <p className="hint faint">Time limit is optional. The server enforces it once a student starts.</p>
        </section>
      ) : (
        <>
          <section className="card step">
            <h3>2 · Add a question</h3>
            <div className="qform">
              <div className="qrow">
                <select className="input type-sel" value={qtype} onChange={(e) => setQtype(e.target.value as QType)}>
                  <option value="mcq">Multiple choice</option>
                  <option value="truefalse">True / False</option>
                  <option value="shortanswer">Short answer</option>
                  <option value="numerical">Numerical</option>
                  <option value="essay">Essay (manual grade)</option>
                </select>
                <input className="input mark" type="number" step="0.5" value={mark} onChange={(e) => setMark(e.target.value)} title="Marks" />
              </div>
              <textarea className="input" rows={2} placeholder="Question text" value={qtext} onChange={(e) => setQtext(e.target.value)} />

              {qtype === 'mcq' && (
                <div className="options">
                  {options.map((opt, i) => (
                    <label key={i} className="opt">
                      <input type="radio" checked={correct === i} onChange={() => setCorrect(i)} />
                      <input className="input" placeholder={`Option ${i + 1}`} value={opt}
                        onChange={(e) => setOptions(options.map((o, j) => j === i ? e.target.value : o))} />
                    </label>
                  ))}
                  <p className="hint faint">Select the radio next to the correct option.</p>
                </div>
              )}
              {qtype === 'truefalse' && (
                <select className="input" value={tfAnswer} onChange={(e) => setTfAnswer(e.target.value)}>
                  <option value="true">Correct answer: True</option>
                  <option value="false">Correct answer: False</option>
                </select>
              )}
              {(qtype === 'shortanswer' || qtype === 'numerical') && (
                <input className="input" placeholder={qtype === 'numerical' ? 'Correct number' : 'Accepted answer'}
                  value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)} />
              )}
              {qtype === 'essay' && <p className="hint faint">Essays are graded manually in the grading screen.</p>}

              <button className="btn btn-primary" onClick={addQuestion}>Add question</button>
            </div>
          </section>

          <section className="added">
            <h3>Questions in this quiz ({questions.length})</h3>
            {questions.length === 0 ? <p className="faint">None yet.</p> : (
              <ol className="qlist">
                {questions.map((q, i) => (
                  <li key={q.id} className="card qitem">
                    <span className="qnum">{i + 1}</span>
                    <span className="qtext">{q.text}</span>
                    <span className="badge badge-active">{q.type}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}

      <style jsx>{`
        .page-head { margin-bottom: 1.75rem; display: flex; flex-direction: column; gap: 0.3rem; }
        .page-head h1 { margin-top: 0.3rem; }
        .alert { background: rgba(168,68,58,0.09); color: var(--rose); padding: 0.6rem 0.9rem; border-radius: var(--radius-sm); margin-bottom: 1rem; font-size: 0.88rem; }
        .ok { background: rgba(79,122,104,0.1); color: var(--sage); padding: 0.6rem 0.9rem; border-radius: var(--radius-sm); margin-bottom: 1rem; font-size: 0.88rem; }
        .step { padding: 1.5rem; margin-bottom: 1.5rem; }
        .step h3 { margin-bottom: 1rem; }
        .row { display: flex; gap: 0.6rem; flex-wrap: wrap; }
        .row .input { flex: 1; min-width: 8rem; } .row .time { flex: 0 0 6rem; }
        .qform { display: flex; flex-direction: column; gap: 0.75rem; }
        .qrow { display: flex; gap: 0.6rem; } .type-sel { flex: 1; } .mark { flex: 0 0 6rem; }
        .options { display: flex; flex-direction: column; gap: 0.5rem; }
        .opt { display: flex; align-items: center; gap: 0.6rem; }
        .opt .input { flex: 1; }
        .hint { font-size: 0.78rem; }
        .added h3 { margin-bottom: 1rem; }
        .qlist { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
        .qitem { display: flex; align-items: center; gap: 0.85rem; padding: 0.85rem 1.1rem; }
        .qnum { font-family: var(--mono); color: var(--ink-faint); font-size: 0.8rem; }
        .qtext { flex: 1; }
      `}</style>
    </AppShell>
  );
}

export default function QuizAuthorPage() {
  return <Suspense fallback={null}><QuizAuthorInner /></Suspense>;
}
