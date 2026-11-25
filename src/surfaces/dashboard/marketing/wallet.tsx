// Customer wallet (`#/dashboard/marketing/wallet`): store credit the merchant owes customers. One place for the
// liability (outstanding, expiring soon), the rules (cap per order, default expiry, expiry reminders), manual and bulk
// credit with a preview, and the ledger where every movement names who, why and the order/refund/offer behind it.
// Customer top-up (stored value paid in by customers) waits on a LAK decision and is not offered.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BellRing, Plus, SearchX, Undo2, Users, Wallet } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { createStore } from '../../../core/store';
import { link, replace, type Route } from '../../../core/router';
import { customersStore, logAction, ordersStore, segmentsStore, settingsStore } from '../../merchant/stores';
import { parseMoney } from '../../merchant/catalog';
import { SEGMENTS, segmentsOf, customerStats, type Segment } from '../../merchant/workspace';
import {
  addDays, bulkCredit, expiringSoon, expiryMessage, fromSettingsDraft, reverseBatch, settingsDraft, validateAdjust, validateSettings, walletLiability, walletBalance,
  type SettingsDraft, type WalletTxn,
} from '../../merchant/wallet';
import { WALLET_TODAY, syncWallet, walletEvent, walletRemindersStore, walletSettingsStore, walletStore } from '../../merchant/wallet-store';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, InfoHint, LinkButton, Money, Ref, Segmented, cn, useTx } from '../../../ds/ui';
import { Alert, DataTable, Drawer, Field, FilterChip, Input, Modal, Pagination, SaveBar, SearchInput, Select, Simulated, Switch, Textarea, useToast, type Column } from '../../../ds/kit';
import { useUnsaved } from '../unsaved';
import { storeName } from '../../storefront/bridge';
import { inSaved, customerRows, paginate } from '../customers/model';
import { Kpi } from './loyalty';
import { Locked } from './access';
import { AdjustModal, DecisionMark, KIND_TONE, sar, useKindName } from './wallet-parts';

const draftStore = createStore.key('dashboard.walletSettingsDraft')<SettingsDraft | null>(() => null);
const KINDS: WalletTxn['kind'][] = ['credit', 'refund', 'cashback', 'spend', 'debit', 'expire', 'reverse', 'unspend'];
const whref = (q: Record<string, string | undefined>) => link('/dashboard/marketing/wallet', q);

export default function WalletTab({ route, empty, canManage }: { route: Route; empty: boolean; canManage: boolean }) {
  const tx = useTx();
  const all = walletStore.use();
  const settings = walletSettingsStore.use();
  const orders = ordersStore.use();
  const [modal, setModal] = useState<'adjust' | 'bulk' | null>(null);
  useEffect(() => { syncWallet(); }, [orders]);

  const ledger = empty ? [] : all;
  const li = walletLiability(ledger, WALLET_TODAY, 30);
  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-center gap-2">
        <DecisionMark what={tx('شحن العميل لمحفظته وتوفّر المحفظة حسب الباقة بانتظار اعتماد لك', 'Customer top-up and plan availability await LAK approval')} />
        <span className="text-xs text-muted">{tx('شحن العميل لمحفظته بنفسه: بانتظار الاعتماد', 'Customer self top-up: pending approval')}</span>
      </div>
      <section aria-label={tx('ملخص المحفظة', 'Wallet summary')} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label={tx('رصيد قائم للعملاء', 'Outstanding credit')} hint={tx('مبالغ غير مصروفة وغير منتهية في محافظ العملاء: التزام على متجرك حتى تُصرف أو تنتهي.', 'Unspent, unexpired credit in customer wallets: owed by your store until spent or expired.')} value={<Money v={li.outstanding} />} />
        <Kpi label={tx('ينتهي خلال 30 يومًا', 'Expiring in 30 days')} value={<Money v={li.soon} />} />
        <Kpi label={tx('صُرف في طلبات', 'Spent on orders')} value={<Money v={li.spent} />} />
        <Kpi label={tx('انتهت صلاحيته', 'Expired')} hint={tx('رصيد انتهى قبل صرفه. لا يُعاد تلقائيًا.', 'Credit that expired unspent. Not restored automatically.')} value={<Money v={li.expired} />} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Rules canManage={canManage} />
        <ExpiringCard ledger={ledger} canManage={canManage} warnDays={settings.warnDays} warnOn={settings.warnOn} />
      </div>

      <Ledger route={route} ledger={ledger} canManage={canManage} onAdjust={() => setModal('adjust')} onBulk={() => setModal('bulk')} />
      {modal === 'adjust' && <AdjustModal onClose={(id) => { setModal(null); if (id) replace(whref({ txn: id })); }} />}
      {modal === 'bulk' && <BulkCredit onClose={() => setModal(null)} />}
    </div>
  );
}

