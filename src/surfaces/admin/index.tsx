// P02 — LAK platform super-admin (`#/admin/...`), on the LAK design system. `route.path` is below /admin.
import type { ComponentType } from 'react';
import type { Route } from '../../core/router';
import { ToastProvider } from '../../ds/kit';
import { can, SECTION_PERM, SECTIONS, type RoleId, type Section } from './domain';
import { roleStore } from './state';
import { Shell } from './shell';
import { NoPermission, NotFound, ReviewBar, ahref } from './ui';
import { useTx } from '../../ds/ui';
import Overview from './screens/overview';
import Kyc from './screens/kyc';
import Stores from './screens/stores';
import Plans from './screens/plans';
import Payments from './screens/payments';
import Shipping from './screens/shipping';
import Content from './screens/content';
import Health from './screens/health';
import Reports from './screens/reports';
import Announcements from './screens/announcements';
import Audit from './screens/audit';
import '../../ds/lak.css';

/** Every screen receives the route below its own section and the viewing role. */
export interface ScreenProps { route: Route; role: RoleId }
const SCREENS: Record<Section, ComponentType<ScreenProps>> = {
  overview: Overview, kyc: Kyc, stores: Stores, plans: Plans, payments: Payments, shipping: Shipping,
  content: Content, health: Health, reports: Reports, announcements: Announcements, audit: Audit,
};

export default function Admin({ route }: { route: Route }) {
  const role = roleStore.use();
  const head = route.path[0] ?? 'overview';
  const section = (SECTIONS as string[]).includes(head) ? (head as Section) : null;
  const Screen = section ? SCREENS[section] : null;
  const sub: Route = { path: route.path.slice(1), query: route.query };
  return (
    <ToastProvider>
      <Shell active={section}>
        {Screen && section
          ? (can(role, SECTION_PERM[section]) ? <Screen key={section} route={sub} role={role} /> : <NoPermission role={role} section={section} />)
          : <Missing />}
      </Shell>
      <ReviewBar />
    </ToastProvider>
  );
}

function Missing() {
  const tx = useTx();
  return <NotFound back={ahref()} backLabel={tx('نظرة عامة', 'Overview')} />;
}
