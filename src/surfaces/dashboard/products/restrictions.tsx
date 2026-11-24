// Purchase limits (`#/dashboard/products/restrictions`): per-customer maximum, minimum per order, delivery cities, age
// confirmation and hiding from channels, for products or whole categories. The online store enforces them on the
// product page and at checkout. Before saving, the merchant tries the rule on a basket and sees the shopper's message;
// rules that overlap on a product say which limit wins. Rules: merchant/catalog-extras.ts.
import { useMemo, useState } from 'react';
import { FlaskConical, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { Route } from '../../../core/router';
import { useLang } from '../../../core/lang';
import type { Channel } from '../../merchant/domain';
import { catKey, categoryTree, normaliseDigits } from '../../merchant/catalog';
import { checkBasket, limitsFor, restrictionCovers, restrictionOverlaps, validateRestriction, type Restriction } from '../../merchant/catalog-extras';
import { can } from '../../merchant/perms';
import { catalogXStore, categoriesStore, logAction, productsStore } from '../../merchant/stores';
import { CITIES } from '../../storefront/domain';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, PageHeader, SearchInput, Select, Switch, useToast } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { useUnsaved } from '../unsaved';
import { CatalogNav, ReviewTools, phref, productCount, roleBadge, useNames, useRole } from './common';

const blank = (): Restriction => ({ id: '', name: { ar: '', en: '' }, active: true, productIds: [], cats: [], maxPerCustomer: null, minQty: null, cities: { mode: 'all', list: [] }, age: null, hideOn: [] });
let kept: { r: Restriction; isNew: boolean } | null = null;
const CHANNELS: Channel[] = ['online', 'market', 'app'];

