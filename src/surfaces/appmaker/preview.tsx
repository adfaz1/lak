import { useEffect, useState } from 'react';
import { formatMoney } from '../../core/format';
import { useLang } from '../../core/lang';
import type { AppConfig, Section } from './domain';
import { CATALOG, CATEGORIES, ICONS, type CatalogItem } from './fixtures';
import { IconArt, Ico, ProductArt } from './icons';
import type { Strings } from './i18n';

export type Screen = 'home' | 'product' | 'cart' | 'account';
export const SCREENS: Screen[] = ['home', 'product', 'cart', 'account'];
export type OS = 'ios' | 'android';

/** Readable text colour on a background (simple luminance threshold). */
export function onColour(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1f1a17' : '#ffffff';
}

const kindOf = (p: CatalogItem) => (p.id === 'c4' ? 'tool' : p.id === 'c5' ? 'gift' : 'bag');

interface Props {
  config: AppConfig;
  t: Strings;
  screen: Screen;
  onScreen: (s: Screen) => void;
  os: OS;
  /** Change this number to replay the splash screen. */
  splashKey: number;
}

/** Interactive phone preview of the merchant's shopping app. Uses the merchant's colours, never LAK's. */
export function PhonePreview({ config, t, screen, onScreen, os, splashKey }: Props) {
  const { lang, dir } = useLang();
  const [productId, setProductId] = useState(CATALOG[0].id);
  const [cart, setCart] = useState<{ id: string; qty: number }[]>([]);
  const [qty, setQty] = useState(1);
  const [toast, setToast] = useState(false);
  const [splash, setSplash] = useState(false);

  useEffect(() => {
    if (!splashKey) return;
    setSplash(true);
    const id = window.setTimeout(() => setSplash(false), 1400);
    return () => window.clearTimeout(id);
  }, [splashKey]);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(false), 1600); return () => window.clearTimeout(id); }, [toast]);

  const icon = ICONS.find((i) => i.id === config.iconId) ?? ICONS[0];
  const name = config.name[lang] || config.name.ar || config.name.en;
  const accent = config.accent;
  const product = CATALOG.find((p) => p.id === productId) ?? CATALOG[0];
  const count = cart.reduce((n, l) => n + l.qty, 0);
  const money = (v: number) => <span className="am-ph-money"><bdi>{formatMoney(v)}</bdi> {lang === 'ar' ? 'ر.س' : 'SAR'}</span>;
  const open = (id: string) => { setProductId(id); setQty(1); onScreen('product'); };

  const tile = (p: CatalogItem, list = false) => (
    <button key={p.id} type="button" className={`am-ph-tile${list ? ' list' : ''}`} onClick={() => open(p.id)}>
      <span className="am-ph-art"><ProductArt tone={p.tone} kind={kindOf(p)} /></span>
      <span className="am-ph-tile-text"><span className="am-ph-name">{p.name[lang]}</span>{money(p.price)}</span>
    </button>
  );

  const section = (s: Section) => {
    const title = s.title[lang];
    switch (s.type) {
      case 'hero':
        return (
          <div key={s.id} className="am-ph-hero" style={{ background: accent, color: onColour(accent) }}>
            <div className="am-ph-hero-art" aria-hidden="true"><ProductArt tone="#c9a27a" /></div>
            <strong>{title}</strong>
            <button type="button" className="am-ph-cta" style={{ color: accent }} onClick={() => open(CATALOG[0].id)}>{t.shopNow}</button>
          </div>
        );
      case 'categories':
        return (
          <div key={s.id} className="am-ph-sec">
            <h4>{title}</h4>
            <div className="am-ph-cats">{CATEGORIES.map((c) => <span key={c.en} className="am-ph-cat" style={{ borderColor: accent }}>{c[lang]}</span>)}</div>
          </div>
        );
      case 'featured':
        return (
          <div key={s.id} className="am-ph-sec">
            <h4>{title}</h4>
            <div className={config.productLayout === 'grid' ? 'am-ph-grid' : 'am-ph-list'}>
              {CATALOG.slice(0, 4).map((p) => tile(p, config.productLayout === 'list'))}
            </div>
          </div>
        );
      case 'banner':
        return <div key={s.id} className="am-ph-banner" style={{ borderColor: accent, color: accent }}>{title}</div>;
      case 'newArrivals':
        return (
          <div key={s.id} className="am-ph-sec">
            <h4>{title}</h4>
            <div className="am-ph-strip">{CATALOG.slice(2).map((p) => tile(p))}</div>
          </div>
        );
      case 'bestSellers':
        return (
          <div key={s.id} className="am-ph-sec">
            <h4>{title}</h4>
            <div className="am-ph-list">{[CATALOG[1], CATALOG[5], CATALOG[0]].map((p) => tile(p, true))}</div>
          </div>
        );
    }
  };

  const subtotal = cart.reduce((sum, l) => sum + (CATALOG.find((p) => p.id === l.id)?.price ?? 0) * l.qty, 0);

  return (
    <div className={`am-phone ${os}`} data-os={os}>
      <div className="am-phone-screen" dir={dir} lang={lang} style={{ ['--app' as string]: accent }}>
        <div className="am-ph-status" dir="ltr" aria-hidden="true">
          <span>9:41</span>
          {os === 'ios' ? <span className="am-ph-island" /> : <span className="am-ph-punch" />}
          <span className="am-ph-sys"><i /><i /><i /><b /></span>
        </div>
        {splash ? (
          <div className="am-ph-splash" style={{ background: config.splash, color: onColour(config.splash) }}>
            <IconArt tile={icon} letter={name.slice(0, 1)} size={84} />
            <strong>{name}</strong>
          </div>
        ) : (
          <>
            <div className="am-ph-appbar">
              {screen === 'product'
                ? <button type="button" className="am-ph-iconbtn" onClick={() => onScreen('home')} aria-label={t.back}><span className="am-flip"><Ico.chevron /></span></button>
                : <IconArt tile={icon} letter={name.slice(0, 1)} size={28} />}
              <strong className="am-ph-title">{screen === 'cart' ? t.screens.cart : screen === 'account' ? t.account : name}</strong>
              <span className="am-ph-iconbox" aria-hidden="true"><Ico.search /></span>
            </div>
            <div className="am-ph-body">
              {screen === 'home' && (config.sections.length ? config.sections.map(section) : <p className="am-ph-empty">{t.noSections}</p>)}
              {screen === 'product' && (
                <div className="am-ph-product">
                  <div className="am-ph-hero-img"><ProductArt tone={product.tone} kind={kindOf(product)} /></div>
                  <div className="am-ph-pad">
                    <span className="am-ph-muted">{product.cat[lang]}</span>
                    <div className="am-ph-row"><h4>{product.name[lang]}</h4>{config.features.wishlist && <span className="am-ph-iconbox" aria-label={t.wishlist} role="img"><Ico.heart /></span>}</div>
                    <div className="am-ph-price">{money(product.price)} <span className="am-ph-muted">{t.vatIncl}</span></div>
                    <p className="am-ph-muted">{product.desc[lang]}</p>
                    <div className="am-ph-row">
                      <div className="am-ph-qty" role="group" aria-label={t.qty}>
                        <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label={t.less}>−</button>
                        <output aria-live="polite">{qty}</output>
                        <button type="button" onClick={() => setQty((q) => Math.min(9, q + 1))} aria-label={t.more}>+</button>
                      </div>
                      <button type="button" className="am-ph-primary" onClick={() => {
                        setCart((c) => c.some((l) => l.id === product.id) ? c.map((l) => l.id === product.id ? { ...l, qty: l.qty + qty } : l) : [...c, { id: product.id, qty }]);
                        setToast(true);
                      }}>{t.addToCart}</button>
                    </div>
                    {config.features.reviews && <div className="am-ph-reviews"><strong>{t.reviewsTitle}</strong><span className="am-ph-muted">{t.reviewsNone}</span></div>}
                  </div>
                </div>
              )}
              {screen === 'cart' && (
                <div className="am-ph-pad">
                  {cart.length === 0 ? <p className="am-ph-empty">{t.cartEmpty}</p> : (
                    <>
                      <ul className="am-ph-cart">
                        {cart.map((l) => {
                          const p = CATALOG.find((x) => x.id === l.id)!;
                          return (
                            <li key={l.id}>
                              <span className="am-ph-thumb"><ProductArt tone={p.tone} kind={kindOf(p)} /></span>
                              <span className="am-ph-grow"><span className="am-ph-name">{p.name[lang]}</span><span className="am-ph-muted">{t.qty}: {l.qty}</span></span>
                              {money(p.price * l.qty)}
                            </li>
                          );
                        })}
                      </ul>
                      <div className="am-ph-row am-ph-total"><span>{t.subtotal}</span>{money(subtotal)}</div>
                      <button type="button" className="am-ph-primary wide" disabled aria-describedby="am-ph-co">{t.checkout}</button>
                      <span id="am-ph-co" className="am-ph-muted">{t.checkoutPreview}</span>
                    </>
                  )}
                </div>
              )}
              {screen === 'account' && (
                <div className="am-ph-pad">
                  <div className="am-ph-row am-ph-acc"><span className="am-ph-avatar" aria-hidden="true"><Ico.user /></span><strong>{t.accSample}</strong></div>
                  <ul className="am-ph-menu" aria-describedby="am-ph-acc-note">
                    <li>{t.accOrders}</li>
                    {config.features.wishlist && <li>{t.accWishlist}</li>}
                    {config.features.loyalty && <li>{t.accPoints}</li>}
                    {config.features.push && <li>{t.accNotif}</li>}
                    {config.features.accountDeletion && <li className="am-ph-danger">{t.accDelete}</li>}
                  </ul>
                  <span id="am-ph-acc-note" className="am-ph-muted">{t.previewOnly}</span>
                </div>
              )}
            </div>
            {toast && <div className="am-ph-toast" role="status">{t.added1}</div>}
            <nav className="am-ph-tabbar" aria-label={t.screenLabel}>
              {([['home', Ico.home, t.screens.home], ['cart', Ico.bag, t.screens.cart], ['account', Ico.user, t.screens.account]] as const).map(([id, I, label]) => (
                <button key={id} type="button" aria-current={screen === id || (id === 'home' && screen === 'product') ? 'page' : undefined} onClick={() => onScreen(id)}>
                  <span className="am-ph-tabicon"><I />{id === 'cart' && count > 0 && <b className="am-ph-badge">{count}</b>}</span>
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </>
        )}
        {os === 'ios' ? <span className="am-ph-home" aria-hidden="true" /> : <span className="am-ph-navbar" aria-hidden="true"><i /><i /><i /></span>}
      </div>
    </div>
  );
}
