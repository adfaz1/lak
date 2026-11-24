// A sketch of the shopper homepage in the store's own identity (colour scale, typeface, button shape, header layout,
// logo, announcement bar) and the given sections. Used for the draft, the live version and the side-by-side compare.
import type { CSSProperties, ReactNode } from 'react';
import { Menu, Play, Quote, Search, ShoppingBag, Star } from 'lucide-react';
import type { Section, StoreIdentity } from '../../merchant/workspace';
import { collectionsStore, levelsStore, productsStore, reviewSettingsStore, reviewsStore } from '../../merchant/stores';
import { categoriesOf, toStoreProducts } from '../../storefront/bridge';
import { BUTTON_RADIUS, FONT_STACK, brandScale, gridProducts, inSchedule, isHex, mediaSrc, productRef, testimonials } from '../../storefront/theme';
import { cn, useTx } from '../../../ds/ui';
import { productPhoto } from '../model/media';
import { STORE_PALETTE as P, previewSections } from './model';
import { annColours } from './identity';
import { mediaStore } from './state';

export function StorePreview({ sections, identity, device, store, lang, changed, label, now = Date.now() }: {
  sections: Section[]; identity: StoreIdentity; device: 'desktop' | 'mobile'; store: string; lang: 'ar' | 'en';
  /** Section ids to outline as changed (compare view). */
  changed?: Set<string>; label: string; now?: number;
}) {
  const tx = useTx();
  const lib = mediaStore.use();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const collections = collectionsStore.use();
  const reviews = reviewsStore.use();
  const rs = reviewSettingsStore.use();
  const storeProducts = toStoreProducts(products, levels);
  const cats = categoriesOf(storeProducts);
  const accent = isHex(identity.accent) ? identity.accent : P.accent;
  const sc = brandScale(accent);
  const radius = BUTTON_RADIUS[identity.button] ?? '8px';
  const mobile = device === 'mobile';
  const shown = previewSections(sections);
  const ann = shown.find((s) => s.kind === 'announcement');
  const body = shown.filter((s) => s.kind !== 'announcement');
  const logo = mediaSrc(identity.logo, lib);
  const btn: CSSProperties = { background: sc[600], color: '#fff', borderRadius: radius };
  const photo = (ref: string | undefined, fallback = 'p1') => mediaSrc(ref, lib) ?? productPhoto(productRef(ref) ?? fallback, 'large');
  const mark = (s: Section, node: ReactNode) => (
    <div key={s.id} className="relative" style={changed?.has(s.id) ? { outline: `2px dashed ${sc[500]}`, outlineOffset: 2, borderRadius: 8 } : undefined}>{node}</div>
  );
  const head = (s: Section) => <p className="mb-2 text-xs font-bold" dir="auto">{s.heading}</p>;
  const tile = (src: string | undefined, name: string, key: string) => (
    <div key={key} className="min-w-0">{src ? <img src={src} alt="" className="aspect-square w-full rounded-md object-cover" loading="lazy" /> : <span className="block aspect-square rounded-md" style={{ background: P.tile }} />}<p className="mt-1 truncate text-[10px]">{name}</p></div>
  );
  const cols = mobile ? 'grid-cols-2' : 'grid-cols-3';
  const nav = cats.slice(0, mobile ? 0 : 4).map((c) => c.name[lang]);

  const header = (
    <div className="border-b" style={{ background: P.paper, borderColor: P.line }}>
      {identity.header === 'centered' && !mobile ? (
        <div className="px-3 pt-2 pb-1.5 text-center">
          <div className="flex items-center justify-between"><Search className="size-3" aria-hidden="true" /><Brand logo={logo} store={store} big /><ShoppingBag className="size-3" aria-hidden="true" /></div>
          <div className="mt-1.5 flex justify-center gap-3 text-[9px]" style={{ color: P.muted }}>{nav.map((n) => <span key={n}>{n}</span>)}</div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2">
          {mobile && identity.header !== 'minimal' && <Menu className="size-3.5" aria-hidden="true" />}
          <span className={cn(mobile && identity.header !== 'minimal' && 'flex-1 text-center')}><Brand logo={logo} store={store} /></span>
          {!mobile && identity.header === 'classic' && <span className="ms-3 flex gap-2.5 text-[9px]" style={{ color: P.muted }}>{nav.map((n) => <span key={n}>{n}</span>)}</span>}
          <span className="ms-auto flex items-center gap-2" aria-hidden="true"><Search className="size-3" /><ShoppingBag className="size-3" />{identity.header === 'minimal' && <Menu className="size-3.5" />}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className={cn('mx-auto overflow-hidden rounded-xl border shadow-card transition-[max-width]', mobile ? 'max-w-[260px]' : 'max-w-full')}
      style={{ background: P.bg, color: P.ink, borderColor: P.line, fontFamily: FONT_STACK[identity.font] }} role="img" aria-label={label} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {ann && (() => {
        const c = annColours(ann);
        const live = inSchedule(ann, now);
        return mark(ann, <div className={cn('px-3 py-1.5 text-center text-[10px]', !live && 'opacity-60')} style={{ background: c.bg, color: c.fg }} dir="auto">
          <span className={cn(ann.link && 'underline underline-offset-2')}>{ann.heading}</span>{!live && <span className="ms-1.5 rounded px-1 text-[9px]" style={{ border: `1px solid ${c.fg}` }}>{tx('مجدول', 'Scheduled')}</span>}
        </div>);
      })()}
      {header}
      <div className="max-h-[540px] space-y-2 overflow-y-auto p-2 scrollbar-thin">
        {body.length === 0 && <p className="px-3 py-10 text-center text-xs" style={{ color: P.muted }}>{tx('كل الأقسام مخفية', 'Every section is hidden')}</p>}
        {body.map((s) => {
          switch (s.kind) {
            case 'hero': return mark(s,
              <div className="relative overflow-hidden rounded-lg" style={{ background: P.tile }}>
                <img src={photo(s.image)} alt="" className={cn('w-full object-cover', mobile ? 'h-36' : 'h-32')} loading="lazy" />
                <div className="absolute inset-x-0 bottom-0 p-3" style={{ background: 'linear-gradient(transparent, rgb(30 27 24 / .78))' }}>
                  <p className="text-sm font-bold text-white" dir="auto">{s.heading}</p>
                  {s.body && <p className="mt-0.5 line-clamp-2 text-[10px] text-white/85" dir="auto">{s.body}</p>}
                  <span className="mt-1.5 inline-block px-2.5 py-1 text-[10px] font-semibold" style={btn}>{tx('تسوّق الآن', 'Shop now')}</span>
                </div>
              </div>);
            case 'featured': return mark(s, <div className="rounded-lg p-2" style={{ background: P.paper }}>{head(s)}<div className={cn('grid gap-2', cols)}>{storeProducts.filter((p) => productPhoto(p.id)).slice(0, mobile ? 2 : 3).map((p) => tile(productPhoto(p.id), p.name[lang], p.id))}</div></div>);
            case 'grid': {
              const list = gridProducts(s.source, storeProducts, products, levels, collections).slice(0, mobile ? 4 : 3);
              return mark(s, <div className="rounded-lg p-2" style={{ background: P.paper }}>{head(s)}{list.length ? <div className={cn('grid gap-2', cols)}>{list.map((p) => tile(productPhoto(p.id), p.name[lang], p.id))}</div> : <p className="py-3 text-center text-[10px]" style={{ color: P.muted }}>{s.source ? tx('لا منتجات معروضة في هذا المصدر', 'No products on sale in this source') : tx('اختر فئة أو مجموعة', 'Choose a category or collection')}</p>}</div>);
            }
            case 'categories': return mark(s, <div className="rounded-lg p-2" style={{ background: P.paper }}>{head(s)}<div className="flex flex-wrap gap-1.5">{cats.map((c) => <span key={c.id} className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: P.line, background: P.sand }}>{c.name[lang]}</span>)}</div></div>);
            case 'banner': return mark(s,
              <div className={cn('grid items-center gap-2 overflow-hidden rounded-lg', mobile ? 'grid-cols-1' : 'grid-cols-2')} style={{ background: P.sand }}>
                {s.image ? <img src={photo(s.image)} alt="" className="h-24 w-full object-cover" loading="lazy" /> : <span className="grid h-24 place-items-center text-[10px]" style={{ background: P.tile, color: P.muted }}>{tx('اختر صورة', 'Choose a picture')}</span>}
                <div className="p-2.5"><p className="text-xs font-bold" dir="auto">{s.heading}</p>{s.body && <p className="mt-0.5 line-clamp-2 text-[10px]" style={{ color: P.muted }} dir="auto">{s.body}</p>}{s.link && <span className="mt-1.5 inline-block px-2 py-0.5 text-[10px] font-semibold" style={btn}>{tx('اكتشف', 'Discover')}</span>}</div>
              </div>);
            case 'testimonials': {
              const list = testimonials(reviews, rs, mobile ? 1 : 2);
              return mark(s, <div className="rounded-lg p-2" style={{ background: P.paper }}>{head(s)}{list.length ? <div className={cn('grid gap-2', mobile ? 'grid-cols-1' : 'grid-cols-2')}>{list.map((r) => (
                <figure key={r.id} className="rounded-md border p-2" style={{ borderColor: P.line }}><Quote className="size-3" style={{ color: sc[600] }} aria-hidden="true" /><blockquote className="mt-1 line-clamp-3 text-[10px]" dir="auto">{r.text}</blockquote><figcaption className="mt-1 flex items-center gap-1 text-[9px]" style={{ color: P.muted }}><Star className="size-2.5" style={{ color: sc[600] }} aria-hidden="true" />{r.rating} · {r.author[lang]}</figcaption></figure>
              ))}</div> : <p className="py-3 text-center text-[10px]" style={{ color: P.muted }}>{tx('لا تقييمات منشورة؛ القسم لا يظهر للعملاء', 'No published reviews; shoppers will not see this section')}</p>}</div>);
            }
            case 'richtext': return mark(s, <div className="rounded-lg p-3" style={{ background: P.paper }}>{head(s)}<p className="line-clamp-4 whitespace-pre-line text-[10px] leading-relaxed" style={{ color: P.muted }} dir="auto">{s.body}</p></div>);
            case 'offers': return mark(s, <div className="rounded-lg border-2 border-dashed px-3 py-3 text-center text-xs font-bold" style={{ borderColor: sc[500], color: P.sale }} dir="auto">{s.heading}</div>);
            case 'video': return mark(s, <div className="grid h-20 place-items-center rounded-lg text-center" style={{ background: P.ink, color: '#f6efe4' }}><span className="flex items-center gap-2 text-[11px]" dir="auto"><Play className="size-4" aria-hidden="true" />{s.heading}</span><span className="text-[9px] opacity-75">{tx('بلا فيديو مرفوع: يظهر نصًا للعملاء', 'No video uploaded: shoppers see text')}</span></div>);
            case 'newsletter': return mark(s,
              <div className="rounded-lg p-3 text-center" style={{ background: P.sand }}>
                <p className="text-xs font-bold" dir="auto">{s.heading}</p>
                <div className="mx-auto mt-2 flex max-w-48 gap-1"><span className="h-6 flex-1 border" style={{ background: P.paper, borderColor: P.line, borderRadius: radius }} /><span className="h-6 w-12" style={btn} /></div>
              </div>);
            default: return null;
          }
        })}
      </div>
    </div>
  );
}

function Brand({ logo, store, big }: { logo?: string; store: string; big?: boolean }) {
  return logo
    ? <img src={logo} alt={store} className={cn('inline-block w-auto max-w-[110px] object-contain', big ? 'h-6' : 'h-5')} />
    : <span className={cn('font-bold tracking-wide', big ? 'text-[13px]' : 'text-[11px]')}>{store}</span>;
}
