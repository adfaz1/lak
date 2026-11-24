// Session state for the service inbox: the merged case list, saving a case, composer drafts and saved views.
import { useMemo } from 'react';
import { createStore } from '../../../core/store';
import { link } from '../../../core/router';
import { customersStore, inboxStore, logAction, ordersStore, reviewsStore } from '../../merchant/stores';
import type { Case } from '../../merchant/inbox';
import { buildCases, upsert, type SavedInboxView, type Sources } from './model';

/** Links inside this section. */
export const ihref = (path = '', query?: Record<string, string | undefined>) => link(`/dashboard/inbox${path ? `/${path}` : ''}`, query);

/** Composer drafts per case (reply text, language, channel, mode), kept while the tab is open. */
export interface ComposerDraft { mode: 'reply' | 'note'; text: string; lang?: 'ar' | 'en'; channel?: string; close: boolean; publicToo: boolean; canned?: string }
export const draftsStore = createStore.key('dashboard.inbox.drafts')<Record<string, ComposerDraft>>(() => ({}));
export const emptyDraft = (): ComposerDraft => ({ mode: 'reply', text: '', close: false, publicToo: false });

/** Saved list views per viewer (name → URL params). */
export const savedViewsStore = createStore.key('dashboard.inbox.views')<Record<string, SavedInboxView[]>>(() => ({}));

/** Review mode only: simulate a message provider failure for inbox replies. */
export const simStore = createStore.key('dashboard.inbox.sim')<{ failSend: boolean; failCarrier: boolean }>(() => ({ failSend: false, failCarrier: false }));

export function useSources(): Sources {
  const orders = ordersStore.use();
  const reviews = reviewsStore.use();
  const customers = customersStore.use();
  return useMemo(() => ({ orders, reviews, customers }), [orders, reviews, customers]);
}

/** Every case (stored + derived), newest activity first. */
export function useCases(): { all: Case[]; src: Sources } {
  const stored = inboxStore.use();
  const src = useSources();
  return { all: useMemo(() => buildCases(stored, src), [stored, src]), src };
}

/** Persist one changed case and log what happened. */
export function saveCase(next: Case, what?: { ar: string; en: string }) {
  inboxStore.set((list) => upsert(list, next));
  if (what) logAction('orders', what, { target: next.id + (next.orderRef ? ` · #${next.orderRef}` : '') });
}
