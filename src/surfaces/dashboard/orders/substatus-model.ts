// Bulk «change sub-status»: which selected orders can take the chosen sub-status (same main state), who hears
// about it, and an undo that puts each order's previous sub-status back. Pure rules; merchant/ops.ts owns the domain.
import type { Order } from '../../merchant/domain';
import { NOTICE_CHANNELS, act, liveSub, mainState, setSubStatus, subBlock, type Actor, type MainState, type NoticeConfig, type SubBlock, type SubStatus } from '../../merchant/ops';

export interface SubPlan { eligible: Order[]; skipped: { ref: string; why: SubBlock; state: MainState }[]; notifies: boolean }

/** Preview: orders that change, orders skipped with the reason, and whether the change messages customers. */
export function subBulkPlan(orders: Order[], sub: SubStatus | null, cfg: NoticeConfig): SubPlan {
  const eligible: Order[] = [];
  const skipped: SubPlan['skipped'] = [];
  for (const o of orders) {
    const why = sub ? subBlock(o, sub) : liveSub(o) ? null : 'same';
    if (why) skipped.push({ ref: o.ref, why, state: mainState(o) });
    else eligible.push(o);
  }
  const notifies = !!sub?.notify && NOTICE_CHANNELS.some((c) => cfg.channels.subStatus?.[c]);
  return { eligible, skipped, notifies };
}

/** The sub-status a set of orders can share: every main state of the selection, most common first. */
export function statesOf(orders: Order[]): { state: MainState; n: number }[] {
  const m = new Map<MainState, number>();
  for (const o of orders) m.set(mainState(o), (m.get(mainState(o)) ?? 0) + 1);
  return [...m.entries()].map(([state, n]) => ({ state, n })).sort((a, b) => b.n - a.n);
}

/** Apply to the eligible refs. Returns the new orders, the refs that changed and each one's previous sub-status for undo. */
export function runSubBulk(all: Order[], refs: string[], sub: SubStatus | null, who: Actor, now: number): { orders: Order[]; changed: string[]; prev: Record<string, Order['sub']> } {
  const want = new Set(refs);
  const changed: string[] = [];
  const prev: Record<string, Order['sub']> = {};
  const orders = all.map((o) => {
    if (!want.has(o.ref)) return o;
    const next = setSubStatus(o, sub, who, now);
    if (next === o) return o;
    changed.push(o.ref); prev[o.ref] = o.sub;
    return next;
  });
  return { orders, changed, prev };
}

/** Undo: put back what each order had. Logged as a new line; nothing is removed from the log. */
export function undoSubBulk(all: Order[], prev: Record<string, Order['sub']>, who: Actor, now: number): Order[] {
  return all.map((o) => {
    if (!(o.ref in prev)) return o;
    const p = prev[o.ref];
    if ((p?.id ?? '') === (o.sub?.id ?? '')) return o;
    return p ? act({ ...o, sub: p }, 'subStatusSet', who, now, { text: `${p.name.ar}|${p.name.en}` }) : act({ ...o, sub: undefined }, 'subStatusCleared', who, now, { text: o.sub ? `${o.sub.name.ar}|${o.sub.name.en}` : '' });
  });
}
