// Announcements (`#/admin/announcements`, `/new?step=`): in-app updates and maintenance notices to merchants.
// Compose → audience (recipient count, suspended excluded) → preview → schedule. Simulated: nothing is ever sent.
import { useState } from 'react';
import { CalendarClock, Check, Megaphone, Users, Wrench } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { navigate } from '../../../core/router';
import { Alert, Checkbox, Field, Input, Modal, PageHeader, Simulated, Textarea, useToast } from '../../../ds/kit';
import { Badge, Button, Card, CardHeader, EmptyState, LinkButton, Segmented, cn, useTx } from '../../../ds/ui';
import { audienceStores, can, PLAN_NAME, PLANS, validateAnnouncement, type Announcement, type AnnouncementDraft, type ErrorCode } from '../domain';
import { ERR } from '../i18n';
import { announcementsStore, cancelAnnouncement, draftStore, scheduleAnnouncement, storesStore } from '../state';
import { ahref, Facts, ImpactList, Locked, ReasonModal, SimNote, StateGate, useFmt, useViewState } from '../ui';
import type { ScreenProps } from '../index';

const NOW_LOCAL = '2026-11-24T09:30'; // fixture "now" in Riyadh time, matching DATA_AS_OF
type Step = 'compose' | 'audience' | 'preview' | 'schedule';
const STEPS: Step[] = ['compose', 'audience', 'preview', 'schedule'];
const fmtLocal = (v: string) => v.replace('T', ' ');

export default function Announcements(p: ScreenProps) {
  return p.route.path[0] === 'new' ? <Composer {...p} /> : <List {...p} />;
}

