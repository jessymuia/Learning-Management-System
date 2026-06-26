'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { api, auth, type Course } from '@/lib/api';

// deterministic cover gradient per course (no external images needed)
const COVERS = [
  'linear-gradient(135deg, #3563d6, #1c3a8a)',
  'linear-gradient(135deg, #3f8268, #2a5645)',
  'linear-gradient(135deg, #c08a2b, #8a5e1a)',
  'linear-gradient(135deg, #7c5cd6, #4a2f9e)',
  'linear-gradient(135deg, #c2453a, #8a2f27)',
  'linear-gradient(135deg, #2b8aa8, #1a5a70)',
];
function coverFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % COVERS.length;
  return COVERS[h];
}

export default function CoursesPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [perms, setPerms] = useState<string[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [me, list] = await Promise.all([
          auth.me(),
          api.get<Course[]>('/courses').catch(() => []),
        ]);
        setEmail(me.email);
        setPerms(me.permissions ?? []);
        setCourses(list);
      } finally {
        setLoading(false);
      }
    })();
  }, [ready]);

  const canManage = perms.includes('course.manage');

  const filtered = useMemo(() => courses.filter((c) => {
    const matchSearch = c.fullname.toLowerCase().includes(search.toLowerCase())
      || c.shortname.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  }), [courses, search, statusFilter]);

  if (!ready) return null;

  return (
    <AppShell email={email}>
      <header className="page-head">
        <div>
          <span className="eyebrow">Catalog</span>
          <h1>Courses</h1>
          <p className="muted sub">{courses.length} {courses.length === 1 ? 'course' : 'courses'} in the catalog</p>
        </div>
        {canManage && (
          <a href="/teach/builder" className="btn btn-primary">+ New course</a>
        )}
      </header>

      <div className="toolbar">
        <div className="search-wrap">
          <span className="search-icon" aria-hidden>⌕</span>
          <input className="input search" placeholder="Search courses…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input status-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {loading ? (
        <div className="course-grid">
          {[...Array(6)].map((_, i) => <div key={i} className="course-card card skeleton" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-card card">
          <h3>{courses.length === 0 ? 'No courses yet' : 'No matches'}</h3>
          <p className="muted">
            {courses.length === 0
              ? 'Courses created in your organization will appear here.'
              : 'Try a different search or status filter.'}
          </p>
        </div>
      ) : (
        <div className="course-grid">
          {filtered.map((c) => (
            <a key={c.id}
              href={c.is_paid
                ? `/checkout?type=course&id=${c.id}&title=${encodeURIComponent(c.fullname)}`
                : `/courses/${c.id}`}
              className="course-card card card-hover">
              <div className="cover" style={{ background: coverFor(c.id) }}>
                <span className="cover-code">{c.shortname}</span>
              </div>
              <div className="cc-body">
                <div className="cc-top">
                  <span className={`badge ${c.status === 'active' ? 'badge-active' : c.status === 'archived' ? 'badge-overdue' : 'badge-draft'}`}>{c.status}</span>
                  {c.category_name && <span className="cc-cat">{c.category_name}</span>}
                  {c.is_paid
                    ? <span className="price-tag">{c.currency ?? 'KES'} {((c.price_minor ?? 0) / 100).toLocaleString()}</span>
                    : <span className="price-tag free">Free</span>}
                </div>
                <h3 className="cc-name">{c.fullname}</h3>
                <div className="cc-foot">
                  <span className="enrolled">{c.enrolled_count ?? 0} enrolled</span>
                  <span className="view">{c.is_paid ? 'Buy →' : 'View →'}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      <style jsx>{`
        .page-head { margin-bottom: 1.5rem; display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
        .page-head h1 { margin-top: 0.3rem; }
        .sub { margin-top: 0.35rem; font-size: 0.9rem; }
        .toolbar { display: flex; gap: 0.75rem; margin-bottom: 1.75rem; flex-wrap: wrap; }
        .search-wrap { position: relative; flex: 1; min-width: 16rem; }
        .search-icon { position: absolute; left: 0.85rem; top: 50%; transform: translateY(-50%); color: var(--ink-faint); font-size: 1.1rem; }
        .search { width: 100%; padding-left: 2.4rem; }
        .status-select { width: 11rem; }
        .course-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 1.5rem; }
        .course-card { overflow: hidden; display: flex; flex-direction: column; }
        .cover { height: 9rem; position: relative; display: flex; align-items: flex-end; padding: 0.9rem; }
        .cover-code { font-family: var(--mono); font-size: 0.78rem; font-weight: 600; color: rgba(255,255,255,0.92);
          background: rgba(0,0,0,0.22); padding: 0.2rem 0.55rem; border-radius: 6px; backdrop-filter: blur(4px); }
        .cc-body { padding: 1.1rem 1.2rem 1.2rem; display: flex; flex-direction: column; gap: 0.55rem; flex: 1; }
        .cc-top { display: flex; align-items: center; gap: 0.6rem; }
        .cc-cat { font-size: 0.78rem; color: var(--ink-faint); font-weight: 500; }
        .price-tag { margin-left: auto; font-size: 0.8rem; font-weight: 700; color: var(--accent);
          background: var(--accent-soft); padding: 0.15rem 0.55rem; border-radius: 999px; }
        .price-tag.free { color: var(--sage); background: rgba(5,150,105,0.1); }
        .cc-name { font-size: 1.12rem; line-height: 1.25; }
        .cc-foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 0.4rem; }
        .enrolled { font-size: 0.82rem; color: var(--ink-soft); }
        .view { font-size: 0.82rem; color: var(--accent); font-weight: 600; }
        .empty-card { padding: 3rem; text-align: center; }
        .empty-card h3 { margin-bottom: 0.5rem; }
        .skeleton { height: 18rem; background: linear-gradient(90deg, var(--surface-sunken) 25%, #e8ecf3 50%, var(--surface-sunken) 75%);
          background-size: 200% 100%; animation: shimmer 1.4s infinite; border: none; }
        @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
      `}</style>
    </AppShell>
  );
}
