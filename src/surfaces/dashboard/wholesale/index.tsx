// Wholesale / B2B (`#/dashboard/wholesale`): sell to business buyers from the same catalogue and stock.
// Tabs: buyers (approval), price lists (per group, tiered by quantity, MOQ), quotes (request → quote → order with a
// tax invoice showing the buyer's VAT) and settings (minimum order, payment terms, validity, location).
// The merchant sets every price and term here. Whether LAK runs a wholesale marketplace (BP-P06-WHS) is pending.
import { useState } from 'react';
import { useLang } from '../../../core/lang';
import { link, type Route } from '../../../core/router';
import { allLocations } from '../../merchant/domain';
import { logAction } from '../../merchant/stores';
import { can } from '../../merchant/perms';
import { moneyInput, parseIntStrict, parseMoney } from '../../merchant/catalog';
import { TERMS, type TermsId } from '../../merchant/wholesale';
import { Card, CardHeader, ErrorState, InfoHint, Skeleton, useTx } from '../../../ds/ui';
import { Alert, Field, Input, PageHeader, SaveBar, Select, Switch, Tabs, Checkbox, useToast } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { NoAccess, ReviewRole, useRole } from '../marketing/access';
import { useUnsaved } from '../unsaved';
import { DecisionMark, Pending } from '../pos/parts';
import { setWs, wsStore } from './state';
import { ApplyPreview, Buyers, useWsLabels } from './buyers';
import { Prices } from './prices';
import { QuoteDetail, Quotes } from './quotes';

type Tab = 'buyers' | 'prices' | 'quotes' | 'settings';

function Settings({ canManage }: { canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const L = useWsLabels();
  const toast = useToast();
  const s = wsStore.use().settings;
  const [minOrder, setMin] = useState(s.minOrder ? moneyInput(s.minOrder) : '');
  const [terms, setTerms] = useState<TermsId[]>(s.terms);
  const [days, setDays] = useState(String(s.quoteDays));
  const [approval, setApproval] = useState(s.approval);
  const [loc, setLoc] = useState(s.loc);
  const min = minOrder.trim() ? parseMoney(minOrder) : 0;
  const d = parseIntStrict(days);
  const errors = { min: min === null, days: !d || d < 1 || d > 90, terms: terms.length === 0 };
  const dirty = (min ?? -1) !== s.minOrder || terms.join() !== s.terms.join() || String(s.quoteDays) !== days || approval !== s.approval || loc !== s.loc;
  useUnsaved(dirty, { ar: 'إعدادات الجملة', en: 'Wholesale settings' });
  const save = () => {
    if (Object.values(errors).some(Boolean)) return;
    setWs((x) => ({ settings: { ...x.settings, minOrder: min ?? 0, terms: TERMS.filter((t) => terms.includes(t)), quoteDays: d!, approval, loc } }));
    logAction('settings', { ar: 'حدّث إعدادات الجملة', en: 'Updated wholesale settings' });
    toast({ tone: 'ok', text: tx('حُفظت إعدادات الجملة', 'Wholesale settings saved') });
  };
  const discard = () => { setMin(s.minOrder ? moneyInput(s.minOrder) : ''); setTerms(s.terms); setDays(String(s.quoteDays)); setApproval(s.approval); setLoc(s.loc); };
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={tx('قواعدك للجملة', 'Your wholesale rules')} />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label={tx('الحد الأدنى للطلب قبل الضريبة (ر.س)', 'Minimum order before VAT (SAR)')} optional error={errors.min ? tx('مبلغ غير صحيح', 'Invalid amount') : null}>{(p) => <Input {...p} disabled={!canManage} inputMode="decimal" dir="ltr" value={minOrder} placeholder="0.00" onChange={(e) => setMin(e.target.value)} />}</Field>
          <Field label={tx('صلاحية العرض (أيام)', 'Quote valid for (days)')} error={errors.days ? tx('من 1 إلى 90', '1 to 90') : null}>{(p) => <Input {...p} disabled={!canManage} inputMode="numeric" dir="ltr" value={days} onChange={(e) => setDays(e.target.value)} />}</Field>
          <Field label={tx('موقع مخزون الجملة', 'Wholesale stock location')}>{(p) => <Select {...p} disabled={!canManage} value={loc} onChange={(e) => setLoc(e.target.value)}>{allLocations().filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name[lang]}</option>)}</Select>}</Field>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4"><span className="text-sm font-semibold text-fg">{tx('اعتماد المشترين قبل رؤية الأسعار', 'Approve buyers before they see prices')}</span><Switch disabled={!canManage} checked={approval} onChange={setApproval} label={tx('اعتماد المشترين', 'Buyer approval')} /></div>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-fg">{tx('شروط الدفع التي تقدّمها', 'Payment terms you offer')}<InfoHint>{tx('الآجل يعني أن البضاعة تُشحن قبل الدفع؛ المخاطرة عليك.', 'Net terms ship goods before payment; the risk is yours.')}</InfoHint></legend>
            <div className="flex flex-wrap gap-4">{TERMS.map((t) => <label key={t} className="flex items-center gap-2 text-sm"><Checkbox label={L.terms(t)} checked={terms.includes(t)} onChange={(on) => setTerms(on ? [...terms, t] : terms.filter((x) => x !== t))} />{L.terms(t)}</label>)}</div>
            {errors.terms && <p className="mt-1 text-xs font-medium text-red-600">{tx('اختر شرطًا واحدًا على الأقل', 'Choose at least one')}</p>}
          </fieldset>
        </div>
      </Card>
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2">{tx('ما لم تعتمده «لك» بعد', 'Not yet approved by LAK')}<DecisionMark what={tx('سوق «لك» للجملة وباقته', 'LAK wholesale marketplace and its plan')} /></span>} />
        <dl className="divide-y divide-border px-5 pb-4 text-sm">
          {[tx('سوق «لك» للجملة بين المتاجر (عرض كتالوجك لتجار آخرين)', 'LAK wholesale marketplace across stores (listing your catalogue to other merchants)'), tx('الباقة التي تتيح الجملة (المصدر متناقض: كل الباقات / Plus+)', 'Which plan includes wholesale (source conflicts: all plans / Plus+)'), tx('عمولة «لك» على طلبات الجملة', 'LAK commission on wholesale orders')].map((k) => <div key={k} className="flex items-center justify-between gap-3 py-2.5"><dt className="text-muted">{k}</dt><dd><Pending /></dd></div>)}
        </dl>
        <p className="px-5 pb-5 text-xs text-muted">{tx('ما هنا يعمل لمشتريك المباشرين فقط؛ لا يوجد سوق جملة من «لك» حتى يُعتمد.', 'Everything here works for your own direct buyers only; there is no LAK wholesale marketplace until it is approved.')}</p>
      </Card>
      {canManage && <SaveBar dirty={dirty} onSave={save} onDiscard={discard} error={Object.values(errors).some(Boolean) ? tx('صحّح الحقول المعلّمة', 'Fix the marked fields') : undefined} />}
    </div>
  );
}

