// Period controls shared by reports and finance exports: presets, a custom range (Arabic digits accepted) and,
// for reports, the comparison period. The chosen values live in the URL through the callbacks.
import { useEffect, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { Button, Segmented, cn, useTx } from '../../../ds/ui';
import { Input, Select } from '../../../ds/kit';
import { checkRange, compareRange, type CompareMode, type Range, type RangeError } from './range';

export function useDay() {
  const { lang } = useLang();
  const loc = lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB';
  return (iso: string, year = false) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(loc, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}

export function useRangeError() {
  const tx = useTx();
  return (e: RangeError) => ({
    format: tx('اكتب التاريخ هكذا 2026-11-01', 'Type dates like 2026-11-01'),
    order: tx('البداية بعد النهاية', 'Start is after end'),
    future: tx('لا يمكن اختيار يوم لم يأتِ أو لم يكتمل', 'Pick days that are complete, not future ones'),
    tooLong: tx('أقصى مدة 366 يومًا', 'At most 366 days'),
  })[e];
}

/** Two date fields and Apply. Typed text stays until applied; an invalid range is explained, never applied. */
export function CustomRange({ value, onApply, max }: { value: Range; onApply: (r: Range) => void; max?: string }) {
  const tx = useTx();
  const msg = useRangeError();
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const [err, setErr] = useState<RangeError | null>(null);
  useEffect(() => { setFrom(value.from); setTo(value.to); }, [value.from, value.to]);
  const apply = () => { const r = checkRange(from, to, max); if (!r.ok) { setErr(r.error); return; } setErr(null); onApply(r.range); };
  return (
    <form className="flex flex-wrap items-start gap-2" onSubmit={(e) => { e.preventDefault(); apply(); }}>
      <label className="sr-only" htmlFor="rng-from">{tx('من', 'From')}</label>
      <Input id="rng-from" dir="ltr" inputMode="numeric" className="w-[8.5rem]" value={from} aria-invalid={err ? true : undefined} aria-describedby={err ? 'rng-err' : undefined} onChange={(e) => { setFrom(e.target.value); setErr(null); }} placeholder="2026-11-01" />
      <span className="pt-2.5 text-sm text-muted" aria-hidden="true">–</span>
      <label className="sr-only" htmlFor="rng-to">{tx('إلى', 'To')}</label>
      <Input id="rng-to" dir="ltr" inputMode="numeric" className="w-[8.5rem]" value={to} aria-invalid={err ? true : undefined} aria-describedby={err ? 'rng-err' : undefined} onChange={(e) => { setTo(e.target.value); setErr(null); }} placeholder="2026-11-23" />
      <Button type="submit" variant="secondary">{tx('طبّق', 'Apply')}</Button>
      {err && <p id="rng-err" role="alert" className="basis-full text-xs font-medium text-red-600 dark:text-red-400">{msg(err)}</p>}
    </form>
  );
}

export type PresetOption<P extends string> = { value: P; label: string };

/** Report period bar: presets, custom range, and the comparison period with its dates. */
export function PeriodBar<P extends string>({ presets, preset, range, cmp, onPreset, onCustom, onCompare, urlError }: {
  presets: PresetOption<P>[]; preset: P; range: Range; cmp?: CompareMode;
  onPreset: (p: P) => void; onCustom: (r: Range) => void; onCompare?: (c: CompareMode) => void; urlError?: RangeError | null;
}) {
  const tx = useTx();
  const day = useDay();
  const msg = useRangeError();
  const custom = preset === ('custom' as P);
  const c = cmp ? compareRange(range, cmp) : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="max-w-full overflow-x-auto scrollbar-thin"><Segmented label={tx('الفترة', 'Period')} value={preset} onChange={onPreset} options={presets} /></div>
        {cmp && onCompare && (
          <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
            <span className="shrink-0">{tx('قارن بـ', 'Compare with')}</span>
            <Select className="h-9 w-auto min-w-0" value={cmp} onChange={(e) => onCompare(e.target.value as CompareMode)}>
              <option value="prev">{tx('الفترة السابقة', 'Previous period')}</option>
              <option value="yoy">{tx('الفترة نفسها العام الماضي', 'Same period last year')}</option>
              <option value="off">{tx('بلا مقارنة', 'No comparison')}</option>
            </Select>
          </label>
        )}
      </div>
      {custom && <CustomRange value={range} onApply={onCustom} />}
      <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted')}>
        <CalendarRange className="size-3.5" aria-hidden="true" />
        <span className="font-medium text-fg">{day(range.from)} – {day(range.to, true)}</span>
        <span>{tx(`· ${range.days} يوم`, `· ${range.days} days`)}</span>
        {c && <span>{tx('· مقابل', '· vs')} {day(c.from, true)} – {day(c.to, true)}</span>}
        {urlError && <span className="font-medium text-amber-700 dark:text-amber-400">{tx('· الفترة في الرابط غير صالحة: ', '· The period in the link is invalid: ')}{msg(urlError)}</span>}
      </p>
    </div>
  );
}
