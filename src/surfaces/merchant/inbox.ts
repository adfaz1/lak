// After-sale service inbox (group: inbox). One list of customer cases linked to their order and customer:
// complaints, return requests, product questions, shipping problems (with a simulated carrier ticket), negative
// reviews and general messages. Pure functions only; times are epoch ms. Nothing leaves the browser (simulated).
import type { CarrierId, L } from './domain';
import type { NoticeChannel } from './ops';

export type CaseType = 'complaint' | 'return' | 'question' | 'shipping' | 'review' | 'message';
export const CASE_TYPES: CaseType[] = ['complaint', 'return', 'shipping', 'question', 'review', 'message'];
/** new → waiting on us → waiting on customer / escalated to carrier → resolved. */
export type CaseStatus = 'new' | 'us' | 'customer' | 'carrier' | 'resolved';
export const CASE_STATUSES: CaseStatus[] = ['new', 'us', 'customer', 'carrier', 'resolved'];
export type Priority = 'urgent' | 'high' | 'normal' | 'low';
export const PRIORITIES: Priority[] = ['urgent', 'high', 'normal', 'low'];
export type ShipIssue = 'late' | 'lost' | 'damaged';
export const SHIP_ISSUES: ShipIssue[] = ['late', 'lost', 'damaged'];
/** Where the case came from: the shopper (store order page / product page), a review, a return, or staff. */
export type CaseSource = 'store' | 'email' | 'whatsapp' | 'review' | 'return' | 'staff';

export interface CaseMsg {
  id: string;
  from: 'customer' | 'store' | 'carrier' | 'system';
  text: string;
  lang: 'ar' | 'en';
  at: number;
  by?: string;
  channel?: NoticeChannel | 'store';
  /** Store replies: simulated delivery result. */
  status?: 'sent' | 'failed';
}
export interface CaseNote { id: string; text: string; by: string; at: number }
export interface CarrierTicket {
  id: string; carrier: CarrierId; issue: ShipIssue; opened: number; by: string;
  state: 'open' | 'answered' | 'failed';
  answer?: L; answeredAt?: number;
}
export type ResolutionKind = 'refund' | 'return' | 'reship' | 'coupon' | 'answered' | 'none';
export interface CaseEvent { what: string; by: string; at: number; detail?: string }

export interface Case {
  id: string;
  type: CaseType;
  status: CaseStatus;
  priority: Priority;
  subject: L;
  source: CaseSource;
  /** The review id (RV-/QA-) or return id (RMA-) this case follows, when derived from them. */
  sourceId?: string;
  orderRef?: string;
  customerId?: string;
  customer: L;
  productId?: string;
  /** Language the customer reads replies in. */
  lang: 'ar' | 'en';
  openedAt: number;
  updatedAt: number;
  /** When the SLA clock started running for the current wait on us (last customer message or reopen). */
  waitingSince?: number;
  firstReplyAt?: number;
  resolvedAt?: number;
  assignee?: string;
  ship?: { issue: ShipIssue; tracking?: string; carrier?: CarrierId; ticket?: CarrierTicket };
  messages: CaseMsg[];
  notes: CaseNote[];
  /** Resolution actions started from the case (refund id, return id, coupon code, reship draft). */
  actions: { kind: ResolutionKind; ref?: string; at: number; by: string }[];
  log: CaseEvent[];
}

/* ---------- SLA ---------- */

/** Hours we have to answer, by priority. While waiting on the customer or the carrier the clock is paused. */
export const SLA_HOURS: Record<Priority, number> = { urgent: 2, high: 4, normal: 24, low: 72 };
/** Hours the carrier has to answer a ticket before it is overdue. */
export const CARRIER_SLA_HOURS = 48;
const H = 3_600_000;

export type SlaState = 'ok' | 'soon' | 'breached' | 'paused' | 'done';
export interface Sla { state: SlaState; due?: number; leftMs?: number }
export function sla(c: Case, now: number): Sla {
  if (c.status === 'resolved') return { state: 'done' };
  if (c.status === 'customer') return { state: 'paused' };
  if (c.status === 'carrier') {
    const t = c.ship?.ticket;
    if (!t || t.state !== 'open') return { state: 'paused' };
    const due = t.opened + CARRIER_SLA_HOURS * H;
    return { state: now > due ? 'breached' : due - now < 6 * H ? 'soon' : 'paused', due, leftMs: due - now };
  }
  const start = c.waitingSince ?? c.openedAt;
  const total = SLA_HOURS[c.priority] * H;
  const due = start + total;
  const left = due - now;
  return { state: left < 0 ? 'breached' : left < total * 0.25 ? 'soon' : 'ok', due, leftMs: left };
}

