// Gift cards (`#/dashboard/marketing/gift-cards`): issue a card (amount, recipient, expiry) after a preview of what
// the recipient receives; cards bought in the store (the digital gift-card product) are added automatically; each
// card has a balance, a history, a redemption test and disable / enable. Unused balances are money customers may
// still spend (shown as "outstanding"). Sending the card is simulated.
import { useEffect, useState } from 'react';
import { Gift, SearchX, Ban, RotateCcw, Plus, ReceiptText } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { customerEventsStore, customersStore, giftCardsStore, logAction, ordersStore } from '../../merchant/stores';
import { parseMoney } from '../../merchant/catalog';
import { cardsFromOrders, giftLiability, giftState, issueGift, redeemGift, setGiftStatus, validateGift, type GiftCard, type GiftState } from '../../merchant/growth';
import { Badge, Button, Card, CardHeader, EmptyState, InfoHint, LinkButton, Money, Ref, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, DataTable, Drawer, Field, FilterChip, Input, Modal, Pagination, SearchInput, Select, Simulated, useToast, type Column } from '../../../ds/kit';
import { paginate } from '../customers/model';
import { TODAY } from './model';
import { Kpi } from './loyalty';
import { Locked } from './access';

const G_TONE: Record<GiftState, Tone> = { active: 'green', used: 'gray', expired: 'amber', disabled: 'red' };
const STATES: GiftState[] = ['active', 'used', 'expired', 'disabled'];
const nextYear = (iso: string) => `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}`;

