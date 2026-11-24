// «سوق لك» channel (`#/dashboard/channel`): store eligibility, which products shoppers see in the LAK marketplace
// and why, fees awaiting approval, pause / resume with a consequence preview, and marketplace orders.
// View only: the rules come from ./model (which uses the marketplace's own rules in market/domain.ts).
import { verificationStore } from '../../merchant/verification-store';
import { isVerified } from '../../merchant/verification';
import { useState, type ReactNode } from 'react';
import {
  BadgeCheck, CheckCircle2, Circle, Clock, Eye, EyeOff, Globe2, Megaphone, PackageOpen, Pencil, SearchX, Send, ShoppingBag, Store, Truck, Users, Warehouse,
} from 'lucide-react';
import { useLang } from '../../../core/lang';
import { replace, link, type Route } from '../../../core/router';
import { useReviewMode } from '../../../core/review';
import { can, canSee } from '../../merchant/perms';
import { levelsStore, ordersStore, productsStore, settingsStore } from '../../merchant/stores';
import { total } from '../../merchant/domain';
import type { FixReason } from '../../market/domain';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, InfoHint, LinkButton, Money, ProductImage, Ref, Skeleton, Avatar, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, DataTable, Modal, PageHeader, SearchInput, Simulated, Switch, Tabs, useToast, type Column } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { sectionHref } from '../pages';
import { listPhoto, mediaSrc, stockOf } from '../products/model';
import { productPhoto } from '../model/media';
import { Locked, NoAccess, ReviewRole, useRole } from '../marketing/access';
import {
  TABS, buildRows, channelState, countRows, decide, filterRows, includeOutcome, inTab, marketOrders, openMarketOrders, readTab, storeChecks,
  submitForReview, submittable, toggleImpact, type Check, type CheckId, type Row, type RowState, type Tab,
} from './model';
import { channelStore } from './state';
import ChannelsOverview from './overview';

const STATE_TONE: Record<RowState, Tone> = {
  listed: 'green', in_review: 'sky', not_submitted: 'brand', needs_fix: 'amber', rejected: 'red', out_of_stock: 'gray', paused: 'gray',
  opted_out: 'gray', excluded: 'gray', inactive: 'gray', store_blocked: 'red',
};

function useLabels() {
  const tx = useTx();
  return {
    state: (s: RowState) => ({
      listed: tx('معروض', 'Listed'), in_review: tx('قيد مراجعة «لك»', 'In LAK review'), not_submitted: tx('جاهز للإرسال', 'Ready to submit'),
      needs_fix: tx('يحتاج إكمالًا', 'Needs details'), rejected: tx('مرفوض', 'Rejected'), out_of_stock: tx('مخفي: نفد المخزون', 'Hidden: out of stock'),
      paused: tx('متوقف مؤقتًا', 'Paused'), opted_out: tx('غير معروض باختيارك', 'Withheld by you'), excluded: tx('فئة غير مدعومة', 'Category not supported'),
      inactive: tx('غير نشط في متجرك', 'Not active in your store'), store_blocked: tx('المتجر غير موثق', 'Store not verified'),
    })[s],
    why: (s: RowState) => ({
      listed: tx('يظهر للمتسوقين باسم متجرك وتكاليفك.', 'Shoppers see it with your store name and costs.'),
      in_review: tx('يراجعه فريق «لك» قبل ظهوره أول مرة.', 'LAK reviews it before it first appears.'),
      not_submitted: tx('مكتمل ومؤهل. أرسله للمراجعة.', 'Complete and eligible. Send it for review.'),
      needs_fix: '', rejected: '',
      out_of_stock: tx('يعود تلقائيًا عند توفر المخزون.', 'Comes back automatically when in stock.'),
      paused: tx('يعود عند استئناف القناة.', 'Returns when you resume the channel.'),
      opted_out: tx('أوقفت قناة السوق لهذا المنتج.', 'You turned the marketplace off for this product.'),
      excluded: tx('بطاقات الهدايا والأكواد الرقمية غير مدعومة في المرحلة الأولى.', 'Gift cards and digital codes are not supported in phase one.'),
      inactive: tx('مسودة أو مؤرشف؛ لا يُعرض في أي قناة.', 'Draft or archived; not shown on any channel.'),
      store_blocked: tx('يظهر بعد توثيق المتجر.', 'Appears once the store is verified.'),
    })[s],
    fix: (f: FixReason) => ({ images: tx('أضف صورة', 'Add a photo'), description: tx('أضف وصفًا من 30 حرفًا أو أكثر', 'Add a description of 30+ characters'), price: tx('حدد سعرًا صحيحًا', 'Set a valid price') })[f],
    reject: (r?: 'claim' | 'image') => (r === 'image' ? tx('الصورة لا تطابق المنتج.', 'The photo does not match the product.') : tx('الاسم أو الوصف يتضمن ادعاءً غير قابل للإثبات.', 'The name or description makes a claim that cannot be proven.')),
    tab: (t: Tab) => ({ all: tx('الكل', 'All'), visible: tx('معروض', 'Listed'), action: tx('يحتاجك', 'Needs you'), review: tx('قيد المراجعة', 'In review'), hidden: tx('غير معروض', 'Not listed') })[t],
    check: (c: CheckId) => ({
      verified: [tx('هوية المتجر موثقة', 'Store identity verified'), tx('السجل التجاري والرقم الضريبي يظهران للمتسوق كهوية للبائع.', 'Your CR and VAT number are shown to shoppers as the seller identity.')],
      published: [tx('المتجر منشور ويستقبل الطلبات', 'Store published and taking orders'), tx('متجر في وضع الصيانة أو متوقف لا يُعرض في السوق.', 'A store in maintenance or paused is not shown in the marketplace.')],
      payment: [tx('طريقة دفع مفعّلة', 'A payment method is active'), tx('كل متجر يُدفع له بشكل منفصل في السوق.', 'Each store is paid separately in the marketplace.')],
      shipping: [tx('أسعار شحن محددة', 'Shipping rates set'), tx('المتسوق يرى تكلفة شحنك قبل الشراء.', 'Shoppers see your shipping cost before buying.')],
      returns: [tx('سياسة الإرجاع منشورة', 'Returns policy published'), tx('مدة الإرجاع تظهر في صفحة المنتج.', 'Your returns window shows on the product page.')],
      terms: [tx('شروط السوق والرسوم', 'Marketplace terms and fees'), tx('العمولة والرسوم لم تعتمدها «لك» بعد. لا يُطلب منك شيء الآن.', 'LAK has not approved commission and fees yet. Nothing is needed from you now.')],
    })[c] as [string, string],
  };
}

