// Simulated message sending shared by abandoned-cart recovery and broadcasts:
// review Modal (scope, consent, cost at a test rate) → progress with stop → result recorded in history.
// Nothing is ever sent: every step is a local fixture.
import { useEffect, type ReactNode } from 'react';
import { useLang } from '../../../core/lang';
import { Send, Square, CheckCircle2, AlertTriangle } from 'lucide-react';
import { createStore } from '../../../core/store';
import { link } from '../../../core/router';
import type { L } from '../../merchant/domain';
import { TEST_RATE, estimateCost, type MsgChannel } from '../../merchant/growth';
import { Badge, Button, Card, CardHeader, InfoHint, LinkButton, Money, cn, useTx } from '../../../ds/ui';
import { Modal, Simulated } from '../../../ds/kit';
import { campaignsStore, isRunning, jobCost, jobResult, newJob, recordCampaign, stepJob, stopJob, type SendJob } from './model';

export interface SendSpec { kind: 'cart' | 'broadcast'; channel: MsgChannel; ids: string[]; excluded: number; audience: L; text: string; fails: (id: string) => boolean }
interface Active { spec: SendSpec; job: SendJob; recorded: boolean }
/** In memory only (holds a function); a reload ends the simulation, which never sent anything. */
export const sendStore = createStore<Active | null>(() => null);

export function startSend(spec: SendSpec) { sendStore.set({ spec, job: newJob(spec.ids), recorded: false }); }

/** Drives the simulated send while the marketing section is open, and records the outcome once. */
export function useSendRunner() {
  const a = sendStore.use();
  useEffect(() => {
    if (!a) return;
    if (isRunning(a.job)) {
      const t = setTimeout(() => sendStore.set((x) => (x ? { ...x, job: stepJob(x.job, x.spec.fails) } : x)), 280);
      return () => clearTimeout(t);
    }
    if (!a.recorded) {
      const r = jobResult(a.job);
      campaignsStore.set((list) => recordCampaign(list, {
        kind: a.spec.kind, channel: a.spec.channel, audience: a.spec.audience, when: { ar: 'اليوم', en: 'Today' }, text: a.spec.text,
        total: r.total, handed: r.handed, failed: r.failed, notSent: r.notSent, stopped: a.job.stopped, cost: jobCost(a.job, a.spec.channel),
      }));
      sendStore.set({ ...a, recorded: true });
    }
  }, [a]);
}

export const channelName = (ch: MsgChannel, tx: (a: string, e: string) => string) => (ch === 'email' ? tx('بريد إلكتروني', 'Email') : tx('رسالة نصية', 'SMS'));

/** Review before sending: who, who is left out, cost at the test rate, and what cannot be undone. */
export function SendReview({ spec, onClose }: { spec: SendSpec; onClose: () => void }) {
  const tx = useTx();
  const n = spec.ids.length;
  const rows: [string, ReactNode][] = [
    [tx('القناة', 'Channel'), channelName(spec.channel, tx)],
    [tx('المستلمون', 'Recipients'), tx(`${n} لديهم موافقة على هذه القناة`, `${n} with consent for this channel`)],
    [tx('مستبعدون', 'Excluded'), <bdi key="x" className="tabular-nums">{spec.excluded}</bdi>],
    [tx('سعر اختبار للرسالة', 'Test rate per message'), <Money key="r" v={TEST_RATE[spec.channel]} />],
  ];
  return (
    <Modal title={tx('مراجعة الإرسال', 'Review before sending')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button>
        <Button onClick={() => { startSend(spec); onClose(); }}><Send className="size-4" aria-hidden="true" />{tx(`أرسل ${n} رسالة (محاكاة)`, `Send ${n} messages (simulated)`)}</Button></>}>
      <dl className="divide-y divide-border rounded-xl border border-border">
        {rows.map(([k, v]) => <div key={k} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><dt className="text-muted">{k}</dt><dd className="font-semibold text-fg">{v}</dd></div>)}
        <div className="flex items-center justify-between gap-3 bg-surface-2/50 px-4 py-3 text-sm">
          <dt className="flex items-center gap-1.5 font-semibold text-fg">{tx('التكلفة التقديرية', 'Estimated cost')}<Badge tone="amber">{tx('سعر اختبار', 'Test rate')}</Badge></dt>
          <dd className="text-base font-bold"><Money v={estimateCost(n, spec.channel)} /></dd>
        </div>
      </dl>
      <div className="rounded-xl bg-surface-2 p-3 text-sm leading-relaxed text-fg" dir="auto">{spec.text}</div>
      <ul className="space-y-1.5 text-[13px] text-muted">
        <li>{tx('لا يمكن استرجاع رسالة بعد تسليمها للمزوّد.', 'A message cannot be recalled once handed to the provider.')}</li>
        <li>{tx('يمكنك إيقاف ما تبقى أثناء الإرسال.', 'You can stop the rest while sending.')}</li>
      </ul>
      <Simulated />
    </Modal>
  );
}

