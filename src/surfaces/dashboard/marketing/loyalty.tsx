// Loyalty points (`#/dashboard/marketing/loyalty`): earn and redeem rules saved as versions, preview on a sample
// order, balances and the points owed, a checkout redemption simulator, and the points ledger.
// Points for paid orders are recorded with the rules in force at the time; rule changes apply to new orders only.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Award, Coins, SearchX } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { createStore } from '../../../core/store';
import { link, replace, type Route } from '../../../core/router';
import { customerEventsStore, customersStore, logAction, loyaltyStore, ordersStore, pointsStore } from '../../merchant/stores';
import { total } from '../../merchant/domain';
import { parseMoney } from '../../merchant/catalog';
import { earnFor, pointsBalance, pointsLiability, redeemQuote, syncEarned, toLatin, validateLoyalty, type LoyaltyRules, type PointsTxn } from '../../merchant/growth';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, InfoHint, LinkButton, Money, Ref, useTx } from '../../../ds/ui';
import { DataTable, Field, FilterChip, Input, Modal, Pagination, SaveBar, SearchInput, Select, Simulated, Switch, useToast, type Column } from '../../../ds/kit';
import { useUnsaved } from '../unsaved';
import { paginate } from '../customers/model';
import { Locked } from './access';

interface RulesDraft { enabled: boolean; earnPerSar: string; pointValue: string; minRedeem: string; maxRedeemPct: string }
const toDraft = (r: LoyaltyRules): RulesDraft => ({ enabled: r.enabled, earnPerSar: String(r.earnPerSar), pointValue: String(r.pointValue), minRedeem: String(r.minRedeem), maxRedeemPct: String(r.maxRedeemPct) });
/** Unsaved rule edits kept for the tab session. */
const draftStore = createStore.key('dashboard.loyaltyDraft')<RulesDraft | null>(() => null);
const SAMPLE_ORDER = 45000;

