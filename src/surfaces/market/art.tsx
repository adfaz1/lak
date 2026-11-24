import type { ReactNode } from 'react';
import type { Art, CatId } from './domain';

const P = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
);

export const Ico = {
  search: () => <P><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></P>,
  compass: () => <P><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" /></P>,
  bag: () => <P><path d="M5 8h14l-1 12H6L5 8z" /><path d="M9 8V6a3 3 0 016 0v2" /></P>,
  box: () => <P><path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5v-9z" /><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" /></P>,
  bell: () => <P><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15L6 16z" /><path d="M10 20.5a2 2 0 004 0" /></P>,
  help: () => <P><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.5 2.5 0 114 2c-.9.6-1.6 1.1-1.6 2.2M12 16.6v.4" /></P>,
  pin: () => <P><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0113 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></P>,
  truck: () => <P><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></P>,
  shield: () => <P><path d="M12 3l7.5 3v6c0 4.5-3.2 7.7-7.5 9-4.3-1.3-7.5-4.5-7.5-9V6L12 3z" /><path d="M9 12l2 2 4-4" /></P>,
  ret: () => <P><path d="M9 14l-5-5 5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></P>,
  store: () => <P><path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16" /><path d="M9.5 20v-6h5v6" /></P>,
  filter: () => <P><path d="M4 6h16M7 12h10M10 18h4" /></P>,
  trash: () => <P><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></P>,
  info: () => <P><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.4" /></P>,
  check: () => <P><path d="M5 12.5l4.5 4.5L19 7.5" /></P>,
  x: () => <P><path d="M6 6l12 12M18 6L6 18" /></P>,
  chevron: () => <P><path d="M9 6l6 6-6 6" /></P>,
  card: () => <P><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" /></P>,
  cash: () => <P><rect x="3" y="6.5" width="18" height="11" rx="2" /><circle cx="12" cy="12" r="2.5" /></P>,
  split: () => <P><path d="M6 4v5a3 3 0 003 3h6a3 3 0 013 3v5M18 4v5a3 3 0 01-3 3" /></P>,
};

const CAT_ICON: Record<CatId, () => JSX.Element> = {
  coffee: () => <P><path d="M5 9h11v5a5 5 0 01-5 5H10a5 5 0 01-5-5V9z" /><path d="M16 10h1.5a2.5 2.5 0 010 5H16M9 3.5c-1 1.2 1 2 0 3.5M12.5 3.5c-1 1.2 1 2 0 3.5" /></P>,
  perfume: () => <P><rect x="6" y="9" width="12" height="11" rx="3" /><path d="M10 9V6h4v3M12 3v3" /></P>,
  home: () => <P><path d="M4 11l8-7 8 7M6 9.5V20h12V9.5" /></P>,
  kids: () => <P><path d="M8 4l-4 3 2 3 2-1v11h8V9l2 1 2-3-4-3a4 4 0 01-8 0z" /></P>,
  tech: () => <P><path d="M5 14v-2a7 7 0 0114 0v2" /><rect x="3.5" y="13.5" width="4" height="6" rx="1.5" /><rect x="16.5" y="13.5" width="4" height="6" rx="1.5" /></P>,
};
export const CatIcon = ({ cat }: { cat: CatId }) => CAT_ICON[cat]();

