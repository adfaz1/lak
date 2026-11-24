// My account: personal profile, alert preferences per event, signed-in devices and two-step verification.
// Pure rules (no React). Everything here is simulated: no email/SMS is sent, no real session or authenticator exists.
import type { L } from '../../../core/lang';
import { can, canSee, type Action, type Page, type Role } from '../../merchant/perms';
import { validEmail } from '../../merchant/workspace';

/** Arabic-Indic and Persian digits typed on Arabic keyboards become ASCII digits. */
export const toAsciiDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/* ---------- Profile ---------- */

export interface Profile { name: string; email: string; phone: string; jobTitle: string }
export type ProfileErrors = Partial<Record<keyof Profile, 'required' | 'invalid' | 'long'>>;
export function profileErrors(p: Profile): ProfileErrors {
  const e: ProfileErrors = {};
  if (!p.name.trim()) e.name = 'required'; else if (p.name.trim().length > 40) e.name = 'long';
  if (!validEmail(p.email)) e.email = 'invalid';
  const digits = toAsciiDigits(p.phone).replace(/[\s-]/g, '');
  if (digits && !/^(\+9665|9665|05|5)[0-9x]{8}$/i.test(digits)) e.phone = 'invalid';
  if (p.jobTitle.length > 40) e.jobTitle = 'long';
  return e;
}
/** Changing the sign-in email or mobile needs confirming the new one (a code is sent there). */
export const needsReverify = (before: Profile, after: Profile): ('email' | 'phone')[] =>
  [...(before.email.trim().toLowerCase() !== after.email.trim().toLowerCase() ? ['email' as const] : []), ...(toAsciiDigits(before.phone).replace(/\D/g, '') !== toAsciiDigits(after.phone).replace(/\D/g, '') && after.phone.trim() ? ['phone' as const] : [])];
export const initials = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

/* ---------- Personal alerts per event ---------- */

export type AlertEvent = 'newOrder' | 'orderLate' | 'paymentFailed' | 'refundRequested' | 'lowStock' | 'payout' | 'review' | 'integrationError' | 'teamChange' | 'newDevice' | 'platformUpdates';
export type AlertChannel = 'app' | 'email' | 'sms';
export const ALERT_CHANNELS: AlertChannel[] = ['app', 'email', 'sms'];
export interface AlertDef { id: AlertEvent; group: 'orders' | 'stock' | 'money' | 'store' | 'security'; label: L; needs?: { page?: Page; action?: Action }; locked?: AlertChannel[] }
export const ALERTS: AlertDef[] = [
  { id: 'newOrder', group: 'orders', label: { ar: 'طلب جديد', en: 'New order' }, needs: { page: 'orders' } },
  { id: 'orderLate', group: 'orders', label: { ar: 'طلب تأخر تجهيزه', en: 'Order late to fulfil' }, needs: { page: 'orders' } },
  { id: 'refundRequested', group: 'orders', label: { ar: 'طلب استرجاع', en: 'Return requested' }, needs: { page: 'orders' } },
  { id: 'lowStock', group: 'stock', label: { ar: 'مخزون منخفض', en: 'Low stock' }, needs: { page: 'inventory' } },
  { id: 'paymentFailed', group: 'money', label: { ar: 'تعثّر دفع', en: 'Payment failed' }, needs: { page: 'orders' } },
  { id: 'payout', group: 'money', label: { ar: 'إيداع تسوية', en: 'Payout sent' }, needs: { page: 'finance' } },
  { id: 'review', group: 'store', label: { ar: 'تقييم جديد', en: 'New review' }, needs: { page: 'products' } },
  { id: 'integrationError', group: 'store', label: { ar: 'خطأ في ربط تطبيق', en: 'Integration error' }, needs: { action: 'apps.manage' } },
  { id: 'teamChange', group: 'security', label: { ar: 'تغيير في الفريق أو الأدوار', en: 'Team or role change' }, needs: { action: 'team.manage' } },
  { id: 'newDevice', group: 'security', label: { ar: 'دخول من جهاز جديد', en: 'Sign-in from a new device' }, locked: ['email'] },
  { id: 'platformUpdates', group: 'store', label: { ar: 'تحديثات منصة «لك»', en: 'LAK platform updates' } },
];
export type AlertPrefs = Record<AlertEvent, Record<AlertChannel, boolean>>;
/** Only alerts about things the role can see; security alerts are for everyone. */
export const alertsFor = (role: Role) => ALERTS.filter((a) => !a.needs || ((!a.needs.page || canSee(role, a.needs.page)) && (!a.needs.action || can(role, a.needs.action))));
export function defaultPrefs(): AlertPrefs {
  const on = (app: boolean, email: boolean, sms: boolean) => ({ app, email, sms });
  return {
    newOrder: on(true, false, false), orderLate: on(true, true, false), refundRequested: on(true, true, false), lowStock: on(true, true, false),
    paymentFailed: on(true, true, true), payout: on(true, true, false), review: on(true, false, false), integrationError: on(true, true, false),
    teamChange: on(true, true, false), newDevice: on(true, true, false), platformUpdates: on(false, true, false),
  };
}
/** Older sessions may miss events added later: fill them from the defaults. Locked channels stay on. */
export function normPrefs(p: Partial<AlertPrefs> | undefined): AlertPrefs {
  const d = defaultPrefs();
  const out = { ...d, ...(p ?? {}) } as AlertPrefs;
  for (const a of ALERTS) for (const ch of a.locked ?? []) out[a.id] = { ...out[a.id], [ch]: true };
  return out;
}
export const setPref = (p: AlertPrefs, e: AlertEvent, ch: AlertChannel, v: boolean): AlertPrefs => {
  if (!v && ALERTS.find((a) => a.id === e)?.locked?.includes(ch)) return p;
  return { ...p, [e]: { ...p[e], [ch]: v } };
};
/** Text messages cost money; count what would be sent by SMS for a typical week (simulated volumes). */
export const WEEKLY_VOLUME: Record<AlertEvent, number> = { newOrder: 120, orderLate: 6, refundRequested: 4, lowStock: 5, paymentFailed: 3, payout: 2, review: 9, integrationError: 1, teamChange: 0, newDevice: 1, platformUpdates: 1 };
export const weeklySms = (p: AlertPrefs, role: Role) => alertsFor(role).reduce((s, a) => s + (p[a.id].sms ? WEEKLY_VOLUME[a.id] : 0), 0);

