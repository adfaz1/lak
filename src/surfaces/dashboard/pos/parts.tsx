// Shared by the POS, wholesale and ads sections (Phase D, channels group): the «قرار مطلوب» marker that links to the
// single decisions page, and the «بانتظار الاعتماد» value used wherever LAK has not set a price, fee or limit.
import type { ReactNode } from 'react';
import { Scale } from 'lucide-react';
import { Badge, cn, useTx } from '../../../ds/ui';
import { sectionHref } from '../pages';

/** Small marker: this tool waits on a LAK business decision. Opens `#/dashboard/settings/decisions`. */
export function DecisionMark({ what, className }: { what?: string; className?: string }) {
  const tx = useTx();
  return (
    <a href={sectionHref('settings', 'decisions')} title={what} className={cn('inline-flex h-6 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-500/20 dark:text-amber-200', className)}>
      <Scale className="size-3" aria-hidden="true" />{tx('قرار مطلوب', 'Decision needed')}
    </a>
  );
}

/** A LAK-set value that is not approved yet. Never a number. */
export function Pending() {
  const tx = useTx();
  return <Badge tone="amber">{tx('بانتظار الاعتماد', 'Pending approval')}</Badge>;
}

/** Bilingual label for a value row: label on the start side, value on the end side. */
export function Row({ label, children, strong }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return <div className={cn('flex items-center justify-between gap-3 py-1.5 text-sm', strong ? 'font-bold text-fg' : 'text-muted')}><span>{label}</span><span className={strong ? 'text-fg' : 'text-fg'}>{children}</span></div>;
}
