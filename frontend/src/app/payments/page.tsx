'use client';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, Table, EmptyState, Skeleton } from '@/components/ui';
import { api, auth, type UserOrder } from '@/lib/api';
import { Receipt, CreditCard } from 'lucide-react';

function money(minor: number, currency = 'KES') {
  return `${currency} ${(minor / 100).toLocaleString()}`;
}
function statusTone(s: string): 'success' | 'warning' | 'danger' | 'neutral' {
  return s === 'paid' ? 'success' : s === 'pending' ? 'warning' : s === 'failed' ? 'danger' : 'neutral';
}

export default function PaymentsPage() {
  const ready = useRequireAuth();
  const [email, setEmail] = useState<string>();
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const me = await auth.me(); setEmail(me.email);
        setOrders(await api.get<UserOrder[]>('/orders/mine').catch(() => []));
      } finally { setLoading(false); }
    })();
  }, [ready]);

  if (!ready) return null;

  const paid = orders.filter((o) => o.status === 'paid');
  const totalSpent = paid.reduce((sum, o) => sum + o.amount_minor, 0);

  function receipt(o: UserOrder) {
    const lines = [
      'RECEIPT', '========', '',
      `Item:     ${o.item_title ?? o.item_type}`,
      `Amount:   ${money(o.amount_minor, o.currency)}`,
      `Status:   ${o.status}`,
      `Date:     ${new Date(o.created_at).toLocaleString()}`,
      o.receipt ? `Ref:      ${o.receipt}` : '',
      o.invoice_number ? `Invoice:  ${o.invoice_number}` : '',
    ].filter(Boolean).join('\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `receipt-${o.id.slice(0, 8)}.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell email={email}>
      <header className="page-head">
        <span className="eyebrow">Billing</span>
        <h1>Payment history</h1>
        <p className="muted">Your course and program purchases, receipts, and invoices.</p>
      </header>

      <div className="pay-tiles">
        <Card className="pt">
          <div className="pt-icon"><CreditCard size={20} /></div>
          <div><div className="pt-val">{money(totalSpent)}</div><div className="pt-lab">Total paid</div></div>
        </Card>
        <Card className="pt">
          <div className="pt-icon"><Receipt size={20} /></div>
          <div><div className="pt-val">{paid.length}</div><div className="pt-lab">Purchases</div></div>
        </Card>
      </div>

      {loading ? <Skeleton height="12rem" /> : orders.length === 0 ? (
        <Card><EmptyState icon={<Receipt size={36} />} title="No payments yet"
          body="When you purchase a paid course or program, it'll appear here with a downloadable receipt." /></Card>
      ) : (
        <Table columns={['Item', 'Amount', 'Status', 'Date', 'Receipt']}>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.item_title ?? o.item_type}</td>
              <td>{money(o.amount_minor, o.currency)}</td>
              <td><Badge tone={statusTone(o.status)}>{o.status}</Badge></td>
              <td>{new Date(o.created_at).toLocaleDateString()}</td>
              <td>{o.status === 'paid'
                ? <button className="receipt-btn" onClick={() => receipt(o)}>Download</button>
                : <span className="faint">—</span>}</td>
            </tr>
          ))}
        </Table>
      )}

      <style jsx>{`
        .page-head { margin-bottom: 1.75rem; }
        .page-head h1 { margin-top: 0.3rem; }
        .pay-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1.25rem; margin-bottom: 1.5rem; }
        :global(.pt) { padding: 1.3rem; display: flex; align-items: center; gap: 1rem; }
        .pt-icon { width: 2.6rem; height: 2.6rem; border-radius: 10px; background: var(--accent-soft); color: var(--accent);
          display: grid; place-items: center; flex-shrink: 0; }
        .pt-val { font-family: var(--serif); font-size: 1.5rem; font-weight: 600; color: var(--ink); line-height: 1; }
        .pt-lab { font-size: 0.78rem; color: var(--ink-faint); margin-top: 0.3rem; }
        .receipt-btn { background: none; border: none; color: var(--accent); font-weight: 600; cursor: pointer; font-size: 0.85rem; padding: 0; }
        .receipt-btn:hover { text-decoration: underline; }
      `}</style>
    </AppShell>
  );
}
