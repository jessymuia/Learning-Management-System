'use client';
import { useEffect, useState } from 'react';
import { Card, Badge, Skeleton } from '@/components/ui';
import {
  student as studentApi, api,
  type StudentCourse, type StudentOverview,
  type Credential,
} from '@/lib/api';
import {
  BookOpen, Award, Play, ArrowRight,
  CheckCircle2, CalendarClock, FileText,
  TrendingUp, ChevronRight, MessageSquare, Bell, AlertTriangle, Trophy,
  Lock, HelpCircle, Megaphone, Target, ClipboardCheck, CreditCard,
} from 'lucide-react';

type GradeRow = { course_id: string; course?: string; item: string; points: number; max: number };

const pctClass = (p: number) => (p >= 70 ? 'good' : p >= 50 ? 'ok' : 'low');
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null);
const relTime = (d?: string | null) => {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const day = 86400000;
  if (diff < 3600000) return 'just now';
  if (diff < day) return `${Math.round(diff / 3600000)}h ago`;
  if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
  return fmtDate(d) ?? '';
};
const notifLabel = (type: string) => {
  const map: Record<string, string> = {
    lesson_published: 'New lesson', assignment_due: 'Assignment due',
    assignment_graded: 'Assignment graded', new_message: 'New message',
    announcement: 'Announcement', forum_reply: 'Forum reply',
    enrolment: 'Enrolment', certificate_issued: 'Certificate earned',
  };
  return map[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

export function StudentDashboard({ firstName }: { firstName: string }) {
  const [courses, setCourses] = useState<StudentCourse[]>([]);
  const [ov, setOv] = useState<StudentOverview | null>(null);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [creds, setCreds] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [c, o, g, cr] = await Promise.all([
          studentApi.courses().catch(() => []),
          studentApi.overview().catch(() => null),
          api.get<GradeRow[]>('/grades/mine').catch(() => []),
          api.get<Credential[]>('/credentials/mine').catch(() => []),
        ]);
        setCourses(c); setOv(o); setGrades(g); setCreds(cr);
        if (!o) setError('Some of your learning data could not be loaded. Pull to refresh or try again shortly.');
      } catch { setError('We could not load your learning home. Try again shortly.'); }
      finally { setLoading(false); }
    })();
  }, []);

  const avg = grades.length
    ? Math.round(grades.reduce((s, g) => s + (g.max > 0 ? (g.points / g.max) * 100 : 0), 0) / grades.length)
    : null;

  // only unlocked, in-progress courses are "active learning"; locked ones are separated
  const unlocked = courses.filter((c) => !c.locked);
  const locked = courses.filter((c) => c.locked);
  const active = unlocked.filter((c) => c.completion_state !== 'complete');
  const done = unlocked.filter((c) => c.completion_state === 'complete');

  const cl = ov?.continue_learning;
  const prog = ov?.progress;
  const submitted = ov?.submitted ?? [];
  const quizzes = ov?.quizzes_available ?? [];
  const quizResults = ov?.quiz_results ?? [];
  const forums = ov?.forums ?? [];
  const announcements = ov?.announcements ?? [];
  const notifications = ov?.notifications ?? [];

  if (loading) {
    return (
      <div className="stu">
        <Skeleton height="6rem" />
        <Skeleton height="11rem" />
        <div className="tiles">{[...Array(4)].map((_, i) => <Skeleton key={i} height="6rem" />)}</div>
        <Skeleton height="14rem" />
      </div>
    );
  }

  return (
    <div className="stu">
      {/* ── HEADER ── */}
      <header className="stu-head">
        <div>
          <span className="eyebrow">Your learning home</span>
          <h1>Welcome back, {firstName}.</h1>
          <p className="muted">
            {ov?.enrolled_courses ?? 0} {(ov?.enrolled_courses ?? 0) === 1 ? 'course' : 'courses'}
            {' · '}{avg !== null ? `${avg}% average` : 'no grades yet'}
            {' · '}{ov?.certificates ?? 0} {(ov?.certificates ?? 0) === 1 ? 'certificate' : 'certificates'}
          </p>
        </div>
        <div className="head-icons">
          <a href="/notifications" title="Notifications" className="head-bell">
            <Bell size={18} />
            {!!ov?.unread_notifications && <span className="bell-dot">{ov.unread_notifications > 9 ? '9+' : ov.unread_notifications}</span>}
          </a>
          <a href="/messages" title="Messages"><MessageSquare size={18} /></a>
        </div>
      </header>

      {error && <Card className="stu-error"><AlertTriangle size={16} /> {error}</Card>}

      {/* ── 1. CONTINUE LEARNING (hero) ── */}
      {cl ? (
        <Card className="continue-card">
          <div className="cont-left">
            <span className="cont-eyebrow"><Play size={13} /> Continue learning</span>
            <h2>{cl.course}</h2>
            <div className="cont-meta">
              {cl.last_lesson && <span className="cont-bit">Last lesson: <strong>{cl.last_lesson}</strong></span>}
              {cl.next_activity
                ? <span className="cont-bit">Up next: <strong>{cl.next_activity}</strong>{cl.next_type && <span className="next-type">{cl.next_type}</span>}</span>
                : <span className="cont-bit muted">You're all caught up in this course.</span>}
            </div>
            <div className="cont-prog">
              <div className="cont-bar"><div className="cont-fill" style={{ width: `${cl.progress_pct}%` }} /></div>
              <span className="cont-pct">{cl.progress_pct}% complete</span>
            </div>
          </div>
          <a href={`/courses/${cl.course_id}`} className="cont-btn">Continue learning <ArrowRight size={16} /></a>
        </Card>
      ) : (
        <Card className="continue-card empty-hero">
          <div className="cont-left">
            <span className="cont-eyebrow"><Play size={13} /> Start learning</span>
            <h2>You haven't started a course yet</h2>
            <p className="cont-bit muted">Browse the catalog and enrol to begin your learning journey.</p>
          </div>
          <a href="/courses" className="cont-btn">Browse courses <ArrowRight size={16} /></a>
        </Card>
      )}

      {/* ── SUMMARY TILES ── */}
      <div className="tiles">
        <Tile icon={<BookOpen size={18} />} value={ov?.enrolled_courses ?? 0} label="Enrolled courses" href="/courses" />
        <Tile icon={<CheckCircle2 size={18} />} value={ov?.completed_courses ?? 0} label="Completed" href="/courses" />
        <Tile icon={<ClipboardCheck size={18} />} value={ov?.pending_assignments ?? 0} label="Pending assignments" sub={ov?.pending_assignments ? 'to submit' : 'all done'} href="#assignments" highlight={!!ov?.pending_assignments} />
        <Tile icon={<Award size={18} />} value={ov?.certificates ?? 0} label="Certificates" href="/credentials" />
      </div>

      {/* ── 3. LEARNING PROGRESS ── */}
      {prog && prog.total_activities > 0 && (
        <section className="stu-section">
          <div className="section-head-row"><h2><Target size={18} /> Learning progress</h2></div>
          <Card className="panel">
            <div className="prog-grid">
              <ProgStat value={`${prog.completed_lessons}/${prog.total_lessons}`} label="Lessons completed" />
              <ProgStat value={prog.remaining_activities} label="Activities remaining" />
              <ProgStat value={`${prog.completed_activities}/${prog.total_activities}`} label="Activities completed" />
              <ProgStat value={`${prog.course_completion_pct}%`} label="Overall completion" accent />
            </div>
            <div className="prog-bar-lg"><div className="prog-fill-lg" style={{ width: `${prog.course_completion_pct}%` }} /></div>
          </Card>
        </section>
      )}

      {/* ── 2. MY COURSES ── */}
      <section className="stu-section">
        <div className="section-head-row"><h2><BookOpen size={18} /> My courses</h2><a href="/courses" className="manage-link">Browse catalog <ChevronRight size={13} /></a></div>
        {active.length === 0 && locked.length === 0 ? (
          <Card><EmptyMini icon={<BookOpen size={28} />} text="You're not enrolled in any active courses yet. Browse the catalog to get started." /></Card>
        ) : (
          <div className="course-grid">
            {active.map((c) => {
              const pct = c.total_activities > 0 ? Math.round((c.completed_activities / c.total_activities) * 100) : 0;
              return (
                <Card key={c.id} className="course-card">
                  <div className="cc-head"><div className="cc-icon"><BookOpen size={18} /></div><Badge tone="success">active</Badge></div>
                  <h3>{c.fullname}</h3>
                  {c.instructor && <p className="cc-instructor">{c.instructor}</p>}
                  <div className="cc-progress"><span>{c.completed_activities}/{c.total_activities} activities</span><strong>{pct}%</strong></div>
                  <div className="cc-bar"><div className="cc-fill" style={{ width: `${pct}%` }} /></div>
                  <div className="cc-actions">
                    <a href={`/courses/${c.id}`} className="cc-primary">Continue learning</a>
                  </div>
                </Card>
              );
            })}
            {/* Locked / unpaid courses */}
            {locked.map((c) => (
              <Card key={c.id} className="course-card locked-card">
                <div className="cc-head"><div className="cc-icon locked"><Lock size={18} /></div><Badge tone="warning">locked</Badge></div>
                <h3>{c.fullname}</h3>
                {c.instructor && <p className="cc-instructor">{c.instructor}</p>}
                <p className="lock-note"><Lock size={13} /> Complete payment to unlock lessons, quizzes and assignments.</p>
                <div className="cc-actions">
                  <a href={`/checkout?type=course&id=${c.id}&title=${encodeURIComponent(c.fullname)}`} className="cc-primary pay"><CreditCard size={14} /> Unlock course</a>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="stu-cols">
        {/* ── 4. ASSIGNMENTS ── */}
        <Card className="panel" id="assignments">
          <div className="panel-head"><h3><FileText size={16} /> Assignments</h3></div>
          {(!ov || (ov.pending.length === 0 && submitted.length === 0)) ? (
            <EmptyMini icon={<CheckCircle2 size={28} />} text="Nothing due right now. Great work staying on top of things." />
          ) : (
            <>
              {ov.pending.length > 0 && (
                <>
                  <p className="sub-label">Pending</p>
                  <ul className="task-list">
                    {ov.pending.slice(0, 5).map((p) => {
                      const overdue = p.due_at && new Date(p.due_at) < new Date();
                      const isSubmitted = p.submission_state === 'submitted';
                      return (
                        <li key={p.id}><a href={`/courses/${p.course_id}/assignments/${p.id}`}>
                          <span className="task-icon"><FileText size={15} /></span>
                          <span className="task-main">
                            <span className="task-title">{p.title}</span>
                            <span className="task-meta">{p.course}{isSubmitted ? ' · submitted, awaiting grade' : ''}</span>
                          </span>
                          <span className={`task-due ${overdue && !isSubmitted ? 'overdue' : ''}`}>
                            {isSubmitted ? 'submitted' : p.due_at ? (overdue ? 'overdue' : `due ${fmtDate(p.due_at)}`) : 'no due date'}
                          </span>
                        </a></li>
                      );
                    })}
                  </ul>
                </>
              )}
              {submitted.filter((s) => s.workflow_state === 'released').length > 0 && (
                <>
                  <p className="sub-label">Graded &amp; feedback</p>
                  <ul className="task-list">
                    {submitted.filter((s) => s.workflow_state === 'released').slice(0, 4).map((s) => {
                      const pct = s.grade != null && s.grade_max ? Math.round((s.grade / s.grade_max) * 100) : null;
                      return (
                        <li key={s.id}><a href={`/courses/${s.course_id}/assignments/${s.id}`}>
                          <span className="task-icon done"><CheckCircle2 size={15} /></span>
                          <span className="task-main">
                            <span className="task-title">{s.title}</span>
                            <span className="task-meta">{s.course}{s.feedback ? ' · feedback ready' : ''}</span>
                          </span>
                          {pct != null && <span className={`grade-pct ${pctClass(pct)}`}>{pct}%</span>}
                        </a></li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          )}
        </Card>

        {/* ── 5. QUIZZES ── */}
        <Card className="panel">
          <div className="panel-head"><h3><HelpCircle size={16} /> Quizzes</h3></div>
          {(quizzes.length === 0 && quizResults.length === 0) ? (
            <EmptyMini icon={<HelpCircle size={28} />} text="No quizzes available right now." />
          ) : (
            <>
              {quizzes.length > 0 && (
                <>
                  <p className="sub-label">Available</p>
                  <ul className="task-list">
                    {quizzes.slice(0, 4).map((q) => {
                      const noAttemptsLeft = q.attempts_allowed > 0 && q.attempts_taken >= q.attempts_allowed;
                      return (
                        <li key={q.id}><a href={`/quizzes/${q.id}`}>
                          <span className="task-icon"><HelpCircle size={15} /></span>
                          <span className="task-main">
                            <span className="task-title">{q.name}</span>
                            <span className="task-meta">
                              {q.course} · {q.attempts_allowed === 0 ? 'unlimited attempts' : `attempt ${Math.min(q.attempts_taken + 1, q.attempts_allowed)} of ${q.attempts_allowed}`}
                            </span>
                          </span>
                          <span className={`task-due ${noAttemptsLeft ? 'overdue' : ''}`}>
                            {noAttemptsLeft ? 'no attempts left' : q.close_at ? `closes ${fmtDate(q.close_at)}` : 'open'}
                          </span>
                        </a></li>
                      );
                    })}
                  </ul>
                </>
              )}
              {quizResults.length > 0 && (
                <>
                  <p className="sub-label">Results</p>
                  <ul className="task-list">
                    {quizResults.slice(0, 4).map((r) => {
                      const pct = r.sumgrade != null && r.max_mark > 0 ? Math.round((Number(r.sumgrade) / r.max_mark) * 100) : null;
                      return (
                        <li key={r.attempt_id}><a href={`/quizzes/${r.quiz_id}`}>
                          <span className="task-icon done"><ClipboardCheck size={15} /></span>
                          <span className="task-main">
                            <span className="task-title">{r.quiz}</span>
                            <span className="task-meta">{r.course} · attempt {r.attempt_no}</span>
                          </span>
                          {pct != null
                            ? <span className={`grade-pct ${pctClass(pct)}`}>{pct}%</span>
                            : <span className="task-due">graded soon</span>}
                        </a></li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          )}
        </Card>
      </div>

      <div className="stu-cols">
        {/* ── 6. GRADES & PERFORMANCE ── */}
        <Card className="panel">
          <div className="panel-head"><h3><TrendingUp size={16} /> Grades &amp; performance</h3><a href="/grades">All grades <ChevronRight size={13} /></a></div>
          <div className="perf-row">
            <div className="perf-score">
              <div className="perf-big">{avg !== null ? `${avg}%` : '—'}</div>
              <div className="perf-lab">Average grade</div>
            </div>
            <div className="perf-summary">
              <div className="perf-line"><span>{done.length}</span> completed</div>
              <div className="perf-line"><span>{active.length}</span> in progress</div>
              <div className="perf-line"><span>{grades.length}</span> graded items</div>
            </div>
          </div>
          {grades.length > 0 ? (
            <ul className="grade-list">
              {grades.slice(0, 5).map((g, i) => {
                const pct = g.max > 0 ? Math.round((g.points / g.max) * 100) : 0;
                return (
                  <li key={i}>
                    <span className="grade-item">{g.item}{g.course ? <span className="grade-course"> · {g.course}</span> : null}</span>
                    <span className={`grade-pct ${pctClass(pct)}`}>{pct}%</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="panel-empty">No graded work yet. Your scores will appear here as teachers release them.</p>
          )}
        </Card>

        {/* ── 7. FORUMS & ANNOUNCEMENTS ── */}
        <Card className="panel">
          <div className="panel-head"><h3><MessageSquare size={16} /> Forums &amp; announcements</h3><a href="/forums">All <ChevronRight size={13} /></a></div>
          {announcements.length > 0 && (
            <>
              <p className="sub-label">Teacher announcements</p>
              <ul className="task-list">
                {announcements.slice(0, 3).map((a) => (
                  <li key={a.id}><a href={`/courses/${a.course_id}`}>
                    <span className="task-icon ann"><Megaphone size={15} /></span>
                    <span className="task-main">
                      <span className="task-title">{a.subject}</span>
                      <span className="task-meta">{a.course}</span>
                    </span>
                    <span className="task-due">{relTime(a.published_at)}</span>
                  </a></li>
                ))}
              </ul>
            </>
          )}
          {forums.length > 0 ? (
            <>
              <p className="sub-label">Course discussions</p>
              <ul className="task-list">
                {forums.slice(0, 3).map((f) => (
                  <li key={f.discussion_id}><a href={`/forums/${f.forum_id}`}>
                    <span className="task-icon"><MessageSquare size={15} /></span>
                    <span className="task-main">
                      <span className="task-title">{f.pinned ? '📌 ' : ''}{f.subject}</span>
                      <span className="task-meta">{f.course} · {f.post_count} {f.post_count === 1 ? 'post' : 'posts'}</span>
                    </span>
                    <span className="task-due">{f.last_post_at ? relTime(f.last_post_at) : 'new'}</span>
                  </a></li>
                ))}
              </ul>
            </>
          ) : announcements.length === 0 && (
            <EmptyMini icon={<MessageSquare size={28} />} text="No discussions or announcements yet." />
          )}
        </Card>
      </div>

      <div className="stu-cols">
        {/* ── 8. CERTIFICATES ── */}
        <Card className="panel">
          <div className="panel-head"><h3><Trophy size={16} /> Certificates</h3><a href="/credentials">All <ChevronRight size={13} /></a></div>
          {creds.length === 0 ? (
            <EmptyMini icon={<Award size={28} />} text="Complete a course to earn your first certificate." />
          ) : (
            <ul className="cert-list">
              {creds.slice(0, 4).map((c) => (
                <li key={c.id}>
                  <span className="cert-icon"><Award size={16} /></span>
                  <span className="cert-main"><span className="cert-name">{c.name}</span><span className="cert-code">{c.verification_code}</span></span>
                  <span className="cert-actions">
                    <a href={`/certificate/${c.verification_code}`} target="_blank" rel="noopener noreferrer" title="View / download">View</a>
                    <a href={`/verify/${c.verification_code}`} target="_blank" rel="noopener noreferrer" title="Verify">Verify</a>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── 9. NOTIFICATIONS ── */}
        <Card className="panel">
          <div className="panel-head"><h3><Bell size={16} /> Notifications</h3><a href="/notifications">All <ChevronRight size={13} /></a></div>
          {notifications.length === 0 ? (
            <EmptyMini icon={<Bell size={28} />} text="You're all caught up. New lessons, assignments and messages will show here." />
          ) : (
            <ul className="task-list">
              {notifications.slice(0, 5).map((n) => {
                const title = (n.payload?.title as string) || (n.payload?.subject as string) || notifLabel(n.type);
                const unread = !n.read_at;
                return (
                  <li key={n.id}><a href="/notifications" className={unread ? 'notif-unread' : ''}>
                    <span className="task-icon"><Bell size={15} /></span>
                    <span className="task-main">
                      <span className="task-title">{title}</span>
                      <span className="task-meta">{notifLabel(n.type)}</span>
                    </span>
                    <span className="task-due">{relTime(n.created_at)}{unread && <span className="unread-dot" />}</span>
                  </a></li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* ── COMPLETED COURSES ── */}
      {done.length > 0 && (
        <section className="stu-section">
          <h2><CheckCircle2 size={18} /> Completed courses</h2>
          <div className="done-grid">
            {done.map((c) => (
              <a key={c.id} href={`/courses/${c.id}`} className="done-card">
                <CheckCircle2 size={16} /><span>{c.fullname}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <style jsx>{styles}</style>
    </div>
  );
}

function Tile({ icon, value, label, sub, href, highlight }: { icon: React.ReactNode; value: React.ReactNode; label: string; sub?: string; href: string; highlight?: boolean }) {
  return (
    <a href={href} className={highlight ? 'tile highlight' : 'tile'}>
      <div className="tile-icon">{icon}</div>
      <div className="tile-val">{value}</div>
      <div className="tile-lab">{label}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </a>
  );
}
function ProgStat({ value, label, accent }: { value: React.ReactNode; label: string; accent?: boolean }) {
  return (
    <div className={accent ? 'prog-stat accent' : 'prog-stat'}>
      <div className="prog-val">{value}</div>
      <div className="prog-lab">{label}</div>
    </div>
  );
}
function EmptyMini({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="empty-mini">{icon}<p>{text}</p></div>;
}

// Exported for backward-compat with any imports of the old DashStyles component.
export function DashStyles() { return <style jsx>{styles}</style>; }

const styles = `
  .stu { display: flex; flex-direction: column; gap: 1.75rem; }
  .stu-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .stu-head h1 { margin-top: 0.3rem; }
  .head-icons { display: flex; gap: 0.5rem; }
  .head-icons a { position: relative; width: 2.4rem; height: 2.4rem; border-radius: 10px; border: 1px solid var(--line); display: grid; place-items: center; color: var(--ink-soft); }
  .head-icons a:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
  .bell-dot { position: absolute; top: -6px; right: -6px; min-width: 1.1rem; height: 1.1rem; padding: 0 0.3rem; border-radius: 999px; background: var(--rose); color: #fff; font-size: 0.62rem; font-weight: 700; display: grid; place-items: center; }
  .stu-error { display: flex; align-items: center; gap: 0.5rem; padding: 0.9rem 1.1rem; color: var(--rose); background: rgba(220,38,38,0.06); border-color: rgba(220,38,38,0.2); }

  :global(.continue-card) { display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; padding: 1.75rem;
    background: linear-gradient(120deg, var(--accent-soft), transparent 70%), var(--surface); flex-wrap: wrap; }
  :global(.continue-card.empty-hero) { background: var(--surface); }
  .cont-left { flex: 1; min-width: 16rem; }
  .cont-eyebrow { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent); }
  .cont-left h2 { font-size: 1.5rem; margin: 0.4rem 0; color: var(--ink); }
  .cont-meta { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.9rem; }
  .cont-bit { font-size: 0.9rem; color: var(--ink-soft); }
  .cont-bit strong { color: var(--ink); }
  .next-type { font-size: 0.68rem; font-weight: 600; text-transform: uppercase; color: var(--accent); background: var(--accent-soft); padding: 0.1rem 0.5rem; border-radius: 5px; margin-left: 0.5rem; }
  .cont-prog { display: flex; align-items: center; gap: 0.8rem; max-width: 28rem; }
  .cont-bar { flex: 1; height: 8px; background: var(--surface-sunken); border-radius: 999px; overflow: hidden; }
  .cont-fill { height: 100%; background: var(--accent); border-radius: 999px; transition: width 0.5s ease; }
  .cont-pct { font-size: 0.8rem; font-weight: 600; color: var(--accent); white-space: nowrap; }
  .cont-btn { display: inline-flex; align-items: center; gap: 0.5rem; background: var(--accent); color: #fff; padding: 0.8rem 1.5rem; border-radius: 12px; font-weight: 600; font-size: 0.95rem; white-space: nowrap; }
  .cont-btn:hover { background: var(--accent-deep); }

  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; }
  .tile { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 1.2rem; box-shadow: var(--shadow-sm); transition: all 0.16s ease; display: block; }
  .tile:hover { box-shadow: var(--shadow); transform: translateY(-2px); border-color: var(--accent); }
  .tile.highlight { border-color: var(--gold); background: rgba(217,119,6,0.04); }
  .tile-icon { width: 2.2rem; height: 2.2rem; border-radius: 9px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; margin-bottom: 0.7rem; }
  .tile.highlight .tile-icon { background: rgba(217,119,6,0.12); color: var(--gold); }
  .tile-val { font-family: var(--serif); font-size: 1.5rem; font-weight: 600; color: var(--ink); line-height: 1; }
  .tile-lab { font-size: 0.8rem; color: var(--ink-faint); margin-top: 0.3rem; }
  .tile-sub { font-size: 0.72rem; color: var(--ink-faint); margin-top: 0.2rem; font-weight: 600; }
  .tile.highlight .tile-sub { color: var(--gold); }

  .stu-section { display: flex; flex-direction: column; gap: 1rem; }
  .stu-section h2 { display: flex; align-items: center; gap: 0.5rem; font-size: 1.2rem; }
  .section-head-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .manage-link { display: flex; align-items: center; font-size: 0.82rem; color: var(--accent); font-weight: 600; white-space: nowrap; }

  .prog-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 1rem; margin-bottom: 1.1rem; }
  .prog-stat { text-align: left; }
  .prog-val { font-family: var(--serif); font-size: 1.6rem; font-weight: 600; color: var(--ink); line-height: 1; }
  .prog-stat.accent .prog-val { color: var(--accent); }
  .prog-lab { font-size: 0.78rem; color: var(--ink-faint); margin-top: 0.35rem; }
  .prog-bar-lg { height: 10px; background: var(--surface-sunken); border-radius: 999px; overflow: hidden; }
  .prog-fill-lg { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-deep)); border-radius: 999px; transition: width 0.5s ease; }

  .course-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem; }
  :global(.course-card) { padding: 1.3rem; display: flex; flex-direction: column; gap: 0.55rem; }
  :global(.course-card.locked-card) { background: var(--surface-sunken); opacity: 0.96; }
  .cc-head { display: flex; align-items: center; justify-content: space-between; }
  .cc-icon { width: 2.2rem; height: 2.2rem; border-radius: 9px; background: var(--accent); color: #fff; display: grid; place-items: center; }
  .cc-icon.locked { background: var(--gold); }
  :global(.course-card) h3 { font-size: 1.02rem; color: var(--ink); line-height: 1.3; }
  .cc-instructor { font-size: 0.8rem; color: var(--ink-faint); }
  .cc-progress { display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; color: var(--ink-faint); }
  .cc-progress strong { color: var(--accent); font-size: 1rem; }
  .cc-bar { height: 6px; background: var(--surface-sunken); border-radius: 999px; overflow: hidden; }
  .cc-fill { height: 100%; background: var(--accent); border-radius: 999px; transition: width 0.4s ease; }
  .lock-note { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--ink-soft); margin: 0.2rem 0; }
  .lock-note :global(svg) { color: var(--gold); flex-shrink: 0; }
  .cc-actions { display: flex; gap: 0.5rem; margin-top: 0.4rem; }
  .cc-actions a { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; font-weight: 600; color: var(--accent); padding: 0.45rem 0.9rem; border: 1px solid var(--line); border-radius: 999px; }
  .cc-actions a.cc-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  .cc-actions a.cc-primary.pay { background: var(--gold); border-color: var(--gold); }
  .cc-actions a:hover { border-color: var(--accent); }

  .stu-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start; }
  @media (max-width: 900px) { .stu-cols { grid-template-columns: 1fr; } }
  :global(.panel) { padding: 1.4rem; }
  .panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.9rem; }
  .panel-head h3 { display: flex; align-items: center; gap: 0.45rem; font-size: 1rem; color: var(--ink); }
  .panel-head a { display: flex; align-items: center; font-size: 0.82rem; color: var(--accent); font-weight: 600; }
  .panel-empty { font-size: 0.85rem; color: var(--ink-faint); padding: 0.5rem 0.2rem; }
  .sub-label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-faint); margin: 0.7rem 0 0.3rem; }
  .sub-label:first-child { margin-top: 0; }

  .task-list { list-style: none; display: flex; flex-direction: column; gap: 0.2rem; }
  .task-list li a { display: flex; align-items: center; gap: 0.7rem; padding: 0.6rem 0.7rem; border-radius: 8px; }
  .task-list li a:hover { background: var(--surface-sunken); }
  .task-list li a.notif-unread { background: var(--accent-soft); }
  .task-icon { width: 1.9rem; height: 1.9rem; border-radius: 7px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; flex-shrink: 0; }
  .task-icon.done { background: rgba(22,163,74,0.12); color: var(--sage); }
  .task-icon.ann { background: rgba(217,119,6,0.12); color: var(--gold); }
  .task-main { flex: 1; min-width: 0; }
  .task-title { display: block; font-size: 0.88rem; font-weight: 500; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .task-meta { display: block; font-size: 0.74rem; color: var(--ink-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .task-due { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.76rem; color: var(--ink-faint); white-space: nowrap; }
  .task-due.overdue { color: var(--rose); font-weight: 600; }
  .unread-dot { width: 0.5rem; height: 0.5rem; border-radius: 999px; background: var(--accent); }

  .perf-row { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 1rem; }
  .perf-big { font-size: 2.2rem; font-weight: 700; color: var(--accent); font-family: var(--serif); line-height: 1; }
  .perf-lab { font-size: 0.78rem; color: var(--ink-faint); margin-top: 0.3rem; }
  .perf-summary { display: flex; flex-direction: column; gap: 0.3rem; padding-left: 1.5rem; border-left: 1px solid var(--line); }
  .perf-line { font-size: 0.84rem; color: var(--ink-soft); }
  .perf-line span { font-weight: 700; color: var(--ink); }
  .grade-list { list-style: none; display: flex; flex-direction: column; gap: 0.4rem; }
  .grade-list li { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; padding: 0.3rem 0; }
  .grade-item { font-size: 0.84rem; color: var(--ink); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .grade-course { color: var(--ink-faint); font-size: 0.78rem; }
  .grade-pct { font-size: 0.8rem; font-weight: 700; white-space: nowrap; }
  .grade-pct.good { color: var(--sage); } .grade-pct.ok { color: var(--gold); } .grade-pct.low { color: var(--rose); }

  .cert-list { list-style: none; display: flex; flex-direction: column; gap: 0.6rem; }
  .cert-list li { display: flex; align-items: center; gap: 0.7rem; }
  .cert-icon { width: 2rem; height: 2rem; border-radius: 8px; background: rgba(217,119,6,0.12); color: var(--gold); display: grid; place-items: center; flex-shrink: 0; }
  .cert-main { flex: 1; min-width: 0; }
  .cert-name { display: block; font-size: 0.88rem; font-weight: 500; color: var(--ink); }
  .cert-code { display: block; font-size: 0.72rem; color: var(--ink-faint); font-family: var(--mono); }
  .cert-actions { display: flex; gap: 0.6rem; }
  .cert-actions a { font-size: 0.8rem; font-weight: 600; color: var(--accent); }

  .done-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; }
  .done-card { display: flex; align-items: center; gap: 0.6rem; padding: 0.85rem 1rem; border: 1px solid var(--line); border-radius: 10px; font-size: 0.88rem; font-weight: 500; color: var(--ink); }
  .done-card:hover { border-color: var(--sage); }
  .done-card :global(svg) { color: var(--sage); flex-shrink: 0; }

  .empty-mini { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1.5rem; text-align: center; color: var(--ink-faint); }
  .empty-mini :global(svg) { opacity: 0.4; }
  .empty-mini p { font-size: 0.86rem; max-width: 22rem; }

  @media (max-width: 640px) {
    .continue-card { padding: 1.3rem; }
    .cont-btn { width: 100%; justify-content: center; }
    .perf-summary { padding-left: 1rem; }
  }
`;
