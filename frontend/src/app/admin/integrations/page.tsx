'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import styles from '@/styles/admin.module.css';

interface Integration {
  id: string;
  provider: string;
  name: string;
  category: string;
  icon: string;
  environment: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AvailableIntegration {
  provider: string;
  name: string;
  category: string;
  icon: string;
  fields: string[];
}

/**
 * Integrations management UI.
 * SUPER_ADMIN only.
 */
export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [available, setAvailable] = useState<AvailableIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    try {
      setLoading(true);
      const data = await api.get<{
        integrations?: Integration[];
        available?: AvailableIntegration[];
      }>('/admin/integrations');
      setIntegrations(data.integrations || []);
      setAvailable(data.available || []);
      const response = await api.get('/api/admin/integrations');
      setIntegrations(response.data.integrations || []);
      setAvailable(response.data.available || []);
      setError(null);
    } catch (err) {
      setError('Failed to load integrations');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async (provider: string) => {
    try {
      setTestingProvider(provider);

      const response = await api.post(`/api/admin/integrations/${provider}/test`);
      setTestResult({ provider, ...response.data });

    } catch (err) {
      setTestResult({ provider, success: false, message: 'Test failed' });
    } finally {
      setTestingProvider(null);
    }
  };

  const groupedByCategory = available.reduce((acc, int) => {
    if (!acc[int.category]) acc[int.category] = [];
    acc[int.category].push(int);
    return acc;
  }, {} as Record<string, AvailableIntegration[]>);

  if (loading) return <LoadingState />;

  if (error) {
    return (
      <EmptyState
        icon="❌"
        title="Failed to load integrations"
        description={error}
      />
    );
  }

  return (
    <div className={styles.integrationsPage}>

      <h1>Integrations Management</h1>

      <p className={styles.subtitle}>
        Configure payment, email, SMS, storage, and authentication providers.
      </p>

      {/* Active Integrations */}
      <section className={styles.section}>
        <h2>Active Integrations</h2>
        {integrations.length === 0 ? (
          <EmptyState
            icon="🔌"
            title="No integrations configured"
            description="Add an integration to get started"
          />
        ) : (
          <div className={styles.integrationsList}>
            {integrations.map((int) => (
              <div key={int.id} className={styles.integrationCard}>
                <div className={styles.integrationHeader}>
                  <span className={styles.integrationIcon}>{int.icon}</span>
                  <div>
                    <h3>{int.name}</h3>
                    <p className={styles.provider}>{int.provider}</p>
                  </div>
                  <span
                    className={`${styles.badge} ${
                      int.isActive ? styles.badgeActive : styles.badgeInactive
                    }`}
                  >
                    {int.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className={styles.integrationActions}>
                  <button
                    onClick={() => handleTestConnection(int.provider)}
                    disabled={testingProvider === int.provider}
                    className={styles.buttonSecondary}
                  >
                    {testingProvider === int.provider ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button className={styles.buttonSecondary}>Edit</button>
                  <button className={styles.buttonDanger}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Test Result */}
      {testResult && (
        <section className={styles.section}>
          <h2>Test Result</h2>
          <div
            className={`${styles.testResult} ${
              testResult.success
                ? styles.testResultSuccess
                : styles.testResultError
            }`}
          >
            <p>{testResult.message}</p>
          </div>
        </section>
      )}

      {/* Available Integrations */}
      <section className={styles.section}>
        <h2>Available Integrations</h2>
        {Object.entries(groupedByCategory).map(([category, items]) => (
          <div key={category} className={styles.categorySection}>
            <h3 className={styles.categoryTitle}>
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </h3>
            <div className={styles.integrationGrid}>
              {items.map((int) => (
                <div key={int.provider} className={styles.integrationOption}>
                  <div className={styles.optionIcon}>{int.icon}</div>
                  <h4>{int.name}</h4>
                  <p className={styles.optionDescription}>
                    {int.fields.length} fields to configure
                  </p>
                  <button
                    onClick={() => setSelectedProvider(int.provider)}
                    className={styles.buttonPrimary}
                  >
                    Configure
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
