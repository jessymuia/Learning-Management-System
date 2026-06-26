'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { api, auth } from '@/lib/api';

type Conversation = { id: string; type: string; title: string | null; created_at: string; unread: number };

export default function MessagesPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me();
        setEmail(me.email);
        const list = await api.get<Conversation[]>('/conversations').catch(() => []);
        setConvos(list);
      } finally {
        setLoading(false);
      }
    })();
  }, [ready]);

  if (!ready) return null;

  return (
    <AppShell email={email}>
      <header className="page-head"><span className="eyebrow">Direct & group</span><h1>Messages</h1></header>
      {loading ? <p className="faint">Loading…</p> : convos.length === 0 ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <h3>No conversations</h3><p className="muted">Messages with peers and instructors appear here.</p>
        </div>
      ) : (
        <ul className="convo-list">
          {convos.map((c) => (
            <li key={c.id} className="convo card">
              <div className="avatar" aria-hidden>{(c.title || c.type)[0].toUpperCase()}</div>
              <div className="convo-main">
                <div className="convo-title">{c.title || (c.type === 'group' ? 'Group conversation' : 'Direct message')}</div>
                <div className="convo-meta faint">{new Date(c.created_at).toLocaleDateString()}</div>
              </div>
              {Number(c.unread) > 0 && <span className="unread">{c.unread}</span>}
            </li>
          ))}
        </ul>
      )}
      <style jsx>{`
        .page-head { margin-bottom: 1.75rem; } .page-head h1 { margin-top: 0.3rem; }
        .convo-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
        .convo { display: flex; align-items: center; gap: 1rem; padding: 0.9rem 1.1rem; }
        .avatar { width: 2.4rem; height: 2.4rem; border-radius: 50%; background: var(--accent); color: #fff;
          display: grid; place-items: center; font-weight: 600; }
        .convo-main { flex: 1; } .convo-title { font-weight: 600; font-size: 0.95rem; }
        .convo-meta { font-size: 0.78rem; margin-top: 0.1rem; }
        .unread { background: var(--accent); color: #fff; font-size: 0.72rem; font-weight: 600;
          min-width: 1.4rem; height: 1.4rem; border-radius: 999px; display: grid; place-items: center; padding: 0 0.4rem; }
      `}</style>
    </AppShell>
  );
}
