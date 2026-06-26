'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, Select, Table, EmptyState, Skeleton, Alert } from '@/components/ui';
import { api, auth, reports as reportsApi, ApiException, type Course, type TenantOverview, type CourseOverview, type AtRiskLearner, type ReportTrends } from '@/lib/api';
import { BarChart, LineChart, Donut } from '@/components/Charts';
import { Users2, BookOpen, Layers, CheckCircle2, TrendingUp, GraduationCap, AlertTriangle, CreditCard } from 'lucide-react';

export default function ReportsPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [overview, setOverview] = useState<TenantOverview | null>(null);
  const [trends, setTrends] = useState<ReportTrends | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selected, setSelected] = useState('');
  const [courseStats, setCourseStats] = useState<CourseOverview | null>(null);
  const [atRisk, setAtRisk] = useState<AtRiskLearner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me(); setEmail(me.email);
        const [ov, tr, cs] = await Promise.all([
          api.get<TenantOverview>('/reports/tenant').catch(() => null),
          reportsApi.trends().catch(() => null),
          api.get<Course[]>('/courses').catch(() => []),
        ]);
        setOverview(ov); setTrends(tr); setCourses(cs);
        if (cs[0]) setSelected(cs[0].id);
      } catch (err) {
        if (err instanceof ApiException) setError(err.message);
      } finally { setLoading(false); }
    })();
  }, [ready]);

  const loadCourse = useCallback(async (courseId: string) => {
    if (!courseId) return;
    const [stats, risk] = await Promise.all([
      api.get<CourseOverview>(`/reports/courses/${courseId}`).catch(() => null),
      api.get<AtRiskLearner[]>(`/reports/courses/${courseId}/at-risk`).catch(() => []),
    ]);
    setCourseStats(stats); setAtRisk(risk);
  }, []);

  useEffect(() => { if (selected) loadCourse(selected); }, [selected, loadCourse]);

  if (!ready) return null;

  const completionRate = courseStats && courseStats.tracked > 0
    ? Math.round((courseStats.completed / courseStats.tracked) * 100) : null;

  const orgStats = [
    { icon: Users2, label: 'Active members', value: overview?.active_members ?? '—' },
    { icon: BookOpen, label: 'Active courses', value: overview?.active_courses ?? '—' },
    { icon: Layers, label: 'Active programs', value: overview?.active_programs ?? '—' },
    { icon: CheckCircle2, label: 'Completions', value: overview?.course_completions ?? '—' },
    { icon: TrendingUp, label: 'Completion rate', value: overview?.completion_rate != null ? `${overview.completion_rate}%` : '—' },
    { icon: CreditCard, label: 'Revenue', value: overview?.revenue_minor != null ? `KES ${(overview.revenue_minor / 100).toLocaleString()}` : '—' },
    { icon: GraduationCap, label: 'Active enrolments', value: overview?.active_enrolments ?? '—' },
  ];

  const courseStatTiles = courseStats ? [
    { icon: Users2, label: 'Active enrolments', value: courseStats.active_enrolments },
    { icon: CheckCircle2, label: 'Completion rate', value: completionRate != null ? `${completionRate}%` : '—' },
    { icon: TrendingUp, label: 'Average grade', value: courseStats.avg_pct != null ? `${courseStats.avg_pct}%` : '—' },
    { icon: GraduationCap, label: 'Graded learners', value: courseStats.graded_learners },
  ] : [];

  return (
    <AppShell email={email}>
      <header className="page-head">
        <span className="eyebrow">Reports</span>
        <h1>Analytics &amp; reports</h1>
        <p className="muted">Organization health and per-course learner progress.</p>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <div className="tiles">{[...Array(4)].map((_, i) => <Skeleton key={i} height="6rem" />)}</div>
      ) : (
        <>
          <section className="block">
            <h2>Organization overview</h2>
            <div className="tiles">
              {orgStats.map((s, i) => {
                const Icon = s.icon;
                return (
                  <Card key={i} className="tile">
                    <div className="tile-icon"><Icon size={20} /></div>
                    <div><div className="tile-val">{s.value}</div><div className="tile-lab">{s.label}</div></div>
                  </Card>
                );
              })}
            </div>
          </section>

          <section className="block">
            <h2>Analytics</h2>
            <div className="chart-grid">
              <Card className="chart-card">
                <h3>Enrolments (last 6 months)</h3>
                <LineChart data={trends?.enrolments ?? []} />
              </Card>
              <Card className="chart-card">
                <h3>Revenue (last 6 months)</h3>
                <BarChart data={(trends?.revenue ?? []).map((r) => ({ label: r.label, value: Math.round(r.value / 100) }))}
                  format={(n) => `KES ${n.toLocaleString()}`} />
              </Card>
              <Card className="chart-card">
                <h3>Completion breakdown</h3>
                <Donut a={trends?.completion_breakdown?.completed ?? 0} b={trends?.completion_breakdown?.in_progress ?? 0}
                  labelA="Completed" labelB="In progress" />
              </Card>
              <Card className="chart-card">
                <h3>Top courses by enrolment</h3>
                <BarChart data={(trends?.top_courses ?? []).map((c) => ({ label: c.label.length > 12 ? c.label.slice(0, 12) + '…' : c.label, value: c.value }))} />
              </Card>
            </div>
          </section>

          <section className="block">
            <div className="block-head">
              <h2>Course report</h2>
              <Select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ maxWidth: '20rem' }}>
                {courses.length === 0 ? <option>No courses</option>
                  : courses.map((c) => <option key={c.id} value={c.id}>{c.shortname} — {c.fullname}</option>)}
              </Select>
            </div>

            {!courseStats ? (
              <Card><EmptyState title="Select a course" body="Choose a course above to see its report." /></Card>
            ) : (
              <>
                <div className="tiles">
                  {courseStatTiles.map((s, i) => {
                    const Icon = s.icon;
                    return (
                      <Card key={i} className="tile">
                        <div className="tile-icon"><Icon size={20} /></div>
                        <div><div className="tile-val">{s.value}</div><div className="tile-lab">{s.label}</div></div>
                      </Card>
                    );
                  })}
                </div>

                <div className="at-risk-head">
                  <AlertTriangle size={18} className="ar-icon" />
                  <h3>At-risk learners</h3>
                  <span className="faint">below 50%, or not yet graded</span>
                </div>
                {atRisk.length === 0 ? (
                  <Card><EmptyState icon={<CheckCircle2 size={36} />} title="No at-risk learners" body="Everyone in this course is on track." /></Card>
                ) : (
                  <Table columns={['Learner', 'Course total', 'Status']}>
                    {atRisk.map((l) => (
                      <tr key={l.user_id}>
                        <td>{l.email}</td>
                        <td>{l.course_total_pct != null ? `${l.course_total_pct}%` : '—'}</td>
                        <td>{l.course_total_pct == null
                          ? <Badge tone="neutral">no grades yet</Badge>
                          : <Badge tone="danger">at risk</Badge>}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </>
            )}
          </section>
        </>
      )}

      <style jsx>{`
        .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
        @media (max-width: 820px) { .chart-grid { grid-template-columns: 1fr; } }
        :global(.chart-card) { padding: 1.4rem; }
        :global(.chart-card) h3 { font-size: 0.95rem; margin-bottom: 0.5rem; color: var(--ink); }
        .page-head { margin-bottom: 1.75rem; }
        .page-head h1 { margin-top: 0.3rem; }
        .block { margin-bottom: 2.25rem; }
        .block > h2 { margin-bottom: 1rem; }
        .block-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
        .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1.25rem; margin-bottom: 1.5rem; }
        :global(.tile) { padding: 1.3rem; display: flex; align-items: center; gap: 1rem; }
        .tile-icon { width: 2.6rem; height: 2.6rem; border-radius: 10px; background: var(--accent-soft); color: var(--accent);
          display: grid; place-items: center; flex-shrink: 0; }
        .tile-val { font-family: var(--serif); font-size: 1.7rem; font-weight: 600; color: var(--ink); line-height: 1; }
        .tile-lab { font-size: 0.78rem; color: var(--ink-faint); margin-top: 0.3rem; }
        .at-risk-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.85rem; }
        .ar-icon { color: var(--gold); }
        .at-risk-head h3 { margin: 0; }
        .at-risk-head .faint { font-size: 0.8rem; }
      `}</style>
    </AppShell>
  );
}
