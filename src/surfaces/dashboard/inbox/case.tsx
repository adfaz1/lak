// One case: the conversation with internal notes and history, a composer with bilingual canned replies and a
// preview in the customer's language, and the context Salla keeps on other pages: the order (payment, fulfilment,
// shipment, items), the customer's value, the review or return it came from, and resolution actions in context.
import { Fragment, useState, type ReactNode } from 'react';
import {
  ArrowLeft, ArrowRight, CheckCircle2, CircleDollarSign, ExternalLink, FlaskConical, Gift, Lock, MessageSquareReply, PackagePlus, RotateCcw,
  Send, StickyNote, Truck, UserRound,
} from 'lucide-react';
import { useLang } from '../../../core/lang';
import { useReviewMode } from '../../../core/review';
import { link } from '../../../core/router';
import { formatInt } from '../../../core/format';
import { CARRIERS, total } from '../../merchant/domain';
import { canRefund } from '../../merchant/domain';
import { openReturns, parcelShip, type NoticeChannel } from '../../merchant/ops';
import { can } from '../../merchant/perms';
import { cannedStore, ordersStore, productsStore, reviewsStore, settingsStore, teamStore, testStore } from '../../merchant/stores';
import {
  CASE_STATUSES, PRIORITIES, addCaseNote, assignCase, carrierAnswers, customerWrites, fillCanned, recordAction, replyProblem, setPriority, setStatus,
  type Case, type CaseStatus, type Priority,
} from '../../merchant/inbox';
import { Field, Select, Simulated, Switch, Textarea, useToast } from '../../../ds/kit';
import { Badge, Button, Card, CardHeader, InfoHint, LinkButton, Money, ProductImage, Ref, Segmented, cn, useTx } from '../../../ds/ui';
import { productPhoto, skuPhoto } from '../model/media';
import { FulBadge, PayBadge, ShipBadge, useActor, useAge } from '../orders/ui';
import { When } from '../orders/detail';
import { RefundModal } from '../orders/refund';
import { OpenReturnModal } from '../orders/ops-modals';
import { rhref } from '../orders/returns-link';
import { canRefundOrder } from '../orders/model';
import { Stars } from '../marketing/storefront-reviews';
import { useUnsaved } from '../unsaved';
import { caseContext, cannedFor, cannedVars, scriptMismatch, type CaseContext, type Sources } from './model';
import { draftsStore, emptyDraft, saveCase, simStore, type ComposerDraft } from './state';
import { PRIO_TONE, SlaChip, StatusBadge, TypeIcon, useInboxText } from './text';
import { CouponModal, EscalateModal, ReplyModal, ReshipModal, addressFor, contactOf, maskAddr } from './modals';

type Dlg = 'reply' | 'escalate' | 'coupon' | 'reship' | 'refund' | 'return' | null;

export function useCasePerms() {
  const role = testStore.use().role;
  return {
    reply: can(role, 'customer.message') || can(role, 'order.fulfil'),
    refund: can(role, 'order.refund'),
    fulfil: can(role, 'order.fulfil'),
    coupon: can(role, 'marketing.manage'),
    manage: can(role, 'customer.message') || can(role, 'order.fulfil') || can(role, 'order.refund'),
  };
}

