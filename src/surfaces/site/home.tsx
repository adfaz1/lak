import type { ReactNode } from 'react';
import { link, replace, type Route } from '../../core/router';
import { Badge } from '../../core/ui';
import { SECTORS } from './content';
import { MoneyFragment, OrderFragment, StockFragment } from './fragments';
import { Frame, Icon, Pending, Section, Status, site, useSite } from './kit';

const C = {
  ar: {
    eyebrow: 'منصة متاجر إلكترونية، بالعربية أولًا',
    h1: 'افتح متجرك، واعرف كل صباح ما يحتاج تدخلك.',
    lead: 'لك منصة لإنشاء متجرك الإلكتروني وإدارته. الدفع والتجهيز والشحن حالات منفصلة وواضحة، فلا تجهّز طلبًا لم يُدفع، ولا تحسب طلبًا شُحن وهو لم يصل إلى الناقل.',
    start: 'ابدأ إنشاء متجرك', explore: 'استكشف لوحة التاجر', demo: 'معاينة',
    micro: 'التسجيل في هذه المعاينة محاكاة ولا ينشئ حسابًا حقيقيًا.',
    attention: 'يحتاج تدخلك اليوم',
    a1: 'طلبات مدفوعة تنتظر التجهيز', a1n: '3', a1d: 'أقدمها منذ 5 ساعات',
    a2: 'طلب تعثر دفعه', a2n: '1', a2d: 'لا يُجهَّز قبل تأكيد الدفع',
    a3: 'منتجان مخزونهما منخفض', a3n: '2', a3d: 'في مستودع جدة',
    attentionNote: 'هذه القائمة موجودة فعلًا في لوحة التاجر التجريبية.',
    jEyebrow: 'ثلاث رحلات عمل',
    jTitle: 'ما تفعله كل يوم، مبنيًا كما يحدث فعلًا',
    jLead: 'كل رحلة تبدأ بما يحتاجك، وتنتهي بنتيجة تستطيع التحقق منها. اللقطات أدناه مكونات حقيقية من المنتج ببيانات مثال.',
    j1: 'استلم الطلب وجهّزه', j1d: 'ترى حالة الدفع قبل أن تبدأ، وتجهّز الطلبات المدفوعة الأقدم أولًا، وتنشئ الشحنة. كل خطوة تُسجَّل باسم من قام بها.',
    j1p: ['الدفع والتجهيز والشحنة ثلاث حالات مستقلة', 'تفصيل المبلغ: المنتجات والشحن والضريبة', 'قائمة «يحتاج تجهيزًا» الأقدم أولًا'],
    j1cta: 'جرّب الطلبات في المعاينة',
    j2: 'تابع أموالك', j2d: 'تعرف ما حصّله مزود الدفع، وما ينتظر التسوية، وما أُعيد للعملاء. لكل مبلغ مرجع يربطه بطلبه.',
    j2p: ['محصّل ومعلّق ومسترد، كل منها منفصل', 'الرسوم تُعرض كما في عقد المزود', 'مرجع لكل تسوية'],
    j3: 'أدر مخزونك', j3d: 'ترى المتاح في كل مستودع بعد خصم المحجوز لطلبات لم تُشحن، وتعرف ما يوشك أن ينفد قبل أن يطلبه عميل.',
    j3p: ['المتاح = الموجود − المحجوز', 'رصيد لكل مستودع ولكل متغير', 'تنبيه عند حد تحدده أنت'],
    sEyebrow: 'حسب مرحلتك',
    sTitle: 'ما المتاح الآن، وما المخطط',
    sLead: 'نفصل بوضوح بين ما يمكنك تجربته في هذه المعاينة وما هو في خطة المنصة ولم يُبنَ بعد.',
    stages: [
      { h: 'تبدأ البيع', items: [
        { l: 'الطلبات والتجهيز', s: 'demo', href: link('/merchant/orders') },
        { l: 'واجهة متجر بهويتك', s: 'demo', href: link('/store') },
        { l: 'الدفع عند الاستلام والتحويل البنكي', s: 'planned', href: site('payments') },
        { l: 'الكوبونات والتقييمات', s: 'planned' },
      ] },
      { h: 'تنمو', items: [
        { l: 'الدفع الإلكتروني ومدى والتقسيط', s: 'planned', href: site('payments') },
        { l: 'بوالص الشحن ومركز الجودة', s: 'planned' },
        { l: 'الولاء والإعلانات والرسائل', s: 'planned', href: site('marketing') },
        { l: 'تطبيق جوال بعلامتك (صانع التطبيقات)', s: 'demo', href: link('/appmaker') },
      ] },
      { h: 'تتوسع', items: [
        { l: 'عدة متاجر وأدوار للفريق', s: 'planned', href: site('plans') },
        { l: 'سوق الجملة B2B', s: 'planned' },
        { l: 'العرض في سوق لك', s: 'demo', href: link('/market') },
        { l: 'ربط ERP وتكاملات خاصة', s: 'planned', href: site('plans') },
      ] },
    ],
    comparePlans: 'قارن الباقات',
    secEyebrow: 'حسب نشاطك',
    secTitle: 'ما يحتاجه متجر في مجالك',
    secLead: 'اختر نشاطًا لترى ما يهمه عادة، والأدوات التي تخدمه.',
    secNeeds: 'ما يحتاجه عادة', secTools: 'الأدوات المرتبطة', secStart: 'ابدأ متجرًا في هذا المجال',
    proofEyebrow: 'الأرقام والقصص',
    proofTitle: 'لا ننشر إلا ما اعتُمد',
    proofLead: 'لن ترى هنا عدادات تقديرية أو اقتباسات من تجار لا نملك إذنهم. هذه المساحة تنتظر أرقامًا وقصصًا معتمدة.',
    stores: 'المتاجر النشطة', countries: 'الدول المدعومة', metricPending: 'الرقم بانتظار الاعتماد', metricWhy: 'يُنشر بعد تعريفه ومصدره وتاريخ تحديثه.',
    quotes: 'شهادات التجار', quotesWhy: 'تظهر بعد موافقة مكتوبة من التاجر ومصدر لكل رقم يُذكر.', quotesCta: 'عن قصص التجار',
    mkEyebrow: 'سوق لك',
    mkTitle: 'تطبيق يجمع منتجات المتاجر في مكان واحد',
    mkLead: 'يقترح المخطط سوقًا عامًا يعرض منتجات المتاجر المشاركة ويعيد العملاء إليها. شروط العرض والأهلية بانتظار الاعتماد.',
    appStore: 'App Store', play: 'Google Play', notPublished: 'التطبيق غير منشور بعد', mkDemo: 'افتح معاينة السوق',
    ctaTitle: 'ابدأ بثلاث معلومات فقط',
    ctaLead: 'اسم المتجر، ونوع النشاط، ورقم الجوال. المستندات تأتي لاحقًا، عندما تحتاجها خدمة بعينها.',
  },
  en: {
    eyebrow: 'Arabic-first e-commerce platform',
    h1: 'Open your store, and know each morning what needs you.',
    lead: 'LAK is a platform to create and run your online store. Payment, fulfilment and shipping are separate, clear states — so you never prepare an unpaid order, or count an order as shipped before the carrier has it.',
    start: 'Start your store', explore: 'Explore the merchant workspace', demo: 'Demo',
    micro: 'Sign-up in this preview is simulated and does not create a real account.',
    attention: 'Needs you today',
    a1: 'Paid orders waiting to be prepared', a1n: '3', a1d: 'Oldest is 5 hours old',
    a2: 'Order with a failed payment', a2n: '1', a2d: 'Not prepared until payment is confirmed',
    a3: 'Products running low', a3n: '2', a3d: 'In the Jeddah warehouse',
    attentionNote: 'This list exists in the demo merchant workspace.',
    jEyebrow: 'Three work journeys',
    jTitle: 'What you do every day, built the way it actually happens',
    jLead: 'Each journey starts with what needs you and ends with a result you can check. The fragments below are real product components with example data.',
    j1: 'Take orders and fulfil them', j1d: 'See payment status before you start, prepare the oldest paid orders first, and create the shipment. Every step is logged with who did it.',
    j1p: ['Payment, fulfilment and shipment are three separate states', 'Amount breakdown: items, shipping and VAT', '“Needs preparing” view, oldest first'],
    j1cta: 'Try orders in the demo',
    j2: 'Follow your money', j2d: 'Know what the payment provider collected, what is waiting to settle, and what went back to customers. Every amount has a reference to its order.',
    j2p: ['Collected, pending and refunded kept apart', 'Fees shown as in the provider contract', 'A reference for every settlement'],
    j3: 'Manage your stock', j3d: 'See what is available in each warehouse after subtracting what is reserved for unshipped orders, and know what is running low before a customer asks.',
    j3p: ['Available = on hand − reserved', 'Stock per warehouse and per variant', 'Alerts at a level you choose'],
    sEyebrow: 'By stage',
    sTitle: 'What is available now, and what is planned',
    sLead: 'We separate clearly what you can try in this preview from what is in the platform plan but not built yet.',
    stages: [
      { h: 'Starting to sell', items: [
        { l: 'Orders and fulfilment', s: 'demo', href: link('/merchant/orders') },
        { l: 'A storefront with your brand', s: 'demo', href: link('/store') },
        { l: 'Cash on delivery and bank transfer', s: 'planned', href: site('payments') },
        { l: 'Coupons and reviews', s: 'planned' },
      ] },
      { h: 'Growing', items: [
        { l: 'Online payments, mada and instalments', s: 'planned', href: site('payments') },
        { l: 'Shipping labels and quality center', s: 'planned' },
        { l: 'Loyalty, ads and messages', s: 'planned', href: site('marketing') },
        { l: 'A branded mobile app (App Maker)', s: 'demo', href: link('/appmaker') },
      ] },
      { h: 'Scaling', items: [
        { l: 'Multiple stores and team roles', s: 'planned', href: site('plans') },
        { l: 'Wholesale B2B marketplace', s: 'planned' },
        { l: 'Listing on LAK marketplace', s: 'demo', href: link('/market') },
        { l: 'ERP and custom integrations', s: 'planned', href: site('plans') },
      ] },
    ],
    comparePlans: 'Compare plans',
    secEyebrow: 'By business',
    secTitle: 'What a store in your field needs',
    secLead: 'Pick a business type to see what usually matters to it, and the tools that serve it.',
    secNeeds: 'What it usually needs', secTools: 'Related tools', secStart: 'Start a store in this field',
    proofEyebrow: 'Numbers and stories',
    proofTitle: 'We only publish what is approved',
    proofLead: 'You will not see estimated counters here, or quotes from merchants we have no permission to quote. This space is waiting for approved numbers and stories.',
    stores: 'Active stores', countries: 'Countries supported', metricPending: 'Metric awaiting approval', metricWhy: 'Published once it has a definition, a source and an update date.',
    quotes: 'Merchant testimonials', quotesWhy: 'Shown after written consent from the merchant and a source for every number quoted.', quotesCta: 'About merchant stories',
    mkEyebrow: 'LAK marketplace',
    mkTitle: 'One app that brings stores’ products together',
    mkLead: 'The blueprint proposes a public marketplace that shows products from participating stores and sends shoppers back to them. Listing and eligibility rules are awaiting approval.',
    appStore: 'App Store', play: 'Google Play', notPublished: 'The app is not published yet', mkDemo: 'Open the marketplace preview',
    ctaTitle: 'Start with just three things',
    ctaLead: 'Store name, type of business and mobile number. Documents come later, when a specific service needs them.',
  },
};

