// Release history and release detail. Build, upload, store review and availability are separate stages per
// store: a successful build is never shown as published. Outcomes can only be driven in review mode.
import { useState } from 'react';
import { AlertTriangle, Check, Circle, Clock, FlaskConical, Hammer, History, Layers, RefreshCw, RotateCcw, X } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { useReviewMode } from '../../../core/review';
import { Badge, Button, Card, CardHeader, EmptyState, LinkButton, cn, useTx } from '../../../ds/ui';
import { DataTable, FilterChip, Field, PageHeader, SearchInput, Select, Simulated, useToast, Modal, type Column } from '../../../ds/kit';
import { ACTIVE, PLATFORMS, STAGES, apply, awaiting, isActive, liveVersion, stages, type Platform, type Release, type SimEvent, type StageStatus } from '../../appmaker/domain';
import { filterReleases, fmtDate, releaseGroup, stateTone, type ReleaseFilter, type ReleaseGroup } from './model';
import { IssueBox, ah, useAppData, useS } from './parts';
import { StoreIcon } from './overview';
import { appStore, now, updDraft } from './state';

export function Releases({ route, empty }: { route: Route; empty: boolean }) {
  const tx = useTx();
  const S = useS();
  const { lang } = useLang();
  const { s } = useAppData();
  const f: ReleaseFilter = { q: route.query.get('q') ?? '', kind: (route.query.get('type') ?? '') as ReleaseFilter['kind'], group: (route.query.get('st') ?? '') as ReleaseFilter['group'] };
  const go = (patch: Partial<Record<'q' | 'type' | 'st', string>>) => replace(link('/dashboard/appmaker/releases', { q: f.q, type: f.kind, st: f.group, ...patch }));
  const all = empty ? [] : s.releases;
  const rows = filterReleases(all, f);
  const groupLabel: Record<ReleaseGroup, string> = { attention: tx('يحتاج إجراء', 'Needs action'), progress: tx('قيد المعالجة', 'In progress'), done: tx('مكتمل', 'Done') };
  const groupTone: Record<ReleaseGroup, 'amber' | 'sky' | 'gray'> = { attention: 'amber', progress: 'sky', done: 'gray' };
  const title = (r: Release) => (r.kind === 'config' ? S.configRev(r.version, r.rev) : <>{tx('الإصدار', 'Version')} <bdi dir="ltr">{r.version}</bdi></>);
  const cell = (r: Release, p: Platform) => {
    if (r.kind === 'config') return <span className="text-xs text-muted">{tx('طُبّق', 'Applied')}</span>;
    const run = r.platforms[p];
    if (run.state === 'not_included') return <span className="text-xs text-subtle">—</span>;
    return <span className="flex flex-col items-start gap-0.5"><Badge tone={stateTone(run.state)}>{S.pstates[run.state]}</Badge><span className="text-[11px] text-muted tabular-nums">{S.buildN(run.build)}</span></span>;
  };
  const cols: Column<Release>[] = [
    { key: 'v', header: tx('الإصدار', 'Release'), cell: (r) => <span className="inline-flex items-center gap-2">{r.kind === 'binary' ? <Layers className="size-4 text-subtle" aria-hidden="true" /> : <RefreshCw className="size-4 text-subtle" aria-hidden="true" />}{title(r)}</span> },
    { key: 'g', header: tx('الحالة', 'Status'), cell: (r) => <Badge tone={groupTone[releaseGroup(r)]}>{groupLabel[releaseGroup(r)]}</Badge> },
    { key: 'lak', header: tx('مراجعة «لك»', 'LAK review'), hideBelow: 'lg', cell: (r) => (r.kind === 'config' ? <span className="text-xs text-muted">{S.lakStates.none}</span> : <Badge tone={r.lak === 'approved' ? 'green' : r.lak === 'changes' ? 'amber' : 'sky'}>{S.lakStates[r.lak]}</Badge>) },
    { key: 'ios', header: 'App Store', cell: (r) => cell(r, 'ios') },
    { key: 'android', header: 'Google Play', cell: (r) => cell(r, 'android') },
    { key: 'at', header: tx('أُنشئ', 'Created'), hideBelow: 'lg', cell: (r) => <span className="text-xs text-muted">{fmtDate(r.createdAt, lang)}</span> },
  ];

  if (!all.length) return (
    <Card><EmptyState as="h2" icon={<History className="size-6" aria-hidden="true" />} title={tx('لا إصدارات بعد', 'No releases yet')} action={<LinkButton href={ah('publish')}>{tx('راجع وانشر', 'Review and publish')}</LinkButton>}>
      {tx('كل إرسال وتحديث إعدادات يظهر هنا بنتيجته لكل متجر.', 'Every submission and settings update appears here with its result per store.')}
    </EmptyState></Card>
  );

  return (
    <Card aria-label={tx('سجل الإصدارات', 'Release history')}>
      <div className="flex flex-wrap items-center gap-2 p-4">
        <SearchInput value={f.q} onChange={(v) => go({ q: v })} placeholder={tx('رقم الإصدار', 'Version number')} />
        <FilterChip label={tx('النوع', 'Type')} value={f.kind} onChange={(v) => go({ type: v })} options={[{ value: 'binary', label: tx('إصدار', 'Version') }, { value: 'config', label: tx('إعدادات', 'Settings') }]} />
        <FilterChip label={tx('الحالة', 'Status')} value={f.group} onChange={(v) => go({ st: v })} options={(['attention', 'progress', 'done'] as ReleaseGroup[]).map((g) => ({ value: g, label: groupLabel[g] }))} />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<History className="size-6" aria-hidden="true" />} title={tx('لا إصدارات مطابقة', 'No matching releases')} action={<Button variant="secondary" onClick={() => replace(link('/dashboard/appmaker/releases'))}>{tx('امسح التصفية', 'Clear filters')}</Button>} />
      ) : (
        <div className="border-t border-border">
          <DataTable label={tx('الإصدارات', 'Releases')} rows={rows} columns={cols} rowKey={(r) => r.id} href={(r) => ah('releases', [r.id])}
            card={(r) => (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-fg">{title(r)}</span><Badge tone={groupTone[releaseGroup(r)]}>{groupLabel[releaseGroup(r)]}</Badge></div>
                {r.kind === 'binary' && <div className="flex flex-wrap gap-3">{PLATFORMS.filter((p) => r.platforms[p].state !== 'not_included').map((p) => <span key={p} className="flex items-center gap-1.5 text-xs text-muted"><StoreIcon p={p} className="size-3.5" /><Badge tone={stateTone(r.platforms[p].state)}>{S.pstates[r.platforms[p].state]}</Badge></span>)}</div>}
                <p className="text-xs text-muted">{fmtDate(r.createdAt, lang)}</p>
              </div>
            )} />
        </div>
      )}
      <p className="border-t border-border px-4 py-3 text-xs text-muted">{S.rollbackNote}</p>
    </Card>
  );
}

