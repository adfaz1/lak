// Online store: pure rules for the theme draft, publishing, rollback and store status. No React.
// Theme versioning (diffSections, moveSection, publishTheme, rollbackTheme) lives in merchant/workspace.ts.
import {
  diffSections, moveSection, publishTheme, rollbackTheme,
  type Section, type SectionChange, type StoreStatus, type ThemeState,
} from '../../merchant/workspace';

/** The demo store's own palette (same values as the shopper store, src/surfaces/storefront/styles.css), not LAK's. */
export const STORE_PALETTE = { bg: '#f8f5f0', paper: '#fffdf9', tile: '#efe9e1', sand: '#f1ebe2', ink: '#1e1b18', muted: '#675e55', line: '#e6dfd5', accent: '#84603d', sale: '#9a2f1d' } as const;

export const HEADING_MAX = 60;
export const headingError = (h: string): 'empty' | 'long' | null => (!h.trim() ? 'empty' : h.length > HEADING_MAX ? 'long' : null);

/** Changes between the live version and the draft, excluding unchanged sections. */
export const pendingChanges = (t: ThemeState): SectionChange[] => diffSections(t.published.sections, t.draft).filter((c) => c.kind !== 'unchanged');
export const changeOf = (t: ThemeState, id: string) => pendingChanges(t).find((c) => c.id === id)?.kind ?? null;
export const nextVersion = (t: ThemeState) => Math.max(...t.history.map((h) => h.version)) + 1;

export type PublishBlock = 'noChanges' | 'invalid' | null;
export function publishBlock(t: ThemeState): PublishBlock {
  if (t.draft.some((s) => headingError(s.heading))) return 'invalid';
  if (!pendingChanges(t).length) return 'noChanges';
  return null;
}

export const updateSection = (t: ThemeState, id: string, p: Partial<Section>): ThemeState => ({ ...t, draft: t.draft.map((s) => (s.id === id ? { ...s, ...p } : s)) });
export const move = (t: ThemeState, id: string, dir: -1 | 1): ThemeState => ({ ...t, draft: moveSection(t.draft, id, dir) });
export const discardDraft = (t: ThemeState): ThemeState => ({ ...t, draft: t.published.sections.map((s) => ({ ...s })) });
export const publish = (t: ThemeState, note: string) => publishTheme(t, note.trim() || 'Update');
export const canRollback = (t: ThemeState, v: number) => v !== t.published.version && t.history.some((h) => h.version === v);
export { rollbackTheme };

/** What the preview shows: visible sections in draft order. */
export const previewSections = (draft: Section[]) => draft.filter((s) => s.visible);

/* ---------- Store status: three separate decisions ---------- */

export type StatusKey = 'published' | 'accepting' | 'maintenance';
/** What a shopper experiences, derived from the three switches (maintenance overrides the rest). */
export type ShopperView = 'hidden' | 'maintenance' | 'browseOnly' | 'open';
export function shopperView(s: StoreStatus): ShopperView {
  if (!s.published) return 'hidden';
  if (s.maintenance) return 'maintenance';
  if (!s.accepting) return 'browseOnly';
  return 'open';
}

export const MAINT_MAX = 160;
export const maintenanceError = (m: string): 'empty' | 'long' | null => (!m.trim() ? 'empty' : m.length > MAINT_MAX ? 'long' : null);

/** Flip one switch only; turning maintenance on requires a message. Returns null when the change is not allowed. */
export function toggleStatus(s: StoreStatus, key: StatusKey, message?: string): StoreStatus | null {
  if (key === 'maintenance' && !s.maintenance) {
    const m = message ?? s.message;
    if (maintenanceError(m)) return null;
    return { ...s, maintenance: true, message: m.trim() };
  }
  return { ...s, [key]: !s[key] };
}
