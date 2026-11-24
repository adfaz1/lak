import { useMemo, useState } from 'react';
import type { Route } from '../../core/router';
import { navigate } from '../../core/router';
import { Alert, Badge, Dialog, Field, LinkTabs, PageHeader, type Tone } from '../../core/ui';
import { LOCATIONS, LOC_IDS, type LocId } from './domain';
import { skusOf } from './catalog';
import {
  ADJ_REASONS, adjust, available, bumpBySomeoneElse, closeWithDiscrepancy, coverage, historyFixtures, levelOf, lowStock, receiveTransfer, sendTransfer,
  validateTransferDraft, type AdjReason, type Level, type LogReason, type StockLog, type Transfer, type TransferStatus,
} from './inventory';
import { can } from './perms';
import { levelsStore, productsStore, stockLogStore, testStore, transfersStore } from './stores';
import { ActionLocked, DataTable, KV, Pager, mhref, mreplace, useL, useTx, type Col } from './kit';

const HISTORY = historyFixtures();
const T_TONE: Record<TransferStatus, Tone> = { draft: 'neutral', sent: 'info', partial: 'warning', received: 'success', closed: 'warning' };

function useNames() {
  const tx = useTx();
  const l = useL();
  const products = productsStore.use();
  const map = useMemo(() => {
    const m = new Map<string, string>();
    products.forEach((p) => skusOf(p).forEach((s) => { const v = p.variants.find((x) => x.sku === s); m.set(s, v ? `${l(p.name)} — ${[v.color, v.size].filter(Boolean).join(' / ')}` : l(p.name)); }));
    return m;
  }, [products, l]);
  return {
    name: (sku: string) => map.get(sku) ?? sku,
    reason: (r: LogReason) => ({ received: tx('استلام من مورد', 'Received from supplier'), count: tx('تصحيح جرد', 'Count correction'), damaged: tx('تالف', 'Damaged'), returned: tx('مرتجع من عميل', 'Customer return'),
      other: tx('أخرى', 'Other'), transferOut: tx('تحويل صادر', 'Transfer out'), transferIn: tx('تحويل وارد', 'Transfer in'), discrepancy: tx('فرق تحويل', 'Transfer discrepancy'), fulfilled: tx('تجهيز طلب', 'Order fulfilled') })[r],
    status: (s: TransferStatus) => ({ draft: tx('مسودة', 'Draft'), sent: tx('مُرسل', 'Sent'), partial: tx('استلام جزئي', 'Partly received'), received: tx('مستلم بالكامل', 'Fully received'), closed: tx('مغلق بفرق', 'Closed with discrepancy') })[s],
  };
}

export function InventoryPage({ route }: { route: Route }) {
  if (route.path[1] === 'transfers' && route.path[2]) return <TransferDetail id={route.path[2]} />;
  return <InventoryTabs route={route} />;
}

function InventoryTabs({ route }: { route: Route }) {
  const tx = useTx();
  const tab = route.query.get('tab') ?? 'levels';
  const levels = levelsStore.use();
  const transfers = transfersStore.use();
  const items = [
    { id: 'levels', label: tx('المستويات', 'Levels') },
    { id: 'low', label: `${tx('النواقص', 'Low stock')} · ${lowStock(levels).length}` },
    { id: 'transfers', label: `${tx('التحويلات', 'Transfers')} · ${transfers.filter((t) => t.status !== 'received' && t.status !== 'closed').length}` },
    { id: 'log', label: tx('سجل الحركة', 'Movement log') },
  ];
  return (
    <>
      <PageHeader title={tx('المخزون', 'Inventory')} sub={tx('مستودعان: الرياض وجدة. كل تعديل يحتاج سببًا ويُسجّل.', 'Two warehouses: Riyadh and Jeddah. Every change needs a reason and is logged.')} />
      <LinkTabs label={tx('أقسام المخزون', 'Inventory sections')} items={items.map((i) => ({ href: mhref('inventory', { tab: i.id === 'levels' ? undefined : i.id }), label: i.label, current: tab === i.id }))} />
      {tab === 'levels' && <Levels route={route} />}
      {tab === 'low' && <Low />}
      {tab === 'transfers' && <Transfers />}
      {tab === 'log' && <Log />}
    </>
  );
}

