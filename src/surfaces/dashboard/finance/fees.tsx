// Fee calculator (`#/dashboard/finance?tab=billing&part=fees`): order value, method mix and refunds → provider fees
// and LAK's fee shown apart, net, and when money reaches the bank. Every rate is an editable placeholder; LAK's fee and
// payout term are «بانتظار الاعتماد». Inputs are kept for the session (leave and return restores them).
import type { ReactNode } from 'react';
import { Calculator, CalendarClock, Eraser, FlaskConical, ShoppingBag } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { ordersStore } from '../../merchant/stores';
import { total } from '../../merchant/domain';
import {
  FEE_METHODS, emptyFeeInput, estimateFees, exampleFeeInput, feeFromOrders, feeOk, parseNum, payoutDate, validateFees, type FeeErr, type FeeInput, type FeeMethod, type FeeRate,
} from '../../merchant/commercial';
import { feeCalcStore } from '../../merchant/commercial-store';
import { Badge, Button, InfoHint, Money, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input } from '../../../ds/kit';
import { DecisionMarker, Pending } from '../settings/decision-marker';

const TODAY = '2026-11-25';

export default function FeeCalculator() {
  const tx = useTx();
  const { lang } = useLang();
  const i = feeCalcStore.use();
  const orders = ordersStore.use();
  const set = (patch: Partial<FeeInput>) => feeCalcStore.set((c) => ({ ...c, ...patch }));
  const setMix = (m: FeeMethod, v: string) => set({ mix: { ...i.mix, [m]: v } });
  const setRate = (m: FeeMethod, k: keyof FeeRate, v: string) => set({ rates: { ...i.rates, [m]: { ...i.rates[m], [k]: v } } });
  const e = validateFees(i);
  const ok = feeOk(e);
  const r = estimateFees(i);
  const started = JSON.stringify(i) !== JSON.stringify(emptyFeeInput());
  const fromOrders = () => {
    const d = feeFromOrders(orders.map((o) => ({ method: o.payment?.method, total: total(o), refunded: o.pay === 'refunded' })));
    set({ aov: d.aov, orders: d.orders, mix: d.mix, refundPct: d.refundPct });
  };
  const errText = (x?: FeeErr) => x === 'required' ? tx('مطلوب', 'Required') : x === 'number' ? tx('رقم فقط', 'Numbers only') : x === 'pct' ? tx('من 0 إلى 100', '0 to 100') : x === 'mix' ? tx('مجموع الحصص يجب أن يكون 100%', 'Shares must total 100%') : null;
  const method = (m: FeeMethod) => ({ mada: tx('مدى', 'mada'), card: tx('فيزا وماستركارد', 'Visa & Mastercard'), applepay: 'Apple Pay', bnpl: tx('تقسيط (تابي/تمارا)', 'BNPL (Tabby/Tamara)'), cod: tx('الدفع عند الاستلام', 'Cash on delivery') })[m];
  const mixSum = FEE_METHODS.reduce((a, m) => a + (parseNum(i.mix[m]) ?? 0), 0);
  const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const num = (v: string, on: (s: string) => void, label: string, err?: string | null, placeholder = '—') => (
    <Input aria-label={label} aria-invalid={err ? true : undefined} inputMode="decimal" dir="ltr" value={v} onChange={(ev) => on(ev.target.value)} placeholder={placeholder} className={cn('h-9 text-center', err && 'border-red-500')} />
  );

  return (
    <div className="space-y-6 p-4 sm:p-5">
      <Alert tone="warn" title={tx('مثال للتجربة — الرسوم بانتظار الاعتماد', 'Example for trying — fees pending approval')}
        action={<DecisionMarker id="txFees" />}>
        {tx('كل النسب هنا تكتبها أنت. رسوم «لك» وموعد التحويل الحقيقيان يصدران من «لك» بعد الاعتماد؛ هذه ليست عرض سعر.', 'You type every rate here. LAK’s real fee and payout term come from LAK after approval; this is not a quote.')}
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={fromOrders}><ShoppingBag className="size-4" aria-hidden="true" />{tx('استخدم طلباتي الفعلية', 'Use my actual orders')}</Button>
        <Button variant="secondary" size="sm" onClick={() => feeCalcStore.set((c) => ({ ...exampleFeeInput(), aov: c.aov || exampleFeeInput().aov, orders: c.orders || exampleFeeInput().orders }))}><FlaskConical className="size-4" aria-hidden="true" />{tx('املأ النسب بمثال للتجربة', 'Fill rates with an example')}</Button>
        {started && <Button variant="ghost" size="sm" onClick={() => feeCalcStore.set(emptyFeeInput())}><Eraser className="size-4" aria-hidden="true" />{tx('ابدأ من جديد', 'Start over')}</Button>}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <section aria-labelledby="h-orders" className="rounded-2xl border border-border p-4 sm:p-5">
            <h3 id="h-orders" className="mb-3 text-[15px] font-semibold text-fg">{tx('طلباتك في الشهر', 'Your orders per month')}</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={tx('متوسط قيمة الطلب (ر.س)', 'Average order (SAR)')} error={errText(e.aov)}>{(p) => <Input {...p} inputMode="decimal" dir="ltr" value={i.aov} onChange={(ev) => set({ aov: ev.target.value })} placeholder="250" />}</Field>
              <Field label={tx('عدد الطلبات', 'Orders')} error={errText(e.orders)}>{(p) => <Input {...p} inputMode="numeric" dir="ltr" value={i.orders} onChange={(ev) => set({ orders: ev.target.value })} placeholder="400" />}</Field>
              <Field label={tx('نسبة المسترد %', 'Refunded %')} error={errText(e.refundPct)} optional>{(p) => <Input {...p} inputMode="decimal" dir="ltr" value={i.refundPct} onChange={(ev) => set({ refundPct: ev.target.value })} placeholder="0" />}</Field>
            </div>
          </section>

          <section aria-labelledby="h-mix" className="rounded-2xl border border-border">
            <div className="flex flex-wrap items-center gap-2 px-4 pt-4 sm:px-5">
              <h3 id="h-mix" className="min-w-0 flex-1 text-[15px] font-semibold text-fg">{tx('طرق الدفع ورسوم المزود', 'Methods and provider fees')}</h3>
              <InfoHint>{tx('اكتب نسب عقدك مع مزود الدفع إن وُجد. «لك» لا تحدد رسوم المزود.', 'Type the rates from your payment-provider contract, if any. LAK does not set provider fees.')}</InfoHint>
              <Badge tone={Math.abs(mixSum - 100) < 0.01 ? 'green' : 'amber'}><bdi className="tabular-nums">{Math.round(mixSum * 10) / 10}%</bdi></Badge>
            </div>
            {e.mix && <p className="px-4 pt-2 text-xs font-medium text-red-600 sm:px-5 dark:text-red-400">{errText(e.mix)}</p>}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[440px] text-sm">
                <thead className="border-y border-border bg-surface-2/60 text-xs text-muted"><tr>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">{tx('الطريقة', 'Method')}</th>
                  <th scope="col" className="w-24 px-2 py-2 text-center font-semibold">{tx('الحصة %', 'Share %')}</th>
                  <th scope="col" className="w-24 px-2 py-2 text-center font-semibold">{tx('نسبة %', 'Rate %')}</th>
                  <th scope="col" className="w-24 px-2 py-2 text-center font-semibold">{tx('ثابت ر.س', 'Fixed SAR')}</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {FEE_METHODS.map((m) => (
                    <tr key={m}>
                      <th scope="row" className="px-4 py-2 text-start font-medium text-fg">{method(m)}</th>
                      <td className="px-2 py-2">{num(i.mix[m], (v) => setMix(m, v), `${method(m)} ${tx('الحصة', 'share')}`, e.mix === 'number' ? 'x' : null, '0')}</td>
                      <td className="px-2 py-2">{num(i.rates[m].pct, (v) => setRate(m, 'pct', v), `${method(m)} ${tx('النسبة', 'rate')}`, e.rates?.[m] ? 'x' : null)}</td>
                      <td className="px-2 py-2">{num(i.rates[m].fixed, (v) => setRate(m, 'fixed', v), `${method(m)} ${tx('الثابت', 'fixed')}`, e.rates?.[m] ? 'x' : null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {e.rates && <p className="px-4 pb-1 pt-2 text-xs font-medium text-red-600 sm:px-5 dark:text-red-400">{tx('النسبة من 0 إلى 100 والثابت رقم', 'Rate 0–100; fixed must be a number')}</p>}
            <p className="px-4 pb-4 pt-2 text-[11px] text-subtle sm:px-5">{tx('تقبل الأرقام العربية. الخانة الفارغة = صفر.', 'Arabic digits accepted. Blank = zero.')}</p>
          </section>

          <section aria-labelledby="h-lak" className="rounded-2xl border border-amber-500/30 bg-amber-500/[.04] p-4 sm:p-5">
            <h3 id="h-lak" className="mb-1 flex flex-wrap items-center gap-2 text-[15px] font-semibold text-fg">{tx('رسوم «لك» وموعد التحويل', 'LAK fee and payout timing')}<Pending /></h3>
            <p className="mb-3 text-xs text-muted">{tx('اتركها فارغة لترى الحساب دون رسوم «لك»، أو جرّب قيمة.', 'Leave blank to see the result without a LAK fee, or try a value.')}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={<span className="flex items-center gap-1.5">{tx('نسبة لك %', 'LAK rate %')}<Badge tone="amber">{tx('مثال', 'Example')}</Badge></span>} error={e.rates?.lak ? errText('pct') : null}>{(p) => <Input {...p} inputMode="decimal" dir="ltr" value={i.lak.pct} onChange={(ev) => set({ lak: { ...i.lak, pct: ev.target.value } })} placeholder="—" />}</Field>
              <Field label={<span className="flex items-center gap-1.5">{tx('ثابت لك ر.س', 'LAK fixed SAR')}<Badge tone="amber">{tx('مثال', 'Example')}</Badge></span>}>{(p) => <Input {...p} inputMode="decimal" dir="ltr" value={i.lak.fixed} onChange={(ev) => set({ lak: { ...i.lak, fixed: ev.target.value } })} placeholder="—" />}</Field>
              <Field label={<span className="flex items-center gap-1.5">{tx('أيام عمل حتى البنك', 'Working days to bank')}<Badge tone="amber">{tx('مثال', 'Example')}</Badge></span>} error={errText(e.payoutDays)}>{(p) => <Input {...p} inputMode="numeric" dir="ltr" value={i.payoutDays} onChange={(ev) => set({ payoutDays: ev.target.value })} placeholder="—" />}</Field>
            </div>
          </section>
        </div>

        <aside aria-labelledby="h-result" className="xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <h3 id="h-result" className="flex items-center gap-1.5 text-[15px] font-semibold text-fg"><Calculator className="size-4 text-muted" aria-hidden="true" />{tx('التقدير الشهري', 'Monthly estimate')}</h3>
            {!ok ? (
              <p className="mt-3 text-sm text-muted">{tx('أكمل متوسط الطلب وعدد الطلبات وحصص طرق الدفع (100%) لترى التقدير.', 'Fill average order, order count and method shares (100%) to see the estimate.')}</p>
            ) : (
              <>
                <dl className="mt-4 space-y-2.5 text-sm">
                  <Row k={tx('المبيعات', 'Sales')} v={<Money v={r.gross} />} />
                  <Row k={tx('المسترد', 'Refunded')} v={<span>− <Money v={r.refunds} /></span>} />
                  <Row k={tx('رسوم مزود الدفع', 'Payment-provider fees')} v={<span>− <Money v={r.provider} /></span>} />
                  <Row k={tx('رسوم «لك»', 'LAK fee')} v={r.lak === null ? <Pending /> : <span className="flex items-center gap-1.5">− <Money v={r.lak} /><Badge tone="amber">{tx('مثال', 'Example')}</Badge></span>} />
                  <div className="border-t border-border pt-2.5"><Row k={<span className="font-semibold text-fg">{tx('الصافي التقديري', 'Estimated net')}</span>} v={<span className="text-lg font-bold"><Money v={r.net} /></span>} /></div>
                  <Row k={tx('الرسوم من المبيعات', 'Fees as share of sales')} v={<bdi className="tabular-nums">{r.effectivePct}%</bdi>} />
                </dl>
                <div className="mt-4 space-y-2" aria-label={tx('رسوم المزود حسب الطريقة', 'Provider fees by method')}>
                  {r.rows.filter((x) => x.orders > 0).map((x) => (
                    <div key={x.method} className="text-xs">
                      <div className="flex justify-between gap-2"><span className="text-muted">{method(x.method)} · <bdi className="tabular-nums">{x.orders}</bdi></span><Money v={x.provider} /></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand-gradient" style={{ width: `${r.provider ? (x.provider * 100) / r.provider : 0}%` }} /></div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="mt-5 rounded-xl bg-surface-2/60 p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-fg"><CalendarClock className="size-4 text-muted" aria-hidden="true" />{tx('موعد وصول المال', 'When money arrives')}</p>
              {r.payoutDays === null ? <p className="mt-1.5 flex items-center gap-2 text-sm text-muted">{tx('موعد تحويل «لك»:', 'LAK payout term:')} <Pending /></p>
                : <p className="mt-1.5 text-sm text-fg">{tx('بيع اليوم يصل البنك تقريبًا', 'A sale today reaches the bank around')} <strong>{fmtDate(payoutDate(TODAY, r.payoutDays))}</strong> <span className="text-xs text-muted">{tx('(مثال، بلا الجمعة والسبت)', '(example, excluding Fri & Sat)')}</span></p>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: ReactNode; v: ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-end text-fg">{v}</dd></div>;
}