export default function Wholesale({ route }: { route: Route }) {
  const tx = useTx();
  const role = useRole();
  const state = useDashState();
  const s = wsStore.use();
  if (role === 'marketing') return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('الجملة غير متاحة لدورك', 'Wholesale is not available for your role')} /></div>;
  const canManage = can(role, 'settings.manage');
  const p0 = route.path[0];
  const tab: Tab = p0 === 'prices' || p0 === 'quotes' || p0 === 'settings' ? p0 : 'buyers';
  const pending = s.buyers.filter((b) => b.status === 'pending').length;
  const openQ = s.quotes.filter((q) => q.status === 'requested' || q.status === 'accepted').length;
  const header = (
    <>
      <PageHeader title={<span className="inline-flex items-center gap-1.5">{tx('الجملة', 'Wholesale')}<InfoHint>{tx('بيع للمنشآت من الكتالوج والمخزون نفسيهما: حسابات معتمدة، أسعار بالكمية، عروض أسعار، وفاتورة ضريبية برقم المشتري.', 'Sell to businesses from the same catalogue and stock: approved accounts, quantity pricing, quotes, and a tax invoice with the buyer’s VAT number.')}</InfoHint></span>}
        description={tx('مشتروك المباشرون. سوق «لك» للجملة لم يُعتمد بعد.', 'Your direct buyers. A LAK wholesale marketplace is not approved yet.')}
        meta={<DecisionMark what={tx('سوق «لك» للجملة', 'LAK wholesale marketplace')} />} />
      <ReviewRole />
      {!canManage && <Alert tone="info">{tx('عرض فقط لدورك.', 'View only for your role.')}</Alert>}
      <Tabs label={tx('أقسام الجملة', 'Wholesale sections')} items={([['buyers', tx('المشترون', 'Buyers'), pending], ['prices', tx('قوائم الأسعار', 'Price lists'), 0], ['quotes', tx('عروض الأسعار', 'Quotes'), openQ], ['settings', tx('الإعدادات', 'Settings'), 0]] as [Tab, string, number][]).map(([id, label, count]) => ({ href: link(id === 'buyers' ? '/dashboard/wholesale' : `/dashboard/wholesale/${id}`), label, current: tab === id && p0 !== 'apply', count: count || undefined }))} />
    </>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<div className="space-y-3" role="status" aria-label={tx('جارٍ التحميل', 'Loading')}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل الجملة', 'Wholesale could not load')} onRetry={() => setDashState('live')}>{tx('الطلبات القائمة لا تتأثر. المرجع SIM-WHS-503.', 'Existing orders are unaffected. Ref SIM-WHS-503.')}</ErrorState></Card></div>;
  let body;
  if (p0 === 'apply') body = <ApplyPreview />;
  else if (tab === 'prices') body = <Prices key={route.query.get('g') ?? ''} route={route} canManage={canManage} />;
  else if (tab === 'quotes') body = route.path[1] ? <QuoteDetail key={route.path[1]} id={route.path[1]} canManage={canManage} /> : <Quotes route={route} canManage={canManage} />;
  else if (tab === 'settings') body = <Settings canManage={canManage} />;
  else body = <Buyers route={route} canManage={canManage} />;
  return <div className="space-y-6">{header}{body}</div>;
}
