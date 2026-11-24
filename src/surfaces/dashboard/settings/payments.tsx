// Payments: provider connections (simulated), bank-transfer account with IBAN checks, Apple Pay domain verification,
// provider documents, and cash-on-delivery limits. The online store reads `settingsStore.providers` (storefront/bridge.ts)
// and can read `settingsStore.bank` for bank-transfer details.
import { useEffect, useRef, useState } from 'react';
import { Banknote, CreditCard, Wallet, Landmark, CalendarClock, FlaskConical, Globe2, Upload, Check, Gift, Coins } from 'lucide-react';
import { useRoute } from '../../../core/router';
import { SA_BANKS, formatIban, maskIban, type BankDetails } from '../../merchant/finance';
import { bankAtCheckout, bankDraftOf, checkBankDraft, checkProviderDoc, type BankDraft, type BankErrors } from '../finance/model';
import { financeOpsStore, paymentsUiStore } from '../finance/stores';
import { useLang } from '../../../core/lang';
import { useReviewMode } from '../../../core/review';
import { settingsStore } from '../../merchant/stores';
import type { Provider, ProviderState } from '../../merchant/workspace';
import { Badge, Button, InfoHint, Money, Ref, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, Field, Input, Modal, SaveBar, Select, Simulated, useToast } from '../../../ds/kit';
import { sectionHref } from '../pages';
import { applyProvider, inPlan, parseCod, providerSummary, riyals, visibleAtCheckout, type ProviderCmd } from './model';
import { LeaveGuard, Section, useSave } from './common';

const STATE_TONE: Record<ProviderState, Tone> = { not_connected: 'gray', pending: 'amber', active: 'green', action_required: 'red' };
const ICON: Record<string, typeof CreditCard> = { cod: Banknote, bank: Landmark, mada: CreditCard, cards: CreditCard, amex: CreditCard, applepay: Wallet, stcpay: Wallet, paypal: Wallet, tabby: CalendarClock, tamara: CalendarClock, mispay: CalendarClock, madfu: CalendarClock, emkan: Coins, mokafaa: Gift };

