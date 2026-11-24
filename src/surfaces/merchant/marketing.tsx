import { useEffect, useState } from 'react';
import type { Route } from '../../core/router';
import { Alert, Badge, Dialog, Field, LinkTabs, PageHeader, Sim, type Tone } from '../../core/ui';
import { formatMoney } from './domain';
import { parseMoney } from './catalog';
import {
  EXCLUSIONS, TEST_RATE, applyCoupon, audience, couponConflicts, couponFromDraft, estimateCost, simSendFails, validateCoupon,
  type Coupon, type CouponDraft, type CouponStatus, type Exclusion, type MsgChannel,
} from './growth';
import { can } from './perms';
import { cartsStore, couponsStore, testStore } from './stores';
import { ActionLocked, KV, Money, Progress, mhref, useTx } from './kit';

const C_TONE: Record<CouponStatus, Tone> = { active: 'success', paused: 'warning', draft: 'neutral', expired: 'neutral' };
const SAMPLES = [
  { id: 's1', subtotal: 48600, shipping: 2500, customerUses: 0 },
  { id: 's2', subtotal: 9800, shipping: 2500, customerUses: 0 },
  { id: 's3', subtotal: 74200, shipping: 0, customerUses: 1 },
];

export function MarketingPage({ route }: { route: Route }) {
  const tx = useTx();
  const tab = route.query.get('tab') === 'campaigns' ? 'campaigns' : 'coupons';
  return (
    <>
      <PageHeader title={tx('التسويق والعروض', 'Marketing & offers')} sub={tx('المعاينات توضح الأثر على طلب مثال وليست وعدًا بمبيعات. لا يُرسل أي شيء فعليًا من هذه المعاينة.', 'Previews show the effect on a sample order; they are not a sales promise. Nothing is actually sent from this preview.')} />
      <LinkTabs label={tx('أقسام التسويق', 'Marketing sections')} items={[
        { href: mhref('marketing'), label: tx('الكوبونات', 'Coupons'), current: tab === 'coupons' },
        { href: mhref('marketing', { tab: 'campaigns' }), label: tx('حملة السلال المتروكة', 'Abandoned-cart campaign'), current: tab === 'campaigns' },
      ]} />
      {tab === 'coupons' ? <Coupons create={route.query.get('create') === '1'} /> : <Campaign />}
    </>
  );
}

function useCouponText() {
  const tx = useTx();
  return {
    status: (s: CouponStatus) => ({ active: tx('نشط', 'Active'), paused: tx('موقوف', 'Paused'), draft: tx('مسودة', 'Draft'), expired: tx('منتهي', 'Expired') })[s],
    value: (c: Coupon) => (c.type === 'percent' ? tx(`خصم ${c.value}%`, `${c.value}% off`) : c.type === 'fixed' ? tx(`خصم ${formatMoney(c.value)} ر.س`, `SAR ${formatMoney(c.value)} off`) : tx('شحن مجاني', 'Free shipping')),
    cond: (c: Coupon) => [
      c.minSpend ? tx(`حد أدنى ${formatMoney(c.minSpend)} ر.س`, `Min. SAR ${formatMoney(c.minSpend)}`) : tx('بلا حد أدنى', 'No minimum'),
      c.limitPerCustomer ? tx(`${c.limitPerCustomer} لكل عميل`, `${c.limitPerCustomer} per customer`) : null,
    ].filter(Boolean).join(' · '),
  };
}