/** Live progress of the simulated send, with stop and an honest result. */
export function SendProgress() {
  const tx = useTx();
  const { lang } = useLang();
  const a = sendStore.use();
  if (!a) return null;
  const r = jobResult(a.job);
  const running = isRunning(a.job);
  const title = running ? tx('جارٍ الإرسال…', 'Sending…') : a.job.stopped ? tx('أُوقف الإرسال', 'Sending stopped') : tx('اكتمل الإرسال', 'Sending finished');
  return (
    <Card aria-labelledby="h-send" aria-live="polite">
      <CardHeader id="h-send" title={<span className="flex items-center gap-2">{title}<Simulated /></span>}
        hint={tx('الإيقاف يمنع الرسائل المتبقية فقط؛ ما سُلّم لا يُسترجع.', 'Stopping prevents the remaining messages only; delivered ones cannot be recalled.')}
        action={running
          ? <Button variant="secondary" size="sm" onClick={() => sendStore.set((x) => (x ? { ...x, job: stopJob(x.job) } : x))}><Square className="size-3.5" aria-hidden="true" />{tx('أوقف ما تبقى', 'Stop the rest')}</Button>
          : <Button variant="ghost" size="sm" onClick={() => sendStore.set(null)}>{tx('إغلاق', 'Close')}</Button>} />
      <div className="space-y-4 px-5 pb-5">
        <div>
          <div className="flex justify-between text-xs text-muted"><span>{channelName(a.spec.channel, tx)} · {a.spec.audience[lang]}</span><span className="tabular-nums">{r.pct}%</span></div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={r.total} aria-valuenow={a.job.done} aria-label={tx('تقدم الإرسال', 'Send progress')}>
            <div className={cn('h-full rounded-full transition-[width]', a.job.stopped ? 'bg-amber-500' : 'bg-brand-600')} style={{ width: `${r.pct}%` }} />
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-3">
          <Stat label={tx('سُلّم للمزوّد', 'Handed over')} v={r.handed} tone="text-emerald-700 dark:text-emerald-400" />
          <Stat label={tx('فشل', 'Failed')} v={r.failed} tone="text-red-700 dark:text-red-400" hint={tx('عنوان أو رقم غير صالح في بيانات الاختبار. لا يُعاد تلقائيًا.', 'Invalid address or number in the test data. Not retried automatically.')} />
          <Stat label={tx('لم يُرسل', 'Not sent')} v={r.notSent} tone="text-fg" />
        </dl>
        {!running && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3 text-sm">
            <span className="flex items-center gap-2 font-medium text-fg">
              {a.job.stopped || r.failed ? <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" /> : <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />}
              {tx('التكلفة على الرسائل المسلّمة فقط:', 'Cost on handed-over messages only:')} <Money v={jobCost(a.job, a.spec.channel)} />
            </span>
            <LinkButton variant="secondary" size="sm" href={link('/dashboard/marketing', { tab: 'campaigns' })} onClick={() => sendStore.set(null)}>{tx('سجل الحملات', 'Campaign history')}</LinkButton>
          </div>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, v, tone, hint }: { label: string; v: number; tone: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <dt className="flex items-center gap-1 text-xs text-muted">{label}{hint && <InfoHint>{hint}</InfoHint>}</dt>
      <dd className={cn('mt-1 text-xl font-bold tabular-nums', tone)}>{v}</dd>
    </div>
  );
}
