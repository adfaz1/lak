// Marketing calendar (`#/dashboard/calendar`, `?m=yyyy-mm&view=month|agenda&kind=&d=yyyy-mm-dd`): every scheduled
// coupon, automatic offer, landing page, announcement bar, campaign, article and maintenance window in one place, beside
// Saudi occasions (lunar dates marked approximate). Overlapping discounts on the same products are flagged, and a
// campaign can be planned from any day: it creates the drafts (coupon, landing page, announcement, reminder) together.
// Salla removed its marketing timeline in the new dashboard; this brings it back, fed by the real data.
import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, BellRing, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Flag, Layers, Megaphone, MessageSquare, Plus, Sparkles, Tag, Wrench } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { can, canSee } from '../../merchant/perms';
import { campaignsStore } from '../marketing/model';
import { couponsStore, currentActor, logAction, productsStore, settingsStore, themeStore } from '../../merchant/stores';
import { createStore } from '../../../core/store';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, InfoHint, LinkButton, Segmented, Skeleton, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, Checkbox, Field, FilterChip, Input, Modal, PageHeader, Simulated, useToast } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { useUnsaved } from '../unsaved';
import { Locked, NoAccess, ReviewRole, useRole } from '../marketing/access';
import { blogStore, landingStore } from '../storefront/state';
import { lpState, newLanding } from '../storefront/landing-model';
import { postState } from '../storefront/blog-model';
import { updateSection } from '../storefront/model';
import {
  CAL_KINDS, NAME_MAX, addDays, calendarFixture, codeFor, codeIssue, conflicts, conflictsOn, couponItems, monthGrid, occasionItems, onDay, overlaps,
  pctValue, planErrors, planItems, reminderItems, riyadhToday, shiftMonth, suggestPlan, upcoming, validMonth, weekLanes,
  type CalItem, type CalKind, type CalendarState, type Conflict, type PlanPiece,
} from './model';

export const calendarStore = createStore.key('dashboard.calendar')<CalendarState>(calendarFixture);

const K_TONE: Record<CalKind, Tone> = { occasion: 'green', plan: 'brand', coupon: 'amber', offer: 'amber', landing: 'sky', announcement: 'gray', campaign: 'sky', post: 'gray', maintenance: 'red', reminder: 'brand' };
const K_BAR: Record<CalKind, string> = {
  occasion: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300', plan: 'bg-brand-500/15 text-brand-800 dark:text-brand-200', coupon: 'bg-amber-500/15 text-amber-900 dark:text-amber-200', offer: 'bg-orange-500/15 text-orange-900 dark:text-orange-200',
  landing: 'bg-sky-500/15 text-sky-900 dark:text-sky-200', announcement: 'bg-slate-500/15 text-slate-800 dark:text-slate-200', campaign: 'bg-cyan-500/15 text-cyan-900 dark:text-cyan-200', post: 'bg-violet-500/15 text-violet-900 dark:text-violet-200',
  maintenance: 'bg-red-500/15 text-red-800 dark:text-red-300', reminder: 'bg-fuchsia-500/15 text-fuchsia-900 dark:text-fuchsia-200',
};
const K_ICON: Record<CalKind, ReactNode> = {
  occasion: <Flag className="size-3.5" aria-hidden="true" />, plan: <Layers className="size-3.5" aria-hidden="true" />, coupon: <Tag className="size-3.5" aria-hidden="true" />, offer: <Sparkles className="size-3.5" aria-hidden="true" />,
  landing: <Megaphone className="size-3.5" aria-hidden="true" />, announcement: <Megaphone className="size-3.5" aria-hidden="true" />, campaign: <MessageSquare className="size-3.5" aria-hidden="true" />, post: <BookOpen className="size-3.5" aria-hidden="true" />,
  maintenance: <Wrench className="size-3.5" aria-hidden="true" />, reminder: <BellRing className="size-3.5" aria-hidden="true" />,
};

function useKindLabel() {
  const tx = useTx();
  return (k: CalKind) => ({ occasion: tx('مناسبة', 'Occasion'), plan: tx('خطة حملة', 'Campaign plan'), coupon: tx('كوبون', 'Coupon'), offer: tx('عرض تلقائي', 'Automatic offer'), landing: tx('صفحة هبوط', 'Landing page'), announcement: tx('شريط الإعلان', 'Announcement bar'), campaign: tx('حملة رسائل', 'Message campaign'), post: tx('مقال', 'Article'), maintenance: tx('صيانة', 'Maintenance'), reminder: tx('تذكير', 'Reminder') })[k];
}

