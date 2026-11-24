// Shipping (`#/dashboard/settings/shipping`): methods by category and their carriers, rules for when each shows at
// checkout, zones and delivery promises, a "what the shopper sees" simulator, international readiness per product,
// and operations (warehouse by city, phone check, COD exceptions). The online store reads all of it (storefront/bridge.ts).
import { Truck } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { useRoute } from '../../../core/router';
import { shippingFixture } from '../../merchant/workspace';
import { Button, Card, EmptyState, useTx } from '../../../ds/ui';
import { Tabs } from '../../../ds/kit';
import { setDashState, useDashState } from '../review';
import { summary } from './shipping-model';
import { SHIP_TABS, commitShipping, shipHref, useShipping, type ShipTab } from './shipping-ui';
import MethodsTab from './shipping-methods';
import RulesTab from './shipping-rules';
import SimulateTab from './shipping-sim';
import IntlTab from './shipping-intl';
import { OptionsTab, ZonesTab } from './shipping-more';

const LABEL: Record<ShipTab, { ar: string; en: string }> = {
  methods: { ar: 'الطرق والناقلون', en: 'Methods & carriers' },
  rules: { ar: 'القواعد', en: 'Rules' },
  zones: { ar: 'المناطق والوعود', en: 'Zones & promises' },
  simulate: { ar: 'ماذا يرى العميل', en: 'What the shopper sees' },
  intl: { ar: 'الجاهزية الدولية', en: 'International' },
  options: { ar: 'التشغيل والدفع عند الاستلام', en: 'Operations & COD' },
};

export default function ShippingPage() {
  const tx = useTx();
  const { lang } = useLang();
  const route = useRoute();
  const state = useDashState();
  const { setup, products } = useShipping();
  const raw = route.query.get('tab') ?? 'methods';
  const tab: ShipTab = (SHIP_TABS as string[]).includes(raw) ? (raw as ShipTab) : 'methods';
  const s = summary(setup, products);

  if (state === 'empty') {
    return (
      <Card><EmptyState as="h2" icon={<Truck className="size-6" aria-hidden="true" />} title={tx('لم يُجهَّز الشحن بعد', 'Shipping isn’t set up yet')}
        action={<Button onClick={() => {
          commitShipping(shippingFixture(), { ar: 'بدأ إعداد الشحن من القالب المقترح', en: 'Started shipping from the suggested setup' });
          setDashState('live');
        }}>{tx('ابدأ بالإعداد المقترح', 'Start with the suggested setup')}</Button>}>
        {tx('بدون طريقة شحن ومنطقة لا يستطيع العملاء إتمام طلب يُشحن. نبدأ بطرق شائعة تعدّلها كما تريد.', 'Without a method and a zone shoppers can’t complete a shipped order. Start from common methods and adjust.')}
      </EmptyState></Card>
    );
  }

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { k: tx('طرق مفعّلة', 'Active methods'), v: `${s.methodsOn}/${s.methods}`, href: shipHref('methods') },
          { k: tx('قواعد مفعّلة', 'Active rules'), v: `${s.rulesOn}`, href: shipHref('rules') },
          { k: tx('جاهز دوليًا', 'Ready abroad'), v: `${s.ready}/${s.physical}`, href: shipHref('intl') },
          { k: tx('ناقل يحتاج إجراءً', 'Carriers needing action'), v: `${s.carriersAction}`, href: shipHref('methods'), warn: s.carriersAction > 0 },
        ].map((x) => (
          <a key={x.k} href={x.href} className="rounded-2xl border border-border bg-surface px-4 py-3 shadow-card transition-colors hover:border-brand-300">
            <dt className="text-xs text-muted">{x.k}</dt>
            <dd className={x.warn ? 'mt-1 text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400' : 'mt-1 text-lg font-bold tabular-nums text-fg'}>{x.v}</dd>
          </a>
        ))}
      </dl>
      <Tabs label={tx('أقسام الشحن', 'Shipping sections')} items={SHIP_TABS.map((t) => ({ href: shipHref(t), label: LABEL[t][lang], current: t === tab }))} />
      {tab === 'methods' && <MethodsTab />}
      {tab === 'rules' && <RulesTab />}
      {tab === 'zones' && <ZonesTab />}
      {tab === 'simulate' && <SimulateTab />}
      {tab === 'intl' && <IntlTab />}
      {tab === 'options' && <OptionsTab />}
    </>
  );
}
