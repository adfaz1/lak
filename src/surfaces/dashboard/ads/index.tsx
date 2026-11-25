// Ads (`#/dashboard/ads`): campaigns planned from the dashboard, tracking IDs per platform (Snapchat, TikTok, Meta,
// Google, X), the product catalogue feed and UTM links. Connections, platform review and delivery numbers are
// simulated; orders and revenue come from the store's own orders by UTM. LAK managed-ads fees and ad credit await
// approval; the budget is the merchant's and is paid to the platforms.
import { Plus } from 'lucide-react';
import { link, type Route } from '../../../core/router';
import { can, canSee } from '../../merchant/perms';
import { AD_PLATFORMS } from '../../merchant/ads';
import { Card, ErrorState, InfoHint, LinkButton, Skeleton, useTx } from '../../../ds/ui';
import { PageHeader, Simulated, Tabs } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { Locked, NoAccess, ReviewRole, useRole } from '../marketing/access';
import { DecisionMark } from '../pos/parts';
import { adsStore } from './state';
import { CampaignDetail, CampaignList, Links, Planner } from './campaigns';
import { FeedPage, Tracking } from './tracking';

type Tab = 'campaigns' | 'tracking' | 'feed' | 'links';

export default function Ads({ route }: { route: Route }) {
  const tx = useTx();
  const role = useRole();
  const state = useDashState();
  const s = adsStore.use();
  if (!canSee(role, 'marketing')) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('الإعلانات غير متاحة لدورك', 'Ads are not available for your role')} /></div>;
  const canManage = can(role, 'marketing.manage');
  const p0 = route.path[0];
  const tab: Tab = p0 === 'tracking' || p0 === 'feed' || p0 === 'links' ? p0 : 'campaigns';
  const connected = AD_PLATFORMS.filter((p) => s.tracking[p].state === 'connected').length;
  if (p0 === 'new') return canManage ? <Planner /> : <div className="space-y-6"><ReviewRole /><NoAccess title={tx('إطلاق الحملات غير متاح لدورك', 'Launching campaigns is not available for your role')} /></div>;
  if (p0 === 'c' && route.path[1]) return <CampaignDetail id={route.path[1]} canManage={canManage} />;
  const header = (
    <>
      <PageHeader
        title={<span className="inline-flex items-center gap-1.5">{tx('الإعلانات', 'Ads')}<InfoHint>{tx('ميزانيتك تُدفع للمنصات من حسابك الإعلاني. رسوم «لك» لإدارة الحملات ورصيد الإعلانات لم تُعتمد.', 'Your budget is paid to the platforms from your ad account. LAK campaign-management fees and ad credit are not approved.')}</InfoHint></span>}
        description={tx('حملات من منتجاتك، تُقاس بالطلبات الفعلية في متجرك.', 'Campaigns from your products, measured by real orders in your store.')}
        meta={<><Simulated /><DecisionMark what={tx('رسوم «لك» للإعلانات ورصيدها', 'LAK ads fees and credit')} /></>}
        actions={canManage ? <LinkButton className="bg-brand-gradient" href={link('/dashboard/ads/new')}><Plus className="size-4" aria-hidden="true" />{tx('خطّط حملة', 'Plan a campaign')}</LinkButton> : <Locked>{tx('الإطلاق لدور التسويق أو المالك', 'Launching is for marketing or the owner')}</Locked>} />
      <ReviewRole />
      <Tabs label={tx('أقسام الإعلانات', 'Ads sections')} items={([['campaigns', tx('الحملات', 'Campaigns'), s.campaigns.length], ['tracking', tx('أدوات التتبع', 'Tracking'), connected], ['feed', tx('كتالوج المنتجات', 'Product feed'), 0], ['links', tx('روابط UTM', 'UTM links'), s.links.length]] as [Tab, string, number][]).map(([id, label, count]) => ({ href: link(id === 'campaigns' ? '/dashboard/ads' : `/dashboard/ads/${id}`), label, current: tab === id, count: count || undefined }))} />
    </>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<div className="grid gap-4 md:grid-cols-3" role="status" aria-label={tx('جارٍ التحميل', 'Loading')}>{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل الإعلانات', 'Ads could not load')} onRetry={() => setDashState('live')}>{tx('حملاتك الجارية لا تتوقف. المرجع SIM-ADS-503.', 'Running campaigns do not stop. Ref SIM-ADS-503.')}</ErrorState></Card></div>;
  const body = tab === 'tracking' ? <Tracking canManage={canManage} /> : tab === 'feed' ? <FeedPage canManage={canManage} /> : tab === 'links' ? <Links /> : <CampaignList />;
  return <div className="space-y-6">{header}{body}</div>;
}
