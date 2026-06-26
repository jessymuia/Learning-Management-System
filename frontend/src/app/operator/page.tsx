'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, Button, Table, Modal, Field, Input, Select, Alert, EmptyState, Skeleton } from '@/components/ui';
import { api, auth, ApiException, type PlatformStats, type PlatformTenant, type Plan, type TenantBilling } from '@/lib/api';
import { Building2, Users2, BookOpen, Shield, Plus } from 'lucide-react';

export default function OperatorConsolePage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [plan, setPlan] = useState('free');
  const [payProvider, setPayProvider] = useState('mpesa');
  const [lastBilling, setLastBilling] = useState<TenantBilling | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, t, p] = await Promise.all([
        api.get<PlatformStats>('/operator/stats'),
        api.get<PlatformTenant[]>('/operator/tenants'),
        api.get<Plan[]>('/operator/plans').catch(() => []),
      ]);
      setStats(s); setTenants(t); setPlans(p);
    } catch (err) {
      if (err instanceof ApiException && (err.status === 403 || err.status === 401)) setDenied(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    (async () => { const me = await auth.me(); setEmail(me.email); await load(); setLoading(false); })();
  }, [ready, load]);

  const selectedPlan = plans.find((p) => p.code === plan) ?? null;

  async function createTenant(e: React.FormEvent) {
    e.preventDefault(); setError(null); setBusy(true);
    try {
      const res = await api.post<{ billing: TenantBilling | null }>('/operator/tenants', {
        name, slug, adminEmail, adminPassword, planCode: plan, paymentProvider: payProvider,
      });
      setLastBilling(res.billing ?? null);
      setName(''); setSlug(''); setAdminEmail(''); setAdminPassword('');
      setShowModal(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not create organization.');
    } finally { setBusy(false); }
  }

  async function toggleStatus(t: PlatformTenant) {
    try {
      await api.post(`/operator/tenants/${t.id}/${t.status === 'active' ? 'suspend' : 'activate'}`, {});
      await load();
    } catch (err) { setError(err instanceof ApiException ? err.message : 'Could not update.'); }
  }

  if (!ready) return null;

  if (denied) {
    return (
      <AppShell email={email}>
        <Card style={{ padding: '3rem', textAlign: 'center', maxWidth: '34rem', margin: '3rem auto' }}>
          <Shield size={40} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
          <h2>Super admins only</h2>
          <p className="muted">This console manages all organizations on the platform.</p>
        </Card>
      </AppShell>
    );
  }

  const tiles = [
    { icon: Building2, label: 'Active organizations', value: stats?.active_tenants ?? '—' },
    { icon: Users2, label: 'Total users', value: stats?.total_users ?? '—' },
    { icon: BookOpen, label: 'Total courses', value: stats?.total_courses ?? '—' },
  ];

  return (
    <AppShell email={email}>
      <header className="page-head head-row">
        <div>
          <span className="eyebrow">Platform</span>
          <h1>Super Admin Console</h1>
          <p className="muted">Provision and manage organizations across the platform.</p>
        </div>
        <Button onClick={() => setShowModal(true)}><Plus size={16} /> New organization</Button>
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {lastBilling && (
        <Alert tone="success">
          Organization created on the <strong>{lastBilling.plan}</strong> plan.
          {lastBilling.payment_required
            ? ` Billing: ${(lastBilling.amount_minor / 100).toLocaleString()} — a payment ${lastBilling.provider === 'manual' ? 'invoice has been raised' : 'request has been initiated'}.`
            : ' No charge (free plan).'}
        </Alert>
      )}

      <div className="tiles">
        {loading ? [...Array(3)].map((_, i) => <Skeleton key={i} height="6rem" />) :
          tiles.map((s, i) => {
            const Icon = s.icon;
            return (
              <Card key={i} className="tile">
                <div className="tile-icon"><Icon size={20} /></div>
                <div><div className="tile-val">{s.value}</div><div className="tile-lab">{s.label}</div></div>
              </Card>
            );
          })}
      </div>

      <h2 className="section-title">Organizations</h2>
      {loading ? <Skeleton height="10rem" /> : tenants.length === 0 ? (
        <Card><EmptyState icon={<Building2 size={36} />} title="No organizations yet"
          body="Provision your first organization to get started."
          action={<Button onClick={() => setShowModal(true)}><Plus size={16} /> New organization</Button>} /></Card>
      ) : (
        <Table columns={['Organization', 'Slug', 'Plan', 'Members', 'Courses', 'Status', '']}>
          {tenants.map((t) => (
            <tr key={t.id}>
              <td><strong>{t.name}</strong></td>
              <td className="mono">{t.slug}</td>
              <td><Badge tone="info">{t.plan}</Badge></td>
              <td>{t.members}</td>
              <td>{t.courses}</td>
              <td><Badge tone={t.status === 'active' ? 'success' : 'danger'}>{t.status}</Badge></td>
              <td>
                <Button variant={t.status === 'active' ? 'danger' : 'ghost'} size="sm" onClick={() => toggleStatus(t)}>
                  {t.status === 'active' ? 'Suspend' : 'Activate'}
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New organization"
        footer={<>
          <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={createTenant} disabled={busy || !name || !slug || !adminEmail}>{busy ? 'Creating…' : 'Create organization'}</Button>
        </>}>
        <Field label="Organization name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Greenwood High" /></Field>
        <Field label="Slug" hint="lowercase, used in URLs and login"><Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="greenwood" /></Field>
        <Field label="Admin email"><Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@greenwood.edu" /></Field>
        <Field label="Admin password" hint="they can change it after first login"><Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} /></Field>
        <Field label="Plan" hint="paid plans bill the organization on creation">
          <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
            {plans.length === 0 ? <option value="free">Free</option> : plans.map((p) => (
              <option key={p.id} value={p.code}>
                {p.name} — {p.price_minor === 0 ? 'Free' : `${p.currency} ${(p.price_minor / 100).toLocaleString()}/mo`}
              </option>
            ))}
          </Select>
        </Field>
        {selectedPlan && selectedPlan.price_minor > 0 && (
          <>
            <Field label="Billing method">
              <Select value={payProvider} onChange={(e) => setPayProvider(e.target.value)}>
                <option value="mpesa">M-Pesa</option>
                <option value="stripe">Card (Stripe)</option>
                <option value="manual">Manual / Invoice</option>
              </Select>
            </Field>
            <div className="bill-summary">
              <span>This organization will be billed</span>
              <strong>{selectedPlan.currency} {(selectedPlan.price_minor / 100).toLocaleString()} / month</strong>
            </div>
          </>
        )}
      </Modal>

      <style jsx>{`
        .page-head { margin-bottom: 1.75rem; }
        .page-head h1 { margin-top: 0.3rem; }
        .head-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
        .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.25rem; margin-bottom: 2rem; }
        :global(.tile) { padding: 1.3rem; display: flex; align-items: center; gap: 1rem; }
        .tile-icon { width: 2.6rem; height: 2.6rem; border-radius: 10px; background: var(--accent-soft); color: var(--accent);
          display: grid; place-items: center; flex-shrink: 0; }
        .tile-val { font-family: var(--serif); font-size: 1.7rem; font-weight: 600; color: var(--ink); line-height: 1; }
        .tile-lab { font-size: 0.78rem; color: var(--ink-faint); margin-top: 0.3rem; }
        .section-title { margin-bottom: 1rem; }
        .mono { font-family: var(--mono); font-size: 0.85rem; color: var(--ink-soft); }
        .bill-summary { display: flex; align-items: center; justify-content: space-between;
          background: var(--accent-soft); border: 1px solid rgba(79,70,229,0.18); border-radius: var(--radius-sm);
          padding: 0.85rem 1rem; margin-top: 0.5rem; font-size: 0.9rem; }
        .bill-summary strong { color: var(--accent-deep); font-size: 1.05rem; }
      `}</style>
    </AppShell>
  );
}
