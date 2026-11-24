// Interactive phone preview of the merchant's shopping app. It renders in the merchant's colours (the store
// theme palette), never LAK's, and reads the store's own catalogue and licensed photos. It is a web preview:
// it does not prove how the native iOS or Android app will behave.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Award, BatteryFull, Bell, ChevronLeft, ChevronRight, Heart, Home, ImageOff, Minus, Package, Plus, Search, ShoppingBag, Signal, Star, Trash2, User, Wifi,
} from 'lucide-react';
import { useLang, type L } from '../../../core/lang';
import { Money, cn, useTx } from '../../../ds/ui';
import { STORE_PALETTE as P } from '../storefront/model';
import { ICONS, type IconTile } from '../../appmaker/fixtures';
import type { AppConfig, Section } from '../../appmaker/domain';
import {
  addToCart, appCategories, cartCount, cartTotal, monogram, onColour, searchCatalog, sectionProducts,
  type AppProduct, type CartLine, type OS, type Screen,
} from './model';

/** Generated app-icon tile in merchant colours. Illustrative; the real 1024 px icon is produced at build. */
export function IconArt({ tile, letter, size = 56, className }: { tile: IconTile; letter: string; size?: number; className?: string }) {
  const { bg, fg, mark } = tile;
  const text = (y: number, fs: number) => <text x="32" y={y} textAnchor="middle" fontSize={fs} fontWeight="700" fill={fg} fontFamily="'IBM Plex Sans Arabic', system-ui, sans-serif">{letter}</text>;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={cn('shrink-0', className)}>
      <rect width="64" height="64" rx="14" fill={bg} />
      {bg.toLowerCase() === '#fffdf9' || bg.toLowerCase() === '#f6efe4' ? <rect x=".5" y=".5" width="63" height="63" rx="13.5" fill="none" stroke="#e6dfd5" /> : null}
      {mark === 'letter' && text(43, 30)}
      {mark === 'letterOutline' && <><circle cx="32" cy="32" r="20" fill="none" stroke={fg} strokeWidth="2.5" />{text(41, 22)}</>}
      {mark === 'ring' && <><circle cx="32" cy="32" r="17" fill="none" stroke={fg} strokeWidth="5" /><circle cx="32" cy="32" r="6" fill={fg} /></>}
      {mark === 'arch' && <><path d="M18 50V30a14 14 0 0128 0v20" fill="none" stroke={fg} strokeWidth="4" />{text(46, 18)}</>}
      {mark === 'stripe' && <><rect x="0" y="40" width="64" height="8" fill={fg} opacity=".9" />{text(34, 24)}</>}
      {mark === 'dot' && <>{text(42, 28)}<circle cx="46" cy="18" r="5" fill="#84603d" /></>}
    </svg>
  );
}

function Photo({ p, className, large }: { p: AppProduct; className?: string; large?: boolean }) {
  const [broken, setBroken] = useState(false);
  const src = p.photo && large ? p.photo.replace('/thumb/', '/') : p.photo;
  if (!src || broken) return <span className={cn('grid place-items-center', className)} style={{ background: P.tile, color: P.muted }} role="img" aria-label={p.name.en}><ImageOff className="size-6" aria-hidden="true" /></span>;
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className={cn('object-cover', className)} style={{ background: P.tile }} />;
}

interface Props {
  config: AppConfig;
  catalog: AppProduct[];
  screen: Screen;
  os: OS;
  productId?: string;
  onNav?: (screen: Screen, productId?: string) => void;
  /** Static render (screenshots, before/after). */
  still?: boolean;
  /** Change to replay the splash screen. */
  splashKey?: number;
  label?: string;
  className?: string;
  /** Grow the screen to its content (static before/after views). */
  tall?: boolean;
}

