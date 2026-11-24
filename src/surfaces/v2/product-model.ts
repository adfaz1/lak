// Product editor (v2): editor state, save lifecycle and presentation helpers over the existing catalogue domain.
// Same data and rules as the current workspace editor (validateDraft, fromDraft, draftsStore, levelsStore).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createStore } from '../../core/store';
import { vatIncluded } from '../../core/format';
import { LOC_IDS, type L } from '../merchant/domain';
import {
  emptyDraft, fromDraft, parseIntStrict, parseMoney, takenSkus, toDraft, validateDraft,
  type DraftError, type Media, type Product, type ProductDraft,
} from '../merchant/catalog';
import { draftsStore, levelsStore, productsStore } from '../merchant/stores';
import { productImage } from './data';

/* ---------- Draft ---------- */

/** The catalogue draft plus the two fields this editor adds: stock tracking and category. Stored in the same drafts store. */
export interface EditDraft extends ProductDraft { track: boolean; category: L }

/** Stock tracking per product (the catalogue model has no field for it yet). Defaults to tracked. */
export const trackStore = createStore.key('v2.productTrack')<Record<string, boolean>>(() => ({}));

export const CATEGORIES: L[] = [
  { ar: 'أزياء', en: 'Fashion' }, { ar: 'عطور', en: 'Fragrance' }, { ar: 'حقائب', en: 'Bags' }, { ar: 'منزل', en: 'Home' },
  { ar: 'هدايا', en: 'Gifts' }, { ar: 'أغذية', en: 'Food' }, { ar: 'عام', en: 'General' },
];

function baseDraft(p: Product | undefined): EditDraft {
  if (!p) return { ...emptyDraft(), track: true, category: CATEGORIES[0] };
  return { ...toDraft(p), track: trackStore.get()[p.id] ?? true, category: p.category };
}

export type SaveState = 'clean' | 'dirty' | 'saving' | 'failed' | 'saved';

/** Field keys in the order they appear on the page, so "first error" means the first one the merchant meets. */
const FIELD_ORDER = ['nameAr', 'nameEn', 'media', 'price', 'compareAt', 'cost', 'sku', 'stock', 'colors', 'sizes', 'v.', 'weight', 'slug'];
const orderOf = (k: string) => { const i = FIELD_ORDER.findIndex((f) => k === f || k.startsWith(f)); return i < 0 ? 99 : i; };
const subOrder = (k: string) => { const n = k.split('.').map(Number).filter((x) => !Number.isNaN(x)); return n[0] ?? 0; };
const colOrder = (k: string) => (k.endsWith('sku') ? 0 : k.endsWith('price') ? 1 : 2);

/** DOM id of the input that carries an error key. */
export const fieldId = (k: string) => (k.startsWith('media.') ? `pe-alt-${k.split('.')[1]}` : k.startsWith('v.') ? `pe-v-${k.split('.')[1]}-${k.split('.')[2]}` : `pe-${k}`);
export const errId = (k: string) => `${fieldId(k)}-err`;

/** Section each error key belongs to (for the section index and the summary). */
export type SectionId = 'basics' | 'media' | 'pricing' | 'inventory' | 'variants' | 'shipping' | 'seo' | 'publishing';
export function sectionOf(k: string): SectionId {
  if (k === 'nameAr' || k === 'nameEn') return 'basics';
  if (k.startsWith('media')) return 'media';
  if (k === 'price' || k === 'compareAt' || k === 'cost') return 'pricing';
  if (k === 'sku' || k === 'stock') return 'inventory';
  if (k === 'weight') return 'shipping';
  if (k === 'slug') return 'seo';
  return 'variants';
}

export interface Editor {
  key: string;
  isNew: boolean;
  product: Product | undefined;
  draft: EditDraft;
  set: (patch: Partial<EditDraft>) => void;
  state: SaveState;
  dirty: boolean;
  restored: boolean;
  errors: Record<string, DraftError>;
  errorKeys: string[];
  showErr: boolean;
  /** Error for a field, only once the merchant has tried to save. */
  fe: (k: string) => DraftError | undefined;
  save: () => void;
  discard: () => void;
  failNext: boolean;
  setFailNext: (v: boolean) => void;
  savedVersion: number | null;
  /** Bumped on each failed save attempt so the summary can take focus again. */
  attempt: number;
}