const STAGE_ICON: Record<StageStatus, typeof Check> = { done: Check, current: Clock, failed: X, action: AlertTriangle, todo: Circle };
const STAGE_TONE: Record<StageStatus, string> = {
  done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', current: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  failed: 'bg-red-500/15 text-red-700 dark:text-red-400', action: 'bg-amber-500/15 text-amber-800 dark:text-amber-300', todo: 'bg-surface-2 text-subtle',
};

export function ReleaseDetail({ id, canManage }: { id: string; canManage: boolean }) {
  const tx = useTx();
  const S = useS();
  const { lang } = useLang();
  const toast = useToast();
  const review = useReviewMode();
  const { s } = useAppData();
  const [restore, setRestore] = useState(false);
  const r = s.releases.find((x) => x.id === id)!;
  const update = (e: SimEvent) => appStore.set((x) => ({ ...x, releases: x.releases.map((y) => (y.id === r.id ? apply(y, e, now()) : y)) }));
  const back = { href: ah('releases'), label: tx('كل الإصدارات', 'All releases') };

  if (r.kind === 'config') return (
    <div className="space-y-6">
      <PageHeader back={back} title={S.configRev(r.version, r.rev)} description={fmtDate(r.createdAt, lang)} meta={<Badge tone="green">{S.applied}</Badge>}
        actions={canManage && <Button variant="secondary" onClick={() => setRestore(true)}><RotateCcw className="size-4" aria-hidden="true" />{tx('استعد كمسودة', 'Restore as draft')}</Button>} />
      <Card><CardHeader title={tx('تحديث إعدادات', 'Settings update')} /><p className="px-5 pb-5 text-sm text-muted">{S.cfgBody}</p></Card>
      <Log r={r} />
      {restore && (
        <Modal title={tx('استعادة هذه الإعدادات كمسودة', 'Restore these settings as the draft')} onClose={() => setRestore(false)}
          footer={<><Button variant="secondary" onClick={() => setRestore(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { const prev = s.draft; updDraft(() => r.config); setRestore(false); toast({ tone: 'ok', text: tx('استُعيدت في المسودة. انشرها من المراجعة والنشر.', 'Restored to the draft. Publish it from Review & publish.'), action: { label: tx('تراجع', 'Undo'), run: () => updDraft(() => prev) } }); }}>{tx('استعد', 'Restore')}</Button></>}>
          <p className="text-sm text-fg">{tx('تُستبدل مسودتك الحالية. لا يصل شيء للعملاء حتى تنشر.', 'Your current draft is replaced. Nothing reaches customers until you publish.')}</p>
        </Modal>
      )}
    </div>
  );

  const included = PLATFORMS.filter((p) => r.platforms[p].state !== 'not_included');
  return (
    <div className="space-y-6">
      <PageHeader back={back} title={<>{tx('الإصدار', 'Version')} <bdi dir="ltr">{r.version}</bdi></>} description={fmtDate(r.createdAt, lang)}
        meta={<Badge tone={r.lak === 'approved' ? 'green' : r.lak === 'changes' ? 'amber' : 'sky'}>{tx('مراجعة «لك»: ', 'LAK review: ')}{S.lakStates[r.lak]}</Badge>} />
      {r.lak === 'in_review' && <p className="text-sm text-muted">{S.lakWindow}</p>}
      {r.lak === 'changes' && r.lakIssue && <IssueBox code={r.lakIssue} />}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        {included.map((p) => {
          const run = r.platforms[p];
          const st = stages(r, p);
          const lv = liveVersion(s.releases, p);
          return (
            <Card key={p} aria-labelledby={`am-run-${p}`}>
              <CardHeader id={`am-run-${p}`} title={<span className="inline-flex items-center gap-2"><StoreIcon p={p} />{S.storeName[p]}<span className="text-xs font-normal text-muted tabular-nums">{S.buildN(run.build)}</span></span>}
                action={<Badge tone={stateTone(run.state)}>{S.pstates[run.state]}</Badge>} />
              <div className="space-y-4 px-5 pb-5">
                <ol className="grid grid-cols-5 gap-1" aria-label={S.stagesLabel(S.storeName[p])}>
                  {STAGES.map((sid, i) => {
                    const I = STAGE_ICON[st[sid]];
                    return (
                      <li key={sid} className="relative flex flex-col items-center gap-1.5 text-center">
                        {i > 0 && <span className={cn('absolute top-3.5 end-1/2 h-0.5 w-full', st[sid] === 'todo' ? 'bg-border' : 'bg-emerald-500/40')} aria-hidden="true" />}
                        <span className={cn('relative grid size-7 place-items-center rounded-full', STAGE_TONE[st[sid]])} aria-hidden="true"><I className={cn('size-3.5', st[sid] === 'todo' && 'size-2 fill-current')} /></span>
                        <span className="text-[11px] font-medium leading-tight text-fg">{S.stageNames[sid]}</span>
                        <span className="text-[10px] text-muted">{S.stageStatus[st[sid]]}</span>
                      </li>
                    );
                  })}
                </ol>
                {run.state !== 'published' && (ACTIVE.includes(run.state) || run.issue) && (
                  <p className="text-[13px] text-muted">{lv && lv.id !== r.id ? S.stillLive(lv.version) : S.notPublished(S.storeName[p])}</p>
                )}
                {run.issue && <IssueBox code={run.issue} />}
                {canManage && (
                  <div className="flex flex-wrap items-center gap-2">
                    {(run.state === 'build_failed' || run.state === 'upload_failed') && <><Button onClick={() => { update({ type: 'rebuild', platform: p }); toast({ tone: 'info', text: tx(`بدأ بناء ${run.build + 1} (محاكاة)`, `Build ${run.build + 1} started (simulated)`) }); }}><Hammer className="size-4" aria-hidden="true" />{tx('أعد البناء', 'Rebuild')}</Button><Simulated /></>}
                    {run.state === 'action_required' && <><Button onClick={() => update({ type: 'resolve', platform: p })}>{tx('أكّد المعالجة وأعد للمراجعة', 'Confirm fix and resubmit')}</Button><Simulated /></>}
                    {run.state === 'rejected' && <LinkButton href={ah('publish')}>{tx('جهّز إصدارًا جديدًا', 'Prepare a new version')}</LinkButton>}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {review && <SimPanel r={r} included={included} onRun={update} />}
      <Log r={r} />
    </div>
  );
}

/** Review mode only: choose each simulated outcome (LAK, build, upload, Apple/Google review). */
function SimPanel({ r, included, onRun }: { r: Release; included: Platform[]; onRun: (e: SimEvent) => void }) {
  const tx = useTx();
  const S = useS();
  const [pick, setPick] = useState<Record<string, string>>({});
  const rows: { key: string; label: string; options: string[]; run: (v: string) => void }[] = [];
  if (r.lak === 'in_review') rows.push({ key: 'lak', label: S.steps2.lak, options: ['approve', 'changes'], run: (v) => onRun({ type: 'lak', outcome: v as 'approve' | 'changes' }) });
  else for (const p of included) {
    const step = awaiting(r, p);
    if (!step || step === 'lak') continue;
    rows.push({
      key: `${p}-${step}`, label: `${S.storeName[p]} · ${S.steps2[step]}`, options: step === 'store' ? ['approve', 'reject', 'action'] : ['ok', 'fail'],
      run: (v) => (step === 'store' ? onRun({ type: 'store', platform: p, outcome: v as 'approve' | 'reject' | 'action' }) : onRun({ type: step, platform: p, outcome: v as 'ok' | 'fail' })),
    });
  }
  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-border p-4" role="region" aria-label={tx('مراجعة: نتائج المحاكاة', 'Review: simulated outcomes')}>
      <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted"><FlaskConical className="size-4" aria-hidden="true" />{tx('مراجعة: نتائج المحاكاة', 'Review: simulated outcomes')}<Simulated /></p>
      <p className="text-xs text-muted">{S.qa21}</p>
      {rows.length === 0 ? <p className="text-sm text-muted">{isActive(r) ? S.nothingToRun : tx('لا خطوة بانتظار نتيجة.', 'No step is waiting for a result.')}</p> : rows.map((row) => {
        const v = pick[row.key] ?? row.options[0];
        return (
          <div key={row.key} className="flex flex-wrap items-end gap-2">
            <Field label={row.label} className="w-56">{(p) => <Select {...p} className="h-9" value={v} onChange={(e) => setPick((x) => ({ ...x, [row.key]: e.target.value }))}>{row.options.map((o) => <option key={o} value={o}>{S.outcomes[o as keyof typeof S.outcomes]}</option>)}</Select>}</Field>
            <Button variant="secondary" size="sm" onClick={() => row.run(v)}>{tx('شغّل', 'Run')}</Button>
          </div>
        );
      })}
    </div>
  );
}

function Log({ r }: { r: Release }) {
  const tx = useTx();
  const S = useS();
  const { lang } = useLang();
  const items = [...r.log].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Card aria-labelledby="am-log">
      <CardHeader id="am-log" title={tx('السجل', 'Activity')} />
      <ol className="space-y-0 px-5 pb-5">
        {items.map((e, i) => (
          <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
            {i < items.length - 1 && <span className="absolute top-5 start-[5px] h-full w-px bg-border" aria-hidden="true" />}
            <span className={cn('relative mt-1.5 size-[11px] shrink-0 rounded-full ring-2 ring-[var(--surface)]', /Fail|Rejected|Changes/.test(e.kind) ? 'bg-red-500' : e.kind === 'storeAction' ? 'bg-amber-500' : 'bg-brand-500')} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fg">{e.platform && <span className="font-semibold">{S.storeName[e.platform]} · </span>}{S.log[e.kind]}{e.build ? <span className="text-muted"> · {S.buildN(e.build)}</span> : null}</p>
              {e.issue && <p className="text-xs text-muted">{S.issueText[e.issue].title}</p>}
              <p className="text-xs text-subtle">{fmtDate(e.at, lang)}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
