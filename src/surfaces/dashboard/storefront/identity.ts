// Store identity (BP-P03-STP-004/005/006): brand colour with an accessible scale and contrast checks, logo and favicon
// references, typeface, button shape, header layout, the scheduled announcement bar, and the homepage section library.
// Pure rules, no React. The storefront renders the published identity through storefront/theme.ts.
import { toLatin } from '../../merchant/growth';
import type { Review } from '../../merchant/growth';
import type { ButtonStyle, HeaderLayout, Section, SectionKind, StoreFont, StoreIdentity, ThemeState } from '../../merchant/workspace';
import { brandScale, contrast, darkPalette, inSchedule, isHex, lightPalette, liveIdentity, riyadhDay } from '../../storefront/theme';

export const FONTS: StoreFont[] = ['plex', 'system', 'naskh'];
export const BUTTONS: ButtonStyle[] = ['soft', 'pill', 'square'];
export const HEADERS: HeaderLayout[] = ['classic', 'centered', 'minimal'];
/** A few starting colours that already pass every check; the merchant can type any colour. */
export const ACCENT_PRESETS = ['#84603d', '#1f5f4a', '#2b4c7e', '#8a2f45', '#3d3a37', '#9a4316'] as const;

/* ---------- Colour ---------- */

/** "84603D", "#84603d", "#863" or Arabic-Indic digits → "#84603d"; null when it is not a colour. */
export function normHex(v: string): string | null {
  let s = toLatin(v).trim().toLowerCase().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/.test(s)) s = s.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/.test(s) ? `#${s}` : null;
}

export const AA = 4.5;
export interface AccentReport { button: number; link: number; dark: number; ok: boolean }
/** Where the brand colour is used and how readable each use is (WCAG ratio, AA = 4.5 for body text). */
export function accentReport(accent: string): AccentReport {
  const s = brandScale(accent);
  const r = (n: number) => Math.round(n * 10) / 10;
  const button = r(contrast(s[600], '#ffffff'));
  const link = r(contrast(s[700], lightPalette(undefined, accent).surface));
  const dark = r(contrast(s[300], darkPalette(undefined, accent).surface));
  return { button, link, dark, ok: button >= AA && link >= AA && dark >= AA };
}

