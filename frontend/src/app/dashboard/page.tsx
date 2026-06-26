'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { Skeleton } from '@/components/ui';
import { auth } from '@/lib/api';
import { StudentDashboard } from '@/components/dashboards/StudentDashboard';
import { TeacherDashboard } from '@/components/dashboards/TeacherDashboard';
import { ManagerDashboard } from '@/components/dashboards/ManagerDashboard';
import { SystemAdminDashboard } from '@/components/dashboards/SystemAdminDashboard';
import { resolveRole } from '@/lib/roleResolver';

/**
 * Dashboard router — picks a role-specific dashboard based on the signed-in
 * user's permissions. Each role gets its own data-rich experience:
 *   System Admin → all tenants, users, system reports, billing, settings
 *   Tenant Manager → org stats, people, programs, courses, payments
 *   Teacher → my courses, units/lessons, students, grading
 *   Student → my programs, courses, progress, grades, certificates
 */
export default function DashboardPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [perms, setPerms] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me();
        setEmail(me.email);
        setPerms(me.permissions ?? []);
        setRoles(me.roles ?? []);
        setIsSuperAdmin(!!me.isSuperAdmin);
      } finally { setLoading(false); }
    })();
  }, [ready]);

  if (!ready) return null;

  const firstName = (email?.split('@')[0] ?? 'there').replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const role = resolveRole({ roles, isSuperAdmin, permissions: perms });

  function pick() {
    if (role === 'admin') return <SystemAdminDashboard firstName={firstName} />;
    if (role === 'manager') return <ManagerDashboard firstName={firstName} />;
    if (role === 'teacher') return <TeacherDashboard firstName={firstName} />;
    return <StudentDashboard firstName={firstName} />;
  }

  return (
    <AppShell email={email}>
      {loading ? <Skeleton height="24rem" /> : pick()}
    </AppShell>
  );
}
