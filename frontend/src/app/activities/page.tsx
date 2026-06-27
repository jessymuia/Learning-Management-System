'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { auth, api } from '@/lib/api';

type Activity = { id: string; title: string | null; module_type: string; sort_order: number; visible: boolean };

export default function ActivitiesPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me();
        setEmail(me.email);
        const courses = await api.get<{ id: string }[]>('/courses').catch(() => []);
        if (courses.length > 0) {
          const all = await Promise.all(
            courses.slice(0, 5).map(c =>
              api.getRaw<{ data: Activity[] }>(`/courses/${c.id}/modules`).then(r => r.data ?? []).catch(() => [])
            )
          );
          setActivities(all.flat());
        }
      } finally { setLoading(false); }
    })();
  }, [ready]);

  const typeLabel: Record<string, string> = { assign: 'Assignment', quiz: 'Quiz', label: 'Label', resource: 'Resource', lesson: 'Lesson' };

  return (
    <AppShell email={email}>
      <div className="content">
        <div className="page-head">
          <p className="eyebrow">Teaching</p>
          <h1>Activities</h1>
        </div>
        {loading && <p className="muted">Loading activities…</p>}
        {!loading && activities.length === 0 && (
          <div className="empty-state"><div className="icon">⚡</div><h3>No activities yet</h3><p>Course activities will appear here.</p></div>
        )}
        {!loading && activities.length > 0 && (
          <div className="dashboard-table">
            <table>
              <thead><tr><th>Activity</th><th>Type</th><th>Visible</th></tr></thead>
              <tbody>
                {activities.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.title ?? '(untitled)'}</td>
                    <td><span className="badge badge-draft">{typeLabel[a.module_type] ?? a.module_type}</span></td>
                    <td><span className={`badge ${a.visible ? 'badge-active' : 'badge-draft'}`}>{a.visible ? 'Visible' : 'Hidden'}</span></td>
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
