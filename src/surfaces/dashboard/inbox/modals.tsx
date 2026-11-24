// Inbox dialogs. Every action that reaches the customer, the carrier, money or many cases is previewed here first.
// Resolution actions open the existing tools (refund, return, manual order, coupon editor) prefilled; nothing runs
// silently. Simulated where an external party is involved.
import { useState } from 'react';
import { Gift, PackagePlus, Plus, Send, Trash2, Truck, UserRound } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { useReviewMode } from '../../../core/review';
import { link, navigate } from '../../../core/router';
import { CARRIERS, shipmentRef, type CarrierId, type L, type Order } from '../../merchant/domain';
import { caseMessage, type NoticeChannel } from '../../merchant/ops';
import { cannedStore, couponsStore, customersStore, inboxStore, logAction, ordersStore, reviewsStore, settingsStore, teamStore } from '../../merchant/stores';
import {
  CASE_TYPES, SHIP_ISSUES, assignCase, cannedProblems, escalate, nextCaseId, recordAction, replyCase, setStatus, suggestPriority,
  type Canned, type Case, type CaseType, type ShipIssue,
} from '../../merchant/inbox';
import { parseMoney } from '../../merchant/catalog';
import type { CouponDraft } from '../../merchant/growth';
import { Alert, Checkbox, Field, Input, Modal, Select, Simulated, Switch, Textarea, useToast } from '../../../ds/kit';
import { Button, Money, ProductImage, Ref, cn, useTx } from '../../../ds/ui';
import { skuPhoto } from '../model/media';
import { saveOrder, useActor } from '../orders/ui';
import { manualDraftStore } from '../orders/new';
import { emptyManual, type ManualDraft } from '../orders/model';
import { TODAY, buildCoupon, checkDraft } from '../marketing/model';
import { useUnsaved } from '../unsaved';
import { bulkPlan, scriptMismatch, upsert, type CaseContext } from './model';
import { draftsStore, emptyDraft, saveCase, simStore, type ComposerDraft } from './state';
import { useInboxText } from './text';

const ERR = 'text-sm font-medium text-red-600 dark:text-red-400';

/* ---------- Contacts ---------- */

export interface Contact { email?: string; phone?: string }
export function contactOf(ctx: CaseContext): Contact {
  return { email: ctx.order?.contact?.email ?? ctx.customer?.email, phone: ctx.order?.contact?.phone ?? ctx.customer?.phone };
}
export const addressFor = (c: Contact, ch: NoticeChannel) => (ch === 'email' ? c.email : c.phone);
export const maskAddr = (v: string) => (v.includes('@') ? v.replace(/^(.).*(@.*)$/, '$1•••$2') : `•••• ${v.replace(/\D/g, '').slice(-4)}`);

/* ---------- Bulk assign / close ---------- */

