// Module-level fixture stores for the merchant workspace. The global "Reset data" button resets them all.
// Simulated state only: not a ledger, not a permission system.
import { createStore } from '../../core/store';
import { allOrders, bindLocations, locationFixtures, type Location } from './domain';
import { categoryFixtures, collectionFixtures, productFixtures, shipsWeighed, skusOf, typeFixtures, type Category, type Collection, type ProductDraft } from './catalog';
import { initialLevels, syncStockAlerts, transferFixtures, withStateFixtures, type StockAlertEntry, type StockLog } from './inventory';
import { financeFixtures, type BankDetails, type Plan } from './finance';
import {
  automationFixtures, cartFixtures, couponFixtures, runFixtures, giftFixtures, loyaltyFixture, reviewFixtures, reviewSettingsFixture, syncEarned,
  type GiftCard, type PointsTxn, type Review,
} from './growth';
import { total } from './domain';
import {
  appFixtures, domainFixture, notifyFixture, policyFixtures, providerFixtures, setupFixture, statusFixture, storeFixture, teamFixture,
  themeFixture, zoneFixtures, customerFixtures, segmentFixtures, type Customer, type Member, type SavedSegment,
} from './workspace';
import { shippingFixture, type ShippingSetup } from './workspace';
import type { Role } from './perms';

export const ordersStore = createStore.key('merchant.ordersStore')(allOrders);
export const productsStore = createStore.key('merchant.productsStore')(() => [...productFixtures(), ...typeFixtures()]);
// Digital products (gift cards) have no warehouse stock.
// withStateFixtures: a few demo holds (awaiting payment, damaged, safety reserve) so every stock state has an example.
export const levelsStore = createStore.key('merchant.levelsStore')(() => withStateFixtures(initialLevels([...productFixtures(), ...typeFixtures()].filter((p) => shipsWeighed(p.type)).flatMap(skusOf))));
export const stockLogStore = createStore.key('merchant.stockLogStore')<StockLog[]>(() => [
  { id: 'ADJ-201', sku: 'OUD-100', loc: 'ryd', delta: -2, before: 6, after: 4, reason: 'damaged', who: 'فيصل', note: 'انكسرت أثناء التغليف' },
  { id: 'ADJ-200', sku: 'BAG-LTH-01', loc: 'ryd', delta: 5, before: 2, after: 7, reason: 'received', who: 'فيصل', note: 'توريد من المورّد' },
]);
export const transfersStore = createStore.key('merchant.transfersStore')(transferFixtures);
export const financeStore = createStore.key('merchant.financeStore')(() => financeFixtures());
export const couponsStore = createStore.key('merchant.couponsStore')(couponFixtures);
export const cartsStore = createStore.key('merchant.cartsStore')(cartFixtures);
export const automationsStore = createStore.key('merchant.automationsStore')(automationFixtures);
export const runsStore = createStore.key('merchant.runsStore')(runFixtures);
export const settingsStore = createStore.key('merchant.settingsStore')(() => ({
  providers: providerFixtures(),
  zones: zoneFixtures(),
  domain: domainFixture(),
  policies: policyFixtures(),
  notify: notifyFixture(),
  store: storeFixture(),
  status: statusFixture(),
  cod: { min: 0, max: 200000 },
  plan: 'plus' as Plan,
  planRequest: null as Plan | null,
  storeLangs: { ar: true, en: true },
  /** Bank-transfer details shoppers pay into (BP-P03-PMT-002). Null until the merchant saves them. Older sessions may lack the key. */
  bank: null as BankDetails | null,
  /** Shipping methods, carriers, rules, delivery promises, customs data and COD rules (dashboard → Settings → Shipping). Older sessions may lack the key. */
  shipping: shippingFixture() as ShippingSetup | undefined,
}));
/** Customers: the fixtures plus anyone who orders from the online store with a new mobile/email. */
export const customersStore = createStore.key('merchant.customersStore')<Customer[]>(customerFixtures);
export const teamStore = createStore.key('merchant.teamStore')(() => ({ members: teamFixture() as Member[], log: [] as { who: string; what: string }[] }));
export const themeStore = createStore.key('merchant.themeStore')(themeFixture);
export const appsStore = createStore.key('merchant.appsStore')(appFixtures);
export const setupStore = createStore.key('merchant.setupStore')(setupFixture);
export const ticketsStore = createStore.key('merchant.ticketsStore')<{ id: string; subject: string; state: 'open' }[]>(() => []);
export const notesStore = createStore.key('merchant.notesStore')<Record<string, { id: string; kind: 'internal' | 'message'; text: string; channel?: 'email' | 'sms'; by: string }[]>>(() => ({
  'C-1001': [{ id: 'N1', kind: 'internal', text: 'تفضّل التوصيل بعد الرابعة عصرًا.', by: 'فيصل' }],
}));
/** Unsaved product edits kept for this session, so navigating away does not lose typed input. */
export const draftsStore = createStore.key('merchant.draftsStore')<Record<string, ProductDraft>>(() => ({}));

