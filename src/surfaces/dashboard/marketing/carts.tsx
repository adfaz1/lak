// Abandoned carts: the carts themselves (items, value, age, status), and recovery: audience (eligible vs excluded
// with reasons), consent, optional discount (an existing coupon or a new one-use code), message, cost at a test
// rate, preview, then a simulated send with progress and stop. The result (carts recovered, revenue, discount) is
// recorded on the campaign and on each cart. Never a real send.
import { useState } from 'react';
import { ShoppingCart, Send, Mail, MessageSquare, SearchX, CheckCircle2 } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { cartsStore, couponsStore, productsStore } from '../../merchant/stores';
import { EXCLUSIONS, TEST_RATE, audience, estimateCost, simSendFails, type Cart, type Exclusion, type MsgChannel } from '../../merchant/growth';
import { toLatin } from '../../merchant/growth';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, InfoHint, LinkButton, Money, ProductImage, Ref, Segmented, useTx, type Tone } from '../../../ds/ui';
import { DataTable, Field, Input, Pagination, SearchInput, Select, Simulated, Tabs, Textarea, type Column } from '../../../ds/kit';
import { skuPhoto } from '../model/media';
import { paginate } from '../customers/model';
import {
  CART_VIEWS, MESSAGE_MAX, campaignsStore, cartView, couponState, nextCampaignId, filterCarts, maxDiscountCost, messageError, recoveryCoupon, recoveryError, recoveryTotals, simulateRecovery,
  type CartView, type RecoveryDiscount,
} from './model';
import { SendProgress, SendReview, sendStore, type SendSpec } from './send';
import { Locked } from './access';

const V_TONE: Record<Exclude<CartView, 'all'>, Tone> = { open: 'amber', recovered: 'green', purchased: 'gray' };

