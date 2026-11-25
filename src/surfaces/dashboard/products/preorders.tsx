// Pre-order campaigns (`#/dashboard/products/preorders`): sell before stock arrives, between two dates, up to a cap,
// paid in full or by deposit, with the expected ship date shown to shoppers. Orders taken are flagged and listed here.
// Each campaign is checked against incoming stock (transfers) and stock on hand, so the merchant sees what is promised
// but not covered before it becomes a late order. Rules: merchant/catalog-extras.ts.
import { useMemo, useState } from 'react';
import { CalendarClock, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import type { Route } from '../../../core/router';
import { useLang } from '../../../core/lang';
import { addDays, campaignCover, campaignState, riyadhToday, validateCampaign, type Campaign, type CampaignState } from '../../merchant/catalog-extras';
import { can } from '../../merchant/perms';
import { catalogXStore, levelsStore, logAction, ordersStore, productsStore } from '../../merchant/stores';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, Field, Input, Modal, PageHeader, SearchInput, Select, useToast } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { useUnsaved } from '../unsaved';
import { CatalogNav, ReviewTools, ihref, phref, roleBadge, useRole } from './common';
import { ProductFacts, useDay } from './storefront-parts';
import { normaliseDigits } from '../../merchant/catalog';

const TONE: Record<CampaignState, Tone> = { live: 'green', scheduled: 'sky', full: 'amber', ended: 'gray', paused: 'gray' };
let kept: { c: Campaign; isNew: boolean } | null = null;
const blank = (today: string): Campaign => ({ id: '', name: { ar: '', en: '' }, productIds: [], starts: today, ends: addDays(today, 14), cap: 50, pay: 'full', depositPct: 30, shipDate: addDays(today, 21), taken: 0, paused: false });

