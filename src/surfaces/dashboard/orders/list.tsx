// Orders list (`#/dashboard/orders`): saved views, search, filters, sort and page in the URL; selection and bulk actions.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlarmClock, CheckCheck, Lock, PackageCheck, Printer, RotateCcw, SearchX, ShoppingBag, SlidersHorizontal, ArrowUpDown } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, navigate, type Route } from '../../../core/router';
import { formatInt } from '../../../core/format';
import { ordersStore, testStore } from '../../merchant/stores';
import { VIEW_IDS, total, type BulkAction, type Order } from '../../merchant/domain';
import { BulkBar, DataTable, Drawer, FilterChip, PageHeader, Pagination, SearchInput, Select, Field, Tabs, useToast, type Column } from '../../../ds/kit';
import { Badge, Button, Card, EmptyState, ErrorState, LinkButton, Money, ProductImage, Ref, Skeleton, InfoHint, useTx, cn } from '../../../ds/ui';
import { skuPhoto } from '../model/media';
import { setDashState, useDashState } from '../review';
import { CHANNELS, FULS, PAYS, SHIPS, SORTS, activeFilters, exceptions, listOrders, orderPerms, readQuery, selectionRefs, toParams, undoConfirm, type ListQuery } from './model';
import { FulBadge, PayBadge, ShipBadge, ohref, useAge, useLabels } from './ui';
import { BulkModal, type BulkOutcome } from './bulk';

/** Scroll position per list URL, restored when coming back from an order. */
const scrollMemo = new Map<string, number>();

