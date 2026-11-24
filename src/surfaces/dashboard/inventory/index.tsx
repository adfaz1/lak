// Inventory section (`#/dashboard/inventory`): levels per SKU and warehouse, low stock, transfers, stock log.
// Every rule comes from merchant/inventory.ts through ./model; this file is layout and interaction.
import { lazy, useMemo, useState, type ReactNode } from 'react';
import { Boxes, SearchX, SlidersHorizontal, ArrowLeftRight, Truck, History, Plus, CheckCircle2, ArrowLeft } from 'lucide-react';
import { replace, type Route } from '../../../core/router';
import { useLang } from '../../../core/lang';
import { useReviewMode } from '../../../core/review';
import { LOCATIONS, LOC_IDS } from '../../merchant/domain';
import { ADJ_REASONS, adjust, bumpBySomeoneElse, historyFixtures, levelOf, type AdjReason, type Level, type StockLog, type Transfer } from '../../merchant/inventory';
import { can, canSee } from '../../merchant/perms';
import { levelsStore, productsStore, stockLogStore, transfersStore } from '../../merchant/stores';
import { Badge, Button, Card, EmptyState, ErrorState, InfoHint, LinkButton, Ref, Skeleton, cn, useTx } from '../../../ds/ui';
import { Alert, DataTable, Field, FilterChip, Input, Modal, PageHeader, Pagination, SearchInput, Select, Simulated, Tabs, useToast, type Column } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { sectionHref } from '../pages';
import { paginate } from '../products/model';
import { NoAccess, ReviewTools, ihref, roleBadge, useRole } from '../products/common';
import { SkuCell, T_TONE, useInvNames } from './parts';
import {
  adjustPreview, coverFor, infoFor, isOpen, levelRows, logRows, nextAdjId, readLoc, readTab, skuInfo, tabCounts, units, type LevelRow, type SkuInfo,
} from './model';

const TransferDetail = lazy(() => import('./transfer'));
const HISTORY = historyFixtures();
export default function Inventory({ route }: { route: Route }) {
  const tx = useTx();
  const role = useRole();
  if (!canSee(role, 'inventory')) return <NoAccess title={tx('لا تملك صلاحية المخزون', 'You don’t have access to Inventory')}>{tx('اطلب من مالك المتجر إضافة صلاحية المخزون لدورك.', 'Ask the store owner to add Inventory to your role.')}</NoAccess>;
  if (route.path[0] === 'transfers' && route.path[1]) return <TransferDetail key={route.path[1]} id={route.path[1]} query={route.query} />;
  return <InventoryHome route={route} />;
}