export function CaseView({ c, all, src, now, backHref }: { c: Case; all: Case[]; src: Sources; now: number; backHref: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const T = useInboxText();
  const toast = useToast();
  const who = useActor();
  const perms = useCasePerms();
  const review = useReviewMode();
  const members = teamStore.use().members.filter((m) => m.status === 'active');
  const ctx = caseContext(c, all, src);
  const [dlg, setDlg] = useState<Dlg>(null);
  const Back = lang === 'ar' ? ArrowRight : ArrowLeft;

  const change = (next: Case, ar: string, en: string, undo?: Case) => {
    if (next === c) return;
    saveCase(next, { ar, en });
    toast({ tone: 'ok', text: tx(ar, en), action: undo ? { label: tx('تراجع', 'Undo'), run: () => saveCase(undo, { ar: `تراجع في ${c.id}`, en: `Undo on ${c.id}` }) } : undefined });
  };
  const onStatus = (s: CaseStatus) => change(setStatus(c, s, who.name, Date.now()), `${c.id}: ${T.status(s)}`, `${c.id}: ${T.status(s)}`, c);
  const onPrio = (p: Priority) => change(setPriority(c, p, who.name, Date.now()), `${c.id}: أولوية ${T.prio(p)}`, `${c.id}: ${T.prio(p)} priority`, c);
  const onAssign = (n: string) => change(assignCase(c, n || undefined, who.name, Date.now()), n ? `أُسندت ${c.id} إلى ${n}` : `${c.id} بلا مسؤول`, n ? `${c.id} assigned to ${n}` : `${c.id} unassigned`, c);
  const closeDlg = (msg?: string, tone: 'ok' | 'bad' = 'ok') => { setDlg(null); if (msg) toast({ tone, text: msg }); };

  const props = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Field label={tx('الحالة', 'Status')}>{(p) => <Select {...p} disabled={!perms.manage} value={c.status} onChange={(e) => onStatus(e.target.value as CaseStatus)}>{CASE_STATUSES.map((s) => <option key={s} value={s} disabled={s === 'carrier' && !c.ship?.ticket}>{T.status(s)}</option>)}</Select>}</Field>
      <Field label={tx('الأولوية', 'Priority')}>{(p) => <Select {...p} disabled={!perms.manage} value={c.priority} onChange={(e) => onPrio(e.target.value as Priority)}>{PRIORITIES.map((s) => <option key={s} value={s}>{T.prio(s)}</option>)}</Select>}</Field>
      <Field label={tx('المسؤول', 'Assignee')}>{(p) => <Select {...p} disabled={!perms.manage} value={c.assignee ?? ''} onChange={(e) => onAssign(e.target.value)}><option value="">{tx('بلا مسؤول', 'Nobody')}</option>{members.map((m) => <option key={m.id} value={m.name}>{m.name === who.name ? tx(`${m.name} (أنا)`, `${m.name} (me)`) : m.name}</option>)}</Select>}</Field>
      <div className="flex flex-col justify-end gap-1.5"><span className="text-sm font-semibold text-fg">{tx('المهلة', 'Reply time')}</span><span className="flex h-11 items-center"><SlaChip c={c} now={now} /></span></div>
    </div>
  );

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-start gap-3">
        <a href={backHref} className="mt-1 grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 lg:hidden" aria-label={tx('كل الحالات', 'All cases')}><Back className="size-5" aria-hidden="true" /></a>
        <TypeIcon t={c.type} className="hidden sm:grid" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-fg sm:text-xl">{c.subject[lang]}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
            <Ref>{c.id}</Ref>{c.orderRef && <><span aria-hidden="true">·</span><a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={link(`/dashboard/orders/${c.orderRef}`)}><Ref>#{c.orderRef}</Ref></a></>}<span aria-hidden="true">·</span><span>{T.type(c.type)}{c.ship && ` · ${T.issue(c.ship.issue)}`}</span><span aria-hidden="true">·</span><span>{T.source(c.source)}</span><span aria-hidden="true">·</span><When at={c.openedAt} />
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex"><StatusBadge s={c.status} />{(c.priority === 'urgent' || c.priority === 'high') && <Badge tone={PRIO_TONE[c.priority]}>{T.prio(c.priority)}</Badge>}</div>
      </div>

      <Card className="p-4">{props}</Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <Thread c={c} />
          {perms.reply ? <Composer c={c} ctx={ctx} onPreview={() => setDlg('reply')} /> : (
            <Card className="flex items-center gap-3 px-5 py-4 text-sm text-muted"><Lock className="size-4" aria-hidden="true" />{tx('الرد على العملاء يحتاج دور المالك أو التجهيز أو التسويق.', 'Replying to customers needs the owner, fulfilment or marketing role.')}</Card>
          )}
          {review && <ReviewPanel c={c} />}
        </div>
        <aside className="min-w-0 space-y-4" aria-label={tx('سياق الحالة', 'Case context')}>
          <Resolve c={c} ctx={ctx} open={setDlg} />
          {ctx.order ? <OrderCard ctx={ctx} /> : <Card className="px-5 py-4 text-sm text-muted">{tx('لا طلب مرتبط بهذه الحالة.', 'No order is linked to this case.')}</Card>}
          <CustomerCard c={c} ctx={ctx} />
          <SourceCard c={c} />
        </aside>
      </div>

      {dlg === 'reply' && <ReplyModal c={c} ctx={ctx} d={draftsStore.get()[c.id] ?? emptyDraft()} channel={channelOf(c, draftsStore.get()[c.id])} onClose={closeDlg} />}
      {dlg === 'escalate' && <EscalateModal c={c} order={ctx.order} onClose={closeDlg} />}
      {dlg === 'coupon' && <CouponModal c={c} onClose={closeDlg} />}
      {dlg === 'reship' && ctx.order && <ReshipModal c={c} order={ctx.order} customerId={ctx.customer?.id} onClose={() => setDlg(null)} />}
      {dlg === 'refund' && ctx.order && <RefundModal order={ctx.order} onClose={(msg) => {
        const after = ordersStore.get().find((o) => o.ref === ctx.order!.ref);
        const id = after && after.refunds.length > ctx.order!.refunds.length ? after.refunds.at(-1)?.id : undefined;
        if (id) saveCase(recordAction(c, 'refund', id, who.name, Date.now()), { ar: `استرداد ${id} من الحالة ${c.id}`, en: `Refund ${id} from case ${c.id}` });
        closeDlg(msg);
      }} />}
      {dlg === 'return' && ctx.order && <OpenReturnModal o={ctx.order} onClose={(msg, id) => {
        if (id) saveCase(recordAction(c, 'return', id, who.name, Date.now()), { ar: `مرتجع ${id} من الحالة ${c.id}`, en: `Return ${id} from case ${c.id}` });
        closeDlg(msg);
      }} />}
    </div>
  );
}

