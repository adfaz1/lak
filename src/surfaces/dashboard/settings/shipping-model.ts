// Shipping rules engine (pure). One answer to "what does a shopper in city X with cart Y see": which methods, at
// what price, with which delivery promise, whether cash on delivery is offered, and why every other method is hidden.
// The dashboard's simulator and the online store's checkout and product pages both call `quote()`.
import type { L } from '../../merchant/domain';
import type { Location } from '../../merchant/domain';
import type { Product } from '../../merchant/catalog';
import { parseMoney } from '../../merchant/catalog';
import {
  shippingFixture,
  type Carrier, type IntlData, type ShipCat, type ShipMethodCfg, type ShipRule, type ShipThen, type ShipWhen, type ShippingSetup, type Zone,
} from '../../merchant/workspace';

const k = (ar: string, en: string): L => ({ ar, en });

/* ---------- Reference data ---------- */

/** Saudi cities the simulator offers. The first seven ids are the online store's delivery cities. */
export const SA_CITIES: { id: string; name: L }[] = [
  { id: 'riyadh', name: k('الرياض', 'Riyadh') }, { id: 'jeddah', name: k('جدة', 'Jeddah') }, { id: 'dammam', name: k('الدمام', 'Dammam') },
  { id: 'makkah', name: k('مكة المكرمة', 'Makkah') }, { id: 'madinah', name: k('المدينة المنورة', 'Madinah') }, { id: 'abha', name: k('أبها', 'Abha') },
  { id: 'tabuk', name: k('تبوك', 'Tabuk') }, { id: 'khobar', name: k('الخبر', 'Al Khobar') }, { id: 'taif', name: k('الطائف', 'Taif') },
  { id: 'buraidah', name: k('بريدة', 'Buraidah') }, { id: 'hail', name: k('حائل', 'Hail') }, { id: 'jazan', name: k('جازان', 'Jazan') },
];
export const COUNTRIES: { id: string; name: L }[] = [
  { id: 'AE', name: k('الإمارات', 'UAE') }, { id: 'KW', name: k('الكويت', 'Kuwait') }, { id: 'BH', name: k('البحرين', 'Bahrain') },
  { id: 'QA', name: k('قطر', 'Qatar') }, { id: 'OM', name: k('عُمان', 'Oman') }, { id: 'JO', name: k('الأردن', 'Jordan') },
  { id: 'GB', name: k('المملكة المتحدة', 'United Kingdom') }, { id: 'US', name: k('الولايات المتحدة', 'United States') },
];
/** Countries of origin offered for customs data. */
export const ORIGINS: { id: string; name: L }[] = [
  { id: 'SA', name: k('السعودية', 'Saudi Arabia') }, { id: 'AE', name: k('الإمارات', 'UAE') }, { id: 'TR', name: k('تركيا', 'Türkiye') },
  { id: 'CN', name: k('الصين', 'China') }, { id: 'IN', name: k('الهند', 'India') }, { id: 'FR', name: k('فرنسا', 'France') }, { id: 'IT', name: k('إيطاليا', 'Italy') },
];
export const cityName = (id: string): L => SA_CITIES.find((c) => c.id === id)?.name ?? k(id, id);
export const countryName = (id: string): L => COUNTRIES.find((c) => c.id === id)?.name ?? ORIGINS.find((c) => c.id === id)?.name ?? k(id, id);

export const CAT_LABEL: Record<ShipCat, L> = {
  standard: k('عادي', 'Standard'), express: k('سريع', 'Express'), economy: k('اقتصادي', 'Economy'), sameday: k('نفس اليوم', 'Same day'),
  cold: k('مبرّد', 'Refrigerated'), intl: k('دولي', 'International'), pickup: k('استلام من الفرع', 'Pickup'),
};

/** Category key from a product category ("Fragrance" → "fragrance"); the same key the online store uses. */
export const catKey = (c: L): string => c.en.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';

/** The setup saved in this session, or the starting setup for sessions saved before shipping existed. */
export const setupOf = (s: ShippingSetup | undefined): ShippingSetup => s ?? shippingFixture();

