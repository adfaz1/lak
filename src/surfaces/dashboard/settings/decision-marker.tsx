// «قرار مطلوب» marker: a small link to the one pending-decisions page (`#/dashboard/settings/decisions?d=<id>`).
// Any section may import it: <DecisionMarker id="themeRevenue" />. The register lives in merchant/commercial.ts.
import { Scale } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { decisionById, decisionHref, type DecisionId } from '../../merchant/commercial';
import { cn, useTx } from '../../../ds/ui';

export function DecisionMarker({ id, className }: { id: DecisionId; className?: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const d = decisionById(id);
  return (
    <a href={decisionHref(id)} title={d.title[lang]}
      className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 text-[11px] font-semibold text-amber-800 transition-colors hover:bg-amber-500/20 dark:text-amber-200', className)}>
      <Scale className="size-3" aria-hidden="true" />{tx('قرار مطلوب', 'Decision needed')}
      <span className="sr-only">{`: ${d.title[lang]}`}</span>
    </a>
  );
}

/** «بانتظار الاعتماد» value used wherever a LAK price, fee, rate or limit would appear. */
export function Pending({ className }: { className?: string }) {
  const tx = useTx();
  return <span className={cn('text-xs font-medium text-amber-700 dark:text-amber-300', className)}>{tx('بانتظار الاعتماد', 'Pending approval')}</span>;
}
