// LAK credit (`#/dashboard/finance?tab=billing&part=credit`): a prepaid balance spent on LAK services (messages,
// shipping labels, ads). Top-up and spending are simulated; unit prices are «بانتظار الاعتماد» — the merchant may type
// an example to try the flow. Low balance raises a work-centre item (see ./credit-work.ts). Ledger filters live in the URL.
import { useMemo, useState } from 'react';
import { BellRing, CreditCard, Megaphone, MessageSquare, Plus, RefreshCw, Tag, Wallet, Zap } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, useRoute } from '../../../core/router';
import { useReviewMode } from '../../../core/review';
import { currentActor, logAction, testStore } from '../../merchant/stores';
import { can } from '../../merchant/perms';
import {
  CREDIT_SERVICES, TOPUP_MAX, TOPUP_MIN, applyAuto, checkAuto, checkSpend, checkTopUp, creditBalance, filterCredit, isLow, parseNum, spend, topUp,
  type CreditEntry, type CreditKind, type CreditService, type TopUpErr,
} from '../../merchant/commercial';
import { creditStore } from '../../merchant/commercial-store';
import { Badge, Button, Card, EmptyState, InfoHint, Money, Ref, cn, useTx } from '../../../ds/ui';
import { Alert, DataTable, Field, FilterChip, Input, Modal, Pagination, SaveBar, Simulated, Switch, useToast, type Column } from '../../../ds/kit';
import { useUnsaved } from '../unsaved';
import { useSessionDraft } from '../settings/drafts';
import { DecisionMarker, Pending } from '../settings/decision-marker';
import { paginate } from './model';

const S_ICON: Record<CreditService, typeof Tag> = { messages: MessageSquare, labels: Tag, ads: Megaphone };
const KINDS: CreditKind[] = ['topup', 'spend', 'auto'];
const riyals = (h: number) => (h / 100).toString();

function useCreditNames() {
  const tx = useTx();
  return {
    service: (s: CreditService) => ({ messages: tx('رسائل SMS وواتساب', 'SMS & WhatsApp messages'), labels: tx('بوليصات شحن لك', 'LAK shipping labels'), ads: tx('خدمة إعلانات لك', 'LAK ads service') })[s],
    unit: (s: CreditService) => ({ messages: tx('رسالة', 'message'), labels: tx('بوليصة', 'label'), ads: tx('حملة', 'campaign') })[s],
    kind: (k: CreditKind) => ({ topup: tx('شحن', 'Top-up'), spend: tx('استخدام', 'Spend'), auto: tx('شحن تلقائي', 'Auto top-up') })[k],
    topErr: (e: TopUpErr) => ({ required: tx('أدخل المبلغ', 'Enter an amount'), number: tx('رقم بخانتين عشريتين كحد أقصى', 'A number with at most two decimals'), min: tx(`الحد الأدنى ${TOPUP_MIN / 100} ر.س`, `Minimum SAR ${TOPUP_MIN / 100}`), max: tx(`الحد الأعلى ${TOPUP_MAX / 100} ر.س`, `Maximum SAR ${TOPUP_MAX / 100}`) })[e],
  };
}

