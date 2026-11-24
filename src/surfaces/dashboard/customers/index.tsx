// Customers (blueprint pp. 21–22, skill ch. 03 "العميل والنمو"): list with search, built-in and saved segments,
// export and import; a profile with one activity timeline (orders, refunds, every message, carts, automations,
// notes, account actions), consented contact channels, addresses, loyalty and gift cards, block / unblock,
// internal notes and a separate message-to-customer flow. Saved segments: `customers/segments/<id|new>`;
// import: `customers/import`. View only: rules live in ./model.ts.
import { useMemo, useState, type ReactNode } from 'react';
import { Users, Lock, Mail, MessageSquare, StickyNote, Send, ShieldCheck, SearchX, UserX, Ban, Download, Upload, Plus, ShieldOff, Pencil } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { customersStore, ordersStore, notesStore, segmentsStore, testStore } from '../../merchant/stores';
import { can, canSee } from '../../merchant/perms';
import type { Customer, Segment } from '../../merchant/workspace';
import type { Order } from '../../merchant/domain';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, InfoHint, LinkButton, Money, Ref, Skeleton, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, DataTable, Field, FilterChip, Modal, PageHeader, Pagination, SearchInput, Select, Simulated, Tabs, Textarea, useToast, type Column } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { downloadCsv } from '../finance/download';
import {
  SEGMENTS, SMS_MAX_PARTS, channels, customerRows, customersCsv, filterCustomers, inSaved, lifetime, mask, messageProblems, paginate, parseSegment, parseSort, savedId, segmentCounts, smsParts,
  type CustomerRow, type MsgChannel, type MsgProblem, type Purpose,
} from './model';
import { Activity, AddressesCard, BlockModal, RewardsCard, WithdrawConsent } from './activity';
import SegmentEditor from './segments';
import ImportCustomers from './import';

const href = (path = '', q?: Record<string, string | undefined>) => link(`/dashboard/customers${path ? `/${path}` : ''}`, q);

export default function Customers({ route }: { route: Route }) {
  const role = testStore.use().role;
  if (!canSee(role, 'customers')) return <NoAccess />;
  if (route.path[0] === 'segments') return <SegmentEditor key={route.path[1] ?? 'new'} id={route.path[1] ?? 'new'} canManage={can(role, 'marketing.manage')} />;
  if (route.path[0] === 'import') return can(role, 'marketing.manage') ? <ImportCustomers /> : <NoAccess />;
  return route.path[0] ? <Profile id={route.path[0]} route={route} /> : <List route={route} />;
}

/* ---------- Shared bits ---------- */

function useNames() {
  const tx = useTx();
  return {
    seg: (s: Segment) => ({ returning: tx('عائدون', 'Returning'), new: tx('جدد', 'New'), highValue: tx('قيمة عالية', 'High value'), emailConsent: tx('موافقة البريد', 'Email consent') })[s],
    segHint: (s: Segment) => ({ returning: tx('طلبان مدفوعان أو أكثر.', 'Two or more paid orders.'), new: tx('طلب مدفوع واحد.', 'Exactly one paid order.'), highValue: tx('إنفاق 10,000 ر.س أو أكثر بعد الاستردادات.', 'Spent SAR 10,000 or more after refunds.'), emailConsent: tx('وافق على رسائل البريد التسويقية.', 'Agreed to marketing emails.') })[s],
    ago: (h: number | null) => (h === null ? '—' : h < 24 ? tx('اليوم', 'Today') : h < 48 ? tx('أمس', 'Yesterday') : tx(`قبل ${Math.floor(h / 24)} يومًا`, `${Math.floor(h / 24)} days ago`)),
    channel: (c: MsgChannel) => (c === 'email' ? tx('البريد', 'Email') : tx('رسالة نصية', 'SMS')),
  };
}

function NoAccess() {
  const tx = useTx();
  return (
    <div className="space-y-6">
      <PageHeader title={tx('العملاء', 'Customers')} />
      <Card><EmptyState as="h2" icon={<Lock className="size-6" aria-hidden="true" />} title={tx('ليست لديك صلاحية على العملاء', 'You do not have access to customers')}
        action={<LinkButton variant="secondary" href={link('/dashboard')}>{tx('العودة للرئيسية', 'Back to home')}</LinkButton>}>
        {tx('اطلب من مالك المتجر إضافة صلاحية العملاء لدورك.', 'Ask the store owner to add customer access to your role.')}
      </EmptyState></Card>
    </div>
  );
}

