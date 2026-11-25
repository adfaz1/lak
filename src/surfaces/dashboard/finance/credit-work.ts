// Work-centre entry for a low LAK credit balance, built from the one credit state (merchant/commercial.ts).
// The work centre owns its queue: it can call `creditWorkItem(creditStore.get())` and pass the result to its
// `external()` wrapper (it renders `title`/`why`/`cta`). Null before the first top-up and while at or above the alert.
import type { L } from '../../merchant/domain';
import { creditBalance, isLow, type CreditState } from '../../merchant/commercial';
import { creditStore } from '../../merchant/commercial-store';
import type { WorkItem } from '../work/model';

export type CreditWorkItem = Omit<WorkItem, 'kind' | 'facts'> & { title: L; why: L; cta: L; moneyLabel: L };

const sar = (h: number) => (h / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

export function creditWorkItem(s: CreditState): CreditWorkItem | null {
  // A merchant who never used credit is not nagged; the alert starts after the first top-up.
  if (!s.entries.length || !isLow(s)) return null;
  const bal = creditBalance(s);
  const empty = bal <= 0;
  return {
    id: 'lak-credit-low', severity: empty ? 3 : 2, money: Math.max(0, s.threshold - bal), moneyKind: 'none',
    orders: 0, customers: 0, skus: [], oldestHours: null,
    subject: empty ? { ar: 'نفد رصيد لك', en: 'LAK credit is empty' } : { ar: 'رصيد لك منخفض', en: 'LAK credit is low' },
    action: { section: 'finance', query: { tab: 'billing', part: 'credit' } },
    page: 'finance', need: ['billing.manage'],
    fingerprint: `credit:${s.threshold}:${empty ? 'empty' : 'low'}:${s.auto.on}`,
    title: { ar: 'رصيد لك', en: 'LAK credit' },
    why: s.auto.on
      ? { ar: `الرصيد ${sar(bal)} ر.س أقل من حد التنبيه ${sar(s.threshold)} ر.س؛ الشحن التلقائي مفعّل`, en: `Balance SAR ${sar(bal)} is below your SAR ${sar(s.threshold)} alert; auto top-up is on` }
      : { ar: `الرصيد ${sar(bal)} ر.س أقل من حد التنبيه ${sar(s.threshold)} ر.س؛ قد تتوقف الرسائل والبوليصات`, en: `Balance SAR ${sar(bal)} is below your SAR ${sar(s.threshold)} alert; messages and labels may stop` },
    cta: { ar: 'اشحن الرصيد', en: 'Top up credit' },
    moneyLabel: { ar: 'الفرق عن حد التنبيه', en: 'Short of the alert level' },
  };
}
/** Convenience for the work centre: reads the current session store. */
export const creditSignal = () => creditWorkItem(creditStore.get());
