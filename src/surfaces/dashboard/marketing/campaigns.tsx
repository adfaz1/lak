// Campaigns: history of every (simulated) send, and a broadcast composer to consenting customers.
// Segment targeting is a plan limit (Pro), shown separately from role permissions.
import { useMemo, useState } from 'react';
import { Megaphone, Send } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, type Route } from '../../../core/router';
import { customersStore, ordersStore, segmentsStore, settingsStore } from '../../merchant/stores';
import { entitled } from '../../merchant/finance';
import { estimateCost, type MsgChannel } from '../../merchant/growth';
import { Badge, Button, Card, CardHeader, EmptyState, InfoHint, LinkButton, Money, Ref, Segmented, useTx, type Tone } from '../../../ds/ui';
import { DataTable, Field, Select, Simulated, Textarea, type Column } from '../../../ds/kit';
import {
  ATTRIBUTION_DAYS, BROADCAST_AUDIENCES, MESSAGE_MAX, audienceAllowed, audienceMinPlan, broadcastAudience, broadcastFails, campaignOutcome, campaignsStore, messageError,
  returnOnCost, simulateBroadcastResult, type BroadcastAudience, type CampaignOutcome, type CampaignRecord,
} from './model';
import { SendProgress, SendReview, channelName, sendStore, type SendSpec } from './send';
import { Locked } from './access';

const O_TONE: Record<CampaignOutcome, Tone> = { complete: 'green', stopped: 'amber', withFailures: 'red' };

