// Campaign landing page (`#/store/lp/<slug>`), built by the merchant in Online store → Landing pages. Only the published
// version is shown, and only inside its window: before the start shoppers see "coming soon" (with the interest list if
// the page has one), after the end or when unpublished "this offer has ended". A visit is remembered for 7 days so an
// order placed afterwards is credited to the page.
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, Megaphone, Tag, Timer } from 'lucide-react';
import type { Route } from '../../../core/router';
import { Button, LinkButton, cn } from '../../../ds/ui';
import { Field, Input } from '../../../ds/kit';
import { collectionsStore, couponsStore, levelsStore, productsStore } from '../../merchant/stores';
import { collectionMembers } from '../../merchant/catalog';
import { landingStore, lpStatsStore, mediaStore, recordLandingVisit } from '../../dashboard/storefront/state';
import { blockProducts, countdownEnd, couponUsable, linkedCoupon, lpState, remaining, type LandingPage, type LpBlock } from '../../dashboard/storefront/landing-model';
import { mediaSrc } from '../theme';
import { sellable } from '../bridge';
import { EMAIL_RE } from '../domain';
import { H1, H2, PANEL, ProductPhoto, WRAP, to, useS } from '../kit';
import { cartStore } from '../state';
import { useCatalog } from '../data';
import { ProductGrid } from './Listing';

const txt = (x: { ar: string; en: string } | undefined, lang: 'ar' | 'en') => (x?.[lang] || x?.[lang === 'ar' ? 'en' : 'ar'] || '').trim();

export default function LandingRoute({ slug, route }: { slug: string; route: Route }) {
  const { lang, d } = useS();
  const pages = landingStore.use();
  const p = pages.find((x) => x.slug === slug);
  const now = Date.now();
  const state = p ? lpState(p, now) : 'draft';
  const counted = useRef('');
  useEffect(() => {
    if (!p || state !== 'live' || counted.current === slug) return;
    counted.current = slug;
    recordLandingVisit(slug, route.query.get('utm_campaign') ?? p.utm, route.query.get('utm_source') ?? 'direct');
  }, [p, state, slug, route.query]);
  // Search engines and share cards read the page's own title.
  useEffect(() => {
    if (!p?.live) return;
    const prev = document.title;
    document.title = txt(p.live.seo.title, lang) || txt(p.live.blocks.find((b) => b.kind === 'hero')?.heading, lang) || p.name;
    return () => { document.title = prev; };
  }, [p, lang]);
  if (!p || !p.live) return <Gone kind="missing" />;
  if (state === 'scheduled') return <ComingSoon p={p} when={d(Date.parse(`${p.start}:00+03:00`))} />;
  if (state === 'ended' || state === 'off') return <Gone kind="ended" />;
  return <Live p={p} />;
}

function Gone({ kind }: { kind: 'missing' | 'ended' }) {
  const { lang } = useS();
  const ar = lang === 'ar';
  return (
    <div className={cn(WRAP, 'flex flex-col items-center py-24 text-center')}>
      <span className="grid size-14 place-items-center rounded-2xl bg-brand-500/10 text-brand-700 dark:text-brand-300"><Megaphone className="size-6" aria-hidden="true" /></span>
      <h1 className={cn(H1, 'mt-5')}>{kind === 'ended' ? (ar ? 'انتهى هذا العرض' : 'This offer has ended') : (ar ? 'الصفحة غير موجودة' : 'Page not found')}</h1>
      {kind === 'ended' && <p className="mt-2 max-w-md text-muted">{ar ? 'شكرًا لاهتمامك. تصفح منتجاتنا الحالية.' : 'Thanks for your interest. Browse what we have now.'}</p>}
      <LinkButton href={to('/c/all')} size="lg" className="mt-6">{ar ? 'تسوّق المتجر' : 'Shop the store'}</LinkButton>
    </div>
  );
}

function ComingSoon({ p, when }: { p: LandingPage; when: string }) {
  const { lang } = useS();
  const hero = p.live!.blocks.find((b) => b.kind === 'hero');
  const interest = p.live!.blocks.find((b) => b.kind === 'interest');
  return (
    <div className={cn(WRAP, 'max-w-2xl py-16 text-center')}>
      <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">{lang === 'ar' ? `يبدأ ${when}` : `Starts ${when}`}</p>
      <h1 className={cn(H1, 'mt-2')}>{txt(hero?.heading, lang) || p.name}</h1>
      {hero && txt(hero.body, lang) && <p className="mt-3 text-muted">{txt(hero.body, lang)}</p>}
      {interest ? <div className="mt-8 text-start"><Interest b={interest} slug={p.slug} /></div> : <LinkButton href={to()} variant="secondary" className="mt-8">{lang === 'ar' ? 'الرئيسية' : 'Home'}</LinkButton>}
    </div>
  );
}

