// Orders list (`#/dashboard/orders`): saved views, search, filters, sort and page in the URL; selection and bulk actions.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlarmClock, Ban, CheckCheck, Download, FileText, Hourglass, Lock, PackageCheck, Plus, Printer, RotateCcw, SearchX, ShoppingBag, SlidersHorizontal, ArrowUpDown, Tag, Truck, UserRound, Send, Link2, CalendarClock, Receipt, PackageX, Tags } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, navigate, type Route } from '../../../core/router';
import { formatInt } from '../../../core/format';
import { logAction, ordersStore, teamStore, testStore } from '../../merchant/stores';
const BULK_AR: Record<string, string> = { confirm: 'تأكيد', labels: 'إصدار ملصقات', shipped: 'شُحن', invoices: 'فواتير', slips: 'قوائم تعبئة', export: 'تصدير CSV' };
import { LOCATIONS, LOC_IDS, total, type Order } from '../../merchant/domain';
import { openReturns, payView } from '../../merchant/ops';
import { BulkBar, DataTable, Drawer, FilterChip, Input, PageHeader, Pagination, SearchInput, Select, Field, useToast, type Column } from '../../../ds/kit';
import { Badge, Button, Card, EmptyState, ErrorState, LinkButton, Money, ProductImage, Ref, Skeleton, InfoHint, useTx, cn } from '../../../ds/ui';
import { skuPhoto } from '../model/media';
import { setDashState, useDashState } from '../review';
import { CHANNELS, FULS, LIST_VIEWS, NO_FILTERS, PAYS, PAY_METHODS, SHIPS, SORTS, activeFilters, exceptions, listOrders, orderPerms, readQuery, selectionRefs, toParams, undoConfirm, type ListQuery, type OpsBulk } from './model';
import { FulBadge, PayBadge, ShipBadge, ohref, useActor, useAge, useLabels } from './ui';
import { BulkModal, type BulkOutcome } from './bulk';
import { MoreBulkModal, type MoreOutcome } from './bulk-more';
import { Menu, MenuButtonLabel, MenuItem, MenuNote } from './ui';
import { SavedViewsBar } from './saved-views-ui';
import { savedViewsStore } from './saved-views';
import { can } from '../../merchant/perms';
import type { MoreBulk } from './bulk-more-model';

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
  const [bulk, setBulk] = useState<OpsBulk | null>(null);
  const [more, setMore] = useState<MoreBulk | null>(null);
  const role = testStore.use().role;
  const canMessage = can(role, 'customer.message');

  const who = useActor();
  const views = savedViewsStore.use()[who.name] ?? [];
  const members = teamStore.use().members.filter((m) => m.status === 'active');
  const tags = useMemo(() => [...new Set(stored.flatMap((o) => o.tags ?? []))].sort(), [stored]);
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
      actions={state === 'live' && perms.see ? <div className="flex flex-wrap gap-2">
        <LinkButton variant="ghost" href={ohref('returns')}><RotateCcw className="size-4" aria-hidden="true" />{tx('المرتجعات', 'Returns')}</LinkButton>
        {perms.fulfil && <LinkButton variant="secondary" href={ohref('new')}><Plus className="size-4" aria-hidden="true" />{tx('طلب يدوي', 'Manual order')}</LinkButton>}
        {all.length > 0 && lq.view !== 'needs' && perms.fulfil && <LinkButton href={ohref('', { view: 'needs' })} className="bg-brand-gradient hover:opacity-95"><PackageCheck className="size-4" aria-hidden="true" />{tx('جهّز الطلبات', 'Fulfil orders')}</LinkButton>}
      </div> : undefined} />
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
    if (o.ok.length && o.action !== 'invoices' && o.action !== 'slips') logAction('orders', { ar: `إجراء جماعي: ${BULK_AR[o.action]} (${o.ok.length} طلب)`, en: `Bulk: ${o.action} (${o.ok.length} orders)` }, { target: o.ok.slice(0, 10).join(',') + (o.ok.length > 10 ? '…' : '') });
    if (o.action === 'confirm' && o.ok.length) {
      toast({ tone: 'ok', text: tx(`أُكّد ${formatInt(o.ok.length)} طلبًا`, `${formatInt(o.ok.length)} orders confirmed`), action: { label: tx('تراجع', 'Undo'), run: () => { ordersStore.set((a) => undoConfirm(a, o.ok, who, Date.now())); logAction('orders', { ar: `تراجع عن تأكيد ${o.ok.length} طلب`, en: `Undid confirmation of ${o.ok.length} orders` }); } } });
    } else if (o.action === 'export' && o.ok.length) toast({ tone: 'ok', text: tx(`نُزّل ملف فيه ${formatInt(o.ok.length)} طلبًا`, `Downloaded a file with ${formatInt(o.ok.length)} orders`) });
    else if ((o.action === 'labels' || o.action === 'shipped') && o.ok.length) toast({ tone: 'ok', text: o.action === 'labels' ? tx(`صدر ${formatInt(o.ok.length)} ملصقًا`, `${formatInt(o.ok.length)} labels issued`) : tx(`سُجّل ${formatInt(o.ok.length)} كمشحون`, `${formatInt(o.ok.length)} marked shipped`) });
  };

  const onMoreDone = (o: MoreOutcome | null) => {
    setMore(null);
    if (!o) return;
    if (!o.ok.length) return;
    clear();
    const T: Record<MoreBulk, [string, string]> = {
      assign: ['أُسندت', 'Assigned'], tagAdd: ['وُسمت', 'Tagged'], tagRemove: ['حُذف الوسم من', 'Untagged'], voidLabels: ['أُلغيت ملصقات', 'Labels voided on'],
      payLink: ['أُرسل رابط دفع لـ', 'Payment link sent to'], extendDue: ['مُددت مهلة', 'Deadline extended on'], sendInvoice: ['أُرسلت فاتورة لـ', 'Invoice sent to'], cancel: ['أُلغي', 'Cancelled'],
    };
    toast({ tone: 'ok', text: tx(`${T[o.action][0]} ${formatInt(o.ok.length)} طلبًا`, `${T[o.action][1]} ${formatInt(o.ok.length)} orders`), action: o.undo ? { label: tx('تراجع', 'Undo'), run: o.undo } : undefined });
  };

  const chips = [
    { key: 'ch' as const, label: tx('القناة', 'Channel'), options: CHANNELS.map((v) => ({ value: v, label: L.channel(v) })) },
    { key: 'pay' as const, label: tx('الدفع', 'Payment'), options: PAYS.map((v) => ({ value: v, label: L.pay(v) })) },
    { key: 'ful' as const, label: tx('التجهيز', 'Fulfilment'), options: FULS.map((v) => ({ value: v, label: L.ful(v) })) },
    { key: 'ship' as const, label: tx('الشحن', 'Shipment'), options: SHIPS.map((v) => ({ value: v, label: L.ship(v) })) },
    { key: 'method' as const, label: tx('وسيلة الدفع', 'Pay method'), options: PAY_METHODS.map((v) => ({ value: v, label: L.method(v) })) },
    { key: 'loc' as const, label: tx('الموقع', 'Location'), options: LOC_IDS.map((v) => ({ value: v, label: LOCATIONS[v][lang] })) },
    { key: 'who' as const, label: tx('المسؤول', 'Assignee'), options: [...members.map((m) => ({ value: m.name, label: m.name === who.name ? tx(`${m.name} (أنا)`, `${m.name} (me)`) : m.name })), { value: '-', label: tx('غير مسند', 'Unassigned') }] },
    ...(tags.length ? [{ key: 'tag' as const, label: tx('الوسم', 'Tag'), options: tags.map((v) => ({ value: v, label: v })) }] : []),
  ];
  const dateRange = (
    <span className="grid grid-cols-2 gap-2">
      <Input type="date" dir="ltr" aria-label={tx('من تاريخ', 'From date')} value={lq.from ?? ''} max={lq.to} onChange={(e) => go({ from: e.target.value || undefined }, 'replace')} />
      <Input type="date" dir="ltr" aria-label={tx('إلى تاريخ', 'To date')} value={lq.to ?? ''} min={lq.from} onChange={(e) => go({ to: e.target.value || undefined }, 'replace')} />
    </span>
  );
  const nf = activeFilters(lq);
  const extra = [lq.method, lq.loc, lq.who, lq.tag, lq.from || lq.to].filter(Boolean).length;
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
      <Menu label={tx('الشحن', 'Shipping')} size="sm" button={<MenuButtonLabel icon={<Truck className="size-4" aria-hidden="true" />}>{tx('الشحن', 'Shipping')}</MenuButtonLabel>}>
        {(close) => <>
          <MenuItem icon={<Printer className="size-4" />} onClick={() => { close(); setBulk('labels'); }}>{tx('أصدر ملصقات الشحن', 'Issue shipping labels')}</MenuItem>
          <MenuItem icon={<Truck className="size-4" />} onClick={() => { close(); setBulk('shipped'); }}>{tx('سُلّم للناقل', 'Mark as shipped')}</MenuItem>
          <MenuItem icon={<PackageX className="size-4" />} onClick={() => { close(); setMore('voidLabels'); }}>{tx('ألغِ الملصقات', 'Void labels')}</MenuItem>
        </>}
      </Menu>
      <Menu label={tx('تنظيم', 'Organise')} size="sm" align="start" button={<MenuButtonLabel icon={<Tags className="size-4" aria-hidden="true" />}>{tx('تنظيم', 'Organise')}</MenuButtonLabel>}>
        {(close) => <>
          <MenuItem icon={<UserRound className="size-4" />} onClick={() => { close(); setMore('assign'); }}>{tx('أسند إلى عضو', 'Assign to a member')}</MenuItem>
          <MenuItem icon={<Tag className="size-4" />} onClick={() => { close(); setMore('tagAdd'); }}>{tx('أضف وسمًا', 'Add a tag')}</MenuItem>
          <MenuItem icon={<Tag className="size-4" />} onClick={() => { close(); setMore('tagRemove'); }}>{tx('احذف وسمًا', 'Remove a tag')}</MenuItem>
        </>}
      </Menu>
      <Menu label={tx('طباعة وتصدير', 'Print & export')} size="sm" button={<MenuButtonLabel icon={<Printer className="size-4" aria-hidden="true" />}>{tx('طباعة وتصدير', 'Print & export')}</MenuButtonLabel>}>
        {(close) => <>
          <MenuItem icon={<FileText className="size-4" />} onClick={() => { close(); setBulk('invoices'); }}>{tx('اطبع الفواتير', 'Print invoices')}</MenuItem>
          <MenuItem icon={<Printer className="size-4" />} onClick={() => { close(); setBulk('slips'); }}>{tx('اطبع قوائم التعبئة', 'Print packing slips')}</MenuItem>
          <MenuItem icon={<Download className="size-4" />} onClick={() => { close(); setBulk('export'); }}>{tx('صدّر CSV', 'Export CSV')}</MenuItem>
          <MenuNote>{tx('لا يصل شيء للعميل من هنا', 'Nothing here reaches the customer')}</MenuNote>
        </>}
      </Menu>
      <span className="flex items-center gap-1 rounded-xl border border-dashed border-amber-500/50 bg-amber-500/5 p-1" role="group" aria-label={tx('يصل للعميل', 'Reaches the customer')}>
        <Menu label={tx('إرسال للعميل', 'Send to customer')} size="sm" variant="ghost" align="start" button={<MenuButtonLabel icon={<Send className="size-4 text-amber-700 dark:text-amber-300" aria-hidden="true" />}>{tx('إرسال للعميل', 'Send to customer')}</MenuButtonLabel>}>
          {(close) => canMessage ? <>
            <MenuItem icon={<Link2 className="size-4" />} onClick={() => { close(); setMore('payLink'); }}>{tx('أرسل رابط دفع', 'Send a payment link')}</MenuItem>
            <MenuItem icon={<CalendarClock className="size-4" />} onClick={() => { close(); setMore('extendDue'); }}>{tx('مدّد مهلة الدفع وأبلغ', 'Extend payment deadline')}</MenuItem>
            <MenuItem icon={<Receipt className="size-4" />} onClick={() => { close(); setMore('sendInvoice'); }}>{tx('أرسل الفاتورة للعميل', 'Send invoice to customer')}</MenuItem>
            <MenuNote>{tx('تعاين الرسالة بلغة كل عميل قبل الإرسال', 'You preview the message in each customer’s language first')}</MenuNote>
          </> : <MenuNote>{tx('مراسلة العملاء تحتاج دور المالك', 'Messaging customers needs the owner role')}</MenuNote>}
        </Menu>
        <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-500/10 dark:text-red-400" onClick={() => setMore('cancel')}><Ban className="size-4" aria-hidden="true" />{tx('إلغاء الطلبات', 'Cancel orders')}</Button>
      </span>
    </BulkBar>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex w-full md:w-auto md:flex-1 md:max-w-xs"><SearchInput value={lq.q} onChange={(v) => go({ q: v }, 'replace')} placeholder={tx('رقم الطلب أو اسم العميل', 'Order number or customer')} autoFocus={route.query.get('focus') === 'search'} /></div>
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        {chips.slice(0, 4).map((c) => <FilterChip key={c.key} label={c.label} value={lq[c.key] ?? ''} options={c.options} onChange={(v) => go({ [c.key]: v || undefined })} />)}
        <Button variant="secondary" className={cn(extra > 0 && 'border-brand-300 text-brand-700 dark:text-brand-300')} onClick={() => setDrawer(true)} aria-haspopup="dialog">
          <SlidersHorizontal className="size-4" aria-hidden="true" />{tx('مرشحات أخرى', 'More filters')}{extra > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] text-white tabular-nums">{extra}</span>}
        </Button>
        {nf > 0 && <Button variant="ghost" size="sm" onClick={() => go(NO_FILTERS)}>{tx('مسح المرشحات', 'Clear filters')}</Button>}
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
    { key: 'who', header: tx('المسؤول', 'Assignee'), cell: (o) => (o.assignee ? <span className="inline-flex items-center gap-1 text-xs text-muted"><UserRound className="size-3.5" aria-hidden="true" />{o.assignee}</span> : null), hideBelow: 'lg' },
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
          <SavedViewsBar lq={lq} all={all} views={views} viewer={who.name} builtin={LIST_VIEWS.map((v) => ({ href: ohref('', toParams(lq, { view: v, page: 1 })), label: L.view(v), current: lq.view === v, count: r.counts[v] }))} />
        </div>
        <div className="space-y-3 p-4 sm:px-5">
          {toolbar}
          {!perms.bulk && <p className="flex items-center gap-1 text-xs text-muted">{tx('الإجراءات الجماعية غير متاحة لدورك', 'Bulk actions are not available to your role')}<InfoHint>{tx('يحتاج دور المالك أو التجهيز.', 'Needs the owner or fulfilment role.')}</InfoHint></p>}
        </div>
        {r.rows.length === 0 ? (
          <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={hasFilters ? tx('لا طلبات تطابق البحث والمرشحات', 'No orders match your search and filters') : tx(`لا طلبات في «${L.view(lq.view)}»`, `No orders in “${L.view(lq.view)}”`)}
            action={hasFilters ? <Button variant="secondary" onClick={() => go({ q: '', ...NO_FILTERS })}>{tx('امسح البحث والمرشحات', 'Clear search and filters')}</Button>
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
            <Button variant="secondary" className="flex-1" onClick={() => go(NO_FILTERS, 'replace')}>{tx('مسح', 'Clear')}</Button>
            <Button className="flex-1" onClick={() => setDrawer(false)}>{tx(`اعرض ${formatInt(r.rows.length)} نتيجة`, `Show ${formatInt(r.rows.length)} results`)}</Button>
          </>}>
          {chips.map((c) => (
            <Field key={c.key} label={c.label}>
              {(p) => <Select {...p} value={lq[c.key] ?? ''} onChange={(e) => go({ [c.key]: e.target.value || undefined }, 'replace')}>
                <option value="">{tx('الكل', 'All')}</option>{c.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>}
            </Field>
          ))}
          <Field label={tx('تاريخ الطلب (من – إلى)', 'Order date (from – to)')}>{() => dateRange}</Field>
        </Drawer>
      )}
      {bulk && <BulkModal action={bulk} orders={selectedOrders} allMatching={allMatching} onClose={onBulkDone} />}
      {more && <MoreBulkModal action={more} orders={selectedOrders} allMatching={allMatching} canRefund={perms.refund} tags={tags} onClose={onMoreDone} />}
    </div>
  );
}

