// Charts for the LAK design system. Accessible by construction: every point is focusable with its value,
// and each chart can switch to a plain table.
import { useId, useState } from 'react';
import { cn, useTx } from './ui';

export interface Point { key: string; label: string; value: number }

/** Smooth area chart with a brand gradient, hover/focus readout and a table alternative. */
export function AreaChart({ points, format, height = 220, rtl }: { points: Point[]; format: (v: number) => string; height?: number; rtl?: boolean }) {
  const tx = useTx();
  const gid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const W = 640, H = height, P = 6;
  const max = Math.max(1, ...points.map((p) => p.value)) * 1.12;
  const x = (i: number) => P + (i / Math.max(1, points.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - 8 - (v / max) * (H - 24);
  const pts = points.map((p, i) => [x(i), y(p.value)] as const);
  const line = pts.reduce((acc, [px, py], i) => {
    if (i === 0) return `M${px},${py}`;
    const [qx, qy] = pts[i - 1]; const cx = (qx + px) / 2;
    return `${acc} C${cx},${qy} ${cx},${py} ${px},${py}`;
  }, '');
  const h = hover === null ? null : points[hover];
  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-h-[44px]">
          <p className="text-xs text-muted">{h ? h.label : tx('اختر يومًا لرؤية قيمته', 'Hover a day to see its value')}</p>
          <p className="text-xl font-bold tabular-nums text-fg">{h ? format(h.value) : ' '}</p>
        </div>
        <button type="button" onClick={() => setTable((t) => !t)} className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
          {table ? tx('عرض كرسم', 'Show as chart') : tx('عرض كجدول', 'Show as table')}
        </button>
      </div>
      {table ? (
        <div className="max-h-[260px] overflow-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-xs text-muted"><tr><th className="px-3 py-2 text-start font-semibold">{tx('اليوم', 'Day')}</th><th className="px-3 py-2 text-end font-semibold">{tx('القيمة', 'Value')}</th></tr></thead>
            <tbody>{points.map((p) => <tr key={p.key} className="border-t border-border"><td className="px-3 py-2">{p.label}</td><td className="px-3 py-2 text-end tabular-nums">{format(p.value)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="relative" style={{ height: H }} onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn('absolute inset-0 h-full w-full overflow-visible', rtl && '-scale-x-100')} aria-hidden="true">
            <defs>
              <linearGradient id={`a${gid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.22" /><stop offset="100%" stopColor="var(--color-sky-500)" stopOpacity="0" /></linearGradient>
              <linearGradient id={`l${gid}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="var(--color-sky-500)" /><stop offset="100%" stopColor="var(--color-brand-600)" /></linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--border)" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" />)}
            <path d={`${line} L${x(points.length - 1)},${H} L${x(0)},${H} Z`} fill={`url(#a${gid})`} />
            <path d={line} fill="none" stroke={`url(#l${gid})`} strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {hover !== null && <line x1={pts[hover][0]} x2={pts[hover][0]} y1="0" y2={H} stroke="var(--color-brand-400)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />}
          </svg>
          <div className="absolute inset-0 flex">
            {points.map((p, i) => (
              <button key={p.key} type="button" className="relative flex-1 focus-visible:outline-none" aria-label={`${p.label}: ${format(p.value)}`}
                onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
                {hover === i && <span className="absolute start-1/2 size-3 -translate-x-1/2 rounded-full border-[3px] border-brand-600 bg-surface shadow rtl:translate-x-1/2" style={{ top: `calc(${(y(p.value) / H) * 100}% - 6px)` }} />}
              </button>
            ))}
          </div>
        </div>
      )}
      {!table && points.length > 1 && <div className="mt-2 flex justify-between text-xs text-subtle"><span>{points[0].label}</span><span>{points[points.length - 1].label}</span></div>}
    </div>
  );
}
