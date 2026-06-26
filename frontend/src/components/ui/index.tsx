'use client';
import { ReactNode, useEffect } from 'react';

/* ────────────────────────────────────────────────────────────
   A small, consistent component library — the building blocks
   every page composes from, so the whole app shares one polished
   visual language instead of bespoke styles per page.
   ──────────────────────────────────────────────────────────── */

/* ── Card ── */
export function Card({ children, hover, className = '', ...rest }: { children: ReactNode; hover?: boolean; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-card ${hover ? 'ui-card-hover' : ''} ${className}`} {...rest}>{children}</div>;
}

/* ── Button ── */
export function Button({
  children, variant = 'primary', size = 'md', className = '', ...rest
}: { children: ReactNode; variant?: 'primary' | 'ghost' | 'danger'; size?: 'sm' | 'md' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`ui-btn ui-btn-${variant} ui-btn-${size} ${className}`} {...rest}>{children}</button>;
}

/* ── Badge ── */
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'success' | 'neutral' | 'warning' | 'danger' | 'info' }) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>;
}

/* ── Input + Field ── */
export function Field({ label, children, hint }: { label?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="ui-field">
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="ui-field-hint">{hint}</span>}
    </div>
  );
}
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`ui-input ${props.className ?? ''}`} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`ui-input ${props.className ?? ''}`} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`ui-input ${props.className ?? ''}`} />;
}

/* ── SearchInput ── */
export function SearchInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="ui-search">
      <svg className="ui-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
      </svg>
      <input className="ui-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

/* ── Table ── */
export function Table({ columns, children }: { columns: string[]; children: ReactNode }) {
  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* ── EmptyState ── */
export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="ui-empty">
      {icon && <div className="ui-empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {body && <p className="ui-muted">{body}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}

/* ── Alert ── */
export function Alert({ tone = 'info', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  return <div className={`ui-alert ui-alert-${tone}`}>{children}</div>;
}

/* ── Modal / Dialog ── */
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ui-modal-backdrop" onClick={onClose}>
      <div className="ui-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ui-modal-head">
          <h2>{title}</h2>
          <button className="ui-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Skeleton ── */
export function Skeleton({ height = '1rem', width = '100%' }: { height?: string; width?: string }) {
  return <div className="ui-skeleton" style={{ height, width }} />;
}

/* ── shared styles for all primitives (injected once) ── */
export function UIStyles() {
  return (
    <style jsx global>{`
      .ui-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
        box-shadow: var(--shadow-sm); transition: box-shadow 0.18s ease, transform 0.18s ease, border-color 0.18s ease; }
      .ui-card-hover { cursor: pointer; }
      .ui-card-hover:hover { box-shadow: var(--shadow); transform: translateY(-2px); border-color: #d4dbe8; }

      .ui-btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem;
        font-family: var(--sans); font-weight: 600; border: 1px solid transparent; cursor: pointer;
        border-radius: var(--radius-sm); transition: all 0.15s ease; white-space: nowrap; }
      .ui-btn:active { transform: translateY(1px); }
      .ui-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .ui-btn-md { padding: 0.6rem 1.1rem; font-size: 0.9rem; }
      .ui-btn-sm { padding: 0.4rem 0.8rem; font-size: 0.82rem; }
      .ui-btn-primary { background: var(--accent); color: #fff; box-shadow: 0 2px 8px rgba(53,99,214,0.22); }
      .ui-btn-primary:hover { background: var(--accent-deep); box-shadow: 0 4px 14px rgba(53,99,214,0.3); }
      .ui-btn-ghost { background: var(--surface); color: var(--ink); border-color: var(--line); }
      .ui-btn-ghost:hover { background: var(--surface-sunken); border-color: var(--ink-faint); }
      .ui-btn-danger { background: var(--surface); color: var(--rose); border-color: rgba(194,69,58,0.3); }
      .ui-btn-danger:hover { background: rgba(194,69,58,0.08); }

      .ui-badge { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; font-weight: 600;
        padding: 0.22rem 0.6rem; border-radius: 999px; letter-spacing: 0.01em; }
      .ui-badge-success { background: rgba(63,130,104,0.13); color: var(--sage); }
      .ui-badge-neutral { background: var(--surface-sunken); color: var(--ink-faint); }
      .ui-badge-warning { background: rgba(192,138,43,0.15); color: var(--gold); }
      .ui-badge-danger { background: rgba(194,69,58,0.12); color: var(--rose); }
      .ui-badge-info { background: var(--accent-soft); color: var(--accent-deep); }

      .ui-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1rem; }
      .ui-field label { font-size: 0.82rem; font-weight: 600; color: var(--ink-soft); }
      .ui-field-hint { font-size: 0.76rem; color: var(--ink-faint); }
      .ui-input { font-family: var(--sans); font-size: 0.92rem; padding: 0.6rem 0.8rem;
        border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink);
        width: 100%; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
      .ui-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(53,99,214,0.14); }

      .ui-search { position: relative; flex: 1; }
      .ui-search-icon { position: absolute; left: 0.8rem; top: 50%; transform: translateY(-50%); color: var(--ink-faint); }
      .ui-search .ui-input { padding-left: 2.3rem; }

      .ui-table-wrap { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
        overflow: hidden; box-shadow: var(--shadow-sm); }
      .ui-table { width: 100%; border-collapse: collapse; }
      .ui-table th { text-align: left; padding: 0.8rem 1.1rem; background: var(--surface-sunken);
        font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-faint); font-weight: 700; }
      .ui-table td { padding: 0.8rem 1.1rem; border-top: 1px solid var(--line); font-size: 0.9rem; }
      .ui-table tbody tr { transition: background 0.12s ease; }
      .ui-table tbody tr:hover { background: var(--surface-sunken); }

      .ui-empty { text-align: center; padding: 3.5rem 2rem; }
      .ui-empty-icon { color: var(--ink-faint); opacity: 0.5; margin-bottom: 0.85rem; display: flex; justify-content: center; }
      .ui-empty h3 { margin-bottom: 0.4rem; }
      .ui-empty-action { margin-top: 1.25rem; }

      .ui-alert { padding: 0.7rem 0.95rem; border-radius: var(--radius-sm); font-size: 0.88rem; margin-bottom: 1.25rem; }
      .ui-alert-error { background: rgba(194,69,58,0.09); color: var(--rose); border: 1px solid rgba(194,69,58,0.2); }
      .ui-alert-success { background: rgba(63,130,104,0.1); color: var(--sage); border: 1px solid rgba(63,130,104,0.2); }
      .ui-alert-info { background: var(--accent-soft); color: var(--accent-deep); border: 1px solid rgba(53,99,214,0.18); }

      .ui-modal-backdrop { position: fixed; inset: 0; background: rgba(22,28,45,0.45); backdrop-filter: blur(2px);
        display: grid; place-items: center; z-index: 100; padding: 1.5rem; animation: uiFade 0.15s ease; }
      .ui-modal { background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow-lg);
        width: 100%; max-width: 30rem; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column;
        animation: uiPop 0.18s ease; }
      .ui-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem;
        border-bottom: 1px solid var(--line); }
      .ui-modal-head h2 { font-size: 1.2rem; }
      .ui-modal-x { background: none; border: none; font-size: 1.6rem; line-height: 1; color: var(--ink-faint);
        cursor: pointer; padding: 0; width: 2rem; height: 2rem; border-radius: 6px; }
      .ui-modal-x:hover { background: var(--surface-sunken); color: var(--ink); }
      .ui-modal-body { padding: 1.5rem; overflow-y: auto; }
      .ui-modal-foot { padding: 1rem 1.5rem; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 0.6rem; }

      .ui-skeleton { background: linear-gradient(90deg, var(--surface-sunken) 25%, #e8ecf3 50%, var(--surface-sunken) 75%);
        background-size: 200% 100%; animation: uiShimmer 1.4s infinite; border-radius: var(--radius-sm); }

      .ui-muted { color: var(--ink-soft); }
      @keyframes uiShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
      @keyframes uiFade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes uiPop { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
    `}</style>
  );
}
