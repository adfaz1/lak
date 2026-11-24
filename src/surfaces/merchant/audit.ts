// Account activity log (BP-P03-ACC-010, BP-P03-STF-004): who did what, when, with before/after where it helps.
// One log for every action with an effect (publishing, refunds, settings, team, integrations). Pure functions;
// the store and `logAction()` live in stores.ts. Simulated: a session log, not a tamper-proof audit trail.
import type { L } from './domain';
import type { Role } from './perms';

export type AuditArea = 'team' | 'security' | 'store' | 'settings' | 'apps' | 'orders' | 'products' | 'inventory' | 'marketing' | 'finance';
export const AUDIT_AREAS: AuditArea[] = ['store', 'settings', 'team', 'security', 'apps', 'orders', 'products', 'inventory', 'marketing', 'finance'];

export interface AuditEntry {
  id: string;
  /** ISO time. */
  at: string;
  /** Member id when known (team member), and the display name and role at the time of the action. */
  actor: { id: string; name: string; role: Role };
  area: AuditArea;
  what: L;
  /** Optional reference the entry is about (order ref, page slug, app id…). */
  target?: string;
  before?: string;
  after?: string;
}

export interface AuditFilter { member?: string; area?: AuditArea | ''; q?: string; days?: number | null }
/** Entries newest first, narrowed by member, area, free text (either language) and age in days. */
export function filterAudit(list: AuditEntry[], f: AuditFilter, now: Date = new Date()): AuditEntry[] {
  const q = (f.q ?? '').trim().toLowerCase();
  const from = f.days ? now.getTime() - f.days * 86_400_000 : null;
  return list
    .filter((e) => (!f.member || e.actor.id === f.member) && (!f.area || e.area === f.area) && (from === null || new Date(e.at).getTime() >= from)
      && (!q || `${e.what.ar} ${e.what.en} ${e.target ?? ''} ${e.actor.name}`.toLowerCase().includes(q)))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export const auditCounts = (list: AuditEntry[]) => {
  const out: Record<string, number> = {};
  for (const e of list) out[e.actor.id] = (out[e.actor.id] ?? 0) + 1;
  return out;
};

/** CSV of the filtered log (UTF-8 with BOM so Excel shows Arabic). */
export function auditCsv(list: AuditEntry[], lang: 'ar' | 'en'): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = lang === 'ar' ? ['الوقت', 'العضو', 'الدور', 'المجال', 'الإجراء', 'المرجع', 'قبل', 'بعد'] : ['Time', 'Member', 'Role', 'Area', 'Action', 'Reference', 'Before', 'After'];
  const rows = list.map((e) => [e.at, e.actor.name, e.actor.role, e.area, e.what[lang], e.target ?? '', e.before ?? '', e.after ?? ''].map(esc).join(','));
  return `﻿${[head.join(','), ...rows].join('\n')}`;
}

/** A few earlier entries so the log is not empty on first visit (demo data). Times are relative to the session start. */
export function auditFixtures(now = Date.now()): AuditEntry[] {
  const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const sara = { id: 'u1', name: 'سارة', role: 'owner' as Role };
  const faisal = { id: 'u2', name: 'فيصل', role: 'fulfilment' as Role };
  return [
    { id: 'A-1006', at: ago(2), actor: faisal, area: 'inventory', what: { ar: 'عدّل مخزون OUD-100 في الرياض (تالف)', en: 'Adjusted OUD-100 stock in Riyadh (damaged)' }, target: 'OUD-100', before: '6', after: '4' },
    { id: 'A-1005', at: ago(5), actor: faisal, area: 'orders', what: { ar: 'جهّز الطلب وأصدر ملصق الشحن', en: 'Fulfilled the order and issued the shipping label' }, target: '10482' },
    { id: 'A-1004', at: ago(26), actor: sara, area: 'store', what: { ar: 'نشر الإصدار 7 من ثيم المتجر', en: 'Published store theme version 7' }, target: 'v7', before: 'v6', after: 'v7' },
    { id: 'A-1003', at: ago(30), actor: sara, area: 'settings', what: { ar: 'نشر سياسة الاسترجاع', en: 'Published the returns policy' }, target: 'returns' },
    { id: 'A-1002', at: ago(52), actor: sara, area: 'team', what: { ar: 'دعا huda@darnuwa.test بدور المالية', en: 'Invited huda@darnuwa.test as Finance' }, target: 'huda@darnuwa.test' },
    { id: 'A-1001', at: ago(75), actor: sara, area: 'apps', what: { ar: 'ربط تطبيق المزامنة المحاسبية', en: 'Connected the accounting sync app' }, target: 'acc' },
  ];
}

export const nextAuditId = (list: AuditEntry[]) => `A-${list.reduce((m, e) => Math.max(m, Number(e.id.replace(/\D/g, '')) || 0), 1000) + 1}`;
