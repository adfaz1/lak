// Honest social proof in the online store (free app «proof», only when installed and on): the latest real purchase of
// this product within the merchant's window, and «only N left» when sellable stock is at or below the threshold.
import { useEffect } from 'react';
import { Flame, ShoppingBag } from 'lucide-react';
import { useTx } from '../../../../ds/ui';
import { ordersStore } from '../../../merchant/stores';
import type { Product, Variant } from '../../../storefront/domain';
import { useS } from '../../../storefront/kit';
import { freeAppsStore, isOn } from './registry';
import { PROOF_DEFAULTS, lowStockLeft, proofLine, recentBuys, type ProofSettings, type RecentBuy } from './proof-model';
import { countShown, settingsOf } from './store-runtime';
import { useMinute } from './livechat-store';

/** The two lines; shared with the dashboard preview. */
export function ProofLines({ buy, left, now }: { buy: RecentBuy | null; left: number | null; now: number }) {
  const tx = useTx();
  const { lang } = useS();
  if (!buy && left === null) return null;
  return (
    <div className="space-y-1.5" data-free-app="proof">
      {buy && <p className="flex items-center gap-2 text-[13px]"><ShoppingBag className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />{proofLine(buy, now)[lang]}</p>}
      {left !== null && <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-800 dark:text-amber-300"><Flame className="size-4 shrink-0" aria-hidden="true" />{tx(left === 1 ? 'بقيت قطعة واحدة فقط' : left === 2 ? 'بقيت قطعتان فقط' : `بقي ${left} قطع فقط`, left === 1 ? 'Only 1 left' : `Only ${left} left`)}</p>}
    </div>
  );
}

/** Product page block. `variant` = the chosen option (low stock is only stated for a known option). */
export function StoreProof({ p, variant }: { p: Product; variant?: Variant }) {
  const apps = freeAppsStore.use();
  const orders = ordersStore.use();
  const now = useMinute();
  const on = isOn(apps, 'proof');
  const s: ProofSettings = settingsOf(apps, 'proof', PROOF_DEFAULTS);
  const buy = on && s.recent ? recentBuys(orders, p.variants.flatMap((v) => (v.sku ? [v.sku] : [])), s, now, 1)[0] ?? null : null;
  const v = variant ?? (p.variants.length === 1 ? p.variants[0] : undefined);
  const left = on && v ? lowStockLeft(v.stock, s) : null;
  const shown = !!buy || left !== null;
  useEffect(() => { if (shown) countShown('proof', `pf:${p.id}:${v?.id ?? ''}`); }, [shown, p.id, v?.id]);
  if (!on) return null;
  return <ProofLines buy={buy} left={left} now={now} />;
}
