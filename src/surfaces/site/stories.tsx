import { link, type Route } from '../../core/router';
import { createStore } from '../../core/store';
import { Badge } from '../../core/ui';
import { GUIDE } from './content';
import { progress } from './domain';
import { Icon, Intro, Pending, Status, site, useSite } from './kit';

/* Success stories (placeholders until approved cases exist) and the interactive marketing guide. */

const C = {
  ar: {
    sEyebrow: 'قصص التجار', sTitle: 'قصص حقيقية فقط، حين تكون جاهزة',
    sLead: 'ستعرض هذه الصفحة حالات تجار حقيقيين بموافقتهم، مع مصدر كل رقم وفترته. لا توجد حالات معتمدة بعد، لذلك لا نعرض قصصًا أو أرقامًا من عندنا.',
    slot: 'حالة بانتظار الاعتماد', slotN: (n: number) => `الحالة ${n}`,
    willHave: 'ما ستتضمنه كل حالة',
    parts: ['اسم المتجر ونشاطه بموافقة مكتوبة', 'التحدي قبل الانتقال إلى لك', 'ما تغيّر في طريقة العمل', 'رقم نمو واحد على الأقل، بمصدره وفترته', 'اقتباس من صاحب المتجر بنصه المعتمد'],
    nominate: 'رشّح متجرك', nominateLead: 'إن كان لديك متجر على لك وتريد مشاركة تجربتك، أرسل لنا. سنتواصل معك قبل نشر أي شيء.',
    gEyebrow: 'دليل التسويق', gTitle: 'سوّق متجرك في ست خطوات',
    gLead: 'دليل تفاعلي: افتح كل خطوة، وضع علامة على ما أنجزته. تقدمك محفوظ في هذه الجلسة فقط ويُمسح عند إعادة ضبط البيانات.',
    step: 'الخطوة', of: 'من', done: 'مكتمل', progressL: 'تقدمك', why: 'لماذا', todo: 'ما تفعله', where: 'أين في لك',
    prev: 'الخطوة السابقة', next: 'الخطوة التالية', steps: 'خطوات الدليل', openDemo: 'افتح لوحة التاجر (معاينة)',
  },
  en: {
    sEyebrow: 'Merchant stories', sTitle: 'Real stories only, when they are ready',
    sLead: 'This page will show real merchant cases with their consent, with a source and period for every number. There are no approved cases yet, so we show no stories or numbers of our own.',
    slot: 'Case awaiting approval', slotN: (n: number) => `Case ${n}`,
    willHave: 'What each case will include',
    parts: ['Store name and business, with written consent', 'The challenge before moving to LAK', 'What changed in the way they work', 'At least one growth metric, with its source and period', 'A quote from the owner, in its approved wording'],
    nominate: 'Nominate your store', nominateLead: 'If you run a store on LAK and want to share your experience, write to us. We will contact you before anything is published.',
    gEyebrow: 'Marketing guide', gTitle: 'Market your store in six steps',
    gLead: 'An interactive guide: open each step and tick what you have done. Your progress is kept for this session only and cleared by “Reset data”.',
    step: 'Step', of: 'of', done: 'Done', progressL: 'Your progress', why: 'Why', todo: 'What to do', where: 'Where in LAK',
    prev: 'Previous step', next: 'Next step', steps: 'Guide steps', openDemo: 'Open the merchant workspace (demo)',
  },
};

export function Stories() {
  const { lang } = useSite();
  const c = C[lang];
  return (
    <div className="site-wrap site-pad">
      <Intro eyebrow={c.sEyebrow} title={c.sTitle} lead={c.sLead} />
      <ul className="site-slots">
        {[1, 2, 3].map((n) => (
          <li key={n} className="site-slot">
            <span className="site-slot-n" aria-hidden="true">0{n}</span>
            <span className="strong">{c.slotN(n)}</span>
            <Status s="pending" />
            <span className="muted small">{c.slot}</span>
          </li>
        ))}
      </ul>
      <div className="site-block site-two">
        <section aria-labelledby="site-will">
          <h2 className="site-h3" id="site-will">{c.willHave}</h2>
          <ul className="site-points">{c.parts.map((p) => <li key={p}><Icon name="check" size={18} />{p}</li>)}</ul>
        </section>
        <section aria-labelledby="site-nom">
          <h2 className="site-h3" id="site-nom">{c.nominate}</h2>
          <p>{c.nominateLead}</p>
          <a className="btn primary" href={site('contact', { topic: 'story' })}>{c.nominate}</a>
        </section>
      </div>
    </div>
  );
}

