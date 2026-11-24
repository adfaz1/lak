// Custom sub-statuses on the orders screens: the badge (list, cards, order page), the picker on the order page and
// the bulk «change sub-status» with preview, customer-message switch, result and undo. Definitions live in
// Settings → Order statuses (merchant/ops.ts sub-statuses).
import { useMemo, useState } from 'react';
import { CheckCircle2, ListTree, MessageSquare, MinusCircle } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link } from '../../../core/router';
import { formatInt } from '../../../core/format';
import { logAction, noticeMute, noticesStore, ordersStore, subStatusesStore } from '../../merchant/stores';
import type { Order } from '../../merchant/domain';
import { NOTICE_CHANNELS, SUB_PARENTS, liveSub, mainState, setSubStatus, subChoices, type MainState, type SubBlock } from '../../merchant/ops';
import { Alert, Field, Modal, Select, Simulated, Switch } from '../../../ds/kit';
import { Badge, Button, Ref, useTx } from '../../../ds/ui';
import { runSubBulk, statesOf, subBulkPlan, undoSubBulk } from './substatus-model';
import { saveOrder, useActor } from './ui';
import { useChannelName } from './notices-ui';

export const statusesHref = (q?: Record<string, string | undefined>) => link('/dashboard/settings/order-statuses', q);

export function useMainStateName() {
  const tx = useTx();
  return (s: MainState | string) => ({
    awaitingPay: tx('بانتظار الدفع', 'Awaiting payment'), processing: tx('قيد التجهيز', 'Processing'), ready: tx('جاهز للشحن', 'Ready to ship'),
    shipped: tx('مع الناقل', 'With the carrier'), delivered: tx('تم التسليم', 'Delivered'), cancelled: tx('ملغى', 'Cancelled'),
  } as Record<string, string>)[s] ?? s;
}

/** The order's live sub-status, in the colour its definition has now (the recorded name if it was deleted). */
export function SubBadge({ o, withIcon = true }: { o: Order; withIcon?: boolean }) {
  const { lang } = useLang();
  const defs = subStatusesStore.use();
  const s = liveSub(o);
  if (!s) return null;
  const def = defs.find((d) => d.id === s.id);
  return <Badge tone={def?.tone ?? 'gray'} icon={withIcon ? <ListTree className="size-3" aria-hidden="true" /> : undefined}>{(def?.name ?? s.name)[lang]}</Badge>;
}

