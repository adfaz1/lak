// Marketing calendar (`#/dashboard/calendar`): one calendar of everything that changes what shoppers see or pay —
// coupons, automatic offers, landing pages, the announcement bar, message campaigns, scheduled articles, maintenance,
// the merchant's own reminders and campaign plans — beside Saudi occasions. Discounts that overlap on the same
// products at the same time are flagged. Pure rules only (no React, no stores).
import type { L } from '../../../core/lang';
import type { Coupon, OfferScope } from '../../merchant/growth';

export type CalKind = 'coupon' | 'offer' | 'landing' | 'announcement' | 'campaign' | 'post' | 'maintenance' | 'reminder' | 'plan' | 'occasion';
export const CAL_KINDS: CalKind[] = ['occasion', 'plan', 'coupon', 'offer', 'landing', 'announcement', 'campaign', 'post', 'maintenance', 'reminder'];
export interface CalItem {
  id: string; kind: CalKind; title: L;
  /** Riyadh days, inclusive. */
  start: string; end: string;
  /** Short state word (active, draft, scheduled…), already in both languages. */
  state?: L;
  /** Planned but not switched on yet (draft coupon, unpublished page). */
  planned?: boolean;
  href?: string;
  /** Lunar dates are estimates until the moon is sighted. */
  approx?: boolean;
  scope?: OfferScope;
  ref?: string;
  /** A code with no end date (a welcome code): always on, kept out of the day grid. */
  evergreen?: boolean;
  /** A coupon that reached its total use limit: checkout refuses it, so it cannot clash. */
  exhausted?: boolean;
}

/* ---------- Days ---------- */

export const dayMs = (d: string) => Date.parse(`${d}T12:00:00Z`);
export const addDays = (d: string, n: number) => new Date(dayMs(d) + n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((dayMs(b) - dayMs(a)) / 86_400_000);
export const riyadhToday = (now: number) => new Date(now + 3 * 3600_000).toISOString().slice(0, 10);
export const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start <= b.end && b.start <= a.end;
export const onDay = (i: { start: string; end: string }, d: string) => i.start <= d && d <= i.end;
export const validMonth = (m: string | null): m is string => !!m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
export const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); const t = new Date(Date.UTC(y, mo - 1 + n, 1)); return t.toISOString().slice(0, 7); };
/** Weeks of a month grid, Sunday first (the Saudi working week), padded with days of the neighbouring months. */
export function monthGrid(m: string): string[][] {
  const first = `${m}-01`;
  const dow = new Date(dayMs(first)).getUTCDay();
  let d = addDays(first, -dow);
  const weeks: string[][] = [];
  do {
    const w: string[] = [];
    for (let i = 0; i < 7; i++) { w.push(d); d = addDays(d, 1); }
    weeks.push(w);
  } while (d.slice(0, 7) === m);
  return weeks;
}

/* ---------- Saudi occasions (2026–2027) ---------- */

