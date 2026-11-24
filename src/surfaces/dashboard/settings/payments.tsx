// Payments: provider connections (simulated) and cash-on-delivery limits.
import { useState } from 'react';
import { Banknote, CreditCard, Wallet, Landmark, CalendarClock, FlaskConical } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { useReviewMode } from '../../../core/review';
import { settingsStore } from '../../merchant/stores';
import type { Provider, ProviderState } from '../../merchant/workspace';
import { Badge, Button, InfoHint, Money, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, Field, Input, Modal, SaveBar, Simulated, useToast } from '../../../ds/kit';
import { sectionHref } from '../pages';
import { applyProvider, inPlan, parseCod, providerSummary, riyals, visibleAtCheckout, type ProviderCmd } from './model';
import { LeaveGuard, Section, useSave } from './common';

const STATE_TONE: Record<ProviderState, Tone> = { not_connected: 'gray', pending: 'amber', active: 'green', action_required: 'red' };
const ICON: Record<string, typeof CreditCard> = { cod: Banknote, bank: Landmark, mada: CreditCard, cards: CreditCard, applepay: Wallet, stcpay: Wallet, tabby: CalendarClock, tamara: CalendarClock };

export default function PaymentsPage() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const review = useReviewMode();
  const s = settingsStore.use();
  const [dlg, setDlg] = useState<{ p: Provider; cmd: 'connect' | 'sendDoc' | 'disconnect' } | null>(null);
  const sum = providerSummary(s.providers);
  const live = visibleAtCheckout(s.providers, s.plan);
  const label = (st: ProviderState) => ({ not_connected: tx('غير مربوط', 'Not connected'), pending: tx('بانتظار تحقق المزوّد', 'Pending verification'), active: tx('مفعّل', 'Active'), action_required: tx('يحتاج إجراءً منك', 'Action required') })[st];
  const run = (id: string, cmd: ProviderCmd) => settingsStore.set((x) => ({ ...x, providers: applyProvider(x.providers, id, cmd) }));

  return (
    <>
      {sum.action > 0 && (
        <Alert tone="bad" title={tx(`${sum.action} مزوّد يحتاج إجراءً منك`, `${sum.action} provider needs your action`)}>
          {tx('الطريقة مخفية عن العملاء حتى ترسل ما طلبه المزوّد.', 'The method is hidden from shoppers until you send what the provider asked for.')}
        </Alert>
      )}
      <Section id="pv-h" flush title={tx('مزوّدو الدفع', 'Payment providers')}
        hint={<InfoHint>{tx('كل الربط هنا محاكاة. ظهور اسم مزوّد لا يعني تعاقدًا أو تفعيلًا فعليًا، والرسوم غير مثبتة.', 'All connections here are simulated. A provider name does not mean a contract or real activation; fees are not confirmed.')}</InfoHint>}
        action={<Simulated />}>
        <p className="px-5 pb-3 text-[13px] text-muted">
          {tx('يراها العملاء الآن: ', 'Shoppers see now: ')}<span className="font-medium text-fg">{live.length ? live.map((p) => p.name[lang]).join(tx('، ', ', ')) : tx('لا شيء', 'nothing')}</span>
        </p>
        <ul className="divide-y divide-border border-t border-border">
          {s.providers.map((p) => {
            const I = ICON[p.id] ?? CreditCard;
            const ok = inPlan(s.plan, p);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', p.state === 'active' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-surface-2 text-muted')} aria-hidden="true"><I className="size-5" /></span>
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-sm font-semibold text-fg">{p.name[lang]}</p>
                  <p className="text-xs text-muted">{p.kind[lang]}</p>
                </div>
                <div className="flex w-full flex-wrap items-center justify-end gap-2 ps-14 sm:w-auto sm:ps-0">
                  {ok ? <Badge tone={STATE_TONE[p.state]}>{label(p.state)}</Badge> : <Badge>{tx(`يتطلب خطة ${p.minPlan === 'plus' ? 'Plus' : 'Pro'}`, `Needs ${p.minPlan === 'plus' ? 'Plus' : 'Pro'} plan`)}</Badge>}
                  {!ok ? <a href={sectionHref('finance', '', { tab: 'billing' })} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('الخطط', 'Plans')}</a>
                    : p.state === 'not_connected' ? <Button size="sm" variant="secondary" onClick={() => setDlg({ p, cmd: 'connect' })}>{tx('اربط', 'Connect')}</Button>
                      : p.state === 'action_required' ? <Button size="sm" onClick={() => setDlg({ p, cmd: 'sendDoc' })}>{tx('أرسل المستند', 'Send document')}</Button>
                        : p.state === 'active' ? <Button size="sm" variant="ghost" onClick={() => setDlg({ p, cmd: 'disconnect' })}>{tx('افصل', 'Disconnect')}</Button>
                          : !review ? <span className="text-xs text-muted">{tx('بانتظار رد المزوّد', 'Waiting for the provider')}</span> : null}
                  {review && ok && p.state === 'pending' && (
                    <span className="flex items-center gap-1 rounded-lg border border-dashed border-border p-1">
                      <FlaskConical className="ms-1 size-3.5 text-muted" aria-label={tx('محاكاة رد المزوّد', 'Simulate provider reply')} />
                      <Button size="sm" variant="ghost" onClick={() => { run(p.id, 'approve'); toast({ tone: 'ok', text: tx(`وافق المزوّد على ${p.name.ar} (محاكاة)`, `${p.name.en} approved (simulated)`) }); }}>{tx('قبول', 'Approve')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => run(p.id, 'requestDoc')}>{tx('طلب مستند', 'Request doc')}</Button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <CodLimits active={s.providers.some((p) => p.id === 'cod' && p.state === 'active')} />

      {dlg && (
        <Modal onClose={() => setDlg(null)}
          title={dlg.cmd === 'connect' ? tx(`ربط ${dlg.p.name.ar}`, `Connect ${dlg.p.name.en}`) : dlg.cmd === 'sendDoc' ? tx(`مستند لـ ${dlg.p.name.ar}`, `Document for ${dlg.p.name.en}`) : tx(`فصل ${dlg.p.name.ar}`, `Disconnect ${dlg.p.name.en}`)}
          footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</Button>
            <Button variant={dlg.cmd === 'disconnect' ? 'danger' : 'primary'} onClick={() => {
              run(dlg.p.id, dlg.cmd);
              toast({ tone: dlg.cmd === 'disconnect' ? 'info' : 'ok', text: dlg.cmd === 'disconnect' ? tx('فُصل المزوّد', 'Provider disconnected') : tx('أُرسل الطلب للمزوّد (محاكاة). الحالة: بانتظار التحقق.', 'Sent to the provider (simulated). Status: pending verification.') });
              setDlg(null);
            }}>{dlg.cmd === 'connect' ? tx('أرسل طلب الربط', 'Send connection request') : dlg.cmd === 'sendDoc' ? tx('أرسل المستند', 'Send document') : tx('افصل', 'Disconnect')}</Button></>}>
          {dlg.cmd === 'connect' && (
            <ol className="list-decimal space-y-2 ps-5 text-sm text-fg">
              <li>{tx('تكمل بياناتك وبيانات حسابك البنكي لدى المزوّد.', 'You complete your business and bank details with the provider.')}</li>
              <li>{tx('يراجعها المزوّد؛ تبقى الحالة «بانتظار التحقق».', 'The provider reviews them; the status stays “pending verification”.')}</li>
              <li>{tx('بعد القبول تظهر الطريقة للعملاء في صفحة الدفع.', 'Once approved, shoppers see the method at checkout.')}</li>
            </ol>
          )}
          {dlg.cmd === 'sendDoc' && <p className="text-sm text-fg">{tx('طلب المزوّد شهادة الحساب البنكي (IBAN). لا يُرفع ملف فعليًا في هذه النسخة.', 'The provider asked for a bank account (IBAN) certificate. No file is actually uploaded in this version.')}</p>}
          {dlg.cmd === 'disconnect' && <p className="text-sm text-fg">{tx('تختفي الطريقة من صفحة الدفع فورًا. الطلبات السابقة والاستردادات الجارية تبقى مع المزوّد حتى تكتمل.', 'The method disappears from checkout immediately. Past orders and refunds in progress stay with the provider until complete.')}</p>}
          <Simulated />
        </Modal>
      )}
    </>
  );
}

