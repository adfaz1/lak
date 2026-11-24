// Finance session state the merchant workspace does not keep yet: reconciliation cases and the finance activity log,
// plus review-only simulations of a payout mismatch and a payout the bank returned. "Reset data" clears them.
import { createStore } from '../../../core/store';
import { financeStore } from '../../merchant/stores';
import { reconcile } from '../../merchant/finance';
import { settlementIssues, type FinanceOps } from './model';

export const financeOpsStore = createStore.key('dashboard.finance.ops')<FinanceOps>(() => ({ cases: [], log: [] }));

/** Settlement issues for the current session (home / work centre). */
export const currentSettlementIssues = () => settlementIssues(financeStore.get(), financeOpsStore.get());
export function useSettlementIssues() {
  const fin = financeStore.use();
  const ops = financeOpsStore.use();
  return settlementIssues(fin, ops);
}

/** Review mode: the bank receives less than the computed net for a paid payout (one of its fees counted twice). */
export function simulateMismatch() {
  financeStore.set((f) => {
    const p = f.payouts.find((x) => x.status === 'paid' && !x.problem);
    if (!p) return f;
    const fee = f.txs.find((t) => t.payoutId === p.id && t.type === 'fee');
    const net = reconcile({ ...p, amount: null }, f.txs).net;
    return { ...f, payouts: f.payouts.map((x) => (x.id === p.id ? { ...x, amount: net - (fee?.amount ?? 1840) } : x)) };
  });
}
/** Review mode: the bank returns the payout in transit (account closed). */
export function simulateReturned() {
  financeStore.set((f) => ({
    ...f,
    payouts: f.payouts.map((x) => (x.status === 'in_transit' && !x.problem ? { ...x, problem: { reason: { ar: 'الحساب البنكي مغلق لدى البنك المستفيد', en: 'Beneficiary account closed at the bank' }, day: '2026-11-24' } } : x)),
  }));
}

/** Payments settings drafts and states kept for the session: the unsaved bank form and Apple Pay domain verification. */
export const paymentsUiStore = createStore.key('dashboard.payments.ui')<{ bankDraft: import('./model').BankDraft | null; applePayDomain: 'unverified' | 'verified' }>(() => ({ bankDraft: null, applePayDomain: 'unverified' }));
