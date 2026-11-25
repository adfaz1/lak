// Affiliate programme (`#/dashboard/marketing/affiliates`, P03-AFF): people the merchant adds, a tracked link and/or code
// each, the merchant's commission rules, commissions credited from store orders (pending until the return window ends →
// approved → paid), fraud holds, payout runs with a preview (recorded, paid outside LAK), and statements.
// Views in `?view=` (partners | commissions | payouts | rules); search, filters and page in the URL.
import { useState } from 'react';
import { Download, Plus, SearchX, Users, Wallet } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { can } from '../../merchant/perms';
import { logAction, ordersStore, productsStore } from '../../merchant/stores';
import {
  partnerTotals, payoutPreview, rulesDraft, rulesFromDraft, runPayout, statementCsv, validateRules, commissionFor,
  type CommissionLine, type CommissionState, type Partner, type Payout, type RulesDraft, type RulesError,
} from '../../merchant/growth';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, LinkButton, Money, Ref, useTx } from '../../../ds/ui';
import { Alert, BulkBar, DataTable, Field, FilterChip, Input, Modal, Pagination, SaveBar, SearchInput, Select, Simulated, Tabs, useToast, type Column } from '../../../ds/kit';
import { DecisionMarker } from '../settings/decision-marker';
import { downloadCsv } from '../finance/download';
import { useUnsaved } from '../unsaved';
import { paginate } from '../customers/model';
import { Locked, useRole } from './access';
import { Kpi } from './loyalty';
import { TODAY } from './model';
import { ExampleTag, PartnerModal, StateBadge, rateLabel, useCommission } from './affiliate-parts';
import { attributionsStore, commissionRulesStore, partnerVisitsStore, partnersStore, payoutsStore, rulesDraftStore } from './affiliates-store';
import AffiliateDetail from './affiliate-detail';

type View = 'partners' | 'commissions' | 'payouts' | 'rules';
const VIEWS: View[] = ['partners', 'commissions', 'payouts', 'rules'];
export const ahref = (q?: Record<string, string | undefined>) => link('/dashboard/marketing/affiliates', q);

export default function Affiliates({ route, empty, canManage }: { route: Route; empty: boolean; canManage: boolean }) {
  const tx = useTx();
  const partnersAll = partnersStore.use();
  const { lines: linesAll, returnDays } = useCommission();
  const [adding, setAdding] = useState(false);
  if (route.path[1]) return <AffiliateDetail id={route.path[1]} canManage={canManage} />;
  const partners = empty ? [] : partnersAll.filter((p) => p.kind === 'affiliate');
  const ids = new Set(partners.map((p) => p.id));
  const lines = linesAll.filter((l) => ids.has(l.partnerId));
  const t = partnerTotals(lines);
  const v = route.query.get('view');
  const view: View = VIEWS.find((x) => x === v) ?? 'partners';
  const held = lines.filter((l) => l.state === 'held').length;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
        <span className="font-semibold text-fg">{tx('برنامجك الخاص', 'Your own programme')}</span>
        <span className="text-muted">{tx('مسوقون تضيفهم وعمولة تحددها. الشبكة المشتركة ودفع المستحقات عبر لك:', 'People you add, commission you set. A shared LAK network and LAK-paid payouts:')}</span>
        <DecisionMarker id="affiliateNetwork" />
        {canManage && view === 'partners' && <Button size="sm" className="ms-auto" onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden="true" />{tx('أضف مسوّقًا', 'Add an affiliate')}</Button>}
      </div>

      <section aria-label={tx('ملخص البرنامج', 'Programme summary')} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label={tx('مبيعات من المسوقين', 'Sales from affiliates')} hint={tx('قيمة المنتجات بعد الخصم وقبل الشحن، ناقص المسترد.', 'Items after discount, before shipping, minus refunds.')} value={<Money v={t.revenue} />} />
        <Kpi label={tx('عمولات معلّقة', 'Pending commission')} hint={tx(`تُعتمد بعد انتهاء مهلة الإرجاع (${returnDays} يومًا من سياسة الإرجاع).`, `Approved after the return window (${returnDays} days, from your returns policy).`)} value={<Money v={t.pending} />} />
        <Kpi label={tx('معتمدة للدفع', 'Approved to pay')} value={<Money v={t.approved - t.clawback} />} />
        <Kpi label={tx('مدفوعة', 'Paid')} value={<Money v={t.paid} />} />
      </section>

      {held > 0 && view !== 'commissions' && <Alert tone="warn" title={tx(`${held} عمولة موقوفة للمراجعة`, `${held} commission(s) held for review`)} action={<LinkButton size="sm" variant="secondary" href={ahref({ view: 'commissions', state: 'held' })}>{tx('راجعها', 'Review')}</LinkButton>}>{tx('اشترى الشريك بنفس جواله أو بريده.', 'The partner bought with their own mobile or email.')}</Alert>}

      <Tabs label={tx('أقسام البرنامج', 'Programme sections')} items={[
        { href: ahref(), label: tx('المسوقون', 'Affiliates'), current: view === 'partners', count: partners.length },
        { href: ahref({ view: 'commissions' }), label: tx('العمولات', 'Commissions'), current: view === 'commissions', count: lines.length },
        { href: ahref({ view: 'payouts' }), label: tx('الدفعات', 'Payouts'), current: view === 'payouts' },
        { href: ahref({ view: 'rules' }), label: tx('قواعد العمولة', 'Commission rules'), current: view === 'rules' },
      ]} />

      {view === 'partners' && <PartnerList route={route} partners={partners} lines={lines} onAdd={canManage ? () => setAdding(true) : undefined} />}
      {view === 'commissions' && <Commissions route={route} partners={partners} lines={lines} canManage={canManage} />}
      {view === 'payouts' && <Payouts partners={partners} lines={lines} />}
      {view === 'rules' && <Rules canManage={canManage} lines={lines} />}
      {adding && <PartnerModal kind="affiliate" onClose={() => setAdding(false)} />}
    </div>
  );
}

