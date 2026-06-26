'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { Card, Button, Badge, Table, Modal, Field, Select, SearchInput, Alert, EmptyState, Skeleton } from '@/components/ui';
import { api, auth, ApiException, type Role, type RoleAssignment, type Member } from '@/lib/api';
import { UserPlus, Users2, X, ShieldCheck } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  tenant_admin: 'Tenant Admin', manager: 'Manager', course_manager: 'Course Manager',
  teacher: 'Teacher', ta: 'Teaching Assistant', student: 'Student', observer: 'Observer',
};

export default function PeopleRolesPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [roles, setRoles] = useState<Role[]>([]);
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState<Member[]>([]);
  const [picked, setPicked] = useState<Member | null>(null);
  const [role, setRole] = useState('teacher');

  const load = useCallback(async () => {
    const [r, a] = await Promise.all([
      api.get<Role[]>('/roles').catch(() => []),
      api.get<RoleAssignment[]>('/role-assignments').catch(() => []),
    ]);
    setRoles(r);
    setAssignments(a);
  }, []);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try { const me = await auth.me(); setEmail(me.email); await load(); }
      finally { setLoading(false); }
    })();
  }, [ready, load]);

  useEffect(() => {
    if (search.trim().length < 2) { setMatches([]); return; }
    const t = setTimeout(async () => {
      const res = await api.get<Member[]>(`/users?search=${encodeURIComponent(search)}`).catch(() => []);
      setMatches(res);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function assign() {
    setError(null);
    if (!picked) { setError('Search and pick a user by email.'); return; }
    try {
      await api.post('/role-assignments', { userId: picked.id, role, level: 'tenant' });
      setModalOpen(false); setPicked(null); setSearch(''); setMatches([]);
      await load();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not assign role.');
    }
  }

  async function revoke(a: RoleAssignment) {
    try {
      const qs = new URLSearchParams({ userId: a.user_id, role: a.role, level: a.level }).toString();
      await api.delete(`/role-assignments?${qs}`);
      await load();
    } catch { /* surfaced via reload */ }
  }

  if (!ready) return null;

  return (
    <AppShell email={email}>
      <header className="page-header">
        <div className="ph-text">
          <span className="eyebrow">Administration</span>
          <h1>People &amp; Roles</h1>
          <p className="muted">Assign teacher, TA, manager, or admin roles to members of your organization.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}><UserPlus size={16} /> Assign role</Button>
      </header>

      {error && !modalOpen && <Alert tone="error">{error}</Alert>}

      <Card className="legend-card">
        <h3><ShieldCheck size={16} /> What each role can do</h3>
        <div className="role-grid">
          {roles.map((r) => (
            <div key={r.id} className="role-item">
              <Badge tone="info">{ROLE_LABELS[r.name] ?? r.name}</Badge>
              <span className="role-perms faint">{r.permissions || '—'}</span>
            </div>
          ))}
        </div>
      </Card>

      <h2 className="sec-title">Current assignments</h2>
      {loading ? (
        <Skeleton height="10rem" />
      ) : assignments.length === 0 ? (
        <Card><EmptyState icon={<Users2 size={40} />} title="No roles assigned yet"
          body="Assign a role to give someone teaching or admin abilities."
          action={<Button onClick={() => setModalOpen(true)}><UserPlus size={16} /> Assign a role</Button>} /></Card>
      ) : (
        <Table columns={['Member', 'Role', 'Scope', '']}>
          {assignments.map((a) => (
            <tr key={a.id}>
              <td>{a.email}</td>
              <td><Badge tone="info">{ROLE_LABELS[a.role] ?? a.role}</Badge></td>
              <td className="faint">{a.level === 'tenant' ? 'Organization-wide' : a.level}</td>
              <td style={{ textAlign: 'right' }}>
                <Button variant="danger" size="sm" onClick={() => revoke(a)}>Revoke</Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setPicked(null); setSearch(''); }}
        title="Assign a role"
        footer={<>
          <Button variant="ghost" onClick={() => { setModalOpen(false); setPicked(null); setSearch(''); }}>Cancel</Button>
          <Button onClick={assign} disabled={!picked}>Assign role</Button>
        </>}>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Find a user by email" hint="The email resolves to the user automatically — you never handle IDs.">
          {picked ? (
            <div className="picked-chip">
              <span>{picked.email}</span>
              <button className="chip-x" onClick={() => { setPicked(null); setSearch(''); }}><X size={14} /></button>
            </div>
          ) : (
            <div className="search-area">
              <SearchInput value={search} onChange={setSearch} placeholder="Search a user by email…" />
              {matches.length > 0 && (
                <ul className="match-list">
                  {matches.map((m) => (
                    <li key={m.id}>
                      <button className="match" onClick={() => { setPicked(m); setMatches([]); }}>{m.email}</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((r) => <option key={r.id} value={r.name}>{ROLE_LABELS[r.name] ?? r.name}</option>)}
          </Select>
        </Field>
      </Modal>

      <style jsx>{`
        .page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem;
          margin-bottom: 1.75rem; padding-bottom: 1.25rem; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
        .ph-text { display: flex; flex-direction: column; gap: 0.3rem; }
        .ph-text h1 { margin-top: 0.25rem; }
        :global(.legend-card) { padding: 1.4rem; margin-bottom: 2rem; }
        :global(.legend-card) h3 { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; }
        .role-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.85rem; }
        .role-item { display: flex; flex-direction: column; gap: 0.4rem; }
        .role-perms { font-size: 0.78rem; font-family: var(--mono); }
        .sec-title { margin-bottom: 1rem; }
        .picked-chip { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.8rem;
          background: var(--accent-soft); border: 1px solid var(--accent); border-radius: var(--radius-sm); font-size: 0.9rem; }
        .chip-x { background: none; border: none; cursor: pointer; display: grid; place-items: center; color: var(--ink-soft); }
        .search-area { position: relative; }
        .match-list { position: absolute; z-index: 10; top: 100%; left: 0; right: 0; margin-top: 0.25rem; list-style: none;
          background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--shadow);
          max-height: 12rem; overflow-y: auto; }
        .match { width: 100%; text-align: left; padding: 0.6rem 0.85rem; background: none; border: none; cursor: pointer; font-size: 0.88rem; }
        .match:hover { background: var(--surface-sunken); }
      `}</style>
    </AppShell>
  );
}