function Rules({ canManage }: { canManage: boolean }) {
  const tx = useTx();
  const toast = useToast();
  const s = walletSettingsStore.use();
  const saved = draftStore.use();
  const d = saved ?? settingsDraft(s);
  const dirty = JSON.stringify(d) !== JSON.stringify(settingsDraft(s));
  const [tried, setTried] = useState(false);
  useUnsaved(dirty, { ar: 'إعدادات المحفظة', en: 'Wallet settings' });
  const errors = validateSettings(d, parseMoney);
  const nErr = Object.keys(errors).length;
  const set = (p: Partial<SettingsDraft>) => draftStore.set({ ...d, ...p });
  const discard = () => { draftStore.set(null); setTried(false); };
  const save = () => {
    setTried(true);
    if (nErr) return;
    const next = fromSettingsDraft(d, s, parseMoney);
    walletSettingsStore.set({ ...next, version: s.version + 1, by: tx('أنت', 'You'), at: WALLET_TODAY });
    logAction('marketing', { ar: `حفظ إعدادات المحفظة (الإصدار ${s.version + 1})`, en: `Saved wallet settings (version ${s.version + 1})` }, { before: `v${s.version}`, after: `v${s.version + 1}` });
    discard();
    toast({ tone: 'ok', text: tx('حُفظت إعدادات المحفظة. تسري على الطلبات الجديدة.', 'Wallet settings saved. They apply to new orders.') });
  };
  const err = (k: keyof typeof errors, m: string) => (tried && errors[k] ? m : null);
  const sample = 400_00;
  const cap = d.capType === 'pct' ? Math.floor((sample * (Number(d.capPct) || 0)) / 100) : parseMoney(d.capFixed) ?? 0;
  return (
    <Card className="lg:col-span-2" aria-labelledby="h-wrules">
      <CardHeader id="h-wrules" title={tx('قواعد المحفظة', 'Wallet rules')} hint={tx('تحدد كم يدفع العميل من رصيده في الطلب، ومتى ينتهي الرصيد اليدوي والمسترد.', 'How much of an order a customer may pay from credit, and when manual and refund credit expires.')}
        action={<span className="text-xs text-muted tabular-nums">{tx(`الإصدار ${s.version} · ${s.by} · ${s.at}`, `Version ${s.version} · ${s.by} · ${s.at}`)}</span>} />
      <fieldset disabled={!canManage} className="space-y-5 px-5 pb-5">
        <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
          <span><span className="block text-sm font-semibold text-fg">{tx('الدفع من المحفظة في المتجر', 'Pay from wallet in the store')}</span><span className="block text-xs text-muted">{d.enabled ? tx('يظهر للعميل المسجّل عند الدفع', 'Shown to signed-in customers at checkout') : tx('موقوف: الأرصدة محفوظة ولا تُستخدم', 'Off: balances are kept, not usable')}</span></span>
          <Switch label={tx('الدفع من المحفظة', 'Pay from wallet')} checked={d.enabled} onChange={(v) => set({ enabled: v })} />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={tx('حد الاستخدام لكل طلب', 'Limit per order')}>
            {() => <Segmented label={tx('نوع الحد', 'Limit type')} value={d.capType} onChange={(v) => set({ capType: v })} options={[{ value: 'pct', label: tx('نسبة من الطلب', 'Share of order') }, { value: 'fixed', label: tx('مبلغ ثابت', 'Fixed amount') }]} />}
          </Field>
          {d.capType === 'pct'
            ? <Field label={tx('النسبة %', 'Share %')} error={err('capPct', tx('من 1 إلى 100', '1 to 100'))}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.capPct} onChange={(e) => set({ capPct: e.target.value })} />}</Field>
            : <Field label={tx('المبلغ (ر.س)', 'Amount (SAR)')} error={err('capFixed', tx('من 1 إلى 5,000 ر.س', 'SAR 1 to 5,000'))}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.capFixed} onChange={(e) => set({ capFixed: e.target.value })} />}</Field>}
          <Field label={tx('انتهاء الرصيد اليدوي (يوم)', 'Manual credit expiry (days)')} optional hint={tx('فارغ = بلا انتهاء', 'Empty = never')} error={err('expiry', tx('من 7 إلى 1095 يومًا', '7 to 1,095 days'))}>
            {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.expiryDays} onChange={(e) => set({ expiryDays: e.target.value })} />}
          </Field>
          <div className="space-y-2">
            <label className="flex items-center justify-between gap-3 text-sm font-medium text-fg">{tx('تذكير قبل الانتهاء', 'Remind before expiry')}<Switch label={tx('تذكير قبل الانتهاء', 'Remind before expiry')} checked={d.warnOn} onChange={(v) => set({ warnOn: v })} /></label>
            {d.warnOn && <Field label={tx('قبل (يوم)', 'Days before')} error={err('warnDays', tx('من 1 إلى 60', '1 to 60'))}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.warnDays} onChange={(e) => set({ warnDays: e.target.value })} />}</Field>}
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-1 rounded-xl border border-dashed border-border px-4 py-2.5 text-[13px] text-muted">{tx('مثال: طلب 400 ر.س ← يدفع من المحفظة حتى', 'Example: a SAR 400 order → up to')} <Money v={Math.min(cap, sample)} className="font-semibold text-fg" />{tx('، والباقي بوسيلة الدفع.', ' from the wallet, the rest by card or cash.')}</p>
      </fieldset>
      {!canManage && <p className="border-t border-border px-5 py-3"><Locked>{tx('دورك يعرض الإعدادات فقط.', 'Your role can only view the settings.')}</Locked></p>}
      {canManage && <SaveBar dirty={dirty} onSave={save} onDiscard={discard} saveLabel={tx(`احفظ الإصدار ${s.version + 1}`, `Save version ${s.version + 1}`)} error={tried && nErr ? tx(`صحّح ${nErr} حقول`, `Fix ${nErr} field(s)`) : undefined} />}
    </Card>
  );
}

