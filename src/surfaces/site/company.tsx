import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Route } from '../../core/router';
import { createStore } from '../../core/store';
import { Alert, Field, Sim } from '../../core/ui';
import { CONTACT_TOPICS, LEGAL } from './content';
import { MESSAGE_MAX, hasErrors, simRef, validateContact, type ContactDraft, type ContactErrors } from './domain';
import { Icon, Intro, Pending, Status, jumpTo, site, useSite } from './kit';

/* Contact (form with validation and simulated submit), legal drafts, about. */

const C = {
  ar: {
    cEyebrow: 'تواصل معنا', cTitle: 'كيف نصل إليك؟', cLead: 'اكتب لنا عن الباقات أو متجرك أو مشكلة واجهتها. هذا النموذج محاكاة في المعاينة ولا يرسل رسائل.',
    details: 'بيانات التواصل', phone: 'الهاتف', email: 'البريد الإلكتروني', address: 'العنوان', pendingDetail: 'بانتظار اعتماد البيانات الرسمية',
    issueNote: 'للإبلاغ عن مشكلة في متجرك، اختر «الإبلاغ عن مشكلة» واذكر رابط المتجر ورقم الطلب إن وجد.',
    name: 'الاسم', mail: 'البريد الإلكتروني', mobile: 'رقم الجوال', topic: 'الموضوع', choose: 'اختر الموضوع', message: 'رسالتك',
    msgHint: (n: number) => `${n} / ${MESSAGE_MAX} حرف · 20 حرفًا على الأقل`,
    send: 'أرسل الرسالة', sentTitle: 'استلمنا رسالتك في هذه المعاينة', sentBody: 'محاكاة: لم تُرسل الرسالة إلى أي جهة، ولن يتواصل معك أحد. في المنتج الحقيقي سيصلك تأكيد على بريدك.',
    ref: 'مرجع المحاكاة', another: 'اكتب رسالة أخرى', summary: 'ملخص رسالتك',
    lEyebrow: 'السياسات', lTitle: 'السياسات والاتفاقيات', lLead: 'مسودات هيكلية تُظهر ما ستغطيه كل وثيقة. النصوص القانونية النهائية تحتاج مراجعة مختصة واعتمادًا قبل النشر.',
    draft: 'مسودة للتخطيط، ليست نصًا قانونيًا', draftWhy: 'لا تعتمد على هذه الصفحة كشروط ملزمة. النص النهائي بانتظار المراجعة القانونية.',
    contents: 'المحتويات', pendingDocs: 'وثائق بانتظار الإصدار', complaints: 'بوابة الشكاوى الخارجية', vatCert: 'شهادة التسجيل في ضريبة القيمة المضافة',
    pendingDocsWhy: 'ستُربط هنا عند توفر الرابط والوثيقة الرسمية.', open: 'افتح', otherDocs: 'وثائق أخرى', missing: 'هذه الوثيقة غير موجودة',
    aEyebrow: 'عن لك', aTitle: 'نبني منصة يفهمها التاجر من أول يوم',
    aLead: 'لك منصة سعودية للتجارة الإلكترونية تساعد التجار على إنشاء متاجرهم وإدارتها بالعربية أولًا، من الطلب الأول إلى التوسع.',
    mission: 'رسالتنا', missionBody: 'أن يعرف التاجر كل صباح ما يحتاج تدخله، وأن يثق بأن كل رقم يراه له مصدر واضح.',
    principles: 'كيف نعمل',
    p: [
      ['العربية أولًا', 'نكتب الواجهة بعربية مهنية بسيطة، وندعم الإنجليزية بالكامل.'],
      ['حالات لا تختلط', 'الدفع والتجهيز والشحن والإرجاع والاسترداد حالات منفصلة في كل شاشة.'],
      ['أرقام بمصدر', 'لا ننشر رقمًا أو وعدًا لا نستطيع إثباته، ونفصل المتاح عن المخطط.'],
      ['هوية التاجر لمتجره', 'هوية لك في منتجاتنا، وهوية التاجر في متجره وتطبيقه.'],
    ] as [string, string][],
    facts: 'معلومات الشركة', founded: 'سنة التأسيس', hq: 'المقر', cr: 'السجل التجاري',
    join: 'ابدأ متجرك', talk: 'تواصل معنا',
  },
  en: {
    cEyebrow: 'Contact us', cTitle: 'How can we reach you?', cLead: 'Write to us about plans, your store or a problem you hit. This form is simulated in the preview and sends no messages.',
    details: 'Contact details', phone: 'Phone', email: 'Email', address: 'Address', pendingDetail: 'Awaiting approved official details',
    issueNote: 'To report a problem with your store, choose “Report an issue” and include your store link and order number if any.',
    name: 'Name', mail: 'Email', mobile: 'Mobile number', topic: 'Topic', choose: 'Choose a topic', message: 'Your message',
    msgHint: (n: number) => `${n} / ${MESSAGE_MAX} characters · at least 20`,
    send: 'Send message', sentTitle: 'We received your message in this preview', sentBody: 'Simulated: the message was not sent anywhere and nobody will contact you. In the real product you would get a confirmation email.',
    ref: 'Simulation reference', another: 'Write another message', summary: 'Your message summary',
    lEyebrow: 'Policies', lTitle: 'Policies and agreements', lLead: 'Structural drafts showing what each document will cover. Final legal texts need specialist review and approval before publishing.',
    draft: 'Layout draft, not legal text', draftWhy: 'Do not rely on this page as binding terms. The final text is awaiting legal review.',
    contents: 'Contents', pendingDocs: 'Documents awaiting release', complaints: 'External complaints portal', vatCert: 'VAT registration certificate',
    pendingDocsWhy: 'Will be linked here once the official link and document are available.', open: 'Open', otherDocs: 'Other documents', missing: 'This document does not exist',
    aEyebrow: 'About LAK', aTitle: 'Building a platform merchants understand from day one',
    aLead: 'LAK is a Saudi e-commerce platform that helps merchants create and run their stores, Arabic first, from the first order to scaling up.',
    mission: 'Our mission', missionBody: 'That every merchant knows each morning what needs them, and trusts that every number they see has a clear source.',
    principles: 'How we work',
    p: [
      ['Arabic first', 'We write the interface in plain professional Arabic, with full English support.'],
      ['States that never blur', 'Payment, fulfilment, shipping, returns and refunds are separate on every screen.'],
      ['Numbers with a source', 'We do not publish a number or promise we cannot prove, and we separate available from planned.'],
      ['The merchant’s brand in their store', 'LAK’s brand on our products; the merchant’s brand on their store and app.'],
    ],
    facts: 'Company facts', founded: 'Founded', hq: 'Headquarters', cr: 'Commercial registration',
    join: 'Start your store', talk: 'Contact us',
  },
};