function PartnerList({ route, partners, lines, onAdd }: { route: Route; partners: Partner[]; lines: CommissionLine[]; onAdd?: () => void }) {
  const tx = useTx();
  const visits = partnerVisitsStore.use();
  const rules = commissionRulesStore.use();
  const q = route.query.get('q') ?? '';
  const st = route.query.get('status') ?? '';
  const href = (p: Record<string, string | undefined>) => ahref({ q: q || undefined, status: st || undefined, ...p });
  const s = q.trim().toLowerCase();
  const rows = partners.filter((p) => (!st || p.status === st) && (!s || p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s) || (p.email ?? '').toLowerCase().includes(s)));
  const pg = paginate(rows, Number(route.query.get('page')) || 1, 12);
  const statusText = (x: Partner['status']) => ({ invited: tx('مدعو', 'Invited'), active: tx('نشط', 'Active'), paused: tx('موقوف', 'Paused') })[x];
  const cols: Column<Partner>[] = [
    { key: 'n', header: tx('المسوّق', 'Affiliate'), cell: (p) => <span className="flex items-center gap-2"><span className="truncate">{p.name}</span>{p.example && <ExampleTag />}</span> },
    { key: 'c', header: tx('الرمز', 'Code'), cell: (p) => <Ref>{p.code}</Ref> },
    { key: 's', header: tx('الحالة', 'Status'), cell: (p) => <Badge tone={p.status === 'active' ? 'green' : p.status === 'invited' ? 'sky' : 'gray'}>{statusText(p.status)}</Badge> },
    { key: 'r', header: tx('العمولة', 'Commission'), hideBelow: 'lg', cell: (p) => <span className="text-[13px] text-muted">{rateLabel(p.rate, rules.base, tx)}</span> },
    { key: 'v', header: tx('زيارات', 'Visits'), align: 'end', hideBelow: 'md', cell: (p) => <span className="tabular-nums">{visits[p.code] ?? 0}</span> },
    { key: 'o', header: tx('طلبات', 'Orders'), align: 'end', cell: (p) => <span className="tabular-nums">{partnerTotals(lines, p.id).orders}</span> },
    { key: 'm', header: tx('مستحق', 'Owed'), align: 'end', cell: (p) => { const t = partnerTotals(lines, p.id); return <Money v={t.pending + t.approved - t.clawback} />; } },
  ];
  return (
    <Card aria-label={tx('المسوقون', 'Affiliates')}>
      <div className="flex flex-wrap items-center gap-2 p-4 sm:px-5">
        <SearchInput value={q} onChange={(x) => replace(href({ q: x || undefined, page: undefined }))} placeholder={tx('ابحث بالاسم أو الرمز أو البريد', 'Search name, code or email')} />
        <FilterChip label={tx('الحالة', 'Status')} value={st} onChange={(x) => replace(href({ status: x || undefined, page: undefined }))} options={(['invited', 'active', 'paused'] as const).map((x) => ({ value: x, label: statusText(x) }))} />
      </div>
      {pg.total === 0 ? (partners.length === 0
        ? <EmptyState icon={<Users className="size-6" aria-hidden="true" />} title={tx('لا مسوقين بعد', 'No affiliates yet')} action={onAdd && <Button onClick={onAdd}><Plus className="size-4" aria-hidden="true" />{tx('أضف أول مسوّق', 'Add your first affiliate')}</Button>}>{tx('أضف من تعرفه: رابط وكود لكل شخص، وعمولة تحددها أنت.', 'Add people you know: a link and code each, commission you set.')}</EmptyState>
        : <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا نتائج مطابقة', 'No matching affiliates')} action={<LinkButton variant="secondary" href={ahref()}>{tx('امسح الفلاتر', 'Clear filters')}</LinkButton>} />
      ) : (
        <div className="border-t border-border">
          <DataTable label={tx('المسوقون', 'Affiliates')} rows={pg.rows} columns={cols} rowKey={(p) => p.id} href={(p) => ahref().replace('affiliates', `affiliates/${p.id}`)}
            card={(p) => { const t = partnerTotals(lines, p.id); return (
              <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="flex items-center gap-2 truncate text-sm font-semibold text-fg">{p.name}{p.example && <ExampleTag />}</p><p className="text-xs text-muted"><Ref>{p.code}</Ref> · {statusText(p.status)} · {tx(`${t.orders} طلب`, `${t.orders} orders`)}</p></div><Money v={t.pending + t.approved - t.clawback} /></div>
            ); }} />
          <Pagination page={pg.page} pages={pg.pages} total={pg.total} hrefFor={(n) => href({ page: n > 1 ? String(n) : undefined })} />
        </div>
      )}
    </Card>
  );
}

