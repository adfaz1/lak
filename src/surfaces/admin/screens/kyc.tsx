// Merchant applications (`#/admin/kyc`, `#/admin/kyc/<id>`): queue → documents → request info / approve / reject with reason.
import { useState } from 'react';
import { BadgeCheck, Eye, EyeOff, FileText, FileX2, Inbox, Lock, MailQuestion, Store, XCircle } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { Alert, DataTable, FilterChip, PageHeader, Pagination, SearchInput, Simulated, Tabs, useToast, type Column } from '../../../ds/kit';
import { Badge, Button, Card, CardHeader, EmptyState, LinkButton, Ref, useTx, type Tone } from '../../../ds/ui';
import { can, PLAN_NAME, type Application, type KycDecision, type KycStatus } from '../domain';
import { DOC, DOC_STATE, ENTITY, KYC_STATUS, ROLE_LABEL, ROLE_PERSON } from '../i18n';
import { docsSummary, listApps, readAppQuery } from '../model';
import { kycDecide, kycStore, logDocView, roleStore } from '../state';
import { ahref, Facts, ImpactList, Locked, NoResults, NotFound, qhref, ReasonModal, StateGate, Timeline, useFmt, useQueryNav, useViewState } from '../ui';
import type { ScreenProps } from '../index';

export const KYC_TONE: Record<KycStatus, Tone> = { pending: 'amber', info: 'sky', approved: 'green', rejected: 'red' };
const DOC_TONE = { ok: 'green', missing: 'red', expired: 'red', unreadable: 'amber' } as const;

export default function Kyc(p: ScreenProps) {
  return p.route.path[0] ? <Detail key={p.route.path[0]} {...p} id={p.route.path[0]} /> : <Queue {...p} />;
}