/** Channel for the reply: questions are answered on the product page; others by the draft's channel or the case's. */
function channelOf(c: Case, d?: ComposerDraft): NoticeChannel | 'store' {
  if (c.type === 'question' && !c.orderRef) return 'store';
  if (d?.channel) return d.channel as NoticeChannel | 'store';
  if (c.type === 'question') return 'store';
  const last = [...c.messages].reverse().find((m) => m.from !== 'system' && m.channel && m.channel !== 'store');
  return (last?.channel as NoticeChannel | undefined) ?? 'sms';
}

/* ---------- Conversation, notes and history in one timeline ---------- */

function Thread({ c }: { c: Case }) {
  const tx = useTx();
  const { lang } = useLang();
  const T = useInboxText();
  const items: { at: number; key: string; node: ReactNode }[] = [];
  for (const m of c.messages) {
    const mine = m.from === 'store';
    const carrier = m.from === 'carrier';
    items.push({
      at: m.at, key: m.id, node: (
        <li className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
          <div className={cn('max-w-[85%] rounded-2xl px-4 py-2.5', mine ? 'rounded-ee-md bg-brand-500/10' : carrier ? 'rounded-es-md border border-sky-500/30 bg-sky-500/5' : 'rounded-es-md bg-surface-2', m.status === 'failed' && 'border border-red-500/40')}>
            <p className="mb-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
              {carrier && <Truck className="size-3" aria-hidden="true" />}
              <span className="font-semibold">{mine ? m.by ?? tx('المتجر', 'Store') : carrier ? CARRIERS[m.by as 'a' | 'b']?.name[lang] ?? tx('الناقل', 'Carrier') : c.customer[lang]}</span>
              {m.channel && <><span aria-hidden="true">·</span><span>{T.channel(m.channel)}</span></>}
              <span aria-hidden="true">·</span><When at={m.at} />
            </p>
            <p className="whitespace-pre-line break-words text-sm leading-relaxed text-fg" dir="auto">{m.text}</p>
            {mine && m.status === 'failed' && <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">{tx('لم يُرسل', 'Not sent')}</p>}
          </div>
        </li>
      ),
    });
  }
  for (const n of c.notes) items.push({
    at: n.at, key: n.id, node: (
      <li className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 px-4 py-2.5">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-300"><StickyNote className="size-3" aria-hidden="true" /><span className="font-semibold">{tx('ملاحظة داخلية', 'Internal note')}</span><span aria-hidden="true">·</span><span>{n.by}</span><span aria-hidden="true">·</span><When at={n.at} /></p>
        <p className="whitespace-pre-line break-words text-sm text-fg" dir="auto">{n.text}</p>
      </li>
    ),
  });
  const evText = (what: string, detail?: string) => {
    if (what.startsWith('status:')) return tx(`الحالة: ${T.status(what.slice(7) as CaseStatus)}`, `Status: ${T.status(what.slice(7) as CaseStatus)}`);
    if (what.startsWith('priority:')) return tx(`الأولوية: ${T.prio(what.slice(9) as Priority)}`, `Priority: ${T.prio(what.slice(9) as Priority)}`);
    if (what.startsWith('action:')) {
      const k = what.slice(7);
      const name = ({ refund: tx('استرداد', 'Refund'), return: tx('مرتجع', 'Return'), reship: tx('طلب بديل', 'Replacement order'), coupon: tx('كوبون تعويض', 'Goodwill coupon') } as Record<string, string>)[k] ?? k;
      return `${name}${detail ? ` · ${detail}` : ''}`;
    }
    return ({
      assigned: tx(`أُسندت إلى ${detail}`, `Assigned to ${detail}`), unassigned: tx('أُزيل المسؤول', 'Unassigned'), escalated: tx(`صُعّدت للناقل · ${detail}`, `Escalated to carrier · ${detail}`),
      escalateFailed: tx('تعذّر التصعيد للناقل', 'Carrier escalation failed'), publicReply: tx('نُشر رد علني تحت التقييم', 'Public reply posted under the review'), replyFailed: tx('تعذّر إرسال رد', 'A reply was not sent'),
    } as Record<string, string>)[what];
  };
  for (const [i, e] of c.log.entries()) {
    const t = evText(e.what, e.detail);
    if (t) items.push({ at: e.at, key: `ev${i}`, node: <li className="flex items-center gap-3 text-[11px] text-muted"><span className="h-px flex-1 bg-border" aria-hidden="true" /><span>{t} · {e.by === 'customer' ? tx('العميل', 'customer') : e.by} · <When at={e.at} /></span><span className="h-px flex-1 bg-border" aria-hidden="true" /></li> });
  }
  items.sort((a, b) => a.at - b.at);
  return (
    <Card aria-labelledby="h-thread">
      <CardHeader id="h-thread" title={<span className="flex items-center gap-1.5">{tx('المحادثة', 'Conversation')}<InfoHint>{tx('رسائل العميل وردودك وملاحظات الفريق وسجل الحالة، بالترتيب.', 'Customer messages, your replies, team notes and the case history, in order.')}</InfoHint></span>} />
      <ol className="space-y-3 px-4 pb-5 sm:px-5">{items.map((x) => <Fragment key={x.key}>{x.node}</Fragment>)}</ol>
    </Card>
  );
}

/* ---------- Composer: reply to the customer or an internal note ---------- */

function Composer({ c, ctx, onPreview }: { c: Case; ctx: CaseContext; onPreview: () => void }) {
  const tx = useTx();
  const { lang: ui } = useLang();
  const T = useInboxText();
  const toast = useToast();
  const who = useActor();
  const canned = cannedStore.use();
  const drafts = draftsStore.use();
  const store = settingsStore.use().store.name;
  const product = c.productId ? productsStore.get().find((p) => p.id === c.productId)?.name : undefined;
  const d = drafts[c.id] ?? emptyDraft();
  const [tried, setTried] = useState(false);
  useUnsaved(!!d.text.trim(), { ar: `رد على ${c.id}`, en: `Reply to ${c.id}` });
  const set = (p: Partial<ComposerDraft>) => draftsStore.set((x) => ({ ...x, [c.id]: { ...d, ...p } }));
  const lang = d.lang ?? c.lang;
  const channel = channelOf(c, d);
  const contact = contactOf(ctx);
  const options = cannedFor(canned, c.type);
  const vars = cannedVars(c, lang, store, product, `${window.location.origin}${window.location.pathname}#/store/track/`);
  const insert = (id: string, l = lang) => {
    const x = canned.find((k) => k.id === id);
    if (!x) return;
    set({ text: fillCanned(x.body[l], vars), canned: id, lang: l });
  };
  /** Switching language swaps an unchanged canned text to the other language. */
  const switchLang = (l: 'ar' | 'en') => {
    const x = d.canned ? canned.find((k) => k.id === d.canned) : undefined;
    if (x && d.text === fillCanned(x.body[lang], vars)) insert(x.id, l); else set({ lang: l });
  };
  const problem = d.mode === 'reply' ? replyProblem(d.text) : !d.text.trim() ? 'empty' : null;
  const go = () => {
    setTried(true);
    if (problem) return;
    if (d.mode === 'note') {
      saveCase(addCaseNote(c, d.text, who.name, Date.now()), { ar: `ملاحظة داخلية على ${c.id}`, en: `Internal note on ${c.id}` });
      draftsStore.set((x) => ({ ...x, [c.id]: { ...d, text: '' } }));
      setTried(false);
      toast({ tone: 'ok', text: tx('أُضيفت الملاحظة؛ لا يراها العميل', 'Note added; the customer does not see it') });
      return;
    }
    if (channel !== 'store' && !addressFor(contact, channel)) return;
    setTried(false);
    onPreview();
  };
  const chans: (NoticeChannel | 'store')[] = c.type === 'question' ? (c.orderRef ? ['store', 'email', 'sms'] : ['store']) : ['email', 'sms', 'whatsapp'];
  const noAddr = d.mode === 'reply' && channel !== 'store' && !addressFor(contact, channel);
  return (
    <Card aria-labelledby="h-compose" className="p-4 sm:p-5">
      <h2 id="h-compose" className="sr-only">{tx('الرد', 'Reply')}</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label={tx('نوع الكتابة', 'Writing')} value={d.mode} onChange={(v) => { set({ mode: v }); setTried(false); }}
          options={[{ value: 'reply', label: tx('رد للعميل', 'Reply') }, { value: 'note', label: tx('ملاحظة داخلية', 'Internal note') }]} />
        {d.mode === 'reply' && options.length > 0 && (
          <label className="relative inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-[13px] font-medium text-muted hover:text-fg">
            <MessageSquareReply className="size-3.5" aria-hidden="true" /><span>{tx('ردود جاهزة', 'Canned replies')}</span>
            <select aria-label={tx('ردود جاهزة', 'Canned replies')} value="" onChange={(e) => insert(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
              <option value="">{tx('اختر…', 'Choose…')}</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.title[ui]}</option>)}
            </select>
          </label>
        )}
      </div>
      {d.mode === 'reply' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={<span className="flex items-center gap-1.5">{tx('القناة', 'Channel')}{channel === 'store' && <InfoHint>{tx('الإجابة تُنشر مع السؤال في صفحة المنتج.', 'The answer is published with the question on the product page.')}</InfoHint>}</span>}
            error={noAddr ? tx(`لا ${T.channel(channel)} لهذا العميل`, `No ${T.channel(channel).toLowerCase()} for this customer`) : null}
            hint={!noAddr && channel !== 'store' ? <bdi dir="ltr">{maskAddr(addressFor(contact, channel)!)}</bdi> : undefined}>
            {(p) => <Select {...p} value={channel} onChange={(e) => set({ channel: e.target.value })}>{chans.map((x) => <option key={x} value={x}>{x === 'store' ? tx('صفحة المنتج (علني)', 'Product page (public)') : T.channel(x)}</option>)}</Select>}
          </Field>
          <Field label={tx('لغة الرد', 'Reply language')} hint={tx(`العميل يقرأ ${c.lang === 'ar' ? 'العربية' : 'الإنجليزية'}`, `Customer reads ${c.lang === 'ar' ? 'Arabic' : 'English'}`)}>
            {(p) => <Select {...p} value={lang} onChange={(e) => switchLang(e.target.value as 'ar' | 'en')}><option value="ar">العربية</option><option value="en">English</option></Select>}
          </Field>
        </div>
      )}
      <div className="mt-3">
        <Field label={d.mode === 'reply' ? tx('نص الرد', 'Reply text') : tx('ملاحظة للفريق فقط', 'Note for the team only')}
          error={tried && problem ? ({ empty: tx('اكتب نصًا', 'Write something'), long: tx('النص أطول من 1000 حرف', 'Longer than 1000 characters'), vars: tx('عبّئ المتغيرات بين { }', 'Fill in the {placeholders}') } as Record<string, string>)[problem] : null}>
          {(p) => <Textarea {...p} dir={d.mode === 'reply' ? (lang === 'ar' ? 'rtl' : 'ltr') : 'auto'} value={d.text} onChange={(e) => set({ text: e.target.value })} className={cn('min-h-28', d.mode === 'note' && 'border-amber-500/40 bg-amber-500/5')} />}
        </Field>
        {d.mode === 'reply' && scriptMismatch(d.text, lang) && <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">{tx('النص بلغة غير لغة الرد المختارة.', 'The text is not in the chosen reply language.')}</p>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {d.mode === 'reply' && channel !== 'store' && <label className="flex items-center gap-2 text-sm"><Switch checked={d.close} onChange={(v) => set({ close: v })} label={tx('أغلق الحالة بعد الإرسال', 'Resolve after sending')} /><span aria-hidden="true">{tx('أغلق بعد الإرسال', 'Resolve after sending')}</span></label>}
        {d.mode === 'reply' && c.type === 'review' && <label className="flex items-center gap-2 text-sm"><Switch checked={d.publicToo} onChange={(v) => set({ publicToo: v })} label={tx('انشره ردًا علنيًا أيضًا', 'Also post as a public reply')} /><span aria-hidden="true">{tx('ردّ علني أيضًا', 'Public reply too')}</span></label>}
        <span className="ms-auto flex items-center gap-2">
          {d.text && <Button variant="ghost" size="sm" onClick={() => { set({ text: '', canned: undefined }); setTried(false); }}>{tx('امسح', 'Clear')}</Button>}
          <Button onClick={go} disabled={noAddr}>{d.mode === 'reply' ? <><Send className="size-4" aria-hidden="true" />{tx('عاين وأرسل', 'Preview & send')}</> : <><StickyNote className="size-4" aria-hidden="true" />{tx('أضف الملاحظة', 'Add note')}</>}</Button>
        </span>
      </div>
    </Card>
  );
}