export interface TestState { role: Role; mode: 'active' | 'new'; failBulk: boolean; open: boolean }
export const testStore = createStore.key('merchant.testStore')<TestState>(() => ({ role: 'owner', mode: 'active', failBulk: false, open: false }));

/* ---------- Account activity log (merchant/audit.ts) ---------- */
// Additive: one log for every action with an effect. Any section can call logAction(); the Team page shows it per member.
import { auditFixtures, nextAuditId, type AuditArea, type AuditEntry } from './audit';
import type { L as AuditL } from './domain';
export const auditStore = createStore.key('merchant.auditStore')<AuditEntry[]>(() => auditFixtures());
/** The person acting now: the previewed role's member (the owner for "owner"). Simulated identity. */
export function currentActor(): AuditEntry['actor'] {
  const role = testStore.get().role;
  const m = teamStore.get().members.find((x) => x.role === role && x.status === 'active');
  return m ? { id: m.id, name: m.name, role } : { id: `role:${role}`, name: role, role };
}
/** Record an action in the account activity log, attributed to the current actor, timestamped now. */
export function logAction(area: AuditArea, what: AuditL, extra: { target?: string; before?: string; after?: string } = {}): void {
  auditStore.set((list) => [{ id: nextAuditId(list), at: new Date().toISOString(), actor: currentActor(), area, what, ...extra }, ...list].slice(0, 500));
}

/* ---------- Catalogue structure and locations (products & inventory group) ---------- */
/** Warehouses and branches. `LOCATIONS`/`LOC_IDS` in domain.ts read this store, so every screen names new locations. */
export const locationsStore = createStore.key('merchant.locationsStore')<Location[]>(locationFixtures);
bindLocations(() => locationsStore.get());
export const categoriesStore = createStore.key('merchant.categoriesStore')<Category[]>(categoryFixtures);
export const collectionsStore = createStore.key('merchant.collectionsStore')<Collection[]>(collectionFixtures);
/** Low-stock alerts raised for a SKU at a location: one per crossing, resolved when stock is back above the threshold. */
export const stockAlertsStore = createStore.key('merchant.stockAlertsStore')<StockAlertEntry[]>(() => syncStockAlerts(levelsStore.get(), [], 'earlier').alerts);

/* Customers & growth: loyalty, gift cards, reviews, saved segments and the customer activity log. */
export const loyaltyStore = createStore.key('merchant.loyaltyStore')(loyaltyFixture);
/** Points ledger. Starts with the points earned on the fixture orders at the starting rules. */
export const pointsStore = createStore.key('merchant.pointsStore')<PointsTxn[]>(() => syncEarned([], allOrders(), customerFixtures(), loyaltyFixture(), total as never));
export const giftCardsStore = createStore.key('merchant.giftCardsStore')<GiftCard[]>(giftFixtures);
export const reviewsStore = createStore.key('merchant.reviewsStore')<Review[]>(reviewFixtures);
export const reviewSettingsStore = createStore.key('merchant.reviewSettingsStore')(reviewSettingsFixture);
export const segmentsStore = createStore.key('merchant.segmentsStore')<SavedSegment[]>(segmentFixtures);
/** Things done to a customer record (block, unblock, consent withdrawn, points adjusted, imported), newest first. */
export interface CustomerEvent { id: string; kind: 'blocked' | 'unblocked' | 'consentWithdrawn' | 'points' | 'imported' | 'giftCard' | 'wallet'; text: string; by: string; at: number }
export const customerEventsStore = createStore.key('merchant.customerEventsStore')<Record<string, CustomerEvent[]>>(() => ({}));

