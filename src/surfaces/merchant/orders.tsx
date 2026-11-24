import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../../core/lang';
import type { Route } from '../../core/router';
import { Alert, Badge, Dialog, Sim, type Tone } from '../../core/ui';
import {
  VIEWS, VIEW_IDS, bulkEligibility, runBulk, search, simBulkFails, total,
  type BulkAction, type Channel, type Ful, type Ineligible, type Order, type Pay, type Ship, type View,
} from './domain';
import { can } from './perms';
import { ordersStore, testStore } from './stores';
import { strings } from './i18n';
import { ActionLocked, DataTable, Money, Pager, Progress, mhref, mreplace, useL, useTx, type Col } from './kit';
import { OrderDetail } from './order';

export const PAY_TONE: Record<Pay, Tone> = { paid: 'success', failed: 'danger', partially_refunded: 'warning', refunded: 'neutral' };
export const FUL_TONE: Record<Ful, Tone> = { none: 'neutral', partial: 'warning', done: 'success' };
export const SHIP_TONE: Record<Ship, Tone> = { none: 'neutral', label: 'info', transit: 'info', delivered: 'success' };
const PAGE_SIZE = 25;
const CHANNELS: Channel[] = ['online', 'market', 'app'];

export function useChannelName() {
  const tx = useTx();
  return (c: Channel) => ({ online: tx('المتجر الإلكتروني', 'Online store'), market: tx('سوق لك', 'LAK marketplace'), app: tx('تطبيق المتجر', 'Store app') })[c];
}

export function OrdersPage({ route }: { route: Route }) {
  if (route.path[1]) return <OrderDetail route={route} />;
  return <OrdersList route={route} />;
}

