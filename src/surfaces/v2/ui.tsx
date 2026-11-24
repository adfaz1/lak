// LAK design system v2: icons and components. Screens compose these; they do not invent their own controls.
import { useEffect, useRef, type ReactNode } from 'react';
import { useLang } from '../../core/lang';
import { formatMoney } from '../../core/format';

/* ---------- Language ---------- */

export function useTx() {
  const { lang } = useLang();
  return (ar: string, en: string) => (lang === 'ar' ? ar : en);
}

/* ---------- Icons (24px grid, 1.75 stroke, rounded) ---------- */

const PATHS = {
  home: 'M3.5 10.5 12 4l8.5 6.5V19a1 1 0 0 1-1 1H15v-5.5H9V20H4.5a1 1 0 0 1-1-1z',
  orders: 'M5 4.5h14l-.9 14.6a1 1 0 0 1-1 .9H6.9a1 1 0 0 1-1-.9zM9 8.5a3 3 0 0 0 6 0',
  products: 'M12 3.5 19.5 7.5v9L12 20.5 4.5 16.5v-9zM4.5 7.5 12 11.5l7.5-4M12 11.5v9',
  inventory: 'M3.5 9 12 4.5 20.5 9v10.5h-17zM7.5 19.5v-6h9v6M7.5 16.5h9',
  customers: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16.5 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14.2A6.5 6.5 0 0 1 21.5 20',
  analytics: 'M4.5 19.5V11M10 19.5V5M15.5 19.5v-7M21 19.5H3',
  finance: 'M3.5 6.5h17v11h-17zM3.5 10h17M7 14h3',
  marketing: 'M4 9.5v5l2 .5 1.5 4.5h2.5l-1-3.8 7 2.3V5L4 9.5zM16 9.5a2.5 2.5 0 0 1 0 5',
  automations: 'M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z',
  store: 'M4 4h16l-1.2 5H5.2zM5 9v11h14V9M10 20v-5.5h4V20',
  apps: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V19a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H5a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V5a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.1a2 2 0 1 1 0 4h-.1z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.5v.5M12 16.8v.1',
  search: 'M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5l-5-5',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5h4',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6 6 18',
  chevron: 'M9.5 6 15.5 12l-6 6',
  chevronDown: 'M6 9.5l6 6 6-6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  back: 'M19 12H5M11 6l-6 6 6 6',
  filter: 'M4 5.5h16M7 12h10M10 18.5h4',
  sort: 'M7 4v16M3.5 7.5 7 4l3.5 3.5M17 20V4M13.5 16.5 17 20l3.5-3.5',
  more: 'M5.5 12h.01M12 12h.01M18.5 12h.01',
  truck: 'M2.5 6h11v10h-11zM13.5 9.5h4l3 3V16h-7M6.5 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zM17 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z',
  box: 'M12 3.5 20 7.5v9L12 20.5 4 16.5v-9zM4 7.5 12 11.5l8-4M12 11.5v9M8 5.5l8 4',
  card: 'M3.5 6h17v12h-17zM3.5 10h17M7 14.5h4',
  alert: 'M12 3.5 21.5 20h-19zM12 10v4.5M12 17.3v.1',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2',
  refresh: 'M20 11a8 8 0 0 0-14.3-4.6L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.6L20 16M20 20v-4h-4',
  print: 'M7 9V4h10v5M7 17H4.5v-7h15v7H17M7 14h10v6H7z',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  image: 'M4 5h16v14H4zM4 15.5l4.5-4.5 4 4 2.5-2.5L20 17M15 9.5h.01',
  upload: 'M12 15V4M7.5 8.5 12 4l4.5 4.5M4.5 15v4.5h15V15',
  trash: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  spark: 'M12 3.5l1.8 4.7 4.7 1.8-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.8zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  external: 'M14 4.5h5.5V10M19.5 4.5 11 13M17 13.5V19.5H4.5V7H10.5',
  copy: 'M8.5 8.5h11v11h-11zM15.5 8.5v-4h-11v11h4',
  wallet: 'M4 7.5h15.5v11H4zM4 7.5 15.5 4v3.5M15.5 13h.01',
  pin: 'M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  phone: 'M8 3.5h8a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM11 17.5h2',
  menu: 'M4 7h16M4 12h16M4 17h16',
  layout: 'M4 4.5h16v15H4zM4 9.5h16M9.5 9.5v10',
  tag: 'M3.5 12.5V4h8.5l8.5 8.5-8 8zM8 8.5h.01',
  link: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1',
  return: 'M9 10.5 4.5 15 9 19.5M4.5 15H15a4.5 4.5 0 0 0 0-9h-3',
} as const;
export type IconName = keyof typeof PATHS;
/** Icons that point along the reading direction and must mirror in RTL. */
const DIRECTIONAL = new Set<IconName>(['chevron', 'arrow', 'back', 'undo', 'return']);

export function Icon({ name, size, label }: { name: IconName; size?: 'sm' | 'xs'; label?: string }) {
  return (
    <svg className={`lk-icon${size ? ` ${size}` : ''}${DIRECTIONAL.has(name) ? ' lk-flip' : ''}`} viewBox="0 0 24 24"
      aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      <path d={PATHS[name]} />
    </svg>
  );
}

