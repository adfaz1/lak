// Quotes (`#/dashboard/wholesale/quotes`, `/quotes/<id>`): a buyer's request (or one the merchant records for them)
// is priced from the buyer's group list, previewed as the buyer will see it, sent (simulated email), answered, and
// converted into a wholesale order that holds stock and awaits payment by the agreed term, with a tax invoice that
// shows the buyer's VAT number.
import { useState } from 'react';
import { FileText, Plus, SearchX, Send, Trash2 } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, navigate, type Route } from '../../../core/router';
import { useReviewMode } from '../../../core/review';
import { allLocations, type Order } from '../../merchant/domain';
import { applyStockEffects } from '../../merchant/inventory';
import { currentActor, levelsStore, logAction, ordersStore, productsStore, settingsStore, stockLogStore, testStore } from '../../merchant/stores';
import { verificationStore } from '../../merchant/verification-store';
import { moneyInput, parseIntStrict, parseMoney, variantText } from '../../merchant/catalog';
import {
  checkQuote, invoiceLines, nextQuoteId, nextTier, priceQuote, quoteEffects, quoteState, quoteToOrder, quoteTotals, unitFor, TERMS_DAYS,
  type Quote, type QuoteLine, type QuoteStatus, type TermsId,
} from '../../merchant/wholesale';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, LinkButton, Money, Ref, useTx, type Tone } from '../../../ds/ui';
import { Alert, DataTable, Field, Input, Modal, PageHeader, Select, Simulated, Tabs, Textarea, useToast } from '../../../ds/kit';
import { sectionHref } from '../pages';
import { useUnsaved } from '../unsaved';
import { setWs, wsStore } from './state';
import { useWsLabels } from './buyers';
import { Row } from '../pos/parts';

const TONE: Record<QuoteStatus, Tone> = { requested: 'sky', quoted: 'brand', accepted: 'green', declined: 'red', expired: 'gray', converted: 'green' };
const DAY = 86_400_000;
const fmtDay = (t: number, lang: 'ar' | 'en') => new Date(t).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { dateStyle: 'medium' });

function useQLabel() {
  const tx = useTx();
  return (s: QuoteStatus) => ({ requested: tx('طلب جديد', 'New request'), quoted: tx('أُرسل العرض', 'Quote sent'), accepted: tx('قبله المشتري', 'Accepted'), declined: tx('رفضه المشتري', 'Declined'), expired: tx('انتهت صلاحيته', 'Expired'), converted: tx('صار طلبًا', 'Ordered') })[s];
}