function OrdersList({ route }: { route: Route }) {
  const tx = useTx();
  const l = useL();
  const { lang } = useLang();
  const t = strings[lang];
  const chName = useChannelName();
  const orders = ordersStore.use();
  const { role, failBulk } = testStore.use();
  const v = route.query.get('view') as View | null;
  const view: View = v && VIEW_IDS.includes(v) ? v : 'all';
  const q = route.query.get('q') ?? '';
  const chq = route.query.get('ch') as Channel | null;
  const ch = chq && CHANNELS.includes(chq) ? chq : undefined;
  const rows = useMemo(() => search(orders, view, q, ch), [orders, view, q, ch]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(route.query.get('page')) || 1));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const qs = (over: Record<string, string | undefined>) => ({ view: view !== 'all' ? view : undefined, q: q || undefined, ch, page: page > 1 ? String(page) : undefined, ...over });
  const canBulk = can(role, 'order.bulk');

  // Selection belongs to the current result set; changing view, search or channel clears it.
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [allMode, setAllMode] = useState(false);
  const scopeKey = `${view}|${q}|${ch ?? ''}`;
  const lastScope = useRef(scopeKey);
  useEffect(() => { if (lastScope.current !== scopeKey) { lastScope.current = scopeKey; setSel(new Set()); setAllMode(false); } }, [scopeKey]);
  const pageAll = pageRows.length > 0 && pageRows.every((o) => sel.has(o.ref));
  const togglePage = () => setSel((s) => { const n = new Set(s); pageRows.forEach((o) => (pageAll ? n.delete(o.ref) : n.add(o.ref))); return n; });
  const toggle = (ref: string) => { setAllMode(false); setSel((s) => { const n = new Set(s); if (n.has(ref)) n.delete(ref); else n.add(ref); return n; }); };
  const selected: Order[] = allMode ? rows : rows.filter((o) => sel.has(o.ref));

  const [action, setAction] = useState<BulkAction>('slips');
  const [review, setReview] = useState(false);
  const [job, setJob] = useState<{ action: BulkAction; queue: string[]; done: number; ok: string[]; failed: string[]; skipped: number; running: boolean } | null>(null);

  const start = (refs: string[], act: BulkAction, skipped: number) => {
    setReview(false);
    setJob({ action: act, queue: refs, done: 0, ok: [], failed: [], skipped, running: true });
  };
  useEffect(() => {
    if (!job?.running) return;
    const timer = setTimeout(() => {
      const chunk = job.queue.slice(job.done, job.done + 40);
      const r = runBulk(ordersStore.get(), chunk, job.action, failBulk ? simBulkFails : () => false);
      ordersStore.set(r.orders);
      const done = job.done + chunk.length;
      setJob({ ...job, done, ok: [...job.ok, ...r.ok], failed: [...job.failed, ...r.failed], skipped: job.skipped + r.skipped.length, running: done < job.queue.length });
    }, 120);
    return () => clearTimeout(timer);
  }, [job, failBulk]);

  const cols: Col<Order>[] = [
    ...(canBulk ? [{ key: 'sel', head: tx('تحديد', 'Select'), srHead: true, cell: (o: Order) => <input type="checkbox" className="m-cb" checked={allMode || sel.has(o.ref)} onChange={() => toggle(o.ref)} aria-label={tx(`تحديد الطلب ${o.ref}`, `Select order ${o.ref}`)} /> }] : []),
    { key: 'ref', head: t.cRef, cell: (o) => <><span className="strong"><bdi dir="ltr">#{o.ref}</bdi></span><div className="muted small">{t.age(o.hoursAgo)}</div></> },
    { key: 'cust', head: t.cCustomer, cell: (o) => <>{l(o.customer)}<div className="muted small">{l(o.city)}</div></> },
    { key: 'ch', head: tx('القناة', 'Channel'), cell: (o) => <span className="small">{chName(o.channel)}</span> },
    { key: 'pay', head: t.cPay, cell: (o) => <Badge tone={PAY_TONE[o.pay]}>{t.pay[o.pay]}</Badge> },
    { key: 'ful', head: t.cFul, cell: (o) => <Badge tone={FUL_TONE[o.ful]}>{t.ful[o.ful]}</Badge> },
    { key: 'ship', head: t.cShip, cell: (o) => <Badge tone={SHIP_TONE[o.ship]}>{t.ship[o.ship]}</Badge> },
    { key: 'total', head: t.cTotal, end: true, cell: (o) => <span className="strong"><Money v={total(o)} /></span> },
    { key: 'open', head: t.cAction, srHead: true, end: true, cell: (o) => <a className="btn small" href={mhref(`orders/${o.ref}`, qs({}))} aria-label={t.openOrder(`#${o.ref}`)}>{t.open}</a> },
  ];

  return (
    <>
      <div className="page-header"><div className="grow"><h1>{t.ordersTitle}</h1><p className="muted small">{tx('الحالات منفصلة: الدفع، التجهيز، الشحنة، الاسترداد.', 'States are separate: payment, fulfilment, shipment, refund.')}</p></div></div>
      <div className="views" role="group" aria-label={t.viewsLabel}>
        {VIEW_IDS.map((x) => (
          <a key={x} className="chip" href={mhref('orders', { view: x !== 'all' ? x : undefined, q: q || undefined, ch })} aria-current={view === x ? 'true' : undefined}>
            {t.views[x]} · <bdi>{orders.filter(VIEWS[x]).filter((o) => !ch || o.channel === ch).length}</bdi>
          </a>
        ))}
      </div>
      <div className="toolbar">
        <div className="m-row-fields">
          <input className="input search" type="search" aria-label={t.searchLabel} placeholder={t.searchPh} value={q} onChange={(e) => mreplace('orders', { ...qs({ q: e.target.value || undefined }), page: undefined })} />
          <label className="sr" htmlFor="o-ch">{tx('القناة', 'Channel')}</label>
          <select id="o-ch" className="input" value={ch ?? ''} onChange={(e) => mreplace('orders', { ...qs({ ch: e.target.value || undefined }), page: undefined })}>
            <option value="">{tx('كل القنوات', 'All channels')}</option>
            {CHANNELS.map((c) => <option key={c} value={c}>{chName(c)}</option>)}
          </select>
        </div>
        {!canBulk && <ActionLocked>{tx('دورك يعرض الطلبات للقراءة فقط؛ الإجراءات الجماعية غير متاحة.', 'Your role shows orders read-only; bulk actions are not available.')}</ActionLocked>}
      </div>

      {canBulk && (sel.size > 0 || allMode) && (
        <div className="m-bulkbar" role="region" aria-label={tx('إجراء جماعي', 'Bulk action')}>
          <span className="strong">{allMode ? tx(`كل النتائج محددة: ${rows.length} طلبًا`, `All ${rows.length} results selected`) : tx(`${selected.length} محدد`, `${selected.length} selected`)}</span>
          {!allMode && pageAll && rows.length > pageRows.length && (
            <button type="button" className="btn small" onClick={() => setAllMode(true)}>{tx(`حدد كل النتائج (${rows.length})`, `Select all ${rows.length} results`)}</button>
          )}
          {allMode && <button type="button" className="btn small" onClick={() => { setAllMode(false); setSel(new Set(pageRows.map((o) => o.ref))); }}>{tx(`حدد هذه الصفحة فقط (${pageRows.length})`, `Select this page only (${pageRows.length})`)}</button>}
          <span className="grow" />
          <label className="sr" htmlFor="o-act">{tx('الإجراء', 'Action')}</label>
          <select id="o-act" className="input" value={action} onChange={(e) => setAction(e.target.value as BulkAction)}>
            <option value="slips">{tx('طباعة قوائم التعبئة', 'Print packing slips')}</option>
            <option value="confirm">{tx('تأكيد الطلبات', 'Mark as confirmed')}</option>
          </select>
          <button type="button" className="btn primary" onClick={() => setReview(true)} disabled={job?.running}>{tx('مراجعة', 'Review')}</button>
          <button type="button" className="btn" onClick={() => { setSel(new Set()); setAllMode(false); }}>{tx('إلغاء التحديد', 'Clear selection')}</button>
        </div>
      )}

      {job && <BulkResult job={job} onRetry={() => start(job.failed, job.action, 0)} onClose={() => setJob(null)} />}

      <div className="card">
        {canBulk && pageRows.length > 0 && (
          <div className="m-selectpage">
            <label className="check"><input type="checkbox" checked={pageAll || allMode} onChange={() => { setAllMode(false); togglePage(); }} />
              {tx(`تحديد هذه الصفحة (${pageRows.length} من ${rows.length} نتيجة)`, `Select this page (${pageRows.length} of ${rows.length} results)`)}</label>
          </div>
        )}
        <DataTable label={t.ordersTitle} cols={cols} rows={pageRows} rowKey={(o) => o.ref}
          mobile={(o) => (
            <div className="m-rowcard-in">
              {canBulk && <input type="checkbox" className="m-cb" checked={allMode || sel.has(o.ref)} onChange={() => toggle(o.ref)} aria-label={tx(`تحديد الطلب ${o.ref}`, `Select order ${o.ref}`)} />}
              <a className="m-rowcard-main" href={mhref(`orders/${o.ref}`, qs({}))}>
                <span className="m-rowcard-top"><span className="strong"><bdi dir="ltr">#{o.ref}</bdi></span><span className="strong"><Money v={total(o)} /></span></span>
                <span className="small">{l(o.customer)} · <span className="muted">{t.age(o.hoursAgo)}</span></span>
                <span className="m-badges"><Badge tone={PAY_TONE[o.pay]}>{t.pay[o.pay]}</Badge><Badge tone={FUL_TONE[o.ful]}>{t.ful[o.ful]}</Badge><Badge tone={SHIP_TONE[o.ship]}>{t.ship[o.ship]}</Badge></span>
              </a>
            </div>
          )}
          empty={<div className="empty"><span>{t.noRows}</span><a className="btn" href={mhref('orders')}>{t.clear}</a></div>} />
      </div>
      <div className="toolbar">
        <p className="muted small" role="status">{tx(`${rows.length} نتيجة من ${orders.length} طلبًا تجريبيًا · ${PAGE_SIZE} في الصفحة`, `${rows.length} results of ${orders.length} demo orders · ${PAGE_SIZE} per page`)}</p>
        <Pager page={page} pages={pages} hrefFor={(p) => mhref('orders', qs({ page: p > 1 ? String(p) : undefined }))} />
      </div>

      {review && <BulkReview action={action} orders={selected} allMode={allMode} onClose={() => setReview(false)} onRun={(refs, skipped) => start(refs, action, skipped)} />}
    </>
  );
}

