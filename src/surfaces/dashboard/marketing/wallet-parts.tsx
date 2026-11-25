// Shared by the wallet and cashback tabs, the customer profile wallet card, the refund dialog and finance:
// the «decision needed» marker, the manual credit/debit flow (input → preview → record) and the ledger line names.
import { useState } from 'react';
import { CircleAlert, MinusCircle, PlusCircle } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link } from '../../../core/router';
import { customersStore, logAction } from '../../merchant/stores';
import { parseMoney } from '../../merchant/catalog';
import { addDays, adjustWallet, kindLabel, validateAdjust, walletBalance, type WalletKind } from '../../merchant/wallet';
import { WALLET_TODAY, walletEvent, walletSettingsStore, walletStore } from '../../merchant/wallet-store';
import { Button, Money, Ref, Segmented, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, Field, Input, Modal, Select, Simulated, Textarea, useToast } from '../../../ds/kit';

export const KIND_TONE: Record<WalletKind, Tone> = { credit: 'green', refund: 'sky', cashback: 'brand', unspend: 'sky', debit: 'amber', spend: 'gray', expire: 'red', reverse: 'amber' };
export const useKindName = () => { const { lang } = useLang(); return (k: WalletKind) => kindLabel[k][lang]; };
export const sar = (v: number) => (v / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Small marker on tools that wait on a LAK decision; opens the single decisions page. */
export function DecisionMark({ what }: { what: string }) {
  const tx = useTx();
  return (
    <a href={link('/dashboard/settings/decisions')} title={what}
      className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-500/15 dark:text-amber-300">
      <CircleAlert className="size-3.5" aria-hidden="true" />{tx('قرار مطلوب', 'Decision needed')}<span className="sr-only">: {what}</span>
    </a>
  );
}

/** Manual credit or debit for one customer: amount, reason, expiry → preview of the balance before/after and what the customer sees → record. */
export function AdjustModal({ customerId, dir: dir0 = 'credit', onClose }: { customerId?: string; dir?: 'credit' | 'debit'; onClose: (msg?: string) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const customers = customersStore.use();
  const ledger = walletStore.use();
  const settings = walletSettingsStore.use();
  const [cid, setCid] = useState(customerId ?? '');
  const [dir, setDir] = useState<'credit' | 'debit'>(dir0);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [expires, setExpires] = useState(settings.expiryDays === null ? '' : addDays(WALLET_TODAY, settings.expiryDays));
  const [step, setStep] = useState<'form' | 'review'>('form');
  const [tried, setTried] = useState(false);
  const c = customers.find((x) => x.id === cid);
  const bal = c ? walletBalance(ledger, c.id) : 0;
  const errors = validateAdjust({ dir, amount, reason, expires }, bal, parseMoney, WALLET_TODAY);
  const noCustomer = !c;
  const v = parseMoney(amount) ?? 0;
  const after = dir === 'credit' ? bal + v : bal - v;
  const next = () => { setTried(true); if (!noCustomer && !Object.keys(errors).length) setStep('review'); };
  const record = () => {
    if (!c) return;
    const by = tx('أنت', 'You');
    const r = adjustWallet(walletStore.get(), { customerId: c.id, dir, amount: v, reason, expires: dir === 'credit' ? expires || null : null }, { by, today: WALLET_TODAY, seed: Date.now() % 100000 });
    walletStore.set(r.ledger);
    const text = dir === 'credit' ? tx(`أُضيف ${sar(v)} ر.س لمحفظته: ${reason.trim()}`, `SAR ${sar(v)} added to wallet: ${reason.trim()}`) : tx(`خُصم ${sar(v)} ر.س من محفظته: ${reason.trim()}`, `SAR ${sar(v)} taken from wallet: ${reason.trim()}`);
    walletEvent(c.id, text, by);
    logAction('marketing', dir === 'credit' ? { ar: `أضاف ${sar(v)} ر.س لمحفظة ${c.id}`, en: `Credited SAR ${sar(v)} to ${c.id}'s wallet` } : { ar: `خصم ${sar(v)} ر.س من محفظة ${c.id}`, en: `Debited SAR ${sar(v)} from ${c.id}'s wallet` }, { target: c.id, before: sar(bal), after: sar(after) });
    toast({ tone: 'ok', text: tx(`سُجّلت الحركة. الرصيد الآن ${sar(after)} ر.س`, `Recorded. Balance now SAR ${sar(after)}`) });
    onClose(r.txn.id);
  };
  const err = (k: keyof typeof errors, m: string) => (tried && errors[k] ? m : null);
  return (
    <Modal title={step === 'form' ? (dir === 'credit' ? tx('إضافة رصيد للمحفظة', 'Add wallet credit') : tx('خصم من المحفظة', 'Debit the wallet')) : tx('مراجعة قبل التسجيل', 'Review before recording')} onClose={() => onClose()}
      footer={step === 'form'
        ? <><Button variant="secondary" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={next}>{tx('راجع', 'Review')}</Button></>
        : <><Button variant="secondary" onClick={() => setStep('form')}>{tx('عدّل', 'Edit')}</Button><Button onClick={record}>{dir === 'credit' ? <PlusCircle className="size-4" aria-hidden="true" /> : <MinusCircle className="size-4" aria-hidden="true" />}{dir === 'credit' ? tx('أضف', 'Add') : tx('اخصم', 'Debit')}&nbsp;<Money v={v} /></Button></>}>
      {step === 'form' ? (
        <div className="space-y-4">
          <Segmented label={tx('نوع الحركة', 'Movement')} value={dir} onChange={setDir} options={[{ value: 'credit', label: tx('إضافة', 'Credit') }, { value: 'debit', label: tx('خصم', 'Debit') }]} />
          {!customerId && (
            <Field label={tx('العميل', 'Customer')} error={tried && noCustomer ? tx('اختر عميلًا', 'Choose a customer') : null}>
              {(p) => <Select {...p} value={cid} onChange={(e) => setCid(e.target.value)}><option value="">{tx('اختر…', 'Choose…')}</option>{customers.map((x) => <option key={x.id} value={x.id}>{x.name[lang]} · {x.id}</option>)}</Select>}
            </Field>
          )}
          {c && <p className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-2.5 text-sm"><span className="text-muted">{tx('الرصيد الحالي', 'Current balance')}</span><Money v={bal} className="font-semibold text-fg" /></p>}
          <Field label={tx('المبلغ (ر.س)', 'Amount (SAR)')} hint={tx('حتى 5,000', 'Up to 5,000')} error={err('amount', tx('مبلغ من 0.01 إلى 5,000 ر.س', 'SAR 0.01 to 5,000')) ?? err('exceeds', tx('أكبر من الرصيد', 'More than the balance'))}>
            {(p) => <Input {...p} dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
          </Field>
          <Field label={tx('السبب', 'Reason')} hint={tx('يظهر في السجل وللعميل', 'Shown in the ledger and to the customer')} error={err('reason', tx('اكتب سببًا واضحًا', 'Write a clear reason'))}>
            {(p) => <Textarea {...p} rows={2} className="min-h-16" maxLength={140} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          {dir === 'credit' && (
            <Field label={tx('ينتهي', 'Expires')} optional hint={settings.expiryDays === null ? tx('فارغ = بلا انتهاء', 'Empty = never') : tx(`الافتراضي ${settings.expiryDays} يومًا`, `Default ${settings.expiryDays} days`)} error={err('expires', tx('تاريخ بعد اليوم', 'A date after today'))}>
              {(p) => <Input {...p} type="date" dir="ltr" min={addDays(WALLET_TODAY, 1)} value={expires} onChange={(e) => setExpires(e.target.value)} />}
            </Field>
          )}
        </div>
      ) : (
        <>
          <dl className="divide-y divide-border rounded-xl border border-border text-sm">
            <div className="flex justify-between gap-3 px-4 py-2.5"><dt className="text-muted">{tx('العميل', 'Customer')}</dt><dd className="truncate font-semibold text-fg">{c?.name[lang]} · <Ref>{c?.id}</Ref></dd></div>
            <div className="flex justify-between px-4 py-2.5"><dt className="text-muted">{tx('الرصيد قبل', 'Balance before')}</dt><dd><Money v={bal} /></dd></div>
            <div className="flex justify-between px-4 py-2.5"><dt className="text-muted">{dir === 'credit' ? tx('إضافة', 'Credit') : tx('خصم', 'Debit')}</dt><dd className={cn('font-semibold', dir === 'credit' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300')}><bdi dir="ltr">{dir === 'credit' ? '+' : '−'}</bdi><Money v={v} /></dd></div>
            <div className="flex justify-between px-4 py-2.5"><dt className="font-semibold text-fg">{tx('الرصيد بعد', 'Balance after')}</dt><dd className="font-bold"><Money v={after} /></dd></div>
            {dir === 'credit' && <div className="flex justify-between px-4 py-2.5"><dt className="text-muted">{tx('ينتهي', 'Expires')}</dt><dd><Ref>{expires || tx('بلا انتهاء', 'Never')}</Ref></dd></div>}
          </dl>
          <div className="rounded-xl border border-dashed border-border p-4 text-sm">
            <p className="text-xs font-semibold text-muted">{tx('ما يراه العميل في حسابه', 'What the customer sees in their account')}</p>
            <p className="mt-1.5 text-fg">{dir === 'credit' ? tx(`أُضيف لمحفظتك ${sar(v)} ر.س — ${reason.trim()}`, `SAR ${sar(v)} added to your wallet — ${reason.trim()}`) : tx(`خُصم من محفظتك ${sar(v)} ر.س — ${reason.trim()}`, `SAR ${sar(v)} taken from your wallet — ${reason.trim()}`)}</p>
          </div>
          {dir === 'debit' && <Alert tone="warn">{tx('الخصم لا يعيد مالًا لأحد؛ يقلل ما يستطيع العميل صرفه.', 'A debit returns money to no one; it lowers what the customer can spend.')}</Alert>}
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted"><Simulated />{tx('يُسجّل باسمك ووقتك في سجل المحفظة وملف العميل. لا يُرسل إشعار.', 'Recorded with your name and time in the wallet ledger and the customer profile. No message is sent.')}</p>
        </>
      )}
    </Modal>
  );
}
