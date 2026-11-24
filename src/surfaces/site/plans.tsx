// P01-PLN — plans: comparison matrix, monthly/annual toggle (no prices until approved), FAQ.
import { Check, ChevronDown, Minus } from 'lucide-react';
import type { Route } from '../../core/router';
import { Badge, Card, cn, LinkButton } from '../../ds/ui';
import { MATRIX, NOTES, PLAN_FAQ, PLANS, type NoteId } from './content';
import { PLAN_IDS, isPlan, toBilling, type Billing, type Cell, type PlanId } from './domain';
import { ArrowLink, H2, Intro, Lead, Pending, site, useSite, wrap } from './kit';

const C = {
  ar: {
    eyebrow: 'الباقات',
    title: 'باقة لكل مرحلة، بلا أرقام قبل اعتمادها',
    lead: 'المصفوفة أدناه من مخطط المنصة. الأسماء Basic وPlus وPro وSpecial أسماء عمل مؤقتة، والأسعار ستُنشر مع شروط التجديد والرسوم وما لا يشمله السعر.',
    billing: 'طريقة الدفع', monthly: 'شهري', annual: 'سنوي',
    perMonth: 'لكل شهر', perYear: 'لكل سنة',
    saving: 'توفير الاشتراك السنوي: يُعلن مع الأسعار',
    noSaving: 'الدفع الشهري: بلا التزام سنوي',
    compare: 'مقارنة كاملة للميزات',
    compareLead: 'كما وردت في مخطط المنصة. البنود ذات العلامة تحتاج قرارًا تجاريًا قبل النشر.',
    feature: 'الميزة', included: 'مشمول', notIncluded: 'غير مشمول',
    showPlan: 'اعرض ميزات باقة',
    notes: 'ملاحظات على المصفوفة',
    faq: 'أسئلة عن الأسعار والباقات',
    draft: 'المصفوفة مقترح من المخطط وليست التزامًا تعاقديًا.',
    draftWhy: 'الحدود النهائية تُشتق من سجل صلاحيات واحد يعتمده فريق المنتج.',
    questions: 'لم تجد إجابتك؟', contact: 'تواصل مع فريق المبيعات',
  },
  en: {
    eyebrow: 'Plans',
    title: 'A plan for every stage, with no numbers before they are approved',
    lead: 'The matrix below comes from the platform blueprint. Basic, Plus, Pro and Special are working names, and prices will be published with renewal terms, fees and what each price excludes.',
    billing: 'Billing', monthly: 'Monthly', annual: 'Annual',
    perMonth: 'per month', perYear: 'per year',
    saving: 'Annual saving: announced with prices',
    noSaving: 'Monthly billing: no annual commitment',
    compare: 'Full feature comparison',
    compareLead: 'As listed in the platform blueprint. Marked items need a business decision before publishing.',
    feature: 'Feature', included: 'Included', notIncluded: 'Not included',
    showPlan: 'Show features for',
    notes: 'Notes on the matrix',
    faq: 'Pricing and plan questions',
    draft: 'The matrix is a blueprint proposal, not a contractual commitment.',
    draftWhy: 'Final limits will come from a single entitlement registry approved by the product team.',
    questions: 'Did not find your answer?', contact: 'Contact the sales team',
  },
};

const NOTE_ORDER: NoteId[] = ['unlimited', 'commission', 'fleet', 'vat', 'domain', 'rbac'];
const noteNum = (id: NoteId) => NOTE_ORDER.indexOf(id) + 1;
const Sup = ({ id }: { id: NoteId }) => <sup className="ms-0.5 text-[10px] font-semibold text-brand-600 dark:text-brand-300">{noteNum(id)}</sup>;

