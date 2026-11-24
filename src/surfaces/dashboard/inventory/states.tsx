// Full stock states (Salla audit MATRIX #42): names and definitions, the on-hand composition bar, and the per-level
// "Stock states" dialog where units move between states with a reason, a preview and a log line.
// Rules live in merchant/inventory.ts (moveStock, movePreview, breakdown); this file is layout and interaction.
import { useState, type ReactNode } from 'react';
import { ArrowLeft, Layers } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { useReviewMode } from '../../../core/review';
import { LOCATIONS } from '../../merchant/domain';
import {
  MOVE_REASONS, STATE_MOVES, bumpBySomeoneElse, levelOf, moveLimit, movePreview, moveStock,
  type Breakdown, type Level, type MoveError, type StateMove, type StateReason, type StockState,
} from '../../merchant/inventory';
import { levelsStore, logAction, ordersStore, stockLogStore, transfersStore } from '../../merchant/stores';
import { Button, InfoHint, Ref, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, Select, Simulated, useToast } from '../../../ds/kit';
import { sectionHref } from '../pages';
import { ihref } from '../products/common';
import { compositionBar, nextMoveId, parseDelta, reservedBy, transfersFor, type SkuInfo } from './model';

export const STATE_DOT: Record<'available' | 'reserved' | 'awaitingPay' | 'unavailable' | 'safety', string> = {
  available: 'bg-emerald-500', reserved: 'bg-sky-500', awaitingPay: 'bg-brand-500', unavailable: 'bg-red-500', safety: 'bg-amber-500',
};

export function useStateNames() {
  const tx = useTx();
  const label = (s: StockState | 'gone') => ({
    onHand: tx('الموجود', 'On hand'), available: tx('المتاح للبيع', 'Available'), reserved: tx('محجوز لطلبات', 'Reserved for orders'),
    awaitingPay: tx('محجوز بانتظار الدفع', 'Awaiting payment'), unavailable: tx('غير متاح', 'Unavailable'), safety: tx('احتياطي', 'Safety reserve'),
    incoming: tx('وارد', 'Incoming'), outgoing: tx('صادر', 'Outgoing'), gone: tx('خارج المخزون', 'Written off'),
  })[s];
  const short = (s: StockState) => ({
    onHand: tx('موجود', 'On hand'), available: tx('متاح', 'Available'), reserved: tx('محجوز', 'Reserved'), awaitingPay: tx('بانتظار الدفع', 'Awaiting pay'),
    unavailable: tx('غير متاح', 'Unavailable'), safety: tx('احتياطي', 'Safety'), incoming: tx('وارد', 'Incoming'), outgoing: tx('صادر', 'Outgoing'),
  })[s];
  const def = (s: StockState) => ({
    onHand: tx('كل القطع الموجودة فعليًا في الموقع. = المتاح + المحجوز + بانتظار الدفع + غير المتاح + الاحتياطي.', 'Every unit physically at the location. = available + reserved + awaiting payment + unavailable + safety reserve.'),
    available: tx('ما يمكن بيعه الآن في كل القنوات: الموجود ناقص كل ما هو محجوز أو موقوف.', 'What can be sold now on every channel: on hand minus everything held or blocked.'),
    reserved: tx('قطع محجوزة لطلبات مدفوعة (أو دفع عند الاستلام مؤكد) لم تُشحن بعد. تُطلق عند الشحن أو الإلغاء.', 'Held for paid (or confirmed cash-on-delivery) orders not shipped yet. Released when they ship or are cancelled.'),
    awaitingPay: tx('قطع محجوزة لطلبات لم يتأكد دفعها (تحويل بنكي، رابط دفع). تصبح «محجوز لطلبات» عند الدفع أو تعود للمتاح إن أُلغي الحجز.', 'Held for orders whose payment is not confirmed (bank transfer, payment link). Become reserved when paid, or go back to available when released.'),
    unavailable: tx('تالفة أو في الحجر للفحص. موجودة على الرف لكنها لا تُباع حتى تُعاد للمتاح أو تُشطب.', 'Damaged or in quarantine for inspection. On the shelf but not sold until restored or written off.'),
    safety: tx('كمية تحتفظ بها ولا تُعرض للبيع على الإنترنت، مثل احتياطي للفرع أو للاستبدال.', 'Units you keep back from online sale, e.g. a buffer for the branch or for exchanges.'),
    incoming: tx('قطع في تحويل مُرسل إلى هذا الموقع لم تُستلم بعد. ليست من الموجود ولا تُباع تلقائيًا. (أوامر الشراء غير مبنية بعد.)', 'Units in a transfer sent to this location, not received yet. Not part of on hand and never sold automatically. (Purchase orders are not built yet.)'),
    outgoing: tx('قطع خرجت من هذا الموقع في تحويل ولم تصل للموقع الآخر بعد. شحنات العملاء تخرج من الموجود عند الشحن وتُتابع في الطلبات.', 'Units that left this location in a transfer and have not arrived at the other one. Customer shipments leave on hand when they ship and are tracked in Orders.'),
  })[s];
  const move = (m: StateMove) => ({
    damage: tx('علّم كتالف أو في الحجر', 'Mark damaged or quarantined'), restore: tx('أعد للمتاح بعد الفحص', 'Restore to available'),
    writeOff: tx('اشطب التالف', 'Write off damaged'), setSafety: tx('حدّد الاحتياطي', 'Set safety reserve'),
    releasePay: tx('ألغِ حجز الدفع', 'Release payment hold'), confirmPay: tx('الدفع وصل: انقل للمحجوز', 'Payment received: move to reserved'),
  })[m];
  const reason = (r: StateReason) => ({
    damaged: tx('تلف', 'Damaged'), quarantine: tx('حجر للفحص', 'Quarantine for inspection'), inspected: tx('سليم بعد الفحص', 'Passed inspection'),
    disposed: tx('أُتلف أو أُعيد للمورد', 'Disposed or returned to supplier'), buffer: tx('احتياطي للاستبدال', 'Buffer for exchanges'), store: tx('للبيع في الفرع', 'For in-store sale'),
    expired: tx('انتهت مهلة الدفع', 'Payment window ended'), paid: tx('تأكد الدفع', 'Payment confirmed'), other: tx('أخرى', 'Other'),
  })[r];
  return { label, short, def, move, reason };
}

