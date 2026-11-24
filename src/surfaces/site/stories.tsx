// P01-SUC / P01-GDE — merchant stories (honest empty state until approved cases exist) and the interactive marketing guide.
import { Check, Quote } from 'lucide-react';
import { link, type Route } from '../../core/router';
import { createStore } from '../../core/store';
import { Badge, Card, cn, LinkButton } from '../../ds/ui';
import { Checkbox } from '../../ds/kit';
import { GUIDE } from './content';
import { guideIndex, progress } from './domain';
import { ArrowLink, H2, H3, Intro, Pending, Status, site, useSite, wrap } from './kit';

const C = {
  ar: {
    sEyebrow: 'قصص التجار', sTitle: 'قصص حقيقية فقط، حين تكون جاهزة',
    sLead: 'ستعرض هذه الصفحة حالات تجار حقيقيين بموافقتهم، مع مصدر كل رقم وفترته. لا توجد حالات معتمدة بعد، لذلك لا نعرض قصصًا أو أرقامًا من عندنا.',
    slot: 'حالة بانتظار الاعتماد', slotN: (n: number) => `الحالة ${n}`,
    willHave: 'ما ستتضمنه كل حالة',
    parts: ['اسم المتجر ونشاطه بموافقة مكتوبة', 'التحدي قبل الانتقال إلى لك', 'ما تغيّر في طريقة العمل', 'رقم نمو واحد على الأقل، بمصدره وفترته', 'اقتباس من صاحب المتجر بنصه المعتمد'],
    nominate: 'رشّح متجرك', nominateLead: 'إن كان لديك متجر على لك وتريد مشاركة تجربتك، أرسل لنا. سنتواصل معك قبل نشر أي شيء.',
    gEyebrow: 'دليل التسويق', gTitle: 'سوّق متجرك في ست خطوات',
    gLead: 'دليل تفاعلي: افتح كل خطوة، وضع علامة على ما أنجزته. تقدمك محفوظ في هذه الجلسة فقط.',
    step: 'الخطوة', of: 'من', done: 'مكتمل', progressL: 'تقدمك', why: 'لماذا', todo: 'ما تفعله', where: 'أين في لك',
    prev: 'الخطوة السابقة', next: 'الخطوة التالية', steps: 'خطوات الدليل', openDemo: 'افتح لوحة التاجر (معاينة)', plannedNote: 'الأدوات الموسومة «مخطط» غير متاحة في المعاينة.', sample: 'شكل الحالة عند النشر (مثال توضيحي، لا تاجر حقيقي)', sampleStore: 'اسم المتجر', sampleMetric: 'رقم النمو', sampleQuote: 'اقتباس صاحب المتجر بنصه المعتمد', samplePeriod: 'المصدر والفترة',
  },
  en: {
    sEyebrow: 'Merchant stories', sTitle: 'Real stories only, when they are ready',
    sLead: 'This page will show real merchant cases with their consent, with a source and period for every number. There are no approved cases yet, so we show no stories or numbers of our own.',
    slot: 'Case awaiting approval', slotN: (n: number) => `Case ${n}`,
    willHave: 'What each case will include',
    parts: ['Store name and business, with written consent', 'The challenge before moving to LAK', 'What changed in the way they work', 'At least one growth metric, with its source and period', 'A quote from the owner, in its approved wording'],
    nominate: 'Nominate your store', nominateLead: 'If you run a store on LAK and want to share your experience, write to us. We will contact you before anything is published.',
    gEyebrow: 'Marketing guide', gTitle: 'Market your store in six steps',
    gLead: 'An interactive guide: open each step and tick what you have done. Your progress is kept for this session only.',
    step: 'Step', of: 'of', done: 'Done', progressL: 'Your progress', why: 'Why', todo: 'What to do', where: 'Where in LAK',
    prev: 'Previous step', next: 'Next step', steps: 'Guide steps', openDemo: 'Open the merchant dashboard (demo)', plannedNote: 'Tools marked “Planned” are not available in the preview.', sample: 'What a case will look like (illustrative layout, not a real merchant)', sampleStore: 'Store name', sampleMetric: 'Growth metric', sampleQuote: 'The owner’s quote, in its approved wording', samplePeriod: 'Source and period',
  },
};