/* ---------- List ---------- */

function List({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const state = useDashState();
  const orders = ordersStore.use();
  // The same customer list the online store adds new shoppers to.
  const customers = customersStore.use();
  const role = testStore.use().role;
  const contact = can(role, 'customer.contact');
  const saved = segmentsStore.use();
  const manage = can(role, 'marketing.manage');
  const q = route.query.get('q') ?? '';
  const seg = parseSegment(route.query.get('seg'));
  const custom = saved.find((x) => x.id === savedId(route.query.get('seg')));
  const blocked = route.query.get('blocked') === '1';
  const sort = parseSort(route.query.get('sort'));
  const empty = state === 'empty';

  const all = useMemo(() => customerRows(empty ? [] : customers, orders), [customers, orders, empty]);
  const counts = segmentCounts(all);
  const savedCounts = useMemo(() => Object.fromEntries(saved.map((x) => [x.id, inSaved(all, orders, x).length])), [saved, all, orders]);
  const base = custom ? inSaved(all, orders, custom) : all;
  const filtered = filterCustomers(base, { q, seg: custom ? null : seg, sort, contact }).filter((r) => !blocked || r.c.blocked);
  const pg = paginate(filtered, Number(route.query.get('page')) || 1);
  const segParam = custom ? `custom:${custom.id}` : seg ?? undefined;
  const qs = (o: Record<string, string | undefined>) => ({ q: q || undefined, seg: segParam, sort: sort === 'recent' ? undefined : sort, blocked: blocked ? '1' : undefined, ...o });
  const exportCsv = () => downloadCsv(`customers-${custom?.id ?? seg ?? 'all'}.csv`, customersCsv(filtered, contact, lang));

  const header = <PageHeader title={tx('العملاء', 'Customers')} description={empty || state !== 'live' ? undefined : tx(`${all.length} عميلًا`, `${all.length} customers`)}
    actions={state === 'live' && !empty ? <div className="flex flex-wrap gap-2">
      {manage && <LinkButton variant="secondary" href={href('import')}><Upload className="size-4" aria-hidden="true" />{tx('استيراد', 'Import')}</LinkButton>}
      <Button variant="secondary" onClick={exportCsv}><Download className="size-4" aria-hidden="true" />{tx(`تصدير ${filtered.length}`, `Export ${filtered.length}`)}</Button>
    </div> : undefined} />;
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<ListSkeleton /></div>;
  if (state === 'error') return (
    <div className="space-y-6">{header}
      <Card><ErrorState as="h2" title={tx('تعذّر تحميل العملاء', 'Customers could not load')} onRetry={() => setDashState('live')}>
        {tx('لم يتغير شيء في بياناتك. المرجع SIM-CUS-503.', 'Nothing changed in your data. Ref SIM-CUS-503.')}
      </ErrorState></Card>
    </div>
  );
  if (empty) return (
    <div className="space-y-6">{header}
      <Card><EmptyState as="h2" icon={<Users className="size-6" aria-hidden="true" />} title={tx('لا عملاء بعد', 'No customers yet')}
        action={<LinkButton href={link('/store')}>{tx('افتح متجرك', 'Open your store')}</LinkButton>}>
        {tx('يظهر العميل هنا بعد أول طلب منه.', 'A customer appears here after their first order.')}
      </EmptyState></Card>
    </div>
  );

  type R = CustomerRow;
  const columns: Column<R>[] = [
    { key: 'name', header: tx('العميل', 'Customer'), cell: (r) => (
      <span className="flex items-center gap-3"><Avatar name={r.c.name[lang]} /><span className="min-w-0"><span className="flex items-center gap-1.5 truncate font-semibold text-fg">{r.c.name[lang]}{r.c.blocked && <Badge tone="red" icon={<Ban className="size-3" aria-hidden="true" />}>{tx('محظور', 'Blocked')}</Badge>}</span><span className="block text-xs font-normal text-muted"><Ref>{r.c.id}</Ref></span></span></span>
    ) },
    { key: 'city', header: tx('المدينة', 'City'), hideBelow: 'lg', cell: (r) => <span className="text-muted">{r.c.city[lang]}</span> },
    { key: 'segs', header: tx('الشرائح', 'Segments'), hideBelow: 'lg', cell: (r) => <SegBadges segs={r.segs} /> },
    { key: 'orders', header: <span className="inline-flex items-center gap-1">{tx('الطلبات', 'Orders')}<InfoHint>{tx('الطلبات المدفوعة؛ لا يُحتسب الدفع الفاشل.', 'Paid orders; failed payments are not counted.')}</InfoHint></span>, align: 'end', cell: (r) => <span className="tabular-nums">{r.paidCount}</span> },
    { key: 'spent', header: <span className="inline-flex items-center gap-1">{tx('الإنفاق', 'Spent')}<InfoHint>{tx('مجموع الطلبات المدفوعة بعد الاستردادات المؤكدة.', 'Paid orders after confirmed refunds.')}</InfoHint></span>, align: 'end', cell: (r) => <Money v={r.spent} className="font-semibold text-fg" /> },
    { key: 'last', header: tx('آخر طلب', 'Last order'), align: 'end', cell: (r) => <span className="text-muted">{n.ago(r.lastHours)}</span> },
  ];

  return (
    <div className="space-y-6">
      {header}
      <Card>
        <div className="px-4 pt-2 sm:px-5">
          <Tabs label={tx('الشرائح', 'Segments')} items={[
            { href: href('', qs({ seg: undefined, page: undefined })), label: tx('الكل', 'All'), current: !seg && !custom, count: counts.all },
            ...SEGMENTS.map((s) => ({ href: href('', qs({ seg: s, page: undefined })), label: n.seg(s), current: !custom && seg === s, count: counts[s] })),
            ...saved.map((x) => ({ href: href('', qs({ seg: `custom:${x.id}`, page: undefined })), label: x.name[lang], current: custom?.id === x.id, count: savedCounts[x.id] })),
            ...(manage ? [{ href: href('segments/new'), label: <span className="inline-flex items-center gap-1"><Plus className="size-3.5" aria-hidden="true" />{tx('شريحة', 'Segment')}</span>, current: false }] : []),
          ]} />
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
          <SearchInput value={q} onChange={(v) => replace(href('', qs({ q: v || undefined, page: undefined })))}
            placeholder={contact ? tx('ابحث بالاسم أو المدينة أو البريد أو الجوال', 'Search name, city, email or mobile') : tx('ابحث بالاسم أو المعرف أو المدينة', 'Search name, id or city')} />
          <FilterChip label={tx('الترتيب', 'Sort')} value={sort === 'recent' ? '' : sort} onChange={(v) => replace(href('', qs({ sort: v || undefined, page: undefined })))}
            options={[{ value: 'spent', label: tx('الأعلى إنفاقًا', 'Highest spend') }, { value: 'orders', label: tx('الأكثر طلبات', 'Most orders') }]} />
          <FilterChip label={tx('الحالة', 'Status')} value={blocked ? '1' : ''} onChange={(v) => replace(href('', qs({ blocked: v || undefined, page: undefined })))} options={[{ value: '1', label: tx('محظورون', 'Blocked') }]} />
          {custom && <span className="flex items-center gap-1.5 text-xs text-muted">{tx('شريحة محفوظة بقواعد', 'Saved rule-based segment')}{manage && <a href={href(`segments/${custom.id}`)} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline dark:text-brand-300"><Pencil className="size-3" aria-hidden="true" />{tx('عدّل القواعد', 'Edit rules')}</a>}</span>}
          {!custom && seg && <span className="flex items-center gap-1 text-xs text-muted">{n.segHint(seg)}<InfoHint>{tx('الشرائح قواعد على سجل الطلبات والموافقات فقط، ولا نستنتج عمرًا أو جنسًا أو ملاءة.', 'Segments are rules over order history and consent only; nothing is inferred about age, gender or credit.')}</InfoHint></span>}
        </div>
        {pg.total === 0 ? (
          <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا عملاء يطابقون البحث', 'No customers match')}
            action={<LinkButton variant="secondary" href={href()}>{tx('امسح البحث والتصفية', 'Clear search and filters')}</LinkButton>}>
            {q ? tx(`لا نتائج لـ «${q}»${seg ? ` في «${n.seg(seg)}»` : ''}.`, `Nothing for “${q}”${seg ? ` in “${n.seg(seg)}”` : ''}.`) : undefined}
          </EmptyState>
        ) : (
          <div className="border-t border-border">
            <DataTable label={tx('العملاء', 'Customers')} rows={pg.rows} columns={columns} rowKey={(r) => r.c.id} href={(r) => href(r.c.id)}
              card={(r) => (
                <div className="flex items-center gap-3">
                  <Avatar name={r.c.name[lang]} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-fg">{r.c.name[lang]}</p>
                    <p className="text-xs text-muted">{r.c.city[lang]} · {tx(`${r.paidCount} طلبات`, `${r.paidCount} orders`)} · {n.ago(r.lastHours)}</p>
                  </div>
                  <Money v={r.spent} className="text-sm font-semibold text-fg" />
                </div>
              )} />
            <Pagination page={pg.page} pages={pg.pages} total={pg.total} hrefFor={(p) => href('', qs({ page: p > 1 ? String(p) : undefined }))} />
          </div>
        )}
      </Card>
    </div>
  );
}

function SegBadges({ segs }: { segs: Segment[] }) {
  const n = useNames();
  const shown = segs.filter((s) => s !== 'emailConsent');
  if (!shown.length) return <span className="text-subtle">—</span>;
  const tone: Record<Segment, Tone> = { returning: 'brand', new: 'sky', highValue: 'amber', emailConsent: 'gray' };
  return <span className="flex flex-wrap gap-1">{shown.map((s) => <Badge key={s} tone={tone[s]}>{n.seg(s)}</Badge>)}</span>;
}

function ListSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface" role="status" aria-label="Loading">
      <div className="flex gap-4 border-b border-border px-5 py-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-5 w-20" />)}</div>
      <div className="px-5 py-3"><Skeleton className="h-10 w-72 rounded-xl" /></div>
      <div className="divide-y divide-border">{Array.from({ length: 8 }, (_, i) => <div key={i} className="flex items-center gap-3 px-5 py-3"><Skeleton className="size-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-16" /></div><Skeleton className="h-4 w-20" /></div>)}</div>
    </div>
  );
}