export default function Plans({ route }: { route: Route }) {
  const { lang, t, tr } = useSite();
  const c = C[lang];
  const billing = toBilling(route.query.get('billing'));
  const picked: PlanId = isPlan(route.query.get('plan')) ? (route.query.get('plan') as PlanId) : 'plus';
  const q = (over: Record<string, string | undefined>) => site('plans', { billing: billing === 'annual' ? 'annual' : undefined, plan: route.query.get('plan') ?? undefined, ...over });

  return (
    <div className={cn(wrap, 'space-y-16 py-14 sm:py-20')}>
      <Intro eyebrow={c.eyebrow} title={c.title} lead={c.lead} />

      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div role="group" aria-label={c.billing} className="inline-flex rounded-xl bg-surface-2 p-1">
            {(['monthly', 'annual'] as Billing[]).map((b) => (
              <a key={b} href={q({ billing: b === 'annual' ? 'annual' : undefined })} aria-current={billing === b ? 'true' : undefined}
                className={cn('inline-flex h-9 items-center rounded-lg px-4 text-sm font-semibold transition-colors', billing === b ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}>{c[b]}</a>
            ))}
          </div>
          <p className="text-sm text-muted" aria-live="polite">{billing === 'annual' ? c.saving : c.noSaving}</p>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_IDS.map((id) => {
            const p = PLANS[id];
            return (
              <li key={id} className="flex flex-col rounded-2xl border border-border bg-surface p-6 shadow-card">
                <h2 className="text-xl font-bold text-fg"><bdi dir="ltr">{p.name}</bdi></h2>
                <div className="mt-4 space-y-1">
                  <p className="text-base font-semibold text-fg">{t.priceTbd}</p>
                  <p className="text-xs text-subtle">{billing === 'annual' ? c.perYear : c.perMonth}</p>
                </div>
                <p className="mt-4 flex-1 text-sm leading-relaxed text-muted">{tr(p.tagline)}</p>
                <LinkButton className="mt-6 w-full" variant={id === 'special' ? 'secondary' : 'primary'}
                  href={id === 'special' ? site('contact', { topic: 'sales' }) : site('start', { plan: id })}>{tr(p.cta)}</LinkButton>
              </li>
            );
          })}
        </ul>
        <Pending title={c.draft}>{c.draftWhy}</Pending>
      </div>

      <section aria-labelledby="site-compare" className="space-y-6">
        <div className="space-y-2"><H2 id="site-compare">{c.compare}</H2><Lead>{c.compareLead}</Lead></div>

        {/* Wide screens: the full matrix, scrolling inside its own box if needed. */}
        <Card className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">{c.compare}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-5 py-4 text-start font-semibold text-muted">{c.feature}</th>
                {PLAN_IDS.map((id) => <th key={id} scope="col" className="w-[15%] px-3 py-4 text-center font-bold text-fg"><bdi dir="ltr">{PLANS[id].name}</bdi></th>)}
              </tr>
            </thead>
            {MATRIX.map((g) => (
              <tbody key={g.id}>
                <tr><th scope="colgroup" colSpan={5} className="bg-surface-2 px-5 py-2.5 text-start text-xs font-semibold tracking-wide text-muted">{tr(g.title)}</th></tr>
                {g.rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <th scope="row" className="px-5 py-3 text-start font-medium text-fg">{tr(r.label)}{r.note && <Sup id={r.note} />}</th>
                    {r.cells.map((cell, i) => <td key={i} className="px-3 py-3 text-center"><CellView cell={cell} labels={c} /></td>)}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </Card>

        {/* Narrow screens: one plan at a time, chosen in the URL. */}
        <div className="space-y-5 md:hidden">
          <div role="group" aria-label={c.showPlan} className="flex flex-wrap gap-2">
            {PLAN_IDS.map((id) => (
              <a key={id} href={q({ plan: id })} aria-current={picked === id ? 'true' : undefined}
                className={cn('inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold', picked === id ? 'border-brand-600 bg-brand-600 text-white' : 'border-border bg-surface text-muted')}>
                <bdi dir="ltr">{PLANS[id].name}</bdi></a>
            ))}
          </div>
          {MATRIX.map((g) => (
            <Card key={g.id}>
              <h3 className="border-b border-border px-4 py-3 text-xs font-semibold tracking-wide text-muted">{tr(g.title)}</h3>
              <ul className="divide-y divide-border">
                {g.rows.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 text-fg">{tr(r.label)}{r.note && <Sup id={r.note} />}</span>
                    <span className="shrink-0 text-end"><CellView cell={r.cells[PLAN_IDS.indexOf(picked)]} labels={c} /></span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-fg">{c.notes}</h3>
          <ol className="space-y-2">
            {NOTE_ORDER.map((id) => <li key={id} className="flex gap-2.5 text-xs leading-relaxed text-muted"><span className="font-semibold text-brand-600 tabular-nums dark:text-brand-300">{noteNum(id)}</span>{tr(NOTES[id])}</li>)}
          </ol>
        </div>
      </section>

      <section aria-labelledby="site-faq" className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-4">
          <H2 id="site-faq">{c.faq}</H2>
          <p className="text-sm text-muted">{c.questions}</p>
          <ArrowLink href={site('contact', { topic: 'sales' })}>{c.contact}</ArrowLink>
        </div>
        <div className="divide-y divide-border border-y border-border lg:col-span-8">
          {PLAN_FAQ.map((f) => (
            <details key={f.q.en} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center gap-3 py-4 text-start font-semibold text-fg [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">{tr(f.q)}</span><ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="pb-5 text-sm leading-relaxed text-muted">{tr(f.a)}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function CellView({ cell, labels }: { cell: Cell; labels: { included: string; notIncluded: string } }) {
  const { tr, t } = useSite();
  if (cell.k === 'yes') return <span className="inline-grid size-6 place-items-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" title={labels.included}><Check className="size-3.5" aria-hidden="true" /><span className="sr-only">{labels.included}</span></span>;
  if (cell.k === 'no') return <span className="inline-grid size-6 place-items-center text-subtle" title={labels.notIncluded}><Minus className="size-3.5" aria-hidden="true" /><span className="sr-only">{labels.notIncluded}</span></span>;
  if (cell.k === 'pending') return <span className="inline-flex flex-col items-center gap-1 text-xs text-fg">{tr(cell.v)}<Badge tone="amber">{t.awaitingApproval}</Badge></span>;
  return <span className="text-xs font-semibold text-fg">{tr(cell.v)}</span>;
}
