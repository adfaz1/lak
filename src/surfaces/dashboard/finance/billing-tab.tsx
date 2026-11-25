// Plan & billing tab (`#/dashboard/finance?tab=billing&part=plan|credit|fees`): the plan with its limits and usage,
// add-ons, LAK credit and the fee calculator. Every LAK price, fee, rate and limit LAK would set shows «بانتظار الاعتماد».
import type { ReactNode } from 'react';
import { ArrowLeft, BellRing, Check, Gauge, Package } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, type Route } from '../../../core/router';
import { locationsStore, logAction, productsStore, settingsStore, teamStore, testStore } from '../../merchant/stores';
import { can } from '../../merchant/perms';
import { seatsUsed } from '../../merchant/workspace';
import type { Plan } from '../../merchant/finance';
import { ADDONS, addOnAvailable, limitChanges, usageRows, type Limit, type LimitKey, type Usage, type UsageState } from '../../merchant/commercial';
import { addonInterestStore } from '../../merchant/commercial-store';
import { Badge, Button, InfoHint, cn, useTx, type Tone } from '../../../ds/ui';
import { Simulated, Tabs, useToast } from '../../../ds/kit';
import { DecisionMarker, Pending } from '../settings/decision-marker';
import CreditPanel from './credit';
import FeeCalculator from './fees';

type Part = 'plan' | 'credit' | 'fees';
const PARTS: Part[] = ['plan', 'credit', 'fees'];
const href = (part: Part) => link('/dashboard/finance', { tab: 'billing', part: part === 'plan' ? undefined : part });
const PLAN_NAME: Record<Plan, string> = { basic: 'Basic', plus: 'Plus', pro: 'Pro', special: 'Special' };

export function BillingTab({ route, plan }: { route: Route; plan: ReactNode }) {
  const tx = useTx();
  const q = route.query.get('part');
  const part: Part = (PARTS as string[]).includes(q ?? '') ? (q as Part) : 'plan';
  return (
    <div className="border-t border-border">
      <div className="px-4 pt-1 sm:px-5">
        <Tabs label={tx('أقسام الخطة والفوترة', 'Plan & billing sections')} items={[
          { href: href('plan'), label: tx('الخطة والحدود', 'Plan & limits'), current: part === 'plan' },
          { href: href('credit'), label: tx('رصيد لك', 'LAK credit'), current: part === 'credit' },
          { href: href('fees'), label: tx('حاسبة الرسوم', 'Fee calculator'), current: part === 'fees' },
        ]} />
      </div>
      {part === 'plan' && <><div className="px-4 pt-5 sm:px-5"><PlanUsage /></div>{plan}<div className="px-4 pb-5 sm:px-5"><AddOns /></div></>}
      {part === 'credit' && <CreditPanel />}
      {part === 'fees' && <FeeCalculator />}
    </div>
  );
}

/* ---------- Names ---------- */

export function useLimitNames() {
  const tx = useTx();
  return {
    key: (k: LimitKey) => ({ staff: tx('مقاعد الفريق', 'Team seats'), stores: tx('المتاجر', 'Stores'), branches: tx('الفروع والمستودعات', 'Branches & warehouses'), products: tx('المنتجات', 'Products') })[k],
    limit: (l: Limit): ReactNode => l === null ? tx('غير محدود', 'Unlimited') : l === 'pending' ? <Pending /> : <bdi className="tabular-nums">{l}</bdi>,
    state: (s: UsageState) => ({ ok: tx('ضمن الحد', 'Within limit'), near: tx('قريب من الحد', 'Near the limit'), full: tx('وصلت الحد', 'At the limit'), over: tx('فوق الحد', 'Over the limit'), unlimited: tx('بلا حد عددي', 'No numeric limit'), pending: tx('الحد بانتظار الاعتماد', 'Limit pending approval') })[s],
  };
}
const S_TONE: Record<UsageState, Tone> = { ok: 'green', near: 'amber', full: 'amber', over: 'red', unlimited: 'gray', pending: 'amber' };
const FIX: Record<LimitKey, string | null> = { staff: 'settings/team', stores: null, branches: 'inventory/locations', products: 'products' };

export function useUsage(): Usage {
  const team = teamStore.use();
  const locs = locationsStore.use();
  const products = productsStore.use();
  return { staff: seatsUsed(team.members), stores: 1, branches: locs.filter((l) => l.active).length, products: products.length };
}

/* ---------- Usage vs limits ---------- */