/* ---------- Profile ---------- */

function Profile({ id, route }: { id: string; route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const state = useDashState();
  const orders = ordersStore.use();
  const role = testStore.use().role;
  const c = customersStore.use().find((x) => x.id === id);
  const back = { href: href(), label: tx('العملاء', 'Customers') };
  const [modal, setModal] = useState<'block' | 'consent' | null>(null);

  if (state === 'loading') return <div className="space-y-6" aria-busy="true"><PageHeader back={back} title={<Skeleton className="h-8 w-56" />} /><ProfileSkeleton /></div>;
  if (state === 'error') return (
    <div className="space-y-6"><PageHeader back={back} title={tx('ملف العميل', 'Customer profile')} />
      <Card><ErrorState as="h2" title={tx('تعذّر تحميل ملف العميل', 'This customer could not load')} onRetry={() => setDashState('live')}>{tx('المرجع SIM-CUS-504.', 'Ref SIM-CUS-504.')}</ErrorState></Card>
    </div>
  );
  if (!c) return (
    <div className="space-y-6"><PageHeader back={back} title={tx('ملف العميل', 'Customer profile')} />
      <Card><EmptyState as="h2" icon={<UserX className="size-6" aria-hidden="true" />} title={tx('لا يوجد عميل بهذا المعرف', 'No customer with this id')}
        action={<LinkButton variant="secondary" href={href()}>{tx('كل العملاء', 'All customers')}</LinkButton>}><Ref>{id}</Ref></EmptyState></Card>
    </div>
  );

  const lt = lifetime(c, state === 'empty' ? [] : orders);
  const seeOrders = canSee(role, 'orders');
  const contact = can(role, 'customer.contact');
  const canBlock = can(role, 'settings.manage');
  const tl = route.query.get('tl') ?? '';

  return (
    <div className="space-y-6">
      <PageHeader back={back} title={c.name[lang]}
        meta={<><span className="text-sm text-muted"><Ref>{c.id}</Ref> · {c.city[lang]} · {tx('عميل منذ', 'Customer since')} <Ref>{c.since}</Ref></span><SegBadges segs={lt.segs} />{c.blocked && <Badge tone="red" icon={<Ban className="size-3" aria-hidden="true" />}>{tx('محظور', 'Blocked')}</Badge>}</>}
        actions={<div className="flex flex-wrap gap-2">
          {canBlock && <Button variant="secondary" onClick={() => setModal('block')}>{c.blocked ? <><ShieldOff className="size-4" aria-hidden="true" />{tx('فك الحظر', 'Unblock')}</> : <><Ban className="size-4" aria-hidden="true" />{tx('حظر', 'Block')}</>}</Button>}
          {can(role, 'customer.message') && <Button variant="secondary" onClick={() => { const el = document.getElementById('c-message'); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); el?.querySelector<HTMLElement>('select, textarea')?.focus({ preventScroll: true }); }}>{tx('راسل العميل', 'Message customer')}<Send className="size-4 rtl:-scale-x-100" aria-hidden="true" /></Button>}
        </div>} />
      {c.blocked && <Alert tone="bad" title={tx('العميل محظور من الطلبات الجديدة', 'This customer is blocked from new orders')}>{tx(`السبب: ${c.blocked.reason} · ${c.blocked.by} · ${c.blocked.at}`, `Reason: ${c.blocked.reason} · ${c.blocked.by} · ${c.blocked.at}`)}</Alert>}

      <section aria-label={tx('قيمة العميل', 'Customer value')} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label={tx('القيمة الدائمة', 'Lifetime value')} hint={tx('الطلبات المدفوعة شاملة الشحن والضريبة، بعد الاستردادات المؤكدة. ليست ربحًا.', 'Paid orders incl. shipping and VAT, after confirmed refunds. Not profit.')} value={<Money v={lt.spent} />} sub={lt.refundPending ? <>{tx('استرداد معلّق', 'Refund pending')} <Money v={lt.refundPending} /></> : undefined} />
        <Stat label={tx('طلبات مدفوعة', 'Paid orders')} hint={tx('الطلبات التي لم يفشل دفعها.', 'Orders whose payment did not fail.')} value={lt.paidCount} sub={lt.failed ? tx(`${lt.failed} دفع فاشل`, `${lt.failed} failed payment`) : undefined} />
        <Stat label={tx('متوسط الطلب', 'Average order')} hint={tx('القيمة الدائمة ÷ الطلبات المدفوعة.', 'Lifetime value ÷ paid orders.')} value={lt.aov === null ? '—' : <Money v={lt.aov} />} />
        <Stat label={tx('آخر طلب', 'Last order')} value={n.ago(lt.lastHours)} sub={lt.firstHours !== null ? <>{tx('الأول', 'First')} {n.ago(lt.firstHours)}</> : undefined} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Activity c={c} filter={tl} onFilter={(v) => replace(href(c.id, { tl: v || undefined }))} seeOrders={seeOrders} />
          <MessageCard c={c} history={lt.history} />
        </div>
        <div className="min-w-0 space-y-6">
          <Card aria-labelledby="h-contact">
            <CardHeader id="h-contact" title={tx('التواصل والموافقات', 'Contact and consent')} hint={tx('الموافقة تخص الرسائل التسويقية. رسائل الخدمة عن طلب لا تحتاجها.', 'Consent covers marketing. Service messages about an order do not need it.')} />
            <ul className="divide-y divide-border px-5 pb-3">
              {channels(c).map((ch) => (
                <li key={ch.channel} className="flex items-center gap-3 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted" aria-hidden="true">{ch.channel === 'email' ? <Mail className="size-4" /> : <MessageSquare className="size-4" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">{n.channel(ch.channel)}</p>
                    <p className="truncate text-sm font-medium text-fg"><bdi dir="ltr">{contact ? ch.value : mask(ch.value, ch.channel)}</bdi></p>
                  </div>
                  <Badge tone={ch.consent ? 'green' : 'gray'}>{ch.consent ? tx('موافق', 'Consented') : tx('بلا موافقة', 'No consent')}</Badge>
                </li>
              ))}
            </ul>
            {!contact && <p className="flex items-center gap-1.5 px-5 pb-4 text-xs text-muted"><Lock className="size-3.5" aria-hidden="true" />{tx('بيانات التواصل مخفية لدورك.', 'Contact details are hidden for your role.')}</p>}
            {can(role, 'customer.note') && (c.consent.email || c.consent.sms) && <div className="border-t border-border px-5 py-3"><Button variant="ghost" size="sm" onClick={() => setModal('consent')}>{tx('سجّل سحب موافقة', 'Record a consent withdrawal')}</Button></div>}
            <p className="flex items-center gap-1 border-t border-border px-5 py-3 text-xs text-muted"><ShieldCheck className="size-3.5" aria-hidden="true" />{tx('طلبات كشف البيانات أو حذفها', 'Data access or deletion requests')}<InfoHint>{tx('تُعالج عبر الدعم وفق سياسة الخصوصية المعتمدة، ولا تُنفذ من هذه الصفحة.', 'Handled through support under the approved privacy policy, not from this page.')}</InfoHint></p>
          </Card>
          <AddressesCard c={c} />
          <RewardsCard c={c} />
          <NotesCard id={c.id} />
        </div>
      </div>
      {modal === 'block' && <BlockModal c={c} onClose={() => setModal(null)} />}
      {modal === 'consent' && <WithdrawConsent c={c} onClose={() => setModal(null)} />}
    </div>
  );
}

function Stat({ label, hint, value, sub }: { label: string; hint?: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <p className="flex items-center gap-1 text-[13px] font-medium text-muted">{label}{hint && <InfoHint>{hint}</InfoHint>}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-fg tabular-nums sm:text-2xl">{value}</p>
      {sub && <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function NotesCard({ id }: { id: string }) {
  const tx = useTx();
  const role = testStore.use().role;
  const notes = (notesStore.use()[id] ?? []).filter((x) => x.kind === 'internal');
  const toast = useToast();
  const [text, setText] = useState('');
  const [err, setErr] = useState(false);
  const add = () => {
    if (!text.trim()) { setErr(true); return; }
    notesStore.set((all) => ({ ...all, [id]: [{ id: `N${Date.now()}`, kind: 'internal', text: text.trim(), by: tx('أنت', 'You') }, ...(all[id] ?? [])] }));
    setText('');
    toast({ tone: 'ok', text: tx('أُضيفت الملاحظة الداخلية', 'Internal note added') });
  };
  return (
    <Card aria-labelledby="h-notes">
      <CardHeader id="h-notes" title={tx('ملاحظات داخلية', 'Internal notes')} hint={tx('للفريق فقط، ولا تصل إلى العميل أبدًا.', 'Team only. Never sent to the customer.')} action={<Badge tone="gray" icon={<Lock className="size-3" aria-hidden="true" />}>{tx('للفريق', 'Team only')}</Badge>} />
      <div className="space-y-3 px-5 pb-5">
        {can(role, 'customer.note') ? (
          <>
            <Field label={tx('ملاحظة جديدة', 'New note')} error={err ? tx('اكتب الملاحظة أولًا.', 'Write the note first.') : null}>
              {(p) => <Textarea {...p} rows={3} value={text} onChange={(e) => { setText(e.target.value); setErr(false); }} placeholder={tx('مثال: يفضّل التوصيل بعد العصر', 'e.g. Prefers afternoon delivery')} />}
            </Field>
            <Button variant="secondary" size="sm" onClick={add}><StickyNote className="size-4" aria-hidden="true" />{tx('أضف الملاحظة', 'Add note')}</Button>
          </>
        ) : <p className="flex items-center gap-1.5 text-xs text-muted"><Lock className="size-3.5" aria-hidden="true" />{tx('دورك لا يشمل الملاحظات.', 'Your role does not include notes.')}</p>}
        {notes.length === 0 ? <p className="text-sm text-muted">{tx('لا ملاحظات بعد.', 'No notes yet.')}</p> : (
          <ul className="space-y-2">
            {notes.map((x) => <li key={x.id} className="rounded-xl bg-amber-500/8 px-3 py-2.5 text-sm text-fg"><p>{x.text}</p><p className="mt-1 text-xs text-muted">{x.by}</p></li>)}
          </ul>
        )}
      </div>
    </Card>
  );
}

function MessageCard({ c, history }: { c: Customer; history: Order[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const role = testStore.use().role;
  const sent = (notesStore.use()[c.id] ?? []).filter((x) => x.kind === 'message');
  const toast = useToast();
  const [channel, setChannel] = useState<MsgChannel>(c.consent.email ? 'email' : 'sms');
  const [purpose, setPurpose] = useState<Purpose>('service');
  const [orderRef, setOrderRef] = useState(history[0]?.ref ?? '');
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const [preview, setPreview] = useState(false);
  const problems = messageProblems(c, { channel, purpose, orderRef, text });
  const sms = smsParts(text);
  const msg: Record<MsgProblem, string> = {
    noConsent: tx(`لا موافقة تسويقية على ${n.channel(channel)}. اختر رسالة خدمة أو قناة أخرى.`, `No marketing consent on ${n.channel(channel)}. Choose a service message or another channel.`),
    noOrder: tx('اختر الطلب الذي تخصه الرسالة.', 'Choose the order this message is about.'),
    empty: tx('اكتب نص الرسالة.', 'Write the message.'),
    tooLong: tx(`الرسالة النصية أطول من ${SMS_MAX_PARTS} أجزاء.`, `The SMS is longer than ${SMS_MAX_PARTS} parts.`),
  };
  const send = () => {
    notesStore.set((all) => ({ ...all, [c.id]: [{ id: `M${Date.now()}`, kind: 'message', text: text.trim(), channel, by: tx('أنت', 'You') }, ...(all[c.id] ?? [])] }));
    setPreview(false); setText(''); setTried(false);
    toast({ tone: 'ok', text: tx('سُلّمت الرسالة لمزود الإرسال (محاكاة)', 'Message handed to the sending provider (simulated)') });
  };

  return (
    <Card aria-labelledby="h-msg" id="c-message" className="scroll-mt-24">
      <CardHeader id="h-msg" title={tx('رسالة إلى العميل', 'Message to the customer')} hint={tx('تصل إلى العميل ولا يمكن استرجاعها. منفصلة عن الملاحظات الداخلية.', 'Reaches the customer and cannot be recalled. Separate from internal notes.')}
        action={<Badge tone="amber" icon={<Send className="size-3 rtl:-scale-x-100" aria-hidden="true" />}>{tx('تُرسل للعميل', 'Goes to customer')}</Badge>} />
      <div className="space-y-4 px-5 pb-5">
        {!can(role, 'customer.message') ? <p className="flex items-center gap-1.5 text-xs text-muted"><Lock className="size-3.5" aria-hidden="true" />{tx('دورك لا يشمل مراسلة العملاء.', 'Your role does not include messaging customers.')}</p> : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={tx('القناة', 'Channel')}>
                {(p) => <Select {...p} value={channel} onChange={(e) => setChannel(e.target.value as MsgChannel)}>
                  {channels(c).map((ch) => <option key={ch.channel} value={ch.channel}>{n.channel(ch.channel)}{ch.consent ? '' : ` · ${tx('بلا موافقة', 'no consent')}`}</option>)}
                </Select>}
              </Field>
              <Field label={tx('النوع', 'Type')} hint={purpose === 'marketing' ? tx('يحتاج موافقة', 'Needs consent') : tx('عن طلب محدد', 'About one order')}>
                {(p) => <Select {...p} value={purpose} onChange={(e) => setPurpose(e.target.value as Purpose)}>
                  <option value="service">{tx('خدمة', 'Service')}</option><option value="marketing">{tx('تسويق', 'Marketing')}</option>
                </Select>}
              </Field>
              {purpose === 'service' && (
                <Field label={tx('الطلب', 'Order')} error={tried && problems.includes('noOrder') ? msg.noOrder : null}>
                  {(p) => <Select {...p} value={orderRef} onChange={(e) => setOrderRef(e.target.value)}>
                    <option value="">{tx('اختر', 'Choose')}</option>
                    {history.slice(0, 20).map((o) => <option key={o.ref} value={o.ref}>#{o.ref}</option>)}
                  </Select>}
                </Field>
              )}
            </div>
            {problems.includes('noConsent') && <Alert tone="warn">{msg.noConsent}</Alert>}
            <Field label={tx('نص الرسالة', 'Message')} error={tried && (problems.includes('empty') || problems.includes('tooLong')) ? msg[problems.includes('empty') ? 'empty' : 'tooLong'] : null}
              hint={channel === 'sms' && text ? tx(`${sms.parts} جزء · ${[...text].length} حرف`, `${sms.parts} part${sms.parts === 1 ? '' : 's'} · ${[...text].length} chars`) : undefined}>
              {(p) => <Textarea {...p} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={tx('مرحبًا، بخصوص طلبك…', 'Hello, about your order…')} />}
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => { setTried(true); if (problems.length === 0) setPreview(true); }} disabled={problems.includes('noConsent')}>{tx('راجع قبل الإرسال', 'Review before sending')}</Button>
              <Simulated />
            </div>
          </>
        )}
        {sent.length > 0 && (
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs font-semibold text-muted">{tx('رسائل أُرسلت', 'Sent messages')}</p>
            <ul className="space-y-2">
              {sent.map((x) => (
                <li key={x.id} className="rounded-xl border border-border px-3 py-2.5 text-sm">
                  <p className="text-fg">{x.text}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">{x.channel ? n.channel(x.channel) : ''} · {x.by} <Simulated /></p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {preview && (
        <Modal title={tx('مراجعة الرسالة قبل الإرسال', 'Review the message before sending')} description={tx('لا يمكن استرجاع الرسالة بعد إرسالها.', 'A sent message cannot be recalled.')} onClose={() => setPreview(false)}
          footer={<><Button variant="secondary" onClick={() => setPreview(false)}>{tx('عدّل', 'Edit')}</Button><Button onClick={send}><Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />{tx(`أرسل عبر ${n.channel(channel)}`, `Send by ${n.channel(channel)}`)}</Button></>}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">{tx('إلى', 'To')}</dt><dd className="font-medium text-fg">{c.name[lang]} · <bdi dir="ltr">{mask(channel === 'email' ? c.email : c.phone, channel)}</bdi></dd>
            <dt className="text-muted">{tx('النوع', 'Type')}</dt><dd className="text-fg">{purpose === 'service' ? <>{tx('خدمة · الطلب', 'Service · order')} <Ref>#{orderRef}</Ref></> : tx('تسويق · موافقة مسجلة', 'Marketing · consent on record')}</dd>
            {channel === 'sms' && <><dt className="text-muted">{tx('الأجزاء', 'Parts')}</dt><dd className="tabular-nums text-fg">{sms.parts}</dd></>}
          </dl>
          <div className={cn('rounded-2xl border border-border p-4 text-sm leading-relaxed text-fg', channel === 'sms' ? 'bg-surface-2' : 'bg-surface')}>
            <p className="mb-2 text-xs text-muted">{tx('معاينة كما تصل', 'Preview as received')}</p>
            <p className="whitespace-pre-wrap">{text.trim()}</p>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('لن تخرج أي رسالة فعليًا من هذه المعاينة.', 'Nothing actually leaves this preview.')}</p>
        </Modal>
      )}
    </Card>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="space-y-3 rounded-2xl border border-border bg-surface p-5"><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-28" /></div>)}</div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 lg:col-span-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="size-10 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-1/3" /></div><Skeleton className="h-4 w-20" /></div>)}</div>
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5"><Skeleton className="h-4 w-32" /><Skeleton className="h-12 w-full rounded-xl" /><Skeleton className="h-12 w-full rounded-xl" /></div>
      </div>
    </div>
  );
}
