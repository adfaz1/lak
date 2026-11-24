// Settlement issues on the finance page (the same list the home / work centre reads through settlementIssues()),
// and review-only simulations of a payout mismatch and a returned payout.
import { AlertTriangle, ArrowLeft, FlaskConical } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link } from '../../../core/router';
import { useReviewMode } from '../../../core/review';
import { Button, Money, cn, useTx } from '../../../ds/ui';
import { useToast } from '../../../ds/kit';
import type { SettlementIssue } from './model';
import { simulateMismatch, simulateReturned } from './stores';

export const issueHref = (i: SettlementIssue) => link(`/dashboard/finance${i.path ? `/${i.path}` : ''}`, i.query);

export function IssuesPanel({ issues }: { issues: SettlementIssue[] }) {
  const tx = useTx();
  const { lang } = useLang();
  if (!issues.length) return null;
  const bad = issues.some((i) => i.severity === 'bad');
  return (
    <section aria-labelledby="h-issues" className={cn('rounded-2xl border bg-surface', bad ? 'border-red-500/40' : 'border-amber-500/40')}>
      <h2 id="h-issues" className="flex items-center gap-2 px-5 pt-4 pb-2 text-[15px] font-semibold text-fg">
        <AlertTriangle className={cn('size-4', bad ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')} aria-hidden="true" />
        {tx(`مشكلات التسوية (${issues.length})`, `Settlement issues (${issues.length})`)}
      </h2>
      <ul className="divide-y divide-border">
        {issues.map((i) => (
          <li key={i.id}>
            <a href={issueHref(i)} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60">
              <span className={cn('size-2 shrink-0 rounded-full', i.severity === 'bad' ? 'bg-red-500' : 'bg-amber-500')} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg">{i.title[lang]}</p>
                <p className="text-xs text-muted">{i.detail[lang]}</p>
              </div>
              <Money v={i.amount} className="hidden text-sm font-semibold text-fg sm:inline-flex" />
              <ArrowLeft className="size-4 shrink-0 text-subtle transition-colors group-hover:text-brand-600 ltr:rotate-180" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Review mode only: create the problems the issue list and statements must handle. */
export function FinanceReviewSim() {
  const tx = useTx();
  const toast = useToast();
  if (!useReviewMode()) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border p-2 text-xs text-muted">
      <FlaskConical className="ms-1 size-4" aria-hidden="true" /><span className="font-semibold">{tx('محاكاة', 'Simulate')}</span>
      <Button size="sm" variant="ghost" onClick={() => { simulateMismatch(); toast({ tone: 'info', text: tx('حُوّل مبلغ أقل من الصافي لتحويل مدفوع (محاكاة)', 'A paid payout now differs from its net (simulated)') }); }}>{tx('فرق في تحويل', 'Payout mismatch')}</Button>
      <Button size="sm" variant="ghost" onClick={() => { simulateReturned(); toast({ tone: 'info', text: tx('أعاد البنك التحويل الجاري (محاكاة)', 'The bank returned the payout in transit (simulated)') }); }}>{tx('تحويل مرتجع', 'Returned payout')}</Button>
    </div>
  );
}