export default function PaymentsPage() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const review = useReviewMode();
  const s = settingsStore.use();
  const ui = paymentsUiStore.use();
  const [dlg, setDlg] = useState<{ p: Provider; cmd: 'connect' | 'sendDoc' | 'disconnect' } | null>(null);
  const [doc, setDoc] = useState<{ name: string; error: 'type' | 'size' | null } | null>(null);
  const sum = providerSummary(s.providers);
  const bank = s.bank ?? null;
  // Bank transfer reaches shoppers only with an account saved.
  const live = visibleAtCheckout(s.providers, s.plan).filter((p) => p.id !== 'bank' || !!bank);
  const needsDomain = dlg?.cmd === 'connect' && dlg.p.id === 'applepay' && ui.applePayDomain !== 'verified';
  const needsFile = dlg?.cmd === 'sendDoc' && (!doc || !!doc.error);
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
            const bankState = p.id === 'bank' ? bankAtCheckout(p.state === 'active', bank) : null;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', p.state === 'active' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-surface-2 text-muted')} aria-hidden="true"><I className="size-5" /></span>
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-sm font-semibold text-fg">{p.name[lang]}</p>
                  <p className="text-xs text-muted">{p.kind[lang]}
                    {bankState === 'needsDetails' && <> · <a href="#bank-h" className="font-semibold text-amber-700 hover:underline dark:text-amber-400">{tx('أضف الحساب البنكي', 'Add the bank account')}</a></>}
                    {bankState === 'ready' && bank && <> · <Ref>{maskIban(bank.iban)}</Ref></>}
                    {p.id === 'applepay' && ui.applePayDomain === 'verified' && <> · {tx('النطاق موثّق', 'Domain verified')}</>}
                  </p>
                </div>
                <div className="flex w-full flex-wrap items-center justify-end gap-2 ps-14 sm:w-auto sm:ps-0">
                  {!ok ? <Badge>{tx(`يتطلب خطة ${p.minPlan === 'plus' ? 'Plus' : 'Pro'}`, `Needs ${p.minPlan === 'plus' ? 'Plus' : 'Pro'} plan`)}</Badge>
                    : bankState === 'needsDetails' ? <Badge tone="amber">{tx('مفعّل · بلا حساب', 'On · no account')}</Badge>
                      : <Badge tone={STATE_TONE[p.state]}>{label(p.state)}</Badge>}
                  {!ok ? <a href={sectionHref('finance', '', { tab: 'billing' })} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('الخطط', 'Plans')}</a>
                    : p.state === 'not_connected' ? <Button size="sm" variant="secondary" onClick={() => setDlg({ p, cmd: 'connect' })}>{tx('اربط', 'Connect')}</Button>
                      : p.state === 'action_required' ? <Button size="sm" onClick={() => { setDoc(null); setDlg({ p, cmd: 'sendDoc' }); }}>{tx('أرسل المستند', 'Send document')}</Button>
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

      <BankTransfer on={s.providers.some((p) => p.id === 'bank' && p.state === 'active')} />

      <CodLimits active={s.providers.some((p) => p.id === 'cod' && p.state === 'active')} />

      {dlg && (
        <Modal onClose={() => setDlg(null)}
          title={dlg.cmd === 'connect' ? tx(`ربط ${dlg.p.name.ar}`, `Connect ${dlg.p.name.en}`) : dlg.cmd === 'sendDoc' ? tx(`مستند لـ ${dlg.p.name.ar}`, `Document for ${dlg.p.name.en}`) : tx(`فصل ${dlg.p.name.ar}`, `Disconnect ${dlg.p.name.en}`)}
          footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</Button>
            <Button variant={dlg.cmd === 'disconnect' ? 'danger' : 'primary'} disabled={needsDomain || needsFile} onClick={() => {
              run(dlg.p.id, dlg.cmd);
              toast({ tone: dlg.cmd === 'disconnect' ? 'info' : 'ok', text: dlg.cmd === 'disconnect' ? tx('فُصل المزوّد', 'Provider disconnected') : tx('أُرسل الطلب للمزوّد (محاكاة). الحالة: بانتظار التحقق.', 'Sent to the provider (simulated). Status: pending verification.') });
              setDlg(null);
            }}>{dlg.cmd === 'connect' ? tx('أرسل طلب الربط', 'Send connection request') : dlg.cmd === 'sendDoc' ? tx('أرسل المستند', 'Send document') : tx('افصل', 'Disconnect')}</Button></>}>
          {dlg.cmd === 'connect' && dlg.p.id === 'applepay' && <ApplePayDomain />}
          {dlg.cmd === 'connect' && (
            <ol className="list-decimal space-y-2 ps-5 text-sm text-fg">
              <li>{tx('تكمل بياناتك وبيانات حسابك البنكي لدى المزوّد.', 'You complete your business and bank details with the provider.')}</li>
              <li>{tx('يراجعها المزوّد؛ تبقى الحالة «بانتظار التحقق».', 'The provider reviews them; the status stays “pending verification”.')}</li>
              <li>{tx('بعد القبول تظهر الطريقة للعملاء في صفحة الدفع.', 'Once approved, shoppers see the method at checkout.')}</li>
            </ol>
          )}
          {dlg.cmd === 'sendDoc' && <>
            <p className="text-sm text-fg">{tx('طلب المزوّد شهادة الحساب البنكي (IBAN).', 'The provider asked for a bank account (IBAN) certificate.')}</p>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border p-5 text-center text-sm hover:border-brand-300">
              <Upload className="size-5 text-muted" aria-hidden="true" />
              <span className="font-semibold text-fg">{doc && !doc.error ? doc.name : tx('اختر ملفًا', 'Choose a file')}</span>
              <span className="text-xs text-muted">PDF · PNG · JPG · ≤ 5 MB</span>
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setDoc({ name: f.name, error: checkProviderDoc(f) }); }} />
            </label>
            {doc?.error && <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{doc.error === 'type' ? tx('الملف يجب أن يكون PDF أو صورة', 'The file must be a PDF or an image') : tx('الحجم أكبر من 5 ميجابايت', 'The file is larger than 5 MB')}</p>}
            <p className="text-xs text-muted">{tx('يبقى الملف في متصفحك؛ لا يُرفع فعليًا في هذه النسخة.', 'The file stays in your browser; it is not actually uploaded in this version.')}</p>
          </>}
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

