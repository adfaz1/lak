// Domain model and fixtures for the merchant vertical slice.
// Money is integer halalas. Everything here is test data, not LAK data.

export type Lang = 'ar' | 'en';
export type L = Record<Lang, string>;
export type Pay = 'paid' | 'failed';
export type Ful = 'none' | 'done';
export type Ship = 'none' | 'label' | 'transit' | 'delivered';
export type View = 'all' | 'needs' | 'payfail' | 'shipped';
export type CarrierId = 'a' | 'b';

export interface LogEntry {
  when: 'earlier' | 'now';
  who: 'system' | 'you';
  kind: 'created' | 'payFailed' | 'labelIssued' | 'labelFailed';
  carrier?: CarrierId;
  ref?: string;
}

export interface Order {
  ref: string;
  customer: L;
  city: L;
  hoursAgo: number;
  pay: Pay;
  ful: Ful;
  ship: Ship;
  fee: number;
  items: { name: L; qty: number; unit: number }[];
  log: LogEntry[];
}

export const CARRIERS: Record<CarrierId, { name: L; price: number }> = {
  a: { name: { ar: 'ناقل تجريبي أ · عادي', en: 'Test carrier A · standard' }, price: 2500 },
  b: { name: { ar: 'ناقل تجريبي ب · سريع', en: 'Test carrier B · express' }, price: 3900 },
};

const item = (ar: string, en: string, qty: number, unit: number) => ({ name: { ar, en }, qty, unit });
const P = {
  abaya: (q: number) => item('عباية كتّان صيفية', 'Summer linen abaya', q, 29000),
  shawl: (q: number) => item('شال حرير', 'Silk shawl', q, 9800),
  oud: (q: number) => item('عطر عود 100 مل', 'Oud perfume 100 ml', q, 12900),
  bag: (q: number) => item('حقيبة يد جلد', 'Leather handbag', q, 42000),
  wallet: (q: number) => item('محفظة جلد', 'Leather wallet', q, 16100),
  coffee: (q: number) => item('طقم قهوة عربية', 'Arabic coffee set', q, 24000),
};

function order(
  ref: string, customer: L, city: L, hoursAgo: number, pay: Pay, ful: Ful, ship: Ship, fee: number, items: Order['items'],
): Order {
  return {
    ref, customer, city, hoursAgo, pay, ful, ship, fee, items,
    log: [{ when: 'earlier', who: 'system', kind: pay === 'failed' ? 'payFailed' : 'created' }],
  };
}

export function fixtures(): Order[] {
  return [
    order('10482', { ar: 'سارة العتيبي', en: 'Sarah Alotaibi' }, { ar: 'الرياض، حي الملقا', en: 'Riyadh, Al Malqa' }, 5, 'paid', 'none', 'none', 2500, [P.abaya(1), P.shawl(2)]),
    order('10481', { ar: 'محمد القحطاني', en: 'Mohammed Alqahtani' }, { ar: 'جدة، حي الروضة', en: 'Jeddah, Al Rawdah' }, 3, 'paid', 'none', 'none', 2500, [P.oud(1)]),
    order('10480', { ar: 'نوف الشهري', en: 'Nouf Alshehri' }, { ar: 'الدمام، حي الشاطئ', en: 'Dammam, Al Shati' }, 2, 'paid', 'none', 'none', 0, [P.bag(1), P.wallet(2)]),
    order('10479', { ar: 'عبدالله الدوسري', en: 'Abdullah Aldossari' }, { ar: 'الرياض، حي النرجس', en: 'Riyadh, Al Narjis' }, 1, 'failed', 'none', 'none', 2500, [P.coffee(1)]),
    order('10478', { ar: 'ريم الحربي', en: 'Reem Alharbi' }, { ar: 'المدينة المنورة', en: 'Madinah' }, 26, 'paid', 'done', 'label', 2500, [P.shawl(2)]),
    order('10477', { ar: 'فهد المطيري', en: 'Fahad Almutairi' }, { ar: 'أبها', en: 'Abha' }, 30, 'paid', 'done', 'transit', 2500, [P.oud(2)]),
    order('10476', { ar: 'لمى الزهراني', en: 'Lama Alzahrani' }, { ar: 'الطائف', en: 'Taif' }, 72, 'paid', 'done', 'delivered', 0, [P.bag(1)]),
  ];
}

export const subtotal = (o: Order) => o.items.reduce((sum, i) => sum + i.qty * i.unit, 0);
export const total = (o: Order) => subtotal(o) + o.fee;
/** VAT contained in a VAT-inclusive total at 15%. */
export const vatIncluded = (o: Order) => Math.round((total(o) * 15) / 115);
export const units = (o: Order) => o.items.reduce((sum, i) => sum + i.qty, 0);
export const isToday = (o: Order) => o.hoursAgo < 12;
export const canFulfil = (o: Order) => o.pay === 'paid' && o.ship === 'none';

export const VIEWS: Record<View, (o: Order) => boolean> = {
  all: () => true,
  needs: (o) => o.pay === 'paid' && o.ful === 'none',
  payfail: (o) => o.pay === 'failed',
  shipped: (o) => o.ship !== 'none',
};

export function search(orders: Order[], view: View, q: string): Order[] {
  const needle = q.trim().toLowerCase();
  return orders.filter(VIEWS[view]).filter(
    (o) => !needle || o.ref.includes(needle.replace('#', '')) || o.customer.ar.includes(needle) || o.customer.en.toLowerCase().includes(needle),
  );
}

/** One deterministic reference per order, so a retry can never create a second label. */
export const shipmentRef = (o: Order) => `SIM-${o.ref}-1`;

export function parseWeight(input: string): number | null {
  const w = Number(input.trim());
  return Number.isFinite(w) && w >= 0.1 && w <= 30 ? w : null;
}

/** Simulated label issuance. Returns the order unchanged when it is not eligible. */
export function issueLabel(o: Order, carrier: CarrierId, carrierDown: boolean): Order {
  if (!canFulfil(o)) return o;
  const ref = shipmentRef(o);
  if (carrierDown) {
    return { ...o, log: [...o.log, { when: 'now', who: 'you', kind: 'labelFailed', ref }] };
  }
  return { ...o, ful: 'done', ship: 'label', log: [...o.log, { when: 'now', who: 'you', kind: 'labelIssued', carrier, ref }] };
}

export function formatMoney(halalas: number): string {
  return (halalas / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
