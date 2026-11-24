import { useCallback, useState } from 'react';
import { Heart, MapPin, Package, Plus, Trash2, User } from 'lucide-react';
import type { Route } from '../../../core/router';
import { Field, Input, Modal, Select, Tabs, useToast } from '../../../ds/kit';
import { Badge, Button, EmptyState, LinkButton, Money, Ref, cn } from '../../../ds/ui';
import { CITIES, cityById, cleanPhone, validateAddress, variantById, type Address, type AddrErr, type CityId } from '../domain';
import { H1, PANEL, ProductPhoto, SimNote, WRAP, districtLabel, to, useS } from '../kit';
import { CUSTOMER, accountStore, signIn, signOut, type SavedAddress } from '../state';
import { useCatalog, useOrders } from '../data';
import { ProductGrid } from './Listing';
import { fulTone, payTone, shipTone } from './Order';

type Tab = 'orders' | 'addresses' | 'wishlist';
const TABS: Tab[] = ['orders', 'addresses', 'wishlist'];

export default function AccountPage({ route }: { route: Route }) {
  const { t, l } = useS();
  const acc = accountStore.use();
  const orders = useOrders().filter((o) => o.customerId === CUSTOMER.id);
  const q = route.query.get('tab') as Tab | null;
  const tab: Tab = q && TABS.includes(q) ? q : 'orders';
  const counts: Record<Tab, number> = { orders: orders.length, addresses: acc.addresses.length, wishlist: acc.wishlist.length };

  return (
    <div className={cn(WRAP, 'py-6 sm:py-10')}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={H1}>{acc.signedIn ? t.accTitle : tab === 'wishlist' ? t.wishlist : t.accTitle}</h1>
          {acc.signedIn && <p className="mt-1 text-sm text-muted">{t.signedAs(l(CUSTOMER.name))}</p>}
        </div>
        {acc.signedIn && <Button variant="secondary" onClick={signOut}>{t.signOut}</Button>}
      </header>

      {!acc.signedIn ? (
        <div className="space-y-10">
          <div className={cn(PANEL, 'mx-auto max-w-md space-y-4 p-6 text-center sm:p-8')}>
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-700 dark:text-brand-300"><User className="size-6" aria-hidden="true" /></span>
            <p className="font-medium">{t.accSignIn}</p>
            <Button size="lg" className="w-full" onClick={signIn}>{t.signInSim}</Button>
            <SimNote className="justify-center">{t.signInNote}</SimNote>
            <p className="border-t border-border pt-4 text-sm text-muted">{t.trackSub} <a className="font-semibold text-fg underline-offset-4 hover:underline" href={to('/track')}>{t.track}</a></p>
          </div>
          {tab === 'wishlist' && <Wishlist />}
        </div>
      ) : (
        <div className="space-y-6">
          <Tabs label={t.accTitle} items={TABS.map((x) => ({ href: to('/account', { tab: x === 'orders' ? undefined : x }), label: t.tabs[x], current: tab === x, count: counts[x] }))} />
          {tab === 'orders' && <Orders />}
          {tab === 'addresses' && <Addresses />}
          {tab === 'wishlist' && <Wishlist />}
        </div>
      )}
    </div>
  );
}