/* ---------- Customer order messages (orders group; merchant/ops.ts recordNotices). Simulated: nothing is sent. ---------- */
import { noticeFixture, recordNotices, type NoticeConfig, type NoticeCtx } from './ops';
import type { Order as NoticeOrder } from './domain';
/** Channels and bilingual templates per order state (Settings → Notifications → Customer messages). */
export const noticesStore = createStore.key('merchant.noticesStore')<NoticeConfig>(noticeFixture);
/** Orders whose next state change should not notify the customer (the merchant switched it off for that action). */
export const noticeMute = new Set<string>();
/** What the message layer needs for one order: store name, tracking-page base and the customer's addresses. */
export function noticeCtx(o: NoticeOrder, now = Date.now()): NoticeCtx {
  const c = customersStore.get().find((x) => x.id === o.customerId) ?? customersStore.get().find((x) => x.name.en === o.customer.en);
  let base = '#/store/track/';
  try { base = `${window.location.origin}${window.location.pathname}#/store/track/`; } catch { /* tests: no window */ }
  return { store: settingsStore.get().store.name, trackBase: base, contact: { phone: o.contact?.phone ?? c?.phone, email: o.contact?.email ?? c?.email }, now, gate: { whatsapp: whatsappGate(freeAppsStore.get(), c, now) ?? undefined } };
}
// WhatsApp is a channel the free WhatsApp app enables: off until it is installed, on and approved; consent and quiet hours apply.
import { freeAppsStore } from '../dashboard/apps/free/registry';
import { whatsappGate } from '../dashboard/apps/free/whatsapp-model';
{
  // Every orders write, from any screen or the online store, records the messages its state changes send.
  const write = ordersStore.set;
  ordersStore.set = (next) => {
    const before = ordersStore.get();
    write(next);
    const after = ordersStore.get();
    const noted = recordNotices(before, after, noticesStore.get(), (o) => noticeCtx(o), noticeMute);
    noticeMute.clear();
    if (noted !== after) write(noted);
  };
}

/* ---------- Sub-statuses and operating rules (Phase B; merchant/ops.ts) ---------- */
import { applyRulesOnWrite, ruleFixtures, subStatusFixtures, type OpRule, type RuleCtx, type SubStatus } from './ops';
import { appendRuleRuns } from './growth';
/** Custom sub-statuses under each main order state (Settings → Order statuses). */
export const subStatusesStore = createStore.key('merchant.subStatusesStore')<SubStatus[]>(subStatusFixtures);
/** Operating rules (Automations → Operating rules). Only active rules run. */
export const rulesStore = createStore.key('merchant.rulesStore')<OpRule[]>(ruleFixtures);
/** What a rule needs to read: team members, sub-statuses and the catalogue's SKUs. */
export function ruleCtx(): RuleCtx {
  return {
    members: teamStore.get().members,
    subs: subStatusesStore.get(),
    skusOf: (id) => { const p = productsStore.get().find((x) => x.id === id); return p ? skusOf(p) : []; },
  };
}
{
  // Every orders write — online store checkout (storefront/bridge.ts), manual orders, payment confirmations — clears
  // sub-statuses whose state has passed and runs active rules on created/paid orders. Each run is logged per order.
  const write = ordersStore.set;
  ordersStore.set = (next) => {
    const before = ordersStore.get();
    write(next);
    const after = ordersStore.get();
    const now = Date.now();
    const r = applyRulesOnWrite(before, after, rulesStore.get(), ruleCtx(), now);
    if (r.orders !== after) write(r.orders);
    if (r.results.length) runsStore.set((runs) => appendRuleRuns(runs, r.results, { now, by: 'rule' }).runs);
    if (Object.keys(r.rr).length) rulesStore.set((list) => list.map((x) => (x.id in r.rr ? { ...x, rr: r.rr[x.id] } : x)));
  };
}

