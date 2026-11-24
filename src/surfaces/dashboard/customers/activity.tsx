// Customer profile pieces: the unified activity timeline, addresses, loyalty and gift cards, block / unblock and
// recording a consent withdrawal. View only; rules live in ./model.ts.
import { useMemo, useState } from 'react';
import {
  Ban, CheckCircle2, Gift, Mail, MapPin, MessageSquare, Megaphone, RotateCcw, ShoppingBag, ShoppingCart, Star, StickyNote,
  UserPlus, Workflow, XCircle, MinusCircle, ShieldOff, Award, CircleUser,
} from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link } from '../../../core/router';
import {
  automationsStore, cartsStore, customerEventsStore, customersStore, giftCardsStore, logAction, loyaltyStore, notesStore, ordersStore, pointsStore, reviewsStore, runsStore,
} from '../../merchant/stores';
import { giftState, pointsBalance } from '../../merchant/growth';
import type { Customer } from '../../merchant/workspace';
import { Badge, Button, Card, CardHeader, InfoHint, Money, Ref, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, Field, FilterChip, Modal, Select, Simulated, Textarea, useToast } from '../../../ds/kit';
import { campaignsStore, TODAY } from '../marketing/model';
import { sectionHref } from '../pages';
import { TIMELINE_KINDS, addresses, blockImpact, timeline, type TimelineItem, type TimelineKind } from './model';