function BulkReview({ action, orders, allMode, onClose, onRun }: { action: BulkAction; orders: Order[]; allMode: boolean; onClose: () => void; onRun: (refs: string[], skipped: number) => void }) {
  const tx = useTx();
  const e = bulkEligibility(orders, action);
  const reason: Record<Ineligible, string> = {
    payNotConfirmed: tx('الدفع غير مؤكد', 'Payment not confirmed'), refunded: tx('مسترد كليًا أو جزئيًا', 'Refunded in full or part'),
    alreadyFulfilled: tx('اكتمل تجهيزه', 'Already fulfilled'), alreadyConfirmed: tx('مؤكد مسبقًا', 'Already confirmed'),
  };
  const name = action === 'slips' ? tx('طباعة قوائم التعبئة', 'Print packing slips') : tx('تأكيد الطلبات', 'Mark as confirmed');
  return (
    <Dialog title={tx(`مراجعة: ${name}`, `Review: ${name}`)} onClose={onClose}
      footer={<>
        <button type="button" className="btn primary" disabled={!e.eligible.length} onClick={() => onRun(e.eligible.map((o) => o.ref), e.ineligible)}>{tx(`نفّذ على ${e.eligible.length} طلبًا مؤهلًا (محاكاة)`, `Run on ${e.eligible.length} eligible orders (simulated)`)}</button>
        <button type="button" className="btn" onClick={onClose}>{tx('إلغاء', 'Cancel')}</button>
      </>}>
      <p>{allMode ? tx(`النطاق: كل نتائج العرض الحالي (${orders.length})، وليس هذه الصفحة فقط.`, `Scope: every result of the current view (${orders.length}), not just this page.`)
        : tx(`النطاق: ${orders.length} طلبًا محددًا يدويًا.`, `Scope: ${orders.length} orders selected by hand.`)}</p>
      <ul className="m-list">
        <li><span className="strong">{e.eligible.length}</span> {tx('مؤهل', 'eligible')}</li>
        <li><span className="strong">{e.ineligible}</span> {tx('غير مؤهل وسيُستبعد:', 'not eligible and will be skipped:')}
          {e.ineligible > 0 && <ul className="m-sublist">{(Object.keys(e.reasons) as Ineligible[]).map((r) => <li key={r}>{reason[r]}: <bdi>{e.reasons[r]}</bdi></li>)}</ul>}</li>
      </ul>
      <p className="muted small">{action === 'slips' ? tx('لا تكلفة. الطباعة لا تغيّر حالة الدفع أو الشحن.', 'No cost. Printing does not change payment or shipment state.') : tx('لا تكلفة. التأكيد لا يُصدر شحنات ولا يرسل رسالة للعميل.', 'No cost. Confirming issues no shipment and sends no customer message.')} <Sim /></p>
    </Dialog>
  );
}

