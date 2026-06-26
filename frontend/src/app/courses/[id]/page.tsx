'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, Button, EmptyState, Skeleton } from '@/components/ui';
import {
  api, auth, courseStructure, assignments as asgApi,
  type Course, type CourseSection, type CourseLesson, type CourseModule,
  type CompletionStatus, type CourseAssignment,
} from '@/lib/api';
import {
  FileText, Video, Link2, File, BookOpen, GraduationCap, ArrowLeft,
  CheckCircle2, Circle, PenSquare, Layers,
} from 'lucide-react';

const ACT_ICON: Record<string, typeof FileText> = {
  page: FileText, video: Video, url: Link2, file: File, resource: File,
  quiz: PenSquare, assign: GraduationCap, assignment: GraduationCap, book: BookOpen,
};

export default function CoursePlayerPage() {
  const ready = useRequireAuth();
  const params = useParams();
  const courseId = params.id as string;

  const [email, setEmail] = useState<string>();
  const [course, setCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [lessons, setLessons] = useState<CourseLesson[]>([]);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [completion, setCompletion] = useState<CompletionStatus | null>(null);
  const [courseAssignments, setCourseAssignments] = useState<CourseAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me(); setEmail(me.email);
        const [c, secs, less, modsRaw, comp, asg] = await Promise.all([
          api.get<Course>(`/courses/${courseId}`).catch(() => null),
          courseStructure.sections(courseId).catch(() => []),
          courseStructure.lessons(courseId).catch(() => []),
          courseStructure.modules(courseId).catch(() => ({ data: [], meta: { locked: false } })),
          courseStructure.completion(courseId).catch(() => null),
          asgApi.listForCourse(courseId).catch(() => []),
        ]);
        const mods = modsRaw?.data ?? [];
        const courseLocked = modsRaw?.meta?.locked ?? false;
        setCourse(c); setSections(secs); setLessons(less); setModules(mods);
        setCompletion(comp); setCourseAssignments(asg); setLocked(courseLocked);
      } finally { setLoading(false); }
    })();
  }, [ready, courseId]);

  if (!ready) return null;

  // completion lookup: module id -> done?
  const doneMap = new Map((completion?.modules ?? []).map((m) => [m.id, m.state > 0]));
  const totalActivities = modules.length;
  const doneCount = modules.filter((m) => doneMap.get(m.id)).length;
  const pct = totalActivities > 0 ? Math.round((doneCount / totalActivities) * 100) : 0;

  async function toggleDone(moduleId: string) {
    await courseStructure.markActivity(moduleId).catch(() => {});
    const comp = await courseStructure.completion(courseId).catch(() => null);
    setCompletion(comp);
  }

  function lessonsFor(sectionId: string) {
    return lessons.filter((l) => l.section_id === sectionId).sort((a, b) => a.sort_order - b.sort_order);
  }
  function modulesFor(sectionId: string) {
    return modules.filter((m) => m.section_id === sectionId).sort((a, b) => a.sort_order - b.sort_order);
  }

  return (
    <AppShell email={email}>
      <a href="/courses" className="back"><ArrowLeft size={15} /> All courses</a>

      {loading ? <Skeleton height="24rem" /> : !course ? (
        <Card><EmptyState icon={<BookOpen size={36} />} title="Course not found" body="" /></Card>
      ) : locked ? (
        <>
          <Card className="course-hero">
            <div className="hero-icon"><BookOpen size={26} /></div>
            <div className="hero-body">
              <div className="hero-top">
                <Badge tone="neutral">{course.status}</Badge>
                <span className="hero-code">{course.shortname}</span>
              </div>
              <h1>{course.fullname}</h1>
            </div>
          </Card>

          <Card className="locked-card">
            <div className="lock-icon">🔒</div>
            <h2>This course is {course.is_paid ? 'a paid course' : 'restricted'}</h2>
            <p className="muted">
              {course.is_paid
                ? `Enrol to unlock all units, lessons, videos, assignments, quizzes, and forums.`
                : 'You need to be enrolled to access this course content.'}
            </p>
            {course.is_paid && course.price_minor ? (
              <div className="lock-price">
                <span className="price-big">{course.currency ?? 'KES'} {(course.price_minor / 100).toLocaleString()}</span>
                <a href={`/checkout?type=course&id=${course.id}&title=${encodeURIComponent(course.fullname)}`} className="buy-btn">
                  Buy now → Unlock access
                </a>
              </div>
            ) : (
              <a href="/courses" className="buy-btn">Browse courses</a>
            )}

            <div className="locked-sections">
              <h3>Course structure</h3>
              {sections.map((s) => (
                <div key={s.id} className="locked-section">
                  <span className="ls-num">Unit {s.section_num}</span>
                  <span className="ls-name">{s.name || `Unit ${s.section_num}`}</span>
                  <span className="ls-lock">🔒</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : (
        <>
          <Card className="course-hero">
            <div className="hero-icon"><BookOpen size={26} /></div>
            <div className="hero-body">
              <div className="hero-top">
                <Badge tone={course.status === 'active' ? 'success' : 'neutral'}>{course.status}</Badge>
                <span className="hero-code">{course.shortname}</span>
              </div>
              <h1>{course.fullname}</h1>
            </div>
          </Card>

          {/* progress bar */}
          <Card className="progress-card">
            <div className="pc-head">
              <span><GraduationCap size={16} /> Your progress</span>
              <strong>{pct}%</strong>
            </div>
            <div className="pc-bar"><div className="pc-fill" style={{ width: `${pct}%` }} /></div>
            <div className="pc-meta">{doneCount} of {totalActivities} activities complete
              {completion?.course_state === 'complete' && <Badge tone="success">Course complete</Badge>}</div>
          </Card>

          {/* Unit → Lesson → Activity structure */}
          {sections.length === 0 ? (
            <Card><EmptyState icon={<Layers size={36} />} title="No content yet"
              body="Your teacher hasn't added units to this course yet." /></Card>
          ) : (
            <div className="units">
              {sections.map((s) => {
                const secMods = modulesFor(s.id);
                const secLessons = lessonsFor(s.id);
                const secDone = secMods.filter((m) => doneMap.get(m.id)).length;
                return (
                  <Card key={s.id} className="unit">
                    <div className="unit-head">
                      <div className="unit-num">Unit {s.section_num}</div>
                      <h3>{s.name || `Unit ${s.section_num}`}</h3>
                      <span className="unit-prog">{secDone}/{secMods.length}</span>
                    </div>

                    {secLessons.length > 0 && (
                      <div className="lessons">
                        {secLessons.map((l) => (
                          <div key={l.id} className="lesson"><Layers size={13} /> {l.title}</div>
                        ))}
                      </div>
                    )}

                    <ul className="activities">
                      {secMods.length === 0 ? (
                        <li className="empty-act">No activities in this unit yet.</li>
                      ) : secMods.map((m) => {
                        const Icon = ACT_ICON[m.module_type] ?? FileText;
                        const done = doneMap.get(m.id);
                        return (
                          <li key={m.id} className={done ? 'activity done' : 'activity'}>
                            <button className="check" onClick={() => toggleDone(m.id)} title={done ? 'Completed' : 'Mark complete'}>
                              {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                            </button>
                            <Icon size={16} className="act-icon" />
                            <span className="act-title">{m.title || m.module_type}</span>
                            <Badge tone="neutral">{m.module_type}</Badge>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Assignments */}
          {courseAssignments.length > 0 && (
            <section className="asg-section">
              <h2>Assignments</h2>
              <div className="asg-list">
                {courseAssignments.map((a) => (
                  <a key={a.id} href={`/courses/${courseId}/assignments/${a.id}`} className="asg-item">
                    <GraduationCap size={18} />
                    <div className="asg-main">
                      <div className="asg-title">{a.title}</div>
                      <div className="asg-due">{a.due_at ? `Due ${new Date(a.due_at).toLocaleDateString()}` : 'No due date'}</div>
                    </div>
                    <Button variant="ghost" size="sm">Open →</Button>
                  </a>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <style jsx>{`
        .back { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.85rem; color: var(--ink-soft); font-weight: 500; margin-bottom: 1.25rem; }
        .back:hover { color: var(--accent); }
        :global(.course-hero) { display: flex; gap: 1.25rem; padding: 1.75rem; margin-bottom: 1.25rem;
          background: linear-gradient(120deg, var(--accent-soft), transparent 65%), var(--surface); }
        .hero-icon { width: 3.5rem; height: 3.5rem; border-radius: 14px; background: var(--accent); color: #fff; display: grid; place-items: center; flex-shrink: 0; }
        .hero-top { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem; }
        .hero-code { font-size: 0.85rem; color: var(--ink-soft); }
        .hero-body h1 { font-size: 1.7rem; }

        :global(.progress-card) { padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; }
        .pc-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.6rem; }
        .pc-head span { display: flex; align-items: center; gap: 0.45rem; font-weight: 600; color: var(--ink); }
        .pc-head strong { font-size: 1.4rem; color: var(--accent); font-family: var(--serif); }
        .pc-bar { height: 8px; background: var(--surface-sunken); border-radius: 999px; overflow: hidden; }
        .pc-fill { height: 100%; background: var(--accent); border-radius: 999px; transition: width 0.4s ease; }
        .pc-meta { display: flex; align-items: center; gap: 0.75rem; font-size: 0.84rem; color: var(--ink-faint); margin-top: 0.6rem; }

        .locked-card { padding: 2.5rem; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 1.25rem; }
        .lock-icon { font-size: 3rem; }
        .locked-card h2 { font-size: 1.5rem; color: var(--ink); }
        .lock-price { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
        .price-big { font-size: 2rem; font-weight: 700; color: var(--ink); font-family: var(--serif); }
        .buy-btn { display: inline-flex; align-items: center; gap: 0.5rem; background: var(--accent); color: #fff;
          padding: 0.85rem 2rem; border-radius: 12px; font-weight: 600; font-size: 1rem; }
        .buy-btn:hover { background: var(--accent-deep); }
        .locked-sections { width: 100%; max-width: 28rem; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
        .locked-sections h3 { font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-faint); padding: 0.7rem 1rem; border-bottom: 1px solid var(--line); }
        .locked-section { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 1rem; border-bottom: 1px solid var(--line); }
        .locked-section:last-child { border-bottom: none; }
        .ls-num { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: #fff; background: var(--ink-faint); padding: 0.15rem 0.5rem; border-radius: 5px; }
        .ls-name { flex: 1; font-size: 0.88rem; color: var(--ink-soft); }
        .ls-lock { font-size: 0.9rem; }

        .units { display: flex; flex-direction: column; gap: 1rem; }
        :global(.unit) { padding: 1.4rem; }
        .unit-head { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.85rem; }
        .unit-num { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #fff;
          background: var(--accent); padding: 0.2rem 0.6rem; border-radius: 6px; }
        .unit-head h3 { flex: 1; font-size: 1.1rem; color: var(--ink); }
        .unit-prog { font-size: 0.8rem; font-weight: 600; color: var(--ink-faint); }
        .lessons { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.85rem; padding-left: 0.25rem; }
        .lesson { display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; color: var(--ink-soft);
          background: var(--surface-sunken); padding: 0.25rem 0.6rem; border-radius: 6px; }
        .lesson :global(svg) { color: var(--accent); }
        .activities { list-style: none; display: flex; flex-direction: column; gap: 0.25rem; }
        .activity { display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.6rem; border-radius: 8px; transition: background 0.14s ease; }
        .activity:hover { background: var(--surface-sunken); }
        .activity.done .act-title { color: var(--ink-faint); text-decoration: line-through; }
        .check { background: none; border: none; cursor: pointer; color: var(--ink-faint); display: grid; place-items: center; padding: 0; }
        .activity.done .check { color: var(--sage); }
        .act-icon { color: var(--accent); flex-shrink: 0; }
        .act-title { flex: 1; font-size: 0.9rem; color: var(--ink); }
        .empty-act { color: var(--ink-faint); font-size: 0.85rem; padding: 0.5rem; }

        .asg-section { margin-top: 2rem; }
        .asg-section h2 { font-size: 1.2rem; margin-bottom: 1rem; }
        .asg-list { display: flex; flex-direction: column; gap: 0.6rem; }
        .asg-item { display: flex; align-items: center; gap: 0.85rem; padding: 1rem 1.1rem; background: var(--surface);
          border: 1px solid var(--line); border-radius: var(--radius); transition: all 0.14s ease; }
        .asg-item:hover { border-color: var(--accent); box-shadow: var(--shadow-sm); }
        .asg-item :global(svg) { color: var(--accent); flex-shrink: 0; }
        .asg-main { flex: 1; }
        .asg-title { font-weight: 600; font-size: 0.92rem; color: var(--ink); }
        .asg-due { font-size: 0.8rem; color: var(--ink-faint); margin-top: 0.15rem; }
      `}</style>
    </AppShell>
  );
}