export function Stories() {
  const { lang } = useSite();
  const c = C[lang];
  return (
    <div className={cn(wrap, 'space-y-16 py-14 sm:py-20')}>
      <Intro eyebrow={c.sEyebrow} title={c.sTitle} lead={c.sLead} />

      <section aria-labelledby="site-sample" className="space-y-4">
        <h2 id="site-sample" className="text-xs font-semibold tracking-wide text-subtle">{c.sample}</h2>
        <div aria-hidden="true" className="grid gap-8 rounded-3xl border border-dashed border-border p-8 sm:p-12 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <Quote className="size-8 text-brand-500/30" />
            <p className="text-2xl font-semibold leading-snug text-subtle sm:text-3xl">{c.sampleQuote}</p>
            <p className="text-sm text-subtle">— {c.sampleStore}</p>
          </div>
          <div className="flex flex-col justify-end gap-2 lg:col-span-5 lg:border-s lg:border-border lg:ps-8">
            <p className="text-5xl font-bold text-subtle">—</p>
            <p className="text-sm text-subtle">{c.sampleMetric} · {c.samplePeriod}</p>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <li key={n} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
              <span className="text-sm font-semibold text-fg">{c.slotN(n)}</span><Status s="pending" />
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-12 border-t border-border pt-12 md:grid-cols-2">
        <section aria-labelledby="site-will" className="space-y-4">
          <H3 id="site-will">{c.willHave}</H3>
          <ul className="space-y-2.5">{c.parts.map((p) => <li key={p} className="flex gap-2.5 text-sm text-fg"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />{p}</li>)}</ul>
        </section>
        <section aria-labelledby="site-nom" className="space-y-4">
          <H3 id="site-nom">{c.nominate}</H3>
          <p className="text-sm leading-relaxed text-muted">{c.nominateLead}</p>
          <LinkButton href={site('contact', { topic: 'story' })}>{c.nominate}</LinkButton>
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
  const i = guideIndex(route.query.get('step'), GUIDE.length);
  const s = GUIDE[i];
  const all = progress(done, GUIDE.flatMap((g) => g.tasks.map((x) => x.id)));
  const stepDone = (g: (typeof GUIDE)[number]) => g.tasks.every((x) => done[x.id]);
  const pct = all.total ? Math.round((all.done / all.total) * 100) : 0;

  return (
    <div className={cn(wrap, 'space-y-10 py-14 sm:py-20')}>
      <Intro eyebrow={c.gEyebrow} title={c.gTitle} lead={c.gLead} />
      <div className="flex max-w-xl items-center gap-4">
        <span className="shrink-0 text-sm font-semibold text-fg">{c.progressL}</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={c.progressL} aria-valuemin={0} aria-valuemax={all.total} aria-valuenow={all.done}>
          <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 text-sm text-muted tabular-nums"><bdi>{all.done}</bdi> {c.of} <bdi>{all.total}</bdi></span>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <nav aria-label={c.steps} className="lg:col-span-4">
          <ol className="space-y-1">
            {GUIDE.map((g, n) => (
              <li key={g.id}>
                <a href={site('guide', { step: String(n + 1) })} aria-current={n === i ? 'step' : undefined}
                  className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors', n === i ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'text-fg hover:bg-surface-2')}>
                  <span aria-hidden="true" className={cn('grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold', stepDone(g) ? 'bg-emerald-600 text-white' : 'bg-surface-2 text-muted')}>{stepDone(g) ? <Check className="size-3.5" /> : n + 1}</span>
                  <span>{tr(g.title)}{stepDone(g) && <span className="sr-only"> — {c.done}</span>}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <Card className="space-y-6 p-6 sm:p-8 lg:col-span-8">
          <div>
            <p className="text-xs font-semibold text-subtle">{c.step} <bdi>{i + 1}</bdi> {c.of} <bdi>{GUIDE.length}</bdi></p>
            <H2 id="site-step-h" className="mt-1">{tr(s.title)}</H2>
          </div>
          <div className="space-y-1.5"><h3 className="text-sm font-semibold text-fg">{c.why}</h3><p className="text-sm leading-relaxed text-muted">{tr(s.why)}</p></div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold text-fg">{c.todo}</legend>
            {s.tasks.map((x) => (
              <label key={x.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-4 py-3 text-sm text-fg hover:bg-surface-2/60">
                <span className="mt-0.5"><Checkbox checked={!!done[x.id]} label={tr(x.label)} onChange={(v) => guideStore.set((d) => ({ ...d, [x.id]: v }))} /></span>
                <span className={cn(done[x.id] && 'text-muted line-through')}>{tr(x.label)}</span>
              </label>
            ))}
          </fieldset>
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-fg">{c.where}</h3>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">{tr(s.where)} {s.status !== 'none' && <Status s={s.status} />}</p>
            {s.status === 'demo' && s.id === 'basics' && <ArrowLink href={link('/dashboard')}>{c.openDemo}</ArrowLink>}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
            {i > 0 && <LinkButton variant="secondary" href={site('guide', { step: String(i) })}>{c.prev}</LinkButton>}
            {i < GUIDE.length - 1 && <LinkButton href={site('guide', { step: String(i + 2) })}>{c.next}</LinkButton>}
            {i === GUIDE.length - 1 && <Badge tone={all.done === all.total ? 'green' : 'gray'}>{all.done === all.total ? c.done : `${all.done} / ${all.total}`}</Badge>}
          </div>
        </Card>
      </div>
      <Pending title={c.plannedNote} />
    </div>
  );
}
