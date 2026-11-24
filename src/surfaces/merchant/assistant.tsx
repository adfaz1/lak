import { useState } from 'react';
import { Alert, Dialog, Sim } from '../../core/ui';
import { LOCATIONS, bulkEligibility, runBulk, simBulkFails } from './domain';
import { historyFixtures } from './inventory';
import { analyticsSeries, applyCoupon, change, periods, summarize, type Coupon } from './growth';
import { can } from './perms';
import { couponsStore, levelsStore, ordersStore, productsStore, testStore, transfersStore } from './stores';
import { conversionAnswer, lateAnswer, stockAnswer } from './workspace';
import { ActionLocked, Icon, KV, Money, mhref, useL, useTx } from './kit';

export type Question = 'late' | 'stock' | 'conversion' | 'orders';
const LOADED = new Date();
const SERIES = analyticsSeries();

/**
 * Evidence card: a fixed question → an answer computed from fixtures with source, period and freshness →
 * at most one proposed action with a preview → explicit confirmation. Not a chat; no confidence scores.
 */
export function EvidenceCard({ questions }: { questions: Question[] }) {
  const tx = useTx();
  const [q, setQ] = useState<Question | null>(null);
  const [asked, setAsked] = useState<Question | null>(null);
  const label: Record<Question, string> = {
    late: tx('ما الطلبات المدفوعة المتأخرة في التجهيز؟', 'Which paid orders are late to fulfil?'),
    stock: tx('ما المنتجات التي قد تنفد قريبًا؟', 'Which products may run out soon?'),
    conversion: tx('لماذا تغيّر معدل التحويل هذا الأسبوع؟', 'Why did conversion change this week?'),
    orders: tx('كيف تغيّرت الطلبات مقارنة بالأسبوع السابق؟', 'How did orders change versus the previous week?'),
  };
  return (
    <section className="card m-evidence" aria-labelledby="ev-h">
      <div className="card-head"><h2 id="ev-h"><Icon name="evidence" /> {tx('اسأل عن بياناتك', 'Ask about your data')}</h2><span className="small muted">{tx('إجابات محسوبة من بيانات المتجر، لا محادثة', 'Answers computed from store data, not a chat')}</span></div>
      <div className="card-body">
        <fieldset>
          <legend className="sr">{tx('اختر سؤالًا', 'Choose a question')}</legend>
          <div className="m-chips">
            {questions.map((x) => (
              <label key={x} className="m-qchip"><input type="radio" name="ev-q" checked={q === x} onChange={() => setQ(x)} /> <span>{label[x]}</span></label>
            ))}
          </div>
        </fieldset>
        <div className="actions">
          <button type="button" className="btn primary" disabled={!q} onClick={() => setAsked(q)}>{tx('أجب من البيانات', 'Answer from the data')}</button>
          {!q && <span className="small muted">{tx('اختر سؤالًا أولًا.', 'Choose a question first.')}</span>}
        </div>
        {asked && <Answer key={asked} q={asked} />}
      </div>
    </section>
  );
}

function Meta({ source, period }: { source: string; period: string }) {
  const tx = useTx();
  const time = LOADED.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return (
    <KV rows={[
      [tx('المصدر', 'Source'), source],
      [tx('الفترة', 'Period'), period],
      [tx('حداثة البيانات', 'Freshness'), <>{tx('بيانات تجريبية محمّلة الساعة', 'Demo data loaded at')} <bdi dir="ltr">{time}</bdi> {tx('(توقيت الرياض)', '(Riyadh time)')}</>],
    ]} />
  );
}

function Answer({ q }: { q: Question }) {
  if (q === 'late') return <LateAnswer />;
  if (q === 'stock') return <StockAnswer />;
  if (q === 'orders') return <OrdersAnswer />;
  return <ConversionAnswer />;
}

