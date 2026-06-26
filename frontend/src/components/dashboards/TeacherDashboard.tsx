'use client';
import { useEffect, useState } from 'react';
import { Card, Badge, Skeleton, Button, SearchInput } from '@/components/ui';
import {
  teacher as teacherApi,
  type TeacherCourse, type TeacherOverview, type TeacherStudent,
} from '@/lib/api';
import {
  BookOpen, Users2, ClipboardCheck, MessagesSquare, PenSquare, GraduationCap,
  Plus, Upload, FileText, Megaphone, ChevronRight, Clock, AlertTriangle,
  CheckCircle2, ArrowRight, Layers, Activity, RefreshCw, Bell,
} from 'lucide-react';

function timeAgo(iso: string | null): string {
  if (!iso) return 'no activity';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function TeacherDashboard({ firstName }: { firstName: string }) {
  const [courses, setCourses] = useState<TeacherCourse[]>([]);
  const [ov, setOv] = useState<TeacherOverview | null>(null);
  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studentQ, setStudentQ] = useState('');
  const [activeTab, setActiveTab] = useState<'assignments' | 'quizzes' | 'questions' | 'forums'>('assignments');
  const [showQA, setShowQA] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const firstCourse = courses[0]?.id;
  const builderHref = firstCourse ? `/teach/builder?course=${firstCourse}` : '/teach/builder';

  async function load() {
    try {
      const [c, o, s] = await Promise.all([
        teacherApi.courses().catch(() => []),
        teacherApi.overview().catch(() => null),
        teacherApi.students().catch(() => []),
      ]);
      setCourses(c); setOv(o); setStudents(s);
      setLastRefresh(new Date());
      if (!o) setError('Some teaching data could not be loaded.');
      else setError(null);
    } catch { setError('Failed to load the teaching workspace.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const totalPending = (ov?.pending?.length ?? 0) + (ov?.pending_quiz_reviews?.length ?? 0) + (ov?.student_questions?.length ?? 0);
  const filteredStudents = students.filter((s) =>
    !studentQ || s.email.toLowerCase().includes(studentQ.toLowerCase()) || s.course.toLowerCase().includes(studentQ.toLowerCase()));
  const atRisk = students.filter((s) => !s.completed && s.grade_pct < 50);
  const avgProgress = students.length > 0
    ? Math.round(students.reduce((acc, s) => acc + s.grade_pct, 0) / students.length) : 0;

  if (loading) return (
    <div className="tea">
      <Skeleton height="7rem" />
      <div className="tiles">{[...Array(5)].map((_, i) => <Skeleton key={i} height="6rem" />)}</div>
      <Skeleton height="20rem" />
    </div>
  );

  return (
    <div className="tea">

      {/* ── HEADER ──────────────────────────────────── */}
      <header className="tea-head">
        <div>
          <span className="eyebrow">Teaching workspace</span>
          <h1>Welcome back, {firstName}.</h1>
          <p className="muted">
            {ov?.assigned_courses ?? 0} assigned courses · {ov?.total_students ?? 0} students
            {totalPending > 0 ? ` · ${totalPending} items need attention` : ''}&nbsp;· {timeAgo(lastRefresh.toISOString())}
          </p>
        </div>
        <div className="ha-right">
          <a href="/notifications" className="icon-btn" title="Notifications"><Bell size={16} /></a>
          <button className="icon-btn" onClick={() => { setLoading(true); load(); }} title="Refresh"><RefreshCw size={16} /></button>
          <div className="qa-wrap">
            <Button onClick={() => setShowQA(!showQA)}><Plus size={15} /> Quick actions</Button>
            {showQA && (
              <div className="qa-menu" onMouseLeave={() => setShowQA(false)}>
                <a href={builderHref}><Layers size={14} /> Add lesson</a>
                <a href={builderHref}><Upload size={14} /> Upload material</a>
                <a href="/teach/quiz"><PenSquare size={14} /> Create quiz</a>
                <a href={builderHref}><FileText size={14} /> Create assignment</a>
                <a href="/forums"><MessagesSquare size={14} /> Create forum</a>
                <a href="/teach/grading"><ClipboardCheck size={14} /> Grade submissions</a>
                <a href="/messages"><Megaphone size={14} /> Send announcement</a>
              </div>
            )}
          </div>
        </div>
      </header>

      {error && <Card className="err-banner"><AlertTriangle size={15} />{error}</Card>}

      {/* ── OVERVIEW TILES ──────────────────────────── */}
      <div className="tiles">
        <Tile icon={<BookOpen />} value={ov?.assigned_courses ?? 0} label="Assigned courses" href="/teach" />
        <Tile icon={<Users2 />} value={ov?.total_students ?? 0} label="Students" href="/teach/enrolments" />
        <Tile icon={<ClipboardCheck />} value={ov?.pending_grading ?? 0} label="To grade"
          sub={ov?.pending_grading ? 'needs attention' : 'all done'} href="/teach/grading"
          highlight={!!ov?.pending_grading} />
        <Tile icon={<PenSquare />} value={(ov?.pending_quiz_reviews ?? []).length} label="Quiz reviews"
          href="/teach/quiz" highlight={(ov?.pending_quiz_reviews ?? []).length > 0} />
        <Tile icon={<CheckCircle2 />} value={ov?.completed_grading ?? 0} label="Graded" href="/teach/grading" />
      </div>

      {/* ── 1. ASSIGNED COURSES ─────────────────────── */}
      <section className="tea-section">
        <div className="section-hr">
          <h2><BookOpen size={18} /> Assigned courses</h2>
          <a href="/teach" className="view-all">View all <ChevronRight size={13} /></a>
        </div>
        {courses.length === 0 ? (
          <Card><EmptyMini icon={<BookOpen size={28} />}
            text="No courses assigned to you yet. Your organization administrator will assign courses for you to teach." /></Card>
        ) : (
          <div className="course-grid">
            {courses.map((c) => {
              const pct = c.students > 0 ? Math.round((c.completed / c.students) * 100) : 0;
              return (
                <Card key={c.id} className="course-card">
                  <div className="cc-top">
                    <div className="cc-icon"><BookOpen size={17} /></div>
                    <div className="cc-badges">
                      <Badge tone={c.status === 'active' ? 'success' : 'neutral'}>{c.status}</Badge>
                      {c.pending_grading > 0 && <Badge tone="warning">{c.pending_grading} to grade</Badge>}
                    </div>
                  </div>
                  <h3 className="cc-title">{c.fullname}</h3>
                  <div className="cc-meta-row">
                    <span><Users2 size={12} /> {c.students}</span>
                    <span><Activity size={12} /> {c.total_activities} activities</span>
                    {c.avg_grade_pct !== null && <span><GraduationCap size={12} /> {c.avg_grade_pct}% avg</span>}
                  </div>
                  <div className="cc-progress-row"><span>Completions</span><strong>{pct}%</strong></div>
                  <div className="cc-bar"><div className="cc-fill" style={{ width: `${pct}%` }} /></div>
                  <div className="cc-last">Last activity {timeAgo(c.last_activity)}</div>
                  <div className="cc-actions">
                    <a href={`/teach/builder?course=${c.id}`} className="cc-btn-primary">Manage content</a>
                    <a href={`/courses/${c.id}`}>Student view</a>
                    <a href="/teach/grading">Grade</a>
                    <a href="/forums">{c.forum_count > 0 ? `Forums (${c.forum_count})` : 'Create forum'}</a>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 2+4. TEACHING TASKS (tabbed grading queue) ── */}
      <section className="tea-section">
        <h2><ClipboardCheck size={18} /> Teaching tasks</h2>
        <Card className="panel">
          <div className="tab-bar">
            <button className={activeTab === 'assignments' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('assignments')}>
              Assignments {(ov?.pending?.length ?? 0) > 0 && <span className="tbadge">{ov!.pending.length}</span>}
            </button>
            <button className={activeTab === 'quizzes' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('quizzes')}>
              Quiz reviews {(ov?.pending_quiz_reviews ?? []).length > 0 && <span className="tbadge">{ov!.pending_quiz_reviews.length}</span>}
            </button>
            <button className={activeTab === 'questions' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('questions')}>
              Student questions {(ov?.student_questions ?? []).length > 0 && <span className="tbadge">{ov!.student_questions.length}</span>}
            </button>
            <button className={activeTab === 'forums' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('forums')}>
              Forums {(ov?.active_forums ?? 0) > 0 && <span className="tbadge">{ov!.active_forums}</span>}
            </button>
          </div>

          {activeTab === 'assignments' && (
            (ov?.pending ?? []).length === 0 ? (
              <EmptyMini icon={<CheckCircle2 size={28} />}
                text="No pending submissions. All assignments have been graded." />
            ) : (
              <ul className="task-list">
                {ov!.pending.map((p) => (
                  <li key={p.submission_id}>
                    <a href="/teach/grading">
                      <span className={`task-ic ${p.is_late ? 'warn' : 'neutral'}`}><FileText size={14} /></span>
                      <span className="task-body">
                        <span className="task-title">{p.title}
                          {p.is_late && <span className="late-tag">LATE</span>}
                        </span>
                        <span className="task-meta">{p.student} · {p.course} · {timeAgo(p.submitted_at)}</span>
                      </span>
                      <span className="task-arrow"><ArrowRight size={14} /></span>
                    </a>
                  </li>
                ))}
              </ul>
            )
          )}

          {activeTab === 'quizzes' && (
            (ov?.pending_quiz_reviews ?? []).length === 0 ? (
              <EmptyMini icon={<PenSquare size={28} />} text="No quiz attempts to review." />
            ) : (
              <ul className="task-list">
                {ov!.pending_quiz_reviews.map((q) => (
                  <li key={q.attempt_id}>
                    <a href="/teach/quiz">
                      <span className="task-ic neutral"><PenSquare size={14} /></span>
                      <span className="task-body">
                        <span className="task-title">{q.quiz_title}</span>
                        <span className="task-meta">{q.student} · {q.course}
                          {q.sumgrade !== null ? ` · ${q.sumgrade} pts` : ''} · {timeAgo(q.finished_at)}</span>
                      </span>
                      <span className="task-arrow"><ArrowRight size={14} /></span>
                    </a>
                  </li>
                ))}
              </ul>
            )
          )}

          {activeTab === 'questions' && (
            (ov?.student_questions ?? []).length === 0 ? (
              <EmptyMini icon={<MessagesSquare size={28} />}
                text="No open student questions. Questions from Q&amp;A forums in your courses appear here until you post an answer." />
            ) : (
              <ul className="task-list">
                {ov!.student_questions.map((q) => (
                  <li key={q.discussion_id}>
                    <a href={`/forums/${q.forum_id}`}>
                      <span className="task-ic warn"><MessagesSquare size={14} /></span>
                      <span className="task-body">
                        <span className="task-title">{q.subject}
                          <span className="late-tag" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>UNANSWERED</span>
                        </span>
                        <span className="task-meta">{q.student ?? 'student'} · {q.course} · {q.post_count} repl{q.post_count === 1 ? 'y' : 'ies'} · {timeAgo(q.created_at)}</span>
                      </span>
                      <span className="task-arrow"><ArrowRight size={14} /></span>
                    </a>
                  </li>
                ))}
              </ul>
            )
          )}

          {activeTab === 'forums' && (
            (ov?.course_forums ?? []).length === 0 ? (
              <EmptyMini icon={<MessagesSquare size={28} />}
                text="No forums yet. Create a forum inside an assigned course." />
            ) : (
              <ul className="task-list">
                {ov!.course_forums.map((f) => (
                  <li key={f.id}>
                    <a href={`/forums`}>
                      <span className="task-ic neutral"><MessagesSquare size={14} /></span>
                      <span className="task-body">
                        <span className="task-title">{f.name}
                          <span className="forum-type">{f.type}</span>
                        </span>
                        <span className="task-meta">{f.course} · {f.discussion_count} discussion{f.discussion_count !== 1 ? 's' : ''}</span>
                      </span>
                      <span className="task-arrow"><ArrowRight size={14} /></span>
                    </a>
                  </li>
                ))}
              </ul>
            )
          )}

          <div className="task-footer">
            <a href="/teach/grading"><ClipboardCheck size={14} /> Grade all submissions</a>
            <a href="/teach/quiz"><PenSquare size={14} /> Quiz management</a>
            <a href="/forums"><MessagesSquare size={14} /> Forum management</a>
          </div>
        </Card>
      </section>

      {/* ── 3. CONTENT MANAGEMENT ───────────────────── */}
      <section className="tea-section">
        <h2><Layers size={18} /> Course content management</h2>
        <Card className="panel">
          <div className="hierarchy">
            <span className="hx-node muted">Program</span><ChevronRight size={13} />
            <span className="hx-node muted">Course</span><ChevronRight size={13} />
            <span className="hx-node">Unit</span><ChevronRight size={13} />
            <span className="hx-node">Lesson</span><ChevronRight size={13} />
            <span className="hx-node">Activity</span>
            <span className="hx-note">You manage units, lessons and activities inside courses assigned to you.</span>
          </div>
          <div className="content-workflow">
            <div className="wf-step">
              <div className="wf-num">1</div>
              <a href={builderHref} className="wf-card">
                <Layers size={18} />
                <strong>Units &amp; lessons</strong>
                <span>Organize your course structure</span>
              </a>
            </div>
            <div className="wf-arrow"><ChevronRight size={16} /></div>
            <div className="wf-step">
              <div className="wf-num">2</div>
              <a href={builderHref} className="wf-card">
                <Upload size={18} />
                <strong>Upload materials</strong>
                <span>Videos, files, documents, links</span>
              </a>
            </div>
            <div className="wf-arrow"><ChevronRight size={16} /></div>
            <div className="wf-step">
              <div className="wf-num">3</div>
              <a href="/teach/quiz" className="wf-card">
                <PenSquare size={18} />
                <strong>Create assessments</strong>
                <span>Quizzes and assignments</span>
              </a>
            </div>
            <div className="wf-arrow"><ChevronRight size={16} /></div>
            <div className="wf-step">
              <div className="wf-num">4</div>
              <a href="/forums" className="wf-card">
                <MessagesSquare size={18} />
                <strong>Set up forums</strong>
                <span>Discussion and announcements</span>
              </a>
            </div>
          </div>
          {courses.length > 0 && (
            <div className="course-quick-links">
              {courses.map((c) => (
                <a key={c.id} href={`/teach/builder?course=${c.id}`} className="cql">
                  <BookOpen size={13} /> {c.shortname}
                </a>
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* ── 5. STUDENT PROGRESS ─────────────────────── */}
      <section className="tea-section">
        <div className="section-hr">
          <h2><GraduationCap size={18} /> Student progress
            {atRisk.length > 0 && <span className="risk-badge"><AlertTriangle size={13} /> {atRisk.length} falling behind</span>}
          </h2>
          <div className="sh-tools">
            <SearchInput value={studentQ} onChange={setStudentQ} placeholder="Search students or courses…" />
          </div>
        </div>

        {/* summary strip */}
        <div className="prog-strip">
          <div className="ps"><div className="ps-val">{students.length}</div><div className="ps-lab">Total students</div></div>
          <div className="ps accent"><div className="ps-val">{avgProgress}%</div><div className="ps-lab">Average grade</div></div>
          <div className="ps sage"><div className="ps-val">{students.filter(s => s.completed).length}</div><div className="ps-lab">Completed</div></div>
          <div className="ps rose"><div className="ps-val">{atRisk.length}</div><div className="ps-lab">Need help</div></div>
        </div>

        {filteredStudents.length === 0 ? (
          <Card><EmptyMini icon={<Users2 size={28} />}
            text={studentQ ? 'No students match your search.' : 'No students enrolled in your courses yet.'} /></Card>
        ) : (
          <Card className="table-card">
            <table className="tea-table">
              <thead>
                <tr><th>Student</th><th>Course</th><th>Progress</th><th>Grade</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {filteredStudents.slice(0, 25).map((s, i) => {
                  const actPct = s.total_activities > 0 ? Math.round((s.done_activities / s.total_activities) * 100) : 0;
                  const atRiskStu = !s.completed && s.grade_pct < 50;
                  return (
                    <tr key={`${s.id}-${i}`} className={atRiskStu ? 'risk-row' : ''}>
                      <td>
                        <div className="stu-name">
                          <div className="stu-av">{s.email.charAt(0).toUpperCase()}</div>
                          <span>{s.email}</span>
                          {atRiskStu && <AlertTriangle size={13} className="risk-ico" />}
                        </div>
                      </td>
                      <td className="stu-course">{s.course}</td>
                      <td>
                        <div className="prog-cell">
                          <div className="prog-bar"><div className="prog-fill" style={{ width: `${actPct}%` }} /></div>
                          <span>{s.done_activities}/{s.total_activities}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`grade-pill ${s.grade_pct >= 70 ? 'good' : s.grade_pct >= 50 ? 'ok' : 'low'}`}>
                          {Math.round(s.grade_pct)}%
                        </span>
                      </td>
                      <td>
                        {s.completed
                          ? <Badge tone="success">Done</Badge>
                          : atRiskStu
                            ? <Badge tone="danger">Behind</Badge>
                            : <Badge tone="neutral">Active</Badge>}
                      </td>
                      <td><a href="/messages" className="msg-link">Message</a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* ── 6+7. FORUM MANAGEMENT + COMMUNICATION ──── */}
      <div className="tea-cols2">
        <Card className="panel">
          <div className="panel-head">
            <h3><MessagesSquare size={16} /> Forum management</h3>
            <a href="/forums">Manage <ChevronRight size={13} /></a>
          </div>
          {(ov?.course_forums ?? []).length === 0 ? (
            <EmptyMini icon={<MessagesSquare size={24} />}
              text="No forums yet. Create forums inside your assigned courses to engage students." />
          ) : (
            <ul className="forum-list">
              {ov!.course_forums.map((f) => (
                <li key={f.id}>
                  <a href="/forums">
                    <span className="fl-icon"><MessagesSquare size={14} /></span>
                    <span className="fl-body">
                      <span className="fl-name">{f.name}</span>
                      <span className="fl-meta">{f.course} · {f.discussion_count} posts
                        <span className="fl-type">{f.type}</span>
                      </span>
                    </span>
                    <span className="fl-arrow"><ChevronRight size={13} /></span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div className="panel-actions">
            <a href="/forums">Create forum</a>
            <a href="/forums">Moderate</a>
          </div>
        </Card>

        <Card className="panel">
          <div className="panel-head"><h3><Megaphone size={16} /> Communication</h3></div>
          <div className="comm-grid">
            <a href="/messages" className="comm-link">
              <Megaphone size={16} /><div><strong>Announcements</strong><span>Notify your students</span></div>
            </a>
            <a href="/messages" className="comm-link">
              <MessagesSquare size={16} /><div><strong>Messages</strong><span>Direct student messages</span></div>
            </a>
            <a href="/forums" className="comm-link">
              <MessagesSquare size={16} /><div><strong>Forum replies</strong><span>Respond to discussions</span></div>
            </a>
            <a href="/notifications" className="comm-link">
              <Bell size={16} /><div><strong>Notifications</strong><span>Course alerts</span></div>
            </a>
          </div>
        </Card>
      </div>

      <style jsx>{css}</style>
    </div>
  );
}

/* ── sub-components ─────────────────────────────── */
function Tile({ icon, value, label, sub, href, highlight = false }: {
  icon: React.ReactNode; value: React.ReactNode; label: string; sub?: string; href: string; highlight?: boolean;
}) {
  return (
    <a href={href} className={highlight ? 'tile highlight' : 'tile'}>
      <div className="tile-icon">{icon}</div>
      <div className="tile-val">{value}</div>
      <div className="tile-lab">{label}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </a>
  );
}
function EmptyMini({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="empty-mini">{icon}<p>{text}</p></div>;
}

/* ── styles ─────────────────────────────────────── */
const css = `
  .tea { display: flex; flex-direction: column; gap: 2rem; }

  /* header */
  .tea-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .tea-head h1 { margin-top: 0.3rem; }
  .ha-right { display: flex; align-items: center; gap: 0.5rem; }
  .icon-btn { width: 2.4rem; height: 2.4rem; border: 1px solid var(--line); border-radius: 10px; display: grid; place-items: center; color: var(--ink-soft); background: none; cursor: pointer; }
  .icon-btn:hover { border-color: var(--accent); color: var(--accent); }
  .qa-wrap { position: relative; }
  .qa-menu { position: absolute; right: 0; top: calc(100% + 0.4rem); background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow-lg); padding: 0.4rem; min-width: 14rem; z-index: 30; display: flex; flex-direction: column; }
  .qa-menu a { display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 0.75rem; border-radius: 8px; font-size: 0.88rem; font-weight: 500; color: var(--ink-soft); }
  .qa-menu a:hover { background: var(--surface-sunken); color: var(--ink); }
  .qa-menu a :global(svg) { color: var(--accent); }
  .err-banner { display: flex; align-items: center; gap: 0.5rem; padding: 0.9rem 1.1rem; color: var(--rose); background: rgba(220,38,38,0.06); border-color: rgba(220,38,38,0.2); }

  /* tiles */
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)); gap: 1rem; }
  .tile { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 1.25rem; box-shadow: var(--shadow-sm); display: block; transition: all 0.16s ease; }
  .tile:hover { box-shadow: var(--shadow); transform: translateY(-2px); border-color: var(--accent); }
  .tile.highlight { border-color: var(--gold); background: rgba(217,119,6,0.03); }
  .tile-icon { width: 2.3rem; height: 2.3rem; border-radius: 10px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; margin-bottom: 0.75rem; }
  .tile.highlight .tile-icon { background: rgba(217,119,6,0.12); color: var(--gold); }
  .tile-val { font-family: var(--serif); font-size: 1.6rem; font-weight: 600; color: var(--ink); line-height: 1; }
  .tile-lab { font-size: 0.8rem; color: var(--ink-faint); margin-top: 0.35rem; }
  .tile-sub { font-size: 0.72rem; color: var(--ink-faint); margin-top: 0.2rem; font-weight: 600; }
  .tile.highlight .tile-sub { color: var(--gold); }

  /* sections */
  .tea-section { display: flex; flex-direction: column; gap: 1rem; }
  .tea-section h2 { display: flex; align-items: center; gap: 0.5rem; font-size: 1.2rem; flex-wrap: wrap; }
  .section-hr { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .view-all { display: flex; align-items: center; font-size: 0.82rem; color: var(--accent); font-weight: 600; white-space: nowrap; }
  .sh-tools { display: flex; align-items: center; gap: 0.75rem; }
  .risk-badge { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.74rem; font-weight: 600; color: var(--rose); background: rgba(220,38,38,0.08); padding: 0.2rem 0.65rem; border-radius: 999px; margin-left: 0.75rem; }

  /* course grid */
  .course-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.25rem; }
  :global(.course-card) { padding: 1.3rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .cc-top { display: flex; align-items: center; justify-content: space-between; }
  .cc-icon { width: 2.2rem; height: 2.2rem; border-radius: 9px; background: var(--accent); color: #fff; display: grid; place-items: center; }
  .cc-badges { display: flex; gap: 0.35rem; flex-wrap: wrap; }
  .cc-title { font-size: 1rem; font-weight: 600; color: var(--ink); line-height: 1.3; }
  .cc-meta-row { display: flex; gap: 1rem; font-size: 0.78rem; color: var(--ink-faint); }
  .cc-meta-row span { display: flex; align-items: center; gap: 0.3rem; }
  .cc-progress-row { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--ink-soft); }
  .cc-progress-row strong { color: var(--accent); }
  .cc-bar { height: 5px; background: var(--surface-sunken); border-radius: 999px; overflow: hidden; }
  .cc-fill { height: 100%; background: var(--accent); border-radius: 999px; transition: width 0.4s ease; }
  .cc-last { font-size: 0.74rem; color: var(--ink-faint); }
  .cc-actions { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.25rem; }
  .cc-actions a { font-size: 0.76rem; font-weight: 600; color: var(--accent); padding: 0.3rem 0.65rem; border: 1px solid var(--line); border-radius: 999px; }
  .cc-actions .cc-btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  .cc-actions a:hover { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
  .cc-actions .cc-btn-primary:hover { background: var(--accent-deep); }

  /* panels */
  :global(.panel) { padding: 1.4rem; }
  .panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
  .panel-head h3 { display: flex; align-items: center; gap: 0.45rem; font-size: 1rem; color: var(--ink); }
  .panel-head a { display: flex; align-items: center; font-size: 0.82rem; color: var(--accent); font-weight: 600; }
  .panel-actions { display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap; }
  .panel-actions a { font-size: 0.8rem; font-weight: 600; color: var(--accent); padding: 0.4rem 0.85rem; border: 1px solid var(--line); border-radius: 999px; }
  .panel-actions a:hover { border-color: var(--accent); background: var(--accent-soft); }

  /* tabs */
  .tab-bar { display: flex; gap: 0.1rem; border-bottom: 1px solid var(--line); margin-bottom: 1rem; }
  .tab { background: none; border: none; padding: 0.6rem 1rem; font-size: 0.88rem; font-weight: 500; color: var(--ink-faint); cursor: pointer; display: flex; align-items: center; gap: 0.4rem; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tbadge { background: var(--gold); color: #fff; font-size: 0.68rem; font-weight: 700; padding: 0.1rem 0.4rem; border-radius: 999px; }

  /* task list */
  .task-list { list-style: none; display: flex; flex-direction: column; gap: 0.2rem; }
  .task-list li a { display: flex; align-items: center; gap: 0.7rem; padding: 0.6rem 0.7rem; border-radius: 8px; }
  .task-list li a:hover { background: var(--surface-sunken); }
  .task-ic { width: 1.9rem; height: 1.9rem; border-radius: 7px; display: grid; place-items: center; flex-shrink: 0; }
  .task-ic.neutral { background: var(--accent-soft); color: var(--accent); }
  .task-ic.warn { background: rgba(217,119,6,0.1); color: var(--gold); }
  .task-body { flex: 1; min-width: 0; }
  .task-title { display: block; font-size: 0.88rem; font-weight: 500; color: var(--ink); }
  .late-tag { font-size: 0.66rem; font-weight: 700; color: var(--rose); background: rgba(220,38,38,0.1); padding: 0.1rem 0.4rem; border-radius: 4px; margin-left: 0.5rem; }
  .forum-type { font-size: 0.66rem; font-weight: 600; text-transform: uppercase; color: var(--ink-faint); background: var(--surface-sunken); padding: 0.1rem 0.45rem; border-radius: 4px; margin-left: 0.5rem; }
  .task-meta { display: block; font-size: 0.74rem; color: var(--ink-faint); }
  .task-arrow { color: var(--ink-faint); }
  .task-footer { display: flex; gap: 1rem; padding-top: 0.75rem; margin-top: 0.5rem; border-top: 1px solid var(--line); }
  .task-footer a { display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; color: var(--accent); font-weight: 600; }

  /* content workflow */
  .hierarchy { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; padding-bottom: 1rem; margin-bottom: 1rem; border-bottom: 1px solid var(--line); }
  .hx-node { font-size: 0.82rem; font-weight: 600; color: var(--ink); background: var(--accent-soft); padding: 0.25rem 0.7rem; border-radius: 999px; }
  .hx-node.muted { color: var(--ink-faint); background: var(--surface-sunken); font-weight: 500; }
  .hierarchy :global(svg) { color: var(--ink-faint); }
  .hx-note { font-size: 0.76rem; color: var(--ink-faint); margin-left: 0.5rem; flex-basis: 100%; }
  @media (min-width: 720px) { .hx-note { flex-basis: auto; margin-left: 0.75rem; } }
  .content-workflow { display: flex; align-items: stretch; gap: 0.4rem; flex-wrap: wrap; }
  .wf-step { display: flex; flex-direction: column; align-items: center; gap: 0.35rem; flex: 1; min-width: 130px; }
  .wf-num { font-size: 0.68rem; font-weight: 700; color: var(--accent); background: var(--accent-soft); width: 1.4rem; height: 1.4rem; border-radius: 50%; display: grid; place-items: center; }
  .wf-card { display: flex; flex-direction: column; align-items: center; gap: 0.35rem; padding: 1rem 0.75rem; width: 100%; border: 1px solid var(--line); border-radius: 10px; text-align: center; transition: all 0.14s ease; }
  .wf-card:hover { border-color: var(--accent); background: var(--accent-soft); }
  .wf-card :global(svg) { color: var(--accent); }
  .wf-card strong { font-size: 0.86rem; font-weight: 600; color: var(--ink); }
  .wf-card span { font-size: 0.74rem; color: var(--ink-faint); }
  .wf-arrow { color: var(--ink-faint); display: flex; align-items: center; margin-top: 2rem; }
  @media (max-width: 700px) { .wf-arrow { display: none; } }
  .course-quick-links { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--line); }
  .cql { display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; font-weight: 600; color: var(--accent); padding: 0.3rem 0.7rem; background: var(--accent-soft); border-radius: 999px; }

  /* student progress strip */
  .prog-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
  .ps { padding: 0.75rem 1rem; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
  .ps-val { font-size: 1.5rem; font-weight: 700; color: var(--ink); font-family: var(--serif); }
  .ps.accent .ps-val { color: var(--accent); }
  .ps.sage .ps-val { color: var(--sage); }
  .ps.rose .ps-val { color: var(--rose); }
  .ps-lab { font-size: 0.74rem; color: var(--ink-faint); margin-top: 0.15rem; }
  @media (max-width: 700px) { .prog-strip { grid-template-columns: 1fr 1fr; } }

  /* student table */
  :global(.table-card) { padding: 0; overflow: hidden; }
  .tea-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  .tea-table th { text-align: left; font-size: 0.71rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-faint); padding: 0.8rem 1rem; border-bottom: 1px solid var(--line); }
  .tea-table td { padding: 0.8rem 1rem; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .tea-table tr:last-child td { border-bottom: none; }
  .tea-table tbody tr:hover { background: var(--surface-sunken); }
  .risk-row { background: rgba(220,38,38,0.025) !important; }
  .stu-name { display: flex; align-items: center; gap: 0.6rem; }
  .stu-av { width: 1.9rem; height: 1.9rem; border-radius: 7px; background: var(--accent); color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 0.82rem; flex-shrink: 0; }
  .risk-ico { color: var(--rose); flex-shrink: 0; }
  .stu-course { color: var(--ink-faint); font-size: 0.82rem; }
  .prog-cell { display: flex; align-items: center; gap: 0.5rem; }
  .prog-bar { flex: 1; height: 5px; background: var(--surface-sunken); border-radius: 999px; overflow: hidden; min-width: 3rem; }
  .prog-fill { height: 100%; background: var(--accent); border-radius: 999px; }
  .prog-cell span { font-size: 0.74rem; color: var(--ink-faint); white-space: nowrap; }
  .grade-pill { font-size: 0.78rem; font-weight: 700; padding: 0.18rem 0.55rem; border-radius: 999px; }
  .grade-pill.good { background: rgba(5,150,105,0.12); color: var(--sage); }
  .grade-pill.ok { background: rgba(217,119,6,0.12); color: var(--gold); }
  .grade-pill.low { background: rgba(220,38,38,0.1); color: var(--rose); }
  .msg-link { color: var(--accent); font-size: 0.8rem; font-weight: 600; }

  /* 2-col layout */
  .tea-cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
  @media (max-width: 900px) { .tea-cols2 { grid-template-columns: 1fr; } }

  /* forum list */
  .forum-list { list-style: none; display: flex; flex-direction: column; gap: 0.2rem; }
  .forum-list li a { display: flex; align-items: center; gap: 0.7rem; padding: 0.55rem 0.6rem; border-radius: 8px; }
  .forum-list li a:hover { background: var(--surface-sunken); }
  .fl-icon { width: 1.8rem; height: 1.8rem; border-radius: 7px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; flex-shrink: 0; }
  .fl-body { flex: 1; min-width: 0; }
  .fl-name { display: block; font-size: 0.88rem; font-weight: 500; color: var(--ink); }
  .fl-meta { display: block; font-size: 0.74rem; color: var(--ink-faint); }
  .fl-type { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; color: var(--accent); background: var(--accent-soft); padding: 0.1rem 0.4rem; border-radius: 4px; margin-left: 0.4rem; }
  .fl-arrow { color: var(--ink-faint); }

  /* communication */
  .comm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
  .comm-link { display: flex; align-items: center; gap: 0.65rem; padding: 0.8rem 0.9rem; border: 1px solid var(--line); border-radius: 10px; }
  .comm-link:hover { border-color: var(--accent); background: var(--accent-soft); }
  .comm-link :global(svg) { color: var(--accent); flex-shrink: 0; }
  .comm-link div { display: flex; flex-direction: column; }
  .comm-link strong { font-size: 0.84rem; font-weight: 600; color: var(--ink); }
  .comm-link span { font-size: 0.74rem; color: var(--ink-faint); margin-top: 0.1rem; }

  /* empty */
  .empty-mini { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1.75rem; text-align: center; color: var(--ink-faint); }
  .empty-mini :global(svg) { opacity: 0.35; }
  .empty-mini p { font-size: 0.84rem; max-width: 24rem; }
`;
