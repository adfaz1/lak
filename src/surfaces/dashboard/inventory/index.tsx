// Inventory section (`#/dashboard/inventory`): levels per SKU and warehouse, low stock, transfers, stock log.
// Every rule comes from merchant/inventory.ts through ./model; this file is layout and interaction.
import { lazy, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Boxes, SearchX, SlidersHorizontal, ArrowLeftRight, Truck, History, Plus, CheckCircle2, ArrowLeft, Warehouse, Download, Upload, BellRing, Gauge, Layers } from 'lucide-react';
import { replace, type Route } from '../../../core/router';
import { useLang } from '../../../core/lang';
import { useReviewMode } from '../../../core/review';
import { LOCATIONS, LOC_IDS } from '../../merchant/domain';
import { toCsv } from '../../merchant/catalog';
import { ADJ_REASONS, adjust, bumpBySomeoneElse, historyFixtures, levelOf, syncStockAlerts, type AdjReason, type Level, type StockAlertEntry, type StockLog, type Transfer } from '../../merchant/inventory';
import { can, canSee } from '../../merchant/perms';
import { levelsStore, logAction, locationsStore, productsStore, stockAlertsStore, stockLogStore, transfersStore } from '../../merchant/stores';
import { Badge, Button, Card, EmptyState, ErrorState, InfoHint, LinkButton, Ref, Segmented, Skeleton, cn, useTx } from '../../../ds/ui';
import { Alert, BulkBar, DataTable, Field, FilterChip, Input, Modal, PageHeader, Pagination, SearchInput, Select, Simulated, Tabs, useToast, type Column } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { sectionHref } from '../pages';
import { paginate } from '../products/model';
import { NoAccess, ReviewTools, downloadText, ihref, roleBadge, useRole } from '../products/common';
import { SkuCell, T_TONE, useInvNames } from './parts';
import {
  STATE_FILTERS, adjustPreview, coverFor, infoFor, isOpen, levelRows, levelsCsv, logRows, nextAdjId, readCols, readLoc, readStateFilter, readTab, skuInfo, tabCounts, units,
  type LevelCols, type LevelRow, type SkuInfo,
} from './model';
import { CompositionBar, StateHead, StatesModal, useStateNames } from './states';