export function Quotes({ route, canManage }: { route: Route; canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const QL = useQLabel();
  const s = wsStore.use();
  const products = productsStore.use();
  const [creating, setCreating] = useState(false);
  const [buyerId, setBuyerId] = useState('');
  const [lines, setLines] = useState<{ sku: string; qty: string }[]>([{ sku: '', qty: '' }]);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  useUnsaved(creating && (!!buyerId || lines.some((l) => l.sku)), { ar: 'طلب عرض سعر جديد', en: 'New quote request' });
  const now = Date.now();
  const tab = (route.query.get('status') ?? 'all') as QuoteStatus | 'all' | 'open';
  const rows = s.quotes.filter((q) => { const st = quoteState(q, now); return tab === 'all' || (tab === 'open' ? st === 'requested' || st === 'accepted' : st === tab); });
  const approved = s.buyers.filter((b) => b.status === 'approved');
  const skus = products.filter((p) => p.status === 'active' && (p.type === 'physical' || p.type === 'food')).flatMap((p) => (p.variants.length ? p.variants.map((v) => ({ sku: v.sku, productId: p.id, name: p.name, label: `${p.name[lang]} · ${variantText(v.color, v.size)[lang]}` })) : [{ sku: p.sku, productId: p.id, name: p.name, label: p.name[lang] }]));
  const parsed = lines.map((l) => ({ sku: skus.find((x) => x.sku === l.sku), qty: parseIntStrict(l.qty) })).filter((l) => l.sku);
  const ok = buyerId && parsed.length && parsed.every((l) => l.qty && l.qty > 0);
  const create = () => {
    setTried(true);
    if (!ok) return;
    const id = nextQuoteId(s.quotes);
    const q: Quote = { id, buyerId, lines: parsed.map((l) => ({ productId: l.sku!.productId, sku: l.sku!.sku, name: l.sku!.name, qty: l.qty! })), note: note.trim(), status: 'requested', at: Date.now(), source: 'merchant' };
    setWs((x) => ({ quotes: [q, ...x.quotes] }));
    logAction('orders', { ar: `سجّل طلب عرض سعر ${id}`, en: `Recorded quote request ${id}` }, { target: id });
    setCreating(false); setBuyerId(''); setLines([{ sku: '', qty: '' }]); setNote(''); setTried(false);
    navigate(link(`/dashboard/wholesale/quotes/${id}`));
  };
  const count = (t: QuoteStatus | 'all' | 'open') => s.quotes.filter((q) => { const st = quoteState(q, now); return t === 'all' || (t === 'open' ? st === 'requested' || st === 'accepted' : st === t); }).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs label={tx('حالة العروض', 'Quote status')} items={(['all', 'open', 'quoted', 'converted', 'expired'] as const).map((t) => ({ href: link('/dashboard/wholesale/quotes', { status: t === 'all' ? undefined : t }), current: tab === t, count: count(t), label: t === 'all' ? tx('الكل', 'All') : t === 'open' ? tx('يحتاجك', 'Needs you') : QL(t) }))} />
        {canManage && <Button className="ms-auto" onClick={() => setCreating(true)} disabled={!approved.length} title={approved.length ? undefined : tx('اعتمد مشتريًا أولًا', 'Approve a buyer first')}><Plus className="size-4" aria-hidden="true" />{tx('طلب عرض لمشترٍ', 'Quote for a buyer')}</Button>}
      </div>
      <Card>
        {s.quotes.length === 0 ? (
          <EmptyState as="h2" icon={<FileText className="size-6" aria-hidden="true" />} title={tx('لا طلبات عروض أسعار بعد', 'No quote requests yet')}
            action={approved.length ? (canManage && <Button onClick={() => setCreating(true)}>{tx('سجّل طلبًا لمشترٍ', 'Record a request for a buyer')}</Button>) : <LinkButton variant="secondary" href={link('/dashboard/wholesale')}>{tx('اعتمد مشتريًا أولًا', 'Approve a buyer first')}</LinkButton>}>
            {tx('يطلب المشتري المعتمد كميات، فتسعّرها من قائمته وترسل العرض ثم تحوّله لطلب.', 'An approved buyer asks for quantities; you price them from their list, send the quote and turn it into an order.')}
          </EmptyState>
        ) : rows.length === 0 ? <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا عروض بهذه الحالة', 'No quotes in this state')} /> : (
          <DataTable label={tx('عروض الأسعار', 'Quotes')} rows={rows} rowKey={(q) => q.id} href={(q) => link(`/dashboard/wholesale/quotes/${q.id}`)}
            columns={[
              { key: 'id', header: tx('العرض', 'Quote'), cell: (q) => <Ref>{q.id}</Ref> },
              { key: 'b', header: tx('المشتري', 'Buyer'), cell: (q) => s.buyers.find((b) => b.id === q.buyerId)?.company ?? '—' },
              { key: 'n', header: tx('الأصناف', 'Lines'), cell: (q) => <span className="tabular-nums">{q.lines.length}</span>, hideBelow: 'md' },
              { key: 'at', header: tx('التاريخ', 'Date'), cell: (q) => fmtDay(q.at, lang), hideBelow: 'md' },
              { key: 'st', header: tx('الحالة', 'Status'), cell: (q) => <Badge tone={TONE[quoteState(q, now)]}>{QL(quoteState(q, now))}</Badge> },
              { key: 't', header: tx('الإجمالي', 'Total'), align: 'end', cell: (q) => (q.quoted ? <Money v={quoteTotals(q.lines, q.quoted.shipping).total} /> : <span className="text-muted">—</span>) },
            ]}
            card={(q) => <div className="flex items-center justify-between gap-3 text-sm"><div><p className="font-semibold text-fg"><Ref>{q.id}</Ref> · {s.buyers.find((b) => b.id === q.buyerId)?.company}</p><p className="text-xs text-muted">{fmtDay(q.at, lang)}</p></div><Badge tone={TONE[quoteState(q, now)]}>{QL(quoteState(q, now))}</Badge></div>} />
        )}
      </Card>
      {creating && (
        <Modal size="lg" title={tx('طلب عرض سعر لمشترٍ', 'Quote request for a buyer')} description={tx('حين يطلب المشتري بالهاتف أو البريد.', 'When the buyer asks by phone or email.')} onClose={() => setCreating(false)}
          footer={<><Button variant="secondary" onClick={() => setCreating(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={create}>{tx('سجّل وسعّر', 'Record and price')}</Button></>}>
          <Field label={tx('المشتري', 'Buyer')} error={tried && !buyerId ? tx('اختر مشتريًا معتمدًا', 'Choose an approved buyer') : null}>{(p) => <Select {...p} value={buyerId} onChange={(e) => setBuyerId(e.target.value)}><option value="">{tx('اختر', 'Choose')}</option>{approved.map((b) => <option key={b.id} value={b.id}>{b.company}</option>)}</Select>}</Field>
          {lines.map((l, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field className="min-w-0 flex-1" label={tx('المنتج', 'Product')}>{(p) => <Select {...p} value={l.sku} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, sku: e.target.value } : x)))}><option value="">{tx('اختر', 'Choose')}</option>{skus.map((x) => <option key={x.sku} value={x.sku}>{x.label}</option>)}</Select>}</Field>
              <Field className="w-24" label={tx('الكمية', 'Qty')} error={tried && l.sku && !(parseIntStrict(l.qty) ?? 0) ? tx('كمية', 'Qty') : null}>{(p) => <Input {...p} inputMode="numeric" dir="ltr" value={l.qty} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qty: e.target.value } : x)))} />}</Field>
              {lines.length > 1 && <IconButton label={tx('احذف السطر', 'Remove line')} onClick={() => setLines(lines.filter((_, k) => k !== i))}><Trash2 className="size-4" aria-hidden="true" /></IconButton>}
            </div>
          ))}
          <Button variant="ghost" onClick={() => setLines([...lines, { sku: '', qty: '' }])}><Plus className="size-4" aria-hidden="true" />{tx('سطر', 'Line')}</Button>
          <Field label={tx('ملاحظة المشتري', 'Buyer note')} optional>{(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        </Modal>
      )}
    </div>
  );
}

