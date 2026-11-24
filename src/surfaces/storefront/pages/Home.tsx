// Storefront home: the merchant's published homepage sections, in the merchant's order, with the merchant's headings.
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CreditCard, Receipt, RotateCcw, Tag, Truck } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { Button, EmptyState, InfoHint, LinkButton, cn } from '../../../ds/ui';
import { Field, Input } from '../../../ds/kit';
import { themeStore } from '../../merchant/stores';
import type { Section } from '../../merchant/workspace';
import { CATEGORIES, EMAIL_RE, MERCHANT, inStock, productById, type Product } from '../domain';
import { H2, PANEL, ProductPhoto, WRAP, to, useS } from '../kit';
import { newsletterStore } from '../state';
import { useCatalog } from '../data';
import { headingText, liveSections } from '../theme';
import { ProductCard, ProductGrid } from './Listing';

/** The merchant's own picks for "featured", in order; sold-out picks are skipped. */
const FEATURED = ['night-oud', 'leather-tote', 'linen-abaya', 'crepe-shayla', 'satin-dress', 'white-musk', 'crepe-abaya', 'evening-clutch'];
/** The product whose photo stands for each category tile. */
const CAT_COVER: Record<string, string> = { abayas: 'embroidered-abaya', dresses: 'satin-dress', perfume: 'night-oud', scarves: 'crepe-shayla', bags: 'leather-tote' };

export default function Home() {
  const { t, l } = useS();
  const theme = themeStore.use();
  const products = useCatalog();
  const sections = liveSections(theme).filter((s) => s.kind !== 'announcement');

  if (!products.length) {
    return (
      <div className={cn(WRAP, 'py-16')}>
        <EmptyState as="h1" title={t.noProductsT} action={<LinkButton href={to('/track')} variant="secondary">{t.trackTitle}</LinkButton>}>{t.noProductsB}</EmptyState>
      </div>
    );
  }

  return (
    <>
      {!sections.some((s) => s.kind === 'hero') && <h1 className="sr-only">{l(MERCHANT.name)}</h1>}
      {sections.map((s) => <HomeSection key={s.id} s={s} products={products} />)}
      <Promises />
    </>
  );
}

function SectionHead({ id, title, href }: { id: string; title: string; href?: string }) {
  const { t, lang } = useS();
  const Arrow = lang === 'ar' ? ArrowLeft : ArrowRight;
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <h2 id={id} className={H2}>{title}</h2>
      {href && <a href={href} className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-fg underline-offset-4 hover:underline">{t.viewAll}<Arrow className="size-4" aria-hidden="true" /></a>}
    </div>
  );
}

