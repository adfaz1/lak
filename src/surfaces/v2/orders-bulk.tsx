// Bulk actions on orders: review eligibility, run with progress, report partial success, retry failures only.
import { useEffect, useRef, useState } from 'react';
import { formatInt } from '../../core/format';
import { ordersStore } from '../merchant/stores';
import { bulkEligibility, runBulk, simBulkFails, type BulkAction, type Ineligible, type Order } from '../merchant/domain';
import { Banner, Dialog, Ref, Sim, useTx } from './ui';
import { vhref } from './data';
import { TestControl } from './orders-shared';

export interface BulkOutcome { id: number; action: BulkAction; ok: string[] }

/** Undo a bulk confirmation: only the orders this run confirmed, and only the entry it added. */
export function undoConfirm(refs: string[]) {
  const want = new Set(refs);
  ordersStore.set((all) => all.map((o) => {
    if (!want.has(o.ref)) return o;
    const i = o.log.map((e) => e.kind).lastIndexOf('confirmed');
    return { ...o, confirmed: false, log: i < 0 ? o.log : [...o.log.slice(0, i), ...o.log.slice(i + 1)] };
  }));
}

type Phase = 'review' | 'running' | 'result';

export function BulkDialog({ action, orders, allMode, onClose }: { action: BulkAction; orders: Order[]; allMode: boolean; onClose: (o: BulkOutcome | null) => void }) {
  const tx = useTx();
  // Frozen at review time: the counts describe what was reviewed, not the state after the run.
  const [e] = useState(() => bulkEligibility(orders, action));
  const [phase, setPhase] = useState<Phase>('review');
  const [simFail, setSimFail] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [done, setDone] = useState(0);
  const [ok, setOk] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(1);
  const sim = useRef(simFail);
  sim.current = simFail;

  const name = action === 'slips' ? tx('طباعة قوائم التعبئة', 'Print packing slips') : tx('تأكيد الطلبات', 'Mark orders confirmed');
  const reason: Record<Ineligible, string> = {
    payNotConfirmed: tx('الدفع لم يكتمل', 'Payment not completed'),
    refunded: tx('مسترد كليًا أو جزئيًا', 'Refunded in full or in part'),
    alreadyFulfilled: tx('مجهّز بالكامل', 'Already fulfilled'),
    alreadyConfirmed: tx('مؤكد من قبل', 'Already confirmed'),
  };
  const samples = (r: Ineligible) => orders.filter((o) => {
    const one = bulkEligibility([o], action);
    return one.reasons[r];
  }).slice(0, 3).map((o) => o.ref);

  const start = (refs: string[]) => { setQueue(refs); setDone(0); setFailed([]); setPhase('running'); };
  useEffect(() => {
    if (phase !== 'running') return;
    if (done >= queue.length) { setPhase('result'); return; }
    const t = setTimeout(() => {
      const chunk = queue.slice(done, done + 3);
      // First attempt fails the deterministic ~1 in 7 when the test control is on; a retry recovers.
      const r = runBulk(ordersStore.get(), chunk, action, sim.current && attempt === 1 ? simBulkFails : () => false);
      ordersStore.set(r.orders);
      setOk((x) => [...x, ...r.ok]);
      setFailed((x) => [...x, ...r.failed]);
      setDone(done + chunk.length);
    }, 140);
    return () => clearTimeout(t);
  }, [phase, done, queue, action, attempt]);

  const outcome: BulkOutcome = { id: Date.now(), action, ok };
  const close = () => onClose(phase === 'review' ? null : outcome);
  const pct = queue.length ? Math.round((done / queue.length) * 100) : 0;
  const verb = action === 'slips' ? tx('طُبعت', 'Printed') : tx('أُكّدت', 'Confirmed');

  return (
    <Dialog wide title={phase === 'review' ? tx(`مراجعة: ${name}`, `Review: ${name}`) : phase === 'running' ? tx(`جارٍ التنفيذ: ${name}`, `Running: ${name}`) : tx('النتيجة', 'Result')} onClose={phase === 'running' ? () => undefined : close}
      footer={phase === 'review' ? (
        <>
          <button type="button" className="lk-btn" onClick={() => onClose(null)}>{tx('إلغاء', 'Cancel')}</button>
          <button type="button" className="lk-btn primary" disabled={!e.eligible.length} onClick={() => start(e.eligible.map((o) => o.ref))}>
            {action === 'slips' ? tx(`اطبع ${e.eligible.length} قائمة`, `Print ${e.eligible.length} ${e.eligible.length === 1 ? 'slip' : 'slips'}`) : tx(`أكّد ${e.eligible.length} طلبًا`, `Confirm ${e.eligible.length} ${e.eligible.length === 1 ? 'order' : 'orders'}`)}
          </button>
        </>
      ) : phase === 'running' ? (
        <span className="lk-small lk-3">{tx('لا تغلق النافذة؛ يستغرق ثوانٍ.', 'Keep this open; it takes a few seconds.')}</span>
      ) : (
        <>
          <button type="button" className={`lk-btn${failed.length ? '' : ' primary'}`} onClick={close}>{failed.length ? tx('إغلاق', 'Close') : tx('تم', 'Done')}</button>
          {failed.length > 0 && <button type="button" className="lk-btn primary" onClick={() => { setAttempt((a) => a + 1); start(failed); }}>{tx(`أعد محاولة الفاشل فقط (${failed.length})`, `Retry failed only (${failed.length})`)}</button>}
        </>
      )}>
      {phase === 'review' && (
        <>
          <p className="lk-2">
            {allMode ? tx(`النطاق: كل الطلبات المطابقة (${formatInt(orders.length)})، وليس هذه الصفحة فقط.`, `Scope: all ${formatInt(orders.length)} matching orders, not just this page.`)
              : tx(`النطاق: ${orders.length} طلبًا حددتها في هذه الصفحة.`, `Scope: the ${orders.length} ${orders.length === 1 ? 'order' : 'orders'} you selected on this page.`)}
          </p>
          <div className="ord-elig">
            <div className="ord-elig-col ok">
              <span className="ord-elig-n lk-num">{formatInt(e.eligible.length)}</span>
              <span className="lk-strong">{tx('مؤهل وسيُنفَّذ', 'Eligible, will run')}</span>
              <span className="lk-micro lk-3">{e.eligible.slice(0, 4).map((o) => <span key={o.ref} className="ord-elig-ref"><Ref>#{o.ref}</Ref></span>)}{e.eligible.length > 4 && <span>+{e.eligible.length - 4}</span>}</span>
            </div>
            <div className="ord-elig-col ord-elig-skip">
              <span className="ord-elig-n lk-num">{formatInt(e.ineligible)}</span>
              <span className="lk-strong">{tx('غير مؤهل وسيُستبعد', 'Not eligible, skipped')}</span>
              {e.ineligible === 0 ? <span className="lk-micro lk-3">{tx('لا شيء', 'None')}</span> : (
                <ul className="ord-elig-reasons">
                  {(Object.keys(e.reasons) as Ineligible[]).map((r) => (
                    <li key={r}><span className="lk-grow">{reason[r]}</span><b className="lk-num">{formatInt(e.reasons[r] ?? 0)}</b>
                      <span className="lk-micro lk-3 ord-elig-samples">{samples(r).map((ref) => <Ref key={ref}>#{ref}</Ref>)}</span></li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p className="lk-small lk-2">
            {action === 'slips' ? tx('بلا تكلفة. الطباعة لا تغيّر حالة الدفع أو التجهيز أو الشحن، ولا يمكن التراجع عنها.', 'No cost. Printing changes no payment, fulfilment or shipment state, and cannot be undone.')
              : tx('بلا تكلفة. التأكيد لا يُصدر شحنة ولا يرسل رسالة للعميل، ويمكن التراجع عنه.', 'No cost. Confirming issues no shipment and sends no customer message; you can undo it.')} <Sim />
          </p>
          <TestControl>
            <label className="ord-switch-row"><input type="checkbox" className="lk-switch" checked={simFail} onChange={(ev) => setSimFail(ev.target.checked)} />
              {tx('حاكِ انقطاع خدمة المستندات لنحو طلب من كل 7 في المحاولة الأولى', 'Simulate the document service timing out for about 1 order in 7 on the first attempt')}</label>
          </TestControl>
        </>
      )}
      {phase !== 'review' && (
        <>
          <div className="ord-progress" role="progressbar" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={done} aria-label={tx('التقدم', 'Progress')}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="ord-tally lk-small" aria-live="polite">
            <span><b className="lk-num">{done}</b> / <span className="lk-num">{queue.length}</span> {tx('عولج', 'processed')}</span>
            <span className="ok">{verb} <b className="lk-num">{ok.length}</b></span>
            <span className="bad">{tx('فشل', 'Failed')} <b className="lk-num">{failed.length}</b></span>
            {e.ineligible > 0 && <span className="lk-3">{tx('مستبعد', 'Skipped')} <b className="lk-num">{e.ineligible}</b></span>}
          </div>
          {phase === 'result' && failed.length > 0 && (
            <Banner tone="warn" title={tx(`نجاح جزئي: ${ok.length} نجح، ${failed.length} فشل`, `Partial success: ${ok.length} done, ${failed.length} failed`)}>
              {tx('انتهت مهلة خدمة المستندات (محاكاة). إعادة المحاولة تشمل الفاشل فقط ولا تكرر ما نجح.', 'The document service timed out (simulated). Retrying covers the failed orders only and never repeats what succeeded.')}
              <div className="ord-failrefs">{failed.slice(0, 10).map((r) => <a key={r} href={vhref(`orders/${r}`)} onClick={() => onClose(outcome)}><Ref>#{r}</Ref></a>)}{failed.length > 10 && <span>+{failed.length - 10}</span>}</div>
            </Banner>
          )}
          {phase === 'result' && failed.length === 0 && (
            <Banner tone="ok" title={action === 'slips' ? tx(`أُرسلت ${ok.length} قائمة تعبئة للطابعة`, `${ok.length} packing ${ok.length === 1 ? 'slip' : 'slips'} sent to the printer`) : tx(`أُكّد ${ok.length} طلبًا`, `${ok.length} ${ok.length === 1 ? 'order' : 'orders'} confirmed`)}>
              {tx('اكتمل التنفيذ لكل الطلبات المؤهلة.', 'Completed for every eligible order.')} <Sim />
            </Banner>
          )}
        </>
      )}
    </Dialog>
  );
}
