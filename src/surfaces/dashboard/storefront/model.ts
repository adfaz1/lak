// Online store: pure rules for the theme draft, publishing, rollback and store status. No React.
// Theme versioning (diffSections, moveSection, publishTheme, rollbackTheme) lives in merchant/workspace.ts.
import {
  moveSection, publishTheme, rollbackTheme,
  type Section, type StoreStatus, type ThemeState,
} from '../../merchant/workspace';
import { annIssues, diffDraft, draftIdentity, identityChanges, identityIssue, linkError, type DraftChange } from './identity';
import { liveIdentity } from '../../storefront/theme';

/** The demo store's own palette (same values as the shopper store, src/surfaces/storefront/styles.css), not LAK's. */
export const STORE_PALETTE = { bg: '#f8f5f0', paper: '#fffdf9', tile: '#efe9e1', sand: '#f1ebe2', ink: '#1e1b18', muted: '#675e55', line: '#e6dfd5', accent: '#84603d', sale: '#9a2f1d' } as const;

export const HEADING_MAX = 60;
export const headingError = (h: string): 'empty' | 'long' | null => (!h.trim() ? 'empty' : h.length > HEADING_MAX ? 'long' : null);

/** Section changes between the live version and the draft (added and removed included), excluding unchanged ones. */
export const pendingChanges = (t: ThemeState): DraftChange[] => diffDraft(t.published.sections, t.draft).filter((c): c is DraftChange => c.kind !== 'unchanged');
export const changeOf = (t: ThemeState, id: string) => pendingChanges(t).find((c) => c.id === id)?.kind ?? null;
/** Identity changes (logo, favicon, colour, font, buttons, header) between live and draft. */
export const identityPending = (t: ThemeState) => identityChanges(liveIdentity(t), draftIdentity(t));
export const nextVersion = (t: ThemeState) => Math.max(...t.history.map((h) => h.version)) + 1;

export const BODY_MAX = 600;
export type SectionIssue = 'empty' | 'long' | 'source' | 'image' | 'body' | 'link' | 'colours' | 'schedule';
/** The first thing that stops a section from being published, or null. */
export function sectionIssue(s: Section): SectionIssue | null {
  const h = headingError(s.heading);
  if (h) return h;
  if (s.kind === 'announcement') return annIssues(s)[0] ?? null;
  if (s.kind === 'grid' && !s.source) return 'source';
  if (s.kind === 'banner' && !s.image) return 'image';
  if (s.kind === 'richtext' && !(s.body ?? '').trim()) return 'body';
  if ((s.body ?? '').length > BODY_MAX) return 'body';
  if (linkError(s.link)) return 'link';
  return null;
}

export type PublishBlock = 'noChanges' | 'invalid' | null;
export function publishBlock(t: ThemeState): PublishBlock {
  if (t.draft.some((s) => sectionIssue(s)) || identityIssue(draftIdentity(t))) return 'invalid';
  if (!pendingChanges(t).length && !identityPending(t).length) return 'noChanges';
  return null;
}

export const updateSection = (t: ThemeState, id: string, p: Partial<Section>): ThemeState => ({ ...t, draft: t.draft.map((s) => (s.id === id ? { ...s, ...p } : s)) });
export const move = (t: ThemeState, id: string, dir: -1 | 1): ThemeState => ({ ...t, draft: moveSection(t.draft, id, dir) });
export const discardDraft = (t: ThemeState): ThemeState => ({ published: t.published, history: t.history, draft: t.published.sections.map((s) => ({ ...s })) });
export const publish = (t: ThemeState, note: string) => publishTheme(t, note.trim() || 'Update');
export const canRollback = (t: ThemeState, v: number) => v !== t.published.version && t.history.some((h) => h.version === v);
export { rollbackTheme };

/** What the preview shows: visible sections in draft order. */
export const previewSections = (draft: Section[]) => draft.filter((s) => s.visible);

/* ---------- Store status: three separate decisions ---------- */

export type StatusKey = 'published' | 'accepting' | 'maintenance';
/** What a shopper experiences, derived from the three switches (maintenance overrides the rest). */
export type ShopperView = 'hidden' | 'maintenance' | 'browseOnly' | 'open';
export function shopperView(s: StoreStatus, now = Date.now()): ShopperView {
  if (!s.published) return 'hidden';
  if (maintenanceOn(s, now)) return 'maintenance';
  if (!s.accepting) return 'browseOnly';
  return 'open';
}

/** Maintenance is on until switched off, or until its scheduled end passes. */
export const maintenanceOn = (s: StoreStatus, now = Date.now()) => s.maintenance && !(s.until && now >= s.until);
/** Maintenance was scheduled to end and that time has passed (the switch still reads on until someone turns it off). */
export const maintenanceExpired = (s: StoreStatus, now = Date.now()) => s.maintenance && !!s.until && now >= s.until;
export type UntilIssue = 'format' | 'past' | 'far' | null;
/** A scheduled end must be in the future and within 30 days. */
export function untilIssue(ms: number | null, now: number): UntilIssue {
  if (ms === null) return null;
  if (Number.isNaN(ms)) return 'format';
  if (ms <= now) return 'past';
  if (ms - now > 30 * 86_400_000) return 'far';
  return null;
}

export const MAINT_MAX = 160;
export const maintenanceError = (m: string): 'empty' | 'long' | null => (!m.trim() ? 'empty' : m.length > MAINT_MAX ? 'long' : null);

/** Flip one switch only; turning maintenance on requires a message. Returns null when the change is not allowed. */
export function toggleStatus(s: StoreStatus, key: StatusKey, message?: string, until?: number | null, now = Date.now()): StoreStatus | null {
  if (key === 'maintenance' && !maintenanceOn(s, now)) {
    const m = message ?? s.message;
    if (maintenanceError(m)) return null;
    if (until !== undefined && untilIssue(until, now)) return null;
    return { ...s, maintenance: true, message: m.trim(), until: until ?? undefined };
  }
  if (key === 'maintenance') return { ...s, maintenance: false, until: undefined };
  return { ...s, [key]: !s[key] };
}
