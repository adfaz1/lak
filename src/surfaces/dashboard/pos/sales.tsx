// Counter sales (`#/dashboard/pos/sales`, `/sales/<ref>`): every POS order with search, location filter and page in
// the URL; a sale shows its receipt, payments and refunds, and offers refund or exchange at the counter.
// Refunds need the owner or finance role, or a manager's PIN; cash refunds come out of the open drawer.
import { useState } from 'react';
import { ArrowLeftRight, ReceiptText, RotateCcw, SearchX, ShoppingBag } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, navigate, replace, type Route } from '../../../core/router';
import { useReviewMode } from '../../../core/review';
import { allLocations, type Order } from '../../merchant/domain';
import { applyStockEffects } from '../../merchant/inventory';
import { levelsStore, logAction, ordersStore, stockLogStore, teamStore } from '../../merchant/stores';
import { settleRefund } from '../../merchant/domain';
import { canApprove, counterRefund, openShiftAt, pinMatches, returnableAt, returnValue } from '../../merchant/pos';
import type { Role } from '../../merchant/perms';
import { Badge, Button, Card, CardHeader, EmptyState, LinkButton, Money, Ref, Segmented, useTx } from '../../../ds/ui';
import { Alert, DataTable, Field, FilterChip, Input, Modal, PageHeader, Pagination, SearchInput, Select, Simulated, Switch, useToast } from '../../../ds/kit';
import { useUnsaved } from '../unsaved';
import { posStore, setPos } from './state';
import { Receipt, useMethodName } from './pay';
import { Row } from './parts';

