import { CATEGORIES, listProducts, productById } from '../domain';
import { Icon, ProductArt, to, useS } from '../kit';
import { catalogStore } from '../state';
import { ProductGrid } from './Listing';

export default function Home() {
  const { t, l } = useS();
  const products = catalogStore.use();
  const featured = listProducts(products, { sort: 'featured', sizes: [], colors: [], inStockOnly: true }).slice(0, 4);
  const heroA = productById(products, 'linen-abaya')!;
  const heroB = productById(products, 'night-oud')!;
  const perks = [
    { icon: 'truck', h: t.vDelivery, d: t.vDeliveryD },
    { icon: 'return', h: t.vReturns, d: t.vReturnsD },
    { icon: 'card', h: t.vPay, d: t.vPayD },
    { icon: 'receipt', h: t.vVat, d: t.vVatD },
  ];
  return (
    <>
      <section className="sf-hero">
        <div className="sf-wrap sf-hero-grid">
          <div className="sf-hero-copy">
            <p className="sf-eyebrow">{t.heroEyebrow}</p>
            <h1 className="sf-display">{t.heroTitle}</h1>
            <p className="sf-lead">{t.heroSub}</p>
            <div className="sf-hero-actions">
              <a className="btn primary sf-btn-lg" href={to('/c/abayas')}>{t.heroCta}</a>
              <a className="btn sf-btn-lg sf-btn-ghost" href={to('/c/perfume')}>{t.heroCta2}</a>
            </div>
            <div className="sf-offer-card">
              <Icon name="tag" />
              <div>
                <p className="sf-strong">{t.offerTitle}</p>
                <p>{t.offerBody} <code className="sf-code"><bdi dir="ltr">WELCOME10</bdi></code></p>
                <p className="small sf-muted">{t.offerTerms}</p>
              </div>
            </div>
          </div>
          <div className="sf-hero-art">
            <a className="sf-hero-a" href={to(`/p/${heroA.id}`)} aria-label={l(heroA.name)}><ProductArt p={heroA} color="sand" /></a>
            <a className="sf-hero-b" href={to(`/p/${heroB.id}`)} aria-label={l(heroB.name)}><ProductArt p={heroB} /></a>
          </div>
        </div>
      </section>

      <section className="sf-wrap sf-section" aria-labelledby="sf-cats-h">
        <div className="sf-sec-head"><h2 id="sf-cats-h" className="sf-h2">{t.shopBy}</h2><a className="sf-link" href={to('/c/all')}>{t.viewAll}</a></div>
        <ul className="sf-cat-grid">
          {CATEGORIES.map((c) => {
            const p = products.find((x) => x.cat === c.id)!;
            const n = products.filter((x) => x.cat === c.id).length;
            return (
              <li key={c.id}>
                <a className="sf-cat-card" href={to(`/c/${c.id}`)}>
                  <ProductArt p={p} color={p.colors.includes(c.tone) ? c.tone : undefined} />
                  <span className="sf-cat-name">{l(c.name)}</span>
                  <span className="sf-cat-n small">{t.resultN(String(n))}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="sf-wrap sf-section" aria-labelledby="sf-feat-h">
        <div className="sf-sec-head"><h2 id="sf-feat-h" className="sf-h2">{t.featured}</h2><a className="sf-link" href={to('/c/all')}>{t.viewAll}</a></div>
        <ProductGrid products={featured} />
      </section>

      <section className="sf-wrap sf-section" aria-labelledby="sf-before-h">
        <h2 id="sf-before-h" className="sf-h2">{t.beforeBuy}</h2>
        <ul className="sf-perks">
          {perks.map((p) => (
            <li key={p.h}><Icon name={p.icon} size={26} /><div><p className="sf-strong">{p.h}</p><p className="small sf-muted">{p.d}</p></div></li>
          ))}
        </ul>
        <ul className="sf-policy-links">
          <li><a href={to('/page/shipping')}>{t.pShipping}<Icon name="chev" size={16} flip /></a></li>
          <li><a href={to('/page/returns')}>{t.pReturns}<Icon name="chev" size={16} flip /></a></li>
          <li><a href={to('/page/privacy')}>{t.pPrivacy}<Icon name="chev" size={16} flip /></a></li>
          <li><a href={to('/page/terms')}>{t.pTerms}<Icon name="chev" size={16} flip /></a></li>
        </ul>
      </section>

      <section className="sf-wrap sf-section sf-about" aria-labelledby="sf-about-h">
        <h2 id="sf-about-h" className="sf-h2">{t.about}</h2>
        <p className="sf-lead">{t.aboutBody}</p>
        <p className="small sf-muted"><span className="sim">{t.sample}</span></p>
      </section>
    </>
  );
}