/* ---------- After-sale service inbox (inbox group; merchant/inbox.ts). Simulated: nothing is sent. ---------- */
import { cannedFixtures, caseFixtures, type Canned, type Case } from './inbox';
/** Cases opened by shoppers or staff, and derived cases (reviews, questions, returns) once someone acted on them. */
export const inboxStore = createStore.key('merchant.inboxStore')<Case[]>(() => caseFixtures());
/** Bilingual canned replies, editable in the inbox. */
export const cannedStore = createStore.key('merchant.cannedStore')<Canned[]>(cannedFixtures);

/* ---------- Shopper demand signals (reports group; merchant/demand.ts). Recorded by the storefront. ---------- */
import { notifyFixtures, searchFixtures, wishFixtures, type NotifyRequest, type SearchEvent, type SearchRedirect, type WishEvent } from './demand';
/** Settled storefront searches with the number of results the shopper saw (seeded history + this session). */
export const searchLogStore = createStore.key('merchant.searchLogStore')<SearchEvent[]>(() => searchFixtures());
/** «Notify me when available» requests on sold-out SKUs. No shopper contact is kept here (simulated). */
export const notifyStore = createStore.key('merchant.notifyStore')<NotifyRequest[]>(notifyFixtures);
/** Wishlist adds and removes from the storefront. */
export const wishEventsStore = createStore.key('merchant.wishEventsStore')<WishEvent[]>(wishFixtures);
/** Search terms that found nothing, sent to a product or category the merchant chose. */
export const searchRedirectsStore = createStore.key('merchant.searchRedirectsStore')<SearchRedirect[]>(() => []);

/* ---------- Invoice customisation (reports group; merchant/invoice.ts). Simulated sending. ---------- */
import { invoiceConfigFixture, invoiceDue, type InvoiceConfig } from './invoice';
import { composeNotice, noticeEvents, withMessages, SYSTEM as INVOICE_SYSTEM } from './ops';
/** How the simplified tax invoice looks and when it is sent (Settings → Invoice). */
export const invoiceConfigStore = createStore.key('merchant.invoiceConfigStore')<InvoiceConfig>(invoiceConfigFixture);
{
  // When the merchant chose «send when paid/delivered», the order that reaches that state records the «Invoice»
  // customer message on the channels set in customer notifications. Nothing leaves the browser.
  const write = ordersStore.set;
  ordersStore.set = (next) => {
    const before = ordersStore.get();
    write(next);
    const cfg = invoiceConfigStore.get();
    if (cfg.sendOn === 'manual') return;
    const after = ordersStore.get();
    const prev = new Map(before.map((o) => [o.ref, o]));
    let changed = false;
    const out = after.map((o) => {
      const b = prev.get(o.ref);
      if (b === o) return o;
      if (!invoiceDue(cfg, b, o, noticeEvents(b, o).map((e) => e.event))) return o;
      changed = true;
      return withMessages(o, composeNotice(o, 'invoice', noticesStore.get(), noticeCtx(o), INVOICE_SYSTEM));
    });
    if (changed) write(out);
  };
}

/* ---------- Catalogue depth (Phase C, products group; merchant/catalog-extras.ts) ---------- */
import { catalogXFixtures, type CatalogX } from './catalog-extras';
/** Brands, custom fields, size charts, shopper filters, pre-order campaigns and purchase restrictions. */
export const catalogXStore = createStore.key('merchant.catalogXStore')<CatalogX>(() => catalogXFixtures());
