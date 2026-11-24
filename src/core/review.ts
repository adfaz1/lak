// Review mode: everything that exists only to test or compare the prototype (surface switcher, reset,
// direction and state toggles, simulated-failure switches) lives here, outside the product view.
// Enter with `?review=1` on any link, leave with `?review=0`. Remembered for the tab session.
import { createStore } from './store';

export const reviewModeStore = createStore.key('core.reviewMode')<boolean>(() => false);

/** Sync review mode from the current URL query; call on every route change. */
export function syncReviewMode(query: URLSearchParams): void {
  const v = query.get('review');
  if (v === '1' && !reviewModeStore.get()) reviewModeStore.set(true);
  if (v === '0' && reviewModeStore.get()) reviewModeStore.set(false);
}

export const useReviewMode = () => reviewModeStore.use();

/** Set when the merchant leaves the redesign for a section that is not redesigned yet. */
export const fromRedesignStore = createStore.key('core.fromRedesign')<boolean>(() => false);