/** Order page: pick a sub-status of the order's main state. Says whether the customer gets a message. */
export function SubPicker({ o, canEdit }: { o: Order; canEdit: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const who = useActor();
  const state = useMainStateName();
  const defs = subStatusesStore.use();
  const cfg = noticesStore.use();
  const choices = subChoices(o, defs);
  const cur = liveSub(o);
  const m = mainState(o);
  const [pick, setPick] = useState<string | null>(null);
  const chosen = pick === null ? null : defs.find((d) => d.id === pick) ?? null;
  const channels = NOTICE_CHANNELS.filter((c) => cfg.channels.subStatus?.[c]);
  const offered = (SUB_PARENTS as readonly string[]).includes(m);
  const apply = (notify: boolean) => {
    if (pick === null) return;
    const s = pick === '' ? null : chosen;
    if (!notify) noticeMute.add(o.ref);
    saveOrder(setSubStatus(o, s, who, Date.now()));
    setPick(null);
  };
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-fg"><ListTree className="size-4 text-muted" aria-hidden="true" />{tx('الحالة الفرعية', 'Sub-status')}</p>
      {!offered ? <p className="text-xs text-muted">{tx(`لا حالات فرعية لـ«${state(m)}»`, `No sub-statuses for “${state(m)}”`)}</p> : (
        <>
          <select aria-label={tx('الحالة الفرعية', 'Sub-status')} disabled={!canEdit || (!choices.length && !cur)} value={pick ?? cur?.id ?? ''} onChange={(e) => setPick(e.target.value === (cur?.id ?? '') ? null : e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg disabled:opacity-60">
            <option value="">{tx(`بلا حالة فرعية (${state(m)})`, `None (${state(m)})`)}</option>
            {cur && !choices.some((c) => c.id === cur.id) && <option value={cur.id}>{cur.name[lang]}</option>}
            {choices.map((c) => <option key={c.id} value={c.id}>{c.name[lang]}</option>)}
          </select>
          {!choices.length && !cur && <a href={statusesHref()} className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('أضف حالات فرعية', 'Add sub-statuses')}</a>}
          {pick !== null && (
            <div className="space-y-2 rounded-xl bg-surface-2 p-3 text-[13px]">
              <p className="text-fg">{chosen ? tx(`تصبح «${chosen.name.ar}» تحت «${state(m)}».`, `Becomes “${chosen.name.en}” under “${state(m)}”.`) : tx('تُزال الحالة الفرعية.', 'The sub-status is removed.')}</p>
              {chosen?.notify && channels.length > 0 && <p className="flex items-center gap-1.5 text-amber-800 dark:text-amber-200"><MessageSquare className="size-3.5" aria-hidden="true" />{tx('يصل العميل «تحديث على طلبك»', 'The customer gets “Update on your order”')}<Simulated /></p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => apply(true)}>{tx('احفظ', 'Save')}</Button>
                {chosen?.notify && channels.length > 0 && <Button size="sm" variant="secondary" onClick={() => apply(false)}>{tx('احفظ دون إبلاغ', 'Save without notifying')}</Button>}
                <Button size="sm" variant="ghost" onClick={() => setPick(null)}>{tx('إلغاء', 'Cancel')}</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export interface SubOutcome { ok: string[]; undo?: () => void; name: string }

/** Bulk change of sub-status: choose → preview (who changes, who is skipped and why, who is messaged) → result. */
export function SubBulkModal({ orders, allMatching, onClose }: { orders: Order[]; allMatching: boolean; onClose: (o: SubOutcome | null) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const who = useActor();
  const state = useMainStateName();
  const chName = useChannelName();
  const defs = subStatusesStore.use();
  const cfg = noticesStore.use();
  const states = useMemo(() => statesOf(orders), [orders]);
  const usable = defs.filter((d) => !d.archived && states.some((s) => s.state === d.parent));
  const [id, setId] = useState<string>(usable[0]?.id ?? '');
  const [notify, setNotify] = useState(true);
  const [done, setDone] = useState<{ ok: string[]; prev: Record<string, Order['sub']> } | null>(null);
  const sub = id === '-' ? null : defs.find((d) => d.id === id) ?? null;
  const plan = useMemo(() => subBulkPlan(orders, id === '-' ? null : sub, cfg), [orders, id, sub, cfg]);
  const n = plan.eligible.length;
  const channels = NOTICE_CHANNELS.filter((c) => cfg.channels.subStatus?.[c]);
  const name = sub ? sub.name[lang] : tx('بلا حالة فرعية', 'No sub-status');
  const why = (w: SubBlock, s: MainState) => w === 'otherState' ? tx(`في «${state(s)}»`, `In “${state(s)}”`) : w === 'same' ? tx('عليه الحالة نفسها', 'Already has it') : tx('مؤرشفة', 'Archived');

  const run = () => {
    if (!n || (id !== '-' && !sub)) return;
    const refs = plan.eligible.map((o) => o.ref);
    if (!(plan.notifies && notify)) refs.forEach((r) => noticeMute.add(r));
    const r = runSubBulk(ordersStore.get(), refs, sub, who, Date.now());
    ordersStore.set(r.orders);
    logAction('orders', { ar: `تغيير الحالة الفرعية جماعيًا إلى «${sub?.name.ar ?? 'بلا'}» (${r.changed.length} طلب)`, en: `Bulk sub-status → “${sub?.name.en ?? 'none'}” (${r.changed.length} orders)` }, { target: r.changed.slice(0, 10).join(',') + (r.changed.length > 10 ? '…' : ''), after: sub?.id ?? '-' });
    setDone({ ok: r.changed, prev: r.prev });
  };
  const finish = () => {
    if (!done) { onClose(null); return; }
    const prev = done.prev;
    onClose({ ok: done.ok, name, undo: done.ok.length ? () => {
      done.ok.forEach((r) => noticeMute.add(r));
      ordersStore.set((all) => undoSubBulk(all, prev, who, Date.now()));
      logAction('orders', { ar: `تراجع عن تغيير الحالة الفرعية (${done.ok.length} طلب)`, en: `Undid sub-status change (${done.ok.length} orders)` });
    } : undefined });
  };

  return (
    <Modal size="lg" title={done ? tx('النتيجة', 'Result') : tx('تغيير الحالة الفرعية', 'Change sub-status')} onClose={finish}
      description={!done ? (allMatching ? tx(`النطاق: كل النتائج المطابقة (${formatInt(orders.length)})`, `Scope: all ${formatInt(orders.length)} matching results`) : tx(`النطاق: ${formatInt(orders.length)} طلبات حددتها`, `Scope: the ${formatInt(orders.length)} orders you selected`)) : undefined}
      footer={done ? <Button onClick={finish}>{tx('تم', 'Done')}</Button> : <>
        <Button variant="secondary" onClick={() => onClose(null)}>{tx('رجوع', 'Back')}</Button>
        <Button disabled={!n} onClick={run}>{tx(`طبّق على ${formatInt(n)} طلبًا`, `Apply to ${formatInt(n)} orders`)}</Button>
      </>}>
      {done ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm text-fg"><CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />{tx(`تغيّرت ${formatInt(done.ok.length)} طلبات إلى «${name}»`, `${formatInt(done.ok.length)} orders now “${name}”`)}</p>
          {plan.skipped.length > 0 && <p className="text-[13px] text-muted">{tx(`تُرك ${plan.skipped.length} دون تغيير`, `${plan.skipped.length} left unchanged`)}</p>}
          <p className="text-xs text-muted">{tx('سُجّل في سجل كل طلب وفي سجل النشاط. يمكنك التراجع من الإشعار.', 'Logged on each order and in the activity log. You can undo from the notice.')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {!usable.length && !states.some((s) => (SUB_PARENTS as readonly string[]).includes(s.state)) ? (
            <Alert tone="info">{tx('الطلبات المحددة في حالات لا تقبل حالات فرعية (شُحن، سُلّم، ملغى).', 'The selected orders are in states without sub-statuses (shipped, delivered, cancelled).')}</Alert>
          ) : (
            <Field label={tx('الحالة الفرعية', 'Sub-status')} hint={<a href={statusesHref()} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('أدر الحالات', 'Manage statuses')}</a>}>
              {(p) => <Select {...p} value={id} onChange={(e) => setId(e.target.value)}>
                {states.filter((s) => (SUB_PARENTS as readonly string[]).includes(s.state)).map((s) => (
                  <optgroup key={s.state} label={tx(`${state(s.state)} (${s.n})`, `${state(s.state)} (${s.n})`)}>
                    {defs.filter((d) => d.parent === s.state && !d.archived).map((d) => <option key={d.id} value={d.id}>{d.name[lang]}</option>)}
                  </optgroup>
                ))}
                <option value="-">{tx('أزل الحالة الفرعية', 'Remove the sub-status')}</option>
              </Select>}
            </Field>
          )}
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-border px-3 py-2.5"><dt className="text-xs text-muted">{tx('يتغير', 'Will change')}</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums text-fg">{formatInt(n)}</dd></div>
            <div className="rounded-xl border border-border px-3 py-2.5"><dt className="text-xs text-muted">{tx('يُترك', 'Skipped')}</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums text-fg">{formatInt(plan.skipped.length)}</dd></div>
          </dl>
          {plan.notifies && (
            <div className="space-y-2 rounded-xl border border-dashed border-amber-500/50 bg-amber-500/5 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3 text-sm font-medium text-fg"><span>{tx(`أبلغ العملاء (${channels.map(chName).join('، ')})`, `Notify customers (${channels.map(chName).join(', ')})`)}</span><Switch checked={notify} onChange={setNotify} label={tx(`أبلغ العملاء (${channels.map(chName).join('، ')})`, `Notify customers (${channels.map(chName).join(', ')})`)} /></div>
              <p className="text-xs text-muted">{notify ? tx(`يصل ${formatInt(n)} عميلًا «تحديث على طلبك: ${sub?.name.ar}»`, `${formatInt(n)} customers get “Update on your order: ${sub?.name.en}”`) : tx('لن يصل العملاء شيء؛ يُسجَّل كمتخطّى.', 'Customers get nothing; recorded as skipped.')} <Simulated /></p>
            </div>
          )}
          {plan.skipped.length > 0 && (
            <details className="rounded-xl border border-border px-3 py-2 text-[13px]">
              <summary className="cursor-pointer font-medium text-fg">{tx(`لماذا يُترك ${plan.skipped.length}؟`, `Why ${plan.skipped.length} are skipped`)}</summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {plan.skipped.slice(0, 50).map((s) => <li key={s.ref} className="flex items-center gap-2 text-muted"><MinusCircle className="size-3.5" aria-hidden="true" /><Ref>#{s.ref}</Ref> · {why(s.why, s.state)}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}
