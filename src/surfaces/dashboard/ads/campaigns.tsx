// Campaigns (`#/dashboard/ads`, `/new`, `/c/<id>`) and UTM links (`/links`): plan a campaign (objective, connected
// platforms, audience from saved segments, the merchant's own budget, dates, creative from products), preview the
// scope and cost, launch (simulated platform review), then read results: delivery numbers are simulated, orders and
// revenue are real orders carrying the campaign's UTM tag. LAK managed-ads fees and ad credit await approval.
import { useMemo, useState } from 'react';
import { CircleStop, Copy, Megaphone, Pause, Play, Plus, Rocket, SearchX } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, navigate } from '../../../core/router';
import { useReviewMode } from '../../../core/review';
import { currentActor, customersStore, logAction, ordersStore, productsStore, segmentsStore } from '../../merchant/stores';
import { customerStats, matchesRules } from '../../merchant/workspace';
import { riyadhToday } from '../../merchant/catalog-extras';
import { parseMoney, moneyInput } from '../../merchant/catalog';
import {
  AD_PLATFORMS, attribution, campaignState, campaignUtm, checkCampaign, checkUtm, HEADLINE_MAX, maxSpend, nextCampaignId, OBJECTIVES, PLATFORM_NAME,
  PLATFORM_SOURCE, runDays, simulatedDelivery, slugUtm, TEXT_MAX, utmUrl, type Campaign, type CampaignStatus, type Objective,
} from '../../merchant/ads';
import { Badge, Button, Card, CardHeader, EmptyState, LinkButton, Money, ProductImage, Ref, Segmented, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, Checkbox, DataTable, Field, Input, Modal, PageHeader, Select, Simulated, Textarea, useToast } from '../../../ds/kit';
import { listPhoto } from '../products/model';
import { sectionHref } from '../pages';
import { useUnsaved } from '../unsaved';
import { Pending, Row } from '../pos/parts';
import { adsStore, setAds } from './state';

const TONE: Record<CampaignStatus, Tone> = { draft: 'gray', review: 'sky', live: 'green', paused: 'amber', rejected: 'red', ended: 'gray' };
const STORE_URL = 'https://darnuwa.lak.test';

export function useAdLabels() {
  const tx = useTx();
  return {
    status: (s: CampaignStatus) => ({ draft: tx('مسودة', 'Draft'), review: tx('قيد مراجعة المنصة', 'In platform review'), live: tx('تعمل', 'Live'), paused: tx('موقوفة', 'Paused'), rejected: tx('رفضتها المنصة', 'Rejected'), ended: tx('انتهت', 'Ended') })[s],
    objective: (o: Objective) => ({ sales: tx('مبيعات', 'Sales'), traffic: tx('زيارات', 'Traffic'), awareness: tx('وصول', 'Awareness'), retarget: tx('إعادة استهداف', 'Retargeting') })[o],
  };
}

/** Customers in a saved segment who can be matched for ads (consented to email or SMS). */
function useAudience() {
  const customers = customersStore.use();
  const orders = ordersStore.use();
  const segments = segmentsStore.use();
  return useMemo(() => {
    const stats = customers.map((c) => ({ c, st: customerStats(c, orders) }));
    const size = (id: string) => {
      if (id === 'all') return null;
      const seg = segments.find((s) => s.id === id);
      return seg ? stats.filter(({ c, st }) => (c.consent.email || c.consent.sms) && matchesRules(c, st, seg.rules)).length : 0;
    };
    return { segments, size, consented: stats.filter(({ c }) => c.consent.email || c.consent.sms).length };
  }, [customers, orders, segments]);
}