function LateAnswer() {
  const tx = useTx();
  const orders = ordersStore.use();
  const { role, failBulk } = testStore.use();
  const a = lateAnswer(orders);
  const [preview, setPreview] = useState(false);
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);
  const late = orders.filter((o) => a.refs.includes(o.ref));
  const elig = bulkEligibility(late, 'slips');
  const run = () => {
    const r = runBulk(orders, elig.eligible.map((o) => o.ref), 'slips', failBulk ? simBulkFails : () => false);
    ordersStore.set(r.orders);
    setResult({ ok: r.ok.length, failed: r.failed.length });
    setPreview(false);
  };
  return (
    <div className="m-answer" role="status">
      <p className="strong">{a.count === 0 ? tx('لا طلبات مدفوعة متأخرة الآن.', 'No paid orders are late right now.')
        : tx(`${a.count} طلبًا مدفوعًا لم يكتمل تجهيزها منذ أكثر من 24 ساعة. أقدمها منذ ${a.oldest} ساعة.`, `${a.count} paid orders have been unfulfilled for more than 24 hours. The oldest is ${a.oldest} hours old.`)}</p>
      <Meta source={tx('الطلبات: حالة الدفع والتجهيز', 'Orders: payment and fulfilment state')} period={tx('الآن؛ «متأخر» = أكثر من 24 ساعة منذ الدفع', 'Now; “late” = more than 24 hours since payment')} />
      <a className="btn small" href={mhref('orders', { view: 'late' })}>{tx('افتح عرض «متأخر» بالنتيجة نفسها', 'Open the “Late” view with the same result')}</a>
      {a.count > 0 && (
        <div className="m-proposal">
          <h3>{tx('إجراء مقترح واحد', 'One proposed action')}</h3>
          <p>{tx(`طباعة قوائم التعبئة لـ ${elig.eligible.length} طلبًا مؤهلًا لبدء التجهيز.`, `Print packing slips for ${elig.eligible.length} eligible orders to start fulfilment.`)}</p>
          {!can(role, 'order.bulk') ? <ActionLocked>{tx('دورك لا يشمل الإجراءات الجماعية على الطلبات.', 'Your role does not include bulk order actions.')}</ActionLocked>
            : <button type="button" className="btn" onClick={() => setPreview(true)}>{tx('معاينة الإجراء', 'Preview the action')}</button>}
          {result && <Alert tone={result.failed ? 'warning' : 'success'} title={tx('النتيجة:', 'Result:')}>{tx(`طُبعت ${result.ok}، فشل ${result.failed} (محاكاة). أعد المحاولة للفاشل من صفحة الطلبات.`, `${result.ok} printed, ${result.failed} failed (simulated). Retry failures from the Orders page.`)}</Alert>}
        </div>
      )}
      {preview && (
        <Dialog title={tx('تأكيد طباعة قوائم التعبئة', 'Confirm printing packing slips')} onClose={() => setPreview(false)}
          footer={<><button type="button" className="btn primary" onClick={run}>{tx(`اطبع ${elig.eligible.length} قائمة (محاكاة)`, `Print ${elig.eligible.length} slips (simulated)`)}</button><button type="button" className="btn" onClick={() => setPreview(false)}>{tx('إلغاء', 'Cancel')}</button></>}>
          <p>{tx(`النطاق: ${elig.eligible.length} طلبًا مؤهلًا من ${late.length}. غير المؤهل: ${elig.ineligible}.`, `Scope: ${elig.eligible.length} eligible of ${late.length}. Not eligible: ${elig.ineligible}.`)}</p>
          <p className="muted">{tx('الطباعة لا تغيّر حالة الدفع أو الشحن، ولا تُصدر ملصقات. لا تكلفة.', 'Printing does not change payment or shipment state and issues no labels. No cost.')} <Sim /></p>
        </Dialog>
      )}
    </div>
  );
}