const checkHref = (c: CheckId) => ({
  verified: sectionHref('settings', 'store'), published: sectionHref('storefront'), payment: sectionHref('settings', 'payments'),
  shipping: sectionHref('settings', 'shipping'), returns: sectionHref('settings', 'policies'), terms: undefined,
})[c];

type Dialog = { kind: 'toggle' } | { kind: 'submit'; rows: Row[] } | { kind: 'include'; row: Row } | { kind: 'withhold'; row: Row };

export default function ChannelSection({ route }: { route: Route }) {
  return route.path[0] === 'all' ? <ChannelsOverview route={route} /> : <Channel route={route} />;
}

function Channel({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const L = useLabels();
  const toast = useToast();
  const role = useRole();
  const state = useDashState();
  const review = useReviewMode();
  const fxRaw = channelStore.use();
  // Verification has one source (settings → verification); the channel no longer keeps its own flag.
  const vStatus = verificationStore.use().status;
  const fx = { ...fxRaw, verified: fxRaw.verified && isVerified(vStatus) };
  const products = productsStore.use();
  const levels = levelsStore.use();
  const orders = ordersStore.use();
  const settings = settingsStore.use();
  const [dialog, setDialog] = useState<Dialog | null>(null);

  if (!canSee(role, 'products')) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('سوق لك غير متاح لدورك', 'The LAK marketplace channel is not available for your role')} /></div>;
  const canChannel = can(role, 'settings.manage');
  const canEdit = can(role, 'product.edit');

  const empty = state === 'empty';
  const list = empty ? [] : products;
  const checks = storeChecks({ verified: fx.verified, status: settings.status, providers: settings.providers, zones: settings.zones, policies: settings.policies });
  const ch = channelState(fx.enabled, checks);
  const rows = buildRows(list, (p) => stockOf(p, levels), (p) => !!listPhoto(p), fx.reviews, fx.verified, ch === 'live');
  const counts = countRows(rows);
  const tab = readTab(route.query.get('tab'));
  const q = route.query.get('q') ?? '';
  const shown = filterRows(rows, tab, q);
  const ready = rows.filter((r) => submittable(r, fx.verified));
  const needYou = rows.filter((r) => inTab(r, 'action')).length;
  const mOrders = empty ? [] : marketOrders(orders);
  const mOpen = empty ? [] : openMarketOrders(orders);
  const go = (patch: Record<string, string | undefined>) => replace(link('/dashboard/channel', { tab: tab === 'all' ? undefined : tab, q: q || undefined, ...patch }));
  const editHref = (id: string) => sectionHref('products', id);
  const store = settings.store.name;
  const minShip = settings.zones.length ? Math.min(...settings.zones.map((z) => z.rate)) : null;

  const CH: Record<typeof ch, { tone: Tone; label: string; sub: string }> = {
    live: { tone: 'green', label: tx('يعمل', 'Live'), sub: tx('منتجاتك المعروضة يراها المتسوقون في سوق لك.', 'Shoppers see your listed products in the LAK marketplace.') },
    paused: { tone: 'gray', label: tx('متوقف مؤقتًا', 'Paused'), sub: tx('لا يظهر أي منتج لك في السوق الآن. متجرك يعمل كالمعتاد.', 'None of your products show in the marketplace now. Your store works as usual.') },
    blocked: { tone: 'red', label: tx('غير مؤهل', 'Not eligible'), sub: tx('أكمل شروط الأهلية ليظهر متجرك في السوق.', 'Complete the eligibility checks for your store to appear.') },
  };

  const primary = ch === 'blocked' ? null
    : ready.length && canEdit ? <Button onClick={() => setDialog({ kind: 'submit', rows: ready })}><Send className="size-4" aria-hidden="true" />{tx(`أرسل ${ready.length} للمراجعة`, `Submit ${ready.length} for review`)}</Button>
    : needYou ? <LinkButton href={link('/dashboard/channel', { tab: 'action' })}>{tx(`أكمل ${needYou} منتجات`, `Complete ${needYou} products`)}</LinkButton>
    : null;

  const header = (
    <>
      <PageHeader title={tx('سوق لك', 'LAK marketplace')} description={tx('أي منتجاتك يراها المتسوقون عبر المتاجر، ولماذا.', 'Which of your products shoppers see across stores, and why.')}
        meta={state === 'live' || empty ? <><Badge tone={CH[ch].tone} icon={<span className={cn('size-1.5 rounded-full', ch === 'live' ? 'bg-emerald-500' : ch === 'blocked' ? 'bg-red-500' : 'bg-subtle')} aria-hidden="true" />}>{CH[ch].label}</Badge><Badge tone="amber">{tx('القواعد والرسوم بانتظار الاعتماد', 'Rules and fees awaiting approval')}</Badge></> : undefined}
        actions={<>
          <LinkButton variant="ghost" href={link('/dashboard/channel/all')}>{tx('كل القنوات', 'All channels')}</LinkButton>
          <LinkButton variant="secondary" href={sectionHref('orders', '', { ch: 'market' })}><ShoppingBag className="size-4" aria-hidden="true" />{tx('طلبات السوق', 'Marketplace orders')}</LinkButton>
          {state === 'live' && primary}
        </>} />
      <ReviewRole />
    </>
  );

  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<ChannelSkeleton /></div>;
  if (state === 'error') return (
    <div className="space-y-6">{header}
      <Card><ErrorState as="h2" title={tx('تعذّر تحميل حالة السوق', 'The marketplace status could not load')} onRetry={() => setDashState('live')}>
        {tx('لم يتغير شيء في منتجاتك أو ظهورها. المرجع SIM-MKT-503.', 'Nothing changed in your products or their visibility. Ref SIM-MKT-503.')}
      </ErrorState></Card>
    </div>
  );

  const submit = (rs: Row[]) => {
    channelStore.set((x) => ({ ...x, reviews: submitForReview(x.reviews, rs.map((r) => r.product.id)) }));
    setDialog(null);
    toast({ tone: 'ok', text: tx(`أُرسل ${rs.length} للمراجعة (محاكاة)`, `${rs.length} sent for review (simulated)`) });
  };
  const setMarket = (id: string, on: boolean) => productsStore.set((ps) => ps.map((p) => (p.id === id ? { ...p, channels: { ...p.channels, market: on }, version: p.version + 1 } : p)));

  const columns: Column<Row>[] = [
    { key: 'p', header: tx('المنتج', 'Product'), cell: (r) => (
      <span className="flex min-w-0 items-center gap-3">
        <ProductImage src={listPhoto(r.product)} alt={r.product.name[lang]} size={40} />
        <span className="min-w-0"><span className="block max-w-56 truncate font-semibold text-fg">{r.product.name[lang]}</span><span className="block text-xs text-muted"><Ref>{r.product.sku}</Ref></span></span>
      </span>
    ) },
    { key: 's', header: tx('الحالة', 'Status'), cell: (r) => <Badge tone={STATE_TONE[r.state]}>{L.state(r.state)}</Badge> },
    { key: 'w', header: tx('السبب', 'Why'), cell: (r) => <Why r={r} />, className: 'max-w-72 text-[13px] text-muted', hideBelow: 'lg' },
    { key: 'st', header: tx('المتاح', 'Available'), align: 'end', cell: (r) => <span className="tabular-nums">{r.stock ?? '—'}</span>, hideBelow: 'lg' },
    { key: 'pr', header: tx('السعر', 'Price'), align: 'end', cell: (r) => <Money v={r.product.price} /> },
    { key: 'a', header: <span className="sr-only">{tx('إجراء', 'Action')}</span>, align: 'end', cell: (r) => <RowAction r={r} /> },
  ];

  function Why({ r }: { r: Row }) {
    if (r.state === 'needs_fix') return <span>{r.fixes.map(L.fix).join(' · ')}</span>;
    if (r.state === 'rejected') return <span>{L.reject(r.item.rejectReason)}</span>;
    return <span>{L.why(r.state)}</span>;
  }
  function RowAction({ r }: { r: Row }) {
    if (r.state === 'needs_fix' || r.state === 'rejected') return canEdit ? <LinkButton variant="secondary" size="sm" href={editHref(r.product.id)}><Pencil className="size-3.5" aria-hidden="true" />{tx('أكمل المنتج', 'Complete product')}</LinkButton> : <Locked>{tx('يحتاج صلاحية تعديل', 'Needs edit access')}</Locked>;
    if (submittable(r, fx.verified)) return canEdit ? <Button variant="soft" size="sm" onClick={() => setDialog({ kind: 'submit', rows: [r] })}><Send className="size-3.5" aria-hidden="true" />{tx('أرسل للمراجعة', 'Submit')}</Button> : <Locked>{tx('يحتاج صلاحية تعديل', 'Needs edit access')}</Locked>;
    if (r.state === 'opted_out') return canEdit ? <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: 'include', row: r })}><Eye className="size-3.5" aria-hidden="true" />{tx('اعرضه في السوق', 'Offer in marketplace')}</Button> : <Locked>{tx('يحتاج صلاحية تعديل', 'Needs edit access')}</Locked>;
    if ((r.state === 'listed' || r.state === 'in_review' || r.state === 'paused' || r.state === 'out_of_stock') && canEdit) return <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: 'withhold', row: r })}><EyeOff className="size-3.5" aria-hidden="true" />{tx('أخفِه من السوق', 'Withhold')}</Button>;
    return <span className="text-xs text-subtle">—</span>;
  }

  const fees: { name: string; hint: string; value: ReactNode; tone: Tone; status: string }[] = [
    { name: tx('عمولة المبيعات', 'Sales commission'), hint: tx('المخطط يقترح سوقًا بلا عمولة مبيعات. الشروط التجارية لم تُعتمد، فلا نعرض نسبة.', 'The blueprint proposes no sales commission. Commercial terms are not approved, so no rate is shown.'), value: tx('بانتظار الاعتماد', 'Awaiting approval'), tone: 'amber', status: tx('قرار «لك»', 'LAK decision') },
    { name: tx('رسوم معالجة الدفع', 'Payment processing'), hint: tx('صفر عمولة لا يعني صفر رسوم دفع. تُحدد حسب مزود الدفع وعقده.', 'No commission does not mean no payment fees. Set by the payment provider and its contract.'), value: tx('بانتظار الاعتماد', 'Awaiting approval'), tone: 'amber', status: tx('حسب المزود', 'Per provider') },
    { name: tx('الشحن', 'Shipping'), hint: tx('يدفع المتسوق أسعار شحنك أنت، وتظهر له قبل الشراء.', 'Shoppers pay your own shipping rates, shown before they buy.'), value: minShip === null ? '—' : <span className="inline-flex items-center gap-1">{tx('من', 'from')} <Money v={minShip} /></span>, tone: 'green', status: tx('أسعارك', 'Your rates') },
    { name: tx('الظهور المروّج', 'Promoted placement'), hint: tx('إعلانات «لك» واردة في المخطط ولم تُبنَ. لا يُخصم شيء.', 'LAK Ads is in the blueprint and not built. Nothing is charged.'), value: tx('غير متاح', 'Not available'), tone: 'gray', status: tx('لم يُبنَ', 'Not built') },
  ];

  return (
    <div className="space-y-6">
      {header}

      {ch === 'blocked' && <Alert tone="warn" title={tx('متجرك لا يظهر في السوق', 'Your store does not appear in the marketplace')}>{tx('أكمل شروط الأهلية أدناه. لا يُخفى شيء من متجرك الإلكتروني.', 'Complete the eligibility checks below. Nothing is hidden from your online store.')}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="ch-h-status">
          <CardHeader id="ch-h-status" title={tx('حالة القناة', 'Channel status')} hint={tx('سوق لك تطبيق ومتجر ويب تملكه «لك» ويعرض منتجات عدة متاجر. كل متجر يُدفع له ويشحن ويستقبل الإرجاع بشكل منفصل.', 'The LAK marketplace is a LAK-owned app and web store showing products from many stores. Each store is paid, ships and handles returns separately.')} />
          <div className="space-y-5 px-5 pb-5">
            <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-surface-2 p-4">
              <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', ch === 'live' ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' : ch === 'blocked' ? 'bg-red-500/10 text-red-700 dark:text-red-400' : 'bg-surface text-muted')}><Globe2 className="size-5" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-fg">{tx('عرض منتجاتي في سوق لك', 'Show my products in the LAK marketplace')}</p>
                <p className="mt-0.5 text-[13px] text-muted">{CH[ch].sub}</p>
              </div>
              {canChannel
                ? <Switch label={tx('عرض منتجاتي في سوق لك', 'Show my products in the LAK marketplace')} checked={ch === 'live'} disabled={ch === 'blocked'} onChange={() => setDialog({ kind: 'toggle' })} />
                : <Locked>{tx('يغيّره مالك المتجر', 'The store owner changes this')}</Locked>}
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { k: tx('معروض الآن', 'Listed now'), v: counts.listed, href: link('/dashboard/channel', { tab: 'visible' }) },
                { k: tx('قيد المراجعة', 'In review'), v: counts.in_review, href: link('/dashboard/channel', { tab: 'review' }) },
                { k: tx('يحتاجك', 'Needs you'), v: needYou, href: link('/dashboard/channel', { tab: 'action' }) },
                { k: tx('طلبات سوق مفتوحة', 'Open market orders'), v: mOpen.length, href: sectionHref('orders', '', { ch: 'market' }) },
              ].map((s) => (
                <a key={s.k} href={s.href} className="rounded-xl border border-border p-3 transition-colors hover:border-brand-300">
                  <dt className="text-xs text-muted">{s.k}</dt><dd className="mt-1 text-xl font-bold tabular-nums text-fg">{s.v}</dd>
                </a>
              ))}
            </dl>
          </div>
        </Card>

        <Card aria-labelledby="ch-h-elig">
          <CardHeader id="ch-h-elig" title={tx('أهلية المتجر', 'Store eligibility')} hint={tx('شروط مقترحة في مخطط المنصة، بانتظار اعتماد «لك».', 'Proposed in the platform blueprint, awaiting LAK approval.')} />
          <ul className="divide-y divide-border px-5 pb-3">
            {checks.map((c) => <CheckRow key={c.id} c={c} label={L.check(c.id)} href={checkHref(c.id)} />)}
          </ul>
        </Card>
      </div>

      <Card aria-labelledby="ch-h-products">
        <CardHeader id="ch-h-products" title={tx('منتجاتك في السوق', 'Your products in the marketplace')}
          hint={tx('كل منتج يمر بقواعد السوق: فئة مدعومة، صورة، وصف، سعر، مخزون، ثم مراجعة «لك» قبل ظهوره أول مرة. لا يُدرج شيء تلقائيًا دون مراجعة.', 'Every product passes the marketplace rules: supported category, photo, description, price, stock, then LAK review before it first appears. Nothing is listed without review.')}
          action={<LinkButton variant="ghost" size="sm" href={sectionHref('products', '', { ch: 'market' })}>{tx('في صفحة المنتجات', 'In Products')}</LinkButton>} />
        <div className="px-5"><Tabs label={tx('تصفية حسب الحالة', 'Filter by status')} items={TABS.map((t) => ({ href: link('/dashboard/channel', { tab: t === 'all' ? undefined : t, q: q || undefined }), label: L.tab(t), current: tab === t, count: t === 'all' ? rows.length : rows.filter((r) => inTab(r, t)).length }))} /></div>
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          <SearchInput value={q} onChange={(v) => go({ q: v || undefined })} placeholder={tx('اسم المنتج أو SKU', 'Product name or SKU')} />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<PackageOpen className="size-6" aria-hidden="true" />} title={tx('لا منتجات في متجرك بعد', 'No products in your store yet')}
            action={<LinkButton variant="secondary" href={sectionHref('products')}>{tx('اذهب إلى المنتجات', 'Go to Products')}</LinkButton>}>
            {tx('أضف منتجًا في متجرك أولًا، ثم يظهر هنا مع حالته في السوق.', 'Add a product to your store first; it then shows here with its marketplace status.')}
          </EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={q ? tx('لا نتائج', 'No results') : tx('لا منتجات في هذا التبويب', 'Nothing in this tab')}
            action={<Button variant="secondary" onClick={() => replace(link('/dashboard/channel'))}>{tx('اعرض الكل', 'Show all')}</Button>}>
            {q ? tx('جرّب اسمًا آخر أو امسح البحث.', 'Try another name or clear the search.') : tx('لا شيء ينتظرك هنا.', 'Nothing is waiting for you here.')}
          </EmptyState>
        ) : (
          <div className="border-t border-border">
            <DataTable label={tx('منتجاتك في السوق', 'Your products in the marketplace')} rows={shown} rowKey={(r) => r.product.id} columns={columns}
              card={(r) => (
                <div className="flex items-start gap-3">
                  <ProductImage src={listPhoto(r.product)} alt={r.product.name[lang]} size={48} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate text-sm font-semibold text-fg">{r.product.name[lang]}</p>
                    <div className="flex flex-wrap items-center gap-2"><Badge tone={STATE_TONE[r.state]}>{L.state(r.state)}</Badge><Money v={r.product.price} className="text-[13px] text-muted" /></div>
                    <p className="text-xs text-muted"><Why r={r} /></p>
                    <div><RowAction r={r} /></div>
                  </div>
                </div>
              )} />
            <p className="border-t border-border px-5 py-3 text-xs text-muted tabular-nums">{tx(`${shown.length} من ${rows.length} منتجًا`, `${shown.length} of ${rows.length} products`)}</p>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="ch-h-fees">
          <CardHeader id="ch-h-fees" title={tx('العمولة والرسوم', 'Commission and fees')} hint={tx('كل بند منفصل. «صفر عمولة» لا يعني صفر رسوم دفع أو شحن.', 'Each item is separate. “No commission” does not mean no payment or shipping fees.')} />
          <ul className="divide-y divide-border border-t border-border">
            {fees.map((f) => (
              <li key={f.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5">
                <span className="flex min-w-0 flex-1 items-center gap-1 text-sm font-medium text-fg">{f.name}<InfoHint>{f.hint}</InfoHint></span>
                <span className="text-sm text-fg">{f.value}</span>
                <Badge tone={f.tone}>{f.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card aria-labelledby="ch-h-preview">
          <CardHeader id="ch-h-preview" title={tx('كيف يراك المتسوق', 'How shoppers see you')} hint={tx('معاينة لبطاقة منتج في السوق: اسم متجرك كبائع، والسعر، وتكلفة شحنك.', 'Preview of a marketplace product card: your store as the seller, the price and your shipping cost.')} />
          <div className="px-5 pb-5">
            <PreviewCard row={rows.find((r) => r.state === 'listed' || r.state === 'paused')} store={store} minShip={minShip} live={ch === 'live'} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="ch-h-orders">
          <CardHeader id="ch-h-orders" title={tx('طلبات من السوق', 'Orders from the marketplace')} hint={tx('تصلك في صفحة الطلبات نفسها وتُجهّز كالمعتاد. المتسوق يدفع لمتجرك مباشرة.', 'They arrive in the same Orders page and are fulfilled as usual. The shopper pays your store directly.')}
            action={<LinkButton variant="ghost" size="sm" href={sectionHref('orders', '', { ch: 'market' })}>{tx(`الكل (${mOrders.length})`, `All (${mOrders.length})`)}</LinkButton>} />
          {mOrders.length === 0 ? (
            <EmptyState icon={<ShoppingBag className="size-6" aria-hidden="true" />} title={tx('لا طلبات من السوق بعد', 'No marketplace orders yet')}>{tx('تظهر هنا أول طلبات السوق بعد ظهور منتجاتك.', 'Marketplace orders show here once your products are listed.')}</EmptyState>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {mOrders.slice(0, 4).map((o) => (
                <li key={o.ref}>
                  <a href={sectionHref('orders', o.ref)} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/50">
                    <Avatar name={o.customer[lang]} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-fg">{o.customer[lang]}</span><span className="block text-xs text-muted"><Ref>#{o.ref}</Ref> · {o.city[lang]}</span></span>
                    <Badge tone={o.ship === 'delivered' ? 'green' : o.ful === 'none' ? 'amber' : 'sky'}>{o.ship === 'delivered' ? tx('تم التوصيل', 'Delivered') : o.ful === 'none' ? tx('بانتظار التجهيز', 'To fulfil') : tx('قيد الشحن', 'Shipping')}</Badge>
                    <Money v={total(o)} className="hidden text-sm font-semibold text-fg sm:inline-flex" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="ch-h-more">
          <CardHeader id="ch-h-more" title={tx('قنوات «لك» الأخرى', 'Other LAK channels')} hint={tx('واردة في مخطط المنصة ولم تُبنَ بعد، ولا قرار نطاق لها. لا شيء منها مفعّل.', 'In the platform blueprint, not built yet and without an approved scope. None of them is active.')} />
          <ul className="divide-y divide-border px-5 pb-3">
            {[
              { icon: Warehouse, name: tx('لك للجملة', 'LAK Wholesale'), sub: tx('بيع بالجملة لتجار التجزئة', 'Sell in bulk to retailers') },
              { icon: Megaphone, name: tx('إعلانات لك', 'LAK Ads'), sub: tx('حملات على منصات الإعلان', 'Campaigns on ad platforms') },
              { icon: Users, name: tx('مجتمع لك', 'LAK Community'), sub: tx('منتديات وفعاليات للتجار', 'Merchant forums and events') },
            ].map((c) => (
              <li key={c.name} className="flex items-center gap-3 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted"><c.icon className="size-4" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-fg">{c.name}</span><span className="block text-xs text-muted">{c.sub}</span></span>
                <Badge>{tx('لم يُبنَ', 'Not built')}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {review && <ReviewPanel rows={rows} />}

      {dialog?.kind === 'toggle' && <ToggleDialog enabling={ch !== 'live'} rows={rows} onClose={() => setDialog(null)} onConfirm={() => {
        const on = ch !== 'live';
        channelStore.set((x) => ({ ...x, enabled: on }));
        setDialog(null);
        toast({ tone: 'ok', text: on ? tx('استُؤنف العرض في السوق (محاكاة)', 'Marketplace listing resumed (simulated)') : tx('أُوقف العرض في السوق مؤقتًا (محاكاة)', 'Marketplace listing paused (simulated)'), action: { label: tx('تراجع', 'Undo'), run: () => channelStore.set((x) => ({ ...x, enabled: !on })) } });
      }} />}
      {dialog?.kind === 'submit' && (
        <Modal title={tx('إرسال للمراجعة', 'Send for review')} description={tx(`${dialog.rows.length} منتج إلى فريق «لك».`, `${dialog.rows.length} products to the LAK team.`)} onClose={() => setDialog(null)}
          footer={<><Button variant="secondary" onClick={() => setDialog(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => submit(dialog.rows)}><Send className="size-4" aria-hidden="true" />{tx(`أرسل ${dialog.rows.length}`, `Send ${dialog.rows.length}`)}</Button></>}>
          <ul className="max-h-48 space-y-2 overflow-y-auto">{dialog.rows.map((r) => <li key={r.product.id} className="flex items-center gap-3 text-sm"><ProductImage src={listPhoto(r.product)} alt="" size={32} /><span className="min-w-0 flex-1 truncate">{r.product.name[lang]}</span><Money v={r.product.price} className="text-muted" /></li>)}</ul>
          <Consequences items={[
            tx('لا يظهر أي منها حتى تقبله «لك».', 'None appears until LAK accepts it.'),
            ch === 'live' ? tx('المقبول يظهر فورًا باسم متجرك وتكاليفك.', 'Accepted products appear at once with your store name and costs.') : tx('القناة متوقفة؛ المقبول يظهر عند الاستئناف.', 'The channel is paused; accepted products appear when you resume.'),
            tx('الرسوم بانتظار الاعتماد؛ لن يُخصم شيء.', 'Fees await approval; nothing is charged.'),
          ]} />
          <Simulated />
        </Modal>
      )}
      {dialog?.kind === 'include' && (() => {
        const next = includeOutcome(dialog.row, fx.verified, ch === 'live');
        return (
          <Modal title={tx('اعرضه في السوق', 'Offer in the marketplace')} description={dialog.row.product.name[lang]} onClose={() => setDialog(null)}
            footer={<><Button variant="secondary" onClick={() => setDialog(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { setMarket(dialog.row.product.id, true); setDialog(null); toast({ tone: 'ok', text: tx('فُعّلت قناة السوق لهذا المنتج', 'Marketplace turned on for this product') }); }}>{tx('فعّل قناة السوق', 'Turn on marketplace')}</Button></>}>
            <Consequences items={[
              tx(`حالته بعدها: ${L.state(next)}.`, `Its status will be: ${L.state(next)}.`),
              next === 'needs_fix' ? tx('أكمل بياناته ثم أرسله للمراجعة.', 'Complete its details, then send it for review.') : tx('يظهر بعد مراجعة «لك».', 'It appears after LAK review.'),
              tx('يتغير الإعداد نفسه في صفحة المنتج.', 'The same setting changes on the product page.'),
            ]} />
          </Modal>
        );
      })()}
      {dialog?.kind === 'withhold' && (
        <Modal title={tx('إخفاء المنتج من السوق', 'Withhold from the marketplace')} description={dialog.row.product.name[lang]} onClose={() => setDialog(null)}
          footer={<><Button variant="secondary" onClick={() => setDialog(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => { const id = dialog.row.product.id; setMarket(id, false); setDialog(null); toast({ tone: 'ok', text: tx('أُخفي من السوق (محاكاة)', 'Withheld from the marketplace (simulated)'), action: { label: tx('تراجع', 'Undo'), run: () => setMarket(id, true) } }); }}><EyeOff className="size-4" aria-hidden="true" />{tx('أخفِه من السوق', 'Withhold')}</Button></>}>
          <Consequences items={[
            tx('يختفي من السوق فورًا.', 'It disappears from the marketplace at once.'),
            tx('يبقى في متجرك وتطبيقك دون تغيير.', 'It stays in your store and app unchanged.'),
            tx('الطلبات المفتوحة عليه تستمر وتحتاج تجهيزك.', 'Open orders for it continue and need fulfilment.'),
          ]} />
          <Simulated />
        </Modal>
      )}
    </div>
  );
}

function CheckRow({ c, label, href }: { c: Check; label: [string, string]; href?: string }) {
  const tx = useTx();
  const Icon = c.state === 'ok' ? CheckCircle2 : c.state === 'pending' ? Clock : Circle;
  return (
    <li className="flex items-start gap-3 py-3">
      <Icon className={cn('mt-0.5 size-[18px] shrink-0', c.state === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : c.state === 'pending' ? 'text-amber-600 dark:text-amber-400' : 'text-subtle')} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-medium text-fg">{label[0]}<InfoHint>{label[1]}</InfoHint></span>
        <span className="sr-only">{c.state === 'ok' ? tx('مكتمل', 'Done') : c.state === 'pending' ? tx('بانتظار «لك»', 'Waiting on LAK') : tx('مطلوب', 'Required')}</span>
      </span>
      {c.state === 'pending' ? <Badge tone="amber">{tx('بانتظار الاعتماد', 'Awaiting approval')}</Badge>
        : c.state === 'todo' && href ? <LinkButton variant="soft" size="sm" href={href}>{tx('أكمل', 'Fix')}</LinkButton>
        : c.state === 'todo' ? <Badge tone="red">{tx('مطلوب', 'Required')}</Badge> : null}
    </li>
  );
}

function Consequences({ items }: { items: string[] }) {
  return <ul className="space-y-2 rounded-xl bg-surface-2 p-4 text-sm text-fg">{items.map((i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />{i}</li>)}</ul>;
}

function ToggleDialog({ enabling, rows, onClose, onConfirm }: { enabling: boolean; rows: Row[]; onClose: () => void; onConfirm: () => void }) {
  const tx = useTx();
  const orders = ordersStore.use();
  const im = toggleImpact(rows, orders, enabling);
  return (
    <Modal title={enabling ? tx('استئناف العرض في سوق لك', 'Resume showing in the LAK marketplace') : tx('إيقاف العرض في سوق لك مؤقتًا', 'Pause showing in the LAK marketplace')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button>
        <Button variant={enabling ? 'primary' : 'danger'} onClick={onConfirm}>{enabling ? tx('استأنف العرض', 'Resume') : tx('أوقف العرض', 'Pause')}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted">{tx('معروض الآن', 'Listed now')}</p><p className="mt-1 text-xl font-bold tabular-nums">{im.visibleNow}</p></div>
        <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted">{tx('معروض بعدها', 'Listed after')}</p><p className="mt-1 text-xl font-bold tabular-nums">{im.visibleAfter}</p></div>
      </div>
      <Consequences items={enabling ? [
        tx(`يعود ${im.visibleAfter} منتج مقبول للظهور.`, `${im.visibleAfter} accepted products show again.`),
        tx(`${im.inReview} قيد المراجعة يبقى كما هو.`, `${im.inReview} in review stay in review.`),
        tx('الرسوم بانتظار الاعتماد؛ لن يُخصم شيء.', 'Fees await approval; nothing is charged.'),
      ] : [
        tx(`يختفي ${im.visibleNow} منتج من السوق فورًا.`, `${im.visibleNow} products disappear from the marketplace at once.`),
        tx(`${im.openOrders} طلب سوق مفتوح لا يُلغى ويحتاج تجهيزك.`, `${im.openOrders} open marketplace orders are not cancelled and still need fulfilment.`),
        tx('متجرك وتطبيقك يعملان دون تغيير.', 'Your store and app keep working unchanged.'),
        tx('تستطيع الاستئناف في أي وقت دون مراجعة جديدة.', 'You can resume any time without a new review.'),
      ]} />
      <Simulated />
    </Modal>
  );
}

function PreviewCard({ row, store, minShip, live }: { row?: Row; store: string; minShip: number | null; live: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  if (!row) return <EmptyState icon={<Store className="size-6" aria-hidden="true" />} title={tx('لا منتج معروض بعد', 'Nothing listed yet')}>{tx('تظهر المعاينة بعد قبول أول منتج.', 'The preview appears once a product is accepted.')}</EmptyState>;
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-border bg-surface', !live && 'opacity-60')}>
      <ProductImage src={row.product.media.length ? mediaSrc(row.product.media[0], 'large') : productPhoto(row.product.id, 'large')} alt={row.product.name[lang]} size={320} className="!h-44 !w-full rounded-none ring-0" />
      <div className="space-y-2 p-4">
        <p className="truncate text-sm font-semibold text-fg">{row.product.name[lang]}</p>
        <p className="text-base font-bold"><Money v={row.product.price} /></p>
        <p className="flex items-center gap-1.5 text-xs text-muted"><BadgeCheck className="size-3.5 text-brand-600 dark:text-brand-300" aria-hidden="true" />{tx('يبيعه', 'Sold by')} <span className="font-semibold text-fg">{store}</span></p>
        {minShip !== null && <p className="flex items-center gap-1.5 text-xs text-muted"><Truck className="size-3.5" aria-hidden="true" />{tx('الشحن من', 'Shipping from')} <Money v={minShip} /></p>}
      </div>
      {!live && <p className="border-t border-border px-4 py-2 text-xs font-medium text-muted">{tx('مخفي لأن القناة متوقفة', 'Hidden because the channel is paused')}</p>}
    </div>
  );
}

/** Review mode only: stand in for LAK's verification and review decisions to inspect every state. */
function ReviewPanel({ rows }: { rows: Row[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const fx = channelStore.use();
  const pending = rows.filter((r) => r.state === 'in_review');
  return (
    <section className="space-y-3 rounded-2xl border border-dashed border-border p-4" aria-label={tx('أدوات المراجعة', 'Review tools')}>
      <p className="text-xs font-semibold text-muted">{tx('مراجعة: قرارات «لك» (محاكاة)', 'Review: LAK decisions (simulated)')}</p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Switch label={tx('المتجر موثق', 'Store verified')} checked={fx.verified} onChange={(v) => channelStore.set((x) => ({ ...x, verified: v }))} />
        <span>{tx('المتجر موثق', 'Store verified')}</span>
      </div>
      {pending.length === 0 ? <p className="text-xs text-muted">{tx('لا منتجات قيد المراجعة.', 'No products in review.')}</p> : (
        <ul className="space-y-2">
          {pending.map((r) => (
            <li key={r.product.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{r.product.name[lang]}</span>
              <Button size="sm" variant="secondary" onClick={() => channelStore.set((x) => ({ ...x, reviews: decide(x.reviews, r.product.id, true) }))}>{tx('اقبله', 'Accept')}</Button>
              <Button size="sm" variant="ghost" onClick={() => channelStore.set((x) => ({ ...x, reviews: decide(x.reviews, r.product.id, false) }))}>{tx('ارفضه', 'Reject')}</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ChannelSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton className="h-56 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
      <div className="rounded-2xl border border-border bg-surface p-5">
        <Skeleton className="h-5 w-48" />
        <div className="mt-5 space-y-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex items-center gap-3"><Skeleton className="size-10 rounded-xl" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-6 w-24 rounded-full" /></div>)}</div>
      </div>
    </div>
  );
}
