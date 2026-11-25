// Point of sale (`#/dashboard/pos`): a cashier screen on the same catalogue and stock as the online store.
// Tabs: register (sell), held sales, shift (drawer, cash count, variance), counter sales (refund / exchange) and
// settings (PINs, discount limits). Sales become orders with channel 'pos' and take stock at the chosen location.
// Simulated: card terminal, payment links, printing, WhatsApp, PINs. Hardware, terminal fees and LAK POS pricing
// await LAK approval.
import { Lock, Store } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, type Route } from '../../../core/router';
import { allLocations } from '../../merchant/domain';
import { logAction, teamStore } from '../../merchant/stores';
import { canSell, openShiftAt } from '../../merchant/pos';
import { Badge, Button, Card, ErrorState, InfoHint, Skeleton, useTx } from '../../../ds/ui';
import { PageHeader, Simulated, Tabs } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { NoAccess, ReviewRole, useRole } from '../marketing/access';
import { posStore, setPos } from './state';
import { DecisionMark } from './parts';
import { OpenShift, Register, SignIn } from './register';
import { HeldPage, ShiftPage } from './shift';
import { SaleDetail, SalesList } from './sales';
import { PosSettings } from './settings';

type Tab = 'register' | 'held' | 'shift' | 'sales' | 'settings';

export default function Pos({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const role = useRole();
  const state = useDashState();
  const s = posStore.use();
  const team = teamStore.use();
  const sells = canSell(role);
  if (!sells && role !== 'finance') return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('نقطة البيع غير متاحة لدورك', 'Point of sale is not available for your role')} /></div>;
  const p0 = route.path[0] as Tab | undefined;
  const tab: Tab = p0 && ['held', 'shift', 'sales', 'settings'].includes(p0) ? p0 : sells ? 'register' : 'sales';
  const cashier = team.members.find((m) => m.id === s.session?.memberId);
  const loc = allLocations().find((l) => l.id === s.session?.loc);
  const shift = s.session ? openShiftAt(s.shifts, s.session.loc) : undefined;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    ...(sells ? [{ id: 'register' as Tab, label: tx('الكاشير', 'Register') }, { id: 'held' as Tab, label: tx('المعلّقة', 'Held'), count: s.held.length }] : []),
    { id: 'shift', label: tx('الوردية', 'Shift') },
    { id: 'sales', label: tx('المبيعات', 'Sales') },
    ...(role === 'owner' ? [{ id: 'settings' as Tab, label: tx('الإعدادات', 'Settings') }] : []),
  ];
  const lock = () => {
    logAction('orders', { ar: `خروج من نقطة البيع: ${cashier?.name}`, en: `POS sign-out: ${cashier?.name}` });
    setPos(() => ({ session: null }));
  };
  const header = (
    <>
      <PageHeader
        title={<span className="inline-flex items-center gap-1.5">{tx('نقطة البيع', 'Point of sale')}<InfoHint>{tx('بيع في المحل من الكتالوج والمخزون نفسيهما. كل بيع يصبح طلبًا بقناة «نقطة البيع» ويخصم المخزون من الموقع المختار.', 'Sell in-store from the same catalogue and stock. Every sale becomes an order on the “Point of sale” channel and takes stock from the chosen location.')}</InfoHint></span>}
        meta={<>
          {loc && <Badge tone="brand" icon={<Store className="size-3" aria-hidden="true" />}>{loc.name[lang]}</Badge>}
          {cashier && <Badge>{cashier.name}</Badge>}
          {shift ? <Badge tone="green">{tx('وردية', 'Shift')} {shift.id}</Badge> : s.session ? <Badge tone="amber">{tx('لا وردية', 'No shift')}</Badge> : null}
          <Simulated /><DecisionMark what={tx('أجهزة ورسوم وتسعير نقطة البيع', 'POS hardware, fees and pricing')} />
        </>}
        actions={s.session ? <Button variant="secondary" onClick={lock}><Lock className="size-4" aria-hidden="true" />{tx('قفل وتبديل الكاشير', 'Lock and switch cashier')}</Button> : undefined} />
      <ReviewRole />
      <Tabs label={tx('أقسام نقطة البيع', 'Point of sale sections')} items={tabs.map((t) => ({ href: link(t.id === 'register' ? '/dashboard/pos' : `/dashboard/pos/${t.id}`), label: t.label, current: tab === t.id, count: t.count || undefined }))} />
    </>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]" role="status" aria-label={tx('جارٍ التحميل', 'Loading')}><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div><Skeleton className="h-96 rounded-2xl" /></div></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل نقطة البيع', 'Point of sale could not load')} onRetry={() => setDashState('live')}>{tx('لم يضِع أي بيع؛ السلة محفوظة في الجلسة. المرجع SIM-POS-503.', 'No sale was lost; the cart is kept in this session. Ref SIM-POS-503.')}</ErrorState></Card></div>;

  let body;
  if (tab === 'sales') body = route.path[1] ? <SaleDetail refId={route.path[1]} role={role} /> : <SalesList route={route} />;
  else if (tab === 'shift') body = <ShiftPage canManage={sells} />;
  else if (tab === 'held') body = <HeldPage />;
  else if (tab === 'settings') body = <PosSettings />;
  else body = !s.session ? <SignIn /> : !shift ? <OpenShift /> : <Register />;
  return <div className="space-y-6">{header}{body}</div>;
}