export default function Campaigns({ route, empty, canSend }: { route: Route; empty: boolean; canSend: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const all = campaignsStore.use();
  const active = sendStore.use();
  const list = empty ? [] : all;
  const compose = route.query.get('compose') === '1' && canSend;
  const outcome = (o: CampaignOutcome) => ({ complete: tx('اكتمل', 'Completed'), stopped: tx('أُوقف', 'Stopped'), withFailures: tx('مع إخفاقات', 'With failures') })[o];

  const cols: Column<CampaignRecord>[] = [
    { key: 'id', header: tx('الحملة', 'Campaign'), cell: (c) => <span className="block"><span className="font-semibold text-fg">{c.kind === 'cart' ? tx('استرجاع سلال', 'Cart recovery') : tx('رسالة جماعية', 'Broadcast')}</span><span className="block text-xs text-muted"><Ref>{c.id}</Ref> · {c.audience[lang]}</span></span> },
    { key: 'ch', header: tx('القناة', 'Channel'), hideBelow: 'lg', cell: (c) => channelName(c.channel, tx) },
    { key: 'when', header: tx('التاريخ', 'Date'), hideBelow: 'lg', cell: (c) => <span className="text-muted">{c.when[lang]}</span> },
    { key: 'res', header: tx('سُلّم / فشل / لم يُرسل', 'Handed / failed / not sent'), cell: (c) => <span className="tabular-nums"><span className="text-emerald-700 dark:text-emerald-400">{c.handed}</span> / <span className="text-red-700 dark:text-red-400">{c.failed}</span> / <span className="text-muted">{c.notSent}</span></span> },
    { key: 'o', header: tx('النتيجة', 'Outcome'), cell: (c) => <Badge tone={O_TONE[campaignOutcome(c)]}>{outcome(campaignOutcome(c))}</Badge> },
    { key: 'cost', header: <span className="inline-flex items-center gap-1">{tx('التكلفة', 'Cost')}<InfoHint>{tx('بسعر الاختبار وعلى الرسائل المسلّمة فقط.', 'At the test rate, on handed-over messages only.')}</InfoHint></span>, align: 'end', cell: (c) => <Money v={c.cost} /> },
    { key: 'biz', header: <span className="inline-flex items-center gap-1">{tx('النتيجة التجارية', 'Business result')}<InfoHint>{tx(`طلبات المستلمين خلال ${ATTRIBUTION_DAYS} أيام من الإرسال وإيرادها، والعائد لكل ريال تكلفة. محاكاة في هذه النسخة.`, `Recipients’ orders within ${ATTRIBUTION_DAYS} days of sending, their revenue, and revenue per riyal of cost. Simulated in this demo.`)}</InfoHint></span>, align: 'end', cell: (c) => <Result c={c} /> },
  ];

  return (
    <div className="space-y-6">
      {active && <SendProgress />}
      {compose && <Composer />}
      <Card aria-labelledby="h-hist">
        <CardHeader id="h-hist" title={tx('سجل الحملات', 'Campaign history')} hint={tx('كل إرسال من هذه النسخة محاكاة ولم يصل لأي عميل.', 'Every send in this demo is simulated and reached no customer.')} />
        {list.length === 0 ? (
          <EmptyState icon={<Megaphone className="size-6" aria-hidden="true" />} title={tx('لا حملات بعد', 'No campaigns yet')}
            action={canSend ? <LinkButton variant="secondary" href={link('/dashboard/marketing', { tab: 'carts' })}>{tx('استرجع السلال المتروكة', 'Recover abandoned carts')}</LinkButton> : undefined}>
            {tx('تظهر هنا نتيجة كل إرسال: ما سُلّم وما فشل وما لم يُرسل.', 'Each send’s result appears here: handed over, failed and not sent.')}
          </EmptyState>
        ) : (
          <div className="border-t border-border">
            <DataTable label={tx('سجل الحملات', 'Campaign history')} rows={list} columns={cols} rowKey={(c) => c.id}
              card={(c) => (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold text-fg">{c.kind === 'cart' ? tx('استرجاع سلال', 'Cart recovery') : tx('رسالة جماعية', 'Broadcast')}</span><Badge tone={O_TONE[campaignOutcome(c)]}>{outcome(campaignOutcome(c))}</Badge></div>
                  <p className="text-xs text-muted"><Ref>{c.id}</Ref> · {channelName(c.channel, tx)} · {c.when[lang]}</p>
                  <p className="text-[13px] text-fg tabular-nums">{tx(`سُلّم ${c.handed} · فشل ${c.failed} · لم يُرسل ${c.notSent}`, `Handed ${c.handed} · failed ${c.failed} · not sent ${c.notSent}`)}</p>
                  <div className="flex items-center justify-between gap-2 text-[13px]"><span className="text-muted">{tx('التكلفة', 'Cost')} <Money v={c.cost} /></span><Result c={c} /></div>
                </div>
              )} />
          </div>
        )}
        {!canSend && <p className="border-t border-border px-5 py-3"><Locked>{tx('دورك لا يشمل إرسال الحملات.', 'Your role does not include sending campaigns.')}</Locked></p>}
      </Card>
    </div>
  );
}

function Result({ c }: { c: CampaignRecord }) {
  const tx = useTx();
  if (!c.result) return <span className="text-xs text-muted">{tx('لا نتيجة بعد', 'No result yet')}</span>;
  const roc = returnOnCost(c);
  return (
    <span className="block text-end text-[13px]">
      <span className="block tabular-nums text-fg">{tx(`${c.result.orders} طلب`, `${c.result.orders} orders`)} · <Money v={c.result.revenue} /></span>
      {roc !== null && <span className="block text-xs text-muted">{tx(`${roc} ر.س لكل 1 ر.س تكلفة`, `SAR ${roc} per SAR 1 spent`)}</span>}
    </span>
  );
}

function Composer() {
  const tx = useTx();
  const { lang } = useLang();
  const orders = ordersStore.use();
  const plan = settingsStore.use().plan;
  const active = sendStore.use();
  const customers = customersStore.use();
  const saved = segmentsStore.use();
  const [aud, setAud] = useState<string>('all');
  const [ch, setCh] = useState<MsgChannel>('email');
  const [text, setText] = useState(() => tx('وصلت تشكيلة الخريف الجديدة. تسوّقها الآن.', 'Our new autumn collection has arrived. Shop it now.'));
  const [review, setReview] = useState<SendSpec | null>(null);
  const audName = (a: string) => (a in AUD ? tx(...AUD[a as BroadcastAudience]) : saved.find((x) => `seg:${x.id}` === a)?.name[lang] ?? a);
  const audOk = (a: string) => (a in AUD ? audienceAllowed(a as BroadcastAudience, plan) : entitled(plan, 'segments'));
  const planName = (p: string) => ({ basic: tx('الأساسية', 'Basic'), plus: tx('بلس', 'Plus'), pro: tx('برو', 'Pro'), special: tx('خاصة', 'Special') } as Record<string, string>)[p];
  const allowedAll = audienceAllowed('all', plan);
  const a = useMemo(() => broadcastAudience(customers, orders, aud, ch, saved), [customers, orders, aud, ch, saved]);
  const mErr = messageError(text, ch);
  const busy = !!active;

  return (
    <Card aria-labelledby="h-comp">
      <CardHeader id="h-comp" title={tx('رسالة جماعية جديدة', 'New broadcast')}
        action={<LinkButton variant="ghost" size="sm" href={link('/dashboard/marketing', { tab: 'campaigns' })}>{tx('إلغاء', 'Cancel')}</LinkButton>} />
      {!allowedAll ? (
        <div className="px-5 pb-5"><p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg">{tx(`الرسائل الجماعية متاحة من باقة ${planName('plus')}. هذا حد في الباقة وليس نقص صلاحية.`, `Broadcasts are available from the ${planName('plus')} plan. This is a plan limit, not a missing permission.`)}</p></div>
      ) : (
        <div className="grid grid-cols-1 gap-6 px-5 pb-5 lg:grid-cols-2">
          <div className="space-y-4">
            <Field label={<span className="inline-flex items-center gap-1">{tx('الجمهور', 'Audience')}<InfoHint>{tx('الشرائح حسب سجل الطلبات تحتاج باقة برو. هذا حد في الباقة، منفصل عن صلاحيات دورك.', 'Segments by order history need the Pro plan. This is a plan limit, separate from your role’s permissions.')}</InfoHint></span>}>
              {(p) => (
                <Select {...p} value={aud} disabled={busy} onChange={(e) => setAud(e.target.value)}>
                  {BROADCAST_AUDIENCES.map((x) => <option key={x} value={x} disabled={!audienceAllowed(x, plan)}>{audName(x)}{!audienceAllowed(x, plan) ? ` · ${tx('باقة', 'plan')} ${planName(audienceMinPlan(x))}` : ''}</option>)}
                  {saved.length > 0 && <optgroup label={tx('شرائحك المحفوظة', 'Your saved segments')}>{saved.map((x) => <option key={x.id} value={`seg:${x.id}`} disabled={!audOk(`seg:${x.id}`)}>{x.name[lang]}{!audOk(`seg:${x.id}`) ? ` · ${tx('باقة', 'plan')} ${planName('pro')}` : ''}</option>)}</optgroup>}
                </Select>
              )}
            </Field>
            <div className="space-y-1.5">
              <p className="text-[13px] font-semibold text-fg">{tx('القناة', 'Channel')}</p>
              <Segmented label={tx('القناة', 'Channel')} value={ch} onChange={(v) => !busy && setCh(v)} options={[{ value: 'email', label: tx('بريد', 'Email') }, { value: 'sms', label: tx('رسالة نصية', 'SMS') }]} />
            </div>
            <Field label={tx('النص', 'Text')} hint={<bdi dir="ltr">{text.length} / {MESSAGE_MAX[ch]}</bdi>} error={mErr === 'long' ? tx(`الحد ${MESSAGE_MAX[ch]} حرفًا`, `Limit is ${MESSAGE_MAX[ch]} characters`) : null}>
              {(p) => <Textarea {...p} value={text} dir="auto" disabled={busy} onChange={(e) => setText(e.target.value)} />}
            </Field>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4"><p className="text-[13px] text-emerald-800 dark:text-emerald-300">{tx('مؤهل', 'Eligible')}</p><p className="mt-1 text-2xl font-bold tabular-nums">{a.eligible.length}</p></div>
              <div className="rounded-2xl border border-border p-4"><p className="text-[13px] text-muted">{tx('مستبعد', 'Excluded')}</p><p className="mt-1 text-2xl font-bold tabular-nums">{a.excludedTotal}</p></div>
            </div>
            <ul className="space-y-1.5 text-[13px]">
              <li className="flex justify-between"><span className="text-muted">{tx('خارج الشريحة', 'Outside the segment')}</span><span className="tabular-nums">{a.excluded.notInSegment}</span></li>
              <li className="flex justify-between"><span className="text-muted">{tx('لا موافقة على القناة', 'No consent for the channel')}</span><span className="tabular-nums">{a.excluded.noConsent}</span></li>
              {a.excluded.blocked > 0 && <li className="flex justify-between"><span className="text-muted">{tx('عملاء محظورون', 'Blocked customers')}</span><span className="tabular-nums">{a.excluded.blocked}</span></li>}
              <li className="flex justify-between border-t border-border pt-2"><span className="flex items-center gap-1.5 font-semibold">{tx('التكلفة التقديرية', 'Estimated cost')}<Badge tone="amber">{tx('سعر اختبار', 'Test rate')}</Badge></span><Money v={estimateCost(a.eligible.length, ch)} className="font-bold" /></li>
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={busy || !a.eligible.length || !!mErr} onClick={() => setReview({ kind: 'broadcast', channel: ch, ids: a.eligible.map((c) => c.id), excluded: a.excludedTotal, text, audience: aud in AUD ? { ar: AUD[aud as BroadcastAudience][0], en: AUD[aud as BroadcastAudience][1] } : saved.find((x) => `seg:${x.id}` === aud)?.name ?? { ar: aud, en: aud }, fails: broadcastFails,
                finish: (handed) => ({ recipients: handed, result: simulateBroadcastResult(handed, customersStore.get(), ordersStore.get()) }) })}>
                <Send className="size-4" aria-hidden="true" />{tx('راجع ثم أرسل', 'Review and send')}
              </Button>
              <Simulated />
            </div>
          </div>
        </div>
      )}
      {review && <SendReview spec={review} onClose={() => setReview(null)} />}
    </Card>
  );
}

const AUD: Record<BroadcastAudience, [string, string]> = { all: ['كل العملاء الموافقين', 'All consenting customers'], returning: ['العملاء العائدون', 'Returning customers'], new: ['عملاء بطلب واحد', 'One-order customers'], highValue: ['عملاء بإنفاق مرتفع', 'High spenders'] };
