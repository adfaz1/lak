import { useState } from 'react';
import type { Route } from '../../core/router';
import { navigate } from '../../core/router';
import { Alert, Badge, Dialog, Field, LinkTabs, PageHeader, type Tone } from '../../core/ui';
import {
  TEMPLATES, TRIGGER_ACTIONS, TRIGGER_FIELDS, canActivate, dryRun,
  type ActionKind, type AutoStatus, type Automation, type CondField, type RunOutcome, type Trigger,
} from './growth';
import { can } from './perms';
import { automationsStore, runsStore, testStore } from './stores';
import { ActionLocked, DataTable, mhref, useL, useTx, type Col } from './kit';

const A_TONE: Record<AutoStatus, Tone> = { active: 'success', paused: 'warning', draft: 'neutral' };
const R_TONE: Record<RunOutcome, Tone> = { succeeded: 'success', failed: 'danger', skipped: 'neutral' };

function useNames() {
  const tx = useTx();
  return {
    status: (s: AutoStatus) => ({ active: tx('نشطة', 'Active'), paused: tx('موقوفة', 'Paused'), draft: tx('مسودة', 'Draft') })[s],
    trigger: (t: Trigger) => ({ cartAbandoned: tx('سلة متروكة', 'Cart abandoned'), lowStock: tx('مخزون منخفض', 'Low stock'), orderLate: tx('طلب متأخر في التجهيز', 'Order late to fulfil') })[t],
    field: (f: CondField) => ({ cartValue: tx('قيمة السلة ≥ (ر.س)', 'Cart value ≥ (SAR)'), stockBelow: tx('المتاح ≤', 'Available ≤'), hoursLate: tx('ساعات التأخير ≥', 'Hours late ≥'), channel: tx('القناة =', 'Channel =') })[f],
    action: (a: ActionKind) => ({ sendEmail: tx('أرسل بريدًا للعميل الموافق', 'Email the consenting customer'), sendSms: tx('أرسل رسالة نصية للعميل الموافق', 'SMS the consenting customer'), createTask: tx('أنشئ مهمة للفريق', 'Create a team task'), notifyStaff: tx('نبّه موظف التجهيز', 'Alert fulfilment staff') })[a],
    outcome: (o: RunOutcome) => ({ succeeded: tx('نجح', 'Succeeded'), failed: tx('فشل', 'Failed'), skipped: tx('تُخطّي', 'Skipped') })[o],
  };
}

export function AutomationsPage({ route }: { route: Route }) {
  if (route.path[1]) return <Builder key={route.path[1] + (route.query.get('tpl') ?? '')} id={route.path[1]} tpl={route.query.get('tpl')} />;
  return <List route={route} />;
}

