// The new merchant dashboard (`#/dashboard`). Built on the LAK design system in src/ds.
import { Suspense, useEffect } from 'react';
import { sub, type Route } from '../../core/router';
import { ordersStore, settingsStore } from '../merchant/stores';
import { VIEWS } from '../merchant/domain';
import { ToastProvider } from '../../ds/kit';
import { Skeleton } from '../../ds/ui';
import { Shell } from './shell';
import Home from './home';
import { ReviewBar } from './review';
import { BUILT, SECTIONS } from './pages';
import { useReviewMode } from '../../core/review';
import { matchTool } from './model/tools';
import { pushRecentTool } from './prefs';
import '../../ds/lak.css';

export default function Dashboard({ route }: { route: Route }) {
  const orders = ordersStore.use();
  const store = settingsStore.use().store.name;
  const needs = orders.filter(VIEWS.needs).length;
  const key = route.path[0] ?? '';
  // Review mode can open sections that are still being built, for inspection before they are linked.
  const review = useReviewMode();
  const Section = key && SECTIONS[key] && (BUILT.has(key) || review) ? SECTIONS[key] : null;
  // Opening a tool by any route (menu, search, link) counts as using it.
  const routeKey = `${route.path.join('/')}?${route.query.toString()}`;
  useEffect(() => { const t = matchTool(route.path, route.query); if (t && t.id !== 'tools') pushRecentTool(t.id); }, [routeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ToastProvider>
      <Shell active={Section ? key : 'home'} counts={{ orders: needs }} store={store}>
        {Section ? (
          <Suspense fallback={<div className="space-y-4" aria-busy="true"><Skeleton className="h-9 w-48" /><Skeleton className="h-64 w-full rounded-2xl" /></div>}>
            <Section route={sub(route, 1)} />
          </Suspense>
        ) : <Home />}
      </Shell>
      <ReviewBar />
    </ToastProvider>
  );
}
