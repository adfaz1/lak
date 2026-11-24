// Automations (`#/dashboard/automations`): flows with status and last run, run log, templates.
// `#/dashboard/automations/new` picks a template; `#/dashboard/automations/<id>` opens the builder.
import { Plus, Workflow, ArrowLeft } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { replace, type Route } from '../../../core/router';
import { can, canSee } from '../../merchant/perms';
import { automationsStore, runsStore } from '../../merchant/stores';
import type { Automation, Run } from '../../merchant/growth';
import { Badge, Card, CardHeader, EmptyState, ErrorState, LinkButton, Skeleton, cn, useTx } from '../../../ds/ui';
import { DataTable, FilterChip, PageHeader, Tabs, type Column } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { NoAccess, ReviewRole, useRole, Locked } from '../marketing/access';
import { OUTCOMES, TEMPLATES, filterRuns, lastRun, runCounts } from './model';
import Builder from './builder';
import { A_TONE, OutcomeIcon, R_TONE, T_ICON, ahref, useNames } from './names';

export default function Automations({ route }: { route: Route }) {
  const tx = useTx();
  const role = useRole();
  if (!canSee(role, 'automations')) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('الأتمتة غير متاحة لدورك', 'Automations are not available for your role')} /></div>;
  const id = route.path[0];
  if (id === 'new' && !route.query.get('tpl')) return <TemplatePicker />;
  if (id) return <Builder key={id + (route.query.get('tpl') ?? '')} id={id} tpl={route.query.get('tpl')} />;
  return <List route={route} />;
}

