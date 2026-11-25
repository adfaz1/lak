// Influencer collaborations (`#/dashboard/marketing/influencers`, P03-INF): influencers the merchant already works with
// (name, handles), each with a tracked code, collaborations (brief, deliverables with dates, gifts, cost) and results.
// The influencer marketplace itself is a pending LAK decision: it stays empty, with no names.
import { useState } from 'react';
import { Megaphone, Plus, SearchX, Store } from 'lucide-react';
import { link, replace, type Route } from '../../../core/router';
import { ordersStore } from '../../merchant/stores';
import { collabResults, deliverableState, type Partner } from '../../merchant/growth';
import { Badge, Button, Card, CardHeader, EmptyState, LinkButton, Money, Ref, useTx } from '../../../ds/ui';
import { DataTable, FilterChip, Pagination, SearchInput, type Column } from '../../../ds/kit';
import { DecisionMarker, Pending } from '../settings/decision-marker';
import { paginate } from '../customers/model';
import { Kpi } from './loyalty';
import { TODAY } from './model';
import { ExampleTag, PartnerModal, platformName, useCommission } from './affiliate-parts';
import { collabsStore, partnersStore } from './affiliates-store';
import InfluencerDetail from './influencer-detail';

export const ihref = (q?: Record<string, string | undefined>) => link('/dashboard/marketing/influencers', q);
export const roiText = (roi: number | null, tx: (a: string, e: string) => string) => (roi === null ? tx('بلا تكلفة مسجلة', 'No cost entered') : <bdi dir="ltr">{`${roi >= 0 ? '+' : ''}${Math.round(roi * 100)}%`}</bdi>);