/* ---------------- contact ---------------- */

const EMPTY: ContactDraft = { name: '', email: '', phone: '', topic: '', message: '' };
/** Draft and sent state survive navigating away and back (simulated, per session). */
const contactStore = createStore.key('site.contactStore')<{ draft: ContactDraft; sent: number; lastRef: string | null }>(() => ({ draft: EMPTY, sent: 0, lastRef: null }));

export function Contact({ route }: { route: Route }) {
  const { lang, t, tr } = useSite();
  const c = C[lang];
  const { draft, sent, lastRef } = contactStore.use();
  const [errors, setErrors] = useState<ContactErrors>({});
  const [tried, setTried] = useState(false);
  const summary = useRef<HTMLDivElement>(null);
  const done = useRef<HTMLDivElement>(null);
  const qTopic = route.query.get('topic');

  // A topic in the URL (e.g. from "Talk to sales") preselects the field without overwriting a choice already made.
  useEffect(() => {
    if (qTopic && CONTACT_TOPICS.some((x) => x.id === qTopic) && !contactStore.get().draft.topic) {
      contactStore.set((s) => ({ ...s, draft: { ...s.draft, topic: qTopic } }));
    }
  }, [qTopic]);

  const set = (k: keyof ContactDraft, v: string) => {
    contactStore.set((s) => ({ ...s, draft: { ...s.draft, [k]: v } }));
    if (tried) setErrors(validateContact({ ...draft, [k]: v }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    const errs = validateContact(draft);
    setErrors(errs);
    if (hasErrors(errs)) { requestAnimationFrame(() => summary.current?.focus()); return; }
    contactStore.set((s) => ({ draft: EMPTY, sent: s.sent + 1, lastRef: simRef('CT', s.sent + 1) }));
    setTried(false);
    requestAnimationFrame(() => done.current?.focus());
  };

  const err = (k: keyof ContactDraft) => (errors[k] ? t.errors[errors[k]!] : undefined);
  const aria = (k: keyof ContactDraft, id: string, hint = false) => ({ 'aria-invalid': !!errors[k], 'aria-describedby': errors[k] ? `${id}-err` : hint ? `${id}-hint` : undefined });
  const nErr = Object.keys(errors).length;

  return (
    <div className="site-wrap site-pad">
      <Intro eyebrow={c.cEyebrow} title={c.cTitle} lead={c.cLead} />
      <div className="site-contact">
        <aside className="site-contact-details" aria-labelledby="site-cd">
          <h2 className="site-h3" id="site-cd">{c.details}</h2>
          <dl>
            {([['phone', c.phone], ['mail', c.email], ['pin', c.address]] as const).map(([icon, label]) => (
              <div key={label}><dt><Icon name={icon} size={18} />{label}</dt><dd><Status s="pending" /><span className="muted small">{c.pendingDetail}</span></dd></div>
            ))}
          </dl>
          <p className="muted small">{c.issueNote}</p>
        </aside>

        <div className="site-contact-form">
          {lastRef && sent > 0 && (
            <div className="site-sent" tabIndex={-1} ref={done} role="status">
              <div className="site-sent-head"><Icon name="check" /><h2 className="site-h3">{c.sentTitle}</h2><Sim /></div>
              <p>{c.sentBody}</p>
              <p className="small">{c.ref}: <bdi dir="ltr" className="strong">{lastRef}</bdi></p>
              <button type="button" className="btn" onClick={() => contactStore.set((s) => ({ ...s, lastRef: null }))}>{c.another}</button>
            </div>
          )}
          {!lastRef && (
            <form className="site-form" onSubmit={submit} noValidate>
              {nErr > 0 && <div tabIndex={-1} ref={summary}><Alert tone="danger">{t.fixErrors(nErr)}</Alert></div>}
              <div className="site-form-grid">
                <Field id="site-ct-name" label={c.name} error={err('name')}>
                  <input id="site-ct-name" className="input" value={draft.name} autoComplete="name" onChange={(e) => set('name', e.target.value)} {...aria('name', 'site-ct-name')} />
                </Field>
                <Field id="site-ct-email" label={c.mail} error={err('email')}>
                  <input id="site-ct-email" className="input" type="email" dir="ltr" value={draft.email} autoComplete="email" onChange={(e) => set('email', e.target.value)} {...aria('email', 'site-ct-email')} />
                </Field>
                <Field id="site-ct-phone" label={<>{c.mobile} <span className="muted">{t.optional}</span></>} hint="05XXXXXXXX" error={err('phone')}>
                  <input id="site-ct-phone" className="input" type="tel" dir="ltr" inputMode="tel" value={draft.phone} autoComplete="tel" onChange={(e) => set('phone', e.target.value)} {...aria('phone', 'site-ct-phone', true)} />
                </Field>
                <Field id="site-ct-topic" label={c.topic} error={err('topic')}>
                  <select id="site-ct-topic" className="input" value={draft.topic} onChange={(e) => set('topic', e.target.value)} {...aria('topic', 'site-ct-topic')}>
                    <option value="">{c.choose}</option>
                    {CONTACT_TOPICS.map((x) => <option key={x.id} value={x.id}>{tr(x.name)}</option>)}
                  </select>
                </Field>
              </div>
              <Field id="site-ct-msg" label={c.message} hint={c.msgHint(draft.message.trim().length)} error={err('message')}>
                <textarea id="site-ct-msg" className="input" rows={6} value={draft.message} onChange={(e) => set('message', e.target.value)} {...aria('message', 'site-ct-msg', true)} />
              </Field>
              <div className="actions"><button type="submit" className="btn primary">{c.send}</button><Sim /></div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- legal ---------------- */

export function Legal({ id }: { id?: string }) {
  const { lang, tr } = useSite();
  const c = C[lang];
  const doc = LEGAL.find((d) => d.id === id);

  if (!id || !doc) {
    return (
      <div className="site-wrap site-pad">
        <Intro eyebrow={c.lEyebrow} title={id ? c.missing : c.lTitle} lead={c.lLead} />
        <ul className="site-list site-list-grid">
          {LEGAL.map((d) => (
            <li key={d.id}><a href={site(`legal/${d.id}`)}><span className="site-list-title">{tr(d.title)}</span><span className="muted">{d.sections.map((s) => tr(s.h)).join(' · ')}</span></a></li>
          ))}
        </ul>
        <section className="site-block" aria-labelledby="site-pd">
          <h2 className="site-h3" id="site-pd">{c.pendingDocs}</h2>
          <ul className="site-rows">
            {[c.complaints, c.vatCert].map((x) => <li key={x}><span className="site-rows-main"><span className="strong">{x}</span><span className="muted small">{c.pendingDocsWhy}</span></span><Status s="pending" /></li>)}
          </ul>
        </section>
      </div>
    );
  }

  return (
    <div className="site-wrap site-pad site-article-layout">
      <article className="site-article">
        <nav className="site-crumbs" aria-label={c.lEyebrow}><a href={site('legal')}>{c.lEyebrow}</a></nav>
        <Intro title={tr(doc.title)} />
        <Pending title={c.draft}>{c.draftWhy}</Pending>
        <div className="site-prose">
          {doc.sections.map((s, i) => (
            <section key={s.id} aria-labelledby={`site-lg-${s.id}`}>
              <h2 className="site-h3" id={`site-lg-${s.id}`}>{i + 1}. {tr(s.h)}</h2>
              <p>{tr(s.p)}</p>
            </section>
          ))}
        </div>
      </article>
      <aside className="site-aside">
        <h2 className="site-h4">{c.contents}</h2>
        <ol className="site-aside-list">
          {doc.sections.map((s, i) => <li key={s.id}><button type="button" className="site-toc" onClick={() => jumpTo(`site-lg-${s.id}`)}>{i + 1}. {tr(s.h)}</button></li>)}
        </ol>
        <h2 className="site-h4">{c.otherDocs}</h2>
        <ul className="site-aside-list">
          {LEGAL.filter((d) => d.id !== doc.id).map((d) => <li key={d.id}><a href={site(`legal/${d.id}`)}>{tr(d.title)}</a></li>)}
        </ul>
      </aside>
    </div>
  );
}

/* ---------------- about ---------------- */

export function About() {
  const { lang } = useSite();
  const c = C[lang];
  return (
    <div className="site-wrap site-pad">
      <div className="site-about-hero">
        <Intro eyebrow={c.aEyebrow} title={c.aTitle} lead={c.aLead} />
        <img src="/lak-logo.png" alt="" width="112" height="192" className="site-about-logo" />
      </div>
      <section className="site-block site-mission" aria-labelledby="site-mission">
        <h2 className="site-eyebrow" id="site-mission">{c.mission}</h2>
        <p className="site-quote">{c.missionBody}</p>
      </section>
      <section className="site-block" aria-labelledby="site-princ">
        <h2 className="site-h2" id="site-princ">{c.principles}</h2>
        <ol className="site-principles">
          {c.p.map(([h, b], i) => <li key={h}><span className="site-journey-n" aria-hidden="true">0{i + 1}</span><h3 className="site-h3">{h}</h3><p>{b}</p></li>)}
        </ol>
      </section>
      <section className="site-block" aria-labelledby="site-facts">
        <h2 className="site-h3" id="site-facts">{c.facts}</h2>
        <ul className="site-rows">
          {[c.founded, c.hq, c.cr].map((f) => <li key={f}><span className="site-rows-main strong">{f}</span><Status s="pending" /></li>)}
        </ul>
      </section>
      <div className="site-cta-row site-block">
        <a className="btn primary site-btn-lg" href={site('start')}>{c.join}<Icon name="arrow" size={18} /></a>
        <a className="btn site-btn-lg" href={site('contact')}>{c.talk}</a>
      </div>
    </div>
  );
}