/* ---------- Priority suggestion ---------- */

/** Starting priority from what the case is about and what the customer is worth; the merchant can change it. */
export function suggestPriority(type: CaseType, opts: { issue?: ShipIssue; rating?: number; spent?: number; orderTotal?: number } = {}): Priority {
  if (type === 'shipping') return opts.issue === 'lost' || opts.issue === 'damaged' ? 'high' : 'normal';
  if (type === 'complaint') return (opts.spent ?? 0) >= 100_000 ? 'urgent' : 'high';
  if (type === 'review') return (opts.rating ?? 5) <= 2 ? 'high' : 'normal';
  if (type === 'return') return 'normal';
  if (type === 'question') return 'normal';
  return 'low';
}

/* ---------- Actions (each returns a new case; nothing mutates) ---------- */

const nextMsgId = (c: Case) => `${c.id}-M${c.messages.length + 1}`;
const touch = (c: Case, now: number, ev?: Omit<CaseEvent, 'at'>): Case => ({ ...c, updatedAt: now, log: ev ? [...c.log, { ...ev, at: now }] : c.log });

export function setStatus(c: Case, status: CaseStatus, by: string, now: number): Case {
  if (c.status === status) return c;
  const reopened = c.status === 'resolved' || status === 'us' || status === 'new';
  return touch({
    ...c, status,
    resolvedAt: status === 'resolved' ? now : undefined,
    waitingSince: reopened && status !== 'resolved' ? now : c.waitingSince,
  }, now, { what: `status:${status}`, by });
}
export function setPriority(c: Case, p: Priority, by: string, now: number): Case {
  return c.priority === p ? c : touch({ ...c, priority: p }, now, { what: `priority:${p}`, by });
}
export function assignCase(c: Case, name: string | undefined, by: string, now: number): Case {
  return c.assignee === name ? c : touch({ ...c, assignee: name }, now, { what: name ? 'assigned' : 'unassigned', by, detail: name });
}
export function addCaseNote(c: Case, text: string, by: string, now: number): Case {
  const t = text.trim();
  if (!t) return c;
  return touch({ ...c, notes: [...c.notes, { id: `${c.id}-N${c.notes.length + 1}`, text: t.slice(0, 1000), by, at: now }] }, now, { what: 'note', by });
}

export type ReplyError = 'empty' | 'long' | 'vars';
export const REPLY_MAX = 1000;
/** Problems with a reply before it can be previewed: empty, too long, or a placeholder left unfilled. */
export function replyProblem(text: string): ReplyError | null {
  const t = text.trim();
  if (!t) return 'empty';
  if (t.length > REPLY_MAX) return 'long';
  if (/\{[^{}\s]+\}/.test(t)) return 'vars';
  return null;
}

/**
 * Record a reply to the customer (simulated delivery). Sets the first-reply time and moves the case to
 * "waiting on customer", or "resolved" when the merchant chose to close it with this reply.
 */
export function replyCase(c: Case, r: { text: string; lang: 'ar' | 'en'; channel: NoticeChannel; status: 'sent' | 'failed'; close?: boolean }, by: string, now: number): Case {
  const msg: CaseMsg = { id: nextMsgId(c), from: 'store', text: r.text.trim(), lang: r.lang, at: now, by, channel: r.channel, status: r.status };
  const next: Case = { ...c, messages: [...c.messages, msg], firstReplyAt: c.firstReplyAt ?? (r.status === 'sent' ? now : undefined) };
  if (r.status !== 'sent') return touch(next, now, { what: 'replyFailed', by });
  const status: CaseStatus = r.close ? 'resolved' : c.status === 'carrier' ? 'carrier' : 'customer';
  return touch({ ...next, status, resolvedAt: status === 'resolved' ? now : undefined }, now, { what: r.close ? 'repliedClosed' : 'replied', by });
}