/* ---------- Zones ---------- */

const parts = (s: string) => s.split(/[,،]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
const CATCH_ALL = /other|all\b|أخرى|كل/i;
/** The shipping zone covering a city: the zone that lists it, else a zone for "all other cities". */
export function zoneForCity(zones: Zone[], city: L): Zone | undefined {
  return zones.find((z) => parts(z.cities.en).includes(city.en.toLowerCase()) || parts(z.cities.ar).includes(city.ar))
    ?? zones.find((z) => CATCH_ALL.test(z.cities.en) || CATCH_ALL.test(z.cities.ar));
}

/* ---------- Quote ---------- */

export interface CartIn { goods: number; weightG: number; cats: string[]; productIds: string[] }
export type Dest = { country: 'SA'; city: string } | { country: string; city?: undefined };
export interface Offer {
  id: string; cat: ShipCat; name: L; carrier: Carrier | null;
  /** Price before rules and thresholds, and what the shopper pays. Halalas. */
  base: number; price: number;
  /** Threshold that would make it free (shown as "free from"), when not already free. */
  freeFrom: number | null;
  applied: L[];
  handling: number; transit: [number, number];
  /** Same-day promise: true = leaves today, false = after the cut-off (tomorrow). */
  today?: boolean;
  codOk: boolean; codWhy?: L;
}
export interface Hidden { id: string; name: L; why: L }
export interface Quote { offers: Offer[]; hidden: Hidden[]; zone?: Zone; warehouse?: { id: string; name: L; auto: boolean } }

const kgOf = (g: number) => g / 1000;
const priceFor = (first: number, perKg: number, g: number) => first + Math.max(0, Math.ceil(kgOf(g)) - 1) * perKg;
const intersects = (a: string[], b: string[]) => a.some((x) => b.includes(x));
const riyadhHour = (now: number) => new Date(now + 3 * 3_600_000).getUTCHours();

export function ruleMatches(w: ShipWhen, dest: Dest, cart: CartIn, cod: boolean): boolean {
  const kg = kgOf(cart.weightG);
  if (w.cities?.length && (dest.country !== 'SA' || !w.cities.includes(dest.city!))) return false;
  if (w.cartMin !== undefined && cart.goods < w.cartMin) return false;
  if (w.cartMax !== undefined && cart.goods > w.cartMax) return false;
  if (w.kgMin !== undefined && kg < w.kgMin) return false;
  if (w.kgMax !== undefined && kg > w.kgMax) return false;
  if (w.cats?.length && !intersects(w.cats, cart.cats)) return false;
  if (w.cod !== undefined && w.cod !== cod) return false;
  return true;
}

export interface QuoteOpts {
  now: number;
  /** The shopper is paying cash on delivery (rules with "COD" conditions). */
  cod?: boolean;
  locations?: Location[];
  products?: Product[];
}

/** Every method the shopper sees for a destination and cart, cheapest first, plus each hidden method and why. */
export function quote(setup: ShippingSetup, zones: Zone[], dest: Dest, cart: CartIn, o: QuoteOpts): Quote {
  const abroad = dest.country !== 'SA';
  const city = abroad ? undefined : cityName(dest.city!);
  const zone = city ? zoneForCity(zones, city) : undefined;
  const promise = zone ? setup.promises.find((p) => p.zoneId === zone.id) : undefined;
  const handling = promise?.handling ?? 1;
  const extra = promise?.extra ?? 0;
  const kg = kgOf(cart.weightG);
  const offers: Offer[] = [];
  const hidden: Hidden[] = [];
  const notReady = abroad && o.products ? cart.productIds.filter((id) => {
    const p = o.products!.find((x) => x.id === id);
    if (p?.type === 'bundle') return (p.spec?.bundle ?? []).some((b) => { const c = o.products!.find((x) => x.sku === b.sku || x.variants.some((v) => v.sku === b.sku)); return !!c && readiness(c, setup.intl[c.id]).pct < 100; });
    return p && customsItem(p) && readiness(p, setup.intl[id]).pct < 100;
  }).length : 0;

  for (const m of setup.methods) {
    const hide = (why: L) => hidden.push({ id: m.id, name: m.name, why });
    const carrier = m.carrier ? setup.carriers.find((c) => c.id === m.carrier) ?? null : null;
    if (!m.on) { hide(k('موقوفة', 'Turned off')); continue; }
    if (m.cat === 'intl' && !abroad) { hide(k('للعناوين خارج السعودية فقط', 'Only for addresses outside Saudi Arabia')); continue; }
    if (m.cat !== 'intl' && abroad) { hide(k('للعناوين داخل السعودية فقط', 'Only for addresses in Saudi Arabia')); continue; }
    if (m.carrier && !carrier) { hide(k('شركة الشحن غير موجودة', 'Carrier missing')); continue; }
    if (carrier?.state === 'action_required') { hide(k(`حساب ${carrier.name.ar} يحتاج إجراءً`, `${carrier.name.en} account needs action`)); continue; }
    let pickupLoc: Location | undefined;
    if (m.cat === 'pickup') {
      pickupLoc = o.locations?.find((l) => l.id === m.pickupLoc);
      if (!pickupLoc || !pickupLoc.active || !pickupLoc.pickup) { hide(k('الموقع لا يسمح بالاستلام (المخزون ← المواقع)', 'Location doesn’t allow pickup (Inventory → Locations)')); continue; }
      if (city && pickupLoc.city.en.toLowerCase() !== city.en.toLowerCase()) { hide(k(`الاستلام في ${pickupLoc.city.ar} فقط`, `Pickup in ${pickupLoc.city.en} only`)); continue; }
    }
    if (carrier && !abroad && !carrier.cities.includes('*') && !carrier.cities.includes(dest.city!)) { hide(k(`${carrier.name.ar} لا يخدم هذه المدينة`, `${carrier.name.en} doesn’t serve this city`)); continue; }
    if (carrier && abroad && !carrier.countries.includes(dest.country)) { hide(k(`${carrier.name.ar} لا يشحن لهذه الدولة`, `${carrier.name.en} doesn’t ship to this country`)); continue; }
    if (!abroad && m.cities.length && !m.cities.includes(dest.city!)) { hide(k('غير مفعّلة لهذه المدينة', 'Not enabled for this city')); continue; }
    if (m.onlyCats.length && !intersects(m.onlyCats, cart.cats)) { hide(k('تظهر فقط لفئات محددة', 'Shown only for certain categories')); continue; }
    if (m.maxKg !== null && kg > m.maxKg) { hide(k(`أثقل من ${m.maxKg} كجم`, `Heavier than ${m.maxKg} kg`)); continue; }
    if (m.cat === 'intl' && notReady) { hide(k(`${notReady} منتج غير جاهز للتخليص الجمركي`, `${notReady} product(s) not ready for customs`)); continue; }
    let base: number;
    let threshold = m.freeOver;
    if (m.price === null) {
      if (!zone) { hide(k('لا منطقة شحن تغطي المدينة', 'No shipping zone covers the city')); continue; }
      base = zone.rateType === 'flat' ? zone.rate : priceFor(zone.rate, zone.perKg, cart.weightG);
      if (zone.freeOver !== null) threshold = threshold === null ? zone.freeOver : Math.min(threshold, zone.freeOver);
    } else base = priceFor(m.price, m.perKg, cart.weightG);

    let price = base;
    const applied: L[] = [];
    let hiddenBy: ShipRule | undefined;
    for (const r of setup.rules) {
      if (!r.on || (r.methods.length && !r.methods.includes(m.id)) || !ruleMatches(r.when, dest, cart, !!o.cod)) continue;
      if (r.then.kind === 'hide') { hiddenBy = r; break; }
      price = applyThen(r.then, price);
      applied.push(r.name);
    }
    if (hiddenBy) { hide(k(`أخفتها القاعدة «${hiddenBy.name.ar}»`, `Hidden by rule “${hiddenBy.name.en}”`)); continue; }
    if (threshold !== null && cart.goods >= threshold && price > 0) { price = 0; applied.push(k('شحن مجاني فوق الحد', 'Free over threshold')); }

    let h = handling;
    let transit: [number, number] = carrier ? [carrier.eta[0] + (abroad ? 0 : extra), carrier.eta[1] + (abroad ? 0 : extra)] : [0, 0];
    let today: boolean | undefined;
    if (m.cat === 'sameday') { today = riyadhHour(o.now) < setup.sameDayCutoff; h = today ? 0 : 1; transit = [0, 0]; }
    if (m.cat === 'pickup') transit = [0, 0];

    const cod = codFor(setup, m, carrier, dest, cart);
    offers.push({ id: m.id, cat: m.cat, name: m.name, carrier, base, price, freeFrom: price > 0 ? threshold : null, applied, handling: h, transit, today, ...cod });
  }
  offers.sort((a, b) => a.price - b.price || a.handling + a.transit[0] - (b.handling + b.transit[0]));
  return { offers, hidden, zone, warehouse: warehouseFor(setup, zone, o.locations) };
}

function applyThen(t: ShipThen, price: number): number {
  switch (t.kind) {
    case 'free': return 0;
    case 'price': return t.v;
    case 'surcharge': return price + t.v;
    default: return price;
  }
}

/** Cash on delivery with a method: the method and its carrier must allow it, and no exception may apply. */
export function codFor(setup: ShippingSetup, m: ShipMethodCfg, carrier: Carrier | null, dest: Dest, cart: CartIn): { codOk: boolean; codWhy?: L } {
  if (m.cat === 'pickup') return { codOk: false, codWhy: k('ادفع إلكترونيًا مع الاستلام من الفرع', 'Pay online for pickup') };
  if (!m.cod) return { codOk: false, codWhy: k('غير مفعّل مع هذه الطريقة', 'Not enabled for this method') };
  if (carrier && !carrier.cod) return { codOk: false, codWhy: k('شركة الشحن لا تحصّل نقدًا', 'The carrier doesn’t collect cash') };
  if (dest.country !== 'SA') return { codOk: false, codWhy: k('غير متاح خارج السعودية', 'Not available abroad') };
  if (setup.cod.exceptCities.includes(dest.city!)) return { codOk: false, codWhy: k('مستثنى في هذه المدينة', 'Excluded in this city') };
  if (intersects(setup.cod.exceptCats, cart.cats)) return { codOk: false, codWhy: k('السلة فيها فئة مستثناة', 'The cart has an excluded category') };
  if (setup.cod.maxKg !== null && kgOf(cart.weightG) > setup.cod.maxKg) return { codOk: false, codWhy: k(`أثقل من ${setup.cod.maxKg} كجم`, `Heavier than ${setup.cod.maxKg} kg`) };
  return { codOk: true };
}

/** The warehouse that ships to a zone: the merchant's choice for that zone when auto-pick is on and it can ship, else the default. */
export function warehouseFor(setup: ShippingSetup, zone: Zone | undefined, locations: Location[] | undefined): Quote['warehouse'] {
  if (!locations?.length) return undefined;
  const ok = (l?: Location) => !!l && l.active && l.ships;
  const def = locations.find((l) => l.isDefault && ok(l)) ?? locations.find(ok);
  const pick = setup.autoWarehouse && zone ? locations.find((l) => l.id === setup.warehouseByZone[zone.id]) : undefined;
  const use = ok(pick) ? pick! : def;
  return use && { id: use.id, name: use.name, auto: use === pick };
}

/** Business days added to a timestamp (Friday and Saturday off). */
export function addWorkDays(from: number, days: number): number {
  let d = from;
  let left = days;
  while (left > 0) {
    d += 86_400_000;
    const wd = new Date(d + 3 * 3_600_000).getUTCDay();
    if (wd !== 5 && wd !== 6) left--;
  }
  return d;
}
/** The delivery window promised to the shopper: preparation plus transit, in calendar dates. */
export const promiseDates = (o: Pick<Offer, 'handling' | 'transit'>, now: number) => ({ from: addWorkDays(now, o.handling + o.transit[0]), to: addWorkDays(now, o.handling + o.transit[1]) });

/* ---------- International readiness ---------- */

/**
 * Products that cross customs as themselves: physical goods and food. Downloads, codes, services and bookings never
 * ship; a bundle ships as its components, which are listed (and checked) on their own.
 */
export const customsItem = (p: Pick<Product, 'type'>) => (p.type ?? 'physical') === 'physical' || p.type === 'food';

export type IntlField = 'hs' | 'weight' | 'origin' | 'descAr' | 'descEn';
export const INTL_FIELDS: IntlField[] = ['hs', 'weight', 'origin', 'descAr', 'descEn'];
const latin = (x: string) => x.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
/** HS code: 6 to 10 digits, dots allowed ("6204.49", "620449"). Arabic digits are accepted. */
export const normHs = (s: string) => latin(s).replace(/\s/g, '');
export const validHs = (s: string) => { const d = normHs(s).replace(/\./g, ''); return /^\d{6,10}$/.test(d) && /^[\d.]+$/.test(normHs(s)); };
export function readiness(p: Pick<Product, 'weight' | 'type'>, d: IntlData | undefined): { pct: number; missing: IntlField[] } {
  const missing = INTL_FIELDS.filter((f) => {
    switch (f) {
      case 'hs': return !d?.hs || !validHs(d.hs);
      case 'weight': return !p.weight || p.weight <= 0;
      case 'origin': return !d?.origin;
      case 'descAr': return !d?.descAr.trim();
      case 'descEn': return !d?.descEn.trim();
    }
  });
  return { pct: Math.round(((INTL_FIELDS.length - missing.length) / INTL_FIELDS.length) * 100), missing };
}
/** Suggested HS headings by product category (a starting point the merchant confirms, not a customs ruling). */
export const HS_BY_CAT: Record<string, string> = { fashion: '6204.49', fragrance: '3303.00', bags: '4202.21', home: '6304.99', gifts: '4911.99' };

export interface BulkFill { hs: boolean; origin: string | null; desc: boolean }
/**
 * Fill customs data for many products at once: HS from the category suggestion, one origin, descriptions from
 * the product names. Only empty fields are filled; nothing the merchant typed is overwritten.
 */
export function bulkFill(intl: Record<string, IntlData>, products: Product[], ids: string[], f: BulkFill): { intl: Record<string, IntlData>; changed: string[] } {
  const next = { ...intl };
  const changed: string[] = [];
  for (const id of ids) {
    const p = products.find((x) => x.id === id);
    if (!p || p.type === 'digital') continue;
    const cur: IntlData = next[id] ?? { hs: '', origin: '', descAr: '', descEn: '' };
    const upd: IntlData = {
      hs: cur.hs || (f.hs ? HS_BY_CAT[catKey(p.category)] ?? '' : ''),
      origin: cur.origin || (f.origin ?? ''),
      descAr: cur.descAr || (f.desc ? p.name.ar : ''),
      descEn: cur.descEn || (f.desc ? p.name.en : ''),
    };
    if (JSON.stringify(upd) !== JSON.stringify(cur)) { next[id] = upd; changed.push(id); }
  }
  return { intl: next, changed };
}

/* ---------- Drafts and validation (Arabic digits accepted) ---------- */

const money = (s: string) => (s.trim() ? parseMoney(latin(s)) : null);
const kgNum = (s: string) => { const n = Number(latin(s).trim()); return s.trim() && Number.isFinite(n) && n > 0 && n <= 1000 ? n : null; };
const riy = (h: number | null) => (h === null ? '' : (h / 100).toFixed(2));

export interface MethodDraft { id: string; cat: ShipCat; nameAr: string; nameEn: string; carrier: string; zonePrice: boolean; price: string; perKg: string; free: string; cities: string[]; onlyCats: string[]; maxKg: string; cod: boolean; pickupLoc: string }
export const methodDraft = (m: ShipMethodCfg): MethodDraft => ({
  id: m.id, cat: m.cat, nameAr: m.name.ar, nameEn: m.name.en, carrier: m.carrier ?? '', zonePrice: m.price === null, price: riy(m.price ?? 2500), perKg: riy(m.perKg),
  free: riy(m.freeOver), cities: [...m.cities], onlyCats: [...m.onlyCats], maxKg: m.maxKg === null ? '' : String(m.maxKg), cod: m.cod, pickupLoc: m.pickupLoc ?? '',
});
export type MethodErrors = Partial<Record<'name' | 'carrier' | 'price' | 'perKg' | 'free' | 'maxKg' | 'cities', true>>;
export function parseMethod(d: MethodDraft, on: boolean): { ok: true; method: ShipMethodCfg } | { ok: false; errors: MethodErrors } {
  const e: MethodErrors = {};
  const price = d.zonePrice ? null : money(d.price);
  const perKg = d.perKg.trim() ? money(d.perKg) : 0;
  const free = money(d.free);
  if (!d.nameAr.trim() && !d.nameEn.trim()) e.name = true;
  if (d.cat !== 'pickup' && !d.carrier) e.carrier = true;
  if (!d.zonePrice && price === null) e.price = true;
  if (perKg === null) e.perKg = true;
  if (d.free.trim() && (free === null || free === 0)) e.free = true;
  if (d.maxKg.trim() && kgNum(d.maxKg) === null) e.maxKg = true;
  if (d.cat === 'sameday' && !d.cities.length) e.cities = true;
  if (Object.keys(e).length) return { ok: false, errors: e };
  const nm: L = { ar: d.nameAr.trim() || d.nameEn.trim(), en: d.nameEn.trim() || d.nameAr.trim() };
  return {
    ok: true,
    method: {
      id: d.id, cat: d.cat, name: nm, on, carrier: d.cat === 'pickup' ? null : d.carrier, price, perKg: perKg ?? 0, freeOver: d.free.trim() ? free : null,
      cities: d.cities, onlyCats: d.onlyCats, maxKg: d.maxKg.trim() ? kgNum(d.maxKg) : null, cod: d.cat === 'pickup' ? false : d.cod,
      ...(d.cat === 'pickup' ? { pickupLoc: d.pickupLoc || undefined } : {}),
    },
  };
}

export interface RuleDraft { id: string; nameAr: string; nameEn: string; methods: string[]; cities: string[]; cartMin: string; cartMax: string; kgMin: string; kgMax: string; cats: string[]; cod: '' | 'yes' | 'no'; then: ShipThen['kind']; value: string }
export const ruleDraft = (r: ShipRule | null, id: string): RuleDraft => r ? {
  id: r.id, nameAr: r.name.ar, nameEn: r.name.en, methods: [...r.methods], cities: [...(r.when.cities ?? [])], cartMin: riy(r.when.cartMin ?? null), cartMax: riy(r.when.cartMax ?? null),
  kgMin: r.when.kgMin?.toString() ?? '', kgMax: r.when.kgMax?.toString() ?? '', cats: [...(r.when.cats ?? [])], cod: r.when.cod === undefined ? '' : r.when.cod ? 'yes' : 'no',
  then: r.then.kind, value: r.then.kind === 'price' || r.then.kind === 'surcharge' ? riy(r.then.v) : '',
} : { id, nameAr: '', nameEn: '', methods: [], cities: [], cartMin: '', cartMax: '', kgMin: '', kgMax: '', cats: [], cod: '', then: 'free', value: '' };
export type RuleErrors = Partial<Record<'name' | 'cartMin' | 'cartMax' | 'kgMin' | 'kgMax' | 'value' | 'range' | 'when', true>>;
export function parseRule(d: RuleDraft, on: boolean): { ok: true; rule: ShipRule } | { ok: false; errors: RuleErrors } {
  const e: RuleErrors = {};
  const when: ShipWhen = {};
  if (d.cities.length) when.cities = d.cities;
  if (d.cats.length) when.cats = d.cats;
  if (d.cod) when.cod = d.cod === 'yes';
  const m = (s: string, key: 'cartMin' | 'cartMax') => { if (!s.trim()) return; const v = money(s); if (v === null) e[key] = true; else when[key] = v; };
  const w = (s: string, key: 'kgMin' | 'kgMax') => { if (!s.trim()) return; const v = kgNum(s); if (v === null) e[key] = true; else when[key] = v; };
  m(d.cartMin, 'cartMin'); m(d.cartMax, 'cartMax'); w(d.kgMin, 'kgMin'); w(d.kgMax, 'kgMax');
  if (when.cartMin !== undefined && when.cartMax !== undefined && when.cartMin > when.cartMax) e.range = true;
  if (when.kgMin !== undefined && when.kgMax !== undefined && when.kgMin > when.kgMax) e.range = true;
  if (!d.nameAr.trim() && !d.nameEn.trim()) e.name = true;
  let then: ShipThen = { kind: 'free' };
  if (d.then === 'hide') then = { kind: 'hide' };
  if (d.then === 'price' || d.then === 'surcharge') { const v = money(d.value); if (v === null || (d.then === 'surcharge' && v === 0)) e.value = true; else then = { kind: d.then, v }; }
  // A rule with no condition at all would apply to every cart: allowed only for price changes, never for hide/free.
  if (!Object.keys(when).length && (then.kind === 'hide' || then.kind === 'free') && !d.methods.length) e.when = true;
  if (Object.keys(e).length) return { ok: false, errors: e };
  return { ok: true, rule: { id: d.id, name: { ar: d.nameAr.trim() || d.nameEn.trim(), en: d.nameEn.trim() || d.nameAr.trim() }, on, methods: d.methods, when, then } };
}

/* ---------- Previews before saving ---------- */

/** Sample carts the previews run across every city: light, heavy and large. */
export const SAMPLE_CARTS: { id: string; label: L; cart: CartIn }[] = [
  { id: 'light', label: k('طلب خفيف 150 ر.س · 1 كجم', 'Light SAR 150 · 1 kg'), cart: { goods: 15000, weightG: 1000, cats: ['fashion'], productIds: [] } },
  { id: 'big', label: k('طلب كبير 600 ر.س · 3 كجم', 'Large SAR 600 · 3 kg'), cart: { goods: 60000, weightG: 3000, cats: ['fashion', 'fragrance'], productIds: [] } },
  { id: 'heavy', label: k('طلب ثقيل 400 ر.س · 18 كجم', 'Heavy SAR 400 · 18 kg'), cart: { goods: 40000, weightG: 18000, cats: ['home'], productIds: [] } },
];
export interface Change { city: string; cart: string; method: L; before: number | null; after: number | null }
/** What a change does at checkout: for each city and sample cart, methods whose price or visibility differ (null = hidden). */
export function impact(before: ShippingSetup, after: ShippingSetup, zones: Zone[], o: QuoteOpts): Change[] {
  const out: Change[] = [];
  for (const c of SA_CITIES) {
    for (const s of SAMPLE_CARTS) {
      const dest: Dest = { country: 'SA', city: c.id };
      const a = quote(before, zones, dest, s.cart, o).offers;
      const b = quote(after, zones, dest, s.cart, o).offers;
      const ids = [...new Set([...a.map((x) => x.id), ...b.map((x) => x.id)])];
      for (const id of ids) {
        const x = a.find((q) => q.id === id);
        const y = b.find((q) => q.id === id);
        if ((x?.price ?? null) !== (y?.price ?? null)) out.push({ city: c.id, cart: s.id, method: (y ?? x)!.name, before: x?.price ?? null, after: y?.price ?? null });
      }
    }
  }
  return out;
}

/** Header figures: methods on, rules on, products ready for international shipping. */
export function summary(setup: ShippingSetup, products: Product[]) {
  const physical = products.filter((p) => customsItem(p) && p.status !== 'archived');
  return {
    methodsOn: setup.methods.filter((m) => m.on).length,
    methods: setup.methods.length,
    rulesOn: setup.rules.filter((r) => r.on).length,
    ready: physical.filter((p) => readiness(p, setup.intl[p.id]).pct === 100).length,
    physical: physical.length,
    carriersAction: setup.carriers.filter((c) => c.state === 'action_required').length,
  };
}

export const newId = (prefix: string, taken: string[]) => { let n = taken.length + 1; while (taken.includes(`${prefix}${n}`)) n++; return `${prefix}${n}`; };