export function BulkModal({ kind, all, ids, onClose }: { kind: 'assign' | 'close'; all: Case[]; ids: string[]; onClose: (done: boolean) => void }) {
  const tx = useTx();
  const toast = useToast();
  const who = useActor();
  const members = teamStore.use().members.filter((m) => m.status === 'active');
  const [to, setTo] = useState(members[0]?.name ?? '');
  const plan = bulkPlan(all, ids, kind, to || undefined);
  const run = () => {
    const now = Date.now();
    const before = inboxStore.get();
    const changed = plan.eligible.map((c) => (kind === 'assign' ? assignCase(c, to || undefined, who.name, now) : setStatus(c, 'resolved', who.name, now)));
    inboxStore.set((list) => changed.reduce(upsert, list));
    logAction('orders', kind === 'assign' ? { ar: `إسناد ${changed.length} حالة إلى ${to || 'لا أحد'}`, en: `Assigned ${changed.length} case(s) to ${to || 'nobody'}` } : { ar: `إغلاق ${changed.length} حالة دفعة واحدة`, en: `Closed ${changed.length} case(s) in bulk` }, { target: changed.slice(0, 10).map((c) => c.id).join(', ') });
    toast({ tone: 'ok', text: kind === 'assign' ? tx(`أُسندت ${changed.length} حالة`, `${changed.length} case(s) assigned`) : tx(`أُغلقت ${changed.length} حالة`, `${changed.length} case(s) closed`), action: { label: tx('تراجع', 'Undo'), run: () => { inboxStore.set(before); logAction('orders', { ar: 'تراجع عن إجراء جماعي في صندوق الخدمة', en: 'Undid a bulk inbox action' }); } } });
    onClose(true);
  };
  return (
    <Modal title={kind === 'assign' ? tx(`إسناد ${ids.length} حالة`, `Assign ${ids.length} case(s)`) : tx(`إغلاق ${ids.length} حالة`, `Close ${ids.length} case(s)`)} onClose={() => onClose(false)}
      footer={<><Button variant="secondary" onClick={() => onClose(false)}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={!plan.eligible.length} onClick={run}>{kind === 'assign' ? tx(`أسند ${plan.eligible.length}`, `Assign ${plan.eligible.length}`) : tx(`أغلق ${plan.eligible.length}`, `Close ${plan.eligible.length}`)}</Button></>}>
      {kind === 'assign' && (
        <Field label={tx('إلى', 'To')}>{(p) => <Select {...p} value={to} onChange={(e) => setTo(e.target.value)}>{members.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}<option value="">{tx('بلا مسؤول', 'Nobody')}</option></Select>}</Field>
      )}
      <ul className="space-y-1.5 text-sm">
        <li className="flex justify-between"><span className="text-muted">{tx('تتغير', 'Will change')}</span><span className="font-semibold tabular-nums">{plan.eligible.length}</span></li>
        {plan.skipped > 0 && <li className="flex justify-between"><span className="text-muted">{kind === 'close' ? tx('محلولة من قبل', 'Already resolved') : tx('مسندة له من قبل', 'Already assigned to them')}</span><span className="tabular-nums">{plan.skipped}</span></li>}
      </ul>
      {kind === 'close' && plan.loose.length > 0 && <Alert tone="warn" title={tx(`${plan.loose.length} منها لها عمل مفتوح في مكان آخر`, `${plan.loose.length} still have work open elsewhere`)}>{tx('بلاغ الناقل أو المرتجع يبقى مفتوحًا في مكانه.', 'The carrier ticket or the return stays open where it is.')} <Ref>{plan.loose.join(', ')}</Ref></Alert>}
      {kind === 'close' && <p className="text-xs text-muted">{tx('لا تصل رسالة للعملاء. يمكنك التراجع بعد الإغلاق.', 'Customers get no message. You can undo after closing.')}</p>}
    </Modal>
  );
}

/* ---------- Reply preview & send ---------- */