/** Every dated thing in the store, as calendar items. */
function useItems(horizon: string): CalItem[] {
  const coupons = couponsStore.use();
  const landings = landingStore.use();
  const theme = themeStore.use();
  const campaigns = campaignsStore.use();
  const blog = blogStore.use();
  const status = settingsStore.use().status;
  const cal = calendarStore.use();
  return useMemo(() => {
    const now = Date.now();
    const today = riyadhToday(now);
    const out: CalItem[] = [...occasionItems(), ...couponItems(coupons, horizon), ...planItems(cal.plans), ...reminderItems(cal.reminders)];
    for (const p of landings) {
      const s = lpState(p, now);
      if (!p.start && !p.end && s === 'draft') continue;
      out.push({ id: `lp:${p.id}`, kind: 'landing', title: { ar: p.name || p.slug, en: p.name || p.slug }, start: (p.start || p.updatedAt).slice(0, 10), end: (p.end || addDays(horizon, 0)).slice(0, 10), planned: s === 'draft' || s === 'off', state: { ar: { draft: 'مسودة', scheduled: 'مجدولة', live: 'منشورة', ended: 'انتهت', off: 'موقوفة' }[s], en: { draft: 'Draft', scheduled: 'Scheduled', live: 'Live', ended: 'Ended', off: 'Unpublished' }[s] }, href: `/dashboard/storefront/landing/${p.id}` });
    }
    const pub = theme.published.sections.find((x) => x.kind === 'announcement');
    const dr = theme.draft.find((x) => x.kind === 'announcement');
    if (pub && (pub.start || pub.end)) out.push({ id: 'ann:live', kind: 'announcement', title: { ar: pub.heading, en: pub.heading }, start: pub.start || today, end: pub.end || horizon, state: { ar: 'منشور', en: 'Live' }, href: '/dashboard/storefront?edit=announcement' });
    if (dr && (dr.start || dr.end) && JSON.stringify(dr) !== JSON.stringify(pub)) out.push({ id: 'ann:draft', kind: 'announcement', title: { ar: dr.heading, en: dr.heading }, start: dr.start || today, end: dr.end || horizon, planned: true, state: { ar: 'في المسودة', en: 'In draft' }, href: '/dashboard/storefront?edit=announcement' });
    for (const c of campaigns) if (c.date) out.push({ id: `cmp:${c.id}`, kind: 'campaign', title: { ar: `${c.id} · ${c.audience.ar}`, en: `${c.id} · ${c.audience.en}` }, start: c.date, end: c.date, state: { ar: 'أُرسلت', en: 'Sent' }, href: '/dashboard/marketing/campaigns' });
    for (const p of blog.posts) {
      const s = postState(p, now);
      if (s === 'draft' || s === 'hidden') continue;
      const d = (p.publishAt || p.updatedAt).slice(0, 10);
      out.push({ id: `bp:${p.id}`, kind: 'post', title: { ar: p.draft.title.ar || p.slug, en: p.draft.title.en || p.slug }, start: d, end: d, state: s === 'scheduled' ? { ar: 'مجدول', en: 'Scheduled' } : { ar: 'منشور', en: 'Live' }, href: `/dashboard/storefront/blog/${p.id}` });
    }
    if (status.maintenance) out.push({ id: 'mnt', kind: 'maintenance', title: { ar: status.message || 'صيانة', en: status.message || 'Maintenance' }, start: today, end: status.until ? riyadhToday(status.until) : today, state: status.until ? { ar: 'تنتهي تلقائيًا', en: 'Ends by itself' } : { ar: 'حتى تُطفأ', en: 'Until switched off' }, href: '/dashboard/storefront?dlg=maintenance' });
    return out;
  }, [coupons, landings, theme, campaigns, blog, status, cal, horizon]);
}

