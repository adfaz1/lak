// One run in detail (drawer): what it was about, every step with its outcome, every attempt, its cost, and a
// retry for a failed run. Retrying repeats only the failed step; it is confirmed first and logged as a new run
// linked to the first one. After three attempts, or for a failure a retry cannot fix, it is listed as "needs follow-up".
import { CheckCircle2, XCircle, MinusCircle, CircleDashed, RotateCw, ArrowUpRight } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link } from '../../../core/router';
import { cartsStore, logAction, runsStore } from '../../merchant/stores';
import type { Automation, Run, RunStep } from '../../merchant/growth';
import { Badge, Button, Money, Ref, cn, useTx } from '../../../ds/ui';
import { Alert, Drawer, Modal, Simulated, useToast } from '../../../ds/kit';
import { MAX_ATTEMPTS, attemptsOf, retryBlock, retryRun, rootOf, runSteps } from './model';
import { OutcomeIcon, R_TONE, ahref, useNames } from './names';
import { RuleRunBody } from './rules';

function StepIcon({ o }: { o: RunStep['outcome'] }) {
  const I = o === 'ok' ? CheckCircle2 : o === 'failed' ? XCircle : o === 'skipped' ? MinusCircle : CircleDashed;
  return <I className={cn('size-4 shrink-0', o === 'ok' ? 'text-emerald-600' : o === 'failed' ? 'text-red-600' : 'text-muted')} aria-hidden="true" />;
}

export function RunDrawer({ run, runs, automation, canManage, onClose, onRetry }: { run: Run; runs: Run[]; automation?: Automation; canManage: boolean; onClose: () => void; onRetry: (r: Run) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useNames();
  const carts = cartsStore.use();
  const steps = runSteps(run, automation);
  const chain = attemptsOf(runs, rootOf(run));
  const block = retryBlock(runs, run);
  const cartId = /CRT-\d+/.exec(run.subject.en)?.[0];
  const cart = carts.find((c) => c.id === cartId);
  const stepName = (s: RunStep) => s.kind === 'event' ? tx(`الحدث: ${automation ? n.trigger(automation.trigger) : ''}`, `Event: ${automation ? n.trigger(automation.trigger) : ''}`)
    : s.kind === 'conditions' ? tx('الشروط', 'Conditions') : s.kind === 'wait' ? tx(`الانتظار ${automation?.waitHours ?? 0} ساعة`, `Wait ${automation?.waitHours ?? 0}h`) : n.action(s.action!);
  const outName = (o: RunStep['outcome']) => ({ ok: tx('تم', 'Done'), failed: tx('فشل', 'Failed'), skipped: tx('تُخطّي', 'Skipped'), notReached: tx('لم يُصل إليه', 'Not reached') })[o];
  const blockText = block === 'maxAttempts' ? tx(`استُنفدت ${MAX_ATTEMPTS} محاولات`, `All ${MAX_ATTEMPTS} attempts used`) : block === 'superseded' ? tx('أُعيدت المحاولة بعده', 'A later attempt exists') : null;
  return (
    <Drawer title={run.subject[lang]} onClose={onClose}
      footer={canManage && run.outcome === 'failed' ? <Button disabled={!!block} title={blockText ?? undefined} onClick={() => onRetry(run)}><RotateCw className="size-4" aria-hidden="true" />{tx('أعد المحاولة', 'Retry')}</Button> : undefined}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={R_TONE[run.outcome]} icon={<OutcomeIcon o={run.outcome} />}>{n.outcome(run.outcome)}</Badge>
          <span className="text-sm text-muted"><Ref>{run.id}</Ref> · {run.when[lang]}</span>
        </div>
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg">{run.reason[lang]}</p>
        {run.order ? <RuleRunBody run={run} /> : <>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-border px-3 py-2.5"><dt className="text-xs text-muted">{tx('الأتمتة', 'Automation')}</dt><dd className="mt-0.5 font-semibold"><a href={ahref(run.automation)} className="text-fg hover:text-brand-700">{automation?.name[lang] ?? run.automation}</a></dd></div>
          <div className="rounded-xl border border-border px-3 py-2.5"><dt className="text-xs text-muted">{tx('التكلفة', 'Cost')}</dt><dd className="mt-0.5 font-semibold"><Money v={run.cost ?? 0} /></dd></div>
        </dl>
        {cart && (
          <a href={link(`/dashboard/customers/${cart.customerId ?? ''}`, { tl: 'automation' })} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:border-brand-300">
            <span><span className="block font-medium text-fg">{cart.customer[lang]}</span><span className="block text-xs text-muted"><Ref>{cart.id}</Ref> · <Money v={cart.value} /></span></span><ArrowUpRight className="size-4 text-muted rtl:-scale-x-100" aria-hidden="true" />
          </a>
        )}
        <section aria-labelledby="h-steps">
          <h3 id="h-steps" className="mb-2 text-sm font-semibold text-fg">{tx('الخطوات', 'Steps')}</h3>
          <ol className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2 text-[13px]">
                <StepIcon o={s.outcome} /><span className="min-w-0 flex-1 text-fg">{stepName(s)}</span><span className={cn('text-xs', s.outcome === 'failed' ? 'font-semibold text-red-700 dark:text-red-400' : 'text-muted')}>{outName(s.outcome)}</span>
              </li>
            ))}
          </ol>
        </section>
        </>}
        {chain.length > 1 && (
          <section aria-labelledby="h-att">
            <h3 id="h-att" className="mb-2 text-sm font-semibold text-fg">{tx('المحاولات', 'Attempts')}</h3>
            <ul className="divide-y divide-border rounded-xl border border-border text-[13px]">
              {chain.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2"><span><Ref>{r.id}</Ref> · {tx(`محاولة ${r.attempt ?? 1}`, `Attempt ${r.attempt ?? 1}`)}{r.by ? ` · ${r.by}` : ''}</span><Badge tone={R_TONE[r.outcome]}>{n.outcome(r.outcome)}</Badge></li>)}
            </ul>
          </section>
        )}
        {run.outcome === 'failed' && run.retryable === false && <Alert tone="warn">{run.order ? tx('سيتكرر حتى يُعالج سببه: فعّل العضو أو عدّل القاعدة.', 'It will repeat until fixed: reactivate the member or edit the rule.') : tx('هذا الفشل سيتكرر حتى يُعالج سببه (مثل تصحيح البريد في ملف العميل).', 'This failure will repeat until its cause is fixed (e.g. correct the email on the customer).')}</Alert>}
        {blockText && <p className="text-xs text-muted">{blockText}</p>}
      </div>
    </Drawer>
  );
}

