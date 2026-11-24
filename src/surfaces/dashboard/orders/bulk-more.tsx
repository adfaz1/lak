// Bulk actions beyond fulfilment: assign, tags, void labels, the payments family (payment link, more time to pay,
// invoice to customer) and cancel. Each one: input → preview (scope, money, stock, the exact message) → run with
// progress → result with retry of failures only, and undo where it is safe (assign, tags).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, CheckCircle2, MinusCircle, Send } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { formatInt } from '../../../core/format';
import { customersStore, financeStore, logAction, noticeCtx, noticeMute, noticesStore, ordersStore, teamStore } from '../../merchant/stores';
import { simBulkFails, type Order } from '../../merchant/domain';
import { refundTx } from '../../merchant/finance';
import { NOTICE_CHANNELS, composeNotice, customerLang, extendPayDue, payDeadline, smsParts, type NoticeChannel } from '../../merchant/ops';
import { Alert, Field, Input, Modal, Select, Simulated, Switch } from '../../../ds/kit';
import { Button, Money, Ref, Segmented, cn, useTx } from '../../../ds/ui';
import { chunks, contactOf } from './model';
import { EVENT_OF, cancelSummary, isSend, moreEligibility, runMore, undoMore, voidSummary, type MoreBulk, type MoreInput, type MoreRun, type MoreSkip } from './bulk-more-model';
import { ReviewOnly, Row, applyEffects, ohref, useActor } from './ui';
import { CHANNEL_ICON, useChannelName, useNoticeName } from './notices-ui';
import { When } from './detail';

export interface MoreOutcome { action: MoreBulk; ok: string[]; undo?: () => void }
type Phase = 'review' | 'running' | 'result';
const REASONS = ['customer', 'stock', 'fraud', 'payment', 'other'] as const;
const toInt = (s: string) => { const t = s.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)); return /^\d+$/.test(t) ? Number(t) : NaN; };

