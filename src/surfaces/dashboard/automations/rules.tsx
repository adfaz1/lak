// Operating rules: «when an order is created/paid and matches → assign, tag, set a sub-status, notify a member».
// List (`#/dashboard/automations?tab=rules`) and editor (`#/dashboard/automations/rules/<id>`, `rules/new`).
// A rule runs only when active; activation needs a test run on recent orders of the saved version. Every run is
// logged per order in the shared run log, with retry; the order's own log names the rule that changed it.
import { useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleDashed, FlaskConical, ListChecks, Pause, Play, Plus, SearchX, Trash2, XCircle, MinusCircle, ArrowUpRight } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, navigate } from '../../../core/router';
import { formatInt } from '../../../core/format';
import { can } from '../../merchant/perms';
import { CITIES, type Order } from '../../merchant/domain';
import { currentActor, logAction, ordersStore, productsStore, ruleCtx, rulesStore, runsStore, subStatusesStore, teamStore } from '../../merchant/stores';
import { RULE_ACTIONS, RULE_FIELDS, RULE_PAY_METHODS, SUB_PARENTS, runRule, validateRule, type OpRule, type RuleAction, type RuleActionKind, type RuleField, type RuleResult, type RuleTrigger } from '../../merchant/ops';
import { appendRuleRuns, type Run } from '../../merchant/growth';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, InfoHint, LinkButton, Ref, cn, useTx } from '../../../ds/ui';
import { Alert, Checkbox, DataTable, Field, Input, Modal, PageHeader, SaveBar, Select, Simulated, useToast, type Column } from '../../../ds/kit';
import { Locked, useRole } from '../marketing/access';
import { useUnsaved } from '../unsaved';
import { useSessionDraft } from '../settings/drafts';
import { useMainStateName } from '../orders/substatus-ui';
import { A_TONE, OutcomeIcon, R_TONE, ahref, useNames } from './names';
import { RuleSentence, useRuleNames } from './rule-names';
import { TEST_SAMPLE, addCond, blankAction, markTested, newRule, recentOrders, ruleBlock, sameRule, saveRule, testRun, testSummary, wouldChange, type TestRow } from './rules-model';
import { lastRun, runCounts } from './model';

export const rhref = (id = '') => ahref(`rules${id ? `/${id}` : ''}`);

/* ---------- List ---------- */