const PER = 20;
const fmt = (t: number | undefined, lang: 'ar' | 'en') => (t ? new Date(t).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const paidOf = (o: Order) => o.items.reduce((s, i) => s + i.qty * i.unit, 0) - (o.discount ?? 0);

export function SalesList({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const orders = ordersStore.use();
  const q = route.query.get('q') ?? '';
  const loc = route.query.get('loc') ?? '';
  const page = Math.max(1, Number(route.query.get('page')) || 1);
  const set = (k: string, v: string) => replace(link('/dashboard/pos/sales', { q: k === 'q' ? v || undefined : q || undefined, loc: k === 'loc' ? v || undefined : loc || undefined }));
  const all = orders.filter((o) => o.channel === 'pos');
  const rows = all.filter((o) => (!loc || o.pos?.loc === loc) && (!q.trim() || o.ref.includes(q.trim()) || o.customer.ar.includes(q.trim()) || o.customer.en.toLowerCase().includes(q.trim().toLowerCase()) || o.items.some((i) => i.sku.toLowerCase().includes(q.trim().toLowerCase()))));
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const shown = rows.slice((page - 1) * PER, page * PER);
  const status = (o: Order) => o.pay === 'refunded' ? <Badge tone="gray">{tx('مسترد', 'Refunded')}</Badge> : o.pay === 'partially_refunded' ? <Badge tone="amber">{tx('مسترد جزئيًا', 'Part refunded')}</Badge> : <Badge tone="green">{tx('مدفوع ومُسلَّم', 'Paid, handed over')}</Badge>;
  if (!all.length) return <Card><EmptyState as="h2" icon={<ShoppingBag className="size-6" aria-hidden="true" />} title={tx('لا مبيعات من نقطة البيع بعد', 'No counter sales yet')} action={<LinkButton href={link('/dashboard/pos')}>{tx('افتح الكاشير', 'Open the register')}</LinkButton>}>{tx('كل بيع في المحل يظهر هنا وفي الطلبات بقناة «نقطة البيع».', 'Every in-store sale shows here and in Orders on the “Point of sale” channel.')}</EmptyState></Card>;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 p-4">
        <SearchInput value={q} onChange={(v) => set('q', v)} placeholder={tx('رقم الطلب أو العميل أو SKU', 'Order, customer or SKU')} />
        <FilterChip label={tx('الموقع', 'Location')} value={loc} onChange={(v) => set('loc', v)} options={allLocations().map((l) => ({ value: l.id, label: l.name[lang] }))} />
      </div>
      {rows.length === 0 ? <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا نتائج', 'No results')} action={<Button variant="secondary" onClick={() => replace(link('/dashboard/pos/sales'))}>{tx('امسح التصفية', 'Clear filters')}</Button>} /> : <>
        <DataTable label={tx('مبيعات نقطة البيع', 'Point of sale sales')} rows={shown} rowKey={(o) => o.ref} href={(o) => link(`/dashboard/pos/sales/${o.ref}`)}
          columns={[
            { key: 'ref', header: tx('الطلب', 'Order'), cell: (o) => <Ref>{o.ref}</Ref> },
            { key: 'when', header: tx('الوقت', 'Time'), cell: (o) => fmt(o.placedAt, lang), hideBelow: 'md' },
            { key: 'who', header: tx('العميل', 'Customer'), cell: (o) => o.customer[lang] },
            { key: 'loc', header: tx('الموقع والكاشير', 'Location and cashier'), cell: (o) => <span className="text-muted">{allLocations().find((l) => l.id === o.pos?.loc)?.name[lang]} · {o.pos?.cashier.name}</span>, hideBelow: 'lg' },
            { key: 'st', header: tx('الحالة', 'Status'), cell: status },
            { key: 'total', header: tx('المبلغ', 'Amount'), align: 'end', cell: (o) => <Money v={paidOf(o)} /> },
          ]}
          card={(o) => <div className="flex items-center justify-between gap-3 text-sm"><div className="min-w-0"><p className="font-semibold text-fg"><Ref>{o.ref}</Ref> · {o.customer[lang]}</p><p className="text-xs text-muted">{fmt(o.placedAt, lang)} · {o.pos?.cashier.name}</p></div><div className="text-end"><Money v={paidOf(o)} className="font-semibold text-fg" /><div className="mt-1">{status(o)}</div></div></div>} />
        <div className="border-t border-border p-4"><Pagination page={page} pages={pages} total={rows.length} hrefFor={(p) => link('/dashboard/pos/sales', { q: q || undefined, loc: loc || undefined, page: p > 1 ? String(p) : undefined })} /></div>
      </>}
    </Card>
  );
}

export function SaleDetail({ refId, role }: { refId: string; role: Role }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const review = useReviewMode();
  const name = useMethodName();
  const orders = ordersStore.use();
  const s = posStore.use();
  const team = teamStore.use();
  const o = orders.find((x) => x.ref === refId && x.channel === 'pos');
  const [mode, setMode] = useState<'refund' | 'exchange' | null>(null);
  const [receipt, setReceipt] = useState(false);
  const [picks, setPicks] = useState<string[]>([]);
  const [restock, setRestock] = useState(true);
  const [method, setMethod] = useState<'cash' | 'card'>('cash');
  const [reason, setReason] = useState('');
  const [mgr, setMgr] = useState('');
  const [pin, setPin] = useState('');
  const [tried, setTried] = useState(false);
  useUnsaved(!!mode && (picks.some((p) => p.trim()) || !!reason.trim()), { ar: 'استرداد لم يُكمل', en: 'Refund not finished' });
  if (!o) return <Card><EmptyState as="h2" icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('البيع غير موجود', 'Sale not found')} action={<LinkButton variant="secondary" href={link('/dashboard/pos/sales')}>{tx('كل المبيعات', 'All sales')}</LinkButton>}>{tx('ربما أُعيد ضبط البيانات التجريبية.', 'The demo data may have been reset.')}</EmptyState></Card>;
  const loc = allLocations().find((l) => l.id === o.pos?.loc);
  const n = o.items.map((_, i) => Number((picks[i] ?? '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) || 0));
  const value = returnValue(o, n);
  const shift = o.pos ? openShiftAt(s.shifts, o.pos.loc) : undefined;
  const cashier = team.members.find((m) => m.id === s.session?.memberId);
  // The signed-in cashier acts at the counter; without a counter session, the dashboard role does.
  const actorRole = cashier?.role ?? role;
  const selfOk = actorRole === 'owner' || actorRole === 'finance';
  const managers = team.members.filter((m) => m.status === 'active' && canApprove(m.role, 'refund', s.limits) && s.pins[m.id]);
  const approved = selfOk || (mgr && pinMatches(s.pins, mgr, pin));
  const anyLeft = o.items.some((_, i) => returnableAt(o, i) > 0);
  const qtyErr = o.items.some((_, i) => n[i] < 0 || n[i] > returnableAt(o, i) || !Number.isInteger(n[i]));
  const who = cashier?.name ?? team.members.find((m) => m.role === role)?.name ?? role;

  const close = () => { setMode(null); setPicks([]); setReason(''); setMgr(''); setPin(''); setTried(false); };
  const doRefund = () => {
    setTried(true);
    if (!approved || qtyErr || !value || !reason.trim()) return;
    if (method === 'cash' && !shift) return;
    const r = counterRefund(o, n, restock, method, reason, who, Date.now());
    if (r.error) return;
    let next = r.order;
    if (method === 'card' && !review) next = settleRefund(next, next.refunds[next.refunds.length - 1].id, true);
    ordersStore.set((l) => l.map((x) => (x.ref === o.ref ? next : x)));
    if (r.effects.length) { const fx = applyStockEffects(levelsStore.get(), r.effects, who, o.ref, `POSR-${o.ref}-${o.refunds.length + 1}`); levelsStore.set(fx.levels); stockLogStore.set((l) => [...fx.log, ...l]); }
    if (method === 'cash' && shift) setPos((x) => ({ shifts: x.shifts.map((sh) => (sh.id === shift.id ? { ...sh, cashRefunds: [...sh.cashRefunds, { ref: o.ref, amount: r.amount }] } : sh)) }));
    const by = selfOk ? '' : ` (${tx('اعتمده', 'approved by')} ${team.members.find((m) => m.id === mgr)?.name})`;
    logAction('orders', { ar: `استرداد في نقطة البيع ${o.ref}: ${(r.amount / 100).toFixed(2)} ر.س ${method === 'cash' ? 'نقدًا' : 'للبطاقة'}${by}`, en: `POS refund ${o.ref}: ${(r.amount / 100).toFixed(2)} SAR to ${method}${by}` }, { target: o.ref });
    toast({ tone: 'ok', text: method === 'cash' ? tx('أُعيد المبلغ نقدًا من الدرج', 'Cash returned from the drawer') : tx('أُرسل الاسترداد للبطاقة (محاكاة)', 'Refund sent to the card (simulated)') });
    close();
  };
  const doExchange = () => {
    setTried(true);
    if (!approved || qtyErr || !value || !reason.trim()) return;
    if (!s.session || s.session.loc !== o.pos?.loc || !shift) return;
    setPos(() => ({ exchange: { orderRef: o.ref, picks: n, restock, credit: value, reason: reason.trim() }, tenders: [] }));
    logAction('orders', { ar: `بدأ استبدالًا من ${o.ref} برصيد ${(value / 100).toFixed(2)} ر.س`, en: `Started an exchange from ${o.ref} with ${(value / 100).toFixed(2)} SAR credit` }, { target: o.ref });
    close();
    navigate(link('/dashboard/pos'));
  };
  const blocked = mode === 'exchange' ? (!s.session || s.session.loc !== o.pos?.loc ? tx('افتح الكاشير في موقع البيع نفسه لتستبدل.', 'Open the register at the same location to exchange.') : !shift ? tx('افتح وردية أولًا.', 'Open a shift first.') : null)
    : method === 'cash' && !shift ? tx('الاسترداد النقدي يحتاج وردية مفتوحة في موقع البيع.', 'A cash refund needs an open shift at the sale location.') : null;

  return (
    <div className="space-y-6">
      <PageHeader back={{ href: link('/dashboard/pos/sales'), label: tx('مبيعات نقطة البيع', 'Point of sale sales') }} title={<span>{tx('بيع', 'Sale')} <Ref>{o.ref}</Ref></span>}
        description={`${fmt(o.placedAt, lang)} · ${loc?.name[lang] ?? ''} · ${o.pos?.cashier.name ?? ''}`}
        actions={<><Button variant="secondary" onClick={() => setReceipt(true)}><ReceiptText className="size-4" aria-hidden="true" />{tx('الإيصال', 'Receipt')}</Button>
          {anyLeft && <Button variant="secondary" onClick={() => setMode('exchange')}><ArrowLeftRight className="size-4" aria-hidden="true" />{tx('استبدال', 'Exchange')}</Button>}
          {anyLeft && <Button onClick={() => setMode('refund')}><RotateCcw className="size-4" aria-hidden="true" />{tx('استرداد', 'Refund')}</Button>}</>} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title={tx('الأصناف', 'Items')} />
          <ul className="divide-y divide-border">
            {o.items.map((i, k) => <li key={k} className="flex items-center gap-3 px-5 py-3 text-sm"><div className="min-w-0 flex-1"><p className="font-semibold text-fg">{i.name[lang]}</p><p className="text-xs text-muted">{i.variant?.[lang] && `${i.variant[lang]} · `}<Ref>{i.sku}</Ref>{returnableAt(o, k) < i.qty && ` · ${tx(`مسترد ${i.qty - returnableAt(o, k)}`, `${i.qty - returnableAt(o, k)} refunded`)}`}</p></div><span className="tabular-nums text-muted">{i.qty} ×</span><Money v={i.unit} /></li>)}
          </ul>
          <div className="border-t border-border px-5 py-3">
            {o.discount ? <Row label={`${tx('خصم', 'Discount')} · ${o.pos?.discountReason ?? ''}`}><span className="inline-flex">−<Money v={o.discount} /></span></Row> : null}
            <Row strong label={tx('المدفوع', 'Paid')}><Money v={paidOf(o)} /></Row>
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title={tx('الدفع', 'Payment')} />
            <div className="divide-y divide-border px-5 pb-4">
              {o.pos?.tenders.map((x) => <Row key={x.id} label={<span>{name(x.method)}{x.ref && <span className="text-xs text-subtle"> · <Ref>{x.ref}</Ref></span>}</span>}><Money v={x.amount} /></Row>)}
              {o.pos?.change ? <Row label={tx('الباقي', 'Change')}><Money v={o.pos.change} /></Row> : null}
              {o.pos?.exchangeOf && <Row label={tx('استبدال من', 'Exchange of')}><a className="text-brand-700 hover:underline dark:text-brand-300" href={link(`/dashboard/pos/sales/${o.pos.exchangeOf}`)}><Ref>{o.pos.exchangeOf}</Ref></a></Row>}
            </div>
          </Card>
          <Card>
            <CardHeader title={tx('الاستردادات', 'Refunds')} />
            {o.refunds.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">{tx('لا استردادات.', 'No refunds.')}</p> : (
              <ul className="divide-y divide-border px-5 pb-3">
                {o.refunds.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm"><Ref>{r.id}</Ref><Badge tone={r.status === 'confirmed' ? 'green' : r.status === 'failed' ? 'red' : 'sky'}>{r.status === 'confirmed' ? tx('تم', 'Done') : r.status === 'failed' ? tx('فشل', 'Failed') : tx('قيد المزوّد', 'With provider')}</Badge><span className="text-xs text-muted">{r.reason}</span><Money v={r.amount} className="ms-auto" />
                  {r.status === 'pending' && review && <span className="flex w-full gap-2"><Button size="sm" variant="soft" onClick={() => ordersStore.set((l) => l.map((x) => (x.ref === o.ref ? settleRefund(x, r.id, true) : x)))}>{tx('أكّد (محاكاة)', 'Confirm (sim.)')}</Button><Button size="sm" variant="ghost" onClick={() => ordersStore.set((l) => l.map((x) => (x.ref === o.ref ? settleRefund(x, r.id, false) : x)))}>{tx('افشل (محاكاة)', 'Fail (sim.)')}</Button></span>}
                </li>)}
              </ul>
            )}
            <p className="px-5 pb-4"><a className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300" href={link(`/dashboard/orders/${o.ref}`)}>{tx('افتح في الطلبات', 'Open in Orders')}</a></p>
          </Card>
        </div>
      </div>

      {receipt && <Receipt order={o} onClose={() => setReceipt(false)} />}
      {mode && (
        <Modal size="lg" title={mode === 'refund' ? tx(`استرداد من ${o.ref}`, `Refund from ${o.ref}`) : tx(`استبدال من ${o.ref}`, `Exchange from ${o.ref}`)}
          description={mode === 'exchange' ? tx('القطع المرتجعة تصبح رصيدًا على بيع جديد؛ ما يزيد من الرصيد يُعاد نقدًا.', 'Returned items become credit on a new sale; any unused credit is returned in cash.') : tx('يُعاد السعر المدفوع فعلًا بعد الخصم.', 'The price actually paid, after discount, is returned.')}
          onClose={close}
          footer={<><Button variant="secondary" onClick={close}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={mode === 'refund' ? doRefund : doExchange} disabled={!!blocked}>{mode === 'refund' ? <>{tx('أعد', 'Refund')} <Money v={value} /></> : <>{tx('ابدأ البيع الجديد برصيد', 'Start new sale with')} <Money v={value} /></>}</Button></>}>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {o.items.map((i, k) => {
              const left = returnableAt(o, k);
              return (
                <li key={k} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1"><p className="font-semibold text-fg">{i.name[lang]}</p><p className="text-xs text-muted">{tx(`المتاح للإرجاع ${left}`, `${left} can be returned`)}</p></div>
                  <Input aria-label={tx(`كمية ${i.name.ar}`, `Quantity of ${i.name.en}`)} inputMode="numeric" dir="ltr" className="w-20 text-center" disabled={!left} value={picks[k] ?? ''} placeholder="0"
                    aria-invalid={n[k] > left || undefined} onChange={(e) => setPicks((p) => { const c = [...p]; c[k] = e.target.value; return c; })} />
                </li>
              );
            })}
          </ul>
          {tried && qtyErr && <Alert tone="bad">{tx('كمية أكبر من المتاح للإرجاع.', 'A quantity exceeds what can be returned.')}</Alert>}
          <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-fg">{tx('أعد القطع للمخزون في', 'Put items back in stock at')} {loc?.name[lang]}</span><Switch checked={restock} onChange={setRestock} label={tx('أعد للمخزون', 'Restock')} /></div>
          {mode === 'refund' && <Segmented label={tx('طريقة الاسترداد', 'Refund method')} value={method} onChange={setMethod} options={[{ value: 'cash', label: tx('نقدًا من الدرج', 'Cash from drawer') }, { value: 'card', label: tx('إلى البطاقة', 'To the card') }]} />}
          <Field label={tx('السبب', 'Reason')} error={tried && !reason.trim() ? tx('اكتب السبب', 'Give a reason') : null}>{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tx('مثال: مقاس غير مناسب', 'e.g. wrong size')} />}</Field>
          {!selfOk && (
            <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-sm font-semibold text-fg">{tx('الاسترداد يحتاج اعتماد المالك أو المالية', 'Refunds need the owner or finance to approve')}</p>
              <Field label={tx('المعتمِد', 'Approver')}>{(p) => <Select {...p} value={mgr} onChange={(e) => setMgr(e.target.value)}><option value="">{tx('اختر', 'Choose')}</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>}</Field>
              <Field label={tx('رمزه', 'Their PIN')} error={tried && mgr && !approved ? tx('الرمز غير صحيح', 'Wrong PIN') : null}>{(p) => <Input {...p} type="password" inputMode="numeric" dir="ltr" value={pin} onChange={(e) => setPin(e.target.value)} />}</Field>
            </div>
          )}
          {blocked && <Alert tone="warn">{blocked}</Alert>}
          {mode === 'refund' && method === 'card' && <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('استرداد البطاقة يمر بالمزوّد؛ يبقى «قيد المزوّد» حتى يؤكد.', 'Card refunds go through the provider and stay “with provider” until confirmed.')}</p>}
        </Modal>
      )}
    </div>
  );
}
