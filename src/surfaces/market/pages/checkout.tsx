// Checkout for one store only. Other stores stay in the cart. Payment is simulated; a declined card keeps the cart.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Banknote, CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import { link, navigate, replace } from '../../../core/router';
import { Badge, Button, Card, EmptyState, Money, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, Select, Simulated } from '../../../ds/kit';
import { CITIES, checkoutBlock, checkoutTotals, groupCart, placeOrder, removeSeller, type CityId, type PayMethod } from '../domain';
import { PRODUCTS, SELLERS } from '../fixtures';
import { marketStore, now, useDecline, useScreen } from '../state';
import { H2, SellerMark, sellerOf, useMk, useMoneyText } from '../ui';
import { ListSkeleton, PageError, Title } from './common';

type Phase = 'form' | 'confirm' | 'processing' | 'declined';

export default function Checkout({ sellerId }: { sellerId: string }) {
  const { t, lang, city, go, route } = useMk();
  const tx = useTx();
  const money = useMoneyText();
  const screen = useScreen();
  const decline = useDecline();
  const s = marketStore.use();
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [method, setMethod] = useState<PayMethod>('card');
  const [tried, setTried] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const seller = sellerOf(sellerId);
  const back = { href: go('/cart'), label: t.backCart };
  if (screen === 'error') return <><Title back={back}>{t.checkoutTitle(seller?.name[lang] ?? '')}</Title><PageError title={tx('تعذّر تحميل صفحة الدفع', 'Checkout could not load')} refCode="SIM-MKT-CHK-503" /></>;
  if (screen === 'loading') return <><Title back={back}>{t.checkoutTitle(seller?.name[lang] ?? '')}</Title><ListSkeleton /></>;
  const group = groupCart(screen === 'empty' ? [] : s.cart, PRODUCTS, SELLERS, city).find((g) => g.seller.id === sellerId);
  if (!seller || !group) return <><Title back={back}>{t.checkoutTitle(seller?.name[lang] ?? '')}</Title><Card><EmptyState as="h2" title={seller ? t.blocks.empty : t.storeNotFound} action={<Button variant="secondary" onClick={() => navigate(go('/cart'))}>{t.backCart}</Button>} /></Card></>;

  const errors = {
    name: !form.name.trim() ? t.required : undefined,
    phone: !form.phone.trim() ? t.required : !/^05\d{8}$/.test(form.phone.replace(/\s/g, '')) ? t.badPhone : undefined,
    address: !form.address.trim() ? t.required : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  const block = checkoutBlock(group, method);
  const totals = checkoutTotals(group, method);
  const err = (k: keyof typeof errors) => (tried ? errors[k] : undefined);
  const setCity = (c: CityId) => { const cur: Record<string, string> = {}; route.query.forEach((v, k) => { cur[k] = v; }); replace(link(`/market/checkout/${sellerId}`, { ...cur, city: c === 'riyadh' ? undefined : c })); };
  const submit = (e: FormEvent) => { e.preventDefault(); setTried(true); if (!invalid && !block) setPhase('confirm'); };
  const pay = () => {
    setPhase('processing');
    timer.current = window.setTimeout(() => {
      if (method === 'card' && decline) { setPhase('declined'); return; }
      const ref = `MK-${20500 + marketStore.get().seq}`;
      const o = placeOrder(group, method, city, now(), ref);
      if (!o) { setPhase('form'); return; }
      marketStore.set((x) => ({
        ...x, seq: x.seq + 1, orders: [o, ...x.orders], cart: removeSeller(x.cart, PRODUCTS, sellerId),
        notes: [{ id: `n${x.seq}-o`, at: o.createdAt, kind: 'orderPlaced', ref, read: false }, ...x.notes],
      }));
      navigate(go(`/orders/${ref}`, { placed: '1' }));
    }, 900);
  };

  const methods: { id: PayMethod; icon: typeof CreditCard; label: string; sub: ReactNode; disabled?: boolean }[] = [
    { id: 'card', icon: CreditCard, label: t.card, sub: t.cardHint },
    { id: 'cod', icon: Banknote, label: t.codLabel, sub: seller.shipping.codFee === null ? t.blocks.codUnavailable : <>{t.codFee}: <Money v={seller.shipping.codFee} /></>, disabled: seller.shipping.codFee === null },
  ];

  return (
    <>
      <Title back={back} sub={t.checkoutSub}>{t.checkoutTitle(seller.name[lang])}</Title>
      {phase === 'declined' && (
        <div className="mb-5"><Alert tone="bad" title={tx('رُفضت البطاقة (محاكاة)', 'Card declined (simulated)')}
          action={<Button size="sm" variant="secondary" onClick={() => setPhase('confirm')}>{tx('أعد المحاولة', 'Try again')}</Button>}>
          {tx('لم يُنشأ طلب ولم يُخصم أي مبلغ. سلتك وبياناتك كما هي؛ جرّب مرة أخرى أو اختر الدفع عند الاستلام.', 'No order was created and nothing was charged. Your cart and details are kept; try again or choose cash on delivery.')}
        </Alert></div>
      )}
      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {tried && invalid && <Alert tone="bad">{t.fixErrors}</Alert>}
          <Card className="space-y-4 p-5" aria-labelledby="co-c">
            <H2 id="co-c">{t.contact}</H2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.fullName} error={err('name')}>{(p) => <Input {...p} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
              <Field label={t.phone} hint={t.phoneHint} error={err('phone')}>{(p) => <Input {...p} dir="ltr" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</Field>
              <Field label={t.city}>{(p) => <Select {...p} value={city} onChange={(e) => setCity(e.target.value as CityId)}>{CITIES.map((c) => <option key={c} value={c}>{t.cities[c]}</option>)}</Select>}</Field>
              <Field label={t.address} error={err('address')}>{(p) => <Input {...p} autoComplete="street-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />}</Field>
            </div>
            {group.shipping === null && <Alert tone="warn">{t.blocks.noDelivery}</Alert>}
          </Card>

          <Card className="space-y-3 p-5" aria-labelledby="co-p">
            <H2 id="co-p">{t.payment}</H2>
            <fieldset className="space-y-2">
              <legend className="sr-only">{t.payment}</legend>
              {methods.map((m) => (
                <label key={m.id} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors', method === m.id ? 'border-brand-500 bg-brand-500/5' : 'border-border hover:border-brand-300', m.disabled && 'cursor-not-allowed opacity-60')}>
                  <input type="radio" name="mk-pay" className="mt-1 size-4 accent-brand-600" checked={method === m.id} disabled={m.disabled} onChange={() => setMethod(m.id)} />
                  <m.icon className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-fg">{m.label}</span><span className="block text-xs text-muted">{m.sub}</span></span>
                </label>
              ))}
            </fieldset>
          </Card>

          <p className="flex gap-2 rounded-xl bg-surface-2 p-3.5 text-[13px] leading-relaxed text-muted"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden="true" /><span><strong className="text-fg">{t.shared}: </strong>{t.sharedBody(seller.name[lang])}</span></p>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="space-y-4 p-5" aria-labelledby="co-s">
            <H2 id="co-s">{t.summary}</H2>
            <div className="flex items-center gap-2"><SellerMark s={seller} size={28} /><span className="text-sm font-semibold text-fg">{seller.name[lang]}</span></div>
            <ul className="space-y-2 text-sm">
              {group.lines.map((l) => <li key={l.product.id} className="flex justify-between gap-3"><span className="min-w-0 truncate">{l.product.name[lang]} <span className="text-muted">× {l.qty}</span></span><Money v={l.total} /></li>)}
            </ul>
            <dl className="space-y-1.5 border-t border-border pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted">{t.subtotal}</dt><dd><Money v={totals.subtotal} /></dd></div>
              <div className="flex justify-between"><dt className="text-muted">{t.shippingTo(t.cities[city])}</dt><dd>{group.shipping === null ? '—' : totals.shipping === 0 ? t.free : <Money v={totals.shipping} />}</dd></div>
              {totals.codFee > 0 && <div className="flex justify-between"><dt className="text-muted">{t.codFee}</dt><dd><Money v={totals.codFee} /></dd></div>}
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><dt>{t.total}</dt><dd><Money v={totals.total} /></dd></div>
              <div className="flex justify-between text-xs text-muted"><dt>{t.vatIn}</dt><dd><Money v={totals.vat} /></dd></div>
            </dl>
            {block && block !== 'noDelivery' && <p className="text-xs font-medium text-red-600 dark:text-red-400">{t.blocks[block]}</p>}
            <Button type="submit" size="lg" className="w-full bg-brand-gradient hover:opacity-95" disabled={!!block || phase === 'processing'}>{t.placeOrder(money(totals.total))}</Button>
            <div className="flex justify-center"><Simulated /></div>
          </Card>
        </aside>
      </form>

      {(phase === 'confirm' || phase === 'processing') && (
        <Modal title={t.confirmTitle} onClose={() => phase !== 'processing' && setPhase('form')}
          footer={<>
            <Button variant="secondary" disabled={phase === 'processing'} onClick={() => setPhase('form')}>{t.cancel}</Button>
            <Button disabled={phase === 'processing'} onClick={pay}>{phase === 'processing' ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" />{tx('جارٍ تأكيد الدفع…', 'Confirming payment…')}</> : t.confirm}</Button>
          </>}>
          <p className="text-sm text-fg">{t.confirmBody(seller.name[lang], money(totals.total))}</p>
          <p className="text-sm text-muted">{method === 'cod' ? t.confirmCod : t.confirmCard}</p>
          <div className="flex flex-wrap items-center gap-2"><Badge tone="brand">{tx('طلب منفصل لهذا المتجر', 'A separate order for this store')}</Badge><Simulated /></div>
        </Modal>
      )}
    </>
  );
}
