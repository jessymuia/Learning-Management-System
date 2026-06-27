'use client';
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, BookOpen, GraduationCap, Award, MessageSquare, Users2,
  Mail, PenSquare, Layers, ClipboardCheck, BarChart3,
  Settings, Building2, Shield, LogOut, PanelLeftClose, PanelLeftOpen,
  Plug, Moon, Sun, CreditCard, Bell, UserCircle, ScrollText, Landmark,
  ActivitySquare, ClipboardList, Users, type LucideIcon,
} from 'lucide-react';
import { auth } from '@/lib/api';
import './sidebar.css';
import { resolveRole } from '@/lib/roleResolver';

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { label: string | null; items: NavItem[] };

const ADMIN_NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Platform Management',
    items: [
      { href: '/admin/organizations', label: 'Organizations', icon: Building2 },
      { href: '/admin/users', label: 'Users', icon: Users2 },
      { href: '/admin/roles', label: 'Roles & Permissions', icon: Shield },
      { href: '/admin/tenants', label: 'Tenants', icon: Landmark },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/reports', label: 'Reports', icon: BarChart3 },
      { href: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText },
      { href: '/admin/billing', label: 'Billing', icon: CreditCard },
      { href: '/admin/integrations', label: 'Integrations', icon: Plug },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/settings', label: 'Settings', icon: Settings },
      { href: '/account', label: 'Account', icon: UserCircle },
    ],
  },
];

const MANAGER_NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Management',
    items: [
      { href: '/admin/people', label: 'People', icon: Users2 },
      { href: '/teachers', label: 'Teachers', icon: GraduationCap },
      { href: '/students', label: 'Students', icon: Users },
      { href: '/admin/programs', label: 'Programs', icon: Layers },
      { href: '/courses', label: 'Courses', icon: BookOpen },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/payments', label: 'Payments', icon: CreditCard },
      { href: '/reports', label: 'Reports', icon: BarChart3 },
      { href: '/forums', label: 'Forums', icon: MessageSquare },
      { href: '/messages', label: 'Messages', icon: Mail },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/settings', label: 'Organization Settings', icon: Settings },
    ],
  },
];

const TEACHER_NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Teaching',
    items: [
      { href: '/courses', label: 'My Courses', icon: BookOpen },
      { href: '/lessons', label: 'Lessons', icon: Layers },
      { href: '/activities', label: 'Activities', icon: ActivitySquare },
      { href: '/assignments', label: 'Assignments', icon: ClipboardList },
      { href: '/quizzes', label: 'Quizzes', icon: PenSquare },
      { href: '/grading', label: 'Grading', icon: ClipboardCheck },
      { href: '/students', label: 'Students', icon: Users },
    ],
  },
  {
    label: 'Communication',
    items: [
      { href: '/forums', label: 'Course Forums', icon: MessageSquare },
      { href: '/messages', label: 'Messages', icon: Mail },
    ],
  },
  {
    label: null,
    items: [
      { href: '/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
];

const STUDENT_NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Learning',
    items: [
      { href: '/courses', label: 'My Courses', icon: BookOpen },
      { href: '/lessons', label: 'Lessons', icon: Layers },
      { href: '/assignments', label: 'Assignments', icon: ClipboardList },
      { href: '/quizzes', label: 'Quizzes', icon: PenSquare },
      { href: '/grades', label: 'Grades', icon: GraduationCap },
      { href: '/credentials', label: 'Certificates', icon: Award },
    ],
  },
  {
    label: 'Community',
    items: [
      { href: '/forums', label: 'Forums', icon: MessageSquare },
      { href: '/messages', label: 'Messages', icon: Mail },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/account', label: 'Profile', icon: UserCircle },
      { href: '/notifications', label: 'Notifications', icon: Bell },
    ],
  },
];

const ROLE_GROUPS: Record<string, NavGroup[]> = {
  admin: ADMIN_NAV,
  manager: MANAGER_NAV,
  teacher: TEACHER_NAV,
  student: STUDENT_NAV,
};

export function AppShell({ children, email }: { children: React.ReactNode; email?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string>('student');
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    auth.me().then((m) => {
      const resolved = resolveRole({ roles: m.roles ?? [], isSuperAdmin: m.isSuperAdmin, permissions: m.permissions ?? [] });
      setRole(resolved);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    import('@/lib/api').then(({ branding }) => {
      branding.mine().then((b) => {
        if (b.primaryColor) document.documentElement.style.setProperty('--accent', b.primaryColor);
        if (b.accentColor) document.documentElement.style.setProperty('--sage', b.accentColor);
      }).catch(() => {});
    });
  }, []);

  useEffect(() => {
    const saved = typeof window !== 'undefined' && window.localStorage.getItem('theme') === 'dark';
    setDark(saved);
    document.documentElement.setAttribute('data-theme', saved ? 'dark' : 'light');
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    try { window.localStorage.setItem('theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
  }

  const roleLabel = role === 'admin' ? 'System Admin'
    : role === 'manager' ? 'Manager'
    : role === 'teacher' ? 'Teacher'
    : 'Student';

  const groups: NavGroup[] = ROLE_GROUPS[role] ?? STUDENT_NAV;
  const initial = (email || '?').charAt(0).toUpperCase();

  function signOut() { auth.logout(); router.replace('/login'); }

  return (
    <div className="app-shell">
      <aside className={collapsed ? 'app-sidebar is-collapsed' : 'app-sidebar'}>
        <div className="app-brand-row">
          {!collapsed ? (
            <div className="app-brand">
              <div className="app-brand-mark"><GraduationCap size={18} /></div>
              <div className="app-brand-text">
                <span className="app-brand-name">Atrium</span>
                <span className="app-brand-sub">LMS Platform</span>
              </div>
            </div>
          ) : (
            <div className="app-brand-mark"><GraduationCap size={18} /></div>
          )}
          <button className="app-collapse-btn" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar">
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <nav className="app-nav">
          {groups.map((group, gi) => (
            <div className="app-nav-group" key={gi}>
              {group.label && !collapsed && <div className="app-nav-group-label">{group.label}</div>}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
                return (
                  <Link key={item.href} href={item.href}
                    className={active ? 'app-nav-link is-active' : 'app-nav-link'} title={collapsed ? item.label : undefined}>
                    <Icon size={18} className="app-nav-icon" />
                    {!collapsed && <span className="app-nav-text">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="app-foot">
          <button className="app-theme-toggle" onClick={toggleTheme} title={dark ? 'Light mode' : 'Dark mode'}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}
            {!collapsed && <span>{dark ? 'Light mode' : 'Dark mode'}</span>}
          </button>
          <div className="app-identity">
            <div className="app-avatar">{initial}</div>
            {!collapsed && (
              <div className="app-identity-text">
                <div className="app-who" title={email}>{email}</div>
                <div className="app-role-badge">{roleLabel}</div>
              </div>
            )}
          </div>
          <button className="app-signout" onClick={signOut} title="Sign out">
            <LogOut size={16} />{!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      <main className="app-content">{children}</main>
    </div>
  );
}
