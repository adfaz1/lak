// Site-local building blocks on the LAK design system (src/ds). Pages compose these and ds components.
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Info } from 'lucide-react';
import { useLang } from '../../core/lang';
import { link } from '../../core/router';
import { Badge, cn } from '../../ds/ui';
import type { L } from './domain';
import { strings } from './i18n';

export const site = (path = '', query?: Record<string, string | undefined>) => link(`/site${path ? `/${path}` : ''}`, query);

export function useSite() {
  const { lang, dir } = useLang();
  return { lang, dir, t: strings[lang], tr: (l: L) => l[lang] };
}

/** Page container: one width for the whole site. */
export const wrap = 'mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8';

/** Forward arrow in reading direction. */
export function Fwd({ className }: { className?: string }) {
  const { lang } = useLang();
  const I = lang === 'ar' ? ArrowLeft : ArrowRight;
  return <I className={cn('size-4 shrink-0', className)} aria-hidden="true" />;
}

/** Capability status. "demo" = can be tried in this preview; "planned" = blueprint only; "pending" = awaiting a decision. */
export function Status({ s }: { s: 'demo' | 'planned' | 'pending' }) {
  const { t } = useSite();
  if (s === 'demo') return <Badge tone="green">{t.available}</Badge>;
  if (s === 'pending') return <Badge tone="amber">{t.awaitingApproval}</Badge>;
  return <Badge tone="gray">{t.planned}</Badge>;
}

export const Eyebrow = ({ children, id }: { children: ReactNode; id?: string }) =>
  <p id={id} className="text-[13px] font-semibold tracking-wide text-brand-600 dark:text-brand-300">{children}</p>;

/** Standard page intro: eyebrow, h1 (focused on navigation), lead. */
export function Intro({ eyebrow, title, lead, children, className }: { eyebrow?: string; title: string; lead?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={cn('max-w-3xl space-y-4', className)}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 tabIndex={-1} data-page-heading className="text-[32px] font-bold leading-[1.2] tracking-tight text-fg outline-none sm:text-[44px]">{title}</h1>
      {lead && <p className="max-w-2xl text-base leading-relaxed text-muted sm:text-lg">{lead}</p>}
      {children}
    </header>
  );
}

export const H2 = ({ children, id, className }: { children: ReactNode; id?: string; className?: string }) =>
  <h2 id={id} className={cn('text-2xl font-bold leading-snug tracking-tight text-fg sm:text-[30px]', className)}>{children}</h2>;
export const H3 = ({ children, id, className }: { children: ReactNode; id?: string; className?: string }) =>
  <h3 id={id} className={cn('text-lg font-semibold text-fg', className)}>{children}</h3>;
export const Lead = ({ children, className }: { children: ReactNode; className?: string }) =>
  <p className={cn('max-w-2xl text-base leading-relaxed text-muted', className)}>{children}</p>;

/** A full-width band with a heading block. `tone="tint"` gives a quiet surface for rhythm. */
export function Section({ id, eyebrow, title, lead, children, tone }: { id: string; eyebrow?: string; title: string; lead?: ReactNode; children: ReactNode; tone?: 'tint' }) {
  return (
    <section aria-labelledby={id} className={cn('py-16 sm:py-24', tone === 'tint' && 'border-y border-border bg-surface')}>
      <div className={wrap}>
        <div className="mb-10 max-w-3xl space-y-3">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <H2 id={id}>{title}</H2>
          {lead && <Lead>{lead}</Lead>}
        </div>
        {children}
      </div>
    </section>
  );
}

/** Notice that a block is a draft or awaiting an approved source. */
export function Pending({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="note" className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0"><p className="font-semibold">{title}</p>{children && <p className="mt-0.5 opacity-90">{children}</p>}</div>
    </div>
  );
}

/** Text link with a forward arrow. */
export function ArrowLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">{children}<Fwd /></a>;
}

/** A real screenshot of the product in a quiet window frame, labelled as demo data. */
export function Shot({ src, alt, label, className, priority }: { src: string; alt: string; label?: string; className?: string; priority?: boolean }) {
  const { t } = useSite();
  return (
    <figure className={cn('overflow-hidden rounded-2xl border border-border bg-surface shadow-pop', className)}>
      <div className="flex h-9 items-center gap-3 border-b border-border px-3.5">
        <span className="flex gap-1.5" aria-hidden="true"><i className="size-2.5 rounded-full bg-border" /><i className="size-2.5 rounded-full bg-border" /><i className="size-2.5 rounded-full bg-border" /></span>
        {label && <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted">{label}</span>}
        <span className="ms-auto shrink-0 rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">{t.exampleData}</span>
      </div>
      <img src={src} alt={alt} width={2160} height={1350} loading={priority ? 'eager' : 'lazy'} decoding="async" className="block aspect-[16/10] h-auto w-full object-cover object-top" />
    </figure>
  );
}

/** Scroll to and focus an in-page heading (anchors cannot be used with the hash router). */
export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.scrollIntoView({ block: 'start' });
  el.focus({ preventScroll: true });
}
