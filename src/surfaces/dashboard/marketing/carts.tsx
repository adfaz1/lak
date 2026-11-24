// Abandoned-cart recovery: audience (eligible vs excluded with reasons), consent, message, cost at a test rate,
// preview, then a simulated send with progress and stop. Never a real send.
import { useState } from 'react';
import { ShoppingCart, Send, Mail, MessageSquare } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { cartsStore } from '../../merchant/stores';
import { EXCLUSIONS, TEST_RATE, audience, estimateCost, simSendFails, type Exclusion, type MsgChannel } from '../../merchant/growth';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, InfoHint, Money, Segmented, useTx } from '../../../ds/ui';
import { Field, Select, Simulated, Textarea } from '../../../ds/kit';
import { MESSAGE_MAX, messageError } from './model';
import { SendProgress, SendReview, sendStore, type SendSpec } from './send';
import { Locked } from './access';

export default function Carts({ empty, canSend }: { empty: boolean; canSend: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const all = cartsStore.use();
  const active = sendStore.use();
  const carts = empty ? [] : all;
  const [ch, setCh] = useState<MsgChannel>('email');
  const [minHours, setMinHours] = useState(4);
  const [text, setText] = useState(() => tx('نسيت شيئًا في سلتك؟ أكمل طلبك متى ناسبك.', 'Left something in your cart? Complete your order whenever suits you.'));
  const [review, setReview] = useState<SendSpec | null>(null);
  const a = audience(carts, ch, minHours);
  const busy = !!active;
  const mErr = messageError(text, ch);
  const reason: Record<Exclusion, string> = {
    purchased: tx('اشترى بعد ترك السلة', 'Purchased after leaving'), optedOut: tx('ألغى الاشتراك في الرسائل', 'Unsubscribed from messages'),
    tooRecent: tx('تُركت منذ وقت قصير', 'Left too recently'), automation: tx('وصلته رسالة من الأتمتة خلال 24 ساعة', 'Messaged by an automation in the last 24h'),
    noConsent: tx('لا موافقة على هذه القناة', 'No consent for this channel'),
  };
  const ago = (h: number) => (h < 24 ? tx(`قبل ${h} س`, `${h}h ago`) : tx(`قبل ${Math.round(h / 24)} ي`, `${Math.round(h / 24)}d ago`));

  if (carts.length === 0) return (
    <Card><EmptyState as="h2" icon={<ShoppingCart className="size-6" aria-hidden="true" />} title={tx('لا سلال متروكة', 'No abandoned carts')}>
      {tx('تظهر هنا السلال التي تركها العملاء دون إتمام الطلب.', 'Carts customers leave without completing an order appear here.')}
    </EmptyState></Card>
  );

  const open = () => setReview({
    kind: 'cart', channel: ch, ids: a.eligible.map((c) => c.id), excluded: a.excludedTotal, text,
    audience: { ar: `سلال متروكة منذ ${minHours} ساعة أو أكثر`, en: `Carts left ${minHours}h+ ago` },
    fails: (id) => !!carts.find((c) => c.id === id && simSendFails(c)),
  });
  const maxExcl = Math.max(1, ...EXCLUSIONS.map((x) => a.excluded[x]));

  return (
    <div className="space-y-6">
      {active && <SendProgress />}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="h-aud">
          <CardHeader id="h-aud" title={tx('الجمهور', 'Audience')} hint={tx('تُرسل الرسالة فقط لمن وافق على القناة، ولم يشترِ، ولم تصله رسالة أتمتة للسلة نفسها.', 'Only customers who consented to the channel, have not purchased and were not messaged by an automation for the same cart.')} />
          <div className="space-y-5 px-5 pb-5">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <p className="text-[13px] font-semibold text-fg">{tx('القناة', 'Channel')}</p>
                <Segmented label={tx('القناة', 'Channel')} value={ch} onChange={(v) => !busy && setCh(v)} options={[{ value: 'email', label: tx('بريد', 'Email') }, { value: 'sms', label: tx('رسالة نصية', 'SMS') }]} />
              </div>
              <Field label={tx('تُركت منذ', 'Left at least')} className="w-40">
                {(p) => <Select {...p} value={minHours} disabled={busy} onChange={(e) => setMinHours(Number(e.target.value))}>{[1, 4, 24].map((h) => <option key={h} value={h}>{tx(`${h} ساعة`, `${h} hour${h > 1 ? 's' : ''}`)}</option>)}</Select>}
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="text-[13px] font-medium text-emerald-800 dark:text-emerald-300">{tx('مؤهل للإرسال', 'Eligible')}</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-fg">{a.eligible.length}</p>
                <p className="mt-1 text-xs text-muted">{tx(`من ${carts.length} سلة`, `of ${carts.length} carts`)}</p>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <p className="text-[13px] font-medium text-muted">{tx('مستبعد', 'Excluded')}</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-fg">{a.excludedTotal}</p>
                <p className="mt-1 text-xs text-muted">{tx('السبب الأول فقط لكل سلة', 'First reason only per cart')}</p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-[13px] font-semibold text-fg">{tx('أسباب الاستبعاد', 'Why carts are excluded')}</h3>
              <ul className="space-y-2.5">
                {EXCLUSIONS.map((x) => (
                  <li key={x} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-[13px]">
                    <span className="text-fg">{reason[x]}</span><span className="tabular-nums text-muted">{a.excluded[x]}</span>
                    <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-subtle/60" style={{ width: `${(a.excluded[x] * 100) / maxExcl}%` }} /></span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-2 text-[13px] font-semibold text-fg">{tx('أمثلة من المؤهلين', 'Eligible examples')}</h3>
              {a.eligible.length === 0 ? <p className="text-sm text-muted">{tx('لا سلال مؤهلة بهذه الإعدادات.', 'No eligible carts with these settings.')}</p> : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {a.eligible.slice(0, 4).map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                      <Avatar name={c.customer[lang]} />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-fg">{c.customer[lang]}</p><p className="text-xs text-muted"><bdi dir="ltr">{c.id}</bdi> · {ago(c.hoursAgo)}</p></div>
                      <Money v={c.value} className="text-sm font-semibold text-fg" />
                    </li>
                  ))}
                  {a.eligible.length > 4 && <li className="px-3 py-2 text-xs text-muted">{tx(`و${a.eligible.length - 4} أخرى`, `and ${a.eligible.length - 4} more`)}</li>}
                </ul>
              )}
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card aria-labelledby="h-msg">
            <CardHeader id="h-msg" title={tx('الرسالة', 'Message')} hint={tx('بلا خصم تلقائي. أضف كود كوبون في النص إن أردت.', 'No automatic discount. Add a coupon code in the text if you want.')} />
            <div className="space-y-4 px-5 pb-5">
              <Field label={tx('النص', 'Text')} error={mErr === 'long' ? tx(`الحد ${MESSAGE_MAX[ch]} حرفًا لهذه القناة`, `Limit is ${MESSAGE_MAX[ch]} characters for this channel`) : null}
                hint={<bdi dir="ltr">{text.length} / {MESSAGE_MAX[ch]}</bdi>}>
                {(p) => <Textarea {...p} value={text} disabled={busy} dir="auto" onChange={(e) => setText(e.target.value)} />}
              </Field>
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">{ch === 'email' ? <Mail className="size-3.5" aria-hidden="true" /> : <MessageSquare className="size-3.5" aria-hidden="true" />}{tx('كما سيراها العميل', 'As the customer sees it')}</p>
                <div className="rounded-2xl bg-surface-2 p-3">
                  <p className="max-w-[90%] rounded-2xl rounded-ss-sm bg-surface px-3 py-2 text-sm leading-relaxed text-fg shadow-card" dir="auto">{text || '—'}</p>
                  <p className="mt-2 text-[11px] text-subtle">{tx('يتضمن رابط إلغاء الاشتراك تلقائيًا', 'An unsubscribe link is added automatically')}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card aria-labelledby="h-cost">
            <CardHeader id="h-cost" title={<span className="flex items-center gap-2">{tx('التكلفة التقديرية', 'Estimated cost')}<Badge tone="amber">{tx('سعر اختبار', 'Test rate')}</Badge></span>}
              hint={tx('سعر اختبار توضيحي، وليس تسعير مزود الإرسال أو «لك». يُستبدل بالسعر المعتمد.', 'An illustrative test rate, not the provider’s or LAK’s pricing. Replaced by the approved rate.')} />
            <div className="space-y-3 px-5 pb-5">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-muted">{tx('رسائل', 'Messages')}</dt><dd className="tabular-nums text-fg">{a.eligible.length}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">{tx('للرسالة', 'Per message')}</dt><dd><Money v={TEST_RATE[ch]} /></dd></div>
                <div className="flex justify-between border-t border-border pt-2"><dt className="font-semibold text-fg">{tx('الإجمالي', 'Total')}</dt><dd className="text-lg font-bold"><Money v={estimateCost(a.eligible.length, ch)} /></dd></div>
              </dl>
              {canSend ? (
                <Button className="w-full" disabled={busy || !a.eligible.length || !!mErr} onClick={open}><Send className="size-4" aria-hidden="true" />{tx('راجع ثم أرسل', 'Review and send')}</Button>
              ) : <Locked>{tx('دورك لا يشمل إرسال الحملات.', 'Your role does not include sending campaigns.')}</Locked>}
              <div className="flex items-center justify-between gap-2 text-xs text-muted"><Simulated /><span className="flex items-center gap-1">{tx('لا يخرج شيء فعليًا', 'Nothing actually leaves')}<InfoHint>{tx('هذه نسخة تجريبية: لا يتصل الإرسال بأي مزوّد.', 'This is a demo: sending reaches no provider.')}</InfoHint></span></div>
            </div>
          </Card>
        </div>
      </div>
      {review && <SendReview spec={review} onClose={() => setReview(null)} />}
    </div>
  );
}