export function CampaignList() {
  const tx = useTx();
  const { lang } = useLang();
  const L = useAdLabels();
  const s = adsStore.use();
  const orders = ordersStore.use();
  const today = riyadhToday();
  const connected = AD_PLATFORMS.filter((p) => s.tracking[p].state === 'connected');
  const totals = s.campaigns.reduce((a, c) => { const d = simulatedDelivery(c, today); const r = attribution(c, orders, d.spend); return { spend: a.spend + d.spend, revenue: a.revenue + r.revenue, orders: a.orders + r.orders }; }, { spend: 0, revenue: 0, orders: 0 });
  if (!s.campaigns.length) return (
    <Card><EmptyState as="h2" icon={<Megaphone className="size-6" aria-hidden="true" />} title={tx('لا حملات بعد', 'No campaigns yet')}
      action={connected.length ? <LinkButton href={link('/dashboard/ads/new')}>{tx('خطّط حملة', 'Plan a campaign')}</LinkButton> : <LinkButton href={link('/dashboard/ads/tracking')}>{tx('اربط منصة أولًا', 'Connect a platform first')}</LinkButton>}>
      {tx('اربط بكسل منصة واحدة على الأقل، ثم خطّط حملة بميزانيتك من منتجاتك. تُقاس الطلبات من متجرك عبر الرابط.', 'Connect at least one platform pixel, then plan a campaign with your budget from your products. Orders are measured from your store through the link.')}
    </EmptyState></Card>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="flex items-center gap-2 text-xs text-muted">{tx('الإنفاق', 'Spend')}<Simulated /></p><Money v={totals.spend} className="mt-1 text-xl font-bold text-fg" /></Card>
        <Card className="p-4"><p className="text-xs text-muted">{tx('طلبات من الحملات', 'Orders from campaigns')}</p><p className="mt-1 text-xl font-bold tabular-nums text-fg">{totals.orders}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">{tx('إيراد من الحملات', 'Revenue from campaigns')}</p><Money v={totals.revenue} className="mt-1 text-xl font-bold text-fg" /></Card>
      </div>
      <Card>
        <DataTable label={tx('الحملات', 'Campaigns')} rows={s.campaigns} rowKey={(c) => c.id} href={(c) => link(`/dashboard/ads/c/${c.id}`)}
          columns={[
            { key: 'n', header: tx('الحملة', 'Campaign'), cell: (c) => c.name },
            { key: 'p', header: tx('المنصات', 'Platforms'), cell: (c) => <span className="text-muted">{c.platforms.map((p) => PLATFORM_NAME[p][lang].split(' (')[0]).join('، ')}</span>, hideBelow: 'md' },
            { key: 'd', header: tx('المدة', 'Dates'), cell: (c) => <Ref>{c.start} → {c.end}</Ref>, hideBelow: 'lg' },
            { key: 's', header: tx('الحالة', 'Status'), cell: (c) => <Badge tone={TONE[campaignState(c, today)]}>{L.status(campaignState(c, today))}</Badge> },
            { key: 'o', header: tx('الطلبات', 'Orders'), align: 'end', cell: (c) => <span className="tabular-nums">{attribution(c, orders, 0).orders}</span> },
          ]}
          card={(c) => <div className="flex items-center justify-between gap-3 text-sm"><div className="min-w-0"><p className="truncate font-semibold text-fg">{c.name}</p><p className="text-xs text-muted"><Ref>{c.start} → {c.end}</Ref></p></div><Badge tone={TONE[campaignState(c, today)]}>{L.status(campaignState(c, today))}</Badge></div>} />
      </Card>
    </div>
  );
}

const blank = (today: string): Campaign => ({ id: '', name: '', objective: 'sales', platforms: [], audience: 'all', budget: { kind: 'daily', amount: 0 }, start: today, end: today, productIds: [], headline: '', text: '', utm: '', status: 'draft', by: '', at: 0 });