export function RetryModal({ run, automation, onClose }: { run: Run; automation?: Automation; onClose: (newId?: string) => void }) {
  const tx = useTx();
  const n = useNames();
  const toast = useToast();
  const steps = runSteps(run, automation);
  const failed = steps.find((s) => s.outcome === 'failed');
  const done = steps.filter((s) => s.kind === 'action' && s.outcome === 'ok');
  const attempt = (run.attempt ?? 1) + 1;
  const go = () => {
    const r = retryRun(runsStore.get(), run.id, { now: Date.now(), by: tx('أنت', 'You') });
    if (!r.run) { onClose(); return; }
    runsStore.set(r.runs);
    logAction('marketing', { ar: `أعاد محاولة التشغيل ${run.id} (المحاولة ${attempt})`, en: `Retried run ${run.id} (attempt ${attempt})` }, { target: r.run.id, after: r.run.outcome });
    toast({ tone: r.run.outcome === 'succeeded' ? 'ok' : 'bad', text: r.run.outcome === 'succeeded' ? tx('نجحت إعادة المحاولة', 'The retry succeeded') : tx('فشلت مجددًا بالسبب نفسه', 'It failed again for the same reason') });
    onClose(r.run.id);
  };
  return (
    <Modal title={tx(`إعادة محاولة ${run.id}`, `Retry ${run.id}`)} onClose={() => onClose()}
      footer={<><Button variant="secondary" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={go}><RotateCw className="size-4" aria-hidden="true" />{tx(`أعد المحاولة (${attempt} من ${MAX_ATTEMPTS})`, `Retry (${attempt} of ${MAX_ATTEMPTS})`)}</Button></>}>
      <ul className="space-y-1.5 text-sm text-fg">
        <li>{tx('يُعاد: ', 'Repeated: ')}<b>{failed?.action ? n.action(failed.action) : tx('الخطوة الفاشلة', 'the failed step')}</b></li>
        {done.length > 0 && <li>{tx('لا يُعاد ما نجح: ', 'Not repeated (already done): ')}{done.map((s) => n.action(s.action!)).join(tx('، ', ', '))}</li>}
        <li>{tx('يُسجَّل تشغيلًا جديدًا مرتبطًا بالأصلي.', 'Logged as a new run linked to the original.')}</li>
        {run.retryable === false && <li className="text-amber-800 dark:text-amber-200">{tx('السبب لم يُعالج؛ متوقع أن يفشل مجددًا.', 'The cause is not fixed; it is likely to fail again.')}</li>}
      </ul>
      <Simulated />
    </Modal>
  );
}
