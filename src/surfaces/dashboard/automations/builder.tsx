// Automation builder: event → conditions → wait → actions. Saving creates a version; activation needs a dry run
// of the saved version on sample data. Pausing is explained before it happens. Nothing is ever sent or created.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FlaskConical, Pause, Play, Plus, Trash2, SearchX, CheckCircle2, CircleDashed } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { navigate } from '../../../core/router';
import { can } from '../../merchant/perms';
import { automationsStore, runsStore } from '../../merchant/stores';
import type { ActionKind, Automation, CondField, Trigger } from '../../merchant/growth';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, InfoHint, LinkButton, cn, useTx } from '../../../ds/ui';
import { Alert, Checkbox, Field, Input, Modal, PageHeader, SaveBar, Select, Simulated, useToast } from '../../../ds/kit';
import { Locked, useRole } from '../marketing/access';
import {
  TRIGGER_ACTIONS, TRIGGER_FIELDS, activationBlock, addCondition, canAddCondition, changeTrigger, dryRun, dryRunSummary, filterRuns,
  fromTemplate, isMessaging, markDryRun, sameFlow, saveVersion, validate, type DryRow,
} from './model';
import { A_TONE, OutcomeIcon, R_TONE, ahref, useNames } from './names';

export default function Builder({ id, tpl }: { id: string; tpl: string | null }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const toast = useToast();
  const role = useRole();
  const autos = automationsStore.use();
  const runs = runsStore.use();
  const isNew = id === 'new';
  const stored = isNew ? undefined : autos.find((a) => a.id === id);
  const initial = useMemo(() => stored ?? fromTemplate(tpl ?? '', autos), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [a, setA] = useState<Automation>(initial);
  const [tried, setTried] = useState(false);
  const [results, setResults] = useState<{ rows: DryRow[]; version: number | null } | null>(null);
  const [confirm, setConfirm] = useState<'activate' | 'pause' | null>(null);
  const cur = autos.find((x) => x.id === a.id);
  const dirty = isNew ? !cur : !!cur && !sameFlow(a, cur);

  useEffect(() => {
    if (!dirty) return;
    const on = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', on);
    return () => window.removeEventListener('beforeunload', on);
  }, [dirty]);

  if (!isNew && !stored) return (
    <Card><EmptyState as="h1" icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا توجد أتمتة بهذا المعرف', 'No automation with this id')}
      action={<LinkButton variant="secondary" href={ahref()}>{tx('كل الأتمتة', 'All automations')}</LinkButton>}><bdi dir="ltr">{id}</bdi></EmptyState></Card>
  );

  const canManage = can(role, 'automation.manage');
  const status = cur?.status ?? 'draft';
  const version = cur?.version ?? 1;
  const editable = canManage && status !== 'active';
  const errors = validate(a);
  const nErr = Object.keys(errors).length - 1;
  const edit = (p: Partial<Automation>) => { setA({ ...a, ...p }); setResults(null); };
  const block = cur ? activationBlock(cur, dirty) : 'unsaved';
  const fields = TRIGGER_FIELDS[a.trigger];
  const myRuns = filterRuns(runs, { automation: a.id }).slice(0, 5);

  const save = () => {
    setTried(true);
    if (nErr > 0) return;
    const r = saveVersion(automationsStore.get(), a);
    automationsStore.set(r.list);
    setA(r.saved);
    setTried(false);
    toast({ tone: 'ok', text: tx(`حُفظ الإصدار ${r.saved.version}. جرّبه قبل التفعيل.`, `Version ${r.saved.version} saved. Dry-run it before activating.`) });
    if (isNew) navigate(ahref(r.saved.id));
  };
  const discard = () => { setA(cur ?? initial); setResults(null); setTried(false); };
  const runDry = () => {
    const rows = dryRun(a);
    setResults({ rows, version: dirty ? null : version });
    if (!dirty && cur) automationsStore.set((list) => markDryRun(list, a.id));
  };
  const setStatus = (s: Automation['status']) => {
    automationsStore.set((list) => list.map((x) => (x.id === a.id ? { ...x, status: s } : x)));
    setConfirm(null);
    toast({ tone: 'ok', text: s === 'active' ? tx(`فُعّل الإصدار ${version}`, `Version ${version} activated`) : tx('أُوقفت الأتمتة', 'Automation paused') });
  };

  const fieldName = (f: CondField) => ({ cartValue: tx('قيمة السلة ≥ (ر.س)', 'Cart value ≥ (SAR)'), stockBelow: tx('المتاح ≤ (قطعة)', 'Available ≤ (units)'), hoursLate: tx('ساعات التأخير ≥', 'Hours late ≥'), channel: tx('القناة', 'Channel') })[f];
  const blockText = block === 'unsaved' ? tx('احفظ التغييرات أولًا', 'Save your changes first')
    : block === 'noActions' ? tx('اختر إجراءً واحدًا على الأقل', 'Choose at least one action')
      : block === 'invalid' ? tx('صحّح الحقول أولًا', 'Fix the fields first')
        : block === 'needsDryRun' ? tx(`جرّب الإصدار ${version} تجربة آمنة أولًا`, `Dry-run version ${version} first`) : null;

  const primary = !canManage ? null : status === 'active'
    ? <Button variant="secondary" onClick={() => setConfirm('pause')}><Pause className="size-4" aria-hidden="true" />{tx('أوقف', 'Pause')}</Button>
    : <Button disabled={!!block} title={blockText ?? undefined} onClick={() => setConfirm('activate')}><Play className="size-4" aria-hidden="true" />{tx(`فعّل الإصدار ${version}`, `Activate version ${version}`)}</Button>;

  return (
    <div className="space-y-6 pb-20">
      <PageHeader back={{ href: ahref(), label: tx('الأتمتة', 'Automations') }} title={a.name[lang] || tx('بلا اسم', 'Untitled')}
        meta={<><Badge tone={A_TONE[status]}>{isNew && !cur ? tx('مسودة غير محفوظة', 'Unsaved draft') : n.status(status)}</Badge><span className="text-xs text-muted tabular-nums">{tx(`الإصدار ${version}`, `Version ${version}`)} · {tx('المالك', 'Owner')}: {a.owner[lang]} · {tx('بتوقيت الرياض', 'Riyadh time')}</span></>}
        actions={primary} />
      {!canManage && <Locked>{tx('دورك يعرض الأتمتة فقط.', 'Your role can only view this automation.')}</Locked>}
      {canManage && status === 'active' && <Alert tone="info" title={tx('المسار نشط', 'This flow is active')}>{tx('أوقفه لتعديله. كل تعديل يُنشئ إصدارًا جديدًا يحتاج تجربة آمنة قبل إعادة التفعيل.', 'Pause it to edit. Each edit creates a new version that needs a dry run before reactivation.')}</Alert>}
      {canManage && status !== 'active' && blockText && <p className="flex items-center gap-1.5 text-[13px] text-muted"><CircleDashed className="size-4" aria-hidden="true" />{tx('قبل التفعيل: ', 'Before activating: ')}{blockText}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <fieldset disabled={!editable} className="min-w-0 space-y-4 lg:col-span-2">
          <legend className="sr-only">{tx('خطوات المسار', 'Flow steps')}</legend>
          <Step n={1} title={tx('الحدث', 'Event')} done={!errors.name}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={tx('الاسم', 'Name')} error={tried && errors.name ? tx('اكتب اسمًا', 'Enter a name') : null}>
                {(p) => <Input {...p} value={a.name[lang]} onChange={(e) => edit({ name: { ...a.name, [lang]: e.target.value } })} />}
              </Field>
              <Field label={tx('يبدأ عندما', 'Starts when')}>
                {(p) => <Select {...p} value={a.trigger} onChange={(e) => edit(changeTrigger(a, e.target.value as Trigger))}>{(Object.keys(TRIGGER_FIELDS) as Trigger[]).map((t) => <option key={t} value={t}>{n.trigger(t)}</option>)}</Select>}
              </Field>
            </div>
          </Step>

          <Step n={2} title={tx('الشروط', 'Conditions')} done={!errors.condition} hint={tx('كل الشروط يجب أن تتحقق. بلا شروط يعمل لكل حدث.', 'All conditions must hold. With none it runs for every event.')}>
            {a.conditions.length === 0 && <p className="text-sm text-muted">{tx('بلا شروط: يعمل لكل حدث.', 'No conditions: runs for every event.')}</p>}
            <ul className="space-y-3">
              {a.conditions.map((c, i) => {
                const setC = (p: Partial<typeof c>) => edit({ conditions: a.conditions.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                const bad = tried && errors.badConditions.includes(i);
                return (
                  <li key={i} className="flex flex-wrap items-end gap-3 rounded-xl bg-surface-2/60 p-3">
                    <Field label={tx('الحقل', 'Field')} className="min-w-40 flex-1">
                      {(p) => <Select {...p} value={c.field} onChange={(e) => { const f = e.target.value as CondField; setC({ field: f, value: f === 'channel' ? 'online' : '1' }); }}>{fields.map((f) => <option key={f} value={f}>{fieldName(f)}</option>)}</Select>}
                    </Field>
                    <Field label={tx('القيمة', 'Value')} className="w-36" error={bad ? tx('رقم صحيح ≥ 1', 'Whole number ≥ 1') : null}>
                      {(p) => c.field === 'channel'
                        ? <Select {...p} value={c.value} onChange={(e) => setC({ value: e.target.value })}><option value="online">{tx('المتجر', 'Store')}</option><option value="market">{tx('سوق لك', 'Marketplace')}</option><option value="app">{tx('التطبيق', 'App')}</option></Select>
                        : <Input {...p} dir="ltr" inputMode="numeric" value={c.value} onChange={(e) => setC({ value: e.target.value.trim() })} />}
                    </Field>
                    <IconButton label={tx('احذف الشرط', 'Remove condition')} onClick={() => edit({ conditions: a.conditions.filter((_, j) => j !== i) })}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
                  </li>
                );
              })}
            </ul>
            {canAddCondition(a) && <Button variant="secondary" size="sm" className="mt-3" onClick={() => edit(addCondition(a))}><Plus className="size-3.5" aria-hidden="true" />{tx('أضف شرطًا', 'Add condition')}</Button>}
          </Step>

          <Step n={3} title={tx('الانتظار', 'Wait')} done={!errors.wait} hint={tx('إن تغيّر الوضع أثناء الانتظار (مثل شراء العميل) يُتخطّى التشغيل ويُسجَّل السبب.', 'If things change during the wait (e.g. the customer buys), the run is skipped and the reason logged.')}>
            <Field label={tx('ساعات قبل الإجراء', 'Hours before acting')} className="w-48" hint={tx('من 0 إلى 168', '0 to 168')} error={tried && errors.wait ? tx('من 0 إلى 168 ساعة', '0 to 168 hours') : null}>
              {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={String(a.waitHours)} onChange={(e) => edit({ waitHours: /^\d*$/.test(e.target.value) ? Number(e.target.value || 0) : a.waitHours })} />}
            </Field>
          </Step>

          <Step n={4} title={tx('الإجراءات', 'Actions')} done={!errors.actions} hint={isMessaging(a) ? tx('الرسائل للعملاء الموافقين فقط، ورسالة واحدة لكل سلة حتى لو طابقها مسار آخر.', 'Messages go to consenting customers only, one per cart even if another flow matches it.') : undefined}>
            <ul className="space-y-2">
              {TRIGGER_ACTIONS[a.trigger].map((x: ActionKind) => (
                <li key={x}><label className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors', a.actions.includes(x) ? 'border-brand-300 bg-brand-500/5 text-fg' : 'border-border text-muted hover:text-fg')}>
                  <Checkbox label={n.action(x)} checked={a.actions.includes(x)} onChange={(on) => edit({ actions: on ? [...a.actions, x] : a.actions.filter((y) => y !== x) })} />{n.action(x)}
                  {(x === 'sendEmail' || x === 'sendSms') && <Badge tone="amber" className="ms-auto">{tx('تكلفة رسائل', 'Message cost')}</Badge>}
                </label></li>
              ))}
            </ul>
            {tried && errors.actions && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{tx('اختر إجراءً واحدًا على الأقل', 'Choose at least one action')}</p>}
          </Step>
        </fieldset>

        <div className="min-w-0 space-y-6">
          <Card aria-labelledby="h-dry" aria-live="polite">
            <CardHeader id="h-dry" title={tx('تجربة آمنة', 'Dry run')} hint={tx('تُقيَّم المسار على أحداث عيّنة ثابتة. لا يُرسل شيء ولا تُنشأ مهام.', 'Evaluates the flow on fixed sample events. Nothing is sent and no tasks are created.')}
              action={canManage ? <Button variant="secondary" size="sm" onClick={runDry}><FlaskConical className="size-3.5" aria-hidden="true" />{tx('جرّب', 'Run')}</Button> : undefined} />
            <div className="space-y-3 px-5 pb-5">
              <p className="flex items-center gap-1.5 text-[13px]">
                {cur && cur.dryRunVersion === cur.version && !dirty
                  ? <><CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" /><span className="text-fg">{tx(`الإصدار ${version} جُرّب`, `Version ${version} tested`)}</span></>
                  : <><CircleDashed className="size-4 text-muted" aria-hidden="true" /><span className="text-muted">{dirty ? tx('غير محفوظ: التجربة لن تُحتسب للتفعيل', 'Unsaved: a run will not count toward activation') : tx(`الإصدار ${version} لم يُجرّب`, `Version ${version} not tested`)}</span></>}
              </p>
              {results && <DryResults rows={results.rows} actions={a.actions} counted={results.version !== null} />}
            </div>
          </Card>

          <Card aria-labelledby="h-log">
            <CardHeader id="h-log" title={tx('آخر التشغيلات', 'Recent runs')} action={myRuns.length ? <a href={ahref('', { tab: 'runs', automation: a.id })} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('السجل كاملًا', 'Full log')}</a> : undefined} />
            {myRuns.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">{tx('لم يعمل بعد.', 'Has not run yet.')}</p> : (
              <ul className="divide-y divide-border">
                {myRuns.map((r) => (
                  <li key={r.id} className="space-y-1 px-5 py-3">
                    <div className="flex items-center justify-between gap-2"><span className="text-[13px] font-medium text-fg">{r.subject[lang]}</span><Badge tone={R_TONE[r.outcome]} icon={<OutcomeIcon o={r.outcome} />}>{n.outcome(r.outcome)}</Badge></div>
                    <p className="text-xs text-muted">{r.reason[lang]}</p>
                    <p className="text-[11px] text-subtle">{r.when[lang]}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {editable && <SaveBar dirty={dirty} onSave={save} onDiscard={discard} saveLabel={isNew && !cur ? tx('احفظ مسودة', 'Save draft') : tx(`احفظ الإصدار ${version + 1}`, `Save version ${version + 1}`)}
        error={tried && nErr > 0 ? tx(`صحّح ${nErr} خطوات`, `Fix ${nErr} step(s)`) : undefined} />}

      {confirm === 'activate' && (
        <Modal title={tx(`تفعيل الإصدار ${version}`, `Activate version ${version}`)} onClose={() => setConfirm(null)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => setStatus('active')}>{tx('فعّل', 'Activate')}</Button></>}>
          <ul className="space-y-1.5 text-sm text-fg">
            <li>{tx('يعمل على الأحداث الجديدة من الآن فقط، بتوقيت الرياض.', 'Runs on new events from now on only, in Riyadh time.')}</li>
            {isMessaging(a) && <li>{tx('للرسائل تكلفة لدى مزود الإرسال؛ تُرسل للموافقين فقط ومرة لكل سلة.', 'Messages cost money at the provider; they go to consenting customers only, once per cart.')}</li>}
            <li>{tx('كل تشغيل يُسجَّل بنتيجته وسببه.', 'Every run is logged with its outcome and reason.')}</li>
          </ul>
          <Simulated />
        </Modal>
      )}
      {confirm === 'pause' && (
        <Modal title={tx('إيقاف الأتمتة', 'Pause this automation')} onClose={() => setConfirm(null)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => setStatus('paused')}>{tx('أوقف', 'Pause')}</Button></>}>
          <PauseList title={tx('يتوقف', 'Stops')} tone="ok" items={[tx('بدء تشغيلات جديدة.', 'New runs from starting.'), tx('التشغيلات في فترة الانتظار، قبل خطوتها التالية.', 'Runs in their wait period, before their next step.')]} />
          <PauseList title={tx('لا يتوقف', 'Does not stop')} tone="warn" items={[tx('ما سُلّم لمزود الإرسال قبل الإيقاف؛ لا يمكن استرجاعه.', 'Messages already handed to the provider; they cannot be recalled.'), tx('المهام التي أُنشئت؛ تبقى في قائمة الفريق.', 'Tasks already created; they stay on the team’s list.')]} />
          <p className="text-[13px] text-muted">{tx('يمكنك إعادة التفعيل لاحقًا بالإصدار نفسه دون تجربة جديدة.', 'You can reactivate later with the same version without a new dry run.')}</p>
        </Modal>
      )}
    </div>
  );
}

function Step({ n, title, done, hint, children }: { n: number; title: string; done: boolean; hint?: string; children: ReactNode }) {
  return (
    <Card>
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold', done ? 'bg-brand-600 text-white' : 'bg-surface-2 text-muted')} aria-hidden="true">{n}</span>
        <h2 className="flex flex-1 items-center gap-1.5 text-[15px] font-semibold text-fg">{title}{hint && <InfoHint>{hint}</InfoHint>}</h2>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </Card>
  );
}

function PauseList({ title, tone, items }: { title: string; tone: 'ok' | 'warn'; items: string[] }) {
  return (
    <div className={cn('rounded-xl border px-4 py-3', tone === 'ok' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/8')}>
      <p className="text-[13px] font-semibold text-fg">{title}</p>
      <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-fg">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}

function DryResults({ rows, actions, counted }: { rows: DryRow[]; actions: ActionKind[]; counted: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const s = dryRunSummary(rows);
  const skip = (k: NonNullable<DryRow['skip']>) => ({ condition: tx('شرط غير متحقق', 'Condition not met'), noConsent: tx('لا موافقة', 'No consent'), dedup: tx('رسالة سابقة للسلة نفسها', 'Already messaged for this cart') })[k];
  if (!rows.length) return <p className="text-sm text-muted">{tx('لا عيّنات لهذا الحدث.', 'No samples for this event.')}</p>;
  return (
    <>
      <p className="text-[13px] text-fg tabular-nums">{tx(`${s.act} من ${s.total} سينفّذ، ${s.total - s.act} يُتخطّى`, `${s.act} of ${s.total} would act, ${s.total - s.act} skipped`)}</p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.event.id} className="rounded-xl border border-border px-3 py-2.5">
            <p className="text-[13px] text-fg">{r.event.label[lang]}</p>
            <p className="mt-1">{r.skip === null
              ? <Badge tone="green">{tx('سينفّذ: ', 'Would: ')}{actions.map(n.action).join(tx('، ', ', '))}</Badge>
              : <Badge tone="gray">{tx('يُتخطّى: ', 'Skipped: ')}{skip(r.skip)}</Badge>}</p>
          </li>
        ))}
      </ul>
      {!counted && <p className="text-xs text-amber-700 dark:text-amber-300">{tx('احفظ ثم جرّب لتُحتسب للتفعيل.', 'Save, then run again for it to count.')}</p>}
    </>
  );
}