export default function CalendarSection({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const role = useRole();
  const state = useDashState();
  const products = productsStore.use();
  const kindLabel = useKindLabel();
  const today = riyadhToday(Date.now());
  const qm = route.query.get('m');
  const m = validMonth(qm) ? qm : today.slice(0, 7);
  const view = route.query.get('view') === 'agenda' ? 'agenda' : 'month';
  const kind = (route.query.get('kind') ?? '') as CalKind | '';
  const qd = route.query.get('d');
  const day = qd && /^\d{4}-\d{2}-\d{2}$/.test(qd) ? qd : null;
  const go = (p: Record<string, string | undefined>) => replace(link('/dashboard/calendar', { m: qm ?? undefined, view: view === 'agenda' ? 'agenda' : undefined, kind: kind || undefined, d: day ?? undefined, ...p }));
  const horizon = addDays(today, 400);
  const items = useItems(horizon);
  const catOf = (id: string) => products.find((p) => p.id === id)?.category.en;
  const cs = useMemo(() => conflicts(items, catOf), [items, products]); // eslint-disable-line react-hooks/exhaustive-deps
  const [plan, setPlan] = useState<string | null>(() => (route.query.get('plan') === '1' ? today : null));
  const canPlan = can(role, 'marketing.manage');

  if (!canSee(role, 'marketing')) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('تقويم التسويق غير متاح لدورك', 'The marketing calendar is not available for your role')} /></div>;
  const header = (
    <>
      <PageHeader title={tx('تقويم التسويق', 'Marketing calendar')} description={tx('عروضك وحملاتك بجانب مواسم السعودية', 'Your offers and campaigns beside the Saudi seasons')}
        actions={canPlan ? <Button onClick={() => setPlan(day ?? today)}><Plus className="size-4" aria-hidden="true" />{tx('خطّط حملة', 'Plan a campaign')}</Button> : <Locked>{tx('التخطيط للمالك والتسويق', 'Planning is for Owner and Marketing')}</Locked>} />
      <ReviewRole />
    </>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<Card className="p-5" role="status" aria-label="Loading"><Skeleton className="mb-4 h-8 w-56" /><div className="grid grid-cols-7 gap-1">{Array.from({ length: 35 }, (_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div></Card></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل التقويم', 'The calendar could not load')} onRetry={() => setDashState('live')}>{tx('عروضك وحملاتك تعمل كما هي. المرجع SIM-CAL-503.', 'Your offers and campaigns keep running. Ref SIM-CAL-503.')}</ErrorState></Card></div>;
  const empty = state === 'empty';
  const shown = (empty ? items.filter((i) => i.kind === 'occasion') : items).filter((i) => !kind || i.kind === kind);
  const grid = monthGrid(m);
  const monthName = new Date(`${m}-15T12:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { month: 'long', year: 'numeric' });
  const hijri = new Date(`${m}-15T12:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : 'en-GB-u-ca-islamic-umalqura', { month: 'long', year: 'numeric' });
  const dayName = (i: number) => new Date(Date.UTC(2026, 10, 22 + i)).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', { weekday: 'short' });
  const evergreen = shown.filter((i) => i.evergreen);
  const dated = shown.filter((i) => !i.evergreen);
  const inMonth = shown.filter((i) => overlaps(i, { start: `${m}-01`, end: `${m}-31` })).sort((a, b) => (a.start < b.start ? -1 : 1));
  const monthConflicts = cs.filter((c) => overlaps({ start: c.from, end: c.to }, { start: `${m}-01`, end: `${m}-31` }));
  const up = upcoming(today, 120).slice(0, 3);
  const Prev = lang === 'ar' ? ChevronRight : ChevronLeft, Next = lang === 'ar' ? ChevronLeft : ChevronRight;

  return (
    <div className="space-y-6">
      {header}
      {!empty && cs.length > 0 && <ConflictCard cs={cs} />}
      {up.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {up.map(({ o, prepFrom, inDays }) => (
            <Card key={o.id} className="flex items-start gap-3 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><Flag className="size-5" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">{o.name[lang]}{o.approx && <Badge tone="gray">{tx('تقريبي', 'Approx.')}</Badge>}</p>
                <p className="text-xs text-muted tabular-nums">{inDays === 0 ? tx('الآن', 'Now') : tx(`بعد ${inDays} يومًا · ${o.start}`, `In ${inDays} days · ${o.start}`)}</p>
                <p className="mt-1 text-xs text-muted">{prepFrom <= today ? tx('وقت التجهيز الآن', 'Time to prepare is now') : tx(`ابدأ التجهيز ${prepFrom}`, `Start preparing ${prepFrom}`)}</p>
                {canPlan && <Button size="sm" variant="secondary" className="mt-2" onClick={() => setPlan(prepFrom < today ? today : prepFrom)}>{tx('خطّط لها', 'Plan for it')}</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <div className="flex items-center gap-1">
            <a href={link('/dashboard/calendar', { m: shiftMonth(m, -1), view: view === 'agenda' ? 'agenda' : undefined, kind: kind || undefined })} className="grid size-9 place-items-center rounded-lg border border-border hover:bg-surface-2" aria-label={tx('الشهر السابق', 'Previous month')}><Prev className="size-4" aria-hidden="true" /></a>
            <a href={link('/dashboard/calendar', { m: shiftMonth(m, 1), view: view === 'agenda' ? 'agenda' : undefined, kind: kind || undefined })} className="grid size-9 place-items-center rounded-lg border border-border hover:bg-surface-2" aria-label={tx('الشهر التالي', 'Next month')}><Next className="size-4" aria-hidden="true" /></a>
          </div>
          <h2 className="min-w-0 text-base font-bold text-fg">{monthName} <span className="text-xs font-normal text-muted">· {hijri}</span></h2>
          {m !== today.slice(0, 7) && <Button size="sm" variant="ghost" onClick={() => go({ m: undefined, d: undefined })}>{tx('اليوم', 'Today')}</Button>}
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <FilterChip label={tx('النوع', 'Type')} value={kind} onChange={(v) => go({ kind: v || undefined })} options={CAL_KINDS.map((k) => ({ value: k, label: kindLabel(k) }))} />
            <span className="hidden md:inline-flex"><Segmented label={tx('العرض', 'View')} value={view} onChange={(v) => go({ view: v === 'agenda' ? 'agenda' : undefined })} options={[{ value: 'month', label: tx('شهر', 'Month') }, { value: 'agenda', label: tx('قائمة', 'List') }]} /></span>
          </div>
        </div>
        {view === 'month' && (
          <div className="hidden md:block">
            <div className="grid grid-cols-7 border-b border-border text-center text-xs font-semibold text-muted">{Array.from({ length: 7 }, (_, i) => <div key={i} className="py-2">{dayName(i)}</div>)}</div>
            {evergreen.length > 0 && <p className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2 text-xs text-muted">{tx('يعمل دائمًا (بلا تاريخ نهاية):', 'Always on (no end date):')}{evergreen.map((i) => <Chip key={i.id} i={i} lang={lang} />)}</p>}
            <div role="grid" aria-label={monthName}>
              {grid.map((w, wi) => {
                const placed = weekLanes(w, dated);
                const LANES = 4;
                const hidden = (d: string, col: number) => placed.filter((x) => x.lane >= LANES && x.col <= col && col < x.col + x.span).length + (d ? 0 : 0);
                return (
                  <div key={wi} role="row" className="relative grid grid-cols-7" style={{ gridTemplateRows: `30px repeat(${LANES}, 22px) minmax(18px, 1fr)` }}>
                    {w.map((d, ci) => {
                      const out = d.slice(0, 7) !== m;
                      const clash = !empty && conflictsOn(cs, d).length > 0;
                      const more = hidden(d, ci);
                      const n = dated.filter((i) => onDay(i, d)).length;
                      return (
                        <div key={d} role="gridcell" aria-selected={day === d} style={{ gridColumn: ci + 1, gridRow: `1 / span ${LANES + 2}` }} className={cn('flex min-h-32 flex-col border-b border-e border-border p-1.5', out && 'bg-surface-2/40', day === d && 'ring-2 ring-inset ring-brand-500')}>
                          <button type="button" onClick={() => go({ d })} className="flex w-full items-center gap-1 rounded-md text-xs hover:bg-surface-2" aria-label={tx(`${d}: ${n} عنصر`, `${d}: ${n} items`)}>
                            <span className={cn('grid size-6 place-items-center rounded-full tabular-nums', d === today ? 'bg-brand-600 font-bold text-white' : out ? 'text-subtle' : 'text-fg')}>{Number(d.slice(8))}</span>
                            {clash && <AlertTriangle className="size-3.5 text-red-600 dark:text-red-400" aria-label={tx('تعارض', 'Conflict')} />}
                          </button>
                          {more > 0 && <button type="button" className="mt-auto px-1 text-start text-[11px] font-semibold text-muted hover:text-fg" onClick={() => go({ d })}>{tx(`+${more} أخرى`, `+${more} more`)}</button>}
                        </div>
                      );
                    })}
                    {placed.filter((x) => x.lane < LANES).map((x) => (
                      <div key={x.item.id} className="z-10 min-w-0 px-1" style={{ gridColumn: `${x.col + 1} / span ${x.span}`, gridRow: x.lane + 2 }}><Chip i={x.item} lang={lang} /></div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className={cn(view === 'month' && 'md:hidden')}>
          {inMonth.length === 0 ? <EmptyState icon={<CalendarDays className="size-6" aria-hidden="true" />} title={tx('لا شيء مجدول هذا الشهر', 'Nothing scheduled this month')} action={canPlan ? <Button onClick={() => setPlan(`${m}-01` < today ? today : `${m}-01`)}><Plus className="size-4" aria-hidden="true" />{tx('خطّط حملة', 'Plan a campaign')}</Button> : undefined} />
            : <ul className="divide-y divide-border">{inMonth.map((i) => <AgendaRow key={i.id} i={i} clash={cs.some((c) => c.a.id === i.id || c.b.id === i.id)} />)}</ul>}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-[11px] text-muted">
          {CAL_KINDS.map((k) => <span key={k} className="inline-flex items-center gap-1"><span className={cn('size-2.5 rounded-sm', K_BAR[k])} aria-hidden="true" />{kindLabel(k)}</span>)}
          <span className="inline-flex items-center gap-1">{tx('تواريخ رمضان والعيدين تقديرية', 'Ramadan and Eid dates are estimates')}<InfoHint>{tx('حسب تقويم أم القرى، وتتغير يومًا أو يومين برؤية الهلال. الثابتة: يوم التأسيس 22 فبراير، اليوم الوطني 23 سبتمبر، والجمعة البيضاء آخر جمعة من نوفمبر.', 'Per the Umm al-Qura calendar; they move a day or two with the moon sighting. Fixed: Founding Day 22 Feb, National Day 23 Sep, White Friday the last Friday of November.')}</InfoHint></span>
        </div>
      </Card>

      {day && <DayPanel day={day} items={shown.filter((i) => onDay(i, day))} cs={empty ? [] : conflictsOn(cs, day)} canPlan={canPlan} onPlan={() => setPlan(day < today ? today : day)} onClose={() => go({ d: undefined })} />}
      {monthConflicts.length === 0 && !empty && view === 'month' && <p className="text-xs text-muted">{tx('لا تعارض بين الخصومات في هذا الشهر.', 'No discounts clash this month.')}</p>}
      {plan && <PlanDialog day={plan} today={today} onClose={() => setPlan(null)} />}
    </div>
  );
}

function Chip({ i, lang }: { i: CalItem; lang: 'ar' | 'en' }) {
  const body = <span className={cn('flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] font-medium', K_BAR[i.kind], i.planned && 'border border-dashed border-current/40 opacity-80')}>{K_ICON[i.kind]}<span className="truncate" dir="auto">{i.title[lang]}</span>{i.approx && <span aria-hidden="true">~</span>}{i.exhausted && <span className="opacity-70">· {lang === 'ar' ? 'نفد' : 'used up'}</span>}</span>;
  return i.href ? <a href={link(i.href.split('?')[0], Object.fromEntries(new URLSearchParams(i.href.split('?')[1] ?? '')))} className="block hover:opacity-80">{body}</a> : body;
}

function AgendaRow({ i, clash }: { i: CalItem; clash: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const kindLabel = useKindLabel();
  const inner = (
    <>
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', K_BAR[i.kind])}>{K_ICON[i.kind]}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-fg" dir="auto">{i.title[lang]}</span>
        <span className="block text-xs text-muted tabular-nums">{kindLabel(i.kind)} · <bdi dir="ltr">{i.start === i.end ? i.start : `${i.start} → ${i.end}`}</bdi>{i.approx && ` · ${tx('تقريبي', 'approx.')}`}</span></span>
      {clash && <Badge tone="red">{tx('تعارض', 'Conflict')}</Badge>}
      {i.state && <Badge tone={K_TONE[i.kind]}>{i.state[lang]}</Badge>}
    </>
  );
  return <li>{i.href ? <a href={link(i.href.split('?')[0], Object.fromEntries(new URLSearchParams(i.href.split('?')[1] ?? '')))} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">{inner}</a> : <div className="flex items-center gap-3 px-4 py-3">{inner}</div>}</li>;
}

function ConflictCard({ cs }: { cs: Conflict[] }) {
  const tx = useTx();
  const why = (c: Conflict) => ({
    twoOffers: tx('عرضان تلقائيان على المنتجات نفسها: يُطبَّق الأكبر توفيرًا فقط، والآخر لا يعمل لها.', 'Two automatic offers on the same products: only the bigger saving applies; the other does nothing for them.'),
    codeReplacesOffer: tx('كود يُكتب يحلّ محل العرض التلقائي: من يستخدم الكود يخسر العرض. تأكد أن الكود أفضل.', 'A typed code replaces the automatic offer: shoppers who use the code lose the offer. Make sure the code is better.'),
    twoCodes: tx('كودان على المنتجات نفسها: العميل يختار واحدًا، وقد يقلّ هامشك أكثر مما خططت.', 'Two codes on the same products: shoppers pick one, and your margin may drop more than planned.'),
  })[c.kind];
  return (
    <Card aria-labelledby="cal-conf" className="border-red-300 dark:border-red-500/40">
      <CardHeader id="cal-conf" title={tx(`${cs.length} تعارض بين الخصومات`, `${cs.length} discount clash${cs.length > 1 ? 'es' : ''}`)} hint={tx('خصمان يطبَّقان على المنتجات نفسها في الأيام نفسها. المسودات تُحسب كخطط.', 'Two discounts on the same products on the same days. Drafts count as plans.')} />
      <ul className="divide-y divide-border border-t border-border">
        {cs.map((c, k) => (
          <li key={k} className="flex flex-wrap items-start gap-3 px-5 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-fg"><bdi dir="ltr" className="font-mono">{c.a.title.en}</bdi>{tx('و', '&')}<bdi dir="ltr" className="font-mono">{c.b.title.en}</bdi>{c.planned && <Badge tone="gray">{tx('مخطط', 'Planned')}</Badge>}<span className="text-xs font-normal text-muted tabular-nums" dir="ltr">{c.from} → {c.to}</span></p>
              <p className="text-xs text-muted">{why(c)}</p>
            </div>
            <span className="flex gap-1.5">{[c.a, c.b].map((i) => i.href && <LinkButton key={i.id} size="sm" variant="secondary" href={link(i.href)}><bdi dir="ltr">{i.title.en}</bdi></LinkButton>)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DayPanel({ day, items, cs, canPlan, onPlan, onClose }: { day: string; items: CalItem[]; cs: Conflict[]; canPlan: boolean; onPlan: () => void; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const [text, setText] = useState('');
  useUnsaved(!!text.trim(), { ar: 'تذكير لم يُحفظ', en: 'Unsaved reminder' });
  const label = new Date(`${day}T12:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hijri = new Date(`${day}T12:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : 'en-GB-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' });
  const add = () => {
    const v = text.trim().slice(0, 120);
    if (!v) return;
    const id = `rm${Date.now().toString(36)}`;
    calendarStore.set((c) => ({ ...c, reminders: [...c.reminders, { id, day, text: v, done: false, by: currentActor().name, at: new Date().toISOString() }] }));
    logAction('marketing', { ar: `أضاف تذكيرًا في التقويم ${day}: ${v}`, en: `Added a calendar reminder on ${day}: ${v}` });
    setText('');
    toast({ tone: 'ok', text: tx('أُضيف التذكير', 'Reminder added'), action: { label: tx('تراجع', 'Undo'), run: () => calendarStore.set((c) => ({ ...c, reminders: c.reminders.filter((r) => r.id !== id) })) } });
  };
  return (
    <Card aria-labelledby="cal-day">
      <CardHeader id="cal-day" title={label} hint={hijri} action={<Button size="sm" variant="ghost" onClick={onClose}>{tx('إغلاق', 'Close')}</Button>} />
      {cs.length > 0 && <div className="px-5 pb-3"><Alert tone="bad">{tx(`${cs.length} تعارض في هذا اليوم`, `${cs.length} clash${cs.length > 1 ? 'es' : ''} on this day`)}</Alert></div>}
      {items.length ? <ul className="divide-y divide-border border-t border-border">{items.map((i) => <AgendaRow key={i.id} i={i} clash={cs.some((c) => c.a.id === i.id || c.b.id === i.id)} />)}</ul>
        : <p className="border-t border-border px-5 py-4 text-sm text-muted">{tx('لا شيء في هذا اليوم.', 'Nothing on this day.')}</p>}
      {canPlan && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border px-5 py-4">
          <form className="flex min-w-0 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <Input aria-label={tx('تذكير لهذا اليوم', 'Reminder for this day')} placeholder={tx('تذكير لهذا اليوم…', 'Reminder for this day…')} value={text} maxLength={120} dir="auto" onChange={(e) => setText(e.target.value)} className="min-w-0 flex-1" />
            <Button type="submit" variant="secondary" disabled={!text.trim()}><BellRing className="size-4" aria-hidden="true" />{tx('أضف', 'Add')}</Button>
          </form>
          <Button onClick={onPlan}><Plus className="size-4" aria-hidden="true" />{tx('خطّط حملة من هذا اليوم', 'Plan a campaign from this day')}</Button>
        </div>
      )}
      <p className="border-t border-border px-5 py-3 text-xs text-muted">{tx('التذكيرات تظهر في التقويم لفريقك؛ لا تُرسل إشعارات في هذه النسخة.', 'Reminders show on the calendar for your team; no notifications are sent in this preview.')}</p>
    </Card>
  );
}

const PIECES: PlanPiece[] = ['coupon', 'landing', 'announcement', 'reminder'];

function PlanDialog({ day, today, onClose }: { day: string; today: string; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const coupons = couponsStore.use();
  const sug = suggestPlan(day, today);
  const [name, setName] = useState(sug.name[lang] || '');
  const [start, setStart] = useState(sug.start);
  const [end, setEnd] = useState(sug.end);
  const [pieces, setPieces] = useState<PlanPiece[]>(['coupon', 'landing', 'reminder']);
  const [code, setCode] = useState(codeFor(sug.name.en || 'SALE', sug.start));
  const [pct, setPct] = useState('10');
  const [tried, setTried] = useState(false);
  useUnsaved(true, { ar: 'خطة حملة لم تُنشأ', en: 'Campaign plan not created' });
  const errs = planErrors({ name, start, end, pieces }, today);
  const cErr = pieces.includes('coupon') ? codeIssue(code, coupons.map((c) => c.code)) : null;
  const pErr = pieces.includes('coupon') && pctValue(pct) === null;
  const clash = pieces.includes('coupon') ? conflicts([...couponItems(coupons, addDays(today, 400)), { id: 'cp:new', kind: 'coupon', title: { ar: code, en: code }, start, end, planned: true, scope: { kind: 'all', ids: [] } }], () => undefined).filter((c) => c.a.id === 'cp:new' || c.b.id === 'cp:new') : [];
  const reminderDay = addDays(start, -7) < today ? today : addDays(start, -7);
  const pieceText = (k: PlanPiece) => ({
    coupon: tx(`كوبون مسودة ${code} بخصم ${pctValue(pct) ?? '—'}٪ من ${start} إلى ${end} (لا يعمل حتى تفعّله)`, `Draft coupon ${code}, ${pctValue(pct) ?? '—'}% off, ${start} to ${end} (inactive until you activate it)`),
    landing: tx(`صفحة هبوط مسودة «${name || '…'}» بنفس الفترة${pieces.includes('coupon') ? ' مرتبطة بالكوبون' : ''}`, `Draft landing page “${name || '…'}” for the same dates${pieces.includes('coupon') ? ', linked to the coupon' : ''}`),
    announcement: tx(`شريط الإعلان في مسودة المتجر يعرض «${name || '…'}» من ${start} إلى ${end} (ينشر مع الثيم)`, `The store draft’s announcement bar shows “${name || '…'}” from ${start} to ${end} (goes live with the theme)`),
    reminder: tx(`تذكير في التقويم ${reminderDay}: «راجع تجهيز ${name || '…'}»`, `Calendar reminder on ${reminderDay}: “Check ${name || '…'} is ready”`),
    post: '',
  })[k];
  const create = () => {
    setTried(true);
    if (errs.length || cErr || pErr) return;
    const who = currentActor().name;
    const at = new Date().toISOString();
    const prev = { coupons: couponsStore.get(), landing: landingStore.get(), theme: themeStore.get(), cal: calendarStore.get() };
    const made: { kind: PlanPiece; ref?: string }[] = [];
    if (pieces.includes('coupon')) {
      couponsStore.set((l) => [...l, { code, type: 'percent', value: pctValue(pct)!, minSpend: 0, limitTotal: null, limitPerCustomer: 1, used: 0, starts: start, ends: end, status: 'draft' }]);
      made.push({ kind: 'coupon', ref: code });
    }
    if (pieces.includes('landing')) {
      const p = newLanding(landingStore.get(), at, who, { name, start: `${start}T00:00`, end: `${addDays(end, 1)}T00:00`, link: pieces.includes('coupon') ? { kind: 'coupon', code } : { kind: 'none' } });
      p.draft.blocks = p.draft.blocks.map((b) => (b.kind === 'hero' ? { ...b, heading: { ar: name, en: name } } : b));
      landingStore.set((l) => [...l, p]);
      made.push({ kind: 'landing', ref: p.id });
    }
    if (pieces.includes('announcement')) {
      const ann = themeStore.get().draft.find((x) => x.kind === 'announcement');
      if (ann) { themeStore.set((t) => updateSection(t, ann.id, { heading: name.slice(0, 60), start, end })); made.push({ kind: 'announcement', ref: ann.id }); }
    }
    const id = `pl${Date.now().toString(36)}`;
    calendarStore.set((c) => ({
      plans: [...c.plans, { id, name, start, end, occasion: sug.occasion?.id, pieces: made, by: who, at }],
      reminders: pieces.includes('reminder') ? [...c.reminders, { id: `rm${Date.now().toString(36)}`, day: reminderDay, text: lang === 'ar' ? `راجع تجهيز ${name}` : `Check ${name} is ready`, done: false, by: who, at }] : c.reminders,
    }));
    logAction('marketing', { ar: `خطط حملة «${name}» (${start} → ${end}): ${made.map((x) => x.kind).join('، ')}`, en: `Planned campaign “${name}” (${start} → ${end}): ${made.map((x) => x.kind).join(', ')}` }, { target: name });
    toast({ tone: 'ok', text: tx('أُنشئت الخطة ومسوداتها', 'Plan and its drafts created'), action: { label: tx('تراجع', 'Undo'), run: () => { couponsStore.set(prev.coupons); landingStore.set(prev.landing); themeStore.set(prev.theme); calendarStore.set(prev.cal); } } });
    onClose();
  };
  return (
    <Modal size="lg" title={tx('خطّط حملة', 'Plan a campaign')} onClose={onClose} description={sug.occasion ? tx(`${sug.occasion.name.ar}: ${sug.occasion.idea.ar}`, `${sug.occasion.name.en}: ${sug.occasion.idea.en}`) : tx('كل ما تختاره يُنشأ كمسودة؛ لا يرى العميل شيئًا قبل أن تنشره.', 'Everything you pick is created as a draft; shoppers see nothing until you publish it.')}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={create}>{tx(`أنشئ ${pieces.length} مسودات`, `Create ${pieces.length} drafts`)}</Button></>}>
      <Field label={tx('اسم الحملة', 'Campaign name')} error={tried && errs.includes('name') ? tx(`مطلوب، حتى ${NAME_MAX} حرفًا`, `Required, up to ${NAME_MAX} characters`) : null}>{(f) => <Input {...f} value={name} dir="auto" onChange={(e) => setName(e.target.value)} />}</Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tx('من', 'From')}>{(f) => <Input {...f} type="date" dir="ltr" value={start} min={today} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label={tx('إلى', 'To')} error={tried && (errs.includes('dates') || errs.includes('past')) ? tx('النهاية بعد البداية وليست في الماضي', 'End after the start, not in the past') : null}>{(f) => <Input {...f} type="date" dir="ltr" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />}</Field>
      </div>
      {sug.occasion?.approx && <Alert tone="info">{tx('تاريخ المناسبة تقديري ويتغير برؤية الهلال؛ أبقِ يومًا احتياطيًا.', 'The occasion date is an estimate and moves with the moon sighting; keep a spare day.')}</Alert>}
      <fieldset className="space-y-2">
        <legend className="mb-1 text-[13px] font-semibold text-fg">{tx('ما يُنشأ معًا', 'What gets created together')}</legend>
        {PIECES.map((k) => (
          <label key={k} className="flex items-start gap-3 rounded-xl border border-border p-3">
            <Checkbox checked={pieces.includes(k)} label={k} onChange={(on) => setPieces((p) => (on ? [...p, k] : p.filter((x) => x !== k)))} />
            <span className="min-w-0 flex-1 text-sm text-fg">{pieceText(k)}</span>
          </label>
        ))}
        {tried && errs.includes('pieces') && <p className="text-xs font-medium text-red-600 dark:text-red-400">{tx('اختر شيئًا واحدًا على الأقل', 'Pick at least one')}</p>}
      </fieldset>
      {pieces.includes('coupon') && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tx('كود الكوبون', 'Coupon code')} error={cErr ? (cErr === 'taken' ? tx('مستخدم', 'Already used') : tx('3–16 حرفًا إنجليزيًا كبيرًا أو رقمًا', '3–16 capital letters or digits')) : null}>{(f) => <Input {...f} dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))} />}</Field>
          <Field label={tx('نسبة الخصم ٪', 'Percent off')} error={pErr ? tx('رقم صحيح من 1 إلى 90', 'A whole number 1–90') : null}>{(f) => <Input {...f} inputMode="numeric" dir="ltr" value={pct} onChange={(e) => setPct(e.target.value)} />}</Field>
        </div>
      )}
      {clash.length > 0 && <Alert tone="warn" title={tx('سيتعارض مع خصومات قائمة', 'It will clash with existing discounts')}>{clash.map((c) => (c.a.id === 'cp:new' ? c.b : c.a).title.en).join('، ')} · {tx('الكوبون الجديد يشمل كل المنتجات؛ ضيّق نطاقه من التسويق.', 'The new coupon covers every product; narrow it in Marketing.')}</Alert>}
      <Simulated />
    </Modal>
  );
}

