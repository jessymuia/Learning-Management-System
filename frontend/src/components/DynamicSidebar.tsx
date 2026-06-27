'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import styles from '@/styles/shared.module.css';

interface NavigationItem {
  id: string;
  label: string;
  href: string;
  icon: string;
}

interface SidebarProps {
  role?: string;
  onClose?: () => void;
}

/**
 * Dynamic sidebar component.
 * Fetches navigation structure from backend based on user role.
 * No hardcoded menu items — entirely data-driven.
 */
export default function DynamicSidebar({ role, onClose }: SidebarProps) {
  const [items, setItems] = useState<NavigationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string>('dashboard');

  useEffect(() => {
    const fetchNavigation = async () => {
      try {
        setLoading(true);
        const response = await api.get('/api/navigation');
        setItems(response.data.items || []);
        setError(null);
      } catch (err) {
        setError('Failed to load navigation');
        console.error('Navigation fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchNavigation();
  }, [role]);

  if (loading) {
    return (
      <div className={styles.sidebar}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p>Loading menu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.sidebar}>
        <div className={styles.emptyState}>
          <p>⚠️ {error}</p>
        </div>
      </div>
    );
  }

  return (
    <nav className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <h2>Menu</h2>
      </div>

      <ul className={styles.navList}>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={item.href}
              className={`${styles.navItem} ${
                activeId === item.id ? styles.active : ''
              }`}
              onClick={() => {
                setActiveId(item.id);
                onClose?.();
              }}
            >
              <span className={styles.icon}>
                {getIconEmoji(item.icon)}
              </span>
              <span className={styles.label}>{item.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Map icon names to emoji for simple rendering.
 * In production, use a proper icon library (lucide-react, heroicons, etc.)
 */
function getIconEmoji(icon: string): string {
  const iconMap: Record<string, string> = {
    grid: '📊',
    users: '👥',
    building: '🏢',
    shield: '🛡️',
    'credit-card': '💳',
    'bar-chart': '📈',
    log: '📋',
    cog: '⚙️',
    plug: '🔌',
    'user-tie': '👔',
    book: '📚',
    layers: '📦',
    'check-circle': '✅',
    'user-check': '👤✅',
    tasks: '✓',
    'help-circle': '❓',
    award: '🏆',
    ribbon: '🎖️',
    'message-square': '💬',
    mail: '📧',
    activity: '🔍',
    'clipboard-check': '📝✅',
  };

  return iconMap[icon] || '•';
}