function PlanUsage() {
  const tx = useTx();
  const n = useLimitNames();
  const plan = settingsStore.use().plan;
  const rows = usageRows(plan, useUsage());
  return (
    <section aria-labelledby="h-usage">
      <h3 id="h-usage" className="mb-3 flex flex-wrap items-center gap-1.5 text-[15px] font-semibold text-fg"><Gauge className="size-4 text-muted" aria-hidden="true" />{tx(`حدود باقتك (${PLAN_NAME[plan]}) واستخدامك`, `Your plan limits (${PLAN_NAME[plan]}) and usage`)}
        <InfoHint>{tx('الحدود من مصفوفة المخطط (مقترح غير نهائي). «غير محدود» يخضع لسياسة استخدام عادل لم تُعتمد بعد.', 'Limits come from the blueprint matrix (a non-final proposal). “Unlimited” is subject to a fair-use policy not yet approved.')}</InfoHint>
        <DecisionMarker id="plans" className="ms-auto" /></h3>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((r) => {
          const pct = typeof r.limit === 'number' ? Math.min(100, (r.used * 100) / r.limit) : null;
          const fix = FIX[r.key];
          return (
            <li key={r.key} className="flex flex-col rounded-2xl border border-border p-4">
              <p className="text-xs font-medium text-muted">{n.key(r.key)}</p>
              <p className="mt-1 flex items-baseline gap-1 text-xl font-bold text-fg"><bdi className="tabular-nums">{r.used}</bdi><span className="text-sm font-medium text-muted">/ {n.limit(r.limit)}</span></p>
              {pct !== null && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className={cn('h-full rounded-full', r.state === 'over' ? 'bg-red-500' : r.state === 'ok' ? 'bg-brand-gradient' : 'bg-amber-500')} style={{ width: `${pct}%` }} /></div>}
              <span className="mt-2.5 flex flex-wrap items-center gap-2">
                <Badge tone={S_TONE[r.state]}>{n.state(r.state)}</Badge>
                {fix && (r.state === 'over' || r.state === 'full') && <a href={link(`/dashboard/${fix}`)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('راجع', 'Review')}<ArrowLeft className="size-3 ltr:rotate-180" aria-hidden="true" /></a>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Limit changes for the plan-change preview (used inside the impact modal). */
export function LimitChanges({ from, to }: { from: Plan; to: Plan }) {
  const tx = useTx();
  const n = useLimitNames();
  const rows = limitChanges(from, to, useUsage());
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">{tx('تغير الحدود', 'Limit changes')}</caption>
        <thead className="bg-surface-2/60 text-xs text-muted"><tr>
          <th scope="col" className="px-3 py-2 text-start font-semibold">{tx('الحد', 'Limit')}</th>
          <th scope="col" className="px-3 py-2 text-center font-semibold">{tx('تستخدم', 'Using')}</th>
          <th scope="col" className="px-3 py-2 text-center font-semibold">{PLAN_NAME[from]}</th>
          <th scope="col" className="px-3 py-2 text-center font-semibold">{PLAN_NAME[to]}</th>
        </tr></thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.key} className={cn(r.over > 0 && 'bg-red-500/5')}>
              <th scope="row" className="px-3 py-2 text-start font-medium text-fg">{n.key(r.key)}</th>
              <td className="px-3 py-2 text-center tabular-nums">{r.used}</td>
              <td className="px-3 py-2 text-center text-muted">{n.limit(r.before)}</td>
              <td className="px-3 py-2 text-center">{n.limit(r.after)}{r.over > 0 && <span className="block text-[11px] font-semibold text-red-700 dark:text-red-400">{tx(`أزل ${r.over} أولًا`, `Remove ${r.over} first`)}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Add-ons ---------- */

function AddOns() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const plan = settingsStore.use().plan;
  const role = testStore.use().role;
  const asked = addonInterestStore.use();
  const manage = can(role, 'billing.manage');
  const ask = (id: string, name: string) => {
    addonInterestStore.set((a) => ({ ...a, [id]: new Date().toISOString() }));
    logAction('finance', { ar: `طلب إشعارًا عند اعتماد سعر الإضافة «${name}»`, en: `Asked to be notified when the “${name}” add-on price is approved` }, { target: id });
    toast({ tone: 'ok', text: tx('سنُعلمك عند اعتماد السعر (محاكاة)', 'You’ll be told when the price is approved (simulated)') });
  };
  return (
    <section aria-labelledby="h-addons">
      <h3 id="h-addons" className="mb-3 flex items-center gap-1.5 text-[15px] font-semibold text-fg"><Package className="size-4 text-muted" aria-hidden="true" />{tx('الإضافات', 'Add-ons')}
        <InfoHint>{tx('«من المخطط» = مذكورة في مصفوفة الباقات. «مقترح» = حد قابل للشراء لم يرد في المخطط بعد.', '“Blueprint” = listed in the plan matrix. “Proposal” = a purchasable limit not in the blueprint yet.')}</InfoHint></h3>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {ADDONS.map((a) => {
          const ok = addOnAvailable(a, plan);
          const done = asked[a.id];
          return (
            <li key={a.id} className="flex flex-col rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-center gap-2"><p className="min-w-0 flex-1 text-sm font-semibold text-fg">{a.title[lang]}</p><Badge tone={a.source === 'blueprint' ? 'sky' : 'gray'}>{a.source === 'blueprint' ? tx('من المخطط', 'Blueprint') : tx('مقترح', 'Proposal')}</Badge></div>
              <p className="mt-1 flex-1 text-[13px] text-muted">{a.desc[lang]}</p>
              <dl className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between gap-2"><dt className="text-muted">{tx('السعر', 'Price')}</dt><dd><Pending /></dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted">{tx('متاحة من', 'Available from')}</dt><dd className="font-medium text-fg">{PLAN_NAME[a.minPlan]}</dd></div>
              </dl>
              <div className="mt-3">
                {!ok ? <p className="text-xs text-muted">{tx(`تحتاج ${PLAN_NAME[a.minPlan]} أو أعلى`, `Needs ${PLAN_NAME[a.minPlan]} or higher`)}</p>
                  : done ? <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"><Check className="size-3.5" aria-hidden="true" />{tx('سنُعلمك عند الاعتماد', 'We’ll tell you on approval')}</p>
                    : manage ? <Button size="sm" variant="secondary" onClick={() => ask(a.id, a.title[lang])}><BellRing className="size-4" aria-hidden="true" />{tx('أعلمني عند الاعتماد', 'Notify me on approval')}</Button>
                      : <p className="text-xs text-muted">{tx('يتطلب صلاحية الفوترة', 'Needs billing permission')}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 flex items-center gap-2 text-xs text-muted"><Simulated />{tx('لا تُشترى إضافة ولا يُحصَّل مبلغ قبل اعتماد الأسعار.', 'No add-on is bought and nothing is charged before prices are approved.')}</p>
    </section>
  );
}