export interface Occasion { id: string; name: L; start: string; end: string; approx: boolean; prepDays: number; idea: L }
/** Fixed days are exact; Ramadan and the two Eids follow the Umm al-Qura estimate and move with the moon sighting (±1–2 days). */
export const OCCASIONS: Occasion[] = [
  { id: 'founding-2026', name: { ar: 'يوم التأسيس', en: 'Founding Day' }, start: '2026-02-22', end: '2026-02-22', approx: false, prepDays: 10, idea: { ar: 'تشكيلة تراثية وعرض ليوم واحد', en: 'Heritage edit and a one-day offer' } },
  { id: 'ramadan-2026', name: { ar: 'رمضان', en: 'Ramadan' }, start: '2026-02-18', end: '2026-03-19', approx: true, prepDays: 21, idea: { ar: 'هدايا وسلال رمضان، توصيل قبل الإفطار', en: 'Ramadan gifts and hampers, delivery before iftar' } },
  { id: 'fitr-2026', name: { ar: 'عيد الفطر', en: 'Eid al-Fitr' }, start: '2026-03-20', end: '2026-03-22', approx: true, prepDays: 14, idea: { ar: 'ملابس العيد والعيديات وبطاقات الهدايا', en: 'Eid outfits, eidiya and gift cards' } },
  { id: 'adha-2026', name: { ar: 'عيد الأضحى', en: 'Eid al-Adha' }, start: '2026-05-27', end: '2026-05-30', approx: true, prepDays: 14, idea: { ar: 'هدايا العيد وآخر موعد للشحن قبل الإجازة', en: 'Eid gifts and the last shipping day before the holiday' } },
  { id: 'national-2026', name: { ar: 'اليوم الوطني', en: 'Saudi National Day' }, start: '2026-09-23', end: '2026-09-23', approx: false, prepDays: 14, idea: { ar: 'تشكيلة باللون الأخضر وكود باسم اليوم', en: 'A green edit and a National Day code' } },
  { id: 'white-friday-2026', name: { ar: 'الجمعة البيضاء', en: 'White Friday' }, start: '2026-11-27', end: '2026-11-27', approx: false, prepDays: 21, idea: { ar: 'أكبر موسم تخفيضات: صفحة هبوط وعدّاد وكود', en: 'The biggest sale: a landing page, countdown and a code' } },
  { id: 'founding-2027', name: { ar: 'يوم التأسيس', en: 'Founding Day' }, start: '2027-02-22', end: '2027-02-22', approx: false, prepDays: 10, idea: { ar: 'تشكيلة تراثية وعرض ليوم واحد', en: 'Heritage edit and a one-day offer' } },
  { id: 'ramadan-2027', name: { ar: 'رمضان', en: 'Ramadan' }, start: '2027-02-08', end: '2027-03-09', approx: true, prepDays: 21, idea: { ar: 'هدايا وسلال رمضان، توصيل قبل الإفطار', en: 'Ramadan gifts and hampers, delivery before iftar' } },
  { id: 'fitr-2027', name: { ar: 'عيد الفطر', en: 'Eid al-Fitr' }, start: '2027-03-10', end: '2027-03-12', approx: true, prepDays: 14, idea: { ar: 'ملابس العيد والعيديات وبطاقات الهدايا', en: 'Eid outfits, eidiya and gift cards' } },
  { id: 'adha-2027', name: { ar: 'عيد الأضحى', en: 'Eid al-Adha' }, start: '2027-05-16', end: '2027-05-19', approx: true, prepDays: 14, idea: { ar: 'هدايا العيد وآخر موعد للشحن قبل الإجازة', en: 'Eid gifts and the last shipping day before the holiday' } },
  { id: 'national-2027', name: { ar: 'اليوم الوطني', en: 'Saudi National Day' }, start: '2027-09-23', end: '2027-09-23', approx: false, prepDays: 14, idea: { ar: 'تشكيلة باللون الأخضر وكود باسم اليوم', en: 'A green edit and a National Day code' } },
  { id: 'white-friday-2027', name: { ar: 'الجمعة البيضاء', en: 'White Friday' }, start: '2027-11-26', end: '2027-11-26', approx: false, prepDays: 21, idea: { ar: 'أكبر موسم تخفيضات: صفحة هبوط وعدّاد وكود', en: 'The biggest sale: a landing page, countdown and a code' } },
];
export const occasionItems = (): CalItem[] => OCCASIONS.map((o) => ({ id: `occ:${o.id}`, kind: 'occasion', title: o.name, start: o.start, end: o.end, approx: o.approx, ref: o.id }));
/** Occasions coming up within `days`, with the day preparation should start. */
export function upcoming(today: string, days = 120) {
  return OCCASIONS.filter((o) => o.end >= today && daysBetween(today, o.start) <= days).sort((a, b) => (a.start < b.start ? -1 : 1)).map((o) => ({ o, prepFrom: addDays(o.start, -o.prepDays), inDays: Math.max(0, daysBetween(today, o.start)) }));
}

