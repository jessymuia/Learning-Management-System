'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import styles from '@/styles/admin.module.css';

interface Settings {
  general: Record<string, any>;
  security: Record<string, any>;
  email: Record<string, any>;
  storage: Record<string, any>;
  backup: Record<string, any>;
  notifications: Record<string, any>;
}

/**
 * System Settings UI.
 * SUPER_ADMIN only.
 */
export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<keyof Settings>('general');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get<Settings>('/admin/settings');
      setSettings(response);
      setError(null);
    } catch (err) {
      setError('Failed to load settings');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (section: keyof Settings, data: Record<string, any>) => {
    try {
      setSaving(true);
      await api.put(`/api/admin/settings/${section}`, data);
      setSettings((prev) => (prev ? { ...prev, [section]: data } : null));
    } catch (err) {
      setError('Failed to save settings');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState />;
  if (!settings) return <EmptyState title="Settings not available" />;

  return (
    <div className={styles.settingsPage}>
      <h1 className={styles.pageTitle}>System Settings</h1>
      <p className={styles.subtitle}>
        Configure platform-wide settings for security, email, storage, and more.
      </p>

      {/* Tabs */}
      <div className={styles.tabs}>
        {(Object.keys(settings) as (keyof Settings)[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`${styles.tab} ${
              activeTab === tab ? styles.tabActive : ''
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className={styles.tabContent}>
        <SettingsForm
          section={activeTab}
          data={settings[activeTab]}
          onSave={(data) => handleSaveSettings(activeTab, data)}
          saving={saving}
        />
      </div>
    </div>
  );
}

function SettingsForm({
  section,
  data,
  onSave,
  saving,
}: {
  section: string;
  data: Record<string, any>;
  onSave: (data: Record<string, any>) => void;
  saving: boolean;
}) {
  const [formData, setFormData] = useState(data);

  const handleChange = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(formData);
      }}
      className={styles.form}
    >
      {Object.entries(formData).map(([key, value]) => (
        <div key={key} className={styles.formGroup}>
          <label htmlFor={key} className={styles.label}>
            {key.replace(/([A-Z])/g, ' $1').trim()}
          </label>
          {typeof value === 'boolean' ? (
            <input
              id={key}
              type="checkbox"
              checked={value}
              onChange={(e) => handleChange(key, e.target.checked)}
            />
          ) : typeof value === 'number' ? (
            <input
              id={key}
              type="number"
              value={value}
              onChange={(e) => handleChange(key, parseInt(e.target.value))}
            />
          ) : (
            <input
              id={key}
              type="text"
              value={value}
              onChange={(e) => handleChange(key, e.target.value)}
            />
          )}
        </div>
      ))}

      <button type="submit" className={styles.buttonPrimary} disabled={saving}>
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </form>
  );
}