export default function GiftCards({ route, empty, canManage }: { route: Route; empty: boolean; canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const all = giftCardsStore.use();
  const orders = ordersStore.use();
  const customers = customersStore.use();
  const [issuing, setIssuing] = useState(false);

  // Gift cards bought in the online store become cards here once the order is paid.
  useEffect(() => {
    const next = cardsFromOrders(giftCardsStore.get(), orders, TODAY);
    if (next !== giftCardsStore.get()) giftCardsStore.set(next);
  }, [orders]);

  const list = empty ? [] : all;
  const q = route.query.get('q') ?? '';
  const st = route.query.get('state') ?? '';
  const open = route.query.get('card');
  const href = (p: Record<string, string | undefined>) => link('/dashboard/marketing/gift-cards', { q: q || undefined, state: st || undefined, ...p });
  const stName = (s: GiftState) => ({ active: tx('صالحة', 'Active'), used: tx('مستخدمة بالكامل', 'Fully used'), expired: tx('منتهية', 'Expired'), disabled: tx('موقوفة', 'Disabled') })[s];
  const t = q.trim().toLowerCase();
  const who = (g: GiftCard) => (g.customerId && customers.find((c) => c.id === g.customerId)?.name[lang]) || g.to;
  const rows = list.filter((g) => (!st || giftState(g) === st) && (!t || g.code.toLowerCase().includes(t) || who(g).toLowerCase().includes(t) || (g.orderRef ?? '').includes(t)));
  const pg = paginate(rows, Number(route.query.get('page')) || 1, 12);
  const card = list.find((g) => g.code === open);
  const issuedTotal = list.reduce((s, g) => s + g.initial, 0);
  const redeemed = list.reduce((s, g) => s + g.log.filter((l) => l.kind === 'redeem').reduce((a, l) => a + l.amount, 0), 0);

  const cols: Column<GiftCard>[] = [
    { key: 'c', header: tx('البطاقة', 'Card'), cell: (g) => <span className="block"><span className="font-bold tracking-wide"><Ref>{g.code}</Ref></span><span className="block text-xs text-muted">{g.source === 'order' ? <>{tx('شراء من المتجر', 'Bought in store')} · <Ref>#{g.orderRef}</Ref></> : tx('أصدرها المتجر', 'Issued by the store')}</span></span> },
    { key: 'w', header: tx('المستلم', 'Recipient'), hideBelow: 'lg', cell: (g) => <span className="text-[13px] text-fg">{who(g) || '—'}</span> },
    { key: 'b', header: tx('الرصيد', 'Balance'), cell: (g) => (
      <div className="min-w-28"><p className="text-sm text-fg"><Money v={g.balance} /> <span className="text-xs text-muted">/ <Money v={g.initial} /></span></p>
        <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand-500" style={{ width: `${g.initial ? Math.round((g.balance * 100) / g.initial) : 0}%` }} /></div></div>
    ) },
    { key: 'e', header: tx('تنتهي', 'Expires'), hideBelow: 'lg', cell: (g) => <span className="text-[13px] text-muted">{g.expires ? <Ref>{g.expires}</Ref> : tx('بلا انتهاء', 'No expiry')}</span> },
    { key: 's', header: tx('الحالة', 'Status'), cell: (g) => <Badge tone={G_TONE[giftState(g)]}>{stName(giftState(g))}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <section aria-label={tx('ملخص بطاقات الهدايا', 'Gift cards summary')} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label={tx('بطاقات صالحة', 'Active cards')} value={list.filter((g) => giftState(g) === 'active').length} />
        <Kpi label={tx('رصيد غير مستخدم', 'Unused balance')} hint={tx('أرصدة البطاقات الصالحة: مبالغ استلمتها وقد يشتري بها العملاء لاحقًا. لا تشمل المنتهية والموقوفة.', 'Balances of active cards: money received that customers may still spend. Excludes expired and disabled cards.')} value={<Money v={giftLiability(list)} />} />
        <Kpi label={tx('قيمة الإصدار', 'Issued value')} value={<Money v={issuedTotal} />} />
        <Kpi label={tx('استُخدم في طلبات', 'Used on orders')} value={<Money v={redeemed} />} />
      </section>

      <Card aria-labelledby="h-gc">
        <CardHeader id="h-gc" title={tx('بطاقات الهدايا', 'Gift cards')} hint={tx('بطاقة الهدية الإلكترونية في متجرك تُنشئ بطاقة هنا عند دفع الطلب. الرصيد يُستخدم جزئيًا على أكثر من طلب.', 'The e-gift card product in your store creates a card here when the order is paid. The balance can be used across several orders.')}
          action={canManage ? <Button size="sm" onClick={() => setIssuing(true)}><Plus className="size-3.5" aria-hidden="true" />{tx('أصدر بطاقة', 'Issue a card')}</Button> : undefined} />
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-5">
          <SearchInput value={q} onChange={(v) => replace(href({ q: v || undefined, page: undefined }))} placeholder={tx('ابحث بالكود أو المستلم أو الطلب', 'Search code, recipient or order')} />
          <FilterChip label={tx('الحالة', 'Status')} value={st} onChange={(v) => replace(href({ state: v || undefined, page: undefined }))} options={STATES.map((s) => ({ value: s, label: stName(s) }))} />
        </div>
        {pg.total === 0 ? (
          list.length === 0
            ? <EmptyState icon={<Gift className="size-6" aria-hidden="true" />} title={tx('لا بطاقات هدايا بعد', 'No gift cards yet')} action={canManage ? <Button onClick={() => setIssuing(true)}>{tx('أصدر أول بطاقة', 'Issue the first card')}</Button> : undefined}>{tx('أصدر بطاقة لعميل، أو بِع بطاقة الهدية الإلكترونية في متجرك.', 'Issue a card to a customer, or sell the e-gift card product in your store.')}</EmptyState>
            : <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا بطاقات مطابقة', 'No matching cards')} action={<LinkButton variant="secondary" href={link('/dashboard/marketing/gift-cards')}>{tx('امسح الفلاتر', 'Clear filters')}</LinkButton>} />
        ) : (
          <div className="border-t border-border">
            <DataTable label={tx('بطاقات الهدايا', 'Gift cards')} rows={pg.rows} columns={cols} rowKey={(g) => g.code} href={(g) => href({ card: g.code })}
              card={(g) => (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2"><span className="font-bold"><Ref>{g.code}</Ref></span><Badge tone={G_TONE[giftState(g)]}>{stName(giftState(g))}</Badge></div>
                  <p className="text-[13px] text-fg"><Money v={g.balance} /> <span className="text-muted">/ <Money v={g.initial} /></span></p>
                  <p className="truncate text-xs text-muted">{who(g)}</p>
                </div>
              )} />
            <Pagination page={pg.page} pages={pg.pages} total={pg.total} hrefFor={(p) => href({ page: p > 1 ? String(p) : undefined })} />
          </div>
        )}
        {!canManage && <p className="border-t border-border px-5 py-3"><Locked>{tx('دورك يعرض البطاقات فقط.', 'Your role can only view cards.')}</Locked></p>}
      </Card>

      {issuing && <Issue onClose={() => setIssuing(false)} onDone={(code) => { setIssuing(false); replace(href({ card: code })); }} />}
      {card && <CardDrawer card={card} canManage={canManage} who={who(card)} onClose={() => replace(href({ card: undefined }))} />}
    </div>
  );
}

function Issue({ onClose, onDone }: { onClose: () => void; onDone: (code: string) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const customers = customersStore.use();
  const [amount, setAmount] = useState('200');
  const [cid, setCid] = useState('');
  const [to, setTo] = useState('');
  const [expires, setExpires] = useState(nextYear(TODAY));
  const [step, setStep] = useState<'form' | 'review'>('form');
  const [tried, setTried] = useState(false);
  const c = customers.find((x) => x.id === cid);
  const recipient = to || c?.email || '';
  const errors = validateGift({ amount, to: recipient, expires }, parseMoney);
  const value = parseMoney(amount) ?? 0;
  const next = () => { setTried(true); if (!Object.keys(errors).length) setStep('review'); };
  const issue = () => {
    const r = issueGift(giftCardsStore.get(), { amount: value, to: recipient, customerId: c?.id, expires: expires || null }, { by: tx('أنت', 'You'), today: TODAY, seed: Date.now() % 100000 });
    giftCardsStore.set(r.list);
    if (c) customerEventsStore.set((all) => ({ ...all, [c.id]: [{ id: `E${Date.now()}`, kind: 'giftCard', text: tx(`أُصدرت له بطاقة هدية ${r.card.code} بقيمة ${(value / 100).toFixed(2)} ر.س`, `Issued gift card ${r.card.code} worth SAR ${(value / 100).toFixed(2)}`), by: tx('أنت', 'You'), at: Date.now() }, ...(all[c.id] ?? [])] }));
    logAction('marketing', { ar: `أصدر بطاقة هدية ${r.card.code}`, en: `Issued gift card ${r.card.code}` }, { target: r.card.code, after: String(value / 100) });
    toast({ tone: 'ok', text: tx(`أُصدرت ${r.card.code} وأُرسلت للمستلم (محاكاة)`, `${r.card.code} issued and sent to the recipient (simulated)`) });
    onDone(r.card.code);
  };
  return (
    <Modal title={step === 'form' ? tx('إصدار بطاقة هدية', 'Issue a gift card') : tx('مراجعة قبل الإصدار', 'Review before issuing')} onClose={onClose}
      footer={step === 'form'
        ? <><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={next}>{tx('راجع', 'Review')}</Button></>
        : <><Button variant="secondary" onClick={() => setStep('form')}>{tx('عدّل', 'Edit')}</Button><Button onClick={issue}><Gift className="size-4" aria-hidden="true" />{tx('أصدر وأرسل', 'Issue and send')}</Button></>}>
      {step === 'form' ? (
        <div className="space-y-4">
          <Field label={tx('القيمة (ر.س)', 'Value (SAR)')} hint={tx('من 10 إلى 5,000', '10 to 5,000')} error={tried && errors.amount ? tx('من 10 إلى 5,000 ر.س', 'SAR 10 to 5,000') : null}>
            {(p) => <Input {...p} dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
          </Field>
          <Field label={tx('عميل مسجّل', 'Registered customer')} optional>
            {(p) => <Select {...p} value={cid} onChange={(e) => setCid(e.target.value)}><option value="">{tx('لا أحد: أدخل البريد أو الجوال', 'None: enter an email or mobile')}</option>{customers.map((x) => <option key={x.id} value={x.id}>{x.name[lang]} · {x.id}</option>)}</Select>}
          </Field>
          <Field label={tx('يُرسل إلى', 'Send to')} hint={c ? tx('بريد العميل افتراضيًا', 'The customer’s email by default') : tx('بريد أو جوال', 'Email or mobile')} error={tried && errors.to ? tx('بريد أو رقم جوال صالح', 'A valid email or mobile') : null}>
            {(p) => <Input {...p} dir="ltr" value={to} placeholder={c?.email ?? 'name@example.com'} onChange={(e) => setTo(e.target.value)} />}
          </Field>
          <Field label={tx('تنتهي', 'Expires')} optional error={tried && errors.expires ? tx('تاريخ بعد اليوم', 'A date after today') : null}>
            {(p) => <Input {...p} type="date" dir="ltr" min={TODAY} value={expires} onChange={(e) => setExpires(e.target.value)} />}
          </Field>
        </div>
      ) : (
        <>
          <dl className="divide-y divide-border rounded-xl border border-border text-sm">
            <div className="flex justify-between px-4 py-2.5"><dt className="text-muted">{tx('القيمة', 'Value')}</dt><dd className="font-semibold"><Money v={value} /></dd></div>
            <div className="flex justify-between gap-3 px-4 py-2.5"><dt className="text-muted">{tx('إلى', 'To')}</dt><dd className="truncate font-semibold text-fg"><bdi dir="ltr">{recipient}</bdi></dd></div>
            <div className="flex justify-between px-4 py-2.5"><dt className="text-muted">{tx('تنتهي', 'Expires')}</dt><dd className="font-semibold"><Ref>{expires || tx('بلا انتهاء', 'No expiry')}</Ref></dd></div>
          </dl>
          <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-card">
            <p className="text-xs opacity-80">{tx('ما يستلمه المستلم', 'What the recipient receives')}</p>
            <p className="mt-3 text-2xl font-bold"><Money v={value} /></p>
            <p className="mt-1 font-mono text-sm tracking-widest opacity-90">GC-••••-••••</p>
            <p className="mt-3 text-xs opacity-80">{tx('يُكتب الكود في خانة بطاقة الهدية عند الدفع.', 'The code is entered in the gift card box at checkout.')}</p>
          </div>
          <ul className="space-y-1 text-[13px] text-muted">
            <li>{tx('تُصدر صالحة فورًا، ويمكن إيقافها لاحقًا. لا تُسترد نقدًا.', 'Valid immediately; can be disabled later. Not refundable as cash.')}</li>
            <li>{tx('تُحتسب كرصيد غير مستخدم حتى يُصرف.', 'Counted as unused balance until spent.')}</li>
          </ul>
          <Simulated />
        </>
      )}
    </Modal>
  );
}

function CardDrawer({ card, canManage, who, onClose }: { card: GiftCard; canManage: boolean; who: string; onClose: () => void }) {
  const tx = useTx();
  const toast = useToast();
  const [order, setOrder] = useState('150');
  const [ref, setRef] = useState('');
  const [confirm, setConfirm] = useState<'disable' | 'enable' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = giftState(card);
  const amt = parseMoney(order);
  const preview = amt === null ? null : redeemGift(card, amt, { ref: ref || 'TEST', by: '', today: TODAY });
  const kindName = (k: GiftCard['log'][number]['kind']) => ({ issue: tx('إصدار', 'Issued'), redeem: tx('استخدام', 'Used'), disable: tx('إيقاف', 'Disabled'), enable: tx('إعادة تفعيل', 'Re-enabled') })[k];
  const errName = (e: string) => ({ disabled: tx('البطاقة موقوفة.', 'The card is disabled.'), expired: tx('البطاقة منتهية.', 'The card has expired.'), empty: tx('لا رصيد متبقٍ.', 'No balance left.'), amount: tx('أدخل مبلغ الطلب.', 'Enter the order amount.') } as Record<string, string>)[e];
  const redeem = () => {
    if (amt === null) { setError(errName('amount')); return; }
    const r = redeemGift(card, amt, { ref: ref.trim() || `SIM-${Date.now().toString().slice(-5)}`, by: tx('أنت', 'You'), today: TODAY });
    if (r.error) { setError(errName(r.error)); return; }
    giftCardsStore.set((l) => l.map((g) => (g.code === card.code ? r.card : g)));
    logAction('marketing', { ar: `استخدام ${(r.applied / 100).toFixed(2)} ر.س من ${card.code} (محاكاة)`, en: `Used SAR ${(r.applied / 100).toFixed(2)} from ${card.code} (simulated)` }, { target: card.code, before: String(card.balance / 100), after: String(r.card.balance / 100) });
    toast({ tone: 'ok', text: tx('سُجّل الاستخدام ونقص الرصيد.', 'Use recorded; balance reduced.') });
    setError(null);
  };
  const setStatus = (s: GiftCard['status']) => {
    giftCardsStore.set((l) => l.map((g) => (g.code === card.code ? setGiftStatus(g, s, { by: tx('أنت', 'You'), today: TODAY }) : g)));
    logAction('marketing', s === 'disabled' ? { ar: `أوقف بطاقة الهدية ${card.code}`, en: `Disabled gift card ${card.code}` } : { ar: `أعاد تفعيل بطاقة الهدية ${card.code}`, en: `Re-enabled gift card ${card.code}` }, { target: card.code });
    setConfirm(null);
  };
  return (
    <Drawer title={card.code} onClose={onClose}
      footer={canManage ? (card.status === 'active'
        ? <Button variant="secondary" onClick={() => setConfirm('disable')}><Ban className="size-4" aria-hidden="true" />{tx('أوقف البطاقة', 'Disable card')}</Button>
        : <Button variant="secondary" onClick={() => setConfirm('enable')}><RotateCcw className="size-4" aria-hidden="true" />{tx('أعد التفعيل', 'Re-enable')}</Button>) : undefined}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2"><Badge tone={G_TONE[state]}>{({ active: tx('صالحة', 'Active'), used: tx('مستخدمة بالكامل', 'Fully used'), expired: tx('منتهية', 'Expired'), disabled: tx('موقوفة', 'Disabled') })[state]}</Badge><span className="text-sm text-muted">{who}</span></div>
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-2 px-3 py-2.5"><dt className="text-xs text-muted">{tx('الرصيد', 'Balance')}</dt><dd className="mt-0.5 text-lg font-bold"><Money v={card.balance} /></dd></div>
          <div className="rounded-xl bg-surface-2 px-3 py-2.5"><dt className="text-xs text-muted">{tx('القيمة الأصلية', 'Original value')}</dt><dd className="mt-0.5 text-lg font-bold"><Money v={card.initial} /></dd></div>
        </dl>

        {canManage && (
          <section aria-labelledby="h-gcr" className="space-y-3 rounded-2xl border border-border p-4">
            <h3 id="h-gcr" className="flex items-center gap-2 text-sm font-semibold text-fg">{tx('استخدام عند الدفع', 'Use at checkout')}<Simulated /></h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label={tx('مبلغ الطلب (ر.س)', 'Order total (SAR)')}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={order} onChange={(e) => { setOrder(e.target.value); setError(null); }} />}</Field>
              <Field label={tx('مرجع الطلب', 'Order reference')} optional>{(p) => <Input {...p} dir="ltr" value={ref} onChange={(e) => setRef(e.target.value)} />}</Field>
            </div>
            {preview && !preview.error && <p className="flex flex-wrap items-center gap-1 text-[13px] text-fg">{tx('يُخصم', 'Takes')} <Money v={preview.applied} />{tx('، ويبقى', ', leaving')} <Money v={preview.card.balance} />{amt !== null && amt > preview.applied && <>{tx('؛ يدفع العميل الباقي', '; the customer pays the rest')} <Money v={amt - preview.applied} /></>}</p>}
            {(error || preview?.error) && <Alert tone="warn">{error ?? errName(preview!.error!)}</Alert>}
            <Button size="sm" variant="secondary" disabled={!!preview?.error} onClick={redeem}><ReceiptText className="size-3.5" aria-hidden="true" />{tx('سجّل الاستخدام', 'Record the use')}</Button>
          </section>
        )}

        <section aria-labelledby="h-gcl">
          <h3 id="h-gcl" className="mb-2 flex items-center gap-1 text-sm font-semibold text-fg">{tx('السجل', 'History')}<InfoHint>{tx('كل حركة بمن قام بها ومتى.', 'Every movement with who and when.')}</InfoHint></h3>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {card.log.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0"><span className="block font-medium text-fg">{kindName(l.kind)}{l.ref && <> · <Ref>{l.ref}</Ref></>}</span><span className="block text-xs text-muted">{l.by === 'system' ? tx('النظام', 'System') : l.by} · <Ref>{l.at}</Ref></span></span>
                {l.amount > 0 && <span className={cn('font-semibold', l.kind === 'redeem' ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400')}><bdi dir="ltr">{l.kind === 'redeem' ? '−' : '+'}</bdi><Money v={l.amount} /></span>}
              </li>
            ))}
          </ul>
        </section>
      </div>
      {confirm && (
        <Modal title={confirm === 'disable' ? tx(`إيقاف ${card.code}`, `Disable ${card.code}`) : tx(`إعادة تفعيل ${card.code}`, `Re-enable ${card.code}`)} onClose={() => setConfirm(null)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => setStatus(confirm === 'disable' ? 'disabled' : 'active')}>{confirm === 'disable' ? tx('أوقف', 'Disable') : tx('أعد التفعيل', 'Re-enable')}</Button></>}>
          <ul className="space-y-1.5 text-sm text-fg">
            {confirm === 'disable'
              ? <><li>{tx('يُرفض الكود عند الدفع من الآن.', 'The code is refused at checkout from now on.')}</li><li className="flex flex-wrap items-center gap-1">{tx('يبقى الرصيد', 'The balance stays')} <Money v={card.balance} /> {tx('ويمكن إعادة التفعيل.', 'and can be re-enabled.')}</li><li>{tx('لا يُبلَّغ المستلم تلقائيًا.', 'The recipient is not notified automatically.')}</li></>
              : <li>{tx('يُقبل الكود عند الدفع مجددًا بالرصيد نفسه.', 'The code is accepted at checkout again with the same balance.')}</li>}
          </ul>
        </Modal>
      )}
    </Drawer>
  );
}