/* ---------- Discounts and conflicts ---------- */

const ST: Record<Coupon['status'], L> = { active: { ar: 'نشط', en: 'Active' }, paused: { ar: 'موقوف', en: 'Paused' }, draft: { ar: 'مسودة', en: 'Draft' }, expired: { ar: 'منتهٍ', en: 'Expired' } };
/** Coupons and automatic offers the merchant made (reminder codes are one-off and left out). Open-ended ones run to the horizon. */
export function couponItems(coupons: Coupon[], horizon: string): CalItem[] {
  return coupons.filter((c) => !c.origin).map((c) => ({
    id: `cp:${c.code}`, kind: c.auto ? 'offer' : 'coupon', title: { ar: c.code, en: c.code }, start: c.starts, end: c.ends ?? horizon,
    state: ST[c.status], planned: c.status === 'draft', scope: c.scope ?? { kind: 'all', ids: [] }, ref: c.code,
    evergreen: !c.ends, exhausted: c.limitTotal !== null && c.used >= c.limitTotal,
    href: `/dashboard/marketing/coupons/${encodeURIComponent(c.code)}`,
  }));
}
/** Whether two offer scopes can discount the same product. `catOf` gives a product's (English) category. */
export function scopesOverlap(a: OfferScope, b: OfferScope, catOf: (productId: string) => string | undefined): boolean {
  if (a.kind === 'all' || b.kind === 'all') return true;
  if (a.kind === 'category' && b.kind === 'category') return a.ids.some((x) => b.ids.includes(x));
  if (a.kind === 'product' && b.kind === 'product') return a.ids.some((x) => b.ids.includes(x));
  const [cat, prod] = a.kind === 'category' ? [a, b] : [b, a];
  return prod.ids.some((id) => { const c = catOf(id); return !!c && cat.ids.includes(c); });
}
export type ConflictKind = 'twoOffers' | 'codeReplacesOffer' | 'twoCodes';
export interface Conflict { a: CalItem; b: CalItem; kind: ConflictKind; from: string; to: string; planned: boolean }
/**
 * Two discounts that would apply to the same products on the same days. Paused and expired ones are ignored; drafts count
 * as planned. Automatic offers never stack (the larger saving wins), and a typed code replaces the automatic offer.
 */
export function conflicts(items: CalItem[], catOf: (productId: string) => string | undefined): Conflict[] {
  const d = items.filter((i) => (i.kind === 'coupon' || i.kind === 'offer') && i.scope && !i.exhausted && !['Paused', 'Expired'].includes(i.state?.en ?? ''));
  const out: Conflict[] = [];
  for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) {
    const a = d[i], b = d[j];
    if (!overlaps(a, b) || !scopesOverlap(a.scope!, b.scope!, catOf)) continue;
    const kind: ConflictKind = a.kind === 'offer' && b.kind === 'offer' ? 'twoOffers' : a.kind === 'offer' || b.kind === 'offer' ? 'codeReplacesOffer' : 'twoCodes';
    // Shoppers type one code per order, so an always-on code (a welcome code) beside a campaign code is not a clash.
    if (kind === 'twoCodes' && (a.evergreen || b.evergreen)) continue;
    out.push({ a, b, kind, from: a.start > b.start ? a.start : b.start, to: a.end < b.end ? a.end : b.end, planned: !!(a.planned || b.planned) });
  }
  return out;
}
export const conflictsOn = (cs: Conflict[], day: string) => cs.filter((c) => c.from <= day && day <= c.to);

/* ---------- Merchant reminders and campaign plans ---------- */