export default function OrdersList({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const L = useLabels();
  const age = useAge();
  const toast = useToast();
  const state = useDashState();
  const stored = ordersStore.use();
  const perms = orderPerms(testStore.use().role);
  const all = state === 'empty' ? [] : stored;
  const lq = readQuery(route.query);
  const go = (over: Partial<ListQuery>, how: 'push' | 'replace' = 'push') => {
    const href = ohref('', toParams(lq, { page: 1, ...over }));
    if (how === 'replace') replace(href); else navigate(href);
  };
  const r = useMemo(() => listOrders(all, lq), [all, route.query.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  const listKey = route.query.toString();

  // Selection belongs to one page of one result set: changing the scope clears it.
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const scope = JSON.stringify(toParams(lq, { page: r.page }));
  const last = useRef(scope);
  useEffect(() => { if (last.current !== scope) { last.current = scope; setSel(new Set()); setAllMatching(false); } }, [scope]);
  const [bulk, setBulk] = useState<BulkAction | null>(null);
  const [drawer, setDrawer] = useState(false);

  useLayoutEffect(() => {
    const y = scrollMemo.get(listKey);
    if (y !== undefined && state === 'live') window.scrollTo(0, y);
  }, [listKey, state]);
  const remember = () => scrollMemo.set(listKey, window.scrollY);

  const rowHref = (o: Order) => ohref(o.ref, toParams(lq, { page: r.page }));
  const hasFilters = r.filtered;

  const header = (
    <PageHeader title={tx('الطلبات', 'Orders')}
      description={state === 'live' && all.length ? tx(`${formatInt(all.length)} طلب · ${r.counts.needs} يحتاج تجهيزًا`, `${formatInt(all.length)} orders · ${r.counts.needs} to fulfil`) : undefined}
      actions={state === 'live' && perms.see && all.length > 0 && lq.view !== 'needs' && perms.fulfil
        ? <LinkButton href={ohref('', { view: 'needs' })} className="bg-brand-gradient hover:opacity-95"><PackageCheck className="size-4" aria-hidden="true" />{tx('جهّز الطلبات', 'Fulfil orders')}</LinkButton> : undefined} />
  );

  if (!perms.see) return (
    <div className="space-y-6">{header}<Card><EmptyState as="h2" icon={<Lock className="size-6" aria-hidden="true" />} title={tx('لا تملك صلاحية عرض الطلبات', 'You do not have access to orders')}>
      {tx('اطلب من مالك المتجر إضافة صلاحية الطلبات إلى دورك.', 'Ask the store owner to add orders to your role.')}
    </EmptyState></Card></div>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<ListSkeleton /></div>;
  if (state === 'error') return (
    <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل الطلبات', 'Orders could not load')} onRetry={() => setDashState('live')}>
      {tx('طلباتك محفوظة، والمدفوعات والشحن تعمل. المرجع SIM-ORD-503.', 'Your orders are safe; payments and shipping keep working. Ref SIM-ORD-503.')}
    </ErrorState></Card></div>
  );
  if (all.length === 0) return (
    <div className="space-y-6">{header}<Card><EmptyState as="h2" icon={<ShoppingBag className="size-6" aria-hidden="true" />} title={tx('لا طلبات بعد', 'No orders yet')}
      action={<LinkButton href={link('/store')}>{tx('افتح متجرك وشارك الرابط', 'Open your store and share it')}</LinkButton>}>
      {tx('يظهر هنا كل طلب مع حالة الدفع والتجهيز والشحن.', 'Each order appears here with its payment, fulfilment and shipment state.')}
    </EmptyState></Card></div>
  );

  const picked = new Set(selectionRefs(r.rows, r.pageRows, sel, allMatching));
  const selectedOrders = r.rows.filter((o) => picked.has(o.ref));
  const onSelect = (k: string, on: boolean) => { setAllMatching(false); setSel((s) => { const n = new Set(s); if (on) n.add(k); else n.delete(k); return n; }); };
  const clear = () => { setSel(new Set()); setAllMatching(false); };
  const count = allMatching ? r.rows.length : sel.size;
  const pageAll = r.pageRows.length > 0 && r.pageRows.every((o) => sel.has(o.ref));

  const onBulkDone = (o: BulkOutcome | null) => {
    setBulk(null);
    if (!o) return;
    clear();
    if (o.action === 'confirm' && o.ok.length) {
      toast({ tone: 'ok', text: tx(`أُكّد ${formatInt(o.ok.length)} طلبًا`, `${formatInt(o.ok.length)} orders confirmed`), action: { label: tx('تراجع', 'Undo'), run: () => ordersStore.set((a) => undoConfirm(a, o.ok)) } });
    }
  };

  const chips = [
    { key: 'ch' as const, label: tx('القناة', 'Channel'), options: CHANNELS.map((v) => ({ value: v, label: L.channel(v) })) },
    { key: 'pay' as const, label: tx('الدفع', 'Payment'), options: PAYS.map((v) => ({ value: v, label: L.pay(v) })) },
    { key: 'ful' as const, label: tx('التجهيز', 'Fulfilment'), options: FULS.map((v) => ({ value: v, label: L.ful(v) })) },
    { key: 'ship' as const, label: tx('الشحن', 'Shipment'), options: SHIPS.map((v) => ({ value: v, label: L.ship(v) })) },
  ];
  const nf = activeFilters(lq);
  const sortSelect = (
    <label className="relative inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-[13px] font-medium text-muted hover:text-fg">
      <ArrowUpDown className="size-3.5" aria-hidden="true" /><span>{L.sort(lq.sort)}</span>
      <select aria-label={tx('ترتيب', 'Sort')} value={lq.sort} onChange={(e) => go({ sort: e.target.value as ListQuery['sort'] })} className="absolute inset-0 cursor-pointer opacity-0">
        {SORTS.map((s) => <option key={s} value={s}>{L.sort(s)}</option>)}
      </select>
    </label>
  );

  const toolbar = (sel.size > 0 || allMatching) && perms.bulk ? (
    <BulkBar count={count} onClear={clear} scope={
      <span className="flex flex-wrap items-center gap-x-2">
        {allMatching ? tx(`كل النتائج المطابقة (${formatInt(r.rows.length)})`, `All ${formatInt(r.rows.length)} matching results`) : tx(`في هذه الصفحة من ${formatInt(r.rows.length)} نتيجة`, `on this page, of ${formatInt(r.rows.length)} results`)}
        {!allMatching && pageAll && r.rows.length > r.pageRows.length && <button type="button" className="font-semibold text-brand-700 hover:underline dark:text-brand-300" onClick={() => setAllMatching(true)}>{tx(`حدد كل النتائج (${formatInt(r.rows.length)})`, `Select all ${formatInt(r.rows.length)} results`)}</button>}
        {allMatching && <button type="button" className="font-semibold text-brand-700 hover:underline dark:text-brand-300" onClick={() => { setAllMatching(false); setSel(new Set(r.pageRows.map((o) => o.ref))); }}>{tx('هذه الصفحة فقط', 'This page only')}</button>}
      </span>}>
      <Button size="sm" variant="secondary" onClick={() => setBulk('confirm')}><CheckCheck className="size-4" aria-hidden="true" />{tx('تأكيد', 'Confirm')}</Button>
      <Button size="sm" variant="secondary" onClick={() => setBulk('slips')}><Printer className="size-4" aria-hidden="true" />{tx('قوائم التعبئة', 'Packing slips')}</Button>
    </BulkBar>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex w-full md:w-auto md:flex-1 md:max-w-xs"><SearchInput value={lq.q} onChange={(v) => go({ q: v }, 'replace')} placeholder={tx('رقم الطلب أو اسم العميل', 'Order number or customer')} /></div>
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        {chips.map((c) => <FilterChip key={c.key} label={c.label} value={lq[c.key] ?? ''} options={c.options} onChange={(v) => go({ [c.key]: v || undefined })} />)}
        {nf > 0 && <Button variant="ghost" size="sm" onClick={() => go({ ch: undefined, pay: undefined, ful: undefined, ship: undefined })}>{tx('مسح المرشحات', 'Clear filters')}</Button>}
      </div>
      <Button variant="secondary" className={cn('md:hidden', nf > 0 && 'border-brand-300 text-brand-700 dark:text-brand-300')} onClick={() => setDrawer(true)} aria-haspopup="dialog">
        <SlidersHorizontal className="size-4" aria-hidden="true" />{tx('تصفية', 'Filter')}{nf > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] text-white tabular-nums">{nf}</span>}
      </Button>
      <div className="ms-auto">{sortSelect}</div>
    </div>
  );

  const cols: Column<Order>[] = [
    { key: 'ref', header: tx('الطلب', 'Order'), cell: (o) => (
      <span className="flex items-center gap-3">
        <ProductImage src={skuPhoto(o.items[0].sku)} alt={o.items[0].name[lang]} size={36} />
        <span><Ref>#{o.ref}</Ref><span className="block text-xs font-normal text-muted">{age(o.hoursAgo)}</span></span>
      </span>
    ) },
    { key: 'customer', header: tx('العميل', 'Customer'), cell: (o) => <span className="block max-w-48 truncate text-fg">{o.customer[lang]}<span className="block text-xs text-muted">{L.channel(o.channel)}</span></span> },
    { key: 'pay', header: tx('الدفع', 'Payment'), cell: (o) => <PayBadge o={o} /> },
    { key: 'ful', header: tx('التجهيز', 'Fulfilment'), cell: (o) => <FulBadge o={o} /> },
    { key: 'ship', header: tx('الشحن', 'Shipment'), cell: (o) => <ShipBadge o={o} />, hideBelow: 'lg' },
    { key: 'flags', header: <span className="sr-only">{tx('تنبيهات', 'Flags')}</span>, cell: (o) => <Flags o={o} /> },
    { key: 'total', header: tx('الإجمالي', 'Total'), align: 'end', cell: (o) => <Money v={total(o)} className="font-semibold text-fg" /> },
  ];

  const card = (o: Order) => (
    <div className="flex items-start gap-3" onClick={remember}>
      <ProductImage src={skuPhoto(o.items[0].sku)} alt={o.items[0].name[lang]} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold text-fg">{o.customer[lang]}</p>
          <Money v={total(o)} className="text-sm font-semibold text-fg" />
        </div>
        <p className="text-xs text-muted"><Ref>#{o.ref}</Ref> · {age(o.hoursAgo)} · {L.channel(o.channel)}</p>
        <div className="mt-2 flex flex-wrap gap-1.5"><PayBadge o={o} />{o.pay !== 'failed' && <FulBadge o={o} />}{o.ship !== 'none' && <ShipBadge o={o} />}<Flags o={o} /></div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6" onClickCapture={(e) => { if ((e.target as HTMLElement).closest('a[href*="/dashboard/orders/"]')) remember(); }}>
      {header}
      <Card>
        <div className="px-4 pt-2 sm:px-5">
          <Tabs label={tx('العروض المحفوظة', 'Saved views')} items={VIEW_IDS.map((v) => ({ href: ohref('', toParams(lq, { view: v, page: 1 })), label: L.view(v), current: lq.view === v, count: r.counts[v] }))} />
        </div>
        <div className="space-y-3 p-4 sm:px-5">
          {toolbar}
          {!perms.bulk && <p className="flex items-center gap-1 text-xs text-muted">{tx('الإجراءات الجماعية غير متاحة لدورك', 'Bulk actions are not available to your role')}<InfoHint>{tx('يحتاج دور المالك أو التجهيز.', 'Needs the owner or fulfilment role.')}</InfoHint></p>}
        </div>
        {r.rows.length === 0 ? (
          <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={hasFilters ? tx('لا طلبات تطابق البحث والمرشحات', 'No orders match your search and filters') : tx(`لا طلبات في «${L.view(lq.view)}»`, `No orders in “${L.view(lq.view)}”`)}
            action={hasFilters ? <Button variant="secondary" onClick={() => go({ q: '', ch: undefined, pay: undefined, ful: undefined, ship: undefined })}>{tx('امسح البحث والمرشحات', 'Clear search and filters')}</Button>
              : <LinkButton variant="secondary" href={ohref()}>{tx('كل الطلبات', 'All orders')}</LinkButton>} />
        ) : (
          <>
            <div className="border-t border-border">
              <DataTable label={tx('الطلبات', 'Orders')} rows={r.pageRows} columns={cols} rowKey={(o) => o.ref} href={rowHref} card={card}
                selected={perms.bulk ? sel : undefined} onSelect={perms.bulk ? onSelect : undefined}
                rowClass={(o) => (o.pay === 'failed' ? 'bg-red-500/[.03]' : undefined)} />
            </div>
            <Pagination page={r.page} pages={r.pages} total={r.rows.length} hrefFor={(p) => ohref('', toParams(lq, { page: p }))} />
          </>
        )}
      </Card>

      {drawer && (
        <Drawer title={tx('تصفية الطلبات', 'Filter orders')} onClose={() => setDrawer(false)}
          footer={<>
            <Button variant="secondary" className="flex-1" onClick={() => go({ ch: undefined, pay: undefined, ful: undefined, ship: undefined }, 'replace')}>{tx('مسح', 'Clear')}</Button>
            <Button className="flex-1" onClick={() => setDrawer(false)}>{tx(`اعرض ${formatInt(r.rows.length)} نتيجة`, `Show ${formatInt(r.rows.length)} results`)}</Button>
          </>}>
          {chips.map((c) => (
            <Field key={c.key} label={c.label}>
              {(p) => <Select {...p} value={lq[c.key] ?? ''} onChange={(e) => go({ [c.key]: e.target.value || undefined }, 'replace')}>
                <option value="">{tx('الكل', 'All')}</option>{c.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>}
            </Field>
          ))}
        </Drawer>
      )}
      {bulk && <BulkModal action={bulk} orders={selectedOrders} allMatching={allMatching} onClose={onBulkDone} />}
    </div>
  );
}

function Flags({ o }: { o: Order }) {
  const tx = useTx();
  const ex = exceptions(o);
  if (!ex.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {ex.includes('late') && <Badge tone="red" icon={<AlarmClock className="size-3.5" aria-hidden="true" />}>{tx('متأخر', 'Late')}</Badge>}
      {ex.includes('refundPending') && <Badge tone="amber" icon={<RotateCcw className="size-3.5" aria-hidden="true" />}>{tx('استرداد معلّق', 'Refund pending')}</Badge>}
    </span>
  );
}

function ListSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface" role="status" aria-label="Loading">
      <div className="flex gap-4 border-b border-border px-5 py-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-5 w-16" />)}</div>
      <div className="flex gap-2 p-5"><Skeleton className="h-10 w-full rounded-xl sm:w-72" /><Skeleton className="hidden h-10 w-24 rounded-xl md:block" /><Skeleton className="hidden h-10 w-24 rounded-xl md:block" /></div>
      <div className="divide-y divide-border border-t border-border">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3">
            <Skeleton className="size-9 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4" /></div>
            <Skeleton className="hidden h-6 w-16 rounded-full md:block" /><Skeleton className="hidden h-6 w-16 rounded-full md:block" /><Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
