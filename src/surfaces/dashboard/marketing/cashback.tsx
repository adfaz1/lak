// Cashback (`#/dashboard/marketing/cashback`, offer at `/cashback/<id|new>`): the merchant's own offer (percent or
// fixed, cap, minimum, products or categories, dates, credit on delivery or after the return window, expiry), previewed
// as the customer sees it, then its results order by order: waiting for delivery, inside the return window, credited,
// voided. Credits land in the customer wallet tied to the order; a later refund takes back what is unspent.
import { useEffect, useMemo, useState } from 'react';
import { BadgePercent, Pause, Play, Plus, SearchX } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { createStore } from '../../../core/store';
import { link, navigate, replace, type Route } from '../../../core/router';
import { categoriesStore, customersStore, logAction, ordersStore, productsStore } from '../../merchant/stores';
import { parseMoney } from '../../merchant/catalog';
import {
  cashbackPreview, cashbackRows, emptyOffer, fromOfferDraft, offerDraft, offerResults, offerState, validateOffer,
  type CashbackOffer, type CashbackRow, type CashbackState, type OfferDraft, type OfferState,
} from '../../merchant/wallet';
import { WALLET_TODAY, cashbackStore, returnWindowDays, syncWallet, walletStore } from '../../merchant/wallet-store';
import { Badge, Button, Card, CardHeader, EmptyState, InfoHint, LinkButton, Money, Ref, Segmented, useTx, type Tone } from '../../../ds/ui';
import { Alert, Checkbox, DataTable, Field, FilterChip, Input, Modal, PageHeader, Pagination, SaveBar, Simulated, useToast, type Column } from '../../../ds/kit';
import { useUnsaved } from '../unsaved';
import { paginate } from '../customers/model';
import { Kpi } from './loyalty';
import { Locked } from './access';
import { DecisionMark, sar } from './wallet-parts';

const drafts = createStore.key('dashboard.cashbackDrafts')<Record<string, OfferDraft>>(() => ({}));
const ST_TONE: Record<OfferState, Tone> = { active: 'green', scheduled: 'sky', paused: 'gray', ended: 'amber' };
const ROW_TONE: Record<CashbackState, Tone> = { credited: 'green', due: 'brand', in_window: 'sky', waiting_delivery: 'gray', void: 'red' };
const chref = (id?: string, q?: Record<string, string | undefined>) => link(`/dashboard/marketing/cashback${id ? `/${id}` : ''}`, q);

function useNames() {
  const tx = useTx();
  return {
    state: (s: OfferState) => ({ active: tx('يعمل', 'Running'), scheduled: tx('مجدول', 'Scheduled'), paused: tx('موقوف', 'Paused'), ended: tx('انتهى', 'Ended') })[s],
    row: (s: CashbackState) => ({ credited: tx('أُضيف للمحفظة', 'Credited'), due: tx('مستحق اليوم', 'Due today'), in_window: tx('في مدة الإرجاع', 'In return window'), waiting_delivery: tx('بانتظار التسليم', 'Awaiting delivery'), void: tx('لا يستحق', 'Not eligible') })[s],
    value: (o: Pick<CashbackOffer, 'kind' | 'value' | 'cap'>) => (o.kind === 'pct' ? `${o.value}%` : tx(`${sar(o.value)} ر.س`, `SAR ${sar(o.value)}`)) + (o.cap !== null ? tx(` · حتى ${sar(o.cap)} ر.س`, ` · up to SAR ${sar(o.cap)}`) : ''),
  };
}

export default function Cashback({ route, empty, canManage }: { route: Route; empty: boolean; canManage: boolean }) {
  const id = route.path[1];
  const orders = ordersStore.use();
  useEffect(() => { syncWallet(); }, [orders]);
  if (id) return <OfferPage key={id} id={id} route={route} canManage={canManage} />;
  return <OfferList empty={empty} canManage={canManage} />;
}

function useAllRows(offers: CashbackOffer[]) {
  const orders = ordersStore.use();
  const products = productsStore.use();
  const customers = customersStore.use();
  const ledger = walletStore.use();
  return useMemo(() => {
    const days = returnWindowDays();
    return new Map(offers.map((o) => [o.id, cashbackRows(o, orders, products, customers, ledger, days, WALLET_TODAY)]));
  }, [offers, orders, products, customers, ledger]);
}

