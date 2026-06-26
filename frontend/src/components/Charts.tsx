'use client';
import React from 'react';

type Point = { label: string; value: number };

/** Simple bar chart — no dependencies, themes to --accent. */
export function BarChart({ data, height = 180, format }: { data: Point[]; height?: number; format?: (n: number) => string }) {
  if (!data || data.length === 0) return <Empty />;
  const max = Math.max(...data.map((d) => d.value), 1);
  const fmt = format ?? ((n: number) => String(n));

  return (
    <div className="chart">
      <div className="bars" style={{ height }}>
        {data.map((d, i) => {
          const h = max > 0 ? (d.value / max) * 100 : 0;
          return (
            <div key={i} className="bar-col">
              <div className="bar-wrap">
                <span className="bar-val">{fmt(d.value)}</span>
                <div className="bar" style={{ height: `${h}%` }} />
              </div>
              <span className="bar-label">{d.label}</span>
            </div>
          );
        })}
      </div>
      <style jsx>{chartCss}</style>
    </div>
  );
}

/** Line chart via SVG polyline — no dependencies. */
export function LineChart({ data, height = 180, format }: { data: Point[]; height?: number; format?: (n: number) => string }) {
  if (!data || data.length === 0) return <Empty />;
  if (data.length === 1) return <BarChart data={data} height={height} format={format} />;
  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 600;
  const pad = 24;
  const stepX = (w - pad * 2) / (data.length - 1);
  const pts = data.map((d, i) => {
    const x = pad + i * stepX;
    const y = height - pad - (max > 0 ? (d.value / max) * (height - pad * 2) : 0);
    return { x, y, d };
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area = `${path} L ${pts[pts.length - 1].x} ${height - pad} L ${pts[0].x} ${height - pad} Z`;
  const fmt = format ?? ((n: number) => String(n));

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${w} ${height}`} className="line-svg" preserveAspectRatio="none">
        <path d={area} className="line-area" />
        <path d={path} className="line-path" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3.5} className="line-dot" />
            <text x={p.x} y={height - 6} className="line-label" textAnchor="middle">{p.d.label}</text>
            <text x={p.x} y={p.y - 8} className="line-val" textAnchor="middle">{fmt(p.d.value)}</text>
          </g>
        ))}
      </svg>
      <style jsx>{chartCss}</style>
    </div>
  );
}

/** Donut for a 2-part breakdown. */
export function Donut({ a, b, labelA, labelB }: { a: number; b: number; labelA: string; labelB: string }) {
  const total = a + b;
  if (total === 0) return <Empty />;
  const pctA = (a / total) * 100;
  const r = 54, c = 2 * Math.PI * r;
  const dashA = (pctA / 100) * c;

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" className="donut">
        <circle cx="70" cy="70" r={r} className="donut-bg" />
        <circle cx="70" cy="70" r={r} className="donut-fg"
          strokeDasharray={`${dashA} ${c - dashA}`} strokeDashoffset={c / 4} transform="rotate(-90 70 70)" />
        <text x="70" y="66" className="donut-pct" textAnchor="middle">{Math.round(pctA)}%</text>
        <text x="70" y="84" className="donut-sub" textAnchor="middle">{labelA}</text>
      </svg>
      <div className="donut-legend">
        <div><span className="dot dot-a" />{labelA}: <strong>{a}</strong></div>
        <div><span className="dot dot-b" />{labelB}: <strong>{b}</strong></div>
      </div>
      <style jsx>{chartCss}</style>
    </div>
  );
}

function Empty() {
  return <div className="chart-empty">No data yet</div>;
}

const chartCss = `
  .chart { width: 100%; }
  .bars { display: flex; align-items: flex-end; gap: 0.75rem; padding-top: 1.5rem; }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; height: 100%; justify-content: flex-end; }
  .bar-wrap { width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; flex: 1; position: relative; }
  .bar { width: 70%; max-width: 3rem; background: linear-gradient(180deg, var(--accent), var(--accent-deep)); border-radius: 6px 6px 0 0; min-height: 2px; transition: height 0.4s ease; }
  .bar-val { font-size: 0.72rem; font-weight: 600; color: var(--ink-soft); margin-bottom: 0.3rem; }
  .bar-label { font-size: 0.74rem; color: var(--ink-faint); white-space: nowrap; }
  .line-svg { width: 100%; height: auto; overflow: visible; }
  .line-area { fill: var(--accent-soft); opacity: 0.5; }
  .line-path { fill: none; stroke: var(--accent); stroke-width: 2.5; }
  .line-dot { fill: var(--accent); }
  .line-label { fill: var(--ink-faint); font-size: 11px; }
  .line-val { fill: var(--ink-soft); font-size: 10px; font-weight: 600; }
  .chart-empty { padding: 2rem; text-align: center; color: var(--ink-faint); font-size: 0.88rem; }
  .donut-wrap { display: flex; align-items: center; gap: 1.5rem; }
  .donut { width: 8rem; height: 8rem; flex-shrink: 0; }
  .donut-bg { fill: none; stroke: var(--surface-sunken); stroke-width: 14; }
  .donut-fg { fill: none; stroke: var(--accent); stroke-width: 14; stroke-linecap: round; transition: stroke-dasharray 0.5s ease; }
  .donut-pct { font-size: 22px; font-weight: 700; fill: var(--ink); }
  .donut-sub { font-size: 9px; fill: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.05em; }
  .donut-legend { display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.88rem; color: var(--ink-soft); }
  .donut-legend .dot { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 3px; margin-right: 0.5rem; }
  .dot-a { background: var(--accent); }
  .dot-b { background: var(--surface-sunken); border: 1px solid var(--line); }
`;
