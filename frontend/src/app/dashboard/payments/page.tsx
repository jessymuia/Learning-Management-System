'use client';

import { useRequireAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';

interface Order {
  id: string;
  item_type: string;
  item_title: string;
  amount_minor: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed';
  created_at: string;
  receipt: string;
  invoice_number: string;
}

export default function PaymentHistoryPage() {
  const { user } = useRequireAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/api/orders/mine')
      .then((res) => setOrders(res.data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const downloadReceipt = (receipt: string) => {
    const link = document.createElement('a');
    link.href = `/api/receipts/${receipt}`;
    link.download = `receipt-${receipt}.pdf`;
    link.click();
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Payment History</h1>
      {orders.length === 0 ? (
        <p>No payments yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Date</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Item</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Amount</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>
                  {new Date(order.created_at).toLocaleDateString()}
                </td>
                <td style={{ padding: '0.5rem' }}>{order.item_title}</td>
                <td style={{ padding: '0.5rem' }}>
                  {order.currency} {order.amount_minor / 100}
                </td>
                <td
                  style={{
                    padding: '0.5rem',
                    color:
                      order.status === 'paid'
                        ? 'green'
                        : order.status === 'failed'
                          ? 'red'
                          : 'orange',
                  }}
                >
                  {order.status.toUpperCase()}
                </td>
                <td style={{ padding: '0.5rem' }}>
                  {order.status === 'paid' && order.receipt && (
                    <button
                      onClick={() => downloadReceipt(order.receipt)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      Download Receipt
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