function Definitions() {
  const tx = useTx();
  return (
    <details className="card m-defs">
      <summary>{tx('تعريفات الأرقام', 'What the numbers mean')}</summary>
      <KV rows={[
        [tx('الموجود', 'On hand'), tx('وحدات موجودة فعليًا في الموقع.', 'Units physically at the location.')],
        [tx('المحجوز', 'Reserved'), tx('وحدات محجوزة لطلبات مدفوعة لم تُجهّز.', 'Units held for paid orders not yet fulfilled.')],
        [tx('المتاح', 'Available'), tx('الموجود − المحجوز. هذا ما يمكن بيعه.', 'On hand − reserved. This is what can be sold.')],
        [tx('الوارد', 'Incoming'), tx('في تحويل مُرسل لم يُستلم. لا يُباع تلقائيًا.', 'In a sent transfer, not yet received. Never sold automatically.')],
      ]} />
    </details>
  );
}

function Levels({ route }: { route: Route }) {
  const tx = useTx();
  const l = useL();
  const names = useNames();
  const levels = levelsStore.use();
  const role = testStore.use().role;
  const q = route.query.get('q') ?? '';
  const lq = route.query.get('loc') as LocId | null;
  const loc = lq && LOC_IDS.includes(lq) ? lq : null;
  const rows = levels.filter((x) => (!loc || x.loc === loc) && (!q || x.sku.toLowerCase().includes(q.toLowerCase()) || names.name(x.sku).toLowerCase().includes(q.toLowerCase())));
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const page = Math.min(pages, Math.max(1, Number(route.query.get('page')) || 1));
  const pageRows = rows.slice((page - 1) * 25, page * 25);
  const [adj, setAdj] = useState<Level | null>(null);
  const qs = (o: Record<string, string | undefined>) => ({ q: q || undefined, loc: loc ?? undefined, ...o });
  const canAdj = can(role, 'inventory.adjust');
  const cols: Col<Level>[] = [
    { key: 'p', head: tx('المنتج', 'Product'), cell: (x) => <>{names.name(x.sku)}<div className="small muted"><bdi dir="ltr">{x.sku}</bdi></div></> },
    { key: 'loc', head: tx('الموقع', 'Location'), cell: (x) => l(LOCATIONS[x.loc]) },
    { key: 'oh', head: tx('الموجود', 'On hand'), end: true, cell: (x) => <bdi>{x.onHand}</bdi> },
    { key: 'rs', head: tx('المحجوز', 'Reserved'), end: true, cell: (x) => <bdi>{x.reserved}</bdi> },
    { key: 'av', head: tx('المتاح', 'Available'), end: true, cell: (x) => <span className={available(x) <= x.threshold ? 'm-warn strong' : 'strong'}><bdi>{available(x)}</bdi></span> },
    { key: 'in', head: tx('الوارد', 'Incoming'), end: true, cell: (x) => <bdi>{x.incoming}</bdi> },
    { key: 'a', head: tx('إجراء', 'Action'), srHead: true, end: true, cell: (x) => canAdj && <button type="button" className="btn small" onClick={() => setAdj(x)}>{tx('تعديل', 'Adjust')}</button> },
  ];
  return (
    <>
      <Definitions />
      <div className="toolbar">
        <div className="m-row-fields">
          <input className="input search" type="search" aria-label={tx('بحث بالمنتج أو SKU', 'Search product or SKU')} placeholder={tx('ابحث بالمنتج أو SKU', 'Search product or SKU')} value={q} onChange={(e) => mreplace('inventory', qs({ q: e.target.value || undefined }))} />
          <label className="sr" htmlFor="inv-loc">{tx('الموقع', 'Location')}</label>
          <select id="inv-loc" className="input" value={loc ?? ''} onChange={(e) => mreplace('inventory', qs({ loc: e.target.value || undefined }))}>
            <option value="">{tx('كل المواقع', 'All locations')}</option>{LOC_IDS.map((x) => <option key={x} value={x}>{l(LOCATIONS[x])}</option>)}
          </select>
        </div>
        {!canAdj && <ActionLocked>{tx('دورك لا يشمل تعديل المخزون.', 'Your role does not include adjusting stock.')}</ActionLocked>}
      </div>
      {adj && <AdjustPanel key={`${adj.sku}-${adj.loc}`} level={adj} onClose={() => setAdj(null)} />}
      <div className="card">
        <DataTable label={tx('مستويات المخزون', 'Stock levels')} cols={cols} rows={pageRows} rowKey={(x) => `${x.sku}-${x.loc}`}
          mobile={(x) => (
            <div className="m-rowcard-main">
              <span className="m-rowcard-top"><span className="strong">{names.name(x.sku)}</span><span className="strong">{tx(`متاح ${available(x)}`, `${available(x)} available`)}</span></span>
              <span className="small muted"><bdi dir="ltr">{x.sku}</bdi> · {l(LOCATIONS[x.loc])}</span>
              <span className="small">{tx(`موجود ${x.onHand} · محجوز ${x.reserved} · وارد ${x.incoming}`, `On hand ${x.onHand} · reserved ${x.reserved} · incoming ${x.incoming}`)}</span>
              {canAdj && <button type="button" className="btn small" onClick={() => setAdj(x)}>{tx('تعديل', 'Adjust')}</button>}
            </div>
          )}
          empty={<div className="empty"><span>{tx('لا نتائج.', 'No results.')}</span><a className="btn" href={mhref('inventory')}>{tx('مسح التصفية', 'Clear filters')}</a></div>} />
      </div>
      <div className="toolbar"><p className="small muted">{tx(`${rows.length} صفًا`, `${rows.length} rows`)}</p><Pager page={page} pages={pages} hrefFor={(p) => mhref('inventory', qs({ page: p > 1 ? String(p) : undefined }))} /></div>
    </>
  );
}

