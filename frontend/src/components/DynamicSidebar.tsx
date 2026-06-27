'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import {
  LayoutDashboard, Users, Building2, Shield, CreditCard,
  BarChart3, ScrollText, Settings, Plug, GraduationCap,
  BookOpen, Layers, CheckCircle, UserCheck, HelpCircle,
  Award, MessageSquare, Mail, Activity, ClipboardCheck,
  type LucideIcon,
} from 'lucide-react';

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

const ICON_MAP: Record<string, LucideIcon> = {
  grid: LayoutDashboard,
  users: Users,
  building: Building2,
  shield: Shield,
  'credit-card': CreditCard,
  'bar-chart': BarChart3,
  log: ScrollText,
  cog: Settings,
  plug: Plug,
  'user-tie': GraduationCap,
  book: BookOpen,
  layers: Layers,
  'check-circle': CheckCircle,
  'user-check': UserCheck,
  tasks: ClipboardCheck,
  'help-circle': HelpCircle,
  award: Award,
  ribbon: Award,
  'message-square': MessageSquare,
  mail: Mail,
  activity: Activity,
  'clipboard-check': ClipboardCheck,
};

export default function DynamicSidebar({ role, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [items, setItems] = useState<NavigationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNavigation = async () => {
      try {
        setLoading(true);
        const response = await api.get<{ items?: NavigationItem[] }>('/navigation');
        setItems(response.items || []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    fetchNavigation();
  }, [role]);

  if (loading) {
    return (
      <nav className="dyn-sidebar">
        <div className="dyn-loading">
          <div className="dyn-spinner" />
        </div>
      </nav>
    );
  }

  return (
    <nav className="dyn-sidebar">
      <ul className="dyn-list">
        {items.map((item) => {
          const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href + '/'));
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className={active ? 'dyn-item is-active' : 'dyn-item'}
                onClick={() => onClose?.()}
              >
                <Icon size={17} className="dyn-icon" />
                <span className="dyn-label">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <style jsx>{`
        .dyn-sidebar { background: var(--surface); }
        .dyn-loading { display: flex; justify-content: center; padding: 2rem; }
        .dyn-spinner { width: 28px; height: 28px; border: 3px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .dyn-list { list-style: none; padding: 0.5rem; margin: 0; }
        .dyn-item { display: flex; align-items: center; gap: 0.7rem; padding: 0.6rem 0.8rem; margin: 0.15rem 0; border-radius: 9px; text-decoration: none; color: var(--ink-soft); font-size: 0.9rem; font-weight: 500; transition: background 0.14s ease, color 0.14s ease; }
        .dyn-item:hover { background: var(--surface-sunken); color: var(--ink); }
        .dyn-item.is-active { background: var(--accent-soft); color: var(--accent-deep); font-weight: 600; }
        .dyn-icon { flex-shrink: 0; color: var(--ink-faint); }
        .dyn-item:hover .dyn-icon { color: var(--ink-soft); }
        .dyn-item.is-active .dyn-icon { color: var(--accent); }
        .dyn-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>
    </nav>
  );
}
