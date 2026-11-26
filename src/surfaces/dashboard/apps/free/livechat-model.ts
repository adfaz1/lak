// Live chat (free app): rules only. Opening hours are in Riyadh time (UTC+3, no daylight saving). A shopper's chat is a
// «general message» case in the after-sale inbox (merchant/inbox.ts), so the merchant answers it where every other
// case is answered; the store replies show in the shopper's chat window. Nothing leaves the browser (simulated).
import type { L } from '../../../merchant/domain';
import { REPLY_MAX, nextCaseId, type Case, type CaseMsg } from '../../../merchant/inbox';

export interface ChatSettings {
  /** Open days, 0 = Sunday … 6 = Saturday (Riyadh calendar). */
  days: number[];
  /** Opening and closing time, "HH:MM", Riyadh. A closing time before the opening runs past midnight. */
  from: string;
  to: string;
  greeting: L;
  /** Outside hours: show a message form (the case waits for the next open time) instead of hiding the window. */
  offlineForm: boolean;
  offlineText: L;
  /** Where the window shows. */
  position: 'end' | 'start';
}
export const CHAT_DEFAULTS: ChatSettings = {
  days: [0, 1, 2, 3, 4, 6], from: '09:00', to: '22:00',
  greeting: { ar: 'أهلًا بك! كيف نقدر نساعدك؟', en: 'Hi there! How can we help?' },
  offlineForm: true,
  offlineText: { ar: 'نحن خارج ساعات العمل الآن. اترك رسالتك ونرد عليك فور عودتنا.', en: 'We are away right now. Leave a message and we will reply as soon as we are back.' },
  position: 'end',
};

