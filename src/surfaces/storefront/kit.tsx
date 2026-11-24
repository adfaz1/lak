import type { ReactNode } from 'react';
import { formatMoney } from '../../core/format';
import { useLang, type L, type Lang } from '../../core/lang';
import { link } from '../../core/router';
import { CITIES, COLORS, type CityId, type ColorId, type Product } from './domain';
import { strings, type Strings } from './i18n';

/* ───────────── Language helpers ───────────── */

export interface Ctx { t: Strings; lang: Lang; l: (x: L) => string; m: (v: number) => string; d: (ms: number) => string; dl: (ms: number) => string; time: (ms: number) => string }

const locale = (lang: Lang) => (lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB');

export function useS(): Ctx {
  const { lang } = useLang();
  return {
    t: strings[lang],
    lang,
    l: (x) => x[lang],
    // Money in running text: isolate the number so it keeps its direction inside Arabic sentences.
    m: (v) => `⁨${formatMoney(v)}⁩ ${lang === 'ar' ? 'ر.س' : 'SAR'}`,
    d: (ms) => new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short', year: 'numeric' }).format(ms),
    dl: (ms) => new Intl.DateTimeFormat(locale(lang), { weekday: 'short', day: 'numeric', month: 'short' }).format(ms),
    time: (ms) => new Intl.DateTimeFormat(locale(lang), { hour: '2-digit', minute: '2-digit' }).format(ms),
  };
}

/** Storefront link: every route lives below #/store. */
export const to = (path = '', query?: Record<string, string | undefined>) => link(`/store${path}`, query);

export const sizeLabel = (s: string, lang: Lang) => (s.endsWith('ml') ? `${s.replace('ml', '')} ${lang === 'ar' ? 'مل' : 'ml'}` : s);

export function districtLabel(city: CityId | undefined, d: string, lang: Lang): string {
  return CITIES.find((c) => c.id === city)?.districts.find((x) => x.en === d)?.[lang] ?? d;
}

export function variantLabel(_p: Product, color: ColorId | undefined, size: string | undefined, lang: Lang): string {
  return [color && COLORS[color].name[lang], size && sizeLabel(size, lang)].filter(Boolean).join(' · ');
}

/* ───────────── Icons (inline, stroke, decorative) ───────────── */

const paths: Record<string, ReactNode> = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  bag: <><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></>,
  chev: <path d="m10 6 6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  filter: <path d="M4 7h16M7 12h10M10 17h4" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  truck: <><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></>,
  return: <><path d="M9 7 5 11l4 4" /><path d="M5 11h9a5 5 0 0 1 0 10h-3" /></>,
  card: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h4" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: <><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" /></>,
  pin: <><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11Z" /><circle cx="12" cy="10" r="2.2" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  box: <><path d="m4 8 8-4 8 4v8l-8 4-8-4V8Z" /><path d="m4 8 8 4 8-4M12 12v8" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8L3 12Z" /><circle cx="7.5" cy="8.5" r="1.3" /></>,
  flask: <><path d="M9 3h6M10 3v5l-5 10a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-10V3" /></>,
  alert: <><path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4M12 17v.5" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.5" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v4h-4" /></>,
};

