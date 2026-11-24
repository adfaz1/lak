// Overview: where the app stands in each store, what needs the merchant, what is not with customers yet,
// readiness, and what the app takes from the store. The phone shows the draft or what customers have now.
import { useEffect } from 'react';
import { Apple, ArrowUpRight, Package, Play, ShoppingBag } from 'lucide-react';
import { link, replace, type Route } from '../../../core/router';
import { Badge, Card, CardHeader, InfoHint, LinkButton, Segmented, cn, useTx } from '../../../ds/ui';
import { PLATFORMS, liveConfig, readiness, classifyChange, type Platform } from '../../appmaker/domain';
import { sectionHref } from '../pages';
import { appOrders, attentionItems, catalogSummary, platformStatus, stateTone } from './model';
import { ChangeTag, Checklist, IssueBox, PreviewPanel, ah, useAppData, useS } from './parts';

export const StoreIcon = ({ p, className }: { p: Platform; className?: string }) => (p === 'ios' ? <Apple className={className ?? 'size-5'} aria-hidden="true" /> : <Play className={className ?? 'size-5'} aria-hidden="true" />);

export default function Overview({ route }: { route: Route }) {
  const tx = useTx();
  const S = useS();
  const { s, plan, products, levels, orders } = useAppData();
  const live = liveConfig(s.releases);
  const change = live ? classifyChange(live, s.draft) : null;
  const checks = readiness({ ...s, plan });
  const attention = attentionItems(s.releases);
  const sum = catalogSummary(products, levels);
  const view = route.query.get('v') === 'live' && live ? 'live' : 'draft';
  useEffect(() => { if (route.query.get('focus') === 'plan') window.scrollTo({ top: 0 }); }, [route.query]);
  const setView = (v: 'draft' | 'live') => { const q: Record<string, string> = {}; route.query.forEach((val, k) => { q[k] = val; }); replace(link('/dashboard/appmaker', { ...q, v: v === 'live' ? 'live' : undefined })); };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="order-2 min-w-0 space-y-6 lg:order-1">
        <Card aria-labelledby="am-st">
          <CardHeader id="am-st" title={tx('في المتاجر', 'In the stores')} hint={tx('البناء الناجح لا يعني النشر. الإصدار متاح للعملاء فقط بعد قبول المتجر.', 'A successful build is not a release. A version reaches customers only after the store accepts it.')} />
          <ul className="grid grid-cols-1 divide-y divide-border border-t border-border md:grid-cols-2 md:divide-y-0">
            {PLATFORMS.map((p, i) => {
              const st = platformStatus(s.releases, p);
              const pending = st.latest && st.latest !== st.live;
              return (
                <li key={p} className={cn('space-y-3 px-5 py-4', i > 0 && 'md:border-s md:border-border')}>
                  <p className="flex items-center gap-2 text-sm font-semibold text-fg"><StoreIcon p={p} />{S.storeName[p]}</p>
                  <div>
                    <p className="text-xs text-muted">{tx('لدى العملاء', 'Customers have')}</p>
                    <p className="mt-0.5 text-lg font-bold text-fg">{st.live ? <bdi dir="ltr">{st.live.version}</bdi> : <span className="text-muted">{tx('غير منشور', 'Not published')}</span>}</p>
                  </div>
                  {pending && st.latest && st.state && (
                    <div className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="text-muted">{tx('الأحدث', 'Latest')}</span>
                      <a href={ah('releases', [st.latest.id])} className="font-semibold text-fg hover:text-brand-700"><bdi dir="ltr">{st.latest.version}</bdi></a>
                      <Badge tone={stateTone(st.state)}>{S.pstates[st.state]}</Badge>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        {attention.length > 0 && (
          <Card aria-labelledby="am-att">
            <CardHeader id="am-att" title={tx('يحتاجك', 'Needs you')} action={<Badge tone="amber">{attention.length}</Badge>} />
            <ul className="space-y-3 px-5 pb-5">
              {attention.map((a) => (
                <li key={`${a.release.id}-${a.platform ?? 'lak'}`} className="space-y-2">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    {a.platform && <><StoreIcon p={a.platform} className="size-3.5" />{S.storeName[a.platform]} ·</>}
                    <a href={ah('releases', [a.release.id])} className="font-semibold text-fg hover:text-brand-700">{tx('الإصدار', 'Version')} <bdi dir="ltr">{a.release.version}</bdi></a>
                  </p>
                  <IssueBox code={a.issue} />
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card aria-labelledby="am-ch">
            <CardHeader id="am-ch" title={tx('لم يصل للعملاء بعد', 'Not with customers yet')} hint={tx('تعديلات المسودة تُحفظ تلقائيًا ولا يراها العملاء حتى تنشرها.', 'Draft edits save automatically; customers see nothing until you publish.')} />
            <div className="px-5 pb-5">
              {!change || change.kind === 'none' ? <p className="text-sm text-muted">{tx('المسودة مطابقة لما لدى العملاء.', 'Your draft matches what customers have.')}</p> : (
                <>
                  <ul className="space-y-2">
                    {change.binary.map((f) => <li key={f} className="flex items-center justify-between gap-2 text-sm text-fg">{S.binaryFields[f]}<ChangeTag kind="binary" /></li>)}
                    {change.config.map((f) => <li key={f} className="flex items-center justify-between gap-2 text-sm text-fg">{S.configFields[f]}<ChangeTag kind="config" /></li>)}
                  </ul>
                  <p className="mt-3 text-[13px] text-muted">{change.kind === 'binary' ? tx('تحتاج إصدارًا جديدًا ومراجعة المتاجر.', 'Needs a new version and store review.') : tx('تصل كتحديث إعدادات دون مراجعة المتاجر.', 'Reaches apps as a settings update, no store review.')}</p>
                </>
              )}
            </div>
          </Card>
          <Card aria-labelledby="am-rd">
            <CardHeader id="am-rd" title={tx('جاهزية الإرسال', 'Ready to submit')} action={<span className="text-xs font-semibold text-muted tabular-nums">{checks.filter((c) => c.ok).length}/{checks.length}</span>} />
            <div className="border-t border-border"><Checklist checks={checks} /></div>
          </Card>
        </div>

        <Card aria-labelledby="am-sync">
          <CardHeader id="am-sync" title={tx('من متجرك', 'From your store')} hint={tx('التطبيق يعرض منتجات متجرك النشطة التي فُعّلت لها قناة التطبيق، بأسعارها وتوفرها. المزامنة اللحظية مع تطبيق منشور تحتاج خادم البناء ولا تعمل في هذه النسخة.', 'The app shows your active products with the app channel on, with their prices and availability. Live sync with a published app needs the build server and does not run in this demo.')} />
          <dl className="grid grid-cols-2 gap-3 px-5 pb-4 sm:grid-cols-4">
            {[[tx('في التطبيق', 'In the app'), sum.inApp], [tx('القناة مطفأة', 'Channel off'), sum.channelOff], [tx('نفدت الكمية', 'Sold out'), sum.soldOut], [tx('بلا صورة', 'No photo'), sum.withoutPhoto]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-muted">{k}</dt><dd className="mt-1 text-lg font-bold text-fg tabular-nums">{v}</dd></div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3">
            <LinkButton variant="ghost" size="sm" href={sectionHref('products')}><Package className="size-4" aria-hidden="true" />{tx('المنتجات', 'Products')}</LinkButton>
            <LinkButton variant="ghost" size="sm" href={sectionHref('orders', '', { ch: 'app' })}><ShoppingBag className="size-4" aria-hidden="true" />{tx(`طلبات التطبيق (${appOrders(orders)})`, `App orders (${appOrders(orders)})`)}<ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" /></LinkButton>
          </div>
        </Card>
      </div>

      <div className="order-1 min-w-0 lg:order-2">
        <PreviewPanel route={route} base="/dashboard/appmaker" config={view === 'live' && live ? live : s.draft}
          title={<span className="inline-flex items-center gap-1.5">{tx('التطبيق', 'The app')}<InfoHint>{tx('«المسودة» ما تعمل عليه الآن. «لدى العملاء» آخر ما نُشر أو طُبّق.', '“Draft” is what you are editing. “Customers” is the latest published or applied version.')}</InfoHint></span>}
          action={<Segmented label={tx('النسخة', 'Version')} value={view} onChange={setView} options={[{ value: 'draft', label: tx('المسودة', 'Draft') }, ...(live ? [{ value: 'live' as const, label: tx('لدى العملاء', 'Customers') }] : [])]} />} />
      </div>
    </div>
  );
}