function CodLimits({ active }: { active: boolean }) {
  const tx = useTx();
  const cod = settingsStore.use().cod;
  const init = { min: cod.min ? riyals(cod.min) : '', max: riyals(cod.max) };
  const [d, setD] = useState(init);
  const [tried, setTried] = useState(false);
  const { saving, error, save, clearError } = useSave();
  const dirty = d.min !== init.min || d.max !== init.max;
  const r = parseCod(d.min, d.max);
  const err = tried && !r.ok ? r.error : null;
  return (
    <Section id="cod-h" title={tx('حدود الدفع عند الاستلام', 'Cash on delivery limits')}
      hint={<InfoHint>{tx('خارج هذا النطاق لا يظهر الدفع عند الاستلام للعميل في صفحة الدفع.', 'Outside this range shoppers don’t see cash on delivery at checkout.')}</InfoHint>}>
      <LeaveGuard dirty={dirty} />
      {!active && <div className="mb-4"><Alert tone="info">{tx('الدفع عند الاستلام غير مفعّل؛ تُحفظ الحدود وتطبّق عند تفعيله.', 'Cash on delivery is off; limits are kept and apply when you turn it on.')}</Alert></div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tx('أقل قيمة طلب (ر.س)', 'Minimum order (SAR)')} optional error={err === 'min' ? tx('مبلغ غير صالح', 'Invalid amount') : null}>
          {(p) => <Input {...p} dir="ltr" inputMode="decimal" placeholder="0.00" value={d.min} onChange={(e) => { setD({ ...d, min: e.target.value }); clearError(); }} />}
        </Field>
        <Field label={tx('أعلى قيمة طلب (ر.س)', 'Maximum order (SAR)')} error={err === 'max' ? tx('أدخل مبلغًا أكبر من صفر', 'Enter an amount above zero') : err === 'order' ? tx('يجب أن يكون أكبر من الأقل', 'Must be above the minimum') : null}>
          {(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.max} onChange={(e) => { setD({ ...d, max: e.target.value }); clearError(); }} />}
        </Field>
      </div>
      <p className="mt-3 text-xs text-muted">{tx('المحفوظ: ', 'Saved: ')}<Money v={cod.min} /> – <Money v={cod.max} /></p>
      <SaveBar dirty={dirty} saving={saving} error={error} onDiscard={() => { setD(init); setTried(false); clearError(); }}
        onSave={() => { setTried(true); if (!r.ok) return; save(() => { settingsStore.set((x) => ({ ...x, cod: { min: r.min, max: r.max } })); setD({ min: r.min ? riyals(r.min) : '', max: riyals(r.max) }); setTried(false); }, tx('حُفظت حدود الدفع عند الاستلام', 'COD limits saved')); }} />
    </Section>
  );
}