function ExpiringCard({ ledger, canManage, warnDays, warnOn }: { ledger: WalletTxn[]; canManage: boolean; warnDays: number; warnOn: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const customers = customersStore.use();
  const sent = walletRemindersStore.use();
  const store = settingsStore.use().store;
  const [preview, setPreview] = useState(false);
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const rows = expiringSoon(ledger, WALLET_TODAY, 30);
  const due = rows.filter((r) => r.days <= warnDays);
  const c = (id: string) => customers.find((x) => x.id === id);
  const reach = due.filter((r) => !!c(r.customerId));
  const first = due[0] && c(due[0].customerId);
  const storeLabel = storeName(store)[lang];
  const send = () => {
    const by = tx('أنت', 'You');
    for (const r of reach) walletEvent(r.customerId, tx(`أُرسل تذكير انتهاء الرصيد (${sar(r.amount)} ر.س، ${r.expires}) — محاكاة`, `Expiry reminder sent (SAR ${sar(r.amount)}, ${r.expires}) — simulated`), by);
    walletRemindersStore.set((l) => [{ id: `WRM-${Date.now()}`, at: WALLET_TODAY, by, count: reach.length, amount: reach.reduce((s, r) => s + r.amount, 0), channel }, ...l]);
    logAction('marketing', { ar: `أرسل تذكير انتهاء الرصيد لـ${reach.length} عميل (محاكاة)`, en: `Sent wallet expiry reminders to ${reach.length} customers (simulated)` });
    setPreview(false);
    toast({ tone: 'ok', text: tx(`أُرسل التذكير لـ${reach.length} عميل (محاكاة)`, `Reminder sent to ${reach.length} customers (simulated)`) });
  };
  return (
    <Card aria-labelledby="h-wexp">
      <CardHeader id="h-wexp" title={tx('ينتهي قريبًا', 'Expiring soon')} hint={tx('أرصدة تنتهي خلال 30 يومًا. التذكير يذهب لمن ينتهي رصيده خلال مدة التذكير.', 'Credit expiring within 30 days. Reminders go to customers whose credit expires within the reminder window.')} />
      {rows.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">{tx('لا أرصدة تنتهي خلال 30 يومًا.', 'No credit expires in the next 30 days.')}</p> : (
        <>
          <ul className="divide-y divide-border px-5">
            {rows.slice(0, 5).map((r) => (
              <li key={r.customerId + r.expires} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <a href={link(`/dashboard/customers/${r.customerId}`)} className="min-w-0 truncate font-medium text-fg hover:text-brand-700">{c(r.customerId)?.name[lang] ?? r.customerId}</a>
                <span className="flex shrink-0 items-center gap-2"><Money v={r.amount} /><Badge tone={r.days <= warnDays ? 'amber' : 'gray'}>{r.days === 0 ? tx('اليوم', 'Today') : tx(`${r.days} يوم`, `${r.days} d`)}</Badge></span>
              </li>
            ))}
          </ul>
          <div className="space-y-2 border-t border-border px-5 py-3">
            {sent[0] && <p className="text-xs text-muted">{tx(`آخر تذكير: ${sent[0].at} · ${sent[0].count} عميل · ${sent[0].by}`, `Last reminder: ${sent[0].at} · ${sent[0].count} customers · ${sent[0].by}`)}</p>}
            {!warnOn ? <p className="text-xs text-muted">{tx('التذكير موقوف في القواعد.', 'Reminders are off in the rules.')}</p>
              : canManage ? <Button size="sm" variant="secondary" disabled={!due.length} onClick={() => setPreview(true)}><BellRing className="size-3.5" aria-hidden="true" />{tx(`عاين تذكير ${due.length} عميل`, `Preview reminder to ${due.length}`)}</Button>
                : <Locked>{tx('للعرض فقط', 'View only')}</Locked>}
          </div>
        </>
      )}
      {preview && first && (
        <Modal title={tx('معاينة تذكير انتهاء الرصيد', 'Preview the expiry reminder')} onClose={() => setPreview(false)}
          footer={<><Button variant="secondary" onClick={() => setPreview(false)}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={!reach.length} onClick={send}><BellRing className="size-4" aria-hidden="true" />{tx(`أرسل لـ${reach.length}`, `Send to ${reach.length}`)}</Button></>}>
          <Segmented label={tx('القناة', 'Channel')} value={channel} onChange={setChannel} options={[{ value: 'email', label: tx('البريد', 'Email') }, { value: 'sms', label: tx('رسالة نصية', 'SMS') }]} />
          <div className="rounded-xl bg-surface-2 p-4 text-sm">
            <p className="text-xs font-semibold text-muted">{tx(`ما يصل ${first.name[lang]} بلغته`, `What ${first.name[lang]} receives`)}</p>
            <p className="mt-1.5 leading-relaxed text-fg">{expiryMessage(lang, { name: first.name[lang].split(' ')[0], amount: sar(due[0].amount), expires: due[0].expires, store: storeLabel })}</p>
          </div>
          <ul className="space-y-1 text-[13px] text-muted">
            <li>{tx(`يصل ${reach.length} عميل ينتهي رصيدهم خلال ${warnDays} أيام`, `Goes to ${reach.length} customers whose credit expires within ${warnDays} days`)}</li>
            <li>{tx('رسالة خدمة عن رصيد العميل، لا تسويق. لا تغيّر الرصيد ولا تاريخ الانتهاء.', 'A service message about the customer’s balance, not marketing. It changes neither the balance nor the expiry.')}</li>
          </ul>
          <Simulated />
        </Modal>
      )}
    </Card>
  );
}

