// Shared SEO pieces: title/description fields with length guidance, and a search-result preview that updates as
// the merchant types. Used by the store SEO page and by each information page.
import { useState } from 'react';
import type { L } from '../../../core/lang';
import { Card, CardHeader, Segmented, cn, useTx } from '../../../ds/ui';
import { Field, Input, Textarea } from '../../../ds/kit';
import { DESC_MAX, TITLE_MAX, lenTone, snippet, type LenTone } from './content';

const TONE_CLASS: Record<LenTone, string> = { empty: 'text-subtle', short: 'text-amber-700 dark:text-amber-300', ok: 'text-emerald-700 dark:text-emerald-400', long: 'text-red-600 dark:text-red-400' };

export function LenHint({ value, max }: { value: string; max: number }) {
  const tx = useTx();
  const tone = lenTone(value, max);
  const n = value.trim().length;
  const msg = { empty: tx('فارغ: نستخدم البديل', 'Empty: we use the fallback'), short: tx('قصير', 'Short'), ok: tx('مناسب', 'Good length'), long: tx('طويل: سيُقص في النتائج', 'Long: cut in results') }[tone];
  return <span className={cn('tabular-nums', TONE_CLASS[tone])}>{n}/{max} · {msg}</span>;
}

/** How a search engine would show the page. Simulated: real results depend on the search engine. */
export function SerpPreview({ url, title, desc, lang }: { url: string; title: string; desc: string; lang: 'ar' | 'en' }) {
  const tx = useTx();
  return (
    <figure className="rounded-xl border border-border bg-surface p-4" aria-label={tx('معاينة نتيجة البحث', 'Search result preview')}>
      <figcaption className="sr-only">{tx('معاينة نتيجة البحث', 'Search result preview')}</figcaption>
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} className="min-w-0">
        <p className="truncate text-xs text-muted"><bdi dir="ltr">{url}</bdi></p>
        <p className="mt-1 line-clamp-1 text-[17px] font-medium text-sky-700 dark:text-sky-400">{snippet(title, TITLE_MAX) || '—'}</p>
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{snippet(desc, DESC_MAX) || '—'}</p>
      </div>
    </figure>
  );
}

export function SeoFields({ title, desc, url, fallbackTitle, fallbackDesc, langs, onChange, heading }: {
  title: L; desc: L; url: string; fallbackTitle: L; fallbackDesc: L; langs: { ar: boolean; en: boolean }; onChange: (v: { title: L; desc: L }) => void; heading?: string;
}) {
  const tx = useTx();
  const shown = (['ar', 'en'] as const).filter((l) => langs[l]);
  const [pv, setPv] = useState<'ar' | 'en'>(shown[0] ?? 'ar');
  return (
    <Card aria-labelledby="seo-h">
      <CardHeader id="seo-h" title={heading ?? tx('الظهور في محركات البحث', 'Search engine listing')} hint={tx('إن تركت الحقول فارغة نستخدم العنوان وبداية المحتوى.', 'Leave empty to use the title and the start of the content.')} />
      <div className="space-y-4 px-5 pb-5">
        {shown.map((l) => (
          <div key={l} className="grid gap-4 sm:grid-cols-2">
            <Field label={tx(`عنوان البحث · ${l === 'ar' ? 'العربية' : 'الإنجليزية'}`, `Search title · ${l === 'ar' ? 'Arabic' : 'English'}`)} hint={<LenHint value={title[l]} max={TITLE_MAX} />}>
              {(f) => <Input {...f} dir={l === 'ar' ? 'rtl' : 'ltr'} lang={l} value={title[l]} placeholder={fallbackTitle[l]} onChange={(e) => onChange({ title: { ...title, [l]: e.target.value }, desc })} />}
            </Field>
            <Field label={tx(`الوصف · ${l === 'ar' ? 'العربية' : 'الإنجليزية'}`, `Description · ${l === 'ar' ? 'Arabic' : 'English'}`)} hint={<LenHint value={desc[l]} max={DESC_MAX} />}>
              {(f) => <Textarea {...f} rows={2} dir={l === 'ar' ? 'rtl' : 'ltr'} lang={l} value={desc[l]} placeholder={snippet(fallbackDesc[l], DESC_MAX)} onChange={(e) => onChange({ title, desc: { ...desc, [l]: e.target.value } })} />}
            </Field>
          </div>
        ))}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted">{tx('معاينة النتيجة', 'Result preview')}</span>
            {shown.length > 1 && <Segmented label={tx('لغة المعاينة', 'Preview language')} value={pv} onChange={setPv} options={shown.map((l) => ({ value: l, label: l === 'ar' ? 'العربية' : 'English' }))} />}
          </div>
          <SerpPreview url={url} lang={pv} title={title[pv].trim() || fallbackTitle[pv]} desc={desc[pv].trim() || fallbackDesc[pv]} />
        </div>
      </div>
    </Card>
  );
}
