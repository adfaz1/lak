// Help (`#/dashboard/help`): searchable articles by section, integration status next to the problem,
// and a support request with a simulated reference. View only: rules live in ./model.ts.
import { useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, CircleCheck, LifeBuoy, PlugZap, SearchX, Send } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { appsStore, ordersStore, settingsStore, testStore, ticketsStore } from '../../merchant/stores';
import { articles, type Article } from '../../merchant/workspace';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LinkButton, Ref, Skeleton, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, PageHeader, SearchInput, Select, Simulated, Tabs, Textarea } from '../../../ds/kit';
import { setDashState, useDashState } from '../review';
import { sectionHref } from '../pages';
import { ROLE_LABEL } from '../settings/model';
import {
  DETAILS_MIN, SECTIONS, SECTION_LABEL, SUBJECT_MAX, TOPICS, countBySection, diagnostics, emptyTicket, groupBySection, integrationIssues, isSection,
  issuesFor, nextTicketRef, searchArticles, validateTicket, type HelpSection, type Issue, type TicketDraft, type Topic,
} from './model';

const ALL = articles();
const helpHref = (path = '', q?: Record<string, string | undefined>) => link(`/dashboard/help${path ? `/${path}` : ''}`, q);
const TOPIC_FOR: Record<HelpSection, Topic> = { orders: 'orders', products: 'products', inventory: 'products', finance: 'payments', marketing: 'other', settings: 'account' };

function useIssues(): Issue[] {
  const apps = appsStore.use();
  const s = settingsStore.use();
  return useMemo(() => integrationIssues(apps, s.providers, s.domain), [apps, s.providers, s.domain]);
}

export default function Help({ route }: { route: Route }) {
  const key = route.path[0];
  const state = useDashState();
  const tx = useTx();
  if (state === 'loading') return <HelpSkeleton />;
  if (state === 'error') return (
    <div className="space-y-6"><PageHeader title={tx('المساعدة', 'Help')} />
      <Card><ErrorBlock /></Card></div>
  );
  if (key === 'contact') return <Contact route={route} />;
  if (key) return <ArticlePage id={key} />;
  return <HelpHome route={route} />;
}

function ErrorBlock() {
  const tx = useTx();
  return (
    <ErrorState as="h2" title={tx('تعذّر تحميل المساعدة', 'Help could not load')} onRetry={() => setDashState('live')}>
      {tx('متجرك يعمل كالمعتاد. المرجع SIM-HELP-503.', 'Your store keeps working. Ref SIM-HELP-503.')}
    </ErrorState>
  );
}

