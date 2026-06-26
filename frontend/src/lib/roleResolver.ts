export type LMSRole = 'admin' | 'manager' | 'teacher' | 'student';

export function resolveRole(input: { roles?: string[]; isSuperAdmin?: boolean; permissions?: string[] }): LMSRole {
  if (input.isSuperAdmin) return 'admin';

  const roles = (input.roles || []).map(r => r.toLowerCase().replace(/[_-]/g, ' '));

  if (roles.some(r => r.includes('admin') || r.includes('operator'))) return 'admin';
  if (roles.some(r => r.includes('manager') || r.includes('tenant'))) return 'manager';
  if (roles.some(r => r.includes('teacher') || r.includes('instructor') || r.includes('ta'))) return 'teacher';
  if (roles.some(r => r.includes('student') || r.includes('learner'))) return 'student';

  // Compatibility fallback for older backend sessions. Roles remain the source of truth.
  const permissions = (input.permissions || []).map(p => p.toLowerCase());
  if (permissions.some(p => p.includes('course.manage') || p.includes('grade'))) return 'teacher';
  if (permissions.some(p => p.includes('program.manage') || p.includes('enrol.manage'))) return 'manager';

  return 'student';
}
