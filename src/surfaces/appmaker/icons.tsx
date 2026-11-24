import type { ReactNode } from 'react';
import type { IconTile } from './fixtures';

const P = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
);

export const Ico = {
  up: () => <P><path d="M12 19V5M6 11l6-6 6 6" /></P>,
  down: () => <P><path d="M12 5v14M6 13l6 6 6-6" /></P>,
  trash: () => <P><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></P>,
  plus: () => <P><path d="M12 5v14M5 12h14" /></P>,
  check: () => <P><path d="M5 12.5l4.5 4.5L19 7.5" /></P>,
  x: () => <P><path d="M6 6l12 12M18 6L6 18" /></P>,
  dot: () => <P><circle cx="12" cy="12" r="4" /></P>,
  alert: () => <P><path d="M12 8v5M12 16.5v.5" /><path d="M10.3 3.9L2.6 17.5A2 2 0 004.3 20.5h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></P>,
  clock: () => <P><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></P>,
  lock: () => <P><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></P>,
  home: () => <P><path d="M4 11l8-7 8 7M6 9.5V20h12V9.5" /></P>,
  bag: () => <P><path d="M5 8h14l-1 12H6L5 8z" /><path d="M9 8V6a3 3 0 016 0v2" /></P>,
  user: () => <P><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" /></P>,
  heart: () => <P><path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" /></P>,
  star: () => <P><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z" /></P>,
  search: () => <P><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></P>,
  chevron: () => <P><path d="M9 6l6 6-6 6" /></P>,
  apple: () => <P><path d="M16 3.5c-1.2.1-2.6.9-3.3 2-.6.9-1 2-.8 3.1 1.2.1 2.5-.7 3.2-1.7.7-1 1-2.2.9-3.4zM12 8.6c-1 0-2.2-.8-3.4-.8C6.6 7.8 5 9.6 5 12.5c0 3.5 2.4 8 4.3 8 1 0 1.5-.6 2.7-.6s1.6.6 2.7.6c1.4 0 2.8-2.4 3.4-4.4-1.6-.7-2.5-2.1-2.5-3.8 0-1.5.8-2.8 2-3.5-.8-1.1-2-1.6-3.2-1.6-1.1 0-1.7.7-2.4.7z" /></P>,
  play: () => <P><path d="M5 3.8v16.4a.8.8 0 001.2.7L20 12.7a.8.8 0 000-1.4L6.2 3.1A.8.8 0 005 3.8z" /></P>,
  refresh: () => <P><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" /></P>,
  image: () => <P><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M20 16l-5-5-8 8.5" /></P>,
  phone: () => <P><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></P>,
  layers: () => <P><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" /></P>,
  ext: () => <P><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></P>,
  shield: () => <P><path d="M12 3l7.5 3v6c0 4.5-3.2 7.7-7.5 9-4.3-1.3-7.5-4.5-7.5-9V6L12 3z" /><path d="M9 12l2 2 4-4" /></P>,
};

/** Generated app-icon tile (merchant colours). Purely illustrative; the real icon file is produced at build. */
export function IconArt({ tile, letter, size = 56 }: { tile: IconTile; letter: string; size?: number }) {
  const { bg, fg, mark } = tile;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill={bg} />
      {mark === 'letter' && <text x="32" y="43" textAnchor="middle" fontSize="30" fontWeight="700" fill={fg} fontFamily="'Noto Sans Arabic', system-ui, sans-serif">{letter}</text>}
      {mark === 'letterOutline' && <><circle cx="32" cy="32" r="20" fill="none" stroke={fg} strokeWidth="2.5" /><text x="32" y="41" textAnchor="middle" fontSize="22" fontWeight="700" fill={fg} fontFamily="'Noto Sans Arabic', system-ui, sans-serif">{letter}</text></>}
      {mark === 'bean' && <><ellipse cx="32" cy="32" rx="13" ry="18" fill={fg} transform="rotate(-30 32 32)" /><path d="M26 20c8 6 4 18 12 24" stroke={bg} strokeWidth="2.5" fill="none" strokeLinecap="round" /></>}
      {mark === 'palm' && <><path d="M32 52V28" stroke={fg} strokeWidth="3" strokeLinecap="round" /><path d="M32 28c-4-8-12-9-17-6 6 0 11 2 17 6zM32 28c4-8 12-9 17-6-6 0-11 2-17 6zM32 28c-7-3-14 1-16 7 5-4 10-6 16-7zM32 28c7-3 14 1 16 7-5-4-10-6-16-7z" fill={fg} /></>}
      {mark === 'cup' && <><path d="M18 26h24v10a12 12 0 01-24 0V26z" fill={fg} /><path d="M42 29h3a5 5 0 010 10h-3" stroke={fg} strokeWidth="3" fill="none" /><path d="M26 14c-2 3 2 5 0 8M33 14c-2 3 2 5 0 8" stroke={fg} strokeWidth="2.2" fill="none" strokeLinecap="round" /></>}
      {mark === 'ring' && <><circle cx="32" cy="32" r="17" fill="none" stroke={fg} strokeWidth="5" /><circle cx="32" cy="32" r="6" fill={fg} /></>}
    </svg>
  );
}

/** Illustrative product art for the preview: a coffee bag / tool silhouette in the item's tone. */
export function ProductArt({ tone, kind = 'bag' }: { tone: string; kind?: 'bag' | 'tool' | 'gift' }) {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="120" height="120" fill="#f4efe8" />
      {kind === 'bag' && <><path d="M38 30h44l6 74H32l6-74z" fill={tone} /><path d="M38 30l6-10h32l6 10" fill={tone} opacity=".75" /><rect x="46" y="54" width="28" height="22" rx="3" fill="#fffaf3" opacity=".9" /></>}
      {kind === 'tool' && <><path d="M34 40h52l-14 34H48L34 40z" fill={tone} stroke="#8d8173" strokeWidth="2" /><rect x="50" y="76" width="20" height="8" fill="#b9ae9f" /><ellipse cx="60" cy="92" rx="26" ry="5" fill="#d7cfc3" /></>}
      {kind === 'gift' && <><rect x="28" y="46" width="64" height="52" rx="4" fill={tone} /><rect x="24" y="38" width="72" height="14" rx="3" fill={tone} opacity=".85" /><rect x="56" y="38" width="8" height="60" fill="#f3e6d4" /></>}
    </svg>
  );
}
