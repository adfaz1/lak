// Merchant services (`#/dashboard/apps?tab=services`): the merchant describes a need (category, the budget range THEY
// choose, deadline), previews it, and the request is saved. No vendor is listed: partners wait on a LAK decision, so the
// request is not sent to anyone yet. Requests can be cancelled and reopened. Status filter lives in the URL (`st`).
import { useState } from 'react';
import { BriefcaseBusiness, Camera, Code2, Handshake, Megaphone, PenLine, RotateCcw, Settings2, Sparkles, X } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { replace, type Route } from '../../../core/router';
import { currentActor, logAction } from '../../merchant/stores';
import { can } from '../../merchant/perms';
import { NEED_MAX, NEED_MIN, SERVICE_CATS, emptyServiceDraft, makeService, validateService, type ServiceCat, type ServiceErrors, type ServiceRequest, type ServiceStatus } from '../../merchant/commercial';
import { serviceRequestsStore } from '../../merchant/commercial-store';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Money, Ref, Skeleton, cn, useTx } from '../../../ds/ui';
import { DataTable, Field, FilterChip, Input, Modal, PageHeader, Simulated, Textarea, useToast, type Column } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { useUnsaved } from '../unsaved';
import { useSessionDraft } from '../settings/drafts';
import { DecisionMarker } from '../settings/decision-marker';
import { ReviewRole, useRole } from '../marketing/access';
import { HubTabs, hubHref } from './hub';

const TODAY = new Date().toISOString().slice(0, 10);
const C_ICON: Record<ServiceCat, typeof Camera> = { design: PenLine, photo: Camera, content: Sparkles, marketing: Megaphone, setup: Settings2, dev: Code2 };
const STATUSES: ServiceStatus[] = ['open', 'cancelled'];

export function useServiceNames() {
  const tx = useTx();
  return {
    cat: (c: ServiceCat) => ({ design: tx('تصميم الهوية والبنرات', 'Brand & banner design'), photo: tx('تصوير المنتجات', 'Product photography'), content: tx('كتابة المحتوى والأوصاف', 'Copy & product descriptions'), marketing: tx('إدارة الحملات الإعلانية', 'Ad campaign management'), setup: tx('تجهيز المتجر وإدخال المنتجات', 'Store setup & product entry'), dev: tx('تكامل أو تطوير خاص', 'Custom integration or development') })[c],
    status: (s: ServiceStatus) => ({ open: tx('محفوظ · بانتظار الشركاء', 'Saved · awaiting partners'), cancelled: tx('ملغى', 'Cancelled') })[s],
  };
}

