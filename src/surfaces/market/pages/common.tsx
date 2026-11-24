// Page states shared by the shopper pages.
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Card, ErrorState, Skeleton, useTx } from '../../../ds/ui';
import { reviewFx } from '../state';

export function GridSkeleton({ n = 8 }: { n?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="overflow-hidden rounded-2xl border border-border bg-surface"><Skeleton className="aspect-square rounded-none" /><div className="space-y-2 p-3"><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-1/3" /></div></li>
      ))}
    </ul>
  );
}

export function ListSkeleton({ n = 3 }: { n?: number }) {
  return <div className="space-y-3" aria-hidden="true">{Array.from({ length: n }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>;
}

export function PageError({ title, refCode }: { title: string; refCode: string }) {
  const tx = useTx();
  return (
    <Card>
      <ErrorState as="h2" title={title} onRetry={() => reviewFx.set((x) => ({ ...x, state: 'live' }))}>
        {tx(`سلتك وطلباتك محفوظة. المرجع ${refCode}.`, `Your cart and orders are safe. Ref ${refCode}.`)}
      </ErrorState>
    </Card>
  );
}

/** Page title for shopper pages: larger than the dashboard's, still calm. */
export function Title({ children, sub, back, actions }: { children: ReactNode; sub?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode }) {
  return (
    <div className="mb-5 space-y-2">
      {back && <a href={back.href} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg"><ArrowRight className="size-4 ltr:rotate-180" aria-hidden="true" />{back.label}</a>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight text-fg sm:text-[28px]">{children}</h1>{sub && <p className="mt-1 text-sm text-muted">{sub}</p>}</div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
