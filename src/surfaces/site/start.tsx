// P01 start-store flow: the minimum to create an account, then a simulated "created → next: verification" state.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import { link, type Route } from '../../core/router';
import { createStore } from '../../core/store';
import { Badge, Button, Card, cn, LinkButton, Ref } from '../../ds/ui';
import { Alert, Field, Input, Select, Simulated } from '../../ds/kit';
import { PLANS, SECTORS } from './content';
import { PLAN_IDS, STORE_NAME_MAX, hasErrors, isPlan, normalizeSaudiMobile, validateSignup, type SignupDraft, type SignupErrors } from './domain';
import { Eyebrow, Fwd, site, useSite, wrap } from './kit';

const C = {
  ar: {
    eyebrow: 'ابدأ إنشاء متجرك', fix: 'صحّح الحقول المعلّمة', stepOf: (n: number) => `الخطوة ${n} من 4`, title: 'ثلاث معلومات، ثم نكمل معًا',
    lead: 'نطلب الآن الحد الأدنى فقط. المستندات والدفع والشحن تأتي لاحقًا، عندما تحتاجها خدمة بعينها.',
    sim: 'التسجيل هنا محاكاة: لا يُنشأ حساب حقيقي ولا تُرسل رسائل.',
    storeName: 'اسم المتجر', storeHint: (n: number) => `${n} / ${STORE_NAME_MAX} حرف`,
    activity: 'نوع النشاط', chooseActivity: 'اختر نوع النشاط', other: 'نشاط آخر',
    phone: 'رقم الجوال', phoneHint: 'جوال سعودي، مثل 05XXXXXXXX', plan: 'الباقة', planOptional: '(اختياري)', undecided: 'لم أقرر بعد', planNote: 'السعر بانتظار الاعتماد',
    terms: 'أوافق على', termsLink: 'شروط الاستخدام', and: 'و', privacyLink: 'سياسة الخصوصية', termsDraft: '(مسودات)',
    create: 'أنشئ الحساب',
    stepsTitle: 'ما الذي يحدث بعد ذلك',
    steps: [
      ['إنشاء الحساب', 'الآن، بالمعلومات الثلاث.'],
      ['التحقق', 'هوية صاحب النشاط ومستنداته. لازم لتفعيل الدفع الإلكتروني، ويراجعه فريق لك يدويًا.'],
      ['إعداد المتجر', 'الهوية والمنتجات والدفع والشحن، بالترتيب الذي يناسبك.'],
      ['الفتح', 'جاهز للمعاينة، ثم جاهز للاختبار، ثم جاهز للفتح، حسب الخدمات المفعلة فعلًا.'],
    ] as [string, string][],
    createdTitle: 'أُنشئ الحساب', createdLead: 'الخطوة التالية: التحقق من الهوية والنشاط.',
    simNote: 'محاكاة: لم يُنشأ حساب حقيقي، ولم تُرسل أي رسالة إلى رقمك.',
    summary: 'بيانات الحساب', now: 'الحالة', nowV: 'بانتظار التحقق',
    next: 'التالي: التحقق', nextBody: 'في المنتج الحقيقي ستُطلب هنا بيانات صاحب النشاط ومستنداته، مع شرح سبب كل مستند. هذه الخطوة غير مبنية في المعاينة.',
    openDemo: 'افتح لوحة التاجر التجريبية', edit: 'عدّل البيانات', restart: 'ابدأ من جديد', demoNote: 'لوحة التاجر التجريبية تعرض متجر مثال، لا المتجر الذي أنشأته.',
  },
  en: {
    eyebrow: 'Start your store', fix: 'Fix the marked fields', stepOf: (n: number) => `Step ${n} of 4`, title: 'Three things, then we continue together',
    lead: 'We only ask for the minimum now. Documents, payments and shipping come later, when a specific service needs them.',
    sim: 'Sign-up here is simulated: no real account is created and no messages are sent.',
    storeName: 'Store name', storeHint: (n: number) => `${n} / ${STORE_NAME_MAX} characters`,
    activity: 'Type of business', chooseActivity: 'Choose a business type', other: 'Other',
    phone: 'Mobile number', phoneHint: 'Saudi mobile, e.g. 05XXXXXXXX', plan: 'Plan', planOptional: '(optional)', undecided: 'Not decided yet', planNote: 'Price to be approved',
    terms: 'I agree to the', termsLink: 'terms of service', and: 'and', privacyLink: 'privacy policy', termsDraft: '(drafts)',
    create: 'Create account',
    stepsTitle: 'What happens next',
    steps: [
      ['Create the account', 'Now, with these three things.'],
      ['Verification', 'The owner’s identity and business documents. Needed to activate online payments; reviewed manually by the LAK team.'],
      ['Set up the store', 'Brand, products, payments and shipping, in the order that suits you.'],
      ['Open', 'Ready to preview, then ready to test, then ready to open — based on services that are actually active.'],
    ],
    createdTitle: 'Account created', createdLead: 'Next step: identity and business verification.',
    simNote: 'Simulated: no real account was created and no message was sent to your number.',
    summary: 'Account details', now: 'Status', nowV: 'Awaiting verification',
    next: 'Next: verification', nextBody: 'In the real product this is where the owner’s details and documents are requested, with the reason for each. This step is not built in the preview.',
    openDemo: 'Open the demo merchant workspace', edit: 'Edit details', restart: 'Start over', demoNote: 'The demo workspace shows an example store, not the one you just created.',
  },
};