export default function ServicesPage({ route }: { route: Route }) {
  const tx = useTx();
  const n = useServiceNames();
  const toast = useToast();
  const state = useDashState();
  const role = useRole();
  const all = serviceRequestsStore.use();
  const list = state === 'empty' ? [] : all;
  const manage = can(role, 'apps.manage');
  const qs = route.query.get('st');
  const st = (STATUSES as string[]).includes(qs ?? '') ? (qs as ServiceStatus) : '';
  const shown = list.filter((r) => !st || r.status === st);
  const [cancel, setCancel] = useState<ServiceRequest | null>(null);

  const header = (
    <>
      <PageHeader title={tx('خدمات التاجر', 'Merchant services')} description={tx('صف ما تحتاجه؛ يُحفظ طلبك حتى يُعتمد الشركاء', 'Describe what you need; your request is kept until partners are approved')}
        meta={<DecisionMarker id="services" />} />
      <HubTabs current="services" />
      <ReviewRole />
    </>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<div className="grid gap-6 lg:grid-cols-5" role="status" aria-label="Loading"><Skeleton className="h-96 rounded-2xl lg:col-span-3" /><Skeleton className="h-64 rounded-2xl lg:col-span-2" /></div></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل طلبات الخدمات', 'Service requests could not load')} onRetry={() => setDashState('live')}>{tx('طلباتك محفوظة. المرجع SIM-SRV-503.', 'Your requests are kept. Ref SIM-SRV-503.')}</ErrorState></Card></div>;

  const setStatus = (r: ServiceRequest, to: ServiceStatus) => {
    serviceRequestsStore.set((l) => l.map((x) => (x.id === r.id ? { ...x, status: to } : x)));
    logAction('apps', to === 'cancelled' ? { ar: `ألغى طلب الخدمة ${r.id}`, en: `Cancelled service request ${r.id}` } : { ar: `أعاد فتح طلب الخدمة ${r.id}`, en: `Reopened service request ${r.id}` }, { target: r.id });
  };
  const cols: Column<ServiceRequest>[] = [
    { key: 'id', header: tx('الطلب', 'Request'), cell: (r) => <Ref>{r.id}</Ref> },
    { key: 'cat', header: tx('الخدمة', 'Service'), cell: (r) => <span className="block max-w-[16rem]"><span className="block font-medium text-fg">{n.cat(r.cat)}</span><span className="block truncate text-xs text-muted" dir="auto">{r.need}</span></span> },
    { key: 'budget', header: tx('ميزانيتك', 'Your budget'), cell: (r) => <span className="whitespace-nowrap"><Money v={r.budgetMin} /> – <Money v={r.budgetMax} /></span>, hideBelow: 'lg' },
    { key: 'dl', header: tx('الموعد', 'Deadline'), cell: (r) => <bdi className="tabular-nums">{r.deadline}</bdi>, hideBelow: 'md' },
    { key: 'st', header: tx('الحالة', 'Status'), cell: (r) => <Badge tone={r.status === 'open' ? 'amber' : 'gray'}>{n.status(r.status)}</Badge> },
    { key: 'act', header: <span className="sr-only">{tx('إجراء', 'Action')}</span>, align: 'end', cell: (r) => manage ? (r.status === 'open'
      ? <Button size="sm" variant="ghost" onClick={() => setCancel(r)}><X className="size-4" aria-hidden="true" />{tx('ألغِ', 'Cancel')}</Button>
      : <Button size="sm" variant="ghost" onClick={() => { setStatus(r, 'open'); toast({ tone: 'ok', text: tx('أُعيد فتح الطلب', 'Request reopened') }); }}><RotateCcw className="size-4" aria-hidden="true" />{tx('أعد فتحه', 'Reopen')}</Button>) : null },
  ];

  return (
    <div className="space-y-6">
      {header}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">{manage ? <RequestForm /> : <Card className="p-5 text-sm text-muted">{tx('طلب الخدمات يتطلب صلاحية إدارة التطبيقات.', 'Requesting services needs app-management permission.')}</Card>}</div>
        <Card className="lg:col-span-2">
          <CardHeader title={<span className="flex items-center gap-1.5"><Handshake className="size-4 text-muted" aria-hidden="true" />{tx('الشركاء', 'Partners')}</span>} action={<DecisionMarker id="services" />} />
          <EmptyState icon={<BriefcaseBusiness className="size-6" aria-hidden="true" />} title={tx('الشركاء بانتظار الاعتماد', 'Partners pending approval')}>
            {tx('لا نعرض مزودين أو أسعارًا قبل اعتمادهم. طلبك محفوظ ولن يُرسل لأحد حتى ذلك الحين.', 'No providers or prices are shown before approval. Your request is kept and sent to no one until then.')}
          </EmptyState>
        </Card>
      </div>

      <Card aria-labelledby="h-srv-list">
        <div className="flex flex-wrap items-center gap-2 px-5 pt-5 pb-3">
          <h2 id="h-srv-list" className="min-w-0 flex-1 text-[15px] font-semibold text-fg">{tx('طلباتك', 'Your requests')} <span className="text-sm font-normal text-muted tabular-nums">({list.length})</span></h2>
          {list.length > 0 && <FilterChip label={tx('الحالة', 'Status')} value={st} onChange={(v) => replace(hubHref('services', { st: v || undefined }))} options={STATUSES.map((s) => ({ value: s, label: n.status(s) }))} />}
        </div>
        {list.length === 0 ? <EmptyState title={tx('لا طلبات بعد', 'No requests yet')}>{tx('اكتب أول طلب في النموذج أعلاه.', 'Write your first request in the form above.')}</EmptyState>
          : shown.length === 0 ? <EmptyState title={tx('لا طلبات بهذه الحالة', 'No requests with this status')} action={<Button variant="secondary" onClick={() => replace(hubHref('services'))}>{tx('امسح الفلتر', 'Clear filter')}</Button>} />
            : <DataTable label={tx('طلبات الخدمات', 'Service requests')} rows={shown} columns={cols} rowKey={(r) => r.id}
              card={(r) => <div className="space-y-1"><div className="flex items-center justify-between gap-2"><span className="font-medium text-fg">{n.cat(r.cat)}</span><Badge tone={r.status === 'open' ? 'amber' : 'gray'}>{n.status(r.status)}</Badge></div><p className="line-clamp-2 text-xs text-muted" dir="auto">{r.need}</p><p className="text-xs text-muted"><Ref>{r.id}</Ref> · <Money v={r.budgetMin} /> – <Money v={r.budgetMax} /> · <bdi>{r.deadline}</bdi></p>{cols[5].cell(r)}</div>} />}
      </Card>

      {cancel && (
        <Modal title={tx(`إلغاء الطلب ${cancel.id}؟`, `Cancel request ${cancel.id}?`)} description={n.cat(cancel.cat)} onClose={() => setCancel(null)}
          footer={<><Button variant="secondary" onClick={() => setCancel(null)}>{tx('أبقِه', 'Keep it')}</Button><Button variant="danger" onClick={() => { setStatus(cancel, 'cancelled'); toast({ tone: 'ok', text: tx('أُلغي الطلب', 'Request cancelled'), action: { label: tx('تراجع', 'Undo'), run: () => setStatus(cancel, 'open') } }); setCancel(null); }}>{tx('ألغِ الطلب', 'Cancel request')}</Button></>}>
          <p className="text-sm text-muted">{tx('يمكنك إعادة فتحه لاحقًا من القائمة.', 'You can reopen it later from the list.')}</p>
        </Modal>
      )}
    </div>
  );
}

function RequestForm() {
  const tx = useTx();
  const { lang } = useLang();
  const n = useServiceNames();
  const toast = useToast();
  const [d, setD, clear] = useSessionDraft('apps.serviceRequest', emptyServiceDraft());
  const [tried, setTried] = useState(false);
  const [review, setReview] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(emptyServiceDraft());
  useUnsaved(dirty, { ar: 'طلب خدمة', en: 'Service request' });
  const e = validateService(d, TODAY);
  const ok = Object.keys(e).length === 0;
  const err = (k: keyof ServiceErrors) => {
    if (!tried || !e[k]) return null;
    return ({ required: tx('مطلوب', 'Required'), short: tx(`اكتب ${NEED_MIN} حرفًا على الأقل`, `Write at least ${NEED_MIN} characters`), long: tx(`الحد ${NEED_MAX} حرف`, `Max ${NEED_MAX} characters`), number: tx('رقم فقط', 'Numbers only'), order: tx('الحد الأعلى أقل من الأدنى', 'Maximum is below minimum'), past: tx('اختر تاريخًا بعد اليوم', 'Pick a date after today') } as const)[e[k]!];
  };
  const submit = () => {
    const who = currentActor().name;
    const l = serviceRequestsStore.get();
    const r = makeService(d, l, who);
    serviceRequestsStore.set([r, ...l]);
    logAction('apps', { ar: `أنشأ طلب خدمة ${r.id}: ${n.cat(r.cat)}`, en: `Created service request ${r.id}: ${n.cat(r.cat)}` }, { target: r.id });
    clear(); setTried(false); setReview(false);
    toast({ tone: 'ok', text: tx(`حُفظ الطلب ${r.id}`, `Request ${r.id} saved`) });
  };
  return (
    <Card aria-labelledby="h-srv-form" className="p-5">
      <h2 id="h-srv-form" className="mb-4 text-[15px] font-semibold text-fg">{tx('اطلب خدمة', 'Request a service')}</h2>
      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-fg">{tx('نوع الخدمة', 'Service type')}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SERVICE_CATS.map((c) => {
            const I = C_ICON[c];
            const on = d.cat === c;
            return (
              <label key={c} className={cn('flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors', on ? 'border-brand-400 bg-brand-500/[.06] text-fg' : 'border-border text-muted hover:bg-surface-2')}>
                <input type="radio" name="srv-cat" className="sr-only" checked={on} onChange={() => setD({ ...d, cat: c })} />
                <I className={cn('size-4 shrink-0', on && 'text-brand-600 dark:text-brand-300')} aria-hidden="true" /><span className="min-w-0">{n.cat(c)}</span>
              </label>
            );
          })}
        </div>
        {err('cat') && <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{err('cat')}</p>}
      </fieldset>
      <div className="mt-4 space-y-4">
        <Field label={tx('ما الذي تحتاجه؟', 'What do you need?')} error={err('need')} hint={tx(`${d.need.trim().length}/${NEED_MAX} · الكمية والأسلوب وأي مثال`, `${d.need.trim().length}/${NEED_MAX} · quantity, style and any example`)}>
          {(p) => <Textarea {...p} dir="auto" value={d.need} onChange={(ev) => setD({ ...d, need: ev.target.value })} placeholder={tx('مثال: تصوير ٣٠ منتجًا بخلفية بيضاء وصورتين لكل منتج', 'e.g. Photograph 30 products on white, two shots each')} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={tx('ميزانيتك من (ر.س)', 'Budget from (SAR)')} error={err('min')}>{(p) => <Input {...p} inputMode="decimal" dir="ltr" value={d.min} onChange={(ev) => setD({ ...d, min: ev.target.value })} />}</Field>
          <Field label={tx('إلى (ر.س)', 'To (SAR)')} error={err('max')}>{(p) => <Input {...p} inputMode="decimal" dir="ltr" value={d.max} onChange={(ev) => setD({ ...d, max: ev.target.value })} />}</Field>
          <Field label={tx('تحتاجها قبل', 'Needed by')} error={err('deadline')}>{(p) => <Input {...p} type="date" min={TODAY} value={d.deadline} onChange={(ev) => setD({ ...d, deadline: ev.target.value })} />}</Field>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button onClick={() => { setTried(true); if (ok) setReview(true); }}>{tx('راجع الطلب', 'Review request')}</Button>
        {dirty && <Button variant="ghost" onClick={() => { clear(); setTried(false); }}>{tx('امسح', 'Clear')}</Button>}
        {dirty && <span className="text-xs text-muted">{tx('المسودة محفوظة إن غادرت', 'Draft kept if you leave')}</span>}
      </div>
      {review && d.cat && (
        <Modal title={tx('مراجعة طلب الخدمة', 'Review service request')} onClose={() => setReview(false)}
          footer={<><Button variant="secondary" onClick={() => setReview(false)}>{tx('عدّل', 'Edit')}</Button><Button onClick={submit}>{tx('احفظ الطلب', 'Save request')}</Button></>}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">{tx('الخدمة', 'Service')}</dt><dd className="text-end font-medium">{n.cat(d.cat)}</dd></div>
            <div><dt className="text-muted">{tx('الوصف', 'Description')}</dt><dd className="mt-1 whitespace-pre-wrap rounded-lg bg-surface-2/60 p-3" dir="auto">{d.need.trim()}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{tx('ميزانيتك', 'Your budget')}</dt><dd>{d.min} – {d.max} {tx('ر.س', 'SAR')}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{tx('قبل', 'By')}</dt><dd><bdi>{new Date(`${d.deadline}T00:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</bdi></dd></div>
          </dl>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[.06] p-3 text-[13px] text-fg">{tx('ما يحدث: يُحفظ الطلب في حسابك فقط. لا يُرسل لأي شريك ولا يُحجز مبلغ حتى يُعتمد الشركاء.', 'What happens: the request is saved to your account only. It is sent to no partner and no money is held until partners are approved.')}</div>
          <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('لا تواصل مع أي جهة خارجية.', 'No outside party is contacted.')}</p>
        </Modal>
      )}
    </Card>
  );
}
