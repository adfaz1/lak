// Words for operating rules: triggers, conditions, actions and the rule in one plain sentence.
import { ArrowLeft } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { CITIES } from '../../merchant/domain';
import { productsStore, subStatusesStore } from '../../merchant/stores';
import type { OpRule, RuleAction, RuleActionKind, RuleCond, RuleField, RuleTrigger } from '../../merchant/ops';
import { useTx } from '../../../ds/ui';

export function useRuleNames() {
  const tx = useTx();
  const { lang } = useLang();
  const products = productsStore.use();
  const subs = subStatusesStore.use();
  const channel = (v: string) => ({ online: tx('المتجر', 'Store'), market: tx('سوق لك', 'Marketplace'), app: tx('التطبيق', 'App') } as Record<string, string>)[v] ?? v;
  const method = (v: string) => ({ card: tx('بطاقة', 'Card'), applepay: 'Apple Pay', bnpl: tx('تقسيط', 'Buy now, pay later'), cod: tx('الدفع عند الاستلام', 'Cash on delivery'), bank: tx('تحويل بنكي', 'Bank transfer'), manual: tx('يدوي', 'Manual') } as Record<string, string>)[v] ?? v;
  const city = (v: string) => CITIES.find((c) => c.en === v)?.[lang] ?? v;
  const product = (id: string) => products.find((p) => p.id === id)?.name[lang] ?? (id || tx('اختر منتجًا', 'pick a product'));
  const sub = (id: string) => subs.find((s) => s.id === id)?.name[lang] ?? tx('حالة محذوفة', 'deleted status');
  return {
    channel, method, city, product, sub,
    trigger: (t: RuleTrigger) => ({ orderCreated: tx('يُنشأ طلب', 'An order is created'), orderPaid: tx('يُدفع طلب', 'An order is paid') })[t],
    field: (f: RuleField) => ({ city: tx('المدينة', 'City'), channel: tx('القناة', 'Channel'), totalMin: tx('الإجمالي ≥ (ر.س)', 'Total ≥ (SAR)'), totalMax: tx('الإجمالي ≤ (ر.س)', 'Total ≤ (SAR)'), product: tx('يحوي المنتج', 'Contains product'), payMethod: tx('وسيلة الدفع', 'Payment method') })[f],
    cond: (c: RuleCond) => {
      switch (c.field) {
        case 'city': return tx(`المدينة ${city(c.value)}`, `city is ${city(c.value)}`);
        case 'channel': return tx(`من ${channel(c.value)}`, `from ${channel(c.value)}`);
        case 'totalMin': return tx(`الإجمالي ≥ ${c.value} ر.س`, `total ≥ SAR ${c.value}`);
        case 'totalMax': return tx(`الإجمالي ≤ ${c.value} ر.س`, `total ≤ SAR ${c.value}`);
        case 'product': return tx(`يحوي «${product(c.value)}»`, `contains “${product(c.value)}”`);
        case 'payMethod': return tx(`الدفع ${method(c.value)}`, `paid by ${method(c.value)}`);
      }
    },
    kind: (k: RuleActionKind) => ({ assign: tx('أسند إلى عضو', 'Assign to a member'), tagAdd: tx('أضف وسمًا', 'Add a tag'), tagRemove: tx('احذف وسمًا', 'Remove a tag'), subStatus: tx('اضبط الحالة الفرعية', 'Set sub-status'), notifyMember: tx('نبّه عضوًا', 'Notify a team member') })[k],
    action: (a: RuleAction) => {
      switch (a.kind) {
        case 'assign': return a.members.length > 1 ? tx(`أسند بالتناوب: ${a.members.join('، ')}`, `assign in turn: ${a.members.join(', ')}`) : tx(`أسند إلى ${a.members[0] ?? '…'}`, `assign to ${a.members[0] ?? '…'}`);
        case 'tagAdd': return tx(`أضف وسم «${a.tag || '…'}»`, `add tag “${a.tag || '…'}”`);
        case 'tagRemove': return tx(`احذف وسم «${a.tag || '…'}»`, `remove tag “${a.tag || '…'}”`);
        case 'subStatus': return tx(`الحالة الفرعية «${a.id ? sub(a.id) : '…'}»`, `sub-status “${a.id ? sub(a.id) : '…'}”`);
        case 'notifyMember': return tx(`نبّه ${a.member || '…'}`, `notify ${a.member || '…'}`);
      }
    },
  };
}

/** «When an order is paid and city is Jeddah → assign to Faisal, add tag …». */
export function RuleSentence({ r, compact }: { r: OpRule; compact?: boolean }) {
  const tx = useTx();
  const n = useRuleNames();
  if (compact) return <>{n.trigger(r.trigger)}{r.conds.length ? ` · ${r.conds.map(n.cond).join(tx('، ', ', '))}` : ''} {tx('←', '→')} {r.actions.length ? r.actions.map(n.action).join(tx('، ', ', ')) : tx('بلا إجراء', 'no action')}</>;
  const chip = 'rounded-lg bg-surface px-2 py-0.5 font-semibold text-fg shadow-card';
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[15px] leading-relaxed text-fg">
      <span>{tx('عندما', 'When')}</span><span className={chip}>{n.trigger(r.trigger)}</span>
      {r.conds.length > 0 && <><span>{tx('و', 'and')}</span>{r.conds.map((c, i) => <span key={i} className="contents">{i > 0 && <span>{tx('و', 'and')}</span>}<span className={chip}>{n.cond(c)}</span></span>)}</>}
      <ArrowLeft className="size-4 text-subtle ltr:rotate-180" aria-hidden="true" />
      {r.actions.length ? r.actions.map((a, i) => <span key={i} className="contents">{i > 0 && <span>{tx('ثم', 'then')}</span>}<span className={chip}>{n.action(a)}</span></span>) : <span className="text-muted">{tx('بلا إجراء بعد', 'no action yet')}</span>}
    </p>
  );
}