function Queue({ route }: ScreenProps) {
  const tx = useTx();
  const { lang } = useLang();
  const f = useFmt();
  const state = useViewState();
  const stored = kycStore.use();
  const apps = state === 'empty' ? [] : stored;
  const q = readAppQuery(route.query);
  const r = listApps(apps, q);
  const go = useQueryNav('kyc', route);

  const header = <PageHeader title={tx('طلبات التجار', 'Merchant applications')}
    description={state === 'live' && apps.length ? tx(`${r.counts.pending} بانتظار المراجعة · الأقدم أولًا`, `${r.counts.pending} awaiting review · oldest first`) : undefined} />;
  if (state === 'loading' || state === 'error') return <StateGate state={state} header={header} what={{ ar: 'طلبات التجار', en: 'Merchant applications' }} refCode="SIM-ADM-KYC-503" />;
  if (apps.length === 0) return (
    <div className="space-y-6">{header}<Card><EmptyState as="h2" icon={<Inbox className="size-6" aria-hidden="true" />} title={tx('لا طلبات تسجيل بعد', 'No merchant applications yet')}>
      {tx('يظهر هنا كل طلب تسجيل مع وثائقه بعد أن يكمل التاجر التحقق.', 'Each registration appears here with its documents once the merchant completes verification.')}
    </EmptyState></Card></div>
  );

  const statuses: (KycStatus | '')[] = ['', 'pending', 'info', 'approved', 'rejected'];
  const cols: Column<Application>[] = [
    { key: 'store', header: tx('المتجر', 'Store'), cell: (a) => <span className="block max-w-64"><span className="block truncate">{a.store[lang]}</span><span className="block truncate text-xs font-normal text-muted">{a.merchant[lang]} · <Ref>{a.id}</Ref></span></span> },
    { key: 'type', header: tx('نوع التسجيل', 'Registration'), cell: (a) => ENTITY[a.type][lang], hideBelow: 'lg' },
    { key: 'plan', header: tx('الخطة', 'Plan'), cell: (a) => <bdi>{PLAN_NAME[a.plan]}</bdi> },
    { key: 'sub', header: tx('قُدّم', 'Submitted'), cell: (a) => <span className="whitespace-nowrap text-muted">{f.dt(a.submitted)}</span> },
    { key: 'docs', header: tx('الوثائق', 'Documents'), cell: (a) => { const d = docsSummary(a); return <Badge tone={d.complete ? 'green' : 'amber'}>{tx(`${d.ok} من ${d.total} سليمة`, `${d.ok} of ${d.total} valid`)}</Badge>; } },
    { key: 'flags', header: <span className="sr-only">{tx('ملاحظات', 'Notes')}</span>, cell: (a) => (a.flags.length ? <Badge tone="amber">{tx('ملاحظة مراجعة', 'Review note')}</Badge> : null), hideBelow: 'md' },
    { key: 'status', header: tx('الحالة', 'Status'), cell: (a) => <Badge tone={KYC_TONE[a.status]}>{KYC_STATUS[a.status][lang]}</Badge> },
  ];
  const card = (a: Application) => {
    const d = docsSummary(a);
    return (
      <div>
        <div className="flex items-baseline justify-between gap-2"><p className="truncate text-sm font-semibold text-fg">{a.store[lang]}</p><Badge tone={KYC_TONE[a.status]}>{KYC_STATUS[a.status][lang]}</Badge></div>
        <p className="text-xs text-muted">{a.merchant[lang]} · {ENTITY[a.type][lang]} · {f.dt(a.submitted)}</p>
        <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone={d.complete ? 'green' : 'amber'}>{tx(`${d.ok} من ${d.total} سليمة`, `${d.ok} of ${d.total} valid`)}</Badge>{a.flags.length > 0 && <Badge tone="amber">{tx('ملاحظة مراجعة', 'Review note')}</Badge>}</div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {header}
      <Card>
        <div className="px-4 pt-2 sm:px-5">
          <Tabs label={tx('العروض المحفوظة', 'Saved views')} items={statuses.map((s) => ({ href: qhref('kyc', route, { status: s || undefined, page: undefined }), label: s ? KYC_STATUS[s][lang] : tx('الكل', 'All'), current: s === q.status, count: r.counts[s] }))} />
        </div>
        <div className="flex flex-wrap items-center gap-2 p-4 sm:px-5">
          <div className="flex w-full sm:w-auto sm:flex-1 sm:max-w-xs"><SearchInput value={q.q} onChange={(v) => go({ q: v || undefined }, 'replace')} placeholder={tx('المتجر أو التاجر أو الرقم', 'Store, merchant or ID')} /></div>
          <FilterChip label={tx('نوع التسجيل', 'Registration')} value={q.type} options={(['individual', 'sole', 'corporate', 'charity'] as const).map((v) => ({ value: v, label: ENTITY[v][lang] }))} onChange={(v) => go({ type: v || undefined })} />
        </div>
        {r.rows.length === 0 ? (
          r.filtered ? <NoResults onClear={() => go({ q: undefined, type: undefined })} />
            : <EmptyState icon={<BadgeCheck className="size-6" />} title={tx(`لا طلبات في «${q.status ? KYC_STATUS[q.status][lang] : ''}»`, `Nothing in “${q.status ? KYC_STATUS[q.status][lang] : ''}”`)} action={<LinkButton variant="secondary" href={ahref('kyc')}>{tx('كل الطلبات', 'All applications')}</LinkButton>} />
        ) : (
          <>
            <div className="border-t border-border"><DataTable label={tx('طلبات التجار', 'Merchant applications')} rows={r.pageRows} columns={cols} rowKey={(a) => a.id} href={(a) => ahref(`kyc/${a.id}`)} card={card} /></div>
            <Pagination page={r.page} pages={r.pages} total={r.rows.length} hrefFor={(p) => qhref('kyc', route, { page: String(p) })} />
          </>
        )}
      </Card>
    </div>
  );
}

function Detail({ role, id }: ScreenProps & { id: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const f = useFmt();
  const toast = useToast();
  const state = useViewState();
  const app = kycStore.use().find((a) => a.id === id);
  const [dialog, setDialog] = useState<KycDecision | null>(null);
  const [openDoc, setOpenDoc] = useState<number | null>(null);
  const back = { href: ahref('kyc'), label: tx('طلبات التجار', 'Merchant applications') };
  if (state === 'loading' || state === 'error') return <StateGate state={state} header={<PageHeader title={tx('طلب تاجر', 'Merchant application')} back={back} />} what={{ ar: 'الطلب', en: 'The application' }} refCode="SIM-ADM-KYC-504" kind="detail" />;
  if (!app || state === 'empty') return <NotFound back={back.href} backLabel={back.label} />;

  const decided = app.status === 'approved' || app.status === 'rejected';
  const mayDecide = can(role, 'kyc.decide');
  const mayDocs = can(role, 'kyc.docs');
  const d = docsSummary(app);
  const toggleDoc = (i: number) => {
    if (openDoc === i) { setOpenDoc(null); return; }
    setOpenDoc(i);
    logDocView(app.id, DOC[app.docs[i].kind]);
  };
  const EV = { submitted: tx('قُدّم الطلب', 'Application submitted'), info: tx('طُلب استكمال', 'More info requested'), approve: tx('قُبل', 'Approved'), reject: tx('رُفض', 'Rejected'), resubmitted: tx('أُعيد التقديم', 'Resubmitted') };
  const DLG: Record<KycDecision, { title: string; verb: string; impact: { icon: JSX.Element; text: string; tone?: 'warn' | 'safe' }[] }> = {
    approve: { title: tx('قبول طلب التاجر', 'Approve merchant application'), verb: tx('اقبل وأنشئ المتجر', 'Approve and create store'), impact: [
      { icon: <Store />, text: tx('يُنشأ المتجر بحالة «قيد الإعداد»، ولا يظهر للعملاء حتى ينشره التاجر.', 'The store is created as “Onboarding”; shoppers see nothing until the merchant publishes.') },
      { icon: <BadgeCheck />, text: tx('القرار نهائي في هذه النسخة.', 'The decision is final in this build.'), tone: 'warn' }] },
    info: { title: tx('طلب استكمال من التاجر', 'Request more information'), verb: tx('أرسل طلب الاستكمال', 'Send request'), impact: [
      { icon: <MailQuestion />, text: tx('ينتقل الطلب إلى «بانتظار استكمال التاجر». نص طلبك هو ما سيقرؤه التاجر.', 'Moves to “Waiting on merchant”. Your text is what the merchant would read.') }] },
    reject: { title: tx('رفض طلب التاجر', 'Reject merchant application'), verb: tx('ارفض الطلب', 'Reject application'), impact: [
      { icon: <XCircle />, text: tx('يُغلق الطلب. يستطيع التاجر التقديم من جديد.', 'Closes the application. The merchant can apply again.'), tone: 'warn' }] },
  };

  return (
    <div className="space-y-6">
      <PageHeader back={back} title={app.store[lang]} description={<>{app.merchant[lang]} · <Ref>{app.id}</Ref> · {tx('قُدّم', 'Submitted')} {f.dt(app.submitted)}</>}
        meta={<><Badge tone={KYC_TONE[app.status]}>{KYC_STATUS[app.status][lang]}</Badge><Badge tone={d.complete ? 'green' : 'amber'}>{tx(`${d.ok} من ${d.total} وثائق سليمة`, `${d.ok} of ${d.total} documents valid`)}</Badge></>}
        actions={!decided && mayDecide ? (d.complete
          ? <Button onClick={() => setDialog('approve')}><BadgeCheck className="size-4" aria-hidden="true" />{tx('اقبل', 'Approve')}</Button>
          : <Button onClick={() => setDialog('info')}><MailQuestion className="size-4" aria-hidden="true" />{tx('اطلب استكمالًا', 'Request more info')}</Button>) : undefined} />

      {app.flags.map((fl) => <Alert key={fl.en} tone="warn" title={tx('ملاحظة مراجعة', 'Review note')}>{fl[lang]}</Alert>)}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card aria-labelledby="kyc-docs">
            <CardHeader id="kyc-docs" title={tx('الوثائق', 'Documents')} hint={tx('وثائق مقيدة: تفتحها أدوار محددة فقط، وكل فتح يُسجّل باسمك ووقته.', 'Restricted: only some roles can open them, and every view is logged with your name and time.')} />
            <ul className="divide-y divide-border border-t border-border">
              {app.docs.map((doc, i) => (
                <li key={doc.kind} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted" aria-hidden="true">{doc.state === 'missing' ? <FileX2 className="size-5" /> : <FileText className="size-5" />}</span>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="text-sm font-semibold text-fg">{DOC[doc.kind][lang]}</p>
                      <p className="text-xs text-muted"><Ref>{doc.ref}</Ref>{doc.expires && <> · {tx('ينتهي', 'Expires')} {f.d(doc.expires)}</>}</p>
                    </div>
                    <Badge tone={DOC_TONE[doc.state]}>{DOC_STATE[doc.state][lang]}</Badge>
                    {doc.state !== 'missing' && (mayDocs
                      ? <Button variant="secondary" size="sm" aria-expanded={openDoc === i} onClick={() => toggleDoc(i)}>{openDoc === i ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}{openDoc === i ? tx('إخفاء', 'Hide') : tx('اعرض', 'View')}</Button>
                      : <span className="grid size-9 place-items-center text-subtle" title={tx('مقيد لدورك', 'Restricted for your role')}><Lock className="size-4" aria-hidden="true" /><span className="sr-only">{tx('مقيد لدورك', 'Restricted for your role')}</span></span>)}
                  </div>
                  {openDoc === i && (
                    <div className="mt-3 rounded-xl border border-dashed border-border bg-surface-2/60 p-4">
                      <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-fg">{DOC[doc.kind][lang]} · <Ref>{doc.ref}</Ref></p><Simulated /></div>
                      <div className="mt-3 grid h-28 place-items-center rounded-lg bg-surface text-xs text-subtle">{tx('لا يُخزَّن ملف حقيقي في هذه النسخة', 'No real file is stored in this build')}</div>
                      <p className="mt-2 text-xs text-muted">{tx(`عُرض بواسطة ${ROLE_PERSON[roleStore.get()].ar} · ${f.dt(Date.now())} · مسجّل`, `Viewed by ${ROLE_PERSON[roleStore.get()].en} · ${f.dt(Date.now())} · logged`)}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!mayDocs && <div className="border-t border-border px-5 py-3"><Locked>{tx('دورك لا يفتح الوثائق. يفتحها المالك والعمليات.', 'Your role cannot open documents. Owner and Operations can.')}</Locked></div>}
          </Card>

          <Card aria-labelledby="kyc-h">
            <CardHeader id="kyc-h" title={tx('السجل', 'History')} />
            <Timeline items={[...app.events].reverse().map((e, i) => ({ key: String(i), when: f.dt(e.at), title: EV[e.kind], meta: e.by ? ROLE_LABEL[e.by][lang] : undefined, note: e.reason }))} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card aria-labelledby="kyc-dec">
            <CardHeader id="kyc-dec" title={tx('القرار', 'Decision')} />
            <div className="space-y-3 px-5 pb-5">
              {decided ? (
                <>
                  <p className="text-sm text-muted">{tx('حُسم هذا الطلب. القرارات نهائية.', 'This application is decided. Decisions are final.')}</p>
                  {app.status === 'approved' && app.storeId && can(role, 'stores.view') && <LinkButton variant="secondary" href={ahref(`stores/${app.storeId}`)}>{tx('افتح المتجر', 'Open the store')}</LinkButton>}
                </>
              ) : mayDecide ? (
                <>
                  <div className="grid gap-2">
                    <Button disabled={!d.complete} aria-describedby={!d.complete ? 'kyc-blocked' : undefined} onClick={() => setDialog('approve')}>{tx('اقبل', 'Approve')}</Button>
                    <Button variant="secondary" onClick={() => setDialog('info')}>{tx('اطلب استكمالًا', 'Request more info')}</Button>
                    <Button variant="ghost" className="text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400" onClick={() => setDialog('reject')}>{tx('ارفض', 'Reject')}</Button>
                  </div>
                  {!d.complete && <p id="kyc-blocked" className="text-xs text-muted">{tx('القبول متوقف حتى تكون كل الوثائق سليمة.', 'Approval is blocked until every document is valid.')}</p>}
                </>
              ) : <Locked>{tx('دورك يعرض الحالة فقط. القرار للعمليات أو المالك.', 'Your role can view status only. Operations or Owner decide.')}</Locked>}
            </div>
          </Card>
          <Card aria-labelledby="kyc-sum">
            <CardHeader id="kyc-sum" title={tx('بيانات الطلب', 'Application')} />
            <div className="px-5 pb-5">
              <Facts cols={2} items={[
                { label: tx('نوع التسجيل', 'Registration'), value: ENTITY[app.type][lang] },
                { label: tx('الخطة المطلوبة', 'Requested plan'), value: <bdi>{PLAN_NAME[app.plan]}</bdi> },
                { label: tx('المدينة', 'City'), value: app.city[lang] },
                { label: tx('الفئة', 'Category'), value: app.category[lang] },
                { label: tx('البريد (مقنّع)', 'Email (masked)'), value: <Ref>{app.email}</Ref> },
                { label: tx('الجوال (مقنّع)', 'Phone (masked)'), value: <Ref>{app.phone}</Ref> },
              ]} />
            </div>
          </Card>
        </div>
      </div>

      {dialog && (
        <ReasonModal title={DLG[dialog].title} confirmLabel={DLG[dialog].verb} danger={dialog === 'reject'} onClose={() => setDialog(null)}
          reasonLabel={dialog === 'info' ? tx('ما المطلوب من التاجر (يُحفظ في السجل)', 'What the merchant must provide (saved to the audit log)') : undefined}
          target={<><p className="font-semibold text-fg">{app.store[lang]}</p><p className="text-xs text-muted">{app.merchant[lang]} · <Ref>{app.id}</Ref></p></>}
          onConfirm={(reason) => { const e = kycDecide(app.id, dialog, reason); if (!e) toast({ tone: 'ok', text: `${DLG[dialog].verb}: ${app.store[lang]}` }); return e; }}>
          <ImpactList items={DLG[dialog].impact} />
        </ReasonModal>
      )}
    </div>
  );
}
