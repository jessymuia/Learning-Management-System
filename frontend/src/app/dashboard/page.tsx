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
