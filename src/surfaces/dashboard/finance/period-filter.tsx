// Export period for finance tables: all time, this month, last 30 days, or a custom range (Arabic digits accepted).
// The chosen dates live in the URL (`from`/`to`) so the CSV always matches what the table shows.
import { useState } from 'react';
import { Segmented, useTx } from '../../../ds/ui';
import { CustomRange } from '../analytics/period';
import { TODAY, addDays, range as mkRange } from '../analytics/range';

/** Finance periods include today: pending sales captured today are part of the ledger. */
const preset = (p: 'mtd' | '30') => (p === 'mtd' ? mkRange(`${TODAY.slice(0, 8)}01`, TODAY) : mkRange(addDays(TODAY, -29), TODAY));

type P = 'all' | 'mtd' | '30' | 'custom';
export function periodPreset(from: string, to: string): P {
  if (!from && !to) return 'all';
  const m = preset('mtd'), d = preset('30');
  if (from === m.from && to === m.to) return 'mtd';
  if (from === d.from && to === d.to) return '30';
  return 'custom';
}

export function PeriodFilter({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const tx = useTx();
  const cur = periodPreset(from, to);
  const [custom, setCustom] = useState(cur === 'custom');
  const value: P = custom ? 'custom' : cur;
  const pick = (p: P) => {
    if (p === 'custom') { setCustom(true); return; }
    setCustom(false);
    if (p === 'all') onChange('', '');
    else { const r = preset(p); onChange(r.from, r.to); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="max-w-full overflow-x-auto scrollbar-thin [&_button]:whitespace-nowrap">
        <Segmented label={tx('الفترة', 'Period')} value={value} onChange={pick}
          options={[{ value: 'all', label: tx('الكل', 'All') }, { value: 'mtd', label: tx('هذا الشهر', 'This month') }, { value: '30', label: tx('30 يومًا', '30 days') }, { value: 'custom', label: tx('مخصص', 'Custom') }]} />
      </div>
      {value === 'custom' && <CustomRange max={TODAY} value={mkRange(from || addDays(TODAY, -29), to || TODAY)} onApply={(r) => onChange(r.from, r.to)} />}
    </div>
  );
}
