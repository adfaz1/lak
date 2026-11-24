// P01-PAY / P01-MKT / P01-ADS — service landing pages (blueprint P01, PDF p. 4).
import type { ReactNode } from 'react';
import { link } from '../../core/router';
import { Card, cn, LinkButton } from '../../ds/ui';
import { AD_CHANNELS, MARKETING_TOOLS, PAYMENT_METHODS } from './content';
import { shotSrc } from './domain';
import { ArrowLink, Fwd, H2, H3, Intro, Lead, Pending, Shot, Status, site, useSite, wrap } from './kit';

const C = {
  ar: {
    plan: 'الباقة', status: 'الحالة', method: 'الطريقة', start: 'ابدأ إنشاء متجرك', plans: 'قارن الباقات', shotOrder: 'لوحة التاجر · تفاصيل طلب', shotMkt: 'لوحة التاجر · التسويق والعروض', inDemo: 'الكوبونات تعمل في لوحة التاجر التجريبية الآن.', openMkt: 'افتح التسويق في اللوحة',
    // payments
    pEyebrow: 'المدفوعات',
    pTitle: 'اعرف متى دُفع الطلب فعلًا، قبل أن تجهّزه',
    pLead: 'طرق دفع محلية ودولية، وحالات دفع منفصلة عن التجهيز والشحن والاسترداد. القرار يأتي من تأكيد مزود الدفع، لا من صفحة الشكر.',
    pMethods: 'طرق الدفع في المخطط',
    pMethodsLead: 'ظهور اسم المزود هنا لا يعني أنه مفعّل. كل مزود يحتاج عقدًا وموافقة قبل التشغيل.',
    pCurrency: 'العملات',
    pCurrencyBody: 'عملة أساسية للمتجر، وقبول عملات إضافية عند الدفع من Plus فأعلى. أسعار التحويل ومصدرها تظهر للعميل قبل الدفع.',
    pFraud: 'الحماية من الاحتيال',
    pFraudBody: 'يقترح المخطط تقييمًا آليًا لمخاطر كل عملية، وطبقة 3-D Secure للبطاقات عندما يدعمها المزود. القرار النهائي يبقى قابلًا للمراجعة، ولا يُرفض عميل بلا سبب واضح.',
    pBreak: 'تفصيل المبلغ قبل الالتزام',
    pBreakBody: 'المنتجات والشحن والضريبة والخصم والرسوم سطور منفصلة، والمال بالهللات لا بالكسور العشرية.',
    pNote: 'لا نصف المنصة بأنها «ممتثلة» لمعيار PCI DSS أو غيره قبل تدقيق رسمي.',
    // marketing
    mEyebrow: 'التسويق',
    mTitle: 'أدوات نمو تعرف تكلفتها قبل أن تطلقها',
    mLead: 'الإعلانات والمؤثرون والولاء والتسويق بالعمولة وتحسين الظهور في محركات البحث. كل أداة تعرض الجمهور والتكلفة والأثر قبل التنفيذ.',
    mTools: 'الأدوات في المخطط',
    mRule: 'مكافأة على ما بقي، لا على ما استُرد',
    mRuleBody: 'النقاط والعمولات تبقى معلقة حتى تنتهي مهلة الإرجاع، وتُلغى إذا استُرد الطلب. هكذا لا تدفع مكافأة على بيع لم يتم.',
    mAds: 'صفحة الإعلانات', mGuide: 'دليل تسويق متجرك',
    // ads
    aEyebrow: 'إعلانات لك',
    aTitle: 'حملاتك على خمس منصات، بميزانية تراها قبل أن تُصرف',
    aLead: 'إدارة حملات Google وTikTok وSnapchat وMeta وX من لوحة التاجر. إنفاق المنصة الإعلانية منفصل عن رسوم لك، ولا تُطلق حملة دون معاينة وتأكيد.',
    aChannels: 'القنوات في المخطط',
    aFlow: 'كيف تعمل الحملة',
    aSteps: ['اربط حسابك الإعلاني بتفويض صريح', 'أنشئ مسودة: الجمهور والمنتجات والمدة', 'راجع الميزانية والرسوم المتوقعة', 'أكّد الإطلاق، وتابع المراجعة أو الرفض', 'قارن النتائج حسب مصدرها'],
    aAttr: 'أرقام كل منصة تُحسب بطريقتها. نعرضها منفصلة ولا نجمعها في عائد إعلاني واحد كأنها مصدر واحد.',
  },
  en: {
    plan: 'Plan', status: 'Status', method: 'Method', start: 'Start your store', plans: 'Compare plans', shotOrder: 'Merchant dashboard · Order detail', shotMkt: 'Merchant dashboard · Marketing', inDemo: 'Coupons already work in the demo merchant dashboard.', openMkt: 'Open marketing in the dashboard',
    pEyebrow: 'Payments',
    pTitle: 'Know when an order is actually paid, before you prepare it',
    pLead: 'Local and international payment methods, with payment states kept separate from fulfilment, shipping and refunds. The decision comes from the provider’s confirmation, not the thank-you page.',
    pMethods: 'Payment methods in the blueprint',
    pMethodsLead: 'A provider listed here is not necessarily active. Each provider needs a contract and approval before it runs.',
    pCurrency: 'Currencies',
    pCurrencyBody: 'A primary store currency, plus accepting other currencies at checkout from Plus upward. Exchange rates and their source are shown to the customer before paying.',
    pFraud: 'Fraud protection',
    pFraudBody: 'The blueprint proposes automated risk scoring on each transaction, and a 3-D Secure layer for cards where the provider supports it. Decisions stay reviewable, and no customer is declined without a clear reason.',
    pBreak: 'The amount, broken down before commitment',
    pBreakBody: 'Items, shipping, VAT, discounts and fees are separate lines, and money is held in halalas, not decimals.',
    pNote: 'We do not describe the platform as “PCI DSS compliant” or similar before a formal audit.',
    mEyebrow: 'Marketing',
    mTitle: 'Growth tools whose cost you know before you launch',
    mLead: 'Ads, influencers, loyalty, affiliates and search visibility. Each tool shows the audience, cost and effect before anything runs.',
    mTools: 'Tools in the blueprint',
    mRule: 'Reward what stayed sold, not what was refunded',
    mRuleBody: 'Points and commissions stay pending until the return window closes, and are cancelled if the order is refunded. So you never pay a reward on a sale that did not happen.',
    mAds: 'Ads page', mGuide: 'Store marketing guide',
    aEyebrow: 'LAK Ads',
    aTitle: 'Your campaigns on five platforms, with a budget you see before it is spent',
    aLead: 'Run Google, TikTok, Snapchat, Meta and X campaigns from the merchant workspace. Ad platform spend is separate from LAK fees, and no campaign launches without a preview and confirmation.',
    aChannels: 'Channels in the blueprint',
    aFlow: 'How a campaign works',
    aSteps: ['Connect your ad account with explicit authorisation', 'Create a draft: audience, products and duration', 'Review the budget and expected fees', 'Confirm launch, then follow review or rejection', 'Compare results by source'],
    aAttr: 'Each platform counts results its own way. We show them separately and do not add them into one return-on-ad-spend figure as if they were one source.',
  },
};