function Ledger({ route, ledger, canManage, onAdjust, onBulk }: { route: Route; ledger: WalletTxn[]; canManage: boolean; onAdjust: () => void; onBulk: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const kindName = useKindName();
  const customers = customersStore.use();
  const q = route.query.get('q') ?? '';
  const kind = route.query.get('kind') ?? '';
  const open = route.query.get('txn');
  const href = (p: Record<string, string | undefined>) => whref({ q: q || undefined, kind: kind || undefined, ...p });
  const name = (id: string) => customers.find((c) => c.id === id)?.name[lang] ?? id;
  const t = q.trim().toLowerCase().replace('#', '');
  const rows = ledger.filter((x) => (!kind || x.kind === kind) && (!t || x.customerId.toLowerCase().includes(t) || name(x.customerId).toLowerCase().includes(t) || (x.orderRef ?? '').includes(t) || (x.batchId ?? '').toLowerCase().includes(t) || x.reason.toLowerCase().includes(t)));
  const pg = paginate(rows, Number(route.query.get('page')) || 1, 12);
  const txn = ledger.find((x) => x.id === open);
  const cause = (x: WalletTxn) => (x.orderRef ? <>{tx('طلب', 'Order')} <Ref>#{x.orderRef}</Ref></> : x.batchId ? <>{tx('دفعة', 'Batch')} <Ref>{x.batchId}</Ref></> : null);
  const reasonText = (x: WalletTxn) => (x.kind === 'spend' ? tx('دفع عند إتمام الطلب', 'Paid at checkout') : x.kind === 'expire' ? tx('انتهت صلاحية الرصيد', 'Credit expired') : x.kind === 'unspend' ? tx('الطلب لم يكتمل', 'Order not completed') : x.reason);
  const cols: Column<WalletTxn>[] = [
    { key: 'c', header: tx('العميل', 'Customer'), cell: (x) => <span className="flex items-center gap-2 font-medium text-fg"><Avatar name={name(x.customerId)} /><span className="truncate">{name(x.customerId)}</span></span> },
    { key: 'k', header: tx('الحركة', 'Movement'), cell: (x) => <Badge tone={KIND_TONE[x.kind]}>{kindName(x.kind)}</Badge> },
    { key: 'r', header: tx('السبب والمصدر', 'Reason and source'), hideBelow: 'lg', cell: (x) => <span className="block max-w-72 text-[13px]"><span className="block truncate text-fg">{reasonText(x)}</span><span className="block text-xs text-muted">{cause(x) ?? '—'} · {x.by === 'system' ? tx('النظام', 'System') : x.by === 'customer' ? tx('العميل', 'Customer') : x.by} · <Ref>{x.at}</Ref></span></span> },
    { key: 'e', header: tx('ينتهي', 'Expires'), hideBelow: 'lg', cell: (x) => <span className="text-[13px] text-muted">{x.amount > 0 ? (x.expires ? <Ref>{x.expires}</Ref> : tx('بلا انتهاء', 'Never')) : '—'}</span> },
    { key: 'a', header: tx('المبلغ', 'Amount'), align: 'end', cell: (x) => <Signed v={x.amount} /> },
  ];
  return (
    <Card aria-labelledby="h-wled">
      <CardHeader id="h-wled" title={tx('سجل المحفظة', 'Wallet ledger')} hint={tx('كل حركة بمن قام بها ومتى ولماذا، ومربوطة بالطلب أو الاسترداد أو العرض الذي أنشأها. الرصيد = مجموع الحركات.', 'Every movement with who, when and why, tied to the order, refund or offer behind it. Balance = sum of movements.')}
        action={canManage ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={onBulk}><Users className="size-3.5" aria-hidden="true" />{tx('رصيد لشريحة', 'Credit a segment')}</Button><Button size="sm" onClick={onAdjust}><Plus className="size-3.5" aria-hidden="true" />{tx('إضافة أو خصم', 'Credit or debit')}</Button></div> : undefined} />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-5">
        <SearchInput value={q} onChange={(v) => replace(href({ q: v || undefined, page: undefined }))} placeholder={tx('ابحث بالعميل أو الطلب أو السبب', 'Search customer, order or reason')} />
        <FilterChip label={tx('الحركة', 'Movement')} value={kind} onChange={(v) => replace(href({ kind: v || undefined, page: undefined }))} options={KINDS.map((k) => ({ value: k, label: kindName(k) }))} />
      </div>
      {pg.total === 0 ? (
        ledger.length === 0
          ? <EmptyState icon={<Wallet className="size-6" aria-hidden="true" />} title={tx('لا حركات في المحافظ بعد', 'No wallet movements yet')} action={canManage ? <Button onClick={onAdjust}>{tx('أضف أول رصيد', 'Add the first credit')}</Button> : undefined}>{tx('أضف رصيدًا لعميل، أو اختر «إلى محفظة العميل» عند الاسترداد، أو أنشئ عرض كاش باك.', 'Credit a customer, choose “To store wallet” when refunding, or create a cashback offer.')}</EmptyState>
          : <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا حركات مطابقة', 'No matching movements')} action={<LinkButton variant="secondary" href={whref({})}>{tx('امسح الفلاتر', 'Clear filters')}</LinkButton>} />
      ) : (
        <div className="border-t border-border">
          <DataTable label={tx('سجل المحفظة', 'Wallet ledger')} rows={pg.rows} columns={cols} rowKey={(x) => x.id} href={(x) => href({ txn: x.id })}
            card={(x) => (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-fg">{name(x.customerId)}</span><Signed v={x.amount} /></div>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted"><Badge tone={KIND_TONE[x.kind]}>{kindName(x.kind)}</Badge>{cause(x)}<Ref>{x.at}</Ref></p>
              </div>
            )} />
          <Pagination page={pg.page} pages={pg.pages} total={pg.total} hrefFor={(p) => href({ page: p > 1 ? String(p) : undefined })} />
        </div>
      )}
      {txn && <TxnDrawer txn={txn} ledger={ledger} canManage={canManage} name={name(txn.customerId)} reason={reasonText(txn)} onClose={() => replace(href({ txn: undefined }))} />}
    </Card>
  );
}

export function Signed({ v }: { v: number }) {
  return <span className={cn('font-semibold tabular-nums', v >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300')}><bdi dir="ltr">{v >= 0 ? '+' : '−'}</bdi><Money v={Math.abs(v)} /></span>;
}

function TxnDrawer({ txn, ledger, canManage, name, reason, onClose }: { txn: WalletTxn; ledger: WalletTxn[]; canManage: boolean; name: string; reason: string; onClose: () => void }) {
  const tx = useTx();
  const toast = useToast();
  const kindName = useKindName();
  const [confirm, setConfirm] = useState(false);
  const batch = txn.batchId ? ledger.filter((t) => t.batchId === txn.batchId) : [];
  const reversed = batch.some((t) => t.kind === 'debit');
  const credits = batch.filter((t) => t.kind === 'credit');
  const preview = txn.batchId && !reversed ? reverseBatch(ledger, txn.batchId, { by: '', today: WALLET_TODAY, reason: '' }) : null;
  const undo = () => {
    if (!txn.batchId) return;
    const r = reverseBatch(walletStore.get(), txn.batchId, { by: tx('أنت', 'You'), today: WALLET_TODAY, reason: tx(`تراجع عن الدفعة ${txn.batchId}`, `Undo of batch ${txn.batchId}`) });
    walletStore.set(r.ledger);
    logAction('marketing', { ar: `تراجع عن دفعة رصيد ${txn.batchId}`, en: `Reversed wallet batch ${txn.batchId}` }, { target: txn.batchId, after: sar(r.taken) });
    toast({ tone: 'ok', text: tx(`سُحب ${sar(r.taken)} ر.س غير مصروف`, `SAR ${sar(r.taken)} unspent taken back`) });
    setConfirm(false);
  };
  const row = (k: string, v: ReactNode) => <div className="flex justify-between gap-3 px-4 py-2.5"><dt className="text-muted">{k}</dt><dd className="min-w-0 text-end font-medium text-fg">{v}</dd></div>;
  return (
    <Drawer title={kindName(txn.kind)} onClose={onClose}
      footer={canManage && txn.batchId && !reversed ? <Button variant="secondary" onClick={() => setConfirm(true)}><Undo2 className="size-4" aria-hidden="true" />{tx('تراجع عن الدفعة', 'Undo the batch')}</Button> : undefined}>
      <div className="space-y-5">
        <p className="text-2xl font-bold"><Signed v={txn.amount} /></p>
        <dl className="divide-y divide-border rounded-xl border border-border text-sm">
          {row(tx('العميل', 'Customer'), <a className="text-brand-700 hover:underline dark:text-brand-300" href={link(`/dashboard/customers/${txn.customerId}`)}>{name}</a>)}
          {row(tx('السبب', 'Reason'), reason)}
          {row(tx('بواسطة', 'By'), txn.by === 'system' ? tx('النظام', 'System') : txn.by === 'customer' ? tx('العميل', 'Customer') : txn.by)}
          {row(tx('التاريخ', 'Date'), <Ref>{txn.at}</Ref>)}
          {txn.amount > 0 && row(tx('ينتهي', 'Expires'), txn.expires ? <Ref>{txn.expires}</Ref> : tx('بلا انتهاء', 'Never'))}
          {txn.orderRef && row(tx('الطلب', 'Order'), <a className="text-brand-700 hover:underline dark:text-brand-300" href={link(`/dashboard/orders/${txn.orderRef}`)}><Ref>#{txn.orderRef}</Ref></a>)}
          {txn.refundId && row(tx('الاسترداد', 'Refund'), <Ref>{txn.refundId}</Ref>)}
          {txn.offerId && row(tx('العرض', 'Offer'), <a className="text-brand-700 hover:underline dark:text-brand-300" href={link(`/dashboard/marketing/cashback/${txn.offerId}`)}><Ref>{txn.offerId}</Ref></a>)}
          {txn.batchId && row(tx('الدفعة', 'Batch'), <a className="text-brand-700 hover:underline dark:text-brand-300" href={whref({ q: txn.batchId })}><Ref>{txn.batchId}</Ref> · {tx(`${credits.length} عميل`, `${credits.length} customers`)}</a>)}
          {row(tx('رصيد العميل الآن', 'Customer balance now'), <Money v={walletBalance(ledger, txn.customerId)} />)}
        </dl>
        {reversed && <Alert tone="info">{tx('تم التراجع عن هذه الدفعة.', 'This batch was reversed.')}</Alert>}
      </div>
      {confirm && preview && (
        <Modal title={tx(`التراجع عن الدفعة ${txn.batchId}`, `Undo batch ${txn.batchId}`)} onClose={() => setConfirm(false)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={undo}>{tx('اسحب', 'Take back')}&nbsp;<Money v={preview.taken} /></Button></>}>
          <ul className="space-y-1.5 text-sm text-fg">
            <li className="flex flex-wrap items-center gap-1">{tx('يُسحب غير المصروف:', 'Unspent credit taken back:')} <Money v={preview.taken} className="font-semibold" /></li>
            <li className="flex flex-wrap items-center gap-1">{tx('يبقى ما صرفه العملاء:', 'What customers already spent stays:')} <Money v={preview.kept} /></li>
            <li>{tx('تُسجّل حركة خصم لكل عميل مربوطة بالدفعة. لا يُبلَّغ العملاء.', 'A debit is recorded for each customer, tied to the batch. Customers are not notified.')}</li>
          </ul>
        </Modal>
      )}
    </Drawer>
  );
}

/** Credit everyone in a segment (built-in or saved): pick, amount, reason, expiry → preview count, total liability, customer text → execute. */
function BulkCredit({ onClose }: { onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const customers = customersStore.use();
  const orders = ordersStore.use();
  const saved = segmentsStore.use();
  const settings = walletSettingsStore.use();
  const [seg, setSeg] = useState<string>('returning');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [expires, setExpires] = useState(settings.expiryDays === null ? '' : addDays(WALLET_TODAY, settings.expiryDays));
  const [step, setStep] = useState<'form' | 'review'>('form');
  const [tried, setTried] = useState(false);
  const segName = (s: Segment) => ({ returning: tx('عائدون', 'Returning'), new: tx('جدد', 'New'), highValue: tx('قيمة عالية', 'High value'), emailConsent: tx('موافقة البريد', 'Email consent') })[s];
  const members = useMemo(() => {
    if (seg.startsWith('custom:')) { const sg = saved.find((x) => x.id === seg.slice(7)); return sg ? inSaved(customerRows(customers, orders), orders, sg).map((r) => r.c) : []; }
    return customers.filter((c) => !c.blocked && segmentsOf(c, customerStats(c, orders)).includes(seg as Segment));
  }, [seg, customers, orders, saved]);
  const errors = validateAdjust({ dir: 'credit', amount, reason, expires }, 0, parseMoney, WALLET_TODAY);
  const v = parseMoney(amount) ?? 0;
  const next = () => { setTried(true); if (members.length && !Object.keys(errors).length) setStep('review'); };
  const run = () => {
    const by = tx('أنت', 'You');
    const r = bulkCredit(walletStore.get(), members.map((c) => c.id), { amount: v, reason, expires: expires || null }, { by, today: WALLET_TODAY, seed: Date.now() % 100000 });
    walletStore.set(r.ledger);
    for (const c of members) walletEvent(c.id, tx(`أُضيف ${sar(v)} ر.س لمحفظته (دفعة ${r.batchId}): ${reason.trim()}`, `SAR ${sar(v)} added to wallet (batch ${r.batchId}): ${reason.trim()}`), by);
    logAction('marketing', { ar: `أضاف ${sar(v)} ر.س لمحافظ ${r.count} عميل (${r.batchId})`, en: `Credited SAR ${sar(v)} to ${r.count} wallets (${r.batchId})` }, { target: r.batchId, after: sar(v * r.count) });
    toast({ tone: 'ok', text: tx(`أُضيف الرصيد لـ${r.count} عميل. يمكن التراجع من السجل.`, `Credit added for ${r.count} customers. Undo from the ledger.`) });
    onClose();
    replace(whref({ q: r.batchId }));
  };
  const err = (k: keyof typeof errors, m: string) => (tried && errors[k] ? m : null);
  return (
    <Modal size="lg" title={step === 'form' ? tx('رصيد لشريحة عملاء', 'Credit a customer segment') : tx('مراجعة قبل الإضافة', 'Review before crediting')} onClose={onClose}
      footer={step === 'form'
        ? <><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={next}>{tx('راجع', 'Review')}</Button></>
        : <><Button variant="secondary" onClick={() => setStep('form')}>{tx('عدّل', 'Edit')}</Button><Button onClick={run}>{tx(`أضف لـ${members.length} عميل`, `Credit ${members.length} customers`)}</Button></>}>
      {step === 'form' ? (
        <div className="space-y-4">
          <Field label={tx('الشريحة', 'Segment')} error={tried && !members.length ? tx('الشريحة فارغة', 'The segment is empty') : null} hint={tx(`${members.length} عميل الآن (بلا المحظورين)`, `${members.length} customers now (blocked excluded)`)}>
            {(p) => <Select {...p} value={seg} onChange={(e) => setSeg(e.target.value)}>
              <optgroup label={tx('شرائح جاهزة', 'Built-in')}>{SEGMENTS.map((s) => <option key={s} value={s}>{segName(s)}</option>)}</optgroup>
              {saved.length > 0 && <optgroup label={tx('شرائح محفوظة', 'Saved')}>{saved.map((s) => <option key={s.id} value={`custom:${s.id}`}>{s.name[lang]}</option>)}</optgroup>}
            </Select>}
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={tx('المبلغ لكل عميل (ر.س)', 'Amount per customer (SAR)')} error={err('amount', tx('من 0.01 إلى 5,000 ر.س', 'SAR 0.01 to 5,000'))}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
            <Field label={tx('ينتهي', 'Expires')} optional error={err('expires', tx('تاريخ بعد اليوم', 'A date after today'))}>{(p) => <Input {...p} type="date" dir="ltr" min={addDays(WALLET_TODAY, 1)} value={expires} onChange={(e) => setExpires(e.target.value)} />}</Field>
          </div>
          <Field label={tx('السبب', 'Reason')} hint={tx('يظهر للعميل', 'Shown to the customer')} error={err('reason', tx('اكتب سببًا واضحًا', 'Write a clear reason'))}>{(p) => <Textarea {...p} rows={2} className="min-h-16" maxLength={140} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-2 px-4 py-3"><p className="text-xs text-muted">{tx('العملاء', 'Customers')}</p><p className="text-xl font-bold tabular-nums">{members.length}</p></div>
            <div className="rounded-xl bg-surface-2 px-4 py-3"><p className="flex items-center gap-1 text-xs text-muted">{tx('التزام جديد', 'New liability')}<InfoHint>{tx('يضاف لرصيد العملاء القائم حتى يُصرف أو ينتهي. ليس خصمًا من مبيعات اليوم.', 'Added to outstanding customer credit until spent or expired. Not deducted from today’s sales.')}</InfoHint></p><p className="text-xl font-bold"><Money v={v * members.length} /></p></div>
          </div>
          <p className="text-[13px] text-muted">{members.slice(0, 6).map((c) => c.name[lang]).join(tx('، ', ', '))}{members.length > 6 ? tx(` و${members.length - 6} آخرين`, ` and ${members.length - 6} more`) : ''}</p>
          <div className="rounded-xl border border-dashed border-border p-4 text-sm">
            <p className="text-xs font-semibold text-muted">{tx('ما يراه العميل في حسابه', 'What the customer sees in their account')}</p>
            <p className="mt-1.5 text-fg">{tx(`أُضيف لمحفظتك ${sar(v)} ر.س — ${reason.trim()}`, `SAR ${sar(v)} added to your wallet — ${reason.trim()}`)}{expires ? tx(` · صالح حتى ${expires}`, ` · valid until ${expires}`) : ''}</p>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted"><Simulated />{tx('حركة لكل عميل بنفس رقم الدفعة، ويمكن التراجع عن غير المصروف. لا تُرسل رسائل.', 'One movement per customer under one batch id; unspent credit can be undone. No messages are sent.')}</p>
        </>
      )}
    </Modal>
  );
}