function HomeSection({ s, products }: { s: Section; products: Product[] }) {
  const { lang } = useLang();
  const { t, l } = useS();
  const title = headingText(s.heading, lang);
  const hid = `sf-h-${s.id}`;
  switch (s.kind) {
    case 'hero': {
      const cover = productById(products, 'embroidered-abaya') ?? products[0];
      return (
        <section aria-labelledby={hid} className="bg-surface-2/60">
          <div className={cn(WRAP, 'grid items-center gap-8 py-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16 lg:py-16')}>
            <div className="order-2 max-w-xl lg:order-1">
              <p className="text-[13px] font-semibold tracking-wide text-brand-700 dark:text-brand-300">{t.heroEyebrow}</p>
              <h1 id={hid} className="mt-3 text-[34px] font-semibold leading-[1.15] tracking-tight text-fg sm:text-5xl lg:text-[56px]">{title}</h1>
              <p className="mt-4 text-[15px] leading-relaxed text-muted sm:text-lg">{t.heroSub}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <LinkButton href={to('/c/abayas')} size="lg" className="h-12 px-7">{t.heroCta}</LinkButton>
                <LinkButton href={to('/c/perfume')} size="lg" variant="secondary" className="h-12 px-6">{t.heroCta2}</LinkButton>
              </div>
              <p className="mt-6 flex items-center gap-2 text-[13px] text-muted">
                <Tag className="size-4 shrink-0" aria-hidden="true" />
                <span>{t.offerBody} <bdi dir="ltr" className="rounded-md border border-dashed border-border px-1.5 py-0.5 font-semibold text-fg">WELCOME10</bdi></span>
                <InfoHint label={t.offerTitle}>{t.offerTerms}</InfoHint>
              </p>
            </div>
            <a href={to(`/p/${cover.id}`)} className="group order-1 block lg:order-2" aria-label={l(cover.name)}>
              <ProductPhoto p={cover} variant="card" eager className="rounded-3xl shadow-[0_30px_60px_-30px_rgb(0_0_0/0.35)] sm:aspect-[5/4] lg:aspect-[4/5]" />
            </a>
          </div>
        </section>
      );
    }
    case 'featured': {
      const list = FEATURED.map((id) => productById(products, id)).filter((p): p is Product => !!p && inStock(p)).slice(0, 4);
      return (
        <section aria-labelledby={hid} className={cn(WRAP, 'pt-16 sm:pt-20')}>
          <SectionHead id={hid} title={title} href={to('/c/all')} />
          <ProductGrid products={list} className="xl:grid-cols-4" />
        </section>
      );
    }
    case 'categories':
      return (
        <section aria-labelledby={hid} className={cn(WRAP, 'pt-16 sm:pt-20')}>
          <SectionHead id={hid} title={title} href={to('/c/all')} />
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-5">
            {CATEGORIES.map((c, i) => {
              const p = productById(products, CAT_COVER[c.id]) ?? products.find((x) => x.cat === c.id);
              const n = products.filter((x) => x.cat === c.id).length;
              return (
                <li key={c.id} className={cn(i === 0 && 'col-span-2 md:col-span-1')}>
                  <a href={to(`/c/${c.id}`)} className="group relative block overflow-hidden rounded-2xl">
                    {p ? <ProductPhoto p={p} color={p.colors.includes(c.tone) ? c.tone : undefined} className={cn('rounded-2xl', i === 0 && 'max-md:aspect-[16/10]')} /> : <span className="block aspect-[4/5] rounded-2xl bg-surface-2" />}
                    <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/65 to-transparent p-4 pt-14 text-white">
                      <span className="text-[15px] font-semibold leading-tight sm:text-base">{l(c.name)}</span>
                      <span className="text-xs opacity-85 tabular-nums">{t.resultN(String(n))}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      );
    case 'offers': {
      const sale = products.filter((p) => p.compareAt && inStock(p)).slice(0, 4);
      return (
        <section aria-labelledby={hid} className={cn(WRAP, 'pt-16 sm:pt-20')}>
          <SectionHead id={hid} title={title} />
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className={cn(PANEL, 'flex flex-col justify-between gap-4 p-6')}>
              <div><p className="text-[13px] font-semibold text-brand-700 dark:text-brand-300">{t.offerTitle}</p><p className="mt-2 text-lg font-semibold">{t.offerBody} <bdi dir="ltr">WELCOME10</bdi></p></div>
              <p className="text-xs text-muted">{t.offerTerms}</p>
            </div>
            {sale.length ? <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3">{sale.map((p) => <li key={p.id}><ProductCard p={p} /></li>)}</ul> : <p className="text-muted">{t.noOffers}</p>}
          </div>
        </section>
      );
    }
    case 'video':
      // No video has been uploaded for this store; the section tells the same story in words, never a fake player.
      return (
        <section aria-labelledby={hid} className={cn(WRAP, 'pt-16 sm:pt-20')}>
          <div className={cn(PANEL, 'grid gap-6 p-6 sm:p-10 lg:grid-cols-2')}>
            <div><h2 id={hid} className={H2}>{title}</h2><p className="mt-3 leading-relaxed text-muted">{t.aboutBody}</p></div>
            <ul className="space-y-3 text-sm">{t.craft.map((c) => <li key={c} className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-brand-700 dark:text-brand-300" aria-hidden="true" />{c}</li>)}</ul>
          </div>
        </section>
      );
    case 'newsletter':
      return <Newsletter id={hid} title={title} />;
    default:
      return null;
  }
}

function Newsletter({ id, title }: { id: string; title: string }) {
  const { t } = useS();
  const list = newsletterStore.use();
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const submit = () => {
    const e = email.trim();
    if (!EMAIL_RE.test(e)) { setErr(t.eEmail); return; }
    if (!list.includes(e.toLowerCase())) newsletterStore.set((x) => [...x, e.toLowerCase()]);
    setErr(null); setDone(e); setEmail('');
  };
  return (
    <section aria-labelledby={id} className={cn(WRAP, 'pt-16 sm:pt-20')}>
      <div className="rounded-3xl border border-border bg-surface-2 px-6 py-10 sm:px-12 sm:py-14">
        <div className="mx-auto max-w-xl text-center">
          <h2 id={id} className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
          <p className="mt-2 text-sm text-muted">{t.newsSub}</p>
          {done ? (
            <p role="status" className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 text-sm text-emerald-800 dark:text-emerald-300"><Check className="size-4" aria-hidden="true" />{t.newsDone}</p>
          ) : (
            <form className="mt-6 flex flex-col gap-2 text-start sm:flex-row sm:items-start" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
              <div className="min-w-0 flex-1">
                <Field label={<span className="sr-only">{t.newsEmail}</span>} error={err}>
                  {(p) => <Input {...p} type="email" dir="ltr" autoComplete="email" value={email} placeholder={t.newsEmail} onChange={(e) => { setEmail(e.target.value); setErr(null); }} className="h-12" />}
                </Field>
              </div>
              <Button type="submit" size="lg" className="h-12 px-6">{t.newsCta}</Button>
            </form>
          )}
          <p className="mt-4 text-xs text-muted">{t.newsNote}</p>
        </div>
      </div>
    </section>
  );
}

function Promises() {
  const { t } = useS();
  const items = [
    { icon: Truck, h: t.vDelivery, d: t.vDeliveryD, href: to('/page/shipping') },
    { icon: RotateCcw, h: t.vReturns, d: t.vReturnsD, href: to('/page/returns') },
    { icon: CreditCard, h: t.vPay, d: t.vPayD, href: to('/page/terms') },
    { icon: Receipt, h: t.vVat, d: t.vVatD, href: to('/page/terms') },
  ];
  return (
    <section aria-label={t.beforeBuy} className={cn(WRAP, 'pt-16 sm:pt-20')}>
      <ul className="grid grid-cols-1 divide-y divide-border rounded-2xl border border-border bg-surface sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
        {items.map((x) => (
          <li key={x.h}>
            <a href={x.href} className="flex h-full gap-3 p-5 hover:bg-surface-2/60">
              <x.icon className="mt-0.5 size-5 shrink-0 text-brand-700 dark:text-brand-300" aria-hidden="true" />
              <span><span className="block text-sm font-semibold">{x.h}</span><span className="mt-0.5 block text-[13px] text-muted">{x.d}</span></span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
