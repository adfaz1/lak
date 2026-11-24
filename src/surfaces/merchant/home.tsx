import { useState, type ReactNode } from 'react';
import { useLang } from '../../core/lang';
import { Alert, Badge, Field, Metric, PageHeader, Sim, type Tone } from '../../core/ui';
import { VIEWS, isToday, total } from './domain';
import { lowStock } from './inventory';
import { moneyCards } from './finance';
import { analyticsSeries } from './growth';
import { parseMoney } from './catalog';
import { canSee } from './perms';
import { financeStore, levelsStore, ordersStore, settingsStore, setupStore, testStore } from './stores';
import { enterStep, placeTestOrder, setupSummary, submitStep, validHost, validSlug, verifyStep, type SetupStep, type StepId, type StepState } from './workspace';
import { strings } from './i18n';
import { EvidenceCard } from './assistant';
import { Money, Progress, mhref, useTx } from './kit';

export default function Home() {
  const mode = testStore.use().mode;
  return mode === 'new' ? <SetupHome /> : <ActiveHome />;
}

const SERIES = analyticsSeries();

function ActiveHome() {
  const tx = useTx();
  const { lang } = useLang();
  const t = strings[lang];
  const role = testStore.use().role;
  const orders = ordersStore.use();
  const levels = levelsStore.use();
  const fin = financeStore.use();
  const settings = settingsStore.use();
  const today = orders.filter(isToday);
  const needs = orders.filter(VIEWS.needs);
  const late = orders.filter(VIEWS.late);
  const failed = orders.filter(VIEWS.payfail);
  const pendingRefunds = orders.filter((o) => o.refunds.some((r) => r.status === 'pending'));
  const low = lowStock(levels);
  const paidToday = today.filter((o) => o.pay === 'paid').reduce((sum, o) => sum + total(o), 0);
  const cards = moneyCards(fin.txs, fin.payouts);
  const oldest = needs.reduce((max, o) => Math.max(max, o.hoursAgo), 0);
  const providers = settings.providers.filter((p) => p.state === 'action_required');
  const seeOrders = canSee(role, 'orders');
  const seeFinance = canSee(role, 'finance');

  type Q = { n: ReactNode; title: string; why: string; href: string; cta: string; tone: Tone; tag: string };
  const queue: Q[] = [];
  if (seeOrders && failed.length) queue.push({ n: failed.length, title: tx('طلبات تعثر دفعها', 'Orders with failed payment'), why: tx('لم يُحصَّل المبلغ. لا تُجهَّز قبل تأكيد الدفع.', 'Not collected. Do not fulfil before payment is confirmed.'), href: mhref('orders', { view: 'payfail' }), cta: tx('راجع الطلبات', 'Review orders'), tone: 'danger', tag: tx('مال', 'Money') });
  if (seeOrders && late.length) queue.push({ n: late.length, title: tx('طلبات مدفوعة متأخرة أكثر من 24 ساعة', 'Paid orders late by over 24 hours'), why: tx('التأخير يؤخر وصولها للعميل ويزيد الاستفسارات.', 'Delay pushes back delivery and increases enquiries.'), href: mhref('orders', { view: 'late' }), cta: tx('افتح المتأخر', 'Open late'), tone: 'warning', tag: tx('وقت', 'Time') });
  if (seeOrders) queue.push(needs.length
    ? { n: needs.length, title: t.qNeeds, why: t.qNeedsWhy(t.age(oldest)), href: mhref('orders', { view: 'needs' }), cta: t.qNeedsCta, tone: 'info', tag: tx('تجهيز', 'Fulfil') }
    : { n: 0, title: t.qClear, why: t.qClearWhy, href: mhref('orders'), cta: tx('كل الطلبات', 'All orders'), tone: 'success', tag: tx('تجهيز', 'Fulfil') });
  if (seeOrders && pendingRefunds.length) queue.push({ n: pendingRefunds.length, title: tx('استردادات بانتظار تأكيد المزود', 'Refunds awaiting provider confirmation'), why: tx('لم يصل المبلغ للعميل بعد. تابع النتيجة قبل الرد عليه.', 'The money has not reached the customer yet. Follow the result before replying.'), href: mhref('orders', { view: 'returns' }), cta: tx('افتح المرتجعات', 'Open returns'), tone: 'warning', tag: tx('مال', 'Money') });
  if (canSee(role, 'inventory') && low.length) queue.push({ n: low.length, title: tx('مواقع مخزونها عند حد التنبيه أو أقل', 'Locations at or below their low-stock threshold'), why: tx('المتاح = الموجود − المحجوز. قد يتوقف البيع في هذا الموقع.', 'Available = on hand − reserved. Selling from that location may stop.'), href: mhref('inventory', { tab: 'low' }), cta: tx('افتح النواقص', 'Open low stock'), tone: 'warning', tag: tx('مخزون', 'Stock') });
  if (canSee(role, 'settings') && role === 'owner' && providers.length) queue.push({ n: providers.length, title: tx('مزود دفع يحتاج إجراءً منك', 'A payment provider needs action'), why: tx('طلب المزود مستندًا إضافيًا (محاكاة). الطريقة غير متاحة للعملاء حتى يكتمل.', 'The provider asked for another document (simulated). The method is unavailable to shoppers until done.'), href: mhref('settings/payments'), cta: tx('افتح المدفوعات', 'Open payments'), tone: 'warning', tag: tx('إعداد', 'Setup') });

  const last7 = SERIES.slice(-7);
  const max = Math.max(...last7.map((d) => d.net), 1);

  return (
    <>
      <PageHeader title={tx('اليوم في متجرك', 'Today in your store')} sub={tx('الفترة: اليوم · التوقيت: الرياض · المصدر: بيانات تجريبية ثابتة · آخر تحديث: عند فتح الصفحة', 'Period: today · Time zone: Riyadh · Source: static demo data · Last update: when the page opened')} />
      <section className="metrics" aria-label={tx('ملخص اليوم', 'Today summary')}>
        {seeOrders && <Metric label={t.mSales} value={<Money v={paidToday} />} note={t.mSalesDef} />}
        {seeOrders && <Metric label={t.mOrders} value={today.length} note={t.mOrdersDef} />}
        {seeOrders && <Metric label={t.mNeeds} value={needs.length} note={t.mNeedsDef} />}
        {seeFinance && <Metric label={tx('متاح للتحويل', 'Available for payout')} value={<Money v={cards.available} />} note={tx('سُوّي من المزود ولم يُحوَّل بعد؛ ليس ربحًا', 'Settled by the provider, not yet paid out; not profit')} />}
        {!seeOrders && canSee(role, 'analytics') && <Metric label={tx('طلبات آخر 7 أيام مكتملة', 'Orders, last 7 complete days')} value={last7.reduce((s, d) => s + d.orders, 0)} note={tx('من التحليلات', 'From analytics')} />}
      </section>

      <section className="card" aria-labelledby="queue-h">
        <div className="card-head"><h2 id="queue-h">{t.queue}</h2><span className="small muted">{tx('مرتبة حسب أثر المال والوقت', 'Ordered by money and time impact')}</span></div>
        {queue.length ? (
          <ul className="queue">
            {queue.map((q, i) => (
              <li key={q.title}>
                <b className="n">{q.n}</b>
                <div className="grow"><div className="strong">{q.title} <Badge tone={q.tone}>{q.tag}</Badge></div><div className="muted small">{q.why}</div></div>
                <a className={i === 0 ? 'btn primary' : 'btn'} href={q.href}>{q.cta}</a>
              </li>
            ))}
          </ul>
        ) : <div className="card-body"><p>{tx('لا مهام تحتاج تدخلك ضمن صلاحيات دورك.', 'Nothing needs your attention within your role.')}</p></div>}
      </section>

      <div className="m-grid-2">
        <EvidenceCard questions={['late', 'stock', 'conversion']} />
        {canSee(role, 'analytics') && (
          <section className="card" aria-labelledby="mini-h">
            <div className="card-head"><h2 id="mini-h">{tx('صافي المبيعات، آخر 7 أيام مكتملة', 'Net sales, last 7 complete days')}</h2><a className="btn small" href={mhref('analytics', { period: '7' })}>{tx('التفاصيل', 'Details')}</a></div>
            <div className="card-body">
              <ul className="m-mini-bars" aria-label={tx('صافي المبيعات اليومي', 'Daily net sales')}>
                {last7.map((d) => (
                  <li key={d.date}>
                    <span className="m-mini-bar" style={{ blockSize: `${Math.max(4, Math.round((d.net / max) * 100))}%` }} />
                    <span className="small muted"><bdi dir="ltr">{d.date.slice(5)}</bdi></span>
                    <span className="sr"><Money v={d.net} /></span>
                  </li>
                ))}
              </ul>
              <p className="small muted">{tx('اليوم الحالي غير مشمول لأنه لم يكتمل. الجدول البديل في صفحة التحليلات.', 'Today is excluded because it is incomplete. A table alternative is on the Analytics page.')}</p>
            </div>
          </section>
        )}
      </div>

      {seeOrders && (
        <section className="card" aria-labelledby="recent-h">
          <div className="card-head"><h2 id="recent-h">{tx('نشاط حديث', 'Recent activity')}</h2></div>
          <ul className="queue">
            {orders.filter((o) => o.log.some((e) => e.when === 'now')).slice(0, 5).map((o) => (
              <li key={o.ref}><span className="grow">{t.log(o.log[o.log.length - 1], '')}</span><a className="btn small" href={mhref(`orders/${o.ref}`)}><bdi dir="ltr">#{o.ref}</bdi></a></li>
            ))}
            {!orders.some((o) => o.log.some((e) => e.when === 'now')) && <li className="muted">{tx('لا نشاط في هذه الجلسة بعد. ما تفعله في الطلبات يظهر هنا.', 'No activity in this session yet. What you do in Orders shows here.')}</li>}
          </ul>
        </section>
      )}
    </>
  );
}

