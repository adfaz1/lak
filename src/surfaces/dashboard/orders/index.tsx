// Orders section of the merchant dashboard: list at `#/dashboard/orders`, detail at `#/dashboard/orders/<ref>`.
import type { Route } from '../../../core/router';
import OrdersList from './list';
import OrderDetail from './detail';

export default function Orders({ route }: { route: Route }) {
  const ref = route.path[0];
  return ref ? <OrderDetail key={ref} refId={ref} route={route} /> : <OrdersList route={route} />;
}
