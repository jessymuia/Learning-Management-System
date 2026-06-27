'use client';

import { useEffect, useState } from 'react';
import DynamicSidebar from '@/components/DynamicSidebar';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { api } from '@/lib/api';
import styles from '@/styles/layout.module.css';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

interface DashboardData {
  dashboardType: string;
  role: string;
  navigation: Array<{
    id: string;
    label: string;
    href: string;
    icon: string;
  }>;
}

/**
 * Main application layout with dynamic sidebar.
 * Fetches role-aware navigation from backend.
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true);
        const response = await api.get<DashboardData>('/dashboard');
        setDashboardData(response);
        setError(null);
      } catch (err) {
        setError('Failed to load dashboard');
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className={styles.layout}>
        <LoadingState message="Loading dashboard..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.layout}>
        <EmptyState
          icon="❌"
          title="Failed to load"
          description={error}
        />
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      {/* Mobile toggle */}
      <button
        className={styles.sidebarToggle}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle sidebar"
      >
        ☰
      </button>

      {/* Dynamic sidebar */}
      <aside
        className={`${styles.sidebar} ${
          sidebarOpen ? styles.sidebarOpen : styles.sidebarClosed
        }`}
      >
        <DynamicSidebar
          role={dashboardData?.role}
          onClose={() => setSidebarOpen(false)}
        />
      </aside>

      {/* Main content */}
      <main className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h1>Dashboard</h1>
            <p className={styles.headerMeta}>
              Role: <span className={styles.role}>{dashboardData?.role}</span>
            </p>
          </div>
        </div>

        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