export default function Loyalty({ route, empty, canManage }: { route: Route; empty: boolean; canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const rules = loyaltyStore.use();
  const ledgerAll = pointsStore.use();
  const orders = ordersStore.use();
  const customers = customersStore.use();
  const saved = draftStore.use();
  const d = saved ?? toDraft(rules);
  const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(rules));
  const [tried, setTried] = useState(false);
  useUnsaved(dirty, { ar: 'قواعد الولاء', en: 'Loyalty rules' });

  // New paid orders (from the online store, or anywhere) earn points the first time this page sees them.
  useEffect(() => {
    const next = syncEarned(pointsStore.get(), orders, customers, rules, total as never);
    if (next !== pointsStore.get()) pointsStore.set(next);
  }, [orders, customers, rules]);

  const ledger = empty ? [] : ledgerAll;
  const errors = validateLoyalty(d);
  const nErr = Object.keys(errors).length;
  const set = (p: Partial<RulesDraft>) => draftStore.set({ ...d, ...p });
  const discard = () => { draftStore.set(null); setTried(false); };
  const n = (s: string) => Number(toLatin(s));
  const next: LoyaltyRules = nErr ? rules : { ...rules, enabled: d.enabled, earnPerSar: n(d.earnPerSar), pointValue: n(d.pointValue), minRedeem: n(d.minRedeem), maxRedeemPct: n(d.maxRedeemPct) };
  const save = () => {
    setTried(true);
    if (nErr) return;
    loyaltyStore.set({ ...next, version: rules.version + 1, by: tx('أنت', 'You'), at: new Date().toISOString().slice(0, 10) });
    logAction('marketing', { ar: `حفظ قواعد الولاء (الإصدار ${rules.version + 1})`, en: `Saved loyalty rules (version ${rules.version + 1})` }, { before: `v${rules.version}`, after: `v${rules.version + 1}` });
    discard();
    toast({ tone: 'ok', text: tx(`حُفظ الإصدار ${rules.version + 1}. يسري على الطلبات الجديدة.`, `Version ${rules.version + 1} saved. Applies to new orders.`) });
  };

  const balances = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of ledger) m.set(t.customerId, (m.get(t.customerId) ?? 0) + t.delta);
    return m;
  }, [ledger]);
  const members = [...balances.values()].filter((b) => b > 0).length;
  const outstanding = [...balances.values()].reduce((s, b) => s + Math.max(0, b), 0);
  const redeemed = ledger.filter((t) => t.kind === 'redeem').reduce((s, t) => s - t.delta, 0);
  const err = (k: keyof typeof errors, m: string) => (tried && errors[k] ? m : null);
  const sampleEarn = earnFor(next, SAMPLE_ORDER);
  const sampleRedeem = redeemQuote(next, Math.max(next.minRedeem, 400), SAMPLE_ORDER);

  return (
    <div className="space-y-6 pb-20">
      <section aria-label={tx('ملخص الولاء', 'Loyalty summary')} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label={tx('عملاء لديهم نقاط', 'Customers with points')} value={members} />
        <Kpi label={tx('نقاط غير مستبدلة', 'Unredeemed points')} value={outstanding.toLocaleString('en-US')} />
        <Kpi label={tx('الالتزام القائم', 'Points owed')} hint={tx('قيمة كل النقاط غير المستبدلة بقيمة النقطة الحالية: خصومات قد تُمنح لاحقًا.', 'Value of every unredeemed point at today’s point value: discounts that may be given later.')} value={<Money v={pointsLiability(ledger, rules)} />} />
        <Kpi label={tx('نقاط استُبدلت', 'Points redeemed')} value={redeemed.toLocaleString('en-US')} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="h-rules">
          <CardHeader id="h-rules" title={tx('قواعد الكسب والاستبدال', 'Earn and redeem rules')}
            hint={tx('كل حفظ يُنشئ إصدارًا. النقاط المسجّلة لا تتغير؛ الإصدار الجديد يسري على الطلبات الجديدة فقط.', 'Each save creates a version. Recorded points do not change; a new version applies to new orders only.')}
            action={<span className="text-xs text-muted tabular-nums">{tx(`الإصدار ${rules.version} · ${rules.by} · ${rules.at}`, `Version ${rules.version} · ${rules.by} · ${rules.at}`)}</span>} />
          <fieldset disabled={!canManage} className="space-y-5 px-5 pb-5">
            <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
              <span><span className="block text-sm font-semibold text-fg">{tx('البرنامج يعمل', 'Programme on')}</span><span className="block text-xs text-muted">{d.enabled ? tx('العملاء يكسبون ويستبدلون', 'Customers earn and redeem') : tx('موقوف: لا كسب ولا استبدال، والأرصدة محفوظة', 'Off: no earning or redeeming; balances are kept')}</span></span>
              <Switch label={tx('البرنامج يعمل', 'Programme on')} checked={d.enabled} onChange={(v) => set({ enabled: v })} />
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={tx('نقاط لكل 1 ر.س', 'Points per SAR 1')} hint={tx('على الطلب المدفوع', 'On paid orders')} error={err('earn', tx('عدد صحيح من 1 إلى 20', 'A whole number, 1–20'))}>
                {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.earnPerSar} onChange={(e) => set({ earnPerSar: e.target.value })} />}
              </Field>
              <Field label={tx('قيمة النقطة (هللة)', 'Point value (halalas)')} hint={tx('100 هللة = 1 ر.س', '100 halalas = SAR 1')} error={err('value', tx('عدد صحيح من 1 إلى 100', 'A whole number, 1–100'))}>
                {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.pointValue} onChange={(e) => set({ pointValue: e.target.value })} />}
              </Field>
              <Field label={tx('أقل رصيد للاستبدال', 'Minimum to redeem')} error={err('min', tx('عدد صحيح 0 أو أكثر', 'A whole number, 0 or more'))}>
                {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.minRedeem} onChange={(e) => set({ minRedeem: e.target.value })} />}
              </Field>
              <Field label={tx('أقصى نسبة من المنتجات %', 'Max share of items %')} hint={tx('لا تدفع النقاط الشحن', 'Points never pay shipping')} error={err('pct', tx('من 1 إلى 100', '1 to 100'))}>
                {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.maxRedeemPct} onChange={(e) => set({ maxRedeemPct: e.target.value })} />}
              </Field>
            </div>
          </fieldset>
          {!canManage && <p className="border-t border-border px-5 py-3"><Locked>{tx('دورك يعرض القواعد فقط.', 'Your role can only view the rules.')}</Locked></p>}
        </Card>

        <Card aria-labelledby="h-lprev">
          <CardHeader id="h-lprev" title={tx('المعاينة على طلب مثال', 'Preview on a sample order')} hint={tx('طلب بقيمة 450 ر.س وعميل رصيده 400 نقطة. ليست توقعًا.', 'A SAR 450 order and a customer with 400 points. Not a forecast.')} />
          <dl className="space-y-2 px-5 pb-5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">{tx('الطلب', 'Order')}</dt><dd><Money v={SAMPLE_ORDER} /></dd></div>
            <div className="flex justify-between"><dt className="text-muted">{tx('يكسب', 'Earns')}</dt><dd className="font-semibold text-fg tabular-nums">{next.enabled ? tx(`${sampleEarn} نقطة`, `${sampleEarn} points`) : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">{tx('قيمة ما يكسبه', 'Worth')}</dt><dd><Money v={sampleEarn * next.pointValue} /></dd></div>
            <div className="flex justify-between border-t border-border pt-2"><dt className="text-muted">{tx('يستطيع استبدال', 'Can redeem')}</dt><dd className="font-semibold text-fg tabular-nums">{sampleRedeem.block ? tx('لا', 'No') : tx(`${sampleRedeem.points} نقطة`, `${sampleRedeem.points} points`)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">{tx('خصم الاستبدال', 'Redemption discount')}</dt><dd className="text-emerald-700 dark:text-emerald-400"><Money v={sampleRedeem.value} /></dd></div>
            <p className="pt-1 text-xs text-muted">{tx(`مكافأة فعلية ≈ ${(next.earnPerSar * next.pointValue).toLocaleString('en-US')}% من الإنفاق`, `Effective reward ≈ ${(next.earnPerSar * next.pointValue).toLocaleString('en-US')}% of spend`)}</p>
          </dl>
        </Card>
      </div>

      <Redeem rules={rules} balances={balances} canManage={canManage} />
      <Ledger route={route} ledger={ledger} lang={lang} />

      {canManage && <SaveBar dirty={dirty} onSave={save} onDiscard={discard} saveLabel={tx(`احفظ الإصدار ${rules.version + 1}`, `Save version ${rules.version + 1}`)}
        error={tried && nErr ? tx(`صحّح ${nErr} حقول`, `Fix ${nErr} field(s)`) : undefined} />}
    </div>
  );
}

