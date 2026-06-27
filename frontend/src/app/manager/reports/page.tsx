'use client';

import { useRequireAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';

interface TenantOverview {
  total_students: number;
  total_teachers: number;
  total_courses: number;
  total_programs: number;
  completed_courses: number;
  revenue_total: number;
  completion_rate: number;
  active_enrollments: number;
}

export default function ManagerReportsPage() {
  useRequireAuth();
  const [data, setData] = useState<TenantOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<TenantOverview>(`/reports/tenant`)
      .then((res) => setData(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading reports...</p>;
  if (!data) return <p>No data available</p>;

  const stats = [
    { label: 'Students', value: data.total_students },
    { label: 'Teachers', value: data.total_teachers },
    { label: 'Active Courses', value: data.total_courses },
    { label: 'Programs', value: data.total_programs },
    { label: 'Completion Rate', value: `${data.completion_rate.toFixed(1)}%` },
    { label: 'Revenue (KES)', value: `${(data.revenue_total / 100).toLocaleString()}` },
  ];

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Organization Reports</h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: '1.5rem',
              backgroundColor: '#f0f0f0',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: '0 0 0.5rem 0', color: '#666', fontSize: '0.9rem' }}>
              {stat.label}
            </p>
            <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#333' }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h2>Quick Links</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ marginBottom: '0.5rem' }}>
            <a href="/manager/reports/payments" style={{ color: '#0066cc', textDecoration: 'none' }}>
              📊 Payment Report
            </a>
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <a href="/manager/reports/at-risk" style={{ color: '#0066cc', textDecoration: 'none' }}>
              ⚠️ At-Risk Learners
            </a>
          </li>
          <li>
            <a href="/manager/reports/completions" style={{ color: '#0066cc', textDecoration: 'none' }}>
              ✅ Completion Analytics
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