export default function Preorders({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const day = useDay();
  const state = useDashState();
  const role = useRole();
  const canEdit = can(role, 'product.edit');
  const toast = useToast();
  const x = catalogXStore.use();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const orders = ordersStore.use();
  const today = riyadhToday();
  const [form, setForm] = useState<{ c: Campaign; isNew: boolean } | null>(kept);
  void route;
  const stateName = (s: CampaignState) => ({ live: tx('تستقبل طلبات', 'Taking orders'), scheduled: tx('مجدولة', 'Scheduled'), full: tx('اكتمل العدد', 'Cap reached'), ended: tx('انتهت', 'Ended'), paused: tx('موقوفة', 'Paused') })[s];
  const header = (
    <PageHeader back={{ href: phref(), label: tx('المنتجات', 'Products') }} title={tx('الطلب المسبق', 'Pre-orders')}
      description={tx('بع قبل وصول المخزون، بتاريخ شحن متوقع يراه العميل.', 'Sell before stock arrives, with an expected ship date shoppers see.')}
      meta={!canEdit ? roleBadge(tx) : undefined}
      actions={canEdit && <Button onClick={() => setForm({ c: blank(today), isNew: true })}><Plus className="size-4" aria-hidden="true" />{tx('حملة جديدة', 'New campaign')}</Button>} />
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<CatalogNav /><Skeleton className="h-64 rounded-2xl" /></div>;
  if (state === 'error') return <div className="space-y-6">{header}<CatalogNav /><Card><ErrorState as="h2" title={tx('تعذّر تحميل الحملات', 'Campaigns could not load')} onRetry={() => setDashState('live')}>{tx('لم يتغير شيء. المرجع SIM-PRE-503.', 'Nothing changed. Ref SIM-PRE-503.')}</ErrorState></Card></div>;
  const list = state === 'empty' ? [] : x.campaigns;
  const pause = (c: Campaign) => {
    catalogXStore.set((s) => ({ ...s, campaigns: s.campaigns.map((y) => (y.id === c.id ? { ...y, paused: !y.paused } : y)) }));
    logAction('products', c.paused ? { ar: `استأنف حملة ${c.name.ar}`, en: `Resumed campaign ${c.name.en}` } : { ar: `أوقف حملة ${c.name.ar}`, en: `Paused campaign ${c.name.en}` }, { target: c.id });
    toast({ tone: 'ok', text: c.paused ? tx('استؤنفت؛ المنتج يعود للطلب المسبق في المتجر', 'Resumed; the product is back on pre-order in the store') : tx('أُوقفت؛ المنتج يُباع من المخزون فقط', 'Paused; the product sells from stock only') });
  };
  const remove = (c: Campaign) => {
    const before = catalogXStore.get().campaigns;
    catalogXStore.set((s) => ({ ...s, campaigns: s.campaigns.filter((y) => y.id !== c.id) }));
    logAction('products', { ar: `حذف حملة ${c.name.ar}`, en: `Deleted campaign ${c.name.en}` }, { target: c.id });
    toast({ tone: 'info', text: tx('حُذفت الحملة', 'Campaign deleted'), action: { label: tx('تراجع', 'Undo'), run: () => catalogXStore.set((s) => ({ ...s, campaigns: before })) } });
  };
  return (
    <div className="space-y-6">
      {header}
      <CatalogNav />
      {list.length === 0 ? (
        <Card><EmptyState as="h2" icon={<CalendarClock className="size-6" aria-hidden="true" />} title={tx('لا حملات طلب مسبق', 'No pre-order campaigns')} action={canEdit ? <Button onClick={() => setForm({ c: blank(today), isNew: true })}>{tx('أنشئ حملة', 'Create a campaign')}</Button> : undefined}>{tx('مفيد للإصدارات الجديدة والمخزون الوارد.', 'Useful for new releases and incoming stock.')}</EmptyState></Card>
      ) : list.map((c) => {
        const st = campaignState(c, today);
        const cover = campaignCover(c, products, levels);
        const taken = orders.filter((o) => o.extras?.preorder?.campaignId === c.id);
        const pct = c.cap ? Math.min(100, Math.round((c.taken * 100) / c.cap)) : null;
        return (
          <Card key={c.id} aria-labelledby={`pc-${c.id}`}>
            <CardHeader id={`pc-${c.id}`} title={<span className="flex flex-wrap items-center gap-2">{c.name[lang]}<Badge tone={TONE[st]}>{stateName(st)}</Badge></span>}
              action={canEdit && <span className="flex items-center gap-1">
                {st !== 'ended' && <Button size="sm" variant="ghost" onClick={() => pause(c)}>{c.paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}{c.paused ? tx('استأنف', 'Resume') : tx('أوقف', 'Pause')}</Button>}
                <Button size="sm" variant="ghost" onClick={() => setForm({ c, isNew: false })}><Pencil className="size-4" aria-hidden="true" />{tx('عدّل', 'Edit')}</Button>
                {c.taken === 0 && <Button size="sm" variant="ghost" onClick={() => remove(c)} aria-label={tx('احذف', 'Delete')}><Trash2 className="size-4" aria-hidden="true" /></Button>}
              </span>} />
            <div className="space-y-4 px-5 pb-5">
              <p className="text-sm font-medium text-fg">{day(c.starts)} – {day(c.ends)} · {tx('الشحن نحو', 'ships around')} {day(c.shipDate)} · {c.pay === 'deposit' ? tx(`دفعة ${c.depositPct}٪`, `${c.depositPct}% deposit`) : tx('دفع كامل', 'paid in full')}</p>
              <p className="text-sm text-muted">{c.productIds.map((id) => products.find((p) => p.id === id)?.name[lang] ?? id).join(lang === 'ar' ? '، ' : ', ')}</p>
              <div>
                <div className="flex items-baseline justify-between text-sm"><span className="font-semibold text-fg">{tx(`${c.taken} قطعة مطلوبة`, `${c.taken} units ordered`)}</span><span className="text-muted">{c.cap ? tx(`الحد ${c.cap}`, `cap ${c.cap}`) : tx('بلا حد', 'no cap')}</span></div>
                {pct !== null && <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={tx('نسبة الامتلاء', 'Filled')}><div className="h-full rounded-full bg-brand-gradient" style={{ width: `${pct}%` }} /></div>}
              </div>
              <dl className="grid grid-cols-2 gap-3 rounded-xl bg-surface-2 p-3 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-muted">{tx('الوعد', 'Promised')}</dt><dd className="font-bold tabular-nums">{cover.promised}</dd></div>
                <div><dt className="text-xs text-muted">{tx('متاح الآن', 'On hand')}</dt><dd className="font-bold tabular-nums">{cover.onHand}</dd></div>
                <div><dt className="text-xs text-muted">{tx('وارد بالتحويلات', 'Incoming')}</dt><dd className="font-bold tabular-nums">{cover.incoming}</dd></div>
                <div><dt className="text-xs text-muted">{tx('غير مغطّى', 'Not covered')}</dt><dd className={cn('font-bold tabular-nums', cover.uncovered ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400')}>{cover.uncovered}</dd></div>
              </dl>
              {cover.uncovered > 0 && st !== 'ended' && <Alert tone="warn" title={tx(`${cover.uncovered} قطعة موعودة بلا مخزون ولا وارد`, `${cover.uncovered} promised units have no stock or incoming`)} action={<a className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300" href={ihref('', { tab: 'transfers' })}>{tx('افتح التحويلات', 'Open transfers')}</a>}>{tx('خفّض الحد أو أنشئ تحويلًا قبل تاريخ الشحن.', 'Lower the cap or create a transfer before the ship date.')}</Alert>}
              {taken.length > 0 && <p className="text-sm"><span className="text-muted">{tx('طلبات الحملة: ', 'Campaign orders: ')}</span>{taken.slice(0, 8).map((o, i) => <span key={o.ref}>{i > 0 && ', '}<a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={`#/dashboard/orders/${o.ref}`}><bdi dir="ltr">#{o.ref}</bdi></a></span>)}</p>}
            </div>
          </Card>
        );
      })}
      <ReviewTools />
      {form && <CampaignForm initial={form.c} isNew={form.isNew} onClose={() => { kept = null; setForm(null); }} onKeep={(c) => { kept = { c, isNew: form.isNew }; }} />}
    </div>
  );
}

function CampaignForm({ initial, isNew, onClose, onKeep }: { initial: Campaign; isNew: boolean; onClose: () => void; onKeep: (c: Campaign) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const x = catalogXStore.use();
  const products = productsStore.use();
  const today = riyadhToday();
  const [c, setC] = useState(initial);
  const [capText, setCapText] = useState(initial.cap === null ? '' : String(initial.cap));
  const [q, setQ] = useState('');
  const [tried, setTried] = useState(false);
  useUnsaved(JSON.stringify(c) !== JSON.stringify(initial), { ar: 'حملة الطلب المسبق', en: 'Pre-order campaign' });
  const set = (p: Partial<Campaign>) => { const n = { ...c, ...p }; setC(n); onKeep(n); };
  const id = c.id || `pc-${Date.now().toString(36)}`;
  const capN = capText.trim() ? Number(normaliseDigits(capText)) : null;
  const def: Campaign = { ...c, id, cap: capN === null || Number.isNaN(capN) ? (capText.trim() ? -1 : null) : capN };
  const errs = validateCampaign(def, x.campaigns, today, isNew);
  const msg = (k: keyof typeof errs) => (tried && errs[k] ? ({ required: tx('مطلوب', 'Required'), dates: tx('بعد تاريخ البداية', 'After the start'), ship: tx('بعد بداية الحملة', 'After the campaign starts'), cap: tx('عدد من 1 فأكثر، ولا يقل عن المطلوب', '1 or more, not below what is ordered'), deposit: tx('من 10٪ إلى 90٪', '10% to 90%'), overlap: tx('منتج في حملة أخرى بالفترة نفسها', 'A product is in another campaign at the same time'), past: tx('من اليوم فصاعدًا', 'Today or later') })[errs[k]!] : undefined);
  const pool = useMemo(() => products.filter((p) => p.status !== 'archived' && p.type !== 'booking' && p.type !== 'service' && p.type !== 'code' && (!q.trim() || `${p.name.ar} ${p.name.en} ${p.sku}`.toLowerCase().includes(q.trim().toLowerCase()))), [products, q]);
  const sample = products.find((p) => p.id === c.productIds[0]);
  const save = () => {
    setTried(true);
    if (Object.keys(errs).length) return;
    catalogXStore.set((s) => ({ ...s, campaigns: isNew ? [...s.campaigns, def] : s.campaigns.map((y) => (y.id === id ? def : y)) }));
    logAction('products', isNew ? { ar: `أنشأ حملة طلب مسبق ${def.name.ar}`, en: `Created pre-order campaign ${def.name.en}` } : { ar: `عدّل حملة ${def.name.ar}`, en: `Edited campaign ${def.name.en}` }, { target: id });
    toast({ tone: 'ok', text: campaignState(def, today) === 'live' ? tx('حُفظت؛ المنتجات الآن «طلب مسبق» في المتجر', 'Saved; the products are now on pre-order in the store') : tx('حُفظت الحملة', 'Campaign saved') });
    onClose();
  };
  return (
    <Modal size="lg" title={isNew ? tx('حملة طلب مسبق', 'Pre-order campaign') : tx('تعديل الحملة', 'Edit campaign')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={save}>{tx('احفظ', 'Save')}</Button></>}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={tx('الاسم بالعربية', 'Arabic name')} error={msg('nameAr')}>{(p) => <Input {...p} value={c.name.ar} onChange={(e) => set({ name: { ...c.name, ar: e.target.value } })} />}</Field>
            <Field label={tx('الاسم بالإنجليزية', 'English name')} error={msg('nameEn')}>{(p) => <Input {...p} dir="ltr" value={c.name.en} onChange={(e) => set({ name: { ...c.name, en: e.target.value } })} />}</Field>
            <Field label={tx('تبدأ', 'Starts')} error={msg('starts')}>{(p) => <Input {...p} type="date" dir="ltr" value={c.starts} onChange={(e) => set({ starts: e.target.value })} />}</Field>
            <Field label={tx('تنتهي', 'Ends')} error={msg('ends')}>{(p) => <Input {...p} type="date" dir="ltr" value={c.ends} min={c.starts} onChange={(e) => set({ ends: e.target.value })} />}</Field>
            <Field label={tx('تاريخ الشحن المتوقع', 'Expected ship date')} error={msg('shipDate')} hint={tx('يراه العميل في المنتج والدفع والطلب', 'Shoppers see it on the product, checkout and order')}>{(p) => <Input {...p} type="date" dir="ltr" value={c.shipDate} onChange={(e) => set({ shipDate: e.target.value })} />}</Field>
            <Field label={tx('أقصى عدد', 'Cap (units)')} optional error={msg('cap')} hint={tx('فارغ = بلا حد', 'Empty = no cap')}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={capText} onChange={(e) => setCapText(e.target.value)} />}</Field>
            <Field label={tx('الدفع', 'Payment')}>{(p) => <Select {...p} value={c.pay} onChange={(e) => set({ pay: e.target.value as Campaign['pay'] })}><option value="full">{tx('كامل عند الطلب', 'In full when ordering')}</option><option value="deposit">{tx('دفعة مقدمة والباقي قبل الشحن', 'Deposit now, the rest before shipping')}</option></Select>}</Field>
            {c.pay === 'deposit' && <Field label={tx('نسبة الدفعة (٪)', 'Deposit (%)')} error={msg('deposit')}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={String(c.depositPct)} onChange={(e) => set({ depositPct: Number(normaliseDigits(e.target.value)) || 0 })} />}</Field>}
          </div>
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-fg">{tx('المنتجات', 'Products')} <span className="font-normal text-muted">({c.productIds.length})</span></legend>
            <SearchInput value={q} onChange={setQ} placeholder={tx('ابحث بالاسم أو SKU', 'Search by name or SKU')} />
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {pool.map((p) => <li key={p.id}><label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"><input type="checkbox" className="accent-brand-600" checked={c.productIds.includes(p.id)} onChange={() => set({ productIds: c.productIds.includes(p.id) ? c.productIds.filter((y) => y !== p.id) : [...c.productIds, p.id] })} />{p.name[lang]}<bdi dir="ltr" className="ms-auto text-xs text-muted">{p.sku}</bdi></label></li>)}
            </ul>
            {msg('products') && <p role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{msg('products')}</p>}
          </fieldset>
          <p className="text-xs text-muted">{tx('أثناء الحملة يُباع المنتج طلبًا مسبقًا فقط حتى الحد، ولا يُحجز من المخزون الحالي؛ تُعلَّم الطلبات «طلب مسبق».', 'During the campaign the product sells on pre-order only, up to the cap, without holding current stock; orders are flagged “Pre-order”.')}</p>
        </div>
        <aside className="space-y-2 rounded-xl bg-surface-2 p-3" aria-label={tx('معاينة', 'Preview')}>
          <p className="text-xs font-semibold text-muted">{tx('ما يراه العميل', 'What the shopper sees')}</p>
          {sample ? <>
            <p className="text-sm font-semibold">{sample.name[lang]}</p>
            <ProductFacts x={{ type: sample.type, ships: true, attrs: [], attrValues: {}, preorder: { campaignId: id, name: c.name, shipDate: c.shipDate, pay: c.pay, depositPct: c.depositPct, left: def.cap === null || def.cap < 0 ? null : Math.max(0, def.cap - c.taken) } }} price={sample.price} />
            <span className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-3 text-[13px] font-semibold text-white">{tx('اطلب مسبقًا', 'Pre-order')}</span>
          </> : <p className="text-sm text-muted">{tx('اختر منتجًا لترى المعاينة.', 'Pick a product to preview.')}</p>}
        </aside>
      </div>
    </Modal>
  );
}