/** The nearest colour of the same hue that passes every check: darkened (or lightened, for very dark colours) in small steps. */
export function accessibleAccent(accent: string): string {
  if (accentReport(accent).ok) return accent;
  const n = parseInt(accent.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const hex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
  for (let i = 1; i <= 40; i++) {
    const down = hex(rgb.map((v) => v * (1 - i * 0.025)));
    if (accentReport(down).ok) return down;
    const up = hex(rgb.map((v) => v + (255 - v) * i * 0.02));
    if (accentReport(up).ok) return up;
  }
  return '#84603d';
}

/* ---------- Identity draft ---------- */

/** The identity being edited: the draft when there is one, else what is live. */
export const draftIdentity = (t: ThemeState): StoreIdentity => t.draftIdentity ?? liveIdentity(t);
export const setIdentity = (t: ThemeState, patch: Partial<StoreIdentity>): ThemeState => ({ ...t, draftIdentity: { ...draftIdentity(t), ...patch } });

export type IdentityKey = keyof StoreIdentity;
export const IDENTITY_KEYS: IdentityKey[] = ['logo', 'favicon', 'accent', 'font', 'button', 'header'];
export interface IdentityChange { key: IdentityKey; before: string | null; after: string | null }
export function identityChanges(live: StoreIdentity, draft: StoreIdentity): IdentityChange[] {
  return IDENTITY_KEYS.filter((k) => (live[k] ?? null) !== (draft[k] ?? null)).map((k) => ({ key: k, before: live[k] ?? null, after: draft[k] ?? null }));
}
export const identityIssue = (id: StoreIdentity): 'accent' | null => (isHex(id.accent) ? null : 'accent');

/* ---------- Links ---------- */

/** A store path ("/c/abayas") or a full https:// address. Blank is allowed (no link). */
export function linkError(link: string | undefined): 'invalid' | null {
  const v = (link ?? '').trim();
  if (!v) return null;
  if (/^\/[^\s]*$/.test(v)) return null;
  try { const u = new URL(v); return u.protocol === 'https:' && u.hostname.includes('.') && !/\s/.test(v) ? null : 'invalid'; } catch { return 'invalid'; }
}

/* ---------- Announcement bar ---------- */

export const ANN_MAX = 90;
export const ANN_DEFAULT = { bg: '#1e1b18', fg: '#f6efe4' } as const;
export const annColours = (s: Pick<Section, 'bg' | 'fg'>) => ({ bg: s.bg ?? ANN_DEFAULT.bg, fg: s.fg ?? ANN_DEFAULT.fg });
export type AnnIssue = 'colours' | 'schedule' | 'link';
/** Problems that block publishing an announcement bar (the text itself is checked with the other headings). */
export function annIssues(s: Section): AnnIssue[] {
  const out: AnnIssue[] = [];
  const c = annColours(s);
  if (!isHex(c.bg) || !isHex(c.fg) || contrast(c.bg, c.fg) < AA) out.push('colours');
  if (s.start && s.end && s.end < s.start) out.push('schedule');
  if (linkError(s.link)) out.push('link');
  return out;
}
export type ScheduleState = 'always' | 'upcoming' | 'running' | 'ended';
export function scheduleState(s: Pick<Section, 'start' | 'end'>, now: number): ScheduleState {
  if (!s.start && !s.end) return 'always';
  if (inSchedule(s, now)) return 'running';
  return s.start && riyadhDay(now) < s.start ? 'upcoming' : 'ended';
}

/* ---------- Section library ---------- */

/** What can be added to the homepage. Kinds marked single appear once; the rest can repeat. */
export const LIBRARY: { kind: SectionKind; single: boolean }[] = [
  { kind: 'hero', single: true }, { kind: 'grid', single: false }, { kind: 'banner', single: false }, { kind: 'testimonials', single: true },
  { kind: 'richtext', single: false }, { kind: 'video', single: true }, { kind: 'featured', single: true }, { kind: 'categories', single: true },
  { kind: 'offers', single: true }, { kind: 'newsletter', single: true },
];
export type LibraryBlock = 'already' | 'noReviews' | null;
/** Published product reviews rated 4 or more: the only source testimonials may show. */
export const realReviews = (reviews: Review[]) => reviews.filter((r) => r.kind === 'review' && r.status === 'published' && (r.rating ?? 0) >= 4).length;
export function libraryBlock(kind: SectionKind, draft: Section[], reviewCount: number): LibraryBlock {
  const item = LIBRARY.find((x) => x.kind === kind);
  if (!item) return 'already';
  if (item.single && draft.some((s) => s.kind === kind)) return 'already';
  if (kind === 'testimonials' && reviewCount < 1) return 'noReviews';
  return null;
}

/** Next free section id ("s8", "s9"…), never reusing one from the live version or history. */
export function nextSectionId(t: ThemeState): string {
  const all = [...t.draft, ...t.history.flatMap((h) => h.sections)].map((s) => Number(s.id.replace(/^\D+/, '')) || 0);
  return `s${Math.max(0, ...all) + 1}`;
}
/** Add a section to the draft, just before the newsletter when there is one (it reads best last), else at the end. */
export function addSection(t: ThemeState, s: Omit<Section, 'id' | 'visible'>): ThemeState {
  const sec: Section = { ...s, id: nextSectionId(t), visible: true };
  const i = t.draft.findIndex((x) => x.kind === 'newsletter');
  const draft = i < 0 ? [...t.draft, sec] : [...t.draft.slice(0, i), sec, ...t.draft.slice(i)];
  return { ...t, draft };
}
/** Remove a section from the draft. The announcement bar is part of every page and can only be hidden. */
export const removeSection = (t: ThemeState, id: string): ThemeState =>
  ({ ...t, draft: t.draft.filter((s) => s.id !== id || s.kind === 'announcement') });

/* ---------- Draft vs live ---------- */

export type DraftChangeKind = 'moved' | 'shown' | 'hidden' | 'edited' | 'added' | 'removed';
export interface DraftChange { id: string; kind: DraftChangeKind }
const PROPS: (keyof Section)[] = ['heading', 'body', 'link', 'image', 'source', 'bg', 'fg', 'start', 'end'];
/** Section changes in draft order, then removed sections. Moves compare order among sections present in both. */
export function diffDraft(pub: Section[], draft: Section[]): (DraftChange | { id: string; kind: 'unchanged' })[] {
  const common = draft.filter((d) => pub.some((p) => p.id === d.id)).map((d) => d.id);
  const pubCommon = pub.filter((p) => common.includes(p.id)).map((p) => p.id);
  const out: (DraftChange | { id: string; kind: 'unchanged' })[] = draft.map((d) => {
    const p = pub.find((x) => x.id === d.id);
    if (!p) return { id: d.id, kind: 'added' };
    if (p.visible !== d.visible) return { id: d.id, kind: d.visible ? 'shown' : 'hidden' };
    if (PROPS.some((k) => (p[k] ?? '') !== (d[k] ?? ''))) return { id: d.id, kind: 'edited' };
    if (common.indexOf(d.id) !== pubCommon.indexOf(d.id)) return { id: d.id, kind: 'moved' };
    return { id: d.id, kind: 'unchanged' };
  });
  return [...out, ...pub.filter((p) => !draft.some((d) => d.id === p.id)).map((p) => ({ id: p.id, kind: 'removed' as const }))];
}
