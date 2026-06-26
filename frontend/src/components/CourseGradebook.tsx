'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import styles from '@/styles/gradebook.module.css';

interface GradeItem {
  id: string;
  name: string;
  type: 'standard' | 'calculated' | 'category';
  gradeMax: number;
  gradeMin: number;
  userGrade?: number;
  aggregationMethod?: string;
  formula?: string;
  weight?: number;
}

interface CourseGradebookProps {
  courseId: string;
}

/**
 * Course gradebook with calculated items and category aggregations.
 */
export default function CourseGradebook({ courseId }: CourseGradebookProps) {
  const [items, setItems] = useState<GradeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    fetchGradebook();
  }, [courseId]);

  const fetchGradebook = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/grades/course/${courseId}`);
      setItems(response.data.items || []);
      setError(null);
    } catch (err) {
      setError('Failed to load gradebook');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      await api.post(`/api/grades/course/${courseId}/calculate`);
      // Refresh gradebook after recalculation
      setTimeout(() => fetchGradebook(), 2000);
    } catch (err) {
      setError('Failed to recalculate grades');
      console.error(err);
    } finally {
      setRecalculating(false);
    }
  };

  if (loading) return <LoadingState message="Loading gradebook..." />;

  if (error) {
    return (
      <EmptyState icon="❌" title="Failed to load" description={error} />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon="📊"
        title="No grades yet"
        description="Grades will appear here as you complete activities"
      />
    );
  }

  // Calculate overall grade
  const overallGrade = items
    .filter((item) => item.type === 'standard' && item.userGrade !== undefined)
    .reduce((sum, item) => sum + (item.userGrade || 0), 0) / items.length;

  return (
    <div className={styles.gradebook}>
      <div className={styles.header}>
        <h2>Course Grades</h2>
        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className={styles.recalculateBtn}
        >
          {recalculating ? '⌛ Recalculating...' : '🔄 Recalculate'}
        </button>
      </div>

      <div className={styles.overallGrade}>
        <div className={styles.gradeBox}>
          <div className={styles.gradeBig}>
            {isNaN(overallGrade) ? '—' : overallGrade.toFixed(1)}%
          </div>
          <p className={styles.gradeLabel}>Overall Grade</p>
        </div>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Item</th>
            <th>Type</th>
            <th>Grade</th>
            <th>Max</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const percentage =
              item.userGrade !== undefined && item.gradeMax > 0
                ? ((item.userGrade / item.gradeMax) * 100).toFixed(1)
                : '—';

            return (
              <tr key={item.id} className={`${styles.row} ${styles[item.type]}`}>
                <td className={styles.itemName}>
                  <span className={styles.itemType}>
                    {item.type === 'calculated' && '📐'}
                    {item.type === 'category' && '📂'}
                    {item.type === 'standard' && '📝'}
                  </span>
                  {item.name}
                  {item.formula && (
                    <div className={styles.formula}>
                      Formula: {item.formula}
                    </div>
                  )}
                </td>
                <td className={styles.type}>{item.type}</td>
                <td className={styles.grade}>
                  {item.userGrade !== undefined ? item.userGrade.toFixed(1) : '—'}
                </td>
                <td className={styles.max}>{item.gradeMax.toFixed(1)}</td>
                <td className={`${styles.percentage} ${percentage !== '—' && parseFloat(percentage) >= 70 ? styles.pass : styles.fail}`}>
                  {percentage}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
