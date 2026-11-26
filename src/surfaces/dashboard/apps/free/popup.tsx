// Welcome pop-up settings (`#/dashboard/apps/free/popup`): trigger, frequency, pages, welcome discount and contact
// channel with explicit consent; a live preview of the card; results from sign-ups, codes and orders.
import { Gift } from 'lucide-react';
import { useLang } from '../../../../core/lang';
import { link } from '../../../../core/router';
import { Card, CardHeader, InfoHint, Money, Ref, Segmented, cn, useTx } from '../../../../ds/ui';
import { Alert, Field, Input } from '../../../../ds/kit';
import { couponsStore, customersStore, ordersStore } from '../../../merchant/stores';
import { POPUP_DEFAULTS, POPUP_PAGES, popupProblems, popupStats, type PopupError, type PopupPage, type PopupSettings } from './popup-model';
import { PopupCard } from './popup-store';
import { AppLayout, AppSaveBar, NumInput, PreviewFrame, Results, useAppDraft } from './store-kit';
import { storeAppsLog } from './store-runtime';
import type { FreeAppId } from './registry';

export default function PopupScreen({ id }: { id: FreeAppId }) {
  const tx = useTx();
  const { lang } = useLang();
  const d = useAppDraft<PopupSettings>(id, POPUP_DEFAULTS, popupProblems);
  const s = d.draft;
  const errs = d.errs as PopupError[];
  const log = storeAppsLog.use();
  const coupons = couponsStore.use();
  const orders = ordersStore.use();
  const customers = customersStore.use();
  const st = popupStats(log.signups, coupons, orders);
  const pageName: Record<PopupPage, string> = { home: tx('الرئيسية', 'Home'), listing: tx('الأقسام والبحث', 'Categories & search'), product: tx('صفحة المنتج', 'Product page'), cart: tx('الحقيبة', 'Bag'), content: tx('الصفحات والمدونة', 'Pages & blog') };
  const errText: Record<PopupError, string> = {
    delay: tx('التأخير من ٠ إلى ٣٠٠ ثانية', 'Delay 0–300 seconds'), scroll: tx('النسبة من ١٠ إلى ١٠٠', 'Scroll 10–100%'), cap: tx('من ٠ إلى ٣٦٥ يومًا', '0–365 days'),
    pages: tx('اختر صفحة واحدة على الأقل', 'Choose at least one page'), pct: tx('الخصم من ١ إلى ٥٠٪', 'Discount 1–50%'), valid: tx('الصلاحية من ١ إلى ٩٠ يومًا', 'Validity 1–90 days'),
    headline: tx('العنوان باللغتين (حتى ٨٠ حرفًا)', 'Headline in both languages (up to 80 characters)'),
  };
  const err = (k: PopupError) => (errs.includes(k) ? errText[k] : null);

  const results = (
    <Results items={[
      { label: tx('مرات الظهور', 'Views'), value: log.shown.popup ?? 0, sim: true },
      { label: tx('اشتراكات', 'Sign-ups'), value: st.signups, hint: tx(`${st.newCustomers} عميل جديد`, `${st.newCustomers} new customers`) },
      { label: tx('أكواد استُخدمت', 'Codes used'), value: st.used },
      { label: tx('مبيعات بالكود', 'Revenue with codes'), value: <Money v={st.revenue} />, hint: tx(`${st.orders} طلب مدفوع`, `${st.orders} paid orders`) },
    ]} />
  );

  const settings = (
    <>
      <Card aria-labelledby="pp-when">
        <CardHeader id="pp-when" title={tx('متى تظهر', 'When it shows')} />
        <div className="space-y-4 px-5 pb-5">
          <Segmented label={tx('المُشغِّل', 'Trigger')} value={s.trigger} onChange={(v) => d.set({ trigger: v })}
            options={[{ value: 'delay', label: tx('بعد مدة', 'After a delay') }, { value: 'exit', label: tx('عند المغادرة', 'Exit intent') }, { value: 'scroll', label: tx('بعد التمرير', 'After scrolling') }]} />
          {s.trigger === 'exit' && <p className="text-xs text-muted">{tx('على الكمبيوتر فقط. في الجوال تظهر بعد تمرير ٥٠٪.', 'Desktop only. On phones it shows after 50% scroll.')}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {s.trigger === 'delay' && <Field label={tx('التأخير (ثوانٍ)', 'Delay (seconds)')} error={err('delay')}>{(p) => <NumInput {...p} value={s.delaySec} onChange={(n) => d.set({ delaySec: n })} />}</Field>}
            {s.trigger === 'scroll' && <Field label={tx('نسبة التمرير ٪', 'Scroll depth %')} error={err('scroll')}>{(p) => <NumInput {...p} value={s.scrollPct} onChange={(n) => d.set({ scrollPct: n })} />}</Field>}
            <Field label={<>{tx('تظهر للزائر مرة كل (أيام)', 'Show a visitor once every (days)')}<InfoHint>{tx('٠ = مرة في كل زيارة. لا تظهر لمن اشترك.', '0 = once per visit. Never shown to someone who signed up.')}</InfoHint></>} error={err('cap')}>{(p) => <NumInput {...p} value={s.capDays} onChange={(n) => d.set({ capDays: n })} />}</Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-fg">{tx('الصفحات', 'Pages')} <InfoHint>{tx('لا تظهر أبدًا في الدفع وصفحات الطلب والحساب.', 'Never on checkout, order or account pages.')}</InfoHint></legend>
            <div className="flex flex-wrap gap-2">
              {POPUP_PAGES.map((pg) => {
                const on = s.pages.includes(pg);
                return <button key={pg} type="button" aria-pressed={on} onClick={() => d.set({ pages: on ? s.pages.filter((x) => x !== pg) : [...s.pages, pg] })}
                  className={cn('h-9 rounded-xl border px-3 text-[13px] font-semibold', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-border bg-surface text-muted hover:text-fg')}>{pageName[pg]}</button>;
              })}
            </div>
            {err('pages') && <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{err('pages')}</p>}
          </fieldset>
        </div>
      </Card>
      <Card aria-labelledby="pp-offer">
        <CardHeader id="pp-offer" title={tx('العرض والتواصل', 'Offer & contact')} hint={<InfoHint>{tx('كل مشترك يحصل على كود خاص لمرة واحدة، ويُضاف للعملاء مع موافقته.', 'Each sign-up gets its own single-use code and is added to customers with their consent.')}</InfoHint>} />
        <div className="space-y-4 px-5 pb-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={tx('الخصم ٪', 'Discount %')} error={err('pct')}>{(p) => <NumInput {...p} value={s.pct} onChange={(n) => d.set({ pct: n })} />}</Field>
            <Field label={tx('صالح (أيام)', 'Valid (days)')} error={err('valid')}>{(p) => <NumInput {...p} value={s.validDays} onChange={(n) => d.set({ validDays: n })} />}</Field>
            <Field label={tx('حد أدنى (ر.س)', 'Min. spend (SAR)')} optional>{(p) => <NumInput {...p} value={Math.round(s.minSpend / 100)} onChange={(n) => d.set({ minSpend: Number.isFinite(n) ? n * 100 : 0 })} />}</Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-semibold text-fg">{tx('يطلب من الزائر', 'Ask the visitor for')}</span>
            <Segmented label={tx('قناة التواصل', 'Contact channel')} value={s.channel} onChange={(v) => d.set({ channel: v })} options={[{ value: 'email', label: tx('البريد', 'Email') }, { value: 'mobile', label: tx('الجوال', 'Mobile') }]} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tx('العنوان بالعربية', 'Headline (Arabic)')} error={errs.includes('headline') && !s.headline.ar.trim() ? err('headline') : null}>{(p) => <Input {...p} dir="rtl" value={s.headline.ar} onChange={(e) => d.set({ headline: { ...s.headline, ar: e.target.value } })} />}</Field>
            <Field label={tx('العنوان بالإنجليزية', 'Headline (English)')} error={errs.includes('headline') && !s.headline.en.trim() ? err('headline') : null}>{(p) => <Input {...p} dir="ltr" value={s.headline.en} onChange={(e) => d.set({ headline: { ...s.headline, en: e.target.value } })} />}</Field>
          </div>
          <Alert tone="info">{tx('مربع الموافقة غير محدد مسبقًا، ولا يُعطى الكود دونه.', 'The consent box is never pre-ticked, and no code is given without it.')}</Alert>
        </div>
      </Card>
      <Card aria-labelledby="pp-list">
        <CardHeader id="pp-list" title={tx('آخر المشتركين', 'Latest sign-ups')} />
        {log.signups.length ? (
          <ul className="divide-y divide-border px-5 pb-3">
            {[...log.signups].reverse().slice(0, 6).map((x) => {
              const c = customers.find((k) => k.id === x.customerId);
              const cp = coupons.find((k) => k.code === x.code);
              return (
                <li key={x.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
                  <a className="min-w-0 flex-1 truncate font-medium text-fg hover:underline" href={link(`/dashboard/customers/${x.customerId}`)}>{c?.name[lang] ?? x.customerId}</a>
                  <span className="text-xs text-muted">{x.channel === 'email' ? tx('بريد ✓ موافق', 'Email ✓ consented') : tx('جوال ✓ موافق', 'Mobile ✓ consented')}</span>
                  <span className="text-xs"><Ref>{x.code}</Ref> · {cp && cp.used > 0 ? tx('مستخدم', 'Used') : tx('لم يُستخدم', 'Not used')}</span>
                </li>
              );
            })}
          </ul>
        ) : <p className="flex items-center gap-2 px-5 pb-5 text-sm text-muted"><Gift className="size-4" aria-hidden="true" />{tx('لا مشتركين بعد.', 'No sign-ups yet.')} <a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={link('/store')}>{tx('افتح المتجر', 'Open the store')}</a></p>}
      </Card>
    </>
  );

  const preview = (
    <PreviewFrame page={pageName[s.pages[0] ?? 'home']} note={tx('معاينة فقط؛ لا يُنشأ كود منها.', 'Preview only; no code is created from it.')}>
      <div className="grid min-h-72 place-items-center rounded-lg bg-black/30 p-3"><div className="w-full max-w-sm"><PopupCard s={s} preview /></div></div>
    </PreviewFrame>
  );

  return (
    <>
      <AppLayout results={results} settings={settings} preview={preview} />
      <AppSaveBar d={d} error={errs.length ? errText[errs[0]] : undefined} />
    </>
  );
}