/**
 * Editor lifecycle. Typing is kept in the session drafts store (survives navigation, never counted as saved);
 * "saved" only after the simulated server round trip succeeds.
 */
export function useEditor(key: string, product: Product | undefined, onSaved: (p: Product, isNew: boolean) => void): Editor {
  const isNew = !product;
  const base = useMemo(() => baseDraft(product), [product?.id, product?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const stored = draftsStore.get()[key] as EditDraft | undefined;
  const [draft, setDraft] = useState<EditDraft>(() => (stored ? { ...base, ...stored } : base));
  const [state, setState] = useState<SaveState>(() => (stored ? 'dirty' : 'clean'));
  const [restored] = useState(!!stored);
  const [showErr, setShowErr] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const products = productsStore.use();
  const errors = useMemo(() => {
    const e = validateDraft(draft, takenSkus(products, product?.id));
    // Stock is entered here only when creating a tracked physical product.
    if (!(isNew && draft.track && draft.type === 'physical')) delete e.stock;
    return e;
  }, [draft, products, product?.id, isNew]);
  const errorKeys = useMemo(() => Object.keys(errors).sort((a, b) => orderOf(a) - orderOf(b) || subOrder(a) - subOrder(b) || colOrder(a) - colOrder(b)), [errors]);

  const set = useCallback((patch: Partial<EditDraft>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    draftsStore.set((d) => ({ ...d, [key]: next }));
    setState((s) => (s === 'saving' ? s : 'dirty'));
  }, [key]);

  const clearStored = () => draftsStore.set((d) => { const n = { ...d }; delete n[key]; return n; });
  const discard = () => { setDraft(base); draftRef.current = base; clearStored(); setState('clean'); setShowErr(false); };

  const save = () => {
    if (state === 'saving') return;
    setShowErr(true);
    setAttempt((a) => a + 1);
    if (errorKeys.length) return;
    setState('saving');
    const willFail = failNext;
    const d = draftRef.current;
    setTimeout(() => {
      if (willFail) { setState('failed'); setFailNext(false); return; }
      const all = productsStore.get();
      const newId = isNew ? `p${Math.max(0, ...all.map((p) => Number(p.id.slice(1)) || 0)) + 1}` : product!.id;
      const version = (product?.version ?? 0) + 1;
      const saved: Product = { ...fromDraft(d, newId, version, d.media), category: d.category };
      productsStore.set(isNew ? [saved, ...all] : all.map((p) => (p.id === newId ? saved : p)));
      trackStore.set((t) => ({ ...t, [newId]: d.track }));
      // New SKUs start at the Riyadh warehouse with the quantity typed here; later changes go through Inventory with a reason.
      const known = new Set(levelsStore.get().map((x) => x.sku));
      const fresh: { sku: string; qty: number }[] = !d.track || saved.type === 'digital' ? [] : d.variants.length
        ? d.variants.filter((v) => !known.has(v.sku.trim())).map((v) => ({ sku: v.sku.trim(), qty: parseIntStrict(v.stock || '0') ?? 0 }))
        : !known.has(saved.sku) ? [{ sku: saved.sku, qty: parseIntStrict(d.stock || '0') ?? 0 }] : [];
      if (fresh.length) levelsStore.set((ls) => [...ls, ...fresh.flatMap((f) => LOC_IDS.map((loc) => ({ sku: f.sku, loc, onHand: loc === 'ryd' ? f.qty : 0, reserved: 0, incoming: 0, version: 1, threshold: 3 })))]);
      clearStored();
      setSavedVersion(version);
      setState('saved');
      setShowErr(false);
      onSaved(saved, isNew);
    }, 900);
  };

  return {
    key, isNew, product, draft, set, state, dirty: state === 'dirty' || state === 'failed' || state === 'saving', restored,
    errors, errorKeys, showErr, fe: (k) => (showErr ? errors[k] : undefined), save, discard, failNext, setFailNext, savedVersion, attempt,
  };
}

/* ---------- Leave protection ---------- */

/** Warn before leaving with unsaved edits: the browser prompt on reload/close, an in-app confirm on internal links. */
export function useLeaveGuard(dirty: boolean, onBlocked: (href: string) => void) {
  const cb = useRef(onBlocked);
  cb.current = onBlocked;
  useEffect(() => {
    if (!dirty) return;
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      const href = a?.getAttribute('href');
      if (!a || !href || !href.startsWith('#/') || a.hasAttribute('data-leave-ok') || e.defaultPrevented) return;
      e.preventDefault();
      cb.current(href);
    };
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    document.addEventListener('click', click, true);
    window.addEventListener('beforeunload', unload);
    return () => { document.removeEventListener('click', click, true); window.removeEventListener('beforeunload', unload); };
  }, [dirty]);
}

/* ---------- Money ---------- */

/** Price breakdown. Prices are VAT-inclusive (15%); cost is entered excluding VAT, so profit is measured on the net price. */
export function economics(price: string, cost: string) {
  const p = parseMoney(price);
  const c = cost.trim() ? parseMoney(cost) : null;
  if (p === null || p === 0) return null;
  const vat = vatIncluded(p);
  const net = p - vat;
  if (c === null) return { price: p, vat, net, cost: null, profit: null, pct: null };
  const profit = net - c;
  return { price: p, vat, net, cost: c, profit, pct: Math.round((profit * 1000) / net) / 10 };
}

/** Percentage off when a valid compare-at price is above the price. */
export function discountPct(price: string, compareAt: string): number | null {
  const p = parseMoney(price);
  const c = compareAt.trim() ? parseMoney(compareAt) : null;
  if (p === null || c === null || c <= p || p === 0) return null;
  return Math.round(((c - p) * 100) / c);
}

/* ---------- Media ---------- */

/** Fixture media ids mapped to the licensed product photos. */
const FIXTURE_SRC: Record<string, string> = { m1: '/products/p1.jpg', m2: '/products/p1-2.jpg', m3: '/products/p2.jpg', m4: '/products/p3.jpg' };
const PHOTO = 'ph:';
export function mediaSrc(m: Media): string | undefined {
  if (m.id.startsWith(PHOTO)) return m.id.slice(PHOTO.length).split('#')[0];
  return FIXTURE_SRC[m.id];
}
export interface LibraryPhoto { src: string; label: L }
/** Photos offered by "Add photos": this product's own set first, then the store's other product photos. No file is uploaded. */
export function photoLibrary(productId: string | undefined, inUse: Set<string>): LibraryPhoto[] {
  const own = productId === 'p1' ? ['p1', 'p1-2', 'p1-3'] : productId === 'p3' ? ['p3', 'p3-2'] : productId ? [productId] : [];
  const rest = Array.from({ length: 12 }, (_, i) => `p${i + 1}`).filter((x) => !own.includes(x));
  return [...own, ...rest].filter((n) => n !== 'p7').map((n) => ({ src: `/products/${n}.jpg`, label: { ar: `صورة ${n}`, en: `Photo ${n}` } })).filter((p) => !inUse.has(p.src));
}
export const photoMedia = (src: string, n: number): Media => ({ id: `${PHOTO}${src}#${Date.now().toString(36)}${n}`, label: { ar: 'صورة', en: 'Photo' }, alt: '' });

export { productImage };

/* ---------- Variants ---------- */

const SWATCH: Record<string, string> = {
  black: '#1d1f29', navy: '#22305e', white: '#ffffff', beige: '#dccbad', red: '#b8322b', green: '#2f6b4f', blue: '#2f5fb3',
  brown: '#6b4a32', grey: '#8a8f9e', gray: '#8a8f9e', gold: '#c9a04a', pink: '#e7a3b8', cream: '#f3ead8', olive: '#6d6b3a',
};
export const swatchOf = (c: string) => SWATCH[c.trim().toLowerCase()];
