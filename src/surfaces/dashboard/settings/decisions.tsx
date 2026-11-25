// Pending decisions (`#/dashboard/settings/decisions`): every LAK business decision that blocks a feature, with what it
// blocks, the options on the table and the screens that show a «قرار مطلوب» marker. `?d=<id>` opens on one decision.
// Read-only by design: LAK decides these; the merchant sees honestly what is still simulated and why.
import { useEffect } from 'react';
import { ArrowLeft, Ban, ListChecks, MapPin, Scale, SearchX } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, useRoute } from '../../../core/router';
import { DECISIONS, filterDecisions, isDecision, type DecisionArea } from '../../merchant/commercial';
import { Badge, Card, EmptyState, InfoHint, LinkButton, cn, useTx, type Tone } from '../../../ds/ui';
import { FilterChip, SearchInput } from '../../../ds/kit';
import { settingsHref } from './common';

const AREAS: DecisionArea[] = ['pricing', 'marketplace', 'channels', 'policy'];
const A_TONE: Record<DecisionArea, Tone> = { pricing: 'brand', marketplace: 'sky', channels: 'gray', policy: 'amber' };

export default function DecisionsPage() {
  const tx = useTx();
  const { lang } = useLang();
  const route = useRoute();
  const q = route.query.get('q') ?? '';
  const qa = route.query.get('area');
  const area = (AREAS as string[]).includes(qa ?? '') ? (qa as DecisionArea) : '';
  const focus = route.query.get('d');
  const go = (p: Record<string, string | undefined>) => replace(settingsHref('decisions', { q: q || undefined, area: area || undefined, ...p }));
  const shown = filterDecisions(DECISIONS, { q, area });
  const areaName = (a: DecisionArea) => ({ pricing: tx('أسعار ورسوم', 'Prices & fees'), marketplace: tx('أسواق وشركاء', 'Marketplaces & partners'), channels: tx('قنوات البيع', 'Sales channels'), policy: tx('سياسات', 'Policies') })[a];

  useEffect(() => {
    if (!isDecision(focus)) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(`d-${focus}`);
      if (!el) return;
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      el.focus({ preventScroll: true });
    }, 120);
    return () => window.clearTimeout(t);
  }, [focus]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[.06] px-4 py-3">
        <Scale className="size-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm font-medium text-fg">{tx(`${DECISIONS.length} قرارًا تجاريًا لم تعتمده «لك» بعد`, `${DECISIONS.length} business decisions LAK has not approved yet`)}</p>
        <InfoHint>{tx('الأدوات المرتبطة تعمل كمحاكاة، وكل سعر أو رسم أو حد تضعه «لك» يظهر «بانتظار الاعتماد». لا يُحصَّل شيء.', 'Linked tools run as simulations; every LAK price, fee or limit shows “Pending approval”. Nothing is charged.')}</InfoHint>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={(v) => go({ q: v || undefined, d: undefined })} placeholder={tx('مثال: ثيمات، رسوم، تغليف', 'e.g. themes, fees, packaging')} />
        <FilterChip label={tx('النوع', 'Type')} value={area} onChange={(v) => go({ area: v || undefined, d: undefined })} options={AREAS.map((a) => ({ value: a, label: areaName(a) }))} />
        {(q || area) && <span className="text-xs text-muted tabular-nums" aria-live="polite">{tx(`${shown.length} من ${DECISIONS.length}`, `${shown.length} of ${DECISIONS.length}`)}</span>}
      </div>

      {shown.length === 0 ? (
        <Card><EmptyState as="h2" icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا قرارات تطابق البحث', 'No decisions match')}
          action={<LinkButton variant="secondary" href={settingsHref('decisions')}>{tx('امسح البحث', 'Clear search')}</LinkButton>} /></Card>
      ) : (
        <ul className="space-y-3">
          {shown.map((d) => (
            <li key={d.id}>
              <Card id={`d-${d.id}`} tabIndex={-1} aria-labelledby={`dh-${d.id}`} className={cn('scroll-mt-24 p-5 outline-none', focus === d.id && 'ring-2 ring-amber-400')}>
                <div className="flex flex-wrap items-start gap-2">
                  <h2 id={`dh-${d.id}`} className="w-full min-w-0 text-[15px] font-semibold text-fg sm:w-auto sm:flex-1">{d.title[lang]}</h2>
                  <Badge tone={A_TONE[d.area]}>{areaName(d.area)}</Badge>
                  <Badge tone="amber">{tx('بانتظار القرار', 'Awaiting decision')}</Badge>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{d.question[lang]}</p>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-fg"><Ban className="size-3.5 text-red-600 dark:text-red-400" aria-hidden="true" />{tx('ما يوقفه', 'What it blocks')}</p>
                    <ul className="space-y-1 text-[13px] text-muted">{d.blocks.map((b) => <li key={b.en} className="flex gap-1.5"><span aria-hidden="true">•</span>{b[lang]}</li>)}</ul>
                  </div>
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-fg"><ListChecks className="size-3.5 text-brand-600 dark:text-brand-300" aria-hidden="true" />{tx('الخيارات المطروحة', 'Options')}</p>
                    <ol className="space-y-1 text-[13px] text-muted">{d.options.map((o, i) => <li key={o.en} className="flex gap-1.5"><span className="tabular-nums text-subtle">{i + 1}.</span>{o[lang]}</li>)}</ol>
                  </div>
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-fg"><MapPin className="size-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />{tx('أين يظهر', 'Where it appears')}</p>
                    <ul className="space-y-1">{d.where.map((x) => (
                      <li key={x.path + JSON.stringify(x.query ?? {})}><a href={link(`/dashboard/${x.path}`, x.query)} className="group inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline dark:text-brand-300">{x.label[lang]}<ArrowLeft className="size-3.5 ltr:rotate-180" aria-hidden="true" /></a></li>
                    ))}</ul>
                  </div>
                </div>
                <p className="mt-4 border-t border-border pt-3 text-[11px] text-subtle"><bdi>{d.refs}</bdi></p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