function Coupons({ create }: { create: boolean }) {
  const tx = useTx();
  const ct = useCouponText();
  const coupons = couponsStore.use();
  const role = testStore.use().role;
  const canManage = can(role, 'marketing.manage');
  const [form, setForm] = useState(create && canManage);
  const [confirm, setConfirm] = useState<{ code: string; to: CouponStatus } | null>(null);
  const setStatus = (code: string, status: CouponStatus) => couponsStore.set((cs) => cs.map((c) => (c.code === code ? { ...c, status } : c)));
  return (
    <>
      <div className="toolbar">
        <p className="small muted">{tx('كود واحد لكل طلب؛ الكوبونات لا تتراكم.', 'One code per order; coupons do not stack.')}</p>
        {canManage ? !form && <button type="button" className="btn primary" onClick={() => setForm(true)}>{tx('كوبون جديد', 'New coupon')}</button> : <ActionLocked>{tx('دورك لا يشمل إدارة العروض.', 'Your role does not include managing offers.')}</ActionLocked>}
      </div>
      {form && <CouponForm onDone={() => setForm(false)} />}
      <section className="card" aria-labelledby="cp-h">
        <div className="card-head"><h2 id="cp-h">{tx('الكوبونات', 'Coupons')}</h2></div>
        <ul className="queue">
          {coupons.map((c) => {
            const limitReached = c.limitTotal !== null && c.used >= c.limitTotal;
            return (
              <li key={c.code}>
                <div className="grow">
                  <div className="strong"><bdi dir="ltr">{c.code}</bdi> · {ct.value(c)} <Badge tone={C_TONE[c.status]}>{ct.status(c.status)}</Badge>{limitReached && <Badge tone="warning">{tx('بلغ الحد', 'Limit reached')}</Badge>}</div>
                  <div className="small muted">{ct.cond(c)} · {tx('الاستخدام', 'Used')} <bdi>{c.used}</bdi>{c.limitTotal !== null && <> / <bdi>{c.limitTotal}</bdi></>} · <bdi dir="ltr">{c.starts} → {c.ends ?? '∞'}</bdi></div>
                  {couponConflicts(c, coupons).length > 0 && c.status !== 'expired' && <div className="small m-warn">{tx('ينافس: ', 'Competes with: ')}{couponConflicts(c, coupons).map((x) => x.code).join(', ')}</div>}
                </div>
                {canManage && (c.status === 'active'
                  ? <button type="button" className="btn small" onClick={() => setConfirm({ code: c.code, to: 'paused' })}>{tx('أوقف', 'Pause')}</button>
                  : c.status !== 'expired' && <button type="button" className="btn small" onClick={() => setConfirm({ code: c.code, to: 'active' })}>{tx('فعّل', 'Activate')}</button>)}
              </li>
            );
          })}
        </ul>
      </section>
      {confirm && (
        <Dialog title={confirm.to === 'active' ? tx(`تفعيل ${confirm.code}`, `Activate ${confirm.code}`) : tx(`إيقاف ${confirm.code}`, `Pause ${confirm.code}`)} onClose={() => setConfirm(null)}
          footer={<><button type="button" className="btn primary" onClick={() => { setStatus(confirm.code, confirm.to); setConfirm(null); }}>{confirm.to === 'active' ? tx('فعّل', 'Activate') : tx('أوقف', 'Pause')}</button><button type="button" className="btn" onClick={() => setConfirm(null)}>{tx('إلغاء', 'Cancel')}</button></>}>
          <p>{confirm.to === 'active' ? tx('سيقبل المتجر الكود فورًا في كل القنوات وفق شروطه. لا يُرسل للعملاء تلقائيًا.', 'The store accepts the code immediately in all channels under its conditions. It is not sent to customers automatically.')
            : tx('يتوقف قبول الكود في الطلبات الجديدة. الطلبات التي استخدمته تبقى كما هي.', 'The code stops working for new orders. Orders that used it stay unchanged.')}</p>
        </Dialog>
      )}
    </>
  );
}