/** Column or field label with its definition behind the "?". */
export function StateHead({ s, text }: { s: StockState; text?: string }) {
  const n = useStateNames();
  return <span className="inline-flex items-center gap-0.5">{text ?? n.short(s)}<InfoHint label={n.label(s)}>{n.def(s)}</InfoHint></span>;
}

/** How on hand splits into its parts. Purely visual; the numbers are always next to it. */
export function CompositionBar({ b, className }: { b: Breakdown; className?: string }) {
  const n = useStateNames();
  const parts = compositionBar(b);
  if (!parts.length) return <div className={cn('h-2 rounded-full bg-surface-2', className)} aria-hidden="true" />;
  return (
    <div className={cn('flex h-2 overflow-hidden rounded-full bg-surface-2', className)} role="img" aria-label={parts.map((p) => `${n.label(p.part)} ${b[p.part]}`).join(' · ')}>
      {parts.map((p) => <span key={p.part} className={STATE_DOT[p.part]} style={{ width: `${p.pct}%` }} />)}
    </div>
  );
}

const PARTS = ['available', 'reserved', 'awaitingPay', 'unavailable', 'safety'] as const;

/**
 * Stock states for one SKU at one location. View: every state with its definition and what is behind it (orders,
 * transfers). Move: choose a move, quantity and reason, see before → after for each state, then record it.
 */
