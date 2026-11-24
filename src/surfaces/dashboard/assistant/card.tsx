// Compact assistant card for the home: the first question this role can ask, answered in one line with its
// key evidence, a link to the full answer and, when there is one, the draft it proposes (never executed here).
import type { ReactNode } from 'react';
import { ArrowLeft, Bot } from 'lucide-react';
import { navigate } from '../../../core/router';
import { Badge, Button, Card, Delta, LinkButton, Money, useTx } from '../../../ds/ui';
import { dhref } from '../shell';
import { assistantLogStore, useWho } from '../work/state';
import { canDraft, logDraft, type Draft, type Question } from './model';
import { useAnswers } from './data';
import { DRAFT_TITLE, draftHref } from './text';

export function AssistantCard({ period, empty }: { period: 7 | 30; empty: boolean }) {
  const tx = useTx();
  const who = useWho();
  const a = useAnswers(period, empty);
  const q: Question | undefined = a.questions[0];
  if (!q) return null;

  let line: ReactNode = null;
  let draft: Draft | null = null;
  if (q === 'sales' || q === 'conversion') {
    const s = a.sales;
    if (s.kind === 'insufficient') line = tx('لا بيانات كافية بعد لشرح تغيّر المبيعات.', 'Not enough data yet to explain a sales change.');
    else {
      const down = s.net.cur < s.net.prev;
      const big = Math.abs(s.effects.orders) >= Math.abs(s.effects.aov) ? tx('عدد الطلبات', 'the number of orders') : tx('متوسط قيمة الطلب', 'the average order value');
      line = <>{down ? tx('صافي المبيعات انخفض', 'Net sales fell') : tx('صافي المبيعات ارتفع', 'Net sales rose')} <Delta v={s.net.delta} /> {tx(`عن ${period} أيام سابقة؛ أغلب الفرق من ${big}`, `vs the previous ${period} days; most of it from ${big}`)} (<Money v={Math.abs(s.net.cur - s.net.prev)} />).</>;
      draft = s.draft;
    }
  } else if (q === 'stock') {
    line = a.stock.rows.length ? tx(`${a.stock.rows.length} أصناف تكفي أقل من 14 يومًا بمعدل بيعها.`, `${a.stock.rows.length} SKUs cover less than 14 days at their sales rate.`) : tx('لا صنف يقترب من النفاد.', 'No SKU is close to running out.');
    draft = a.stock.draft;
  } else if (q === 'late') {
    line = a.late.count ? tx(`${a.late.count} طلبات مدفوعة متأخرة أكثر من 24 ساعة.`, `${a.late.count} paid orders are over 24 hours late.`) : tx('لا طلبات متأخرة.', 'No late orders.');
    draft = a.late.draft;
  }
  const can = draft && canDraft(a.role, draft);
  const open = () => { if (!draft) return; const d = draft; assistantLogStore.set((l) => logDraft(l, q, d.kind, who, Date.now())); navigate(draftHref(d)); };

  return (
    <Card aria-labelledby="h-assist" className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300" aria-hidden="true"><Bot className="size-5" /></span>
      <div className="min-w-0 flex-1 basis-64">
        <h2 id="h-assist" className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">{tx('المساعد', 'Assistant')}<Badge tone="gray">{tx('من بيانات متجرك · قواعد ثابتة', 'From your store data · fixed rules')}</Badge></h2>
        <p className="mt-1 text-[13px] text-muted">{line}</p>
      </div>
      <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
        <LinkButton variant="ghost" size="sm" href={dhref('assistant', { q, period: period === 30 ? '30' : undefined })}>{tx('الدليل', 'Evidence')}</LinkButton>
        {draft && can && <Button variant="soft" size="sm" onClick={open}>{tx(`مسودة: ${DRAFT_TITLE[draft.kind].ar}`, `Draft: ${DRAFT_TITLE[draft.kind].en}`)}<ArrowLeft className="size-3.5 ltr:rotate-180" aria-hidden="true" /></Button>}
      </div>
    </Card>
  );
}
