// Bulk actions: review eligibility and scope, run with progress, report partial success, retry failures only.
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, MinusCircle } from 'lucide-react';
import { formatInt } from '../../../core/format';
import { ordersStore } from '../../merchant/stores';
import { bulkEligibility, runBulk, simBulkFails, type BulkAction, type Ineligible, type Order } from '../../merchant/domain';
import { Alert, Modal, Simulated, Switch } from '../../../ds/kit';
import { Button, Ref, useTx } from '../../../ds/ui';
import { chunks, skipSamples } from './model';
import { ReviewOnly, ohref, useLabels } from './ui';

export interface BulkOutcome { action: BulkAction; ok: string[] }
type Phase = 'review' | 'running' | 'result';

export function BulkModal({ action, orders, allMatching, onClose }: { action: BulkAction; orders: Order[]; allMatching: boolean; onClose: (o: BulkOutcome | null) => void }) {
  const tx = useTx();
  const L = useLabels();
  // Frozen at review time: the counts describe what was reviewed.
  const [e] = useState(() => bulkEligibility(orders, action));
  const [samples] = useState(() => skipSamples(orders, action));
  const [phase, setPhase] = useState<Phase>('review');
  const [simFail, setSimFail] = useState(false);
  const [queue, setQueue] = useState<string[][]>([]);
  const [step, setStep] = useState(0);
  const [total, setTotal] = useState(0);
  const [ok, setOk] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const attempt = useRef(1);

  const start = (refs: string[]) => { setQueue(chunks(refs, 5)); setTotal(refs.length); setStep(0); setFailed([]); setPhase('running'); };
  useEffect(() => {
    if (phase !== 'running') return;
    if (step >= queue.length) { setPhase('result'); return; }
    const t = setTimeout(() => {
      // The simulated document-service timeout applies to the first attempt only; a retry recovers.
      const r = runBulk(ordersStore.get(), queue[step], action, simFail && attempt.current === 1 ? simBulkFails : () => false);
      ordersStore.set(r.orders);
      setOk((x) => [...x, ...r.ok]);
      setFailed((x) => [...x, ...r.failed]);
      setStep(step + 1);
    }, 120);
    return () => clearTimeout(t);
  }, [phase, step, queue, action, simFail]);

  const done = Math.min(total, queue.slice(0, step).reduce((s, c) => s + c.length, 0));
  const pct = total ? Math.round((done / total) * 100) : 0;
  const name = action === 'slips' ? tx('طباعة قوائم التعبئة', 'Print packing slips') : tx('تأكيد الطلبات', 'Mark orders confirmed');
  const close = () => onClose(phase === 'review' ? null : { action, ok });
  const n = e.eligible.length;

  const footer = phase === 'review' ? (
    <>
      <Button variant="secondary" onClick={() => onClose(null)}>{tx('إلغاء', 'Cancel')}</Button>
      <Button disabled={!n} onClick={() => start(e.eligible.map((o) => o.ref))}>
        {action === 'slips' ? tx(`اطبع ${formatInt(n)} قائمة`, `Print ${formatInt(n)} ${n === 1 ? 'slip' : 'slips'}`) : tx(`أكّد ${formatInt(n)} طلبًا`, `Confirm ${formatInt(n)} ${n === 1 ? 'order' : 'orders'}`)}
      </Button>
    </>
  ) : phase === 'running' ? (
    <span className="text-xs text-muted">{tx('يستغرق ثوانٍ؛ أبقِ النافذة مفتوحة.', 'Takes a few seconds; keep this open.')}</span>
  ) : (
    <>
      <Button variant={failed.length ? 'secondary' : 'primary'} onClick={close}>{failed.length ? tx('إغلاق', 'Close') : tx('تم', 'Done')}</Button>
      {failed.length > 0 && <Button onClick={() => { attempt.current += 1; start(failed); }}>{tx(`أعد محاولة الفاشل فقط (${failed.length})`, `Retry failed only (${failed.length})`)}</Button>}
    </>
  );

  return (
    <Modal size="lg" title={phase === 'review' ? name : phase === 'running' ? tx('جارٍ التنفيذ…', 'Running…') : tx('النتيجة', 'Result')} onClose={phase === 'running' ? () => undefined : close} footer={footer}
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
                  {(Object.keys(e.reasons) as Ineligible[]).map((r) => (
                    <li key={r} className="text-xs">
                      <span className="flex justify-between gap-2"><span className="text-fg">{L.skip(r)}</span><b className="tabular-nums">{formatInt(e.reasons[r] ?? 0)}</b></span>
                      <span className="flex flex-wrap gap-x-2 text-muted">{samples[r]?.map((ref) => <Ref key={ref}>#{ref}</Ref>)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            {action === 'slips' ? tx('بلا تكلفة. لا تغيّر حالة الدفع أو التجهيز أو الشحن.', 'No cost. Changes no payment, fulfilment or shipment state.')
              : tx('بلا تكلفة. لا يُصدر شحنة ولا يرسل رسالة للعميل. يمكن التراجع.', 'No cost. Issues no shipment and sends no message. Can be undone.')}
            <Simulated />
          </p>
          <ReviewOnly>
            <label className="flex items-center justify-between gap-3 text-sm text-fg">
              <span>{tx('حاكِ انتهاء مهلة خدمة المستندات لنحو طلب من 7 في المحاولة الأولى', 'Simulate the document service timing out for ~1 in 7 orders on the first attempt')}</span>
              <Switch checked={simFail} onChange={setSimFail} label={tx('محاكاة فشل جزئي', 'Simulate partial failure')} />
            </label>
          </ReviewOnly>
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
              [action === 'slips' ? tx('طُبع', 'Printed') : tx('أُكّد', 'Confirmed'), formatInt(ok.length), 'text-emerald-700 dark:text-emerald-400'],
              [tx('فشل', 'Failed'), formatInt(failed.length), failed.length ? 'text-red-700 dark:text-red-400' : 'text-fg'],
              [tx('مستبعد', 'Skipped'), formatInt(e.ineligible), 'text-muted'],
            ].map(([k, v, c]) => <div key={k} className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-muted">{k}</dt><dd className={`mt-0.5 text-lg font-bold tabular-nums ${c}`}>{v}</dd></div>)}
          </dl>
          {phase === 'result' && failed.length > 0 && (
            <Alert tone="warn" title={tx(`نجاح جزئي: ${ok.length} نجح، ${failed.length} فشل`, `Partial success: ${ok.length} done, ${failed.length} failed`)}>
              <span className="flex flex-wrap items-center gap-2">{tx('انتهت مهلة خدمة المستندات. إعادة المحاولة تشمل الفاشل فقط.', 'The document service timed out. Retrying covers the failed orders only.')} <Simulated /></span>
              <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{failed.slice(0, 10).map((r) => <a key={r} href={ohref(r)} onClick={close} className="font-semibold underline-offset-2 hover:underline"><Ref>#{r}</Ref></a>)}{failed.length > 10 && <span>+{failed.length - 10}</span>}</span>
            </Alert>
          )}
          {phase === 'result' && failed.length === 0 && (
            <Alert tone="ok" title={action === 'slips' ? tx(`أُرسلت ${formatInt(ok.length)} قائمة تعبئة للطابعة`, `${formatInt(ok.length)} packing ${ok.length === 1 ? 'slip' : 'slips'} sent to the printer`) : tx(`أُكّد ${formatInt(ok.length)} طلبًا`, `${formatInt(ok.length)} ${ok.length === 1 ? 'order' : 'orders'} confirmed`)}>
              <span className="flex items-center gap-2">{tx('اكتمل لكل الطلبات المؤهلة.', 'Completed for every eligible order.')} <Simulated /></span>
            </Alert>
          )}
        </>
      )}
    </Modal>
  );
}