function HelpHome({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const empty = useDashState() === 'empty';
  const issues = useIssues();
  const tickets = ticketsStore.use();
  const q = route.query.get('q') ?? '';
  const sec = route.query.get('section');
  const section = isSection(sec) ? sec : null;
  const source = empty ? [] : ALL;
  const found = searchArticles(source, q, section);
  const counts = countBySection(searchArticles(source, q));
  const groups = groupBySection(found);
  const setQ = (v: string) => replace(helpHref('', { q: v || undefined, section: section ?? undefined }));

  return (
    <div className="space-y-6">
      <PageHeader title={tx('المساعدة', 'Help')} description={tx('خطوات قصيرة، حالة الربط، وطلب دعم', 'Short how-tos, connection status and support')}
        actions={<LinkButton variant="secondary" href={helpHref('contact')}><LifeBuoy className="size-4" aria-hidden="true" />{tx('اطلب الدعم', 'Contact support')}</LinkButton>} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <SearchInput value={q} onChange={setQ} placeholder={tx('مثال: استرداد، استيراد، تحويل', 'e.g. refund, import, transfer')} />
          <Tabs label={tx('أقسام المساعدة', 'Help sections')} items={[
            { href: helpHref('', { q: q || undefined }), label: tx('الكل', 'All'), current: !section, count: Object.values(counts).reduce((a, b) => a + b, 0) },
            ...SECTIONS.filter((s) => counts[s] > 0 || s === section).map((s) => ({ href: helpHref('', { q: q || undefined, section: s }), label: SECTION_LABEL[s][lang], current: s === section, count: counts[s] })),
          ]} />
          {source.length === 0 ? (
            <Card><EmptyState as="h2" icon={<BookOpen className="size-6" aria-hidden="true" />} title={tx('لا مقالات بعد', 'No articles yet')}
              action={<LinkButton href={helpHref('contact')}>{tx('اطلب الدعم', 'Contact support')}</LinkButton>}>{tx('اكتب لنا ما تحتاجه وسنرد على طلبك.', 'Tell us what you need and we’ll answer your request.')}</EmptyState></Card>
          ) : groups.length === 0 ? (
            <Card><EmptyState as="h2" icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا مقالات تطابق بحثك', 'No articles match your search')}
              action={<><LinkButton variant="secondary" href={helpHref()}>{tx('امسح البحث', 'Clear search')}</LinkButton><LinkButton href={helpHref('contact', { topic: section ? TOPIC_FOR[section] : undefined })}>{tx('اطلب الدعم', 'Contact support')}</LinkButton></>}>
              {tx('جرّب كلمة أخرى، أو اطلب الدعم.', 'Try another word, or contact support.')}</EmptyState></Card>
          ) : groups.map((g) => {
            const near = issuesFor(issues, g.section);
            return (
              <Card key={g.section} aria-labelledby={`hg-${g.section}`}>
                <CardHeader id={`hg-${g.section}`} title={SECTION_LABEL[g.section][lang]}
                  action={<a href={sectionHref(g.section)} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx(`افتح ${SECTION_LABEL[g.section].ar}`, `Open ${SECTION_LABEL[g.section].en}`)}</a>} />
                {near.length > 0 && <div className="space-y-2 px-5 pb-3">{near.map((i) => <IssueAlert key={i.id} i={i} compact />)}</div>}
                <ul className="divide-y divide-border border-t border-border">
                  {g.articles.map((a) => <ArticleRow key={a.id} a={a} />)}
                </ul>
              </Card>
            );
          })}
        </div>
        <div className="min-w-0 space-y-6">
          <StatusCard issues={issues} />
          <Card aria-labelledby="h-tk">
            <CardHeader id="h-tk" title={tx('طلبات الدعم', 'Support requests')} action={<Simulated />} />
            {tickets.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">{tx('لا طلبات مفتوحة.', 'No open requests.')}</p> : (
              <ul className="divide-y divide-border border-t border-border">
                {tickets.map((t) => (
                  <li key={t.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-muted"><Ref>{t.id}</Ref></span><Badge tone="amber">{tx('مفتوح', 'Open')}</Badge></div>
                    <p className="mt-1 truncate text-sm font-medium text-fg">{t.subject}</p>
                  </li>
                ))}
              </ul>
            )}
            <div className="px-5 pb-5 pt-1"><LinkButton variant="secondary" className="w-full" href={helpHref('contact')}>{tx('طلب جديد', 'New request')}</LinkButton></div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ArticleRow({ a }: { a: Article }) {
  const tx = useTx();
  const { lang } = useLang();
  return (
    <li>
      <a href={helpHref(a.id)} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2/60">
        <BookOpen className="size-4 shrink-0 text-subtle" aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-fg">{a.title[lang]}</span><span className="text-xs text-muted">{tx(`${a.steps.length} خطوات`, `${a.steps.length} steps`)}</span></span>
        <ArrowLeft className="size-4 shrink-0 text-subtle ltr:rotate-180" aria-hidden="true" />
      </a>
    </li>
  );
}

function IssueAlert({ i, compact }: { i: Issue; compact?: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const what = i.kind === 'domain' ? tx('لم نجد سجلات DNS للنطاق', 'DNS records not found for the domain')
    : i.kind === 'provider' ? tx('ينتظر مستندًا منك؛ الطريقة مخفية عن العملاء', 'Needs a document; hidden from shoppers')
      : i.state === 'reauth' ? tx('انتهى التفويض؛ توقفت المزامنة', 'Authorisation expired; sync stopped') : tx('فشلت آخر مزامنة', 'The last sync failed');
  const fix = <a href={sectionHref(i.fix.section, i.fix.path)} className="shrink-0 text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('أصلِح', 'Fix')}</a>;
  if (!compact) return <Alert tone={i.level === 'error' ? 'bad' : 'warn'} title={<bdi>{i.name[lang]}</bdi>} action={fix}>{what}</Alert>;
  return (
    <div className={cn('flex items-start gap-3 rounded-xl px-3 py-2.5 text-[13px]', i.level === 'error' ? 'bg-red-500/8' : 'bg-amber-500/10')} role="status">
      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', i.level === 'error' ? 'bg-red-500' : 'bg-amber-500')} aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block font-semibold text-fg"><bdi>{i.name[lang]}</bdi></span><span className="block text-muted">{what}</span></span>
      {fix}
    </div>
  );
}

function StatusCard({ issues }: { issues: Issue[] }) {
  const tx = useTx();
  const { lang } = useLang();
  return (
    <Card aria-labelledby="h-st">
      <CardHeader id="h-st" title={<><PlugZap className="size-4 text-muted" aria-hidden="true" />{tx('حالة الربط', 'Connections')}</>} hint={tx('التطبيقات ومزوّدو الدفع والنطاق. تظهر كل مشكلة أيضًا بجانب مقالات القسم الذي تؤثر عليه.', 'Apps, payment providers and the domain. Each problem also shows next to the articles of the section it affects.')} />
      {issues.length === 0 ? (
        <p className="flex items-center gap-2 px-5 pb-5 text-sm text-emerald-700 dark:text-emerald-400"><CircleCheck className="size-4" aria-hidden="true" />{tx('كل الربط يعمل', 'Everything is connected')}</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {issues.map((i) => (
            <li key={i.id}>
              <a href={sectionHref(i.fix.section, i.fix.path)} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60">
                <span className={cn('size-2 shrink-0 rounded-full', i.level === 'error' ? 'bg-red-500' : 'bg-amber-500')} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg"><bdi>{i.name[lang]}</bdi></span>
                <Badge tone={i.level === 'error' ? 'red' : 'amber'}>{i.level === 'error' ? tx('متوقف', 'Failing') : tx('يحتاج إجراءً', 'Needs action')}</Badge>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ArticlePage({ id }: { id: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const issues = useIssues();
  const a = ALL.find((x) => x.id === id);
  if (!a) return (
    <div className="space-y-6">
      <PageHeader back={{ href: helpHref(), label: tx('المساعدة', 'Help') }} title={tx('مقالة غير موجودة', 'Article not found')} />
      <Card><EmptyState as="h2" icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لم نجد هذه المقالة', 'We couldn’t find this article')} action={<LinkButton variant="secondary" href={helpHref()}>{tx('كل المقالات', 'All articles')}</LinkButton>} /></Card>
    </div>
  );
  const section = a.page as HelpSection;
  const near = issuesFor(issues, section);
  return (
    <div className="space-y-6">
      <PageHeader back={{ href: helpHref('', { section }), label: SECTION_LABEL[section][lang] }} title={a.title[lang]} meta={<Badge>{SECTION_LABEL[section][lang]}</Badge>}
        actions={<LinkButton href={sectionHref(section)}>{tx(`افتح ${SECTION_LABEL[section].ar}`, `Open ${SECTION_LABEL[section].en}`)}<ArrowLeft className="size-4 ltr:rotate-180" aria-hidden="true" /></LinkButton>} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="h-steps">
          <CardHeader id="h-steps" title={tx('الخطوات', 'Steps')} />
          <ol className="space-y-4 px-5 pb-6">
            {a.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-500/10 text-[13px] font-bold text-brand-700 tabular-nums dark:text-brand-300">{i + 1}</span>
                <p className="pt-0.5 text-sm leading-relaxed text-fg">{s[lang]}</p>
              </li>
            ))}
          </ol>
        </Card>
        <div className="min-w-0 space-y-4">
          {near.length > 0 ? near.map((i) => <IssueAlert key={i.id} i={i} />) : <Alert tone="ok">{tx('لا مشكلات ربط تؤثر على هذا القسم.', 'No connection problems affect this section.')}</Alert>}
          <Card className="p-5">
            <p className="text-sm font-semibold text-fg">{tx('ما زالت المشكلة قائمة؟', 'Still stuck?')}</p>
            <p className="mt-1 text-[13px] text-muted">{tx('نرفق اسم المقالة تلقائيًا.', 'We attach this article automatically.')}</p>
            <LinkButton variant="secondary" className="mt-3 w-full" href={helpHref('contact', { topic: TOPIC_FOR[section], from: a.id })}>{tx('اطلب الدعم', 'Contact support')}</LinkButton>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Contact({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const issues = useIssues();
  const orders = ordersStore.use();
  const store = settingsStore.use().store.name;
  const role = testStore.use().role;
  const topicQ = route.query.get('topic') as Topic | null;
  const from = ALL.find((a) => a.id === route.query.get('from'));
  const [d, setD] = useState<TicketDraft>(() => ({ ...emptyTicket(), topic: topicQ && TOPICS.includes(topicQ) ? topicQ : '' }));
  const [tried, setTried] = useState(false);
  const [preview, setPreview] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const refs = useMemo(() => orders.map((o) => o.ref), [orders]);
  const errs = validateTicket(d, refs);
  const bad = Object.keys(errs).length > 0;
  const set = (p: Partial<TicketDraft>) => setD({ ...d, ...p });
  const topicLabel: Record<Topic, string> = { orders: tx('الطلبات', 'Orders'), payments: tx('المدفوعات والتسويات', 'Payments & payouts'), shipping: tx('الشحن', 'Shipping'), products: tx('المنتجات والمخزون', 'Products & stock'), domain: tx('النطاق', 'Domain'), account: tx('الحساب والإعدادات', 'Account & settings'), other: tx('أخرى', 'Other') };
  const msg = (k: keyof typeof errs) => {
    const e = tried ? errs[k] : undefined;
    if (!e) return null;
    return e === 'required' ? tx('مطلوب', 'Required') : e === 'short' ? (k === 'details' ? tx(`${DETAILS_MIN} حرفًا على الأقل`, `At least ${DETAILS_MIN} characters`) : tx('أطول قليلًا', 'A little longer')) : e === 'long' ? tx(`${SUBJECT_MAX} حرفًا كحد أقصى`, `${SUBJECT_MAX} characters max`)
      : e === 'unknown' ? tx('لا طلب بهذا الرقم في متجرك', 'No order with this number in your store') : tx('احذف أرقام البطاقات أو كلمات المرور', 'Remove card numbers or passwords');
  };
  const diag = diagnostics({ page: from ? `help/${from.id}` : 'help/contact', now: new Date(), store, role: ROLE_LABEL[role].en, lang, issues });
  const send = () => {
    const id = nextTicketRef(ticketsStore.get());
    ticketsStore.set((t) => [{ id, subject: d.subject.trim(), state: 'open' }, ...t]);
    setPreview(false); setSent(id);
  };

  if (sent) return (
    <div className="space-y-6">
      <PageHeader back={{ href: helpHref(), label: tx('المساعدة', 'Help') }} title={tx('اطلب الدعم', 'Contact support')} />
      <Card className="max-w-2xl">
        <EmptyState as="h2" icon={<CheckCircle2 className="size-6 text-emerald-600" aria-hidden="true" />} title={tx('استلمنا طلبك', 'We received your request')}
          action={<><LinkButton variant="secondary" href={helpHref()}>{tx('عُد إلى المساعدة', 'Back to help')}</LinkButton><Button variant="ghost" onClick={() => { setSent(null); setD(emptyTicket()); setTried(false); }}>{tx('طلب آخر', 'Another request')}</Button></>}>
          <span className="block">{tx('المرجع', 'Reference')} <strong className="text-fg"><Ref>{sent}</Ref></strong></span>
          <span className="mt-2 flex items-center justify-center gap-2"><Simulated />{tx('لا يوجد فريق دعم حقيقي في هذه النسخة.', 'There is no real support team in this version.')}</span>
        </EmptyState>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader back={{ href: from ? helpHref(from.id) : helpHref(), label: from ? from.title[lang] : tx('المساعدة', 'Help') }} title={tx('اطلب الدعم', 'Contact support')} description={tx('نرد عادةً عبر بريد التواصل في بيانات المتجر', 'We reply to the contact email in your store details')} />
      <Card className="max-w-2xl p-5 sm:p-6">
        <form noValidate className="space-y-5" onSubmit={(e) => { e.preventDefault(); setTried(true); if (!bad) setPreview(true); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tx('الموضوع', 'Topic')} error={msg('topic')}>{(p) => <Select {...p} value={d.topic} onChange={(e) => set({ topic: e.target.value as Topic })}><option value="">{tx('اختر…', 'Choose…')}</option>{TOPICS.map((t) => <option key={t} value={t}>{topicLabel[t]}</option>)}</Select>}</Field>
            <Field label={tx('رقم الطلب', 'Order number')} optional error={msg('orderRef')}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" placeholder="10482" value={d.orderRef} onChange={(e) => set({ orderRef: e.target.value })} />}</Field>
          </div>
          <Field label={tx('العنوان', 'Subject')} error={msg('subject')}>{(p) => <Input {...p} value={d.subject} maxLength={SUBJECT_MAX + 20} onChange={(e) => set({ subject: e.target.value })} />}</Field>
          <Field label={tx('ماذا حدث؟', 'What happened?')} hint={tx('ما توقعته وما ظهر لك', 'What you expected and what you saw')} error={msg('details')}>{(p) => <Textarea {...p} rows={6} value={d.details} onChange={(e) => set({ details: e.target.value })} />}</Field>
          {issues.length > 0 && <Alert tone="warn">{tx(`لديك ${issues.length} مشكلات ربط معروفة؛ نرفقها بالطلب.`, `You have ${issues.length} known connection problems; we attach them.`)}</Alert>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit"><Send className="size-4" aria-hidden="true" />{tx('راجع وأرسل', 'Review and send')}</Button>
            {tried && bad && <span className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">{tx('صحّح الحقول المعلّمة', 'Fix the marked fields')}</span>}
          </div>
        </form>
      </Card>
      {preview && (
        <Modal title={tx('إرسال طلب الدعم', 'Send support request')} onClose={() => setPreview(false)}
          footer={<><Button variant="secondary" onClick={() => setPreview(false)}>{tx('عدّل', 'Edit')}</Button><Button onClick={send}>{tx('أرسل الطلب', 'Send request')}</Button></>}>
          <dl className="space-y-2 text-sm">
            <Row k={tx('الموضوع', 'Topic')} v={d.topic ? topicLabel[d.topic] : ''} />
            <Row k={tx('العنوان', 'Subject')} v={d.subject.trim()} />
            {d.orderRef.trim() && <Row k={tx('الطلب', 'Order')} v={<Ref>#{d.orderRef.trim().replace(/^#/, '')}</Ref>} />}
          </dl>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-xs font-semibold text-muted">{tx('نرفق تلقائيًا (بلا كلمات مرور أو بيانات بطاقات)', 'Attached automatically (never passwords or card data)')}</p>
            <dl className="mt-2 space-y-1 text-[13px]">
              <Row k={tx('الصفحة', 'Page')} v={<bdi dir="ltr">{diag.page}</bdi>} />
              <Row k={tx('الوقت', 'Time')} v={<bdi dir="ltr">{diag.time}</bdi>} />
              <Row k={tx('المتجر', 'Store')} v={diag.store} />
              <Row k={tx('الدور', 'Role')} v={diag.role} />
              {diag.issues.length > 0 && <Row k={tx('مشكلات الربط', 'Connection issues')} v={<bdi dir="ltr">{diag.issues.join(', ')}</bdi>} />}
            </dl>
          </div>
          <Simulated />
        </Modal>
      )}
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex flex-wrap justify-between gap-x-4"><dt className="text-muted">{k}</dt><dd className="min-w-0 text-end font-medium text-fg">{v}</dd></div>;

function HelpSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" role="status" aria-label="Loading">
        <div className="space-y-4 lg:col-span-2"><Skeleton className="h-10 w-full max-w-xs rounded-xl" />{[0, 1].map((i) => <div key={i} className="space-y-3 rounded-2xl border border-border bg-surface p-5"><Skeleton className="h-4 w-24" />{[0, 1].map((j) => <div key={j} className="flex items-center gap-3"><Skeleton className="size-4" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-16" /></div></div>)}</div>)}</div>
        <div className="space-y-6"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div>
      </div>
    </div>
  );
}