/* ---------- Apple Pay domain verification (BP-P03-PMT-005) ---------- */

function ApplePayDomain() {
  const tx = useTx();
  const toast = useToast();
  const s = settingsStore.use();
  const ui = paymentsUiStore.use();
  const [checking, setChecking] = useState(false);
  const host = s.domain.state === 'verified' && s.domain.host ? s.domain.host : `${s.domain.slug}.lak.sa`;
  const verify = () => {
    setChecking(true);
    window.setTimeout(() => { setChecking(false); paymentsUiStore.set((u) => ({ ...u, applePayDomain: 'verified' })); toast({ tone: 'ok', text: tx('وُثّق النطاق لدى Apple (محاكاة)', 'Domain verified with Apple (simulated)') }); }, 700);
  };
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-fg"><Globe2 className="size-4 text-muted" aria-hidden="true" />{tx('الخطوة 1: توثيق النطاق', 'Step 1: verify the domain')}<InfoHint>{tx('تطلب Apple ملف توثيق على نطاق المتجر قبل أن يظهر Apple Pay. تضعه «لك» تلقائيًا على نطاقاتها.', 'Apple requires a verification file on the store domain before Apple Pay can appear. LAK places it automatically on its domains.')}</InfoHint></p>
      <p className="mt-1 text-sm text-muted"><Ref>{host}</Ref></p>
      <div className="mt-3">
        {ui.applePayDomain === 'verified' ? <Badge tone="green" icon={<Check className="size-3.5" aria-hidden="true" />}>{tx('موثّق', 'Verified')}</Badge>
          : <Button size="sm" variant="secondary" onClick={verify} disabled={checking}>{checking ? tx('جارٍ التحقق…', 'Checking…') : tx('وثّق النطاق', 'Verify domain')}</Button>}
      </div>
      <p className="mt-3 text-xs font-semibold text-fg">{tx('الخطوة 2: أرسل طلب الربط', 'Step 2: send the connection request')}</p>
    </div>
  );
}

/* ---------- Bank transfer (BP-P03-PMT-002) ---------- */

