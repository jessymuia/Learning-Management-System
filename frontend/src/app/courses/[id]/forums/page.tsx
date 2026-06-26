'use client';

import { useRequireAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Forum {
  id: string;
  name: string;
  description: string;
  discussion_count: number;
}

export default function ForumsPage({ params }: { params: { id: string } }) {
  const { user } = useRequireAuth();
  const [forums, setForums] = useState<Forum[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/api/forums?courseId=${params.id}`)
      .then((res) => setForums(res.data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <p>Loading forums...</p>;

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Course Forums</h1>
      {forums.length === 0 ? (
        <p>No forums yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {forums.map((forum) => (
            <div
              key={forum.id}
              style={{
                padding: '1rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: '#f9f9f9',
              }}
            >
              <Link href={`/courses/${params.id}/forums/${forum.id}`}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#0066cc' }}>
                  {forum.name}
                </h3>
              </Link>
              <p style={{ margin: '0.5rem 0', color: '#666' }}>
                {forum.description}
              </p>
              <p style={{ margin: '0.5rem 0', fontSize: '0.85rem', color: '#999' }}>
                {forum.discussion_count} discussions
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
