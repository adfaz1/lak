// Session stores for LAK's commercial surfaces (simulated; "Reset data" clears them). Rules live in commercial.ts.
import { createStore } from '../../core/store';
import { creditFixture, emptyFeeInput, type CreditState, type FeeInput, type PackOrder, type ServiceRequest } from './commercial';

/** LAK store credit: ledger (newest first), low-balance threshold, auto top-up rule and the example unit prices typed by the merchant. */
export const creditStore = createStore.key('merchant.lakCredit')<CreditState>(creditFixture);
/** Fee calculator inputs, kept for the session so leaving and returning restores them. */
export const feeCalcStore = createStore.key('merchant.feeCalc')<FeeInput>(emptyFeeInput);
/** Merchant service requests (no vendors until partners are approved). */
export const serviceRequestsStore = createStore.key('merchant.serviceRequests')<ServiceRequest[]>(() => []);
/** Packaging-material requests and their simulated status history. */
export const packOrdersStore = createStore.key('merchant.packOrders')<PackOrder[]>(() => []);
/** Add-ons the merchant asked to be told about once LAK approves their price (simulated; nothing is bought). */
export const addonInterestStore = createStore.key('merchant.addonInterest')<Record<string, string>>(() => ({}));
