'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ShieldCheck, ShieldX, Award, Loader2 } from 'lucide-react';

type Verified = {
  verification_code: string;
  issued_at: string;
  revoked_at: string | null;
  type: string;
  name: string;
  holder: string;
  org_name?: string; org_color?: string;
};

export default function VerifyPage() {
  const params = useParams();
  const code = params.code as string;
  const [state, setState] = useState<'loading' | 'valid' | 'revoked' | 'invalid'>('loading');
  const [cred, setCred] = useState<Verified | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/verify/${encodeURIComponent(code)}`);
        if (!res.ok) { setState('invalid'); return; }
        const body = await res.json();
        const data = body.data as Verified;
        setCred(data);
        setState(data.revoked_at ? 'revoked' : 'valid');
      } catch {
        setState('invalid');
      }
    })();
  }, [code]);

  // mask the holder email for privacy: j****@domain.com
  const maskedHolder = cred?.holder
    ? cred.holder.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.max(b.length, 3)) + c)
    : '';

  return (
    <div className="verify-wrap">
      <div className="verify-card">
        <div className="brand"><Award size={20} /><span>{cred?.org_name || "Atrium"}</span></div>

        {state === 'loading' && (
          <div className="center"><Loader2 className="spin" size={28} /><p className="muted">Verifying credential…</p></div>
        )}

        {state === 'valid' && cred && (
          <>
            <div className="status valid"><ShieldCheck size={40} /></div>
            <h1>Credential verified</h1>
            <p className="muted">This is a genuine, currently-valid credential.</p>
            <div className="detail">
              <div className="row"><span>Credential</span><strong>{cred.name}</strong></div>
              <div className="row"><span>Type</span><strong style={{ textTransform: 'capitalize' }}>{cred.type}</strong></div>
              <div className="row"><span>Holder</span><strong>{maskedHolder}</strong></div>
              <div className="row"><span>Issued</span><strong>{new Date(cred.issued_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</strong></div>
              <div className="row"><span>Code</span><strong className="mono">{cred.verification_code}</strong></div>
            </div>
          </>
        )}

        {state === 'revoked' && cred && (
          <>
            <div className="status revoked"><ShieldX size={40} /></div>
            <h1>Credential revoked</h1>
            <p className="muted">This credential was issued but has since been revoked and is no longer valid.</p>
            <div className="detail">
              <div className="row"><span>Credential</span><strong>{cred.name}</strong></div>
              <div className="row"><span>Code</span><strong className="mono">{cred.verification_code}</strong></div>
            </div>
          </>
        )}

        {state === 'invalid' && (
          <>
            <div className="status invalid"><ShieldX size={40} /></div>
            <h1>Not found</h1>
            <p className="muted">No credential matches this verification code. It may be mistyped or never issued.</p>
            <div className="detail"><div className="row"><span>Code checked</span><strong className="mono">{code}</strong></div></div>
          </>
        )}

        <p className="foot">Credential verification · Atrium LMS</p>
      </div>

      <style jsx>{`
        .verify-wrap { min-height: 100vh; display: grid; place-items: center; padding: 1.5rem;
          background: linear-gradient(160deg, #eef2ff, #f9fafb 60%); }
        .verify-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 18px; box-shadow: 0 16px 48px rgba(17,24,39,0.1);
          width: 100%; max-width: 30rem; padding: 2.5rem; text-align: center; }
        .brand { display: flex; align-items: center; justify-content: center; gap: 0.5rem; color: #4f46e5; font-weight: 700;
          font-size: 1.15rem; margin-bottom: 1.75rem; }
        .center { padding: 2rem 0; }
        .spin { animation: spin 1s linear infinite; color: #4f46e5; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .status { width: 4.5rem; height: 4.5rem; border-radius: 50%; display: grid; place-items: center; margin: 0 auto 1.25rem; }
        .status.valid { background: rgba(5,150,105,0.12); color: #059669; }
        .status.revoked { background: rgba(217,119,6,0.12); color: #d97706; }
        .status.invalid { background: rgba(220,38,38,0.1); color: #dc2626; }
        h1 { font-size: 1.5rem; font-weight: 700; color: #111827; margin-bottom: 0.4rem; letter-spacing: -0.02em; }
        .muted { color: #6b7280; font-size: 0.92rem; margin-bottom: 1.5rem; }
        .detail { text-align: left; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 0.5rem 1rem; }
        .row { display: flex; justify-content: space-between; gap: 1rem; padding: 0.7rem 0; border-bottom: 1px solid #eef1f6; font-size: 0.9rem; }
        .row:last-child { border-bottom: none; }
        .row span { color: #6b7280; }
        .row strong { color: #111827; text-align: right; }
        .mono { font-family: 'SF Mono', ui-monospace, monospace; font-size: 0.82rem; }
        .foot { margin-top: 1.5rem; font-size: 0.76rem; color: #9ca3af; }
      `}</style>
    </div>
  );
}