function Flags({ o }: { o: Order }) {
  const tx = useTx();
  const ex = exceptions(o);
  const cancelReq = o.cancelRequest?.state === 'open';
  const ret = openReturns(o).length > 0;
  const verifying = payView(o) === 'verifying';
  if (!ex.length && !cancelReq && !ret && !o.cancelled && !(o.tags ?? []).length && !verifying) return null;
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {o.cancelled && <Badge tone="gray" icon={<Ban className="size-3.5" aria-hidden="true" />}>{tx('ملغى', 'Cancelled')}</Badge>}
      {cancelReq && <Badge tone="amber" icon={<Ban className="size-3.5" aria-hidden="true" />}>{tx('طلب إلغاء', 'Cancel request')}</Badge>}
      {ret && <Badge tone="amber" icon={<RotateCcw className="size-3.5" aria-hidden="true" />}>{tx('مرتجع مفتوح', 'Open return')}</Badge>}
      {verifying && <Badge tone="amber" icon={<Hourglass className="size-3.5" aria-hidden="true" />}>{tx('تحقق', 'Verifying')}</Badge>}
      {(o.tags ?? []).slice(0, 2).map((t) => <Badge key={t} tone="gray" icon={<Tag className="size-3" aria-hidden="true" />}>{t}</Badge>)}
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