const EMPTY: SignupDraft = { storeName: '', activity: '', phone: '', plan: '', terms: false };
/** Simulated sign-up; the draft survives visiting the terms page and coming back. */
const startStore = createStore.key('site.startStore')<{ draft: SignupDraft; created: boolean }>(() => ({ draft: EMPTY, created: false }));

export default function Start({ route }: { route: Route }) {
  const { lang, t, tr } = useSite();
  const c = C[lang];
  const { draft, created } = startStore.use();
  const [errors, setErrors] = useState<SignupErrors>({});
  const [tried, setTried] = useState(false);
  const summary = useRef<HTMLDivElement>(null);
  const result = useRef<HTMLHeadingElement>(null);
  const qPlan = route.query.get('plan');
  const qAct = route.query.get('activity');

  // Plan / activity chosen elsewhere (plans page, sector tiles) prefill empty fields only.
  useEffect(() => {
    const d = startStore.get().draft;
    const next = { ...d };
    if (isPlan(qPlan) && !d.plan) next.plan = qPlan;
    if (qAct && SECTORS.some((s) => s.id === qAct) && !d.activity) next.activity = qAct;
    if (next.plan !== d.plan || next.activity !== d.activity) startStore.set((s) => ({ ...s, draft: next }));
  }, [qPlan, qAct]);

  const set = <K extends keyof SignupDraft>(k: K, v: SignupDraft[K]) => {
    startStore.set((s) => ({ ...s, draft: { ...s.draft, [k]: v } }));
    if (tried) setErrors(validateSignup({ ...draft, [k]: v }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    const errs = validateSignup(draft);
    setErrors(errs);
    if (hasErrors(errs)) { requestAnimationFrame(() => summary.current?.focus()); return; }
    startStore.set((s) => ({ ...s, created: true }));
    requestAnimationFrame(() => result.current?.focus());
  };

  const err = (k: keyof SignupErrors) => (errors[k] ? t.errors[errors[k]!] : undefined);
  const nErr = Object.keys(errors).length;
  const activityName = draft.activity === 'other' ? c.other : tr(SECTORS.find((s) => s.id === draft.activity)?.name ?? { ar: '', en: '' });

  return (
    <div className={cn(wrap, 'py-14 sm:py-20')}>
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7">
          {!created ? (
            <>
              <header className="max-w-xl space-y-4">
                <Eyebrow>{c.eyebrow}</Eyebrow>
                <h1 tabIndex={-1} data-page-heading className="text-[32px] font-bold leading-[1.2] tracking-tight text-fg outline-none sm:text-[42px]">{c.title}</h1>
                <p className="text-base leading-relaxed text-muted">{c.lead}</p>
              </header>
              <Card className="mt-10 max-w-xl p-6 sm:p-8">
                <form onSubmit={submit} noValidate className="space-y-5">
                  {nErr > 0 && <div tabIndex={-1} ref={summary} className="outline-none"><Alert tone="bad" title={c.fix}>{t.fixErrors(nErr)}</Alert></div>}
                  <Field label={c.storeName} hint={c.storeHint(draft.storeName.trim().length)} error={err('storeName')}>
                    {(f) => <Input {...f} value={draft.storeName} maxLength={STORE_NAME_MAX + 20} autoComplete="organization" onChange={(e) => set('storeName', e.target.value)} />}
                  </Field>
                  <Field label={c.activity} error={err('activity')}>
                    {(f) => <Select {...f} value={draft.activity} onChange={(e) => set('activity', e.target.value)}>
                      <option value="">{c.chooseActivity}</option>
                      {SECTORS.map((s) => <option key={s.id} value={s.id}>{tr(s.name)}</option>)}
                      <option value="other">{c.other}</option>
                    </Select>}
                  </Field>
                  <Field label={c.phone} hint={c.phoneHint} error={err('phone')}>
                    {(f) => <Input {...f} type="tel" dir="ltr" inputMode="tel" autoComplete="tel" value={draft.phone} onChange={(e) => set('phone', e.target.value)} />}
                  </Field>
                  <Field label={c.plan} optional hint={c.planNote}>
                    {(f) => <Select {...f} value={draft.plan} onChange={(e) => set('plan', e.target.value)}>
                      <option value="">{c.undecided}</option>
                      {PLAN_IDS.map((id) => <option key={id} value={id}>{PLANS[id].name}</option>)}
                    </Select>}
                  </Field>
                  <div className="space-y-1.5">
                    <label className="flex cursor-pointer items-start gap-3 text-sm text-fg">
                      <input type="checkbox" checked={draft.terms} aria-invalid={!!errors.terms} aria-describedby={errors.terms ? 'site-st-terms-err' : undefined}
                        onChange={(e) => set('terms', e.target.checked)} className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-brand-600" />
                      <span>{c.terms} <a href={site('legal/terms')} className="font-semibold text-brand-700 underline dark:text-brand-300">{c.termsLink}</a> {c.and} <a href={site('legal/privacy')} className="font-semibold text-brand-700 underline dark:text-brand-300">{c.privacyLink}</a> <span className="text-subtle">{c.termsDraft}</span></span>
                    </label>
                    {errors.terms && <p id="site-st-terms-err" className="text-xs font-medium text-red-600 dark:text-red-400">{t.errors[errors.terms]}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-1"><Button type="submit" size="lg" className="bg-brand-gradient hover:opacity-95">{c.create}<Fwd /></Button><Simulated /></div>
                  <p className="text-xs text-subtle">{c.sim}</p>
                </form>
              </Card>
            </>
          ) : (
            <div className="max-w-xl space-y-6">
              <Eyebrow>{c.eyebrow}</Eyebrow>
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" aria-hidden="true"><Check className="size-6" /></span>
                <h1 tabIndex={-1} ref={result} data-page-heading className="text-[32px] font-bold text-fg outline-none">{c.createdTitle}</h1>
                <Simulated />
              </div>
              <p className="text-lg text-fg">{c.createdLead}</p>
              <p className="text-xs text-subtle">{c.simNote}</p>
              <Card>
                <dl aria-label={c.summary} className="divide-y divide-border">
                  {([
                    [c.storeName, <span className="font-semibold">{draft.storeName.trim()}</span>],
                    [c.activity, activityName],
                    [c.phone, <Ref>{normalizeSaudiMobile(draft.phone)}</Ref>],
                    [c.plan, isPlan(draft.plan) ? <>{PLANS[draft.plan].name} <span className="text-xs text-subtle">· {c.planNote}</span></> : c.undecided],
                    [c.now, <Badge tone="amber">{c.nowV}</Badge>],
                  ] as const).map(([k, v]) => (
                    <div key={k} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm"><dt className="text-muted">{k}</dt><dd className="text-fg">{v}</dd></div>
                  ))}
                </dl>
              </Card>
              <div className="space-y-1.5 rounded-xl border border-border bg-surface-2/60 p-5">
                <h2 className="text-sm font-semibold text-fg">{c.next}</h2>
                <p className="text-sm leading-relaxed text-muted">{c.nextBody}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <LinkButton size="lg" href={link('/dashboard')}>{c.openDemo}<Fwd /></LinkButton>
                <Button size="lg" variant="secondary" onClick={() => startStore.set((s) => ({ ...s, created: false }))}>{c.edit}</Button>
                <Button size="lg" variant="ghost" onClick={() => { startStore.reset(); setErrors({}); setTried(false); }}>{c.restart}</Button>
              </div>
              <p className="text-xs text-subtle">{c.demoNote}</p>
            </div>
          )}
        </div>
        <aside aria-labelledby="site-next-steps" className="lg:col-span-5 lg:pt-4">
          <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 lg:sticky lg:top-24">
            <h2 id="site-next-steps" className="text-sm font-semibold text-fg">{c.stepsTitle}</h2>
            <ol className="relative mt-6 space-y-6">
              {c.steps.map(([h, b], i) => {
                const isDone = created && i === 0;
                const cur = created ? i === 1 : i === 0;
                return (
                  <li key={h} className="relative flex gap-4" aria-current={cur ? 'step' : undefined}>
                    {i < c.steps.length - 1 && <span aria-hidden="true" className="absolute top-8 bottom-[-1.5rem] start-[13px] w-px bg-border" />}
                    <span aria-hidden="true" className={cn('relative grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                      isDone ? 'bg-emerald-600 text-white' : cur ? 'bg-brand-600 text-white' : 'bg-surface-2 text-muted')}>{isDone ? <Check className="size-3.5" /> : i + 1}</span>
                    <div className="min-w-0 space-y-1">
                      <p className={cn('text-sm font-semibold', cur || isDone ? 'text-fg' : 'text-muted')}>{h}</p>
                      <p className="text-xs leading-relaxed text-muted">{b}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
