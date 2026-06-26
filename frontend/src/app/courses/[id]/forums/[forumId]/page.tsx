'use client';

import { useRequireAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Discussion {
  id: string;
  title: string;
  creator_name: string;
  post_count: number;
  created_at: string;
}

export default function ForumPage({
  params,
}: {
  params: { id: string; forumId: string };
}) {
  const { user } = useRequireAuth();
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    api
      .get(`/api/forums/${params.forumId}/discussions`)
      .then((res) => setDiscussions(res.data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [params.forumId]);

  const handleNewDiscussion = async () => {
    if (!newTitle.trim()) return;
    try {
      setPosting(true);
      await api.post(`/api/forums/${params.forumId}/discussions`, {
        title: newTitle,
      });
      setNewTitle('');
      // Refresh discussions
      const res = await api.get(`/api/forums/${params.forumId}/discussions`);
      setDiscussions(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setPosting(false);
    }
  };

  if (loading) return <p>Loading discussions...</p>;

  return (
    <div style={{ padding: '2rem' }}>
      <Link href={`/courses/${params.id}/forums`}>
        ← Back to Forums
      </Link>

      <h1>Discussions</h1>

      <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
        <h3>Start a new discussion</h3>
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Discussion title..."
          style={{
            width: '100%',
            padding: '0.5rem',
            marginBottom: '0.5rem',
            borderRadius: '4px',
            border: '1px solid #ddd',
          }}
        />
        <button
          onClick={handleNewDiscussion}
          disabled={posting || !newTitle.trim()}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: posting ? 'not-allowed' : 'pointer',
          }}
        >
          {posting ? 'Posting...' : 'Post'}
        </button>
      </div>

      {discussions.length === 0 ? (
        <p>No discussions yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {discussions.map((discussion) => (
            <Link
              key={discussion.id}
              href={`/courses/${params.id}/forums/${params.forumId}/discussions/${discussion.id}`}
            >
              <div
                style={{
                  padding: '1rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  transition: 'backgroundColor 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#fff')}
              >
                <h4 style={{ margin: '0 0 0.5rem 0' }}>{discussion.title}</h4>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: '#666' }}>
                  Started by {discussion.creator_name} •{' '}
                  {new Date(discussion.created_at).toLocaleDateString()} • {discussion.post_count} posts
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