const RIYADH = 3 * 3_600_000;
const latin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/** Minutes after midnight for "HH:MM" (Arabic digits accepted), or null when it is not a valid time. */
export function parseTime(s: string): number | null {
  const m = latin(s.trim()).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? h * 60 + mi : null;
}
/** Riyadh weekday (0 = Sunday) and minutes after midnight at `now`. */
export function riyadhClock(now: number): { day: number; min: number } {
  const d = new Date(now + RIYADH);
  return { day: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export type ChatError = 'days' | 'from' | 'to' | 'same' | 'greeting' | 'offline';
export function chatProblems(s: ChatSettings): ChatError[] {
  const out: ChatError[] = [];
  if (!s.days.length) out.push('days');
  const f = parseTime(s.from), t = parseTime(s.to);
  if (f === null) out.push('from');
  if (t === null) out.push('to');
  if (f !== null && t !== null && f === t) out.push('same');
  if (!s.greeting.ar.trim() || !s.greeting.en.trim() || s.greeting.ar.length > 160 || s.greeting.en.length > 160) out.push('greeting');
  if (s.offlineForm && (!s.offlineText.ar.trim() || !s.offlineText.en.trim())) out.push('offline');
  return out;
}

/** Open at `now`? A window past midnight belongs to the day it opened on. */
export function isOpen(s: Pick<ChatSettings, 'days' | 'from' | 'to'>, now: number): boolean {
  const f = parseTime(s.from), t = parseTime(s.to);
  if (f === null || t === null || f === t || !s.days.length) return false;
  const { day, min } = riyadhClock(now);
  if (f < t) return s.days.includes(day) && min >= f && min < t;
  // Overnight: open from `from` on an open day until `to` the next morning.
  return (s.days.includes(day) && min >= f) || (s.days.includes((day + 6) % 7) && min < t);
}

/** Epoch ms of the next opening after `now` (within a week), or null when the hours never open. */
export function nextOpen(s: Pick<ChatSettings, 'days' | 'from' | 'to'>, now: number): number | null {
  const f = parseTime(s.from), t = parseTime(s.to);
  if (f === null || t === null || f === t || !s.days.length) return null;
  const { day, min } = riyadhClock(now);
  const midnight = now - min * 60_000 - (new Date(now).getUTCSeconds() * 1000 + new Date(now).getUTCMilliseconds());
  for (let i = 0; i <= 7; i++) {
    const d = (day + i) % 7;
    if (!s.days.includes(d)) continue;
    if (i === 0 && min >= f) continue;
    return midnight + (i * 1440 + f) * 60_000;
  }
  return null;
}

/* ---------- Chats in the inbox ---------- */

/** Chats are store cases whose source id starts with this marker, so they can be counted apart from order-page cases. */
export const CHAT_MARK = 'chat';
export const isChat = (c: Case) => c.source === 'store' && !!c.sourceId?.startsWith(CHAT_MARK);

const latinDigits = latin;
/** A Saudi mobile ("05…", "5…", "+9665…", Arabic digits) as its last 9 digits, or null. */
export function mobileKey(s: string): string | null {
  const d = latinDigits(s).replace(/\D/g, '');
  const k = d.replace(/^(00966|966|0)/, '');
  return /^5\d{8}$/.test(k) ? k : null;
}
export const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

export type StartError = 'name' | 'contact' | 'text' | 'long';
/** What stops a shopper starting a chat: a name, a mobile or email to reach them, and a message. */
export function startProblems(p: { name: string; contact: string; text: string }): StartError[] {
  const out: StartError[] = [];
  if (p.name.trim().length < 2) out.push('name');
  if (!mobileKey(p.contact) && !validEmail(p.contact)) out.push('contact');
  if (p.text.trim().length < 2) out.push('text');
  if (p.text.trim().length > REPLY_MAX) out.push('long');
  return out;
}

/** A new chat from the store: a general-message case waiting on the merchant. `offline` = left outside hours. */
export function openChat(list: Case[], p: { name: string; customerId?: string; text: string; lang: 'ar' | 'en'; offline: boolean; visitor: string }, now: number): Case {
  const id = nextCaseId(list);
  const name = p.name.trim();
  return {
    id, type: 'message', status: 'new', priority: 'normal', source: 'store', sourceId: `${CHAT_MARK}:${p.visitor}`,
    subject: p.offline ? { ar: 'رسالة من الدردشة (خارج الدوام)', en: 'Chat message (out of hours)' } : { ar: 'محادثة مباشرة من المتجر', en: 'Live chat from the store' },
    customerId: p.customerId, customer: { ar: name, en: name }, lang: p.lang, openedAt: now, updatedAt: now, waitingSince: now,
    messages: [{ id: `${id}-M1`, from: 'customer', text: p.text.trim().slice(0, REPLY_MAX), lang: p.lang, at: now, channel: 'store' }],
    notes: [], actions: [], log: [{ what: 'opened', by: 'customer', at: now, detail: p.offline ? 'chat-offline' : 'chat' }],
  };
}

/** What the shopper sees in the window: their messages and the store's delivered replies, oldest first. */
export const shopperThread = (c: Case): CaseMsg[] => c.messages.filter((m) => m.from === 'customer' || (m.from === 'store' && m.status === 'sent'));

export interface ChatStats { chats: number; offline: number; answered: number; open: number; avgReplyMs: number | null; medianReplyMs: number | null }
/** Chats in the last `days` days: count, left out of hours, answered, still waiting, first-reply time. */
export function chatStats(cases: Case[], now: number, days = 30): ChatStats {
  const since = now - days * 86_400_000;
  const chats = cases.filter((c) => isChat(c) && c.openedAt >= since);
  const waits = chats.filter((c) => c.firstReplyAt !== undefined).map((c) => c.firstReplyAt! - c.openedAt).sort((a, b) => a - b);
  return {
    chats: chats.length,
    offline: chats.filter((c) => c.log[0]?.detail === 'chat-offline').length,
    answered: waits.length,
    open: chats.filter((c) => c.status !== 'resolved' && c.firstReplyAt === undefined).length,
    avgReplyMs: waits.length ? Math.round(waits.reduce((s, x) => s + x, 0) / waits.length) : null,
    medianReplyMs: waits.length ? waits[Math.floor((waits.length - 1) / 2)] : null,
  };
}

/** "3 min", "1 h 20 min", "2 d" from milliseconds. */
export function durationL(ms: number): L {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return { ar: `${m} د`, en: `${m} min` };
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 48) return { ar: r ? `${h} س ${r} د` : `${h} س`, en: r ? `${h} h ${r} min` : `${h} h` };
  const d = Math.round(h / 24);
  return { ar: `${d} يوم`, en: `${d} d` };
}