function List({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const role = useRole();
  const state = useDashState();
  const autos = automationsStore.use();
  const runs = runsStore.use();
  const empty = state === 'empty';
  const list = empty ? [] : autos;
  const rlist = empty ? [] : runs;
  const tab = route.query.get('tab') === 'runs' ? 'runs' : 'flows';
  const manage = can(role, 'automation.manage');

  const header = (
    <>
      <PageHeader title={tx('الأتمتة', 'Automations')} description={tx('حدث ← شروط ← انتظار ← إجراءات', 'Event → conditions → wait → actions')}
        actions={manage ? <LinkButton href={ahref('new')}><Plus className="size-4" aria-hidden="true" />{tx('أتمتة جديدة', 'New automation')}</LinkButton> : undefined} />
      <ReviewRole />
      <Tabs label={tx('أقسام الأتمتة', 'Automation sections')} items={[
        { href: ahref(), label: tx('المسارات', 'Flows'), current: tab === 'flows', count: list.length },
        { href: ahref('', { tab: 'runs' }), label: tx('سجل التشغيل', 'Run log'), current: tab === 'runs', count: rlist.length },
      ]} />
    </>
  );
  if (state === 'loading') return (
    <div className="space-y-6" aria-busy="true">{header}
      <div className="space-y-5 rounded-2xl border border-border bg-surface p-5" role="status" aria-label="Loading">{[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-4"><Skeleton className="size-11 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4" /></div><Skeleton className="h-6 w-16 rounded-full" /></div>)}</div>
    </div>
  );
  if (state === 'error') return (
    <div className="space-y-6">{header}
      <Card><ErrorState as="h2" title={tx('تعذّر تحميل الأتمتة', 'Automations could not load')} onRetry={() => setDashState('live')}>
        {tx('المسارات النشطة تواصل العمل؛ تعذّر عرضها فقط. المرجع SIM-AUTO-503.', 'Active flows keep running; only this view failed. Ref SIM-AUTO-503.')}
      </ErrorState></Card>
    </div>
  );

  if (tab === 'runs') {
    const oq = route.query.get('outcome');
    const outcome = oq && (OUTCOMES as string[]).includes(oq) ? oq : '';
    const aq = route.query.get('automation') ?? '';
    const shown = filterRuns(rlist, { outcome, automation: aq });
    const counts = runCounts(filterRuns(rlist, { automation: aq }));
    const href = (p: Record<string, string | undefined>) => ahref('', { tab: 'runs', outcome: outcome || undefined, automation: aq || undefined, ...p });
    const name = (r: Run) => autos.find((a) => a.id === r.automation)?.name[lang] ?? r.automation;
    const cols: Column<Run>[] = [
      { key: 'w', header: tx('الوقت', 'When'), cell: (r) => <span className="whitespace-nowrap text-muted">{r.when[lang]}</span> },
      { key: 'a', header: tx('الأتمتة', 'Automation'), cell: (r) => <a href={ahref(r.automation)} className="font-medium text-fg hover:text-brand-700">{name(r)}</a> },
      { key: 's', header: tx('العنصر', 'Subject'), hideBelow: 'lg', cell: (r) => r.subject[lang] },
      { key: 'o', header: tx('النتيجة', 'Outcome'), cell: (r) => <Badge tone={R_TONE[r.outcome]} icon={<OutcomeIcon o={r.outcome} />}>{n.outcome(r.outcome)}</Badge> },
      { key: 'r', header: tx('السبب', 'Reason'), cell: (r) => <span className="text-[13px] text-muted">{r.reason[lang]}</span> },
    ];
    return (
      <div className="space-y-6">{header}
        <Card>
          <div className="px-4 pt-2 sm:px-5">
            <Tabs label={tx('النتيجة', 'Outcome')} items={[
              { href: href({ outcome: undefined }), label: tx('الكل', 'All'), current: !outcome, count: counts.succeeded + counts.failed + counts.skipped },
              ...OUTCOMES.map((o) => ({ href: href({ outcome: o }), label: n.outcome(o), current: outcome === o, count: counts[o] })),
            ]} />
          </div>
          <div className="flex flex-wrap items-center gap-2 p-4 sm:px-5">
            <FilterChip label={tx('الأتمتة', 'Automation')} value={aq} onChange={(v) => replace(href({ automation: v || undefined }))} options={autos.map((a) => ({ value: a.id, label: a.name[lang] }))} />
          </div>
          {shown.length === 0 ? (
            rlist.length === 0
              ? <EmptyState icon={<Workflow className="size-6" aria-hidden="true" />} title={tx('لا تشغيلات بعد', 'No runs yet')}>{tx('يظهر هنا كل تشغيل بنتيجته وسببه.', 'Every run appears here with its outcome and reason.')}</EmptyState>
              : <EmptyState title={tx('لا تشغيلات مطابقة', 'No matching runs')} action={<LinkButton variant="secondary" href={ahref('', { tab: 'runs' })}>{tx('امسح الفلاتر', 'Clear filters')}</LinkButton>} />
          ) : (
            <div className="border-t border-border">
              <DataTable label={tx('سجل التشغيل', 'Run log')} rows={shown} columns={cols} rowKey={(r) => r.id}
                card={(r) => (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2"><span className="font-semibold text-fg">{r.subject[lang]}</span><Badge tone={R_TONE[r.outcome]} icon={<OutcomeIcon o={r.outcome} />}>{n.outcome(r.outcome)}</Badge></div>
                    <p className="text-[13px] text-muted">{r.reason[lang]}</p>
                    <p className="text-xs text-subtle">{name(r)} · {r.when[lang]}</p>
                  </div>
                )} />
            </div>
          )}
        </Card>
      </div>
    );
  }

  const cols: Column<Automation>[] = [
    { key: 'n', header: tx('المسار', 'Flow'), cell: (a) => <span className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300" aria-hidden="true">{T_ICON[a.trigger]}</span><span className="min-w-0"><span className="block font-semibold">{a.name[lang]}</span><span className="block text-xs font-normal text-muted">{n.trigger(a.trigger)} {tx('←', '→')} {a.actions.map(n.action).join(tx('، ', ', '))}</span></span></span> },
    { key: 's', header: tx('الحالة', 'Status'), cell: (a) => <Badge tone={A_TONE[a.status]}>{n.status(a.status)}</Badge> },
    { key: 'v', header: tx('الإصدار', 'Version'), hideBelow: 'lg', cell: (a) => <span className="tabular-nums text-muted">v{a.version}</span> },
    { key: 'l', header: tx('آخر تشغيل', 'Last run'), cell: (a) => { const r = lastRun(rlist, a.id); return r ? <span className="flex flex-wrap items-center gap-2"><Badge tone={R_TONE[r.outcome]} icon={<OutcomeIcon o={r.outcome} />}>{n.outcome(r.outcome)}</Badge><span className="text-xs text-muted">{r.when[lang]}</span></span> : <span className="text-xs text-muted">{tx('لم يعمل بعد', 'Not run yet')}</span>; } },
    { key: 'c', header: tx('نجح / فشل / تُخطّي', 'OK / failed / skipped'), hideBelow: 'lg', align: 'end', cell: (a) => { const c = runCounts(rlist, a.id); return <a href={ahref('', { tab: 'runs', automation: a.id })} className="tabular-nums text-muted hover:text-fg"><span className="text-emerald-700 dark:text-emerald-400">{c.succeeded}</span> / <span className="text-red-700 dark:text-red-400">{c.failed}</span> / {c.skipped}</a>; } },
  ];

  return (
    <div className="space-y-6">{header}
      <Card aria-labelledby="h-flows">
        <CardHeader id="h-flows" title={tx('مساراتك', 'Your flows')} hint={tx('القالب لا يعمل حتى تراجعه وتجرّبه تجربة آمنة وتفعّله. كل تعديل يُنشئ إصدارًا جديدًا.', 'A template does nothing until you review, dry-run and activate it. Every edit creates a new version.')} />
        {list.length === 0 ? (
          <EmptyState icon={<Workflow className="size-6" aria-hidden="true" />} title={tx('لا أتمتة بعد', 'No automations yet')}
            action={manage ? <LinkButton href={ahref('new')}>{tx('ابدأ من قالب', 'Start from a template')}</LinkButton> : undefined}>
            {tx('ابدأ بقالب: سلة متروكة، مخزون منخفض، أو طلب متأخر.', 'Start with a template: abandoned cart, low stock or late order.')}
          </EmptyState>
        ) : (
          <div className="border-t border-border">
            <DataTable label={tx('مساراتك', 'Your flows')} rows={list} columns={cols} rowKey={(a) => a.id} href={(a) => ahref(a.id)}
              card={(a) => { const r = lastRun(rlist, a.id); return (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold text-fg">{a.name[lang]}</span><Badge tone={A_TONE[a.status]}>{n.status(a.status)}</Badge></div>
                  <p className="text-xs text-muted">{n.trigger(a.trigger)} · v{a.version}</p>
                  <p className="text-xs text-muted">{r ? tx(`آخر تشغيل: ${n.outcome(r.outcome)} · ${r.when.ar}`, `Last run: ${n.outcome(r.outcome)} · ${r.when.en}`) : tx('لم يعمل بعد', 'Not run yet')}</p>
                </div>
              ); }} />
          </div>
        )}
        {!manage && <p className="border-t border-border px-5 py-3"><Locked>{tx('دورك يعرض الأتمتة فقط.', 'Your role can only view automations.')}</Locked></p>}
      </Card>
      {manage && list.length > 0 && (
        <section aria-labelledby="h-tpl" className="space-y-3">
          <h2 id="h-tpl" className="text-[15px] font-semibold text-fg">{tx('ابدأ من قالب', 'Start from a template')}</h2>
          <TemplateGrid />
        </section>
      )}
    </div>
  );
}

function TemplatePicker() {
  const tx = useTx();
  const role = useRole();
  const manage = can(role, 'automation.manage');
  return (
    <div className="space-y-6">
      <PageHeader back={{ href: ahref(), label: tx('الأتمتة', 'Automations') }} title={tx('ابدأ من قالب', 'Start from a template')} description={tx('ينشئ مسودة لا تعمل حتى تفعّلها', 'Creates a draft that does nothing until you activate it')} />
      {!manage ? <NoAccess title={tx('إنشاء الأتمتة غير متاح لدورك', 'Creating automations is not available for your role')} /> : (
        <TemplateGrid />
      )}
    </div>
  );
}

function TemplateGrid() {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {TEMPLATES.map((t) => (
        <li key={t.id}>
          <a href={ahref('new', { tpl: t.id })} className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-card transition-colors hover:border-brand-300">
            <span className="grid size-11 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300" aria-hidden="true">{T_ICON[t.trigger]}</span>
            <span className="mt-4 text-[15px] font-semibold text-fg">{t.name[lang]}</span>
            <span className="mt-1 flex-1 text-[13px] text-muted">{n.trigger(t.trigger)} {tx('←', '→')} {t.actions.map(n.action).join(tx('، ', ', '))}</span>
            <span className={cn('mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 dark:text-brand-300')}>{tx('استخدم القالب', 'Use template')}<ArrowLeft className="size-3.5 ltr:rotate-180" aria-hidden="true" /></span>
          </a>
        </li>
      ))}
    </ul>
  );
}