/* ---------- Resolution actions, in the order's context ---------- */

function Resolve({ c, ctx, open }: { c: Case; ctx: CaseContext; open: (d: Dlg) => void }) {
  const tx = useTx();
  const perms = useCasePerms();
  const o = ctx.order;
  const shipped = !!o && !o.cancelled && (o.ship === 'transit' || o.ship === 'delivered' || o.fulfilments.some((_, i) => parcelShip(o, i) === 'delivered'));
  const openRet = o ? openReturns(o)[0] : undefined;
  const rows: { key: string; icon: ReactNode; label: string; hint?: string; on?: () => void; href?: string; why?: string }[] = [];
  if (c.type === 'shipping' && c.status !== 'carrier' && c.status !== 'resolved') rows.push({ key: 'esc', icon: <Truck className="size-4" />, label: tx('صعّد إلى الناقل', 'Escalate to carrier'), on: perms.manage ? () => open('escalate') : undefined, why: tx('يحتاج دورًا تشغيليًا', 'Needs an operations role') });
  if (o) {
    rows.push({ key: 'refund', icon: <CircleDollarSign className="size-4" />, label: tx('استرداد مبلغ', 'Refund money'), on: perms.refund && canRefundOrder(o) ? () => open('refund') : undefined, why: !perms.refund ? tx('يحتاج دور المالك أو المالية', 'Needs the owner or finance role') : !canRefund(o) || !canRefundOrder(o) ? tx('لا مبلغ متاح للاسترداد', 'Nothing left to refund') : undefined });
    if (openRet) rows.push({ key: 'ret', icon: <RotateCcw className="size-4" />, label: tx(`تابع المرتجع ${openRet.id}`, `Handle return ${openRet.id}`), href: rhref(openRet.id) });
    else rows.push({ key: 'ret', icon: <RotateCcw className="size-4" />, label: tx('افتح مرتجعًا', 'Create a return'), on: (perms.fulfil || perms.refund) && shipped ? () => open('return') : undefined, why: !shipped ? tx('بعد الشحن فقط', 'Only after shipping') : tx('يحتاج دورًا تشغيليًا', 'Needs an operations role') });
    rows.push({ key: 'reship', icon: <PackagePlus className="size-4" />, label: tx('أرسل بديلًا', 'Reship a replacement'), on: perms.fulfil && !o.cancelled ? () => open('reship') : undefined, why: o.cancelled ? tx('الطلب ملغى', 'Order cancelled') : tx('يحتاج دور المالك أو التجهيز', 'Needs the owner or fulfilment role') });
  }
  rows.push({ key: 'coupon', icon: <Gift className="size-4" />, label: tx('كوبون تعويض', 'Goodwill coupon'), on: perms.coupon ? () => open('coupon') : undefined, why: tx('يحتاج دور المالك أو التسويق', 'Needs the owner or marketing role') });
  return (
    <Card aria-labelledby="h-resolve">
      <CardHeader id="h-resolve" title={<span className="flex items-center gap-1.5">{tx('حلول', 'Resolve')}<InfoHint>{tx('كل حل يفتح أداته معبّأة بهذا الطلب؛ لا ينفَّذ شيء قبل تأكيدك.', 'Each one opens its tool filled with this order; nothing runs before you confirm.')}</InfoHint></span>} />
      <ul className="space-y-1 px-3 pb-3">
        {rows.map((r) => (
          <li key={r.key}>
            {r.href ? <a href={r.href} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-fg hover:bg-surface-2"><span className="text-muted" aria-hidden="true">{r.icon}</span>{r.label}</a>
              : <button type="button" disabled={!r.on} onClick={r.on} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start text-sm font-medium text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent">
                <span className="text-muted" aria-hidden="true">{r.icon}</span><span className="min-w-0 flex-1">{r.label}{!r.on && r.why && <span className="block text-xs font-normal text-muted">{r.why}</span>}</span>
              </button>}
          </li>
        ))}
      </ul>
      {c.actions.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <p className="mb-1 text-xs font-semibold text-muted">{tx('بدأ من هذه الحالة', 'Started from this case')}</p>
          <ul className="space-y-0.5 text-xs text-fg">{c.actions.map((a, i) => <li key={i}>{({ refund: tx('استرداد', 'Refund'), return: tx('مرتجع', 'Return'), reship: tx('طلب بديل', 'Replacement'), coupon: tx('كوبون', 'Coupon') } as Record<string, string>)[a.kind] ?? a.kind} {a.ref && <Ref>{a.ref}</Ref>} · {a.by}</li>)}</ul>
        </div>
      )}
    </Card>
  );
}