function OfferList({ empty, canManage }: { empty: boolean; canManage: boolean }) {
  const tx = useTx();
  const n = useNames();
  const all = cashbackStore.use();
  const offers = empty ? [] : all;
  const rows = useAllRows(offers);
  const total = offerResults([...rows.values()].flat());
  const cols: Column<CashbackOffer>[] = [
    { key: 'n', header: tx('العرض', 'Offer'), cell: (o) => <span className="block"><span className="font-semibold text-fg">{o.name}</span><span className="block text-xs text-muted">{n.value(o)}</span></span> },
    { key: 'd', header: tx('المدة', 'Dates'), hideBelow: 'lg', cell: (o) => <span className="text-[13px] text-muted"><Ref>{o.start}</Ref> → <Ref>{o.end ?? tx('مفتوح', 'open')}</Ref></span> },
    { key: 'c', header: tx('أُضيف', 'Credited'), align: 'end', cell: (o) => <Money v={offerResults(rows.get(o.id) ?? []).credited} /> },
    { key: 'p', header: tx('قادم', 'Pending'), align: 'end', hideBelow: 'lg', cell: (o) => <Money v={offerResults(rows.get(o.id) ?? []).pending} /> },
    { key: 's', header: tx('الحالة', 'Status'), cell: (o) => <Badge tone={ST_TONE[offerState(o, WALLET_TODAY)]}>{n.state(offerState(o, WALLET_TODAY))}</Badge> },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2"><DecisionMark what={tx('توفّر الكاش باك حسب الباقة بانتظار اعتماد لك', 'Cashback plan availability awaits LAK approval')} /><span className="text-xs text-muted">{tx('النسبة والحد من قرارك أنت؛ التكلفة على متجرك.', 'The rate and cap are yours; the cost is your store’s.')}</span></div>
      <section aria-label={tx('ملخص الكاش باك', 'Cashback summary')} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label={tx('أُضيف للمحافظ', 'Credited to wallets')} value={<Money v={total.credited} />} />
        <Kpi label={tx('قادم بعد التسليم والإرجاع', 'Pending delivery/returns')} hint={tx('كاش باك لطلبات لم تُسلَّم أو ما زالت في مدة الإرجاع. يُضاف تلقائيًا عند استحقاقه.', 'Cashback on orders not delivered yet or still inside the return window. Added automatically when due.')} value={<Money v={total.pending} />} />
        <Kpi label={tx('طلبات مستفيدة', 'Orders that qualified')} value={total.orders} />
        <Kpi label={tx('التكلفة من المبيعات المؤهلة', 'Cost of eligible sales')} hint={tx('(المضاف + القادم) ÷ قيمة المنتجات المؤهلة بعد الخصم والاسترداد.', '(Credited + pending) ÷ eligible goods after discounts and refunds.')} value={total.costPct === null ? '—' : `${total.costPct}%`} />
      </section>
      <Card aria-labelledby="h-cb">
        <CardHeader id="h-cb" title={tx('عروض الكاش باك', 'Cashback offers')} hint={tx('يُحسب على المنتجات المؤهلة بعد الخصم والاسترداد، ولا يشمل الشحن. يُضاف لمحفظة العميل مربوطًا بالطلب.', 'Computed on eligible goods after discounts and refunds, never shipping. Credited to the customer wallet, tied to the order.')}
          action={canManage ? <LinkButton size="sm" href={chref('new')}><Plus className="size-3.5" aria-hidden="true" />{tx('عرض كاش باك', 'New cashback offer')}</LinkButton> : undefined} />
        {offers.length === 0
          ? <EmptyState icon={<BadgePercent className="size-6" aria-hidden="true" />} title={tx('لا عروض كاش باك بعد', 'No cashback offers yet')} action={canManage ? <LinkButton href={chref('new')}>{tx('أنشئ أول عرض', 'Create the first offer')}</LinkButton> : undefined}>{tx('حدد نسبة أو مبلغًا وحدًا أقصى، ويُضاف للعميل بعد التسليم أو بعد مدة الإرجاع.', 'Set a rate or amount and a cap; it reaches the customer after delivery or after the return window.')}</EmptyState>
          : <div className="border-t border-border"><DataTable label={tx('عروض الكاش باك', 'Cashback offers')} rows={offers} columns={cols} rowKey={(o) => o.id} href={(o) => chref(o.id)}
            card={(o) => <div className="space-y-1"><div className="flex items-center justify-between gap-2"><span className="font-semibold text-fg">{o.name}</span><Badge tone={ST_TONE[offerState(o, WALLET_TODAY)]}>{n.state(offerState(o, WALLET_TODAY))}</Badge></div><p className="text-xs text-muted">{n.value(o)}</p><p className="text-[13px] text-fg">{tx('أُضيف', 'Credited')} <Money v={offerResults(rows.get(o.id) ?? []).credited} /></p></div>} /></div>}
        {!canManage && <p className="border-t border-border px-5 py-3"><Locked>{tx('دورك يعرض العروض فقط.', 'Your role can only view offers.')}</Locked></p>}
      </Card>
    </div>
  );
}

