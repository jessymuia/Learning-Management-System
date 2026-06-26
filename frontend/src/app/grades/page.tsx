'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, Table, EmptyState, Skeleton } from '@/components/ui';
import { api, auth, type Enrolment, type GradeSummary } from '@/lib/api';
import { GraduationCap } from 'lucide-react';

export default function GradesPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [rows, setRows] = useState<{ course: Enrolment; summary: GradeSummary | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me(); setEmail(me.email);
        const enrolments = await api.get<Enrolment[]>('/enrolments/mine').catch(() => []);
        const withGrades = await Promise.all(
          enrolments.map(async (course) => {
            const summary = await api
              .get<GradeSummary>(`/grades/summary?courseId=${course.course_id}&userId=${me.userId}`)
              .catch(() => null);
            return { course, summary };
          })
        );
        setRows(withGrades);
      } finally {
        setLoading(false);
      }
    })();
  }, [ready]);

  if (!ready) return null;

  function tone(pct: number | null | undefined) {
    if (pct == null) return 'neutral' as const;
    if (pct >= 70) return 'success' as const;
    if (pct >= 50) return 'warning' as const;
    return 'danger' as const;
  }

  return (
    <AppShell email={email}>
      <header className="page-head">
        <span className="eyebrow">Your progress</span>
        <h1>Grades</h1>
        <p className="muted">Your results across all enrolled courses.</p>
      </header>

      {loading ? (
        <Skeleton height="12rem" />
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={<GraduationCap size={40} />} title="No grades yet"
          body="Once you're enrolled and graded, your results show here." /></Card>
      ) : (
        <Table columns={['Course', 'Code', 'Grade', 'Status']}>
          {rows.map(({ course, summary }) => {
            const pct = summary?.course_total_pct;
            return (
              <tr key={course.id} onClick={() => { window.location.href = `/courses/${course.course_id}`; }} style={{ cursor: 'pointer' }}>
                <td><strong>{course.fullname}</strong></td>
                <td className="faint" style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem' }}>{course.shortname}</td>
                <td>
                  {pct != null ? (
                    <div className="grade-cell">
                      <div className="grade-bar"><div className="grade-fill" style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 70 ? 'var(--sage)' : pct >= 50 ? 'var(--gold)' : 'var(--rose)' }} /></div>
                      <span className="grade-pct">{Math.round(pct)}%</span>
                    </div>
                  ) : <span className="faint">Not graded</span>}
                </td>
                <td><Badge tone={tone(pct)}>{pct == null ? 'pending' : pct >= 50 ? 'passing' : 'at risk'}</Badge></td>
              </tr>
            );
          })}
        </Table>
      )}

      <style jsx>{`
        .page-head { margin-bottom: 1.75rem; }
        .page-head h1 { margin-top: 0.3rem; }
        .grade-cell { display: flex; align-items: center; gap: 0.7rem; }
        .grade-bar { width: 7rem; height: 7px; background: var(--surface-sunken); border-radius: 4px; overflow: hidden; }
        .grade-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
        .grade-pct { font-weight: 600; font-size: 0.88rem; min-width: 2.5rem; }
      `}</style>
    </AppShell>
  );
}