/* ---------- New store: setup checklist (QA01) ---------- */

const STATE_TONE: Record<StepState, Tone> = { todo: 'neutral', entered: 'info', verifying: 'warning', ready: 'success', rejected: 'danger' };

function SetupHome() {
  const tx = useTx();
  const steps = setupStore.use();
  const s = setupSummary(steps);
  const stateLabel: Record<StepState, string> = {
    todo: tx('لم يبدأ', 'Not started'), entered: tx('تم إدخال البيانات', 'Details entered'), verifying: tx('بانتظار التحقق', 'Awaiting verification'),
    ready: tx('جاهز', 'Ready'), rejected: tx('مرفوض — يحتاج تعديلًا', 'Rejected — needs changes'),
  };
  const title: Record<StepId, [string, string]> = {
    business: [tx('بيانات النشاط', 'Business details'), tx('السجل التجاري والاسم القانوني. يتحقق منها فريق «لك» (محاكاة).', 'Commercial registration and legal name. Checked by the LAK team (simulated).')],
    product: [tx('أول منتج صالح', 'First valid product'), tx('اسم وسعر صالحان. لا يحتاج تحققًا خارجيًا.', 'A valid name and price. No external check needed.')],
    payment: [tx('طريقة دفع متحققة', 'Verified payment method'), tx('المزود يراجع الطلب قبل أن تقبل المدفوعات (محاكاة).', 'The provider reviews the request before you can accept payments (simulated).')],
    shipping: [tx('شحن متاح', 'Shipping available'), tx('منطقة وسعر واحد على الأقل.', 'At least one zone and rate.')],
    domain: [tx('عنوان المتجر', 'Store address'), tx('مسار مجاني جاهز فورًا، أو نطاق خاص يحتاج تحقق DNS.', 'A free path is ready immediately; a custom domain needs a DNS check.')],
    policies: [tx('سياسة الاسترجاع', 'Return policy'), tx('نص سياستك. لا نقدّم استشارة قانونية.', 'Your policy text. We do not give legal advice.')],
    test: [tx('طلب تجريبي', 'Test order'), tx('يتاح بعد جاهزية المنتج والدفع والشحن.', 'Available once product, payment and shipping are ready.')],
  };
  return (
    <>
      <PageHeader title={tx('جهّز متجرك للبيع', 'Get your store ready to sell')} sub={tx('تقدّمك محفوظ؛ يمكنك المغادرة والعودة. «جاهز» تعني أن الخطوة تحققت فعلًا، لا أنك فتحت الصفحة.', 'Your progress is saved; you can leave and come back. “Ready” means the step is actually verified, not that you opened it.')} />
      <section className="card" aria-labelledby="setup-h">
        <div className="card-head">
          <h2 id="setup-h">{tx('قائمة الإعداد', 'Setup checklist')}</h2>
          <span className="small">{tx(`${s.ready} من ${s.total} جاهزة · ${s.verifying} بانتظار التحقق`, `${s.ready} of ${s.total} ready · ${s.verifying} awaiting verification`)}</span>
        </div>
        <div className="card-body">
          <Progress value={s.ready} max={s.total} label={tx('الخطوات الجاهزة', 'Steps ready')} />
          <ol className="m-checklist">
            {steps.map((st, i) => (
              <li key={st.id} className={`m-check-step ${st.state}`} aria-current={s.next === st.id ? 'step' : undefined}>
                <div className="m-check-head">
                  <span className="m-step-n">{i + 1}</span>
                  <div className="grow"><h3>{title[st.id][0]}</h3><p className="small muted">{title[st.id][1]}</p></div>
                  <Badge tone={STATE_TONE[st.state]}>{stateLabel[st.state]}</Badge>
                </div>
                <StepBody step={st} canTest={s.canTest} />
              </li>
            ))}
          </ol>
        </div>
      </section>
      <p className="small muted">{tx('بدّل إلى «متجر نشط» من لوحة الاختبار لرؤية طابور الأولويات.', 'Switch to “Active store” in the test panel to see the priority queue.')}</p>
    </>
  );
}