export default function Restrictions({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const state = useDashState();
  const role = useRole();
  const canEdit = can(role, 'product.edit');
  const toast = useToast();
  const x = catalogXStore.use();
  const products = productsStore.use();
  const [form, setForm] = useState<{ r: Restriction; isNew: boolean } | null>(kept);
  const summary = useSummary();
  void route;
  const header = (
    <PageHeader back={{ href: phref(), label: tx('المنتجات', 'Products') }} title={tx('قيود الشراء', 'Purchase limits')}
      description={tx('حد لكل عميل، أو أقل كمية، أو مدن التوصيل، أو تأكيد العمر، أو الإخفاء من قناة. يطبّقها المتجر في صفحة المنتج وعند الدفع.', 'Per-customer limit, minimum quantity, delivery cities, age confirmation or hiding from a channel. The store enforces them on the product page and at checkout.')}
      meta={!canEdit ? roleBadge(tx) : undefined}
      actions={canEdit && <Button onClick={() => setForm({ r: blank(), isNew: true })}><Plus className="size-4" aria-hidden="true" />{tx('قيد جديد', 'New limit')}</Button>} />
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<CatalogNav /><Skeleton className="h-64 rounded-2xl" /></div>;
  if (state === 'error') return <div className="space-y-6">{header}<CatalogNav /><Card><ErrorState as="h2" title={tx('تعذّر تحميل القيود', 'Limits could not load')} onRetry={() => setDashState('live')}>{tx('لم يتغير شيء. المرجع SIM-RST-503.', 'Nothing changed. Ref SIM-RST-503.')}</ErrorState></Card></div>;
  const list = state === 'empty' ? [] : x.restrictions;
  const overlaps = restrictionOverlaps(list, products);
  const toggle = (r: Restriction) => {
    catalogXStore.set((s) => ({ ...s, restrictions: s.restrictions.map((y) => (y.id === r.id ? { ...y, active: !y.active } : y)) }));
    logAction('products', r.active ? { ar: `أوقف القيد ${r.name.ar}`, en: `Turned off limit ${r.name.en}` } : { ar: `فعّل القيد ${r.name.ar}`, en: `Turned on limit ${r.name.en}` }, { target: r.id });
  };
  const remove = (r: Restriction) => {
    const before = catalogXStore.get().restrictions;
    catalogXStore.set((s) => ({ ...s, restrictions: s.restrictions.filter((y) => y.id !== r.id) }));
    logAction('products', { ar: `حذف القيد ${r.name.ar}`, en: `Deleted limit ${r.name.en}` }, { target: r.id });
    toast({ tone: 'info', text: tx('حُذف القيد ولم يعد يُطبَّق في المتجر', 'Limit deleted; the store no longer applies it'), action: { label: tx('تراجع', 'Undo'), run: () => catalogXStore.set((s) => ({ ...s, restrictions: before })) } });
  };
  return (
    <div className="space-y-6">
      {header}
      <CatalogNav />
      {overlaps.length > 0 && (
        <Alert tone="info" title={tx('منتجات عليها أكثر من قيد كمية', 'Products with more than one quantity limit')}>
          <ul className="mt-1 space-y-0.5">{overlaps.map((o) => { const lim = limitsFor(list, products.find((p) => p.name.en === o.product.en)!); return <li key={o.product.en}>{o.product[lang]}: {tx('يُطبَّق الأشد', 'the strictest applies')}{lim.max !== null ? tx(` · الحد ${lim.max}`, ` · max ${lim.max}`) : ''}{lim.min !== null ? tx(` · الأقل ${lim.min}`, ` · min ${lim.min}`) : ''}</li>; })}</ul>
        </Alert>
      )}
      <Card>
        {list.length === 0 ? <EmptyState as="h2" icon={<ShieldCheck className="size-6" aria-hidden="true" />} title={tx('لا قيود', 'No limits')} action={canEdit ? <Button onClick={() => setForm({ r: blank(), isNew: true })}>{tx('أضف قيدًا', 'Add a limit')}</Button> : undefined}>{tx('مثل «قطعتان لكل عميل» للإصدارات المحدودة.', 'Like “two per customer” for limited releases.')}</EmptyState> : (
          <ul className="divide-y divide-border">
            {list.map((r) => {
              const n = products.filter((p) => restrictionCovers(r, p)).length;
              return (
                <li key={r.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5', !r.active && 'opacity-60')}>
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="font-semibold text-fg">{r.name[lang]}</p>
                    <p className="mt-1 flex flex-wrap gap-1.5">{summary(r).map((s) => <Badge key={s} tone="gray">{s}</Badge>)}</p>
                    <p className="mt-1 text-xs text-muted">{productCount(tx, n)}</p>
                  </div>
                  {canEdit && <div className="flex items-center gap-1">
                    <Switch checked={r.active} onChange={() => toggle(r)} label={tx(`تفعيل ${r.name.ar}`, `${r.name.en} on`)} />
                    <button type="button" aria-label={tx('عدّل', 'Edit')} title={tx('عدّل', 'Edit')} className="grid size-9 place-items-center rounded-lg border border-border text-muted hover:bg-surface-2 hover:text-fg" onClick={() => setForm({ r, isNew: false })}><Pencil className="size-4" aria-hidden="true" /></button>
                    <button type="button" aria-label={tx('احذف', 'Delete')} title={tx('احذف', 'Delete')} className="grid size-9 place-items-center rounded-lg border border-border text-muted hover:bg-surface-2 hover:text-fg" onClick={() => remove(r)}><Trash2 className="size-4" aria-hidden="true" /></button>
                  </div>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <ReviewTools />
      {form && <RestrictionForm initial={form.r} isNew={form.isNew} onClose={() => { kept = null; setForm(null); }} onKeep={(r) => { kept = { r, isNew: form.isNew }; }} />}
    </div>
  );
}

function useSummary() {
  const tx = useTx();
  const { lang } = useLang();
  const names = useNames();
  const city = (id: string) => CITIES.find((c) => c.id === id)?.name[lang] ?? id;
  return (r: Restriction): string[] => [
    ...(r.maxPerCustomer !== null ? [tx(`الحد ${r.maxPerCustomer} لكل عميل`, `Max ${r.maxPerCustomer} per customer`)] : []),
    ...(r.minQty !== null ? [tx(`أقل كمية ${r.minQty}`, `Min ${r.minQty} per order`)] : []),
    ...(r.cities.mode === 'only' ? [tx(`إلى ${r.cities.list.map(city).join('، ')} فقط`, `Only ${r.cities.list.map(city).join(', ')}`)] : r.cities.mode === 'except' ? [tx(`عدا ${r.cities.list.map(city).join('، ')}`, `Not ${r.cities.list.map(city).join(', ')}`)] : []),
    ...(r.age !== null ? [tx(`العمر ${r.age}+`, `Age ${r.age}+`)] : []),
    ...r.hideOn.map((c) => tx(`مخفي من ${names.channelShort(c)}`, `Hidden from ${names.channelShort(c)}`)),
  ];
}

function RestrictionForm({ initial, isNew, onClose, onKeep }: { initial: Restriction; isNew: boolean; onClose: () => void; onKeep: (r: Restriction) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const names = useNames();
  const products = productsStore.use();
  const cats = categoriesStore.use();
  const x = catalogXStore.use();
  const [r, setR] = useState(initial);
  const [txt, setTxt] = useState({ max: initial.maxPerCustomer === null ? '' : String(initial.maxPerCustomer), min: initial.minQty === null ? '' : String(initial.minQty) });
  const [q, setQ] = useState('');
  const [tried, setTried] = useState(false);
  const [trial, setTrial] = useState({ product: '', qty: '1', city: 'riyadh', prior: '0' });
  useUnsaved(JSON.stringify(r) !== JSON.stringify(initial) || txt.max !== (initial.maxPerCustomer === null ? '' : String(initial.maxPerCustomer)) || txt.min !== (initial.minQty === null ? '' : String(initial.minQty)), { ar: 'قيد الشراء', en: 'Purchase limit' });
  const set = (p: Partial<Restriction>) => { const n = { ...r, ...p }; setR(n); onKeep(n); };
  const num = (s: string) => (s.trim() ? Number(normaliseDigits(s)) : null);
  const id = r.id || `r-${Date.now().toString(36)}`;
  const def: Restriction = { ...r, id, maxPerCustomer: num(txt.max), minQty: num(txt.min) };
  const errs = validateRestriction({ ...def, maxPerCustomer: def.maxPerCustomer !== null && Number.isNaN(def.maxPerCustomer) ? -1 : def.maxPerCustomer, minQty: def.minQty !== null && Number.isNaN(def.minQty) ? -1 : def.minQty });
  const msg = (k: keyof typeof errs) => (tried && errs[k] ? ({ required: tx('مطلوب', 'Required'), scope: tx('اختر منتجات أو فئات', 'Choose products or categories'), rule: tx('حدّد قيدًا واحدًا على الأقل', 'Set at least one limit'), minmax: tx('الأقل أكبر من الحد لكل عميل', 'Minimum is above the per-customer max'), number: tx('عدد صحيح في الحدود', 'A whole number within range'), cities: tx('اختر مدينة', 'Choose a city') })[errs[k]!] : undefined);
  const pool = useMemo(() => products.filter((p) => p.status !== 'archived' && (!q.trim() || `${p.name.ar} ${p.name.en} ${p.sku}`.toLowerCase().includes(q.trim().toLowerCase()))), [products, q]);
  const scope = products.filter((p) => restrictionCovers(def, p));
  // Try the rule (as drafted, with the other active rules) on a sample basket.
  const tp = products.find((p) => p.id === (trial.product || scope[0]?.id));
  const res = tp ? checkBasket([{ productId: tp.id, qty: Math.max(1, num(trial.qty) ?? 1) }], { products, rules: [...x.restrictions.filter((y) => y.id !== id), { ...def, active: true }], city: trial.city, prior: { [tp.id]: num(trial.prior) ?? 0 } }) : null;
  const save = () => {
    setTried(true);
    if (Object.keys(errs).length) return;
    catalogXStore.set((s) => ({ ...s, restrictions: isNew ? [...s.restrictions, def] : s.restrictions.map((y) => (y.id === id ? def : y)) }));
    logAction('products', isNew ? { ar: `أضاف قيد الشراء ${def.name.ar}`, en: `Added purchase limit ${def.name.en}` } : { ar: `عدّل قيد الشراء ${def.name.ar}`, en: `Edited purchase limit ${def.name.en}` }, { target: id });
    toast({ tone: 'ok', text: tx(`حُفظ القيد ويُطبَّق على ${scope.length} منتجات في المتجر`, `Saved; the store applies it to ${scope.length} products`) });
    onClose();
  };
  const chip = 'inline-flex h-8 cursor-pointer select-none items-center rounded-full border border-border px-3 text-[13px] font-medium has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500/10';
  return (
    <Modal size="lg" title={isNew ? tx('قيد شراء جديد', 'New purchase limit') : tx('تعديل القيد', 'Edit limit')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={save}>{tx('احفظ', 'Save')}</Button></>}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={tx('الاسم بالعربية', 'Arabic name')} error={msg('nameAr')}>{(p) => <Input {...p} value={r.name.ar} onChange={(e) => set({ name: { ...r.name, ar: e.target.value } })} />}</Field>
            <Field label={tx('الاسم بالإنجليزية', 'English name')} error={msg('nameEn')}>{(p) => <Input {...p} dir="ltr" value={r.name.en} onChange={(e) => set({ name: { ...r.name, en: e.target.value } })} />}</Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-fg">{tx('على', 'Applies to')} <span className="font-normal text-muted">({productCount(tx, scope.length)})</span></legend>
            <div className="mb-2 flex flex-wrap gap-1.5">{categoryTree(cats).map(({ cat }) => { const k = catKey(cat.name); return <label key={cat.id} className={chip}><input type="checkbox" className="sr-only" checked={r.cats.includes(k)} onChange={() => set({ cats: r.cats.includes(k) ? r.cats.filter((y) => y !== k) : [...r.cats, k] })} />{tx('فئة: ', 'Category: ')}{cat.name[lang]}</label>; })}</div>
            <SearchInput value={q} onChange={setQ} placeholder={tx('أو منتجات بعينها: ابحث بالاسم أو SKU', 'Or specific products: search by name or SKU')} />
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {pool.map((p) => <li key={p.id}><label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"><input type="checkbox" className="accent-brand-600" checked={r.productIds.includes(p.id)} onChange={() => set({ productIds: r.productIds.includes(p.id) ? r.productIds.filter((y) => y !== p.id) : [...r.productIds, p.id] })} />{p.name[lang]}<bdi dir="ltr" className="ms-auto text-xs text-muted">{p.sku}</bdi></label></li>)}
            </ul>
            {msg('scope') && <p role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{msg('scope')}</p>}
          </fieldset>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={tx('الحد لكل عميل', 'Max per customer')} optional error={msg('max')} hint={tx('عبر كل طلباته المدفوعة', 'Across all their paid orders')}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={txt.max} onChange={(e) => setTxt({ ...txt, max: e.target.value })} />}</Field>
            <Field label={tx('أقل كمية للطلب', 'Min per order')} optional error={msg('min')}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={txt.min} onChange={(e) => setTxt({ ...txt, min: e.target.value })} />}</Field>
            <Field label={tx('تأكيد العمر', 'Age confirmation')}>{(p) => <Select {...p} value={r.age === null ? '' : String(r.age)} onChange={(e) => set({ age: e.target.value ? Number(e.target.value) : null })}><option value="">{tx('لا', 'None')}</option><option value="18">18+</option><option value="21">21+</option></Select>}</Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-fg">{tx('مدن التوصيل', 'Delivery cities')}</legend>
            <Select aria-label={tx('مدن التوصيل', 'Delivery cities')} className="mb-2 w-auto" value={r.cities.mode} onChange={(e) => set({ cities: { ...r.cities, mode: e.target.value as Restriction['cities']['mode'] } })}><option value="all">{tx('كل المدن', 'Every city')}</option><option value="only">{tx('هذه المدن فقط', 'Only these cities')}</option><option value="except">{tx('كل المدن عدا', 'Every city except')}</option></Select>
            {r.cities.mode !== 'all' && <div className="flex flex-wrap gap-1.5">{CITIES.map((c) => <label key={c.id} className={chip}><input type="checkbox" className="sr-only" checked={r.cities.list.includes(c.id)} onChange={() => set({ cities: { ...r.cities, list: r.cities.list.includes(c.id) ? r.cities.list.filter((y) => y !== c.id) : [...r.cities.list, c.id] } })} />{c.name[lang]}</label>)}</div>}
            {msg('cities') && <p role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{msg('cities')}</p>}
          </fieldset>
          <fieldset><legend className="mb-2 text-[13px] font-semibold text-fg">{tx('أخفِ من', 'Hide from')}</legend>
            <div className="flex flex-wrap gap-1.5">{CHANNELS.map((c) => <label key={c} className={chip}><input type="checkbox" className="sr-only" checked={r.hideOn.includes(c)} onChange={() => set({ hideOn: r.hideOn.includes(c) ? r.hideOn.filter((y) => y !== c) : [...r.hideOn, c] })} />{names.channel(c)}</label>)}</div>
          </fieldset>
          {msg('rule') && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{msg('rule')}</p>}
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"><span className="text-sm text-fg">{tx('مفعّل', 'Active')}</span><Switch checked={r.active} onChange={(v) => set({ active: v })} label={tx('مفعّل', 'Active')} /></label>
        </div>
        <aside className="space-y-3 rounded-xl bg-surface-2 p-3" aria-label={tx('جرّب القيد', 'Try the limit')}>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted"><FlaskConical className="size-3.5" aria-hidden="true" />{tx('جرّبه على سلة قبل الحفظ', 'Try it on a basket before saving')}</p>
          <Field label={tx('المنتج', 'Product')}>{(p) => <Select {...p} value={trial.product || scope[0]?.id || ''} onChange={(e) => setTrial({ ...trial, product: e.target.value })}>{(scope.length ? scope : products.slice(0, 1)).map((pr) => <option key={pr.id} value={pr.id}>{pr.name[lang]}</option>)}</Select>}</Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={tx('الكمية', 'Qty')}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={trial.qty} onChange={(e) => setTrial({ ...trial, qty: e.target.value })} />}</Field>
            <Field label={tx('اشترى سابقًا', 'Bought before')}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={trial.prior} onChange={(e) => setTrial({ ...trial, prior: e.target.value })} />}</Field>
          </div>
          <Field label={tx('المدينة', 'City')}>{(p) => <Select {...p} value={trial.city} onChange={(e) => setTrial({ ...trial, city: e.target.value })}>{CITIES.map((c) => <option key={c.id} value={c.id}>{c.name[lang]}</option>)}</Select>}</Field>
          {res && (res.problems.length || res.age ? (
            <div className="space-y-1.5 text-[13px]" role="status">
              <p className="font-semibold text-red-700 dark:text-red-300">{res.problems.length ? tx('يتوقف الدفع ويرى العميل:', 'Checkout stops and the shopper sees:') : tx('يكمل بعد تأكيد العمر:', 'Continues after the age check:')}</p>
              {res.problems.map((pb) => <p key={pb.kind} className="rounded-lg bg-surface px-2 py-1.5">{pb.kind === 'max' ? (pb.limit ? tx(`الحد ${pb.limit} لك في هذا الطلب.`, `You can buy ${pb.limit} more.`) : tx('وصلت للحد المسموح لكل عميل.', 'You’ve reached the per-customer limit.')) : pb.kind === 'min' ? tx(`أقل كمية ${pb.limit}.`, `Minimum ${pb.limit}.`) : tx('لا يُوصَّل إلى هذه المدينة.', 'Isn’t delivered to this city.')}</p>)}
              {res.age ? <p className="rounded-lg bg-surface px-2 py-1.5">{tx(`☐ أؤكد أن عمري ${res.age} سنة أو أكثر`, `☐ I confirm I am ${res.age} or older`)}</p> : null}
            </div>
          ) : <p role="status" className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">{tx('يمر الطلب بلا اعتراض.', 'The order goes through.')}</p>)}
        </aside>
      </div>
    </Modal>
  );
}