export default function Carts({ route, empty, canSend }: { route: Route; empty: boolean; canSend: boolean }) {
  const tx = useTx();
  const all = cartsStore.use();
  const coupons = couponsStore.use();
  const products = productsStore.use();
  const active = sendStore.use();
  const carts = empty ? [] : all;
  const [ch, setCh] = useState<MsgChannel>('email');
  const [minHours, setMinHours] = useState(4);
  const [text, setText] = useState(() => tx('نسيت شيئًا في سلتك؟ أكمل طلبك متى ناسبك.', 'Left something in your cart? Complete your order whenever suits you.'));
  const [disc, setDisc] = useState<RecoveryDiscount>({ kind: 'none' });
  const [newPct, setNewPct] = useState('10');
  const [review, setReview] = useState<SendSpec | null>(null);
  const a = audience(carts, ch, minHours);
  const busy = !!active;
  const reason: Record<Exclusion, string> = {
    purchased: tx('اشترى بعد ترك السلة', 'Purchased after leaving'), optedOut: tx('ألغى الاشتراك في الرسائل', 'Unsubscribed from messages'),
    tooRecent: tx('تُركت منذ وقت قصير', 'Left too recently'), automation: tx('وصلته رسالة من الأتمتة خلال 24 ساعة', 'Messaged by an automation in the last 24h'),
    noConsent: tx('لا موافقة على هذه القناة', 'No consent for this channel'),
  };

  if (carts.length === 0) return (
    <Card><EmptyState as="h2" icon={<ShoppingCart className="size-6" aria-hidden="true" />} title={tx('لا سلال متروكة', 'No abandoned carts')}>
      {tx('تظهر هنا السلال التي تركها العملاء دون إتمام الطلب.', 'Carts customers leave without completing an order appear here.')}
    </EmptyState></Card>
  );

  // Discount: an existing code-based coupon live today, or a new one-use code for this send.
  const usable = coupons.filter((c) => !c.auto && c.type !== 'bogo' && (couponState(c) === 'active'));
  const discCoupon = disc.kind === 'existing' ? coupons.find((c) => c.code === disc.code) : disc.kind === 'new' ? recoveryCoupon(disc.code, disc.pct, a.eligible.length) : undefined;
  const dErr = recoveryError(disc, coupons);
  const fullText = discCoupon ? `${text.trim()} ${tx(`كود الخصم: ${discCoupon.code}`, `Discount code: ${discCoupon.code}`)}` : text;
  const mErr = messageError(fullText, ch);
  const maxCost = maxDiscountCost(discCoupon, a.eligible, products);
  const avgDisc = a.eligible.length && discCoupon ? Math.round(maxCost / a.eligible.length) : 0;
  const dErrText = dErr && ({ code: tx('من 4 إلى 16 حرفًا لاتينيًا كبيرًا أو رقمًا', '4–16 capital Latin letters or digits'), codeTaken: tx('الكود مستخدم', 'Code already in use'), pct: tx('نسبة من 1 إلى 50', 'A percentage from 1 to 50'), missing: tx('اختر كوبونًا', 'Choose a coupon') })[dErr];

  const open = () => setReview({
    kind: 'cart', channel: ch, ids: a.eligible.map((c) => c.id), excluded: a.excludedTotal, text: fullText,
    audience: { ar: `سلال متروكة منذ ${minHours} ساعة أو أكثر`, en: `Carts left ${minHours}h+ ago` },
    fails: (id) => !!carts.find((c) => c.id === id && simSendFails(c)),
    discount: discCoupon ? {
      code: discCoupon.code, isNew: disc.kind === 'new', maxCost,
      label: discCoupon.type === 'percent' ? { ar: `خصم ${discCoupon.value}%`, en: `${discCoupon.value}% off` } : { ar: 'خصم ثابت', en: 'Fixed discount' },
    } : undefined,
    onStart: disc.kind === 'new' && discCoupon ? () => couponsStore.set((cs) => [discCoupon, ...cs]) : undefined,
    finish: (handed) => {
      const rec = simulateRecovery(cartsStore.get(), handed, discCoupon, productsStore.get());
      const campaign = nextCampaignId(campaignsStore.get());
      cartsStore.set((list) => list.map((c) => {
        const r = rec.rows.find((x) => x.id === c.id);
        return r ? { ...c, purchased: true, recovered: { campaign, revenue: r.revenue, discount: r.discount, coupon: discCoupon?.code } } : c;
      }));
      if (discCoupon && rec.orders) couponsStore.set((cs) => cs.map((c) => (c.code === discCoupon.code ? { ...c, used: c.used + rec.orders } : c)));
      const ids = handed.map((id) => cartsStore.get().find((c) => c.id === id)?.customerId).filter((x): x is string => !!x);
      return { recipients: [...new Set(ids)], result: { orders: rec.orders, revenue: rec.revenue, discount: rec.discount } };
    },
  });
  const maxExcl = Math.max(1, ...EXCLUSIONS.map((x) => a.excluded[x]));

  return (
    <div className="space-y-6">
      {active && <SendProgress />}
      <CartList route={route} carts={carts} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="h-aud">
          <CardHeader id="h-aud" title={tx('استرجاع السلال: الجمهور', 'Recovery: audience')} hint={tx('تُرسل الرسالة فقط لمن وافق على القناة، ولم يشترِ، ولم تصله رسالة أتمتة للسلة نفسها.', 'Only customers who consented to the channel, have not purchased and were not messaged by an automation for the same cart.')} />
          <div className="space-y-5 px-5 pb-5">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <p className="text-[13px] font-semibold text-fg">{tx('القناة', 'Channel')}</p>
                <Segmented label={tx('القناة', 'Channel')} value={ch} onChange={(v) => !busy && setCh(v)} options={[{ value: 'email', label: tx('بريد', 'Email') }, { value: 'sms', label: tx('رسالة نصية', 'SMS') }]} />
              </div>
              <Field label={tx('تُركت منذ', 'Left at least')} className="w-40">
                {(p) => <Select {...p} value={minHours} disabled={busy} onChange={(e) => setMinHours(Number(e.target.value))}>{[1, 4, 24].map((h) => <option key={h} value={h}>{tx(`${h} ساعة`, `${h} hour${h > 1 ? 's' : ''}`)}</option>)}</Select>}
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="text-[13px] font-medium text-emerald-800 dark:text-emerald-300">{tx('مؤهل للإرسال', 'Eligible')}</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-fg">{a.eligible.length}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">{tx(`من ${carts.length} سلة · قيمتها`, `of ${carts.length} carts · worth`)} <Money v={a.eligible.reduce((s, c) => s + c.value, 0)} /></p>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <p className="text-[13px] font-medium text-muted">{tx('مستبعد', 'Excluded')}</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-fg">{a.excludedTotal}</p>
                <p className="mt-1 text-xs text-muted">{tx('السبب الأول فقط لكل سلة', 'First reason only per cart')}</p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-[13px] font-semibold text-fg">{tx('أسباب الاستبعاد', 'Why carts are excluded')}</h3>
              <ul className="space-y-2.5">
                {EXCLUSIONS.map((x) => (
                  <li key={x} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-[13px]">
                    <span className="text-fg">{reason[x]}</span><span className="tabular-nums text-muted">{a.excluded[x]}</span>
                    <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-subtle/60" style={{ width: `${(a.excluded[x] * 100) / maxExcl}%` }} /></span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3 border-t border-border pt-5">
              <h3 className="flex items-center gap-1 text-[13px] font-semibold text-fg">{tx('خصم اختياري', 'Optional discount')}<InfoHint>{tx('كوبون قائم يعمل اليوم، أو كود جديد لهذا الإرسال: مرة لكل عميل، صالح 7 أيام، بحد عدد المستلمين.', 'An existing coupon live today, or a new code for this send: once per customer, valid 7 days, limited to the number of recipients.')}</InfoHint></h3>
              <Segmented label={tx('خصم اختياري', 'Optional discount')} value={disc.kind} onChange={(k) => !busy && setDisc(k === 'none' ? { kind: 'none' } : k === 'existing' ? { kind: 'existing', code: usable[0]?.code ?? '' } : { kind: 'new', code: 'BACK' + newPct, pct: Number(newPct) || 0 })}
                options={[{ value: 'none', label: tx('بلا خصم', 'No discount') }, { value: 'existing', label: tx('كوبون قائم', 'Existing coupon') }, { value: 'new', label: tx('كود جديد', 'New code') }]} />
              {disc.kind === 'existing' && (
                <Field label={tx('الكوبون', 'Coupon')} error={dErr ? dErrText : null} className="max-w-xs">
                  {(p) => <Select {...p} value={disc.code} disabled={busy} onChange={(e) => setDisc({ kind: 'existing', code: e.target.value })}>
                    {usable.length === 0 && <option value="">{tx('لا كوبونات تعمل اليوم', 'No coupons live today')}</option>}
                    {usable.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.type === 'percent' ? `${c.value}%` : c.type === 'fixed' ? tx('مبلغ ثابت', 'fixed') : tx('شحن مجاني', 'free shipping')}</option>)}
                  </Select>}
                </Field>
              )}
              {disc.kind === 'new' && (
                <div className="grid max-w-md grid-cols-2 gap-3">
                  <Field label={tx('الكود', 'Code')} error={dErr === 'code' || dErr === 'codeTaken' ? dErrText : null}>
                    {(p) => <Input {...p} dir="ltr" value={disc.code} disabled={busy} onChange={(e) => setDisc({ ...disc, code: e.target.value.toUpperCase().replace(/\s/g, '') })} />}
                  </Field>
                  <Field label={tx('النسبة %', 'Percent %')} error={dErr === 'pct' ? dErrText : null}>
                    {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={newPct} disabled={busy} onChange={(e) => { setNewPct(e.target.value); setDisc({ ...disc, pct: /^\d+$/.test(toLatin(e.target.value)) ? Number(toLatin(e.target.value)) : NaN }); }} />}
                  </Field>
                </div>
              )}
              {discCoupon && !dErr && a.eligible.length > 0 && (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-surface-2 px-3 py-2.5"><dt className="text-xs text-muted">{tx('متوسط الخصم للسلة', 'Average discount per cart')}</dt><dd className="mt-0.5 font-semibold"><Money v={avgDisc} /></dd></div>
                  <div className="rounded-xl bg-surface-2 px-3 py-2.5"><dt className="flex items-center gap-1 text-xs text-muted">{tx('الأقصى إن اشترى الجميع', 'Most if everyone buys')}<InfoHint>{tx('يُحسم من الإيراد فقط عند الشراء بالكود.', 'Only taken from revenue when someone buys with the code.')}</InfoHint></dt><dd className="mt-0.5 font-semibold"><Money v={maxCost} /></dd></div>
                </dl>
              )}
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card aria-labelledby="h-msg">
            <CardHeader id="h-msg" title={tx('الرسالة', 'Message')} hint={tx('يُضاف كود الخصم إلى آخر النص تلقائيًا إن اخترته.', 'The discount code is added to the end of the text if you chose one.')} />
            <div className="space-y-4 px-5 pb-5">
              <Field label={tx('النص', 'Text')} error={mErr === 'long' ? tx(`الحد ${MESSAGE_MAX[ch]} حرفًا لهذه القناة مع الكود`, `Limit is ${MESSAGE_MAX[ch]} characters for this channel, code included`) : null}
                hint={<bdi dir="ltr">{fullText.length} / {MESSAGE_MAX[ch]}</bdi>}>
                {(p) => <Textarea {...p} value={text} disabled={busy} dir="auto" onChange={(e) => setText(e.target.value)} />}
              </Field>
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">{ch === 'email' ? <Mail className="size-3.5" aria-hidden="true" /> : <MessageSquare className="size-3.5" aria-hidden="true" />}{tx('كما سيراها العميل', 'As the customer sees it')}</p>
                <div className="rounded-2xl bg-surface-2 p-3">
                  <p className="max-w-[90%] rounded-2xl rounded-ss-sm bg-surface px-3 py-2 text-sm leading-relaxed text-fg shadow-card" dir="auto">{fullText || '—'}</p>
                  <p className="mt-2 text-[11px] text-subtle">{tx('يتضمن رابط السلة ورابط إلغاء الاشتراك تلقائيًا', 'A cart link and an unsubscribe link are added automatically')}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card aria-labelledby="h-cost">
            <CardHeader id="h-cost" title={<span className="flex items-center gap-2">{tx('التكلفة التقديرية', 'Estimated cost')}<Badge tone="amber">{tx('سعر اختبار', 'Test rate')}</Badge></span>}
              hint={tx('سعر اختبار توضيحي، وليس تسعير مزود الإرسال أو «لك». يُستبدل بالسعر المعتمد.', 'An illustrative test rate, not the provider’s or LAK’s pricing. Replaced by the approved rate.')} />
            <div className="space-y-3 px-5 pb-5">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-muted">{tx('رسائل', 'Messages')}</dt><dd className="tabular-nums text-fg">{a.eligible.length}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">{tx('للرسالة', 'Per message')}</dt><dd><Money v={TEST_RATE[ch]} /></dd></div>
                <div className="flex justify-between border-t border-border pt-2"><dt className="font-semibold text-fg">{tx('الإجمالي', 'Total')}</dt><dd className="text-lg font-bold"><Money v={estimateCost(a.eligible.length, ch)} /></dd></div>
              </dl>
              {canSend ? (
                <Button className="w-full" disabled={busy || !a.eligible.length || !!mErr || !!dErr} onClick={open}><Send className="size-4" aria-hidden="true" />{tx('راجع ثم أرسل', 'Review and send')}</Button>
              ) : <Locked>{tx('دورك لا يشمل إرسال الحملات.', 'Your role does not include sending campaigns.')}</Locked>}
              <div className="flex items-center justify-between gap-2 text-xs text-muted"><Simulated /><span className="flex items-center gap-1">{tx('لا يخرج شيء فعليًا', 'Nothing actually leaves')}<InfoHint>{tx('هذه نسخة تجريبية: لا يتصل الإرسال بأي مزوّد.', 'This is a demo: sending reaches no provider.')}</InfoHint></span></div>
            </div>
          </Card>
        </div>
      </div>
      {review && <SendReview spec={review} onClose={() => setReview(null)} />}
    </div>
  );
}

function useCartText() {
  const tx = useTx();
  return {
    ago: (h: number) => (h < 24 ? tx(`قبل ${h} س`, `${h}h ago`) : tx(`قبل ${Math.round(h / 24)} ي`, `${Math.round(h / 24)}d ago`)),
    viewName: (v: CartView) => ({ open: tx('مفتوحة', 'Open'), recovered: tx('استُرجعت', 'Recovered'), purchased: tx('اشترى وحده', 'Bought anyway'), all: tx('الكل', 'All') })[v],
  };
}

function CartList({ route, carts }: { route: Route; carts: Cart[] }) {
    const tx = useTx();
    const { lang } = useLang();
    const { ago, viewName } = useCartText();
    const qv = route.query.get('cview') as CartView | null;
    const view: CartView = qv && CART_VIEWS.includes(qv) ? qv : 'open';
    const q = route.query.get('cq') ?? '';
    const href = (p: Record<string, string | undefined>) => link('/dashboard/marketing', { tab: 'carts', cview: view === 'open' ? undefined : view, cq: q || undefined, ...p });
    const rows = filterCarts(carts, { view, q });
    const pg = paginate(rows, Number(route.query.get('cpage')) || 1, 10);
    const tot = recoveryTotals(carts);
    const openCarts = carts.filter((c) => cartView(c) === 'open');
    const cols: Column<Cart>[] = [
      { key: 'c', header: tx('العميل', 'Customer'), cell: (c) => <span className="flex items-center gap-3"><Avatar name={c.customer[lang]} /><span className="min-w-0"><span className="block truncate font-semibold text-fg">{c.customer[lang]}</span><span className="block text-xs font-normal text-muted"><Ref>{c.id}</Ref> · {ago(c.hoursAgo)}</span></span></span> },
      { key: 'i', header: tx('المنتجات', 'Items'), hideBelow: 'lg', cell: (c) => <span className="flex items-center gap-2"><span className="flex -space-x-2 rtl:space-x-reverse">{(c.items ?? []).map((it) => <ProductImage key={it.sku} src={skuPhoto(it.sku)} alt={it.name[lang]} size={32} className="ring-2 ring-surface" />)}</span><span className="min-w-0 truncate text-[13px] text-muted">{(c.items ?? []).map((it) => `${it.name[lang]}${it.qty > 1 ? ` ×${it.qty}` : ''}`).join(tx('، ', ', '))}</span></span> },
      { key: 's', header: tx('الحالة', 'Status'), cell: (c) => <span className="flex flex-wrap items-center gap-1.5"><Badge tone={V_TONE[cartView(c)]}>{viewName(cartView(c))}</Badge>{c.recovered?.coupon && <Ref>{c.recovered.coupon}</Ref>}</span> },
      { key: 'v', header: tx('القيمة', 'Value'), align: 'end', cell: (c) => <span className="block"><Money v={c.value} className="font-semibold text-fg" />{c.recovered && <span className="block text-xs text-emerald-700 dark:text-emerald-400">{tx('مُسترجع', 'Recovered')} <Money v={c.recovered.revenue} /></span>}</span> },
    ];
    return (
      <Card aria-labelledby="h-carts">
        <CardHeader id="h-carts" title={tx('السلال المتروكة', 'Abandoned carts')} hint={tx('السلة متروكة إذا لم يُكمل العميل الطلب خلال ساعة. «استُرجعت» = اشترى خلال 7 أيام من رسالة استرجاع (محاكاة).', 'A cart is abandoned if the order is not completed within an hour. “Recovered” = bought within 7 days of a recovery message (simulated).')} />
        <dl className="grid grid-cols-1 gap-3 px-5 pb-4 sm:grid-cols-3">
          <div className="rounded-xl bg-surface-2 px-4 py-3"><dt className="text-xs text-muted">{tx('مفتوحة الآن', 'Open now')}</dt><dd className="mt-0.5 flex flex-wrap items-baseline gap-2 font-semibold text-fg"><span className="text-xl tabular-nums">{openCarts.length}</span><Money v={openCarts.reduce((s, c) => s + c.value, 0)} className="text-sm text-muted" /></dd></div>
          <div className="rounded-xl bg-emerald-500/8 px-4 py-3"><dt className="flex items-center gap-1 text-xs text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="size-3.5" aria-hidden="true" />{tx('استُرجعت برسائلك', 'Recovered by your messages')}</dt><dd className="mt-0.5 flex flex-wrap items-baseline gap-2 font-semibold text-fg"><span className="text-xl tabular-nums">{tot.carts}</span><Money v={tot.revenue} className="text-sm" /></dd></div>
          <div className="rounded-xl bg-surface-2 px-4 py-3"><dt className="text-xs text-muted">{tx('خصم مُنح في الاسترجاع', 'Discount given in recovery')}</dt><dd className="mt-0.5 text-xl font-semibold text-fg"><Money v={tot.discount} /></dd></div>
        </dl>
        <div className="px-4 sm:px-5">
          <Tabs label={tx('حالة السلة', 'Cart status')} items={CART_VIEWS.map((v) => ({ href: href({ cview: v === 'open' ? undefined : v, cpage: undefined }), label: viewName(v), current: v === view, count: v === 'all' ? carts.length : carts.filter((c) => cartView(c) === v).length }))} />
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
          <SearchInput value={q} onChange={(v) => replace(href({ cq: v || undefined, cpage: undefined }))} placeholder={tx('ابحث بالعميل أو رقم السلة', 'Search customer or cart id')} />
        </div>
        {pg.total === 0 ? (
          <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={view === 'recovered' && !q ? tx('لم تُسترجع سلال بعد', 'No carts recovered yet') : tx('لا سلال مطابقة', 'No matching carts')}
            action={q ? <LinkButton variant="secondary" href={href({ cq: undefined })}>{tx('امسح البحث', 'Clear search')}</LinkButton> : undefined}>
            {view === 'recovered' && !q ? tx('أرسل رسالة استرجاع من الأسفل؛ تظهر السلال التي اشترى أصحابها هنا مع الإيراد.', 'Send a recovery message below; carts whose owners buy appear here with the revenue.') : undefined}
          </EmptyState>
        ) : (
          <div className="border-t border-border">
            <DataTable label={tx('السلال المتروكة', 'Abandoned carts')} rows={pg.rows} columns={cols} rowKey={(c) => c.id} href={(c) => link(`/dashboard/customers/${c.customerId ?? ''}`)}
              card={(c) => (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2"><span className="truncate font-semibold text-fg">{c.customer[lang]}</span><Money v={c.value} className="text-sm font-semibold text-fg" /></div>
                  <p className="truncate text-xs text-muted">{(c.items ?? []).map((it) => it.name[lang]).join(tx('، ', ', '))}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted"><Badge tone={V_TONE[cartView(c)]}>{viewName(cartView(c))}</Badge><Ref>{c.id}</Ref> · {ago(c.hoursAgo)}</p>
                </div>
              )} />
            <Pagination page={pg.page} pages={pg.pages} total={pg.total} hrefFor={(p) => href({ cpage: p > 1 ? String(p) : undefined })} />
          </div>
        )}
      </Card>
    );
}