export default function CreditPanel() {
  const tx = useTx();
  const s = creditStore.use();
  const role = testStore.use().role;
  const manage = can(role, 'billing.manage');
  const [dlg, setDlg] = useState<null | 'topup' | CreditService>(null);
  const bal = creditBalance(s);
  const low = isLow(s);

  return (
    <div className="space-y-6 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted">{tx('رصيد مسبق لخدمات «لك» فقط، منفصل عن أرباح متجرك وتحويلاتك.', 'Prepaid balance for LAK services only, separate from your sales and payouts.')}</p>
        <DecisionMarker id="storeCredit" />
      </div>
      {low && (
        <Alert tone="warn" title={tx('الرصيد منخفض', 'Low balance')} action={manage ? <Button size="sm" onClick={() => setDlg('topup')}>{tx('اشحن', 'Top up')}</Button> : undefined}>
          {tx(`الرصيد أقل من حد التنبيه (${riyals(s.threshold)} ر.س). قد تتوقف الرسائل والبوليصات المدفوعة من الرصيد.`, `Balance is below your alert (SAR ${riyals(s.threshold)}). Messages and labels paid from credit may stop.`)}
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-brand-300 bg-brand-500/[.04] p-5 dark:border-brand-500/40">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted"><Wallet className="size-4" aria-hidden="true" />{tx('رصيد لك', 'LAK credit')}</p>
          <p className="mt-1 text-2xl font-bold text-fg"><Money v={bal} /></p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {manage ? <Button size="sm" className="bg-brand-gradient" onClick={() => setDlg('topup')}><Plus className="size-4" aria-hidden="true" />{tx('اشحن الرصيد', 'Top up credit')}</Button>
              : <span className="text-xs text-muted">{tx('الشحن يتطلب صلاحية الفوترة', 'Top-up needs billing permission')}</span>}
            <Simulated />
          </div>
        </div>
        <div className="rounded-2xl border border-border p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted"><BellRing className="size-4" aria-hidden="true" />{tx('تنبيه انخفاض الرصيد', 'Low-balance alert')}</p>
          <p className="mt-1 text-lg font-semibold text-fg">{tx('أقل من', 'Below')} <Money v={s.threshold} /></p>
          <p className="mt-1 text-xs text-muted">{tx('يظهر في مركز العمل', 'Shows in the work centre')}</p>
        </div>
        <div className="rounded-2xl border border-border p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted"><Zap className="size-4" aria-hidden="true" />{tx('الشحن التلقائي', 'Auto top-up')}</p>
          <p className="mt-1 text-lg font-semibold text-fg">{s.auto.on ? tx('مفعّل', 'On') : tx('متوقف', 'Off')}</p>
          <p className="mt-1 text-xs text-muted">{s.auto.on ? <>{tx('يشحن', 'Adds')} <Money v={s.auto.amount} /> {tx('عند أقل من', 'below')} <Money v={s.auto.below} /></> : tx('تشحن يدويًا فقط', 'You top up manually')}</p>
        </div>
      </div>

      <Services manage={manage} onUse={(svc) => setDlg(svc)} />
      {manage && <RulesForm />}
      <Ledger />

      {dlg === 'topup' && <TopUpModal onClose={() => setDlg(null)} />}
      {dlg && dlg !== 'topup' && <SpendModal service={dlg} onClose={() => setDlg(null)} />}
    </div>
  );
}

/* ---------- Services and their (pending) unit prices ---------- */

function Services({ manage, onUse }: { manage: boolean; onUse: (s: CreditService) => void }) {
  const tx = useTx();
  const n = useCreditNames();
  const s = creditStore.use();
  const [raw, setRaw] = useState<Record<string, string>>({});
  const setUnit = (svc: CreditService, v: string) => {
    setRaw((r) => ({ ...r, [svc]: v }));
    const num = parseNum(v);
    creditStore.set((c) => {
      const unit = { ...c.unit };
      if (num === null || num <= 0) delete unit[svc]; else unit[svc] = Math.round(num * 100);
      return { ...c, unit };
    });
  };
  return (
    <section aria-labelledby="h-svc">
      <h3 id="h-svc" className="mb-3 flex items-center gap-1.5 text-[15px] font-semibold text-fg">{tx('خدمات تُدفع من الرصيد', 'Services paid from credit')}
        <InfoHint>{tx('سعر الوحدة تحدده «لك» بعد الاعتماد. لتجربة الخطوات اكتب سعرًا تجريبيًا؛ لا يُعد عرض سعر.', 'LAK sets the unit price after approval. To try the flow, type an example price; it is not a quote.')}</InfoHint></h3>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {CREDIT_SERVICES.map((svc) => {
          const I = S_ICON[svc];
          const unit = s.unit[svc];
          const shown = raw[svc] ?? (unit !== undefined ? riyals(unit) : '');
          const bad = shown.trim() !== '' && (parseNum(shown) === null || parseNum(shown)! <= 0);
          return (
            <li key={svc} className="flex flex-col rounded-2xl border border-border p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-fg"><I className="size-4 text-muted" aria-hidden="true" />{n.service(svc)}</p>
              <p className="mt-2 flex items-center justify-between gap-2 text-xs"><span className="text-muted">{tx(`سعر ${n.unit(svc)} من «لك»`, `LAK price per ${n.unit(svc)}`)}</span><Pending /></p>
              <Field className="mt-3" label={<span className="flex items-center gap-1.5">{tx('سعر تجريبي', 'Example price')}<Badge tone="amber">{tx('مثال للتجربة', 'Example only')}</Badge></span>} error={bad ? tx('رقم أكبر من صفر', 'A number above zero') : null} hint={tx('ر.س لكل وحدة', 'SAR per unit')}>
                {(p) => <Input {...p} inputMode="decimal" dir="ltr" value={shown} onChange={(e) => setUnit(svc, e.target.value)} placeholder="—" disabled={!manage} />}
              </Field>
              <div className="mt-3">
                <Button size="sm" variant="secondary" disabled={!manage || unit === undefined} onClick={() => onUse(svc)}>{tx('استخدم من الرصيد', 'Use credit')}</Button>
                {unit === undefined && <p className="mt-1.5 text-[11px] text-subtle">{tx('يتاح بعد كتابة سعر تجريبي', 'Available once an example price is typed')}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------- Top-up ---------- */

function TopUpModal({ onClose }: { onClose: () => void }) {
  const tx = useTx();
  const n = useCreditNames();
  const toast = useToast();
  const review = useReviewMode();
  const s = creditStore.use();
  const [amount, setAmount] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [failed, setFailed] = useState(false);
  const chk = checkTopUp(amount);
  const bal = creditBalance(s);
  const run = () => {
    setTouched(true);
    if (!chk.ok) return;
    setBusy(true); setFailed(false);
    window.setTimeout(() => {
      setBusy(false);
      if (failNext) { setFailed(true); setFailNext(false); return; }
      const who = currentActor().name;
      creditStore.set((c) => topUp(c, chk.v, who));
      logAction('finance', { ar: `شحن رصيد لك ${riyals(chk.v)} ر.س (محاكاة)`, en: `Topped up LAK credit SAR ${riyals(chk.v)} (simulated)` }, { before: riyals(bal), after: riyals(bal + chk.v) });
      toast({ tone: 'ok', text: tx('شُحن الرصيد (محاكاة)', 'Credit topped up (simulated)') });
      onClose();
    }, 700);
  };
  return (
    <Modal title={tx('شحن رصيد لك', 'Top up LAK credit')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={run} disabled={busy}>{busy ? tx('جارٍ الشحن…', 'Topping up…') : failed ? tx('أعد المحاولة', 'Try again') : tx('اشحن الآن', 'Top up now')}</Button></>}>
      <Field label={tx('المبلغ (ر.س)', 'Amount (SAR)')} error={touched && !chk.ok ? n.topErr(chk.e) : null} hint={tx('تقبل الأرقام العربية', 'Arabic digits accepted')}>
        {(p) => <Input {...p} autoFocus inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="200" />}
      </Field>
      <div className="flex flex-wrap gap-2">{[100, 250, 500].map((v) => <Button key={v} size="sm" variant="secondary" onClick={() => setAmount(String(v))}><bdi className="tabular-nums">{v}</bdi> {tx('ر.س', 'SAR')}</Button>)}</div>
      <dl className="space-y-2 rounded-xl bg-surface-2/60 p-4 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted">{tx('الرصيد الآن', 'Balance now')}</dt><dd><Money v={bal} /></dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">{tx('بعد الشحن', 'After top-up')}</dt><dd className="font-semibold">{chk.ok ? <Money v={bal + chk.v} /> : '—'}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">{tx('من', 'From')}</dt><dd className="flex items-center gap-1.5"><CreditCard className="size-4 text-muted" aria-hidden="true" /><Ref>•••• 1142</Ref></dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">{tx('الضريبة والاسترداد', 'VAT and refunds')}</dt><dd><Pending /></dd></div>
      </dl>
      {failed && <Alert tone="bad" title={tx('رفض البنك العملية', 'The bank declined')}>{tx('لم يُخصم شيء ولم يتغير رصيدك. المرجع SIM-CR-402.', 'Nothing was charged; your balance did not change. Ref SIM-CR-402.')}</Alert>}
      <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('لا تُخصم بطاقتك في هذه المعاينة.', 'Your card is not charged in this preview.')}</p>
      {review && <label className="flex items-center gap-2 text-xs text-muted"><Switch checked={failNext} onChange={setFailNext} label={tx('حاكِ رفض البطاقة', 'Simulate a declined card')} />{tx('حاكِ رفض البطاقة', 'Simulate a declined card')}</label>}
    </Modal>
  );
}

/* ---------- Spend (preview before deducting) ---------- */

function SpendModal({ service, onClose }: { service: CreditService; onClose: () => void }) {
  const tx = useTx();
  const n = useCreditNames();
  const toast = useToast();
  const s = creditStore.use();
  const [qty, setQty] = useState('');
  const q = parseNum(qty);
  const qn = q !== null && Number.isInteger(q) ? q : NaN;
  const err = qty.trim() ? checkSpend(s, service, qn) : null;
  const unit = s.unit[service] ?? 0;
  const cost = Number.isFinite(qn) ? qn * unit : 0;
  const bal = creditBalance(s);
  const autoFires = s.auto.on && bal < cost;
  const after = Number.isFinite(qn) && !err ? creditBalance(spend(s, service, qn, 'preview')) : null;
  const run = () => {
    if (!qty.trim() || err) return;
    creditStore.set((c) => spend(c, service, qn, currentActor().name));
    logAction('finance', { ar: `استخدام رصيد لك: ${qn} ${n.unit(service)} (${n.service(service)}) بسعر تجريبي`, en: `Spent LAK credit: ${qn} × ${n.unit(service)} (${n.service(service)}) at an example price` }, { before: riyals(bal), after: riyals(after ?? bal) });
    toast({ tone: 'ok', text: tx('خُصم من الرصيد (محاكاة)', 'Deducted from credit (simulated)') });
    onClose();
  };
  const errText = err === 'qty' ? tx('عدد صحيح أكبر من صفر', 'A whole number above zero') : err === 'funds' ? tx('الرصيد لا يكفي؛ اشحن أولًا أو فعّل الشحن التلقائي', 'Not enough credit; top up first or turn on auto top-up') : err === 'unit' ? tx('اكتب سعرًا تجريبيًا أولًا', 'Type an example price first') : null;
  return (
    <Modal title={tx(`استخدام الرصيد: ${n.service(service)}`, `Use credit: ${n.service(service)}`)} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={run} disabled={!qty.trim() || !!err}>{tx('اخصم من الرصيد', 'Deduct from credit')}</Button></>}>
      <Field label={tx(`العدد (${n.unit(service)})`, `Quantity (${n.unit(service)})`)} error={errText}>
        {(p) => <Input {...p} autoFocus inputMode="numeric" dir="ltr" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="100" />}
      </Field>
      <dl className="space-y-2 rounded-xl bg-surface-2/60 p-4 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted">{tx('سعر الوحدة', 'Unit price')}</dt><dd className="flex items-center gap-1.5"><Money v={unit} /><Badge tone="amber">{tx('مثال للتجربة', 'Example only')}</Badge></dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">{tx('التكلفة', 'Cost')}</dt><dd className="font-semibold"><Money v={cost} /></dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">{tx('الرصيد بعدها', 'Balance after')}</dt><dd>{after !== null ? <Money v={after} /> : '—'}</dd></div>
      </dl>
      {autoFires && !err && <Alert tone="info">{tx('سيُشحن الرصيد تلقائيًا قبل الخصم حسب قاعدتك.', 'Your auto top-up rule will add credit before deducting.')}</Alert>}
      <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('لا تُرسل رسائل ولا تصدر بوليصات من هنا؛ يُسجَّل الخصم فقط.', 'No messages are sent and no labels are issued here; only the deduction is logged.')}</p>
    </Modal>
  );
}

/* ---------- Alert threshold and auto top-up rule ---------- */

function RulesForm() {
  const tx = useTx();
  const n = useCreditNames();
  const toast = useToast();
  const s = creditStore.use();
  const base = { threshold: riyals(s.threshold), on: s.auto.on, below: riyals(s.auto.below), amount: riyals(s.auto.amount) };
  const [d, setD, clear] = useSessionDraft('finance.creditRules', base);
  const [tried, setTried] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(base);
  useUnsaved(dirty, { ar: 'قواعد رصيد لك', en: 'LAK credit rules' });
  const th = checkTopUp(d.threshold);
  const ae = d.on ? checkAuto(d) : {};
  const ok = th.ok && !ae.below && !ae.amount;
  const save = () => {
    setTried(true);
    if (!ok) return;
    const below = checkTopUp(d.below); const amount = checkTopUp(d.amount);
    creditStore.set((c) => applyAuto({ ...c, threshold: th.ok ? th.v : c.threshold, auto: { on: d.on, below: below.ok ? below.v : c.auto.below, amount: amount.ok ? amount.v : c.auto.amount } }));
    logAction('finance', { ar: `حدّث قواعد رصيد لك: التنبيه أقل من ${d.threshold} ر.س، الشحن التلقائي ${d.on ? `${d.amount} ر.س عند أقل من ${d.below}` : 'متوقف'}`, en: `Updated LAK credit rules: alert below SAR ${d.threshold}, auto top-up ${d.on ? `SAR ${d.amount} below ${d.below}` : 'off'}` });
    clear(); setTried(false);
    toast({ tone: 'ok', text: tx('حُفظت القواعد', 'Rules saved') });
  };
  return (
    <section aria-labelledby="h-rules" className="rounded-2xl border border-border p-4 sm:p-5">
      <h3 id="h-rules" className="mb-3 text-[15px] font-semibold text-fg">{tx('التنبيه والشحن التلقائي', 'Alert and auto top-up')}</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={tx('نبّهني عند أقل من (ر.س)', 'Alert me below (SAR)')} error={tried && !th.ok ? n.topErr(th.e) : null}>
          {(p) => <Input {...p} inputMode="decimal" dir="ltr" value={d.threshold} onChange={(e) => setD({ ...d, threshold: e.target.value })} />}
        </Field>
        <Field label={tx('اشحن عند أقل من (ر.س)', 'Top up below (SAR)')} error={tried && ae.below ? n.topErr(ae.below) : null}>
          {(p) => <Input {...p} inputMode="decimal" dir="ltr" value={d.below} disabled={!d.on} onChange={(e) => setD({ ...d, below: e.target.value })} />}
        </Field>
        <Field label={tx('مبلغ الشحن (ر.س)', 'Top-up amount (SAR)')} error={tried && ae.amount ? n.topErr(ae.amount) : null}>
          {(p) => <Input {...p} inputMode="decimal" dir="ltr" value={d.amount} disabled={!d.on} onChange={(e) => setD({ ...d, amount: e.target.value })} />}
        </Field>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm font-medium text-fg"><Switch checked={d.on} onChange={(v) => setD({ ...d, on: v })} label={tx('الشحن التلقائي', 'Auto top-up')} />{tx('اشحن تلقائيًا من البطاقة •••• 1142', 'Top up automatically from card •••• 1142')}</label>
      <SaveBar dirty={dirty} onSave={save} onDiscard={() => { clear(); setTried(false); }} error={tried && !ok ? tx('صحّح الحقول المعلّمة', 'Fix the marked fields') : undefined} />
    </section>
  );
}

/* ---------- Ledger ---------- */

function Ledger() {
  const tx = useTx();
  const { lang } = useLang();
  const n = useCreditNames();
  const route = useRoute();
  const s = creditStore.use();
  const qk = route.query.get('ck'); const qs = route.query.get('cs');
  const kind = (KINDS as string[]).includes(qk ?? '') ? (qk as CreditKind) : '';
  const service = (CREDIT_SERVICES as string[]).includes(qs ?? '') ? (qs as CreditService) : '';
  const base = { tab: 'billing', part: 'credit', ck: kind || undefined, cs: service || undefined };
  const go = (p: Record<string, string | undefined>) => replace(link('/dashboard/finance', { ...base, cp: undefined, ...p }));
  const rows = useMemo(() => filterCredit(s.entries, { kind, service }), [s.entries, kind, service]);
  const pg = paginate(rows, Number(route.query.get('cp') ?? 1));
  const date = (iso: string) => new Date(iso).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const what = (e: CreditEntry) => e.service ? `${n.service(e.service)} × ${e.qty}` : n.kind(e.kind);
  const signed = (e: CreditEntry) => <span className={cn('inline-flex items-baseline gap-0.5 whitespace-nowrap', e.kind === 'spend' ? 'text-fg' : 'text-emerald-700 dark:text-emerald-400')}><bdi dir="ltr">{e.kind === 'spend' ? '−' : '+'}</bdi><Money v={e.amount} /></span>;
  const cols: Column<CreditEntry>[] = [
    { key: 'id', header: tx('المرجع', 'Ref'), cell: (e) => <Ref>{e.id}</Ref> },
    { key: 'what', header: tx('الحركة', 'Entry'), cell: (e) => <span className="flex items-center gap-2">{what(e)}<Badge tone={e.kind === 'spend' ? 'gray' : e.kind === 'auto' ? 'sky' : 'green'}>{n.kind(e.kind)}</Badge></span> },
    { key: 'by', header: tx('بواسطة', 'By'), cell: (e) => e.by === 'auto' ? tx('القاعدة التلقائية', 'Auto rule') : e.by, hideBelow: 'lg' },
    { key: 'at', header: tx('الوقت', 'When'), cell: (e) => <span className="text-muted">{date(e.at)}</span>, hideBelow: 'md' },
    { key: 'amt', header: tx('المبلغ', 'Amount'), cell: signed, align: 'end' },
    { key: 'bal', header: tx('الرصيد بعدها', 'Balance after'), cell: (e) => <Money v={e.balance} />, align: 'end' },
  ];
  return (
    <section aria-labelledby="h-ledger">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 id="h-ledger" className="min-w-0 flex-1 text-[15px] font-semibold text-fg">{tx('سجل الرصيد', 'Credit ledger')}</h3>
        <FilterChip label={tx('النوع', 'Type')} value={kind} onChange={(v) => go({ ck: v || undefined })} options={KINDS.map((k) => ({ value: k, label: n.kind(k) }))} />
        <FilterChip label={tx('الخدمة', 'Service')} value={service} onChange={(v) => go({ cs: v || undefined })} options={CREDIT_SERVICES.map((x) => ({ value: x, label: n.service(x) }))} />
      </div>
      <Card>
        {s.entries.length === 0 ? (
          <EmptyState icon={<Wallet className="size-6" aria-hidden="true" />} title={tx('لا حركات بعد', 'No entries yet')}>{tx('اشحن الرصيد لتظهر أول حركة هنا.', 'Top up to see the first entry here.')}</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState title={tx('لا حركات بهذه الفلاتر', 'No entries match these filters')} action={<Button variant="secondary" onClick={() => go({ ck: undefined, cs: undefined })}><RefreshCw className="size-4" aria-hidden="true" />{tx('امسح الفلاتر', 'Clear filters')}</Button>} />
        ) : (
          <>
            <DataTable label={tx('سجل الرصيد', 'Credit ledger')} rows={pg.rows} columns={cols} rowKey={(e) => e.id}
              card={(e) => <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-medium text-fg">{what(e)}</p><p className="text-xs text-muted"><Ref>{e.id}</Ref> · {date(e.at)}</p></div><div className="text-end text-sm">{signed(e)}<p className="text-xs text-muted"><Money v={e.balance} /></p></div></div>} />
            <Pagination page={pg.page} pages={pg.pages} total={pg.total} hrefFor={(p) => link('/dashboard/finance', { ...base, cp: String(p) })} />
          </>
        )}
      </Card>
    </section>
  );
}
