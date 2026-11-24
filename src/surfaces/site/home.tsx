// P01-HOM — marketing home: one editorial idea, a provable promise, and the real product.
import { Check } from 'lucide-react';
import { link, replace, type Route } from '../../core/router';
import { Badge, Button, cn, LinkButton } from '../../ds/ui';
import { SECTORS } from './content';
import { shotSrc, type ShotName } from './domain';
import { ArrowLink, Eyebrow, Fwd, H3, Pending, Section, Shot, Status, site, useSite, wrap } from './kit';

type Item = { l: string; s: 'demo' | 'planned'; href?: string };

const C = {
  ar: {
    eyebrow: 'منصة متاجر إلكترونية، بالعربية أولًا',
    h1a: 'افتح متجرك،', h1b: 'واعرف كل صباح ما يحتاج تدخلك.',
    lead: 'الدفع والتجهيز والشحن حالات منفصلة وواضحة: لا تجهّز طلبًا لم يُدفع، ولا تحسب طلبًا شُحن قبل أن يستلمه الناقل.',
    start: 'ابدأ إنشاء متجرك', explore: 'استكشف لوحة التاجر', demo: 'معاينة',
    micro: 'التسجيل في هذه المعاينة محاكاة ولا ينشئ حسابًا حقيقيًا.',
    shotLabel: 'لوحة التاجر · الرئيسية', shotAlt: 'لقطة من رئيسية لوحة التاجر: مؤشرات المبيعات وقائمة «يحتاجك الآن» ببيانات تجريبية',
    phoneAlt: 'رئيسية لوحة التاجر على الجوال',
    notes: ['«يحتاجك الآن»: مهام اليوم مرتبة، ولكل مهمة زر يكملها.', 'كل رقم بفترته ومقارنته، لا عدادات تقديرية.', 'طلبات المتجر وسوق لك وتطبيقك في شاشة واحدة.'],
    jEyebrow: 'ثلاث رحلات عمل',
    jTitle: 'ما تفعله كل يوم، كما يحدث فعلًا',
    jLead: 'كل رحلة تبدأ بما يحتاجك وتنتهي بنتيجة تتحقق منها. اللقطات من لوحة التاجر نفسها، ببيانات تجريبية.',
    open: 'افتحها في لوحة التاجر',
    journeys: [
      { shot: 'order', href: link('/dashboard/orders'), label: 'لوحة التاجر · تفاصيل طلب', title: 'استلم الطلب وجهّزه', body: 'ترى حالة الدفع قبل أن تبدأ، وتجهّز الأقدم أولًا، وتنشئ الشحنة. كل خطوة مسجّلة باسم من قام بها.',
        points: ['الدفع والتجهيز والشحنة ثلاث حالات مستقلة', 'تفصيل المبلغ: المنتجات والشحن والضريبة', 'الخطوة التالية مكتوبة: «لا تجهّز قبل الدفع»'] },
      { shot: 'finance', href: link('/dashboard/finance'), label: 'لوحة التاجر · المالية', title: 'تابع أموالك', body: 'تعرف ما حُصّل، وما ينتظر التسوية، وما في الطريق للبنك، وما أُعيد للعملاء. لكل تحويل مرجع وكشف مطابقة.',
        points: ['المحصّل والمعلّق والمحوّل والمسترد منفصلة', 'الرسوم سطر مستقل', 'مرجع لكل تحويل بنكي'] },
      { shot: 'inventory', href: link('/dashboard/inventory'), label: 'لوحة التاجر · المخزون', title: 'أدر مخزونك', body: 'ترى المتاح في كل مستودع بعد خصم المحجوز لطلبات لم تُشحن، وتعرف ما يوشك أن ينفد قبل أن يطلبه عميل.',
        points: ['المتاح = الموجود − المحجوز', 'رصيد لكل مستودع ولكل متغير', 'كل تعديل بسبب ومسجّل'] },
    ] as { shot: ShotName; href: string; label: string; title: string; body: string; points: string[] }[],
    sEyebrow: 'حسب مرحلتك',
    sTitle: 'ما المتاح الآن، وما المخطط',
    sLead: 'نفصل بين ما تجربه في هذه المعاينة وما هو في خطة المنصة ولم يُبنَ بعد.',
    stages: [
      { h: 'تبدأ البيع', items: [
        { l: 'الطلبات والتجهيز', s: 'demo', href: link('/dashboard/orders') },
        { l: 'المنتجات والمخزون', s: 'demo', href: link('/dashboard/products') },
        { l: 'واجهة متجر بهويتك', s: 'demo', href: link('/store') },
        { l: 'الدفع عند الاستلام والتحويل البنكي', s: 'planned', href: site('payments') },
      ] },
      { h: 'تنمو', items: [
        { l: 'الدفع الإلكتروني ومدى والتقسيط', s: 'planned', href: site('payments') },
        { l: 'بوالص الشحن ومركز الجودة', s: 'planned' },
        { l: 'الولاء والإعلانات والرسائل', s: 'planned', href: site('marketing') },
        { l: 'تطبيق جوال بعلامتك', s: 'demo', href: link('/appmaker') },
      ] },
      { h: 'تتوسع', items: [
        { l: 'عدة متاجر وأدوار للفريق', s: 'planned', href: site('plans') },
        { l: 'سوق الجملة B2B', s: 'planned' },
        { l: 'العرض في سوق لك', s: 'demo', href: link('/market') },
        { l: 'ربط ERP وتكاملات خاصة', s: 'planned', href: site('plans') },
      ] },
    ] as { h: string; items: Item[] }[],
    comparePlans: 'قارن الباقات',
    secEyebrow: 'حسب نشاطك',
    secTitle: 'ما يحتاجه متجر في مجالك',
    secNeeds: 'ما يحتاجه عادة', secTools: 'الأدوات المرتبطة', secStart: 'ابدأ متجرًا في هذا المجال',
    proofEyebrow: 'الأرقام والقصص',
    proofTitle: 'لا ننشر إلا ما اعتُمد',
    proofLead: 'لا عدادات تقديرية، ولا اقتباسات من تجار بلا إذن مكتوب.',
    stores: 'المتاجر النشطة', countries: 'الدول المدعومة', metricPending: 'الرقم بانتظار الاعتماد', metricWhy: 'يُنشر بعد تعريفه ومصدره وتاريخ تحديثه.',
    quotes: 'شهادات التجار', quotesWhy: 'تظهر بعد موافقة مكتوبة من التاجر ومصدر لكل رقم يُذكر.', quotesCta: 'عن قصص التجار',
    mkEyebrow: 'سوق لك',
    mkTitle: 'تطبيق يجمع منتجات المتاجر في مكان واحد',
    mkLead: 'سوق عام يعرض منتجات المتاجر المشاركة ويعيد العملاء إليها. شروط العرض والأهلية بانتظار الاعتماد.',
    appStore: 'App Store', play: 'Google Play', notPublished: 'التطبيق غير منشور بعد', mkDemo: 'افتح معاينة السوق',
    ctaTitle: 'ابدأ بثلاث معلومات فقط',
    ctaLead: 'اسم المتجر، ونوع النشاط، ورقم الجوال. المستندات تأتي لاحقًا، حين تحتاجها خدمة بعينها.',
  },
  en: {
    eyebrow: 'Arabic-first e-commerce platform',
    h1a: 'Open your store,', h1b: 'and know each morning what needs you.',
    lead: 'Payment, fulfilment and shipping are separate, clear states: you never prepare an unpaid order, or count an order as shipped before the carrier has it.',
    start: 'Start your store', explore: 'Explore the merchant dashboard', demo: 'Demo',
    micro: 'Sign-up in this preview is simulated and does not create a real account.',
    shotLabel: 'Merchant dashboard · Home', shotAlt: 'Screenshot of the merchant dashboard home: sales metrics and the “Needs you now” list, with demo data',
    phoneAlt: 'Merchant dashboard home on a phone',
    notes: ['“Needs you now”: today’s tasks in order, each with a button that finishes it.', 'Every number with its period and comparison, no estimated counters.', 'Orders from your store, LAK marketplace and your app on one screen.'],
    jEyebrow: 'Three work journeys',
    jTitle: 'What you do every day, the way it actually happens',
    jLead: 'Each journey starts with what needs you and ends with a result you can check. The screenshots are the merchant dashboard itself, with demo data.',
    open: 'Open it in the dashboard',
    journeys: [
      { shot: 'order', href: link('/dashboard/orders'), label: 'Merchant dashboard · Order detail', title: 'Take orders and fulfil them', body: 'See payment status before you start, prepare the oldest first, and create the shipment. Every step is logged with who did it.',
        points: ['Payment, fulfilment and shipment are three separate states', 'Amount breakdown: items, shipping and VAT', 'The next step is spelled out: “do not fulfil before payment”'] },
      { shot: 'finance', href: link('/dashboard/finance'), label: 'Merchant dashboard · Finance', title: 'Follow your money', body: 'Know what was collected, what is waiting to settle, what is on its way to the bank and what went back to customers. Every payout has a reference and a reconciliation.',
        points: ['Collected, pending, paid out and refunded kept apart', 'Fees on their own line', 'A reference for every bank payout'] },
      { shot: 'inventory', href: link('/dashboard/inventory'), label: 'Merchant dashboard · Inventory', title: 'Manage your stock', body: 'See what is available in each warehouse after subtracting what is reserved for unshipped orders, and know what is running low before a customer asks.',
        points: ['Available = on hand − reserved', 'Stock per warehouse and per variant', 'Every adjustment has a reason and is logged'] },
    ] as { shot: ShotName; href: string; label: string; title: string; body: string; points: string[] }[],
    sEyebrow: 'By stage',
    sTitle: 'What is available now, and what is planned',
    sLead: 'We separate what you can try in this preview from what is in the platform plan but not built yet.',
    stages: [
      { h: 'Starting to sell', items: [
        { l: 'Orders and fulfilment', s: 'demo', href: link('/dashboard/orders') },
        { l: 'Products and stock', s: 'demo', href: link('/dashboard/products') },
        { l: 'A storefront with your brand', s: 'demo', href: link('/store') },
        { l: 'Cash on delivery and bank transfer', s: 'planned', href: site('payments') },
      ] },
      { h: 'Growing', items: [
        { l: 'Online payments, mada and instalments', s: 'planned', href: site('payments') },
        { l: 'Shipping labels and quality center', s: 'planned' },
        { l: 'Loyalty, ads and messages', s: 'planned', href: site('marketing') },
        { l: 'A branded mobile app', s: 'demo', href: link('/appmaker') },
      ] },
      { h: 'Scaling', items: [
        { l: 'Multiple stores and team roles', s: 'planned', href: site('plans') },
        { l: 'Wholesale B2B marketplace', s: 'planned' },
        { l: 'Listing on LAK marketplace', s: 'demo', href: link('/market') },
        { l: 'ERP and custom integrations', s: 'planned', href: site('plans') },
      ] },
    ] as { h: string; items: Item[] }[],
    comparePlans: 'Compare plans',
    secEyebrow: 'By business',
    secTitle: 'What a store in your field needs',
    secNeeds: 'What it usually needs', secTools: 'Related tools', secStart: 'Start a store in this field',
    proofEyebrow: 'Numbers and stories',
    proofTitle: 'We only publish what is approved',
    proofLead: 'No estimated counters, and no quotes from merchants without written permission.',
    stores: 'Active stores', countries: 'Countries supported', metricPending: 'Metric awaiting approval', metricWhy: 'Published once it has a definition, a source and an update date.',
    quotes: 'Merchant testimonials', quotesWhy: 'Shown after written consent from the merchant and a source for every number quoted.', quotesCta: 'About merchant stories',
    mkEyebrow: 'LAK marketplace',
    mkTitle: 'One app that brings stores’ products together',
    mkLead: 'A public marketplace that shows products from participating stores and sends shoppers back to them. Listing and eligibility rules are awaiting approval.',
    appStore: 'App Store', play: 'Google Play', notPublished: 'The app is not published yet', mkDemo: 'Open the marketplace preview',
    ctaTitle: 'Start with just three things',
    ctaLead: 'Store name, type of business and mobile number. Documents come later, when a specific service needs them.',
  },
};