function Live({ p }: { p: LandingPage }) {
  const { lang } = useS();
  const live = p.live!;
  const catalog = useCatalog();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const collections = collectionsStore.use();
  const coupons = couponsStore.use();
  const stockOf = (x: (typeof products)[number]) => (x.type === 'digital' ? null : (x.variants.length ? x.variants.map((v) => v.sku) : [x.sku]).reduce((n, sku) => n + sellable(levels, sku), 0));
  const ctx = { collections: collections.filter((c) => c.visible).map((c) => ({ id: c.id, productIds: collectionMembers(c, products, stockOf).map((m) => m.id) })), liveProducts: catalog.map((x) => x.id) };
  const view = { ...p, draft: live };
  return (
    <div className="space-y-12 pb-8 sm:space-y-16">
      {live.blocks.map((b) => {
        switch (b.kind) {
          case 'hero': return <Hero key={b.id} b={b} />;
          case 'products': {
            const ids = blockProducts(b, view, ctx);
            const list = ids.map((id) => catalog.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
            if (!list.length) return null;
            return <section key={b.id} id={`lp-${b.id}`} className={WRAP} aria-labelledby={`h-${b.id}`}><h2 id={`h-${b.id}`} className={cn(H2, 'mb-6')}>{txt(b.heading, lang)}</h2><ProductGrid products={list} /></section>;
          }
          case 'countdown': return <Countdown key={b.id} b={b} end={countdownEnd(b, p, coupons)} />;
          case 'coupon': { const c = linkedCoupon(p, coupons); return c && !c.auto ? <CouponReveal key={b.id} b={b} code={c.code} ok={couponUsable(c, Date.now()) === 'ok'} /> : null; }
          case 'faq': return (
            <section key={b.id} className={cn(WRAP, 'max-w-3xl')} aria-labelledby={`h-${b.id}`}>
              <h2 id={`h-${b.id}`} className={cn(H2, 'mb-4')}>{txt(b.heading, lang)}</h2>
              <div className={cn(PANEL, 'divide-y divide-border')}>
                {(b.faq ?? []).map((f, i) => (
                  <details key={i} className="group px-5 py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">{txt(f.q, lang)}<ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted">{txt(f.a, lang)}</p>
                  </details>
                ))}
              </div>
            </section>
          );
          case 'interest': return <div key={b.id} className={cn(WRAP, 'max-w-2xl')}><Interest b={b} slug={p.slug} /></div>;
        }
      })}
    </div>
  );
}

function Hero({ b }: { b: LpBlock }) {
  const { lang } = useS();
  const lib = mediaStore.use();
  const catalog = useCatalog();
  const own = mediaSrc(b.image, lib);
  const prod = b.image?.startsWith('p:') ? catalog.find((x) => x.id === b.image!.slice(2)) : undefined;
  return (
    <section className={cn(WRAP, 'pt-6')}>
      <div className="relative overflow-hidden rounded-3xl bg-surface-2">
        {own ? <img src={own} alt="" className="aspect-[4/5] w-full object-cover sm:aspect-[21/9]" /> : prod ? <ProductPhoto p={prod} variant="hero" eager className="aspect-[4/5] w-full sm:aspect-[21/9]" /> : <div className="aspect-[3/2] w-full sm:aspect-[21/9]" />}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-6 sm:p-10">
          <h1 className="max-w-2xl text-3xl font-bold leading-tight text-white sm:text-5xl">{txt(b.heading, lang)}</h1>
          {txt(b.body, lang) && <p className="mt-3 max-w-xl text-white/85 sm:text-lg">{txt(b.body, lang)}</p>}
          <LinkButton href={to('/c/all')} size="lg" className="mt-6">{txt(b.cta, lang) || (lang === 'ar' ? 'تسوّق' : 'Shop')}</LinkButton>
        </div>
      </div>
    </section>
  );
}

function Countdown({ b, end }: { b: LpBlock; end: number }) {
  const { lang } = useS();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  if (Number.isNaN(end)) return null;
  const r = remaining(end, now);
  const unit = (n: number, ar: string, en: string) => (
    <div className="min-w-16 rounded-2xl bg-white/10 px-3 py-3 text-center sm:min-w-20"><span className="block font-mono text-2xl font-bold tabular-nums sm:text-4xl">{String(n).padStart(2, '0')}</span><span className="text-xs opacity-80">{lang === 'ar' ? ar : en}</span></div>
  );
  return (
    <section className={WRAP} aria-live="off">
      <div className="rounded-3xl bg-fg px-6 py-8 text-center text-bg sm:py-10">
        <p className="flex items-center justify-center gap-2 text-sm font-semibold opacity-90"><Timer className="size-4" aria-hidden="true" />{txt(b.heading, lang)}</p>
        {r.over ? <p className="mt-4 text-xl font-bold">{lang === 'ar' ? 'انتهى العرض' : 'The offer has ended'}</p>
          : <div className="mt-4 flex justify-center gap-2 sm:gap-3" dir="ltr" role="timer" aria-label={lang === 'ar' ? `${r.d} يوم ${r.h} ساعة ${r.m} دقيقة` : `${r.d} days ${r.h} hours ${r.m} minutes`}>{unit(r.d, 'يوم', 'days')}{unit(r.h, 'ساعة', 'hrs')}{unit(r.m, 'دقيقة', 'min')}{unit(r.s, 'ثانية', 'sec')}</div>}
      </div>
    </section>
  );
}

function CouponReveal({ b, code, ok }: { b: LpBlock; code: string; ok: boolean }) {
  const { lang } = useS();
  const ar = lang === 'ar';
  const [shown, setShown] = useState(false);
  const cart = cartStore.use();
  const applied = cart.coupon === code;
  return (
    <section className={cn(WRAP, 'max-w-2xl')}>
      <div className={cn(PANEL, 'border-2 border-dashed border-brand-300 p-6 text-center sm:p-8')}>
        <p className="flex items-center justify-center gap-2 text-lg font-semibold"><Tag className="size-5 text-brand-600" aria-hidden="true" />{txt(b.heading, lang)}</p>
        {!ok ? <p className="mt-3 text-sm text-muted">{ar ? 'هذا الكود غير متاح الآن.' : 'This code is not available right now.'}</p>
          : !shown ? <Button size="lg" className="mt-5" onClick={() => setShown(true)}>{ar ? 'اكشف الكود' : 'Reveal the code'}</Button> : (
            <div className="mt-5 space-y-3">
              <p><bdi dir="ltr" className="inline-block rounded-xl border-2 border-dashed border-border px-5 py-2 font-mono text-2xl font-bold tracking-widest">{code}</bdi></p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="secondary" onClick={() => { try { void navigator.clipboard.writeText(code); } catch { /* the code is on screen */ } }}><Copy className="size-4" aria-hidden="true" />{ar ? 'انسخ' : 'Copy'}</Button>
                <Button disabled={applied} onClick={() => cartStore.set((c) => ({ ...c, coupon: code }))}>{applied ? <><Check className="size-4" aria-hidden="true" />{ar ? 'أُضيف للسلة' : 'Added to your bag'}</> : (ar ? 'طبّقه على سلتي' : 'Apply to my bag')}</Button>
              </div>
              <p className="text-xs text-muted">{ar ? 'يُتحقق من شروط الكود عند الدفع.' : 'The code’s conditions are checked at checkout.'}</p>
            </div>
          )}
      </div>
    </section>
  );
}

function Interest({ b, slug }: { b: LpBlock; slug: string }) {
  const { lang } = useS();
  const ar = lang === 'ar';
  const [v, setV] = useState('');
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const submit = () => {
    const raw = v.trim().replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
    const phone = raw.replace(/[\s-]/g, '').replace(/^(\+?966|0)/, '');
    const okEmail = EMAIL_RE.test(raw), okPhone = /^5\d{8}$/.test(phone);
    if (!okEmail && !okPhone) { setErr(ar ? 'أدخل بريدًا صحيحًا أو جوالًا يبدأ بـ 5' : 'Enter a valid email or a mobile starting with 5'); return; }
    if (!consent) { setErr(ar ? 'وافق على أن نتواصل معك' : 'Agree that we may contact you'); return; }
    const contact = okEmail ? raw.toLowerCase() : `+966${phone}`;
    lpStatsStore.set((s) => { const cur = s[slug] ?? { visits: 0, interest: [] }; return cur.interest.some((x) => x.contact === contact) ? s : { ...s, [slug]: { ...cur, interest: [...cur.interest, { contact, at: Date.now() }] } }; });
    setErr(''); setDone(true);
  };
  return (
    <section className={cn(PANEL, 'p-6 sm:p-8')} aria-labelledby={`h-${b.id}`}>
      <h2 id={`h-${b.id}`} className={H2}>{txt(b.heading, lang)}</h2>
      {txt(b.body, lang) && <p className="mt-2 text-muted">{txt(b.body, lang)}</p>}
      {done ? <p className="mt-5 flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400" role="status"><Check className="size-5" aria-hidden="true" />{ar ? 'سجّلناك. سنذكّرك عند البدء.' : 'You’re on the list. We’ll remind you when it starts.'}</p> : (
        <form className="mt-5 space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <Field label={ar ? 'البريد أو الجوال' : 'Email or mobile'} error={err || null}>{(f) => <Input {...f} dir="ltr" value={v} autoComplete="email" onChange={(e) => setV(e.target.value)} />}</Field>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-4 accent-brand-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} />{ar ? 'أوافق على أن يتواصل معي المتجر بخصوص هذا العرض فقط.' : 'I agree the store may contact me about this offer only.'}</label>
          <Button type="submit">{ar ? 'نبّهني' : 'Notify me'}</Button>
          <p className="text-xs text-muted">{ar ? 'نسخة تجريبية: لا تُرسل رسائل.' : 'Preview: no messages are sent.'}</p>
        </form>
      )}
    </section>
  );
}