function Page({ children }: { children: ReactNode }) {
  return <div className={cn(wrap, 'space-y-20 py-14 sm:py-20')}>{children}</div>;
}

function Split({ copy, visual }: { copy: ReactNode; visual: ReactNode }) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
      <div className="space-y-5 lg:col-span-5">{copy}</div>
      <div className="lg:col-span-7">{visual}</div>
    </div>
  );
}

/** A list of capabilities with the plan they start on and their status. */
function Rows({ items }: { items: { key: string; name: ReactNode; what: ReactNode; plan: string; status?: 'demo' | 'planned' }[] }) {
  return (
    <Card>
      <ul className="divide-y divide-border">
        {items.map((m) => (
          <li key={m.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
            <div className="min-w-0 flex-1 basis-56">
              <p className="font-semibold text-fg">{m.name}</p>
              <p className="mt-0.5 text-sm text-muted">{m.what}</p>
            </div>
            <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted"><bdi dir="ltr">{m.plan}</bdi></span>
            <Status s={m.status ?? 'planned'} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Closing() {
  const { lang } = useSite();
  const c = C[lang];
  return (
    <div className="flex flex-wrap gap-3 border-t border-border pt-10">
      <LinkButton size="lg" href={site('start')}>{c.start}<Fwd /></LinkButton>
      <LinkButton size="lg" variant="secondary" href={site('plans')}>{c.plans}</LinkButton>
    </div>
  );
}

export function Payments() {
  const { lang, tr } = useSite();
  const c = C[lang];
  return (
    <Page>
      <Split copy={<Intro eyebrow={c.pEyebrow} title={c.pTitle} lead={c.pLead} />} visual={<Shot priority src={shotSrc('order', lang)} alt={c.shotOrder} label={c.shotOrder} />} />

      <section aria-labelledby="site-pm" className="space-y-6">
        <div className="space-y-2"><H2 id="site-pm">{c.pMethods}</H2><Lead>{c.pMethodsLead}</Lead></div>
        <Rows items={PAYMENT_METHODS.map((m) => ({ key: m.name.en, name: tr(m.name), what: tr(m.kind), plan: m.plan }))} />
      </section>

      <div className="grid gap-10 border-t border-border pt-12 md:grid-cols-3">
        <section aria-labelledby="site-cur" className="space-y-2"><H3 id="site-cur">{c.pCurrency}</H3><p className="text-sm leading-relaxed text-muted">{c.pCurrencyBody}</p></section>
        <section aria-labelledby="site-fraud" className="space-y-2"><H3 id="site-fraud">{c.pFraud}</H3><p className="text-sm leading-relaxed text-muted">{c.pFraudBody}</p></section>
        <section aria-labelledby="site-break" className="space-y-2"><H3 id="site-break">{c.pBreak}</H3><p className="text-sm leading-relaxed text-muted">{c.pBreakBody}</p></section>
      </div>
      <Pending title={c.pNote} />
      <Closing />
    </Page>
  );
}

export function Marketing() {
  const { lang, tr } = useSite();
  const c = C[lang];
  return (
    <Page>
      <Split
        copy={<Intro eyebrow={c.mEyebrow} title={c.mTitle} lead={c.mLead}>
          <div className="flex flex-wrap gap-3 pt-2">
            <LinkButton variant="secondary" href={site('ads')}>{c.mAds}</LinkButton>
            <LinkButton variant="secondary" href={site('guide')}>{c.mGuide}</LinkButton>
          </div>
        </Intro>}
        visual={<div className="space-y-3"><Shot priority src={shotSrc('marketing', lang)} alt={c.shotMkt} label={c.shotMkt} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted"><span>{c.inDemo}</span><ArrowLink href={link('/dashboard/marketing')}>{c.openMkt}</ArrowLink></div></div>} />

      <section aria-labelledby="site-mt" className="space-y-6">
        <H2 id="site-mt">{c.mTools}</H2>
        <Rows items={MARKETING_TOOLS.map((m) => ({ key: m.id, plan: m.plan, what: tr(m.what),
          name: m.href ? <a href={site(m.href)} className="inline-flex items-center gap-1.5 hover:text-brand-700 hover:underline dark:hover:text-brand-300">{tr(m.name)}<Fwd /></a> : tr(m.name) }))} />
      </section>

      <section aria-labelledby="site-rule" className="max-w-3xl space-y-3 border-s-2 border-brand-500 ps-6">
        <H2 id="site-rule">{c.mRule}</H2>
        <Lead>{c.mRuleBody}</Lead>
      </section>
      <Closing />
    </Page>
  );
}

export function Ads() {
  const { lang, tr } = useSite();
  const c = C[lang];
  return (
    <Page>
      <Intro eyebrow={c.aEyebrow} title={c.aTitle} lead={c.aLead} />

      <section aria-labelledby="site-flow" className="space-y-8">
        <H2 id="site-flow">{c.aFlow}</H2>
        <ol className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
          {c.aSteps.map((s, i) => (
            <li key={s} className="space-y-3 bg-surface p-5">
              <span className="text-3xl font-bold text-brand-500/30 tabular-nums" aria-hidden="true">{i + 1}</span>
              <p className="text-sm font-medium leading-relaxed text-fg">{s}</p>
            </li>
          ))}
        </ol>
        <Pending title={c.aAttr} />
      </section>

      <section aria-labelledby="site-ch" className="space-y-6">
        <H2 id="site-ch">{c.aChannels}</H2>
        <Rows items={AD_CHANNELS.map((a) => ({ key: a.name, name: <bdi dir="ltr">{a.name}</bdi>, what: tr(a.what), plan: 'Plus+' }))} />
      </section>
      <Closing />
    </Page>
  );
}
