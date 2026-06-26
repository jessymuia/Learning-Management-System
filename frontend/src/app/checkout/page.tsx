'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/useAuth';
import { AppShell } from '@/components/AppShell';
import { api, auth, ApiException } from '@/lib/api';
import { StripeCardForm } from '@/components/StripeCardForm';

type Order = { id: string; amount_minor: number; currency: string; status: string };
type Intent = { order_id: string; provider: string; amount_minor: number; currency: string; next: string };

function CheckoutInner() {
  const ready = useRequireAuth();
  const sp = useSearchParams();
  const itemType = sp.get('type') || 'course';   // course | program
  const itemId = sp.get('id') || '';
  const title = sp.get('title') || 'Your purchase';

  const [email, setEmail] = useState<string>();
  const [order, setOrder] = useState<Order | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [stripeSecret, setStripeSecret] = useState<string | null>(null);
  const [stripePubKey, setStripePubKey] = useState<string | null>(null);
  const [provider, setProvider] = useState('mpesa');
  const [phone, setPhone] = useState('');
  const [stage, setStage] = useState<'review' | 'paying' | 'done'>('review');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [pubKey, setPubKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    auth.me().then((m) => setEmail(m.email));
  }, [ready]);

  async function createOrder() {
    setError(null);
    try {
      const o = await api.post<Order>('/orders', { itemType, itemId });
      setOrder(o);
      return o;
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not create order.');
      return null;
    }
  }

  async function pay() {
    setError(null);
    const o = order ?? await createOrder();
    if (!o) return;
    setStage('paying');
    try {
      let i: Intent;
      if (provider === 'stripe') {
        // card: get a Stripe client_secret, then mount the Stripe card form
        const res = await api.post<Intent & { stripe?: { client_secret?: string; publishable_key?: string; configured?: boolean } }>(
          `/orders/${o.id}/stripe-intent`, {});
        i = res;
        if (res.stripe?.client_secret) setClientSecret(res.stripe.client_secret);
        if (res.stripe?.publishable_key) setPubKey(res.stripe.publishable_key);
      } else {
        // mpesa: fire the STK push to the phone
        i = await api.post<Intent>(`/orders/${o.id}/payment-intent`, { provider, phone });
      }
      setIntent(i);
      // In production: hand the intent to the provider SDK here.
      //  - mpesa  → trigger STK push to `phone`, then poll order status
      //  - stripe → confirm card payment with the returned client secret
      // The provider webhook calls /orders/{id}/payments to finalize + enrol.
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Could not start payment.');
      setStage('review');
    }
  }

  if (!ready) return null;
  const amount = order ? `${order.currency} ${(order.amount_minor / 100).toLocaleString()}` : '—';

  return (
    <AppShell email={email}>
      <a href="/courses" className="back">← Back</a>
      <header className="page-head"><span className="eyebrow">Checkout</span><h1>{title}</h1></header>

      {error && <div className="alert" role="alert">{error}</div>}

      <div className="checkout-grid">
        <section className="card pay-card">
          {stage === 'done' ? (
            <div className="done">
              <div className="check" aria-hidden>✓</div>
              <h2>Payment complete</h2>
              <p className="muted">You’re enrolled. Head to your courses to start learning.</p>
              <a href="/courses" className="btn btn-primary" style={{ marginTop: '1rem' }}>Go to my courses</a>
            </div>
          ) : stage === 'paying' && intent ? (
            <div className="paying">
              <h2>Complete your payment</h2>
              {provider === 'stripe' && clientSecret && pubKey ? (
                <StripeCardForm
                  clientSecret={clientSecret}
                  publishableKey={pubKey}
                  amountLabel={`${intent.currency} ${(intent.amount_minor / 100).toLocaleString()}`}
                  onSuccess={() => setStage('done')}
                />
              ) : intent.next === 'stk_push' ? (
                <>
                  <p className="muted">An M-Pesa prompt has been sent{phone ? ` to ${phone}` : ''}. Enter your PIN on your phone to confirm.</p>
                  <div className="amount-line">Amount due: <strong>{intent.currency} {(intent.amount_minor / 100).toLocaleString()}</strong></div>
                  <p className="faint small">Waiting for confirmation… (updates automatically when the provider confirms.)</p>
                  <button className="btn btn-ghost" onClick={() => setStage('done')} style={{ marginTop: '1rem' }}>
                    Simulate successful payment
                  </button>
                </>
              ) : (
                <p className="muted">Card payments aren’t configured yet.</p>
              )}
            </div>
          ) : (
            <>
              <h2>Payment method</h2>
              <div className="methods">
                <label className={`method ${provider === 'mpesa' ? 'sel' : ''}`}>
                  <input type="radio" checked={provider === 'mpesa'} onChange={() => setProvider('mpesa')} />
                  <span>M-Pesa</span>
                </label>
                <label className={`method ${provider === 'stripe' ? 'sel' : ''}`}>
                  <input type="radio" checked={provider === 'stripe'} onChange={() => setProvider('stripe')} />
                  <span>Card (Stripe)</span>
                </label>
              </div>
              {provider === 'mpesa' && (
                <div className="field">
                  <label htmlFor="phone">M-Pesa phone number</label>
                  <input id="phone" className="input" placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              )}
              <button className="btn btn-primary pay-btn" onClick={pay}>Pay {amount !== '—' ? amount : 'now'}</button>
            </>
          )}
        </section>

        <aside className="card summary">
          <h3>Order summary</h3>
          <div className="sum-row"><span>{title}</span><span>{amount}</span></div>
          <div className="sum-divider" />
          <div className="sum-row total"><span>Total</span><span>{amount}</span></div>
          {!order && <button className="link-btn" onClick={createOrder} style={{ marginTop: '0.75rem' }}>Calculate price</button>}
        </aside>
      </div>

      <style jsx>{`
        .back { font-size: 0.85rem; color: var(--accent); font-weight: 600; display: inline-block; margin-bottom: 1.25rem; }
        .page-head { margin-bottom: 1.75rem; } .page-head h1 { margin-top: 0.3rem; }
        .alert { background: rgba(168,68,58,0.09); color: var(--rose); padding: 0.7rem 1rem; border-radius: var(--radius-sm); margin-bottom: 1.25rem; font-size: 0.88rem; }
        .checkout-grid { display: grid; grid-template-columns: 1fr 18rem; gap: 1.5rem; align-items: start; }
        .pay-card, .summary { padding: 1.6rem; }
        .pay-card h2 { margin-bottom: 1rem; }
        .methods { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.25rem; }
        .method { display: flex; align-items: center; gap: 0.6rem; padding: 0.8rem 1rem; border: 1px solid var(--line); border-radius: var(--radius-sm); cursor: pointer; }
        .method.sel { border-color: var(--accent); background: rgba(37,99,168,0.05); }
        .pay-btn { width: 100%; margin-top: 0.5rem; }
        .summary h3 { margin-bottom: 1rem; }
        .sum-row { display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 0.5rem; }
        .sum-row.total { font-weight: 700; font-size: 1.05rem; }
        .sum-divider { height: 1px; background: var(--line); margin: 0.75rem 0; }
        .done { text-align: center; }
        .done .check { width: 3rem; height: 3rem; border-radius: 50%; background: var(--sage); color: #fff; display: grid; place-items: center; font-size: 1.5rem; margin: 0 auto 1rem; }
        .amount-line { margin: 1rem 0; font-size: 1rem; }
        .small { font-size: 0.78rem; }
        .link-btn { background: none; border: none; color: var(--accent); cursor: pointer; font-size: 0.85rem; padding: 0; }
        @media (max-width: 700px) { .checkout-grid { grid-template-columns: 1fr; } }
      `}</style>
    </AppShell>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutInner />
    </Suspense>
  );
}