function AdjustPanel({ level, onClose }: { level: Level; onClose: () => void }) {
  const tx = useTx();
  const l = useL();
  const names = useNames();
  const levels = levelsStore.use();
  const cur = levelOf(levels, level.sku, level.loc)!;
  const [seenVersion, setSeenVersion] = useState(level.version);
  const [seen, setSeen] = useState(level);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState<AdjReason | ''>('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Level | null>(null);
  const [done, setDone] = useState<{ msg: string; warn: boolean } | null>(null);
  const d = Number(delta.replace('+', ''));
  const after = seen.onHand + (Number.isFinite(d) ? d : 0);
  const submit = () => {
    const id = `ADJ-${202 + stockLogStore.get().length}`;
    const r = adjust(levelsStore.get(), level.sku, level.loc, d, reason, seenVersion, 'You', id, note);
    if (r.error === 'conflict') { setConflict(r.current!); return; }
    if (r.error) {
      setErr(({ reason: tx('اختر سببًا.', 'Choose a reason.'), zero: tx('أدخل تغييرًا صحيحًا غير صفري، مثل +5 أو -2.', 'Enter a non-zero whole change, e.g. +5 or -2.'), belowZero: tx('لا يمكن أن يصبح الموجود أقل من صفر.', 'On hand cannot go below zero.'), notFound: '', conflict: '' } as Record<string, string>)[r.error]);
      return;
    }
    levelsStore.set(r.levels);
    stockLogStore.set((lg) => [r.log!, ...lg]);
    setDone({ warn: !!r.oversold, msg: r.oversold ? tx(`سُجل ${id}. تنبيه: الموجود أصبح أقل من المحجوز؛ قد لا تكفي الوحدات للطلبات المدفوعة.`, `Logged ${id}. Warning: on hand is now below reserved; paid orders may not be covered.`) : tx(`سُجل التعديل ${id}.`, `Adjustment ${id} logged.`) });
  };
  return (
    <section className="card pad" aria-labelledby="adj-h">
      <h2 id="adj-h">{tx('تعديل مخزون', 'Adjust stock')}: {names.name(level.sku)} · {l(LOCATIONS[level.loc])}</h2>
      {done ? <><Alert tone={done.warn ? 'warning' : 'success'}>{done.msg}</Alert><button type="button" className="btn" onClick={onClose}>{tx('إغلاق', 'Close')}</button></> : (
        <>
          <p className="small">{tx(`عند الفتح: موجود ${seen.onHand}، محجوز ${seen.reserved}، متاح ${available(seen)}.`, `When opened: on hand ${seen.onHand}, reserved ${seen.reserved}, available ${available(seen)}.`)}</p>
          {conflict && (
            <Alert tone="warning" title={tx('تغيّر هذا المستوى بعد أن فتحته.', 'This level changed after you opened it.')}>
              {tx(`عدّله شخص آخر: الموجود الآن ${conflict.onHand}. لم نكتب فوق تعديله. راجع تغييرك على القيمة الجديدة ثم أرسل.`, `Someone else changed it: on hand is now ${conflict.onHand}. We did not overwrite their change. Review your change against the new value, then submit.`)}
              <div className="actions m-mt"><button type="button" className="btn" onClick={() => { setSeen(conflict); setSeenVersion(conflict.version); setConflict(null); }}>{tx('استخدم القيم الحالية', 'Use the current values')}</button></div>
            </Alert>
          )}
          <div className="m-row-fields">
            <Field id="adj-d" label={tx('التغيير (+ أو −)', 'Change (+ or −)')}><input id="adj-d" className="input m-qty" dir="ltr" inputMode="numeric" value={delta} onChange={(e) => { setDelta(e.target.value); setErr(null); }} /></Field>
            <Field id="adj-r" label={tx('السبب', 'Reason')}>
              <select id="adj-r" className="input" value={reason} onChange={(e) => { setReason(e.target.value as AdjReason); setErr(null); }}>
                <option value="">{tx('اختر…', 'Choose…')}</option>{ADJ_REASONS.map((r) => <option key={r} value={r}>{names.reason(r)}</option>)}
              </select>
            </Field>
            <Field id="adj-n" label={tx('ملاحظة (اختياري)', 'Note (optional)')}><input id="adj-n" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
          {Number.isInteger(d) && d !== 0 && <p className="small">{tx(`الموجود ${seen.onHand} ← ${after} · المتاح ${available(seen)} ← ${after - seen.reserved}`, `On hand ${seen.onHand} → ${after} · available ${available(seen)} → ${after - seen.reserved}`)}</p>}
          {err && <p className="error" role="alert">{err}</p>}
          <div className="actions">
            <button type="button" className="btn primary" onClick={submit}>{tx('سجّل التعديل', 'Record adjustment')}</button>
            <button type="button" className="btn" onClick={onClose}>{tx('إلغاء', 'Cancel')}</button>
          </div>
          <div className="m-simtools"><span className="small muted">{tx('أداة اختبار:', 'Test tool:')}</span>
            <button type="button" className="btn small" onClick={() => levelsStore.set((ls) => bumpBySomeoneElse(ls, level.sku, level.loc, 3))}>{tx('حاكِ تعديل زميل الآن (+3)', 'Simulate a colleague’s change now (+3)')}</button>
            <span className="small muted">{tx(`الإصدار الحالي ${cur.version}`, `Current version ${cur.version}`)}</span></div>
        </>
      )}
    </section>
  );
}

function Low() {
  const tx = useTx();
  const l = useL();
  const names = useNames();
  const levels = levelsStore.use();
  const rows = lowStock(levels);
  return (
    <section className="card" aria-labelledby="low-h">
      <div className="card-head"><h2 id="low-h">{tx('عند حد التنبيه أو أقل', 'At or below the alert threshold')}</h2></div>
      {rows.length === 0 ? <div className="card-body"><p>{tx('لا مواقع عند حد التنبيه.', 'No locations at the alert threshold.')}</p></div> : (
        <ul className="queue">
          {rows.map((x) => {
            const total = levels.filter((y) => y.sku === x.sku).reduce((s, y) => s + available(y), 0);
            const c = coverage(total, HISTORY.find((h) => h.sku === x.sku));
            return (
              <li key={`${x.sku}-${x.loc}`}>
                <b className="n">{available(x)}</b>
                <div className="grow">
                  <div className="strong">{names.name(x.sku)} · {l(LOCATIONS[x.loc])}</div>
                  <div className="small muted"><bdi dir="ltr">{x.sku}</bdi> · {tx(`حد التنبيه ${x.threshold}`, `Threshold ${x.threshold}`)} · {c.kind === 'days' ? tx(`تغطية تقديرية لكل المواقع ${c.days} يوم (≈${c.perDay}/يوم)`, `Est. cover across locations ${c.days} days (≈${c.perDay}/day)`) : c.kind === 'noSales' ? tx('لا مبيعات في الفترة؛ لا تقدير تغطية', 'No sales in the period; no cover estimate') : tx('سجل غير كافٍ (أقل من 14 يومًا) لتقدير التغطية', 'Not enough history (under 14 days) to estimate cover')}</div>
                </div>
                <a className="btn" href={mhref('inventory/transfers/new', { sku: x.sku, to: x.loc })}>{tx('مسودة تحويل', 'Draft a transfer')}</a>
              </li>
            );
          })}
        </ul>
      )}
      <div className="card-body"><p className="small muted">{tx('اقتراح الشراء يبقى اقتراحًا حتى يتوفر إجراء شراء فعلي.', 'Reorder suggestions stay suggestions until a real purchasing action exists.')}</p></div>
    </section>
  );
}

function Transfers() {
  const tx = useTx();
  const l = useL();
  const names = useNames();
  const transfers = transfersStore.use();
  const role = testStore.use().role;
  return (
    <section className="card" aria-labelledby="tr-h">
      <div className="card-head"><h2 id="tr-h">{tx('تحويلات بين المواقع', 'Transfers between locations')}</h2>
        {can(role, 'inventory.transfer') ? <a className="btn primary" href={mhref('inventory/transfers/new')}>{tx('مسودة تحويل جديدة', 'New transfer draft')}</a> : <ActionLocked>{tx('دورك لا يشمل التحويلات.', 'Your role does not include transfers.')}</ActionLocked>}</div>
      {transfers.length === 0 ? <div className="card-body"><p>{tx('لا تحويلات بعد.', 'No transfers yet.')}</p></div> : (
        <ul className="queue">
          {transfers.map((t) => (
            <li key={t.id}>
              <div className="grow"><div className="strong"><bdi dir="ltr">{t.id}</bdi> · {l(LOCATIONS[t.from])} ← {l(LOCATIONS[t.to])}</div>
                <div className="small muted">{t.lines.map((x) => `${names.name(x.sku)} × ${x.qty}`).join(' · ')}</div></div>
              <Badge tone={T_TONE[t.status]}>{names.status(t.status)}</Badge>
              <a className="btn small" href={mhref(`inventory/transfers/${t.id}`)}>{tx('فتح', 'Open')}</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Log() {
  const tx = useTx();
  const l = useL();
  const names = useNames();
  const log = stockLogStore.use();
  const cols: Col<StockLog>[] = [
    { key: 'id', head: tx('المرجع', 'Ref'), cell: (x) => <bdi dir="ltr">{x.id}</bdi> },
    { key: 'p', head: tx('المنتج', 'Product'), cell: (x) => <>{names.name(x.sku)}<div className="small muted">{l(LOCATIONS[x.loc])}</div></> },
    { key: 'd', head: tx('التغيير', 'Change'), end: true, cell: (x) => <bdi dir="ltr" className="strong">{x.delta > 0 ? '+' : ''}{x.delta}</bdi> },
    { key: 'ba', head: tx('قبل ← بعد', 'Before → after'), end: true, cell: (x) => <bdi dir="ltr">{x.before} → {x.after}</bdi> },
    { key: 'r', head: tx('السبب', 'Reason'), cell: (x) => <>{names.reason(x.reason)}{x.note && <div className="small muted">{x.note}</div>}</> },
    { key: 'w', head: tx('بواسطة', 'By'), cell: (x) => x.who },
  ];
  return (
    <div className="card">
      <DataTable label={tx('سجل حركة المخزون', 'Stock movement log')} cols={cols} rows={log} rowKey={(x) => x.id}
        mobile={(x) => <div className="m-rowcard-main"><span className="m-rowcard-top"><span className="strong">{names.name(x.sku)}</span><bdi dir="ltr" className="strong">{x.delta > 0 ? '+' : ''}{x.delta}</bdi></span><span className="small muted">{names.reason(x.reason)} · {l(LOCATIONS[x.loc])} · {x.who} · <bdi dir="ltr">{x.id}</bdi></span></div>}
        empty={<div className="empty">{tx('لا حركات بعد.', 'No movements yet.')}</div>} />
    </div>
  );
}

function TransferDetail({ id }: { id: string }) {
  const tx = useTx();
  const l = useL();
  const names = useNames();
  const transfers = transfersStore.use();
  const levels = levelsStore.use();
  const role = testStore.use().role;
  const isNew = id === 'new';
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const [draft, setDraft] = useState<Transfer>(() => {
    const t = transfers.find((x) => x.id === id);
    if (t) return t;
    const to = (params.get('to') as LocId) || 'ryd';
    return { id: `TR-${1003 + transfers.length}`, from: to === 'ryd' ? 'jed' : 'ryd', to, status: 'draft', note: '', discrepancy: [], lines: params.get('sku') ? [{ sku: params.get('sku')!, qty: 1, received: 0 }] : [] };
  });
  const [recv, setRecv] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<'send' | 'close' | null>(null);
  const [closeNote, setCloseNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [addSku, setAddSku] = useState('');
  const stored = transfers.find((x) => x.id === draft.id);
  const t = stored && stored.status !== 'draft' ? stored : draft;
  if (!isNew && !transfers.find((x) => x.id === id)) return <><a className="back" href={mhref('inventory', { tab: 'transfers' })}>{tx('العودة إلى التحويلات', 'Back to transfers')}</a><Alert tone="danger">{tx('لا يوجد تحويل بهذا المرجع.', 'No transfer with this reference.')}</Alert></>;
  const canT = can(role, 'inventory.transfer');
  const v = validateTransferDraft(levels, t);
  const persist = (next: Transfer) => transfersStore.set((ts) => (ts.some((x) => x.id === next.id) ? ts.map((x) => (x.id === next.id ? next : x)) : [next, ...ts]));
  const log = (entries: StockLog[]) => stockLogStore.set((lg) => [...entries, ...lg]);
  const skus = [...new Set(levels.map((x) => x.sku))];
  const errMsg = (e: string) => ({ empty: tx('أضف سطرًا بكمية واحدة على الأقل.', 'Add at least one line with a quantity.'), sameLoc: tx('المصدر والوجهة يجب أن يختلفا.', 'Source and destination must differ.'),
    insufficient: tx(`الكمية تتجاوز المتاح في المصدر: ${v.short.join(', ')}`, `Quantity exceeds what the source has available: ${v.short.join(', ')}`), qty: tx('كميات غير صالحة.', 'Invalid quantities.'), state: tx('الحالة لا تسمح بهذا الإجراء.', 'The state does not allow this.') } as Record<string, string>)[e];
  const send = () => {
    const r = sendTransfer(levelsStore.get(), t);
    setConfirm(null);
    if (r.error) { setErr(errMsg(r.error)); return; }
    levelsStore.set(r.levels);
    persist(r.transfer);
    log(r.transfer.lines.map((x, i) => { const lv = levelOf(r.levels, x.sku, t.from)!; return { id: `${t.id}-O${i}`, sku: x.sku, loc: t.from, delta: -x.qty, before: lv.onHand + x.qty, after: lv.onHand, reason: 'transferOut' as const, who: 'You', ref: t.id }; }));
    if (isNew) navigate(mhref(`inventory/transfers/${t.id}`));
  };
  const receive = () => {
    const q = t.lines.map((_, i) => Number(recv[i] || 0));
    const r = receiveTransfer(levelsStore.get(), t, q);
    if (r.error) { setErr(errMsg(r.error)); return; }
    levelsStore.set(r.levels);
    persist(r.transfer);
    log(t.lines.map((x, i) => ({ x, q: q[i], i })).filter((y) => y.q).map(({ x, q: n, i }) => { const lv = levelOf(r.levels, x.sku, t.to)!; return { id: `${t.id}-I${i}-${x.received + n}`, sku: x.sku, loc: t.to, delta: n, before: lv.onHand - n, after: lv.onHand, reason: 'transferIn' as const, who: 'You', ref: t.id }; }));
    setRecv([]);
    setErr(null);
  };
  const close = () => {
    const r = closeWithDiscrepancy(levelsStore.get(), t, closeNote);
    setConfirm(null);
    if (r.error) { setErr(errMsg(r.error)); return; }
    levelsStore.set(r.levels);
    persist(r.transfer);
  };
  const editable = t.status === 'draft' && canT;
  return (
    <>
      <a className="back" href={mhref('inventory', { tab: 'transfers' })}>{tx('العودة إلى التحويلات', 'Back to transfers')}</a>
      <div className="title-row"><h1>{tx('تحويل', 'Transfer')} <bdi dir="ltr">{t.id}</bdi></h1><Badge tone={T_TONE[t.status]}>{names.status(t.status)}</Badge></div>
      <p className="small muted">{tx('مسودة ← إرسال (تخرج من المصدر وتظهر «واردة») ← استلام جزئي أو كامل ← إغلاق الفرق بسبب.', 'Draft → send (leaves the source, shows as incoming) → partial or full receipt → close any discrepancy with a reason.')}</p>
      {!canT && <ActionLocked>{tx('دورك لا يشمل التحويلات؛ العرض للقراءة.', 'Your role does not include transfers; read-only.')}</ActionLocked>}
      {err && <Alert tone="danger">{err}</Alert>}
      <section className="card pad" aria-labelledby="trd-h">
        <h2 id="trd-h">{tx('المسار والأسطر', 'Route and lines')}</h2>
        <div className="m-row-fields">
          {(['from', 'to'] as const).map((k) => (
            <Field key={k} id={`tr-${k}`} label={k === 'from' ? tx('من', 'From') : tx('إلى', 'To')}>
              <select id={`tr-${k}`} className="input" value={t[k]} disabled={!editable} onChange={(e) => setDraft({ ...draft, [k]: e.target.value as LocId })}>{LOC_IDS.map((x) => <option key={x} value={x}>{l(LOCATIONS[x])}</option>)}</select>
            </Field>
          ))}
        </div>
        <div className="table-wrap">
          <table className="m-compact">
            <caption className="sr">{tx('أسطر التحويل', 'Transfer lines')}</caption>
            <thead><tr><th scope="col">{tx('المنتج', 'Product')}</th><th scope="col" className="end">{tx('متاح في المصدر', 'Available at source')}</th><th scope="col">{tx('الكمية', 'Qty')}</th><th scope="col" className="end">{tx('مستلم', 'Received')}</th>{(t.status === 'sent' || t.status === 'partial') && <th scope="col">{tx('استلم الآن', 'Receive now')}</th>}</tr></thead>
            <tbody>
              {t.lines.map((x, i) => {
                const lv = levelOf(levels, x.sku, t.from);
                return (
                  <tr key={x.sku}>
                    <td>{names.name(x.sku)}<div className="small muted"><bdi dir="ltr">{x.sku}</bdi></div></td>
                    <td className="end"><bdi>{lv ? available(lv) : 0}</bdi></td>
                    <td>{editable ? <input className="input m-qty" dir="ltr" inputMode="numeric" value={String(x.qty)} aria-label={tx(`كمية ${x.sku}`, `Quantity ${x.sku}`)} aria-invalid={v.short.includes(x.sku)}
                      onChange={(e) => setDraft({ ...draft, lines: draft.lines.map((y, j) => (j === i ? { ...y, qty: Number(e.target.value) || 0 } : y)) })} /> : <bdi>{x.qty}</bdi>}</td>
                    <td className="end"><bdi>{x.received}</bdi></td>
                    {(t.status === 'sent' || t.status === 'partial') && <td><input className="input m-qty" dir="ltr" inputMode="numeric" value={recv[i] ?? ''} placeholder={String(x.qty - x.received)} aria-label={tx(`استلام ${x.sku}`, `Receive ${x.sku}`)} disabled={!canT || x.qty === x.received}
                      onChange={(e) => { const n = [...recv]; n[i] = e.target.value; setRecv(n); }} /></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {editable && (
          <div className="m-row-fields">
            <Field id="tr-add" label={tx('أضف منتجًا', 'Add a product')}>
              <select id="tr-add" className="input" value={addSku} onChange={(e) => setAddSku(e.target.value)}>
                <option value="">{tx('اختر SKU…', 'Choose a SKU…')}</option>{skus.filter((s) => !t.lines.some((x) => x.sku === s)).slice(0, 200).map((s) => <option key={s} value={s}>{s} — {names.name(s)}</option>)}
              </select>
            </Field>
            <button type="button" className="btn" disabled={!addSku} onClick={() => { setDraft({ ...draft, lines: [...draft.lines, { sku: addSku, qty: 1, received: 0 }] }); setAddSku(''); }}>{tx('أضف السطر', 'Add line')}</button>
          </div>
        )}
        {t.status === 'closed' && <Alert tone="warning" title={tx('أُغلق بفرق:', 'Closed with a discrepancy:')}>{t.discrepancy.map((d) => `${names.name(d.sku)} × ${d.units}`).join(' · ')}{t.note && ` — ${t.note}`}</Alert>}
        <div className="actions">
          {editable && <button type="button" className="btn" onClick={() => { persist(draft); if (isNew) navigate(mhref(`inventory/transfers/${draft.id}`)); }}>{tx('احفظ المسودة', 'Save draft')}</button>}
          {editable && <button type="button" className="btn primary" onClick={() => { if (v.error) setErr(errMsg(v.error)); else { setErr(null); setConfirm('send'); } }}>{tx('أرسل التحويل', 'Send transfer')}</button>}
          {canT && (t.status === 'sent' || t.status === 'partial') && <button type="button" className="btn primary" onClick={receive}>{tx('سجّل الاستلام', 'Record receipt')}</button>}
          {canT && (t.status === 'sent' || t.status === 'partial') && <button type="button" className="btn" onClick={() => setConfirm('close')}>{tx('أغلق بفرق', 'Close with discrepancy')}</button>}
        </div>
      </section>
      {confirm === 'send' && (
        <Dialog title={tx('تأكيد إرسال التحويل', 'Confirm sending the transfer')} onClose={() => setConfirm(null)}
          footer={<><button type="button" className="btn primary" onClick={send}>{tx('أرسل', 'Send')}</button><button type="button" className="btn" onClick={() => setConfirm(null)}>{tx('إلغاء', 'Cancel')}</button></>}>
          <p>{tx(`ستخرج ${t.lines.reduce((s, x) => s + x.qty, 0)} وحدة من ${LOCATIONS[t.from].ar} فورًا وتظهر «واردة» في ${LOCATIONS[t.to].ar} حتى تُستلم.`, `${t.lines.reduce((s, x) => s + x.qty, 0)} units leave the ${LOCATIONS[t.from].en} now and show as incoming at the ${LOCATIONS[t.to].en} until received.`)}</p>
        </Dialog>
      )}
      {confirm === 'close' && (
        <Dialog title={tx('إغلاق التحويل بفرق', 'Close the transfer with a discrepancy')} onClose={() => setConfirm(null)}
          footer={<><button type="button" className="btn primary" disabled={!closeNote.trim()} onClick={close}>{tx('أغلق وسجّل الفرق', 'Close and record the discrepancy')}</button><button type="button" className="btn" onClick={() => setConfirm(null)}>{tx('إلغاء', 'Cancel')}</button></>}>
          <p>{tx('الوحدات غير المستلمة تُزال من «الوارد» وتُسجّل فرقًا. لا تعود إلى المصدر تلقائيًا.', 'Units not received are removed from incoming and recorded as a discrepancy. They do not return to the source automatically.')}</p>
          <Field id="tr-note" label={tx('السبب (مطلوب)', 'Reason (required)')}><input id="tr-note" className="input" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} /></Field>
        </Dialog>
      )}
    </>
  );
}
