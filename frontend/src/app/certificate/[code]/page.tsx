'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, ShieldCheck, Loader2 } from 'lucide-react';

type Cred = {
  verification_code: string; issued_at: string; revoked_at: string | null;
  type: string; name: string; holder: string;
  org_name?: string; org_color?: string;
};

export default function CertificatePage() {
  const params = useParams();
  const code = params.code as string;
  const [cred, setCred] = useState<Cred | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/verify/${encodeURIComponent(code)}`);
        if (!res.ok) { setState('error'); return; }
        const body = await res.json();
        setCred(body.data); setState('ok');
      } catch { setState('error'); }
    })();
  }, [code]);

  const holderName = cred?.holder ? cred.holder.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';

  if (state === 'loading') return <div className="center"><Loader2 className="spin" size={28} /></div>;
  if (state === 'error' || !cred) return <div className="center"><p>Certificate not found.</p></div>;

  return (
    <div className="page">
      <div className="toolbar no-print">
        <button onClick={() => window.print()}><Download size={16} /> Download / Print PDF</button>
        <a href={`/verify/${code}`}>Verify this certificate →</a>
      </div>

      <div className="certificate" style={{ ["--cert-color" as string]: cred.org_color || "#4f46e5" }}>
        <div className="cert-border">
          <div className="cert-inner">
            <div className="cert-seal"><ShieldCheck size={32} /></div>
            <div className="cert-org">{(cred.org_name || "ATRIUM").toUpperCase()}</div>
            <div className="cert-kicker">Certificate of {cred.type === 'certificate' ? 'Completion' : cred.type}</div>
            <div className="cert-presented">This is to certify that</div>
            <div className="cert-name">{holderName}</div>
            <div className="cert-presented">has successfully earned</div>
            <div className="cert-course">{cred.name}</div>
            <div className="cert-footer">
              <div className="cert-col">
                <div className="cert-line">{new Date(cred.issued_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                <div className="cert-label">Date issued</div>
              </div>
              <div className="cert-col">
                <div className="cert-line mono">{cred.verification_code}</div>
                <div className="cert-label">Verification code · verify at /verify/{cred.verification_code}</div>
              </div>
            </div>
            {cred.revoked_at && <div className="cert-revoked">REVOKED</div>}
          </div>
        </div>
      </div>

      <style jsx global>{`
        body { background: #f3f4f6; margin: 0; }
        .center { min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, sans-serif; }
        .spin { animation: spin 1s linear infinite; color: #4f46e5; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .page { font-family: -apple-system, 'Segoe UI', sans-serif; padding: 2rem 1rem; }
        .toolbar { max-width: 900px; margin: 0 auto 1.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
        .toolbar button { display: inline-flex; align-items: center; gap: 0.5rem; background: #4f46e5; color: #fff; border: none;
          padding: 0.6rem 1.2rem; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.9rem; }
        .toolbar a { color: #4f46e5; font-weight: 600; font-size: 0.9rem; text-decoration: none; }

        .certificate { max-width: 900px; margin: 0 auto; aspect-ratio: 1.414 / 1; background: #fff;
          box-shadow: 0 16px 48px rgba(17,24,39,0.15); }
        .cert-border { height: 100%; padding: 18px; box-sizing: border-box;
          background: linear-gradient(135deg, var(--cert-color, #4f46e5), color-mix(in srgb, var(--cert-color, #4f46e5) 70%, #000)); }
        .cert-inner { height: 100%; background: #fff; box-sizing: border-box; padding: 3rem;
          display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
          border: 2px solid #e5e7eb; position: relative; }
        .cert-seal { width: 4.5rem; height: 4.5rem; border-radius: 50%; background: var(--cert-color, #4f46e5);
          color: #fff; display: grid; place-items: center; margin-bottom: 1.5rem; }
        .cert-org { font-size: 1.1rem; font-weight: 800; letter-spacing: 0.3em; color: var(--cert-color, #4f46e5); margin-bottom: 0.5rem; }
        .cert-kicker { font-size: 1.6rem; font-weight: 700; color: #111827; margin-bottom: 2rem; font-family: Georgia, serif; }
        .cert-presented { font-size: 0.9rem; color: #6b7280; margin-bottom: 0.5rem; }
        .cert-name { font-size: 2.6rem; font-weight: 700; color: var(--cert-color, #4f46e5); font-family: Georgia, serif; margin-bottom: 1.25rem;
          padding-bottom: 0.5rem; border-bottom: 2px solid #e5e7eb; }
        .cert-course { font-size: 1.4rem; font-weight: 600; color: #111827; margin-bottom: 2.5rem; }
        .cert-footer { display: flex; gap: 4rem; margin-top: auto; }
        .cert-col { text-align: center; }
        .cert-line { font-size: 0.95rem; font-weight: 600; color: #111827; padding-bottom: 0.35rem; border-bottom: 1px solid #d1d5db; min-width: 12rem; }
        .cert-label { font-size: 0.68rem; color: #9ca3af; margin-top: 0.35rem; text-transform: uppercase; letter-spacing: 0.05em; }
        .mono { font-family: 'SF Mono', ui-monospace, monospace; font-size: 0.8rem; }
        .cert-revoked { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-18deg);
          font-size: 4rem; font-weight: 800; color: rgba(220,38,38,0.25); border: 6px solid rgba(220,38,38,0.25); padding: 0.5rem 2rem; border-radius: 12px; }

        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          .page { padding: 0; }
          .certificate { box-shadow: none; max-width: 100%; }
          @page { size: landscape; margin: 0; }
        }
      `}</style>
    </div>
  );
}
