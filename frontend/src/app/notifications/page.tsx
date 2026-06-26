'use client';
import { useEffect, useState, Fragment } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { Card, EmptyState, Skeleton, Button } from '@/components/ui';
import { auth, notifications as notifApi, notificationPrefs as prefsApi, type Notification, type NotifPrefs } from '@/lib/api';
import { Bell, BellRing, CheckCheck, BookOpen, ClipboardCheck, CreditCard, MessageSquare, Award, Settings } from 'lucide-react';

// map a notification type-key to an icon + readable label
function meta(type: string): { icon: typeof Bell; label: string } {
  if (type.includes('assignment') || type.includes('due')) return { icon: ClipboardCheck, label: 'Assignment' };
  if (type.includes('payment') || type.includes('order')) return { icon: CreditCard, label: 'Payment' };
  if (type.includes('course') || type.includes('enrol')) return { icon: BookOpen, label: 'Course' };
  if (type.includes('message') || type.includes('forum')) return { icon: MessageSquare, label: 'Message' };
  if (type.includes('credential') || type.includes('certificate')) return { icon: Award, label: 'Credential' };
  return { icon: Bell, label: 'Notification' };
}

function title(n: Notification): string {
  const p = n.payload as Record<string, unknown>;
  return (p.title as string) || (p.message as string) || n.type.replace(/[._]/g, ' ');
}

export default function NotificationsPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me(); setEmail(me.email);
        setItems(await notifApi.list().catch(() => []));
        setPrefs(await prefsApi.get().catch(() => null));
      } finally { setLoading(false); }
    })();
  }, [ready]);

  async function markRead(id: string) {
    await notifApi.markRead(id).catch(() => {});
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
  }
  async function markAll() {
    const unread = items.filter((n) => !n.read_at);
    await Promise.all(unread.map((n) => notifApi.markRead(n.id).catch(() => {})));
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  }

  async function togglePref(key: string) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    await prefsApi.save(next).catch(() => {});
  }

  if (!ready) return null;
  const unreadCount = items.filter((n) => !n.read_at).length;

  return (
    <AppShell email={email}>
      <header className="page-head head-row">
        <div>
          <span className="eyebrow">Activity</span>
          <h1>Notifications {unreadCount > 0 && <span className="count">{unreadCount}</span>}</h1>
          <p className="muted">Course updates, deadlines, payments, and messages.</p>
        </div>
        <div className="head-actions">
          <Button variant="ghost" onClick={() => setShowSettings(!showSettings)}><Settings size={16} /> Settings</Button>
          {unreadCount > 0 && <Button variant="ghost" onClick={markAll}><CheckCheck size={16} /> Mark all read</Button>}
        </div>
      </header>

      {showSettings && prefs && (
        <Card className="prefs-card">
          <h3>Notification preferences</h3>
          <p className="muted small">Choose what you're notified about, and how.</p>
          <div className="prefs-grid">
            <div className="prefs-col-head"></div>
            <div className="prefs-col-head">Email</div>
            <div className="prefs-col-head">In-app</div>
            {[['assignments','Assignments & deadlines'],['payments','Payments & receipts'],['courses','Course updates'],['forums','Forum replies']].map(([key,label]) => (
              <Fragment key={key}>
                <div className="prefs-row-label">{label}</div>
                <label className="prefs-toggle"><input type="checkbox" checked={!!prefs[`email_${key}`]} onChange={() => togglePref(`email_${key}`)} /></label>
                <label className="prefs-toggle"><input type="checkbox" checked={!!prefs[`inapp_${key}`]} onChange={() => togglePref(`inapp_${key}`)} /></label>
              </Fragment>
            ))}
          </div>
        </Card>
      )}

      {loading ? <Skeleton height="14rem" /> : items.length === 0 ? (
        <Card><EmptyState icon={<Bell size={36} />} title="No notifications" body="You're all caught up. Updates will appear here." /></Card>
      ) : (
        <div className="notif-list">
          {items.map((n) => {
            const m = meta(n.type);
            const Icon = n.read_at ? m.icon : BellRing;
            return (
              <Card key={n.id} className={n.read_at ? 'notif' : 'notif unread'}>
                <div className="notif-icon"><Icon size={18} /></div>
                <div className="notif-body">
                  <div className="notif-top">
                    <span className="notif-cat">{m.label}</span>
                    <span className="notif-time">{new Date(n.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="notif-title">{title(n)}</div>
                </div>
                {!n.read_at && <button className="mark-btn" onClick={() => markRead(n.id)} title="Mark as read">Mark read</button>}
              </Card>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .head-actions { display: flex; gap: 0.5rem; }
        :global(.prefs-card) { padding: 1.4rem; margin-bottom: 1.5rem; }
        :global(.prefs-card) h3 { font-size: 1rem; margin-bottom: 0.25rem; }
        .prefs-grid { display: grid; grid-template-columns: 1fr auto auto; gap: 0.5rem 1.5rem; align-items: center; margin-top: 1rem; }
        .prefs-col-head { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-faint); text-align: center; }
        .prefs-row-label { font-size: 0.9rem; color: var(--ink); }
        .prefs-toggle { display: flex; justify-content: center; cursor: pointer; }
        .prefs-toggle input { width: 1.1rem; height: 1.1rem; accent-color: var(--accent); cursor: pointer; }
        .small { font-size: 0.85rem; }
        .page-head { margin-bottom: 1.75rem; }
        .page-head h1 { margin-top: 0.3rem; display: flex; align-items: center; gap: 0.6rem; }
        .head-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
        .count { font-size: 0.85rem; background: var(--accent); color: #fff; border-radius: 999px; padding: 0.1rem 0.6rem; font-weight: 700; }
        .notif-list { display: flex; flex-direction: column; gap: 0.6rem; }
        :global(.notif) { display: flex; align-items: flex-start; gap: 0.85rem; padding: 1rem 1.1rem; }
        :global(.notif.unread) { border-left: 3px solid var(--accent); background: var(--accent-soft); }
        .notif-icon { width: 2.3rem; height: 2.3rem; border-radius: 9px; background: var(--surface-sunken); color: var(--accent);
          display: grid; place-items: center; flex-shrink: 0; }
        :global(.notif.unread) .notif-icon { background: var(--accent); color: #fff; }
        .notif-body { flex: 1; min-width: 0; }
        .notif-top { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.2rem; }
        .notif-cat { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--accent); }
        .notif-time { font-size: 0.76rem; color: var(--ink-faint); }
        .notif-title { font-size: 0.92rem; color: var(--ink); text-transform: capitalize; }
        .mark-btn { background: none; border: none; color: var(--accent); font-size: 0.8rem; font-weight: 600; cursor: pointer; flex-shrink: 0; }
        .mark-btn:hover { text-decoration: underline; }
      `}</style>
    </AppShell>
  );
}