const ICON: Record<TimelineKind, typeof Mail> = {
  order: ShoppingBag, refund: RotateCcw, message: MessageSquare, campaign: Megaphone, cart: ShoppingCart, automation: Workflow,
  note: StickyNote, event: CircleUser, review: Star, joined: UserPlus,
};
const TONE: Record<TimelineKind, string> = {
  order: 'bg-brand-500/10 text-brand-700 dark:text-brand-300', refund: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', message: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  campaign: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', cart: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', automation: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  note: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', event: 'bg-surface-2 text-muted', review: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', joined: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

export function useKindName() {
  const tx = useTx();
  return (k: TimelineKind) => ({
    order: tx('طلب', 'Order'), refund: tx('استرداد', 'Refund'), message: tx('رسالة منك', 'Your message'), campaign: tx('حملة', 'Campaign'), cart: tx('سلة متروكة', 'Abandoned cart'),
    automation: tx('أتمتة', 'Automation'), note: tx('ملاحظة داخلية', 'Internal note'), event: tx('إجراء على الحساب', 'Account action'), review: tx('تقييم أو سؤال', 'Review or question'), joined: tx('انضم', 'Joined'),
  })[k];
}

export function Activity({ c, filter, onFilter, seeOrders }: { c: Customer; filter: string; onFilter: (v: string) => void; seeOrders: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const kindName = useKindName();
  const orders = ordersStore.use();
  const notes = notesStore.use()[c.id] ?? [];
  const campaigns = campaignsStore.use();
  const carts = cartsStore.use();
  const runs = runsStore.use();
  const autos = automationsStore.use();
  const events = customerEventsStore.use()[c.id] ?? [];
  const reviews = reviewsStore.use();
  const [more, setMore] = useState(false);
  const all = useMemo(() => timeline(c, { orders, notes, campaigns, carts, runs, events, reviews, now: Date.now(), today: TODAY }), [c, orders, notes, campaigns, carts, runs, events, reviews]);
  const list = filter ? all.filter((x) => x.kind === filter) : all;
  const shown = more ? list : list.slice(0, 12);
  const ago = (h: number) => (h < 1 ? tx('الآن', 'Just now') : h < 24 ? tx(`قبل ${Math.round(h)} س`, `${Math.round(h)}h ago`) : h < 48 ? tx('أمس', 'Yesterday') : tx(`قبل ${Math.floor(h / 24)} يومًا`, `${Math.floor(h / 24)} days ago`));
  const counts = Object.fromEntries(TIMELINE_KINDS.map((k) => [k, all.filter((x) => x.kind === k).length])) as Record<TimelineKind, number>;

  const line = (x: TimelineItem) => {
    const ch = x.channel === 'email' ? tx('بريد', 'email') : x.channel === 'sms' ? tx('رسالة نصية', 'SMS') : '';
    switch (x.kind) {
      case 'order': return { title: <>{tx('طلب', 'Order')} <Ref>#{x.ref}</Ref></>, sub: <OrderPay s={x.status!} />, amount: x.amount, href: seeOrders ? sectionHref('orders', x.ref) : undefined };
      case 'refund': return { title: <>{tx('استرداد على', 'Refund on')} <Ref>#{x.ref}</Ref></>, sub: <Badge tone={x.status === 'confirmed' ? 'green' : x.status === 'failed' ? 'red' : 'amber'}>{x.status === 'confirmed' ? tx('مؤكد', 'Confirmed') : x.status === 'failed' ? tx('فشل', 'Failed') : tx('معلّق', 'Pending')}</Badge>, amount: x.amount, href: seeOrders ? sectionHref('orders', x.ref) : undefined };
      case 'message': return { title: tx(`رسالة ${ch} من الفريق`, `Team ${ch} message`), sub: <span className="line-clamp-2">{x.text}</span>, extra: <Simulated /> };
      case 'campaign': return { title: <>{x.status === 'cart' ? tx('رسالة استرجاع سلة', 'Cart recovery message') : tx('رسالة جماعية', 'Broadcast')} · <Ref>{x.ref}</Ref></>, sub: <span className="line-clamp-2">{ch} · {x.text}</span>, href: link('/dashboard/marketing', { tab: 'campaigns' }) };
      case 'cart': return { title: <>{tx('ترك سلة', 'Left a cart')} <Ref>{x.ref}</Ref></>, sub: <Badge tone={x.status === 'recovered' ? 'green' : x.status === 'purchased' ? 'gray' : 'amber'}>{x.status === 'recovered' ? tx('استُرجعت برسالة', 'Recovered by a message') : x.status === 'purchased' ? tx('اشترى وحده', 'Bought anyway') : tx('مفتوحة', 'Open')}</Badge>, amount: x.amount, href: link('/dashboard/marketing', { tab: 'carts', cview: 'all', cq: x.ref }) };
      case 'automation': {
        const a = autos.find((y) => y.id === x.status);
        const O = x.outcome === 'succeeded' ? CheckCircle2 : x.outcome === 'failed' ? XCircle : MinusCircle;
        return { title: <>{a?.name[lang] ?? x.status} · <Ref>{x.ref}</Ref></>, sub: <span className="inline-flex items-center gap-1"><O className="size-3.5" aria-hidden="true" />{x.text}</span>, href: link('/dashboard/automations', { tab: 'runs', run: x.ref }) };
      }
      case 'note': return { title: tx('ملاحظة داخلية', 'Internal note'), sub: <span className="line-clamp-2">{x.text}</span>, extra: <span className="text-xs text-muted">{x.by}</span> };
      case 'event': return { title: kindName('event'), sub: x.text, extra: <span className="text-xs text-muted">{x.by}</span> };
      case 'review': return { title: <>{tx('كتب تقييمًا أو سؤالًا', 'Wrote a review or question')} <Ref>{x.ref}</Ref></>, sub: <span className="line-clamp-2">{x.text}</span>, href: link('/dashboard/marketing/reviews', { view: 'all', q: x.text?.slice(0, 12) }) };
      case 'joined': return { title: tx('أصبح عميلًا', 'Became a customer'), sub: <Ref>{x.text}</Ref> };
    }
  };

  return (
    <Card aria-labelledby="h-act">
      <CardHeader id="h-act" title={tx('النشاط', 'Activity')} hint={tx('خط زمني واحد: الطلبات والاستردادات، والرسائل اليدوية والحملات والأتمتة والسلال، والملاحظات وإجراءات الحساب.', 'One timeline: orders and refunds, manual, campaign, automation and cart messages, notes and account actions.')}
        action={<FilterChip label={tx('النوع', 'Type')} value={filter} onChange={onFilter} options={TIMELINE_KINDS.filter((k) => counts[k]).map((k) => ({ value: k, label: `${kindName(k)} (${counts[k]})` }))} />} />
      {list.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">{tx('لا نشاط من هذا النوع.', 'No activity of this type.')}</p> : (
        <ol className="relative border-t border-border px-5 py-2">
          {shown.map((x) => {
            const l = line(x);
            const I = ICON[x.kind];
            const body = (
              <>
                <span className={cn('relative z-10 grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-surface', TONE[x.kind])} aria-hidden="true"><I className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-fg">{l.title}<span className="text-xs font-normal text-subtle">{ago(x.hoursAgo)}</span></p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">{l.sub}{l.extra}</div>
                </div>
                {l.amount !== undefined && <Money v={l.amount} className="shrink-0 text-sm font-semibold text-fg" />}
              </>
            );
            return (
              <li key={x.id} className="relative before:absolute before:start-[2rem] before:top-0 before:bottom-0 before:w-px before:bg-border first:before:top-1/2 last:before:bottom-1/2">
                {l.href ? <a href={l.href} className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2/60">{body}</a> : <div className="flex items-start gap-3 py-2.5">{body}</div>}
              </li>
            );
          })}
        </ol>
      )}
      {list.length > 12 && <div className="border-t border-border px-5 py-3"><Button variant="ghost" size="sm" onClick={() => setMore((m) => !m)}>{more ? tx('اعرض أقل', 'Show fewer') : tx(`اعرض كل ${list.length}`, `Show all ${list.length}`)}</Button></div>}
    </Card>
  );
}

function OrderPay({ s }: { s: string }) {
  const tx = useTx();
  const t: [Tone, string] = s === 'failed' ? ['red', tx('فشل الدفع', 'Payment failed')] : s === 'refunded' ? ['gray', tx('مسترد', 'Refunded')] : s === 'partially_refunded' ? ['amber', tx('مسترد جزئيًا', 'Partly refunded')] : ['green', tx('مدفوع', 'Paid')];
  return <Badge tone={t[0]}>{t[1]}</Badge>;
}

export function AddressesCard({ c }: { c: Customer }) {
  const tx = useTx();
  const { lang } = useLang();
  const list = addresses(c, ordersStore.use());
  return (
    <Card aria-labelledby="h-addr">
      <CardHeader id="h-addr" title={tx('العناوين', 'Addresses')} hint={tx('مدن التوصيل من طلبات العميل. العنوان التفصيلي داخل كل طلب.', 'Delivery cities from the customer’s orders. The full address is on each order.')} />
      {list.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">{tx('لا عناوين بعد.', 'No addresses yet.')}</p> : (
        <ul className="divide-y divide-border border-t border-border">
          {list.slice(0, 4).map((a, i) => (
            <li key={a.label.en} className="flex items-center gap-3 px-5 py-3">
              <MapPin className="size-4 shrink-0 text-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{a.label[lang]}</span>
              {i === 0 && <Badge tone="brand">{tx('الأحدث', 'Latest')}</Badge>}
              <span className="text-xs text-muted tabular-nums">{tx(`${a.orders} طلب`, `${a.orders} orders`)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function RewardsCard({ c }: { c: Customer }) {
  const tx = useTx();
  const rules = loyaltyStore.use();
  const ledger = pointsStore.use();
  const cards = giftCardsStore.use().filter((g) => g.customerId === c.id);
  const bal = pointsBalance(ledger, c.id);
  const last = ledger.filter((t) => t.customerId === c.id).slice(0, 3);
  return (
    <Card aria-labelledby="h-rew">
      <CardHeader id="h-rew" title={tx('الولاء وبطاقات الهدايا', 'Loyalty and gift cards')} action={<a href={link('/dashboard/marketing/loyalty', { q: c.id })} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('السجل', 'Ledger')}</a>} />
      <div className="space-y-3 px-5 pb-5">
        <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
          <Award className="size-5 text-amber-500" aria-hidden="true" />
          <div className="min-w-0 flex-1"><p className="text-lg font-bold tabular-nums text-fg">{bal.toLocaleString('en-US')} <span className="text-sm font-medium text-muted">{tx('نقطة', 'points')}</span></p><p className="flex items-center gap-1 text-xs text-muted">{tx('تساوي', 'Worth')} <Money v={Math.max(0, bal) * rules.pointValue} />{!rules.enabled && <Badge tone="gray">{tx('البرنامج موقوف', 'Programme off')}</Badge>}</p></div>
        </div>
        {last.length > 0 && <ul className="space-y-1 text-[13px]">{last.map((t) => <li key={t.id} className="flex justify-between gap-2"><span className="truncate text-muted">{t.kind === 'earn' ? tx('كسب', 'Earned') : t.kind === 'redeem' ? tx('استبدال', 'Redeemed') : t.kind === 'reverse' ? tx('عكس لاسترداد', 'Refund reversal') : tx('تعديل', 'Adjusted')}{t.ref ? ` · ${t.ref}` : ''}</span><bdi dir="ltr" className={cn('tabular-nums', t.delta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300')}>{t.delta >= 0 ? '+' : ''}{t.delta}</bdi></li>)}</ul>}
        {cards.length === 0 ? <p className="flex items-center gap-1.5 text-[13px] text-muted"><Gift className="size-4" aria-hidden="true" />{tx('لا بطاقات هدايا.', 'No gift cards.')}</p> : (
          <ul className="space-y-1.5">{cards.map((g) => <li key={g.code}><a href={link('/dashboard/marketing/gift-cards', { card: g.code })} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-[13px] hover:border-brand-300"><span className="flex items-center gap-1.5"><Gift className="size-3.5 text-muted" aria-hidden="true" /><Ref>{g.code}</Ref></span><span className="flex items-center gap-2"><Money v={g.balance} />{giftState(g) !== 'active' && <Badge tone="gray">{giftState(g)}</Badge>}</span></a></li>)}</ul>
        )}
      </div>
    </Card>
  );
}

/** Block or unblock with a reason, after a preview of what it affects. Logged on the customer and in the activity log. */
export function BlockModal({ c, onClose }: { c: Customer; onClose: () => void }) {
  const tx = useTx();
  const toast = useToast();
  const orders = ordersStore.use();
  const [reason, setReason] = useState('');
  const [preset, setPreset] = useState('fraud');
  const [tried, setTried] = useState(false);
  const blocking = !c.blocked;
  const imp = blockImpact(c, orders);
  const presets: Record<string, string> = { fraud: tx('اشتباه احتيال', 'Suspected fraud'), cod: tx('رفض استلام طلبات الدفع عند الاستلام', 'Refused cash-on-delivery orders'), abuse: tx('إساءة للفريق', 'Abusive to staff'), other: tx('سبب آخر', 'Other reason') };
  const text = preset === 'other' ? reason.trim() : `${presets[preset]}${reason.trim() ? ` — ${reason.trim()}` : ''}`;
  const apply = () => {
    setTried(true);
    if (blocking && !text) return;
    const by = tx('أنت', 'You');
    customersStore.set((l) => l.map((x) => (x.id === c.id ? (blocking ? { ...x, blocked: { reason: text, by, at: TODAY } } : (({ blocked: _b, ...rest }) => rest)(x)) : x)));
    customerEventsStore.set((all) => ({ ...all, [c.id]: [{ id: `E${Date.now()}`, kind: blocking ? 'blocked' : 'unblocked', text: blocking ? tx(`حُظر: ${text}`, `Blocked: ${text}`) : tx('فُكّ الحظر', 'Unblocked'), by, at: Date.now() }, ...(all[c.id] ?? [])] }));
    logAction('orders', blocking ? { ar: `حظر العميل ${c.id}`, en: `Blocked customer ${c.id}` } : { ar: `فك حظر العميل ${c.id}`, en: `Unblocked customer ${c.id}` }, { target: c.id, after: blocking ? text : undefined });
    toast({ tone: 'ok', text: blocking ? tx('حُظر العميل من الطلبات الجديدة', 'Customer blocked from new orders') : tx('فُكّ الحظر', 'Customer unblocked') });
    onClose();
  };
  return (
    <Modal title={blocking ? tx('حظر العميل', 'Block this customer') : tx('فك الحظر', 'Unblock this customer')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={apply}>{blocking ? <><Ban className="size-4" aria-hidden="true" />{tx('احظر', 'Block')}</> : <><ShieldOff className="size-4" aria-hidden="true" />{tx('فك الحظر', 'Unblock')}</>}</Button></>}>
      {blocking ? (
        <>
          <Field label={tx('السبب', 'Reason')}>{(p) => <Select {...p} value={preset} onChange={(e) => setPreset(e.target.value)}>{Object.entries(presets).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
          <Field label={tx('تفاصيل', 'Details')} optional={preset !== 'other'} error={tried && !text ? tx('اكتب السبب', 'Write the reason') : null}>{(p) => <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-fg">
            <p className="font-semibold">{tx('الأثر', 'What happens')}</p>
            <ul className="mt-1 list-disc space-y-1 ps-5">
              <li>{tx('لا يستطيع إتمام طلبات جديدة في متجرك.', 'They cannot complete new orders in your store.')}</li>
              <li>{imp.open ? tx(`${imp.open} طلبات مفتوحة لا تتأثر، منها ${imp.cod} دفع عند الاستلام. راجعها يدويًا.`, `${imp.open} open orders are not affected, ${imp.cod} of them cash on delivery. Review them yourself.`) : tx('لا طلبات مفتوحة.', 'No open orders.')}</li>
              <li>{tx('يُستبعد من الحملات. لا يُبلَّغ العميل.', 'Excluded from campaigns. The customer is not notified.')}</li>
            </ul>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('منع الطلب عند الدفع يحتاج الخادم؛ هنا يُسجَّل ويظهر في اللوحة.', 'Refusing checkout needs the server; here it is recorded and shown across the dashboard.')}</p>
        </>
      ) : (
        <p className="text-sm text-fg">{tx(`محظور منذ ${c.blocked!.at} بسبب: ${c.blocked!.reason}. بعد فك الحظر يستطيع الطلب ويعود للحملات إن كان موافقًا.`, `Blocked since ${c.blocked!.at}: ${c.blocked!.reason}. After unblocking they can order and rejoin campaigns if they consented.`)}</p>
      )}
    </Modal>
  );
}

/** Record that the customer asked to stop marketing on a channel. Consent can only be given back by the customer. */
export function WithdrawConsent({ c, onClose }: { c: Customer; onClose: () => void }) {
  const tx = useTx();
  const toast = useToast();
  const [ch, setCh] = useState<'email' | 'sms'>(c.consent.email ? 'email' : 'sms');
  const name = ch === 'email' ? tx('البريد', 'email') : tx('الرسائل النصية', 'SMS');
  const apply = () => {
    customersStore.set((l) => l.map((x) => (x.id === c.id ? { ...x, consent: { ...x.consent, [ch]: false } } : x)));
    customerEventsStore.set((all) => ({ ...all, [c.id]: [{ id: `E${Date.now()}`, kind: 'consentWithdrawn', text: tx(`سُحبت الموافقة على ${name} بطلب العميل`, `${ch === 'email' ? 'Email' : 'SMS'} consent withdrawn at the customer’s request`), by: tx('أنت', 'You'), at: Date.now() }, ...(all[c.id] ?? [])] }));
    logAction('marketing', { ar: `سحب موافقة ${name} للعميل ${c.id}`, en: `Withdrew ${ch} consent for ${c.id}` }, { target: c.id });
    toast({ tone: 'ok', text: tx('سُجّل سحب الموافقة', 'Consent withdrawal recorded') });
    onClose();
  };
  const options = (['email', 'sms'] as const).filter((x) => c.consent[x]);
  return (
    <Modal title={tx('تسجيل سحب الموافقة', 'Record a consent withdrawal')} description={tx('عندما يطلب العميل إيقاف الرسائل التسويقية.', 'When the customer asks to stop marketing messages.')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={!options.length} onClick={apply}>{tx('سجّل السحب', 'Record withdrawal')}</Button></>}>
      {options.length === 0 ? <Alert tone="info">{tx('لا موافقات تسويقية مسجّلة.', 'No marketing consent on record.')}</Alert> : (
        <>
          <Field label={tx('القناة', 'Channel')}>{(p) => <Select {...p} value={ch} onChange={(e) => setCh(e.target.value as 'email' | 'sms')}>{options.map((x) => <option key={x} value={x}>{x === 'email' ? tx('البريد', 'Email') : tx('الرسائل النصية', 'SMS')}</option>)}</Select>}</Field>
          <ul className="space-y-1 text-sm text-fg">
            <li>{tx('يتوقف إرسال الحملات والأتمتة التسويقية على هذه القناة فورًا.', 'Campaigns and marketing automations stop on this channel immediately.')}</li>
            <li>{tx('رسائل الخدمة عن طلباته تستمر.', 'Service messages about their orders continue.')}</li>
            <li className="flex items-center gap-1">{tx('لا يمكنك إعادة الموافقة بنفسك.', 'You cannot give consent back yourself.')}<InfoHint>{tx('الموافقة يمنحها العميل فقط (من الحساب أو رابط الاشتراك).', 'Only the customer can give consent (from their account or a subscribe link).')}</InfoHint></li>
          </ul>
        </>
      )}
    </Modal>
  );
}