export function MoreBulkModal({ action, orders, allMatching, canRefund, tags, onClose }: {
  action: MoreBulk; orders: Order[]; allMatching: boolean; canRefund: boolean; tags: string[]; onClose: (o: MoreOutcome | null) => void;
}) {
  const tx = useTx();
  const { lang } = useLang();
  const who = useActor();
  const noticeName = useNoticeName();
  const chName = useChannelName();
  const cfg = noticesStore.use();
  const members = teamStore.use().members.filter((m) => m.status === 'active');
  const customers = customersStore.use();
  const event = EVENT_OF[action];
  const ctx = useMemo(() => ({ canRefund, contact: (o: Order) => contactOf(o, customers) }), [canRefund, customers]);

  const [member, setMember] = useState(members[0]?.name ?? '');
  const tagsOnSel = useMemo(() => [...new Set(orders.flatMap((o) => o.tags ?? []))].sort(), [orders]);
  const [tag, setTag] = useState(action === 'tagRemove' ? tagsOnSel[0] ?? '' : '');
  const [days, setDays] = useState('3');
  const [reason, setReason] = useState<(typeof REASONS)[number] | ''>('');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [chans, setChans] = useState<NoticeChannel[]>(() => (event ? NOTICE_CHANNELS.filter((c) => cfg.channels[event][c]) : []));
  const [previewLang, setPreviewLang] = useState<'ar' | 'en' | null>(null);
  const [tried, setTried] = useState(false);
  const [simFail, setSimFail] = useState(false);

  const reasonLabel: Record<(typeof REASONS)[number], string> = { customer: tx('طلب العميل', 'Customer asked'), stock: tx('نفاد المخزون', 'Out of stock'), fraud: tx('اشتباه احتيال', 'Suspected fraud'), payment: tx('مشكلة في الدفع', 'Payment problem'), other: tx('سبب آخر', 'Other') };
  const d = toInt(days);
  const input: MoreInput = {
    member: action === 'assign' ? (member === '-' ? '' : member) : undefined, tag, days: d, channels: chans, notify,
    reason: reason ? `${reasonLabel[reason]}${note.trim() ? ` · ${note.trim()}` : ''}` : '',
  };
  const e = useMemo(() => moreEligibility(orders, action, input, ctx), [orders, action, member, tag, chans.join(), ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = e.eligible.length;

  const inputError = action === 'tagAdd' && !tag.trim() ? tx('اكتب الوسم', 'Enter a tag')
    : action === 'tagRemove' && !tag ? tx('لا وسوم على الطلبات المحددة', 'The selected orders have no tags')
      : action === 'extendDue' && !(d >= 1 && d <= 30) ? tx('من 1 إلى 30 يومًا', '1 to 30 days')
        : action === 'cancel' && (!reason || (reason === 'other' && !note.trim())) ? tx('اختر سببًا، واكتبه إن كان «آخر»', 'Choose a reason; type it for “Other”')
          : isSend(action) && !chans.length ? tx('اختر قناة واحدة على الأقل', 'Choose at least one channel') : null;

  // Run
  const [phase, setPhase] = useState<Phase>('review');
  const [queue, setQueue] = useState<string[][]>([]);
  const [step, setStep] = useState(0);
  const [total, setTotal] = useState(0);
  const [ok, setOk] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const before = useRef<MoreRun['before']>({});
  const attempt = useRef(1);
  const frozen = useRef(input);
  const start = (refs: string[]) => { setQueue(chunks(refs, 5)); setTotal(refs.length); setStep(0); setFailed([]); setPhase('running'); };
  useEffect(() => {
    if (phase !== 'running') return;
    if (step >= queue.length) { setPhase('result'); return; }
    const t = setTimeout(() => {
      const inp = frozen.current;
      const deps = { cfg: noticesStore.get(), ctx, noticeCtx: (o: Order) => noticeCtx(o) };
      const refs = queue[step];
      const failing = simFail && attempt.current === 1 && isSend(action) ? refs.filter(simBulkFails) : [];
      let all = ordersStore.get();
      const runs = [runMore(all, refs.filter((r) => !failing.includes(r)), action, inp, who, Date.now(), deps)];
      all = runs[0].orders;
      // Simulated provider outage for these orders: their first channel is tried and rejected.
      if (failing.length) { const c = inp.channels?.[0] ?? 'sms'; runs.push(runMore(all, failing, action, { ...inp, channels: [c] }, who, Date.now(), { ...deps, cfg: { ...deps.cfg, simFail: c } })); all = runs[1].orders; }
      if (action === 'cancel' && !inp.notify) refs.forEach((r) => noticeMute.add(r));
      const prev = ordersStore.get();
      ordersStore.set(all);
      for (const r of runs) {
        r.effects.forEach((x) => applyEffects(x.effects, who, x.ref, action === 'cancel' ? 'CX' : 'VL'));
        Object.assign(before.current, r.before);
        setOk((x) => [...x, ...r.ok]);
        setFailed((x) => [...x, ...r.failed]);
      }
      if (action === 'cancel') {
        const byRef = new Map(prev.map((o) => [o.ref, o]));
        const added = all.flatMap((o) => { const b = byRef.get(o.ref); return b && o.refunds.length > b.refunds.length ? [refundTx(o, o.refunds[o.refunds.length - 1], `TX-${o.refunds[o.refunds.length - 1].id}`, undefined, false)] : []; });
        if (added.length) financeStore.set((f) => ({ ...f, txs: [...f.txs, ...added] }));
      }
      setStep(step + 1);
    }, 120);
    return () => clearTimeout(t);
  }, [phase, step, queue, action, simFail, who, ctx]);

  const done = Math.min(total, queue.slice(0, step).reduce((s, c) => s + c.length, 0));
  const pct = total ? Math.round((done / total) * 100) : 0;
  const run = () => { setTried(true); if (inputError || !n) return; frozen.current = input; start(e.eligible.map((o) => o.ref)); };

  const LOG: Record<MoreBulk, [string, string]> = {
    assign: [`إسناد جماعي إلى ${input.member || 'لا أحد'}`, `Bulk assign to ${input.member || 'nobody'}`], tagAdd: [`وسم جماعي «${tag}»`, `Bulk tag “${tag}”`], tagRemove: [`حذف وسم جماعي «${tag}»`, `Bulk untag “${tag}”`],
    voidLabels: ['إلغاء ملصقات جماعي', 'Bulk void labels'], payLink: ['إرسال روابط دفع', 'Payment links sent'], extendDue: [`تمديد مهلة الدفع ${days} يوم`, `Payment deadline +${days} days`],
    sendInvoice: ['إرسال فواتير للعملاء', 'Invoices sent to customers'], cancel: ['إلغاء طلبات جماعي', 'Bulk cancel'],
  };
  const finish = () => {
    if (phase === 'review') { onClose(null); return; }
    if (ok.length) logAction('orders', { ar: `${LOG[action][0]} (${ok.length} طلب)`, en: `${LOG[action][1]} (${ok.length} orders)` }, { target: ok.slice(0, 10).join(',') + (ok.length > 10 ? '…' : '') });
    const b = before.current; const inp = frozen.current;
    const undo = ['assign', 'tagAdd', 'tagRemove'].includes(action) && ok.length ? () => {
      ordersStore.set((all) => undoMore(all, action, Object.fromEntries(ok.map((r) => [r, b[r]])), inp, who, Date.now()));
      logAction('orders', { ar: `تراجع: ${LOG[action][0]}`, en: `Undo: ${LOG[action][1]}` });
    } : undefined;
    onClose({ action, ok, undo });
  };

  const TITLE: Record<MoreBulk, string> = {
    assign: tx('إسناد الطلبات', 'Assign orders'), tagAdd: tx('إضافة وسم', 'Add a tag'), tagRemove: tx('حذف وسم', 'Remove a tag'), voidLabels: tx('إلغاء ملصقات الشحن', 'Void shipping labels'),
    payLink: tx('إرسال رابط دفع للعملاء', 'Send payment links to customers'), extendDue: tx('تمديد مهلة الدفع', 'Give more time to pay'), sendInvoice: tx('إرسال الفاتورة للعملاء', 'Send invoices to customers'), cancel: tx('إلغاء الطلبات', 'Cancel orders'),
  };
  const GO: Record<MoreBulk, string> = {
    assign: tx(`أسند ${formatInt(n)} طلبًا`, `Assign ${formatInt(n)} orders`), tagAdd: tx(`أضف الوسم إلى ${formatInt(n)}`, `Tag ${formatInt(n)} orders`), tagRemove: tx(`احذف الوسم من ${formatInt(n)}`, `Untag ${formatInt(n)} orders`),
    voidLabels: tx(`ألغِ ملصقات ${formatInt(n)} طلبًا`, `Void labels on ${formatInt(n)} orders`), payLink: tx(`أرسل ${formatInt(n)} رابط دفع`, `Send ${formatInt(n)} payment links`),
    extendDue: tx(`مدّد وأبلغ ${formatInt(n)} عميلًا`, `Extend and notify ${formatInt(n)} customers`), sendInvoice: tx(`أرسل ${formatInt(n)} فاتورة`, `Send ${formatInt(n)} invoices`), cancel: tx(`ألغِ ${formatInt(n)} طلبًا`, `Cancel ${formatInt(n)} orders`),
  };
  const skip = (r: MoreSkip) => ({
    cancelled: tx('ملغى', 'Cancelled'), same: tx('مسند إليه من قبل', 'Already assigned to them'), noTag: tx('لا يحمل الوسم', 'Does not have the tag'), hasTag: tx('يحمل الوسم من قبل', 'Already has the tag'),
    noLabel: tx('لا ملصق صادر', 'No label issued'), withCarrier: tx('طرد مع الناقل أو سُلّم', 'A parcel is with the carrier or delivered'), notAwaiting: tx('لا ينتظر دفعًا', 'Not waiting for payment'),
    notPaid: tx('لم يُحصّل بعد', 'Not collected yet'), noContact: tx('لا بريد أو جوال للقنوات المختارة', 'No email or mobile for the chosen channels'), shipped: tx('شُحن: افتح مرتجعًا بدل الإلغاء', 'Shipped: open a return instead'),
    refunded: tx('مسترد بالكامل', 'Fully refunded'), needsRefundRole: tx('فيه استرداد يحتاج دور المالك أو المالية', 'Has a refund that needs the owner or finance role'),
  })[r];

  const sample = e.eligible[0];
  const sLang = previewLang ?? (sample ? customerLang(sample, cfg) : cfg.defaultLang);
  const sampleOrder = sample && action === 'extendDue' && d >= 1 ? extendPayDue(sample, d, who, Date.now()) : sample;
  const preview = sampleOrder && event ? composeNotice(sampleOrder, event, cfg, noticeCtx(sampleOrder), who, { only: chans.length ? chans : ['sms'], lang: sLang }) : [];
  const cx = action === 'cancel' ? cancelSummary(e.eligible) : null;
  const vx = action === 'voidLabels' ? voidSummary(e.eligible) : null;
  const send = isSend(action);
  const amount = e.eligible.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty * i.unit, 0) - (o.discount ?? 0) + o.fee, 0);

  const footer = phase === 'review' ? (
    <>
      <Button variant="secondary" onClick={() => onClose(null)}>{tx('رجوع', 'Back')}</Button>
      <Button variant={action === 'cancel' ? 'danger' : 'primary'} disabled={!n} onClick={run}>{action === 'cancel' ? <Ban className="size-4" aria-hidden="true" /> : send ? <Send className="size-4" aria-hidden="true" /> : null}{GO[action]}</Button>
    </>
  ) : phase === 'running' ? <span className="text-xs text-muted">{tx('يستغرق ثوانٍ؛ أبقِ النافذة مفتوحة.', 'Takes a few seconds; keep this open.')}</span> : (
    <>
      <Button variant={failed.length ? 'secondary' : 'primary'} onClick={finish}>{failed.length ? tx('إغلاق', 'Close') : tx('تم', 'Done')}</Button>
      {failed.length > 0 && <Button onClick={() => { attempt.current += 1; start(failed); }}>{tx(`أعد محاولة الفاشل فقط (${failed.length})`, `Retry failed only (${failed.length})`)}</Button>}
    </>
  );

  return (
    <Modal size="lg" title={phase === 'review' ? TITLE[action] : phase === 'running' ? tx('جارٍ التنفيذ…', 'Running…') : tx('النتيجة', 'Result')} onClose={phase === 'running' ? () => undefined : finish} footer={footer}
      description={phase === 'review' ? (allMatching ? tx(`النطاق: كل النتائج المطابقة (${formatInt(orders.length)})`, `Scope: all ${formatInt(orders.length)} matching results`) : tx(`النطاق: ${formatInt(orders.length)} طلبات حددتها`, `Scope: the ${formatInt(orders.length)} orders you selected`)) : undefined}>
      {phase === 'review' && (
        <>
          {send && <Alert tone="warn" title={tx('يصل العميل مباشرة', 'Reaches the customer directly')}>{tx('راجع نص الرسالة قبل الإرسال؛ لا يمكن سحبها بعد إرسالها.', 'Check the message before sending; it cannot be recalled once sent.')}</Alert>}

          {action === 'assign' && (
            <Field label={tx('أسند إلى', 'Assign to')}>{(p) => <Select {...p} value={member} onChange={(x) => setMember(x.target.value)}>
              {members.map((m) => <option key={m.id} value={m.name}>{m.name}{m.name === who.name ? tx(' (أنا)', ' (me)') : ''}</option>)}
              <option value="-">{tx('بلا مسؤول (أزل الإسناد)', 'Nobody (unassign)')}</option>
            </Select>}</Field>
          )}
          {action === 'tagAdd' && (
            <Field label={tx('الوسم', 'Tag')} hint={tx('حتى 24 حرفًا', 'Up to 24 characters')} error={tried && inputError ? inputError : null}>{(p) => <>
              <Input {...p} list="bulk-tags" value={tag} maxLength={24} onChange={(x) => setTag(x.target.value)} placeholder={tx('مثال: VIP', 'e.g. VIP')} />
              <datalist id="bulk-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
            </>}</Field>
          )}
          {action === 'tagRemove' && (tagsOnSel.length ? (
            <Field label={tx('الوسم', 'Tag')}>{(p) => <Select {...p} value={tag} onChange={(x) => setTag(x.target.value)}>{tagsOnSel.map((t) => <option key={t} value={t}>{t}</option>)}</Select>}</Field>
          ) : <Alert tone="info">{tx('لا وسوم على الطلبات المحددة.', 'The selected orders have no tags.')}</Alert>)}
          {action === 'extendDue' && (
            <Field label={tx('مدة إضافية (أيام)', 'Extra time (days)')} hint={tx('تُحسب من المهلة الحالية أو من اليوم إن انتهت', 'Counted from the current deadline, or from today if it passed')} error={tried && inputError ? inputError : null}>
              {(p) => <Input {...p} inputMode="numeric" dir="ltr" className="max-w-32" value={days} onChange={(x) => setDays(x.target.value.slice(0, 3))} />}
            </Field>
          )}
          {action === 'cancel' && (
            <>
              <Field label={tx('السبب', 'Reason')} error={tried && inputError ? inputError : null}>{() => (
                <div className="flex flex-wrap gap-2">{REASONS.map((k) => (
                  <button key={k} type="button" aria-pressed={reason === k} onClick={() => setReason(k)}
                    className={cn('h-9 rounded-full border px-3 text-[13px] font-medium transition-colors', reason === k ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-border text-muted hover:text-fg')}>{reasonLabel[k]}</button>
                ))}</div>
              )}</Field>
              <Field label={tx('ملاحظة', 'Note')} optional>{(p) => <Input {...p} value={note} onChange={(x) => setNote(x.target.value)} />}</Field>
            </>
          )}
          {send && (
            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold text-fg">{tx('القنوات', 'Channels')}</legend>
              <div className="flex flex-wrap gap-2">{NOTICE_CHANNELS.map((c) => {
                const I = CHANNEL_ICON[c]; const on = chans.includes(c);
                return <button key={c} type="button" aria-pressed={on} onClick={() => setChans(on ? chans.filter((x) => x !== c) : [...chans, c])}
                  className={cn('inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium', on ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-border text-muted hover:text-fg')}><I className="size-3.5" aria-hidden="true" />{chName(c)}</button>;
              })}</div>
              {tried && !chans.length && <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{inputError}</p>}
            </fieldset>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-fg"><CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />{tx('سيُنفَّذ', 'Will run')}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-fg">{formatInt(n)}</p>
              {n > 0 && <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">{e.eligible.slice(0, 4).map((o) => <Ref key={o.ref}>#{o.ref}</Ref>)}{n > 4 && <span>+{formatInt(n - 4)}</span>}</p>}
            </div>
            <div className="rounded-xl border border-border bg-surface-2/50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-fg"><MinusCircle className="size-4 text-muted" aria-hidden="true" />{tx('سيُستبعد', 'Skipped')}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-fg">{formatInt(e.ineligible)}</p>
              {e.ineligible > 0 && <ul className="!mt-2 space-y-1.5">{(Object.keys(e.reasons) as MoreSkip[]).map((r) => (
                <li key={r} className="text-xs"><span className="flex justify-between gap-2"><span className="text-fg">{skip(r)}</span><b className="tabular-nums">{formatInt(e.reasons[r] ?? 0)}</b></span>
                  <span className="flex flex-wrap gap-x-2 text-muted">{e.samples[r]?.map((ref) => <a key={ref} href={ohref(ref)} className="hover:underline"><Ref>#{ref}</Ref></a>)}</span></li>
              ))}</ul>}
            </div>
          </div>

          {cx && n > 0 && (
            <dl className="divide-y divide-border !rounded-xl !border !border-border !px-4">
              <Row label={tx('يُسترد للعملاء', 'Refunded to customers')}><span className="inline-flex items-center gap-1.5">{cx.refunds ? tx(`${cx.refunds} طلبات`, `${cx.refunds} orders`) : tx('لا شيء', 'Nothing')} <Money v={cx.refund} className="font-semibold text-fg" /></span></Row>
              <Row label={tx('يُطلق من الحجز', 'Released from holds')}>{tx(`${formatInt(cx.released)} قطعة`, `${formatInt(cx.released)} units`)}</Row>
              {cx.labels > 0 && <Row label={tx('ملصقات تُلغى', 'Labels voided')}><span className="inline-flex items-center gap-1.5">{formatInt(cx.labels)}<Simulated /></span></Row>}
              {cx.restocked > 0 && <Row label={tx('تعود للرف', 'Back on the shelf')}>{tx(`${formatInt(cx.restocked)} قطعة`, `${formatInt(cx.restocked)} units`)}</Row>}
            </dl>
          )}
          {cx && n > 0 && (
            <details className="rounded-xl border border-border px-4 py-2 text-sm">
              <summary className="cursor-pointer py-1 font-medium text-fg">{tx('لكل طلب', 'Per order')}</summary>
              <ul className="divide-y divide-border">{cx.rows.map((r) => <li key={r.ref} className="flex items-center justify-between gap-3 py-2 text-xs"><Ref>#{r.ref}</Ref><span className="text-muted">{tx(`${r.units} قطعة`, `${r.units} units`)}</span>{r.refund ? <Money v={r.refund} className="font-semibold text-fg" /> : <span className="text-muted">{tx('بلا استرداد', 'No refund')}</span>}</li>)}</ul>
            </details>
          )}
          {action === 'cancel' && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-fg">
              <Send className="size-3.5 text-amber-700 dark:text-amber-300" aria-hidden="true" />
              <span className="min-w-0 flex-1">{notify ? tx('يصل كل عميل رسالة «أُلغي الطلب» حسب إعداداتك.', 'Each customer gets the “Order cancelled” message as set up.') : tx('لن تُرسل رسائل؛ تُسجّل «لم تُرسل» في كل طلب.', 'No messages; each order logs them as not sent.')}</span>
              <span className="flex items-center gap-2 font-medium"><Switch checked={notify} onChange={setNotify} label={tx('أبلغ العملاء', 'Notify customers')} /><span aria-hidden="true">{tx('أبلغ العملاء', 'Notify customers')}</span></span>
            </div>
          )}
          {vx && n > 0 && (
            <dl className="divide-y divide-border !rounded-xl !border !border-border !px-4">
              <Row label={tx('ملصقات تُلغى لدى الناقل', 'Labels voided at the carrier')}><span className="inline-flex items-center gap-1.5">{formatInt(vx.labels)}<Simulated /></span></Row>
              <Row label={tx('رسوم تعود (تقديرية)', 'Fees returned (estimate)')}><Money v={vx.fee} /></Row>
              <Row label={tx('تعود للرف وتبقى محجوزة للطلب', 'Back on the shelf, still held for the order')}>{tx(`${formatInt(vx.units)} قطعة`, `${formatInt(vx.units)} units`)}</Row>
              <Row label={tx('الطلبات', 'Orders')}>{tx('تعود إلى «للتجهيز»', 'Go back to “to fulfil”')}</Row>
            </dl>
          )}

          {send && n > 0 && (
            <>
              {(action === 'payLink' || action === 'extendDue') && (
                <details className="rounded-xl border border-border px-4 py-2 text-sm">
                  <summary className="cursor-pointer py-1 font-medium text-fg">{tx(`المبالغ والمهل (${formatInt(n)})`, `Amounts and deadlines (${formatInt(n)})`)} · <Money v={amount} className="inline-flex" /></summary>
                  <ul className="divide-y divide-border">{e.eligible.slice(0, 50).map((o) => {
                    const due = action === 'extendDue' && d >= 1 ? payDeadline(extendPayDue(o, d, who, Date.now()), Date.now()) : payDeadline(o, Date.now());
                    return <li key={o.ref} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-xs"><Ref>#{o.ref}</Ref><span className="text-muted">{tx('حتى', 'until')} <When at={due} /></span><Money v={o.items.reduce((a, i) => a + i.qty * i.unit, 0) - (o.discount ?? 0) + o.fee} className="font-semibold text-fg" /></li>;
                  })}</ul>
                </details>
              )}
              <div className="space-y-2 rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-fg">{tx('ما يراه العميل', 'What the customer sees')} · <Ref>#{sample.ref}</Ref></p>
                  <Segmented label={tx('لغة المعاينة', 'Preview language')} value={sLang} onChange={setPreviewLang} options={[{ value: 'ar', label: 'عربي' }, { value: 'en', label: 'English' }]} />
                </div>
                {preview.map((m) => (
                  <div key={m.channel} className="rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-fg" dir={m.lang === 'ar' ? 'rtl' : 'ltr'}>
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-muted" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{chName(m.channel)}{m.channel === 'sms' && <span>· {tx(`${smsParts(m.body)} جزء`, `${smsParts(m.body)} part(s)`)}</span>}</p>
                    {m.subject && <p className="font-semibold">{m.subject}</p>}
                    <p className="whitespace-pre-line break-words">{m.body}</p>
                  </div>
                ))}
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted">{tx(`قالب «${noticeName(event!)}» من إعدادات إشعارات العملاء. كل عميل يستلمها بلغته.`, `The “${noticeName(event!)}” template from customer notifications. Each customer gets it in their language.`)}<Simulated /></p>
              </div>
            </>
          )}
          {send && (
            <ReviewOnly>
              <label className="flex items-center justify-between gap-3 text-sm text-fg">
                <span>{tx('حاكِ رفض المزوّد لنحو طلب من 7', 'Simulate the provider rejecting ~1 in 7 orders')}</span>
                <Switch checked={simFail} onChange={setSimFail} label={tx('محاكاة فشل جزئي', 'Simulate partial failure')} />
              </label>
            </ReviewOnly>
          )}
        </>
      )}
      {phase !== 'review' && (
        <>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={tx('التقدم', 'Progress')}>
            <div className="h-full rounded-full bg-brand-gradient transition-[width] duration-150" style={{ width: `${pct}%` }} />
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-live="polite">
            {[[tx('عولج', 'Processed'), `${formatInt(done)} / ${formatInt(total)}`, 'text-fg'], [tx('نجح', 'Done'), formatInt(ok.length), 'text-emerald-700 dark:text-emerald-400'],
              [tx('فشل', 'Failed'), formatInt(failed.length), failed.length ? 'text-red-700 dark:text-red-400' : 'text-fg'], [tx('مستبعد', 'Skipped'), formatInt(e.ineligible), 'text-muted']]
              .map(([k, v, c]) => <div key={k} className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-muted">{k}</dt><dd className={`mt-0.5 text-lg font-bold tabular-nums ${c}`}>{v}</dd></div>)}
          </dl>
          {phase === 'result' && failed.length > 0 && (
            <Alert tone="warn" title={tx(`نجاح جزئي: ${ok.length} نجح، ${failed.length} فشل`, `Partial success: ${ok.length} done, ${failed.length} failed`)}>
              <span className="flex flex-wrap items-center gap-2">{tx('رفض مزوّد الرسائل بعضها؛ سُجّلت «فشلت» في كل طلب. إعادة المحاولة تشمل الفاشل فقط.', 'The message provider rejected some; each order logs them as failed. Retry covers the failed only.')} <Simulated /></span>
              <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{failed.slice(0, 10).map((r) => <a key={r} href={ohref(r)} className="font-semibold hover:underline"><Ref>#{r}</Ref></a>)}</span>
            </Alert>
          )}
          {phase === 'result' && failed.length === 0 && (
            <Alert tone="ok" title={tx(`اكتمل: ${formatInt(ok.length)}`, `Completed: ${formatInt(ok.length)}`)}>
              <span className="flex flex-wrap items-center gap-2">{send ? tx('سُجّلت كل رسالة في «رسائل العميل» داخل الطلب.', 'Each message is logged under “Customer messages” on the order.') : tx('سُجّل في سجل كل طلب باسمك.', 'Logged on each order under your name.')}{(send || action === 'voidLabels' || action === 'cancel') && <Simulated />}</span>
            </Alert>
          )}
        </>
      )}
    </Modal>
  );
}
