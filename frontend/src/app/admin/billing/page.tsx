'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { auth, operator, type PlatformOverview } from '@/lib/api';

export default function BillingPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [stats, setStats] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [me, data] = await Promise.all([auth.me(), operator.stats().catch(() => null)]);
        setEmail(me.email);
        setStats(data);
      } finally { setLoading(false); }
    })();
  }, [ready]);

  const fmt = (cents: number, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

  return (
    <AppShell email={email}>
      <div className="content">
        <div className="page-head">
          <p className="eyebrow">Operations</p>
          <h1>Billing</h1>
        </div>
        {loading && <p className="muted">Loading billing data…</p>}
        {!loading && stats && (
          <>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">Total Revenue</div>
                <div className="stat-value">{fmt(stats.revenue_minor)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Paid Orders</div>
                <div className="stat-value">{stats.paid_orders}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Pending Orders</div>
                <div className="stat-value">{stats.pending_orders}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Failed Orders</div>
                <div className="stat-value" style={{ color: 'var(--rose)' }}>{stats.failed_orders}</div>
              </div>
            </div>
            <div className="card" style={{ padding: '2rem', marginTop: '1.5rem' }}>
              <h2 style={{ marginBottom: '1.25rem' }}>Subscription Overview</h2>
              <p className="muted">Connect your payment provider (Stripe, etc.) to see detailed subscription management here. Revenue data is aggregated from all tenant orders above.</p>
            </div>
          </>
        )}
        {!loading && !stats && (
          <div className="empty-state"><div className="icon">💳</div><h3>Billing data unavailable</h3><p>Connect a payment provider to view billing information.</p></div>
        )}
      </div>
    </AppShell>
  );
}