function CouponForm({ onDone }: { onDone: () => void }) {
  const tx = useTx();
  const ct = useCouponText();
  const coupons = couponsStore.use();
  const [d, setD] = useState<CouponDraft>({ code: '', type: 'percent', value: '10', minSpend: '', limitTotal: '', limitPerCustomer: '1', starts: '2026-11-24', ends: '' });
  const [sample, setSample] = useState('s1');
  const [tried, setTried] = useState(false);
  const errors = validateCoupon(d, coupons.map((c) => c.code), parseMoney);
  const ok = Object.keys(errors).length === 0;
  const preview = ok ? couponFromDraft(d, parseMoney) : null;
  const s = SAMPLES.find((x) => x.id === sample)!;
  const eff = preview && applyCoupon({ ...preview, status: 'active' }, s);
  const conflicts = preview ? couponConflicts(preview, coupons) : [];
  const set = (p: Partial<CouponDraft>) => setD({ ...d, ...p });
  const err = (k: string) => tried && errors[k] ? ({ code: tx('4–16 حرفًا لاتينيًا كبيرًا أو رقمًا.', '4–16 uppercase Latin letters or digits.'), codeTaken: tx('الكود مستخدم.', 'Code already used.'), percent: tx('نسبة من 1 إلى 90.', 'A percent from 1 to 90.'), money: tx('مبلغ غير صالح.', 'Invalid amount.'), limit: tx('عدد صحيح 1 أو أكثر.', 'A whole number, 1 or more.'), dates: tx('تاريخ النهاية بعد البداية (YYYY-MM-DD).', 'End after start (YYYY-MM-DD).'), value: '', compareAt: '' } as Record<string, string>)[errors[k]] : undefined;
  const save = (status: CouponStatus) => { setTried(true); if (!ok || !preview) return; couponsStore.set((cs) => [{ ...preview, status }, ...cs]); onDone(); };
  const block = eff?.block;
  return (
    <section className="card pad" aria-labelledby="cf-h">
      <h2 id="cf-h">{tx('كوبون جديد', 'New coupon')}</h2>
      <div className="grid-2">
        <Field id="cf-code" label={tx('الكود', 'Code')} error={err('code')}><input id="cf-code" className="input" dir="ltr" value={d.code} aria-invalid={!!err('code')} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, '') })} /></Field>
        <Field id="cf-type" label={tx('النوع', 'Type')}>
          <select id="cf-type" className="input" value={d.type} onChange={(e) => set({ type: e.target.value as CouponDraft['type'] })}>
            <option value="percent">{tx('نسبة مئوية', 'Percentage')}</option><option value="fixed">{tx('مبلغ ثابت', 'Fixed amount')}</option><option value="freeShip">{tx('شحن مجاني', 'Free shipping')}</option>
          </select>
        </Field>
        {d.type !== 'freeShip' && <Field id="cf-val" label={d.type === 'percent' ? tx('النسبة %', 'Percent %') : tx('المبلغ (ر.س)', 'Amount (SAR)')} error={err('value')}><input id="cf-val" className="input" dir="ltr" inputMode="decimal" value={d.value} aria-invalid={!!err('value')} onChange={(e) => set({ value: e.target.value })} /></Field>}
        <Field id="cf-min" label={tx('حد أدنى للمنتجات (ر.س، اختياري)', 'Minimum items subtotal (SAR, optional)')} error={err('minSpend')}><input id="cf-min" className="input" dir="ltr" inputMode="decimal" value={d.minSpend} onChange={(e) => set({ minSpend: e.target.value })} /></Field>
        <Field id="cf-lt" label={tx('حد الاستخدام الكلي (اختياري)', 'Total usage limit (optional)')} error={err('limitTotal')}><input id="cf-lt" className="input" dir="ltr" inputMode="numeric" value={d.limitTotal} onChange={(e) => set({ limitTotal: e.target.value })} /></Field>
        <Field id="cf-lc" label={tx('لكل عميل (اختياري)', 'Per customer (optional)')} error={err('limitPerCustomer')}><input id="cf-lc" className="input" dir="ltr" inputMode="numeric" value={d.limitPerCustomer} onChange={(e) => set({ limitPerCustomer: e.target.value })} /></Field>
        <Field id="cf-s" label={tx('يبدأ', 'Starts')} error={err('dates')}><input id="cf-s" className="input" type="date" dir="ltr" value={d.starts} onChange={(e) => set({ starts: e.target.value })} /></Field>
        <Field id="cf-e" label={tx('ينتهي (اختياري)', 'Ends (optional)')}><input id="cf-e" className="input" type="date" dir="ltr" value={d.ends} onChange={(e) => set({ ends: e.target.value })} /></Field>
      </div>
      <div className="m-preview">
        <h3>{tx('معاينة على طلب مثال', 'Preview on a sample order')}</h3>
        <div className="m-row-fields">
          <label className="sr" htmlFor="cf-sample">{tx('طلب مثال', 'Sample order')}</label>
          <select id="cf-sample" className="input" value={sample} onChange={(e) => setSample(e.target.value)}>
            {SAMPLES.map((x) => <option key={x.id} value={x.id}>{tx(`منتجات ${formatMoney(x.subtotal)} + شحن ${formatMoney(x.shipping)}${x.customerUses ? ' · عميل استخدمه سابقًا' : ''}`, `Items ${formatMoney(x.subtotal)} + shipping ${formatMoney(x.shipping)}${x.customerUses ? ' · customer used it before' : ''}`)}</option>)}
          </select>
        </div>
        {!preview ? <p className="small muted">{tx('أكمل الحقول الصحيحة لعرض المعاينة.', 'Complete valid fields to see the preview.')}</p> : (
          <>
            <KV rows={[[tx('قبل', 'Before'), <Money v={eff!.before} />], [tx('الخصم', 'Discount'), <Money v={eff!.discount + eff!.shippingOff} />], [tx('بعد', 'After'), <span className="strong"><Money v={eff!.total} /></span>]]} />
            {block && <p className="small m-warn">{({ minSpend: tx('لا ينطبق: أقل من الحد الأدنى.', 'Does not apply: below the minimum.'), perCustomer: tx('لا ينطبق: العميل بلغ حده.', 'Does not apply: customer reached their limit.'), limit: tx('لا ينطبق: بلغ حد الاستخدام.', 'Does not apply: usage limit reached.'), inactive: tx('لا ينطبق: خارج فترة الصلاحية.', 'Does not apply: outside its dates.') })[block]}</p>}
            <p className="small muted">{tx('الضريبة مشمولة في الأسعار وتُحسب على المبلغ بعد الخصم.', 'VAT is included in prices and applies to the amount after discount.')} {ct.value(preview)}.</p>
          </>
        )}
        {conflicts.length > 0 && <Alert tone="warning" title={tx('تعارض:', 'Conflict:')}>{tx(`كوبونات من النوع نفسه تعمل في الفترة نفسها: ${conflicts.map((c) => c.code).join(', ')}. العميل يستخدم كودًا واحدًا لكل طلب.`, `Coupons of the same kind run in the same period: ${conflicts.map((c) => c.code).join(', ')}. A customer uses one code per order.`)}</Alert>}
      </div>
      <div className="actions">
        <button type="button" className="btn primary" onClick={() => save('draft')}>{tx('احفظ مسودة', 'Save as draft')}</button>
        <button type="button" className="btn" onClick={onDone}>{tx('إلغاء', 'Cancel')}</button>
      </div>
      <p className="small muted">{tx('التفعيل خطوة منفصلة من القائمة بعد المراجعة.', 'Activation is a separate step from the list after review.')}</p>
    </section>
  );
}

