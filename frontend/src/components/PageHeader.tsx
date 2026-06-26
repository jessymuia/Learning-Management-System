'use client';
import { ReactNode } from 'react';

/**
 * PageHeader — a consistent page title block used across the app.
 * eyebrow (small label), title, optional subtitle, optional right-side action.
 */
export function PageHeader({
  eyebrow, title, subtitle, action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="ph-text">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p className="muted ph-sub">{subtitle}</p>}
      </div>
      {action && <div className="ph-action">{action}</div>}

      <style jsx>{`
        .page-header {
          display: flex; align-items: flex-end; justify-content: space-between;
          gap: 1rem; margin-bottom: 1.75rem; flex-wrap: wrap;
          padding-bottom: 1.25rem; border-bottom: 1px solid var(--line);
        }
        .ph-text { display: flex; flex-direction: column; gap: 0.3rem; }
        h1 { margin-top: 0.25rem; }
        .ph-sub { font-size: 0.92rem; margin-top: 0.15rem; }
        .ph-action { display: flex; gap: 0.6rem; align-items: center; }
      `}</style>
    </header>
  );
}
