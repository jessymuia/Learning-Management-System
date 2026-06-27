'use client';

import { useRequireAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CheckoutPage({ params }: { params: { id: string } }) {
  useRequireAuth();
  const router = useRouter();
  const [provider, setProvider] = useState('stripe');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    try {
      setLoading(true);
      const res = await api.post<{ order: { id: string; status: string; amount_minor: number }; item: any }>(
        '/checkout/initiate',
        {
          itemType: 'course',
          itemId: params.id,
          provider,
        }
      );

      setOrder(res);

      if (provider === 'mpesa') {
        // Trigger M-Pesa STK push
        await triggerMpesaStkPush(res);
      } else if (provider === 'stripe') {
        // Redirect to Stripe checkout
        window.location.href = `/api/checkout/stripe?orderId=${res.order.id}`;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const triggerMpesaStkPush = async (data: any) => {
    try {
      await api.post('/checkout/mpesa-stk', {
        orderId: data.order.id,
        phoneNumber: prompt('Enter M-Pesa phone number:'),
      });
      alert('STK push sent to your phone');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="checkout-page" style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
      <h1>Checkout</h1>
      {order && (
        <div style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ccc' }}>
          <h2>{order.item.fullname || order.item.title}</h2>
          <p>Amount: KES {order.order.amount_minor / 100}</p>
          <p>Status: {order.order.status}</p>
        </div>
      )}

      {!order && (
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <label>
              <input
                type="radio"
                value="stripe"
                checked={provider === 'stripe'}
                onChange={(e) => setProvider(e.target.value)}
              />
              Stripe (Card)
            </label>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label>
              <input
                type="radio"
                value="mpesa"
                checked={provider === 'mpesa'}
                onChange={(e) => setProvider(e.target.value)}
              />
              M-Pesa
            </label>
          </div>
          <div>
            <label>
              <input
                type="radio"
                value="manual"
                checked={provider === 'manual'}
                onChange={(e) => setProvider(e.target.value)}
              />
              Manual (Admin Approval)
            </label>
          </div>

          {error && <p style={{ color: 'red', marginTop: '1rem' }}>{error}</p>}

          <button
            onClick={handleCheckout}
            disabled={loading}
            style={{
              marginTop: '2rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Processing...' : `Proceed to ${provider}`}
          </button>
        </div>
      )}
    </div>
  );
}