export default function Influencers({ route, empty, canManage }: { route: Route; empty: boolean; canManage: boolean }) {
  const tx = useTx();
  const all = partnersStore.use();
  const collabsAll = collabsStore.use();
  const orders = ordersStore.use();
  const { lines } = useCommission();
  const [adding, setAdding] = useState(false);
  if (route.path[1]) return <InfluencerDetail id={route.path[1]} canManage={canManage} />;
  const people = empty ? [] : all.filter((p) => p.kind === 'influencer');
  const collabs = empty ? [] : collabsAll;
  const now = Date.now();
  const res = collabs.filter((c) => c.status !== 'cancelled').map((c) => collabResults(c, lines, orders, now, TODAY));
  const sum = (f: (r: (typeof res)[number]) => number) => res.reduce((s, r) => s + f(r), 0);
  const cost = sum((r) => r.cost), revenue = sum((r) => r.revenue);
  const dueSoon = collabs.filter((c) => c.status === 'active').flatMap((c) => c.deliverables).filter((d) => ['late', 'due'].includes(deliverableState(d, TODAY))).length;

  const q = route.query.get('q') ?? '';
  const pf = route.query.get('platform') ?? '';
  const href = (p: Record<string, string | undefined>) => ihref({ q: q || undefined, platform: pf || undefined, ...p });
  const s = q.trim().toLowerCase();
  const rows = people.filter((p) => (!pf || p.handles.some((h) => h.platform === pf)) && (!s || p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s) || p.handles.some((h) => h.handle.toLowerCase().includes(s))));
  const pg = paginate(rows, Number(route.query.get('page')) || 1, 12);
  const mine = (p: Partner) => collabs.filter((c) => c.partnerId === p.id && c.status !== 'cancelled');
  const resOf = (p: Partner) => mine(p).map((c) => collabResults(c, lines, orders, now, TODAY));
  const cols: Column<Partner>[] = [
    { key: 'n', header: tx('المؤثر', 'Influencer'), cell: (p) => <span className="flex items-center gap-2"><span className="truncate">{p.name}</span>{p.example && <ExampleTag />}</span> },
    { key: 'h', header: tx('الحسابات', 'Handles'), hideBelow: 'md', cell: (p) => <span className="text-[13px] text-muted" dir="ltr">{p.handles.map((h) => h.handle).join(' · ')}</span> },
    { key: 'c', header: tx('الكود', 'Code'), hideBelow: 'lg', cell: (p) => <Ref>{p.coupon ?? p.code}</Ref> },
    { key: 'k', header: tx('التعاونات', 'Collaborations'), align: 'end', cell: (p) => <span className="tabular-nums">{mine(p).length}</span> },
    { key: 'r', header: tx('مبيعات', 'Sales'), align: 'end', cell: (p) => <Money v={resOf(p).reduce((a, r) => a + r.revenue, 0)} /> },
    { key: 'o', header: tx('العائد', 'ROI'), align: 'end', hideBelow: 'md', cell: (p) => { const r = resOf(p); const c = r.reduce((a, x) => a + x.cost, 0); return <span className="tabular-nums">{roiText(c ? (r.reduce((a, x) => a + x.revenue, 0) - c) / c : null, tx)}</span>; } },
  ];
  return (
    <div className="space-y-6 pb-20">
      <section aria-label={tx('ملخص التعاونات', 'Collaborations summary')} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label={tx('تعاونات نشطة', 'Active collaborations')} value={collabs.filter((c) => c.status === 'active').length} />
        <Kpi label={tx('مبيعات التعاونات', 'Collaboration sales')} hint={tx('طلبات بكود المؤثر أو رابطه من بداية التعاون حتى 7 أيام بعد نهايته.', 'Orders with the influencer’s code or link, from the start to 7 days after the end.')} value={<Money v={revenue} />} />
        <Kpi label={tx('التكلفة', 'Cost')} hint={tx('الأجر الذي أدخلته + تكلفة الهدايا + العمولات.', 'The fee you entered + gift cost + commissions.')} value={<Money v={cost} />} />
        <Kpi label={tx('مخرجات مستحقة أو متأخرة', 'Deliverables due or late')} value={dueSoon} />
      </section>

      <Card aria-label={tx('المؤثرون', 'Influencers')}>
        <CardHeader title={tx('مؤثرون تعمل معهم', 'Influencers you work with')} hint={tx('تضيفهم أنت. لا قوائم جاهزة ولا أسماء مقترحة.', 'You add them. No ready-made lists or suggested names.')}
          action={canManage ? <Button size="sm" onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden="true" />{tx('أضف مؤثرًا', 'Add influencer')}</Button> : undefined} />
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-5">
          <SearchInput value={q} onChange={(x) => replace(href({ q: x || undefined, page: undefined }))} placeholder={tx('ابحث بالاسم أو الحساب أو الكود', 'Search name, handle or code')} />
          <FilterChip label={tx('المنصة', 'Platform')} value={pf} onChange={(x) => replace(href({ platform: x || undefined, page: undefined }))} options={(['instagram', 'tiktok', 'snapchat', 'x', 'youtube'] as const).map((x) => ({ value: x, label: platformName(x, tx) }))} />
        </div>
        {pg.total === 0 ? (people.length === 0
          ? <EmptyState icon={<Megaphone className="size-6" aria-hidden="true" />} title={tx('لا مؤثرين بعد', 'No influencers yet')} action={canManage ? <Button onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden="true" />{tx('أضف مؤثرًا تعمل معه', 'Add an influencer you work with')}</Button> : undefined}>{tx('أضف الاسم والحسابات، ثم أنشئ تعاونًا بمخرجات وتواريخ وكود متتبَّع.', 'Add the name and handles, then a collaboration with deliverables, dates and a tracked code.')}</EmptyState>
          : <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا نتائج مطابقة', 'No matching influencers')} action={<LinkButton variant="secondary" href={ihref()}>{tx('امسح الفلاتر', 'Clear filters')}</LinkButton>} />
        ) : (
          <div className="border-t border-border">
            <DataTable label={tx('المؤثرون', 'Influencers')} rows={pg.rows} columns={cols} rowKey={(p) => p.id} href={(p) => link(`/dashboard/marketing/influencers/${p.id}`)}
              card={(p) => <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="flex items-center gap-2 truncate text-sm font-semibold text-fg">{p.name}{p.example && <ExampleTag />}</p><p className="truncate text-xs text-muted" dir="ltr">{p.handles.map((h) => h.handle).join(' · ')}</p></div><span className="text-xs text-muted">{tx(`${mine(p).length} تعاون`, `${mine(p).length} collab(s)`)}</span></div>} />
            <Pagination page={pg.page} pages={pg.pages} total={pg.total} hrefFor={(n) => href({ page: n > 1 ? String(n) : undefined })} />
          </div>
        )}
      </Card>

      <Card aria-labelledby="h-market">
        <CardHeader id="h-market" title={<span className="flex flex-wrap items-center gap-2">{tx('سوق المؤثرين', 'Influencer marketplace')}<Pending /><DecisionMarker id="influencers" /></span>}
          hint={tx('هل تعرض لك مؤثرين معتمدين وتتوسط في الدفع؟ قرار لم يُتخذ بعد، لذلك لا تظهر أي أسماء.', 'Whether LAK lists vetted influencers and brokers payment is not decided yet, so no names are shown.')} />
        <div className="px-5 pb-5">
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted">
            <Store className="size-5 shrink-0" aria-hidden="true" />
            <span>{tx('القائمة فارغة حتى الاعتماد. إلى ذلك الحين: أضف المؤثرين الذين تتعامل معهم مباشرة.', 'Empty until approved. Meanwhile, add influencers you deal with directly.')}</span>
          </div>
          <p className="mt-2 flex flex-wrap gap-1 text-xs text-muted"><Badge tone="amber">{tx('تنبيه', 'Note')}</Badge>{tx('الإعلان عبر المؤثرين يتطلب ترخيصًا إعلانيًا ساريًا للمؤثر؛ تحقّق منه قبل التعاقد.', 'Influencer advertising needs a valid advertising licence; check it before contracting.')}</p>
        </div>
      </Card>
      {adding && <PartnerModal kind="influencer" onClose={() => setAdding(false)} />}
    </div>
  );
}