export function RulesList({ rules, runs, manage }: { rules: OpRule[]; runs: Run[]; manage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const rn = useRuleNames();
  const [toggle, setToggle] = useState<OpRule | null>(null);
  const cols: Column<OpRule>[] = [
    { key: 'n', header: tx('القاعدة', 'Rule'), cell: (r) => <span className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300" aria-hidden="true"><ListChecks className="size-5" /></span><span className="min-w-0"><span className="block font-semibold">{r.name[lang]}</span><span className="block max-w-xl text-xs font-normal text-muted"><RuleSentence r={r} compact /></span></span></span> },
    { key: 's', header: tx('الحالة', 'Status'), cell: (r) => <Badge tone={A_TONE[r.status]}>{n.status(r.status)}</Badge> },
    { key: 'l', header: tx('آخر تشغيل', 'Last run'), hideBelow: 'lg', cell: (r) => { const x = lastRun(runs, r.id); return x ? <span className="flex flex-wrap items-center gap-2"><Badge tone={R_TONE[x.outcome]} icon={<OutcomeIcon o={x.outcome} />}>{n.outcome(x.outcome)}</Badge><span className="text-xs text-muted">{x.when[lang]}</span></span> : <span className="text-xs text-muted">{tx('لم يعمل بعد', 'Not run yet')}</span>; } },
    { key: 'c', header: tx('نجح / فشل / تُخطّي', 'OK / failed / skipped'), hideBelow: 'lg', align: 'end', cell: (r) => { const c = runCounts(runs, r.id); return <a href={ahref('', { tab: 'runs', automation: r.id })} className="tabular-nums text-muted hover:text-fg"><span className="text-emerald-700 dark:text-emerald-400">{c.succeeded}</span> / <span className="text-red-700 dark:text-red-400">{c.failed}</span> / {c.skipped}</a>; } },
    { key: 'act', header: <span className="sr-only">{tx('إجراء', 'Action')}</span>, align: 'end', cell: (r) => (manage && (r.status === 'active' || ruleBlock(r, false) === null) ? <Button variant="secondary" size="sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setToggle(r); }}>{r.status === 'active' ? <><Pause className="size-3.5" aria-hidden="true" />{tx('أوقف', 'Pause')}</> : <><Play className="size-3.5" aria-hidden="true" />{tx('فعّل', 'Activate')}</>}</Button> : null) },
  ];
  return (
    <>
      <Card aria-labelledby="h-rules">
        <CardHeader id="h-rules" title={tx('قواعد التشغيل', 'Operating rules')} hint={tx('تعمل على الطلبات عند إنشائها أو دفعها: إسناد، وسوم، حالة فرعية، تنبيه عضو. بالترتيب من الأعلى.', 'They act on orders when created or paid: assign, tags, sub-status, alert a member. Top to bottom.')} />
        {rules.length === 0 ? (
          <EmptyState icon={<ListChecks className="size-6" aria-hidden="true" />} title={tx('لا قواعد بعد', 'No rules yet')}
            action={manage ? <LinkButton href={rhref('new')}>{tx('أنشئ قاعدة', 'Create a rule')}</LinkButton> : undefined}>
            {tx('مثال: طلبات جدة تُسند لفيصل وتُوسم «جدة».', 'Example: Jeddah orders go to Faisal, tagged “Jeddah”.')}
          </EmptyState>
        ) : (
          <div className="border-t border-border">
            <DataTable label={tx('قواعد التشغيل', 'Operating rules')} rows={rules} columns={cols} rowKey={(r) => r.id} href={(r) => rhref(r.id)}
              card={(r) => (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold text-fg">{r.name[lang]}</span><Badge tone={A_TONE[r.status]}>{n.status(r.status)}</Badge></div>
                  <p className="text-xs text-muted"><RuleSentence r={r} compact /></p>
                  <p className="text-xs text-muted">{rn.trigger(r.trigger)} · v{r.version}</p>
                </div>
              )} />
          </div>
        )}
        {!manage && <p className="border-t border-border px-5 py-3"><Locked>{tx('دورك يعرض القواعد فقط.', 'Your role can only view rules.')}</Locked></p>}
      </Card>
      {toggle && <ToggleModal r={toggle} onClose={() => setToggle(null)} />}
    </>
  );
}

function setRuleStatus(r: OpRule, st: OpRule['status']) {
  rulesStore.set((l) => l.map((x) => (x.id === r.id ? { ...x, status: st } : x)));
  logAction('marketing', st === 'active' ? { ar: `فعّل قاعدة التشغيل «${r.name.ar}» الإصدار ${r.version}`, en: `Activated operating rule “${r.name.en}” version ${r.version}` } : { ar: `أوقف قاعدة التشغيل «${r.name.ar}»`, en: `Paused operating rule “${r.name.en}”` }, { target: r.id });
}

/** Run a rule now on chosen current orders (activation «also apply now», or a retry). Writes orders and logs runs. */
function applyNow(r: OpRule, refs: string[], retryOf?: Run): RuleResult[] {
  const ctx = ruleCtx(); const now = Date.now(); const by = currentActor().name;
  let rr = r.rr;
  const results: RuleResult[] = [];
  const want = new Set(refs);
  const next = ordersStore.get().map((o) => {
    if (!want.has(o.ref)) return o;
    const res = runRule({ ...r, rr }, o, ctx, now);
    rr = res.rr; results.push(res);
    return res.order;
  });
  ordersStore.set(next);
  runsStore.set((runs) => appendRuleRuns(runs, results.map((x) => ({ ...x, rule: r.id })), { now, by, retryOf }).runs);
  if (rr !== r.rr) rulesStore.set((l) => l.map((x) => (x.id === r.id ? { ...x, rr } : x)));
  return results;
}

function ToggleModal({ r, rows, onClose }: { r: OpRule; rows?: TestRow[]; onClose: () => void }) {
  const tx = useTx();
  const toast = useToast();
  const pausing = r.status === 'active';
  const refs = rows ? wouldChange(rows) : [];
  const [apply, setApply] = useState(false);
  const subs = subStatusesStore.use();
  const notifying = subs.filter((x) => x.notify && r.actions.some((a) => a.kind === 'subStatus' && a.id === x.id));
  const go = () => {
    setRuleStatus(r, pausing ? 'paused' : 'active');
    let applied = 0;
    if (!pausing && apply && refs.length) {
      const res = applyNow({ ...r, status: 'active' }, refs);
      applied = res.filter((x) => x.outcome === 'succeeded').length;
      logAction('orders', { ar: `طُبّقت القاعدة «${r.name.ar}» على ${applied} طلب حالي`, en: `Rule “${r.name.en}” applied to ${applied} current orders` }, { target: refs.slice(0, 10).join(',') });
    }
    toast({ tone: 'ok', text: pausing ? tx('أُوقفت القاعدة', 'Rule paused') : applied ? tx(`فُعّلت وطُبّقت على ${applied} طلبًا`, `Activated and applied to ${applied} orders`) : tx('فُعّلت القاعدة', 'Rule activated') });
    onClose();
  };
  return (
    <Modal title={pausing ? tx(`إيقاف «${r.name.ar}»`, `Pause “${r.name.en}”`) : tx(`تفعيل «${r.name.ar}» الإصدار ${r.version}`, `Activate “${r.name.en}” version ${r.version}`)} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={go}>{pausing ? tx('أوقف', 'Pause') : apply && refs.length ? tx(`فعّل وطبّق على ${refs.length}`, `Activate and apply to ${refs.length}`) : tx('فعّل', 'Activate')}</Button></>}>
      <ul className="list-disc space-y-1.5 ps-5 text-sm text-fg">
        {pausing ? <>
          <li>{tx('لا تعمل على الطلبات الجديدة حتى تعيد تفعيلها.', 'It stops acting on new orders until you reactivate it.')}</li>
          <li>{tx('ما غيّرته في الطلبات يبقى كما هو.', 'What it already changed on orders stays.')}</li>
        </> : <>
          <li>{tx('تعمل على كل طلب يُنشأ أو يُدفع من الآن، من المتجر أو يدويًا.', 'Acts on every order created or paid from now, online or by hand.')}</li>
          <li>{tx('كل تشغيل يُسجّل لكل طلب، والقاعدة تظهر في سجل الطلب.', 'Every run is logged per order, and the rule shows in the order log.')}</li>
          {notifying.length > 0 && <li className="text-amber-800 dark:text-amber-200">{tx(`الحالة «${notifying.map((x) => x.name.ar).join('، ')}» تُبلغ العميل: تصله رسالة «تحديث على طلبك».`, `“${notifying.map((x) => x.name.en).join(', ')}” notifies the customer: they get “Update on your order”.`)} <Simulated /></li>}
        </>}
      </ul>
      {!pausing && refs.length > 0 && (
        <label className="mt-3 flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
          <Checkbox label={tx('طبّق على الطلبات الحالية', 'Apply to current orders')} checked={apply} onChange={setApply} />
          <span><span className="block font-medium text-fg">{tx(`طبّقها الآن على ${refs.length} طلبًا حاليًا`, `Also apply now to ${refs.length} current orders`)}</span><span className="block text-xs text-muted">{tx(`من آخر ${TEST_SAMPLE} طلبًا في التجربة، التي ستتغير فعلًا`, `From the last ${TEST_SAMPLE} orders in the test run, the ones that would change`)}</span></span>
        </label>
      )}
    </Modal>
  );
}

/* ---------- Editor ---------- */

export function RuleEditor({ id }: { id: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const rn = useRuleNames();
  const toast = useToast();
  const role = useRole();
  const rules = rulesStore.use();
  const runs = runsStore.use();
  const isNew = id === 'new';
  const stored = isNew ? undefined : rules.find((r) => r.id === id);
  const initial = useMemo(() => stored ?? newRule(rules, currentActor().name, Date.now()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [r, setR, clearDraft] = useSessionDraft<OpRule>(`automations.rule.${isNew ? 'new' : id}`, stored ?? initial);
  const [tried, setTried] = useState(false);
  const [rows, setRows] = useState<{ rows: TestRow[]; counted: boolean } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const cur = rules.find((x) => x.id === r.id);
  const dirty = isNew ? !cur && (!!r.name.ar || !!r.name.en || r.conds.length > 0 || r.actions.length > 0) : !!cur && !sameRule(r, cur);
  useUnsaved(dirty, { ar: 'تعديلات القاعدة', en: 'Rule edits' });

  if (!isNew && !stored) return (
    <Card><EmptyState as="h1" icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا توجد قاعدة بهذا المعرف', 'No rule with this id')}
      action={<LinkButton variant="secondary" href={ahref('', { tab: 'rules' })}>{tx('كل القواعد', 'All rules')}</LinkButton>}><bdi dir="ltr">{id}</bdi></EmptyState></Card>
  );

  const manage = can(role, 'automation.manage');
  const status = cur?.status ?? 'draft';
  const version = cur?.version ?? 1;
  const editable = manage && status !== 'active';
  const v = validateRule(r);
  const nErr = Object.keys(v.errors).length;
  const edit = (p: Partial<OpRule>) => { setR({ ...r, ...p }); setRows(null); };
  const block = ruleBlock(cur, dirty);
  const myRuns = runs.filter((x) => x.automation === r.id).slice(0, 6);

  const save = () => {
    setTried(true);
    if (nErr) return;
    const res = saveRule(rulesStore.get(), r, Date.now());
    rulesStore.set(res.list);
    clearDraft();
    setTried(false);
    logAction('marketing', { ar: `حفظ قاعدة التشغيل «${res.saved.name.ar}» الإصدار ${res.saved.version}`, en: `Saved operating rule “${res.saved.name.en}” version ${res.saved.version}` }, { target: res.saved.id });
    toast({ tone: 'ok', text: tx(`حُفظ الإصدار ${res.saved.version}. جرّبه قبل التفعيل.`, `Version ${res.saved.version} saved. Test it before activating.`) });
    if (isNew) navigate(rhref(res.saved.id));
  };
  const discard = () => { clearDraft(); setRows(null); setTried(false); };
  const runTest = () => {
    const now = Date.now();
    const out = testRun(r, recentOrders(ordersStore.get(), now), ruleCtx(), now);
    setRows({ rows: out, counted: !dirty && !!cur });
    if (!dirty && cur) rulesStore.set((l) => markTested(l, r.id));
  };
  const blockText = block === 'unsaved' ? tx('احفظ التغييرات أولًا', 'Save your changes first') : block === 'invalid' ? tx('صحّح الحقول أولًا', 'Fix the fields first') : block === 'needsTest' ? tx(`جرّب الإصدار ${version} على الطلبات الأخيرة أولًا`, `Test version ${version} on recent orders first`) : null;
  const primary = !manage ? null : status === 'active'
    ? <Button variant="secondary" onClick={() => setConfirm(true)}><Pause className="size-4" aria-hidden="true" />{tx('أوقف', 'Pause')}</Button>
    : <Button disabled={!!block} title={blockText ?? undefined} onClick={() => setConfirm(true)}><Play className="size-4" aria-hidden="true" />{tx(`فعّل الإصدار ${version}`, `Activate version ${version}`)}</Button>;

  return (
    <div className="space-y-6 pb-20">
      <PageHeader back={{ href: ahref('', { tab: 'rules' }), label: tx('قواعد التشغيل', 'Operating rules') }} title={r.name[lang] || tx('قاعدة بلا اسم', 'Untitled rule')}
        meta={<><Badge tone={A_TONE[status]}>{isNew && !cur ? tx('مسودة غير محفوظة', 'Unsaved draft') : n.status(status)}</Badge><span className="text-xs text-muted tabular-nums">{tx(`الإصدار ${version}`, `Version ${version}`)}</span></>}
        actions={primary} />
      {!manage && <Locked>{tx('دورك يعرض القاعدة فقط.', 'Your role can only view this rule.')}</Locked>}
      {manage && status === 'active' && <Alert tone="info" title={tx('القاعدة نشطة', 'This rule is active')}>{tx('أوقفها لتعديلها؛ كل تعديل إصدار جديد يحتاج تجربة.', 'Pause it to edit; each edit is a new version that needs a test.')}</Alert>}
      {manage && status !== 'active' && blockText && <p className="flex items-center gap-1.5 text-[13px] text-muted"><CircleDashed className="size-4" aria-hidden="true" />{tx('قبل التفعيل: ', 'Before activating: ')}{blockText}</p>}

      <Card aria-labelledby="h-plain">
        <div className="space-y-3 p-5">
          <h2 id="h-plain" className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">{tx('بكلمات بسيطة', 'In plain words')}<InfoHint>{tx('ما تفعله القاعدة كما هي الآن، قبل الحفظ أيضًا.', 'What the rule does as edited now, even before saving.')}</InfoHint></h2>
          <RuleSentence r={r} />
          <p className="text-[13px] text-muted">{tx('النتيجة: التغيير يظهر على الطلب (المسؤول، الوسوم، الحالة الفرعية) والقاعدة باسمها في سجل الطلب.', 'Result: changes show on the order (assignee, tags, sub-status), with the rule named in the order log.')}</p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <fieldset disabled={!editable} className="min-w-0 space-y-4 lg:col-span-2">
          <legend className="sr-only">{tx('خطوات القاعدة', 'Rule steps')}</legend>
          <Step n={1} title={tx('عندما', 'When')} done={!v.errors.name}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={tx('الاسم بالعربية', 'Arabic name')} error={tried && !r.name.ar.trim() ? tx('اكتب الاسم', 'Enter a name') : null}>
                {(p) => <Input {...p} dir="rtl" value={r.name.ar} onChange={(e) => edit({ name: { ...r.name, ar: e.target.value } })} placeholder="طلبات جدة إلى فيصل" />}
              </Field>
              <Field label={tx('الاسم بالإنجليزية', 'English name')} error={tried && !r.name.en.trim() ? tx('اكتب الاسم', 'Enter a name') : null}>
                {(p) => <Input {...p} dir="ltr" value={r.name.en} onChange={(e) => edit({ name: { ...r.name, en: e.target.value } })} placeholder="Jeddah orders to Faisal" />}
              </Field>
              <Field label={tx('يبدأ عندما', 'Starts when')} className="sm:col-span-2" hint={r.trigger === 'orderPaid' ? tx('بعد تأكيد الدفع، أو تحصيل الدفع عند الاستلام', 'After payment is confirmed, or cash on delivery collected') : tx('فور وصول الطلب، مدفوعًا أو لا', 'As soon as the order arrives, paid or not')}>
                {(p) => <Select {...p} value={r.trigger} onChange={(e) => edit({ trigger: e.target.value as RuleTrigger })}>{(['orderCreated', 'orderPaid'] as RuleTrigger[]).map((t) => <option key={t} value={t}>{rn.trigger(t)}</option>)}</Select>}
              </Field>
            </div>
          </Step>
          <Step n={2} title={tx('إذا', 'If')} done={!v.errors.conds} hint={tx('كل الشروط يجب أن تتحقق. بلا شروط تعمل على كل طلب.', 'All conditions must hold. With none it acts on every order.')}>
            <Conditions r={r} edit={edit} bad={tried ? v.badConds : []} />
          </Step>
          <Step n={3} title={tx('افعل', 'Do')} done={!v.errors.actions && !v.errors.tooManyTags} hint={tx('تُنفّذ بالترتيب. ما هو مطبّق أصلًا يُترك ويُذكر في السجل.', 'Run in order. What is already in place is left and noted in the log.')}>
            <Actions r={r} edit={edit} bad={tried ? v.badActions : []} />
            {tried && v.errors.actions && !r.actions.length && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{tx('أضف إجراءً واحدًا على الأقل', 'Add at least one action')}</p>}
            {v.errors.tooManyTags && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{tx('حتى 10 وسوم في القاعدة', 'Up to 10 tags per rule')}</p>}
          </Step>
        </fieldset>

        <div className="min-w-0 space-y-6">
          <Card aria-labelledby="h-test" aria-live="polite">
            <CardHeader id="h-test" title={tx('تجربة على الطلبات الأخيرة', 'Test on recent orders')} hint={tx(`تُقيَّم القاعدة على آخر ${TEST_SAMPLE} طلبًا كأن كلًّا منها وصل الآن. لا يتغير شيء.`, `Evaluates the rule on the last ${TEST_SAMPLE} orders as if each had just arrived. Nothing changes.`)}
              action={manage ? <Button variant="secondary" size="sm" disabled={nErr > 0} onClick={runTest}><FlaskConical className="size-3.5" aria-hidden="true" />{tx('جرّب', 'Test')}</Button> : undefined} />
            <div className="space-y-3 px-5 pb-5">
              <p className="flex items-center gap-1.5 text-[13px]">
                {cur && cur.testedVersion === cur.version && !dirty
                  ? <><CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" /><span className="text-fg">{tx(`الإصدار ${version} جُرّب`, `Version ${version} tested`)}</span></>
                  : <><CircleDashed className="size-4 text-muted" aria-hidden="true" /><span className="text-muted">{dirty || !cur ? tx('غير محفوظ: التجربة لا تُحتسب للتفعيل', 'Unsaved: a test will not count toward activation') : tx(`الإصدار ${version} لم يُجرّب`, `Version ${version} not tested`)}</span></>}
              </p>
              {nErr > 0 && <p className="text-xs text-muted">{tx('أكمل الحقول لتجربتها.', 'Complete the fields to test it.')}</p>}
              {rows && <TestResults rows={rows.rows} counted={rows.counted} />}
            </div>
          </Card>

          <Card aria-labelledby="h-rlog">
            <CardHeader id="h-rlog" title={tx('سجل التشغيل', 'Run log')} action={myRuns.length ? <a href={ahref('', { tab: 'runs', automation: r.id })} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('السجل كاملًا', 'Full log')}</a> : undefined} />
            {myRuns.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">{tx('لم تعمل بعد.', 'Has not run yet.')}</p> : (
              <ul className="divide-y divide-border">
                {myRuns.map((x) => (
                  <li key={x.id} className="space-y-1 px-5 py-3">
                    <div className="flex items-center justify-between gap-2"><a href={ahref('', { tab: 'runs', run: x.id })} className="text-[13px] font-medium text-fg hover:text-brand-700">{x.subject[lang]}</a><Badge tone={R_TONE[x.outcome]} icon={<OutcomeIcon o={x.outcome} />}>{n.outcome(x.outcome)}</Badge></div>
                    <p className="text-xs text-muted">{x.reason[lang]}</p>
                    <p className="text-[11px] text-subtle">{x.when[lang]}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {editable && <SaveBar dirty={dirty} onSave={save} onDiscard={discard} saveLabel={isNew && !cur ? tx('احفظ مسودة', 'Save draft') : tx(`احفظ الإصدار ${version + 1}`, `Save version ${version + 1}`)}
        error={tried && nErr > 0 ? tx(`صحّح ${nErr} خطوات`, `Fix ${nErr} step(s)`) : undefined} />}
      {confirm && cur && <ToggleModal r={cur} rows={rows?.counted ? rows.rows : undefined} onClose={() => setConfirm(false)} />}
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

function Conditions({ r, edit, bad }: { r: OpRule; edit: (p: Partial<OpRule>) => void; bad: number[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const rn = useRuleNames();
  const products = productsStore.use();
  const [field, setField] = useState<RuleField>('city');
  const setC = (i: number, value: string) => edit({ conds: r.conds.map((c, j) => (j === i ? { ...c, value } : c)) });
  return (
    <>
      {r.conds.length === 0 && <p className="text-sm text-muted">{tx('بلا شروط: تعمل على كل طلب.', 'No conditions: acts on every order.')}</p>}
      <ul className="space-y-3">
        {r.conds.map((c, i) => (
          <li key={i} className="flex flex-wrap items-end gap-3 rounded-xl bg-surface-2/60 p-3">
            <span className="min-w-28 pb-2.5 text-[13px] font-semibold text-fg">{rn.field(c.field)}</span>
            <Field label={tx('القيمة', 'Value')} className="min-w-40 flex-1" error={bad.includes(i) ? (c.field === 'totalMin' || c.field === 'totalMax' ? tx('رقم صحيح', 'A whole number') : tx('اختر قيمة', 'Pick a value')) : null}>
              {(p) => c.field === 'city' ? <Select {...p} value={c.value} onChange={(e) => setC(i, e.target.value)}>{CITIES.map((x) => <option key={x.en} value={x.en}>{x[lang]}</option>)}</Select>
                : c.field === 'channel' ? <Select {...p} value={c.value} onChange={(e) => setC(i, e.target.value)}>{['online', 'market', 'app'].map((x) => <option key={x} value={x}>{rn.channel(x)}</option>)}</Select>
                  : c.field === 'payMethod' ? <Select {...p} value={c.value} onChange={(e) => setC(i, e.target.value)}>{RULE_PAY_METHODS.map((x) => <option key={x} value={x}>{rn.method(x)}</option>)}</Select>
                    : c.field === 'product' ? <Select {...p} value={c.value} onChange={(e) => setC(i, e.target.value)}><option value="">{tx('اختر منتجًا', 'Pick a product')}</option>{products.map((x) => <option key={x.id} value={x.id}>{x.name[lang]}</option>)}</Select>
                      : <Input {...p} dir="ltr" inputMode="numeric" value={c.value} onChange={(e) => setC(i, e.target.value.trim())} />}
            </Field>
            <IconButton label={tx('احذف الشرط', 'Remove condition')} onClick={() => edit({ conds: r.conds.filter((_, j) => j !== i) })}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label={tx('شرط جديد', 'New condition')} className="w-56">
          {(p) => <Select {...p} value={field} onChange={(e) => setField(e.target.value as RuleField)}>{RULE_FIELDS.map((f) => <option key={f} value={f}>{rn.field(f)}</option>)}</Select>}
        </Field>
        <Button variant="secondary" onClick={() => edit(addCond(r, field, products[0]?.id ?? ''))}><Plus className="size-3.5" aria-hidden="true" />{tx('أضف شرطًا', 'Add condition')}</Button>
      </div>
    </>
  );
}

function Actions({ r, edit, bad }: { r: OpRule; edit: (p: Partial<OpRule>) => void; bad: number[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const rn = useRuleNames();
  const state = useMainStateName();
  const members = teamStore.use().members;
  const subs = subStatusesStore.use().filter((s) => !s.archived);
  const orders = ordersStore.use();
  const tags = useMemo(() => [...new Set(orders.flatMap((o) => o.tags ?? []))].sort(), [orders]);
  const [kind, setKind] = useState<RuleActionKind>('assign');
  const setA = (i: number, a: RuleAction) => edit({ actions: r.actions.map((x, j) => (j === i ? a : x)) });
  const active = members.filter((m) => m.status === 'active');
  return (
    <>
      {r.actions.length === 0 && <p className="text-sm text-muted">{tx('لا إجراءات بعد.', 'No actions yet.')}</p>}
      <ul className="space-y-3">
        {r.actions.map((a, i) => (
          <li key={i} className={cn('space-y-2 rounded-xl border p-3', bad.includes(i) ? 'border-red-500/50' : 'border-border')}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-fg">{i + 1}. {rn.kind(a.kind)}</span>
              <IconButton label={tx('احذف الإجراء', 'Remove action')} onClick={() => edit({ actions: r.actions.filter((_, j) => j !== i) })}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
            </div>
            {a.kind === 'assign' && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => {
                    const on = a.members.includes(m.name);
                    return (
                      <label key={m.id} className={cn('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[13px]', on ? 'border-brand-300 bg-brand-500/5 text-fg' : 'border-border text-muted')}>
                        <Checkbox label={m.name} checked={on} onChange={(v) => setA(i, { ...a, members: v ? [...a.members, m.name] : a.members.filter((x) => x !== m.name) })} />{m.name}
                        {m.status !== 'active' && <Badge tone="amber">{tx('غير نشط', 'Not active')}</Badge>}
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted">{a.members.length > 1 ? tx('بالتناوب: كل طلب للعضو التالي، ويُتخطّى غير النشط.', 'In turn: each order goes to the next member; inactive members are skipped.') : tx('اختر عضوًا، أو أكثر للتناوب.', 'Pick a member, or several to take turns.')}</p>
                {bad.includes(i) && <p className="text-xs font-medium text-red-600 dark:text-red-400">{tx('اختر عضوًا واحدًا على الأقل', 'Pick at least one member')}</p>}
              </div>
            )}
            {(a.kind === 'tagAdd' || a.kind === 'tagRemove') && (
              <Field label={tx('الوسم', 'Tag')} hint={tx('حتى 24 حرفًا', 'Up to 24 characters')} error={bad.includes(i) ? tx('اكتب الوسم', 'Enter a tag') : null}>
                {(p) => <><Input {...p} list={`rule-tags-${i}`} maxLength={24} value={a.tag} onChange={(e) => setA(i, { ...a, tag: e.target.value })} placeholder="VIP" /><datalist id={`rule-tags-${i}`}>{tags.map((t) => <option key={t} value={t} />)}</datalist></>}
              </Field>
            )}
            {a.kind === 'subStatus' && (
              <Field label={tx('الحالة الفرعية', 'Sub-status')} hint={<a href={link('/dashboard/settings/order-statuses')} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('أدر الحالات', 'Manage statuses')}</a>} error={bad.includes(i) ? tx('اختر حالة', 'Pick a status') : null}>
                {(p) => <Select {...p} value={a.id} onChange={(e) => setA(i, { ...a, id: e.target.value })}>
                  <option value="">{tx('اختر', 'Choose')}</option>
                  {SUB_PARENTS.map((pa) => <optgroup key={pa} label={state(pa)}>{subs.filter((s) => s.parent === pa).map((s) => <option key={s.id} value={s.id}>{s.name[lang]}</option>)}</optgroup>)}
                </Select>}
              </Field>
            )}
            {a.kind === 'subStatus' && a.id && <p className="text-xs text-muted">{tx(`تُضبط فقط إن كان الطلب «${state(subs.find((s) => s.id === a.id)?.parent ?? '')}»؛ غير ذلك يُترك ويُسجّل السبب.`, `Set only when the order is “${state(subs.find((s) => s.id === a.id)?.parent ?? '')}”; otherwise left, with the reason logged.`)}</p>}
            {a.kind === 'notifyMember' && (
              <Field label={tx('العضو', 'Member')} hint={tx('تنبيه داخل اللوحة؛ لا يصل العميل شيء', 'In-app alert; nothing reaches the customer')} error={bad.includes(i) ? tx('اختر عضوًا', 'Pick a member') : null}>
                {(p) => <Select {...p} value={a.member} onChange={(e) => setA(i, { ...a, member: e.target.value })}><option value="">{tx('اختر', 'Choose')}</option>{members.map((m) => <option key={m.id} value={m.name}>{m.name}{m.status !== 'active' ? tx(' (غير نشط)', ' (not active)') : ''}</option>)}</Select>}
              </Field>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label={tx('إجراء جديد', 'New action')} className="w-56">
          {(p) => <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as RuleActionKind)}>{RULE_ACTIONS.map((k) => <option key={k} value={k}>{rn.kind(k)}</option>)}</Select>}
        </Field>
        <Button variant="secondary" onClick={() => edit({ actions: [...r.actions, blankAction(kind, { member: active[0]?.name, sub: subs[0]?.id })] })}><Plus className="size-3.5" aria-hidden="true" />{tx('أضف إجراءً', 'Add action')}</Button>
      </div>
    </>
  );
}

function ChangeIcon({ s }: { s: string }) {
  const I = s === 'done' ? CheckCircle2 : s === 'failed' ? XCircle : MinusCircle;
  return <I className={cn('mt-0.5 size-3.5 shrink-0', s === 'done' ? 'text-emerald-600' : s === 'failed' ? 'text-red-600' : 'text-muted')} aria-hidden="true" />;
}
export function ChangeList({ changes }: { changes: { text: { ar: string; en: string }; status: string; why?: { ar: string; en: string } }[] }) {
  const { lang } = useLang();
  return (
    <ul className="space-y-1">
      {changes.map((c, i) => <li key={i} className="flex items-start gap-1.5 text-[13px]"><ChangeIcon s={c.status} /><span className={c.status === 'done' ? 'text-fg' : 'text-muted'}>{c.text[lang]}{c.why && <span className={cn('block text-xs', c.status === 'failed' ? 'text-red-700 dark:text-red-400' : 'text-muted')}>{c.why[lang]}</span>}</span></li>)}
    </ul>
  );
}

function TestResults({ rows, counted }: { rows: TestRow[]; counted: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const s = testSummary(rows);
  const [all, setAll] = useState(false);
  const hit = rows.filter((x) => x.result.changes.length > 0);
  const shown = all ? hit : hit.slice(0, 8);
  return (
    <>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-border px-2 py-2"><dt className="text-[11px] text-muted">{tx('يطابق', 'Match')}</dt><dd className="text-lg font-semibold tabular-nums text-fg">{formatInt(hit.length)}<span className="text-xs font-normal text-muted">/{s.total}</span></dd></div>
        <div className="rounded-xl border border-border px-2 py-2"><dt className="text-[11px] text-muted">{tx('سيتغير', 'Would change')}</dt><dd className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{formatInt(s.change)}</dd></div>
        <div className="rounded-xl border border-border px-2 py-2"><dt className="text-[11px] text-muted">{tx('سيفشل', 'Would fail')}</dt><dd className={cn('text-lg font-semibold tabular-nums', s.failed ? 'text-red-700 dark:text-red-400' : 'text-fg')}>{formatInt(s.failed)}</dd></div>
      </dl>
      {hit.length === 0 ? <p className="text-sm text-muted">{tx(`لا طلب من آخر ${s.total} يطابق الشروط.`, `None of the last ${s.total} orders match.`)}</p> : (
        <ul className="space-y-2">
          {shown.map((x) => (
            <li key={x.order.ref} className="space-y-1.5 rounded-xl border border-border px-3 py-2.5">
              <a href={link(`/dashboard/orders/${x.order.ref}`)} className="flex items-center justify-between gap-2 text-[13px] font-medium text-fg hover:text-brand-700"><span><Ref>#{x.order.ref}</Ref> · {x.order.customer[lang]}</span><ArrowUpRight className="size-3.5 text-muted rtl:-scale-x-100" aria-hidden="true" /></a>
              <ChangeList changes={x.result.changes} />
            </li>
          ))}
        </ul>
      )}
      {hit.length > 8 && <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>{all ? tx('اعرض أقل', 'Show less') : tx(`اعرض الكل (${hit.length})`, `Show all (${hit.length})`)}</Button>}
      <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('معاينة فقط', 'Preview only')}</p>
      {!counted && <p className="text-xs text-amber-700 dark:text-amber-300">{tx('احفظ ثم جرّب لتُحتسب للتفعيل.', 'Save, then test again for it to count.')}</p>}
    </>
  );
}

/* ---------- One rule run (in the shared run log) ---------- */

export function RuleRunBody({ run }: { run: Run }) {
  const tx = useTx();
  const { lang } = useLang();
  const rules = rulesStore.use();
  const rule = rules.find((x) => x.id === run.automation);
  return (
    <>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-border px-3 py-2.5"><dt className="text-xs text-muted">{tx('القاعدة', 'Rule')}</dt><dd className="mt-0.5 font-semibold"><a href={rhref(run.automation)} className="text-fg hover:text-brand-700">{rule?.name[lang] ?? run.automation}</a></dd></div>
        <div className="rounded-xl border border-border px-3 py-2.5"><dt className="text-xs text-muted">{tx('الطلب', 'Order')}</dt><dd className="mt-0.5 font-semibold"><a href={link(`/dashboard/orders/${run.order}`)} className="text-fg hover:text-brand-700"><Ref>#{run.order}</Ref></a></dd></div>
      </dl>
      <section aria-labelledby="h-chg">
        <h3 id="h-chg" className="mb-2 text-sm font-semibold text-fg">{tx('ما تغيّر', 'What changed')}</h3>
        {run.changes?.length ? <ChangeList changes={run.changes} /> : <p className="text-sm text-muted">{tx('لا تغييرات.', 'No changes.')}</p>}
      </section>
    </>
  );
}

/** Retry a failed rule run: the rule runs again on the order as it is now (e.g. after a member is reactivated). */
export function RuleRetryModal({ run, onClose }: { run: Run; onClose: (newId?: string) => void }) {
  const tx = useTx();
  const toast = useToast();
  const rules = rulesStore.use();
  const rule = rules.find((x) => x.id === run.automation);
  const o: Order | undefined = ordersStore.use().find((x) => x.ref === run.order);
  const preview = rule && o ? runRule(rule, o, ruleCtx(), Date.now()) : null;
  const go = () => {
    if (!rule || !o) { onClose(); return; }
    const [res] = applyNow(rule, [o.ref], run);
    const added = runsStore.get()[0];
    logAction('marketing', { ar: `أعاد تشغيل القاعدة «${rule.name.ar}» على الطلب ${o.ref}`, en: `Retried rule “${rule.name.en}” on order ${o.ref}` }, { target: added?.id, after: res?.outcome });
    toast({ tone: res?.outcome === 'failed' ? 'bad' : 'ok', text: res?.outcome === 'succeeded' ? tx('نجحت إعادة المحاولة', 'The retry succeeded') : res?.outcome === 'failed' ? tx('فشلت مجددًا', 'It failed again') : tx('لا شيء يتغير الآن', 'Nothing to change now') });
    onClose(added?.id);
  };
  return (
    <Modal title={tx(`إعادة تشغيل ${run.id}`, `Retry ${run.id}`)} onClose={() => onClose()}
      footer={<><Button variant="secondary" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={!preview} onClick={go}>{tx('أعد التشغيل', 'Retry')}</Button></>}>
      {!rule || !o ? <Alert tone="warn">{tx('القاعدة أو الطلب لم يعد موجودًا.', 'The rule or the order no longer exists.')}</Alert> : (
        <div className="space-y-3">
          <p className="text-sm text-fg">{tx('تعمل القاعدة على الطلب كما هو الآن. هذا ما سيحدث:', 'The rule runs on the order as it is now. This is what would happen:')}</p>
          {preview && <ChangeList changes={preview.changes} />}
          {preview?.outcome === 'failed' && <Alert tone="warn">{tx('سيفشل مجددًا: عالج السبب أولًا (فعّل العضو أو عدّل القاعدة).', 'It will fail again: fix the cause first (reactivate the member or edit the rule).')}</Alert>}
          <p className="text-xs text-muted">{tx('يُسجَّل تشغيلًا جديدًا مرتبطًا بالأصلي.', 'Logged as a new run linked to the original.')}</p>
        </div>
      )}
    </Modal>
  );
}