export function Planner() {
  const tx = useTx();
  const { lang } = useLang();
  const L = useAdLabels();
  const toast = useToast();
  const review = useReviewMode();
  const s = adsStore.use();
  const products = productsStore.use();
  const aud = useAudience();
  const today = riyadhToday();
  const c = s.draft ?? blank(today);
  const [budget, setBudget] = useState(c.budget.amount ? moneyInput(c.budget.amount) : '');
  const [tried, setTried] = useState(false);
  const [preview, setPreview] = useState(false);
  const [reject, setReject] = useState(false);
  const set = (patch: Partial<Campaign>) => setAds((x) => ({ draft: { ...(x.draft ?? blank(today)), ...patch } }));
  useUnsaved(!!s.draft && (!!c.name || c.productIds.length > 0), { ar: 'حملة لم تُطلق', en: 'Campaign not launched' });
  const connected = AD_PLATFORMS.filter((p) => s.tracking[p].state === 'connected');
  const amount = parseMoney(budget);
  const full: Campaign = { ...c, budget: { ...c.budget, amount: amount ?? 0 } };
  const size = aud.size(c.audience);
  const errors = tried ? checkCampaign(full, connected, today, size) : {};
  const eligible = products.filter((p) => p.status === 'active' && listPhoto(p) && p.type !== 'digital');
  const msg = (k: keyof typeof errors) => errors[k] && ({ required: tx('مطلوب', 'Required'), notConnected: tx('منصة غير مربوطة', 'Platform not connected'), amount: tx('ميزانية أكبر من صفر', 'A budget above zero'), past: tx('لا يبدأ في الماضي', 'Cannot start in the past'), order: tx('بعد تاريخ البدء', 'After the start date'), long: tx('أطول من المسموح', 'Too long'), empty: tx('لا عملاء موافقون في هذه الشريحة', 'No consenting customers in this segment') })[errors[k]!];
  const open = () => { setTried(true); if (!Object.keys(checkCampaign(full, connected, today, size)).length) setPreview(true); };
  const launch = () => {
    const id = nextCampaignId(s.campaigns);
    const camp: Campaign = { ...full, id, utm: campaignUtm(full.name, id), status: 'review', by: currentActor().name, at: Date.now(), launchedAt: Date.now() };
    setAds((x) => ({ campaigns: [camp, ...x.campaigns], draft: null }));
    logAction('marketing', { ar: `أطلق حملة ${camp.name} (${id}) بحد إنفاق ${(maxSpend(camp) / 100).toFixed(2)} ر.س`, en: `Launched campaign ${camp.name} (${id}) with up to ${(maxSpend(camp) / 100).toFixed(2)} SAR spend` }, { target: id });
    if (!review) setTimeout(() => setAds((x) => ({ campaigns: x.campaigns.map((y) => (y.id === id && y.status === 'review' ? { ...y, status: 'live' } : y)) })), 1200);
    else if (reject) setTimeout(() => setAds((x) => ({ campaigns: x.campaigns.map((y) => (y.id === id ? { ...y, status: 'rejected', reason: 'text' } : y)) })), 600);
    toast({ tone: 'ok', text: tx('أُرسلت للمنصات للمراجعة (محاكاة)', 'Sent to the platforms for review (simulated)') });
    navigate(link(`/dashboard/ads/c/${id}`));
  };
  const days = runDays(full);
  const first = products.find((p) => p.id === c.productIds[0]);
  return (
    <div className="space-y-6">
      <PageHeader back={{ href: link('/dashboard/ads'), label: tx('الإعلانات', 'Ads') }} title={tx('خطّط حملة', 'Plan a campaign')} description={tx('ميزانيتك تُدفع للمنصات من حسابك الإعلاني.', 'Your budget is paid to the platforms from your ad account.')}
        actions={<><Button variant="ghost" onClick={() => { setAds(() => ({ draft: null })); setBudget(''); setTried(false); }}>{tx('ابدأ من جديد', 'Start over')}</Button><Button className="bg-brand-gradient" onClick={open}><Rocket className="size-4" aria-hidden="true" />{tx('راجع وأطلق', 'Review and launch')}</Button></>} />
      {!connected.length && <Alert tone="warn" title={tx('لا منصة مربوطة', 'No platform connected')} action={<LinkButton size="sm" variant="secondary" href={link('/dashboard/ads/tracking')}>{tx('اربط', 'Connect')}</LinkButton>}>{tx('اربط البكسل أولًا لتختار المنصة.', 'Connect a pixel first to pick a platform.')}</Alert>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <Field label={tx('اسم الحملة', 'Campaign name')} error={msg('name')}>{(p) => <Input {...p} value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder={tx('مثال: عطور الشتاء', 'e.g. Winter fragrances')} />}</Field>
            <div><p className="mb-1.5 text-[13px] font-semibold text-fg">{tx('الهدف', 'Objective')}</p><Segmented label={tx('الهدف', 'Objective')} value={c.objective} onChange={(o) => set({ objective: o })} options={OBJECTIVES.map((o) => ({ value: o, label: L.objective(o) }))} /></div>
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-semibold text-fg">{tx('المنصات', 'Platforms')}</legend>
              <div className="flex flex-wrap gap-2">{AD_PLATFORMS.map((p) => { const on = c.platforms.includes(p); const ok = connected.includes(p); return (
                <label key={p} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-sm', on ? 'border-brand-300 bg-brand-500/5' : 'border-border', !ok && 'opacity-50')}>
                  <Checkbox label={PLATFORM_NAME[p][lang]} checked={on} onChange={(v) => ok && set({ platforms: v ? [...c.platforms, p] : c.platforms.filter((x) => x !== p) })} />{PLATFORM_NAME[p][lang].split(' (')[0]}{!ok && <span className="text-xs text-subtle">{tx('غير مربوطة', 'not connected')}</span>}
                </label>); })}</div>
              {msg('platforms') && <p className="mt-1 text-xs font-medium text-red-600">{msg('platforms')}</p>}
            </fieldset>
            <Field label={tx('الجمهور', 'Audience')} error={msg('audience')} hint={c.audience === 'all' ? tx('استهداف المنصة داخل السعودية', 'Platform targeting in Saudi Arabia') : tx(`${size} عميلًا موافقًا على التواصل`, `${size} customers who consented`)}>
              {(p) => <Select {...p} value={c.audience} onChange={(e) => set({ audience: e.target.value })}><option value="all">{tx('عام (السعودية)', 'Broad (Saudi Arabia)')}</option>{aud.segments.map((sg) => <option key={sg.id} value={sg.id}>{tx('شريحة: ', 'Segment: ')}{sg.name[lang]}</option>)}</Select>}
            </Field>
          </Card>
          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-end gap-3">
              <Segmented label={tx('نوع الميزانية', 'Budget type')} value={c.budget.kind} onChange={(k) => set({ budget: { ...c.budget, kind: k } })} options={[{ value: 'daily', label: tx('يومية', 'Daily') }, { value: 'total', label: tx('إجمالية', 'Total') }]} />
              <Field className="w-40" label={tx('المبلغ (ر.س)', 'Amount (SAR)')} error={msg('budget') ?? (budget && amount === null ? tx('مبلغ غير صحيح', 'Invalid amount') : null)}>{(p) => <Input {...p} inputMode="decimal" dir="ltr" value={budget} onChange={(e) => { setBudget(e.target.value); const a = parseMoney(e.target.value); if (a !== null) set({ budget: { ...c.budget, amount: a } }); }} />}</Field>
              <Field className="w-40" label={tx('من', 'From')} error={msg('start')}>{(p) => <Input {...p} type="date" min={today} value={c.start} onChange={(e) => set({ start: e.target.value })} />}</Field>
              <Field className="w-40" label={tx('إلى', 'To')} error={msg('end')}>{(p) => <Input {...p} type="date" min={c.start} value={c.end} onChange={(e) => set({ end: e.target.value })} />}</Field>
            </div>
            <p className="text-xs text-muted">{tx('حدّ المنصات الأدنى للميزانية يظهر لديها عند المراجعة.', 'Platform budget minimums are shown by the platform at review.')}</p>
          </Card>
          <Card className="space-y-4 p-5">
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-fg">{tx('المنتجات في الإعلان', 'Products in the ad')}{msg('products') && <span className="ms-2 text-xs font-medium text-red-600">{msg('products')}</span>}</p>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">{eligible.map((p) => { const on = c.productIds.includes(p.id); return (
                <li key={p.id}><button type="button" aria-pressed={on} onClick={() => set({ productIds: on ? c.productIds.filter((x) => x !== p.id) : [...c.productIds, p.id].slice(0, 5) })} className={cn('w-full rounded-xl border p-1.5 text-start', on ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-border')}>
                  <ProductImage src={listPhoto(p)} alt={p.name[lang]} size={56} className="!h-16 w-full" /><span className="mt-1 line-clamp-1 block text-[11px] text-fg">{p.name[lang]}</span></button></li>); })}</ul>
              <p className="mt-1 text-xs text-subtle">{tx('حتى 5 منتجات بصور مطابقة.', 'Up to 5 products with matching photos.')}</p>
            </div>
            <Field label={tx('العنوان', 'Headline')} error={msg('headline')} hint={`${c.headline.trim().length}/${HEADLINE_MAX}`}>{(p) => <Input {...p} value={c.headline} onChange={(e) => set({ headline: e.target.value })} />}</Field>
            <Field label={tx('النص', 'Text')} optional error={msg('text')} hint={`${c.text.trim().length}/${TEXT_MAX}`}>{(p) => <Textarea {...p} value={c.text} onChange={(e) => set({ text: e.target.value })} />}</Field>
          </Card>
        </div>
        <div className="space-y-4 lg:sticky lg:top-20 lg:h-max">
          <Card className="overflow-hidden">
            <p className="px-4 pt-3 text-xs font-semibold text-muted">{tx('معاينة الإعلان', 'Ad preview')}</p>
            <div className="m-4 overflow-hidden rounded-xl border border-border">
              <ProductImage src={first ? listPhoto(first) : undefined} alt={first?.name[lang] ?? ''} size={280} className="!h-48 w-full rounded-none" />
              <div className="p-3"><p className="text-sm font-bold text-fg">{c.headline || tx('عنوانك هنا', 'Your headline')}</p><p className="mt-1 text-xs text-muted">{c.text || tx('نصك هنا', 'Your text')}</p><p className="mt-2 text-xs font-semibold text-brand-700 dark:text-brand-300">{tx('تسوّق الآن', 'Shop now')}</p></div>
            </div>
          </Card>
          <Card className="p-4">
            <Row label={tx('الأيام', 'Days')}><span className="tabular-nums">{days}</span></Row>
            <Row strong label={tx('أقصى إنفاق', 'Maximum spend')}><Money v={maxSpend(full)} /></Row>
            <Row label={tx('رسوم «لك» للإدارة', 'LAK management fee')}><Pending /></Row>
          </Card>
        </div>
      </div>
      {preview && (
        <Modal size="lg" title={tx('قبل الإطلاق', 'Before launch')} onClose={() => setPreview(false)}
          footer={<><Button variant="secondary" onClick={() => setPreview(false)}>{tx('عدّل', 'Edit')}</Button><Button className="bg-brand-gradient" onClick={launch}><Rocket className="size-4" aria-hidden="true" />{tx('أطلق الحملة', 'Launch campaign')}</Button></>}>
          <div className="divide-y divide-border">
            <Row label={tx('المنصات', 'Platforms')}>{full.platforms.map((p) => PLATFORM_NAME[p][lang].split(' (')[0]).join('، ')}</Row>
            <Row label={tx('الجمهور', 'Audience')}>{c.audience === 'all' ? tx('عام (السعودية)', 'Broad (Saudi Arabia)') : `${aud.segments.find((x) => x.id === c.audience)?.name[lang]} · ${size}`}</Row>
            <Row label={tx('المدة', 'Dates')}><Ref>{full.start} → {full.end}</Ref></Row>
            <Row label={tx('الميزانية', 'Budget')}><span><Money v={full.budget.amount} /> {full.budget.kind === 'daily' ? tx('يوميًا', 'per day') : tx('إجمالًا', 'in total')}</span></Row>
            <Row strong label={tx('أقصى ما يُخصم من حسابك الإعلاني', 'Most charged to your ad account')}><Money v={maxSpend(full)} /></Row>
            <Row label={tx('رسوم «لك»', 'LAK fee')}><Pending /></Row>
            <Row label={tx('رابط القياس', 'Tracking tag')}><Ref>utm_campaign={campaignUtm(full.name, nextCampaignId(s.campaigns))}</Ref></Row>
          </div>
          <Alert tone="info">{tx('تراجع كل منصة الإعلان قبل نشره. يمكنك الإيقاف في أي وقت؛ لا يُسترد ما أُنفق.', 'Each platform reviews the ad before it runs. You can pause any time; spend already made is not refunded.')}</Alert>
          {review && <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={reject} onChange={(e) => setReject(e.target.checked)} />{tx('مراجعة: اجعل المنصة ترفضها', 'Review: make the platform reject it')}</label>}
          <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('لا يصل شيء لأي منصة.', 'Nothing reaches any platform.')}</p>
        </Modal>
      )}
    </div>
  );
}

export function CampaignDetail({ id, canManage }: { id: string; canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const L = useAdLabels();
  const toast = useToast();
  const review = useReviewMode();
  const s = adsStore.use();
  const orders = ordersStore.use();
  const products = productsStore.use();
  const [confirm, setConfirm] = useState<'end' | null>(null);
  const c = s.campaigns.find((x) => x.id === id);
  const today = riyadhToday();
  if (!c) return <Card><EmptyState as="h2" icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('الحملة غير موجودة', 'Campaign not found')} action={<LinkButton variant="secondary" href={link('/dashboard/ads')}>{tx('كل الحملات', 'All campaigns')}</LinkButton>} /></Card>;
  const st = campaignState(c, today);
  const d = simulatedDelivery(c, today);
  const a = attribution(c, orders, d.spend);
  const put = (status: CampaignStatus, what: string) => {
    setAds((x) => ({ campaigns: x.campaigns.map((y) => (y.id === c.id ? { ...y, status } : y)) }));
    logAction('marketing', { ar: `${what} الحملة ${c.name}`, en: `${what} campaign ${c.name}` }, { target: c.id, before: c.status, after: status });
  };
  const attributeOne = () => {
    const o = orders.find((x) => !x.utm && x.channel === 'online' && x.pay === 'paid');
    if (!o) return toast({ tone: 'bad', text: tx('لا طلب متاح', 'No order available') });
    const p = c.platforms[0];
    ordersStore.set((l) => l.map((x) => (x.ref === o.ref ? { ...x, utm: { source: PLATFORM_SOURCE[p], medium: 'paid', campaign: c.utm } } : x)));
    toast({ tone: 'ok', text: tx(`نُسب الطلب ${o.ref} للحملة (محاكاة)`, `Order ${o.ref} attributed (simulated)`) });
  };
  const base = c.productIds[0] ? `${STORE_URL}/p/${products.find((p) => p.id === c.productIds[0])?.seo.slug ?? ''}` : STORE_URL;
  return (
    <div className="space-y-6">
      <PageHeader back={{ href: link('/dashboard/ads'), label: tx('الحملات', 'Campaigns') }} title={c.name} description={`${L.objective(c.objective)} · ${c.platforms.map((p) => PLATFORM_NAME[p][lang].split(' (')[0]).join('، ')}`}
        meta={<><Badge tone={TONE[st]}>{L.status(st)}</Badge><Ref>{c.start} → {c.end}</Ref></>}
        actions={canManage && <>
          {st === 'live' && <Button variant="secondary" onClick={() => put('paused', tx('أوقف', 'Paused'))}><Pause className="size-4" aria-hidden="true" />{tx('أوقف مؤقتًا', 'Pause')}</Button>}
          {st === 'paused' && <Button onClick={() => put('live', tx('استأنف', 'Resumed'))}><Play className="size-4" aria-hidden="true" />{tx('استأنف', 'Resume')}</Button>}
          {(st === 'live' || st === 'paused') && <Button variant="ghost" onClick={() => setConfirm('end')}><CircleStop className="size-4" aria-hidden="true" />{tx('أنهِ', 'End')}</Button>}
          {st === 'rejected' && <Button onClick={() => { setAds(() => ({ draft: { ...c, id: '', status: 'draft' } })); navigate(link('/dashboard/ads/new')); }}>{tx('عدّل وأعد الإرسال', 'Edit and resubmit')}</Button>}
        </>} />
      {st === 'review' && <Alert tone="info" title={tx('قيد مراجعة المنصات', 'In platform review')} action={review ? <span className="flex gap-2"><Button size="sm" onClick={() => put('live', tx('وافقت المنصة على', 'Platform approved'))}>{tx('وافق (محاكاة)', 'Approve (sim.)')}</Button><Button size="sm" variant="ghost" onClick={() => setAds((x) => ({ campaigns: x.campaigns.map((y) => (y.id === c.id ? { ...y, status: 'rejected', reason: 'text' } : y)) }))}>{tx('ارفض (محاكاة)', 'Reject (sim.)')}</Button></span> : undefined}>{tx('لا إنفاق قبل الموافقة.', 'Nothing is spent before approval.')}</Alert>}
      {st === 'rejected' && <Alert tone="bad" title={tx('رفضت المنصة الإعلان', 'The platform rejected the ad')}>{tx('السبب كما أعادته المنصة: النص يتضمن ادعاءً يحتاج إثباتًا. عدّل النص وأعد الإرسال.', 'Reason the platform returned: the text makes a claim that needs proof. Edit the text and resubmit.')}</Alert>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4"><p className="flex items-center gap-1.5 text-xs text-muted">{tx('ظهور', 'Impressions')}<Simulated /></p><p className="mt-1 text-xl font-bold tabular-nums text-fg">{d.impressions.toLocaleString('en')}</p></Card>
        <Card className="p-4"><p className="flex items-center gap-1.5 text-xs text-muted">{tx('نقرات', 'Clicks')}<Simulated /></p><p className="mt-1 text-xl font-bold tabular-nums text-fg">{d.clicks.toLocaleString('en')}</p></Card>
        <Card className="p-4"><p className="flex items-center gap-1.5 text-xs text-muted">{tx('الإنفاق', 'Spend')}<Simulated /></p><Money v={d.spend} className="mt-1 text-xl font-bold text-fg" /><p className="text-xs text-subtle">{tx('من', 'of')} <Money v={maxSpend(c)} /></p></Card>
        <Card className="p-4"><p className="text-xs text-muted">{tx('العائد على الإنفاق', 'Return on spend')}</p><p className="mt-1 text-xl font-bold tabular-nums text-fg">{a.roas === null ? '—' : `${a.roas}×`}</p></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={tx('الطلبات من الحملة', 'Orders from this campaign')} hint={tx('طلبات حقيقية من متجرك وصلت برابط الحملة (utm_campaign). مستقلة عن أرقام المنصة.', 'Real orders from your store that arrived through the campaign link (utm_campaign). Independent of platform numbers.')} />
          <div className="px-5 pb-5">
            <Row label={tx('الطلبات', 'Orders')}><span className="tabular-nums">{a.orders}</span></Row>
            <Row strong label={tx('الإيراد بعد الاسترداد', 'Revenue after refunds')}><Money v={a.revenue} /></Row>
            {a.bySource.filter((x) => c.platforms.includes(x.p)).map((x) => <Row key={x.p} label={PLATFORM_NAME[x.p][lang].split(' (')[0]}><span className="tabular-nums">{x.orders}</span></Row>)}
            {a.refs.length > 0 ? <p className="mt-2 flex flex-wrap gap-2 text-sm">{a.refs.slice(0, 8).map((r) => <a key={r} href={sectionHref('orders', r)} className="text-brand-700 hover:underline dark:text-brand-300"><Ref>{r}</Ref></a>)}</p>
              : <p className="mt-2 text-sm text-muted">{tx('لا طلب برابط هذه الحملة بعد.', 'No order through this campaign’s link yet.')}</p>}
            {review && <Button className="mt-3" size="sm" variant="soft" onClick={attributeOne}>{tx('مراجعة: انسب طلبًا قائمًا للحملة', 'Review: attribute an existing order')}</Button>}
          </div>
        </Card>
        <Card>
          <CardHeader title={tx('رابط الحملة', 'Campaign link')} />
          <div className="space-y-3 px-5 pb-5 text-sm">
            {c.platforms.map((p) => { const u = utmUrl(base, { source: PLATFORM_SOURCE[p], medium: 'paid', campaign: c.utm }); return (
              <div key={p} className="flex items-center gap-2"><span className="w-20 shrink-0 text-muted">{PLATFORM_NAME[p][lang].split(' (')[0]}</span><code className="min-w-0 flex-1 truncate text-xs" dir="ltr">{u}</code><Button size="sm" variant="ghost" onClick={() => { try { void navigator.clipboard?.writeText(u); } catch { /* ignore */ } toast({ tone: 'ok', text: tx('نُسخ', 'Copied') }); }}><Copy className="size-4" aria-hidden="true" /></Button></div>); })}
            <div className="divide-y divide-border border-t border-border pt-2">
              <Row label={tx('الميزانية', 'Budget')}><span><Money v={c.budget.amount} /> {c.budget.kind === 'daily' ? tx('يوميًا', 'per day') : tx('إجمالًا', 'in total')}</span></Row>
              <Row label={tx('أطلقها', 'Launched by')}>{c.by}</Row>
              <Row label={tx('رسوم «لك»', 'LAK fee')}><Pending /></Row>
            </div>
          </div>
        </Card>
      </div>
      {confirm && <Modal title={tx(`إنهاء ${c.name}`, `End ${c.name}`)} description={tx('تتوقف الإعلانات على كل المنصات نهائيًا. تبقى النتائج والطلبات.', 'Ads stop on every platform for good. Results and orders remain.')} onClose={() => setConfirm(null)}
        footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>{tx('رجوع', 'Back')}</Button><Button variant="danger" onClick={() => { put('ended', tx('أنهى', 'Ended')); setConfirm(null); }}>{tx('أنهِ الحملة', 'End campaign')}</Button></>} />}
    </div>
  );
}

export function Links() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const s = adsStore.use();
  const orders = ordersStore.use();
  const [u, setU] = useState({ base: STORE_URL, source: '', medium: '', campaign: '' });
  const [tried, setTried] = useState(false);
  const missing = checkUtm(u);
  const baseOk = /^https?:\/\/\S+$/.test(u.base.trim());
  const url = !missing.length && baseOk ? utmUrl(u.base.trim(), u) : '';
  const save = () => {
    setTried(true);
    if (!url) return;
    setAds((x) => ({ links: [{ id: `L${x.links.length + 1}`, source: slugUtm(u.source), medium: slugUtm(u.medium), campaign: slugUtm(u.campaign), url, at: Date.now() }, ...x.links] }));
    logAction('marketing', { ar: `أنشأ رابط تتبع ${slugUtm(u.campaign)}`, en: `Created tracking link ${slugUtm(u.campaign)}` });
    toast({ tone: 'ok', text: tx('حُفظ الرابط', 'Link saved') });
    setU({ ...u, campaign: '' }); setTried(false);
  };
  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2" label={tx('الصفحة', 'Page')} error={tried && !baseOk ? tx('رابط يبدأ بـ https://', 'A link starting with https://') : null}>{(p) => <Input {...p} dir="ltr" value={u.base} onChange={(e) => setU({ ...u, base: e.target.value })} />}</Field>
          {(['source', 'medium', 'campaign'] as const).map((k) => <Field key={k} label={{ source: tx('المصدر (utm_source)', 'Source (utm_source)'), medium: tx('الوسيط (utm_medium)', 'Medium (utm_medium)'), campaign: tx('الحملة (utm_campaign)', 'Campaign (utm_campaign)') }[k]} error={tried && missing.includes(k) ? tx('مطلوب', 'Required') : null}>{(p) => <Input {...p} dir="ltr" value={u[k]} placeholder={{ source: 'instagram', medium: 'influencer', campaign: 'eid-2026' }[k]} onChange={(e) => setU({ ...u, [k]: e.target.value })} />}</Field>)}
        </div>
        {url && <code className="block break-all rounded-xl bg-surface-2 p-3 text-xs" dir="ltr">{url}</code>}
        <div className="flex gap-2"><Button onClick={save}><Plus className="size-4" aria-hidden="true" />{tx('احفظ الرابط', 'Save link')}</Button>{url && <Button variant="secondary" onClick={() => { try { void navigator.clipboard?.writeText(url); } catch { /* ignore */ } toast({ tone: 'ok', text: tx('نُسخ', 'Copied') }); }}><Copy className="size-4" aria-hidden="true" />{tx('انسخ', 'Copy')}</Button>}</div>
      </Card>
      <Card>
        <CardHeader title={tx('الروابط المحفوظة', 'Saved links')} hint={tx('الطلبات تُحسب من متجرك حين يصل العميل بالرابط ويشتري.', 'Orders count from your store when a shopper arrives by the link and buys.')} />
        {!s.links.length ? <EmptyState title={tx('لا روابط بعد', 'No links yet')} /> : (
          <DataTable label={tx('الروابط', 'Links')} rows={s.links} rowKey={(l) => l.id}
            columns={[
              { key: 'c', header: tx('الحملة', 'Campaign'), cell: (l) => <Ref>{l.campaign}</Ref> },
              { key: 's', header: tx('المصدر / الوسيط', 'Source / medium'), cell: (l) => <Ref>{l.source} / {l.medium}</Ref> },
              { key: 'o', header: tx('الطلبات', 'Orders'), align: 'end', cell: (l) => <span className="tabular-nums">{orders.filter((o) => o.utm?.campaign === l.campaign && o.utm.source === l.source).length}</span> },
              { key: 'd', header: tx('أُنشئ', 'Created'), cell: (l) => new Date(l.at).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB'), hideBelow: 'md' },
            ]}
            card={(l) => <div className="flex items-center justify-between gap-3 text-sm"><div className="min-w-0"><p className="font-semibold text-fg"><Ref>{l.campaign}</Ref></p><p className="truncate text-xs text-muted" dir="ltr">{l.url}</p></div><span className="tabular-nums">{orders.filter((o) => o.utm?.campaign === l.campaign).length}</span></div>} />
        )}
      </Card>
    </div>
  );
}

