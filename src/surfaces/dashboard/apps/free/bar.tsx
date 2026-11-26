// Free-shipping bar & countdown settings (`#/dashboard/apps/free/bar`): what shows and where, which real offer to count
// down; thresholds come from the shipping zones (read-only here). Results: share of real bags that crossed the amount.
import { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { useLang } from '../../../../core/lang';
import { link } from '../../../../core/router';
import { Card, CardHeader, InfoHint, LinkButton, Money, Ref, Segmented, useTx } from '../../../../ds/ui';
import { Alert, Field, Select, Switch } from '../../../../ds/kit';
import { cartsStore, couponsStore, customersStore, ordersStore, settingsStore } from '../../../merchant/stores';
import { BAR_DEFAULTS, barProblems, countable, countdownFor, crossedShare, type BarError, type BarSettings } from './bar-model';
import { BarView } from './bar-store';
import { AppLayout, AppSaveBar, PreviewFrame, Results, useAppDraft } from './store-kit';
import { freeDeliveryOffer } from '../../../storefront/bridge';
import { storeAppsLog } from './store-runtime';
import type { FreeAppId } from './registry';

export default function BarScreen({ id }: { id: FreeAppId }) {
  const tx = useTx();
  const { lang } = useLang();
  const coupons = couponsStore.use();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  const d = useAppDraft<BarSettings>(id, BAR_DEFAULTS, (x) => barProblems(x, coupons, Date.now()));
  const s = d.draft;
  const errs = d.errs as BarError[];
  const zones = settingsStore.use().zones;
  const log = storeAppsLog.use();
  const share = crossedShare(zones, ordersStore.use(), cartsStore.use(), customersStore.use());
  const offers = countable(coupons, now);
  const cd = countdownFor(s, coupons, now);
  const low = freeDeliveryOffer(zones);
  const [bagPct, setBagPct] = useState<'0' | '60' | '100'>('60');
  const goods = low ? Math.round((low.from * Number(bagPct)) / 100) : 0;
  const errText: Record<BarError, string> = { nothing: tx('فعّل الشريط أو العدّاد', 'Turn on the bar or the countdown'), where: tx('اختر مكانًا واحدًا على الأقل', 'Choose at least one place'), offer: tx('العرض المختار لم يعد ساريًا', 'The chosen offer is no longer live') };

  const results = (
    <Results empty={share.noThreshold ? <>{tx('لم تحدد مبلغًا للشحن المجاني في أي منطقة.', 'No free-delivery amount is set in any zone.')} <a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={link('/dashboard/settings/shipping')}>{tx('إعدادات الشحن', 'Shipping settings')}</a></> : undefined}
      items={[
        { label: tx('حقائب تجاوزت الحد', 'Bags past the amount'), value: share.share === null ? '—' : `${Math.round(share.share * 100)}${lang === 'ar' ? '٪' : '%'}`, hint: tx('من الطلبات الإلكترونية والسلات المحفوظة، حسب منطقة كل منها', 'Online orders and saved carts, by each one’s zone') },
        { label: tx('تجاوزت', 'Crossed'), value: share.crossed },
        { label: tx('كل الحقائب', 'All bags'), value: share.bags },
        { label: tx('ظهور الشريط', 'Bar views'), value: log.shown.bar ?? 0, sim: true },
      ]} />
  );

  const settings = (
    <>
      <Card aria-labelledby="br-what">
        <CardHeader id="br-what" title={tx('ماذا يظهر', 'What shows')} />
        <div className="space-y-3 px-5 pb-5">
          <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3"><span className="text-sm font-medium text-fg">{tx('التقدّم نحو الشحن المجاني', 'Progress to free delivery')}</span><Switch checked={s.progress} onChange={(v) => d.set({ progress: v })} label={tx('التقدّم نحو الشحن المجاني', 'Progress to free delivery')} /></label>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3"><span className="text-sm font-medium text-fg">{tx('عدّاد انتهاء العرض', 'Offer countdown')} <InfoHint>{tx('لعرض حقيقي له تاريخ انتهاء فقط؛ لا عدّاد وهمي.', 'Only for a real offer with an end date; never a fake timer.')}</InfoHint></span><Switch checked={s.countdown} onChange={(v) => d.set({ countdown: v })} label={tx('عدّاد انتهاء العرض', 'Offer countdown')} /></label>
          {s.countdown && (offers.length ? (
            <Field label={tx('العرض', 'Offer')} error={errs.includes('offer') ? errText.offer : null}>{(p) => (
              <Select {...p} value={s.offer} onChange={(e) => d.set({ offer: e.target.value })}>
                <option value="">{tx('الأقرب انتهاءً تلقائيًا', 'Soonest to end (automatic)')}</option>
                {offers.map((o) => <option key={o.code} value={o.code}>{o.code} · {tx('ينتهي', 'ends')} {new Date(o.ends).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short' })}</option>)}
              </Select>
            )}</Field>
          ) : <Alert tone="info" title={tx('لا عرض ساري له تاريخ انتهاء', 'No live offer with an end date')}>{tx('لن يظهر عدّاد حتى تنشئ عرضًا بتاريخ انتهاء.', 'No countdown shows until you create an offer with an end date.')} <a className="font-semibold underline" href={link('/dashboard/marketing')}>{tx('الكوبونات', 'Coupons')}</a></Alert>)}
          {errs.includes('nothing') && <p className="text-xs font-medium text-red-600 dark:text-red-400">{errText.nothing}</p>}
        </div>
      </Card>
      <Card aria-labelledby="br-where">
        <CardHeader id="br-where" title={tx('أين يظهر', 'Where it shows')} />
        <ul className="divide-y divide-border px-5 pb-3">
          {([['top', tx('شريط أعلى كل الصفحات', 'Strip at the top of every page')], ['product', tx('صفحة المنتج', 'Product page')], ['bag', tx('ملخص الحقيبة (العدّاد)', 'Bag summary (countdown)')]] as const).map(([k, label]) => (
            <li key={k} className="flex items-center justify-between gap-3 py-3"><span className="text-sm text-fg">{label}</span><Switch checked={s[k]} onChange={(v) => d.set({ [k]: v } as Partial<BarSettings>)} label={label} /></li>
          ))}
        </ul>
        {errs.includes('where') && <p className="px-5 pb-4 text-xs font-medium text-red-600 dark:text-red-400">{errText.where}</p>}
      </Card>
      <Card aria-labelledby="br-zones">
        <CardHeader id="br-zones" title={tx('حد الشحن المجاني لكل منطقة', 'Free-delivery amount per zone')} hint={<InfoHint>{tx('يقرأ من إعدادات الشحن. يُحسب لكل عميل حسب مدينته عند معرفتها، وإلا الأقل.', 'Read from shipping settings. Uses the shopper’s city when known, else the lowest.')}</InfoHint>}
          action={<LinkButton size="sm" variant="secondary" href={link('/dashboard/settings/shipping')}><Truck className="size-4" aria-hidden="true" />{tx('عدّل', 'Edit')}</LinkButton>} />
        <ul className="divide-y divide-border px-5 pb-3 text-sm">
          {zones.map((z) => <li key={z.id} className="flex items-center justify-between gap-3 py-2.5"><span className="min-w-0 truncate text-fg">{z.name[lang]}</span>{z.freeOver !== null ? <Money v={z.freeOver} className="font-semibold" /> : <span className="text-muted">{tx('بلا شحن مجاني', 'No free delivery')}</span>}</li>)}
        </ul>
      </Card>
    </>
  );

  const preview = (
    <PreviewFrame note={tx('العدّاد في المعاينة يعمل على العرض الحقيقي المختار.', 'The preview countdown runs on the real chosen offer.')}>
      <div className="mb-3 flex justify-center"><Segmented label={tx('قيمة الحقيبة', 'Bag value')} value={bagPct} onChange={setBagPct} options={[{ value: '0', label: tx('فارغة', 'Empty') }, { value: '60', label: tx('قريبة', 'Close') }, { value: '100', label: tx('وصلت', 'Reached') }]} /></div>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="h-8 border-b border-border bg-surface" aria-hidden="true" />
        {s.top && (s.progress || cd) ? <div className="border-b border-border bg-surface-2 px-3 py-2"><BarView goods={goods} th={s.progress ? low : undefined} cd={cd} now={now} /></div> : <p className="px-3 py-2 text-center text-xs text-muted">{tx('لا شريط أعلى الصفحات', 'No top strip')}</p>}
        <div className="space-y-2 p-3"><div className="h-20 rounded-md bg-surface-2" aria-hidden="true" /><div className="h-3 w-2/3 rounded bg-surface-2" aria-hidden="true" /></div>
      </div>
      {cd && <p className="mt-2 text-xs text-muted">{tx('العدّاد على كود', 'Counting down to')} <Ref>{cd.code}</Ref></p>}
    </PreviewFrame>
  );

  return (
    <>
      <AppLayout results={results} settings={settings} preview={preview} />
      <AppSaveBar d={d} error={errs.length ? errText[errs[0]] : undefined} />
    </>
  );
}
