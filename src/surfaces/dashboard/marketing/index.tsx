// Marketing & offers (`#/dashboard/marketing`): coupons and automatic offers, abandoned-cart recovery, campaigns
// (`?tab=`), and the loyalty programme, gift cards and reviews & questions as sub-routes
// (`/marketing/loyalty`, `/marketing/gift-cards`, `/marketing/reviews`). An offer opens at
// `#/dashboard/marketing/coupons/<code|new>` (`?auto=1` for a new automatic offer).
import { Plus, Sparkles } from 'lucide-react';
import { link, type Route } from '../../../core/router';
import { canSee, can } from '../../merchant/perms';
import { cartsStore, couponsStore, giftCardsStore, reviewsStore } from '../../merchant/stores';
import { audience, giftState } from '../../merchant/growth';
import { Card, ErrorState, LinkButton, Skeleton, useTx } from '../../../ds/ui';
import { PageHeader, Tabs } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { NoAccess, ReviewRole, useRole } from './access';
import { campaignsStore } from './model';
import { useSendRunner } from './send';
import Coupons from './coupons';
import CouponEditor from './coupon-editor';
import Carts from './carts';
import Campaigns from './campaigns';
import Loyalty from './loyalty';
import GiftCards from './gift-cards';
import Reviews from './reviews';

export type Tab = 'coupons' | 'carts' | 'campaigns' | 'loyalty' | 'gift-cards' | 'reviews';
export const mhref = (q?: Record<string, string | undefined>) => link('/dashboard/marketing', q);
const SUB: Tab[] = ['loyalty', 'gift-cards', 'reviews'];

export default function Marketing({ route }: { route: Route }) {
  const tx = useTx();
  const role = useRole();
  const state = useDashState();
  const coupons = couponsStore.use();
  const carts = cartsStore.use();
  const campaigns = campaignsStore.use();
  const cards = giftCardsStore.use();
  const reviews = reviewsStore.use();
  useSendRunner();

  if (!canSee(role, 'marketing')) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('التسويق غير متاح لدورك', 'Marketing is not available for your role')} /></div>;
  if (route.path[0] === 'coupons' && route.path[1]) return <CouponEditor key={route.path[1] + (route.query.get('auto') ?? '')} code={route.path[1]} auto={route.query.get('auto') === '1'} />;

  const q = route.query.get('tab');
  const sub = SUB.find((x) => x === route.path[0]);
  const tab: Tab = sub ?? (q === 'carts' || q === 'campaigns' ? q : 'coupons');
  const manage = can(role, 'marketing.manage');
  const send = can(role, 'marketing.send');
  const empty = state === 'empty';
  const cnt = (n: number) => (state === 'live' ? n : empty ? 0 : undefined);
  const sublink = (t: Tab) => link(`/dashboard/marketing/${t}`);

  const actions = tab === 'coupons' && manage ? (
    <div className="flex flex-wrap gap-2">
      <LinkButton variant="secondary" href={link('/dashboard/marketing/coupons/new', { auto: '1' })}><Sparkles className="size-4" aria-hidden="true" />{tx('عرض تلقائي', 'Automatic offer')}</LinkButton>
      <LinkButton href={link('/dashboard/marketing/coupons/new')}><Plus className="size-4" aria-hidden="true" />{tx('كوبون جديد', 'New coupon')}</LinkButton>
    </div>
  ) : tab === 'campaigns' && send && route.query.get('compose') !== '1' ? <LinkButton href={mhref({ tab: 'campaigns', compose: '1' })}><Plus className="size-4" aria-hidden="true" />{tx('رسالة جماعية', 'New broadcast')}</LinkButton>
    : undefined;

  const header = (
    <>
      <PageHeader title={tx('التسويق والعروض', 'Marketing & offers')} description={tx('عروض ورسائل وولاء، بمعاينة قبل أي أثر', 'Offers, messages and loyalty, previewed before any effect')} actions={actions} />
      <ReviewRole />
      <Tabs label={tx('أقسام التسويق', 'Marketing sections')} items={[
        { href: mhref(), label: tx('الكوبونات والعروض', 'Coupons & offers'), current: tab === 'coupons', count: cnt(coupons.length) },
        { href: mhref({ tab: 'carts' }), label: tx('السلال المتروكة', 'Abandoned carts'), current: tab === 'carts', count: cnt(audience(carts, 'email', 4).eligible.length) },
        { href: mhref({ tab: 'campaigns' }), label: tx('الحملات', 'Campaigns'), current: tab === 'campaigns', count: cnt(campaigns.length) },
        { href: sublink('loyalty'), label: tx('الولاء', 'Loyalty'), current: tab === 'loyalty' },
        { href: sublink('gift-cards'), label: tx('بطاقات الهدايا', 'Gift cards'), current: tab === 'gift-cards', count: cnt(cards.filter((g) => giftState(g) === 'active').length) },
        { href: sublink('reviews'), label: tx('التقييمات والأسئلة', 'Reviews & questions'), current: tab === 'reviews', count: cnt(reviews.filter((r) => r.status === 'pending').length) },
      ]} />
    </>
  );

  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<MarketingSkeleton /></div>;
  if (state === 'error') return (
    <div className="space-y-6">{header}
      <Card><ErrorState as="h2" title={tx('تعذّر تحميل التسويق', 'Marketing could not load')} onRetry={() => setDashState('live')}>
        {tx('عروضك وحملاتك لم تتغير، والكوبونات النشطة ما زالت تُقبل. المرجع SIM-MKT-503.', 'Your offers and campaigns did not change; active coupons are still accepted. Ref SIM-MKT-503.')}
      </ErrorState></Card>
    </div>
  );

  return (
    <div className="space-y-6">
      {header}
      {tab === 'coupons' && <Coupons route={route} empty={empty} canManage={manage} />}
      {tab === 'carts' && <Carts route={route} empty={empty} canSend={send} />}
      {tab === 'campaigns' && <Campaigns route={route} empty={empty} canSend={send} />}
      {tab === 'loyalty' && <Loyalty route={route} empty={empty} canManage={manage} />}
      {tab === 'gift-cards' && <GiftCards route={route} empty={empty} canManage={manage} />}
      {tab === 'reviews' && <Reviews route={route} empty={empty} canManage={manage} />}
    </div>
  );
}

function MarketingSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5" role="status" aria-label="Loading">
      <div className="flex gap-3"><Skeleton className="h-10 w-64" /><Skeleton className="h-10 w-24" /></div>
      <div className="mt-6 space-y-5">{[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-4"><Skeleton className="h-5 w-28" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-6 w-16 rounded-full" /><Skeleton className="h-9 w-20 rounded-lg" /></div>)}</div>
    </div>
  );
}