function OfferPage({ id, route, canManage }: { id: string; route: Route; canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const toast = useToast();
  const offers = cashbackStore.use();
  const products = productsStore.use();
  const categories = categoriesStore.use();
  const store = drafts.use();
  const isNew = id === 'new';
  const offer = offers.find((o) => o.id === id);
  const base = offer ? offerDraft(offer) : emptyOffer(WALLET_TODAY);
  const d = store[id] ?? base;
  const dirty = JSON.stringify(d) !== JSON.stringify(base);
  const [tried, setTried] = useState(false);
  const [review, setReview] = useState(false);
  const [pause, setPause] = useState(false);
  useUnsaved(dirty, { ar: 'عرض الكاش باك', en: 'Cashback offer' });
  const rowsMap = useAllRows(offer ? [offer] : []);
  const back = { href: chref(), label: tx('الكاش باك', 'Cashback') };
  if (!isNew && !offer) return (
    <Card><EmptyState as="h2" icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا يوجد عرض بهذا المعرف', 'No offer with this id')} action={<LinkButton variant="secondary" href={chref()}>{tx('كل العروض', 'All offers')}</LinkButton>}><Ref>{id}</Ref></EmptyState></Card>
  );
  const errors = validateOffer(d, parseMoney);
  const nErr = Object.keys(errors).length;
  const set = (p: Partial<OfferDraft>) => drafts.set((all) => ({ ...all, [id]: { ...d, ...p } }));
  const discard = () => { drafts.set((all) => { const { [id]: _x, ...rest } = all; return rest; }); setTried(false); };
  const err = (k: keyof typeof errors, m: string) => (tried && errors[k] ? m : null);
  const sample = 400_00;
  const preview = nErr ? null : fromOfferDraft(d, { id: offer?.id ?? 'new', status: offer?.status ?? 'active', by: '', at: '' }, parseMoney);
  const days = returnWindowDays();
  const save = () => {
    const nid = offer?.id ?? `CB-${offers.reduce((m, o) => Math.max(m, Number(o.id.slice(3)) || 0), 0) + 1}`;
    const next = fromOfferDraft(d, { id: nid, status: offer?.status ?? 'active', by: offer?.by ?? tx('أنت', 'You'), at: offer?.at ?? WALLET_TODAY }, parseMoney);
    cashbackStore.set((l) => (offer ? l.map((o) => (o.id === nid ? next : o)) : [next, ...l]));
    logAction('marketing', offer ? { ar: `عدّل عرض الكاش باك ${nid}`, en: `Edited cashback offer ${nid}` } : { ar: `أنشأ عرض كاش باك ${nid}`, en: `Created cashback offer ${nid}` }, { target: nid, after: next.kind === 'pct' ? `${next.value}%` : sar(next.value) });
    discard();
    setReview(false);
    toast({ tone: 'ok', text: offer ? tx('حُفظ العرض. يسري على ما لم يُضف بعد.', 'Offer saved. Applies to cashback not credited yet.') : tx('أُنشئ العرض ويعمل الآن.', 'Offer created and running.') });
    if (!offer) navigate(chref(nid));
  };
  const toggle = () => {
    if (!offer) return;
    const status = offer.status === 'active' ? 'paused' : 'active';
    cashbackStore.set((l) => l.map((o) => (o.id === offer.id ? { ...o, status } : o)));
    logAction('marketing', status === 'paused' ? { ar: `أوقف عرض الكاش باك ${offer.id}`, en: `Paused cashback offer ${offer.id}` } : { ar: `استأنف عرض الكاش باك ${offer.id}`, en: `Resumed cashback offer ${offer.id}` }, { target: offer.id });
    setPause(false);
  };
  const prodOpts = products.filter((p) => p.status === 'active');
  const catNames = categories.length ? categories.map((c) => c.name) : [...new Map(products.map((p) => [p.category.en, p.category])).values()];
  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const st = offer ? offerState(offer, WALLET_TODAY) : null;

  return (
    <div className="space-y-6 pb-20">
      <PageHeader back={back} title={isNew ? tx('عرض كاش باك جديد', 'New cashback offer') : offer!.name}
        meta={st ? <Badge tone={ST_TONE[st]}>{n.state(st)}</Badge> : undefined}
        actions={offer && canManage && st !== 'ended' ? <Button variant="secondary" onClick={() => setPause(true)}>{offer.status === 'active' ? <><Pause className="size-4" aria-hidden="true" />{tx('أوقف', 'Pause')}</> : <><Play className="size-4" aria-hidden="true" />{tx('استأنف', 'Resume')}</>}</Button> : undefined} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="h-cbf">
          <CardHeader id="h-cbf" title={tx('إعداد العرض', 'Offer setup')} />
          <fieldset disabled={!canManage} className="space-y-5 px-5 pb-5">
            <Field label={tx('اسم العرض', 'Offer name')} hint={tx('داخلي، ويظهر في سجل المحفظة', 'Internal; shown in the wallet ledger')} error={err('name', tx('اسم من حرفين على الأقل', 'At least two characters'))}>{(p) => <Input {...p} value={d.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />}</Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label={tx('النوع', 'Type')}>{() => <Segmented label={tx('النوع', 'Type')} value={d.kind} onChange={(v) => set({ kind: v, value: '' })} options={[{ value: 'pct', label: tx('نسبة', 'Percent') }, { value: 'fixed', label: tx('مبلغ', 'Amount') }]} />}</Field>
              <Field label={d.kind === 'pct' ? tx('النسبة %', 'Percent') : tx('المبلغ (ر.س)', 'Amount (SAR)')} error={err('value', d.kind === 'pct' ? tx('من 1 إلى 50', '1 to 50') : tx('من 1 إلى 1,000 ر.س', 'SAR 1 to 1,000'))}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.value} onChange={(e) => set({ value: e.target.value })} />}</Field>
              <Field label={tx('حد لكل طلب (ر.س)', 'Cap per order (SAR)')} optional error={err('cap', tx('1 ر.س أو أكثر', 'SAR 1 or more'))}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.cap} onChange={(e) => set({ cap: e.target.value })} />}</Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label={tx('أقل قيمة مؤهلة (ر.س)', 'Minimum eligible (SAR)')} optional error={err('minOrder', tx('مبلغ غير صالح', 'Invalid amount'))}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.minOrder} onChange={(e) => set({ minOrder: e.target.value })} />}</Field>
              <Field label={tx('يبدأ', 'Starts')}>{(p) => <Input {...p} type="date" dir="ltr" value={d.start} onChange={(e) => set({ start: e.target.value })} />}</Field>
              <Field label={tx('ينتهي', 'Ends')} optional error={err('end', tx('بعد تاريخ البداية', 'After the start date'))}>{(p) => <Input {...p} type="date" dir="ltr" min={d.start} value={d.end} onChange={(e) => set({ end: e.target.value })} />}</Field>
            </div>
            <Field label={tx('المنتجات المؤهلة', 'Eligible products')} error={err('scope', tx('اختر منتجًا أو تصنيفًا واحدًا على الأقل', 'Choose at least one product or category'))}>
              {() => (
                <div className="space-y-3">
                  <Segmented label={tx('النطاق', 'Scope')} value={d.scope} onChange={(v) => set({ scope: v })} options={[{ value: 'all', label: tx('كل المنتجات', 'All products') }, { value: 'categories', label: tx('تصنيفات', 'Categories') }, { value: 'products', label: tx('منتجات', 'Products') }]} />
                  {d.scope === 'categories' && <div className="flex flex-wrap gap-x-4 gap-y-2">{catNames.map((c) => <Checkbox key={c.en} label={c[lang]} checked={d.categories.includes(c.en)} onChange={() => set({ categories: toggleIn(d.categories, c.en) })} />)}</div>}
                  {d.scope === 'products' && <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-border p-3 sm:grid-cols-2">{prodOpts.map((p) => <Checkbox key={p.id} label={p.name[lang]} checked={d.products.includes(p.id)} onChange={() => set({ products: toggleIn(d.products, p.id) })} />)}</div>}
                </div>
              )}
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={tx('متى يُضاف للعميل', 'When the customer gets it')}>{() => <Segmented label={tx('متى يُضاف', 'When credited')} value={d.trigger} onChange={(v) => set({ trigger: v })} options={[{ value: 'returnWindow', label: tx(`بعد مدة الإرجاع (${days} يوم)`, `After returns (${days} d)`) }, { value: 'delivered', label: tx('عند التسليم', 'On delivery') }]} />}</Field>
              <Field label={tx('صلاحية الكاش باك (يوم)', 'Cashback valid for (days)')} optional hint={tx('فارغ = بلا انتهاء', 'Empty = never')} error={err('expiry', tx('من 7 إلى 1095 يومًا', '7 to 1,095 days'))}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.expiryDays} onChange={(e) => set({ expiryDays: e.target.value })} />}</Field>
            </div>
            {d.trigger === 'delivered' && <Alert tone="warn">{tx('عند التسليم قد يصرفه العميل ثم يُرجع الطلب؛ عندها يُسحب غير المصروف فقط.', 'On delivery the customer may spend it, then return the order; only the unspent part can be taken back.')}</Alert>}
          </fieldset>
        </Card>

        <Card aria-labelledby="h-cbp">
          <CardHeader id="h-cbp" title={tx('ما يراه العميل', 'What the customer sees')} hint={tx('على صفحة المنتج وتأكيد الطلب. طلب مثال 400 ر.س، ليس توقعًا.', 'On the product page and order confirmation. A SAR 400 sample order, not a forecast.')} />
          <div className="space-y-3 px-5 pb-5 text-sm">
            {preview ? <>
              <div className="rounded-xl bg-brand-500/10 px-4 py-3 text-brand-800 dark:text-brand-200">
                <p className="font-semibold">{d.kind === 'pct' ? tx(`اكسب ${preview.value}% كاش باك`, `Earn ${preview.value}% cashback`) : tx(`اكسب ${sar(preview.value)} ر.س كاش باك`, `Earn SAR ${sar(preview.value)} cashback`)}{preview.cap !== null ? tx(` حتى ${sar(preview.cap)} ر.س`, ` up to SAR ${sar(preview.cap)}`) : ''}</p>
                <p className="mt-0.5 text-xs">{d.trigger === 'returnWindow' ? tx(`يُضاف لمحفظتك بعد ${days} يومًا من التسليم`, `Added to your wallet ${days} days after delivery`) : tx('يُضاف لمحفظتك عند التسليم', 'Added to your wallet on delivery')}{preview.expiryDays !== null ? tx(`، صالح ${preview.expiryDays} يومًا`, `, valid ${preview.expiryDays} days`) : ''}</p>
              </div>
              <dl className="space-y-2">
                <div className="flex justify-between"><dt className="text-muted">{tx('طلب مثال', 'Sample order')}</dt><dd><Money v={sample} /></dd></div>
                <div className="flex justify-between"><dt className="text-muted">{tx('يكسب', 'Earns')}</dt><dd className="font-semibold text-emerald-700 dark:text-emerald-400"><Money v={cashbackPreview(preview, sample)} /></dd></div>
              </dl>
            </> : <p className="text-muted">{tx('أكمل الحقول لترى المعاينة.', 'Complete the fields to see the preview.')}</p>}
          </div>
        </Card>
      </div>

      {offer && <Results route={route} offer={offer} rows={rowsMap.get(offer.id) ?? []} />}

      {canManage && <SaveBar dirty={dirty || isNew} onSave={() => { setTried(true); if (!nErr) setReview(true); }} onDiscard={() => { discard(); if (isNew) replace(chref()); }} saveLabel={isNew ? tx('راجع وأنشئ', 'Review and create') : tx('راجع واحفظ', 'Review and save')} error={tried && nErr ? tx(`صحّح ${nErr} حقول`, `Fix ${nErr} field(s)`) : undefined} />}

      {review && preview && (
        <Modal title={isNew ? tx('مراجعة قبل الإنشاء', 'Review before creating') : tx('مراجعة التعديل', 'Review the change')} onClose={() => setReview(false)}
          footer={<><Button variant="secondary" onClick={() => setReview(false)}>{tx('عدّل', 'Edit')}</Button><Button onClick={save}>{isNew ? tx('أنشئ العرض', 'Create offer') : tx('احفظ', 'Save')}</Button></>}>
          <dl className="divide-y divide-border rounded-xl border border-border text-sm">
            {[[tx('المكافأة', 'Reward'), n.value(preview)], [tx('النطاق', 'Scope'), d.scope === 'all' ? tx('كل المنتجات', 'All products') : d.scope === 'categories' ? tx(`${d.categories.length} تصنيف`, `${d.categories.length} categories`) : tx(`${d.products.length} منتج`, `${d.products.length} products`)],
              [tx('المدة', 'Dates'), `${d.start} → ${d.end || tx('مفتوح', 'open')}`], [tx('يُضاف', 'Credited'), d.trigger === 'returnWindow' ? tx(`بعد ${days} يومًا من التسليم`, `${days} days after delivery`) : tx('عند التسليم', 'On delivery')],
              [tx('الصلاحية', 'Validity'), preview.expiryDays === null ? tx('بلا انتهاء', 'Never expires') : tx(`${preview.expiryDays} يومًا`, `${preview.expiryDays} days`)]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-4 py-2.5"><dt className="text-muted">{k}</dt><dd className="text-end font-semibold text-fg">{v}</dd></div>
            ))}
          </dl>
          <ul className="space-y-1 text-[13px] text-muted">
            <li>{tx('يشمل الطلبات المدفوعة لعملاء مسجّلين داخل المدة. لا يشمل الشحن.', 'Covers paid orders of known customers within the dates. Never shipping.')}</li>
            <li>{tx('التكلفة على متجرك وتظهر كرصيد قائم للعملاء في المالية حتى تُصرف أو تنتهي.', 'The cost is your store’s and shows as outstanding customer credit in Finance until spent or expired.')}</li>
            {!isNew && <li>{tx('ما أُضيف سابقًا لا يتغير؛ التعديل يسري على ما لم يُضف بعد.', 'Cashback already credited does not change; edits apply to what is not credited yet.')}</li>}
          </ul>
          <Simulated />
        </Modal>
      )}
      {pause && offer && (
        <Modal title={offer.status === 'active' ? tx('إيقاف العرض', 'Pause the offer') : tx('استئناف العرض', 'Resume the offer')} onClose={() => setPause(false)}
          footer={<><Button variant="secondary" onClick={() => setPause(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={toggle}>{offer.status === 'active' ? tx('أوقف', 'Pause') : tx('استأنف', 'Resume')}</Button></>}>
          <p className="text-sm text-fg">{offer.status === 'active' ? tx('لا تكسب الطلبات الجديدة ولا المعلّقة كاش باك أثناء الإيقاف. ما أُضيف يبقى في المحافظ.', 'New and pending orders earn nothing while paused. Cashback already credited stays in wallets.') : tx('تعود الطلبات داخل المدة للكسب، وتُضاف المستحقة تلقائيًا.', 'Orders within the dates earn again; due cashback is added automatically.')}</p>
        </Modal>
      )}
    </div>
  );
}

