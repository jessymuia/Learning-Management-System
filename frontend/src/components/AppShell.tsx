'use client';
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, BookOpen, GraduationCap, Award, MessageSquare, Users2,
  Calendar, Mail, FileBadge, PenSquare, Layers, ClipboardCheck, UserPlus,
  BarChart3, Settings, Building2, Shield, LogOut, PanelLeftClose, PanelLeftOpen,
  Plug, Moon, Sun, CreditCard, Palette, Bell, type LucideIcon,
} from 'lucide-react';
import { auth } from '@/lib/api';
import './sidebar.css';
import { resolveRole } from '@/lib/roleResolver';

type NavItem = { href: string; label: string; icon: LucideIcon; need?: string };

const ROLE_NAV: Record<string, NavItem[]> = {
  student: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/courses', label: 'My Courses', icon: BookOpen },
    { href: '/assignments', label: 'Assignments', icon: ClipboardCheck },
    { href: '/quizzes', label: 'Quizzes', icon: PenSquare },
    { href: '/grades', label: 'Grades', icon: GraduationCap },
    { href: '/forums', label: 'Forums', icon: MessageSquare },
    { href: '/messages', label: 'Messages', icon: Mail },
    { href: '/credentials', label: 'Certificates', icon: Award },
    { href: '/notifications', label: 'Notifications', icon: Bell },
  ],
  teacher: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/courses', label: 'Assigned Courses', icon: BookOpen },
    { href: '/teach', label: 'Teaching Workspace', icon: PenSquare },
    { href: '/teach/builder', label: 'Lessons & Activities', icon: Layers },
    { href: '/teach/grading', label: 'Grading', icon: ClipboardCheck },
    { href: '/quizzes', label: 'Quizzes', icon: PenSquare },
    { href: '/forums', label: 'Course Forums', icon: MessageSquare },
    { href: '/messages', label: 'Messages', icon: Mail },
    { href: '/reports', label: 'Reports', icon: BarChart3 },
  ],
  manager: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/people', label: 'People', icon: Users2 },
    { href: '/admin/programs', label: 'Programs & Courses', icon: Layers },
    { href: '/courses', label: 'Courses', icon: BookOpen },
    { href: '/payments', label: 'Payments', icon: CreditCard },
    { href: '/reports', label: 'Reports', icon: BarChart3 },
    { href: '/forums', label: 'Forums', icon: MessageSquare },
    { href: '/messages', label: 'Messages', icon: Mail },
  ],
};

const SUPERADMIN_NAV: NavItem[] = [
  { href: '/operator', label: 'Super Admin', icon: Shield },
  { href: '/admin/integrations', label: 'Integrations', icon: Plug },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/account', label: 'Account', icon: Settings },
];

const GROUPS = [
  { label: null, hrefs: ['/dashboard', '/courses', '/programs', '/grades', '/credentials', '/payments'] },
  { label: 'Community', hrefs: ['/forums', '/groups', '/calendar', '/messages', '/notifications'] },
  { label: 'Teaching', hrefs: ['/teach', '/teach/builder', '/teach/quiz', '/teach/grading', '/teach/enrolments'] },
  { label: 'Administration', hrefs: ['/admin', '/admin/people', '/admin/programs', '/admin/integrations', '/admin/branding', '/reports'] },
  { label: null, hrefs: ['/account'] },
];

export function AppShell({ children, email }: { children: React.ReactNode; email?: string; isSuperAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [perms, setPerms] = useState<string[]>([]);
  const [role, setRole] = useState<string>('student');
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    auth.me().then((m) => {
      setIsAdmin(!!m.isSuperAdmin);
      setPerms(m.permissions ?? []);
      setRole(resolveRole({ roles: m.roles ?? [], isSuperAdmin: m.isSuperAdmin, permissions: m.permissions ?? [] }));
    }).catch(() => {});
  }, []);

  // Load this tenant's white-label branding and apply its colors as CSS tokens,
  // so every component using var(--accent)/var(--sage) picks up the org's palette.
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

  const available = isAdmin ? SUPERADMIN_NAV : (ROLE_NAV[role] ?? ROLE_NAV.student);

  const groups = [{ label: null as string | null, items: available }];

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
