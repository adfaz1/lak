// P01-LGL / P01-ABT — contact (validated form, simulated send), legal drafts, about.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, FileText, Mail, MapPin, Phone } from 'lucide-react';
import type { Route } from '../../core/router';
import { createStore } from '../../core/store';
import { Badge, Button, Card, cn, EmptyState, LinkButton, Ref } from '../../ds/ui';
import { Alert, Field, Input, Select, Simulated, Textarea } from '../../ds/kit';
import { CONTACT_TOPICS, LEGAL } from './content';
import { MESSAGE_MAX, hasErrors, simRef, validateContact, type ContactDraft, type ContactErrors } from './domain';
import { Fwd, H2, H3, Intro, Pending, Status, jumpTo, site, useSite, wrap } from './kit';
import { useSiteState } from './review';

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
    draft: 'مسودة بانتظار الاعتماد القانوني، ليست نصًا ملزمًا', draftWhy: 'لا تعتمد على هذه الصفحة كشروط ملزمة. النص النهائي بانتظار المراجعة القانونية.',
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
    join: 'ابدأ إنشاء متجرك', talk: 'تواصل معنا', fix: 'صحّح الحقول المعلّمة', draftBadge: 'مسودة', noDocs: 'لا توجد وثائق منشورة بعد', noDocsBody: 'تظهر هنا الشروط والسياسات بعد اعتمادها.',
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
    draft: 'Draft pending legal approval, not binding text', draftWhy: 'Do not rely on this page as binding terms. The final text is awaiting legal review.',
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
    join: 'Start your store', talk: 'Contact us', fix: 'Fix the marked fields', draftBadge: 'Draft', noDocs: 'No documents published yet', noDocsBody: 'Terms and policies appear here once approved.',
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
  const nErr = Object.keys(errors).length;
  const details = [[Phone, c.phone], [Mail, c.email], [MapPin, c.address]] as const;

  return (
    <div className={cn(wrap, 'py-14 sm:py-20')}>
      <Intro eyebrow={c.cEyebrow} title={c.cTitle} lead={c.cLead} />
      <div className="mt-12 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          {lastRef && sent > 0 ? (
            <Card className="p-6 sm:p-8">
              <div ref={done} tabIndex={-1} role="status" className="space-y-4 outline-none">
                <div className="flex flex-wrap items-center gap-3"><CheckCircle2 className="size-6 text-emerald-600" aria-hidden="true" /><H2 className="text-xl sm:text-2xl">{c.sentTitle}</H2><Simulated /></div>
                <p className="text-sm leading-relaxed text-muted">{c.sentBody}</p>
                <p className="text-sm text-fg">{c.ref}: <span className="font-semibold"><Ref>{lastRef}</Ref></span></p>
                <Button variant="secondary" onClick={() => contactStore.set((s) => ({ ...s, lastRef: null }))}>{c.another}</Button>
              </div>
            </Card>
          ) : (
            <Card className="p-6 sm:p-8">
              <form onSubmit={submit} noValidate className="space-y-5">
                {nErr > 0 && <div tabIndex={-1} ref={summary} className="outline-none"><Alert tone="bad" title={c.fix}>{t.fixErrors(nErr)}</Alert></div>}
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label={c.name} error={err('name')}>{(f) => <Input {...f} value={draft.name} autoComplete="name" onChange={(e) => set('name', e.target.value)} />}</Field>
                  <Field label={c.mail} error={err('email')}>{(f) => <Input {...f} type="email" dir="ltr" value={draft.email} autoComplete="email" onChange={(e) => set('email', e.target.value)} />}</Field>
                  <Field label={c.mobile} optional hint="05XXXXXXXX" error={err('phone')}>{(f) => <Input {...f} type="tel" dir="ltr" inputMode="tel" value={draft.phone} autoComplete="tel" onChange={(e) => set('phone', e.target.value)} />}</Field>
                  <Field label={c.topic} error={err('topic')}>
                    {(f) => <Select {...f} value={draft.topic} onChange={(e) => set('topic', e.target.value)}>
                      <option value="">{c.choose}</option>
                      {CONTACT_TOPICS.map((x) => <option key={x.id} value={x.id}>{tr(x.name)}</option>)}
                    </Select>}
                  </Field>
                </div>
                <Field label={c.message} hint={c.msgHint(draft.message.trim().length)} error={err('message')}>
                  {(f) => <Textarea {...f} rows={6} value={draft.message} onChange={(e) => set('message', e.target.value)} />}
                </Field>
                <div className="flex flex-wrap items-center gap-3"><Button type="submit" size="lg">{c.send}</Button><Simulated /></div>
              </form>
            </Card>
          )}
        </div>
        <aside aria-labelledby="site-cd" className="space-y-5 lg:col-span-5">
          <H3 id="site-cd">{c.details}</H3>
          <dl className="divide-y divide-border border-y border-border">
            {details.map(([I, label]) => (
              <div key={label} className="flex flex-wrap items-center gap-3 py-4">
                <dt className="flex min-w-0 flex-1 items-center gap-2.5 text-sm font-medium text-fg"><I className="size-4 text-muted" aria-hidden="true" />{label}</dt>
                <dd><Status s="pending" /></dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-subtle">{c.pendingDetail}</p>
          <p className="text-sm leading-relaxed text-muted">{c.issueNote}</p>
        </aside>
      </div>
    </div>
  );
}

/* ---------------- legal ---------------- */

export function Legal({ id }: { id?: string }) {
  const { lang, tr } = useSite();
  const c = C[lang];
  const empty = useSiteState() === 'empty';
  const docs = empty ? [] : LEGAL;
  const doc = docs.find((d) => d.id === id);

  if (!id || !doc) {
    return (
      <div className={cn(wrap, 'space-y-12 py-14 sm:py-20')}>
        <Intro eyebrow={c.lEyebrow} title={id ? c.missing : c.lTitle} lead={c.lLead} />
        {docs.length === 0 ? (
          <Card><EmptyState as="h2" icon={<FileText className="size-6" aria-hidden="true" />} title={c.noDocs}>{c.noDocsBody}</EmptyState></Card>
        ) : (
          <ul className="grid gap-4 md:grid-cols-3">
            {docs.map((d) => (
              <li key={d.id}>
                <a href={site(`legal/${d.id}`)} className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-brand-300">
                  <span className="flex items-center justify-between gap-2"><span className="font-semibold text-fg group-hover:text-brand-700 dark:group-hover:text-brand-300">{tr(d.title)}</span><Badge tone="amber">{c.draftBadge}</Badge></span>
                  <span className="text-sm leading-relaxed text-muted">{d.sections.map((s) => tr(s.h)).join(' · ')}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <section aria-labelledby="site-pd" className="space-y-3">
          <H3 id="site-pd">{c.pendingDocs}</H3>
          <ul className="divide-y divide-border border-y border-border">
            {[c.complaints, c.vatCert].map((x) => (
              <li key={x} className="flex flex-wrap items-center gap-3 py-4">
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-fg">{x}</span><span className="block text-xs text-muted">{c.pendingDocsWhy}</span></span>
                <Status s="pending" />
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  return (
    <div className={cn(wrap, 'grid gap-12 py-14 sm:py-20 lg:grid-cols-12')}>
      <article className="space-y-8 lg:col-span-8">
        <a href={site('legal')} className="text-[13px] font-medium text-muted hover:text-fg">{c.lEyebrow}</a>
        <Intro title={tr(doc.title)}><Badge tone="amber">{c.draftBadge}</Badge></Intro>
        <Pending title={c.draft}>{c.draftWhy}</Pending>
        <div className="max-w-[68ch] space-y-8">
          {doc.sections.map((s, i) => (
            <section key={s.id} aria-labelledby={`site-lg-${s.id}`} className="space-y-2">
              <h2 id={`site-lg-${s.id}`} className="scroll-mt-24 text-lg font-semibold text-fg">{i + 1}. {tr(s.h)}</h2>
              <p className="leading-[1.85] text-muted">{tr(s.p)}</p>
            </section>
          ))}
        </div>
      </article>
      <aside className="space-y-8 lg:col-span-4 lg:pt-12">
        <div className="lg:sticky lg:top-24 space-y-8">
          <div>
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-subtle">{c.contents}</h2>
            <ol className="space-y-1.5">{doc.sections.map((s, i) => <li key={s.id}><button type="button" onClick={() => jumpTo(`site-lg-${s.id}`)} className="text-start text-sm text-muted hover:text-fg">{i + 1}. {tr(s.h)}</button></li>)}</ol>
          </div>
          <div>
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-subtle">{c.otherDocs}</h2>
            <ul className="space-y-1.5">{LEGAL.filter((d) => d.id !== doc.id).map((d) => <li key={d.id}><a href={site(`legal/${d.id}`)} className="text-sm font-medium text-fg hover:text-brand-700 hover:underline dark:hover:text-brand-300">{tr(d.title)}</a></li>)}</ul>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ---------------- about ---------------- */

export function About() {
  const { lang } = useSite();
  const c = C[lang];
  return (
    <div className={cn(wrap, 'space-y-20 py-14 sm:py-20')}>
      <div className="grid items-end gap-10 lg:grid-cols-12">
        <Intro eyebrow={c.aEyebrow} title={c.aTitle} lead={c.aLead} className="lg:col-span-9" />
        <img src="/brand/lak-logo-sm.png" alt="" width={112} height={194} className="h-40 w-auto lg:col-span-3 lg:justify-self-end" />
      </div>
      <section aria-labelledby="site-mission" className="border-y border-border py-14">
        <p id="site-mission" className="text-[13px] font-semibold tracking-wide text-brand-600 dark:text-brand-300">{c.mission}</p>
        <p className="mt-4 max-w-4xl text-2xl font-semibold leading-snug text-fg sm:text-[34px]">{c.missionBody}</p>
      </section>
      <section aria-labelledby="site-princ" className="space-y-10">
        <H2 id="site-princ">{c.principles}</H2>
        <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {c.p.map(([h, b], i) => (
            <li key={h} className="space-y-2 border-t-2 border-fg pt-5">
              <span className="text-xs font-semibold text-subtle tabular-nums" aria-hidden="true">0{i + 1}</span>
              <H3>{h}</H3>
              <p className="text-sm leading-relaxed text-muted">{b}</p>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="site-facts" className="max-w-2xl space-y-3">
        <H3 id="site-facts">{c.facts}</H3>
        <ul className="divide-y divide-border border-y border-border">
          {[c.founded, c.hq, c.cr].map((f) => <li key={f} className="flex items-center justify-between gap-3 py-4 text-sm font-semibold text-fg">{f}<Status s="pending" /></li>)}
        </ul>
      </section>
      <div className="flex flex-wrap gap-3">
        <LinkButton size="lg" href={site('start')}>{c.join}<Fwd /></LinkButton>
        <LinkButton size="lg" variant="secondary" href={site('contact')}>{c.talk}</LinkButton>
      </div>
    </div>
  );
}