function List({ role }: ScreenProps) {
  const tx = useTx();
  const { lang } = useLang();
  const f = useFmt();
  const toast = useToast();
  const state = useViewState();
  const stored = announcementsStore.use();
  const list = state === 'empty' ? [] : stored;
  const stores = storesStore.use();
  const [cancelling, setCancelling] = useState<Announcement | null>(null);
  const may = can(role, 'announce.schedule');
  const header = <PageHeader title={tx('الإعلانات التشغيلية', 'Announcements')} description={tx('تحديثات وإشعارات صيانة داخل لوحة التاجر', 'Updates and maintenance notices inside the merchant dashboard')}
    actions={may ? <LinkButton href={ahref('announcements/new')} className="bg-brand-gradient hover:opacity-95"><Megaphone className="size-4" aria-hidden="true" />{tx('إعلان جديد', 'New announcement')}</LinkButton> : undefined} />;
  if (state === 'loading' || state === 'error') return <StateGate state={state} header={header} what={{ ar: 'الإعلانات', en: 'Announcements' }} refCode="SIM-ADM-NTF-503" kind="cards" />;
  const aud = (a: Announcement) => a.audience.type === 'all' ? tx('كل المتاجر', 'All stores') : a.audience.type === 'plans' ? `${tx('حسب الخطة', 'By plan')}: ${a.audience.plans.map((p) => PLAN_NAME[p]).join('، ')}` : tx('متاجر محددة', 'Selected stores');
  return (
    <div className="space-y-6">
      {header}
      {!may && <Locked>{tx('دورك يعرض الإعلانات ولا يجدولها.', 'Your role can view announcements but not schedule them.')}</Locked>}
      {list.length === 0 ? (
        <Card><EmptyState as="h2" icon={<Megaphone className="size-6" />} title={tx('لا إعلانات بعد', 'No announcements yet')} action={may ? <LinkButton href={ahref('announcements/new')}>{tx('أنشئ إعلانًا', 'Create one')}</LinkButton> : undefined}>
          {tx('أعلن عن تحديث أو صيانة لكل المتاجر أو لخطة أو لمتاجر محددة.', 'Announce an update or maintenance to all stores, a plan or selected stores.')}
        </EmptyState></Card>
      ) : (
        <ul className="space-y-4">
          {list.map((a) => (
            <li key={a.id}>
              <Card>
                <div className="flex flex-wrap items-start gap-3 px-5 pt-5">
                  <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', a.kind === 'maintenance' ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300' : 'bg-brand-500/10 text-brand-600 dark:text-brand-300')} aria-hidden="true">{a.kind === 'maintenance' ? <Wrench className="size-5" /> : <Megaphone className="size-5" />}</span>
                  <div className="min-w-0 flex-1 basis-48">
                    <h2 className="text-[15px] font-semibold text-fg">{a.title[lang]}</h2>
                    <p className="mt-1 text-sm text-muted">{a.body[lang]}</p>
                  </div>
                  <div className="flex items-center gap-2"><Simulated /><Badge tone={a.status === 'scheduled' ? 'sky' : 'gray'}>{a.status === 'scheduled' ? tx('مجدول', 'Scheduled') : tx('ملغى', 'Cancelled')}</Badge></div>
                </div>
                <div className="px-5 py-4">
                  <Facts cols={3} items={[
                    { label: tx('الجمهور', 'Audience'), value: `${aud(a)} · ${tx(`${audienceStores(stores, a.audience).length} متجر`, `${audienceStores(stores, a.audience).length} stores`)}` },
                    { label: a.kind === 'maintenance' ? tx('نافذة الصيانة (الرياض)', 'Window (Riyadh)') : tx('يظهر من (الرياض)', 'Shows from (Riyadh)'), value: <bdi dir="ltr">{fmtLocal(a.at)}{a.kind === 'maintenance' && ` → ${fmtLocal(a.windowEnd).slice(11)}`}</bdi> },
                    { label: tx('أُنشئ', 'Created'), value: f.dt(a.created) },
                  ]} />
                </div>
                {may && a.status === 'scheduled' && <div className="border-t border-border px-5 py-3"><Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400" onClick={() => setCancelling(a)}>{tx('ألغِ الإعلان', 'Cancel announcement')}</Button></div>}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {cancelling && (
        <ReasonModal title={tx('إلغاء إعلان مجدول', 'Cancel scheduled announcement')} confirmLabel={tx('ألغِ الإعلان', 'Cancel announcement')} danger onClose={() => setCancelling(null)}
          target={<p className="font-semibold text-fg">{cancelling.title[lang]}</p>}
          onConfirm={(r) => { cancelAnnouncement(cancelling.id, r); toast({ tone: 'ok', text: tx('أُلغي الإعلان', 'Announcement cancelled') }); return null; }}>
          <ImpactList items={[{ icon: <Megaphone />, text: tx('لن يظهر للتجار. لا يمكن التراجع؛ أنشئ إعلانًا جديدًا عند الحاجة.', 'It will not show to merchants. This cannot be undone; create a new one if needed.'), tone: 'warn' }]} />
        </ReasonModal>
      )}
    </div>
  );
}

function Composer({ role, route }: ScreenProps) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const d = draftStore.use();
  const stores = storesStore.use();
  const q = route.query.get('step') as Step | null;
  const step: Step = q && STEPS.includes(q) ? q : 'compose';
  const [errors, setErrors] = useState<ErrorCode[]>([]);
  const [confirm, setConfirm] = useState(false);
  const back = { href: ahref('announcements'), label: tx('الإعلانات', 'Announcements') };
  if (!can(role, 'announce.schedule')) return (
    <div className="space-y-6"><PageHeader title={tx('إعلان جديد', 'New announcement')} back={back} />
      <Card><EmptyState as="h2" title={tx('دورك لا يجدول الإعلانات', 'Your role cannot schedule announcements')} action={<LinkButton variant="secondary" href={back.href}>{back.label}</LinkButton>}>{tx('الجدولة للعمليات أو المالك.', 'Operations or Owner schedule them.')}</EmptyState></Card>
    </div>
  );

  const set = (patch: Partial<AnnouncementDraft>) => { draftStore.set((x) => ({ ...x, ...patch })); if (errors.length) setErrors([]); };
  const recipients = audienceStores(stores, d.audience);
  const all = validateAnnouncement(d, stores, NOW_LOCAL);
  const stepErrors: Record<Step, ErrorCode[]> = {
    compose: all.filter((e) => e === 'titleRequired' || e === 'bodyRequired'), audience: all.filter((e) => e === 'audienceEmpty'), preview: [], schedule: all,
  };
  const go = (s: Step) => { setErrors([]); navigate(ahref('announcements/new', { step: s === 'compose' ? undefined : s })); };
  const next = () => {
    const e = stepErrors[step];
    if (e.length) { setErrors(e); return; }
    if (step === 'schedule') { setConfirm(true); return; }
    go(STEPS[STEPS.indexOf(step) + 1]);
  };
  const label: Record<Step, string> = { compose: tx('المحتوى', 'Compose'), audience: tx('الجمهور', 'Audience'), preview: tx('المعاينة', 'Preview'), schedule: tx('الموعد', 'Schedule') };
  const err = (c: ErrorCode) => (errors.includes(c) ? ERR[c][lang] : null);
  const idx = STEPS.indexOf(step);

  return (
    <div className="space-y-6">
      <PageHeader title={tx('إعلان جديد', 'New announcement')} back={back} meta={<><Simulated /><span className="text-xs text-muted">{tx('المسودة محفوظة أثناء التنقل بين الخطوات', 'The draft is kept as you move between steps')}</span></>} />
      <ol className="flex flex-wrap gap-2" aria-label={tx('الخطوات', 'Steps')}>
        {STEPS.map((s, i) => (
          <li key={s}>
            <a href={ahref('announcements/new', { step: s === 'compose' ? undefined : s })} aria-current={s === step ? 'step' : undefined}
              className={cn('inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold transition-colors', s === step ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-border bg-surface text-muted hover:text-fg')}>
              <span className={cn('grid size-5 place-items-center rounded-full text-[11px]', i < idx ? 'bg-emerald-500 text-white' : s === step ? 'bg-brand-600 text-white' : 'bg-surface-2')}>{i < idx ? <Check className="size-3" aria-hidden="true" /> : i + 1}</span>{label[s]}
            </a>
          </li>
        ))}
      </ol>

      <Card className="max-w-3xl">
        <CardHeader title={label[step]} action={<span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted"><Users className="size-4" aria-hidden="true" />{tx(`${recipients.length} متجر`, `${recipients.length} stores`)}</span>} />
        <div className="space-y-5 px-5 pb-5">
          {errors.length > 0 && step !== 'compose' && step !== 'schedule' && <Alert tone="bad">{errors.map((e) => ERR[e][lang]).join(' ')}</Alert>}

          {step === 'compose' && (
            <>
              <div className="space-y-2"><p className="text-[13px] font-semibold text-fg">{tx('النوع', 'Type')}</p>
                <Segmented label={tx('النوع', 'Type')} value={d.kind} onChange={(v) => set({ kind: v })} options={[{ value: 'update', label: tx('تحديث للمنصة', 'Platform update') }, { value: 'maintenance', label: tx('إشعار صيانة', 'Maintenance notice') }]} /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={tx('العنوان بالعربية', 'Title (Arabic)')} error={!d.title.ar.trim() ? err('titleRequired') : null}>{(p) => <Input {...p} dir="rtl" lang="ar" value={d.title.ar} onChange={(e) => set({ title: { ...d.title, ar: e.target.value } })} />}</Field>
                <Field label={tx('العنوان بالإنجليزية', 'Title (English)')} error={!d.title.en.trim() ? err('titleRequired') : null}>{(p) => <Input {...p} dir="ltr" lang="en" value={d.title.en} onChange={(e) => set({ title: { ...d.title, en: e.target.value } })} />}</Field>
                <Field label={tx('النص بالعربية', 'Message (Arabic)')} error={!d.body.ar.trim() ? err('bodyRequired') : null}>{(p) => <Textarea {...p} dir="rtl" lang="ar" value={d.body.ar} onChange={(e) => set({ body: { ...d.body, ar: e.target.value } })} />}</Field>
                <Field label={tx('النص بالإنجليزية', 'Message (English)')} error={!d.body.en.trim() ? err('bodyRequired') : null}>{(p) => <Textarea {...p} dir="ltr" lang="en" value={d.body.en} onChange={(e) => set({ body: { ...d.body, en: e.target.value } })} />}</Field>
              </div>
            </>
          )}

          {step === 'audience' && (
            <>
              <Segmented label={tx('الجمهور', 'Audience')} value={d.audience.type} onChange={(v) => set({ audience: { ...d.audience, type: v } })}
                options={[{ value: 'all', label: tx('كل المتاجر', 'All stores') }, { value: 'plans', label: tx('حسب الخطة', 'By plan') }, { value: 'stores', label: tx('متاجر محددة', 'Selected stores') }]} />
              {d.audience.type === 'plans' && (
                <fieldset className="flex flex-wrap gap-2"><legend className="sr-only">{tx('الخطط', 'Plans')}</legend>
                  {PLANS.map((p) => (
                    <label key={p} className={cn('inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm', d.audience.plans.includes(p) ? 'border-brand-300 bg-brand-500/5' : 'border-border')}>
                      <Checkbox label={PLAN_NAME[p]} checked={d.audience.plans.includes(p)} onChange={(on) => set({ audience: { ...d.audience, plans: on ? [...d.audience.plans, p] : d.audience.plans.filter((x) => x !== p) } })} /><bdi>{PLAN_NAME[p]}</bdi>
                    </label>
                  ))}
                </fieldset>
              )}
              {d.audience.type === 'stores' && (
                <fieldset><legend className="sr-only">{tx('المتاجر', 'Stores')}</legend>
                  <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                    {stores.filter((s) => s.status !== 'suspended').map((s) => (
                      <li key={s.id}><label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-surface-2/60">
                        <Checkbox label={s.name[lang]} checked={d.audience.storeIds.includes(s.id)} onChange={(on) => set({ audience: { ...d.audience, storeIds: on ? [...d.audience.storeIds, s.id] : d.audience.storeIds.filter((x) => x !== s.id) } })} />
                        <span className="min-w-0 flex-1 truncate">{s.name[lang]}</span><bdi className="text-xs text-muted">{PLAN_NAME[s.plan]}</bdi>
                      </label></li>
                    ))}
                  </ul>
                </fieldset>
              )}
              <p className="text-sm font-semibold text-fg" aria-live="polite">{tx(`${recipients.length} متجر سيرى الإعلان`, `${recipients.length} stores will see it`)} <span className="font-normal text-muted">· {tx('المتاجر المعلّقة مستبعدة', 'Suspended stores are excluded')}</span></p>
            </>
          )}

          {step === 'preview' && (
            <>
              <p className="text-xs text-muted">{tx('هكذا يظهر أعلى لوحة التاجر، بلغته.', 'How it appears at the top of the merchant dashboard, in their language.')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['ar', 'en'] as const).map((l) => (
                  <div key={l} dir={l === 'ar' ? 'rtl' : 'ltr'} lang={l} className={cn('flex gap-3 rounded-xl border px-4 py-3', d.kind === 'maintenance' ? 'border-amber-500/30 bg-amber-500/8' : 'border-sky-500/30 bg-sky-500/5')}>
                    {d.kind === 'maintenance' ? <Wrench className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" /> : <Megaphone className="mt-0.5 size-4 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden="true" />}
                    <div className="min-w-0"><p className="text-sm font-semibold text-fg">{d.title[l] || '—'}</p><p className="mt-0.5 text-[13px] text-muted">{d.body[l] || '—'}</p></div>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 'schedule' && (
            <div className="grid gap-4 sm:grid-cols-2">
              {(errors.includes('titleRequired') || errors.includes('bodyRequired') || errors.includes('audienceEmpty')) && <div className="sm:col-span-2"><Alert tone="bad">{errors.filter((e) => e !== 'scheduleInPast' && e !== 'windowInvalid').map((e) => ERR[e][lang]).join(' ')}</Alert></div>}
              <Field label={tx('يظهر من (بتوقيت الرياض)', 'Show from (Riyadh time)')} error={err('scheduleInPast')}>{(p) => <Input {...p} type="datetime-local" value={d.at} min={NOW_LOCAL} onChange={(e) => set({ at: e.target.value })} />}</Field>
              {d.kind === 'maintenance' && <Field label={tx('تنتهي الصيانة (الرياض)', 'Maintenance ends (Riyadh)')} error={err('windowInvalid')}>{(p) => <Input {...p} type="datetime-local" value={d.windowEnd} min={d.at || NOW_LOCAL} onChange={(e) => set({ windowEnd: e.target.value })} />}</Field>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4">
          {step !== 'compose' ? <Button variant="secondary" onClick={() => go(STEPS[idx - 1])}>{tx('السابق', 'Back')}</Button> : <span />}
          <Button onClick={next}>{step === 'schedule' ? <><CalendarClock className="size-4" aria-hidden="true" />{tx('راجع وجدول', 'Review and schedule')}</> : tx('التالي', 'Next')}</Button>
        </div>
      </Card>

      {confirm && (
        <Modal title={tx('جدولة الإعلان', 'Schedule announcement')} onClose={() => setConfirm(false)} footer={<>
          <Button variant="secondary" onClick={() => setConfirm(false)}>{tx('إلغاء', 'Cancel')}</Button>
          <Button onClick={() => { scheduleAnnouncement(d); toast({ tone: 'ok', text: tx('جُدول الإعلان (محاكاة)', 'Announcement scheduled (simulated)') }); navigate(ahref('announcements')); }}><CalendarClock className="size-4" aria-hidden="true" />{tx(`جدول لـ ${recipients.length} متجر`, `Schedule for ${recipients.length} stores`)}</Button>
        </>}>
          <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm"><p className="font-semibold text-fg">{d.title[lang]}</p><p className="text-xs text-muted">{d.kind === 'maintenance' ? tx('إشعار صيانة', 'Maintenance notice') : tx('تحديث للمنصة', 'Platform update')}</p></div>
          <Facts items={[
            { label: tx('الجمهور', 'Audience'), value: tx(`${recipients.length} متجر`, `${recipients.length} stores`) },
            { label: d.kind === 'maintenance' ? tx('النافذة (الرياض)', 'Window (Riyadh)') : tx('يظهر من (الرياض)', 'Shows from (Riyadh)'), value: <bdi dir="ltr">{fmtLocal(d.at)}{d.kind === 'maintenance' && ` → ${fmtLocal(d.windowEnd)}`}</bdi> },
          ]} />
          <SimNote />
        </Modal>
      )}
    </div>
  );
}