function Orders() {
  const { t, d } = useS();
  const products = useCatalog();
  const orders = useOrders().filter((o) => o.customerId === CUSTOMER.id).sort((a, b) => b.at - a.at);
  if (!orders.length) return <EmptyState as="h2" icon={<Package className="size-6" aria-hidden="true" />} title={t.ordersEmpty} action={<LinkButton href={to('/c/all')}>{t.keepShopping}</LinkButton>} />;
  return (
    <ul className="space-y-3">
      {orders.map((o) => (
        <li key={o.ref}>
          <a href={to(`/track/${o.ref}`)} className={cn(PANEL, 'block space-y-4 p-5 transition-colors hover:border-fg/30')}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p><Ref><span className="font-semibold">{o.ref}</span></Ref> <span className="text-sm text-muted">· {d(o.at)}</span></p>
              <Money v={o.totals.total} className="font-semibold" />
            </div>
            <div className="flex items-center gap-2">
              {o.lines.slice(0, 4).map((line) => {
                const f = variantById(products, line.vid);
                return f ? <span key={line.vid} className="w-12"><ProductPhoto p={f.product} color={f.variant.color} variant="thumb" /></span> : null;
              })}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
              <span className="text-muted">{t.payment}</span><Badge tone={payTone(o.pay.state)}>{t.payS[o.pay.state]}</Badge>
              <span className="ms-1 text-muted">{t.fulfilment}</span><Badge tone={fulTone(o.ful)}>{t.fulS[o.ful]}</Badge>
              <span className="ms-1 text-muted">{t.shipment}</span><Badge tone={shipTone(o.shipment)}>{t.shipS[o.shipment]}</Badge>
            </div>
            <span className="sr-only">{t.view} {o.ref}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Addresses() {
  const { t, l, lang } = useS();
  const toast = useToast();
  const acc = accountStore.use();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Partial<Address>>({});
  const [tried, setTried] = useState(false);
  const [del, setDel] = useState<SavedAddress | null>(null);
  const closeDel = useCallback(() => setDel(null), []);
  const errs: AddrErr = validateAddress(draft);
  const e = (k: keyof AddrErr) => {
    const v = tried ? errs[k] : undefined;
    return !v ? null : v === 'required' ? t.eRequired : k === 'phone' ? t.ePhone : t.eNational;
  };
  const city = cityById(draft.city);

  const save = () => {
    setTried(true);
    const first = (Object.keys(errs) as (keyof AddrErr)[])[0];
    if (first) { document.getElementById(`sf-n-${first}`)?.focus(); return; }
    const id = `a${Date.now()}`;
    accountStore.set((a) => ({ ...a, addresses: [...a.addresses, { ...(draft as Address), phone: cleanPhone(draft.phone ?? ''), id, label: 'other' }] }));
    setAdding(false); setDraft({}); setTried(false);
    toast({ tone: 'ok', text: t.addrSaved });
  };
  const set = (k: keyof Address) => (ev: { target: { value: string } }) => setDraft((x) => ({ ...x, [k]: ev.target.value }));

  return (
    <div className="space-y-5">
      {acc.addresses.length === 0 && !adding && <EmptyState as="h2" icon={<MapPin className="size-6" aria-hidden="true" />} title={t.noAddr} />}
      <ul className="grid gap-3 md:grid-cols-2">
        {acc.addresses.map((a) => (
          <li key={a.id} className={cn(PANEL, 'flex flex-col gap-3 p-5')}>
            <p className="flex items-center gap-2 font-semibold">{a.name}{a.id === acc.defaultId && <Badge tone="brand">{t.defaultA}</Badge>}</p>
            <p className="text-sm text-muted"><bdi dir="ltr">+966 {a.phone}</bdi><br />{a.street} {a.building}، {districtLabel(a.city, a.district, lang)}، {l(cityById(a.city)!.name)}{a.nationalCode && <> · <bdi dir="ltr">{a.nationalCode}</bdi></>}</p>
            <div className="mt-auto flex flex-wrap gap-2">
              {a.id !== acc.defaultId && <Button size="sm" variant="secondary" onClick={() => accountStore.set((x) => ({ ...x, defaultId: a.id }))}>{t.makeDefault}</Button>}
              <Button size="sm" variant="ghost" onClick={() => setDel(a)}><Trash2 className="size-4" aria-hidden="true" />{t.del}</Button>
            </div>
          </li>
        ))}
      </ul>
      {!adding ? (
        <Button variant="secondary" onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden="true" />{t.addAddr}</Button>
      ) : (
        <form className={cn(PANEL, 'space-y-5 p-5 sm:p-6')} noValidate onSubmit={(ev) => { ev.preventDefault(); save(); }}>
          <h2 className="text-[15px] font-semibold">{t.addAddr}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="sf-n-name" label={t.name} error={e('name')}>{(p) => <Input {...p} autoComplete="name" className="h-11" value={draft.name ?? ''} onChange={set('name')} />}</Field>
            <Field id="sf-n-phone" label={t.phone} error={e('phone')} hint={t.phoneHint}>{(p) => <Input {...p} type="tel" dir="ltr" inputMode="tel" placeholder="5X XXX XXXX" className="h-11" value={draft.phone ?? ''} onChange={set('phone')} />}</Field>
            <Field id="sf-n-city" label={t.city} error={e('city')}>
              {(p) => <Select {...p} className="h-11" value={draft.city ?? ''} onChange={(ev) => setDraft((x) => ({ ...x, city: (ev.target.value || undefined) as CityId, district: '' }))}>
                <option value="">{t.pickCity}</option>{CITIES.map((c) => <option key={c.id} value={c.id}>{l(c.name)}</option>)}
              </Select>}
            </Field>
            <Field id="sf-n-district" label={t.district} error={e('district')}>
              {(p) => <Select {...p} className="h-11 disabled:opacity-60" disabled={!city} value={draft.district ?? ''} onChange={set('district')}>
                <option value="">{city ? t.pickDistrict : t.cityFirstShort}</option>{city?.districts.map((dd) => <option key={dd.en} value={dd.en}>{l(dd)}</option>)}
              </Select>}
            </Field>
            <Field id="sf-n-street" label={t.street} error={e('street')}>{(p) => <Input {...p} className="h-11" value={draft.street ?? ''} onChange={set('street')} />}</Field>
            <Field id="sf-n-building" label={t.building} error={e('building')}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" className="h-11" value={draft.building ?? ''} onChange={set('building')} />}</Field>
            <Field id="sf-n-nationalCode" label={t.nationalL} optional error={e('nationalCode')} hint={t.nationalHint} className="sm:col-span-2">{(p) => <Input {...p} dir="ltr" maxLength={8} placeholder="RRRD2929" className="h-11" value={draft.nationalCode ?? ''} onChange={(ev) => setDraft((x) => ({ ...x, nationalCode: ev.target.value.toUpperCase() }))} />}</Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">{t.saveAddr}</Button>
            <Button variant="ghost" onClick={() => { setAdding(false); setTried(false); }}>{t.cancel}</Button>
          </div>
        </form>
      )}
      {del && (
        <Modal title={t.delTitle} description={t.delBody} onClose={closeDel} footer={<>
          <Button variant="secondary" onClick={closeDel}>{t.cancel}</Button>
          <Button variant="danger" onClick={() => {
            accountStore.set((x) => {
              const addresses = x.addresses.filter((a) => a.id !== del.id);
              return { ...x, addresses, defaultId: x.defaultId === del.id ? addresses[0]?.id : x.defaultId };
            });
            setDel(null);
          }}>{t.delConfirm}</Button>
        </>}>
          <p className={cn(PANEL, 'p-4 text-sm')}>{del.name}<br /><span className="text-muted">{del.street} {del.building}، {l(cityById(del.city)!.name)}</span></p>
        </Modal>
      )}
    </div>
  );
}

function Wishlist() {
  const { t } = useS();
  const acc = accountStore.use();
  const products = useCatalog().filter((p) => acc.wishlist.includes(p.id));
  return (
    <div className="space-y-5">
      {products.length ? <ProductGrid products={products} /> : <EmptyState as="h2" icon={<Heart className="size-6" aria-hidden="true" />} title={t.wishEmpty} action={<LinkButton href={to('/c/all')}>{t.keepShopping}</LinkButton>} />}
      <SimNote>{t.wishAlerts}</SimNote>
    </div>
  );
}