function Results({ route, offer, rows: all }: { route: Route; offer: CashbackOffer; rows: CashbackRow[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const customers = customersStore.use();
  const st = route.query.get('st') ?? '';
  const rows = all.filter((r) => !st || r.state === st).sort((a, b) => (b.dueOn ?? '').localeCompare(a.dueOn ?? ''));
  const pg = paginate(rows, Number(route.query.get('page')) || 1, 12);
  const r = offerResults(all);
  const href = (p: Record<string, string | undefined>) => chref(offer.id, { st: st || undefined, ...p });
  const name = (id: string) => customers.find((c) => c.id === id)?.name[lang] ?? id;
  const cols: Column<CashbackRow>[] = [
    { key: 'o', header: tx('الطلب', 'Order'), cell: (x) => <a href={link(`/dashboard/orders/${x.orderRef}`)} className="font-semibold text-fg hover:text-brand-700"><Ref>#{x.orderRef}</Ref></a> },
    { key: 'c', header: tx('العميل', 'Customer'), hideBelow: 'lg', cell: (x) => <span className="text-[13px] text-fg">{name(x.customerId)}</span> },
    { key: 'b', header: tx('المؤهل', 'Eligible'), align: 'end', hideBelow: 'lg', cell: (x) => <Money v={x.base} /> },
    { key: 'a', header: tx('الكاش باك', 'Cashback'), align: 'end', cell: (x) => <Money v={x.state === 'credited' ? x.credited : x.amount} /> },
    { key: 's', header: tx('الحالة', 'Status'), cell: (x) => <span className="flex flex-wrap items-center gap-1.5"><Badge tone={ROW_TONE[x.state]}>{n.row(x.state)}</Badge>{x.state === 'in_window' && x.dueOn && <span className="text-xs text-muted"><Ref>{x.dueOn}</Ref></span>}</span> },
  ];
  return (
    <Card aria-labelledby="h-cbr">
      <CardHeader id="h-cbr" title={tx('النتائج', 'Results')} hint={tx('كل طلب داخل مدة العرض وأين وصل. يوم التسليم يُقدَّر بيوم الطلب حين لا يُسجَّل.', 'Every order within the offer dates and where it stands. Delivery day is approximated by the order day when not recorded.')} />
      <dl className="grid grid-cols-2 gap-3 px-5 pb-4 sm:grid-cols-4">
        {[[tx('أُضيف', 'Credited'), <Money key="c" v={r.credited} />], [tx('قادم', 'Pending'), <Money key="p" v={r.pending} />], [tx('طلبات', 'Orders'), r.orders], [tx('عملاء', 'Customers'), r.customers]].map(([k, v], i) => (
          <div key={i} className="rounded-xl bg-surface-2 px-3 py-2.5"><dt className="text-xs text-muted">{k}</dt><dd className="mt-0.5 text-lg font-bold tabular-nums text-fg">{v}</dd></div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-5">
        <FilterChip label={tx('الحالة', 'Status')} value={st} onChange={(v) => replace(href({ st: v || undefined, page: undefined }))} options={(['credited', 'in_window', 'waiting_delivery', 'due', 'void'] as const).map((s) => ({ value: s, label: n.row(s) }))} />
        <span className="flex items-center gap-1 text-xs text-muted">{tx('الإيرادات لا تتغير', 'Revenue is unchanged')}<InfoHint>{tx('الكاش باك لا يخصم من مبلغ الطلب؛ يصبح رصيدًا قائمًا للعميل حتى يُصرف.', 'Cashback does not reduce the order amount; it becomes outstanding customer credit until spent.')}</InfoHint></span>
      </div>
      {pg.total === 0
        ? <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={all.length ? tx('لا طلبات بهذه الحالة', 'No orders in this status') : tx('لا طلبات مؤهلة بعد', 'No qualifying orders yet')} action={st ? <LinkButton variant="secondary" href={chref(offer.id)}>{tx('امسح الفلتر', 'Clear filter')}</LinkButton> : undefined} />
        : <div className="border-t border-border">
          <DataTable label={tx('نتائج العرض', 'Offer results')} rows={pg.rows} columns={cols} rowKey={(x) => x.orderRef}
            card={(x) => <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-fg"><Ref>#{x.orderRef}</Ref> · {name(x.customerId)}</p><Badge tone={ROW_TONE[x.state]}>{n.row(x.state)}</Badge></div><Money v={x.state === 'credited' ? x.credited : x.amount} /></div>} />
          <Pagination page={pg.page} pages={pg.pages} total={pg.total} hrefFor={(p) => href({ page: p > 1 ? String(p) : undefined })} />
        </div>}
    </Card>
  );
}