/** Ticked guide tasks. Simulated, per session. */
const guideStore = createStore.key('site.guideStore')<Record<string, boolean>>(() => ({}));

export function Guide({ route }: { route: Route }) {
  const { lang, tr } = useSite();
  const c = C[lang];
  const done = guideStore.use();
  const raw = Number(route.query.get('step'));
  const i = Number.isInteger(raw) && raw >= 1 && raw <= GUIDE.length ? raw - 1 : 0;
  const s = GUIDE[i];
  const all = progress(done, GUIDE.flatMap((g) => g.tasks.map((x) => x.id)));
  const stepDone = (g: (typeof GUIDE)[number]) => g.tasks.every((x) => done[x.id]);

  return (
    <div className="site-wrap site-pad">
      <Intro eyebrow={c.gEyebrow} title={c.gTitle} lead={c.gLead} />
      <div className="site-progress">
        <span className="strong">{c.progressL}</span>
        <progress max={all.total} value={all.done} aria-label={c.progressL} />
        <span className="muted"><bdi>{all.done}</bdi> {c.of} <bdi>{all.total}</bdi></span>
      </div>
      <div className="site-guide">
        <nav aria-label={c.steps}>
          <ol className="site-guide-steps">
            {GUIDE.map((g, n) => (
              <li key={g.id}>
                <a href={site('guide', { step: String(n + 1) })} aria-current={n === i ? 'step' : undefined}>
                  <span className="site-step-n" data-done={stepDone(g) || undefined} aria-hidden="true">{stepDone(g) ? <Icon name="check" size={14} /> : n + 1}</span>
                  <span>{tr(g.title)}{stepDone(g) && <span className="sr"> — {c.done}</span>}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <section className="site-guide-body" aria-labelledby="site-step-h">
          <p className="site-eyebrow">{c.step} <bdi>{i + 1}</bdi> {c.of} <bdi>{GUIDE.length}</bdi></p>
          <h2 className="site-h2" id="site-step-h">{tr(s.title)}</h2>
          <h3 className="site-h4">{c.why}</h3>
          <p>{tr(s.why)}</p>
          <fieldset>
            <legend className="site-h4">{c.todo}</legend>
            {s.tasks.map((x) => (
              <label key={x.id} className="check site-check">
                <input type="checkbox" checked={!!done[x.id]} onChange={(e) => guideStore.set((d) => ({ ...d, [x.id]: e.target.checked }))} />
                <span>{tr(x.label)}</span>
              </label>
            ))}
          </fieldset>
          <h3 className="site-h4">{c.where}</h3>
          <p className="site-where">{tr(s.where)} {s.status !== 'none' && <Status s={s.status} />}</p>
          {s.status === 'demo' && s.id === 'basics' && <a className="site-link" href={link('/merchant')}>{c.openDemo}<Icon name="arrow" size={16} /></a>}
          <div className="site-cta-row">
            {i > 0 && <a className="btn" href={site('guide', { step: String(i) })}>{c.prev}</a>}
            {i < GUIDE.length - 1 && <a className="btn primary" href={site('guide', { step: String(i + 2) })}>{c.next}</a>}
            {i === GUIDE.length - 1 && <Badge tone={all.done === all.total ? 'success' : 'neutral'}>{all.done === all.total ? c.done : `${all.done} / ${all.total}`}</Badge>}
          </div>
        </section>
      </div>
      <Pending title={lang === 'ar' ? 'الأدوات الموسومة «مخطط» غير متاحة في المعاينة.' : 'Tools marked “Planned” are not available in the preview.'} />
    </div>
  );
}