export function Phone({ config, catalog, screen, os, productId, onNav, still, splashKey = 0, label, className, tall }: Props) {
  const tx = useTx();
  const { lang } = useLang();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [qty, setQty] = useState(1);
  const [toast, setToast] = useState(false);
  const [splash, setSplash] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [wish, setWish] = useState<string[]>([]);
  useEffect(() => {
    if (!splashKey) return;
    setSplash(true);
    const id = window.setTimeout(() => setSplash(false), 1500);
    return () => window.clearTimeout(id);
  }, [splashKey]);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(false), 1600); return () => window.clearTimeout(id); }, [toast]);
  useEffect(() => { setQty(1); }, [productId]);

  const nav = (s: Screen, id?: string) => { if (!still) onNav?.(s, id); };
  const icon = ICONS.find((i) => i.id === config.iconId) ?? ICONS[0];
  const name = config.name[lang].trim() || config.name.ar || config.name.en;
  const letter = monogram(config.name, lang);
  const accent = config.accent;
  const onAccent = onColour(accent);
  const product = catalog.find((p) => p.id === productId) ?? catalog[0];
  const count = cartCount(cart);
  const ios = os === 'ios';
  const Back = lang === 'ar' ? ChevronRight : ChevronLeft;
  const Fwd = lang === 'ar' ? ChevronLeft : ChevronRight;
  const ink: CSSProperties = { color: P.ink };
  const muted: CSSProperties = { color: P.muted };

  const price = (p: AppProduct) => (
    <span className="flex flex-wrap items-baseline gap-x-1.5 text-[12px] font-semibold" style={ink}>
      <Money v={p.price} />
      {p.compareAt && p.compareAt > p.price && <s className="text-[10px] font-normal" style={muted}><Money v={p.compareAt} /></s>}
    </span>
  );
  const tile = (p: AppProduct, list = false) => (
    <button key={p.id} type="button" tabIndex={still ? -1 : undefined} onClick={() => nav('product', p.id)} className={cn('min-w-0 text-start', list ? 'flex items-center gap-2.5' : 'block')}>
      <span className={cn('relative block overflow-hidden rounded-xl', list ? 'size-14 shrink-0' : 'aspect-square w-full')}>
        <Photo p={p} className="size-full" />
        {p.soldOut && <span className="absolute start-1.5 top-1.5 rounded-full bg-white/90 px-1.5 text-[9px] font-semibold" style={ink}>{tx('نفد', 'Sold out')}</span>}
      </span>
      <span className={cn('block min-w-0', !list && 'mt-1.5')}>
        <span className="block truncate text-[11px]" style={ink}>{p.name[lang]}</span>
        {price(p)}
      </span>
    </button>
  );

  const section = (s: Section) => {
    const title = s.title[lang] || s.title.ar;
    const head = <p className="mb-2 text-[13px] font-bold" style={ink} dir="auto">{title}</p>;
    const items = sectionProducts(s.type, catalog);
    switch (s.type) {
      case 'hero': {
        const lead = catalog.find((p) => p.photo) ?? catalog[0];
        return (
          <div key={s.id} className="relative mx-3 overflow-hidden rounded-2xl" style={{ background: P.tile }}>
            {lead ? <Photo p={lead} large className="h-40 w-full" /> : <span className="block h-40" />}
            <div className="absolute inset-x-0 bottom-0 p-3" style={{ background: 'linear-gradient(transparent, rgb(30 27 24 / .78))' }}>
              <p className="text-[15px] font-bold leading-snug text-white" dir="auto">{title}</p>
              <button type="button" tabIndex={still ? -1 : undefined} onClick={() => nav('search')} className="mt-2 rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: accent, color: onAccent }}>{tx('تسوّق الآن', 'Shop now')}</button>
            </div>
          </div>
        );
      }
      case 'categories':
        return (
          <div key={s.id} className="px-3">{head}
            <div className="flex flex-wrap gap-1.5">
              {appCategories(catalog).map((c) => <button key={c.en} type="button" tabIndex={still ? -1 : undefined} onClick={() => { setCat(c.en); nav('search'); }} className="rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: P.line, background: P.sand, color: P.ink }}>{c[lang]}</button>)}
            </div>
          </div>
        );
      case 'featured':
        return <div key={s.id} className="px-3">{head}<div className={config.productLayout === 'grid' ? 'grid grid-cols-2 gap-2.5' : 'space-y-2.5'}>{items.map((p) => tile(p, config.productLayout === 'list'))}</div></div>;
      case 'banner':
        return <div key={s.id} className="mx-3 rounded-xl px-3 py-2.5 text-center text-[12px] font-bold" style={{ background: `${accent}1a`, color: accent, boxShadow: `inset 0 0 0 1px ${accent}55` }} dir="auto">{title}</div>;
      case 'newArrivals':
        return <div key={s.id}><div className="px-3">{head}</div><div className="flex gap-2.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">{items.map((p) => <div key={p.id} className="w-24 shrink-0">{tile(p)}</div>)}</div></div>;
      case 'bestSellers':
        return <div key={s.id} className="px-3">{head}<ol className="space-y-2">{items.map((p, i) => <li key={p.id} className="flex items-center gap-2"><span className="w-3 text-[11px] font-bold" style={muted}>{i + 1}</span><div className="min-w-0 flex-1">{tile(p, true)}</div></li>)}</ol></div>;
    }
  };

  const tabs: [Screen, typeof Home, string][] = [['home', Home, tx('الرئيسية', 'Home')], ['search', Search, tx('بحث', 'Search')], ['cart', ShoppingBag, tx('السلة', 'Cart')], ['account', User, tx('حسابي', 'Account')]];
  const results = searchCatalog(catalog, q, cat);
  const title = screen === 'cart' ? tx('السلة', 'Cart') : screen === 'account' ? tx('حسابي', 'Account') : screen === 'search' ? tx('بحث', 'Search') : name;

  return (
    <figure className={cn('relative mx-auto w-[292px] shrink-0 select-none', className)} aria-label={label ?? tx('معاينة التطبيق', 'App preview')} {...(still ? ({ inert: '' } as object) : {})}>
      {/* Device: bezel, side keys, screen */}
      <div className={cn('relative rounded-[46px] bg-[#111114] p-[9px] shadow-pop ring-1 ring-black/40 dark:ring-white/15', !ios && 'rounded-[38px]')}>
        <span className="absolute -start-[3px] top-28 h-12 w-[3px] rounded-s bg-[#2a2a30]" aria-hidden="true" />
        <span className="absolute -start-[3px] top-44 h-12 w-[3px] rounded-s bg-[#2a2a30]" aria-hidden="true" />
        <span className="absolute -end-[3px] top-36 h-16 w-[3px] rounded-e bg-[#2a2a30]" aria-hidden="true" />
        <div className={cn('relative flex flex-col overflow-hidden', tall ? 'min-h-[590px]' : 'h-[590px]', ios ? 'rounded-[38px]' : 'rounded-[30px]')} style={{ background: P.paper }} lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <div className="relative flex h-9 shrink-0 items-center justify-between px-6 text-[12px] font-semibold" style={ink} dir="ltr" aria-hidden="true">
            <span>9:41</span>
            {ios ? <span className="absolute start-1/2 top-2 h-[22px] w-[84px] -translate-x-1/2 rounded-full bg-black" /> : <span className="absolute start-1/2 top-2.5 size-3 -translate-x-1/2 rounded-full bg-black" />}
            <span className="flex items-center gap-1"><Signal className="size-3.5" /><Wifi className="size-3.5" /><BatteryFull className="size-4" /></span>
          </div>

          {splash ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3" style={{ background: config.splash, color: onColour(config.splash) }}>
              <IconArt tile={icon} letter={letter} size={84} />
              <strong className="text-lg">{name}</strong>
            </div>
          ) : (
            <>
              <div className={cn('flex h-11 shrink-0 items-center gap-2 px-3', ios ? 'justify-between' : '')}>
                {screen === 'product'
                  ? <button type="button" tabIndex={still ? -1 : undefined} onClick={() => nav('home')} aria-label={tx('رجوع', 'Back')} className="grid size-8 place-items-center rounded-full" style={ink}><Back className="size-5" aria-hidden="true" /></button>
                  : <IconArt tile={icon} letter={letter} size={28} />}
                <strong className={cn('min-w-0 truncate text-[15px]', ios ? 'flex-1 text-center' : 'flex-1')} style={ink}>{title}</strong>
                {screen === 'product' && config.features.wishlist
                  ? <button type="button" tabIndex={still ? -1 : undefined} aria-pressed={wish.includes(product?.id ?? '')} aria-label={tx('المفضلة', 'Wishlist')} onClick={() => product && setWish((w) => w.includes(product.id) ? w.filter((x) => x !== product.id) : [...w, product.id])} className="grid size-8 place-items-center" style={{ color: accent }}><Heart className="size-5" fill={product && wish.includes(product.id) ? accent : 'none'} aria-hidden="true" /></button>
                  : <span className="grid size-8 place-items-center" style={ink} aria-hidden="true">{config.features.push ? <Bell className="size-[18px]" /> : null}</span>}
              </div>

              <div className={cn('relative flex-1 pb-3 [scrollbar-width:none]', !tall && 'overflow-y-auto')}>
                {catalog.length === 0 ? (
                  <p className="px-6 pt-16 text-center text-[12px]" style={muted}>{tx('لا منتجات ظاهرة في التطبيق. فعّل قناة التطبيق لمنتجاتك النشطة.', 'No products are shown in the app. Turn on the app channel for active products.')}</p>
                ) : screen === 'home' ? (
                  config.sections.length ? <div className="space-y-4 pt-1">{config.sections.map(section)}</div> : <p className="px-6 pt-16 text-center text-[12px]" style={muted}>{tx('لا أقسام في الرئيسية بعد.', 'No home sections yet.')}</p>
                ) : screen === 'search' ? (
                  <div className="space-y-3 px-3 pt-1">
                    <label className="flex h-9 items-center gap-2 rounded-full px-3" style={{ background: P.tile, color: P.muted }}>
                      <Search className="size-4 shrink-0" aria-hidden="true" />
                      <input value={q} onChange={(e) => setQ(e.target.value)} tabIndex={still ? -1 : undefined} placeholder={tx('ابحث في المتجر', 'Search the store')} aria-label={tx('ابحث في المتجر', 'Search the store')} className="h-full min-w-0 flex-1 bg-transparent text-[12px] outline-none" style={ink} />
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[{ en: '', ar: '' } as L, ...appCategories(catalog)].map((c) => (
                        <button key={c.en || 'all'} type="button" tabIndex={still ? -1 : undefined} aria-pressed={cat === c.en} onClick={() => setCat(c.en)} className="rounded-full border px-2.5 py-1 text-[11px]"
                          style={cat === c.en ? { background: accent, color: onAccent, borderColor: accent } : { borderColor: P.line, color: P.ink }}>{c.en ? c[lang] : tx('الكل', 'All')}</button>
                      ))}
                    </div>
                    {results.length ? <div className="grid grid-cols-2 gap-2.5">{results.map((p) => tile(p))}</div> : <p className="pt-8 text-center text-[12px]" style={muted}>{tx('لا نتائج مطابقة.', 'No matching products.')}</p>}
                  </div>
                ) : screen === 'product' && product ? (
                  <div>
                    <Photo p={product} large className="aspect-square w-full" />
                    <div className="space-y-2 px-4 pt-3">
                      <p className="text-[11px]" style={muted}>{product.category[lang]}</p>
                      <p className="text-[16px] font-bold leading-snug" style={ink}>{product.name[lang]}</p>
                      <div className="flex items-center gap-2">{price(product)}<span className="text-[10px]" style={muted}>{tx('شامل الضريبة', 'VAT incl.')}</span></div>
                      <div className="flex items-center gap-2 pt-1">
                        <div className="flex h-9 items-center rounded-full border" style={{ borderColor: P.line, color: P.ink }} role="group" aria-label={tx('الكمية', 'Quantity')}>
                          <button type="button" tabIndex={still ? -1 : undefined} onClick={() => setQty((v) => Math.max(1, v - 1))} aria-label={tx('قلّل الكمية', 'Less')} className="grid size-9 place-items-center"><Minus className="size-3.5" aria-hidden="true" /></button>
                          <output className="w-5 text-center text-[12px] font-semibold" aria-live="polite">{qty}</output>
                          <button type="button" tabIndex={still ? -1 : undefined} onClick={() => setQty((v) => Math.min(9, v + 1))} aria-label={tx('زِد الكمية', 'More')} className="grid size-9 place-items-center"><Plus className="size-3.5" aria-hidden="true" /></button>
                        </div>
                        <button type="button" tabIndex={still ? -1 : undefined} disabled={product.soldOut} onClick={() => { setCart((c) => addToCart(c, product.id, qty)); setToast(true); }}
                          className="h-9 flex-1 rounded-full text-[12px] font-semibold disabled:opacity-50" style={{ background: accent, color: onAccent }}>{product.soldOut ? tx('نفدت الكمية', 'Sold out') : tx('أضف إلى السلة', 'Add to cart')}</button>
                      </div>
                      {config.features.reviews && (
                        <div className="mt-2 rounded-xl p-3" style={{ background: P.sand }}>
                          <p className="flex items-center gap-1 text-[12px] font-bold" style={ink}><Star className="size-3.5" aria-hidden="true" />{tx('التقييمات', 'Reviews')}</p>
                          <p className="mt-0.5 text-[11px]" style={muted}>{tx('لا تقييمات بعد. اكتب أول تقييم بعد الاستلام.', 'No reviews yet. Review after delivery.')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : screen === 'cart' ? (
                  <div className="px-3 pt-1">
                    {cart.length === 0 ? (
                      <div className="pt-14 text-center"><ShoppingBag className="mx-auto size-8" style={muted} aria-hidden="true" /><p className="mt-2 text-[12px]" style={muted}>{tx('السلة فارغة.', 'Your cart is empty.')}</p>
                        <button type="button" tabIndex={still ? -1 : undefined} onClick={() => nav('home')} className="mt-3 rounded-full px-3 py-1.5 text-[11px] font-semibold" style={{ background: accent, color: onAccent }}>{tx('تسوّق الآن', 'Start shopping')}</button></div>
                    ) : (
                      <>
                        <ul className="divide-y" style={{ borderColor: P.line }}>
                          {cart.map((l) => { const p = catalog.find((x) => x.id === l.id); if (!p) return null; return (
                            <li key={l.id} className="flex items-center gap-2.5 py-2.5" style={{ borderColor: P.line }}>
                              <Photo p={p} className="size-12 shrink-0 rounded-lg" />
                              <span className="min-w-0 flex-1"><span className="block truncate text-[12px]" style={ink}>{p.name[lang]}</span><span className="text-[11px]" style={muted}>{tx(`الكمية ${l.qty}`, `Qty ${l.qty}`)}</span></span>
                              <span className="text-[12px] font-semibold" style={ink}><Money v={p.price * l.qty} /></span>
                              <button type="button" tabIndex={still ? -1 : undefined} aria-label={tx('احذف', 'Remove')} onClick={() => setCart((c) => c.filter((x) => x.id !== l.id))} className="grid size-7 place-items-center" style={muted}><Trash2 className="size-3.5" aria-hidden="true" /></button>
                            </li>
                          ); })}
                        </ul>
                        <div className="mt-2 flex items-center justify-between border-t pt-3 text-[13px] font-bold" style={{ ...ink, borderColor: P.line }}><span>{tx('المجموع', 'Subtotal')}</span><Money v={cartTotal(cart, catalog)} /></div>
                        <button type="button" disabled className="mt-3 h-10 w-full rounded-full text-[12px] font-semibold opacity-50" style={{ background: accent, color: onAccent }}>{tx('إتمام الطلب', 'Checkout')}</button>
                        <p className="mt-1.5 text-center text-[10px]" style={muted}>{tx('الدفع غير متاح في المعاينة', 'Checkout is not available in the preview')}</p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="px-3 pt-1">
                    <div className="flex items-center gap-2.5 rounded-xl p-3" style={{ background: P.sand }}>
                      <span className="grid size-10 place-items-center rounded-full" style={{ background: accent, color: onAccent }} aria-hidden="true"><User className="size-5" /></span>
                      <span className="text-[13px] font-bold" style={ink}>{tx('عميل تجريبي', 'Sample customer')}</span>
                    </div>
                    <ul className="mt-3 divide-y rounded-xl border" style={{ borderColor: P.line }}>
                      {([
                        [true, Package, tx('طلباتي', 'My orders')],
                        [config.features.wishlist, Heart, tx('المفضلة', 'Wishlist')],
                        [config.features.loyalty, Award, tx('نقاطي', 'My points')],
                        [config.features.push, Bell, tx('الإشعارات', 'Notifications')],
                        [config.features.accountDeletion, Trash2, tx('حذف الحساب', 'Delete account')],
                      ] as [boolean, typeof Home, string][]).filter(([on]) => on).map(([, I, t]) => (
                        <li key={t} className="flex items-center gap-2.5 px-3 py-2.5 text-[12px]" style={{ ...ink, borderColor: P.line }}><I className="size-4" style={muted} aria-hidden="true" /><span className="flex-1">{t}</span><Fwd className="size-4" style={muted} aria-hidden="true" /></li>
                      ))}
                    </ul>
                    <p className="mt-2 text-center text-[10px]" style={muted}>{tx('عناصر الحساب للعرض في المعاينة', 'Account items are display-only in the preview')}</p>
                  </div>
                )}
              </div>
              {toast && <div role="status" className="absolute inset-x-6 bottom-24 rounded-full px-3 py-2 text-center text-[12px] font-semibold text-white shadow-pop" style={{ background: P.ink }}>{tx('أضيف إلى السلة', 'Added to cart')}</div>}

              <nav aria-label={tx('تنقل التطبيق', 'App navigation')} className="grid shrink-0 grid-cols-4 border-t pt-1.5 pb-1" style={{ borderColor: P.line, background: P.paper }}>
                {tabs.map(([id, I, t]) => {
                  const on = screen === id || (id === 'home' && screen === 'product');
                  return (
                    <button key={id} type="button" tabIndex={still ? -1 : undefined} aria-current={on ? 'page' : undefined} onClick={() => nav(id)} className="flex flex-col items-center gap-0.5 text-[10px]" style={{ color: on ? accent : P.muted }}>
                      <span className={cn('relative grid place-items-center', ios ? 'h-6' : 'h-7 w-12 rounded-full')} style={!ios && on ? { background: `${accent}22` } : undefined}>
                        <I className="size-[18px]" aria-hidden="true" />
                        {id === 'cart' && count > 0 && <b className="absolute -end-2 -top-1 grid min-w-4 place-items-center rounded-full px-1 text-[9px] text-white" style={{ background: P.sale }}>{count}</b>}
                      </span>
                      <span className={cn(on && 'font-semibold')}>{t}</span>
                    </button>
                  );
                })}
              </nav>
            </>
          )}
          {ios ? <span className="mx-auto mb-1.5 mt-1 block h-1 w-28 shrink-0 rounded-full" style={{ background: P.ink }} aria-hidden="true" />
            : <span className="flex h-6 shrink-0 items-center justify-center gap-12" style={{ color: P.muted }} aria-hidden="true"><span className="size-2.5 rotate-45 border-b-2 border-s-2" style={{ borderColor: 'currentcolor' }} /><span className="size-3 rounded-full border-2" style={{ borderColor: 'currentcolor' }} /><span className="size-2.5 border-2" style={{ borderColor: 'currentcolor' }} /></span>}
        </div>
      </div>
    </figure>
  );
}

/** A phone shrunk for thumbnails (store screenshots, before/after). Static; `tall` shows the whole home screen without scrolling. */
export function MiniPhone({ scale = 0.5, ...p }: Props & { scale?: number }) {
  return (
    <div role="img" aria-label={p.label} className="shrink-0">
      <div style={{ zoom: scale }} aria-hidden="true"><Phone {...p} still /></div>
    </div>
  );
}

export function PhoneNote({ children }: { children: ReactNode }) {
  return <p className="mx-auto max-w-[292px] text-center text-xs text-muted">{children}</p>;
}