export default function Home({ route }: { route: Route }) {
  const { lang, t } = useSite();
  const c = C[lang];
  const sector = SECTORS.find((s) => s.id === route.query.get('sector')) ?? SECTORS[0];

  return (
    <>
      {/* Hero: one idea, a provable promise, and the product itself. */}
      <section className="site-hero" aria-labelledby="site-hero-h">
        <div className="site-wrap site-hero-grid">
          <div className="site-hero-copy">
            <p className="site-eyebrow">{c.eyebrow}</p>
            <h1 className="site-display" id="site-hero-h" tabIndex={-1} data-page-heading>{c.h1}</h1>
            <p className="site-lead">{c.lead}</p>
            <div className="site-cta-row">
              <a className="btn primary site-btn-lg" href={site('start')}>{c.start}<Icon name="arrow" size={18} /></a>
              <a className="btn site-btn-lg" href={link('/merchant')}>{c.explore}<span className="site-demo-tag">{c.demo}</span></a>
            </div>
            <p className="muted small">{c.micro}</p>
          </div>
          <div className="site-hero-visual">
            <Frame title={c.attention} note={c.attentionNote}>
              <ul className="site-attention">
                {([[c.a1n, c.a1, c.a1d, 'warning', link('/merchant/orders', { view: 'needs' })], [c.a2n, c.a2, c.a2d, 'danger', link('/merchant/orders', { view: 'payfail' })], [c.a3n, c.a3, c.a3d, 'warning', '']] as const).map(([num, label, d, tone, href]) => {
                  const inner = (<>
                    <span className={`site-attn-n site-attn-${tone}`}>{num}</span>
                    <span className="grow"><span className="strong">{label}</span><span className="muted small">{d}</span></span>
                    {href && <Icon name="chevron" size={18} />}
                  </>);
                  return <li key={label}>{href ? <a href={href}>{inner}</a> : <div>{inner}</div>}</li>;
                })}
              </ul>
            </Frame>
          </div>
        </div>
      </section>

      {/* Three work journeys, each with a fragment of the real UI. */}
      <Section id="site-journeys" eyebrow={c.jEyebrow} title={c.jTitle} lead={c.jLead}>
        <ol className="site-journeys">
          <Journey n="01" title={c.j1} body={c.j1d} points={c.j1p} status="demo" fragment={<OrderFragment />}
            action={<a className="site-link" href={link('/merchant/orders', { view: 'needs' })}>{c.j1cta}<Icon name="arrow" size={16} /></a>} />
          <Journey n="02" title={c.j2} body={c.j2d} points={c.j2p} status="planned" fragment={<MoneyFragment />} />
          <Journey n="03" title={c.j3} body={c.j3d} points={c.j3p} status="planned" fragment={<StockFragment />} />
        </ol>
      </Section>

      {/* Available vs planned, by merchant stage. */}
      <Section id="site-stages" eyebrow={c.sEyebrow} title={c.sTitle} lead={c.sLead} tone="tint">
        <div className="site-stages">
          {c.stages.map((st, i) => (
            <div key={st.h} className="site-stage">
              <p className="site-stage-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</p>
              <h3 className="site-h3">{st.h}</h3>
              <ul>
                {st.items.map((it) => (
                  <li key={it.l}>
                    {it.href ? <a href={it.href}>{it.l}</a> : <span>{it.l}</span>}
                    <Status s={it.s as 'demo' | 'planned'} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <a className="btn" href={site('plans')}>{c.comparePlans}</a>
      </Section>

      {/* Sector browsing: selection lives in the URL. */}
      <Section id="site-sectors" eyebrow={c.secEyebrow} title={c.secTitle} lead={c.secLead}>
        <div className="site-sectors">
          <div className="views" role="group" aria-label={c.secTitle}>
            {SECTORS.map((s) => (
              <a key={s.id} className="chip" href={site('', { sector: s.id })} aria-current={s.id === sector.id ? 'true' : undefined}
                onClick={(e) => { e.preventDefault(); replace(site('', { sector: s.id })); }}>
                {s.name[lang]}
              </a>
            ))}
          </div>
          <div className="site-sector-detail" aria-live="polite">
            <h3 className="site-h3">{sector.name[lang]}</h3>
            <dl>
              <div><dt>{c.secNeeds}</dt><dd>{sector.needs[lang]}</dd></div>
              <div><dt>{c.secTools}</dt><dd>{sector.tools[lang]}</dd></div>
            </dl>
            <a className="site-link" href={site('start', { activity: sector.id })}>{c.secStart}<Icon name="arrow" size={16} /></a>
          </div>
        </div>
      </Section>

      {/* Proof: stats and testimonials stay empty until approved. */}
      <Section id="site-proof" eyebrow={c.proofEyebrow} title={c.proofTitle} lead={c.proofLead} tone="tint">
        <div className="site-proof">
          {[c.stores, c.countries].map((label) => (
            <div key={label} className="site-stat">
              <span className="muted">{label}</span>
              <strong aria-label={c.metricPending}>—</strong>
              <Badge tone="warning">{c.metricPending}</Badge>
              <span className="muted small">{c.metricWhy}</span>
            </div>
          ))}
          <div className="site-stat site-stat-wide">
            <span className="muted">{c.quotes}</span>
            <Pending title={t.awaitingApproval}>{c.quotesWhy}</Pending>
            <a className="site-link" href={site('stories')}>{c.quotesCta}<Icon name="arrow" size={16} /></a>
          </div>
        </div>
      </Section>

      {/* Marketplace promo: store badges are disabled until the app exists. */}
      <Section id="site-market" eyebrow={c.mkEyebrow} title={c.mkTitle} lead={c.mkLead}>
        <div className="site-cta-row">
          <button type="button" className="btn" disabled aria-describedby="site-app-why">{c.appStore}</button>
          <button type="button" className="btn" disabled aria-describedby="site-app-why">{c.play}</button>
          <a className="btn" href={link('/market')}>{c.mkDemo}<span className="site-demo-tag">{c.demo}</span></a>
        </div>
        <p className="muted small" id="site-app-why">{c.notPublished}</p>
      </Section>

      {/* Closing brand moment. */}
      <section className="site-closing" aria-labelledby="site-closing-h">
        <div className="site-wrap site-closing-row">
          <img src="/lak-logo.png" alt="" width="84" height="144" className="site-closing-logo" />
          <div className="grow">
            <h2 className="site-h2" id="site-closing-h">{c.ctaTitle}</h2>
            <p className="site-section-lead">{c.ctaLead}</p>
          </div>
          <a className="btn primary site-btn-lg" href={site('start')}>{c.start}<Icon name="arrow" size={18} /></a>
        </div>
      </section>
    </>
  );
}

function Journey({ n, title, body, points, status, fragment, action }: {
  n: string; title: string; body: string; points: string[]; status: 'demo' | 'planned'; fragment: ReactNode; action?: ReactNode;
}) {
  return (
    <li className="site-journey">
      <div className="site-journey-copy">
        <p className="site-journey-n" aria-hidden="true">{n}</p>
        <h3 className="site-h3">{title}</h3>
        <Status s={status} />
        <p>{body}</p>
        <ul className="site-points">
          {points.map((p) => <li key={p}><Icon name="check" size={18} />{p}</li>)}
        </ul>
        {action}
      </div>
      <div className="site-journey-visual">{fragment}</div>
    </li>
  );
}