export function ReplyModal({ c, ctx, d, channel, onClose }: { c: Case; ctx: CaseContext; d: ComposerDraft; channel: NoticeChannel | 'store'; onClose: (msg?: string, tone?: 'ok' | 'bad') => void }) {
  const tx = useTx();
  const { lang: ui } = useLang();
  const T = useInboxText();
  const who = useActor();
  const sim = simStore.use();
  const store = settingsStore.use().store.name;
  const lang = d.lang ?? c.lang;
  const contact = contactOf(ctx);
  const to = channel === 'store' ? undefined : addressFor(contact, channel);
  const isQuestion = c.type === 'question' && channel === 'store';
  const review = c.sourceId ? reviewsStore.get().find((r) => r.id === c.sourceId) : undefined;
  const mismatch = scriptMismatch(d.text, lang);
  const send = () => {
    const now = Date.now();
    const text = d.text.trim();
    if (isQuestion || channel === 'store') {
      if (review) reviewsStore.set((l) => l.map((r) => (r.id === review.id ? { ...r, reply: { text, by: who.name, at: TODAY }, status: 'published', log: [...r.log, { what: 'replied', by: who.name, at: TODAY }] } : r)));
      saveCase(replyCase(c, { text, lang, channel: 'email', status: 'sent', close: true }, who.name, now) , { ar: `ردّ على السؤال ${c.sourceId} ونُشر في صفحة المنتج`, en: `Answered question ${c.sourceId}; published on the product page` });
      draftsStore.set((x) => ({ ...x, [c.id]: emptyDraft() }));
      onClose(tx('نُشرت الإجابة في صفحة المنتج', 'Answer published on the product page'));
      return;
    }
    const status = !to || sim.failSend ? 'failed' : 'sent';
    let next = replyCase(c, { text, lang, channel, status, close: d.close }, who.name, now);
    if (ctx.order) saveOrder(caseMessage(ctx.order, { channel, lang, to, subject: tx(`بخصوص طلبك #${ctx.order.ref}`, `About your order #${ctx.order.ref}`), body: text, fail: sim.failSend, caseId: c.id }, who, now));
    if (status === 'sent' && c.type === 'review' && d.publicToo && review) {
      reviewsStore.set((l) => l.map((r) => (r.id === review.id ? { ...r, reply: { text, by: who.name, at: TODAY }, log: [...r.log, { what: 'replied', by: who.name, at: TODAY }] } : r)));
      next = { ...next, log: [...next.log, { what: 'publicReply', by: who.name, at: now }] };
    }
    saveCase(next, status === 'sent' ? { ar: `ردّ على ${c.id} عبر ${T.channel(channel)}`, en: `Replied to ${c.id} by ${channel}` } : { ar: `تعذّر إرسال رد ${c.id}`, en: `Reply to ${c.id} failed` });
    if (status === 'sent') { draftsStore.set((x) => ({ ...x, [c.id]: emptyDraft() })); onClose(d.close ? tx('أُرسل الرد وأُغلقت الحالة', 'Reply sent; case resolved') : tx('أُرسل الرد؛ الحالة بانتظار العميل', 'Reply sent; waiting on the customer')); }
    else onClose(!to ? tx(`لا ${T.channel(channel)} للعميل؛ لم يُرسل شيء. اختر قناة أخرى.`, `No customer ${T.channel(channel).toLowerCase()}; nothing was sent. Pick another channel.`) : tx('لم يقبل مزوّد الرسائل الرد؛ النص محفوظ، أعد المحاولة.', 'The message provider did not accept it; your text is kept, try again.'), 'bad');
  };
  return (
    <Modal size="lg" title={isQuestion ? tx('معاينة الإجابة', 'Preview the answer') : tx('معاينة الرد', 'Preview the reply')} onClose={() => onClose()}
      footer={<><Button variant="secondary" onClick={() => onClose()}>{tx('عدّل', 'Edit')}</Button><Button onClick={send}><Send className="size-4" aria-hidden="true" />{isQuestion ? tx('انشر الإجابة', 'Publish answer') : tx('أرسل', 'Send')}</Button></>}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-muted">{tx('إلى', 'To')}</dt><dd className="font-medium text-fg">{c.customer[ui]}</dd></div>
        <div><dt className="text-xs text-muted">{tx('القناة', 'Channel')}</dt><dd className="font-medium text-fg">{isQuestion ? tx('صفحة المنتج (علني)', 'Product page (public)') : <>{T.channel(channel)}{to ? <span className="block text-xs text-muted"><bdi dir="ltr">{maskAddr(to)}</bdi></span> : <span className="block text-xs text-red-600 dark:text-red-400">{tx('لا عنوان', 'No address')}</span>}</>}</dd></div>
        <div><dt className="text-xs text-muted">{tx('اللغة', 'Language')}</dt><dd className="font-medium text-fg">{lang === 'ar' ? 'العربية' : 'English'}{lang === c.lang && <span className="block text-xs text-muted">{tx('لغة العميل', 'Customer’s language')}</span>}</dd></div>
      </dl>
      <div className="rounded-2xl border border-border bg-surface-2 p-4" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
        <p className="mb-2 text-xs text-muted">{isQuestion ? tx('كما تظهر للمتسوقين', 'As shoppers see it') : tx('ما يصل للعميل', 'What the customer receives')}</p>
        {!isQuestion && channel === 'email' && <p className="mb-1 text-sm font-semibold text-fg">{lang === 'ar' ? `بخصوص طلبك #${ctx.order?.ref ?? ''}` : `About your order #${ctx.order?.ref ?? ''}`}</p>}
        <p className="whitespace-pre-line break-words text-sm leading-relaxed text-fg">{d.text.trim()}</p>
        {!isQuestion && <p className="mt-3 text-xs text-muted">— {store}</p>}
      </div>
      {mismatch && <Alert tone="warn">{lang === 'ar' ? tx('الرد ليس بالعربية، والعميل يقرأ العربية.', 'The reply is not in Arabic, and this customer reads Arabic.') : tx('الرد ليس بالإنجليزية، والعميل يقرأ الإنجليزية.', 'The reply is not in English, and this customer reads English.')}</Alert>}
      <ul className="space-y-1 text-xs text-muted">
        {!isQuestion && <li>{d.close ? tx('تُغلق الحالة بعد الإرسال.', 'The case closes after sending.') : tx('تنتقل الحالة إلى «بانتظار العميل» وتتوقف المهلة.', 'The case moves to “waiting on customer” and the clock pauses.')}</li>}
        {!isQuestion && ctx.order && <li>{tx(`يُسجّل في رسائل الطلب #${ctx.order.ref}.`, `Logged in order #${ctx.order.ref}’s messages.`)}</li>}
        {isQuestion && <li>{tx('تُنشر الإجابة مع السؤال في صفحة المنتج وتُغلق الحالة.', 'The answer is published with the question on the product page and the case closes.')}</li>}
        {c.type === 'review' && d.publicToo && <li>{tx('ويُنشر النص نفسه ردًا علنيًا تحت التقييم.', 'The same text is also posted as a public reply under the review.')}</li>}
      </ul>
      <div className="flex items-center gap-2"><Simulated /><span className="text-xs text-muted">{tx('لا يُرسل شيء فعليًا.', 'Nothing is actually sent.')}</span></div>
    </Modal>
  );
}

