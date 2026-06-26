'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { api, auth } from '@/lib/api';

type Event = { id: string; scope: string; name: string; description: string | null; start_at: string; end_at: string | null };

export default function CalendarPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me();
        setEmail(me.email);
        const list = await api.get<Event[]>('/calendar').catch(() => []);
        setEvents(list);
      } finally {
        setLoading(false);
      }
    })();
  }, [ready]);

  if (!ready) return null;
  const fmt = (d: string) => new Date(d).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <AppShell email={email}>
      <header className="page-head"><span className="eyebrow">Schedule</span><h1>Calendar</h1></header>
      {loading ? <p className="faint">Loading…</p> : events.length === 0 ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <h3>Nothing scheduled</h3><p className="muted">Course deadlines and events will appear here.</p>
        </div>
      ) : (
        <ul className="agenda">
          {events.map((e) => (
            <li key={e.id} className="event card">
              <div className="when"><span className="day">{new Date(e.start_at).getDate()}</span>
                <span className="mon">{new Date(e.start_at).toLocaleString(undefined, { month: 'short' })}</span></div>
              <div className="what">
                <div className="ev-name">{e.name}</div>
                <div className="ev-time faint">{fmt(e.start_at)}</div>
                {e.description && <div className="ev-desc muted">{e.description}</div>}
              </div>
              <span className={`badge ${e.scope === 'course' ? 'badge-active' : 'badge-draft'}`}>{e.scope}</span>
            </li>
          ))}
        </ul>
      )}
      <style jsx>{`
        .page-head { margin-bottom: 1.75rem; } .page-head h1 { margin-top: 0.3rem; }
        .agenda { list-style: none; display: flex; flex-direction: column; gap: 0.75rem; }
        .event { display: flex; align-items: center; gap: 1.25rem; padding: 1rem 1.25rem; }
        .when { text-align: center; min-width: 3rem; }
        .day { display: block; font-family: var(--serif); font-size: 1.6rem; font-weight: 600; color: var(--accent); line-height: 1; }
        .mon { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-faint); }
        .what { flex: 1; } .ev-name { font-weight: 600; } .ev-time { font-size: 0.8rem; margin-top: 0.1rem; }
        .ev-desc { font-size: 0.85rem; margin-top: 0.25rem; }
      `}</style>
    </AppShell>
  );
}
