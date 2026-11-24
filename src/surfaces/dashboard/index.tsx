// The new merchant dashboard (`#/dashboard`). Built on the LAK design system in src/ds.
// Sections are added here as they are rebuilt; until then the shell links to the previous workspace and says so.
import type { Route } from '../../core/router';
import { ordersStore, settingsStore } from '../merchant/stores';
import { VIEWS } from '../merchant/domain';
import { Shell } from './shell';
import Home from './home';
import { ReviewBar } from './review';
import '../../ds/lak.css';

export default function Dashboard({ route }: { route: Route }) {
  const orders = ordersStore.use();
  const store = settingsStore.use().store.name;
  const needs = orders.filter(VIEWS.needs).length;
  const page = route.path[0] ?? '';
  return (
    <>
      <Shell active={page === '' ? 'home' : page} counts={{ orders: needs }} store={store}>
        <Home />
      </Shell>
      <ReviewBar />
    </>
  );
}