function StockAnswer() {
  const tx = useTx();
  const l = useL();
  const levels = levelsStore.use();
  const products = productsStore.use();
  const role = testStore.use().role;
  const r = stockAnswer(levels, historyFixtures());
  const [preview, setPreview] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const nameOf = (sku: string) => { const p = products.find((x) => x.sku === sku || x.variants.some((v) => v.sku === sku)); return p ? l(p.name) : sku; };
  const create = () => {
    if (!r.proposal) return;
    const id = `TR-${1003 + transfersStore.get().length}`;
    transfersStore.set((ts) => [{ id, from: r.proposal!.from, to: r.proposal!.to, status: 'draft', note: 'Proposed from stock answer', discrepancy: [], lines: [{ sku: r.proposal!.sku, qty: r.proposal!.qty, received: 0 }] }, ...ts]);
    setMade(id);
    setPreview(false);
  };
  return (
    <div className="m-answer" role="status">
      {r.atRisk.length === 0 ? <p className="strong">{tx('لا منتجات بتغطية أقل من 14 يومًا ضمن المنتجات التي لها سجل كافٍ.', 'No products with enough history have less than 14 days of cover.')}</p> : (
        <ul className="m-list">
          {r.atRisk.map((x) => x.cov.kind === 'days' && (
            <li key={x.sku}><span className="strong">{nameOf(x.sku)}</span> <bdi dir="ltr" className="muted">{x.sku}</bdi>: {tx(`متاح ${x.total}، يُباع نحو ${x.cov.perDay} يوميًا ← تغطية تقديرية ${x.cov.days} يوم.`, `${x.total} available, selling about ${x.cov.perDay}/day → about ${x.cov.days} days of cover.`)}</li>
          ))}
        </ul>
      )}
      {r.unknown.length > 0 && (
        <p className="muted">{tx('بيانات غير كافية لتقدير التغطية: ', 'Insufficient data to estimate cover: ')}
          {r.unknown.map((x) => `${nameOf(x.sku)} (${x.cov.kind === 'noSales' ? tx('لا مبيعات في الفترة', 'no sales in the period') : tx('سجل أقل من 14 يومًا', 'under 14 days of history')})`).join(tx('، ', ', '))}</p>
      )}
      <Meta source={tx('المخزون المتاح لكل موقع + سجل المبيعات لكل SKU', 'Available stock per location + sales history per SKU')} period={tx('سرعة البيع: كامل السجل المتاح لكل SKU (14 يومًا على الأقل)', 'Sales rate: the full available history per SKU (at least 14 days)')} />
      {r.proposal && (
        <div className="m-proposal">
          <h3>{tx('إجراء مقترح واحد', 'One proposed action')}</h3>
          <p>{tx(`إنشاء مسودة تحويل: ${r.proposal.qty} من ${nameOf(r.proposal.sku)} من ${LOCATIONS[r.proposal.from].ar} إلى ${LOCATIONS[r.proposal.to].ar}. المسودة لا تنقل أي وحدة حتى تُرسل.`,
            `Create a transfer draft: ${r.proposal.qty} × ${nameOf(r.proposal.sku)} from the ${LOCATIONS[r.proposal.from].en} to the ${LOCATIONS[r.proposal.to].en}. A draft moves nothing until it is sent.`)}</p>
          {!can(role, 'inventory.transfer') ? <ActionLocked>{tx('دورك لا يشمل تحويلات المخزون.', 'Your role does not include stock transfers.')}</ActionLocked>
            : made ? <Alert tone="success">{tx('أُنشئت المسودة', 'Draft created')} <a href={mhref(`inventory/transfers/${made}`)}><bdi dir="ltr">{made}</bdi></a></Alert>
              : <button type="button" className="btn" onClick={() => setPreview(true)}>{tx('معاينة الإجراء', 'Preview the action')}</button>}
        </div>
      )}
      {preview && r.proposal && (
        <Dialog title={tx('تأكيد إنشاء مسودة تحويل', 'Confirm creating a transfer draft')} onClose={() => setPreview(false)}
          footer={<><button type="button" className="btn primary" onClick={create}>{tx('أنشئ المسودة', 'Create draft')}</button><button type="button" className="btn" onClick={() => setPreview(false)}>{tx('إلغاء', 'Cancel')}</button></>}>
          <KV rows={[[tx('المنتج', 'Product'), <>{nameOf(r.proposal.sku)} <bdi dir="ltr">{r.proposal.sku}</bdi></>], [tx('من', 'From'), l(LOCATIONS[r.proposal.from])], [tx('إلى', 'To'), l(LOCATIONS[r.proposal.to])], [tx('الكمية', 'Quantity'), r.proposal.qty]]} />
          <p className="muted">{tx('لن يتغير المخزون الآن. ستراجع المسودة وترسلها من صفحة المخزون.', 'Stock does not change now. You will review and send the draft from Inventory.')}</p>
        </Dialog>
      )}
    </div>
  );
}

function ConversionAnswer() {
  const tx = useTx();
  const a = conversionAnswer(SERIES);
  return (
    <div className="m-answer" role="status">
      {a.kind === 'insufficient' ? (
        <>
          <p className="strong">{tx('البيانات غير كافية للإجابة.', 'Insufficient data to answer.')}</p>
          <p>{tx(`بيانات الزيارات مفقودة في ${a.missing} من آخر ${a.days} أيام، فلا يمكن حساب التحويل أو تفسير تغيّره. لا نقترح إجراءً بناءً على تخمين.`, `Visit data is missing for ${a.missing} of the last ${a.days} days, so conversion can’t be computed or explained. No action is proposed from a guess.`)}</p>
          <a className="btn small" href={mhref('apps/ga')}>{tx('افحص ربط التحليلات', 'Check the analytics connection')}</a>
        </>
      ) : <p>{tx(`التحويل ${a.cur ?? '—'}% مقابل ${a.prev ?? '—'}%. هذا وصف للتغير وليس سببًا مثبتًا.`, `Conversion ${a.cur ?? '—'}% vs ${a.prev ?? '—'}%. This describes the change; it is not a proven cause.`)}</p>}
      <Meta source={tx('الطلبات + جلسات الزيارة', 'Orders + visit sessions')} period={tx('آخر 7 أيام مكتملة مقابل السبعة السابقة', 'Last 7 complete days vs the 7 before')} />
    </div>
  );
}