export function Icon({ name, size = 22, flip, className }: { name: keyof typeof paths | string; size?: number; flip?: boolean; className?: string }) {
  return (
    <svg className={`sf-icon${flip ? ' sf-flip' : ''}${className ? ` ${className}` : ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

/* ───────────── Product art ─────────────
   No product photography exists for this fixture merchant, so each product is drawn as a quiet line-art still life
   in its variant colour. Replace with the merchant's own images when connected. */

const PERFUME_TONE: Record<string, string> = { 'night-oud': '#8a5a26', 'white-musk': '#e9e1d2', 'taif-rose': '#c48b86' };

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, ((n >> s) & 255) + amt));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
}

export function ProductArt({ p, color, view = 0, label }: { p: Product; color?: ColorId; view?: number; label?: string }) {
  const fill = p.kind === 'perfume' ? PERFUME_TONE[p.id] ?? '#b9843f' : COLORS[color ?? p.colors[0] ?? 'black'].hex;
  const dark = shade(fill, -34);
  const light = shade(fill, 26);
  const id = `sf-g-${p.id}-${color ?? 'x'}-${view}`;
  const tile = p.kind === 'perfume' ? '#ece4d8' : p.cat === 'bags' ? '#eee6db' : '#efe9e1';

  const garment = (() => {
    switch (p.kind) {
      case 'abaya':
        return (
          <g>
            <path d="M150 34v12c0 6 10 6 10 13" fill="none" stroke="#8c8176" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M118 64 150 52l32 12" fill="none" stroke="#8c8176" strokeWidth="3" strokeLinecap="round" />
            <path d="M130 62 92 76C78 112 66 142 56 174l26 12c9-24 15-44 20-62l-16 220q64 12 128 0l-16-220c5 18 11 38 20 62l26-12c-10-32-22-62-36-98l-38-14q-20 34-40 0Z" fill={fill} stroke={dark} strokeWidth="1.2" />
            <path d="M150 92v258" stroke={p.id === 'embroidered-abaya' ? '#b38b4a' : dark} strokeWidth={p.id === 'embroidered-abaya' ? 3 : 1.2} strokeDasharray={p.id === 'embroidered-abaya' ? '2 5' : undefined} opacity=".8" />
            <path d="M120 140c-6 70-10 140-14 200M180 140c6 70 10 140 14 200" stroke={dark} strokeWidth="1" opacity=".55" fill="none" />
            <path d="M58 172l24 12" stroke={p.id === 'crepe-abaya' ? light : dark} strokeWidth="5" opacity=".7" />
            <path d="M242 172l-24 12" stroke={p.id === 'crepe-abaya' ? light : dark} strokeWidth="5" opacity=".7" />
          </g>
        );
      case 'dress':
        return (
          <g>
            <path d="M150 34v12c0 6 10 6 10 13" fill="none" stroke="#8c8176" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M118 64 150 52l32 12" fill="none" stroke="#8c8176" strokeWidth="3" strokeLinecap="round" />
            <path d="M132 60q18 16 36 0l28 12 18 104-16 4-14-70-2 40q4 20-2 36l42 156q-72 14-144 0l42-156q-6-16-2-36l-2-40-14 70-16-4 18-104Z" fill={fill} stroke={dark} strokeWidth="1.2" />
            <rect x="118" y="176" width="64" height="10" rx="2" fill={dark} opacity=".85" />
            {p.id === 'shirt-dress' && [96, 120, 144, 168, 204, 228].map((y) => <circle key={y} cx="150" cy={y} r="2.4" fill={dark} />)}
            <path d="M130 190 100 338M170 190l30 148M150 190v152" stroke={dark} strokeWidth="1" opacity=".45" fill="none" />
          </g>
        );
      case 'perfume':
        return (
          <g>
            <rect x="126" y="72" width="48" height="42" rx="6" fill="#2b2622" />
            <rect x="126" y="72" width="48" height="10" rx="5" fill="#3d3631" />
            <rect x="138" y="112" width="24" height="16" fill="#cbbfae" stroke="#a89a88" />
            <rect x="88" y="126" width="124" height={p.id === 'taif-rose' ? 168 : 186} rx="20" fill={fill} stroke={dark} strokeWidth="1.4" opacity=".92" />
            <rect x="98" y="136" width="14" height="120" rx="7" fill="#fff" opacity=".28" />
            <rect x="112" y="186" width="76" height="52" rx="3" fill="#f7f2ea" stroke={dark} strokeWidth=".8" />
            <path d="M126 204h48M134 218h32" stroke="#6b625a" strokeWidth="2" strokeLinecap="round" />
          </g>
        );
      case 'scarf':
        return (
          <g>
            <path d="M150 64 252 166 150 268 48 166Z" fill={fill} stroke={dark} strokeWidth="1.2" />
            <path d="M150 92 224 166 150 240 76 166Z" fill="none" stroke={light} strokeWidth="3" />
            <path d="M150 120 196 166 150 212 104 166Z" fill="none" stroke={dark} strokeWidth="1.4" />
            {p.id === 'silk-scarf' && [[150, 104], [150, 228], [88, 166], [212, 166]].map(([x, y]) => (
              <path key={`${x}-${y}`} d={`M${x} ${y - 9} ${x + 9} ${y} ${x} ${y + 9} ${x - 9} ${y}Z`} fill={light} />
            ))}
            <path d="M200 216q30 54 6 120l-24-4q18-56-6-100" fill={fill} stroke={dark} strokeWidth="1.2" />
          </g>
        );
      case 'bag':
        return p.id === 'evening-clutch' ? (
          <g>
            <path d="M104 186q46-110 92 0" fill="none" stroke="#b49a6a" strokeWidth="3" strokeDasharray="5 4" />
            <rect x="66" y="180" width="168" height="104" rx="14" fill={fill} stroke={dark} strokeWidth="1.2" />
            <path d="M66 196q84 52 168 0" fill={dark} opacity=".35" />
            <rect x="140" y="214" width="20" height="8" rx="3" fill="#c7a564" />
          </g>
        ) : (
          <g>
            <path d="M112 156c0-64 76-64 76 0" fill="none" stroke={dark} strokeWidth="9" strokeLinecap="round" />
            <path d="M78 152h144l14 172q-86 10-172 0Z" fill={fill} stroke={dark} strokeWidth="1.2" />
            <path d="M84 180h132" stroke={dark} strokeWidth="1" strokeDasharray="3 4" opacity=".7" />
            <path d="M150 152v20" stroke={dark} strokeWidth="2" />
          </g>
        );
    }
  })();

  return (
    <svg className="sf-art" viewBox="0 0 300 375" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      <defs>
        <radialGradient id={id} cx="50%" cy="38%" r="70%">
          <stop offset="0" stopColor="#fbf8f3" />
          <stop offset="1" stopColor={tile} />
        </radialGradient>
        <pattern id={`${id}-w`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="8" height="8" fill={fill} />
          <path d="M0 0v8" stroke={dark} strokeWidth="2" opacity=".5" />
          <path d="M4 0v8" stroke={light} strokeWidth="1" opacity=".5" />
        </pattern>
      </defs>
      <rect width="300" height="375" fill={`url(#${id})`} />
      {view === 1 ? (
        <g>
          <circle cx="150" cy="180" r="112" fill={`url(#${id}-w)`} stroke={dark} strokeWidth="1" />
          <circle cx="150" cy="180" r="112" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="6" />
        </g>
      ) : (
        <g transform={view === 2 ? 'translate(300 0) scale(-1 1) translate(20 8) scale(.92)' : undefined}>
          <ellipse cx="150" cy="350" rx="96" ry="8" fill="#000" opacity=".06" />
          {garment}
        </g>
      )}
    </svg>
  );
}

/* ───────────── Small components ───────────── */

export function Price({ v, compareAt, from }: { v: number; compareAt?: number; from?: boolean }) {
  const { t, lang } = useS();
  const cur = lang === 'ar' ? 'ر.س' : 'SAR';
  return (
    <span className="sf-price">
      {from && <span className="sf-from">{t.from} </span>}
      <span className={compareAt ? 'sf-now sale' : 'sf-now'}><bdi>{formatMoney(v)}</bdi> {cur}</span>
      {compareAt && <s className="sf-was"><span className="sr">{t.was} </span><bdi>{formatMoney(compareAt)}</bdi> {cur}</s>}
    </span>
  );
}

export function Swatch({ c, size = 14 }: { c: ColorId; size?: number }) {
  return <span className="sf-swatch" style={{ background: COLORS[c].hex, width: size, height: size }} aria-hidden="true" />;
}

/** Simulation-only controls. Visibly different from the shop so nobody mistakes them for shopper UI. */
export function TestBox({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useS();
  return (
    <aside className="sf-testbox" aria-label={title}>
      <p className="sf-testbox-h"><span className="sim">{t.sim}</span> {title}</p>
      {children}
    </aside>
  );
}