/** The customer writes again (from the store): the case comes back to us and the SLA clock restarts. */
export function customerWrites(c: Case, text: string, now: number, channel: CaseMsg['channel'] = 'store'): Case {
  const t = text.trim();
  if (!t) return c;
  const msg: CaseMsg = { id: nextMsgId(c), from: 'customer', text: t.slice(0, REPLY_MAX), lang: c.lang, at: now, channel };
  return touch({ ...c, messages: [...c.messages, msg], status: c.status === 'carrier' ? 'carrier' : 'us', waitingSince: now, resolvedAt: undefined }, now, { what: 'customerWrote', by: 'customer' });
}

/** Escalate a shipping problem to the carrier: a simulated ticket with its own 48-hour clock. */
export function escalate(c: Case, carrier: CarrierId, tracking: string | undefined, by: string, now: number, fail = false): Case {
  if (c.type !== 'shipping' || !c.ship) return c;
  const ticket: CarrierTicket = { id: `CT-${c.id.replace(/\D/g, '')}-${(c.log.filter((e) => e.what === 'escalated').length + 1)}`, carrier, issue: c.ship.issue, opened: now, by, state: fail ? 'failed' : 'open' };
  if (fail) return touch({ ...c, ship: { ...c.ship, carrier, tracking, ticket } }, now, { what: 'escalateFailed', by });
  return touch({ ...c, status: 'carrier', ship: { ...c.ship, carrier, tracking, ticket } }, now, { what: 'escalated', by, detail: ticket.id });
}

/** What the (simulated) carrier answers, by issue. */
export const CARRIER_ANSWERS: Record<ShipIssue, L> = {
  late: { ar: 'الشحنة في مركز الفرز وتُسلَّم خلال يومي عمل.', en: 'The parcel is at the sorting hub and will be delivered within two working days.' },
  lost: { ar: 'لم نعثر على الشحنة بعد البحث. يمكنك المطالبة بالتعويض وفق اتفاقيتك.', en: 'The parcel was not found after a search. You can claim compensation under your agreement.' },
  damaged: { ar: 'سجّلنا الضرر. أرسل صور الطرد خلال 7 أيام لاستكمال المطالبة.', en: 'Damage recorded. Send photos of the parcel within 7 days to complete the claim.' },
};
/** The carrier answers the ticket: the case comes back to us with the answer in the thread. */
export function carrierAnswers(c: Case, now: number): Case {
  const t = c.ship?.ticket;
  if (!t || t.state !== 'open') return c;
  const answer = CARRIER_ANSWERS[t.issue];
  const msg: CaseMsg = { id: nextMsgId(c), from: 'carrier', text: answer[c.lang], lang: c.lang, at: now, by: t.carrier };
  return touch({ ...c, status: 'us', waitingSince: now, messages: [...c.messages, msg], ship: { ...c.ship!, ticket: { ...t, state: 'answered', answer, answeredAt: now } } }, now, { what: 'carrierAnswered', by: 'carrier', detail: t.id });
}

/** A resolution action was started from the case (refund, return, reship draft, goodwill coupon). */
export function recordAction(c: Case, kind: ResolutionKind, ref: string | undefined, by: string, now: number): Case {
  return touch({ ...c, actions: [...c.actions, { kind, ref, at: now, by }] }, now, { what: `action:${kind}`, by, detail: ref });
}

/* ---------- Canned replies ---------- */