export interface Reminder { id: string; day: string; text: string; done: boolean; by: string; at: string }
export type PlanPiece = 'coupon' | 'landing' | 'announcement' | 'reminder' | 'post';
export interface Plan { id: string; name: string; start: string; end: string; occasion?: string; pieces: { kind: PlanPiece; ref?: string }[]; by: string; at: string }
export interface CalendarState { reminders: Reminder[]; plans: Plan[] }
export const calendarFixture = (): CalendarState => ({
  reminders: [{ id: 'rm1', day: '2027-01-15', text: 'اطلب مخزون التمر والقهوة لرمضان', done: false, by: 'سارة', at: '2026-11-20T08:00:00.000Z' }],
  plans: [],
});
export const reminderItems = (rs: Reminder[]): CalItem[] => rs.map((r) => ({ id: `rm:${r.id}`, kind: 'reminder', title: { ar: r.text, en: r.text }, start: r.day, end: r.day, state: r.done ? { ar: 'تم', en: 'Done' } : undefined, ref: r.id }));
export const planItems = (ps: Plan[]): CalItem[] => ps.map((p) => ({ id: `pl:${p.id}`, kind: 'plan', title: { ar: p.name, en: p.name }, start: p.start, end: p.end, ref: p.id }));

export const NAME_MAX = 60;
export type PlanError = 'name' | 'dates' | 'past' | 'pieces';
export function planErrors(p: { name: string; start: string; end: string; pieces: PlanPiece[] }, today: string): PlanError[] {
  const e: PlanError[] = [];
  if (!p.name.trim() || p.name.length > NAME_MAX) e.push('name');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start) || !/^\d{4}-\d{2}-\d{2}$/.test(p.end) || p.end < p.start) e.push('dates');
  else if (p.end < today) e.push('past');
  if (!p.pieces.length) e.push('pieces');
  return e;
}
/** A suggested plan for a day: the occasion it falls in or before (starting its preparation window), else one week from that day. */
export function suggestPlan(day: string, today: string): { name: L; start: string; end: string; occasion?: Occasion } {
  const o = OCCASIONS.find((x) => onDay({ start: addDays(x.start, -x.prepDays), end: x.end }, day));
  if (o) { const start = day < today ? today : day; return { name: o.name, start, end: o.end, occasion: o }; }
  const start = day < today ? today : day;
  return { name: { ar: '', en: '' }, start, end: addDays(start, 6) };
}
/** A coupon code suggestion from a plan name and year ("رمضان" → "RAMADAN27" when the name has an English form). */
export const codeFor = (en: string, start: string) => `${en.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'SALE'}${start.slice(2, 4)}`;

/** A code for the plan's draft coupon: 3–16 Latin capitals/digits, not already used. */
export const codeIssue = (code: string, taken: string[]): 'format' | 'taken' | null =>
  !/^[A-Z0-9]{3,16}$/.test(code) ? 'format' : taken.includes(code) ? 'taken' : null;
/** Percent off for the plan's draft coupon (Arabic digits accepted): a whole number 1–90. */
export function pctValue(s: string): number | null {
  const v = Number(s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).trim());
  return Number.isInteger(v) && v >= 1 && v <= 90 ? v : null;
}

/** Items laid out on one week row: each gets a lane and a column span (0–6), so a multi-day item is one bar, not a chip per day. */
/** Occasions and plans take the top lanes; used-up coupons go last. */
const rank = (i: CalItem) => (i.exhausted ? 20 : CAL_KINDS.indexOf(i.kind));
export function weekLanes(week: string[], items: CalItem[]): { item: CalItem; col: number; span: number; lane: number }[] {
  const first = week[0], last = week[6];
  const inWeek = items.filter((i) => i.start <= last && i.end >= first)
    .sort((a, b) => rank(a) - rank(b) || (a.start < b.start ? -1 : a.start > b.start ? 1 : daysBetween(b.start, b.end) - daysBetween(a.start, a.end)));
  const lanes: number[] = [];
  return inWeek.map((item) => {
    const col = Math.max(0, daysBetween(first, item.start));
    const end = Math.min(6, daysBetween(first, item.end));
    let lane = lanes.findIndex((free) => free <= col);
    if (lane < 0) { lane = lanes.length; lanes.push(0); }
    lanes[lane] = end + 1;
    return { item, col, span: end - col + 1, lane };
  });
}