function OrdersAnswer() {
  const tx = useTx();
  const role = testStore.use().role;
  const coupons = couponsStore.use();
  const { cur, prev } = periods(SERIES, 7);
  const c = summarize(cur);
  const p = summarize(prev);
  const d = change(c.orders, p.orders);
  const draft: Coupon = { code: 'BACK10', type: 'percent', value: 10, minSpend: 20000, limitTotal: 300, limitPerCustomer: 1, used: 0, starts: '2026-11-25', ends: '2026-12-08', status: 'draft' };
  const exists = coupons.some((x) => x.code === draft.code);
  const sample = applyCoupon({ ...draft, status: 'active', starts: '2026-11-24' }, { subtotal: 48600, shipping: 2500, customerUses: 0 });
  const [preview, setPreview] = useState(false);
  return (
    <div className="m-answer" role="status">
      <p className="strong">{tx(`الطلبات ${c.orders} مقابل ${p.orders} في الأسبوع السابق (${d === null ? '—' : `${d > 0 ? '+' : ''}${d}%`}).`, `${c.orders} orders vs ${p.orders} the previous week (${d === null ? '—' : `${d > 0 ? '+' : ''}${d}%`}).`)}</p>
      <p className="muted">{tx('هذا مقارنة أعداد لفترتين متساويتين من أيام مكتملة؛ لا يحدد سبب التغير.', 'This compares counts over two equal periods of complete days; it does not identify a cause.')}</p>
      <Meta source={tx('الطلبات المكتملة الدفع', 'Orders with completed payment')} period={tx('آخر 7 أيام مكتملة مقابل السبعة السابقة · الرياض', 'Last 7 complete days vs the previous 7 · Riyadh')} />
      <div className="m-proposal">
        <h3>{tx('إجراء مقترح واحد', 'One proposed action')}</h3>
        <p>{tx('تحضير مسودة كوبون للعملاء العائدين (10%، حد أدنى 200 ر.س، مرة لكل عميل). المسودة غير مفعّلة ولا تُرسل لأحد.', 'Prepare a draft coupon for returning customers (10%, SAR 200 minimum, once per customer). The draft is inactive and sent to no one.')}</p>
        {!can(role, 'marketing.manage') ? <ActionLocked>{tx('دورك لا يشمل إدارة العروض.', 'Your role does not include managing offers.')}</ActionLocked>
          : exists ? <Alert tone="success">{tx('المسودة موجودة: ', 'Draft exists: ')}<a href={mhref('marketing', { tab: 'coupons' })}><bdi dir="ltr">BACK10</bdi></a></Alert>
            : <button type="button" className="btn" onClick={() => setPreview(true)}>{tx('معاينة الإجراء', 'Preview the action')}</button>}
      </div>
      {preview && (
        <Dialog title={tx('تأكيد إنشاء مسودة كوبون', 'Confirm creating a draft coupon')} onClose={() => setPreview(false)}
          footer={<><button type="button" className="btn primary" onClick={() => { couponsStore.set((cs) => [draft, ...cs]); setPreview(false); }}>{tx('أنشئ المسودة', 'Create draft')}</button><button type="button" className="btn" onClick={() => setPreview(false)}>{tx('إلغاء', 'Cancel')}</button></>}>
          <p>{tx('معاينة على طلب مثال (منتجات 486 ر.س + شحن 25 ر.س):', 'Preview on a sample order (items SAR 486 + shipping SAR 25):')}</p>
          <KV rows={[[tx('الخصم', 'Discount'), <Money v={sample.discount} />], [tx('الإجمالي بعد الخصم', 'Total after discount'), <Money v={sample.total} />]]} />
          <p className="muted">{tx('ليس وعدًا بزيادة المبيعات. ستراجع الشروط وتفعّل الكوبون بنفسك من صفحة التسويق.', 'Not a promise of more sales. You review the terms and activate it yourself from Marketing.')}</p>
        </Dialog>
      )}
    </div>
  );
}
