// All sales channels (`#/dashboard/channel/all`): one view of every channel in the blueprint with an honest status
// (works in this demo / not built / waiting on a decision) and what each needs. No fake "activate" buttons:
// only built channels link somewhere.
import { ArrowLeft, Ban, CircleDot, Hammer, Scale } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, type Route } from '../../../core/router';
import { canSee } from '../../merchant/perms';
import { levelsStore, productsStore, settingsStore } from '../../merchant/stores';
import { Badge, Card, ErrorState, InfoHint, Skeleton, cn, useTx, type Tone } from '../../../ds/ui';
import { PageHeader, Tabs } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { sectionHref } from '../pages';
import { NoAccess, ReviewRole, useRole } from '../marketing/access';
import { toStoreProducts } from '../../storefront/bridge';
import { catalogSummary } from '../appmaker/model';
import { appStore } from '../appmaker/state';
import { buildRows, channelState, storeChecks } from './model';
import { channelStore } from './state';
import { listPhoto, stockOf } from '../products/model';
import { channelCounts, channelRows, filterChannels, type ChannelFilter, type ChannelRow, type LiveState } from './channels';

const LIVE_TONE: Record<LiveState, Tone> = { live: 'green', paused: 'amber', blocked: 'red', off: 'gray', setup: 'sky' };

export default function ChannelsOverview({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const role = useRole();
  const state = useDashState();
  const settings = settingsStore.use();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const fx = channelStore.use();
  const am = appStore.use();
  if (!canSee(role, 'storefront') && !canSee(role, 'products')) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('القنوات غير متاحة لدورك', 'Channels are not available for your role')} /></div>;
  const checks = storeChecks({ verified: fx.verified, status: settings.status, providers: settings.providers, zones: settings.zones, policies: settings.policies });
  const mState = channelState(fx.enabled, checks);
  const listed = buildRows(products, (p) => stockOf(p, levels), (p) => !!listPhoto(p), fx.reviews, fx.verified, mState === 'live').filter((r) => r.state === 'listed').length;
  const rows = channelRows({
    status: settings.status, onlineProducts: toStoreProducts(products, levels).length,
    app: { addon: am.addon, published: am.releases.some((r) => Object.values(r.platforms).some((p) => p.state === 'published')), inApp: catalogSummary(products, levels).inApp },
    market: { state: mState, listed },
  });
  const qf = route.query.get('f') as ChannelFilter | null;
  const f: ChannelFilter = qf && ['built', 'notBuilt', 'decision'].includes(qf) ? qf : 'all';
  const counts = channelCounts(rows);
  const shown = filterChannels(rows, f);
  const liveLabel = (s: LiveState) => ({ live: tx('يعمل', 'Live'), paused: tx('متوقف مؤقتًا', 'Paused'), blocked: tx('غير مؤهل', 'Not eligible'), off: tx('غير مفعّل', 'Off'), setup: tx('قيد الإعداد', 'Setting up') })[s];
  const header = (
    <>
      <PageHeader title={tx('قنوات البيع', 'Sales channels')} description={tx('كل أماكن البيع في مخطط «لك» وحالتها الصادقة', 'Every place to sell in the LAK blueprint, with its honest status')} />
      <Tabs label={tx('تصفية القنوات', 'Filter channels')} items={(['all', 'built', 'notBuilt', 'decision'] as ChannelFilter[]).map((x) => ({
        href: link('/dashboard/channel/all', { f: x === 'all' ? undefined : x }), current: x === f, count: counts[x],
        label: { all: tx('الكل', 'All'), built: tx('تعمل في النسخة', 'Built'), notBuilt: tx('لم تُبنَ', 'Not built'), decision: tx('بانتظار قرار', 'Awaiting decision') }[x],
      }))} />
      <ReviewRole />
    </>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<div className="grid gap-4 md:grid-cols-2" role="status" aria-label="Loading">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل القنوات', 'Channels could not load')} onRetry={() => setDashState('live')}>{tx('قنواتك تعمل كما هي. المرجع SIM-CHN-503.', 'Your channels keep working. Ref SIM-CHN-503.')}</ErrorState></Card></div>;

  return (
    <div className="space-y-6">
      {header}
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {shown.map((r) => <li key={r.id}><ChannelCard r={r} lang={lang} liveLabel={liveLabel} /></li>)}
      </ul>
    </div>
  );
}

function ChannelCard({ r, lang, liveLabel }: { r: ChannelRow; lang: 'ar' | 'en'; liveLabel: (s: LiveState) => string }) {
  const tx = useTx();
  const body = (
    <>
      <div className="flex items-start gap-3">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', r.build === 'built' ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300' : 'bg-surface-2 text-subtle')} aria-hidden="true">{r.build === 'built' ? <CircleDot className="size-5" /> : <Hammer className="size-5" />}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-fg">{r.name[lang]}{r.plan && <span className="text-[11px] font-medium text-subtle">{r.plan}</span>}</p>
          <p className="mt-0.5 text-[13px] text-muted">{r.what[lang]}</p>
        </div>
        {r.href && <ArrowLeft className="mt-1 size-4 shrink-0 text-subtle ltr:rotate-180" aria-hidden="true" />}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {r.build === 'built'
          ? <><Badge tone="brand">{tx('تعمل في النسخة (محاكاة)', 'Built (simulated)')}</Badge>{r.state && <Badge tone={LIVE_TONE[r.state]}>{liveLabel(r.state)}</Badge>}</>
          : <Badge tone="gray" icon={<Ban className="size-3" aria-hidden="true" />}>{tx('لم تُبنَ', 'Not built')}</Badge>}
        {r.decision && <Badge tone="amber" icon={<Scale className="size-3" aria-hidden="true" />}>{tx('بانتظار قرار', 'Awaiting decision')}</Badge>}
        {r.products !== undefined && <Badge tone="gray">{tx(`${r.products} منتجًا`, `${r.products} products`)}</Badge>}
      </div>
      {(r.decision || r.needs.length > 0) && (
        <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-[13px]">
          {r.decision && <div><dt className="inline font-semibold text-fg">{tx('القرار: ', 'Decision: ')}</dt><dd className="inline text-muted">{r.decision[lang]}</dd></div>}
          {r.needs.map((n, i) => <div key={i}><dt className="inline font-semibold text-fg">{tx('المطلوب: ', 'Needed: ')}</dt><dd className="inline text-muted">{n[lang]}</dd></div>)}
        </dl>
      )}
      {r.build === 'notBuilt' && <p className="mt-3 flex items-center gap-1.5 text-xs text-subtle">{tx('لا يوجد زر تفعيل حتى تُبنى القناة.', 'No activation button until the channel is built.')}<InfoHint>{tx('نعرضها ليرى التاجر خارطة القنوات كاملة دون وعود غير منفذة.', 'Shown so the full channel map is visible without promising unbuilt features.')}</InfoHint></p>}
    </>
  );
  const cls = 'block h-full rounded-2xl border border-border bg-surface p-5 shadow-card';
  return r.href ? <a href={sectionHref(r.href.section, r.href.path ?? '')} className={cn(cls, 'transition-colors hover:border-brand-300')}>{body}</a> : <div className={cls}>{body}</div>;
}