function BankTransfer({ on }: { on: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const route = useRoute();
  const s = settingsStore.use();
  const ui = paymentsUiStore.use();
  const saved = s.bank ?? null;
  const init = bankDraftOf(saved);
  const d = ui.bankDraft ?? init;
  const setD = (next: BankDraft) => paymentsUiStore.set((u) => ({ ...u, bankDraft: next }));
  const [errors, setErrors] = useState<BankErrors>({});
  const [confirm, setConfirm] = useState<BankDetails | null>(null);
  const { saving, error, save, clearError } = useSave();
  const ref = useRef<HTMLDivElement>(null);
  const dirty = d.bankCode !== init.bankCode || d.beneficiary !== init.beneficiary || d.iban.replace(/\s/g, '') !== init.iban.replace(/\s/g, '');
  useEffect(() => { if (route.query.get('section') === 'bank') ref.current?.scrollIntoView({ block: 'start' }); }, [route.query]);
  const detected = (() => { const code = d.iban.replace(/[\s-]/g, '').toUpperCase().slice(4, 6); return /^\d{2}$/.test(code) ? SA_BANKS[code] ?? null : null; })();
  const msg = {
    iban: { empty: tx('أدخل الآيبان', 'Enter the IBAN'), country: tx('آيبان سعودي يبدأ بـ SA', 'A Saudi IBAN starts with SA'), length: tx('الآيبان السعودي 24 خانة', 'A Saudi IBAN has 24 characters'), chars: tx('حروف أو أرقام غير صالحة', 'Invalid characters'), checksum: tx('رقم التحقق لا يطابق؛ راجع الخانات', 'Check digits do not match; re-check the characters') } as Record<string, string>,
    beneficiary: { empty: tx('أدخل اسم المستفيد', 'Enter the beneficiary name'), short: tx('بين 3 و70 حرفًا', 'Between 3 and 70 characters'), chars: tx('حروف ومسافات فقط، كما في البنك', 'Letters and spaces only, as registered at the bank') } as Record<string, string>,
    bank: { empty: tx('اختر البنك', 'Choose the bank'), mismatch: tx('الآيبان يعود لبنك آخر', 'This IBAN belongs to another bank') } as Record<string, string>,
  };
  const trySave = () => {
    const r = checkBankDraft(d);
    if (!r.ok) { setErrors(r.errors); return; }
    setErrors({}); setConfirm(r.bank);
  };
  const commit = (b: BankDetails) => {
    setConfirm(null);
    save(() => {
      settingsStore.set((x) => ({ ...x, bank: b }));
      paymentsUiStore.set((u) => ({ ...u, bankDraft: null }));
      financeOpsStore.set((o) => ({ ...o, log: [...o.log, { at: new Date().toISOString(), by: tx('المالك', 'Owner'), ref: maskIban(b.iban), what: { ar: `تغيّر حساب التحويل البنكي إلى ${maskIban(b.iban)}`, en: `Bank-transfer account changed to ${maskIban(b.iban)}` } }] }));
    }, tx('حُفظ الحساب البنكي', 'Bank account saved'));
  };
  const field = (k: keyof BankErrors) => (errors[k] ? msg[k][errors[k]!] : null);
  return (
    <div ref={ref} className="scroll-mt-24">
      <Section id="bank-h" title={tx('التحويل البنكي', 'Bank transfer')}
        hint={<InfoHint>{tx('يرى العميل هذه البيانات بعد اختيار التحويل البنكي، ويؤكد الطلب يدويًا بعد وصول المبلغ.', 'Shoppers see these details after choosing bank transfer; the order is confirmed manually once the money arrives.')}</InfoHint>}>
        <LeaveGuard dirty={dirty} />
        {on && !saved && <div className="mb-4"><Alert tone="warn">{tx('التحويل البنكي مفعّل لكن بلا حساب؛ لا يظهر للعملاء حتى تحفظ البيانات.', 'Bank transfer is on but has no account; shoppers do not see it until you save the details.')}</Alert></div>}
        {!on && <div className="mb-4"><Alert tone="info">{tx('التحويل البنكي غير مفعّل؛ تُحفظ البيانات وتظهر عند تفعيله.', 'Bank transfer is off; details are kept and shown once you turn it on.')}</Alert></div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tx('الآيبان', 'IBAN')} className="sm:col-span-2" error={field('iban')} hint={detected ? tx(`البنك من الآيبان: ${detected.ar}`, `Bank from IBAN: ${detected.en}`) : tx('24 خانة تبدأ بـ SA', '24 characters starting with SA')}>
            {(p) => <Input {...p} dir="ltr" autoComplete="off" spellCheck={false} placeholder="SA00 0000 0000 0000 0000 0000" value={d.iban}
              onChange={(e) => { setD({ ...d, iban: e.target.value }); setErrors((x) => ({ ...x, iban: undefined })); clearError(); }}
              onBlur={() => { const v = d.iban.trim(); if (!v) return; const code = formatIban(v).replace(/\s/g, '').slice(4, 6); setD({ ...d, iban: formatIban(v), bankCode: d.bankCode || (SA_BANKS[code] ? code : '') }); }} />}
          </Field>
          <Field label={tx('البنك', 'Bank')} error={field('bank')}>
            {(p) => <Select {...p} value={d.bankCode} onChange={(e) => { setD({ ...d, bankCode: e.target.value }); setErrors((x) => ({ ...x, bank: undefined })); clearError(); }}>
              <option value="">{tx('اختر البنك', 'Choose a bank')}</option>
              {Object.entries(SA_BANKS).map(([code, n]) => <option key={code} value={code}>{n[lang]}</option>)}
            </Select>}
          </Field>
          <Field label={tx('اسم المستفيد', 'Beneficiary name')} error={field('beneficiary')} hint={tx('كما هو مسجّل في البنك', 'As registered at the bank')}>
            {(p) => <Input {...p} value={d.beneficiary} maxLength={80} onChange={(e) => { setD({ ...d, beneficiary: e.target.value }); setErrors((x) => ({ ...x, beneficiary: undefined })); clearError(); }} />}
          </Field>
        </div>
        <div className="mt-5 rounded-xl bg-surface-2/60 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">{tx('ما يراه العميل في صفحة الدفع', 'What shoppers see at checkout')}<InfoHint>{tx('تُعرض كاملة للعميل بعد اختيار الطريقة فقط.', 'Shown in full only after the shopper picks this method.')}</InfoHint></p>
          {saved ? (
            <dl className="mt-2 space-y-1.5 text-sm">
              {[[tx('البنك', 'Bank'), (Object.values(SA_BANKS).find((b) => b.en === saved.bank) ?? { ar: saved.bank, en: saved.bank })[lang]], [tx('المستفيد', 'Beneficiary'), saved.beneficiary], [tx('الآيبان', 'IBAN'), <Ref key="i">{formatIban(saved.iban)}</Ref>], [tx('مرجع التحويل', 'Transfer reference'), tx('رقم طلبك', 'Your order number')]]
                .map(([k, v], i) => <div key={i} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-end font-medium text-fg">{v}</dd></div>)}
            </dl>
          ) : <p className="mt-2 text-sm text-muted">{tx('لا شيء بعد.', 'Nothing yet.')}</p>}
        </div>
        <SaveBar dirty={dirty} saving={saving} error={error} saveLabel={tx('راجع واحفظ', 'Review and save')}
          onDiscard={() => { paymentsUiStore.set((u) => ({ ...u, bankDraft: null })); setErrors({}); clearError(); }} onSave={trySave} />
      </Section>
      {confirm && (
        <Modal title={tx('تأكيد الحساب البنكي', 'Confirm the bank account')} description={tx('يحوّل العملاء المبالغ إلى هذا الحساب من الآن.', 'Shoppers will transfer money to this account from now on.')} onClose={() => setConfirm(null)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>{tx('رجوع', 'Back')}</Button><Button onClick={() => commit(confirm)}>{tx('احفظ الحساب', 'Save account')}</Button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-3 text-sm"><p className="text-xs text-muted">{tx('الحالي', 'Current')}</p><p className="mt-1 font-medium text-fg">{saved ? <Ref>{maskIban(saved.iban)}</Ref> : tx('لا يوجد', 'None')}</p></div>
            <div className="rounded-xl border border-brand-300 p-3 text-sm dark:border-brand-500/40"><p className="text-xs text-muted">{tx('الجديد', 'New')}</p><p className="mt-1 font-medium text-fg"><Ref>{formatIban(confirm.iban)}</Ref></p><p className="text-xs text-muted">{confirm.beneficiary}</p></div>
          </div>
          <Alert tone="warn">{tx('الطلبات المنشأة قبل الحفظ تبقى ببيانات الحساب السابق. تحقق من الآيبان مع بنكك؛ خطأ واحد يرسل أموال العملاء لحساب آخر.', 'Orders placed before saving keep the previous details. Verify the IBAN with your bank; one wrong character sends shoppers’ money elsewhere.')}</Alert>
          <p className="text-xs text-muted">{tx('يُسجَّل التغيير في سجل المالية باسمك ووقته.', 'The change is logged in the finance log with your name and time.')}</p>
        </Modal>
      )}
    </div>
  );
}
