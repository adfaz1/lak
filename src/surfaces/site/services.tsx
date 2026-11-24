import type { ReactNode } from 'react';
import { AD_CHANNELS, MARKETING_TOOLS, PAYMENT_METHODS } from './content';
import { CampaignFragment, LoyaltyFragment, OrderFragment, PaymentStatesFragment } from './fragments';
import { Icon, Intro, Pending, Status, site, useSite } from './kit';

/* Service landing pages: payments, marketing and ads (blueprint P01, PDF p. 4). */

const C = {
  ar: {
    plan: 'الباقة', status: 'الحالة', method: 'الطريقة', start: 'ابدأ متجرك', plans: 'قارن الباقات',
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
    plan: 'Plan', status: 'Status', method: 'Method', start: 'Start your store', plans: 'Compare plans',
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

function Split({ copy, visual }: { copy: ReactNode; visual: ReactNode }) {
  return <div className="site-split"><div className="site-split-copy">{copy}</div><div className="site-split-visual">{visual}</div></div>;
}

function Closing() {
  const { lang } = useSite();
  const c = C[lang];
  return (
    <div className="site-cta-row site-block">
      <a className="btn primary site-btn-lg" href={site('start')}>{c.start}<Icon name="arrow" size={18} /></a>
      <a className="btn site-btn-lg" href={site('plans')}>{c.plans}</a>
    </div>
  );
}

export function Payments() {
  const { lang, tr } = useSite();
  const c = C[lang];
  return (
    <div className="site-wrap site-pad">
      <Split copy={<Intro eyebrow={c.pEyebrow} title={c.pTitle} lead={c.pLead} />} visual={<PaymentStatesFragment />} />

      <section className="site-block" aria-labelledby="site-pm">
        <h2 className="site-h2" id="site-pm">{c.pMethods}</h2>
        <p className="site-section-lead">{c.pMethodsLead}</p>
        <ul className="site-rows">
          {PAYMENT_METHODS.map((m) => (
            <li key={m.name.en}>
              <span className="site-rows-main"><span className="strong">{tr(m.name)}</span><span className="muted small">{tr(m.kind)}</span></span>
              <span className="site-plan-chip"><bdi dir="ltr">{m.plan}</bdi></span>
              <Status s="planned" />
            </li>
          ))}
        </ul>
      </section>

      <div className="site-block site-two">
        <section aria-labelledby="site-cur"><h2 className="site-h3" id="site-cur">{c.pCurrency}</h2><p>{c.pCurrencyBody}</p></section>
        <section aria-labelledby="site-fraud"><h2 className="site-h3" id="site-fraud">{c.pFraud}</h2><p>{c.pFraudBody}</p></section>
      </div>

      <Split copy={<><h2 className="site-h2">{c.pBreak}</h2><p className="site-section-lead">{c.pBreakBody}</p><Pending title={c.pNote} /></>} visual={<OrderFragment />} />
      <Closing />
    </div>
  );
}

export function Marketing() {
  const { lang, tr } = useSite();
  const c = C[lang];
  return (
    <div className="site-wrap site-pad">
      <Intro eyebrow={c.mEyebrow} title={c.mTitle} lead={c.mLead}>
        <div className="site-cta-row">
          <a className="btn" href={site('ads')}>{c.mAds}</a>
          <a className="btn" href={site('guide')}>{c.mGuide}</a>
        </div>
      </Intro>

      <section className="site-block" aria-labelledby="site-mt">
        <h2 className="site-h2" id="site-mt">{c.mTools}</h2>
        <ul className="site-rows site-rows-tall">
          {MARKETING_TOOLS.map((m) => (
            <li key={m.id}>
              <span className="site-rows-main">
                {m.href ? <a className="strong site-link" href={site(m.href)}>{tr(m.name)}<Icon name="arrow" size={16} /></a> : <span className="strong">{tr(m.name)}</span>}
                <span className="muted">{tr(m.what)}</span>
              </span>
              <span className="site-plan-chip"><bdi dir="ltr">{m.plan}</bdi></span>
              <Status s="planned" />
            </li>
          ))}
        </ul>
      </section>

      <Split copy={<><h2 className="site-h2">{c.mRule}</h2><p className="site-section-lead">{c.mRuleBody}</p></>} visual={<LoyaltyFragment />} />
      <Closing />
    </div>
  );
}

export function Ads() {
  const { lang, tr } = useSite();
  const c = C[lang];
  return (
    <div className="site-wrap site-pad">
      <Split copy={<Intro eyebrow={c.aEyebrow} title={c.aTitle} lead={c.aLead} />} visual={<CampaignFragment />} />

      <section className="site-block" aria-labelledby="site-ch">
        <h2 className="site-h2" id="site-ch">{c.aChannels}</h2>
        <ul className="site-rows">
          {AD_CHANNELS.map((a) => (
            <li key={a.name}>
              <span className="site-rows-main"><bdi className="strong" dir="ltr">{a.name}</bdi><span className="muted small">{tr(a.what)}</span></span>
              <span className="site-plan-chip"><bdi dir="ltr">Plus+</bdi></span>
              <Status s="planned" />
            </li>
          ))}
        </ul>
      </section>

      <section className="site-block" aria-labelledby="site-flow">
        <h2 className="site-h2" id="site-flow">{c.aFlow}</h2>
        <ol className="site-steps">
          {c.aSteps.map((s, i) => <li key={s}><span className="site-step-n" aria-hidden="true">{i + 1}</span><span>{s}</span></li>)}
        </ol>
        <Pending title={c.aAttr} />
      </section>
      <Closing />
    </div>
  );
}