export function QuoteDetail({ id, canManage }: { id: string; canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const QL = useQLabel();
  const L = useWsLabels();
  const toast = useToast();
  const review = useReviewMode();
  const s = wsStore.use();
  const levels = levelsStore.use();
  const orders = ordersStore.use();
  const q = s.quotes.find((x) => x.id === id);
  const buyer = s.buyers.find((b) => b.id === q?.buyerId);
  const list = s.lists.find((l) => l.group === buyer?.group);
  const initial = q ? priceQuote(q, list) : { lines: [], problems: [] };
  const [prices, setPrices] = useState<string[]>(() => initial.lines.map((l) => (l.price ? moneyInput(l.price) : '')));
  const [shipping, setShipping] = useState(q?.quoted ? moneyInput(q.quoted.shipping) : '');
  const [terms, setTerms] = useState<TermsId>(q?.quoted?.terms ?? buyer?.terms ?? 'prepaid');
  const [days, setDays] = useState(String(q?.quoted ? Math.round((q.quoted.validUntil - q.quoted.at) / DAY) : s.settings.quoteDays));
  const [msg, setMsg] = useState('');
  const [dialog, setDialog] = useState<'send' | 'convert' | 'invoice' | 'decline' | null>(null);
  const [why, setWhy] = useState('');
  const st = q ? quoteState(q, Date.now()) : 'requested';
  const editing = st === 'requested' || st === 'expired';
  useUnsaved(editing && prices.some((p, i) => p !== (initial.lines[i]?.price ? moneyInput(initial.lines[i].price!) : '')), { ar: 'تسعير عرض لم يُرسل', en: 'Unsent quote pricing' });
  if (!q || !buyer) return <Card><EmptyState as="h2" icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('العرض غير موجود', 'Quote not found')} action={<LinkButton variant="secondary" href={link('/dashboard/wholesale/quotes')}>{tx('كل العروض', 'All quotes')}</LinkButton>} /></Card>;
  const lines: QuoteLine[] = editing ? q.lines.map((l, i) => ({ ...l, price: parseMoney(prices[i] ?? '') ?? undefined })) : q.lines;
  const ship = editing ? parseMoney(shipping || '0') ?? NaN : q.quoted?.shipping ?? 0;
  const totals = quoteTotals(lines, Number.isNaN(ship) ? 0 : ship);
  const check = checkQuote(lines, buyer, s.settings, levels, terms);
  const validDays = parseIntStrict(days);
  const blocking = check.error && check.error !== 'stock' ? check.error : null;
  const order = orders.find((o) => o.ref === q.orderRef);
  const errText = (e: string | null) => e && ({ buyer: tx('المشتري غير معتمد', 'Buyer is not approved'), noLines: tx('لا أصناف', 'No lines'), qty: tx('كمية غير صحيحة', 'Invalid quantity'), price: tx('سعّر كل الأصناف', 'Price every line'), minOrder: tx('أقل من الحد الأدنى للطلب في الإعدادات', 'Below the minimum order in settings'), stock: tx('المخزون غير كافٍ في موقع الجملة', 'Not enough stock at the wholesale location'), terms: tx('شروط الدفع غير متاحة في الإعدادات', 'These terms are not offered in settings') } as Record<string, string>)[e];

  const send = () => {
    if (blocking || Number.isNaN(ship) || !validDays || validDays < 1) return;
    const at = Date.now();
    setWs((x) => ({ quotes: x.quotes.map((y) => (y.id === q.id ? { ...y, lines, status: 'quoted', quoted: { at, by: currentActor().name, validUntil: at + validDays * DAY, shipping: ship, terms, note: msg.trim() } } : y)) }));
    logAction('orders', { ar: `أرسل عرض السعر ${q.id} إلى ${buyer.company}`, en: `Sent quote ${q.id} to ${buyer.company}` }, { target: q.id, after: `${(totals.total / 100).toFixed(2)} SAR` });
    toast({ tone: 'ok', text: tx(`أُرسل إلى ${buyer.email} (محاكاة)`, `Sent to ${buyer.email} (simulated)`) });
    setDialog(null);
  };
  const answer = (how: 'accepted' | 'declined') => {
    if (how === 'declined' && !why.trim()) return;
    setWs((x) => ({ quotes: x.quotes.map((y) => (y.id === q.id ? { ...y, status: how, answered: { at: Date.now(), how, note: why.trim() } } : y)) }));
    logAction('orders', { ar: `${how === 'accepted' ? 'قبول' : 'رفض'} المشتري للعرض ${q.id}`, en: `Buyer ${how} quote ${q.id}` }, { target: q.id });
    setDialog(null); setWhy('');
  };
  const convert = () => {
    const c = checkQuote(q.lines, buyer, s.settings, levelsStore.get(), q.quoted?.terms ?? buyer.terms);
    if (c.error) return toast({ tone: 'bad', text: errText(c.error)! });
    const role = testStore.get().role;
    const o = quoteToOrder(q, buyer, s.settings, { orders: ordersStore.get(), now: Date.now(), who: currentActor().name, role });
    ordersStore.set((l) => [o, ...l]);
    const fx = applyStockEffects(levelsStore.get(), quoteEffects(q, s.settings.loc), currentActor().name, o.ref, `WHS-${o.ref}`);
    levelsStore.set(fx.levels); stockLogStore.set((l) => [...fx.log, ...l]);
    setWs((x) => ({ quotes: x.quotes.map((y) => (y.id === q.id ? { ...y, status: 'converted', orderRef: o.ref } : y)) }));
    logAction('orders', { ar: `حوّل العرض ${q.id} إلى طلب جملة ${o.ref}`, en: `Converted quote ${q.id} to wholesale order ${o.ref}` }, { target: o.ref });
    toast({ tone: 'ok', text: tx(`أُنشئ الطلب ${o.ref} وحُجز المخزون`, `Order ${o.ref} created and stock held`) });
    setDialog('invoice');
  };
  const loc = allLocations().find((l) => l.id === s.settings.loc);

  return (
    <div className="space-y-6">
      <PageHeader back={{ href: link('/dashboard/wholesale/quotes'), label: tx('عروض الأسعار', 'Quotes') }} title={<span>{tx('عرض', 'Quote')} <Ref>{q.id}</Ref></span>}
        description={`${buyer.company} · ${fmtDay(q.at, lang)}`} meta={<Badge tone={TONE[st]}>{QL(st)}</Badge>}
        actions={canManage && <>
          {editing && <Button className="bg-brand-gradient" onClick={() => setDialog('send')} disabled={!!blocking}><Send className="size-4" aria-hidden="true" />{tx('عاين وأرسل', 'Preview and send')}</Button>}
          {st === 'quoted' && <><Button variant="secondary" onClick={() => setDialog('decline')}>{tx('سجّل رفض المشتري', 'Record decline')}</Button><Button onClick={() => answer('accepted')}>{tx('سجّل قبول المشتري', 'Record acceptance')}</Button></>}
          {st === 'accepted' && <Button className="bg-brand-gradient" onClick={() => setDialog('convert')}>{tx('حوّل إلى طلب', 'Convert to order')}</Button>}
          {order && <Button variant="secondary" onClick={() => setDialog('invoice')}><FileText className="size-4" aria-hidden="true" />{tx('الفاتورة الضريبية', 'Tax invoice')}</Button>}
        </>} />
      {order && <Alert tone="ok" title={tx(`صار الطلب ${order.ref}`, `Became order ${order.ref}`)} action={<LinkButton size="sm" variant="secondary" href={sectionHref('orders', order.ref)}>{tx('افتح الطلب', 'Open order')}</LinkButton>}>{tx(`الدفع بتحويل بنكي حتى ${fmtDay(order.payDue ?? 0, lang)}. أكّد وصول التحويل من صفحة الطلب.`, `Paid by bank transfer by ${fmtDay(order.payDue ?? 0, lang)}. Confirm the transfer on the order page.`)}</Alert>}
      {st === 'quoted' && review && <p className="text-xs text-muted">{tx('مراجعة: الأزرار أعلاه تمثل رد المشتري.', 'Review: the buttons above stand in for the buyer’s reply.')}</p>}
      {initial.problems.length > 0 && editing && <Alert tone="warn" title={tx('أصناف بلا سعر من القائمة', 'Lines without a list price')}>{initial.problems.map((p) => <span key={p.productId} className="block">{q.lines.find((l) => l.productId === p.productId)?.name[lang]}: {p.error === 'belowMoq' ? tx(`أقل من الحد الأدنى (${p.moq})`, `below the MOQ (${p.moq})`) : tx('غير مدرج في قائمة مجموعته', 'not in their group’s list')}</span>)}{tx('سعّرها يدويًا أو اطلب تعديل الكمية.', 'Price them by hand or ask for a different quantity.')}</Alert>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title={tx('الأصناف (قبل الضريبة)', 'Lines (before VAT)')} />
          <ul className="divide-y divide-border">
            {lines.map((l, i) => {
              const tier = unitFor(list, l.productId, l.qty);
              const next = nextTier(list, l.productId, l.qty);
              return (
                <li key={i} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1"><p className="font-semibold text-fg">{l.name[lang]}</p><p className="text-xs text-muted"><Ref>{l.sku}</Ref> · {tx('الكمية', 'Qty')} {l.qty}{'price' in tier && ` · ${tx('شريحة', 'tier')} ${tier.tier + 1}`}{next && ` · ${tx(`+${next.more} للسعر التالي`, `+${next.more} for the next price`)}`}{check.short.includes(l.sku) && <span className="text-red-600"> · {tx('مخزون غير كافٍ', 'short on stock')}</span>}</p></div>
                  {editing && canManage ? <Input aria-label={tx('سعر الوحدة', 'Unit price')} className="w-28" inputMode="decimal" dir="ltr" value={prices[i] ?? ''} onChange={(e) => setPrices(lines.map((_, k) => (k === i ? e.target.value : prices[k] ?? '')))} /> : <Money v={l.price ?? 0} />}
                  <Money v={(l.price ?? 0) * l.qty} className="w-24 justify-end font-semibold text-fg" />
                </li>
              );
            })}
          </ul>
          {q.note && <p className="border-t border-border px-5 py-3 text-sm text-muted">{tx('ملاحظة المشتري: ', 'Buyer note: ')}{q.note}</p>}
        </Card>
        <Card className="h-max p-5">
          {editing && canManage ? (
            <div className="space-y-4">
              <Field label={tx('الشحن قبل الضريبة (ر.س)', 'Shipping before VAT (SAR)')} error={Number.isNaN(ship) ? tx('مبلغ غير صحيح', 'Invalid amount') : null}>{(p) => <Input {...p} inputMode="decimal" dir="ltr" value={shipping} placeholder="0.00" onChange={(e) => setShipping(e.target.value)} />}</Field>
              <Field label={tx('شروط الدفع', 'Payment terms')}>{(p) => <Select {...p} value={terms} onChange={(e) => setTerms(e.target.value as TermsId)}>{s.settings.terms.map((t) => <option key={t} value={t}>{L.terms(t)}</option>)}</Select>}</Field>
              <Field label={tx('صلاحية العرض (أيام)', 'Valid for (days)')} error={!validDays || validDays < 1 ? tx('عدد أيام', 'Number of days') : null}>{(p) => <Input {...p} inputMode="numeric" dir="ltr" value={days} onChange={(e) => setDays(e.target.value)} />}</Field>
            </div>
          ) : q.quoted && (
            <div className="divide-y divide-border">
              <Row label={tx('شروط الدفع', 'Terms')}>{L.terms(q.quoted.terms)}</Row>
              <Row label={tx('صالح حتى', 'Valid until')}>{fmtDay(q.quoted.validUntil, lang)}</Row>
              <Row label={tx('أرسله', 'Sent by')}>{q.quoted.by}</Row>
              {q.answered?.note && <Row label={tx('سبب الرفض', 'Decline reason')}>{q.answered.note}</Row>}
            </div>
          )}
          <div className="mt-4 divide-y divide-border border-t border-border pt-2">
            <Row label={tx('الأصناف', 'Lines')}><Money v={totals.lines} /></Row>
            <Row label={tx('الشحن', 'Shipping')}><Money v={totals.shipping} /></Row>
            <Row label={tx('ضريبة القيمة المضافة 15٪', 'VAT 15%')}><Money v={totals.vat} /></Row>
            <Row strong label={tx('الإجمالي', 'Total')}><Money v={totals.total} /></Row>
          </div>
          {check.error && (editing || st === 'accepted') && <p className="mt-3 text-xs font-medium text-red-600">{errText(check.error)}</p>}
        </Card>
      </div>

      {dialog === 'send' && (
        <Modal size="lg" title={tx('معاينة ما يصل للمشتري', 'Preview what the buyer receives')} description={tx(`إلى ${buyer.contact} · ${buyer.email}`, `To ${buyer.contact} · ${buyer.email}`)} onClose={() => setDialog(null)}
          footer={<><Button variant="secondary" onClick={() => setDialog(null)}>{tx('رجوع', 'Back')}</Button><Button onClick={send} disabled={!!blocking || Number.isNaN(ship) || !validDays}><Send className="size-4" aria-hidden="true" />{tx('أرسل العرض', 'Send quote')}</Button></>}>
          <div className="rounded-xl border border-border p-4 text-sm">
            <p className="font-semibold text-fg">{tx(`عرض سعر ${q.id} من ${settingsStore.get().store.name}`, `Quote ${q.id} from ${settingsStore.get().store.name}`)}</p>
            <ul className="mt-2 space-y-1 text-muted">{lines.map((l, i) => <li key={i} className="flex justify-between gap-2"><span>{l.qty} × {l.name[lang]}</span><Money v={(l.price ?? 0) * l.qty} /></li>)}</ul>
            <div className="mt-2 border-t border-border pt-2"><Row label={tx('ضريبة 15٪', 'VAT 15%')}><Money v={totals.vat} /></Row><Row strong label={tx('الإجمالي', 'Total')}><Money v={totals.total} /></Row></div>
            <p className="mt-2 text-xs text-muted">{L.terms(terms)} · {tx(`صالح ${validDays} أيام`, `Valid ${validDays} days`)}</p>
          </div>
          {check.error === 'stock' && <Alert tone="warn">{tx('المخزون الحالي لا يكفي؛ يمكنك الإرسال لكن التحويل لطلب يحتاج مخزونًا.', 'Current stock is short; you can send, but converting to an order needs stock.')}</Alert>}
          <Field label={tx('رسالة للمشتري', 'Message to the buyer')} optional>{(p) => <Textarea {...p} value={msg} onChange={(e) => setMsg(e.target.value)} />}</Field>
          <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('البريد محاكاة.', 'The email is simulated.')}</p>
        </Modal>
      )}
      {dialog === 'decline' && (
        <Modal title={tx('رفض المشتري للعرض', 'Buyer declined the quote')} onClose={() => setDialog(null)} footer={<><Button variant="secondary" onClick={() => setDialog(null)}>{tx('رجوع', 'Back')}</Button><Button variant="danger" disabled={!why.trim()} onClick={() => answer('declined')}>{tx('سجّل الرفض', 'Record decline')}</Button></>}>
          <Field label={tx('السبب كما ذكره المشتري', 'Reason the buyer gave')}>{(p) => <Textarea {...p} value={why} onChange={(e) => setWhy(e.target.value)} />}</Field>
        </Modal>
      )}
      {dialog === 'convert' && q.quoted && (
        <Modal title={tx(`تحويل ${q.id} إلى طلب`, `Convert ${q.id} to an order`)} onClose={() => setDialog(null)}
          footer={<><Button variant="secondary" onClick={() => setDialog(null)}>{tx('رجوع', 'Back')}</Button><Button onClick={convert} disabled={!!check.error}>{tx('أنشئ الطلب والفاتورة', 'Create order and invoice')}</Button></>}>
          <div className="divide-y divide-border">
            <Row label={tx('المخزون المحجوز من', 'Stock held at')}>{loc?.name[lang]}</Row>
            <Row label={tx('الوحدات', 'Units')}><span className="tabular-nums">{q.lines.reduce((a, l) => a + l.qty, 0)}</span></Row>
            <Row label={tx('الدفع', 'Payment')}>{tx('تحويل بنكي', 'Bank transfer')} · {L.terms(q.quoted.terms)}</Row>
            <Row label={tx('آخر موعد للدفع', 'Payment due')}>{fmtDay(Date.now() + TERMS_DAYS[q.quoted.terms] * DAY, lang)}</Row>
            <Row strong label={tx('الإجمالي شامل الضريبة', 'Total incl. VAT')}><Money v={totals.total} /></Row>
          </div>
          {check.error && <Alert tone="bad">{errText(check.error)}</Alert>}
          <p className="text-xs text-muted">{tx('تصدر فاتورة ضريبية (ليست مبسطة) برقمك الضريبي ورقم المشتري.', 'A full tax invoice (not simplified) is issued with your VAT number and the buyer’s.')}</p>
        </Modal>
      )}
      {dialog === 'invoice' && order && <Invoice o={order} onClose={() => setDialog(null)} />}
    </div>
  );
}