/** Flat product illustration standing in for product photos (demo data has no images). */
export function ProductArt({ art, tone }: { art: Art; tone: string }) {
  const bg = '#f3f1ee';
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="200" height="200" fill={bg} />
      <ellipse cx="100" cy="170" rx="56" ry="8" fill="#000" opacity=".06" />
      {art === 'bag' && <><path d="M64 52h72l9 116H55l9-116z" fill={tone} /><path d="M64 52l9-16h54l9 16" fill={tone} opacity=".7" /><rect x="78" y="92" width="44" height="34" rx="4" fill="#fffaf3" /><rect x="86" y="102" width="28" height="4" rx="2" fill={tone} /><rect x="90" y="112" width="20" height="3" rx="1.5" fill={tone} opacity=".6" /></>}
      {art === 'dripper' && <><path d="M58 70h84l-22 52H80L58 70z" fill="#fff" stroke="#cfc6ba" strokeWidth="3" /><rect x="84" y="122" width="32" height="10" rx="2" fill="#e3dccf" /><path d="M66 140h68l-6 28H72l-6-28z" fill="#bcd3dd" opacity=".7" /><path d="M142 78c14 0 14 22 0 22" stroke="#cfc6ba" strokeWidth="5" fill="none" /></>}
      {art === 'bottle' && <><rect x="70" y="80" width="60" height="88" rx="14" fill={tone} /><rect x="86" y="56" width="28" height="26" rx="3" fill="#c9a86a" /><rect x="80" y="40" width="40" height="18" rx="5" fill="#2b2b2b" /><rect x="80" y="104" width="40" height="30" rx="3" fill="#fff" opacity=".85" /></>}
      {art === 'candle' && <><rect x="64" y="84" width="72" height="84" rx="10" fill={tone} /><rect x="64" y="84" width="72" height="16" rx="8" fill="#fff" opacity=".35" /><path d="M100 82V68" stroke="#333" strokeWidth="3" /><path d="M100 48c8 10 8 18 0 22-8-4-8-12 0-22z" fill="#f2a93b" /></>}
      {art === 'cushion' && <><path d="M44 62c18 6 94 6 112 0 6 30 6 66 0 96-18-6-94-6-112 0-6-30-6-66 0-96z" fill={tone} /><path d="M70 90l15 20-15 20M130 90l-15 20 15 20M100 84l12 26-12 26-12-26 12-26z" stroke="#f3e6d4" strokeWidth="5" fill="none" strokeLinejoin="round" /></>}
      {art === 'shirt' && <><path d="M72 46l-34 22 14 24 14-8v84h68V84l14 8 14-24-34-22c-4 12-14 18-28 18s-24-6-28-18z" fill={tone} /><path d="M86 46c2 8 8 12 14 12s12-4 14-12" stroke="#fff" strokeWidth="4" fill="none" /></>}
      {art === 'toy' && <><ellipse cx="96" cy="118" rx="48" ry="30" fill={tone} /><path d="M82 92c4-18 18-18 22 0" fill={tone} /><path d="M140 112c10-20 8-40 0-50" stroke={tone} strokeWidth="14" strokeLinecap="round" fill="none" /><circle cx="140" cy="58" r="14" fill={tone} /><circle cx="144" cy="55" r="2.5" fill="#333" /><rect x="64" y="140" width="10" height="26" rx="4" fill={tone} /><rect x="118" y="140" width="10" height="26" rx="4" fill={tone} /></>}
      {art === 'headphones' && <><rect x="58" y="88" width="84" height="62" rx="30" fill={tone} /><rect x="58" y="88" width="84" height="20" rx="10" fill="#fff" opacity=".15" /><circle cx="84" cy="76" r="16" fill="#e6e8ec" /><circle cx="116" cy="76" r="16" fill="#e6e8ec" /><rect x="80" y="76" width="8" height="26" rx="4" fill="#e6e8ec" /><rect x="112" y="76" width="8" height="26" rx="4" fill="#e6e8ec" /><circle cx="100" cy="126" r="4" fill="#7fd1a8" /></>}
      {art === 'cable' && <><path d="M60 150c0-40 80-30 80-70s-40-40-50-20" stroke={tone} strokeWidth="9" fill="none" strokeLinecap="round" /><rect x="50" y="146" width="20" height="26" rx="4" fill="#d9dde3" /><rect x="80" y="44" width="20" height="26" rx="4" fill="#d9dde3" transform="rotate(-30 90 57)" /></>}
      {art === 'gift' && <><rect x="56" y="88" width="88" height="76" rx="6" fill={tone} /><rect x="50" y="72" width="100" height="22" rx="4" fill={tone} opacity=".85" /><rect x="94" y="72" width="12" height="92" fill="#f3e6d4" /></>}
    </svg>
  );
}

/** Seller avatar: initial on the seller's own colour (never LAK's). */
export function Avatar({ name, colour, size = 36 }: { name: string; colour: string; size?: number }) {
  return (
    <span className="mk-avatar" style={{ width: size, height: size, background: colour, fontSize: size * 0.44 }} aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}
