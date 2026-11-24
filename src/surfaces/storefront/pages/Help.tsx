// Shopper side of the merchant's service inbox (dashboard/inbox). From an order page the shopper reports a problem
// or asks something about the order; from a product page they ask a question. Both land in the merchant's inbox.
// Simulated: nothing is sent; the store's replies show here as they would in a message.
import { useState } from 'react';
import { CheckCircle2, CircleHelp, LifeBuoy, MessageCircle, Send } from 'lucide-react';
import { Field, Select, Textarea } from '../../../ds/kit';
import { Badge, Button, Ref, cn, useTx } from '../../../ds/ui';
import { customersStore, inboxStore, logAction, ordersStore, reviewSettingsStore, reviewsStore } from '../../merchant/stores';
import { SHOPPER_TOPICS, customerWrites, openFromStore, shopperProblems, shopperState, type ShopperTopic } from '../../merchant/inbox';
import { H3, PANEL, to, useS } from '../kit';
import { CUSTOMER, accountStore } from '../state';

const ERR = 'text-[13px] font-medium text-red-600 dark:text-red-400';

/** "Need help with this order?" on the shopper's order page. */
export function OrderHelp({ orderRef, phone }: { orderRef: string; phone?: string }) {
  const tx = useTx();
  const { lang, d } = useS();
  const cases = inboxStore.use().filter((c) => c.orderRef === orderRef && c.source === 'store');
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<ShopperTopic | ''>('');
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [follow, setFollow] = useState<Record<string, string>>({});
  const probs = shopperProblems(topic, text);
  const topicName = (t: ShopperTopic) => ({ item: tx('مشكلة في منتج', 'A problem with an item'), damaged: tx('وصل متضررًا', 'It arrived damaged'), late: tx('الطلب متأخر', 'My order is late'), lost: tx('لم يصلني الطلب', 'My order has not arrived'), question: tx('سؤال عن الطلب', 'A question about my order'), other: tx('شيء آخر', 'Something else') })[t];
  const submit = () => {
    setTried(true);
    if (probs.length || !topic) return;
    const m = ordersStore.get().find((o) => o.ref === orderRef);
    const cust = customersStore.get().find((c) => c.id === m?.customerId) ?? customersStore.get().find((c) => c.name.en === m?.customer.en);
    const parcel = m?.fulfilments.filter((f) => !f.voided).at(-1);
    const c = openFromStore(inboxStore.get(), {
      orderRef, customer: m?.customer ?? { ar: tx('عميل', 'Customer'), en: 'Customer' }, customerId: cust?.id, topic, text, lang,
      tracking: parcel?.tracking ?? parcel?.ref, carrier: parcel?.carrier,
    }, Date.now());
    inboxStore.set((l) => [c, ...l]);
    logAction('orders', { ar: `عميل فتح الحالة ${c.id} للطلب #${orderRef}`, en: `A customer opened case ${c.id} for order #${orderRef}` }, { target: c.id });
    setSent(c.id); setOpen(false); setTopic(''); setText(''); setTried(false);
  };
  const reply = (id: string) => {
    const t = (follow[id] ?? '').trim();
    if (t.length < 2) return;
    inboxStore.set((l) => l.map((c) => (c.id === id ? customerWrites(c, t, Date.now()) : c)));
    setFollow((f) => ({ ...f, [id]: '' }));
  };
  return (
    <section aria-labelledby="sf-help-h" className={cn(PANEL, 'space-y-4 p-5 sm:p-6')}>
      <div className="flex items-start gap-3">
        <LifeBuoy className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="sf-help-h" className={H3}>{tx('تحتاج مساعدة في هذا الطلب؟', 'Need help with this order?')}</h2>
          <p className="mt-0.5 text-[13px] text-muted">{tx('اكتب لنا هنا ونرد عليك على جوالك وفي هذه الصفحة.', 'Write to us here; we reply to your mobile and on this page.')}</p>
        </div>
      </div>
      {sent && <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" aria-hidden="true" />{tx('وصلتنا رسالتك. رقمها ', 'We have your message. Its number is ')}<Ref>{sent}</Ref></p>}
      {cases.length > 0 && (
        <ul className="space-y-3">
          {cases.map((c) => {
            const st = shopperState(c);
            const last = [...c.messages].reverse().find((m) => m.from === 'store' && m.status === 'sent');
            return (
              <li key={c.id} className="rounded-xl bg-surface-2 p-4 text-sm">
                <p className="flex flex-wrap items-center gap-2"><span className="font-semibold">{c.subject[lang]}</span><Ref>{c.id}</Ref>
                  <Badge tone={st === 'closed' ? 'green' : st === 'answered' ? 'brand' : 'amber'}>{st === 'closed' ? tx('مغلقة', 'Closed') : st === 'answered' ? tx('رددنا عليك', 'We replied') : tx('وصلتنا', 'Received')}</Badge>
                </p>
                <p className="mt-1 text-xs text-muted">{d(c.openedAt)}</p>
                {last && <p className="mt-2 whitespace-pre-line rounded-lg bg-surface p-3 text-[13px]" dir="auto"><MessageCircle className="me-1.5 inline size-3.5 text-muted" aria-hidden="true" />{last.text}</p>}
                {st !== 'closed' && (
                  <div className="mt-3 flex gap-2">
                    <input aria-label={tx('ردك', 'Your reply')} value={follow[c.id] ?? ''} onChange={(e) => setFollow((f) => ({ ...f, [c.id]: e.target.value }))} placeholder={tx('أضف ردًا…', 'Add a reply…')}
                      className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm" />
                    <Button variant="secondary" onClick={() => reply(c.id)} disabled={(follow[c.id] ?? '').trim().length < 2}><Send className="size-4" aria-hidden="true" /><span className="sr-only">{tx('أرسل', 'Send')}</span></Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!open ? <Button variant="secondary" onClick={() => { setOpen(true); setSent(null); }}><LifeBuoy className="size-4" aria-hidden="true" />{tx('اكتب لنا', 'Write to us')}</Button> : (
        <div className="space-y-3">
          <Field label={tx('بخصوص', 'About')} error={tried && !topic ? tx('اختر الموضوع', 'Choose a topic') : null}>
            {(p) => <Select {...p} value={topic} onChange={(e) => setTopic(e.target.value as ShopperTopic)}><option value="">{tx('اختر…', 'Choose…')}</option>{SHOPPER_TOPICS.map((t) => <option key={t} value={t}>{topicName(t)}</option>)}</Select>}
          </Field>
          <Field label={tx('رسالتك', 'Your message')} error={tried && probs.includes('text') ? tx('اكتب 5 أحرف على الأقل', 'Write at least 5 characters') : tried && probs.includes('long') ? tx('1000 حرف كحد أقصى', '1000 characters at most') : null}>
            {(p) => <Textarea {...p} dir="auto" value={text} onChange={(e) => setText(e.target.value)} />}
          </Field>
          <div className="flex flex-wrap gap-2"><Button onClick={submit}><Send className="size-4" aria-hidden="true" />{tx('أرسل', 'Send')}</Button><Button variant="ghost" onClick={() => setOpen(false)}>{tx('إلغاء', 'Cancel')}</Button></div>
          {phone && <p className="text-xs text-muted">{tx('نرد على ', 'We reply to ')}<bdi dir="ltr">{phone}</bdi></p>}
        </div>
      )}
    </section>
  );
}

/** "Ask a question" on a product page: becomes a pending question the merchant answers from the inbox or reviews. */
export function AskQuestion({ productId }: { productId: string }) {
  const tx = useTx();
  const { lang } = useS();
  const settings = reviewSettingsStore.use();
  const acc = accountStore.use();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState(false);
  if (!settings.questions) return null;
  const needSignIn = settings.questionsSignedIn && !acc.signedIn;
  const errs = { name: !acc.signedIn && name.trim().length < 2, text: text.trim().length < 5 || text.trim().length > 500 };
  const submit = () => {
    setTried(true);
    if (errs.name || errs.text) return;
    const list = reviewsStore.get();
    const n = list.filter((r) => r.id.startsWith('QA-')).reduce((m, r) => Math.max(m, Number(r.id.replace(/\D/g, '')) || 0), 200) + 1;
    const author = acc.signedIn ? CUSTOMER.name : { ar: name.trim(), en: name.trim() };
    reviewsStore.set((l) => [{ id: `QA-${n}`, kind: 'question', productId, customerId: acc.signedIn ? CUSTOMER.id : undefined, author, text: text.trim(), at: new Date().toISOString().slice(0, 10), status: 'pending', verified: false, log: [] }, ...l]);
    setDone(true); setOpen(false); setText(''); setTried(false);
  };
  return (
    <div className="pt-10">
      {done && <p role="status" className="mb-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" aria-hidden="true" />{tx('وصل سؤالك. تظهر الإجابة هنا بعد رد المتجر.', 'Your question was sent. The answer appears here once the store replies.')}</p>}
      {!open ? (
        <Button variant="secondary" onClick={() => { setOpen(true); setDone(false); }}><CircleHelp className="size-4" aria-hidden="true" />{tx('اسأل عن هذا المنتج', 'Ask about this product')}</Button>
      ) : needSignIn ? (
        <p className="text-sm">{tx('سجّل الدخول لتسأل. ', 'Sign in to ask. ')}<a className="font-semibold underline underline-offset-2" href={to('/account')}>{tx('تسجيل الدخول', 'Sign in')}</a></p>
      ) : (
        <div className={cn(PANEL, 'max-w-xl space-y-3 p-5')}>
          <h2 className={H3}>{tx('سؤالك عن المنتج', 'Your question')}</h2>
          {!acc.signedIn && <Field label={tx('اسمك', 'Your name')} error={tried && errs.name ? tx('اكتب اسمك', 'Enter your name') : null}>{(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm" />}</Field>}
          <Field label={tx('السؤال', 'Question')} error={tried && errs.text ? tx('بين 5 و500 حرف', 'Between 5 and 500 characters') : null}>{(p) => <Textarea {...p} dir="auto" value={text} onChange={(e) => setText(e.target.value)} />}</Field>
          <p className="text-xs text-muted">{lang === 'ar' ? 'يُنشر السؤال مع إجابة المتجر في هذه الصفحة.' : 'The question is published with the store’s answer on this page.'}</p>
          <div className="flex gap-2"><Button onClick={submit}><Send className="size-4" aria-hidden="true" />{tx('أرسل السؤال', 'Send question')}</Button><Button variant="ghost" onClick={() => setOpen(false)}>{tx('إلغاء', 'Cancel')}</Button></div>
          {tried && (errs.name || errs.text) && <p className={ERR} role="alert">{tx('راجع الحقول أعلاه', 'Check the fields above')}</p>}
        </div>
      )}
    </div>
  );
}