function Campaign() {
  const tx = useTx();
  const carts = cartsStore.use();
  const role = testStore.use().role;
  const [ch, setCh] = useState<MsgChannel>('email');
  const [minHours, setMinHours] = useState(4);
  const [text, setText] = useState(tx('نسيت شيئًا في سلتك؟ أكمل طلبك متى ناسبك.', 'Left something in your cart? Complete your order whenever suits you.'));
  const [review, setReview] = useState(false);
  const [job, setJob] = useState<{ queue: string[]; done: number; failed: number; cancelled: boolean; running: boolean } | null>(null);
  const a = audience(carts, ch, minHours);
  const reason: Record<Exclusion, string> = {
    purchased: tx('اشترى بعد ترك السلة', 'Purchased after abandoning'), optedOut: tx('ألغى الاشتراك', 'Opted out'), tooRecent: tx('تُركت السلة منذ وقت قصير', 'Cart abandoned too recently'),
    automation: tx('وصلته رسالة من أتمتة السلة خلال 24 ساعة', 'Messaged by the cart automation in the last 24h'), noConsent: tx('لا موافقة على هذه القناة', 'No consent for this channel'),
  };
  useEffect(() => {
    if (!job?.running) return;
    const t = setTimeout(() => {
      const batch = job.queue.slice(job.done, job.done + 3);
      const failed = carts.filter((c) => batch.includes(c.id) && simSendFails(c)).length;
      const done = job.done + batch.length;
      setJob({ ...job, done, failed: job.failed + failed, running: done < job.queue.length });
    }, 250);
    return () => clearTimeout(t);
  }, [job, carts]);
  if (!can(role, 'marketing.send')) return <ActionLocked>{tx('دورك لا يشمل إرسال الحملات.', 'Your role does not include sending campaigns.')}</ActionLocked>;
  return (
    <>
      <section className="card pad" aria-labelledby="cm-h">
        <h2 id="cm-h">{tx('استرجاع السلال المتروكة', 'Recover abandoned carts')}</h2>
        <div className="grid-2">
          <Field id="cm-ch" label={tx('القناة', 'Channel')}>
            <select id="cm-ch" className="input" value={ch} onChange={(e) => setCh(e.target.value as MsgChannel)} disabled={!!job}>
              <option value="email">{tx('بريد إلكتروني', 'Email')}</option><option value="sms">{tx('رسالة نصية', 'SMS')}</option>
            </select>
          </Field>
          <Field id="cm-h2" label={tx('أقدم من', 'Abandoned at least')}>
            <select id="cm-h2" className="input" value={minHours} onChange={(e) => setMinHours(Number(e.target.value))} disabled={!!job}>
              {[1, 4, 24].map((h) => <option key={h} value={h}>{tx(`${h} ساعة`, `${h} hour(s)`)}</option>)}
            </select>
          </Field>
        </div>
        <Field id="cm-t" label={tx('نص الرسالة', 'Message text')} hint={tx('بلا خصم تلقائي؛ أضف كودًا يدويًا إن أردت.', 'No automatic discount; add a code yourself if you want.')}><textarea id="cm-t" className="input" value={text} onChange={(e) => setText(e.target.value)} disabled={!!job} /></Field>
        <div className="m-grid-2">
          <div>
            <h3>{tx('الجمهور', 'Audience')}</h3>
            <KV rows={[[<span className="strong">{tx('مؤهل للإرسال', 'Eligible')}</span>, <span className="strong">{a.eligible.length}</span>], [tx('مستبعد', 'Excluded'), a.excludedTotal]]} />
            <ul className="m-list small">{EXCLUSIONS.filter((x) => a.excluded[x]).map((x) => <li key={x}>{reason[x]}: <bdi>{a.excluded[x]}</bdi></li>)}</ul>
          </div>
          <div>
            <h3>{tx('التكلفة التقديرية', 'Estimated cost')} <Sim /></h3>
            <KV rows={[[tx('عدد الرسائل', 'Messages'), a.eligible.length], [tx('سعر اختبار للرسالة', 'Test rate per message'), <Money v={TEST_RATE[ch]} />], [tx('الإجمالي التقديري', 'Estimated total'), <span className="strong"><Money v={estimateCost(a.eligible.length, ch)} /></span>]]} />
            <p className="small muted">{tx('سعر اختبار توضيحي وليس تسعير مزود أو «لك».', 'An illustrative test rate, not provider or LAK pricing.')}</p>
          </div>
        </div>
        {!job && <button type="button" className="btn primary" disabled={!a.eligible.length || !text.trim()} onClick={() => setReview(true)}>{tx('مراجعة قبل الإرسال', 'Review before sending')}</button>}
      </section>
      {job && (
        <section className="card pad" aria-labelledby="cj-h" aria-live="polite">
          <h2 id="cj-h">{job.running ? tx('جارٍ الإرسال (محاكاة)…', 'Sending (simulated)…') : job.cancelled ? tx('أُلغي الإرسال', 'Sending cancelled') : tx('اكتمل الإرسال (محاكاة)', 'Sending finished (simulated)')}</h2>
          <Progress value={job.done} max={job.queue.length} label={tx('تقدم الإرسال', 'Send progress')} />
          <KV rows={[[tx('سُلّم للمزود', 'Handed to provider'), job.done - job.failed], [tx('فشل (رقم/بريد غير صالح)', 'Failed (invalid address)'), job.failed], [tx('لم يُرسل', 'Not sent'), job.queue.length - job.done]]} />
          {job.running && <button type="button" className="btn" onClick={() => setJob({ ...job, running: false, cancelled: true })}>{tx('أوقف ما تبقى', 'Stop the rest')}</button>}
          <p className="small muted">{tx('الإيقاف يمنع الرسائل المتبقية فقط؛ ما أُرسل لا يمكن استرجاعه. لم يخرج أي شيء فعليًا من هذه المعاينة.', 'Stopping prevents the remaining messages only; sent ones cannot be recalled. Nothing actually left this preview.')}</p>
          {!job.running && <button type="button" className="btn" onClick={() => setJob(null)}>{tx('حملة جديدة', 'New campaign')}</button>}
        </section>
      )}
      {review && (
        <Dialog title={tx('تأكيد إرسال الحملة', 'Confirm sending the campaign')} onClose={() => setReview(false)}
          footer={<><button type="button" className="btn primary" onClick={() => { setReview(false); setJob({ queue: a.eligible.map((c) => c.id), done: 0, failed: 0, cancelled: false, running: true }); }}>{tx(`أرسل ${a.eligible.length} رسالة (محاكاة)`, `Send ${a.eligible.length} messages (simulated)`)}</button><button type="button" className="btn" onClick={() => setReview(false)}>{tx('إلغاء', 'Cancel')}</button></>}>
          <KV rows={[[tx('القناة', 'Channel'), ch === 'email' ? tx('بريد', 'Email') : 'SMS'], [tx('المستلمون', 'Recipients'), tx(`${a.eligible.length} موافقون على القناة`, `${a.eligible.length} with consent for this channel`)], [tx('المستبعدون', 'Excluded'), a.excludedTotal], [tx('التكلفة التقديرية', 'Estimated cost'), <Money v={estimateCost(a.eligible.length, ch)} />]]} />
          <p className="muted">{tx('لا يمكن استرجاع الرسائل بعد إرسالها.', 'Messages cannot be recalled once sent.')} <Sim /></p>
        </Dialog>
      )}
    </>
  );
}
