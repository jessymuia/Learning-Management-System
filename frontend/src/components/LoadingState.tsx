'use client';

import styles from '@/styles/shared.module.css';

interface LoadingStateProps {
  message?: string;
  fullScreen?: boolean;
}

/**
 * Shared loading state component.
 * Used while async operations complete.
 */
export default function LoadingState({
  message = 'Loading...',
  fullScreen = false,
}: LoadingStateProps) {
  return (
    <div
      className={`${styles.loadingState} ${
        fullScreen ? styles.loadingStateFullScreen : ''
      }`}
    >
      <div className={styles.spinner} />
      <p>{message}</p>
    </div>
  );
}