function List({ route }: { route: Route }) {
  const tx = useTx();
  const l = useL();
  const n = useNames();
  const autos = automationsStore.use();
  const runs = runsStore.use();
  const role = testStore.use().role;
  const tab = route.query.get('tab') === 'runs' ? 'runs' : 'flows';
  const oq = route.query.get('outcome') as RunOutcome | null;
  const outcome = oq && ['succeeded', 'failed', 'skipped'].includes(oq) ? oq : null;
  const shown = runs.filter((r) => !outcome || r.outcome === outcome);
  type Rn = (typeof runs)[number];
  const cols: Col<Rn>[] = [
    { key: 'w', head: tx('الوقت', 'When'), cell: (r) => l(r.when) },
    { key: 'a', head: tx('الأتمتة', 'Automation'), cell: (r) => <a href={mhref(`automations/${r.automation}`)}>{l(autos.find((a) => a.id === r.automation)?.name ?? { ar: r.automation, en: r.automation })}</a> },
    { key: 's', head: tx('العنصر', 'Subject'), cell: (r) => l(r.subject) },
    { key: 'o', head: tx('النتيجة', 'Outcome'), cell: (r) => <Badge tone={R_TONE[r.outcome]}>{n.outcome(r.outcome)}</Badge> },
    { key: 'r', head: tx('السبب', 'Reason'), cell: (r) => <span className="small">{l(r.reason)}</span> },
  ];
  return (
    <>
      <PageHeader title={tx('الأتمتة', 'Automations')} sub={tx('حدث ← شروط ← انتظار ← إجراءات. القالب لا يعمل حتى تراجعه وتجربه وتفعّله.', 'Event → conditions → wait → actions. A template does nothing until you review, dry-run and activate it.')} />
      <LinkTabs label={tx('أقسام الأتمتة', 'Automation sections')} items={[{ href: mhref('automations'), label: tx('المسارات', 'Flows'), current: tab === 'flows' }, { href: mhref('automations', { tab: 'runs' }), label: tx('سجل التشغيل', 'Run log'), current: tab === 'runs' }]} />
      {tab === 'flows' ? (
        <>
          <section className="card" aria-labelledby="au-h">
            <div className="card-head"><h2 id="au-h">{tx('مساراتك', 'Your flows')}</h2></div>
            <ul className="queue">
              {autos.map((a) => (
                <li key={a.id}>
                  <div className="grow"><div className="strong">{l(a.name)} <Badge tone={A_TONE[a.status]}>{n.status(a.status)}</Badge></div>
                    <div className="small muted">{n.trigger(a.trigger)} · {tx(`الإصدار ${a.version}`, `Version ${a.version}`)} · {tx('المالك', 'Owner')}: {l(a.owner)}</div></div>
                  <a className="btn small" href={mhref(`automations/${a.id}`)}>{tx('فتح', 'Open')}</a>
                </li>
              ))}
            </ul>
          </section>
          <section className="card" aria-labelledby="tp-h">
            <div className="card-head"><h2 id="tp-h">{tx('ابدأ من قالب', 'Start from a template')}</h2></div>
            <ul className="queue">
              {TEMPLATES.map((t) => (
                <li key={t.id}><div className="grow"><div className="strong">{l(t.name)}</div><div className="small muted">{n.trigger(t.trigger)} → {t.actions.map(n.action).join('، ')}</div></div>
                  {can(role, 'automation.manage') ? <a className="btn small" href={mhref('automations/new', { tpl: t.id })}>{tx('استخدم القالب', 'Use template')}</a> : <ActionLocked>{tx('للقراءة فقط', 'Read-only')}</ActionLocked>}</li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <>
          <div className="views" role="group" aria-label={tx('النتيجة', 'Outcome')}>
            <a className="chip" href={mhref('automations', { tab: 'runs' })} aria-current={!outcome ? 'true' : undefined}>{tx('الكل', 'All')} · {runs.length}</a>
            {(['succeeded', 'failed', 'skipped'] as RunOutcome[]).map((o) => <a key={o} className="chip" href={mhref('automations', { tab: 'runs', outcome: o })} aria-current={outcome === o ? 'true' : undefined}>{n.outcome(o)} · {runs.filter((r) => r.outcome === o).length}</a>)}
          </div>
          <div className="card">
            <DataTable label={tx('سجل التشغيل', 'Run log')} cols={cols} rows={shown} rowKey={(r) => r.id}
              mobile={(r) => <div className="m-rowcard-main"><span className="m-rowcard-top"><span className="strong">{l(r.subject)}</span><Badge tone={R_TONE[r.outcome]}>{n.outcome(r.outcome)}</Badge></span><span className="small">{l(r.reason)}</span><span className="small muted">{l(r.when)}</span></div>}
              empty={<div className="empty">{tx('لا تشغيلات بهذه النتيجة.', 'No runs with this outcome.')}</div>} />
          </div>
        </>
      )}
    </>
  );
}

function Builder({ id, tpl }: { id: string; tpl: string | null }) {
  const tx = useTx();
  const l = useL();
  const n = useNames();
  const autos = automationsStore.use();
  const role = testStore.use().role;
  const stored = autos.find((a) => a.id === id);
  const template = TEMPLATES.find((t) => t.id === tpl) ?? TEMPLATES[0];
  const [a, setA] = useState<Automation>(() => stored ?? { ...template, id: `AU-${13 + autos.length}`, status: 'draft', version: 1, dryRunVersion: null, conditions: template.conditions.map((c) => ({ ...c })) });
  const [dirty, setDirty] = useState(id === 'new');
  const [results, setResults] = useState<ReturnType<typeof dryRun> | null>(null);
  const [confirm, setConfirm] = useState<'activate' | 'pause' | null>(null);
  const back = <a className="back" href={mhref('automations')}>{tx('العودة إلى الأتمتة', 'Back to automations')}</a>;
  if (id !== 'new' && !stored) return <>{back}<Alert tone="danger">{tx('لا توجد أتمتة بهذا المعرف.', 'No automation with this id.')}</Alert></>;
  const canManage = can(role, 'automation.manage');
  const cur = autos.find((x) => x.id === a.id) ?? a;
  const editable = canManage && cur.status !== 'active';
  const edit = (p: Partial<Automation>) => { setA({ ...a, ...p }); setDirty(true); setResults(null); };
  const save = () => {
    const next = { ...a, version: stored || autos.some((x) => x.id === a.id) ? cur.version + 1 : 1, status: cur.status === 'active' ? 'paused' as const : cur.status };
    automationsStore.set((as) => (as.some((x) => x.id === next.id) ? as.map((x) => (x.id === next.id ? next : x)) : [next, ...as]));
    setA(next);
    setDirty(false);
    if (id === 'new') navigate(mhref(`automations/${next.id}`));
  };
  const runDry = () => {
    setResults(dryRun(a));
    if (!dirty) { automationsStore.set((as) => as.map((x) => (x.id === a.id ? { ...x, dryRunVersion: x.version } : x))); }
  };
  const setStatus = (status: AutoStatus) => { automationsStore.set((as) => as.map((x) => (x.id === a.id ? { ...x, status } : x))); setConfirm(null); };
  const activateReason = dirty ? tx('احفظ التغييرات أولًا.', 'Save your changes first.') : !canActivate(cur) ? tx(`جرّب الإصدار ${cur.version} تجربة آمنة قبل التفعيل.`, `Dry-run version ${cur.version} before activating.`) : null;
  const fields = TRIGGER_FIELDS[a.trigger];
  return (
    <>
      {back}
      <div className="title-row"><h1>{l(a.name)}</h1><Badge tone={A_TONE[cur.status]}>{n.status(cur.status)}</Badge><span className="pill">{tx(`الإصدار ${cur.version}`, `Version ${cur.version}`)}</span></div>
      {!canManage && <ActionLocked>{tx('دورك لا يشمل إدارة الأتمتة.', 'Your role does not include managing automations.')}</ActionLocked>}
      {cur.status === 'active' && canManage && <Alert tone="info">{tx('المسار نشط. أوقفه لتعديله؛ أي تعديل يُنشئ إصدارًا جديدًا يحتاج تجربة آمنة قبل إعادة التفعيل.', 'The flow is active. Pause it to edit; any edit creates a new version that needs a dry run before reactivation.')}</Alert>}
      <fieldset disabled={!editable} className="m-editor">
        <ol className="m-flow">
          <li className="card pad">
            <h2>1. {tx('الحدث', 'Event')}</h2>
            <Field id="au-name-ar" label={tx('الاسم', 'Name')}><input id="au-name-ar" className="input" value={l(a.name)} onChange={(e) => edit({ name: { ...a.name, ar: e.target.value, en: e.target.value } })} /></Field>
            <Field id="au-trg" label={tx('يبدأ عندما', 'Starts when')}>
              <select id="au-trg" className="input" value={a.trigger} onChange={(e) => { const t = e.target.value as Trigger; edit({ trigger: t, conditions: [], actions: [TRIGGER_ACTIONS[t][0]] }); }}>
                {(Object.keys(TRIGGER_FIELDS) as Trigger[]).map((t) => <option key={t} value={t}>{n.trigger(t)}</option>)}
              </select>
            </Field>
          </li>
          <li className="card pad">
            <h2>2. {tx('الشروط', 'Conditions')}</h2>
            {a.conditions.length === 0 && <p className="small muted">{tx('بلا شروط: يعمل لكل حدث.', 'No conditions: runs for every event.')}</p>}
            {a.conditions.map((c, i) => (
              <div key={i} className="m-row-fields">
                <Field id={`au-cf-${i}`} label={tx('الحقل', 'Field')}><select id={`au-cf-${i}`} className="input" value={c.field} onChange={(e) => edit({ conditions: a.conditions.map((x, j) => (j === i ? { ...x, field: e.target.value as CondField } : x)) })}>{fields.map((f) => <option key={f} value={f}>{n.field(f)}</option>)}</select></Field>
                <Field id={`au-cv-${i}`} label={tx('القيمة', 'Value')}>
                  {c.field === 'channel'
                    ? <select id={`au-cv-${i}`} className="input" value={c.value} onChange={(e) => edit({ conditions: a.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}><option value="online">{tx('المتجر', 'Store')}</option><option value="market">{tx('السوق', 'Marketplace')}</option><option value="app">{tx('التطبيق', 'App')}</option></select>
                    : <input id={`au-cv-${i}`} className="input m-qty" dir="ltr" inputMode="numeric" value={c.value} onChange={(e) => edit({ conditions: a.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />}
                </Field>
                <button type="button" className="btn small" onClick={() => edit({ conditions: a.conditions.filter((_, j) => j !== i) })}>{tx('احذف', 'Remove')}</button>
              </div>
            ))}
            <button type="button" className="btn small" onClick={() => edit({ conditions: [...a.conditions, { field: fields[0], value: fields[0] === 'channel' ? 'online' : '1' }] })}>{tx('أضف شرطًا', 'Add condition')}</button>
          </li>
          <li className="card pad">
            <h2>3. {tx('الانتظار', 'Wait')}</h2>
            <Field id="au-wait" label={tx('انتظر (ساعات) قبل الإجراء', 'Wait (hours) before acting')} hint={tx('إن تغيّر الوضع أثناء الانتظار (مثل شراء العميل) يُتخطى التشغيل.', 'If things change during the wait (e.g. the customer buys), the run is skipped.')}>
              <input id="au-wait" className="input m-qty" dir="ltr" inputMode="numeric" value={String(a.waitHours)} onChange={(e) => edit({ waitHours: Math.max(0, Math.min(168, Number(e.target.value) || 0)) })} />
            </Field>
          </li>
          <li className="card pad">
            <h2>4. {tx('الإجراءات', 'Actions')}</h2>
            {TRIGGER_ACTIONS[a.trigger].map((x) => (
              <label key={x} className="check"><input type="checkbox" checked={a.actions.includes(x)} onChange={(e) => edit({ actions: e.target.checked ? [...a.actions, x] : a.actions.filter((y) => y !== x) })} /> {n.action(x)}</label>
            ))}
            {a.actions.some((x) => x === 'sendEmail' || x === 'sendSms') && <p className="small muted">{tx('الرسائل للعملاء الموافقين فقط، ورسالة واحدة لكل سلة حتى لو طابقها مسار آخر.', 'Messages go to consenting customers only, one per cart even if another flow matches it.')}</p>}
          </li>
        </ol>
      </fieldset>
      <div className="actions">
        {editable && <button type="button" className="btn primary" disabled={!dirty || !a.actions.length} onClick={save}>{id === 'new' ? tx('احفظ مسودة', 'Save draft') : tx('احفظ إصدارًا جديدًا', 'Save new version')}</button>}
        {canManage && <button type="button" className="btn" onClick={runDry}>{tx('تجربة آمنة على بيانات عيّنة', 'Dry run on sample data')}</button>}
        {canManage && cur.status !== 'active' && <button type="button" className="btn" disabled={!!activateReason} onClick={() => setConfirm('activate')}>{tx('فعّل', 'Activate')}</button>}
        {canManage && cur.status === 'active' && <button type="button" className="btn" onClick={() => setConfirm('pause')}>{tx('أوقف', 'Pause')}</button>}
      </div>
      {canManage && cur.status !== 'active' && activateReason && <p className="small muted">{activateReason}</p>}
      {results && (
        <section className="card pad" aria-labelledby="dr-h" aria-live="polite">
          <h2 id="dr-h">{tx('نتيجة التجربة الآمنة', 'Dry-run result')}</h2>
          <p className="small muted">{tx('لم يُرسل شيء ولم تُنشأ مهام. هذه الأحداث عيّنات ثابتة.', 'Nothing was sent and no tasks were created. These events are fixed samples.')}{dirty && tx(' التعديلات غير محفوظة، فلا تُحتسب هذه التجربة للتفعيل.', ' Your edits are unsaved, so this run does not count toward activation.')}</p>
          <ul className="queue">
            {results.map((r) => (
              <li key={r.event.id}><span className="grow">{l(r.event.label)}</span>
                {r.skip === null ? <Badge tone="success">{tx('سينفذ: ', 'Would act: ')}{a.actions.map(n.action).join('، ')}</Badge>
                  : <Badge>{({ condition: tx('يُتخطى: شرط غير متحقق', 'Skipped: condition not met'), noConsent: tx('يُتخطى: لا موافقة', 'Skipped: no consent'), dedup: tx('يُتخطى: رسالة سابقة للسلة نفسها', 'Skipped: already messaged for this cart') })[r.skip]}</Badge>}</li>
            ))}
            {results.length === 0 && <li className="muted">{tx('لا عيّنات لهذا الحدث.', 'No samples for this event.')}</li>}
          </ul>
        </section>
      )}
      {confirm === 'activate' && (
        <Dialog title={tx('تفعيل المسار', 'Activate the flow')} onClose={() => setConfirm(null)}
          footer={<><button type="button" className="btn primary" onClick={() => setStatus('active')}>{tx(`فعّل الإصدار ${cur.version}`, `Activate version ${cur.version}`)}</button><button type="button" className="btn" onClick={() => setConfirm(null)}>{tx('إلغاء', 'Cancel')}</button></>}>
          <p>{tx('سيعمل على الأحداث الجديدة من الآن فقط، بتوقيت الرياض. الرسائل لها تكلفة لدى مزود الإرسال.', 'It runs on new events from now on only, in Riyadh time. Messages have a cost at the sending provider.')}</p>
        </Dialog>
      )}
      {confirm === 'pause' && (
        <Dialog title={tx('إيقاف المسار', 'Pause the flow')} onClose={() => setConfirm(null)}
          footer={<><button type="button" className="btn primary" onClick={() => setStatus('paused')}>{tx('أوقف', 'Pause')}</button><button type="button" className="btn" onClick={() => setConfirm(null)}>{tx('إلغاء', 'Cancel')}</button></>}>
          <ul className="m-list">
            <li>{tx('لن تبدأ تشغيلات جديدة.', 'No new runs will start.')}</li>
            <li>{tx('التشغيلات التي في فترة الانتظار تتوقف قبل خطوتها التالية.', 'Runs in their wait period stop before their next step.')}</li>
            <li>{tx('ما سُلّم لمزود الإرسال قبل الإيقاف لا يمكن استرجاعه.', 'Anything already handed to the sending provider cannot be recalled.')}</li>
          </ul>
        </Dialog>
      )}
    </>
  );
}