export interface Canned { id: string; title: L; body: L; types: CaseType[] }
export const CANNED_VARS = ['customer', 'order', 'store', 'tracking', 'product'] as const;
export type CannedVar = (typeof CANNED_VARS)[number];
export const fillCanned = (text: string, vars: Partial<Record<CannedVar, string>>) => text.replace(/\{([^{}\s]+)\}/g, (m, k: string) => vars[k as CannedVar] ?? m);
export type CannedError = 'title' | 'body' | 'unknownVar';
export function cannedProblems(c: Pick<Canned, 'title' | 'body'>): CannedError[] {
  const out: CannedError[] = [];
  if (!c.title.ar.trim() || !c.title.en.trim()) out.push('title');
  if (!c.body.ar.trim() || !c.body.en.trim()) out.push('body');
  const vars = [...`${c.body.ar} ${c.body.en}`.matchAll(/\{([^{}\s]+)\}/g)].map((m) => m[1]);
  if (vars.some((v) => !(CANNED_VARS as readonly string[]).includes(v))) out.push('unknownVar');
  return out;
}
export function cannedFixtures(): Canned[] {
  return [
    { id: 'cn-sorry-late', types: ['shipping', 'complaint'], title: { ar: 'اعتذار عن التأخير', en: 'Sorry for the delay' },
      body: { ar: 'أهلًا {customer}، نعتذر عن تأخر طلبك {order}. تابعنا مع شركة الشحن وسنبلغك بموعد التسليم اليوم.', en: 'Hi {customer}, sorry your order {order} is late. We have chased the carrier and will confirm the delivery date today.' } },
    { id: 'cn-photo', types: ['complaint', 'shipping', 'return'], title: { ar: 'طلب صورة للمنتج', en: 'Ask for a photo' },
      body: { ar: 'أهلًا {customer}، يؤسفنا ذلك. أرسل لنا صورة للقطعة والطرد لنحل الأمر بسرعة.', en: 'Hi {customer}, we are sorry about this. Please send a photo of the item and the parcel so we can sort it out quickly.' } },
    { id: 'cn-return-ok', types: ['return', 'complaint'], title: { ar: 'الموافقة على الإرجاع', en: 'Return approved' },
      body: { ar: 'أهلًا {customer}، وافقنا على إرجاع طلبك {order}. يصلك ملصق الإرجاع برسالة منفصلة.', en: 'Hi {customer}, we have approved the return for {order}. Your return label follows in a separate message.' } },
    { id: 'cn-reship', types: ['shipping', 'complaint'], title: { ar: 'نرسل بديلًا', en: 'Sending a replacement' },
      body: { ar: 'أهلًا {customer}، نرسل لك بديلًا عن طلبك {order} دون أي تكلفة، ونبلغك برقم التتبع فور شحنه.', en: 'Hi {customer}, we are sending a replacement for {order} at no cost and will share the tracking number once it ships.' } },
    { id: 'cn-answer', types: ['question'], title: { ar: 'إجابة سؤال منتج', en: 'Product answer' },
      body: { ar: 'أهلًا {customer}، شكرًا لسؤالك عن {product}. ', en: 'Hi {customer}, thanks for asking about {product}. ' } },
    { id: 'cn-review', types: ['review'], title: { ar: 'متابعة تقييم منخفض', en: 'Low review follow-up' },
      body: { ar: 'أهلًا {customer}، قرأنا تقييمك ل{product} ونأسف أن التجربة لم تكن كما تستحق. نود تعويضك؛ أخبرنا بما يناسبك.', en: 'Hi {customer}, we read your review of {product} and are sorry it fell short. We would like to make it right; tell us what suits you.' } },
    { id: 'cn-thanks', types: ['message', 'complaint', 'shipping', 'return', 'question', 'review'], title: { ar: 'شكرًا وإغلاق', en: 'Thanks and close' },
      body: { ar: 'سعدنا بخدمتك يا {customer}. إن احتجت أي شيء آخر بخصوص {order} فنحن هنا.', en: 'Glad we could help, {customer}. If you need anything else about {order}, we are here.' } },
  ];
}

/* ---------- Fixtures (demo data) ---------- */

