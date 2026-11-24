// Checkout settings (blueprint pp.15–16): guest checkout, self-cancellation window, COD orders per customer.
import { useState } from 'react';
import { useTx, InfoHint } from '../../../ds/ui';
import { Alert, Field, Input, SaveBar, Select, Switch } from '../../../ds/kit';
import { CANCEL_OPTIONS, canSelfCancel, codAllowed, parseCheckout, type CheckoutDraft, type CheckoutSettings } from './model';
import { checkoutStore } from './stores';
import { LeaveGuard, Section, useSave } from './common';

const toDraft = (s: CheckoutSettings): CheckoutDraft => ({ guest: s.guest, cancelMinutes: s.cancelMinutes, codLimitOn: s.codPerCustomer !== null, codPerCustomer: String(s.codPerCustomer ?? 2) });

export default function CheckoutPage() {
  const tx = useTx();
  const saved = checkoutStore.use();
  const init = toDraft(saved);
  const [d, setD] = useState<CheckoutDraft>(init);
  const [tried, setTried] = useState(false);
  const { saving, error, save, clearError } = useSave();
  const dirty = JSON.stringify(d) !== JSON.stringify(init);
  const r = parseCheckout(d);
  const set = (p: Partial<CheckoutDraft>) => { setD({ ...d, ...p }); clearError(); };
  const mins = (m: number) => (m < 60 ? tx(`${m} دقيقة`, `${m} minutes`) : m < 1440 ? tx(`${m / 60} ساعة`, `${m / 60} hours`) : tx('24 ساعة', '24 hours'));
  const preview = r.ok ? r.value : saved;

  return (
    <>
      <LeaveGuard dirty={dirty} />
      <Alert tone="info">{tx('المتجر التجريبي يستخدم بياناته الخاصة ولا يقرأ هذه الإعدادات بعد.', 'The demo storefront keeps its own data and doesn’t read these settings yet.')}</Alert>
      <Section id="ck-g" title={tx('الشراء كضيف', 'Guest checkout')}>
        <div className="flex items-center gap-4">
          <p className="min-w-0 flex-1 text-sm text-muted">{d.guest ? tx('يستطيع العميل الطلب دون إنشاء حساب.', 'Shoppers can order without an account.') : tx('يجب على العميل إنشاء حساب قبل الطلب.', 'Shoppers must create an account before ordering.')}</p>
          <Switch checked={d.guest} onChange={(v) => set({ guest: v })} label={tx('السماح بالشراء كضيف', 'Allow guest checkout')} />
        </div>
      </Section>
      <Section id="ck-c" title={tx('إلغاء العميل لطلبه', 'Self-cancellation by shoppers')} hint={<InfoHint>{tx('بعد انتهاء المدة أو بدء التجهيز يطلب العميل الإلغاء منك.', 'After the window, or once fulfilment starts, the shopper has to ask you to cancel.')}</InfoHint>}>
        <Field label={tx('المدة المسموحة بعد الطلب', 'Allowed time after ordering')} className="sm:max-w-xs">
          {(p) => <Select {...p} value={d.cancelMinutes ?? ''} onChange={(e) => set({ cancelMinutes: e.target.value === '' ? null : Number(e.target.value) })}>
            {CANCEL_OPTIONS.map((m) => <option key={m ?? 'off'} value={m ?? ''}>{m === null ? tx('لا يُسمح', 'Not allowed') : mins(m)}</option>)}
          </Select>}
        </Field>
        <p className="mt-3 text-[13px] text-muted">{tx('مثال: طلب عمره 20 دقيقة لم يُجهَّز — ', 'Example: a 20-minute-old order not yet fulfilled — ')}
          <span className="font-semibold text-fg">{canSelfCancel(preview, 20, false) ? tx('يمكن إلغاؤه', 'can be cancelled') : tx('لا يمكن إلغاؤه', 'can’t be cancelled')}</span></p>
      </Section>
      <Section id="ck-d" title={tx('حد الدفع عند الاستلام لكل عميل', 'COD limit per customer')} hint={<InfoHint>{tx('يمنع تكرار طلبات الدفع عند الاستلام غير المدفوعة من العميل نفسه.', 'Stops one shopper from stacking unpaid cash-on-delivery orders.')}</InfoHint>}>
        <div className="flex items-center gap-4">
          <p className="min-w-0 flex-1 text-sm text-muted">{d.codLimitOn ? tx('يختفي الدفع عند الاستلام حين يبلغ العميل الحد.', 'COD is hidden once the shopper reaches the limit.') : tx('بلا حد.', 'No limit.')}</p>
          <Switch checked={d.codLimitOn} onChange={(v) => set({ codLimitOn: v })} label={tx('تفعيل الحد', 'Turn the limit on')} />
        </div>
        {d.codLimitOn && (
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <Field label={tx('أقصى طلبات غير مدفوعة', 'Max unpaid orders')} hint={tx('من 1 إلى 20', '1 to 20')} error={tried && !r.ok ? tx('رقم من 1 إلى 20', 'A number from 1 to 20') : null}>
              {(p) => <Input {...p} className="w-32" dir="ltr" inputMode="numeric" value={d.codPerCustomer} onChange={(e) => set({ codPerCustomer: e.target.value })} />}
            </Field>
            {r.ok && r.value.codPerCustomer !== null && <p className="pb-6 text-[13px] text-muted">{tx(`عميل لديه طلبان مفتوحان: ${codAllowed(r.value, 2) ? 'يرى' : 'لا يرى'} الدفع عند الاستلام`, `A shopper with 2 open orders ${codAllowed(r.value, 2) ? 'still sees' : 'no longer sees'} COD`)}</p>}
          </div>
        )}
      </Section>
      <SaveBar dirty={dirty} saving={saving} error={error} onDiscard={() => { setD(init); setTried(false); clearError(); }}
        onSave={() => { setTried(true); if (!r.ok) return; save(() => { checkoutStore.set(r.value); setD(toDraft(r.value)); setTried(false); }, tx('حُفظت إعدادات إتمام الطلب', 'Checkout settings saved')); }} />
    </>
  );
}
