'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { auth, api, type Quiz } from '@/lib/api';

export default function QuizzesPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [me, data] = await Promise.all([
          auth.me(),
          api.get<Quiz[]>('/quizzes').catch(() => []),
        ]);
        setEmail(me.email);
        setQuizzes(data);
      } finally { setLoading(false); }
    })();
  }, [ready]);

  return (
    <AppShell email={email}>
      <div className="content">
        <div className="page-head">
          <p className="eyebrow">Assessment</p>
          <h1>Quizzes</h1>
        </div>
        {loading && <p className="muted">Loading quizzes…</p>}
        {!loading && quizzes.length === 0 && (
          <div className="empty-state"><div className="icon">✏️</div><h3>No quizzes yet</h3><p>Quizzes assigned to your courses will appear here.</p></div>
        )}
        {!loading && quizzes.length > 0 && (
          <div className="dashboard-table">
            <table>
              <thead><tr><th>Quiz Name</th><th>Time Limit</th><th>Attempts Allowed</th><th>Grading Method</th></tr></thead>
              <tbody>
                {quizzes.map(q => (
                  <tr key={q.id}>
                    <td style={{ fontWeight: 500 }}>{q.name}</td>
                    <td className="muted">{q.time_limit_s ? `${Math.round(q.time_limit_s / 60)} min` : 'Unlimited'}</td>
                    <td className="muted">{q.attempts_allowed === 0 ? 'Unlimited' : q.attempts_allowed}</td>
                    <td><span className="badge badge-draft">{q.grade_method}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
