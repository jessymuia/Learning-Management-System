'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import LoadingState from '@/components/LoadingState';
import styles from '@/styles/availability.module.css';

interface ActivityAvailabilityProps {
  activityId: string;
  showDetails?: boolean;
}

interface AvailabilityCheck {
  available: boolean;
  reason?: string;
  prerequisites?: string[];
  nextAvailableAt?: string;
}

/**
 * Activity availability indicator.
 * Shows why an activity is locked and what's required to unlock it.
 */
export default function ActivityAvailability({
  activityId,
  showDetails = true,
}: ActivityAvailabilityProps) {
  const [availability, setAvailability] = useState<AvailabilityCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAvailability();
  }, [activityId]);

  const checkAvailability = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/activities/${activityId}/availability`);
      setAvailability(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to check availability');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingState />;

  if (!availability) return null;

  if (availability.available) {
    return (
      <div className={`${styles.indicator} ${styles.available}`}>
        <span className={styles.icon}>✅</span>
        <span className={styles.text}>Activity Available</span>
      </div>
    );
  }

  return (
    <div className={`${styles.indicator} ${styles.unavailable}`}>
      <span className={styles.icon}>🔒</span>
      <div className={styles.content}>
        <p className={styles.reason}>{availability.reason}</p>
        {showDetails && (
          <>
            {availability.prerequisites && availability.prerequisites.length > 0 && (
              <div className={styles.prerequisites}>
                <p className={styles.label}>Complete these first:</p>
                <ul>
                  {availability.prerequisites.map((prereq) => (
                    <li key={prereq}>{prereq}</li>
                  ))}
                </ul>
              </div>
            )}
            {availability.nextAvailableAt && (
              <p className={styles.nextAvailable}>
                Available:{' '}
                {new Date(availability.nextAvailableAt).toLocaleDateString()}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
