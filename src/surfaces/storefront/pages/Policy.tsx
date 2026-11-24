import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Badge, cn } from '../../../ds/ui';
import { settingsStore } from '../../merchant/stores';
import type { PolicyId } from '../../merchant/workspace';
import { Crumbs, H1, H3, PANEL, WRAP, to, useS } from '../kit';
import { useConfig } from '../data';

export const POLICY_IDS = ['shipping', 'returns', 'privacy', 'terms'] as const satisfies readonly PolicyId[];

/** Policies are the merchant's own text (Settings → Policies); shipping and payment facts come from the same settings. */
export default function PolicyPage({ id }: { id: PolicyId }) {
  const { t, l, lang, m } = useS();
  const cfg = useConfig();
  const policy = settingsStore.use().policies.find((p) => p.id === id);
  const name = (x: PolicyId) => ({ shipping: t.pShipping, returns: t.pReturns, privacy: t.pPrivacy, terms: t.pTerms })[x];
  const Arrow = lang === 'ar' ? ArrowLeft : ArrowRight;
  const published = policy?.state === 'published' && policy.text.trim();
  const facts: string[] = id === 'shipping'
    ? cfg.zones.map((z) => [t.zoneLine(l(z.name), l(z.cities), m(z.rate)), z.rateType === 'weight' && z.perKg ? t.perKg(m(z.perKg)) : '', z.freeOver !== null ? t.freeFromLine(m(z.freeOver)) : ''].filter(Boolean).join(' · '))
    : id === 'terms'
      ? [t.vatFact, ...(cfg.methods.length ? [t.payFact(cfg.methods.map((x) => t.methods[x]).join(t.listSep))] : []),
        ...(cfg.methods.includes('cod') ? [t.codFact(m(cfg.codMin), m(cfg.codMax)) + (cfg.codOpenLimit !== null ? ` ${t.codPerFact(String(cfg.codOpenLimit))}` : '')] : [])]
      : [];
  return (
    <div className={cn(WRAP, 'max-w-3xl py-6 sm:py-10')}>
      <Crumbs items={[{ label: t.home, href: to() }, { label: name(id) }]} />
      <h1 className={H1}>{name(id)}</h1>
      <p className="mt-2"><Badge>{t.sampleText}</Badge></p>
      <div className="mt-8 space-y-5 text-[15px] leading-loose text-fg/90">
        {published ? policy.text.split(/\n+/).map((p, i) => <p key={i} dir="auto">{p}</p>) : <p className="text-muted">{t.policyMissing}</p>}
      </div>
      {facts.length > 0 && (
        <section aria-labelledby="sf-pf-h" className={cn(PANEL, 'mt-8 space-y-3 p-5 sm:p-6')}>
          <h2 id="sf-pf-h" className={H3}>{t.policyFacts}</h2>
          <ul className="list-disc space-y-2 ps-5 text-sm leading-relaxed text-fg/90">{facts.map((f) => <li key={f}>{f}</li>)}</ul>
        </section>
      )}
      <nav aria-label={t.policies} className="mt-12 grid gap-2 border-t border-border pt-6 sm:grid-cols-3">
        {POLICY_IDS.filter((x) => x !== id).map((x) => (
          <a key={x} href={to(`/page/${x}`)} className={cn(PANEL, 'flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium hover:border-fg/30')}>{name(x)}<Arrow className="size-4 text-muted" aria-hidden="true" /></a>
        ))}
      </nav>
    </div>
  );
}
