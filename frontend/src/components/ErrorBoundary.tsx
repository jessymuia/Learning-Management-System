'use client';

import { ReactNode, useEffect, useState } from 'react';
import styles from '@/styles/shared.module.css';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: { componentStack: string }) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component.
 * Catches and displays errors gracefully.
 */
export default function ErrorBoundary({
  children,
  fallback,
  onError,
}: ErrorBoundaryProps) {
  const [state, setState] = useState<ErrorBoundaryState>({
    hasError: false,
    error: null,
  });

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setState({
        hasError: true,
        error: event.error,
      });
      onError?.(event.error, { componentStack: '' });
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, [onError]);

  if (state.hasError) {
    return (
      <div className={styles.errorState}>
        <div className={styles.errorIcon}>⚠️</div>
        <h2 className={styles.errorTitle}>Something went wrong</h2>
        <p className={styles.errorMessage}>
          {state.error?.message || 'An unexpected error occurred'}
        </p>
        {fallback}
        <button
          onClick={() => setState({ hasError: false, error: null })}
          className={styles.button}
        >
          Try again
        </button>
      </div>
    );
  }

  return children;
}