export function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <p className="flex items-center gap-1 text-[13px] font-medium text-muted">{label}{hint && <InfoHint>{hint}</InfoHint>}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-fg tabular-nums sm:text-2xl">{value}</p>
    </div>
  );
}

/** Checkout redemption, simulated: pick a customer and a basket; preview the points used and the discount, then record it. */
function Redeem({ rules, balances, canManage }: { rules: LoyaltyRules; balances: Map<string, number>; canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const customers = customersStore.use();
  const ranked = customers.filter((c) => (balances.get(c.id) ?? 0) > 0).sort((a, b) => (balances.get(b.id) ?? 0) - (balances.get(a.id) ?? 0));
  const [cid, setCid] = useState(ranked[0]?.id ?? '');
  const [basket, setBasket] = useState('450');
  const [confirm, setConfirm] = useState(false);
  const c = customers.find((x) => x.id === cid);
  const bal = c ? pointsBalance(pointsStore.get(), c.id) : 0;
  const sub = parseMoney(basket);
  const q = sub === null ? null : redeemQuote(rules, bal, sub);
  const blockText = q?.block && ({ disabled: tx('البرنامج موقوف.', 'The programme is off.'), belowMin: tx(`الرصيد أقل من ${rules.minRedeem} نقطة.`, `Balance is below ${rules.minRedeem} points.`), none: tx('السلة صغيرة على أي استبدال.', 'The basket is too small for any redemption.') })[q.block];
  const apply = () => {
    if (!c || !q || q.block) return;
    const ref = `SIM-${Date.now().toString().slice(-6)}`;
    const txn: PointsTxn = { id: `PT-${ref}`, customerId: c.id, delta: -q.points, kind: 'redeem', ref, note: tx('استبدال تجريبي عند الدفع', 'Test redemption at checkout'), at: 'today', by: tx('أنت', 'You') };
    pointsStore.set((l) => [txn, ...l]);
    customerEventsStore.set((all) => ({ ...all, [c.id]: [{ id: `E${Date.now()}`, kind: 'points', text: tx(`استُبدلت ${q.points} نقطة بخصم ${(q.value / 100).toFixed(2)} ر.س (محاكاة)`, `Redeemed ${q.points} points for SAR ${(q.value / 100).toFixed(2)} off (simulated)`), by: tx('أنت', 'You'), at: Date.now() }, ...(all[c.id] ?? [])] }));
    logAction('marketing', { ar: `استبدال ${q.points} نقطة للعميل ${c.id} (محاكاة)`, en: `Redeemed ${q.points} points for ${c.id} (simulated)` }, { target: c.id });
    setConfirm(false);
    toast({ tone: 'ok', text: tx(`سُجّل الاستبدال. الرصيد الآن ${bal - q.points} نقطة.`, `Redemption recorded. Balance now ${bal - q.points} points.`) });
  };
  return (
    <Card aria-labelledby="h-redeem">
      <CardHeader id="h-redeem" title={<span className="flex items-center gap-2">{tx('الاستبدال عند الدفع', 'Redeem at checkout')}<Simulated /></span>}
        hint={tx('هكذا يحسب الدفع خصم النقاط. صفحة الدفع في المتجر لا تعرض النقاط بعد؛ هذا اختبار يسجّل الحركة في السجل.', 'How checkout computes the points discount. The store checkout does not show points yet; this test records the movement in the ledger.')} />
      {ranked.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">{tx('لا عملاء لديهم نقاط بعد.', 'No customers have points yet.')}</p> : (
        <div className="grid grid-cols-1 gap-4 px-5 pb-5 md:grid-cols-[1fr_10rem_1fr] md:items-end">
          <Field label={tx('العميل', 'Customer')}>
            {(p) => <Select {...p} value={cid} onChange={(e) => setCid(e.target.value)}>{ranked.slice(0, 40).map((x) => <option key={x.id} value={x.id}>{x.name[lang]} · {(balances.get(x.id) ?? 0).toLocaleString('en-US')} {tx('نقطة', 'pts')}</option>)}</Select>}
          </Field>
          <Field label={tx('المنتجات (ر.س)', 'Items (SAR)')} error={sub === null ? tx('مبلغ غير صالح', 'Invalid amount') : null}>
            {(p) => <Input {...p} dir="ltr" inputMode="decimal" value={basket} onChange={(e) => setBasket(e.target.value)} />}
          </Field>
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-4 py-2.5 text-sm">
            {q && !q.block ? <><span className="text-fg tabular-nums">{tx(`${q.points} نقطة`, `${q.points} points`)}</span><span className="text-emerald-700 dark:text-emerald-400">−<Money v={q.value} /></span>{q.cappedBy === 'cap' && <Badge tone="gray">{tx(`حد ${rules.maxRedeemPct}%`, `${rules.maxRedeemPct}% cap`)}</Badge>}</> : <span className="text-muted">{blockText ?? '—'}</span>}
            {canManage ? <Button size="sm" variant="secondary" className="ms-auto" disabled={!q || !!q.block} onClick={() => setConfirm(true)}><Coins className="size-3.5" aria-hidden="true" />{tx('استبدل', 'Redeem')}</Button> : <Locked>{tx('للعرض فقط', 'View only')}</Locked>}
          </div>
        </div>
      )}
      {confirm && c && q && (
        <Modal title={tx('تأكيد الاستبدال', 'Confirm the redemption')} onClose={() => setConfirm(false)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={apply}>{tx(`استبدل ${q.points} نقطة`, `Redeem ${q.points} points`)}</Button></>}>
          <dl className="divide-y divide-border rounded-xl border border-border text-sm">
            {[[tx('العميل', 'Customer'), c.name[lang]], [tx('الرصيد قبل', 'Balance before'), bal.toLocaleString('en-US')], [tx('نقاط مستخدمة', 'Points used'), q.points.toLocaleString('en-US')], [tx('الرصيد بعد', 'Balance after'), (bal - q.points).toLocaleString('en-US')]].map(([k, v]) => (
              <div key={k} className="flex justify-between px-4 py-2.5"><dt className="text-muted">{k}</dt><dd className="font-semibold tabular-nums text-fg">{v}</dd></div>
            ))}
            <div className="flex justify-between px-4 py-2.5"><dt className="text-muted">{tx('خصم على الطلب', 'Discount on the order')}</dt><dd className="font-semibold text-emerald-700 dark:text-emerald-400"><Money v={q.value} /></dd></div>
          </dl>
          <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('لا يُنشأ طلب. تُسجَّل الحركة في سجل النقاط وملف العميل.', 'No order is created. The movement is recorded in the points ledger and the customer profile.')}</p>
        </Modal>
      )}
    </Card>
  );
}

