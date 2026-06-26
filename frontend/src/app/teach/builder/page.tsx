'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { api, auth, ApiException, type Course, type BuilderSection, type BuilderModule } from '@/lib/api';

const KIND_LABEL: Record<string, string> = { page: 'Page', url: 'Link', file: 'File', video: 'Video', assignment: 'Assignment', quiz: 'Quiz', book: 'Book', folder: 'Folder' };

function BuilderInner() {
  const ready = useRequireAuth();
  const sp = useSearchParams();
  const [email, setEmail] = useState<string>();
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState(sp.get('course') || '');
  const [sections, setSections] = useState<BuilderSection[]>([]);
  const [modules, setModules] = useState<BuilderModule[]>([]);
  const [lessons, setLessons] = useState<{ id: string; section_id: string; title: string; sort_order: number }[]>([]);
  const [addingLessonTo, setAddingLessonTo] = useState<string | null>(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newSection, setNewSection] = useState('');
  // per-section add-activity state
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [actKind, setActKind] = useState('page');
  const [actTitle, setActTitle] = useState('');
  const [actUrl, setActUrl] = useState('');
  const [actDue, setActDue] = useState('');
  // drag-to-reorder state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragSection, setDragSection] = useState<string | null>(null);
  const [dragSecId, setDragSecId] = useState<string | null>(null);

  const loadStructure = useCallback(async (courseId: string) => {
    if (!courseId) return;
    const [secs, mods, less] = await Promise.all([
      api.get<BuilderSection[]>(`/courses/${courseId}/sections`).catch(() => []),
      api.get<BuilderModule[]>(`/courses/${courseId}/modules`).catch(() => []),
      api.get<{ id: string; section_id: string; title: string; sort_order: number }[]>(`/courses/${courseId}/lessons`).catch(() => []),
    ]);
    setSections(secs);
    setModules(mods);
    setLessons(less);
  }, []);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const m = await auth.me(); setEmail(m.email);
        const c = await api.get<Course[]>('/courses').catch(() => []);
        setCourses(c);
        const initial = course || (c[0]?.id ?? '');
        setCourse(initial);
        if (initial) await loadStructure(initial);
      } finally { setLoading(false); }
    })();
  }, [ready]);

  useEffect(() => { if (course) loadStructure(course); }, [course, loadStructure]);

  async function addSection() {
    setError(null);
    if (!course || !newSection.trim()) return;
    try {
      await api.post(`/courses/${course}/sections`, { name: newSection, visible: true });
      setNewSection('');
      await loadStructure(course);
    } catch (err) { setError(err instanceof ApiException ? err.message : 'Could not add section.'); }
  }

  async function addLesson(sectionId: string) {
    setError(null);
    if (!lessonTitle.trim()) { setError('Give the lesson a title.'); return; }
    try {
      await api.post(`/courses/${course}/lessons`, { sectionId, title: lessonTitle });
      setLessonTitle(''); setAddingLessonTo(null);
      await loadStructure(course);
    } catch (err) { setError(err instanceof ApiException ? err.message : 'Could not add lesson.'); }
  }

  function lessonsFor(sectionId: string) {
    return lessons.filter((l) => l.section_id === sectionId).sort((a, b) => a.sort_order - b.sort_order);
  }

  async function addActivity(sectionId: string) {
    setError(null);
    if (!actTitle.trim()) { setError('Give the activity a title.'); return; }
    try {
      if (actKind === 'assignment') {
        // create an assignment, then slot it into the section
        const a = await api.post<{ id: string }>('/assignments', {
          courseId: course, title: actTitle,
          ...(actDue ? { dueAt: new Date(actDue).toISOString() } : {}),
        });
        await api.post(`/courses/${course}/modules`, {
          sectionId, moduleType: 'assignment', instanceId: a.id, visible: true,
        });
      } else if (actKind === 'quiz') {
        // create a quiz, then slot it into the section
        const q = await api.post<{ id: string }>('/quizzes', {
          courseId: course, name: actTitle,
        });
        await api.post(`/courses/${course}/modules`, {
          sectionId, moduleType: 'quiz', instanceId: q.id, visible: true,
        });
      } else if (actKind === 'video') {
        // create a content shell, attach the video source, then slot it
        const content = await api.post<{ id: string }>('/content', { courseId: course, kind: 'video', title: actTitle });
        if (actUrl.trim()) {
          await api.post('/videos', {
            contentId: content.id,
            provider: actUrl.includes('youtube') || actUrl.includes('youtu.be') ? 'youtube'
              : actUrl.includes('vimeo') ? 'vimeo' : 'self',
            url: actUrl.trim(),
          });
        }
        await api.post(`/courses/${course}/modules`, {
          sectionId, moduleType: 'content', instanceId: content.id, visible: true,
        });
      } else {
        // page / link / file / book / folder → a content activity
        const content = await api.post<{ id: string }>('/content', { courseId: course, kind: actKind, title: actTitle });
        await api.post(`/courses/${course}/modules`, {
          sectionId, moduleType: 'content', instanceId: content.id, visible: true,
        });
      }
      setActTitle(''); setActUrl(''); setActDue(''); setAddingTo(null);
      await loadStructure(course);
    } catch (err) { setError(err instanceof ApiException ? err.message : 'Could not add activity.'); }
  }

  async function toggleVisibility(sectionId: string, visible: boolean) {
    setSections((prev) => prev.map((x) => x.id === sectionId ? { ...x, visible } : x));
    try { await api.patch(`/sections/${sectionId}/visibility`, { visible }); }
    catch { await loadStructure(course); }
  }

  async function reorderSections(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const ids = [...sections].sort((a, b) => a.section_num - b.section_num).map((x) => x.id);
    const from = ids.indexOf(draggedId), to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setSections((prev) => prev.map((x) => { const i = ids.indexOf(x.id); return i >= 0 ? { ...x, section_num: i } : x; })
      .sort((a, b) => a.section_num - b.section_num));
    try { await api.patch(`/courses/${course}/sections/order`, { order: ids }); }
    catch { await loadStructure(course); }
  }

  async function reorderWithin(sectionId: string, draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const inSection = modules.filter((m) => m.section_id === sectionId).sort((a, b) => a.sort_order - b.sort_order);
    const ids = inSection.map((m) => m.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    // optimistic local update
    setModules((prev) => prev.map((m) => {
      const idx = ids.indexOf(m.id);
      return m.section_id === sectionId && idx >= 0 ? { ...m, sort_order: idx } : m;
    }));
    try {
      await api.patch(`/sections/${sectionId}/modules/order`, { order: ids });
    } catch {
      await loadStructure(course); // revert to server truth on failure
    }
  }

  if (!ready) return null;

  const modulesFor = (sectionId: string) => modules.filter((m) => m.section_id === sectionId);

  return (
    <AppShell email={email}>
      <header className="page-head"><span className="eyebrow">Teaching · Course builder</span><h1>Build your course</h1>
        <p className="muted">Add sections (weeks/topics), then drop activities into each.</p></header>

      <div className="course-pick">
        <select className="input" value={course} onChange={(e) => setCourse(e.target.value)}>
          {courses.length === 0 ? <option>No courses</option>
            : courses.map((c) => <option key={c.id} value={c.id}>{c.shortname} — {c.fullname}</option>)}
        </select>
        {course && <a className="preview-link" href={`/courses/${course}`} target="_blank" rel="noopener noreferrer">Preview as student →</a>}
      </div>

      {error && <div className="alert">{error}</div>}

      {loading ? <p className="faint">Loading…</p> : (
        <>
          <div className="sections">
            {sections.length === 0 ? (
              <div className="card empty"><p className="muted">No sections yet. Add your first one below.</p></div>
            ) : sections.map((s) => (
              <div key={s.id}
                className={`section card ${dragSecId === s.id ? 'sec-dragging' : ''}`}
                onDragOver={(e) => { if (dragSecId && dragSecId !== s.id) e.preventDefault(); }}
                onDrop={(e) => { if (dragSecId) { e.preventDefault(); reorderSections(dragSecId, s.id); } }}>
                <div className="section-head"
                  draggable
                  onDragStart={(e) => { e.stopPropagation(); setDragSecId(s.id); }}
                  onDragEnd={() => setDragSecId(null)}>
                  <span className="section-num" title="Drag to reorder section">{s.section_num}</span>
                  <h3>{s.name || `Section ${s.section_num}`}</h3>
                  {!s.visible && <span className="badge badge-draft">hidden</span>}
                  <button className="pub-btn" onClick={(e) => { e.stopPropagation(); toggleVisibility(s.id, !s.visible); }}
                    title={s.visible ? 'Published — click to unpublish' : 'Hidden — click to publish'}>
                    {s.visible ? 'Published' : 'Publish'}
                  </button>
                </div>

                {lessonsFor(s.id).length > 0 && (
                  <div className="lessons">
                    {lessonsFor(s.id).map((l) => (
                      <div key={l.id} className="lesson-chip"><span className="lesson-dot">●</span>{l.title}</div>
                    ))}
                  </div>
                )}
                {addingLessonTo === s.id ? (
                  <div className="add-lesson">
                    <input className="input" placeholder="Lesson title (e.g. Lesson 1: Cell Structure)" value={lessonTitle}
                      onChange={(e) => setLessonTitle(e.target.value)} autoFocus />
                    <button className="btn btn-primary" onClick={() => addLesson(s.id)}>Add</button>
                    <button className="btn btn-ghost" onClick={() => { setAddingLessonTo(null); setLessonTitle(''); }}>Cancel</button>
                  </div>
                ) : (
                  <button className="add-lesson-btn" onClick={() => setAddingLessonTo(s.id)}>+ Add lesson</button>
                )}

                <ul className="modules">
                  {modulesFor(s.id).length === 0 ? (
                    <li className="faint empty-mod">No activities yet.</li>
                  ) : modulesFor(s.id).map((m) => (
                    <li key={m.id}
                      className={`module ${dragId === m.id ? 'dragging' : ''}`}
                      draggable
                      onDragStart={() => { setDragId(m.id); setDragSection(s.id); }}
                      onDragEnd={() => { setDragId(null); setDragSection(null); }}
                      onDragOver={(e) => { if (dragSection === s.id) e.preventDefault(); }}
                      onDrop={(e) => { e.preventDefault(); if (dragId && dragSection === s.id) reorderWithin(s.id, dragId, m.id); }}>
                      <span className="mod-icon" title="Drag to reorder">≡</span>
                      <span className="mod-title">{m.title || m.module_type}</span>
                      <span className="badge badge-active">{m.module_type}</span>
                    </li>
                  ))}
                </ul>

                {addingTo === s.id ? (
                  <div className="add-act">
                    <div className="add-act-row">
                      <select className="input" value={actKind} onChange={(e) => setActKind(e.target.value)}>
                        {Object.entries(KIND_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                      </select>
                      <input className="input" placeholder="Activity title" value={actTitle}
                        onChange={(e) => setActTitle(e.target.value)} autoFocus />
                    </div>
                    {actKind === 'video' && (
                      <input className="input" placeholder="Video URL (YouTube, Vimeo, or direct link)" value={actUrl}
                        onChange={(e) => setActUrl(e.target.value)} />
                    )}
                    {actKind === 'url' && (
                      <input className="input" placeholder="Link URL (https://…)" value={actUrl}
                        onChange={(e) => setActUrl(e.target.value)} />
                    )}
                    {actKind === 'assignment' && (
                      <label className="due-field">
                        <span>Due date (optional)</span>
                        <input className="input" type="datetime-local" value={actDue}
                          onChange={(e) => setActDue(e.target.value)} />
                      </label>
                    )}
                    <div className="add-act-actions">
                      <button className="btn btn-primary" onClick={() => addActivity(s.id)}>Add</button>
                      <button className="btn btn-ghost" onClick={() => { setAddingTo(null); setActTitle(''); setActUrl(''); setActDue(''); }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button className="add-act-btn" onClick={() => setAddingTo(s.id)}>+ Add activity</button>
                )}
              </div>
            ))}
          </div>

          <div className="card add-section">
            <input className="input" placeholder="New section name (e.g. Week 2: Functions)"
              value={newSection} onChange={(e) => setNewSection(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSection()} />
            <button className="btn btn-primary" onClick={addSection}>Add section</button>
          </div>
        </>
      )}

      <style jsx>{`
        .page-head { margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 0.3rem; }
        .page-head h1 { margin-top: 0.3rem; }
        .course-pick { margin-bottom: 1.5rem; } .course-pick .input { min-width: 18rem; }
        .alert { background: rgba(168,68,58,0.09); color: var(--rose); padding: 0.6rem 0.9rem; border-radius: var(--radius-sm); margin-bottom: 1.25rem; font-size: 0.88rem; }
        .empty { padding: 2.5rem; text-align: center; }
        .sections { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem; }
        .section { padding: 1.4rem; }
        .section.sec-dragging { opacity: 0.5; border: 1px dashed var(--accent); }
        .pub-btn { background: none; border: 1px solid var(--line); color: var(--ink-soft); font-size: 0.75rem; font-weight: 600;
          padding: 0.2rem 0.65rem; border-radius: 999px; cursor: pointer; transition: all 0.14s ease; }
        .pub-btn:hover { border-color: var(--accent); color: var(--accent); }
        .preview-link { margin-left: 1rem; font-size: 0.88rem; font-weight: 600; color: var(--accent); white-space: nowrap; }
        .preview-link:hover { text-decoration: underline; }
        .course-pick { display: flex; align-items: center; }
        .section-head { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; cursor: grab; }
        .section-num { width: 1.8rem; height: 1.8rem; border-radius: 50%; background: var(--accent); color: #fff;
          display: grid; place-items: center; font-size: 0.85rem; font-weight: 600; flex-shrink: 0; }
        .section-head h3 { margin: 0; flex: 1; }
        .modules { list-style: none; display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.85rem; }
        .module { display: flex; align-items: center; gap: 0.7rem; padding: 0.6rem 0.85rem;
          background: var(--surface-sunken); border-radius: var(--radius-sm); }
        .module.dragging { opacity: 0.4; border: 1px dashed var(--accent); }
        .mod-icon { color: var(--ink-faint); cursor: grab; }
        .mod-title { flex: 1; font-size: 0.9rem; }
        .empty-mod { padding: 0.5rem 0.85rem; font-size: 0.85rem; }
        .lessons { display: flex; flex-direction: column; gap: 0.3rem; margin: 0.5rem 0 0.6rem; padding-left: 0.5rem; }
        .lesson-chip { display: flex; align-items: center; gap: 0.5rem; font-size: 0.86rem; color: var(--ink-soft); font-weight: 500; }
        .lesson-dot { color: var(--accent); font-size: 0.6rem; }
        .add-lesson { display: flex; gap: 0.5rem; margin: 0.4rem 0 0.6rem; }
        .add-lesson .input { flex: 1; }
        .add-lesson-btn { background: none; border: none; color: var(--accent); font-size: 0.82rem; font-weight: 600;
          cursor: pointer; padding: 0.2rem 0; margin-bottom: 0.5rem; text-align: left; }
        .add-lesson-btn:hover { text-decoration: underline; }
        .add-act-btn { background: none; border: 1px dashed var(--line); color: var(--accent);
          padding: 0.55rem 1rem; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.85rem; width: 100%; }
        .add-act { display: flex; flex-direction: column; gap: 0.5rem; }
        .add-act-row { display: flex; gap: 0.5rem; }
        .add-act-row .input:first-child { width: 9rem; flex-shrink: 0; }
        .add-act-row .input:last-child { flex: 1; }
        .add-act-actions { display: flex; gap: 0.5rem; }
        .due-field { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; color: var(--ink-soft); }
        .add-act .input { flex: 1; min-width: 8rem; }
        .add-section { padding: 1.25rem; display: flex; gap: 0.6rem; }
        .add-section .input { flex: 1; }
      `}</style>
    </AppShell>
  );
}

export default function BuilderPage() {
  return <Suspense fallback={null}><BuilderInner /></Suspense>;
}