/** Full tax invoice for a B2B order: seller and buyer VAT numbers, lines before VAT, VAT, total. */
function Invoice({ o, onClose }: { o: Order; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const v = verificationStore.use();
  const st = settingsStore.use();
  const inv = invoiceLines(o);
  const w = o.wholesale!;
  return (
    <Modal size="lg" title={tx('فاتورة ضريبية', 'Tax invoice')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={() => { logAction('finance', { ar: `تنزيل الفاتورة ${w.invoice}`, en: `Downloaded invoice ${w.invoice}` }, { target: w.invoice }); }}>{tx('نزّل PDF (محاكاة)', 'Download PDF (sim.)')}</Button><Button onClick={onClose}>{tx('تم', 'Done')}</Button></>}>
      <div className="space-y-3 rounded-xl border border-border p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><p className="text-base font-bold text-fg">{tx('فاتورة ضريبية', 'Tax invoice')}</p><p className="text-muted"><Ref>{w.invoice}</Ref> · {fmtDay(o.placedAt ?? Date.now(), lang)}</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-surface-2 p-3"><p className="text-xs text-muted">{tx('البائع', 'Seller')}</p><p className="font-semibold text-fg">{v.form.legalName || st.store.name}</p><p className="text-xs">{tx('الرقم الضريبي', 'VAT')} <Ref>{v.form.vatNumber}</Ref> · {tx('السجل', 'CR')} <Ref>{v.form.crNumber}</Ref></p></div>
          <div className="rounded-lg bg-surface-2 p-3"><p className="text-xs text-muted">{tx('المشتري', 'Buyer')}</p><p className="font-semibold text-fg">{w.company}</p><p className="text-xs">{tx('الرقم الضريبي', 'VAT')} <Ref>{w.vat}</Ref> · {tx('السجل', 'CR')} <Ref>{w.cr}</Ref></p><p className="text-xs text-muted">{w.address}</p></div>
        </div>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border text-muted"><th className="py-2 text-start">{tx('الصنف', 'Item')}</th><th className="text-end">{tx('الكمية', 'Qty')}</th><th className="text-end">{tx('السعر', 'Unit')}</th><th className="text-end">{tx('الضريبة', 'VAT')}</th><th className="text-end">{tx('الإجمالي', 'Total')}</th></tr></thead>
            <tbody className="divide-y divide-border">{inv.lines.map((l, i) => <tr key={i}><td className="py-2">{l.name[lang]} <span className="text-subtle"><Ref>{l.sku}</Ref></span></td><td className="text-end tabular-nums">{l.qty}</td><td className="text-end"><Money v={l.unitExcl} /></td><td className="text-end"><Money v={l.vat} /></td><td className="text-end"><Money v={l.gross} /></td></tr>)}</tbody>
          </table>
        </div>
        <div className="ms-auto max-w-xs divide-y divide-border">
          {inv.shipping.net > 0 && <Row label={tx('الشحن', 'Shipping')}><Money v={inv.shipping.net} /></Row>}
          <Row label={tx('المجموع قبل الضريبة', 'Total before VAT')}><Money v={inv.net} /></Row>
          <Row label={tx('ضريبة القيمة المضافة 15٪', 'VAT 15%')}><Money v={inv.vat} /></Row>
          <Row strong label={tx('الإجمالي', 'Total')}><Money v={inv.total} /></Row>
        </div>
        <p className="text-xs text-muted">{tx('الدفع', 'Payment')}: {tx('تحويل بنكي حتى', 'Bank transfer by')} {fmtDay(o.payDue ?? 0, lang)}</p>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('الإرسال لمنصة «فاتورة» يحتاج ربط الفوترة الإلكترونية.', 'Reporting to ZATCA needs e-invoicing integration.')}</p>
    </Modal>
  );
}