/* ---------- Sessions and devices ---------- */

export interface Session { id: string; device: L; browser: string; city: L; ip: string; lastActive: string; current: boolean }
export function sessionFixtures(now = Date.now()): Session[] {
  const ago = (m: number) => new Date(now - m * 60_000).toISOString();
  return [
    { id: 's1', device: { ar: 'هذا الجهاز · ماك', en: 'This device · Mac' }, browser: 'Chrome', city: { ar: 'الرياض', en: 'Riyadh' }, ip: '188.48.•••.21', lastActive: ago(0), current: true },
    { id: 's2', device: { ar: 'آيفون 15', en: 'iPhone 15' }, browser: 'Safari', city: { ar: 'الرياض', en: 'Riyadh' }, ip: '37.106.•••.8', lastActive: ago(95), current: false },
    { id: 's3', device: { ar: 'ويندوز', en: 'Windows PC' }, browser: 'Edge', city: { ar: 'جدة', en: 'Jeddah' }, ip: '95.184.•••.140', lastActive: ago(60 * 26 * 3), current: false },
  ];
}
export const revokeSession = (list: Session[], id: string) => list.filter((s) => s.id !== id || s.current);
export const revokeOthers = (list: Session[]) => list.filter((s) => s.current);

/* ---------- Two-step verification ---------- */

export type TwoFaMethod = 'app' | 'sms';
export interface TwoFa { enabled: boolean; method: TwoFaMethod | null; enabledAt: string | null; backupLeft: number }
export const twoFaOff = (): TwoFa => ({ enabled: false, method: null, enabledAt: null, backupLeft: 0 });
/** A setup secret in base32-like groups. Simulated: no authenticator can use it. */
export function setupSecret(seed: string): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let h = 2166136261;
  let out = '';
  for (let i = 0; i < 16; i++) { h = Math.imul(h ^ (seed.charCodeAt(i % seed.length) + i), 16777619) >>> 0; out += A[h % 32]; }
  return out.match(/.{4}/g)!.join(' ');
}
/** The 6-digit code the simulated authenticator shows for a secret. */
export const demoCode = (secret: string) => String([...secret].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) % 1_000_000).padStart(6, '0');
export type CodeError = 'format' | 'wrong' | null;
export function checkCode(input: string, secret: string): CodeError {
  const c = toAsciiDigits(input).replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return 'format';
  return c === demoCode(secret) ? null : 'wrong';
}
/** Ten one-time backup codes (xxxx-xxxx), derived from the secret so they stay stable while the dialog is open. */
export function backupCodes(secret: string): string[] {
  return Array.from({ length: 10 }, (_, i) => {
    const n = [...`${secret}${i}`].reduce((h, c) => (Math.imul(h, 33) + c.charCodeAt(0)) >>> 0, 5381);
    const s = n.toString(36).padStart(8, '0').slice(-8);
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

/* ---------- Per-member account record ---------- */

export interface AccountRecord { phone: string; jobTitle: string; prefs: AlertPrefs; sessions: Session[]; twofa: TwoFa }
export const accountFixture = (memberId: string): AccountRecord => ({
  phone: memberId === 'u1' ? '0551234567' : '', jobTitle: memberId === 'u1' ? 'المالكة' : '',
  prefs: defaultPrefs(), sessions: sessionFixtures(), twofa: memberId === 'u1' ? { enabled: true, method: 'app', enabledAt: '2026-09-02T10:00:00.000Z', backupLeft: 8 } : twoFaOff(),
});
