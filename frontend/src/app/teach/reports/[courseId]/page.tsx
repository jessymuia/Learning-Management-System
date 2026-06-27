'use client';

import { useRequireAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';

interface StudentProgress {
  user_id: string;
  user_email: string;
  user_name: string;
  average_grade: number;
  completion_percent: number;
  submissions_count: number;
  last_activity: string;
}

export default function TeacherReportPage({
  params,
}: {
  params: { courseId: string };
}) {
  useRequireAuth();
  const [students, setStudents] = useState<StudentProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<StudentProgress[]>(`/reports/course/${params.courseId}`)
      .then((res) => setStudents(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [params.courseId]);

  if (loading) return <p>Loading student progress...</p>;

  const sortedStudents = [...students].sort(
    (a, b) => a.average_grade - b.average_grade
  );

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Student Progress Report</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        {students.length} students enrolled
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: '#fff',
          }}
        >
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd', backgroundColor: '#f5f5f5' }}>
              <th style={{ textAlign: 'left', padding: '1rem' }}>Student</th>
              <th style={{ textAlign: 'center', padding: '1rem' }}>Avg Grade</th>
              <th style={{ textAlign: 'center', padding: '1rem' }}>Completion</th>
              <th style={{ textAlign: 'center', padding: '1rem' }}>Submissions</th>
              <th style={{ textAlign: 'left', padding: '1rem' }}>Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {sortedStudents.map((student) => (
              <tr key={student.user_id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '1rem' }}>
                  <div>{student.user_name}</div>
                  <div style={{ fontSize: '0.85rem', color: '#999' }}>
                    {student.user_email}
                  </div>
                </td>
                <td
                  style={{
                    textAlign: 'center',
                    padding: '1rem',
                    color:
                      student.average_grade >= 60
                        ? 'green'
                        : student.average_grade >= 40
                          ? 'orange'
                          : 'red',
                    fontWeight: 'bold',
                  }}
                >
                  {student.average_grade.toFixed(1)}%
                </td>
                <td style={{ textAlign: 'center', padding: '1rem' }}>
                  <div
                    style={{
                      width: '100%',
                      height: '20px',
                      backgroundColor: '#eee',
                      borderRadius: '10px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${student.completion_percent}%`,
                        backgroundColor: '#28a745',
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    {student.completion_percent.toFixed(0)}%
                  </div>
                </td>
                <td style={{ textAlign: 'center', padding: '1rem' }}>
                  {student.submissions_count}
                </td>
                <td style={{ padding: '1rem' }}>
                  {new Date(student.last_activity).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <button
          onClick={() => {
            const csv = [
              ['Student', 'Email', 'Avg Grade', 'Completion %', 'Submissions'],
              ...sortedStudents.map((s) => [
                s.user_name,
                s.user_email,
                s.average_grade.toFixed(1),
                s.completion_percent.toFixed(0),
                s.submissions_count,
              ]),
            ]
              .map((row) => row.join(','))
              .join('\n');

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `course-progress-${params.courseId}.csv`;
            a.click();
          }}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          📥 Export as CSV
        </button>
      </div>
    </div>
  );
}