function Ledger({ route, ledger, lang }: { route: Route; ledger: PointsTxn[]; lang: 'ar' | 'en' }) {
  const tx = useTx();
  const customers = customersStore.use();
  const q = route.query.get('q') ?? '';
  const kind = route.query.get('kind') ?? '';
  const href = (p: Record<string, string | undefined>) => link('/dashboard/marketing/loyalty', { q: q || undefined, kind: kind || undefined, ...p });
  const name = (id: string) => customers.find((c) => c.id === id)?.name[lang] ?? id;
  const t = q.trim().toLowerCase();
  const rows = ledger.filter((x) => (!kind || x.kind === kind) && (!t || x.customerId.toLowerCase().includes(t) || name(x.customerId).toLowerCase().includes(t) || (x.ref ?? '').toLowerCase().includes(t)));
  const pg = paginate(rows, Number(route.query.get('page')) || 1, 12);
  const kindName = (k: PointsTxn['kind']) => ({ earn: tx('كسب', 'Earned'), redeem: tx('استبدال', 'Redeemed'), adjust: tx('تعديل', 'Adjusted'), reverse: tx('عكس لاسترداد', 'Reversed (refund)') })[k];
  const cols: Column<PointsTxn>[] = [
    { key: 'c', header: tx('العميل', 'Customer'), cell: (x) => <a href={link(`/dashboard/customers/${x.customerId}`)} className="flex items-center gap-2 font-medium text-fg hover:text-brand-700"><Avatar name={name(x.customerId)} /><span className="truncate">{name(x.customerId)}</span></a> },
    { key: 'k', header: tx('الحركة', 'Movement'), cell: (x) => <Badge tone={x.delta >= 0 ? 'green' : 'amber'}>{kindName(x.kind)}</Badge> },
    { key: 'r', header: tx('المرجع', 'Reference'), hideBelow: 'lg', cell: (x) => <span className="text-[13px] text-muted">{x.ref ? <Ref>{x.ref}</Ref> : '—'}{x.note ? ` · ${x.note}` : ''}</span> },
    { key: 'd', header: tx('النقاط', 'Points'), align: 'end', cell: (x) => <span className={x.delta >= 0 ? 'font-semibold tabular-nums text-emerald-700 dark:text-emerald-400' : 'font-semibold tabular-nums text-amber-700 dark:text-amber-300'}><bdi dir="ltr">{x.delta >= 0 ? '+' : ''}{x.delta.toLocaleString('en-US')}</bdi></span> },
  ];
  return (
    <Card aria-labelledby="h-ledger">
      <CardHeader id="h-ledger" title={tx('سجل النقاط', 'Points ledger')} hint={tx('كل كسب واستبدال وعكس بسبب استرداد، بمرجعه. الرصيد = مجموع الحركات.', 'Every earn, redemption and refund reversal with its reference. Balance = sum of movements.')} />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-5">
        <SearchInput value={q} onChange={(v) => replace(href({ q: v || undefined, page: undefined }))} placeholder={tx('ابحث بالعميل أو المرجع', 'Search customer or reference')} />
        <FilterChip label={tx('الحركة', 'Movement')} value={kind} onChange={(v) => replace(href({ kind: v || undefined, page: undefined }))}
          options={(['earn', 'redeem', 'reverse', 'adjust'] as const).map((k) => ({ value: k, label: kindName(k) }))} />
      </div>
      {pg.total === 0 ? (
        ledger.length === 0
          ? <EmptyState icon={<Award className="size-6" aria-hidden="true" />} title={tx('لا نقاط بعد', 'No points yet')}>{tx('تظهر النقاط هنا بعد أول طلب مدفوع لعميل مسجّل.', 'Points appear here after a registered customer’s first paid order.')}</EmptyState>
          : <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا حركات مطابقة', 'No matching movements')} action={<LinkButton variant="secondary" href={link('/dashboard/marketing/loyalty')}>{tx('امسح الفلاتر', 'Clear filters')}</LinkButton>} />
      ) : (
        <div className="border-t border-border">
          <DataTable label={tx('سجل النقاط', 'Points ledger')} rows={pg.rows} columns={cols} rowKey={(x) => x.id}
            card={(x) => (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-fg">{name(x.customerId)}</p><p className="text-xs text-muted">{kindName(x.kind)}{x.ref ? ` · ${x.ref}` : ''}</p></div>
                <span className="font-semibold tabular-nums"><bdi dir="ltr">{x.delta >= 0 ? '+' : ''}{x.delta}</bdi></span>
              </div>
            )} />
          <Pagination page={pg.page} pages={pg.pages} total={pg.total} hrefFor={(p) => href({ page: p > 1 ? String(p) : undefined })} />
        </div>
      )}
    </Card>
  );
}
