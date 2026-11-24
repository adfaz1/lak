// «ماذا يرى العميل»: pick a destination and a sample cart, see exactly the delivery options, prices and promise the
// shopper gets at checkout, which warehouse ships it, and why every other method is hidden. Same engine as the store.
import { useMemo } from 'react';
import { Banknote, EyeOff, Minus, Plus, ShoppingBag, Warehouse } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { replace, useRoute } from '../../../core/router';
import { Badge, Card, EmptyState, IconButton, InfoHint, LinkButton, Money, ProductImage, Segmented, cn, useTx } from '../../../ds/ui';
import { Field, Select, Switch } from '../../../ds/kit';
import { productPhoto } from '../model/media';
import { Section } from './common';
import { CAT_LABEL, COUNTRIES, SA_CITIES, catKey, promiseDates, quote, type CartIn, type Dest } from './shipping-model';
import { shipHref, useDays, useShipping } from './shipping-ui';
import { CAT_ICON } from './shipping-methods';

const parseCart = (s: string | null): Record<string, number> => Object.fromEntries((s ?? 'p1:1').split(',').filter(Boolean).map((x) => { const [id, q] = x.split(':'); return [id, Math.max(0, Math.min(20, Number(q) || 0))]; }).filter(([, q]) => (q as number) > 0));
const cartParam = (c: Record<string, number>) => Object.entries(c).filter(([, q]) => q > 0).map(([id, q]) => `${id}:${q}`).join(',') || 'none';