const TransferDetail = lazy(() => import('./transfer'));
const Locations = lazy(() => import('./locations'));
const CountImport = lazy(() => import('./count'));
import { ThresholdModal } from './threshold';
const HISTORY = historyFixtures();
export default function Inventory({ route }: { route: Route }) {
  const tx = useTx();
  const role = useRole();
  if (!canSee(role, 'inventory')) return <NoAccess title={tx('لا تملك صلاحية المخزون', 'You don’t have access to Inventory')}>{tx('اطلب من مالك المتجر إضافة صلاحية المخزون لدورك.', 'Ask the store owner to add Inventory to your role.')}</NoAccess>;
  if (route.path[0] === 'transfers' && route.path[1]) return <TransferDetail key={route.path[1]} id={route.path[1]} query={route.query} />;
  if (route.path[0] === 'locations') return <Locations />;
  if (route.path[0] === 'import') return <CountImport />;
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
  const st = readStateFilter(route.query.get('state'));
  const cols = readCols(route.query.get('cols'));
  const query = { tab: tab === 'levels' ? undefined : tab, q: q || undefined, loc: loc || undefined, state: st || undefined, cols: cols === 'all' ? 'all' : undefined };
  const go = (patch: Record<string, string | undefined>) => replace(ihref('', { ...query, ...patch, page: undefined }));
  const counts = tabCounts(levels, transfers, log);
  const [adj, setAdj] = useState<Level | null>(null);
  const [thr, setThr] = useState<Level[] | null>(null);
  const [states, setStates] = useState<Level | null>(null);
  const sn = useStateNames();
  const [sel, setSel] = useState<Set<string>>(new Set());
  locationsStore.use();
  // Keep low-stock alerts in step with every level change (adjustments, transfers, orders): one alert per crossing.
  useEffect(() => {
    const r = syncStockAlerts(allLevels, stockAlertsStore.get(), 'now', Date.now());
    if (r.raised.length || r.resolved) stockAlertsStore.set(r.alerts);
  }, [allLevels]);
  const exportLevels = () => downloadText('inventory.csv', toCsv(levelsCsv(levelRows(levels, info, { q, loc, state: st }, transfers), (id) => LOCATIONS[id][lang])));

  const header = (
    <PageHeader title={tx('المخزون', 'Inventory')}
      description={tx(`${LOC_IDS.length} مواقع نشطة · كل تعديل بسبب ويُسجَّل`, `${LOC_IDS.length} active locations · every change has a reason and is logged`)}
      meta={!canAdjust ? roleBadge(tx) : undefined}
      actions={<>
        <LinkButton variant="secondary" href={ihref('locations')}><Warehouse className="size-4" aria-hidden="true" />{tx('المواقع', 'Locations')}</LinkButton>
        {state === 'live' && levels.length > 0 && <Button variant="secondary" onClick={exportLevels}><Download className="size-4" aria-hidden="true" />{tx('تصدير', 'Export')}</Button>}
        {canAdjust && <LinkButton variant="secondary" href={ihref('import')}><Upload className="size-4" aria-hidden="true" />{tx('استيراد جرد', 'Import count')}</LinkButton>}
        {canTransfer && <LinkButton href={ihref('transfers/new')}><Plus className="size-4" aria-hidden="true" />{tx('تحويل جديد', 'New transfer')}</LinkButton>}
      </>} />
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<TableSkeleton /></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل المخزون', 'Inventory could not load')} onRetry={() => setDashState('live')}>{tx('لم تتغير الكميات، والطلبات تُحجز كالمعتاد. المرجع SIM-INV-503.', 'Quantities did not change; orders keep reserving stock. Ref SIM-INV-503.')}</ErrorState></Card></div>;

  const tabs = (
    <div className="px-4 pt-2 sm:px-5">
      <Tabs label={tx('أقسام المخزون', 'Inventory views')} items={[
        { href: ihref('', { q: query.q, loc: query.loc, state: query.state, cols: query.cols }), label: tx('المستويات', 'Levels'), current: tab === 'levels' },
        { href: ihref('', { ...query, tab: 'low' }), label: tx('منخفض', 'Low stock'), current: tab === 'low', count: counts.low },
        { href: ihref('', { tab: 'transfers' }), label: tx('التحويلات', 'Transfers'), current: tab === 'transfers', count: counts.transfers },
        { href: ihref('', { ...query, tab: 'log' }), label: tx('سجل الحركة', 'Stock log'), current: tab === 'log' },
      ]} />
    </div>
  );
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 p-4 sm:px-5">
      <div className="flex w-full sm:w-auto sm:flex-1 sm:max-w-xs"><SearchInput value={q} onChange={(v) => go({ q: v || undefined })} placeholder={tx('ابحث بالمنتج أو SKU', 'Search product or SKU')} /></div>
      <FilterChip label={tx('الموقع', 'Location')} value={loc} onChange={(v) => go({ loc: v || undefined })} options={LOC_IDS.map((l) => ({ value: l, label: LOCATIONS[l][lang] }))} />
      {tab === 'levels' && <FilterChip label={tx('الحالة', 'State')} value={st} onChange={(v) => go({ state: v || undefined })} options={STATE_FILTERS.map((f) => ({ value: f, label: f === 'held' ? tx('موقوف عن البيع', 'Held back from sale') : f === 'transit' ? tx('في الطريق', 'In transit') : sn.label(f) }))} />}
      {tab === 'levels' && <span className="ms-auto hidden items-center gap-1 sm:inline-flex"><Segmented label={tx('الأعمدة', 'Columns')} value={cols} onChange={(v: LevelCols) => go({ cols: v === 'all' ? 'all' : undefined })} options={[{ value: 'essential', label: tx('الأساسية', 'Essential') }, { value: 'all', label: tx('كل الحالات', 'All states') }]} /><InfoHint>{tx('«كل الحالات» تعرض: بانتظار الدفع، غير المتاح، الاحتياطي، الوارد والصادر. تُحفظ في الرابط.', '“All states” shows awaiting payment, unavailable, safety reserve, incoming and outgoing. Kept in the link.')}</InfoHint></span>}
      {(q || loc || st) && <a href={ihref('', { tab: query.tab, cols: query.cols })} className="px-2 text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('مسح التصفية', 'Clear filters')}</a>}
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
    const rows = levelRows(levels, info, { q, loc, lowOnly: low, state: low ? '' : st }, transfers);
    const pg = paginate(rows, route.query.get('page'));
    body = (
      <>
        {toolbar}
        {rows.length === 0 ? (low && !q && !loc && !st ? <EmptyState icon={<CheckCircle2 className="size-6" aria-hidden="true" />} title={tx('لا شيء منخفض', 'Nothing is running low')}>{tx('كل الأصناف فوق حد إعادة الطلب.', 'Every SKU is above its reorder point.')}</EmptyState> : noResults) : (
          <>
            {low ? <LowList rows={pg.rows} levels={levels} canTransfer={canTransfer} onThreshold={canAdjust ? (r) => setThr([r]) : undefined} />
              : <LevelTable rows={pg.rows} cols={cols} onStates={setStates} onAdjust={canAdjust ? setAdj : undefined} onThreshold={canAdjust ? (r) => setThr([r]) : undefined}
                selected={canAdjust ? sel : undefined} onSelect={canAdjust ? (k, on) => setSel((x) => { const n = new Set(x); if (on) n.add(k); else n.delete(k); return n; }) : undefined}
                bulk={sel.size > 0 ? <BulkBar count={sel.size} onClear={() => setSel(new Set())} scope={tx('صفوف (صنف × موقع)', 'rows (SKU × location)')}>
                  <Button size="sm" onClick={() => setThr(levels.filter((l) => sel.has(`${l.sku}@${l.loc}`)))}><Gauge className="size-3.5" aria-hidden="true" />{tx('حد إعادة الطلب', 'Reorder point')}</Button>
                </BulkBar> : null} />}
            <Pagination page={pg.page} pages={pg.pages} total={rows.length} hrefFor={(n) => ihref('', { ...query, page: n > 1 ? String(n) : undefined })} />
          </>
        )}
        {low && <AlertLog info={info} />}
      </>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      <Card>{tabs}{body}</Card>
      <ReviewTools />
      {adj && <AdjustModal key={`${adj.sku}@${adj.loc}`} level={adj} info={infoFor(info, adj.sku)} onClose={() => setAdj(null)} />}
      {states && <StatesModal key={`${states.sku}@${states.loc}`} level={states} info={infoFor(info, states.sku)} canMove={canAdjust} onClose={() => setStates(null)} />}
      {thr && <ThresholdModal rows={thr} info={(sku) => infoFor(info, sku)} onClose={() => setThr(null)} onSaved={() => setSel(new Set())} />}
    </div>
  );
}

function LevelTable({ rows, cols, onStates, onAdjust, onThreshold, selected, onSelect, bulk }: { rows: LevelRow[]; cols: LevelCols; onStates: (l: Level) => void; onAdjust?: (l: Level) => void; onThreshold?: (l: Level) => void; selected?: Set<string>; onSelect?: (key: string, on: boolean) => void; bulk?: ReactNode }) {
  const tx = useTx();
  const { lang } = useLang();
  const all = cols === 'all';
  const num = (v: number, muted = true) => <span className={cn('tabular-nums', muted && 'text-muted', v === 0 && 'text-subtle')}>{v || '—'}</span>;
  const held = (r: LevelRow) => r.states.awaitingPay + r.states.unavailable + r.states.safety;
  const avail = (r: LevelRow) => r.unstocked ? <span className="text-xs text-subtle">{tx('غير مخزّن', 'Not stocked')}</span> : <span className={cn('font-bold tabular-nums', r.available <= 0 ? 'text-red-600 dark:text-red-400' : r.low ? 'text-amber-700 dark:text-amber-300' : 'text-fg')}>{r.available}</span>;
  const thr = (r: LevelRow) => r.unstocked ? <span className="text-subtle">—</span> : onThreshold
    ? <button type="button" onClick={() => onThreshold(r)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold tabular-nums text-fg hover:bg-surface-2" aria-label={tx(`حد إعادة الطلب ${r.threshold} · عدّل`, `Reorder point ${r.threshold} · edit`)}>{r.threshold}<Gauge className="size-3 text-subtle" aria-hidden="true" /></button>
    : <span className="tabular-nums">{r.threshold}</span>;
  const statesBtn = (r: LevelRow, label?: boolean) => (
    <Button variant={label ? 'secondary' : 'ghost'} size="sm" className={label ? undefined : 'size-9 shrink-0 px-0'} title={label ? undefined : tx('حالات المخزون', 'Stock states')} onClick={() => onStates(r)} disabled={r.unstocked} aria-label={tx(`حالات المخزون: ${r.sku} في ${LOCATIONS[r.loc].ar}`, `Stock states: ${r.sku} at ${LOCATIONS[r.loc].en}`)}>
      <Layers className="size-4 shrink-0" aria-hidden="true" />{label && tx('الحالات', 'States')}
    </Button>
  );
  const heldCell = (r: LevelRow) => {
    const h = held(r);
    if (!h) return <span className="text-subtle">—</span>;
    const bits = ([['awaitingPay', tx('دفع', 'pay')], ['unavailable', tx('تالف', 'dmg')], ['safety', tx('احتياطي', 'safety')]] as const).filter(([k]) => r.states[k] > 0).map(([k, l]) => `${r.states[k]} ${l}`);
    return <button type="button" onClick={() => onStates(r)} className="inline-flex flex-col items-end rounded-md px-1.5 py-0.5 leading-tight hover:bg-surface-2"><span className="font-semibold tabular-nums text-fg">{h}</span><span className="text-[11px] text-muted">{bits.join(' · ')}</span></button>;
  };
  const columns: Column<LevelRow>[] = [
    { key: 'p', header: tx('المنتج', 'Product'), cell: (r) => <SkuCell sku={r.sku} info={r.info} sub={all ? LOCATIONS[r.loc][lang] : undefined} />, className: all ? 'max-w-64' : 'max-w-72' },
    ...(all ? [] : [{ key: 'loc', header: tx('الموقع', 'Location'), cell: (r: LevelRow) => <span className="text-muted">{LOCATIONS[r.loc][lang]}</span> }]),
    { key: 'oh', header: <StateHead s="onHand" />, align: 'end', cell: (r) => <span className="inline-flex flex-col items-end gap-1"><span className="tabular-nums">{r.onHand}</span>{!r.unstocked && r.onHand > 0 && r.available !== r.onHand && <CompositionBar b={r.states} className="h-1.5 w-12" />}</span> },
    { key: 'av', header: <StateHead s="available" />, align: 'end', cell: avail },
    { key: 'rs', header: <StateHead s="reserved" />, align: 'end', cell: (r) => num(r.reserved), hideBelow: 'lg' },
    ...(all ? [
      { key: 'ap', header: <StateHead s="awaitingPay" />, align: 'end' as const, cell: (r: LevelRow) => num(r.states.awaitingPay), hideBelow: 'lg' as const },
      { key: 'un', header: <StateHead s="unavailable" />, align: 'end' as const, cell: (r: LevelRow) => num(r.states.unavailable), hideBelow: 'lg' as const },
      { key: 'sf', header: <StateHead s="safety" />, align: 'end' as const, cell: (r: LevelRow) => num(r.states.safety), hideBelow: 'lg' as const },
    ] : [
      { key: 'hd', header: <span className="inline-flex items-center gap-0.5">{tx('موقوف', 'Held')}<InfoHint>{tx('بانتظار الدفع + غير المتاح + الاحتياطي: قطع موجودة لا تُباع. اضغط الرقم للتفاصيل.', 'Awaiting payment + unavailable + safety reserve: units on hand that are not sold. Click the number for details.')}</InfoHint></span>, align: 'end' as const, cell: heldCell, hideBelow: 'lg' as const },
    ]),
    { key: 'in', header: <StateHead s="incoming" />, align: 'end', cell: (r) => num(r.incoming), hideBelow: 'lg' },
    ...(all ? [{ key: 'out', header: <StateHead s="outgoing" />, align: 'end' as const, cell: (r: LevelRow) => num(r.states.outgoing), hideBelow: 'lg' as const }] : []),
    ...(all ? [] : [{ key: 'th', header: <span className="inline-flex items-center gap-0.5">{tx('حد الطلب', 'Reorder at')}<InfoHint>{tx('منخفض عندما يصل المتاح إلى هذا الرقم. اضغطه لتعديله.', 'Low when available reaches this number. Click to change it.')}</InfoHint></span>, align: 'end' as const, cell: thr, hideBelow: 'md' as const }]),
    { key: 'a', header: <span className="sr-only">{tx('إجراء', 'Action')}</span>, align: 'end', className: 'whitespace-nowrap', cell: (r) => (
      <span className="inline-flex shrink-0 items-center gap-1">
        {statesBtn(r)}
        {onAdjust && <Button variant="secondary" size="sm" className={all ? 'size-9 shrink-0 px-0' : 'shrink-0'} title={all ? tx('عدّل', 'Adjust') : undefined} onClick={() => onAdjust(r)} aria-label={tx(`عدّل ${r.sku} في ${LOCATIONS[r.loc].ar}`, `Adjust ${r.sku} at ${LOCATIONS[r.loc].en}`)}><SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />{!all && tx('عدّل', 'Adjust')}</Button>}
      </span>
    ) },
  ];
  return (
    <div className="border-t border-border">
      {bulk && <div className="px-4 pb-3 sm:px-5">{bulk}</div>}
      <DataTable label={tx('مستويات المخزون', 'Stock levels')} rows={rows} columns={columns} rowKey={(r) => r.key}
        selected={selected} onSelect={onSelect ? (k, on) => { if (!rows.find((r) => r.key === k)?.unstocked) onSelect(k, on); } : undefined}
        card={(r) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2"><SkuCell sku={r.sku} info={r.info} sub={LOCATIONS[r.loc][lang]} /></div>
            <dl className="grid grid-cols-4 gap-2 rounded-xl bg-surface-2 p-2 text-center text-xs">
              {([[tx('موجود', 'On hand'), r.onHand], [tx('متاح', 'Available'), avail(r)], [tx('محجوز', 'Reserved'), r.reserved], [tx('موقوف', 'Held'), held(r)]] as const).map(([l, v]) => <div key={l}><dt className="text-muted">{l}</dt><dd className="mt-0.5 font-semibold tabular-nums text-fg">{v}</dd></div>)}
            </dl>
            {!r.unstocked && r.onHand > 0 && r.available !== r.onHand && <CompositionBar b={r.states} />}
            {(r.incoming > 0 || r.states.outgoing > 0) && <p className="text-xs text-muted">{[r.incoming > 0 && tx(`وارد ${r.incoming}`, `Incoming ${r.incoming}`), r.states.outgoing > 0 && tx(`صادر ${r.states.outgoing}`, `Outgoing ${r.states.outgoing}`)].filter(Boolean).join(' · ')}</p>}
            <div className="flex flex-wrap gap-2">
              {onAdjust && <Button variant="secondary" size="sm" className="flex-1" onClick={() => onAdjust(r)}><SlidersHorizontal className="size-3.5" aria-hidden="true" />{r.unstocked ? tx('أدخل كمية', 'Add stock') : tx('عدّل الكمية', 'Adjust quantity')}</Button>}
              {!r.unstocked && statesBtn(r, true)}
              {onThreshold && !r.unstocked && <Button variant="ghost" size="sm" onClick={() => onThreshold(r)}><Gauge className="size-3.5" aria-hidden="true" />{tx(`الحد ${r.threshold}`, `Reorder ${r.threshold}`)}</Button>}
            </div>
          </div>
        )} />
    </div>
  );
}

function LowList({ rows, levels, canTransfer, onThreshold }: { rows: LevelRow[]; levels: Level[]; canTransfer: boolean; onThreshold?: (l: Level) => void }) {
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
              {onThreshold ? <button type="button" onClick={() => onThreshold(r)} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx(`حد إعادة الطلب ${r.threshold} · عدّل`, `Reorder point ${r.threshold} · edit`)}</button> : <span>{tx(`حد إعادة الطلب ${r.threshold}`, `Reorder point ${r.threshold}`)}</span>}
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
  const sn = useStateNames();
  const delta = (x: StockLog) => <bdi dir="ltr" className={cn('font-bold tabular-nums', x.delta > 0 ? 'text-emerald-700 dark:text-emerald-400' : x.delta < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted')}>{x.delta > 0 ? '+' : ''}{x.delta}</bdi>;
  const columns: Column<StockLog & { info: SkuInfo }>[] = [
    { key: 'p', header: tx('المنتج', 'Product'), cell: (x) => <SkuCell sku={x.sku} info={x.info} sub={LOCATIONS[x.loc][lang]} />, className: 'max-w-80' },
    { key: 'd', header: tx('التغيير', 'Change'), align: 'end', cell: delta },
    { key: 'ba', header: tx('قبل ← بعد', 'Before → after'), align: 'end', cell: (x) => <bdi dir="ltr" className="tabular-nums text-muted">{x.before} → {x.after}</bdi>, hideBelow: 'md' },
    { key: 'r', header: tx('السبب', 'Reason'), cell: (x) => <span><span className="block text-fg">{x.state ? sn.move(x.state.move) : names.reason(x.reason)}</span>{x.state && <span className="block text-xs text-muted">{x.state.qty} · {sn.label(x.state.from)} {tx('←', '→')} {sn.label(x.state.to)} · {sn.reason(x.state.reason)}</span>}{x.note && <span className="block max-w-56 truncate text-xs text-muted">{x.note}</span>}</span> },
    { key: 'w', header: tx('بواسطة', 'By'), cell: (x) => <span className="text-muted">{x.who === 'You' ? tx('أنت', 'You') : x.who}</span>, hideBelow: 'lg' },
    { key: 'id', header: tx('المرجع', 'Ref'), cell: (x) => x.ref ? <a className="font-medium text-brand-700 hover:underline dark:text-brand-300" href={ihref(`transfers/${x.ref}`)}><Ref>{x.id}</Ref></a> : <span className="text-xs text-muted"><Ref>{x.id}</Ref></span>, hideBelow: 'lg' },
  ];
  return (
    <div className="border-t border-border">
      <DataTable label={tx('سجل حركة المخزون', 'Stock movement log')} rows={rows} columns={columns} rowKey={(x) => x.id}
        card={(x) => (
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-2"><SkuCell sku={x.sku} info={x.info} />{delta(x)}</div>
            <p className="text-xs text-muted">{x.state ? `${sn.move(x.state.move)} (${x.state.qty})` : names.reason(x.reason)} · {LOCATIONS[x.loc][lang]} · <bdi dir="ltr">{x.before} → {x.after}</bdi> · <Ref>{x.id}</Ref></p>
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
  const current = levelOf(levels, level.sku, level.loc) ?? level;
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
    // A SKU not yet stocked at this location gets its record now (version 0), so the first quantity is logged like any other.
    const base = levelOf(levelsStore.get(), level.sku, level.loc) ? levelsStore.get()
      : [...levelsStore.get(), { sku: level.sku, loc: level.loc, onHand: 0, reserved: 0, incoming: 0, version: 0, threshold: 3 }];
    const r = adjust(base, level.sku, level.loc, pv.delta!, reason, seen.version, 'You', id, note.trim());
    if (r.error === 'conflict') { setConflict(r.current!); return; }
    if (r.error) return;
    levelsStore.set(r.levels);
    stockLogStore.set((lg) => [r.log!, ...lg]);
    logAction('inventory', { ar: `عدّل الكمية في ${LOCATIONS[level.loc].ar}: ${names.reason(reason)}`, en: `Adjusted stock at ${LOCATIONS[level.loc].en}: ${names.reason(reason)}` }, { target: `${level.sku} · ${id}`, before: String(r.log!.before), after: String(r.log!.after) });
    toast(r.oversold
      ? { tone: 'bad', text: tx(`سُجل ${id}. الموجود أقل من المحجوز: قد لا تكفي القطع للطلبات المدفوعة.`, `Logged ${id}. On hand is below reserved: paid orders may not be covered.`) }
      : { tone: 'ok', text: tx(`سُجل التعديل ${id}`, `Adjustment ${id} logged`) });
    onClose();
  };

  return (
    <Modal title={tx('تعديل الكمية', 'Adjust quantity')} onClose={onClose}
      description={<>{info.name[lang]}{info.variant[lang] && ` · ${info.variant[lang]}`} · {LOCATIONS[level.loc][lang]}</>}
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

/** Alerts raised for low stock: delivered to the merchant's alert channel (simulated), one per crossing, resolved once restocked. */
function AlertLog({ info }: { info: Map<string, SkuInfo> }) {
  const tx = useTx();
  const { lang } = useLang();
  const alerts = stockAlertsStore.use();
  const shown = alerts.slice(0, 8);
  if (!alerts.length) return null;
  const time = (a: StockAlertEntry) => (a.at ? new Date(a.at).toLocaleTimeString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : tx('سابقًا', 'Earlier'));
  return (
    <section aria-labelledby="inv-alerts" className="border-t border-border">
      <h2 id="inv-alerts" className="flex items-center gap-2 px-4 pt-4 text-sm font-bold text-fg sm:px-5"><BellRing className="size-4 text-muted" aria-hidden="true" />{tx('سجل التنبيهات', 'Alert log')}<Simulated /></h2>
      <ul className="divide-y divide-border px-4 py-2 sm:px-5">
        {shown.map((a) => {
          const i = infoFor(info, a.sku);
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px]">
              <span className="min-w-0 flex-1 truncate text-fg"><span className="font-semibold">{i.name[lang]}</span>{i.variant[lang] && <span className="text-muted"> · {i.variant[lang]}</span>} <span className="text-muted">· {LOCATIONS[a.loc][lang]}</span></span>
              <span className="text-xs text-muted tabular-nums">{tx(`المتاح ${a.available} ≤ ${a.threshold}`, `Available ${a.available} ≤ ${a.threshold}`)}</span>
              <Badge tone={a.status === 'sent' ? 'amber' : 'green'}>{a.status === 'sent' ? tx('أُرسل بالبريد', 'Sent by email') : tx('عاد المخزون', 'Restocked')}</Badge>
              <span className="w-14 text-end text-xs text-subtle tabular-nums">{time(a)}</span>
            </li>
          );
        })}
      </ul>
      {alerts.length > shown.length && <p className="px-4 pb-3 text-xs text-muted sm:px-5">{tx(`تنبيهات أقدم: ${alerts.length - shown.length}`, `Older alerts: ${alerts.length - shown.length}`)}</p>}
    </section>
  );
}
