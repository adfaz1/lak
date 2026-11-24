import { useCallback, useState } from 'react';
import { Badge, Dialog } from '../../../core/ui';
import type { Route } from '../../../core/router';
import { CITIES, cityById, cleanPhone, validateAddress, type Address, type AddrErr, type CityId } from '../domain';
import { Icon, districtLabel, to, useS } from '../kit';
import { CUSTOMER, accountStore, catalogStore, ordersStore, signIn, signOut, type SavedAddress } from '../state';
import { ProductGrid } from './Listing';
import { fulTone, payTone, shipTone } from './Order';

type Tab = 'orders' | 'addresses' | 'wishlist';
const TABS: Tab[] = ['orders', 'addresses', 'wishlist'];

export default function AccountPage({ route }: { route: Route }) {
  const { t, l } = useS();
  const acc = accountStore.use();
  const q = route.query.get('tab') as Tab | null;
  const tab: Tab = q && TABS.includes(q) ? q : 'orders';

  return (
    <div className="sf-wrap sf-section">
      <header className="sf-list-head">
        <h1 className="sf-h1">{t.accTitle}</h1>
        {acc.signedIn && <p className="sf-muted">{t.signedAs(l(CUSTOMER.name))} · <button type="button" className="sf-link-btn" onClick={signOut}>{t.signOut}</button></p>}
      </header>
      {!acc.signedIn ? (
        <div className="sf-panel sf-narrow">
          <p>{t.accSignIn}</p>
          <p className="small sf-muted">{t.signInNote}</p>
          <button type="button" className="btn primary" onClick={signIn}><Icon name="user" size={18} />{t.signInSim}</button>
          <p className="small sf-muted">{t.trackSub} <a className="sf-link" href={to('/track')}>{t.track}</a></p>
          {acc.wishlist.length > 0 && <p className="small sf-muted">{t.wishlist}: {acc.wishlist.length}</p>}
        </div>
      ) : (
        <>
          <nav className="sf-tabs" aria-label={t.accTitle}>
            {TABS.map((x) => <a key={x} href={to('/account', { tab: x === 'orders' ? undefined : x })} aria-current={tab === x ? 'page' : undefined}>{t.tabs[x]}</a>)}
          </nav>
          {tab === 'orders' && <Orders />}
          {tab === 'addresses' && <Addresses />}
          {tab === 'wishlist' && <Wishlist />}
        </>
      )}
      {!acc.signedIn && tab === 'wishlist' && <Wishlist />}
    </div>
  );
}

function Orders() {
  const { t, d, m } = useS();
  const orders = ordersStore.use().filter((o) => o.customerId === CUSTOMER.id).sort((a, b) => b.at - a.at);
  if (!orders.length) return <div className="sf-empty"><p>{t.ordersEmpty}</p><a className="btn" href={to('/c/all')}>{t.keepShopping}</a></div>;
  return (
    <ul className="sf-order-list">
      {orders.map((o) => (
        <li key={o.ref} className="sf-panel sf-order-row">
          <div className="sf-order-top">
            <p><bdi dir="ltr" className="sf-strong">{o.ref}</bdi> <span className="small sf-muted">· {d(o.at)}</span></p>
            <bdi className="sf-strong">{m(o.totals.total)}</bdi>
          </div>
          <div className="sf-badges">
            <span className="small sf-muted">{t.payment}</span><Badge tone={payTone(o.pay.state)}>{t.payS[o.pay.state]}</Badge>
            <span className="small sf-muted">{t.fulfilment}</span><Badge tone={fulTone(o.ful)}>{t.fulS[o.ful]}</Badge>
            <span className="small sf-muted">{t.shipment}</span><Badge tone={shipTone(o.shipment)}>{t.shipS[o.shipment]}</Badge>
          </div>
          <a className="btn small" href={to(`/track/${o.ref}`)}>{t.view}<span className="sr"> <bdi dir="ltr">{o.ref}</bdi></span></a>
        </li>
      ))}
    </ul>
  );
}

