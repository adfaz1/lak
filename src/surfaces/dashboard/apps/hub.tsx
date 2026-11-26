// Tabs shared by the Apps section: integrations, merchant services and packaging materials (`?tab=`).
import { link } from '../../../core/router';
import { Tabs } from '../../../ds/kit';
import { useTx } from '../../../ds/ui';

export type HubTab = 'free' | 'apps' | 'services' | 'packaging';
export const hubHref = (tab: HubTab, q?: Record<string, string | undefined>) => link('/dashboard/apps', { tab: tab === 'apps' ? undefined : tab, ...q });

export function HubTabs({ current }: { current: HubTab }) {
  const tx = useTx();
  return (
    <Tabs label={tx('أقسام التطبيقات والخدمات', 'Apps and services sections')} items={[
      { href: hubHref('free'), label: tx('تطبيقات مجانية', 'Free apps'), current: current === 'free' },
      { href: hubHref('apps'), label: tx('التكاملات', 'Integrations'), current: current === 'apps' },
      { href: hubHref('services'), label: tx('خدمات التاجر', 'Merchant services'), current: current === 'services' },
      { href: hubHref('packaging'), label: tx('مواد التغليف', 'Packaging materials'), current: current === 'packaging' },
    ]} />
  );
}