export function StatesModal({ level, info, onClose, canMove, startMove }: { level: Level; info: SkuInfo; onClose: () => void; canMove: boolean; startMove?: StateMove }) {
  const tx = useTx();
  const { lang } = useLang();
  const n = useStateNames();
  const levels = levelsStore.use();
  const transfers = transfersStore.use();
  const orders = ordersStore.use();
  const current = levelOf(levels, level.sku, level.loc) ?? level;
  const [move, setMove] = useState<StateMove | null>(startMove ?? null);
  const b = movePreview(current, 'damage', null, transfers).before;
  const by = reservedBy(orders, level.sku, level.loc);
  const tr = transfersFor(transfers, level.sku, level.loc);
  const where = <>{info.name[lang]}{info.variant[lang] && ` · ${info.variant[lang]}`} · {LOCATIONS[level.loc][lang]}</>;
  if (move) return <MoveForm key={move} level={current} initial={move} where={where} onBack={() => setMove(null)} onDone={onClose} />;

  const act = (m: StateMove) => canMove && moveLimit(current, m) > 0
    ? <Button key={m} variant="secondary" size="sm" onClick={() => setMove(m)}>{n.move(m)}</Button> : null;
  const links = (list: { id: string; qty: number }[], href: (id: string) => string) => list.map((x) => (
    <a key={x.id} href={href(x.id)} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"><Ref>{x.id}</Ref><span className="text-muted">×{x.qty}</span></a>
  ));
  const unattributed = b.reserved - by.reduce((s, x) => s + x.qty, 0);
  const extra: Partial<Record<StockState, ReactNode>> = {
    available: <>{act('damage')}{act('setSafety')}</>,
    reserved: <>{links(by.map((x) => ({ id: x.ref, qty: x.qty })), (id) => sectionHref('orders', id))}{unattributed > 0 && <span className="text-xs text-muted">{tx(`${unattributed} من بيانات تجريبية بلا طلب مرتبط`, `${unattributed} from demo data with no linked order`)}</span>}</>,
    awaitingPay: <>{act('confirmPay')}{act('releasePay')}</>,
    unavailable: <>{act('restore')}{act('writeOff')}</>,
    safety: canMove && b.safety > 0 ? <Button variant="secondary" size="sm" onClick={() => setMove('setSafety')}>{tx('غيّر الاحتياطي', 'Change reserve')}</Button> : null,
    incoming: links(tr.incoming, (id) => ihref(`transfers/${id}`)),
    outgoing: links(tr.outgoing, (id) => ihref(`transfers/${id}`)),
  };
  const row = (s: StockState, dot?: string) => (
    <li key={s} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-fg">
        {dot ? <span className={cn('size-2.5 shrink-0 rounded-full', dot)} aria-hidden="true" /> : <span className="size-2.5 shrink-0" aria-hidden="true" />}
        <span className="font-medium">{n.label(s)}</span><InfoHint label={n.label(s)}>{n.def(s)}</InfoHint>
      </span>
      <span className={cn('order-2 w-10 text-end text-base font-bold tabular-nums sm:order-3', s === 'available' && b.available < 0 ? 'text-red-600 dark:text-red-400' : b[s] === 0 ? 'text-subtle' : 'text-fg')}>{b[s]}</span>
      {extra[s] && <span className="order-3 flex w-full flex-wrap items-center gap-1.5 ps-[18px] sm:order-2 sm:w-auto sm:ps-0">{extra[s]}</span>}
    </li>
  );
  return (
    <Modal size="lg" title={tx('حالات المخزون', 'Stock states')} description={where} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إغلاق', 'Close')}</Button>{canMove && <Button onClick={() => setMove(STATE_MOVES.find((m) => moveLimit(current, m) > 0) ?? 'setSafety')}><Layers className="size-4" aria-hidden="true" />{tx('انقل قطعًا بين الحالات', 'Move units between states')}</Button>}</>}>
      <section aria-labelledby="st-onhand" className="space-y-2 rounded-xl bg-surface-2 p-3">
        <p id="st-onhand" className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><span className="inline-flex items-center gap-1 font-semibold text-fg">{n.label('onHand')}<InfoHint label={n.label('onHand')}>{n.def('onHand')}</InfoHint></span><span className="text-xl font-bold tabular-nums text-fg">{b.onHand}</span></p>
        <CompositionBar b={b} />
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label={tx('مكونات الموجود', 'What on hand is made of')}>
          {PARTS.map((p) => <li key={p} className="inline-flex items-center gap-1"><span className={cn('size-2 rounded-full', STATE_DOT[p])} aria-hidden="true" />{n.short(p)} <span className="font-semibold tabular-nums text-fg">{b[p]}</span></li>)}
        </ul>
      </section>
      {b.available < 0 && <Alert tone="warn">{tx('الموجود أقل مما هو محجوز: بعض الطلبات قد لا تُغطّى. عدّل الكمية أو حوّل إليه.', 'On hand is below what is held: some orders may not be covered. Adjust the quantity or transfer stock in.')}</Alert>}
      <ul className="divide-y divide-border">{PARTS.map((p) => row(p, STATE_DOT[p]))}</ul>
      <div>
        <h3 className="text-[13px] font-semibold text-muted">{tx('في الطريق (خارج الموجود)', 'In transit (not on hand)')}</h3>
        <ul className="divide-y divide-border">{row('incoming')}{row('outgoing')}</ul>
      </div>
    </Modal>
  );
}

