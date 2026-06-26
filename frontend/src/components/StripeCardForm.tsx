'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * StripeCardForm — mounts Stripe.js Card Element and confirms the PaymentIntent
 * with the client_secret from our backend. Card data never touches our server.
 * Loads Stripe.js from the CDN at runtime (no build dependency).
 */
declare global {
  interface Window { Stripe?: (key: string) => unknown }
}

export function StripeCardForm({
  clientSecret, publishableKey, amountLabel, onSuccess,
}: {
  clientSecret: string;
  publishableKey: string;
  amountLabel: string;
  onSuccess: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [stripe, setStripe] = useState<any>(null);
  const [card, setCard] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // load Stripe.js once
  useEffect(() => {
    if (window.Stripe) { setStripe(window.Stripe(publishableKey)); return; }
    const s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3/';
    s.onload = () => { if (window.Stripe) setStripe(window.Stripe(publishableKey)); };
    document.body.appendChild(s);
  }, [publishableKey]);

  // mount the card element
  useEffect(() => {
    if (!stripe || !cardRef.current || card) return;
    const elements = (stripe as any).elements();
    const c = elements.create('card', { style: { base: { fontSize: '16px' } } });
    c.mount(cardRef.current);
    c.on('ready', () => setReady(true));
    setCard(c);
  }, [stripe, card]);

  async function confirm() {
    if (!stripe || !card) return;
    setBusy(true);
    setError(null);
    try {
      const result = await (stripe as any).confirmCardPayment(clientSecret, {
        payment_method: { card },
      });
      if (result.error) {
        setError(result.error.message || 'Payment failed.');
      } else if (result.paymentIntent?.status === 'succeeded') {
        onSuccess();
      } else {
        setError('Payment not completed. Please try again.');
      }
    } catch {
      setError('Could not process the payment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stripe-form">
      <label className="card-label">Card details</label>
      <div ref={cardRef} className="card-element" />
      {error && <div className="card-error">{error}</div>}
      <button className="btn btn-primary pay-btn" onClick={confirm} disabled={!ready || busy}>
        {busy ? 'Processing…' : `Pay ${amountLabel}`}
      </button>
      <p className="secure-note">🔒 Card details are sent directly to Stripe and never touch our servers.</p>

      <style jsx>{`
        .stripe-form { margin-top: 0.5rem; }
        .card-label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; }
        .card-element { padding: 0.85rem 1rem; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
        .card-error { color: var(--rose); font-size: 0.85rem; margin-top: 0.6rem; }
        .pay-btn { width: 100%; margin-top: 1rem; }
        .secure-note { font-size: 0.75rem; color: var(--ink-faint); margin-top: 0.75rem; text-align: center; }
      `}</style>
    </div>
  );
}