/** Demo cases on fixture orders, relative to `now`. Customers are named as in the fixture orders. */
export function caseFixtures(now = Date.now()): Case[] {
  const ago = (h: number) => now - h * H;
  const base = (id: string, type: CaseType, opened: number, p: Partial<Case>): Case => ({
    id, type, status: 'new', priority: 'normal', subject: { ar: '', en: '' }, source: 'store', customer: { ar: '', en: '' }, lang: 'ar',
    openedAt: opened, updatedAt: opened, waitingSince: opened, messages: [], notes: [], actions: [], log: [{ what: 'opened', by: 'customer', at: opened }], ...p,
  });
  const cm = (id: string, text: string, at: number, lang: 'ar' | 'en' = 'ar', channel: CaseMsg['channel'] = 'store'): CaseMsg => ({ id, from: 'customer', text, lang, at, channel });
  return [
    base('CS-2048', 'shipping', ago(3), {
      priority: 'high', orderRef: '10477', customer: { ar: 'فهد المطيري', en: 'Fahad Almutairi' },
      subject: { ar: 'الطلب متأخر عن موعده', en: 'Order is past its delivery date' }, ship: { issue: 'late', carrier: 'a' },
      messages: [cm('CS-2048-M1', 'الطلب كان المفروض يوصل أمس وما وصلني شي، والتتبع واقف من يومين.', ago(3))],
    }),
    base('CS-2047', 'shipping', ago(30), {
      status: 'carrier', priority: 'high', orderRef: '10461', customer: { ar: 'ريم القحطاني', en: 'Reem Alqahtani' }, assignee: 'فيصل',
      subject: { ar: 'الشحنة مفقودة', en: 'Parcel lost' }, firstReplyAt: ago(27),
      ship: { issue: 'lost', carrier: 'b', ticket: { id: 'CT-2047-1', carrier: 'b', issue: 'lost', opened: ago(26), by: 'فيصل', state: 'open' } },
      messages: [
        cm('CS-2047-M1', 'التتبع يقول تم التسليم بس ما استلمت أي طرد.', ago(30)),
        { id: 'CS-2047-M2', from: 'store', text: 'نعتذر يا ريم، فتحنا بلاغًا مع شركة الشحن ونبلغك بالنتيجة خلال يومين.', lang: 'ar', at: ago(27), by: 'فيصل', channel: 'whatsapp', status: 'sent' },
      ],
      notes: [{ id: 'CS-2047-N1', text: 'العميلة دائمة؛ إن تأكد الفقد نرسل بديلًا فورًا.', by: 'فيصل', at: ago(26) }],
      log: [{ what: 'opened', by: 'customer', at: ago(30) }, { what: 'replied', by: 'فيصل', at: ago(27) }, { what: 'escalated', by: 'فيصل', at: ago(26), detail: 'CT-2047-1' }],
    }),
    base('CS-2046', 'shipping', ago(30), {
      status: 'us', priority: 'high', orderRef: '10476', customer: { ar: 'لمى الزهراني', en: 'Lama Alzahrani' },
      subject: { ar: 'الحقيبة وصلت متضررة', en: 'Bag arrived damaged' }, ship: { issue: 'damaged', carrier: 'a' }, waitingSince: ago(9),
      messages: [cm('CS-2046-M1', 'الكرتون كان مبلول والحقيبة عليها خدش واضح من الجنب.', ago(30)), cm('CS-2046-M2', 'أرسلت الصور، متى تردون؟', ago(9))],
    }),
    base('CS-2045', 'complaint', ago(50), {
      status: 'customer', priority: 'high', orderRef: '10475', customer: { ar: 'خالد العتيبي', en: 'Khalid Alotaibi' }, assignee: 'سارة', firstReplyAt: ago(47),
      subject: { ar: 'لون الشال مختلف عن الصورة', en: 'Shawl colour differs from the photo' },
      messages: [
        cm('CS-2045-M1', 'الشال وصل بلون أفتح بكثير من الصورة في الموقع.', ago(50)),
        { id: 'CS-2045-M2', from: 'store', text: 'أهلًا خالد، يؤسفنا ذلك. أرسل لنا صورة للقطعة والطرد لنحل الأمر بسرعة.', lang: 'ar', at: ago(47), by: 'سارة', channel: 'email', status: 'sent' },
      ],
    }),
    base('CS-2044', 'return', ago(5), {
      lang: 'en', orderRef: '10474', customer: { ar: 'نوف الدوسري', en: 'Nouf Aldossari' }, source: 'email',
      subject: { ar: 'تريد إرجاع الحقيبة', en: 'Wants to return the bag' },
      messages: [cm('CS-2044-M1', 'Hi, the strap of the bag is shorter than listed. I would like to return it, please.', ago(5), 'en', 'email')],
    }),
    base('CS-2043', 'message', ago(2), {
      priority: 'low', orderRef: '10483', customer: { ar: 'هند الحربي', en: 'Hind Alharbi' }, source: 'whatsapp',
      subject: { ar: 'طلب التوصيل بعد العصر', en: 'Asks for afternoon delivery' },
      messages: [cm('CS-2043-M1', 'ممكن التوصيل يكون بعد الساعة ٤ العصر؟ أكون في الدوام قبلها.', ago(2), 'ar', 'whatsapp')],
    }),
    base('CS-2042', 'complaint', ago(140), {
      status: 'resolved', orderRef: '10470', customer: { ar: 'ريم الحربي', en: 'Reem Alharbi' }, assignee: 'سارة', firstReplyAt: ago(138), resolvedAt: ago(120),
      subject: { ar: 'زر العباءة مفقود', en: 'Missing abaya button' },
      messages: [
        cm('CS-2042-M1', 'العباية ناقصها زر في الكم.', ago(140)),
        { id: 'CS-2042-M2', from: 'store', text: 'نعتذر يا ريم، أرسلنا لك كوبون SORRY15 لطلبك القادم مع زر بديل.', lang: 'ar', at: ago(120), by: 'سارة', channel: 'sms', status: 'sent' },
      ],
      actions: [{ kind: 'coupon', ref: 'SORRY15', at: ago(121), by: 'سارة' }],
    }),
  ];
}

