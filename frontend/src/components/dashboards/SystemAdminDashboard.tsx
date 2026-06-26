'use client';
import { useEffect, useState } from 'react';
import { Card, Badge, Skeleton, Button, SearchInput } from '@/components/ui';
import { BarChart, LineChart, Donut } from '@/components/Charts';
import {
  operator,
  type PlatformOverview, type PlatformAnalytics,
  type PlatformActivity, type PlatformTenant,
} from '@/lib/api';
import {
  Building2, Users2, BookOpen, GraduationCap, Layers, CreditCard,
  Activity, ShieldCheck, BarChart3, UserPlus, Plus, Settings, FileText,
  TrendingUp, LogIn, AlertTriangle, KeyRound, ChevronRight, RefreshCw,
  CheckCircle2, Clock, XCircle, Wallet, Globe,
} from 'lucide-react';

const kes = (minor: number) => `KES ${(minor / 100).toLocaleString()}`;

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function labelAction(a: string): string {
  const map: Record<string, string> = {
    login: 'Signed in', 'login.failed': 'Failed login',
    'role.assign': 'Role assigned', 'role.revoke': 'Role revoked',
    'grade.override': 'Grade overridden', 'permission.change': 'Permission changed',
    'tenant.create': 'Organization created', 'user.create': 'User registered',
    'course.publish': 'Course published', 'payment.complete': 'Payment completed',
    'payment.success': 'Payment succeeded', 'payment.received': 'Payment received',
  };
  return map[a] ?? a.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function actionIcon(a: string) {
  if (a.includes('fail') || a.includes('error')) return <XCircle size={14} />;
  if (a.includes('login')) return <LogIn size={14} />;
  if (a.includes('role') || a.includes('permission')) return <KeyRound size={14} />;
  if (a.includes('payment')) return <CreditCard size={14} />;
  if (a.includes('tenant')) return <Building2 size={14} />;
  if (a.includes('user')) return <Users2 size={14} />;
  if (a.includes('course')) return <BookOpen size={14} />;
  return <Activity size={14} />;
}

function actionTone(a: string): string {
  if (a.includes('fail') || a.includes('error')) return 'danger';
  if (a.includes('role') || a.includes('permission')) return 'warn';
  if (a.includes('payment')) return 'green';
  return 'neutral';
}

export function SystemAdminDashboard({ firstName }: { firstName: string }) {
  const [stats, setStats] = useState<PlatformOverview | null>(null);
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
  const [activity, setActivity] = useState<PlatformActivity | null>(null);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tenantQuery, setTenantQuery] = useState('');
  const [showQA, setShowQA] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  async function load() {
    try {
      const [s, an, ac, t] = await Promise.all([
        operator.stats().catch(() => null),
        operator.analytics().catch(() => null),
        operator.activity().catch(() => null),
        operator.tenants().catch(() => []),
      ]);
      setStats(s); setAnalytics(an); setActivity(ac); setTenants(t);
      setLastRefresh(new Date());
      if (!s) setError('Some platform data could not be loaded. Check API connectivity.');
      else setError(null);
    } catch { setError('Failed to load platform dashboard. Check API connectivity.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function toggleTenant(t: PlatformTenant) {
    const next = t.status === 'active' ? 'suspended' : 'active';
    setTenants((prev) => prev.map((x) => x.id === t.id ? { ...x, status: next } : x));
    try { await operator.setStatus(t.id, next); }
    catch { setTenants((prev) => prev.map((x) => x.id === t.id ? { ...x, status: t.status } : x)); }
  }

  const filtered = tenants.filter((t) =>
    !tenantQuery || t.name.toLowerCase().includes(tenantQuery.toLowerCase())
      || t.slug.toLowerCase().includes(tenantQuery.toLowerCase()));

  // role donut data
  const totalByRole = (stats?.students ?? 0) + (stats?.teachers ?? 0) + (stats?.managers ?? 0);

  // payment provider aggregates
  const providerMap: Record<string, { succeeded: number; total: number }> = {};
  (analytics?.payment_providers ?? []).forEach((p) => {
    if (!providerMap[p.provider]) providerMap[p.provider] = { succeeded: 0, total: 0 };
    if (p.status === 'succeeded') {
      providerMap[p.provider].succeeded += p.count;
      providerMap[p.provider].total += p.total;
    }
  });

  if (loading) return (
    <div className="adm">
      <Skeleton height="7rem" />
      <div className="tiles">{[...Array(8)].map((_, i) => <Skeleton key={i} height="6rem" />)}</div>
      <div className="adm-grid3">{[...Array(3)].map((_, i) => <Skeleton key={i} height="14rem" />)}</div>
    </div>
  );

  return (
    <div className="adm">

      {/* ── 1. HEADER ─────────────────────────────────── */}
      <header className="adm-head">
        <div>
          <span className="eyebrow"><Globe size={13} /> Platform administration</span>
          <h1>Welcome back, {firstName}.</h1>
          <p className="muted">
            {stats?.active_tenants ?? 0} organizations · {stats?.total_users ?? 0} users ·
            last updated {timeAgo(lastRefresh.toISOString())}
          </p>
        </div>
        <div className="ha-right">
          <button className="refresh-btn" onClick={() => { setLoading(true); load(); }} title="Refresh data">
            <RefreshCw size={15} />
          </button>
          <div className="qa-wrap">
            <Button onClick={() => setShowQA(!showQA)}><Plus size={15} /> Quick actions</Button>
            {showQA && (
              <div className="qa-menu" onMouseLeave={() => setShowQA(false)}>
                <a href="/admin/people"><UserPlus size={14} /> Manage users</a>
                <a href="/operator"><Building2 size={14} /> Manage tenants</a>
                <a href="/reports"><BarChart3 size={14} /> View reports</a>
                <a href="/admin/integrations"><Settings size={14} /> System settings</a>
              </div>
            )}
          </div>
        </div>
      </header>

      {error && (
        <Card className="err-banner">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </Card>
      )}

      {/* ── 2. OVERVIEW CARDS ─────────────────────────── */}
      <div className="tiles">
        <Tile icon={<Building2 />} value={stats?.active_tenants ?? 0} label="Organizations"
          sub={stats?.suspended_tenants ? `${stats.suspended_tenants} suspended` : 'all active'}
          href="/operator" color="accent" />
        <Tile icon={<Users2 />} value={stats?.total_users ?? 0} label="Total users"
          sub={`+${stats?.new_users_7d ?? 0} this week`} href="/admin/people" color="accent" />
        <Tile icon={<GraduationCap />} value={stats?.students ?? 0} label="Students" href="/admin/people" />
        <Tile icon={<Users2 />} value={stats?.teachers ?? 0} label="Teachers" href="/admin/people" />
        <Tile icon={<BookOpen />} value={stats?.total_courses ?? 0} label="Courses"
          sub={`${stats?.published_courses ?? 0} published`} href="/courses" />
        <Tile icon={<Layers />} value={stats?.total_programs ?? 0} label="Programs" href="/admin/programs" />
        <Tile icon={<Activity />} value={stats?.active_today ?? 0} label="Active today"
          sub="unique logins (24h)" href="/reports" color="sage" />
        <Tile icon={<Wallet />} value={stats ? kes(stats.revenue_minor) : '—'} label="Total revenue"
          sub={`${stats?.paid_orders ?? 0} paid orders`} href="/payments" color="sage" />
      </div>

      {/* ── 3. USER ANALYTICS  +  4. FINANCIAL  ──────── */}
      <div className="adm-cols">

        {/* User analytics panel */}
        <Card className="panel">
          <div className="panel-head">
            <h3><Users2 size={16} /> User analytics</h3>
            <a href="/admin/people">Manage <ChevronRight size={13} /></a>
          </div>

          {/* summary strip */}
          <div className="ustat-row">
            <div className="ustat"><div className="ustat-val">{stats?.total_users ?? 0}</div><div className="ustat-lab">Total</div></div>
            <div className="ustat accent"><div className="ustat-val">{stats?.new_users_30d ?? 0}</div><div className="ustat-lab">New (30d)</div></div>
            <div className="ustat sage"><div className="ustat-val">{stats?.active_users_7d ?? 0}</div><div className="ustat-lab">Active (7d)</div></div>
          </div>

          {/* role distribution */}
          <div className="role-section">
            <div className="rs-label">Role distribution</div>
            <div className="role-cols">
              <div className="donut-sm">
                <Donut a={stats?.students ?? 0} b={(stats?.teachers ?? 0) + (stats?.managers ?? 0)}
                  labelA="Students" labelB="Staff" />
              </div>
              <div className="role-bars">
                <RoleBar label="Students" value={stats?.students ?? 0} total={totalByRole} color="accent" />
                <RoleBar label="Teachers" value={stats?.teachers ?? 0} total={totalByRole} color="sage" />
                <RoleBar label="Managers" value={stats?.managers ?? 0} total={totalByRole} color="gold" />
                <RoleBar label="Admins" value={stats?.admins ?? 0} total={totalByRole} color="rose" />
              </div>
            </div>
          </div>

          <div className="panel-actions">
            <a href="/admin/people">Manage users</a>
            <a href="/admin/people">Add user</a>
            <a href="/reports">User report</a>
          </div>
        </Card>

        {/* Financial overview panel */}
        <Card className="panel">
          <div className="panel-head">
            <h3><Wallet size={16} /> Financial overview</h3>
            <a href="/payments">All payments <ChevronRight size={13} /></a>
          </div>

          <div className="fin-hero">
            <div className="fin-total">{stats ? kes(stats.revenue_minor) : '—'}</div>
            <div className="fin-lab">Total platform revenue</div>
          </div>

          <div className="fin-grid">
            <div className="fin-cell ok">
              <CheckCircle2 size={16} />
              <div><div className="fc-val">{stats?.paid_orders ?? 0}</div><div className="fc-lab">Successful</div></div>
            </div>
            <div className="fin-cell warn">
              <Clock size={16} />
              <div><div className="fc-val">{stats?.pending_orders ?? 0}</div><div className="fc-lab">Pending</div></div>
            </div>
            <div className="fin-cell danger">
              <XCircle size={16} />
              <div><div className="fc-val">{stats?.failed_orders ?? 0}</div><div className="fc-lab">Failed</div></div>
            </div>
          </div>

          {/* provider breakdown */}
          {Object.keys(providerMap).length > 0 && (
            <div className="provider-list">
              <div className="prov-head">By provider</div>
              {Object.entries(providerMap).map(([name, d]) => (
                <div key={name} className="prov-row">
                  <span className="prov-name">{name.toUpperCase()}</span>
                  <span className="prov-count">{d.succeeded} paid</span>
                  <span className="prov-amt">{kes(d.total)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="panel-actions">
            <a href="/payments">View payments</a>
            <a href="/reports">Revenue report</a>
          </div>
        </Card>
      </div>

      {/* ── 5. ANALYTICS CHARTS ──────────────────────── */}
      <section className="adm-section">
        <h2><BarChart3 size={18} /> Platform analytics</h2>
        <div className="adm-grid3">
          <Card className="chart-card">
            <h3><TrendingUp size={14} /> User growth (6 months)</h3>
            {(analytics?.user_growth ?? []).length === 0
              ? <EmptyChart text="No registration data in the last 6 months" />
              : <LineChart data={analytics!.user_growth} />}
          </Card>
          <Card className="chart-card">
            <h3><BookOpen size={14} /> Courses created</h3>
            {(analytics?.course_growth ?? []).length === 0
              ? <EmptyChart text="No courses created in the last 6 months" />
              : <BarChart data={analytics!.course_growth} />}
          </Card>
          <Card className="chart-card">
            <h3><CreditCard size={14} /> Monthly revenue</h3>
            {(analytics?.revenue ?? []).length === 0
              ? <EmptyChart text="No revenue data yet" />
              : <BarChart data={analytics!.revenue.map((r) => ({ label: r.label, value: Math.round(r.value / 100) }))}
                  format={(n) => `KES ${n.toLocaleString()}`} />}
          </Card>
        </div>
      </section>

      {/* ── 6. TENANT TABLE ──────────────────────────── */}
      <section className="adm-section">
        <div className="section-head-row">
          <h2><Building2 size={18} /> Organizations ({tenants.length})</h2>
          <div className="sh-tools">
            <SearchInput value={tenantQuery} onChange={setTenantQuery} placeholder="Search organizations…" />
            <a href="/operator" className="manage-link">Manage all <ChevronRight size={13} /></a>
          </div>
        </div>

        {filtered.length === 0 ? (
          <Card><EmptyMini icon={<Building2 size={28} />}
            text={tenantQuery ? 'No organizations match your search.' : 'No organizations provisioned yet.'} /></Card>
        ) : (
          <Card className="table-card">
            <table className="adm-table">
              <thead>
                <tr><th>Organization</th><th>Status</th><th>Plan</th><th>Users</th><th>Courses</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="ten-name">
                        <div className="ten-av" style={{ background: stringColor(t.name) }}>
                          {t.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="ten-title">{t.name}</div>
                          <div className="ten-slug">/{t.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td><Badge tone={t.status === 'active' ? 'success' : 'danger'}>{t.status}</Badge></td>
                    <td><Badge tone="neutral">{t.plan ?? 'free'}</Badge></td>
                    <td>{t.members ?? '—'}</td>
                    <td>{t.courses ?? '—'}</td>
                    <td>
                      <div className="ten-acts">
                        <a href="/operator">View</a>
                        <button
                          className={t.status === 'active' ? 'act-suspend' : 'act-activate'}
                          onClick={() => toggleTenant(t)}>
                          {t.status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* ── 7. ACTIVITY FEED  +  8. AUDIT ───────────── */}
      <div className="adm-cols">
        <Card className="panel">
          <div className="panel-head">
            <h3><Activity size={16} /> System activity feed</h3>
          </div>
          {(!activity || activity.activity.length === 0) ? (
            <EmptyMini icon={<Activity size={28} />}
              text="No platform activity recorded yet. Activity appears here as users and admins interact with the system." />
          ) : (
            <ul className="feed">
              {activity.activity.slice(0, 10).map((e, i) => (
                <li key={i}>
                  <span className={`feed-ic ${actionTone(e.action)}`}>{actionIcon(e.action)}</span>
                  <span className="feed-body">
                    <span className="feed-action">{labelAction(e.action)}
                      {e.tenant_name && <span className="feed-tenant"> · {e.tenant_name}</span>}
                    </span>
                    <span className="feed-meta">{e.actor_email ?? 'system'} · {timeAgo(e.created_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="panel">
          <div className="panel-head">
            <h3><ShieldCheck size={16} /> Security &amp; audit</h3>
            <a href="/reports">Full audit <ChevronRight size={13} /></a>
          </div>
          {(!activity || activity.security.length === 0) ? (
            <EmptyMini icon={<ShieldCheck size={28} />}
              text="No security events yet. Login attempts, role changes, and permission modifications appear here." />
          ) : (
            <ul className="sec-list">
              {activity.security.slice(0, 8).map((e, i) => (
                <li key={i}>
                  <span className={`sec-ic ${e.action.includes('fail') ? 'danger' : e.action.includes('role') || e.action.includes('permission') ? 'warn' : 'ok'}`}>
                    {actionIcon(e.action)}
                  </span>
                  <span className="sec-body">
                    <span className="sec-action">{labelAction(e.action)}</span>
                    <span className="sec-meta">{e.actor_email ?? 'system'}{e.ip ? ` · ${e.ip}` : ''} · {timeAgo(e.created_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── 9. REPORTS ───────────────────────────────── */}
      <Card className="panel">
        <div className="panel-head"><h3><FileText size={16} /> Platform reports</h3><a href="/reports">All reports <ChevronRight size={13} /></a></div>
        <div className="report-grid">
          <a href="/admin/people" className="report-link"><Users2 size={15} /><div><strong>User reports</strong><span>Registrations, roles, activity</span></div></a>
          <a href="/payments" className="report-link"><CreditCard size={15} /><div><strong>Revenue reports</strong><span>Payments, invoices, subscriptions</span></div></a>
          <a href="/reports" className="report-link"><BookOpen size={15} /><div><strong>Course reports</strong><span>Enrolments, completion, activity</span></div></a>
          <a href="/operator" className="report-link"><Building2 size={15} /><div><strong>Tenant reports</strong><span>Organization usage and billing</span></div></a>
          <a href="/reports" className="report-link"><Activity size={15} /><div><strong>Activity reports</strong><span>Platform events and audit log</span></div></a>
          <a href="/admin/integrations" className="report-link"><Settings size={15} /><div><strong>System settings</strong><span>Integrations, configuration</span></div></a>
        </div>
      </Card>

      <style jsx>{css}</style>
    </div>
  );
}

/* ── sub-components ──────────────────────────────── */

function Tile({ icon, value, label, sub, href, color = '' }: {
  icon: React.ReactNode; value: React.ReactNode; label: string; sub?: string; href: string; color?: string;
}) {
  return (
    <a href={href} className={`tile ${color}`}>
      <div className="tile-icon">{icon}</div>
      <div className="tile-val">{value}</div>
      <div className="tile-lab">{label}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </a>
  );
}

function RoleBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rb">
      <div className="rb-top"><span>{label}</span><strong>{value} <span className="rb-pct">({pct}%)</span></strong></div>
      <div className="rb-track"><div className={`rb-fill ${color}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function EmptyMini({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="empty-mini">{icon}<p>{text}</p></div>;
}

function EmptyChart({ text }: { text: string }) {
  return <div className="empty-chart"><BarChart3 size={24} /><p>{text}</p></div>;
}

// deterministic color per org name (so avatars look consistent without a stored color)
function stringColor(s: string): string {
  const colors = ['#4f46e5','#059669','#d97706','#dc2626','#7c3aed','#0891b2','#be185d'];
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xFFFF;
  return colors[h % colors.length];
}

/* ── styles ──────────────────────────────────────── */
const css = `
  .adm { display: flex; flex-direction: column; gap: 2rem; }

  /* header */
  .adm-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .adm-head h1 { margin-top: 0.3rem; }
  .eyebrow { display: inline-flex; align-items: center; gap: 0.4rem; }
  .ha-right { display: flex; align-items: center; gap: 0.75rem; }
  .refresh-btn { width: 2.4rem; height: 2.4rem; border: 1px solid var(--line); border-radius: 10px;
    display: grid; place-items: center; background: none; color: var(--ink-soft); cursor: pointer; }
  .refresh-btn:hover { border-color: var(--accent); color: var(--accent); }
  .qa-wrap { position: relative; }
  .qa-menu { position: absolute; right: 0; top: calc(100% + 0.4rem); background: var(--surface); border: 1px solid var(--line);
    border-radius: 12px; box-shadow: var(--shadow-lg); padding: 0.4rem; min-width: 14rem; z-index: 30; display: flex; flex-direction: column; }
  .qa-menu a { display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 0.75rem; border-radius: 8px; font-size: 0.88rem; font-weight: 500; color: var(--ink-soft); }
  .qa-menu a:hover { background: var(--surface-sunken); color: var(--ink); }
  .qa-menu a :global(svg) { color: var(--accent); }
  .err-banner { display: flex; align-items: center; gap: 0.5rem; padding: 0.9rem 1.2rem; color: var(--rose); background: rgba(220,38,38,0.06); border-color: rgba(220,38,38,0.2); }

  /* tiles */
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)); gap: 1rem; }
  .tile { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 1.25rem; box-shadow: var(--shadow-sm); display: block; transition: all 0.16s ease; }
  .tile:hover { box-shadow: var(--shadow); transform: translateY(-2px); border-color: var(--accent); }
  .tile-icon { width: 2.3rem; height: 2.3rem; border-radius: 10px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; margin-bottom: 0.75rem; }
  .tile.sage .tile-icon { background: rgba(5,150,105,0.1); color: var(--sage); }
  .tile.accent .tile-icon { background: rgba(79,70,229,0.12); color: var(--accent); }
  .tile-val { font-family: var(--serif); font-size: 1.6rem; font-weight: 600; color: var(--ink); line-height: 1; }
  .tile-lab { font-size: 0.8rem; color: var(--ink-faint); margin-top: 0.35rem; }
  .tile-sub { font-size: 0.72rem; color: var(--sage); margin-top: 0.2rem; font-weight: 600; }

  /* two-col + three-col grids */
  .adm-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
  .adm-grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; }
  @media (max-width: 960px) { .adm-cols, .adm-grid3 { grid-template-columns: 1fr; } }

  /* panels */
  :global(.panel) { padding: 1.4rem; }
  .panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.1rem; }
  .panel-head h3 { display: flex; align-items: center; gap: 0.45rem; font-size: 1rem; color: var(--ink); }
  .panel-head a { display: flex; align-items: center; font-size: 0.82rem; color: var(--accent); font-weight: 600; }
  .panel-actions { display: flex; gap: 0.5rem; margin-top: 1.25rem; flex-wrap: wrap; }
  .panel-actions a { font-size: 0.8rem; font-weight: 600; color: var(--accent); padding: 0.4rem 0.85rem; border: 1px solid var(--line); border-radius: 999px; }
  .panel-actions a:hover { border-color: var(--accent); background: var(--accent-soft); }

  /* user analytics */
  .ustat-row { display: flex; gap: 1.5rem; margin-bottom: 1.25rem; }
  .ustat-val { font-size: 1.5rem; font-weight: 700; color: var(--ink); font-family: var(--serif); }
  .ustat.accent .ustat-val { color: var(--accent); }
  .ustat.sage .ustat-val { color: var(--sage); }
  .ustat-lab { font-size: 0.76rem; color: var(--ink-faint); margin-top: 0.15rem; }
  .role-section { margin-top: 0.5rem; }
  .rs-label { font-size: 0.78rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-faint); margin-bottom: 0.75rem; }
  .role-cols { display: flex; gap: 1rem; align-items: flex-start; }
  .donut-sm { flex-shrink: 0; width: 8rem; }
  .role-bars { flex: 1; display: flex; flex-direction: column; gap: 0.6rem; }
  .rb-top { display: flex; justify-content: space-between; font-size: 0.82rem; color: var(--ink-soft); margin-bottom: 0.2rem; }
  .rb-top strong { font-weight: 600; color: var(--ink); }
  .rb-pct { font-weight: 400; color: var(--ink-faint); font-size: 0.76rem; }
  .rb-track { height: 5px; background: var(--surface-sunken); border-radius: 999px; overflow: hidden; }
  .rb-fill { height: 100%; border-radius: 999px; transition: width 0.4s ease; }
  .rb-fill.accent { background: var(--accent); }
  .rb-fill.sage { background: var(--sage); }
  .rb-fill.gold { background: var(--gold); }
  .rb-fill.rose { background: var(--rose); }

  /* financial */
  .fin-hero { margin-bottom: 1.1rem; }
  .fin-total { font-size: 2rem; font-weight: 700; color: var(--ink); font-family: var(--serif); }
  .fin-lab { font-size: 0.78rem; color: var(--ink-faint); }
  .fin-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1.1rem; }
  .fin-cell { display: flex; align-items: center; gap: 0.55rem; padding: 0.7rem; border-radius: 10px; }
  .fin-cell.ok { background: rgba(5,150,105,0.07); color: var(--sage); }
  .fin-cell.warn { background: rgba(217,119,6,0.07); color: var(--gold); }
  .fin-cell.danger { background: rgba(220,38,38,0.07); color: var(--rose); }
  .fc-val { font-size: 1.2rem; font-weight: 700; line-height: 1; }
  .fc-lab { font-size: 0.72rem; margin-top: 0.1rem; opacity: 0.8; }
  .provider-list { border-top: 1px solid var(--line); padding-top: 0.85rem; margin-top: 0.5rem; }
  .prov-head { font-size: 0.74rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-faint); margin-bottom: 0.5rem; }
  .prov-row { display: flex; gap: 0.75rem; padding: 0.35rem 0; font-size: 0.84rem; align-items: center; }
  .prov-name { font-weight: 700; color: var(--ink); min-width: 4.5rem; }
  .prov-count { color: var(--ink-soft); flex: 1; }
  .prov-amt { font-weight: 600; color: var(--sage); }

  /* charts */
  .adm-section { display: flex; flex-direction: column; gap: 1rem; }
  .adm-section h2 { display: flex; align-items: center; gap: 0.5rem; font-size: 1.2rem; }
  :global(.chart-card) { padding: 1.3rem; }
  :global(.chart-card) h3 { display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; color: var(--ink); margin-bottom: 0.75rem; }
  .empty-chart { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 2rem; color: var(--ink-faint); text-align: center; }
  .empty-chart :global(svg) { opacity: 0.35; }
  .empty-chart p { font-size: 0.83rem; }

  /* tenant table */
  .section-head-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .sh-tools { display: flex; align-items: center; gap: 1rem; }
  .manage-link { display: flex; align-items: center; font-size: 0.82rem; color: var(--accent); font-weight: 600; white-space: nowrap; }
  :global(.table-card) { padding: 0; overflow: hidden; }
  .adm-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  .adm-table th { text-align: left; font-size: 0.71rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-faint); padding: 0.8rem 1.1rem; border-bottom: 1px solid var(--line); }
  .adm-table td { padding: 0.85rem 1.1rem; border-bottom: 1px solid var(--line); vertical-align: middle; color: var(--ink); }
  .adm-table tr:last-child td { border-bottom: none; }
  .adm-table tbody tr:hover { background: var(--surface-sunken); }
  .ten-name { display: flex; align-items: center; gap: 0.7rem; }
  .ten-av { width: 2rem; height: 2rem; border-radius: 8px; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 0.85rem; flex-shrink: 0; }
  .ten-title { font-weight: 600; }
  .ten-slug { font-size: 0.75rem; color: var(--ink-faint); }
  .ten-acts { display: flex; gap: 0.5rem; align-items: center; }
  .ten-acts a { color: var(--accent); font-weight: 600; font-size: 0.82rem; }
  .act-suspend, .act-activate { background: none; border: 1px solid var(--line); border-radius: 999px; padding: 0.2rem 0.65rem; font-size: 0.76rem; font-weight: 600; cursor: pointer; }
  .act-suspend { color: var(--rose); } .act-suspend:hover { border-color: var(--rose); background: rgba(220,38,38,0.06); }
  .act-activate { color: var(--sage); } .act-activate:hover { border-color: var(--sage); background: rgba(5,150,105,0.06); }

  /* feeds */
  .feed, .sec-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
  .feed li, .sec-list li { display: flex; align-items: flex-start; gap: 0.65rem; }
  .feed-ic, .sec-ic { width: 1.75rem; height: 1.75rem; border-radius: 7px; display: grid; place-items: center; flex-shrink: 0; }
  .feed-ic.neutral, .sec-ic.ok { background: var(--accent-soft); color: var(--accent); }
  .feed-ic.green { background: rgba(5,150,105,0.1); color: var(--sage); }
  .feed-ic.danger, .sec-ic.danger { background: rgba(220,38,38,0.1); color: var(--rose); }
  .feed-ic.warn, .sec-ic.warn { background: rgba(217,119,6,0.1); color: var(--gold); }
  .feed-action, .sec-action { display: block; font-size: 0.86rem; font-weight: 500; color: var(--ink); }
  .feed-tenant { color: var(--ink-faint); font-weight: 400; }
  .feed-meta, .sec-meta { display: block; font-size: 0.74rem; color: var(--ink-faint); }

  /* reports */
  .report-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
  @media (max-width: 800px) { .report-grid { grid-template-columns: 1fr 1fr; } }
  .report-link { display: flex; align-items: center; gap: 0.65rem; padding: 0.85rem 1rem; border: 1px solid var(--line); border-radius: 10px; color: var(--ink-soft); transition: all 0.14s ease; }
  .report-link:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
  .report-link :global(svg) { color: var(--accent); flex-shrink: 0; }
  .report-link div { display: flex; flex-direction: column; }
  .report-link strong { font-size: 0.86rem; font-weight: 600; color: var(--ink); }
  .report-link span { font-size: 0.74rem; color: var(--ink-faint); margin-top: 0.1rem; }

  /* empty state */
  .empty-mini { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1.75rem; text-align: center; color: var(--ink-faint); }
  .empty-mini :global(svg) { opacity: 0.35; }
  .empty-mini p { font-size: 0.84rem; max-width: 24rem; }
`;