/* ---------- Escalate to carrier ---------- */

export function EscalateModal({ c, order, onClose }: { c: Case; order?: Order; onClose: (msg?: string, tone?: 'ok' | 'bad') => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const T = useInboxText();
  const who = useActor();
  const review = useReviewMode();
  const sim = simStore.use();
  const parcel = order?.fulfilments.filter((f) => !f.voided).at(-1);
  const [carrier, setCarrier] = useState<CarrierId>(c.ship?.carrier ?? parcel?.carrier ?? 'a');
  const [tracking, setTracking] = useState(c.ship?.tracking ?? parcel?.tracking ?? parcel?.ref ?? (order && order.ship !== 'none' ? shipmentRef(order) : ''));
  const [issue, setIssue] = useState<ShipIssue>(c.ship?.issue ?? 'late');
  const [tried, setTried] = useState(false);
  const run = () => {
    setTried(true);
    if (!tracking.trim()) return;
    const now = Date.now();
    const base: Case = { ...c, ship: { ...(c.ship ?? { issue }), issue } };
    const next = escalate(base, carrier, tracking.trim(), who.name, now, sim.failCarrier);
    if (next.ship?.ticket?.state === 'failed') {
      saveCase(next, { ar: `تعذّر فتح بلاغ لدى الناقل للحالة ${c.id}`, en: `Carrier ticket for ${c.id} failed` });
      onClose(tx('لم يستجب الناقل؛ لم يُفتح بلاغ. أعد المحاولة بعد قليل.', 'The carrier did not respond; no ticket was opened. Try again shortly.'), 'bad');
      return;
    }
    saveCase(next, { ar: `صعّد ${c.id} إلى ${CARRIERS[carrier].name.ar} (${next.ship?.ticket?.id})`, en: `Escalated ${c.id} to ${CARRIERS[carrier].name.en} (${next.ship?.ticket?.id})` });
    onClose(tx(`فُتح البلاغ ${next.ship?.ticket?.id} لدى الناقل`, `Ticket ${next.ship?.ticket?.id} opened with the carrier`));
  };
  return (
    <Modal title={tx('تصعيد إلى شركة الشحن', 'Escalate to the carrier')} onClose={() => onClose()}
      footer={<><Button variant="secondary" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={run}><Truck className="size-4" aria-hidden="true" />{tx('افتح البلاغ', 'Open ticket')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tx('الناقل', 'Carrier')}>{(p) => <Select {...p} value={carrier} onChange={(e) => setCarrier(e.target.value as CarrierId)}>{(Object.keys(CARRIERS) as CarrierId[]).map((k) => <option key={k} value={k}>{CARRIERS[k].name[lang]}</option>)}</Select>}</Field>
        <Field label={tx('المشكلة', 'Problem')}>{(p) => <Select {...p} value={issue} onChange={(e) => setIssue(e.target.value as ShipIssue)}>{SHIP_ISSUES.map((i) => <option key={i} value={i}>{T.issue(i)}</option>)}</Select>}</Field>
      </div>
      <Field label={tx('رقم التتبع', 'Tracking number')} error={tried && !tracking.trim() ? tx('أدخل رقم التتبع', 'Enter the tracking number') : null}>{(p) => <Input {...p} dir="ltr" value={tracking} onChange={(e) => setTracking(e.target.value)} />}</Field>
      <div className="rounded-xl bg-surface-2 p-3 text-sm">
        <p className="mb-1 text-xs text-muted">{tx('ما يستلمه الناقل', 'What the carrier receives')}</p>
        <p className="text-fg">{T.issue(issue)} · <Ref>{tracking || '—'}</Ref>{order && <> · #{order.ref} · {order.city[lang]}</>}</p>
      </div>
      <p className="text-xs text-muted">{tx('تنتقل الحالة إلى «لدى الناقل»، ومهلته 48 ساعة. العميل لا يصله شيء.', 'The case moves to “with the carrier”, who has 48 hours. The customer gets nothing.')}</p>
      <div className="flex flex-wrap items-center gap-3"><Simulated />{review && <span className="flex items-center gap-2 text-xs"><Switch checked={sim.failCarrier} onChange={(v) => simStore.set((s) => ({ ...s, failCarrier: v }))} label={tx('محاكاة: الناقل لا يستجيب', 'Simulate: carrier not responding')} /><span aria-hidden="true">{tx('محاكاة: الناقل لا يستجيب', 'Simulate: carrier not responding')}</span></span>}</div>
    </Modal>
  );
}

/* ---------- Goodwill coupon: a draft coupon opened in the coupon editor ---------- */

export function CouponModal({ c, onClose }: { c: Case; onClose: (msg?: string) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const who = useActor();
  const all = couponsStore.use();
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('15');
  const [code, setCode] = useState(`SORRY${c.id.replace(/\D/g, '').slice(-4)}`);
  const [tried, setTried] = useState(false);
  const ends = new Date(Date.parse(`${TODAY}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
  const draft: CouponDraft = { code: code.trim().toUpperCase(), type, value, minSpend: '', limitTotal: '1', limitPerCustomer: '1', starts: TODAY, ends, auto: false, scopeKind: 'all', scopeIds: [] };
  const errors = checkDraft(draft, all, parseMoney);
  const run = () => {
    setTried(true);
    if (Object.keys(errors).length) return;
    const coupon = { ...buildCoupon(draft, parseMoney), status: 'draft' as const };
    couponsStore.set((l) => [coupon, ...l]);
    saveCase(recordAction(c, 'coupon', coupon.code, who.name, Date.now()), { ar: `مسودة كوبون ${coupon.code} تعويضًا في ${c.id}`, en: `Draft goodwill coupon ${coupon.code} for ${c.id}` });
    onClose(tx(`أُنشئ الكوبون ${coupon.code} كمسودة؛ فعّله من المحرر`, `Coupon ${coupon.code} created as a draft; activate it in the editor`));
    navigate(link(`/dashboard/marketing/coupons/${coupon.code}`));
  };
  const e = tried ? errors : {};
  return (
    <Modal title={tx('كوبون تعويض', 'Goodwill coupon')} description={tx(`لـ${c.customer[lang]}، استخدام واحد، 30 يومًا.`, `For ${c.customer[lang]}, single use, 30 days.`)} onClose={() => onClose()}
      footer={<><Button variant="secondary" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={run}><Gift className="size-4" aria-hidden="true" />{tx('أنشئ مسودة وافتح المحرر', 'Create draft & open editor')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tx('النوع', 'Type')}>{(p) => <Select {...p} value={type} onChange={(ev) => setType(ev.target.value as 'percent' | 'fixed')}><option value="percent">{tx('نسبة %', 'Percent %')}</option><option value="fixed">{tx('مبلغ ثابت', 'Fixed amount')}</option></Select>}</Field>
        <Field label={type === 'percent' ? tx('النسبة', 'Percent') : tx('المبلغ (ر.س)', 'Amount (SAR)')} error={e.value ? tx('قيمة غير صالحة', 'Invalid value') : null}>{(p) => <Input {...p} inputMode="decimal" dir="ltr" value={value} onChange={(ev) => setValue(ev.target.value)} />}</Field>
      </div>
      <Field label={tx('الكود', 'Code')} hint={tx('4–16 حرفًا لاتينيًا أو رقمًا', '4–16 Latin letters or digits')} error={e.code ? (e.code === 'codeTaken' ? tx('الكود مستخدم', 'Code already used') : tx('كود غير صالح', 'Invalid code')) : null}>{(p) => <Input {...p} dir="ltr" value={code} onChange={(ev) => setCode(ev.target.value.toUpperCase())} />}</Field>
      <p className="text-xs text-muted">{tx('يُنشأ مسودة لا تعمل في المتجر حتى تفعّلها من محرر الكوبونات. أرسل الكود للعميل في ردك.', 'It is created as a draft that does not work in the store until you activate it in the coupon editor. Send the code to the customer in your reply.')}</p>
    </Modal>
  );
}

/* ---------- Reship: a manual order prefilled with the lines, free shipping and a full discount ---------- */

export function reshipDraft(o: Order, customerId: string | undefined, caseId: string): ManualDraft {
  const subtotal = o.items.reduce((s, it) => s + it.unit * it.qty, 0);
  return {
    ...emptyManual(), customerId: customerId ?? '', newName: customerId ? '' : o.customer.ar, newPhone: customerId ? '' : o.contact?.phone ?? '',
    city: o.city.en, address: o.address?.line ?? '', addressNote: o.address?.notes ?? '', customerNote: `بديل عن الطلب #${o.ref} (${caseId})`,
    lines: o.items.map((it) => ({ sku: it.sku, qty: String(it.qty) })), freeShipping: true, discount: (subtotal / 100).toFixed(2), pay: 'cash',
  };
}
export function ReshipModal({ c, order, customerId, onClose }: { c: Case; order: Order; customerId?: string; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const who = useActor();
  const current = manualDraftStore.use();
  const busy = JSON.stringify(current) !== JSON.stringify(emptyManual());
  const run = () => {
    manualDraftStore.set(reshipDraft(order, customerId, c.id));
    saveCase(recordAction(c, 'reship', `#${order.ref}`, who.name, Date.now()), { ar: `فتح طلب بديل للطلب #${order.ref} من ${c.id}`, en: `Opened a replacement order for #${order.ref} from ${c.id}` });
    onClose();
    navigate(link('/dashboard/orders/new'));
  };
  return (
    <Modal title={tx('أرسل بديلًا', 'Send a replacement')} description={tx('يفتح «طلب يدوي» معبّأً؛ تراجعه وتنشئه بنفسك.', 'Opens “Manual order” prefilled; you review and create it yourself.')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={run}><PackagePlus className="size-4" aria-hidden="true" />{tx('افتح الطلب اليدوي', 'Open manual order')}</Button></>}>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {order.items.map((it, i) => (
          <li key={it.sku + i} className="flex items-center gap-3 px-3 py-2"><ProductImage src={skuPhoto(it.sku)} alt="" size={36} /><span className="min-w-0 flex-1 truncate text-sm text-fg">{it.name[lang]}</span><span className="text-sm tabular-nums text-muted">×{it.qty}</span></li>
        ))}
      </ul>
      <ul className="space-y-1 text-sm">
        <li className="flex justify-between"><span className="text-muted">{tx('الشحن', 'Shipping')}</span><span>{tx('مجاني', 'Free')}</span></li>
        <li className="flex justify-between"><span className="text-muted">{tx('خصم كامل', 'Full discount')}</span><Money v={order.items.reduce((s, it) => s + it.unit * it.qty, 0)} /></li>
        <li className="flex justify-between"><span className="text-muted">{tx('المخزون', 'Stock')}</span><span>{tx('يُحجز عند الإنشاء', 'Held when created')}</span></li>
      </ul>
      {busy && <Alert tone="warn">{tx('لديك مسودة طلب يدوي غير محفوظة؛ ستُستبدل بهذه.', 'You have an unsaved manual order draft; it will be replaced by this one.')}</Alert>}
    </Modal>
  );
}

/* ---------- Canned replies (bilingual, editable) ---------- */

export function CannedModal({ onClose }: { onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const T = useInboxText();
  const toast = useToast();
  const list = cannedStore.use();
  const [id, setId] = useState<string>(list[0]?.id ?? 'new');
  const base = list.find((x) => x.id === id);
  const blank: Canned = { id: 'new', title: { ar: '', en: '' }, body: { ar: '', en: '' }, types: [...CASE_TYPES] };
  const [d, setD] = useState<Canned>(base ?? blank);
  const [tried, setTried] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(base ?? blank);
  useUnsaved(dirty, { ar: 'رد جاهز', en: 'Canned reply' });
  const probs = cannedProblems(d);
  const pick = (next: string) => { if (dirty && !window.confirm(tx('تجاهل تعديلات هذا الرد؟', 'Discard edits to this reply?'))) return; const b = list.find((x) => x.id === next); setId(next); setD(b ?? blank); setTried(false); };
  const save = () => {
    setTried(true);
    if (probs.length || !d.types.length) return;
    const saved: Canned = d.id === 'new' ? { ...d, id: `cn-${Date.now()}` } : d;
    cannedStore.set((l) => (l.some((x) => x.id === saved.id) ? l.map((x) => (x.id === saved.id ? saved : x)) : [...l, saved]));
    logAction('settings', { ar: `حفظ الرد الجاهز «${saved.title.ar}»`, en: `Saved canned reply “${saved.title.en}”` });
    setId(saved.id); setD(saved); setTried(false);
    toast({ tone: 'ok', text: tx('حُفظ الرد الجاهز', 'Canned reply saved') });
  };
  const remove = () => {
    if (!base) return;
    const at = list.findIndex((x) => x.id === base.id);
    cannedStore.set((l) => l.filter((x) => x.id !== base.id));
    logAction('settings', { ar: `حذف الرد الجاهز «${base.title.ar}»`, en: `Deleted canned reply “${base.title.en}”` });
    toast({ tone: 'info', text: tx('حُذف الرد', 'Reply deleted'), action: { label: tx('تراجع', 'Undo'), run: () => cannedStore.set((l) => [...l.slice(0, at), base, ...l.slice(at)]) } });
    const nxt = list.find((x) => x.id !== base.id);
    setId(nxt?.id ?? 'new'); setD(nxt ?? blank);
  };
  const set = (p: Partial<Canned>) => setD((x) => ({ ...x, ...p }));
  return (
    <Modal size="lg" title={tx('الردود الجاهزة', 'Canned replies')} description={tx('بالعربية والإنجليزية؛ يُختار نص لغة العميل تلقائيًا.', 'In Arabic and English; the customer’s language is picked automatically.')} onClose={onClose}
      footer={<>{base && <Button variant="ghost" className="me-auto text-red-700 dark:text-red-400" onClick={remove}><Trash2 className="size-4" aria-hidden="true" />{tx('احذف', 'Delete')}</Button>}<Button variant="secondary" onClick={onClose}>{tx('إغلاق', 'Close')}</Button><Button disabled={!dirty} onClick={save}>{tx('احفظ الرد', 'Save reply')}</Button></>}>
      <div className="flex flex-wrap items-end gap-2">
        <Field label={tx('الرد', 'Reply')} className="min-w-0 flex-1">{(p) => <Select {...p} value={id} onChange={(e) => pick(e.target.value)}>{list.map((x) => <option key={x.id} value={x.id}>{x.title[lang]}</option>)}{id === 'new' && <option value="new">{tx('رد جديد', 'New reply')}</option>}</Select>}</Field>
        <Button variant="secondary" onClick={() => pick('new')}><Plus className="size-4" aria-hidden="true" />{tx('رد جديد', 'New reply')}</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tx('العنوان بالعربية', 'Title in Arabic')} error={tried && !d.title.ar.trim() ? tx('مطلوب', 'Required') : null}>{(p) => <Input {...p} dir="rtl" value={d.title.ar} onChange={(e) => set({ title: { ...d.title, ar: e.target.value } })} />}</Field>
        <Field label={tx('العنوان بالإنجليزية', 'Title in English')} error={tried && !d.title.en.trim() ? tx('مطلوب', 'Required') : null}>{(p) => <Input {...p} dir="ltr" value={d.title.en} onChange={(e) => set({ title: { ...d.title, en: e.target.value } })} />}</Field>
        <Field label={tx('النص بالعربية', 'Text in Arabic')} error={tried && !d.body.ar.trim() ? tx('مطلوب', 'Required') : null}>{(p) => <Textarea {...p} dir="rtl" value={d.body.ar} onChange={(e) => set({ body: { ...d.body, ar: e.target.value } })} />}</Field>
        <Field label={tx('النص بالإنجليزية', 'Text in English')} error={tried && !d.body.en.trim() ? tx('مطلوب', 'Required') : null}>{(p) => <Textarea {...p} dir="ltr" value={d.body.en} onChange={(e) => set({ body: { ...d.body, en: e.target.value } })} />}</Field>
      </div>
      <p className="text-xs text-muted">{tx('متغيرات: ', 'Variables: ')}<bdi dir="ltr">{'{customer} {order} {store} {tracking} {product}'}</bdi></p>
      {tried && probs.includes('unknownVar') && <p role="alert" className={ERR}>{tx('متغير غير معروف في النص', 'Unknown variable in the text')}</p>}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-fg">{tx('يظهر في', 'Shown for')}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">{CASE_TYPES.map((t) => <label key={t} className="flex items-center gap-2 text-sm"><Checkbox label={T.type(t)} checked={d.types.includes(t)} onChange={(on) => set({ types: on ? [...d.types, t] : d.types.filter((x) => x !== t) })} /><span aria-hidden="true">{T.type(t)}</span></label>)}</div>
        {tried && !d.types.length && <p role="alert" className={cn(ERR, 'mt-2')}>{tx('اختر نوعًا واحدًا على الأقل', 'Choose at least one type')}</p>}
      </fieldset>
    </Modal>
  );
}

/* ---------- New case logged by staff (a call, an email, a WhatsApp message) ---------- */

export function NewCaseModal({ onClose }: { onClose: (id?: string) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const T = useInboxText();
  const who = useActor();
  const orders = ordersStore.use();
  const customers = customersStore.use();
  const [ref, setRef] = useState('');
  const [type, setType] = useState<CaseType>('complaint');
  const [issue, setIssue] = useState<ShipIssue>('late');
  const [via, setVia] = useState<'email' | 'whatsapp' | 'staff'>('staff');
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  useUnsaved(!!text.trim() || !!ref.trim(), { ar: 'حالة جديدة', en: 'New case' });
  const norm = ref.replace(/[٠-٩]/g, (x) => String(x.charCodeAt(0) - 0x0660)).replace(/\D/g, '');
  const order = orders.find((o) => o.ref === norm);
  const errs = { ref: !order, text: text.trim().length < 5 };
  const run = () => {
    setTried(true);
    if (errs.ref || errs.text || !order) return;
    const now = Date.now();
    const list = inboxStore.get();
    const id = nextCaseId(list);
    const cust = customers.find((x) => x.id === order.customerId) ?? customers.find((x) => x.name.en === order.customer.en);
    const subject: L = type === 'shipping' ? { ar: `مشكلة شحن: ${T.issue(issue)}`, en: `Shipping: ${issue}` } : { ar: `${{ complaint: 'شكوى', return: 'طلب إرجاع', question: 'سؤال', shipping: 'شحن', review: 'تقييم', message: 'رسالة' }[type]} عن الطلب`, en: `${{ complaint: 'Complaint', return: 'Return request', question: 'Question', shipping: 'Shipping', review: 'Review', message: 'Message' }[type]} about the order` };
    const c: Case = {
      id, type, status: 'new', priority: suggestPriority(type, { issue }), subject, source: via, orderRef: order.ref, customerId: cust?.id, customer: order.customer, lang: order.lang ?? 'ar',
      openedAt: now, updatedAt: now, waitingSince: now, ship: type === 'shipping' ? { issue, carrier: order.fulfilments.at(-1)?.carrier, tracking: order.fulfilments.at(-1)?.tracking ?? order.fulfilments.at(-1)?.ref } : undefined,
      messages: [{ id: `${id}-M1`, from: 'customer', text: text.trim(), lang: /[؀-ۿ]/.test(text) ? 'ar' : 'en', at: now, channel: via === 'staff' ? undefined : via }],
      notes: [], actions: [], log: [{ what: 'opened', by: who.name, at: now }],
    };
    saveCase(c, { ar: `فتح الحالة ${id} للطلب #${order.ref}`, en: `Opened case ${id} for order #${order.ref}` });
    onClose(id);
  };
  return (
    <Modal title={tx('حالة جديدة', 'New case')} description={tx('لما يصلك من العميل بالهاتف أو البريد أو واتساب.', 'For what a customer told you by phone, email or WhatsApp.')} onClose={() => onClose()}
      footer={<><Button variant="secondary" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={run}><Plus className="size-4" aria-hidden="true" />{tx('افتح الحالة', 'Open case')}</Button></>}>
      <Field label={tx('رقم الطلب', 'Order number')} error={tried && errs.ref ? tx('لا طلب بهذا الرقم', 'No order with this number') : null} hint={order ? `${order.customer[lang]} · ${order.city[lang]}` : undefined}>
        {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="10477" />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tx('النوع', 'Type')}>{(p) => <Select {...p} value={type} onChange={(e) => setType(e.target.value as CaseType)}>{CASE_TYPES.filter((t) => t !== 'review' && t !== 'question').map((t) => <option key={t} value={t}>{T.type(t)}</option>)}</Select>}</Field>
        {type === 'shipping'
          ? <Field label={tx('المشكلة', 'Problem')}>{(p) => <Select {...p} value={issue} onChange={(e) => setIssue(e.target.value as ShipIssue)}>{SHIP_ISSUES.map((i) => <option key={i} value={i}>{T.issue(i)}</option>)}</Select>}</Field>
          : <Field label={tx('وصلت عبر', 'Came in by')}>{(p) => <Select {...p} value={via} onChange={(e) => setVia(e.target.value as typeof via)}><option value="staff">{tx('هاتف', 'Phone')}</option><option value="email">{tx('بريد', 'Email')}</option><option value="whatsapp">{tx('واتساب', 'WhatsApp')}</option></Select>}</Field>}
      </div>
      <Field label={tx('ما قاله العميل', 'What the customer said')} error={tried && errs.text ? tx('اكتب 5 أحرف على الأقل', 'Write at least 5 characters') : null}>{(p) => <Textarea {...p} dir="auto" value={text} onChange={(e) => setText(e.target.value)} />}</Field>
      <p className="flex items-center gap-1.5 text-xs text-muted"><UserRound className="size-3.5" aria-hidden="true" />{tx('لا يصل العميل شيء عند فتح الحالة.', 'The customer gets nothing when the case opens.')}</p>
    </Modal>
  );
}

