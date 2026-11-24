import type { Route } from '../../core/router';
import { Badge } from '../../core/ui';
import { MATRIX, NOTES, PLAN_FAQ, PLANS, type NoteId } from './content';
import { PLAN_IDS, isPlan, toBilling, type Billing, type Cell, type PlanId } from './domain';
import { Icon, Intro, Pending, site, useSite } from './kit';

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

export default function Plans({ route }: { route: Route }) {
  const { lang, t, tr } = useSite();
  const c = C[lang];
  const billing = toBilling(route.query.get('billing'));
  const picked: PlanId = isPlan(route.query.get('plan')) ? (route.query.get('plan') as PlanId) : 'plus';
  const q = (over: Record<string, string | undefined>) => site('plans', { billing: billing === 'annual' ? 'annual' : undefined, plan: route.query.get('plan') ?? undefined, ...over });

  return (
    <div className="site-wrap site-pad">
      <Intro eyebrow={c.eyebrow} title={c.title} lead={c.lead} />

      <div className="site-billing">
        <div className="site-toggle" role="group" aria-label={c.billing}>
          {(['monthly', 'annual'] as Billing[]).map((b) => (
            <a key={b} href={q({ billing: b === 'annual' ? 'annual' : undefined })} aria-current={billing === b ? 'true' : undefined}>{c[b]}</a>
          ))}
        </div>
        <p className="site-saving" aria-live="polite">
          <Icon name="info" size={18} />{billing === 'annual' ? c.saving : c.noSaving}
        </p>
      </div>

      <ul className="site-plans">
        {PLAN_IDS.map((id) => {
          const p = PLANS[id];
          return (
            <li key={id} className={`site-plan${id === 'plus' ? ' site-plan-mark' : ''}`}>
              <h2 className="site-plan-name">{p.name}</h2>
              <p className="site-plan-price"><strong>{t.priceTbd}</strong><span className="muted small">{billing === 'annual' ? c.perYear : c.perMonth}</span></p>
              <p className="site-plan-tag">{tr(p.tagline)}</p>
              <a className={`btn${id === 'special' ? '' : ' primary'}`} href={id === 'special' ? site('contact', { topic: 'sales' }) : site('start', { plan: id })}>{tr(p.cta)}</a>
            </li>
          );
        })}
      </ul>

      <Pending title={c.draft}>{c.draftWhy}</Pending>

      <section className="site-block" aria-labelledby="site-compare">
        <h2 className="site-h2" id="site-compare">{c.compare}</h2>
        <p className="site-section-lead">{c.compareLead}</p>

        {/* Wide screens: the full matrix. */}
        <div className="table-wrap site-matrix-wide">
          <table className="site-matrix">
            <caption className="sr">{c.compare}</caption>
            <thead>
              <tr><th scope="col">{c.feature}</th>{PLAN_IDS.map((id) => <th key={id} scope="col" className="site-c">{PLANS[id].name}</th>)}</tr>
            </thead>
            {MATRIX.map((g) => (
              <tbody key={g.id}>
                <tr className="site-matrix-group"><th scope="colgroup" colSpan={5}>{tr(g.title)}</th></tr>
                {g.rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{tr(r.label)}{r.note && <sup className="site-note-ref">{noteNum(r.note)}</sup>}</th>
                    {r.cells.map((cell, i) => <td key={i} className="site-c"><CellView cell={cell} labels={c} /></td>)}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>

        {/* Narrow screens: one plan at a time, chosen in the URL. */}
        <div className="site-matrix-narrow">
          <div className="views" role="group" aria-label={c.showPlan}>
            {PLAN_IDS.map((id) => (
              <a key={id} className="chip" href={q({ plan: id })} aria-current={picked === id ? 'true' : undefined}>{PLANS[id].name}</a>
            ))}
          </div>
          {MATRIX.map((g) => (
            <div key={g.id} className="site-plan-list">
              <h3 className="site-h4">{tr(g.title)}</h3>
              <ul>
                {g.rows.map((r) => (
                  <li key={r.id}>
                    <span className="grow">{tr(r.label)}{r.note && <sup className="site-note-ref">{noteNum(r.note)}</sup>}</span>
                    <CellView cell={r.cells[PLAN_IDS.indexOf(picked)]} labels={c} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <h3 className="site-h4">{c.notes}</h3>
        <ol className="site-notes">
          {NOTE_ORDER.map((id) => <li key={id}><span className="site-note-ref">{noteNum(id)}</span>{tr(NOTES[id])}</li>)}
        </ol>
      </section>

      <section className="site-block" aria-labelledby="site-faq">
        <h2 className="site-h2" id="site-faq">{c.faq}</h2>
        <div className="site-faq">
          {PLAN_FAQ.map((f) => (
            <details key={f.q.en}>
              <summary><span className="grow">{tr(f.q)}</span><Icon name="chevron" size={18} /></summary>
              <p>{tr(f.a)}</p>
            </details>
          ))}
        </div>
        <p className="site-after">{c.questions} <a className="site-link" href={site('contact', { topic: 'sales' })}>{c.contact}<Icon name="arrow" size={16} /></a></p>
      </section>
    </div>
  );
}

function CellView({ cell, labels }: { cell: Cell; labels: { included: string; notIncluded: string } }) {
  const { tr, t } = useSite();
  if (cell.k === 'yes') return <span className="site-yes" title={labels.included}><Icon name="check" size={18} /><span className="sr">{labels.included}</span></span>;
  if (cell.k === 'no') return <span className="site-no" title={labels.notIncluded}><Icon name="minus" size={18} /><span className="sr">{labels.notIncluded}</span></span>;
  if (cell.k === 'pending') return <span className="site-cell-pending">{tr(cell.v)}<Badge tone="warning">{t.awaitingApproval}</Badge></span>;
  return <span className="strong">{tr(cell.v)}</span>;
}