export default function Home({ route, dark }: { route: Route; dark: boolean }) {
  const { lang, t } = useSite();
  const c = C[lang];
  const sector = SECTORS.find((s) => s.id === route.query.get('sector')) ?? SECTORS[0];

  return (
    <>
      {/* Hero: one idea, a provable promise, and the product itself. */}
      <section aria-labelledby="site-hero-h" className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklab,var(--color-brand-500)_14%,transparent),transparent)]" />
        <div className={cn(wrap, 'relative pt-14 sm:pt-20 lg:pt-24')}>
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
            <div className="space-y-5 lg:col-span-7">
              <Eyebrow>{c.eyebrow}</Eyebrow>
              <h1 id="site-hero-h" tabIndex={-1} data-page-heading className="text-[38px] font-bold leading-[1.18] tracking-tight text-fg outline-none sm:text-[54px] lg:text-[64px]">
                {c.h1a} <span className="text-gradient">{c.h1b}</span>
              </h1>
            </div>
            <div className="space-y-6 lg:col-span-5 lg:pb-2">
              <p className="text-base leading-relaxed text-muted sm:text-lg">{c.lead}</p>
              <div className="flex flex-wrap gap-3">
                <LinkButton size="lg" href={site('start')} className="bg-brand-gradient hover:opacity-95">{c.start}<Fwd /></LinkButton>
                <LinkButton size="lg" variant="secondary" href={link('/dashboard')}>{c.explore}<Badge tone="amber">{c.demo}</Badge></LinkButton>
              </div>
              <p className="text-xs text-subtle">{c.micro}</p>
            </div>
          </div>

          <div className="relative mt-14 pb-6 sm:mt-16 sm:pb-12">
            <Shot priority src={shotSrc('home', lang, dark)} alt={c.shotAlt} label={c.shotLabel} className="max-sm:hidden sm:me-16 lg:me-28" />
            <figure className="mx-auto w-[260px] sm:hidden">
              <img src={shotSrc('phone', lang, dark)} alt={c.phoneAlt} width={390} height={844} loading="eager"
                className="block aspect-[9/16] h-auto w-full rounded-[32px] border-[6px] border-[#12142b] object-cover object-top shadow-pop dark:border-[#2a2e52]" />
              <figcaption className="mt-3 text-center text-xs text-subtle">{c.shotLabel} · {t.exampleData}</figcaption>
            </figure>
            <img src={shotSrc('phone', lang, dark)} alt={c.phoneAlt} width={390} height={844} loading="eager"
              className="absolute bottom-0 end-0 hidden aspect-[9/17] h-auto w-[170px] rounded-[28px] border-[6px] border-[#12142b] object-cover object-top shadow-pop sm:block lg:w-[230px] dark:border-[#2a2e52]" />
          </div>
          <ol className="grid gap-6 border-t border-border py-10 sm:grid-cols-3">
            {c.notes.map((n, i) => (
              <li key={n} className="flex gap-3 text-sm leading-relaxed text-muted">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-500/10 text-xs font-bold text-brand-700 dark:text-brand-300" aria-hidden="true">{i + 1}</span>
                <span>{n}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Three work journeys, each proven by a real dashboard screen. */}
      <Section id="site-journeys" eyebrow={c.jEyebrow} title={c.jTitle} lead={c.jLead} tone="tint">
        <ol className="space-y-20 sm:space-y-28">
          {c.journeys.map((j, i) => (
            <li key={j.title} className="grid items-center gap-8 lg:grid-cols-12 lg:gap-14">
              <div className={cn('space-y-5 lg:col-span-5', i % 2 === 1 && 'lg:order-last')}>
                <p className="text-5xl font-bold text-brand-500/25 tabular-nums" aria-hidden="true">0{i + 1}</p>
                <div className="flex flex-wrap items-center gap-3"><H3 className="text-2xl">{j.title}</H3><Status s="demo" /></div>
                <p className="leading-relaxed text-muted">{j.body}</p>
                <ul className="space-y-2.5">
                  {j.points.map((p) => <li key={p} className="flex gap-2.5 text-sm text-fg"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />{p}</li>)}
                </ul>
                <ArrowLink href={j.href}>{c.open}</ArrowLink>
              </div>
              <div className="lg:col-span-7"><Shot src={shotSrc(j.shot, lang)} alt={j.label} label={j.label} /></div>
            </li>
          ))}
        </ol>
      </Section>

      {/* Available vs planned, by merchant stage. */}
      <Section id="site-stages" eyebrow={c.sEyebrow} title={c.sTitle} lead={c.sLead}>
        <div className="grid gap-10 md:grid-cols-3 md:gap-8">
          {c.stages.map((st, i) => (
            <div key={st.h} className="border-t-2 border-fg pt-5">
              <p className="text-xs font-semibold text-subtle tabular-nums" aria-hidden="true">0{i + 1}</p>
              <H3 className="mt-1">{st.h}</H3>
              <ul className="mt-4 divide-y divide-border">
                {st.items.map((it) => (
                  <li key={it.l} className="flex items-center justify-between gap-3 py-3 text-sm">
                    {it.href ? <a href={it.href} className="min-w-0 font-medium text-fg hover:text-brand-700 hover:underline dark:hover:text-brand-300">{it.l}</a> : <span className="min-w-0 text-fg">{it.l}</span>}
                    <Status s={it.s} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10"><LinkButton variant="secondary" href={site('plans')}>{c.comparePlans}</LinkButton></div>
      </Section>

      {/* Sector browsing: selection lives in the URL. */}
      <Section id="site-sectors" eyebrow={c.secEyebrow} title={c.secTitle} tone="tint">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="flex flex-wrap content-start gap-2 lg:col-span-5" role="group" aria-label={c.secTitle}>
            {SECTORS.map((s) => (
              <a key={s.id} href={site('', { sector: s.id })} aria-current={s.id === sector.id ? 'true' : undefined}
                onClick={(e) => { e.preventDefault(); replace(site('', { sector: s.id })); }}
                className={cn('inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors',
                  s.id === sector.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-border bg-bg text-muted hover:border-brand-300 hover:text-fg')}>
                {s.name[lang]}
              </a>
            ))}
          </div>
          <div className="rounded-2xl border border-border bg-bg p-6 sm:p-8 lg:col-span-7" aria-live="polite">
            <H3 className="text-xl">{sector.name[lang]}</H3>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2">
              <div><dt className="text-xs font-semibold text-subtle">{c.secNeeds}</dt><dd className="mt-1.5 text-sm leading-relaxed text-fg">{sector.needs[lang]}</dd></div>
              <div><dt className="text-xs font-semibold text-subtle">{c.secTools}</dt><dd className="mt-1.5 text-sm leading-relaxed text-fg">{sector.tools[lang]}</dd></div>
            </dl>
            <div className="mt-6"><ArrowLink href={site('start', { activity: sector.id })}>{c.secStart}</ArrowLink></div>
          </div>
        </div>
      </Section>

      {/* Proof: stats and testimonials stay empty until approved. */}
      <Section id="site-proof" eyebrow={c.proofEyebrow} title={c.proofTitle} lead={c.proofLead}>
        <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
          {[c.stores, c.countries].map((label) => (
            <div key={label} className="space-y-3 bg-surface p-6">
              <p className="text-sm text-muted">{label}</p>
              <p className="text-4xl font-bold text-subtle" aria-label={c.metricPending}>—</p>
              <Badge tone="amber">{c.metricPending}</Badge>
              <p className="text-xs text-subtle">{c.metricWhy}</p>
            </div>
          ))}
          <div className="space-y-3 bg-surface p-6">
            <p className="text-sm text-muted">{c.quotes}</p>
            <Pending title={t.awaitingApproval}>{c.quotesWhy}</Pending>
            <ArrowLink href={site('stories')}>{c.quotesCta}</ArrowLink>
          </div>
        </div>
      </Section>

      {/* Marketplace promo: store badges are disabled until the app exists. */}
      <Section id="site-market" eyebrow={c.mkEyebrow} title={c.mkTitle} lead={c.mkLead} tone="tint">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled aria-describedby="site-app-why">{c.appStore}</Button>
          <Button variant="secondary" disabled aria-describedby="site-app-why">{c.play}</Button>
          <LinkButton variant="soft" href={link('/market')}>{c.mkDemo}<Fwd /></LinkButton>
        </div>
        <p className="mt-3 text-xs text-subtle" id="site-app-why">{c.notPublished}</p>
      </Section>

      {/* Closing: one action. */}
      <section aria-labelledby="site-closing-h" className="py-16 sm:py-24">
        <div className={wrap}>
          <div className="flex flex-col gap-8 rounded-3xl border border-border bg-surface p-8 sm:p-12 lg:flex-row lg:items-center">
            <img src="/brand/lak-logo-sm.png" alt="" width={64} height={111} className="h-24 w-auto shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <h2 id="site-closing-h" className="text-2xl font-bold text-fg sm:text-[30px]">{c.ctaTitle}</h2>
              <p className="max-w-xl leading-relaxed text-muted">{c.ctaLead}</p>
            </div>
            <LinkButton size="lg" href={site('start')} className="self-start lg:self-center">{c.start}<Fwd /></LinkButton>
          </div>
        </div>
      </section>
    </>
  );
}