export default function SimulateTab() {
  const tx = useTx();
  const { lang } = useLang();
  const days = useDays();
  const route = useRoute();
  const { setup, zones, locations, products } = useShipping();
  const q = route.query;
  const dest = q.get('to') ?? 'riyadh';
  const abroad = COUNTRIES.some((c) => c.id === dest);
  const cod = q.get('cod') === '1';
  const late = q.get('late') === '1';
  const cart = q.get('cart') === 'none' ? {} : parseCart(q.get('cart'));
  const go = (p: Record<string, string | undefined>) => replace(shipHref('simulate', { to: dest, cart: cartParam(cart), cod: cod ? '1' : undefined, late: late ? '1' : undefined, ...p }));
  const setQty = (id: string, n: number) => go({ cart: cartParam({ ...cart, [id]: Math.max(0, Math.min(20, n)) }) });

  const sellable = products.filter((p) => p.status === 'active' && p.channels.online);
  const lines = sellable.filter((p) => cart[p.id]);
  const input: CartIn = {
    goods: lines.reduce((s, p) => s + p.price * cart[p.id], 0),
    weightG: lines.reduce((s, p) => s + (p.weight ?? 0) * cart[p.id], 0),
    cats: [...new Set(lines.map((p) => catKey(p.category)))],
    productIds: lines.map((p) => p.id),
  };
  // A fixed moment: today at 10:00 or 18:00 Riyadh, so the same-day cut-off can be tried either side.
  const now = useMemo(() => { const d = new Date(); d.setUTCHours(late ? 15 : 7, 0, 0, 0); return d.getTime(); }, [late]);
  const d: Dest = abroad ? { country: dest } : { country: 'SA', city: dest };
  const res = quote(setup, zones, d, input, { now, cod, locations, products });
  const fmt = (t: number) => new Date(t).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Riyadh' });

  return (
    <div className="space-y-6">
      <Section id="sim-in" title={tx('العميل وسلته', 'Shopper and cart')} hint={<InfoHint>{tx('لا يُنشأ طلب. نفس الحساب الذي تستخدمه صفحة الدفع في متجرك.', 'No order is created. The same calculation your store’s checkout uses.')}</InfoHint>}>
        <div className="space-y-4">
          <Segmented label={tx('الوجهة', 'Destination')} value={abroad ? 'abroad' : 'sa'} onChange={(v) => go({ to: v === 'abroad' ? 'AE' : 'riyadh' })}
            options={[{ value: 'sa', label: tx('داخل السعودية', 'Saudi Arabia') }, { value: 'abroad', label: tx('خارج السعودية', 'Abroad') }]} />
          <Field label={abroad ? tx('الدولة', 'Country') : tx('المدينة', 'City')}>{(p) => (
            <Select {...p} value={dest} onChange={(e) => go({ to: e.target.value })}>
              {(abroad ? COUNTRIES : SA_CITIES).map((c) => <option key={c.id} value={c.id}>{c.name[lang]}</option>)}
            </Select>
          )}</Field>
          <div>
            <p className="mb-2 text-[13px] font-medium text-fg">{tx('المنتجات', 'Products')}</p>
            <ul className="scrollbar-thin max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {sellable.map((p) => {
                const n = cart[p.id] ?? 0;
                return (
                  <li key={p.id} className={cn('flex items-center gap-3 px-3 py-2', n > 0 && 'bg-brand-500/[.04]')}>
                    <ProductImage src={productPhoto(p.id)} alt="" size={36} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-fg">{p.name[lang]}</span><span className="block text-xs text-muted">{p.category[lang]} · {p.weight ? tx(`${p.weight / 1000} كجم`, `${p.weight / 1000} kg`) : tx('رقمي', 'Digital')}</span></span>
                    <span className="flex items-center gap-1">
                      <IconButton label={tx(`أنقص ${p.name.ar}`, `Fewer ${p.name.en}`)} onClick={() => setQty(p.id, n - 1)} disabled={n === 0}><Minus className="size-4" aria-hidden="true" /></IconButton>
                      <span className="w-6 text-center text-sm tabular-nums" aria-label={tx('الكمية', 'Quantity')}>{n}</span>
                      <IconButton label={tx(`زِد ${p.name.ar}`, `More ${p.name.en}`)} onClick={() => setQty(p.id, n + 1)}><Plus className="size-4" aria-hidden="true" /></IconButton>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="flex items-center gap-2 text-[13px] text-fg"><Switch checked={cod} onChange={(v) => go({ cod: v ? '1' : undefined })} label={tx('يدفع عند الاستلام', 'Pays cash on delivery')} />{tx('يدفع عند الاستلام', 'Pays cash on delivery')}</label>
            <label className="flex items-center gap-2 text-[13px] text-fg"><Switch checked={late} onChange={(v) => go({ late: v ? '1' : undefined })} label={tx('يطلب بعد السادسة مساءً', 'Orders after 6 pm')} />{tx('يطلب بعد السادسة مساءً', 'Orders after 6 pm')}</label>
          </div>
        </div>
      </Section>

      <div className="min-w-0 space-y-6">
        <Card aria-labelledby="sim-out">
          <div className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-3">
            <h2 id="sim-out" className="min-w-0 flex-1 text-[15px] font-semibold text-fg">{tx('ما يراه العميل عند الدفع', 'What the shopper sees at checkout')}</h2>
            <LinkButton size="sm" variant="secondary" href="#/store">{tx('افتح المتجر', 'Open the store')}</LinkButton>
          </div>
          <div className="space-y-3 px-5 pb-5">
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted">
              <span>{tx('السلة ', 'Cart ')}<Money v={input.goods} className="text-fg" /></span>
              <span>{tx(`الوزن ${input.weightG / 1000} كجم`, `Weight ${input.weightG / 1000} kg`)}</span>
              {res.zone && <span>{tx('المنطقة: ', 'Zone: ')}<span className="text-fg">{res.zone.name[lang]}</span></span>}
            </p>
            {lines.length === 0 ? (
              <EmptyState icon={<ShoppingBag className="size-6" aria-hidden="true" />} title={tx('السلة فارغة', 'The cart is empty')}>{tx('أضف منتجًا لترى خيارات التوصيل.', 'Add a product to see delivery options.')}</EmptyState>
            ) : res.offers.length === 0 ? (
              <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm font-medium text-red-700 dark:text-red-400">{tx('لا توجد طريقة توصيل لهذا العميل؛ لن يستطيع إتمام الطلب. راجع الأسباب بالأسفل.', 'No delivery method for this shopper; they can’t check out. See why below.')}</p>
            ) : (
              <ul className="space-y-2">
                {res.offers.map((o, i) => {
                  const I = CAT_ICON[o.cat];
                  const pd = promiseDates(o, now);
                  return (
                    <li key={o.id} className={cn('flex items-start gap-3 rounded-xl border p-4', i === 0 ? 'border-brand-500 bg-brand-500/[.04] ring-1 ring-brand-500' : 'border-border')}>
                      <I className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">{o.name[lang]}<Badge>{CAT_LABEL[o.cat][lang]}</Badge></span>
                        <span className="mt-0.5 block text-[13px] text-muted">
                          {o.today === true ? tx('يصل اليوم', 'Arrives today') : o.today === false ? tx(`انتهى موعد اليوم؛ يصل ${fmt(pd.to)}`, `Past cut-off; arrives ${fmt(pd.to)}`) : pd.from === pd.to ? tx(`يصل ${fmt(pd.to)}`, `Arrives ${fmt(pd.to)}`) : tx(`يصل ${fmt(pd.from)} – ${fmt(pd.to)}`, `Arrives ${fmt(pd.from)} – ${fmt(pd.to)}`)}
                          {o.freeFrom !== null && <> · {tx('مجاني من ', 'Free from ')}<Money v={o.freeFrom} /></>}
                        </span>
                        <span className="mt-1 block text-xs text-subtle">{tx(`تجهيز ${o.handling} + نقل `, `Prep ${o.handling} + transit `)}{days(o.transit[0], o.transit[1])}{o.carrier && ` · ${o.carrier.name[lang]}`}</span>
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          {o.codOk ? <Badge tone="green" icon={<Banknote className="size-3" aria-hidden="true" />}>{tx('الدفع عند الاستلام متاح', 'COD available')}</Badge> : <Badge icon={<Banknote className="size-3" aria-hidden="true" />}>{tx('بلا دفع عند الاستلام: ', 'No COD: ')}{o.codWhy?.[lang]}</Badge>}
                          {o.applied.map((a) => <Badge key={a.en} tone="brand">{a[lang]}</Badge>)}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold">
                        {o.price === 0 ? <span className="text-emerald-700 dark:text-emerald-400">{tx('مجاني', 'Free')}</span> : <Money v={o.price} />}
                        {o.price !== o.base && <span className="block text-end text-xs text-muted line-through"><Money v={o.base} /></span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {res.warehouse && !abroad && lines.length > 0 && (
              <p className="flex items-center gap-2 text-[13px] text-muted"><Warehouse className="size-4" aria-hidden="true" />{tx('يُشحن من ', 'Ships from ')}<span className="font-medium text-fg">{res.warehouse.name[lang]}</span>{res.warehouse.auto ? tx(' (حسب المنطقة)', ' (by zone)') : tx(' (الافتراضي)', ' (default)')}</p>
            )}
            {setup.verifyPhone && cod && <p className="text-[13px] text-muted">{tx('سيُطلب من العميل رمز تحقق على جواله قبل تأكيد الطلب (محاكاة).', 'The shopper will be asked for a code sent to their mobile before the order is confirmed (simulated).')}</p>}
          </div>
        </Card>

        {lines.length > 0 && res.hidden.length > 0 && (
          <Section id="sim-hid" flush title={<><EyeOff className="size-4 text-muted" aria-hidden="true" />{tx('طرق لا يراها هذا العميل', 'Methods this shopper doesn’t see')}</>}>
            <ul className="divide-y divide-border border-t border-border">
              {res.hidden.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[13px]">
                  <span className="min-w-0 flex-1 basis-40 font-medium text-fg">{h.name[lang]}</span>
                  <span className="text-muted">{h.why[lang]}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