/* ---------- Money and identifiers ---------- */

/** Amount with the official Saudi Riyal symbol (glyph from LAK's own riyal font); the accessible name says the currency. */
export function Money({ v, strong, figure }: { v: number; strong?: boolean; figure?: boolean }) {
  const { lang } = useLang();
  return (
    <span className={`lk-num${strong ? ' lk-strong' : ''}${figure ? ' lk-figure' : ''}`} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.25em' }}>
      <bdi>{formatMoney(v)}</bdi>
      <span className="lk-riyal" role="img" aria-label={lang === 'ar' ? 'ريال سعودي' : 'Saudi riyal'}>{'\uE900'}</span>
    </span>
  );
}
export const Ref = ({ children }: { children: ReactNode }) => <bdi dir="ltr" className="lk-num">{children}</bdi>;

/* ---------- Status ---------- */

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'idle' | 'brand' | 'ai';
const TONE_ICON: Record<Tone, IconName> = { ok: 'check', warn: 'clock', bad: 'alert', info: 'truck', idle: 'more', brand: 'box', ai: 'spark' };
export function Pill({ tone, icon, children }: { tone: Tone; icon?: IconName; children: ReactNode }) {
  return <span className={`lk-pill ${tone}`}><Icon name={icon ?? TONE_ICON[tone]} size="xs" />{children}</span>;
}

export function Sim() {
  const tx = useTx();
  return <span className="lk-sim" title={tx('لا يتصل بمزوّد حقيقي', 'Does not reach a real provider')}>{tx('محاكاة', 'Simulated')}</span>;
}

/* ---------- Product imagery ---------- */

export function Thumb({ src, alt, size }: { src?: string; alt: string; size?: 'lg' | 'xl' }) {
  return (
    <span className={`lk-thumb${size ? ` ${size}` : ''}`}>
      {src ? <img src={src} alt={alt} loading="lazy" decoding="async" /> : <span className="lk-sr">{alt}</span>}
    </span>
  );
}
export function ThumbStack({ items, max = 3 }: { items: { src?: string; alt: string }[]; max?: number }) {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return (
    <span className="lk-stack">
      {shown.map((i, n) => <Thumb key={n} src={i.src} alt={i.alt} />)}
      {rest > 0 && <span className="lk-thumb more" aria-label={`+${rest}`}>+{rest}</span>}
    </span>
  );
}
export function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('');
  return <span className="lk-avatar" aria-hidden="true">{initials}</span>;
}

/* ---------- States ---------- */

/** Page heading for screen readers while a page's real heading is not on screen (loading). */
export function SrHeading({ children }: { children: ReactNode }) {
  return <h1 className="lk-sr">{children}</h1>;
}

export function Skeleton({ w = '100%', h = 14, r }: { w?: number | string; h?: number; r?: number }) {
  return <span className="lk-skel" style={{ display: 'block', width: w, height: h, borderRadius: r }} aria-hidden="true" />;
}

export function EmptyState({ icon = 'box', title, children, action, tone, as: H = 'h3' }: { icon?: IconName; title: ReactNode; children?: ReactNode; action?: ReactNode; tone?: 'bad'; as?: 'h1' | 'h2' | 'h3' }) {
  return (
    <div className={`lk-state${tone ? ` ${tone}` : ''}`} role={tone === 'bad' ? 'alert' : undefined}>
      <span className="lk-state-art"><Icon name={icon} /></span>
      <H className="lk-h2">{title}</H>
      {children && <p>{children}</p>}
      {action && <div className="lk-row lk-wrap" style={{ justifyContent: 'center', marginTop: 6 }}>{action}</div>}
    </div>
  );
}

export function Banner({ tone, icon, title, children, action }: { tone: 'bad' | 'warn' | 'ok' | 'info'; icon?: IconName; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const ic: IconName = icon ?? (tone === 'ok' ? 'check' : tone === 'info' ? 'help' : 'alert');
  return (
    <div className={`lk-banner ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <Icon name={ic} size="sm" />
      <div className="lk-grow">{title && <div className="lk-strong">{title}</div>}{children}</div>
      {action}
    </div>
  );
}

/* ---------- Overlays ---------- */

/** Modal dialog. Focus moves in on open and returns to the opener on close; Escape closes. */
export function Dialog({ title, children, footer, onClose, wide }: { title: string; children: ReactNode; footer: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus(); };
  }, []);
  return (
    <div className="lk-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lk-dialog" style={wide ? { maxWidth: 640 } : undefined} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header><h2 className="lk-h1" style={{ fontSize: 20 }}>{title}</h2></header>
        <div className="body">{children}</div>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}

export function Toast({ children, onClose, action }: { children: ReactNode; onClose: () => void; action?: ReactNode }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => { const t = setTimeout(() => close.current(), 6000); return () => clearTimeout(t); }, []);
  return <div className="lk-toast" role="status"><Icon name="check" size="sm" /><span>{children}</span>{action}</div>;
}