function Addresses() {
  const { t, l, lang } = useS();
  const acc = accountStore.use();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Partial<Address>>({});
  const [tried, setTried] = useState(false);
  const [del, setDel] = useState<SavedAddress | null>(null);
  const closeDel = useCallback(() => setDel(null), []);
  const errs: AddrErr = validateAddress(draft);
  const e = (k: keyof AddrErr) => (tried ? errs[k] : undefined);
  const city = cityById(draft.city);

  const save = () => {
    setTried(true);
    if (Object.keys(errs).length) { document.getElementById(`sf-n-${Object.keys(errs)[0]}`)?.focus(); return; }
    const id = `a${Date.now()}`;
    accountStore.set((a) => ({ ...a, addresses: [...a.addresses, { ...(draft as Address), phone: cleanPhone(draft.phone ?? ''), id, label: 'other' }] }));
    setAdding(false); setDraft({}); setTried(false);
  };

  const input = (k: 'name' | 'phone' | 'street' | 'building' | 'nationalCode', label: string, extra: object = {}) => (
    <div className={`sf-field${e(k) ? ' has-err' : ''}`}>
      <label htmlFor={`sf-n-${k}`}>{label}</label>
      <input id={`sf-n-${k}`} className="input" value={(draft[k] as string) ?? ''} onChange={(ev) => setDraft((x) => ({ ...x, [k]: ev.target.value }))}
        aria-invalid={e(k) ? true : undefined} aria-describedby={e(k) ? `sf-n-${k}-e` : undefined} {...extra} />
      {e(k) && <span className="error" id={`sf-n-${k}-e`}>{e(k) === 'required' ? t.eRequired : k === 'phone' ? t.ePhone : t.eNational}</span>}
    </div>
  );

  return (
    <div className="sf-stack-lg">
      <ul className="sf-addr-list">
        {acc.addresses.map((a) => (
          <li key={a.id} className="sf-panel">
            <p className="sf-strong">{a.name} {a.id === acc.defaultId && <span className="sf-tag">{t.defaultA}</span>}</p>
            <p className="small"><bdi dir="ltr">+966 {a.phone}</bdi></p>
            <p className="small sf-muted">{a.street} {a.building}, {districtLabel(a.city, a.district, lang)}, {l(cityById(a.city)!.name)}{a.nationalCode && <> · <bdi dir="ltr">{a.nationalCode}</bdi></>}</p>
            <div className="sf-row-actions">
              {a.id !== acc.defaultId && <button type="button" className="btn small" onClick={() => accountStore.set((x) => ({ ...x, defaultId: a.id }))}>{t.makeDefault}</button>}
              <button type="button" className="btn small" onClick={() => setDel(a)}><Icon name="trash" size={16} />{t.del}</button>
            </div>
          </li>
        ))}
      </ul>
      {!adding ? (
        <button type="button" className="btn" onClick={() => setAdding(true)}><Icon name="plus" size={18} />{t.addAddr}</button>
      ) : (
        <form className="sf-panel" onSubmit={(ev) => { ev.preventDefault(); save(); }}>
          <h2 className="sf-h3">{t.addAddr}</h2>
          <div className="sf-form-grid">
            {input('name', t.name)}
            {input('phone', t.phone, { type: 'tel', dir: 'ltr', inputMode: 'tel', placeholder: '5X XXX XXXX' })}
            <div className={`sf-field${e('city') ? ' has-err' : ''}`}>
              <label htmlFor="sf-n-city">{t.city}</label>
              <select id="sf-n-city" className="input" value={draft.city ?? ''} onChange={(ev) => setDraft((x) => ({ ...x, city: (ev.target.value || undefined) as CityId, district: '' }))} aria-invalid={e('city') ? true : undefined}>
                <option value="">{t.pickCity}</option>
                {CITIES.map((c) => <option key={c.id} value={c.id}>{l(c.name)}</option>)}
              </select>
              {e('city') && <span className="error">{t.eRequired}</span>}
            </div>
            <div className={`sf-field${e('district') ? ' has-err' : ''}`}>
              <label htmlFor="sf-n-district">{t.district}</label>
              <select id="sf-n-district" className="input" value={draft.district ?? ''} disabled={!city} onChange={(ev) => setDraft((x) => ({ ...x, district: ev.target.value }))} aria-invalid={e('district') ? true : undefined}>
                <option value="">{t.pickDistrict}</option>
                {city?.districts.map((dd) => <option key={dd.en} value={dd.en}>{l(dd)}</option>)}
              </select>
              {e('district') && <span className="error">{t.eRequired}</span>}
            </div>
            {input('street', t.street)}
            {input('building', t.building, { dir: 'ltr', inputMode: 'numeric' })}
            {input('nationalCode', t.national, { dir: 'ltr', maxLength: 8, placeholder: 'RRRD2929' })}
          </div>
          <div className="sf-row-actions">
            <button type="submit" className="btn primary">{t.saveAddr}</button>
            <button type="button" className="btn" onClick={() => { setAdding(false); setTried(false); }}>{t.cancel}</button>
          </div>
        </form>
      )}
      {del && (
        <Dialog title={t.delTitle} onClose={closeDel} footer={<>
          <button type="button" className="btn" onClick={closeDel}>{t.cancel}</button>
          <button type="button" className="btn primary" onClick={() => {
            accountStore.set((x) => {
              const addresses = x.addresses.filter((a) => a.id !== del.id);
              return { ...x, addresses, defaultId: x.defaultId === del.id ? addresses[0]?.id : x.defaultId };
            });
            setDel(null);
          }}>{t.del}</button>
        </>}>
          <p>{del.street} {del.building}, {l(cityById(del.city)!.name)}</p>
          <p className="small sf-muted">{t.delBody}</p>
        </Dialog>
      )}
    </div>
  );
}

function Wishlist() {
  const { t } = useS();
  const acc = accountStore.use();
  const products = catalogStore.use().filter((p) => acc.wishlist.includes(p.id));
  return (
    <div className="sf-stack-lg">
      {products.length ? <ProductGrid products={products} /> : <div className="sf-empty"><p>{t.wishEmpty}</p><a className="btn" href={to('/c/all')}>{t.keepShopping}</a></div>}
      <p className="small sf-muted">{t.wishAlerts}</p>
    </div>
  );
}