function StepBody({ step, canTest }: { step: SetupStep; canTest: boolean }) {
  const tx = useTx();
  const [a, setA] = useState(step.id === 'domain' ? 'demo-store' : step.id === 'payment' ? 'mada' : step.value);
  const [b, setB] = useState('');
  const [mode, setMode] = useState<'free' | 'custom'>('free');
  const [err, setErr] = useState('');
  const set = (fn: (s: SetupStep[]) => SetupStep[]) => setupStore.set(fn);
  const id = step.id;
  const verifyTools = step.state === 'verifying' && id !== 'domain' && (
    <div className="m-simtools">
      <span className="small muted">{tx('أداة اختبار:', 'Test tool:')}</span>
      <button type="button" className="btn small" onClick={() => set((s) => verifyStep(s, id, true))}>{tx('حاكِ القبول', 'Simulate approval')}</button>
      <button type="button" className="btn small" onClick={() => set((s) => verifyStep(s, id, false))}>{tx('حاكِ الرفض', 'Simulate rejection')}</button>
    </div>
  );
  if (step.state === 'ready') {
    return <p className="small m-step-done">{tx('القيمة المحفوظة:', 'Saved value:')} <bdi>{step.value.replace(/^(free|custom):/, '')}</bdi></p>;
  }
  if (id === 'business') {
    return (
      <div className="m-step-body">
        <Field id="su-biz" label={tx('الاسم القانوني', 'Legal name')} error={err || undefined}>
          <input id="su-biz" className="input" value={a} onChange={(e) => { setA(e.target.value); setErr(''); }} aria-invalid={!!err} disabled={step.state === 'verifying'} />
        </Field>
        {step.state === 'rejected' && <Alert tone="danger">{tx('رُفض الطلب: الاسم لا يطابق السجل التجاري (محاكاة). عدّل وأعد الإرسال.', 'Rejected: the name does not match the commercial registration (simulated). Edit and resubmit.')}</Alert>}
        {step.state !== 'verifying' && (
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => { if (!a.trim()) { setErr(tx('أدخل الاسم.', 'Enter the name.')); return; } set((s) => submitStep(enterStep(s, id, a.trim()), id)); }}>{tx('احفظ وأرسل للتحقق (محاكاة)', 'Save and submit for verification (simulated)')}</button>
          </div>
        )}
        {verifyTools}
      </div>
    );
  }
  if (id === 'product') {
    return (
      <div className="m-step-body m-row-fields">
        <Field id="su-pn" label={tx('اسم المنتج', 'Product name')}><input id="su-pn" className="input" value={a} onChange={(e) => { setA(e.target.value); setErr(''); }} /></Field>
        <Field id="su-pp" label={tx('السعر (ر.س)', 'Price (SAR)')} error={err || undefined}><input id="su-pp" className="input" inputMode="decimal" dir="ltr" value={b} onChange={(e) => { setB(e.target.value); setErr(''); }} aria-invalid={!!err} /></Field>
        <button type="button" className="btn primary" onClick={() => {
          const p = parseMoney(b);
          if (!a.trim() || !p) { setErr(tx('أدخل اسمًا وسعرًا أكبر من صفر.', 'Enter a name and a price above zero.')); return; }
          set((s) => enterStep(s, id, a.trim()));
        }}>{tx('احفظ المنتج', 'Save product')}</button>
      </div>
    );
  }
  if (id === 'payment') {
    return (
      <div className="m-step-body">
        {step.state === 'todo' || step.state === 'rejected' ? (
          <div className="m-row-fields">
            <Field id="su-pay" label={tx('مزود الدفع', 'Payment provider')}>
              <select id="su-pay" className="input" value={a} onChange={(e) => setA(e.target.value)}>
                <option value="mada">{tx('مدى (تجريبي)', 'Mada (test)')}</option><option value="cards">{tx('بطاقات دولية (تجريبي)', 'International cards (test)')}</option>
              </select>
            </Field>
            <button type="button" className="btn primary" onClick={() => set((s) => enterStep(s, id, a))}>{tx('احفظ الاختيار', 'Save choice')}</button>
          </div>
        ) : step.state === 'entered' ? (
          <div className="actions"><span className="small">{tx('حُفظ الاختيار. الإرسال للمزود خطوة منفصلة.', 'Choice saved. Submitting to the provider is a separate step.')}</span>
            <button type="button" className="btn primary" onClick={() => set((s) => submitStep(s, id))}>{tx('أرسل للمزود (محاكاة)', 'Submit to provider (simulated)')}</button> <Sim /></div>
        ) : null}
        {step.state === 'rejected' && <Alert tone="danger">{tx('رفض المزود الطلب (محاكاة): مستند الحساب البنكي غير واضح.', 'The provider declined (simulated): bank account document unclear.')}</Alert>}
        {verifyTools}
      </div>
    );
  }
  if (id === 'shipping') {
    return (
      <div className="m-step-body m-row-fields">
        <Field id="su-ship" label={tx('سعر ثابت لكل المملكة (ر.س)', 'Flat rate for Saudi Arabia (SAR)')} error={err || undefined}><input id="su-ship" className="input" inputMode="decimal" dir="ltr" value={b} onChange={(e) => { setB(e.target.value); setErr(''); }} aria-invalid={!!err} /></Field>
        <button type="button" className="btn primary" onClick={() => { const p = parseMoney(b); if (p === null) { setErr(tx('أدخل مبلغًا صالحًا (يمكن 0 للشحن المجاني).', 'Enter a valid amount (0 for free shipping).')); return; } set((s) => enterStep(s, id, `${b} SAR`)); }}>{tx('احفظ الشحن', 'Save shipping')}</button>
      </div>
    );
  }
  if (id === 'domain') {
    if (step.state === 'verifying') {
      return (
        <div className="m-step-body">
          <p className="small">{tx('أضف هذا السجل لدى مزود نطاقك، ثم انتظر التحقق:', 'Add this record at your domain provider, then wait for the check:')}</p>
          <code className="m-code" dir="ltr">CNAME  {step.value.replace('custom:', '')}  →  stores.platform.example</code>
          <div className="m-simtools"><span className="small muted">{tx('أداة اختبار:', 'Test tool:')}</span>
            <button type="button" className="btn small" onClick={() => set((s) => s.map((x) => (x.id === 'domain' ? { ...x, state: 'ready' } : x)))}>{tx('حاكِ نجاح التحقق', 'Simulate DNS verified')}</button></div>
        </div>
      );
    }
    return (
      <div className="m-step-body">
        <fieldset className="m-inline-radios"><legend className="sr">{tx('نوع العنوان', 'Address type')}</legend>
          <label className="check"><input type="radio" checked={mode === 'free'} onChange={() => setMode('free')} /> {tx('مسار مجاني', 'Free path')}</label>
          <label className="check"><input type="radio" checked={mode === 'custom'} onChange={() => setMode('custom')} /> {tx('نطاق خاص', 'Custom domain')}</label>
        </fieldset>
        <div className="m-row-fields">
          {mode === 'free'
            ? <Field id="su-slug" label={tx('المسار', 'Path')} hint={<bdi dir="ltr">platform.example/{a || '…'}</bdi>} error={err || undefined}><input id="su-slug" className="input" dir="ltr" value={a} onChange={(e) => { setA(e.target.value.toLowerCase()); setErr(''); }} aria-invalid={!!err} /></Field>
            : <Field id="su-host" label={tx('النطاق', 'Domain')} error={err || undefined}><input id="su-host" className="input" dir="ltr" placeholder="shop.example.com" value={b} onChange={(e) => { setB(e.target.value); setErr(''); }} aria-invalid={!!err} /></Field>}
          <button type="button" className="btn primary" onClick={() => {
            if (mode === 'free') { if (!validSlug(a)) { setErr(tx('حروف لاتينية صغيرة وأرقام وشرطات، 3–40 حرفًا.', 'Lowercase letters, digits and hyphens, 3–40 characters.')); return; } set((s) => enterStep(s, id, `free:${a}`)); }
            else { if (!validHost(b)) { setErr(tx('أدخل نطاقًا صالحًا مثل shop.example.com.', 'Enter a valid domain such as shop.example.com.')); return; } set((s) => enterStep(s, id, `custom:${b.trim().toLowerCase()}`)); }
          }}>{tx('احفظ العنوان', 'Save address')}</button>
        </div>
      </div>
    );
  }
  if (id === 'policies') {
    return (
      <div className="m-step-body">
        <Field id="su-pol" label={tx('نص سياسة الاسترجاع', 'Return policy text')} error={err || undefined}>
          <textarea id="su-pol" className="input" value={a} onChange={(e) => { setA(e.target.value); setErr(''); }} aria-invalid={!!err} />
        </Field>
        <button type="button" className="btn primary" onClick={() => { if (a.trim().length < 20) { setErr(tx('اكتب 20 حرفًا على الأقل.', 'Write at least 20 characters.')); return; } set((s) => enterStep(s, id, a.trim().slice(0, 40) + '…')); }}>{tx('احفظ السياسة', 'Save policy')}</button>
      </div>
    );
  }
  return (
    <div className="m-step-body">
      <button type="button" className="btn primary" disabled={!canTest} onClick={() => setupStore.set(placeTestOrder)}>{tx('ضع طلبًا تجريبيًا (محاكاة)', 'Place a test order (simulated)')}</button>
      {!canTest && <p className="small muted">{tx('غير متاح بعد: يلزم أن يكون المنتج والدفع والشحن «جاهز».', 'Not available yet: product, payment and shipping must be “Ready”.')}</p>}
    </div>
  );
}
