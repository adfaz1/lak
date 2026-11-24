import { useEffect, useRef, useState, type FormEvent } from 'react';
import { link, type Route } from '../../core/router';
import { createStore } from '../../core/store';
import { Alert, Badge, Field, Id, Sim } from '../../core/ui';
import { PLANS, SECTORS } from './content';
import { PLAN_IDS, STORE_NAME_MAX, hasErrors, isPlan, normalizeSaudiMobile, validateSignup, type SignupDraft, type SignupErrors } from './domain';
import { Icon, site, useSite } from './kit';

/* Sign-up start: the minimum to create an account, then a simulated "created → next: verification" state. */

const C = {
  ar: {
    eyebrow: 'ابدأ متجرك', title: 'ثلاث معلومات، ثم نكمل معًا',
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
    eyebrow: 'Start your store', title: 'Three things, then we continue together',
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
const startStore = createStore<{ draft: SignupDraft; created: boolean }>(() => ({ draft: EMPTY, created: false }));

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
    <div className="site-wrap site-pad">
      <div className="site-start">
        <div className="site-start-main">
          {!created ? (
            <>
              <header className="site-intro">
                <p className="site-eyebrow">{c.eyebrow}</p>
                <h1 className="site-h1" tabIndex={-1} data-page-heading>{c.title}</h1>
                <p className="site-lead">{c.lead}</p>
              </header>
              <form className="site-form site-start-form" onSubmit={submit} noValidate>
                {nErr > 0 && <div tabIndex={-1} ref={summary}><Alert tone="danger">{t.fixErrors(nErr)}</Alert></div>}
                <Field id="site-st-name" label={c.storeName} hint={c.storeHint(draft.storeName.trim().length)} error={err('storeName')}>
                  <input id="site-st-name" className="input" value={draft.storeName} maxLength={STORE_NAME_MAX + 20} autoComplete="organization"
                    aria-invalid={!!errors.storeName} aria-describedby={errors.storeName ? 'site-st-name-err' : 'site-st-name-hint'}
                    onChange={(e) => set('storeName', e.target.value)} />
                </Field>
                <Field id="site-st-act" label={c.activity} error={err('activity')}>
                  <select id="site-st-act" className="input" value={draft.activity} aria-invalid={!!errors.activity} aria-describedby={errors.activity ? 'site-st-act-err' : undefined}
                    onChange={(e) => set('activity', e.target.value)}>
                    <option value="">{c.chooseActivity}</option>
                    {SECTORS.map((s) => <option key={s.id} value={s.id}>{tr(s.name)}</option>)}
                    <option value="other">{c.other}</option>
                  </select>
                </Field>
                <Field id="site-st-phone" label={c.phone} hint={c.phoneHint} error={err('phone')}>
                  <input id="site-st-phone" className="input" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" value={draft.phone}
                    aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'site-st-phone-err' : 'site-st-phone-hint'}
                    onChange={(e) => set('phone', e.target.value)} />
                </Field>
                <Field id="site-st-plan" label={<>{c.plan} <span className="muted">{c.planOptional}</span></>} hint={c.planNote}>
                  <select id="site-st-plan" className="input" value={draft.plan} aria-describedby="site-st-plan-hint" onChange={(e) => set('plan', e.target.value)}>
                    <option value="">{c.undecided}</option>
                    {PLAN_IDS.map((id) => <option key={id} value={id}>{PLANS[id].name}</option>)}
                  </select>
                </Field>
                <div className="field site-terms">
                  <label className="check">
                    <input type="checkbox" checked={draft.terms} aria-invalid={!!errors.terms} aria-describedby={errors.terms ? 'site-st-terms-err' : undefined}
                      onChange={(e) => set('terms', e.target.checked)} />
                    <span>{c.terms} <a href={site('legal/terms')}>{c.termsLink}</a> {c.and} <a href={site('legal/privacy')}>{c.privacyLink}</a> <span className="muted">{c.termsDraft}</span></span>
                  </label>
                  {errors.terms && <span className="error" id="site-st-terms-err" role="alert">{t.errors[errors.terms]}</span>}
                </div>
                <div className="actions"><button type="submit" className="btn primary site-btn-lg">{c.create}</button><Sim /></div>
                <p className="muted small">{c.sim}</p>
              </form>
            </>
          ) : (
            <div className="site-created">
              <p className="site-eyebrow">{c.eyebrow}</p>
              <div className="site-created-head">
                <span className="site-created-icon" aria-hidden="true"><Icon name="check" size={28} /></span>
                <h1 className="site-h1" tabIndex={-1} ref={result} data-page-heading>{c.createdTitle}</h1>
                <Sim />
              </div>
              <p className="site-lead">{c.createdLead}</p>
              <p className="muted small">{c.simNote}</p>
              <dl className="site-summary" aria-label={c.summary}>
                <div><dt>{c.storeName}</dt><dd className="strong">{draft.storeName.trim()}</dd></div>
                <div><dt>{c.activity}</dt><dd>{activityName}</dd></div>
                <div><dt>{c.phone}</dt><dd><Id>{normalizeSaudiMobile(draft.phone)}</Id></dd></div>
                <div><dt>{c.plan}</dt><dd>{isPlan(draft.plan) ? <>{PLANS[draft.plan].name} <span className="muted small">· {c.planNote}</span></> : c.undecided}</dd></div>
                <div><dt>{c.now}</dt><dd><Badge tone="warning">{c.nowV}</Badge></dd></div>
              </dl>
              <div className="site-next">
                <h2 className="site-h3">{c.next}</h2>
                <p>{c.nextBody}</p>
              </div>
              <div className="site-cta-row">
                <a className="btn primary site-btn-lg" href={link('/merchant')}>{c.openDemo}<Icon name="arrow" size={18} /></a>
                <button type="button" className="btn site-btn-lg" onClick={() => startStore.set((s) => ({ ...s, created: false }))}>{c.edit}</button>
                <button type="button" className="btn site-btn-lg" onClick={() => { startStore.reset(); setErrors({}); setTried(false); }}>{c.restart}</button>
              </div>
              <p className="muted small">{c.demoNote}</p>
            </div>
          )}
        </div>
        <aside className="site-start-side" aria-labelledby="site-next-steps">
          <h2 className="site-h4" id="site-next-steps">{c.stepsTitle}</h2>
          <ol className="site-timeline">
            {c.steps.map(([h, b], i) => (
              <li key={h} data-done={(created && i === 0) || undefined} data-current={(created ? i === 1 : i === 0) || undefined}>
                <span className="site-dot" aria-hidden="true">{created && i === 0 ? <Icon name="check" size={14} /> : i + 1}</span>
                <div><span className="strong">{h}</span><span className="muted small">{b}</span></div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
