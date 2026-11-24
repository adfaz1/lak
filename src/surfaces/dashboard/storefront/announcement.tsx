// Announcement bar editor: text, optional link, colours with a readability check, and a Riyadh-day schedule.
// Lives in the theme draft like everything else on this page.
import { Check, Megaphone } from 'lucide-react';
import { themeStore } from '../../merchant/stores';
import { brandScale, contrast, isHex } from '../../storefront/theme';
import { Badge, Button, Card, CardHeader, cn, useTx, type Tone } from '../../../ds/ui';
import { Field, Input, Switch } from '../../../ds/kit';
import { HEADING_MAX, changeOf, updateSection } from './model';
import { AA, ANN_DEFAULT, annColours, annIssues, draftIdentity, linkError, normHex, scheduleState } from './identity';
import { C_TONE, useKindLabels } from './sections';

export default function AnnouncementPanel({ empty }: { empty: boolean }) {
  const tx = useTx();
  const theme = themeStore.use();
  const { change } = useKindLabels();
  const s = empty ? undefined : theme.draft.find((x) => x.kind === 'announcement');
  if (!s) return <Card><CardHeader title={tx('شريط الإعلان', 'Announcement bar')} /><p className="border-t border-border px-5 py-6 text-sm text-muted">{tx('لا شريط إعلان في هذا الثيم.', 'This theme has no announcement bar.')}</p></Card>;
  const set = (p: Partial<typeof s>) => themeStore.set((t) => updateSection(t, s.id, p));
  const c = annColours(s);
  const issues = annIssues(s);
  const ratio = isHex(c.bg) && isHex(c.fg) ? contrast(c.bg, c.fg) : 0;
  const accent = draftIdentity(theme).accent;
  const brand = isHex(accent) ? brandScale(accent) : null;
  const presets: { label: string; bg: string; fg: string }[] = [
    { label: tx('داكن', 'Dark'), bg: ANN_DEFAULT.bg, fg: ANN_DEFAULT.fg },
    ...(brand ? [{ label: tx('لون العلامة', 'Brand'), bg: brand[700], fg: '#ffffff' }, { label: tx('فاتح بلون العلامة', 'Brand tint'), bg: brand[100], fg: brand[900] }] : []),
    { label: tx('رملي', 'Sand'), bg: '#f1ebe2', fg: '#1e1b18' },
  ];
  const sched = scheduleState(s, Date.now());
  const schedText: Record<typeof sched, [string, Tone]> = {
    always: [tx('يظهر دائمًا', 'Always on'), 'gray'], upcoming: [tx('مجدول لاحقًا', 'Scheduled'), 'sky'], running: [tx('يظهر الآن', 'Showing now'), 'green'], ended: [tx('انتهى العرض', 'Ended'), 'amber'],
  };
  const ch = changeOf(theme, s.id);
  const hErr = !s.heading.trim() ? tx('اكتب نص الإعلان', 'Write the announcement') : s.heading.length > HEADING_MAX ? tx(`الحد ${HEADING_MAX} حرفًا`, `Max ${HEADING_MAX} characters`) : null;
  const colour = (key: 'bg' | 'fg', label: string) => (
    <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border px-2.5 text-[13px] text-fg hover:bg-surface-2">
      <input type="color" value={isHex(c[key]) ? c[key] : '#000000'} onChange={(e) => set({ [key]: normHex(e.target.value) ?? undefined })} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
      {label} <bdi dir="ltr" className="font-mono text-xs text-muted">{c[key]}</bdi>
    </label>
  );
  return (
    <Card aria-labelledby="h-ann">
      <CardHeader id="h-ann" title={<span className="flex items-center gap-2">{tx('شريط الإعلان', 'Announcement bar')}{ch && <Badge tone={C_TONE[ch]} className="h-5 px-2 text-[11px]">{change(ch)}</Badge>}</span>}
        hint={tx('يظهر أعلى كل صفحات المتجر. الجدول بتوقيت الرياض ويشمل يومي البداية والنهاية.', 'Shows above every store page. The schedule follows Riyadh days, start and end included.')}
        action={<Switch checked={s.visible} label={tx('إظهار شريط الإعلان', 'Show the announcement bar')} onChange={(v) => set({ visible: v })} />} />
      <div className="space-y-4 border-t border-border px-5 py-4">
        <div className={cn('flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-center text-[13px]', !s.visible && 'opacity-50')} style={{ background: c.bg, color: c.fg }} dir="auto">
          <Megaphone className="size-4 shrink-0" aria-hidden="true" /><span className={cn(s.link && 'underline underline-offset-2')}>{s.heading || tx('نص الإعلان', 'Announcement text')}</span>
        </div>
        <Field label={tx('النص', 'Text')} hint={<bdi dir="ltr">{s.heading.length} / {HEADING_MAX}</bdi>} error={hErr}>
          {(p) => <Input {...p} dir="auto" value={s.heading} onChange={(e) => set({ heading: e.target.value })} />}
        </Field>
        <Field label={tx('الرابط', 'Link')} optional hint={tx('مثل /c/abayas أو https://', 'e.g. /c/abayas or https://')} error={linkError(s.link) ? tx('رابط غير صالح: صفحة في المتجر تبدأ بـ / أو عنوان https://', 'Invalid link: a store path starting with / or an https:// address') : null}>
          {(p) => <Input {...p} dir="ltr" value={s.link ?? ''} placeholder="/c/…" onChange={(e) => set({ link: e.target.value.trim() || undefined })} />}
        </Field>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold text-fg">{tx('الألوان', 'Colours')}</legend>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => {
              const on = p.bg === c.bg && p.fg === c.fg;
              return <Button key={p.label} variant="secondary" size="sm" aria-pressed={on} onClick={() => set({ bg: p.bg, fg: p.fg })}><span className="size-3.5 rounded-full ring-1 ring-border" style={{ background: p.bg }} aria-hidden="true" />{p.label}{on && <Check className="size-3.5" aria-hidden="true" />}</Button>;
            })}
          </div>
          <div className="flex flex-wrap gap-2">{colour('bg', tx('الخلفية', 'Background'))}{colour('fg', tx('النص', 'Text'))}</div>
          <p className={cn('text-xs font-medium', issues.includes('colours') ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-400')} role={issues.includes('colours') ? 'alert' : undefined}>
            {tx('وضوح النص', 'Text contrast')} <bdi dir="ltr" className="tabular-nums">{ratio.toFixed(1)}:1</bdi> · {ratio >= AA ? tx('واضح', 'Readable') : tx(`أقل من ${AA}:1، اختر ألوانًا أوضح`, `Below ${AA}:1, choose clearer colours`)}
          </p>
        </fieldset>
        <fieldset>
          <legend className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">{tx('الجدول', 'Schedule')}<Badge tone={schedText[sched][1]}>{schedText[sched][0]}</Badge></legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label={tx('من', 'From')} optional>{(p) => <Input {...p} type="date" dir="ltr" value={s.start ?? ''} onChange={(e) => set({ start: e.target.value || undefined })} />}</Field>
            <Field label={tx('إلى', 'To')} optional error={issues.includes('schedule') ? tx('النهاية قبل البداية', 'End is before start') : null}>{(p) => <Input {...p} type="date" dir="ltr" value={s.end ?? ''} min={s.start} onChange={(e) => set({ end: e.target.value || undefined })} />}</Field>
            {(s.start || s.end) && <Button variant="ghost" size="sm" className="mb-0.5" onClick={() => set({ start: undefined, end: undefined })}>{tx('بلا جدول', 'No schedule')}</Button>}
          </div>
        </fieldset>
      </div>
    </Card>
  );
}
