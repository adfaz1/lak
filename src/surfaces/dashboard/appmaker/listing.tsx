// Store listing: what people see on the App Store and Google Play before installing. Saved to the draft as
// typed; problems show on the fields and in the readiness check. Screenshots are generated from the preview.
import { useState } from 'react';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { useLang } from '../../../core/lang';
import type { Route } from '../../../core/router';
import { Button, Card, CardHeader, Segmented, useTx } from '../../../ds/ui';
import { Field, Input, Select, Simulated, Textarea } from '../../../ds/kit';
import { LIMITS, SCREENSHOT_SLOTS, listingIssues, type Listing, type ListingField } from '../../appmaker/domain';
import { ICONS } from '../../appmaker/fixtures';
import { monogram, type OS, type Screen } from './model';
import { IconArt, MiniPhone } from './phone';
import { useAppData, useS } from './parts';
import { appStore } from './state';

const SHOTS: Screen[] = ['home', 'search', 'product'];

export default function ListingPage(_: { route: Route }) {
  const tx = useTx();
  const S = useS();
  const { lang } = useLang();
  const { s, catalog } = useAppData();
  const [store, setStore] = useState<OS>('ios');
  const l = s.listing;
  const issues = listingIssues(l);
  const set = (patch: Partial<Listing>) => appStore.set((x) => ({ ...x, listing: { ...x.listing, ...patch } }));
  const err = (f: ListingField) => (issues[f] ? S.issues[issues[f]!] : null);
  const count = (v: string, max: number) => <bdi dir="ltr">{v.trim().length} / {max}</bdi>;
  const icon = ICONS.find((i) => i.id === s.draft.iconId) ?? ICONS[0];
  const appName = s.draft.name[lang] || s.draft.name.ar;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        <Card aria-labelledby="am-ls">
          <CardHeader id="am-ls" title={tx('الوصف والتصنيف', 'Description and category')} hint={tx('يُحفظ في المسودة أثناء الكتابة. يُرسل مع الإصدار التالي ويراجعه فريق «لك» ثم المتاجر.', 'Saved to the draft as you type. Sent with the next version, reviewed by LAK and then the stores.')}
            action={<span className="text-xs text-muted">{Object.keys(issues).length ? tx(`${Object.keys(issues).length} يحتاج تعديلًا`, `${Object.keys(issues).length} to fix`) : tx('مكتمل', 'Complete')}</span>} />
          <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
            <Field label={tx('العنوان الفرعي بالعربية', 'Subtitle in Arabic')} error={err('subtitleAr')} hint={count(l.subtitle.ar, LIMITS.subtitle)}>
              {(p) => <Input {...p} dir="rtl" lang="ar" value={l.subtitle.ar} onChange={(e) => set({ subtitle: { ...l.subtitle, ar: e.target.value } })} />}
            </Field>
            <Field label={tx('العنوان الفرعي بالإنجليزية', 'Subtitle in English')} error={err('subtitleEn')} hint={count(l.subtitle.en, LIMITS.subtitle)}>
              {(p) => <Input {...p} dir="ltr" lang="en" value={l.subtitle.en} onChange={(e) => set({ subtitle: { ...l.subtitle, en: e.target.value } })} />}
            </Field>
            <Field className="sm:col-span-2" label={tx('الوصف بالعربية', 'Description in Arabic')} error={err('descriptionAr')} hint={count(l.description.ar, LIMITS.description)}>
              {(p) => <Textarea {...p} dir="rtl" lang="ar" value={l.description.ar} onChange={(e) => set({ description: { ...l.description, ar: e.target.value } })} />}
            </Field>
            <Field className="sm:col-span-2" label={tx('الوصف بالإنجليزية', 'Description in English')} error={err('descriptionEn')} hint={count(l.description.en, LIMITS.description)}>
              {(p) => <Textarea {...p} dir="ltr" lang="en" value={l.description.en} onChange={(e) => set({ description: { ...l.description, en: e.target.value } })} />}
            </Field>
            <Field className="sm:col-span-2" label={tx('كلمات البحث', 'Keywords')} error={err('keywords')} hint={<>{tx('مفصولة بفواصل · ', 'Comma separated · ')}{count(l.keywords, LIMITS.keywords)}</>}>
              {(p) => <Input {...p} dir="auto" value={l.keywords} onChange={(e) => set({ keywords: e.target.value })} />}
            </Field>
            <Field label={tx('التصنيف في المتجر', 'Store category')} error={err('category')}>
              {(p) => <Select {...p} value={l.category} onChange={(e) => set({ category: e.target.value })}>
                <option value="">{tx('اختر', 'Choose')}</option>
                {Object.entries(S.cats).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>}
            </Field>
            <div className="hidden sm:block" />
            <Field label={tx('رابط الدعم', 'Support URL')} error={err('supportUrl')}>
              {(p) => <Input {...p} dir="ltr" type="url" inputMode="url" value={l.supportUrl} onChange={(e) => set({ supportUrl: e.target.value })} />}
            </Field>
            <Field label={tx('رابط سياسة الخصوصية', 'Privacy policy URL')} error={err('privacyUrl')}>
              {(p) => <Input {...p} dir="ltr" type="url" inputMode="url" value={l.privacyUrl} onChange={(e) => set({ privacyUrl: e.target.value })} />}
            </Field>
            <Field className="sm:col-span-2" optional label={tx('ملاحظات للمراجعين', 'Notes for reviewers')} hint={tx('لا تكتب كلمة مرورك؛ يُنشأ حساب مراجعة مؤقت عند الإرسال.', 'Never your password; a temporary review account is created on submission.')}>
              {(p) => <Textarea {...p} dir="auto" value={l.reviewNotes} onChange={(e) => set({ reviewNotes: e.target.value })} />}
            </Field>
          </div>
        </Card>

        <Card aria-labelledby="am-shots">
          <CardHeader id="am-shots" title={tx('لقطات الشاشة', 'Screenshots')} hint={tx('تُولّد من المعاينة بمسودتك الحالية. اللقطات النهائية بالمقاسات التي تطلبها المتاجر تُنشأ عند البناء.', 'Generated from the preview with your current draft. Final screenshots in the sizes stores require are produced at build.')}
            action={<Simulated />} />
          <div className="px-5 pb-5">
            {issues.screenshots && <p className="mb-3 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{tx(`مطلوب ${SCREENSHOT_SLOTS} لقطات.`, `${SCREENSHOT_SLOTS} screenshots are required.`)}</p>}
            <ul className="flex gap-4 overflow-x-auto pb-1 scrollbar-thin">
              {SHOTS.map((sc, i) => (
                <li key={sc} className="shrink-0 space-y-1.5">
                  {i < l.screenshots
                    ? <MiniPhone scale={0.42} config={s.draft} catalog={catalog} os={store} screen={sc} productId={catalog.find((p) => p.photo)?.id} label={tx(`لقطة ${i + 1}`, `Screenshot ${i + 1}`)} />
                    : <span className="grid h-[255px] w-[123px] place-items-center rounded-2xl border border-dashed border-border text-subtle" role="img" aria-label={tx(`لقطة ${i + 1}: فارغة`, `Screenshot ${i + 1}: empty`)}><ImagePlus className="size-6" aria-hidden="true" /></span>}
                  <p className="text-center text-xs text-muted">{tx(`لقطة ${i + 1}`, `Screenshot ${i + 1}`)}</p>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => set({ screenshots: SCREENSHOT_SLOTS })}><RefreshCw className="size-4" aria-hidden="true" />{l.screenshots ? tx('أعد التوليد', 'Regenerate') : tx('ولّد من المعاينة', 'Generate from preview')}</Button>
              {l.screenshots > 0 && <Button variant="ghost" size="sm" onClick={() => set({ screenshots: 0 })}><Trash2 className="size-4" aria-hidden="true" />{tx('امسح', 'Clear')}</Button>}
            </div>
          </div>
        </Card>
      </div>

      <div className="min-w-0">
        <Card aria-labelledby="am-lp" className="lg:sticky lg:top-24">
          <CardHeader id="am-lp" title={tx('كما يظهر في المتجر', 'As it appears in the store')} hint={tx('تقريب لصفحة التطبيق. شكل المتجر الفعلي تحدده Apple وGoogle.', 'An approximation of the app page. The real store layout is decided by Apple and Google.')}
            action={<Segmented<OS> label={tx('المتجر', 'Store')} value={store} onChange={setStore} options={[{ value: 'ios', label: 'App Store' }, { value: 'android', label: 'Google Play' }]} />} />
          <div className="space-y-4 px-5 pb-5">
            <div className="flex items-start gap-3">
              <IconArt tile={icon} letter={monogram(s.draft.name, lang)} size={store === 'ios' ? 72 : 64} className={store === 'android' ? 'rounded-2xl' : undefined} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-fg">{appName || tx('بلا اسم', 'Untitled')}</p>
                <p className="truncate text-[13px] text-muted">{l.subtitle[lang] || '—'}</p>
                <p className="mt-0.5 text-xs text-subtle">{S.cats[l.category] ?? '—'}</p>
              </div>
            </div>
            <span className="flex h-9 w-full items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold text-muted">{store === 'ios' ? tx('احصل', 'Get') : tx('تثبيت', 'Install')}</span>
            <p className="line-clamp-4 text-[13px] leading-relaxed text-fg" dir="auto">{l.description[lang] || '—'}</p>
            <p className="text-xs text-subtle">{tx('لا تقييمات قبل النشر.', 'No ratings before launch.')}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
