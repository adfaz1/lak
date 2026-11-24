// The new merchant dashboard (`#/dashboard`). Built on the LAK design system in src/ds.
import { Suspense, useEffect, useState } from 'react';
import { navigate, replace, sub, type Route } from '../../core/router';
import { ordersStore, settingsStore } from '../merchant/stores';
import { VIEWS } from '../merchant/domain';
import { Modal, ToastProvider } from '../../ds/kit';
import { Button, useTx } from '../../ds/ui';
import { useLang } from '../../core/lang';
import { discardUnsaved, hasUnsaved, unsavedLabels } from './unsaved';
import { dhref } from './shell';
import { Skeleton } from '../../ds/ui';
import { Shell } from './shell';
import Home from './home';
import { ReviewBar } from './review';
import { BUILT, SECTIONS } from './pages';
import { useReviewMode } from '../../core/review';
import { matchTool } from './model/tools';
import { pushRecentTool } from './prefs';
import '../../ds/lak.css';

const hrefOf = (r: Route) => dhref(r.path.join('/'), Object.fromEntries(r.query.entries()));
const keyOf = (r: Route) => `${r.path.join('/')}?${r.query.toString()}`;

export default function Dashboard({ route: live }: { route: Route }) {
  const { lang } = useLang();
  const tx = useTx();
  // Leave protection for every way of leaving (menu, search, links, Back): while edits are unsaved, the open page
  // stays mounted with its edits, the address is put back, and the merchant decides.
  const [route, setShown] = useState(live);
  const [pending, setPending] = useState<Route | null>(null);
  useEffect(() => {
    if (keyOf(live) === keyOf(route)) return;
    const samePage = live.path.join('/') === route.path.join('/');
    if (!samePage && hasUnsaved()) { setPending(live); replace(hrefOf(route)); return; }
    setShown(live);
  }, [keyOf(live)]); // eslint-disable-line react-hooks/exhaustive-deps
  const leave = () => { if (!pending) return; discardUnsaved(); const to = pending; setPending(null); setShown(to); navigate(hrefOf(to)); };
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
      {pending && (
        <Modal title={tx('تغادر دون حفظ؟', 'Leave without saving?')} onClose={() => setPending(null)}
          description={tx('لديك تعديلات غير محفوظة. بقاؤك يحتفظ بها كما هي.', 'You have unsaved edits. Staying keeps them as they are.')}
          footer={<><Button variant="secondary" onClick={() => setPending(null)}>{tx('ابقَ وأكمل التعديل', 'Stay and keep editing')}</Button><Button variant="danger" onClick={leave}>{tx('غادر وتجاهل التعديلات', 'Leave and discard')}</Button></>}>
          <ul className="list-disc space-y-1 ps-5 text-sm text-muted">{unsavedLabels().map((l, i) => <li key={i}>{l[lang]}</li>)}</ul>
        </Modal>
      )}
    </ToastProvider>
  );
}
