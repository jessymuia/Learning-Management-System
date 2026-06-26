'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { api, auth, ApiException, type Discussion } from '@/lib/api';

export default function ForumDetailPage() {
  const ready = useRequireAuth();
  const params = useParams();
  const forumId = String(params.id);
  const [email, setEmail] = useState<string>();
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await api.get<Discussion[]>(`/forums/${forumId}/discussions`).catch(() => []);
    setDiscussions(d);
  }, [forumId]);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try { const me = await auth.me(); setEmail(me.email); await load(); }
      finally { setLoading(false); }
    })();
  }, [ready, load]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/forums/${forumId}/discussions`, { subject, message: { text: message } });
      setSubject(''); setMessage(''); await load();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not post.');
    }
  }

  if (!ready) return null;

  return (
    <AppShell email={email}>
      <a href="/forums" className="back">← Forums</a>
      <header className="page-head"><span className="eyebrow">Forum</span><h1>Discussions</h1></header>

      <form className="new-disc card" onSubmit={post}>
        <h3>Start a discussion</h3>
        <input className="input" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
        <textarea className="input" placeholder="Your message" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} required />
        {error && <div className="alert">{error}</div>}
        <button className="btn btn-primary" type="submit">Post discussion</button>
      </form>

      {loading ? <p className="faint">Loading…</p> : (
        <ul className="disc-list">
          {discussions.map((d) => (
            <li key={d.id} className="disc-row card">
              {d.pinned && <span className="pin" aria-hidden>📌</span>}
              <div><div className="disc-subject">{d.subject}</div>
                <div className="faint" style={{ fontSize: '0.78rem' }}>{new Date(d.created_at).toLocaleString()}</div></div>
              {d.locked && <span className="badge badge-draft">locked</span>}
            </li>
          ))}
        </ul>
      )}
      <style jsx>{`
        .back { font-size: 0.85rem; color: var(--accent); font-weight: 600; display: inline-block; margin-bottom: 1.25rem; }
        .page-head { margin-bottom: 1.5rem; } .page-head h1 { margin-top: 0.3rem; }
        .new-disc { padding: 1.5rem; margin-bottom: 2rem; display: flex; flex-direction: column; gap: 0.75rem; max-width: 36rem; }
        .new-disc h3 { margin-bottom: 0.25rem; }
        .alert { background: rgba(168,68,58,0.09); color: var(--rose); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.85rem; }
        .disc-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
        .disc-row { display: flex; align-items: center; gap: 0.75rem; padding: 1rem 1.25rem; }
        .disc-subject { font-weight: 600; }
      `}</style>
    </AppShell>
  );
}