function BulkResult({ job, onRetry, onClose }: { job: { action: BulkAction; queue: string[]; done: number; ok: string[]; failed: string[]; skipped: number; running: boolean }; onRetry: () => void; onClose: () => void }) {
  const tx = useTx();
  return (
    <section className="card m-job" aria-live="polite" aria-labelledby="job-h">
      <div className="card-head"><h2 id="job-h">{job.running ? tx('جارٍ التنفيذ…', 'Running…') : tx('نتيجة الإجراء الجماعي', 'Bulk action result')} <Sim /></h2>
        {!job.running && <button type="button" className="btn small" onClick={onClose}>{tx('إخفاء', 'Dismiss')}</button>}</div>
      <div className="card-body">
        <Progress value={job.done} max={job.queue.length} label={tx('التقدم', 'Progress')} />
        <ul className="m-tally">
          <li><Badge tone="success">{tx('نجح', 'Succeeded')}</Badge> <bdi>{job.ok.length}</bdi></li>
          <li><Badge tone="danger">{tx('فشل', 'Failed')}</Badge> <bdi>{job.failed.length}</bdi></li>
          <li><Badge>{tx('مُستبعد', 'Skipped')}</Badge> <bdi>{job.skipped}</bdi></li>
          <li><Badge tone="info">{tx('متبقٍ', 'Remaining')}</Badge> <bdi>{job.queue.length - job.done}</bdi></li>
        </ul>
        {!job.running && job.failed.length > 0 && (
          <Alert tone="warning" title={tx('نجاح جزئي.', 'Partial success.')}>
            {tx(`فشل ${job.failed.length} طلبًا: انتهت مهلة خدمة المستندات (محاكاة). إعادة المحاولة تشمل الفاشل فقط ولا تكرر الناجح.`, `${job.failed.length} orders failed: the document service timed out (simulated). Retrying covers failures only and never repeats successes.`)}
            <div className="actions m-mt"><button type="button" className="btn primary" onClick={onRetry}>{tx(`أعد محاولة الفاشل فقط (${job.failed.length})`, `Retry failed only (${job.failed.length})`)}</button></div>
            <p className="small m-mt">{tx('الفاشل: ', 'Failed: ')}{job.failed.slice(0, 12).map((r) => <a key={r} className="m-ref" href={mhref(`orders/${r}`)}><bdi dir="ltr">#{r}</bdi></a>)}{job.failed.length > 12 && '…'}</p>
          </Alert>
        )}
        {!job.running && job.failed.length === 0 && <Alert tone="success">{tx('اكتمل التنفيذ لكل الطلبات المؤهلة.', 'Completed for every eligible order.')}</Alert>}
        {!job.running && job.failed.length > 0 && <p className="small muted">{tx('لإيقاف الفشل المحاكى أطفئ الخيار في لوحة الاختبار.', 'To stop the simulated failures, turn the option off in the test panel.')}</p>}
      </div>
    </section>
  );
}
