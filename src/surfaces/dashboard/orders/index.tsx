// Orders section of the merchant dashboard: list at `#/dashboard/orders`, detail at `#/dashboard/orders/<ref>`,
// manual order at `/new`, print view at `/print`, returns queue at `/returns` and one return at `/returns/<id>`.
import type { Route } from '../../../core/router';
import OrdersList from './list';
import OrderDetail from './detail';
import NewOrder from './new';
import PrintView from './print';
import { ReturnDetail, ReturnsList } from './returns';

export default function Orders({ route }: { route: Route }) {
  const [a, b] = route.path;
  if (a === 'new') return <NewOrder />;
  if (a === 'print') return <PrintView route={route} />;
  if (a === 'returns') return b ? <ReturnDetail key={b} id={b} /> : <ReturnsList route={route} />;
  return a ? <OrderDetail key={a} refId={a} route={route} /> : <OrdersList route={route} />;
}
