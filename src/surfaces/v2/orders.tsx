// Orders: list and detail. Direction A opens the detail in a side panel next to the list on wide screens (≥1280px);
// direction B, and narrow screens, show the detail as its own page. The list's filters travel in the URL both ways.
import { useEffect } from 'react';
import { navigate, type Route } from '../../core/router';
import { vhref, useView } from './data';
import { OrdersList, focusAfterClose } from './orders-list';
import { OrderDetail } from './order-detail';
import { queryParams, readQuery, useLabels, useMedia, useShellInsets } from './orders-shared';
import { useTx } from './ui';
import './orders.css';

export default function Orders({ route }: { route: Route }) {
  const tx = useTx();
  const L = useLabels();
  const { dir } = useView();
  const wide = useMedia('(min-width: 1280px)');
  useShellInsets();
  const ref = route.path[1];
  const lq = readQuery(route);
  const listHref = vhref('orders', queryParams(lq));
  const backLabel = lq.view === 'all' ? tx('كل الطلبات', 'All orders') : L.view(lq.view);
  const split = dir === 'a' && wide && !!ref;

  const close = () => { focusAfterClose.ref = ref ?? null; navigate(listHref); };
  useEffect(() => {
    if (!split) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('.lk-scrim, .ord-menu-pop')) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }); // re-bound each render so it closes the order currently shown

  if (!ref) return <OrdersList route={route} />;
  if (!split) return <OrderDetail key={ref} refId={ref} mode="page" backHref={listHref} backLabel={backLabel} />;
  return (
    <div className="ord-split">
      <OrdersList route={route} selected={ref} compact />
      <aside className="ord-panel" aria-label={tx(`تفاصيل الطلب ${ref}`, `Order ${ref} details`)}>
        <OrderDetail key={ref} refId={ref} mode="panel" backHref={listHref} backLabel={backLabel} onClose={close} />
      </aside>
    </div>
  );
}