function MoveForm({ level, initial, where, onBack, onDone }: { level: Level; initial: StateMove; where: ReactNode; onBack: () => void; onDone: () => void }) {
  const tx = useTx();
  const n = useStateNames();
  const toast = useToast();
  const review = useReviewMode();
  const levels = levelsStore.use();
  const transfers = transfersStore.use();
  const current = levelOf(levels, level.sku, level.loc) ?? level;
  const [seen, setSeen] = useState(level);
  const [move, setMove] = useState<StateMove>(initial);
  const [qty, setQty] = useState(initial === 'setSafety' ? String(level.safety ?? 0) : '');
  const [reason, setReason] = useState<StateReason | ''>(MOVE_REASONS[initial].length === 2 ? MOVE_REASONS[initial][0] : '');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [conflict, setConflict] = useState<Level | null>(null);
  const parsed = qty.trim() ? parseDelta(qty) : null;
  const pv = movePreview(seen, move, parsed, transfers);
  const limit = moveLimit(seen, move);
  const qtyErr = (e: MoveError | null) => (!e ? null : e === 'exceeds' ? tx(`الحد الأقصى ${limit}`, `At most ${limit}`) : e === 'same' ? tx('هذا هو الاحتياطي الحالي', 'That is the current reserve') : move === 'setSafety' ? tx('عدد صحيح 0 أو أكثر', 'A whole number, 0 or more') : tx('عدد صحيح أكبر من صفر', 'A whole number above zero'));
  const changed = (['onHand', 'available', 'reserved', 'awaitingPay', 'unavailable', 'safety'] as StockState[]).filter((s) => pv.before[s] !== pv.after[s]);
  const pick = (m: StateMove) => { setMove(m); setQty(m === 'setSafety' ? String(seen.safety ?? 0) : ''); setReason(MOVE_REASONS[m].length === 2 ? MOVE_REASONS[m][0] : ''); setTried(false); };

  const record = (lv: Level, m: StateMove, q: number, r: StateReason, nt: string, undoOf?: string) => {
    const id = nextMoveId(stockLogStore.get());
    const res = moveStock(levelsStore.get(), lv.sku, lv.loc, m, q, r, lv.version, 'You', id, nt);
    if (res.error) return res;
    levelsStore.set(res.levels);
    stockLogStore.set((lg) => [res.log!, ...lg]);
    const s = res.log!.state!;
    logAction('inventory', { ar: `${undoOf ? `تراجع عن ${undoOf}: ` : ''}${n.move(m)} (${s.qty}) في ${LOCATIONS[lv.loc].ar}`, en: `${undoOf ? `Undid ${undoOf}: ` : ''}${n.move(m)} (${s.qty}) at ${LOCATIONS[lv.loc].en}` },
      { target: `${lv.sku} · ${id}`, before: `${n.label(s.from)}`, after: `${n.label(s.to)}` });
    return res;
  };

  const submit = () => {
    setTried(true);
    if (pv.error || !reason) return;
    const res = record(seen, move, parsed!, reason, note.trim());
    if (res.error === 'conflict') { setConflict(res.current!); return; }
    if (res.error) return;
    const id = res.log!.id;
    const after = levelOf(res.levels, seen.sku, seen.loc)!;
    // Undo is offered where the reverse move is exact: damaged ↔ restored, and the previous safety reserve.
    const back: [StateMove, number] | null = move === 'damage' ? ['restore', parsed!] : move === 'restore' ? ['damage', parsed!] : move === 'setSafety' ? ['setSafety', seen.safety ?? 0] : null;
    toast({
      tone: 'ok', text: tx(`سُجّل ${id}: ${n.move(move)}`, `Logged ${id}: ${n.move(move)}`),
      action: back ? { label: tx('تراجع', 'Undo'), run: () => {
        const cur = levelOf(levelsStore.get(), after.sku, after.loc);
        if (!cur || cur.version !== after.version) { toast({ tone: 'bad', text: tx('تغيّرت الكمية بعدها؛ لم نتراجع. عدّلها من حالات المخزون.', 'The level changed since; nothing was undone. Change it from Stock states.') }); return; }
        const u = record(cur, back[0], back[1], 'other', `Undo ${id}`, id);
        toast(u.error ? { tone: 'bad', text: tx('تعذّر التراجع', 'Could not undo') } : { tone: 'info', text: tx(`تراجعنا عن ${id}`, `Undid ${id}`) });
      } } : undefined,
    });
    onDone();
  };

  const verb = pv.error ? n.move(move) : move === 'setSafety' ? tx(`اجعل الاحتياطي ${parsed}`, `Set reserve to ${parsed}`) : tx(`${n.move(move)} · ${parsed}`, `${n.move(move)} · ${parsed}`);
  return (
    <Modal size="lg" title={tx('نقل قطع بين الحالات', 'Move units between states')} description={where} onClose={onDone}
      footer={<><Button variant="secondary" onClick={onBack}>{tx('رجوع', 'Back')}</Button><Button onClick={submit} disabled={!!conflict}>{verb}</Button></>}>
      {conflict && (
        <Alert tone="warn" title={tx('تغيّرت الكمية بعد أن فتحت النموذج', 'The level changed after you opened this')}
          action={<Button variant="secondary" size="sm" onClick={() => { setSeen(conflict); setConflict(null); }}>{tx('استخدم الحالي', 'Use current')}</Button>}>
          {tx(`عدّلها شخص آخر: الموجود الآن ${conflict.onHand} (كان ${seen.onHand}). لم نكتب فوق تعديله.`, `Someone else changed it: on hand is now ${conflict.onHand} (was ${seen.onHand}). We did not overwrite their change.`)}
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2" label={tx('الإجراء', 'Move')}>{(p) => (
          <Select {...p} value={move} onChange={(e) => pick(e.target.value as StateMove)}>
            {STATE_MOVES.map((m) => <option key={m} value={m} disabled={moveLimit(seen, m) === 0 && m !== 'setSafety'}>{n.move(m)}{m !== 'setSafety' ? ` (${tx('حتى', 'up to')} ${moveLimit(seen, m)})` : ''}</option>)}
          </Select>
        )}</Field>
        <Field label={move === 'setSafety' ? tx('الاحتياطي الجديد', 'New reserve') : tx('عدد القطع', 'Units')} error={tried ? qtyErr(pv.error) : null}
          hint={move === 'setSafety' ? tx(`الحالي ${seen.safety ?? 0} · الأقصى ${limit}`, `Now ${seen.safety ?? 0} · max ${limit}`) : tx(`المتاح لهذا الإجراء ${limit}`, `${limit} can move`)}>
          {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={qty} placeholder="1" onChange={(e) => setQty(e.target.value)} />}
        </Field>
        <Field label={tx('السبب', 'Reason')} error={tried && !reason ? tx('اختر سببًا', 'Choose a reason') : null}>{(p) => (
          <Select {...p} value={reason} onChange={(e) => setReason(e.target.value as StateReason)}><option value="">{tx('اختر…', 'Choose…')}</option>{MOVE_REASONS[move].map((r) => <option key={r} value={r}>{n.reason(r)}</option>)}</Select>
        )}</Field>
        <Field className="sm:col-span-2" label={tx('ملاحظة', 'Note')} optional>{(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </div>
      <section aria-label={tx('المعاينة', 'Preview')} aria-live="polite" className="rounded-xl border border-border">
        <h3 className="border-b border-border px-3 py-2 text-[13px] font-semibold text-fg">{tx('قبل ← بعد', 'Before → after')}</h3>
        {pv.error ? <p className="px-3 py-3 text-sm text-muted">{tx('أدخل عددًا صالحًا لترى الأثر.', 'Enter a valid number to see the effect.')}</p> : (
          <ul className="divide-y divide-border">
            {changed.map((s) => (
              <li key={s} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-muted">{n.label(s)}</span>
                <bdi dir="ltr" className="font-bold tabular-nums text-fg">{pv.before[s]} <ArrowLeft className="inline size-3.5 rotate-180 text-subtle" aria-hidden="true" /> <span className={pv.after[s] < pv.before[s] ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}>{pv.after[s]}</span></bdi>
              </li>
            ))}
            <li className="px-3 py-2 text-xs text-muted">{move === 'writeOff' ? tx('يقل الموجود؛ لا يعود إلا بتعديل كمية بسبب.', 'On hand goes down; it only comes back with an adjustment.') : move === 'confirmPay' ? tx('المتاح لا يتغير: القطع تنتقل من حجز إلى حجز.', 'Available does not change: units move from one hold to another.') : tx('الموجود لا يتغير؛ يتغير ما يُباع على الإنترنت.', 'On hand does not change; what sells online does.')}</li>
          </ul>
        )}
      </section>
      <p className="text-xs text-muted">{tx(`الإصدار الذي فتحته ${seen.version} · الحالي ${current.version} · يُسجَّل في سجل الحركة`, `Version you opened ${seen.version} · current ${current.version} · recorded in the stock log`)}</p>
      {review && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-3 text-xs">
          <span className="font-semibold text-muted">{tx('أداة مراجعة', 'Review tool')}</span>
          <Button variant="secondary" size="sm" onClick={() => levelsStore.set((ls) => bumpBySomeoneElse(ls, level.sku, level.loc, 2))}>{tx('حاكِ تعديل زميل (+2)', 'Simulate a colleague’s change (+2)')}</Button>
          <Simulated />
        </div>
      )}
    </Modal>
  );
}