/* ---------- Order, customer and source context ---------- */

function OrderCard({ ctx }: { ctx: CaseContext }) {
  const tx = useTx();
  const { lang } = useLang();
  const age = useAge();
  const o = ctx.order!;
  const parcel = o.fulfilments.filter((f) => !f.voided).at(-1);
  return (
    <Card aria-labelledby="h-order">
      <CardHeader id="h-order" title={<a href={link(`/dashboard/orders/${o.ref}`)} className="hover:underline"><Ref>#{o.ref}</Ref></a>} action={<span className="text-xs text-muted">{age(o.hoursAgo)}</span>} />
      <div className="space-y-3 px-5 pb-5">
        <div className="flex flex-wrap gap-1.5"><PayBadge o={o} /><FulBadge o={o} /><ShipBadge o={o} /></div>
        {parcel && <p className="text-xs text-muted">{CARRIERS[parcel.carrier ?? 'a'].name[lang]} · <Ref>{parcel.tracking ?? parcel.ref}</Ref></p>}
        <ul className="space-y-2">
          {o.items.map((it, i) => <li key={it.sku + i} className="flex items-center gap-2.5"><ProductImage src={skuPhoto(it.sku)} alt="" size={32} /><span className="min-w-0 flex-1 truncate text-[13px] text-fg">{it.name[lang]}{it.variant && <span className="text-muted"> · {it.variant[lang]}</span>}</span><span className="text-xs tabular-nums text-muted">×{it.qty}</span></li>)}
        </ul>
        <div className="flex items-center justify-between border-t border-border pt-3 text-sm"><span className="text-muted">{tx('الإجمالي', 'Total')}</span><Money v={total(o)} className="font-semibold text-fg" /></div>
        {o.refunds.length > 0 && <p className="text-xs text-muted">{tx(`${o.refunds.length} استرداد على الطلب`, `${o.refunds.length} refund(s) on this order`)}</p>}
        <LinkButton variant="secondary" size="sm" className="w-full" href={link(`/dashboard/orders/${o.ref}`)}><ExternalLink className="size-4" aria-hidden="true" />{tx('افتح الطلب', 'Open order')}</LinkButton>
      </div>
    </Card>
  );
}

function CustomerCard({ c, ctx }: { c: Case; ctx: CaseContext }) {
  const tx = useTx();
  const { lang } = useLang();
  const v = ctx.value;
  const stat = (label: string, value: ReactNode) => <div><dt className="text-xs text-muted">{label}</dt><dd className="text-sm font-semibold text-fg tabular-nums">{value}</dd></div>;
  return (
    <Card aria-labelledby="h-cust">
      <CardHeader id="h-cust" title={<span className="flex items-center gap-1.5"><UserRound className="size-4 text-muted" aria-hidden="true" />{c.customer[lang]}</span>}
        action={ctx.customer && <a className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300" href={link(`/dashboard/customers/${ctx.customer.id}`)}>{tx('الملف', 'Profile')}</a>} />
      <dl className="grid grid-cols-2 gap-3 px-5 pb-5">
        {stat(tx('الطلبات', 'Orders'), formatInt(v.orders))}
        {stat(tx('أنفق', 'Spent'), <Money v={v.spent} />)}
        {stat(tx('متوسط الطلب', 'Avg. order'), v.aov === null ? '—' : <Money v={v.aov} />)}
        {stat(tx('مستردات', 'Refunded'), <Money v={v.refunded} />)}
        {stat(tx('حالات مفتوحة أخرى', 'Other open cases'), formatInt(v.openCases))}
        {stat(tx('حالات سابقة', 'Past cases'), formatInt(v.pastCases))}
        <div className="col-span-2 text-xs text-muted">{c.lang === 'ar' ? tx('يقرأ العربية', 'Reads Arabic') : tx('يقرأ الإنجليزية', 'Reads English')}{ctx.customer && <> · {ctx.customer.city[lang]}</>}</div>
      </dl>
    </Card>
  );
}

function SourceCard({ c }: { c: Case }) {
  const tx = useTx();
  const { lang } = useLang();
  const reviews = reviewsStore.use();
  const products = productsStore.use();
  const r = c.source === 'review' ? reviews.find((x) => x.id === c.sourceId) : undefined;
  const p = c.productId ? products.find((x) => x.id === c.productId) : undefined;
  if (c.source === 'return' && c.sourceId) return (
    <Card className="px-5 py-4"><p className="mb-2 text-xs font-semibold text-muted">{tx('من المرتجعات', 'From returns')}</p><LinkButton variant="secondary" size="sm" className="w-full" href={rhref(c.sourceId)}><RotateCcw className="size-4" aria-hidden="true" />{tx(`افتح ${c.sourceId}`, `Open ${c.sourceId}`)}</LinkButton></Card>
  );
  if (!r) return null;
  return (
    <Card className="space-y-3 px-5 py-4">
      <p className="text-xs font-semibold text-muted">{r.kind === 'review' ? tx('التقييم', 'The review') : tx('السؤال', 'The question')}</p>
      {p && <div className="flex items-center gap-2.5"><ProductImage src={productPhoto(p.id)} alt="" size={36} /><span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{p.name[lang]}</span></div>}
      {r.rating !== undefined && <Stars n={r.rating} />}
      <p className="flex flex-wrap gap-1.5"><Badge tone={r.status === 'published' ? 'green' : r.status === 'hidden' ? 'gray' : 'amber'}>{r.status === 'published' ? tx('منشور', 'Published') : r.status === 'hidden' ? tx('مخفي', 'Hidden') : tx('بانتظار المراجعة', 'Awaiting review')}</Badge>{r.verified && <Badge tone="sky">{tx('مشترٍ موثّق', 'Verified buyer')}</Badge>}</p>
      <LinkButton variant="secondary" size="sm" className="w-full" href={link('/dashboard/marketing/reviews', { view: 'all', q: r.text.slice(0, 12) })}><ExternalLink className="size-4" aria-hidden="true" />{tx('افتح في التقييمات', 'Open in reviews')}</LinkButton>
    </Card>
  );
}

/* ---------- Review mode: simulate the outside world ---------- */

function ReviewPanel({ c }: { c: Case }) {
  const tx = useTx();
  const sim = simStore.use();
  const ticket = c.ship?.ticket;
  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-border p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold"><FlaskConical className="size-4 text-muted" aria-hidden="true" />{tx('وضع المراجعة', 'Review mode')}</p>
      <label className="flex items-center gap-2"><Switch checked={sim.failSend} onChange={(v) => simStore.set((s) => ({ ...s, failSend: v }))} label={tx('محاكاة: مزوّد الرسائل لا يقبل', 'Simulate: message provider rejects')} /><span aria-hidden="true">{tx('محاكاة: مزوّد الرسائل لا يقبل', 'Simulate: message provider rejects')}</span></label>
      <div className="flex flex-wrap gap-2">
        {ticket?.state === 'open' && <Button size="sm" variant="secondary" onClick={() => saveCase(carrierAnswers(c, Date.now()), { ar: `ردّ الناقل على ${ticket.id}`, en: `Carrier answered ${ticket.id}` })}><Truck className="size-4" aria-hidden="true" />{tx('رد الناقل الآن', 'Carrier answers now')}</Button>}
        {c.status !== 'resolved' && <Button size="sm" variant="secondary" onClick={() => saveCase(customerWrites(c, c.lang === 'ar' ? 'أي جديد بخصوص طلبي؟' : 'Any news on my order?', Date.now()))}><MessageSquareReply className="size-4" aria-hidden="true" />{tx('العميل يكتب مجددًا', 'Customer writes again')}</Button>}
        {c.status === 'resolved' && <Button size="sm" variant="secondary" onClick={() => saveCase(customerWrites(c, c.lang === 'ar' ? 'المشكلة رجعت مرة ثانية.' : 'The problem is back.', Date.now()))}><CheckCircle2 className="size-4" aria-hidden="true" />{tx('العميل يعيد فتحها', 'Customer reopens')}</Button>}
      </div>
      <Simulated />
    </div>
  );
}