/* ---------- Shopper side ---------- */

/** Topics a shopper can pick from the store's order page, mapped to a case type and shipping issue. */
export type ShopperTopic = 'item' | 'late' | 'lost' | 'damaged' | 'question' | 'other';
export const SHOPPER_TOPICS: ShopperTopic[] = ['item', 'damaged', 'late', 'lost', 'question', 'other'];
export const topicType = (t: ShopperTopic): { type: CaseType; issue?: ShipIssue } =>
  t === 'late' || t === 'lost' || t === 'damaged' ? { type: 'shipping', issue: t } : t === 'item' ? { type: 'complaint' } : t === 'question' ? { type: 'message' } : { type: 'message' };
export const TOPIC_SUBJECT: Record<ShopperTopic, L> = {
  item: { ar: 'مشكلة في المنتج', en: 'Problem with an item' }, late: { ar: 'الطلب متأخر', en: 'Order is late' }, lost: { ar: 'الطلب لم يصل', en: 'Order not received' },
  damaged: { ar: 'وصل متضررًا', en: 'Arrived damaged' }, question: { ar: 'سؤال عن الطلب', en: 'Question about the order' }, other: { ar: 'رسالة عن الطلب', en: 'Message about the order' },
};
export type ShopperError = 'topic' | 'text' | 'long';
export function shopperProblems(topic: string, text: string): ShopperError[] {
  const out: ShopperError[] = [];
  if (!(SHOPPER_TOPICS as string[]).includes(topic)) out.push('topic');
  if (text.trim().length < 5) out.push('text');
  if (text.trim().length > REPLY_MAX) out.push('long');
  return out;
}
export const nextCaseId = (list: { id: string }[]) => `CS-${list.reduce((m, c) => Math.max(m, Number(c.id.replace(/\D/g, '')) || 0), 2040) + 1}`;

/** A case opened by the shopper from the store's order page. */
export function openFromStore(list: Case[], p: { orderRef: string; customer: L; customerId?: string; topic: ShopperTopic; text: string; lang: 'ar' | 'en'; tracking?: string; carrier?: CarrierId; spent?: number }, now: number): Case {
  const { type, issue } = topicType(p.topic);
  const id = nextCaseId(list);
  return {
    id, type, status: 'new', priority: suggestPriority(type, { issue, spent: p.spent }), subject: TOPIC_SUBJECT[p.topic], source: 'store',
    orderRef: p.orderRef, customerId: p.customerId, customer: p.customer, lang: p.lang, openedAt: now, updatedAt: now, waitingSince: now,
    ship: issue ? { issue, tracking: p.tracking, carrier: p.carrier } : undefined,
    messages: [{ id: `${id}-M1`, from: 'customer', text: p.text.trim().slice(0, REPLY_MAX), lang: p.lang, at: now, channel: 'store' }],
    notes: [], actions: [], log: [{ what: 'opened', by: 'customer', at: now }],
  };
}

/** What the shopper sees of a case: received, we answered, or closed. */
export type ShopperCaseState = 'received' | 'answered' | 'closed';
export function shopperState(c: Case): ShopperCaseState {
  if (c.status === 'resolved') return 'closed';
  const last = [...c.messages].reverse().find((m) => m.from !== 'system' && m.from !== 'carrier');
  return last?.from === 'store' && last.status === 'sent' ? 'answered' : 'received';
}
