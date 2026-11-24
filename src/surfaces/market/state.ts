// Shopper-side fixture state for «سوق لك» (simulated; survives reload within the tab) and review-mode switches.
import { createStore } from '../../core/store';
import { useReviewMode } from '../../core/review';
import type { Line, Order } from './domain';
import { initialNotes, initialOrders, type Note } from './fixtures';

export interface Ticket { ref: string; topic: string; order: string; at: string }
export interface MState { cart: Line[]; orders: Order[]; notes: Note[]; tickets: Ticket[]; seq: number }

export const marketStore = createStore.key('market.shopper')<MState>(() => ({
  cart: [], orders: initialOrders(), notes: initialNotes(), tickets: [], seq: 1,
}));

export type ScreenState = 'live' | 'loading' | 'empty' | 'error';
export interface ReviewFx { state: ScreenState; declineCard: boolean }
export const reviewFx = createStore.key('market.review')<ReviewFx>(() => ({ state: 'live', declineCard: false }));

/** Forced screen state; always live outside review mode. */
export function useScreen(): ScreenState {
  const s = reviewFx.use();
  return useReviewMode() ? s.state : 'live';
}
/** Simulated card decline: only effective in review mode. */
export function useDecline(): boolean {
  const s = reviewFx.use();
  return useReviewMode() && s.declineCard;
}

export const now = () => new Date().toISOString();
