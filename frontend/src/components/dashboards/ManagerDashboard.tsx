'use client';
import { useEffect, useState } from 'react';
import { Card, Badge, Skeleton, Button, SearchInput } from '@/components/ui';
import { BarChart, LineChart, Donut } from '@/components/Charts';
import {
  orgReports, reports as reportsApi, branding as brandingApi, api,
  type OrgOverview, type TeacherActivity, type OrgActivityItem,
  type ReportTrends, type Branding, type TopCourse,
} from '@/lib/api';
import {
  Users2, GraduationCap, BookOpen, Layers, CreditCard, Activity,
  UserPlus, Plus, BarChart3, FileText, ChevronRight, TrendingUp,
  CheckCircle2, AlertTriangle, Building2, Wallet, Clock, XCircle,
  RefreshCw,
} from 'lucide-react';

type TenantOrder = {
  id: string; amount_minor: number; currency: string; status: string;
  buyer_email: string; item_title?: string | null; created_at: string;
};

const kes = (minor: number) => `KES ${(minor / 100).toLocaleString()}`;
function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function labelAction(a: string): string {
  const m: Record<string, string> = {
    login: 'User signed in', 'user.create': 'User registered', 'enrolment.create': 'Student enrolled',
    'course.create': 'Course created', 'course.publish': 'Course published',
    'submission.submit': 'Assignment submitted', 'payment.complete': 'Payment completed',
    'payment.success': 'Payment received', 'role.assign': 'Role assigned',
  };
  return m[a] ?? a.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ManagerDashboard({ firstName }: { firstName: string }) {
  const [ov, setOv] = useState<OrgOverview | null>(null);
  const [teachers, setTeachers] = useState<TeacherActivity[]>([]);
  const [activity, setActivity] = useState<OrgActivityItem[]>([]);
  const [trends, setTrends] = useState<ReportTrends | null>(null);
  const [orders, setOrders] = useState<TenantOrder[]>([]);
  const [brand, setBrand] = useState<Branding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teacherQ, setTeacherQ] = useState('');
  const [showQA, setShowQA] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  async function load() {
    try {
      const [o, te, ac, tr, ord, b] = await Promise.all([
        orgReports.overview().catch(() => null),
        orgReports.teachers().catch(() => []),
        orgReports.activity().catch(() => []),
        reportsApi.trends().catch(() => null),
        api.get<TenantOrder[]>('/payments/report').catch(() => []),
        brandingApi.mine().catch(() => null),
      ]);
      setOv(o); setTeachers(te); setActivity(ac); setTrends(tr); setOrders(ord); setBrand(b);
      setLastRefresh(new Date());
      if (!o) setError('Some organization data could not be loaded.');
      else setError(null);
    } catch { setError('Failed to load the organization dashboard.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const orgName = brand?.name || 'Your organization';
  const filteredTeachers = teachers.filter((t) => !teacherQ || t.email.toLowerCase().includes(teacherQ.toLowerCase()));
  const completionRate = ov && ov.active_enrolments > 0
    ? Math.round((ov.completed_courses / (ov.active_enrolments + ov.completed_courses)) * 100) : 0;

  if (loading) return (
    <div className="mgr">
      <Skeleton height="7rem" />
      <div className="tiles">{[...Array(6)].map((_, i) => <Skeleton key={i} height="6rem" />)}</div>
      <div className="mgr-grid3">{[...Array(3)].map((_, i) => <Skeleton key={i} height="14rem" />)}</div>
    </div>
  );

  return (
    <div className="mgr">

      {/* ── HEADER ─────────────────────────────────── */}
      <header className="mgr-head">
        <div className="mh-left">
          {brand?.logoUrl
            ? <img src={brand.logoUrl} alt={orgName} className="mh-logo" />
            : <div className="mh-mark"><Building2 size={22} /></div>}
          <div>
            <span className="eyebrow">Organization · {orgName}</span>
            <h1>Welcome back, {firstName}.</h1>
            <p className="muted">{ov?.students ?? 0} students · {ov?.teachers ?? 0} teachers · {ov?.total_courses ?? 0} courses
              &nbsp;· updated {timeAgo(lastRefresh.toISOString())}
            </p>
          </div>
        </div>
        <div className="ha-right">
          <button className="refresh-btn" onClick={() => { setLoading(true); load(); }} title="Refresh"><RefreshCw size={15} /></button>
          <div className="qa-wrap">
            <Button onClick={() => setShowQA(!showQA)}><Plus size={15} /> Quick actions</Button>
            {showQA && (
              <div className="qa-menu" onMouseLeave={() => setShowQA(false)}>
                <a href="/admin/people"><UserPlus size={14} /> Add student</a>
                <a href="/admin/people"><UserPlus size={14} /> Add teacher</a>
                <a href="/admin/programs"><Layers size={14} /> Create program</a>
                <a href="/teach"><BookOpen size={14} /> Create course</a>
                <a href="/reports"><BarChart3 size={14} /> View reports</a>
              </div>
            )}
          </div>
        </div>
      </header>

      {error && <Card className="err-banner"><AlertTriangle size={15} /> {error}</Card>}

      {/* ── 1. ORGANIZATION OVERVIEW CARDS ─────────── */}
      <div className="tiles">
        <Tile icon={<GraduationCap />} value={ov?.students ?? 0} label="Students"
          sub={`+${ov?.new_students_30d ?? 0} in 30d`} href="/admin/people" color="accent" />
        <Tile icon={<Users2 />} value={ov?.teachers ?? 0} label="Teachers"
          href="/admin/people" />
        <Tile icon={<Layers />} value={ov?.total_programs ?? 0} label="Programs"
          href="/admin/programs" />
        <Tile icon={<BookOpen />} value={ov?.total_courses ?? 0} label="Courses"
          sub={`${ov?.published_courses ?? 0} published`} href="/courses" color="accent" />
        <Tile icon={<Activity />} value={ov?.active_enrolments ?? 0} label="Active enrolments"
          sub={`+${ov?.new_enrolments_7d ?? 0} this week`} href="/teach/enrolments" color="sage" />
        <Tile icon={<CheckCircle2 />} value={ov?.completed_courses ?? 0} label="Completions"
          sub={`${completionRate}% rate`} href="/reports" color="sage" />
      </div>

      {/* ── 2. STUDENT ANALYTICS  +  3. TEACHER SUMMARY ── */}
      <div className="mgr-cols">

        {/* Student analytics */}
        <Card className="panel">
          <div className="panel-head">
            <h3><GraduationCap size={16} /> Student analytics</h3>
            <a href="/admin/people">Manage <ChevronRight size={13} /></a>
          </div>

          <div className="ustat-row">
            <div className="ustat"><div className="uv">{ov?.students ?? 0}</div><div className="ul">Total</div></div>
            <div className="ustat accent"><div className="uv">{ov?.new_students_30d ?? 0}</div><div className="ul">New (30d)</div></div>
            <div className="ustat sage"><div className="uv">{ov?.active_learners ?? 0}</div><div className="ul">Active (30d)</div></div>
          </div>

          <div className="stu-perf">
            <div className="sp-label">Enrollment status</div>
            <div className="sp-cols">
              <Donut a={ov?.active_enrolments ?? 0} b={ov?.inactive_enrolments ?? 0}
                labelA="Active" labelB="Inactive" />
              <div className="sp-stats">
                <StatRow label="Active enrolments" value={ov?.active_enrolments ?? 0} color="accent" />
                <StatRow label="Completions" value={ov?.completed_courses ?? 0} color="sage" />
                <StatRow label="Inactive" value={ov?.inactive_enrolments ?? 0} color="muted" />
                <StatRow label="Completion rate" value={`${completionRate}%`} color="sage" />
              </div>
            </div>
          </div>

          {/* Performance overview */}
          <div className="perf-overview">
            <div className="sp-label">Performance overview</div>
            <div className="perf-cells">
              <div className="perf-cell">
                <div className="pc-val accent">{ov?.avg_performance_pct != null ? `${ov.avg_performance_pct}%` : '—'}</div>
                <div className="pc-lab">Average grade</div>
              </div>
              <div className="perf-cell">
                <div className="pc-val sage">{ov?.pass_rate_pct != null ? `${ov.pass_rate_pct}%` : '—'}</div>
                <div className="pc-lab">Pass rate (≥50%)</div>
              </div>
              <div className="perf-cell">
                <div className="pc-val">{ov?.graded_learners ?? 0}</div>
                <div className="pc-lab">Graded learners</div>
              </div>
            </div>
            {ov?.avg_performance_pct == null && (
              <p className="perf-empty">No grades computed yet. Performance appears once learners are assessed.</p>
            )}
          </div>

          <div className="panel-actions">
            <a href="/admin/people">All students</a>
            <a href="/teach/enrolments">Enrolments</a>
            <a href="/reports">Student report</a>
          </div>
        </Card>

        {/* Teacher management summary */}
        <Card className="panel">
          <div className="panel-head">
            <h3><Users2 size={16} /> Teacher management</h3>
            <a href="/admin/people">Manage <ChevronRight size={13} /></a>
          </div>

          <div className="ustat-row">
            <div className="ustat"><div className="uv">{ov?.teachers ?? 0}</div><div className="ul">Teachers</div></div>
            <div className="ustat accent"><div className="uv">{teachers.filter(t => t.courses > 0).length}</div><div className="ul">Active</div></div>
            <div className="ustat"><div className="uv">{teachers.reduce((s, t) => s + t.courses, 0)}</div><div className="ul">Assignments</div></div>
          </div>

          <div className="tea-label">Teacher workload</div>
          <div className="teacher-search"><SearchInput value={teacherQ} onChange={setTeacherQ} placeholder="Search teachers…" /></div>

          {filteredTeachers.length === 0 ? (
            <div className="empty-mini"><Users2 size={24} /><p>{teacherQ ? 'No teachers match your search.' : 'No teachers assigned yet.'}</p></div>
          ) : (
            <ul className="tea-list">
              {filteredTeachers.slice(0, 5).map((t) => (
                <li key={t.id}>
                  <div className="tea-av">{t.email.charAt(0).toUpperCase()}</div>
                  <div className="tea-info">
                    <div className="tea-email">{t.email}</div>
                    <div className="tea-meta">{t.courses} course{t.courses !== 1 ? 's' : ''} · {t.students} students</div>
                  </div>
                  <div className={`wl-badge ${t.courses > 3 ? 'high' : t.courses > 1 ? 'mid' : 'low'}`}>
                    {t.courses > 3 ? 'Heavy' : t.courses > 1 ? 'Normal' : 'Light'}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="panel-actions">
            <a href="/admin/people">Add teacher</a>
            <a href="/teach/enrolments">Assign courses</a>
            <a href="/reports">Teacher report</a>
          </div>
        </Card>
      </div>

      {/* ── 4+5. COURSE ANALYTICS + ENROLLMENT DASHBOARD ── */}
      <div className="mgr-cols">

        {/* Course analytics */}
        <Card className="panel">
          <div className="panel-head">
            <h3><BookOpen size={16} /> Course analytics</h3>
            <a href="/courses">All courses <ChevronRight size={13} /></a>
          </div>

          <div className="course-status-row">
            <CourseStatPill label="Published" value={ov?.published_courses ?? 0} color="sage" />
            <CourseStatPill label="Draft" value={ov?.draft_courses ?? 0} color="gold" />
            <CourseStatPill label="Programs" value={ov?.total_programs ?? 0} color="accent" />
          </div>

          {(ov?.top_courses ?? []).length === 0 ? (
            <div className="empty-mini"><BookOpen size={24} /><p>No courses created yet.</p></div>
          ) : (
            <div className="top-courses">
              <div className="tc-head-row"><span>Course</span><span>Enrolled</span><span>Done</span></div>
              {ov!.top_courses.map((c) => {
                const pct = c.enrolments > 0 ? Math.round((c.completions / c.enrolments) * 100) : 0;
                return (
                  <div key={c.id} className="tc-row">
                    <div className="tc-name">{c.label.length > 22 ? c.label.slice(0, 22) + '…' : c.label}</div>
                    <div className="tc-count">{c.enrolments}</div>
                    <div className="tc-pct">
                      <div className="pct-bar"><div className="pct-fill" style={{ width: `${pct}%` }} /></div>
                      <span>{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="panel-actions">
            <a href="/teach/builder">Course builder</a>
            <a href="/courses">Manage courses</a>
          </div>
        </Card>

        {/* Enrollment dashboard */}
        <Card className="panel">
          <div className="panel-head">
            <h3><Activity size={16} /> Enrollment dashboard</h3>
            <a href="/teach/enrolments">Manage <ChevronRight size={13} /></a>
          </div>

          <div className="enrol-grid">
            <EnrolCell icon={<TrendingUp size={16} />} label="New (7d)" value={ov?.new_enrolments_7d ?? 0} color="accent" />
            <EnrolCell icon={<Activity size={16} />} label="Active" value={ov?.active_enrolments ?? 0} color="sage" />
            <EnrolCell icon={<CheckCircle2 size={16} />} label="Completed" value={ov?.completed_courses ?? 0} color="green" />
            <EnrolCell icon={<Clock size={16} />} label="Inactive" value={ov?.inactive_enrolments ?? 0} color="muted" />
          </div>

          <div className="enrol-chart-label">Enrollment trend (6 months)</div>
          {(trends?.enrolments ?? []).length === 0
            ? <div className="empty-chart"><BarChart3 size={20} /><p>No enrollment data yet</p></div>
            : <LineChart data={trends!.enrolments} height={130} />}

          <div className="panel-actions">
            <a href="/teach/enrolments">View all</a>
            <a href="/reports">Enrolment report</a>
          </div>
        </Card>
      </div>

      {/* ── 6. PAYMENT DASHBOARD ───────────────────── */}
      <section className="mgr-section">
        <h2><Wallet size={18} /> Payment dashboard</h2>
        <div className="mgr-cols">
          <Card className="panel">
            <div className="panel-head">
              <h3><CreditCard size={16} /> Financial overview</h3>
              <a href="/payments">All payments <ChevronRight size={13} /></a>
            </div>

            <div className="fin-hero">
              <div className="fin-total">{ov ? kes(ov.revenue_minor) : '—'}</div>
              <div className="fin-lab">Total organization revenue</div>
            </div>

            <div className="pay-grid">
              <PayCell icon={<CheckCircle2 size={15} />} label="Successful" value={ov?.paid_payments ?? 0} color="sage" />
              <PayCell icon={<Clock size={15} />} label="Pending" value={ov?.pending_payments ?? 0} color="gold" />
              <PayCell icon={<XCircle size={15} />} label="Failed" value={ov?.failed_payments ?? 0} color="rose" />
            </div>

            <div className="rev-chart-label">Revenue trend (6 months)</div>
            {(trends?.revenue ?? []).length === 0
              ? <div className="empty-chart"><BarChart3 size={20} /><p>No revenue data yet</p></div>
              : <BarChart data={trends!.revenue.map((r) => ({ label: r.label, value: Math.round(r.value / 100) }))}
                  format={(n) => `KES ${n.toLocaleString()}`} height={120} />}
          </Card>

          <Card className="panel">
            <div className="panel-head">
              <h3><FileText size={16} /> Recent transactions</h3>
              <a href="/payments">View all <ChevronRight size={13} /></a>
            </div>

            {orders.length === 0 ? (
              <div className="empty-mini"><CreditCard size={28} /><p>No payments yet. Set course prices to start accepting payments.</p></div>
            ) : (
              <ul className="tx-list">
                {orders.slice(0, 6).map((o) => (
                  <li key={o.id}>
                    <div className="tx-main">
                      <div className="tx-title">{o.item_title ?? 'Course purchase'}</div>
                      <div className="tx-buyer">{o.buyer_email} · {timeAgo(o.created_at)}</div>
                    </div>
                    <div className="tx-right">
                      <div className="tx-amt">{o.currency} {(o.amount_minor / 100).toLocaleString()}</div>
                      <div className={`tx-badge ${o.status}`}>{o.status}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>

      {/* ── 7. REPORTS + ACTIVITY ──────────────────── */}
      <div className="mgr-cols">
        <Card className="panel">
          <div className="panel-head"><h3><FileText size={16} /> Reports</h3><a href="/reports">All <ChevronRight size={13} /></a></div>
          <div className="report-grid">
            <a href="/reports" className="rlink"><GraduationCap size={15} /><div><strong>Student reports</strong><span>Progress, grades, activity</span></div></a>
            <a href="/reports" className="rlink"><Users2 size={15} /><div><strong>Teacher reports</strong><span>Workload, activity</span></div></a>
            <a href="/reports" className="rlink"><BookOpen size={15} /><div><strong>Course reports</strong><span>Completion, engagement</span></div></a>
            <a href="/payments" className="rlink"><CreditCard size={15} /><div><strong>Payment reports</strong><span>Revenue, transactions</span></div></a>
          </div>
        </Card>

        <Card className="panel">
          <div className="panel-head"><h3><Activity size={16} /> Recent activity</h3></div>
          {activity.length === 0 ? (
            <div className="empty-mini"><Activity size={28} /><p>No organization activity recorded yet.</p></div>
          ) : (
            <ul className="feed">
              {activity.slice(0, 8).map((e, i) => (
                <li key={i}>
                  <span className="feed-dot" />
                  <span className="feed-body">
                    <span className="feed-action">{labelAction(e.action)}</span>
                    <span className="feed-meta">{e.actor_email ?? 'system'} · {timeAgo(e.created_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <style jsx>{css}</style>
    </div>
  );
}

/* ── sub-components ────────────────────────────────── */

function Tile({ icon, value, label, sub, href, color = '' }: { icon: React.ReactNode; value: React.ReactNode; label: string; sub?: string; href: string; color?: string }) {
  return (
    <a href={href} className={`tile ${color}`}>
      <div className="tile-icon">{icon}</div>
      <div className="tile-val">{value}</div>
      <div className="tile-lab">{label}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </a>
  );
}
function StatRow({ label, value, color }: { label: string; value: React.ReactNode; color: string }) {
  return (
    <div className="sr"><span className="sr-lab">{label}</span>
      <span className={`sr-val ${color}`}>{value}</span></div>
  );
}
function CourseStatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className={`cs-pill ${color}`}><div className="cs-val">{value}</div><div className="cs-lab">{label}</div></div>;
}
function EnrolCell({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className={`ec ${color}`}>{icon}<div><div className="ec-val">{value}</div><div className="ec-lab">{label}</div></div></div>
  );
}
function PayCell({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className={`pc ${color}`}>{icon}<div><div className="pc-val">{value}</div><div className="pc-lab">{label}</div></div></div>
  );
}

/* ── styles ─────────────────────────────────────────── */
const css = `
  .mgr { display: flex; flex-direction: column; gap: 2rem; }

  /* header */
  .mgr-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .mh-left { display: flex; align-items: center; gap: 1rem; }
  .mh-logo { height: 3rem; max-width: 9rem; object-fit: contain; }
  .mh-mark { width: 3rem; height: 3rem; border-radius: 12px; background: var(--accent); color: #fff; display: grid; place-items: center; flex-shrink: 0; }
  .mgr-head h1 { margin-top: 0.2rem; }
  .ha-right { display: flex; align-items: center; gap: 0.75rem; }
  .refresh-btn { width: 2.4rem; height: 2.4rem; border: 1px solid var(--line); border-radius: 10px; display: grid; place-items: center; background: none; color: var(--ink-soft); cursor: pointer; }
  .refresh-btn:hover { border-color: var(--accent); color: var(--accent); }
  .qa-wrap { position: relative; }
  .qa-menu { position: absolute; right: 0; top: calc(100% + 0.4rem); background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow-lg); padding: 0.4rem; min-width: 14rem; z-index: 30; display: flex; flex-direction: column; }
  .qa-menu a { display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 0.75rem; border-radius: 8px; font-size: 0.88rem; font-weight: 500; color: var(--ink-soft); }
  .qa-menu a:hover { background: var(--surface-sunken); color: var(--ink); }
  .qa-menu a :global(svg) { color: var(--accent); }
  .err-banner { display: flex; align-items: center; gap: 0.5rem; padding: 0.9rem 1.2rem; color: var(--rose); background: rgba(220,38,38,0.06); border-color: rgba(220,38,38,0.2); }

  /* tiles */
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)); gap: 1rem; }
  .tile { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 1.25rem; box-shadow: var(--shadow-sm); display: block; transition: all 0.16s ease; }
  .tile:hover { box-shadow: var(--shadow); transform: translateY(-2px); border-color: var(--accent); }
  .tile-icon { width: 2.3rem; height: 2.3rem; border-radius: 10px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; margin-bottom: 0.75rem; }
  .tile.sage .tile-icon { background: rgba(5,150,105,0.1); color: var(--sage); }
  .tile-val { font-family: var(--serif); font-size: 1.6rem; font-weight: 600; color: var(--ink); line-height: 1; }
  .tile-lab { font-size: 0.8rem; color: var(--ink-faint); margin-top: 0.35rem; }
  .tile-sub { font-size: 0.72rem; color: var(--sage); margin-top: 0.2rem; font-weight: 600; }

  /* layout */
  .mgr-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
  .mgr-grid3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 1.25rem; }
  @media (max-width: 920px) { .mgr-cols, .mgr-grid3 { grid-template-columns: 1fr; } }

  /* panels */
  :global(.panel) { padding: 1.4rem; }
  .panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
  .panel-head h3 { display: flex; align-items: center; gap: 0.45rem; font-size: 1rem; color: var(--ink); }
  .panel-head a { display: flex; align-items: center; font-size: 0.82rem; color: var(--accent); font-weight: 600; }
  .panel-actions { display: flex; gap: 0.5rem; margin-top: 1.1rem; flex-wrap: wrap; }
  .panel-actions a { font-size: 0.8rem; font-weight: 600; color: var(--accent); padding: 0.4rem 0.85rem; border: 1px solid var(--line); border-radius: 999px; }
  .panel-actions a:hover { border-color: var(--accent); background: var(--accent-soft); }

  /* student analytics */
  .ustat-row { display: flex; gap: 1.5rem; margin-bottom: 1.1rem; }
  .uv { font-size: 1.5rem; font-weight: 700; color: var(--ink); font-family: var(--serif); }
  .ul { font-size: 0.76rem; color: var(--ink-faint); margin-top: 0.1rem; }
  .ustat.accent .uv { color: var(--accent); }
  .ustat.sage .uv { color: var(--sage); }
  .stu-perf { margin-top: 0.5rem; }
  .perf-overview { margin-top: 1.1rem; padding-top: 1rem; border-top: 1px solid var(--line); }
  .perf-cells { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
  .perf-cell { background: var(--surface-sunken); border-radius: 10px; padding: 0.7rem 0.85rem; }
  .pc-val { font-size: 1.3rem; font-weight: 700; font-family: var(--serif); color: var(--ink); line-height: 1; }
  .pc-val.accent { color: var(--accent); } .pc-val.sage { color: var(--sage); }
  .pc-lab { font-size: 0.72rem; color: var(--ink-faint); margin-top: 0.3rem; }
  .perf-empty { font-size: 0.78rem; color: var(--ink-faint); margin-top: 0.6rem; }
  .sp-label { font-size: 0.76rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-faint); margin-bottom: 0.6rem; }
  .sp-cols { display: flex; gap: 1rem; align-items: flex-start; }
  .sp-stats { flex: 1; display: flex; flex-direction: column; gap: 0.45rem; }
  .sr { display: flex; align-items: center; justify-content: space-between; font-size: 0.84rem; }
  .sr-lab { color: var(--ink-soft); }
  .sr-val { font-weight: 700; }
  .sr-val.accent { color: var(--accent); }
  .sr-val.sage { color: var(--sage); }
  .sr-val.muted { color: var(--ink-faint); }

  /* teacher */
  .tea-label { font-size: 0.76rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-faint); margin-bottom: 0.5rem; }
  .teacher-search { margin-bottom: 0.75rem; }
  .tea-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
  .tea-list li { display: flex; align-items: center; gap: 0.6rem; }
  .tea-av { width: 2rem; height: 2rem; border-radius: 8px; background: var(--accent); color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 0.85rem; flex-shrink: 0; }
  .tea-info { flex: 1; min-width: 0; }
  .tea-email { font-size: 0.88rem; font-weight: 500; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tea-meta { font-size: 0.74rem; color: var(--ink-faint); }
  .wl-badge { font-size: 0.72rem; font-weight: 600; padding: 0.15rem 0.55rem; border-radius: 999px; }
  .wl-badge.high { background: rgba(220,38,38,0.1); color: var(--rose); }
  .wl-badge.mid { background: rgba(217,119,6,0.1); color: var(--gold); }
  .wl-badge.low { background: rgba(5,150,105,0.1); color: var(--sage); }

  /* course analytics */
  .course-status-row { display: flex; gap: 0.75rem; margin-bottom: 1rem; }
  .cs-pill { flex: 1; padding: 0.6rem 0.75rem; border-radius: 10px; text-align: center; }
  .cs-pill.sage { background: rgba(5,150,105,0.08); } .cs-pill.gold { background: rgba(217,119,6,0.08); } .cs-pill.accent { background: var(--accent-soft); }
  .cs-val { font-size: 1.3rem; font-weight: 700; color: var(--ink); font-family: var(--serif); }
  .cs-lab { font-size: 0.72rem; color: var(--ink-faint); margin-top: 0.15rem; }
  .top-courses { display: flex; flex-direction: column; gap: 0.5rem; }
  .tc-head-row { display: grid; grid-template-columns: 1fr 3.5rem 5rem; gap: 0.5rem; font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-faint); padding: 0 0 0.35rem; border-bottom: 1px solid var(--line); }
  .tc-row { display: grid; grid-template-columns: 1fr 3.5rem 5rem; gap: 0.5rem; align-items: center; padding: 0.3rem 0; }
  .tc-name { font-size: 0.85rem; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tc-count { font-size: 0.85rem; font-weight: 600; color: var(--ink); text-align: center; }
  .tc-pct { display: flex; align-items: center; gap: 0.4rem; }
  .pct-bar { flex: 1; height: 5px; background: var(--surface-sunken); border-radius: 999px; overflow: hidden; }
  .pct-fill { height: 100%; background: var(--accent); border-radius: 999px; }
  .tc-pct span { font-size: 0.76rem; color: var(--ink-faint); white-space: nowrap; }

  /* enrollment */
  .enrol-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem; }
  .ec { display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 0.75rem; border-radius: 10px; }
  .ec.accent { background: var(--accent-soft); color: var(--accent); }
  .ec.sage { background: rgba(5,150,105,0.08); color: var(--sage); }
  .ec.green { background: rgba(5,150,105,0.08); color: var(--sage); }
  .ec.muted { background: var(--surface-sunken); color: var(--ink-faint); }
  .ec-val { font-size: 1.2rem; font-weight: 700; line-height: 1; }
  .ec-lab { font-size: 0.72rem; margin-top: 0.1rem; }
  .enrol-chart-label, .rev-chart-label { font-size: 0.76rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-faint); margin-bottom: 0.5rem; margin-top: 0.75rem; }

  /* sections */
  .mgr-section { display: flex; flex-direction: column; gap: 1rem; }
  .mgr-section h2 { display: flex; align-items: center; gap: 0.5rem; font-size: 1.2rem; }

  /* payment */
  .fin-hero { margin-bottom: 1rem; }
  .fin-total { font-size: 1.9rem; font-weight: 700; color: var(--ink); font-family: var(--serif); }
  .fin-lab { font-size: 0.78rem; color: var(--ink-faint); }
  .pay-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 0.6rem; margin-bottom: 0.5rem; }
  .pc { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.75rem; border-radius: 10px; }
  .pc.sage { background: rgba(5,150,105,0.08); color: var(--sage); }
  .pc.gold { background: rgba(217,119,6,0.08); color: var(--gold); }
  .pc.rose { background: rgba(220,38,38,0.07); color: var(--rose); }
  .pc-val { font-size: 1.2rem; font-weight: 700; line-height: 1; }
  .pc-lab { font-size: 0.72rem; margin-top: 0.1rem; }
  .tx-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
  .tx-list li { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--line); }
  .tx-list li:last-child { border-bottom: none; }
  .tx-title { font-size: 0.88rem; font-weight: 500; color: var(--ink); }
  .tx-buyer { font-size: 0.74rem; color: var(--ink-faint); }
  .tx-right { text-align: right; }
  .tx-amt { font-size: 0.88rem; font-weight: 600; color: var(--ink); }
  .tx-badge { font-size: 0.7rem; font-weight: 600; text-transform: capitalize; }
  .tx-badge.paid { color: var(--sage); } .tx-badge.pending { color: var(--gold); } .tx-badge.failed { color: var(--rose); }

  /* reports */
  .report-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
  .rlink { display: flex; align-items: center; gap: 0.6rem; padding: 0.8rem 0.9rem; border: 1px solid var(--line); border-radius: 10px; color: var(--ink-soft); }
  .rlink:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
  .rlink :global(svg) { color: var(--accent); flex-shrink: 0; }
  .rlink div { display: flex; flex-direction: column; }
  .rlink strong { font-size: 0.85rem; font-weight: 600; color: var(--ink); }
  .rlink span { font-size: 0.74rem; color: var(--ink-faint); margin-top: 0.1rem; }

  /* activity feed */
  .feed { list-style: none; display: flex; flex-direction: column; gap: 0.6rem; }
  .feed li { display: flex; gap: 0.7rem; align-items: flex-start; }
  .feed-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); margin-top: 0.4rem; flex-shrink: 0; }
  .feed-action { display: block; font-size: 0.86rem; color: var(--ink); font-weight: 500; }
  .feed-meta { display: block; font-size: 0.74rem; color: var(--ink-faint); }

  /* empty */
  .empty-mini { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1.5rem; text-align: center; color: var(--ink-faint); }
  .empty-mini :global(svg) { opacity: 0.35; }
  .empty-mini p { font-size: 0.84rem; max-width: 22rem; }
  .empty-chart { display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 1.25rem; color: var(--ink-faint); font-size: 0.83rem; }
  .empty-chart :global(svg) { opacity: 0.35; }
`;