export function useStateText() {
  const tx = useTx();
  return (s: CommissionState) => ({ pending: tx('معلّقة', 'Pending'), approved: tx('معتمدة', 'Approved'), held: tx('موقوفة للمراجعة', 'Held'), paid: tx('مدفوعة', 'Paid'), reversed: tx('ملغاة', 'Reversed'), clawback: tx('تُخصم لاحقًا', 'Clawback') })[s];
}

/** Commission lines with state; held lines (fraud checks) can be approved or rejected, alone or in bulk, after a preview. */
function Commissions({ route, partners, lines, canManage }: { route: Route; partners: Partner[]; lines: CommissionLine[]; canManage: boolean }) {
  const tx = useTx();
  const toast = useToast();
  const stText = useStateText();
  const q = route.query.get('q') ?? '';
  const st = route.query.get('state') ?? '';
  const pid = route.query.get('partner') ?? '';
  const href = (p: Record<string, string | undefined>) => ahref({ view: 'commissions', q: q || undefined, state: st || undefined, partner: pid || undefined, ...p });
  const rows = lines.filter((l) => (!st || l.state === st) && (!pid || l.partnerId === pid) && (!q.trim() || l.ref.includes(q.trim())));
  const pg = paginate(rows, Number(route.query.get('page')) || 1, 12);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<'approved' | 'rejected' | null>(null);
  const name = (id: string) => partners.find((p) => p.id === id)?.name ?? id;
  const selHeld = [...sel].filter((r) => lines.find((l) => l.ref === r)?.state === 'held');
  const review = (decision: 'approved' | 'rejected') => {
    const by = tx('أنت', 'You');
    attributionsStore.set((all) => all.map((a) => (selHeld.includes(a.ref) ? { ...a, review: { decision, by, at: TODAY } } : a)));
    logAction('marketing', { ar: `${decision === 'approved' ? 'اعتماد' : 'رفض'} ${selHeld.length} عمولة موقوفة (${selHeld.join('، ')})`, en: `${decision === 'approved' ? 'Approved' : 'Rejected'} ${selHeld.length} held commission(s) (${selHeld.join(', ')})` });
    toast({ tone: 'ok', text: decision === 'approved' ? tx('اعتُمدت وتتبع مهلة الإرجاع.', 'Approved; they follow the return window.') : tx('رُفضت ولن تُدفع.', 'Rejected; they will not be paid.') });
    setSel(new Set()); setConfirm(null);
  };
  const flagText = (f: CommissionLine['flags'][number]) => ({ self: tx('شراء ذاتي', 'Self-referral'), refund: tx('استرداد', 'Refund'), cancelled: tx('ملغى', 'Cancelled') })[f];
  const cols: Column<CommissionLine>[] = [
    { key: 'r', header: tx('الطلب', 'Order'), cell: (l) => <a className="font-semibold text-fg hover:text-brand-700" href={link(`/dashboard/orders/${l.ref}`)}>#<Ref>{l.ref}</Ref></a> },
    { key: 'p', header: tx('المسوّق', 'Affiliate'), hideBelow: 'md', cell: (l) => <span className="truncate">{name(l.partnerId)}</span> },
    { key: 'v', header: tx('المصدر', 'Source'), hideBelow: 'lg', cell: (l) => <span className="text-[13px] text-muted">{l.via === 'code' ? tx('كود', 'Code') : tx('رابط', 'Link')}</span> },
    { key: 's', header: tx('الحالة', 'State'), cell: (l) => <span className="flex flex-wrap items-center gap-1"><StateBadge s={l.state} />{l.flags.map((f) => <Badge key={f} tone={f === 'self' ? 'red' : 'gray'}>{flagText(f)}</Badge>)}{l.state === 'pending' && <span className="text-xs text-muted">{tx(`بعد ${l.approvesIn} يوم`, `in ${l.approvesIn}d`)}</span>}</span> },
    { key: 'b', header: tx('المبيعات', 'Sales'), align: 'end', hideBelow: 'lg', cell: (l) => <Money v={l.revenue} /> },
    { key: 'a', header: tx('العمولة', 'Commission'), align: 'end', cell: (l) => <Money v={l.amount} /> },
  ];
  return (
    <Card aria-label={tx('العمولات', 'Commissions')}>
      <div className="flex flex-wrap items-center gap-2 p-4 sm:px-5">
        {selHeld.length > 0 && canManage ? (
          <div className="w-full"><BulkBar count={selHeld.length} scope={tx('عمولات موقوفة في هذه الصفحة', 'held commissions on this page')} onClear={() => setSel(new Set())}>
            <Button size="sm" variant="secondary" onClick={() => setConfirm('rejected')}>{tx('ارفض', 'Reject')}</Button>
            <Button size="sm" onClick={() => setConfirm('approved')}>{tx('اعتمد رغم التنبيه', 'Approve anyway')}</Button>
          </BulkBar></div>
        ) : <>
          <SearchInput value={q} onChange={(x) => replace(href({ q: x || undefined, page: undefined }))} placeholder={tx('ابحث برقم الطلب', 'Search order number')} />
          <FilterChip label={tx('الحالة', 'State')} value={st} onChange={(x) => replace(href({ state: x || undefined, page: undefined }))} options={(['pending', 'approved', 'held', 'paid', 'clawback', 'reversed'] as const).map((x) => ({ value: x, label: stText(x) }))} />
          <FilterChip label={tx('المسوّق', 'Affiliate')} value={pid} onChange={(x) => replace(href({ partner: x || undefined, page: undefined }))} options={partners.map((p) => ({ value: p.id, label: p.name }))} />
        </>}
      </div>
      {pg.total === 0 ? (lines.length === 0
        ? <EmptyState icon={<Wallet className="size-6" aria-hidden="true" />} title={tx('لا عمولات بعد', 'No commissions yet')}>{tx('تظهر هنا الطلبات القادمة من روابط المسوقين أو أكوادهم.', 'Orders from affiliate links or codes appear here.')}</EmptyState>
        : <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا نتائج مطابقة', 'No matching commissions')} action={<LinkButton variant="secondary" href={ahref({ view: 'commissions' })}>{tx('امسح الفلاتر', 'Clear filters')}</LinkButton>} />
      ) : (
        <div className="border-t border-border">
          <DataTable label={tx('العمولات', 'Commissions')} rows={pg.rows} columns={cols} rowKey={(l) => l.ref}
            selected={canManage && pg.rows.some((l) => l.state === 'held') ? sel : undefined}
            onSelect={canManage && pg.rows.some((l) => l.state === 'held') ? (k, on) => setSel((s) => { const n = new Set(s); if (on && lines.find((l) => l.ref === k)?.state === 'held') n.add(k); else n.delete(k); return n; }) : undefined}
            card={(l) => (
              <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-fg">#<Ref>{l.ref}</Ref> · {name(l.partnerId)}</p><p className="mt-1 flex flex-wrap gap-1"><StateBadge s={l.state} />{l.flags.map((f) => <Badge key={f} tone="gray">{flagText(f)}</Badge>)}</p></div><Money v={l.amount} /></div>
            )} />
          <Pagination page={pg.page} pages={pg.pages} total={pg.total} hrefFor={(n) => href({ page: n > 1 ? String(n) : undefined })} />
        </div>
      )}
      {confirm && (
        <Modal title={confirm === 'approved' ? tx('اعتماد عمولات موقوفة', 'Approve held commissions') : tx('رفض عمولات موقوفة', 'Reject held commissions')} onClose={() => setConfirm(null)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant={confirm === 'rejected' ? 'danger' : undefined} onClick={() => review(confirm)}>{confirm === 'approved' ? tx(`اعتمد ${selHeld.length}`, `Approve ${selHeld.length}`) : tx(`ارفض ${selHeld.length}`, `Reject ${selHeld.length}`)}</Button></>}>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">{selHeld.map((r) => { const l = lines.find((x) => x.ref === r)!; return <li key={r} className="flex justify-between px-4 py-2"><span>#<Ref>{r}</Ref> · {name(l.partnerId)}</span><Money v={l.amount} /></li>; })}</ul>
          <p className="text-xs text-muted">{confirm === 'approved' ? tx('تتبع مهلة الإرجاع ثم تدخل الدفعة القادمة.', 'They follow the return window, then join the next payout.') : tx('تصبح ملغاة ولا تُدفع. يُسجَّل القرار باسمك.', 'They become reversed and are not paid. The decision is logged under your name.')}</p>
        </Modal>
      )}
    </Card>
  );
}

/** Payout run: who would be paid now and why others are skipped; recording it marks those commissions paid. */
function Payouts({ partners, lines }: { partners: Partner[]; lines: CommissionLine[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const role = useRole();
  const canPay = can(role, 'billing.manage');
  const rules = commissionRulesStore.use();
  const payouts = payoutsStore.use();
  const [open, setOpen] = useState(false);
  const preview = payoutPreview(lines, partners, rules.minPayout);
  const payable = preview.filter((r) => !r.skip);
  const total = payable.reduce((s, r) => s + r.total, 0);
  const skipText = (k: NonNullable<(typeof preview)[number]['skip']>) => ({ min: tx('أقل من الحد الأدنى', 'Below minimum'), none: tx('لا مستحق', 'Nothing owed'), paused: tx('الشريك موقوف', 'Partner paused') })[k];
  const record = () => {
    const id = `PO-${Date.now().toString().slice(-6)}`;
    const po = runPayout(preview, id, tx('أنت', 'You'), TODAY);
    if (!po) { setOpen(false); return; }
    payoutsStore.set((l) => [po, ...l]);
    logAction('marketing', { ar: `تسجيل دفعة مسوقين ${id} لـ${po.lines.length} شريك بإجمالي ${(po.total / 100).toFixed(2)} ر.س (خارج لك)`, en: `Recorded affiliate payout ${id} to ${po.lines.length} partner(s), SAR ${(po.total / 100).toFixed(2)} (outside LAK)` }, { target: id });
    setOpen(false);
    toast({ tone: 'ok', text: tx(`سُجّلت الدفعة ${id}. العمولات المشمولة صارت مدفوعة.`, `Payout ${id} recorded. Its commissions are now paid.`) });
  };
  const exportPo = (po: Payout) => {
    const name = (id: string) => partners.find((p) => p.id === id)?.name ?? id;
    const head = lang === 'ar' ? 'الشريك,الطلب,المبلغ (ر.س)' : 'Partner,Order,Amount (SAR)';
    downloadCsv(`${po.id}.csv`, [head, ...po.lines.flatMap((l) => l.refs.map((r) => `${name(l.partnerId)},${r.ref},${(r.amount / 100).toFixed(2)}`))].join('\n'));
  };
  return (
    <div className="space-y-6">
      <Card aria-labelledby="h-run">
        <CardHeader id="h-run" title={<span className="flex flex-wrap items-center gap-2">{tx('الدفعة القادمة', 'Next payout')}<Simulated /><DecisionMarker id="affiliateNetwork" /></span>}
          hint={tx('تحوّل للمسوقين بنفسك خارج لك ثم تسجّل الدفعة هنا. الدفع عبر لك ورسومه بانتظار الاعتماد.', 'You transfer to affiliates outside LAK, then record the payout here. Paying through LAK, and its fee, are pending approval.')}
          action={canPay ? <Button disabled={!payable.length} onClick={() => setOpen(true)}>{tx('راجع الدفعة', 'Review payout')}</Button> : <Locked>{tx('للمالك أو المالية', 'Owner or finance')}</Locked>} />
        {preview.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">{tx('لا عمولات معتمدة بعد. تُعتمد بعد انتهاء مهلة الإرجاع.', 'No approved commissions yet. They are approved after the return window.')}</p> : (
          <ul className="divide-y divide-border border-t border-border">
            {preview.map((r) => (
              <li key={r.partner.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span className="min-w-0"><span className="font-semibold text-fg">{r.partner.name}</span> <span className="text-xs text-muted">· {tx(`${r.refs.length} طلب`, `${r.refs.length} orders`)}{r.clawback ? tx(` · خصم ${(r.clawback / 100).toFixed(2)} ر.س`, ` · SAR ${(r.clawback / 100).toFixed(2)} deducted`) : ''}</span></span>
                <span className="flex items-center gap-2">{r.skip && <Badge tone="gray">{skipText(r.skip)}</Badge>}<Money v={r.total} /></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card aria-labelledby="h-hist">
        <CardHeader id="h-hist" title={tx('سجل الدفعات', 'Payout history')} />
        {payouts.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">{tx('لم تُسجَّل دفعات بعد.', 'No payouts recorded yet.')}</p> : (
          <ul className="divide-y divide-border border-t border-border">
            {payouts.map((po) => (
              <li key={po.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span><Ref>{po.id}</Ref> <span className="text-xs text-muted">· {po.at} · {po.by} · {tx(`${po.lines.length} شريك`, `${po.lines.length} partner(s)`)}</span></span>
                <span className="flex items-center gap-2"><Money v={po.total} /><IconButton label={tx('صدّر CSV', 'Export CSV')} onClick={() => exportPo(po)}><Download className="size-4" aria-hidden="true" /></IconButton></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {open && (
        <Modal title={tx('تسجيل دفعة المسوقين', 'Record affiliate payout')} onClose={() => setOpen(false)}
          footer={<><Button variant="secondary" onClick={() => setOpen(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={record}>{tx('سجّل الدفعة', 'Record payout')}</Button></>}>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {payable.map((r) => <li key={r.partner.id} className="flex justify-between px-4 py-2.5"><span>{r.partner.name} <span className="text-xs text-muted">· {r.partner.email ?? r.partner.phone ?? ''}</span></span><Money v={r.total} /></li>)}
            <li className="flex justify-between px-4 py-2.5 font-semibold"><span>{tx('الإجمالي', 'Total')}</span><Money v={total} /></li>
          </ul>
          <p className="flex items-start gap-2 text-xs text-muted"><Simulated />{tx('لا يُحوَّل مال من لك. تأكد أنك حوّلت المبالغ، ثم سجّل. يمكن تصدير كشف كل مسوّق من صفحته.', 'No money moves through LAK. Make sure you transferred the amounts, then record. Export each affiliate’s statement from their page.')}</p>
        </Modal>
      )}
    </div>
  );
}

/** Commission rules saved as versions; each attributed order keeps the rules in force when it was placed. */
function Rules({ canManage, lines }: { canManage: boolean; lines: CommissionLine[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const rules = commissionRulesStore.use();
  const products = productsStore.use();
  const saved = rulesDraftStore.use();
  const d = saved ?? rulesDraft(rules);
  const dirty = JSON.stringify(d) !== JSON.stringify(rulesDraft(rules));
  const [tried, setTried] = useState(false);
  useUnsaved(dirty, { ar: 'قواعد العمولة', en: 'Commission rules' });
  const errs = validateRules(d);
  const set = (p: Partial<RulesDraft>) => rulesDraftStore.set({ ...d, ...p });
  const err = (k: RulesError) => tried && errs.includes(k);
  const catNames = [...new Set(products.map((p) => p.category.en))];
  const catLabel = (en: string) => products.find((x) => x.category.en === en)?.category[lang] ?? en;
  const save = () => {
    setTried(true);
    if (errs.length) return;
    const next = rulesFromDraft(d, rules, tx('أنت', 'You'), TODAY);
    commissionRulesStore.set(next);
    rulesDraftStore.set(null);
    logAction('marketing', { ar: `حفظ قواعد العمولة (الإصدار ${next.version})`, en: `Saved commission rules (version ${next.version})` }, { before: `v${rules.version}`, after: `v${next.version}` });
    toast({ tone: 'ok', text: tx(`حُفظ الإصدار ${next.version}. يسري على الطلبات الجديدة.`, `Version ${next.version} saved. Applies to new orders.`) });
  };
  // Preview: the most recent credited order under the draft rules.
  const sample = lines[0];
  const sampleOrder = sample && attributionsStore.get().find((a) => a.ref === sample.ref);
  const draftRules = errs.length ? null : rulesFromDraft(d, rules, '', '');
  return (
    <div className="space-y-6">
      <Card aria-labelledby="h-arules">
        <CardHeader id="h-arules" title={tx('قواعد العمولة', 'Commission rules')} hint={tx('قيمك أنت. كل حفظ إصدار جديد يسري على الطلبات الجديدة فقط.', 'Your own values. Each save is a version that applies to new orders only.')}
          action={<span className="text-xs text-muted tabular-nums">{tx(`الإصدار ${rules.version}`, `Version ${rules.version}`)} · <bdi>{rules.by}</bdi> · <bdi dir="ltr">{rules.at}</bdi></span>} />
        <fieldset disabled={!canManage} className="space-y-5 px-5 pb-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={tx('النوع', 'Type')}>{(p) => <Select {...p} value={d.baseKind} onChange={(e) => set({ baseKind: e.target.value as RulesDraft['baseKind'] })}><option value="percent">{tx('نسبة من المبيعات', 'Percent of sales')}</option><option value="fixed">{tx('مبلغ لكل قطعة', 'Amount per unit')}</option></Select>}</Field>
            <Field label={d.baseKind === 'percent' ? tx('النسبة الأساسية %', 'Base percent %') : tx('المبلغ (ر.س)', 'Amount (SAR)')} hint={d.baseKind === 'percent' ? tx('بعد الخصم وقبل الضريبة', 'After discount, before VAT') : undefined} error={err('base') ? tx('من 0 إلى 90', '0 to 90') : null}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.baseValue} onChange={(e) => set({ baseValue: e.target.value })} />}</Field>
            <Field label={tx('مدة الاحتساب (يوم)', 'Credit window (days)')} hint={tx('بعد النقر على الرابط', 'After a link click')} error={err('cookie') ? tx('من 1 إلى 90', '1 to 90') : null}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.cookieDays} onChange={(e) => set({ cookieDays: e.target.value })} />}</Field>
            <Field label={tx('أقل دفعة (ر.س)', 'Minimum payout (SAR)')} error={err('min') ? tx('مبلغ غير صالح', 'Invalid amount') : null}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.minPayout} onChange={(e) => set({ minPayout: e.target.value })} />}</Field>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-fg">{tx('عمولة حسب التصنيف', 'Commission by category')}</p>
            {d.byCategory.map((x, i) => (
              <div key={i} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_8rem_6rem_auto]">
                <Select aria-label={tx('التصنيف', 'Category')} value={x.cat} onChange={(e) => set({ byCategory: d.byCategory.map((y, j) => (j === i ? { ...y, cat: e.target.value } : y)) })}><option value="">{tx('اختر', 'Choose')}</option>{catNames.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}</Select>
                <Select aria-label={tx('النوع', 'Type')} value={x.kind} onChange={(e) => set({ byCategory: d.byCategory.map((y, j) => (j === i ? { ...y, kind: e.target.value as RulesDraft['baseKind'] } : y)) })}><option value="percent">%</option><option value="fixed">{tx('ر.س/قطعة', 'SAR/unit')}</option></Select>
                <Input aria-label={tx('القيمة', 'Value')} dir="ltr" inputMode="decimal" value={x.value} onChange={(e) => set({ byCategory: d.byCategory.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)) })} />
                <Button type="button" size="sm" variant="ghost" onClick={() => set({ byCategory: d.byCategory.filter((_, j) => j !== i) })}>{tx('احذف', 'Remove')}</Button>
              </div>
            ))}
            {(err('cat') || err('catDup')) && <p className="text-xs text-red-600 dark:text-red-400">{err('catDup') ? tx('تصنيف مكرر', 'Duplicate category') : tx('اختر تصنيفًا وقيمة صالحة', 'Choose a category and a valid value')}</p>}
            <Button type="button" size="sm" variant="ghost" onClick={() => set({ byCategory: [...d.byCategory, { cat: '', kind: 'percent', value: '' }] })}><Plus className="size-4" aria-hidden="true" />{tx('تصنيف', 'Category')}</Button>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-fg">{tx('مستثنى من العمولة', 'Excluded from commission')}</p>
            <div className="flex flex-wrap gap-2">
              {catNames.map((c) => { const on = d.excludeCategories.includes(c); return (
                <button key={c} type="button" aria-pressed={on} onClick={() => set({ excludeCategories: on ? d.excludeCategories.filter((x) => x !== c) : [...d.excludeCategories, c] })}
                  className={on ? 'rounded-full border border-red-400 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-300' : 'rounded-full border border-border px-3 py-1 text-xs text-muted hover:bg-surface-2'}>{catLabel(c)}</button>
              ); })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select aria-label={tx('استثنِ منتجًا', 'Exclude a product')} className="max-w-xs" value="" onChange={(e) => e.target.value && set({ excludeProducts: [...d.excludeProducts, e.target.value] })}>
                <option value="">{tx('استثنِ منتجًا…', 'Exclude a product…')}</option>{products.filter((p) => !d.excludeProducts.includes(p.id)).slice(0, 60).map((p) => <option key={p.id} value={p.id}>{p.name[lang]}</option>)}
              </Select>
              {d.excludeProducts.map((id) => <Badge key={id} tone="red">{products.find((p) => p.id === id)?.name[lang] ?? id} <button type="button" className="ms-1" aria-label={tx('أزل', 'Remove')} onClick={() => set({ excludeProducts: d.excludeProducts.filter((x) => x !== id) })}>×</button></Badge>)}
            </div>
          </div>
        </fieldset>
        {!canManage && <p className="border-t border-border px-5 py-3"><Locked>{tx('دورك يعرض القواعد فقط.', 'Your role can only view the rules.')}</Locked></p>}
      </Card>
      {sample && sampleOrder && draftRules && <RulePreview refId={sample.ref} draft={draftRules} />}
      {canManage && <SaveBar dirty={dirty} onSave={save} onDiscard={() => { rulesDraftStore.set(null); setTried(false); }} saveLabel={tx(`احفظ الإصدار ${rules.version + 1}`, `Save version ${rules.version + 1}`)} error={tried && errs.length ? tx(`صحّح ${errs.length} حقول`, `Fix ${errs.length} field(s)`) : undefined} />}
    </div>
  );
}

function RulePreview({ refId, draft }: { refId: string; draft: ReturnType<typeof rulesFromDraft> }) {
  const tx = useTx();
  const { lang } = useLang();
  const o = ordersStore.use().find((x) => x.ref === refId);
  const products = productsStore.use();
  if (!o) return null;
  const c = commissionFor(o, { ref: o.ref, partnerId: '', via: 'link', at: 0, rules: draft }, products);
  return (
    <Card aria-labelledby="h-rprev">
      <CardHeader id="h-rprev" title={tx('المعاينة على آخر طلب محتسب', 'Preview on the latest credited order')} hint={tx('بالقواعد التي تعدّلها الآن. لا يغيّر عمولة هذا الطلب.', 'With the rules you are editing. Does not change this order’s commission.')} action={<span className="text-xs text-muted">#<Ref>{o.ref}</Ref></span>} />
      <ul className="divide-y divide-border border-t border-border text-sm">
        {c.items.map((it, i) => (
          <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
            <span className="min-w-0 truncate">{it.name[lang]} <span className="text-xs text-muted">× {it.units}</span></span>
            <span className="flex items-center gap-2 text-xs text-muted">{it.excluded ? <Badge tone="gray">{tx('مستثنى', 'Excluded')}</Badge> : it.rate ? (it.rate.kind === 'percent' ? `${it.rate.value}% × ` : '') : ''}{!it.excluded && <Money v={it.net} />}<span className="font-semibold text-fg"><Money v={it.amount} /></span></span>
          </li>
        ))}
        <li className="flex justify-between px-5 py-2.5 font-semibold"><span>{tx('العمولة', 'Commission')}</span><Money v={c.amount} /></li>
      </ul>
    </Card>
  );
}

export function exportStatement(p: Partner, lines: CommissionLine[], lang: 'ar' | 'en') {
  downloadCsv(`statement-${p.code}-${TODAY}.csv`, statementCsv(p, lines, lang));
  logAction('marketing', { ar: `تصدير كشف ${p.name}`, en: `Exported statement for ${p.name}` }, { target: p.id });
}