function InventoryHome({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const state = useDashState();
  const role = useRole();
  const canAdjust = can(role, 'inventory.adjust');
  const canTransfer = can(role, 'inventory.transfer');
  const products = productsStore.use();
  const allLevels = levelsStore.use();
  const allTransfers = transfersStore.use();
  const allLog = stockLogStore.use();
  const empty = state === 'empty';
  const levels = empty ? [] : allLevels;
  const transfers = empty ? [] : allTransfers;
  const log = empty ? [] : allLog;
  const info = useMemo(() => skuInfo(products), [products]);

  const tab = readTab(route.query.get('tab'));
  const q = route.query.get('q') ?? '';
  const loc = readLoc(route.query.get('loc'));
  const query = { tab: tab === 'levels' ? undefined : tab, q: q || undefined, loc: loc || undefined };
  const go = (patch: Record<string, string | undefined>) => replace(ihref('', { ...query, ...patch, page: undefined }));
  const counts = tabCounts(levels, transfers, log);
  const [adj, setAdj] = useState<Level | null>(null);

  const header = (
    <PageHeader title={tx('المخزون', 'Inventory')}
      description={tx(`${LOC_IDS.length} مستودعات · كل تعديل بسبب ويُسجَّل`, `${LOC_IDS.length} warehouses · every change has a reason and is logged`)}
      meta={!canAdjust ? roleBadge(tx) : undefined}
      actions={canTransfer && <LinkButton href={ihref('transfers/new')}><Plus className="size-4" aria-hidden="true" />{tx('تحويل جديد', 'New transfer')}</LinkButton>} />
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<TableSkeleton /></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل المخزون', 'Inventory could not load')} onRetry={() => setDashState('live')}>{tx('لم تتغير الكميات، والطلبات تُحجز كالمعتاد. المرجع SIM-INV-503.', 'Quantities did not change; orders keep reserving stock. Ref SIM-INV-503.')}</ErrorState></Card></div>;

  const tabs = (
    <div className="px-4 pt-2 sm:px-5">
      <Tabs label={tx('أقسام المخزون', 'Inventory views')} items={[
        { href: ihref('', { q: query.q, loc: query.loc }), label: tx('المستويات', 'Levels'), current: tab === 'levels' },
        { href: ihref('', { ...query, tab: 'low' }), label: tx('منخفض', 'Low stock'), current: tab === 'low', count: counts.low },
        { href: ihref('', { tab: 'transfers' }), label: tx('التحويلات', 'Transfers'), current: tab === 'transfers', count: counts.transfers },
        { href: ihref('', { ...query, tab: 'log' }), label: tx('سجل الحركة', 'Stock log'), current: tab === 'log' },
      ]} />
    </div>
  );
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 p-4 sm:px-5">
      <div className="flex w-full sm:w-auto sm:flex-1 sm:max-w-xs"><SearchInput value={q} onChange={(v) => go({ q: v || undefined })} placeholder={tx('ابحث بالمنتج أو SKU', 'Search product or SKU')} /></div>
      <FilterChip label={tx('المستودع', 'Warehouse')} value={loc} onChange={(v) => go({ loc: v || undefined })} options={LOC_IDS.map((l) => ({ value: l, label: LOCATIONS[l][lang] }))} />
      {(q || loc) && <a href={ihref('', { tab: query.tab })} className="px-2 text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('مسح التصفية', 'Clear filters')}</a>}
    </div>
  );
  const noResults = (
    <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا نتائج', 'No results')} action={<LinkButton variant="secondary" href={ihref('', { tab: query.tab })}>{tx('امسح التصفية', 'Clear filters')}</LinkButton>}>{tx('جرّب كلمة أخرى أو مستودعًا آخر.', 'Try another word or warehouse.')}</EmptyState>
  );

  let body: ReactNode;
  if (tab === 'transfers') body = <TransferList transfers={transfers} info={info} canTransfer={canTransfer} />;
  else if (tab === 'log') {
    const rows = logRows(log, info, { q, loc });
    const pg = paginate(rows, route.query.get('page'));
    body = <>{toolbar}{log.length === 0 ? <EmptyState icon={<History className="size-6" aria-hidden="true" />} title={tx('لا حركات بعد', 'No stock movements yet')}>{tx('تظهر هنا التعديلات والتحويلات.', 'Adjustments and transfers appear here.')}</EmptyState> : rows.length === 0 ? noResults : <><LogTable rows={pg.rows} /><Pagination page={pg.page} pages={pg.pages} total={rows.length} hrefFor={(n) => ihref('', { ...query, page: n > 1 ? String(n) : undefined })} /></>}</>;
  } else if (levels.length === 0) {
    body = <EmptyState icon={<Boxes className="size-6" aria-hidden="true" />} title={tx('لا مخزون متتبَّع بعد', 'No tracked stock yet')} action={<LinkButton href={sectionHref('products', 'new')}>{tx('أضف منتجًا', 'Add a product')}</LinkButton>}>{tx('أضف منتجًا ملموسًا بكمياته في كل مستودع.', 'Add a physical product with its quantity per warehouse.')}</EmptyState>;
  } else {
    const low = tab === 'low';
    const rows = levelRows(levels, info, { q, loc, lowOnly: low });
    const pg = paginate(rows, route.query.get('page'));
    body = (
      <>
        {toolbar}
        {rows.length === 0 ? (low && !q && !loc ? <EmptyState icon={<CheckCircle2 className="size-6" aria-hidden="true" />} title={tx('لا شيء منخفض', 'Nothing is running low')}>{tx('كل الأصناف فوق حد إعادة الطلب.', 'Every SKU is above its reorder point.')}</EmptyState> : noResults) : (
          <>
            {low ? <LowList rows={pg.rows} levels={levels} canTransfer={canTransfer} /> : <LevelTable rows={pg.rows} onAdjust={canAdjust ? setAdj : undefined} />}
            <Pagination page={pg.page} pages={pg.pages} total={rows.length} hrefFor={(n) => ihref('', { ...query, page: n > 1 ? String(n) : undefined })} />
          </>
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      <Card>{tabs}{body}</Card>
      <ReviewTools />
      {adj && <AdjustModal key={`${adj.sku}@${adj.loc}`} level={adj} info={infoFor(info, adj.sku)} onClose={() => setAdj(null)} />}
    </div>
  );
}

function DefHint({ k }: { k: 'onHand' | 'reserved' | 'available' | 'incoming' }) {
  const tx = useTx();
  const text = {
    onHand: tx('وحدات موجودة فعليًا في المستودع.', 'Units physically in the warehouse.'),
    reserved: tx('محجوزة لطلبات مدفوعة لم تُجهّز بعد.', 'Held for paid orders not yet fulfilled.'),
    available: tx('الموجود − المحجوز. ما يمكن بيعه الآن.', 'On hand − reserved. What can be sold now.'),
    incoming: tx('في تحويل مُرسل لم يُستلم. لا يُباع تلقائيًا.', 'In a sent transfer, not yet received. Never sold automatically.'),
  }[k];
  return <InfoHint>{text}</InfoHint>;
}

function LevelTable({ rows, onAdjust }: { rows: LevelRow[]; onAdjust?: (l: Level) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const h = (label: string, k: 'onHand' | 'reserved' | 'available' | 'incoming') => <span className="inline-flex items-center gap-0.5">{label}<DefHint k={k} /></span>;
  const avail = (r: LevelRow) => <span className={cn('font-bold tabular-nums', r.available <= 0 ? 'text-red-600 dark:text-red-400' : r.low ? 'text-amber-700 dark:text-amber-300' : 'text-fg')}>{r.available}</span>;
  const columns: Column<LevelRow>[] = [
    { key: 'p', header: tx('المنتج', 'Product'), cell: (r) => <SkuCell sku={r.sku} info={r.info} />, className: 'max-w-80' },
    { key: 'loc', header: tx('المستودع', 'Warehouse'), cell: (r) => <span className="text-muted">{LOCATIONS[r.loc][lang]}</span> },
    { key: 'oh', header: h(tx('الموجود', 'On hand'), 'onHand'), align: 'end', cell: (r) => <span className="tabular-nums">{r.onHand}</span> },
    { key: 'rs', header: h(tx('المحجوز', 'Reserved'), 'reserved'), align: 'end', cell: (r) => <span className="tabular-nums text-muted">{r.reserved}</span>, hideBelow: 'lg' },
    { key: 'av', header: h(tx('المتاح', 'Available'), 'available'), align: 'end', cell: avail },
    { key: 'in', header: h(tx('الوارد', 'Incoming'), 'incoming'), align: 'end', cell: (r) => <span className="tabular-nums text-muted">{r.incoming || '—'}</span>, hideBelow: 'lg' },
    ...(onAdjust ? [{ key: 'a', header: <span className="sr-only">{tx('إجراء', 'Action')}</span>, align: 'end' as const, cell: (r: LevelRow) => <Button variant="secondary" size="sm" onClick={() => onAdjust(r)} aria-label={tx(`عدّل ${r.sku} في ${LOCATIONS[r.loc].ar}`, `Adjust ${r.sku} at ${LOCATIONS[r.loc].en}`)}><SlidersHorizontal className="size-3.5" aria-hidden="true" />{tx('عدّل', 'Adjust')}</Button> }] : []),
  ];
  return (
    <div className="border-t border-border">
      <DataTable label={tx('مستويات المخزون', 'Stock levels')} rows={rows} columns={columns} rowKey={(r) => r.key}
        card={(r) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2"><SkuCell sku={r.sku} info={r.info} sub={LOCATIONS[r.loc][lang]} /></div>
            <dl className="grid grid-cols-4 gap-2 rounded-xl bg-surface-2 p-2 text-center text-xs">
              {([[tx('موجود', 'On hand'), r.onHand], [tx('محجوز', 'Reserved'), r.reserved], [tx('متاح', 'Available'), avail(r)], [tx('وارد', 'Incoming'), r.incoming]] as const).map(([l, v]) => <div key={l}><dt className="text-muted">{l}</dt><dd className="mt-0.5 font-semibold tabular-nums text-fg">{v}</dd></div>)}
            </dl>
            {onAdjust && <Button variant="secondary" size="sm" className="w-full" onClick={() => onAdjust(r)}><SlidersHorizontal className="size-3.5" aria-hidden="true" />{tx('عدّل الكمية', 'Adjust quantity')}</Button>}
          </div>
        )} />
    </div>
  );
}

function LowList({ rows, levels, canTransfer }: { rows: LevelRow[]; levels: Level[]; canTransfer: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  return (
    <ul className="divide-y divide-border border-t border-border">
      {rows.map((r) => {
        const c = coverFor(levels, r.sku, HISTORY);
        const cover = c.kind === 'days' ? tx(`يكفي ≈${c.days} يومًا بمعدل ${c.perDay}/يوم`, `≈${c.days} days of cover at ${c.perDay}/day`)
          : c.kind === 'noSales' ? tx('لا مبيعات في الفترة', 'No sales in the period') : tx('سجل أقل من 14 يومًا: لا تقدير', 'Under 14 days of history: no estimate');
        return (
          <li key={r.key} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1 basis-60"><SkuCell sku={r.sku} info={r.info} sub={LOCATIONS[r.loc][lang]} /></div>
            <div className="text-xs text-muted sm:w-56">
              <span className="flex items-center gap-1">{cover}{c.kind === 'days' && <InfoHint>{tx('المتاح في كل المستودعات ÷ متوسط البيع اليومي في آخر الفترة. تقدير، ليس وعدًا.', 'Available across warehouses ÷ average daily sales in the recent period. An estimate, not a promise.')}</InfoHint>}</span>
              <span>{tx(`حد إعادة الطلب ${r.threshold}`, `Reorder point ${r.threshold}`)}</span>
            </div>
            <Badge tone={r.available <= 0 ? 'red' : 'amber'}>{r.available <= 0 ? tx('نفد', 'Out') : tx(`${r.available} متاح`, `${r.available} left`)}</Badge>
            {canTransfer && <LinkButton variant="secondary" size="sm" href={ihref('transfers/new', { sku: r.sku, to: r.loc })}><ArrowLeftRight className="size-3.5" aria-hidden="true" />{tx('حوّل إليه', 'Transfer in')}</LinkButton>}
          </li>
        );
      })}
    </ul>
  );
}

function TransferList({ transfers, info, canTransfer }: { transfers: Transfer[]; info: Map<string, SkuInfo>; canTransfer: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const names = useInvNames();
  if (!transfers.length) return <EmptyState icon={<Truck className="size-6" aria-hidden="true" />} title={tx('لا تحويلات بعد', 'No transfers yet')} action={canTransfer ? <LinkButton href={ihref('transfers/new')}>{tx('أنشئ تحويلًا', 'Create a transfer')}</LinkButton> : undefined}>{tx('انقل المخزون بين مستودعاتك.', 'Move stock between your warehouses.')}</EmptyState>;
  const route = (t: Transfer) => <span className="inline-flex items-center gap-1.5 text-muted">{LOCATIONS[t.from][lang]}<ArrowLeft className="size-3.5 ltr:rotate-180" aria-hidden="true" />{LOCATIONS[t.to][lang]}</span>;
  const lines = (t: Transfer) => t.lines.map((l) => infoFor(info, l.sku).name[lang]).join(tx('، ', ', '));
  const columns: Column<Transfer>[] = [
    { key: 'id', header: tx('المرجع', 'Ref'), cell: (t) => <Ref>{t.id}</Ref> },
    { key: 'r', header: tx('المسار', 'Route'), cell: route },
    { key: 'l', header: tx('الأصناف', 'Items'), cell: (t) => <span className="block max-w-64 truncate text-muted">{lines(t)}</span>, hideBelow: 'lg' },
    { key: 'u', header: tx('المستلم', 'Received'), align: 'end', cell: (t) => { const u = units(t); return <span className="tabular-nums">{u.received} / {u.qty}</span>; } },
    { key: 's', header: tx('الحالة', 'Status'), cell: (t) => <Badge tone={T_TONE[t.status]}>{names.status(t.status)}</Badge> },
  ];
  const sorted = [...transfers].sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || b.id.localeCompare(a.id));
  return (
    <div className="border-t border-border">
      <DataTable label={tx('التحويلات', 'Transfers')} rows={sorted} columns={columns} rowKey={(t) => t.id} href={(t) => ihref(`transfers/${t.id}`)}
        card={(t) => (
          <span className="block space-y-1">
            <span className="flex items-center justify-between gap-2"><span className="font-semibold text-fg"><Ref>{t.id}</Ref></span><Badge tone={T_TONE[t.status]}>{names.status(t.status)}</Badge></span>
            <span className="block text-sm">{route(t)}</span>
            <span className="block truncate text-xs text-muted">{lines(t)} · {units(t).received}/{units(t).qty}</span>
          </span>
        )} />
    </div>
  );
}

function LogTable({ rows }: { rows: (StockLog & { info: SkuInfo })[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const names = useInvNames();
  const delta = (x: StockLog) => <bdi dir="ltr" className={cn('font-bold tabular-nums', x.delta > 0 ? 'text-emerald-700 dark:text-emerald-400' : x.delta < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted')}>{x.delta > 0 ? '+' : ''}{x.delta}</bdi>;
  const columns: Column<StockLog & { info: SkuInfo }>[] = [
    { key: 'p', header: tx('المنتج', 'Product'), cell: (x) => <SkuCell sku={x.sku} info={x.info} sub={LOCATIONS[x.loc][lang]} />, className: 'max-w-80' },
    { key: 'd', header: tx('التغيير', 'Change'), align: 'end', cell: delta },
    { key: 'ba', header: tx('قبل ← بعد', 'Before → after'), align: 'end', cell: (x) => <bdi dir="ltr" className="tabular-nums text-muted">{x.before} → {x.after}</bdi>, hideBelow: 'md' },
    { key: 'r', header: tx('السبب', 'Reason'), cell: (x) => <span><span className="block text-fg">{names.reason(x.reason)}</span>{x.note && <span className="block max-w-56 truncate text-xs text-muted">{x.note}</span>}</span> },
    { key: 'w', header: tx('بواسطة', 'By'), cell: (x) => <span className="text-muted">{x.who === 'You' ? tx('أنت', 'You') : x.who}</span>, hideBelow: 'lg' },
    { key: 'id', header: tx('المرجع', 'Ref'), cell: (x) => x.ref ? <a className="font-medium text-brand-700 hover:underline dark:text-brand-300" href={ihref(`transfers/${x.ref}`)}><Ref>{x.id}</Ref></a> : <span className="text-xs text-muted"><Ref>{x.id}</Ref></span>, hideBelow: 'lg' },
  ];
  return (
    <div className="border-t border-border">
      <DataTable label={tx('سجل حركة المخزون', 'Stock movement log')} rows={rows} columns={columns} rowKey={(x) => x.id}
        card={(x) => (
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-2"><SkuCell sku={x.sku} info={x.info} />{delta(x)}</div>
            <p className="text-xs text-muted">{names.reason(x.reason)} · {LOCATIONS[x.loc][lang]} · <bdi dir="ltr">{x.before} → {x.after}</bdi> · <Ref>{x.id}</Ref></p>
          </div>
        )} />
    </div>
  );
}

function AdjustModal({ level, info, onClose }: { level: Level; info: SkuInfo; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const names = useInvNames();
  const toast = useToast();
  const review = useReviewMode();
  const levels = levelsStore.use();
  const current = levelOf(levels, level.sku, level.loc)!;
  const [seen, setSeen] = useState(level);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState<AdjReason | ''>('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [conflict, setConflict] = useState<Level | null>(null);
  const pv = adjustPreview(seen, delta);
  const deltaErr = tried && !pv.ready ? (pv.belowZero ? tx('الموجود لا يصبح أقل من صفر', 'On hand can’t go below zero') : tx('عدد صحيح غير صفري، مثل +5 أو -2', 'A non-zero whole number, e.g. +5 or -2')) : null;
  const reasonErr = tried && !reason ? tx('اختر سببًا', 'Choose a reason') : null;

  const submit = () => {
    setTried(true);
    if (!pv.ready || !reason) return;
    const id = nextAdjId(stockLogStore.get());
    const r = adjust(levelsStore.get(), level.sku, level.loc, pv.delta!, reason, seen.version, 'You', id, note.trim());
    if (r.error === 'conflict') { setConflict(r.current!); return; }
    if (r.error) return;
    levelsStore.set(r.levels);
    stockLogStore.set((lg) => [r.log!, ...lg]);
    toast(r.oversold
      ? { tone: 'bad', text: tx(`سُجل ${id}. الموجود أقل من المحجوز: قد لا تكفي القطع للطلبات المدفوعة.`, `Logged ${id}. On hand is below reserved: paid orders may not be covered.`) }
      : { tone: 'ok', text: tx(`سُجل التعديل ${id}`, `Adjustment ${id} logged`) });
    onClose();
  };

  return (
    <Modal title={tx('تعديل الكمية', 'Adjust quantity')} onClose={onClose}
      description={<>{info.name[lang]}{info.variant && ` · ${info.variant}`} · {LOCATIONS[level.loc][lang]}</>}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={submit} disabled={!!conflict}>{tx('سجّل التعديل', 'Record adjustment')}</Button></>}>
      {conflict && (
        <Alert tone="warn" title={tx('تغيّرت الكمية بعد أن فتحت النموذج', 'The quantity changed after you opened this')}
          action={<Button variant="secondary" size="sm" onClick={() => { setSeen(conflict); setConflict(null); }}>{tx('استخدم الحالي', 'Use current')}</Button>}>
          {tx(`عدّلها شخص آخر: الموجود الآن ${conflict.onHand} (كان ${seen.onHand}). لم نكتب فوق تعديله.`, `Someone else changed it: on hand is now ${conflict.onHand} (was ${seen.onHand}). We did not overwrite their change.`)}
        </Alert>
      )}
      <dl className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3 text-center text-xs">
        {([[tx('الموجود', 'On hand'), pv.onHand], [tx('المحجوز', 'Reserved'), [seen.reserved, seen.reserved]], [tx('المتاح', 'Available'), pv.available]] as const).map(([l, [a, b]]) => (
          <div key={l}><dt className="text-muted">{l}</dt><dd className="mt-1 text-base font-bold tabular-nums text-fg"><bdi dir="ltr">{a}{pv.delta && a !== b ? <> → <span className={b < a ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}>{b}</span></> : null}</bdi></dd></div>
        ))}
      </dl>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={tx('التغيير (+ أو −)', 'Change (+ or −)')} error={deltaErr}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" placeholder="+5" value={delta} onChange={(e) => setDelta(e.target.value)} />}</Field>
        <Field label={tx('السبب', 'Reason')} error={reasonErr}>{(p) => <Select {...p} value={reason} onChange={(e) => setReason(e.target.value as AdjReason)}><option value="">{tx('اختر…', 'Choose…')}</option>{ADJ_REASONS.map((r) => <option key={r} value={r}>{names.reason(r)}</option>)}</Select>}</Field>
        <Field className="sm:col-span-2" label={tx('ملاحظة', 'Note')} optional>{(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </div>
      {pv.oversold && <Alert tone="warn">{tx('سيصبح الموجود أقل من المحجوز لطلبات مدفوعة.', 'On hand will drop below what is reserved for paid orders.')}</Alert>}
      <p className="text-xs text-muted">{tx(`الإصدار الذي فتحته ${seen.version} · الحالي ${current.version}`, `Version you opened ${seen.version} · current ${current.version}`)}</p>
      {review && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-3 text-xs">
          <span className="font-semibold text-muted">{tx('أداة مراجعة', 'Review tool')}</span>
          <Button variant="secondary" size="sm" onClick={() => levelsStore.set((ls) => bumpBySomeoneElse(ls, level.sku, level.loc, 3))}>{tx('حاكِ تعديل زميل (+3)', 'Simulate a colleague’s change (+3)')}</Button>
          <Simulated />
        </div>
      )}
    </Modal>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface" role="status" aria-label="Loading">
      <div className="flex gap-4 border-b border-border px-5 py-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-20" />)}</div>
      <div className="flex gap-2 p-5"><Skeleton className="h-10 w-72 rounded-xl" /><Skeleton className="h-10 w-28 rounded-xl" /></div>
      <div className="divide-y divide-border border-t border-border">
        {Array.from({ length: 7 }, (_, i) => <div key={i} className="flex items-center gap-4 px-5 py-3"><Skeleton className="size-10 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/5" /></div>{[0, 1, 2].map((j) => <Skeleton key={j} className="h-4 w-10" />)}<Skeleton className="h-9 w-20 rounded-lg" /></div>)}
      </div>
    </div>
  );
}
