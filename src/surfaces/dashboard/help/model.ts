// Help: business rules only (no React). Articles come from merchant/workspace.ts; integration states from the
// apps and settings fixtures. Search, grouping, "status near the problem" and ticket validation live here.
import type { L } from '../../../core/lang';
import type { Page } from '../../merchant/perms';
import type { App, Article, DomainSettings, Provider, Scope } from '../../merchant/workspace';
import { normalise } from '../settings/model';

/* ---------- Sections and search ---------- */

export type HelpSection = Extract<Page, 'orders' | 'products' | 'inventory' | 'finance' | 'marketing' | 'settings'>;
export const SECTIONS: HelpSection[] = ['orders', 'products', 'inventory', 'finance', 'marketing', 'settings'];
export const SECTION_LABEL: Record<HelpSection, L> = {
  orders: { ar: 'الطلبات', en: 'Orders' }, products: { ar: 'المنتجات', en: 'Products' }, inventory: { ar: 'المخزون', en: 'Inventory' },
  finance: { ar: 'المالية', en: 'Finance' }, marketing: { ar: 'التسويق', en: 'Marketing' }, settings: { ar: 'الإعدادات', en: 'Settings' },
};
export const isSection = (s: string | null): s is HelpSection => !!s && (SECTIONS as string[]).includes(s);

/** Articles matching every word of the query in either language; title matches rank first. */
export function searchArticles(list: Article[], q: string, section?: HelpSection | null): Article[] {
  const inSection = section ? list.filter((a) => a.page === section) : list;
  const words = normalise(q).split(/\s+/).filter(Boolean);
  if (!words.length) return inSection;
  const scored = inSection.map((a) => {
    const title = normalise(`${a.title.ar} ${a.title.en}`);
    const body = normalise(a.steps.map((s) => `${s.ar} ${s.en}`).join(' '));
    const all = words.every((w) => title.includes(w) || body.includes(w));
    return { a, all, score: words.filter((w) => title.includes(w)).length };
  });
  return scored.filter((x) => x.all).sort((x, y) => y.score - x.score).map((x) => x.a);
}

export interface Group { section: HelpSection; articles: Article[] }
export function groupBySection(list: Article[]): Group[] {
  return SECTIONS.map((section) => ({ section, articles: list.filter((a) => a.page === section) })).filter((g) => g.articles.length > 0);
}
export const countBySection = (list: Article[]) => Object.fromEntries(SECTIONS.map((s) => [s, list.filter((a) => a.page === s).length])) as Record<HelpSection, number>;

/* ---------- Integration status near the problem ---------- */

export type IssueLevel = 'error' | 'action';
export interface Issue { id: string; kind: 'app' | 'provider' | 'domain'; name: L; level: IssueLevel; state: string; sections: HelpSection[]; fix: { section: string; path: string } }

const SCOPE_SECTION: Record<Scope, HelpSection> = {
  'orders.read': 'orders', 'orders.write': 'orders', 'customers.read': 'marketing', 'products.read': 'products', 'products.write': 'products',
  'inventory.read': 'inventory', 'messages.send': 'marketing',
};

/** Integrations that are not working, each placed in the one help section where its failure shows up (an app's last, most specific scope). */
export function integrationIssues(apps: App[], providers: Provider[], domain: DomainSettings): Issue[] {
  const out: Issue[] = [];
  for (const a of apps) {
    if (a.state !== 'error' && a.state !== 'reauth') continue;
    out.push({ id: `app-${a.id}`, kind: 'app', name: a.name, level: a.state === 'error' ? 'error' : 'action', state: a.state, sections: a.scopes.length ? [SCOPE_SECTION[a.scopes[a.scopes.length - 1]]] : [], fix: { section: 'apps', path: a.id } });
  }
  for (const p of providers) {
    if (p.state !== 'action_required') continue;
    out.push({ id: `pay-${p.id}`, kind: 'provider', name: p.name, level: 'action', state: p.state, sections: ['finance'], fix: { section: 'settings', path: 'payments' } });
  }
  if (domain.state === 'failed') out.push({ id: 'domain', kind: 'domain', name: { ar: domain.host, en: domain.host }, level: 'error', state: 'failed', sections: ['settings'], fix: { section: 'settings', path: 'domains' } });
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
}
export const issuesFor = (issues: Issue[], section: HelpSection) => issues.filter((i) => i.sections.includes(section));

/* ---------- Support ticket ---------- */

export type Topic = 'orders' | 'payments' | 'shipping' | 'products' | 'domain' | 'account' | 'other';
export const TOPICS: Topic[] = ['orders', 'payments', 'shipping', 'products', 'domain', 'account', 'other'];
export interface TicketDraft { topic: Topic | ''; subject: string; details: string; orderRef: string }
export const emptyTicket = (): TicketDraft => ({ topic: '', subject: '', details: '', orderRef: '' });
export const SUBJECT_MIN = 5, SUBJECT_MAX = 120, DETAILS_MIN = 20;
export type TicketErrors = Partial<Record<'topic' | 'subject' | 'details' | 'orderRef', 'required' | 'short' | 'long' | 'unknown' | 'sensitive'>>;

/** Card numbers and passwords must never be sent in a ticket. */
export const looksSensitive = (s: string) => /\b(?:\d[ -]?){13,19}\b/.test(s) || /(password|كلمة (ال)?(سر|مرور))\s*[:=]/i.test(s);

export function validateTicket(d: TicketDraft, orderRefs: string[]): TicketErrors {
  const e: TicketErrors = {};
  if (!d.topic) e.topic = 'required';
  const s = d.subject.trim();
  if (!s) e.subject = 'required'; else if (s.length < SUBJECT_MIN) e.subject = 'short'; else if (s.length > SUBJECT_MAX) e.subject = 'long';
  const t = d.details.trim();
  if (!t) e.details = 'required'; else if (t.length < DETAILS_MIN) e.details = 'short'; else if (looksSensitive(t)) e.details = 'sensitive';
  const r = d.orderRef.trim().replace(/^#/, '');
  if (r && !orderRefs.includes(r)) e.orderRef = 'unknown';
  return e;
}

/** Next simulated reference: SUP-5101, SUP-5102… never reused within the session. */
export function nextTicketRef(tickets: { id: string }[]): string {
  const max = tickets.reduce((m, t) => Math.max(m, Number(t.id.replace(/\D/g, '')) || 0), 5100);
  return `SUP-${max + 1}`;
}

/** Non-sensitive context attached to a ticket, shown to the merchant before sending. */
export interface Diagnostics { page: string; time: string; store: string; role: string; language: string; issues: string[] }
export function diagnostics(ctx: { page: string; now: Date; store: string; role: string; lang: string; issues: Issue[] }): Diagnostics {
  return { page: ctx.page, time: ctx.now.toISOString().slice(0, 16).replace('T', ' ') + ' UTC', store: ctx.store, role: ctx.role, language: ctx.lang, issues: ctx.issues.map((i) => i.id) };
}
