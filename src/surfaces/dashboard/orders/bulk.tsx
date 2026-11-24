// Bulk actions: review eligibility, scope and cost, run with progress, report partial success, retry failures only.
// Labels are never issued twice: eligibility is re-checked per order on every attempt.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, MinusCircle, Printer } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { formatInt } from '../../../core/format';
import { navigate } from '../../../core/router';
import { ordersStore } from '../../merchant/stores';
import { simBulkFails, type Order } from '../../merchant/domain';
import { Alert, Modal, Simulated, Switch } from '../../../ds/kit';
import { Button, Money, Ref, useTx } from '../../../ds/ui';
import { chunks, labelsCost, opsEligibility, ordersCsv, runOpsBulk, type OpsBulk, type OpsIneligible } from './model';
import { ReviewOnly, applyEffects, ohref, useActor, useLabels } from './ui';
import { printHref } from './print-link';

export interface BulkOutcome { action: OpsBulk; ok: string[] }
type Phase = 'review' | 'running' | 'result';

/** Download text as a file (CSV). */
export function download(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BulkModal({ action, orders, allMatching, onClose }: { action: OpsBulk; orders: Order[]; allMatching: boolean; onClose: (o: BulkOutcome | null) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const L = useLabels();
  const who = useActor();
  // Frozen at review time: the counts describe what was reviewed.
  const [e] = useState(() => opsEligibility(orders, action));
  const [phase, setPhase] = useState<Phase>('review');
  const [simFail, setSimFail] = useState(false);
  const [queue, setQueue] = useState<string[][]>([]);
  const [step, setStep] = useState(0);
  const [total, setTotal] = useState(0);
  const [ok, setOk] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const attempt = useRef(1);
  const failsLabel = action === 'labels' ? tx('الناقل لم يستجب', 'The carrier did not respond') : tx('انتهت مهلة خدمة المستندات', 'The document service timed out');

  const start = (refs: string[]) => { setQueue(chunks(refs, 5)); setTotal(refs.length); setStep(0); setFailed([]); setPhase('running'); };
  useEffect(() => {
    if (phase !== 'running') return;
    if (step >= queue.length) { setPhase('result'); return; }
    const t = setTimeout(() => {
      // The simulated outage applies to the first attempt only; a retry recovers.
      const r = runOpsBulk(ordersStore.get(), queue[step], action, simFail && attempt.current === 1 ? simBulkFails : () => false, who, Date.now());
      ordersStore.set(r.orders);
      r.effects.forEach((x) => applyEffects(x.effects, who, x.ref, 'BL'));
      setOk((x) => [...x, ...r.ok]);
      setFailed((x) => [...x, ...r.failed]);
      setStep(step + 1);
    }, 120);
    return () => clearTimeout(t);
  }, [phase, step, queue, action, simFail, who]);

  const done = Math.min(total, queue.slice(0, step).reduce((s, c) => s + c.length, 0));
  const pct = total ? Math.round((done / total) * 100) : 0;
  const n = e.eligible.length;
  const name: Record<OpsBulk, string> = {
    slips: tx('طباعة قوائم التعبئة', 'Print packing slips'), confirm: tx('تأكيد الطلبات', 'Mark orders confirmed'), labels: tx('إصدار ملصقات الشحن', 'Issue shipping labels'),
    shipped: tx('تعليم «سُلّم للناقل»', 'Mark as shipped'), invoices: tx('طباعة الفواتير الضريبية', 'Print tax invoices'), export: tx('تصدير CSV', 'Export CSV'),
  };
  const go: Record<OpsBulk, string> = {
    slips: tx(`افتح ${formatInt(n)} قائمة للطباعة`, `Open ${formatInt(n)} slips to print`), confirm: tx(`أكّد ${formatInt(n)} طلبًا`, `Confirm ${formatInt(n)} orders`), labels: tx(`أصدر ${formatInt(n)} ملصقًا`, `Issue ${formatInt(n)} labels`),
    shipped: tx(`سجّل ${formatInt(n)} كمشحون`, `Mark ${formatInt(n)} shipped`), invoices: tx(`افتح ${formatInt(n)} فاتورة للطباعة`, `Open ${formatInt(n)} invoices to print`), export: tx(`نزّل ${formatInt(n)} طلبًا`, `Download ${formatInt(n)} orders`),
  };
  const note: Record<OpsBulk, ReactNode> = {
    slips: tx('تُفتح صفحة طباعة فيها القوائم (بلا أسعار للهدايا)، ويُسجّل الطبع في كل طلب.', 'Opens a print page with the slips (no prices on gifts); printing is logged on each order.'),
    confirm: tx('بلا تكلفة. لا يُصدر شحنة ولا يرسل رسالة للعميل. يمكن التراجع.', 'No cost. Issues no shipment and sends no message. Can be undone.'),
    labels: <>{tx('من المستودع الذي يحجز الطلب، بالناقل العادي ووزن 1.2 كجم. التكلفة التقديرية ', 'From the warehouse holding the order, standard carrier, 1.2 kg. Estimated cost ')}<Money v={labelsCost(n)} className="font-semibold text-fg" />{tx('. يخرج المخزون ويُطلق الحجز.', '. Stock leaves the shelf and the hold is released.')}</>,
    shipped: tx('للناقلين غير المربوطين. يرى العميل «في الطريق». لا رسالة تُرسل من هنا.', 'For carriers that are not connected. Customers see “in transit”. No message is sent from here.'),
    invoices: tx('تُفتح صفحة طباعة فيها كل الفواتير، ويُسجّل الطبع في كل طلب.', 'Opens a print page with every invoice; printing is logged on each order.'),
    export: tx('ملف CSV بترميز UTF-8. لا يتغير شيء في الطلبات.', 'A UTF-8 CSV file. Nothing changes on the orders.'),
  };
  const instant = action === 'export' || action === 'invoices' || action === 'slips';
  const runInstant = () => {
    const refs = e.eligible.map((o) => o.ref);
    if (action === 'export') { download(`orders-${new Date().toISOString().slice(0, 10)}.csv`, ordersCsv(e.eligible, lang, Date.now())); onClose({ action, ok: refs }); return; }
    onClose({ action, ok: refs });
    navigate(printHref(action === 'slips' ? 'slip' : 'invoice', refs));
  };
  const close = () => onClose(phase === 'review' ? null : { action, ok });

  const footer = phase === 'review' ? (
    <>
      <Button variant="secondary" onClick={() => onClose(null)}>{tx('إلغاء', 'Cancel')}</Button>
      <Button disabled={!n} onClick={() => (instant ? runInstant() : start(e.eligible.map((o) => o.ref)))}>{go[action]}</Button>
    </>
  ) : phase === 'running' ? (
    <span className="text-xs text-muted">{tx('يستغرق ثوانٍ؛ أبقِ النافذة مفتوحة.', 'Takes a few seconds; keep this open.')}</span>
  ) : (
    <>
      {action === 'labels' && ok.length > 0 && <Button variant="secondary" onClick={() => { const refs = ok; onClose({ action, ok }); navigate(printHref('label', refs)); }}><Printer className="size-4" aria-hidden="true" />{tx('اطبع الملصقات', 'Print labels')}</Button>}
      <Button variant={failed.length ? 'secondary' : 'primary'} onClick={close}>{failed.length ? tx('إغلاق', 'Close') : tx('تم', 'Done')}</Button>
      {failed.length > 0 && <Button onClick={() => { attempt.current += 1; start(failed); }}>{tx(`أعد محاولة الفاشل فقط (${failed.length})`, `Retry failed only (${failed.length})`)}</Button>}
    </>
  );

  return (
    <Modal size="lg" title={phase === 'review' ? name[action] : phase === 'running' ? tx('جارٍ التنفيذ…', 'Running…') : tx('النتيجة', 'Result')} onClose={phase === 'running' ? () => undefined : close} footer={footer}
      description={phase === 'review' ? (allMatching
        ? tx(`النطاق: كل النتائج المطابقة (${formatInt(orders.length)})، لا هذه الصفحة فقط.`, `Scope: all ${formatInt(orders.length)} matching results, not just this page.`)
        : tx(`النطاق: ${formatInt(orders.length)} طلبات حددتها في هذه الصفحة.`, `Scope: the ${formatInt(orders.length)} ${orders.length === 1 ? 'order' : 'orders'} you selected on this page.`)) : undefined}>
      {phase === 'review' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-fg"><CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />{tx('مؤهل وسيُنفَّذ', 'Eligible, will run')}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-fg">{formatInt(n)}</p>
              {n > 0 && <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">{e.eligible.slice(0, 4).map((o) => <Ref key={o.ref}>#{o.ref}</Ref>)}{n > 4 && <span>+{formatInt(n - 4)}</span>}</p>}
            </div>
            <div className="rounded-xl border border-border bg-surface-2/50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-fg"><MinusCircle className="size-4 text-muted" aria-hidden="true" />{tx('غير مؤهل وسيُستبعد', 'Not eligible, skipped')}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-fg">{formatInt(e.ineligible)}</p>
              {e.ineligible > 0 && (
                <ul className="!mt-2 space-y-1.5">
                  {(Object.keys(e.reasons) as OpsIneligible[]).map((r) => (
                    <li key={r} className="text-xs">
                      <span className="flex justify-between gap-2"><span className="text-fg">{L.skip(r)}</span><b className="tabular-nums">{formatInt(e.reasons[r] ?? 0)}</b></span>
                      <span className="flex flex-wrap gap-x-2 text-muted">{e.samples[r]?.map((ref) => <a key={ref} href={ohref(ref)} className="hover:underline"><Ref>#{ref}</Ref></a>)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">{note[action]}{action !== 'export' && <Simulated />}</p>
          {!instant && (
            <ReviewOnly>
              <label className="flex items-center justify-between gap-3 text-sm text-fg">
                <span>{tx('حاكِ فشلًا لنحو طلب من 7 في المحاولة الأولى', 'Simulate a failure for ~1 in 7 orders on the first attempt')}</span>
                <Switch checked={simFail} onChange={setSimFail} label={tx('محاكاة فشل جزئي', 'Simulate partial failure')} />
              </label>
            </ReviewOnly>
          )}
        </>
      )}
      {phase !== 'review' && (
        <>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={tx('التقدم', 'Progress')}>
            <div className="h-full rounded-full bg-brand-gradient transition-[width] duration-150" style={{ width: `${pct}%` }} />
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-live="polite">
            {[
              [tx('عولج', 'Processed'), `${formatInt(done)} / ${formatInt(total)}`, 'text-fg'],
              [tx('نجح', 'Done'), formatInt(ok.length), 'text-emerald-700 dark:text-emerald-400'],
              [tx('فشل', 'Failed'), formatInt(failed.length), failed.length ? 'text-red-700 dark:text-red-400' : 'text-fg'],
              [tx('مستبعد', 'Skipped'), formatInt(e.ineligible), 'text-muted'],
            ].map(([k, v, c]) => <div key={k} className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-muted">{k}</dt><dd className={`mt-0.5 text-lg font-bold tabular-nums ${c}`}>{v}</dd></div>)}
          </dl>
          {phase === 'result' && failed.length > 0 && (
            <Alert tone="warn" title={tx(`نجاح جزئي: ${ok.length} نجح، ${failed.length} فشل`, `Partial success: ${ok.length} done, ${failed.length} failed`)}>
              <span className="flex flex-wrap items-center gap-2">{failsLabel}{tx('. إعادة المحاولة تشمل الفاشل فقط، ولا يتكرر ملصق ناجح.', '. Retrying covers the failed orders only; no successful label is repeated.')} <Simulated /></span>
              <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{failed.slice(0, 10).map((r) => <a key={r} href={ohref(r)} onClick={close} className="font-semibold underline-offset-2 hover:underline"><Ref>#{r}</Ref></a>)}{failed.length > 10 && <span>+{failed.length - 10}</span>}</span>
            </Alert>
          )}
          {phase === 'result' && failed.length === 0 && (
            <Alert tone="ok" title={tx(`اكتمل: ${formatInt(ok.length)}`, `Completed: ${formatInt(ok.length)}`)}>
              <span className="flex items-center gap-2">{tx('اكتمل لكل الطلبات المؤهلة، وسُجّل في كل طلب باسمك.', 'Completed for every eligible order and logged on each under your name.')} <Simulated /></span>
            </Alert>
          )}
        </>
      )}
    </Modal>
  );
}
