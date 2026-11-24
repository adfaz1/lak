import { useCallback, useState } from 'react';
import { navigate } from '../../../core/router';
import { Alert, Badge, Dialog, Id, PageHeader, Sim } from '../../../core/ui';
import { audienceStores, can, PLAN_NAME, PLANS, validateAnnouncement, type Announcement, type AnnouncementDraft, type ErrorCode, type PlanId } from '../domain';
import { ERR } from '../i18n';
import { flash, fmtDateTime, href, Icon, Locked, ReasonDialog, type Ctx } from '../kit';
import { announcementsStore, cancelAnnouncement, draftStore, scheduleAnnouncement, storesStore } from '../state';

const NOW_LOCAL = '2026-11-24T09:30'; // fixture "now" in Riyadh time, matching DATA_AS_OF
type Step = 'compose' | 'audience' | 'preview' | 'schedule';
const STEPS: Step[] = ['compose', 'audience', 'preview', 'schedule'];
const fmtLocal = (v: string) => v.replace('T', ' ');

export default function Announcements(p: Ctx) {
  return p.route.path[0] === 'new' ? <Composer {...p} /> : <List {...p} />;
}

function List({ t, lang, role }: Ctx) {
  const list = announcementsStore.use();
  const stores = storesStore.use();
  const [cancelling, setCancelling] = useState<Announcement | null>(null);
  const close = useCallback(() => setCancelling(null), []);
  const may = can(role, 'announce.schedule');
  const audLabel = (a: Announcement) => a.audience.type === 'all' ? t.audAll : a.audience.type === 'plans' ? `${t.audPlans}: ${a.audience.plans.map((p) => PLAN_NAME[p]).join(', ')}` : t.audStores;
  return (
    <>
      <PageHeader title={t.annTitle} sub={t.annSub}
        actions={may ? <a className="btn primary" href={href('/announcements/new')}>{t.newAnn}</a> : undefined} />
      {!may && <Locked>{t.noSchedule}</Locked>}
      {list.length === 0 ? <div className="card"><div className="empty">{t.annEmpty}</div></div> : (
        <ul className="adm-cards">
          {list.map((a) => (
            <li key={a.id} className="card">
              <div className="card-head">
                <h2>{a.title[lang]}</h2>
                <span className="actions"><Sim /><Badge tone={a.status === 'scheduled' ? 'info' : 'neutral'}>{a.status === 'scheduled' ? t.scheduled : t.cancelled}</Badge></span>
              </div>
              <div className="card-body">
                <p>{a.body[lang]}</p>
                <dl className="adm-facts">
                  <div><dt>{t.annKind}</dt><dd>{a.kind === 'update' ? t.kindUpdate : t.kindMaintenance}</dd></div>
                  <div><dt>{t.audience}</dt><dd>{audLabel(a)} · {t.recipients(audienceStores(stores, a.audience).length)}</dd></div>
                  <div><dt>{a.kind === 'maintenance' ? t.maintenanceWindow : t.startAt}</dt><dd><bdi dir="ltr">{fmtLocal(a.at)}{a.kind === 'maintenance' && ` → ${fmtLocal(a.windowEnd).slice(11)}`}</bdi> ({t.riyadh})</dd></div>
                  <div><dt>{t.by}</dt><dd>{fmtDateTime(a.created, lang)}</dd></div>
                </dl>
                {may && a.status === 'scheduled' && <button type="button" className="btn adm-danger-outline" onClick={() => setCancelling(a)}>{t.cancelAnn}</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {cancelling && (
        <ReasonDialog t={t} lang={lang} title={t.cancelAnnTitle} confirmLabel={t.cancelAnn} danger onClose={close}
          scope={<><p className="strong">{cancelling.title[lang]}</p><p>{t.cancelAnnScope}</p></>}
          onConfirm={(r) => { cancelAnnouncement(cancelling.id, r); flash(`${t.cancelAnn}: ${cancelling.title[lang]}`); return null; }} />
      )}
    </>
  );
}

function Composer({ t, lang, role, route }: Ctx) {
  const d = draftStore.use();
  const stores = storesStore.use();
  const q = route.query.get('step') as Step | null;
  const step: Step = q && STEPS.includes(q) ? q : 'compose';
  const [errors, setErrors] = useState<ErrorCode[]>([]);
  const [confirm, setConfirm] = useState(false);
  const close = useCallback(() => setConfirm(false), []);
  if (!can(role, 'announce.schedule')) {
    return <><a className="back" href={href('/announcements')}>{t.backTo(t.annTitle)}</a><Locked>{t.noSchedule}</Locked></>;
  }

  const set = (patch: Partial<AnnouncementDraft>) => draftStore.set((x) => ({ ...x, ...patch }));
  const recipients = audienceStores(stores, d.audience);
  const all = validateAnnouncement(d, stores, NOW_LOCAL);
  const stepErrors: Record<Step, ErrorCode[]> = {
    compose: all.filter((e) => e === 'titleRequired' || e === 'bodyRequired'),
    audience: all.filter((e) => e === 'audienceEmpty'),
    preview: [],
    schedule: all,
  };
  const go = (s: Step) => { setErrors([]); navigate(href('/announcements/new', { step: s === 'compose' ? undefined : s })); };
  const next = () => {
    const e = stepErrors[step];
    if (e.length) { setErrors(e); return; }
    if (step === 'schedule') { setConfirm(true); return; }
    go(STEPS[STEPS.indexOf(step) + 1]);
  };
  const stepLabel: Record<Step, string> = { compose: t.stepCompose, audience: t.stepAudience, preview: t.stepPreview, schedule: t.stepSchedule };
  const err = (c: ErrorCode) => errors.includes(c);

  return (
    <>
      <a className="back" href={href('/announcements')}><Icon name="arrow" size={18} />&nbsp;{t.backTo(t.annTitle)}</a>
      <PageHeader title={t.newAnn} sub={<><Sim /> {t.annSub}</>} />
      <ol className="adm-steps" aria-label={t.steps}>
        {STEPS.map((s, i) => (
          <li key={s}><a href={href('/announcements/new', { step: s === 'compose' ? undefined : s })} aria-current={s === step ? 'step' : undefined}>
            <span className="adm-step-n">{i + 1}</span>{stepLabel[s]}</a></li>
        ))}
      </ol>

      <section className="card">
        <div className="card-body">
          {errors.length > 0 && <Alert tone="danger">{errors.map((e) => ERR[e][lang]).join(' ')}</Alert>}

          {step === 'compose' && (
            <>
              <fieldset>
                <legend>{t.annKind}</legend>
                <label className="radio"><input type="radio" name="an-kind" checked={d.kind === 'update'} onChange={() => set({ kind: 'update' })} />{t.kindUpdate}</label>
                <label className="radio"><input type="radio" name="an-kind" checked={d.kind === 'maintenance'} onChange={() => set({ kind: 'maintenance' })} />{t.kindMaintenance}</label>
              </fieldset>
              <div className="grid-2">
                <div className="field wide"><label htmlFor="an-tar">{t.titleAr}</label>
                  <input id="an-tar" dir="rtl" lang="ar" className="input" value={d.title.ar} aria-invalid={err('titleRequired') && !d.title.ar.trim() || undefined} onChange={(e) => set({ title: { ...d.title, ar: e.target.value } })} /></div>
                <div className="field wide"><label htmlFor="an-ten">{t.titleEn}</label>
                  <input id="an-ten" dir="ltr" lang="en" className="input" value={d.title.en} aria-invalid={err('titleRequired') && !d.title.en.trim() || undefined} onChange={(e) => set({ title: { ...d.title, en: e.target.value } })} /></div>
                <div className="field wide"><label htmlFor="an-bar">{t.bodyAr}</label>
                  <textarea id="an-bar" dir="rtl" lang="ar" className="input" value={d.body.ar} aria-invalid={err('bodyRequired') && !d.body.ar.trim() || undefined} onChange={(e) => set({ body: { ...d.body, ar: e.target.value } })} /></div>
                <div className="field wide"><label htmlFor="an-ben">{t.bodyEn}</label>
                  <textarea id="an-ben" dir="ltr" lang="en" className="input" value={d.body.en} aria-invalid={err('bodyRequired') && !d.body.en.trim() || undefined} onChange={(e) => set({ body: { ...d.body, en: e.target.value } })} /></div>
              </div>
            </>
          )}

          {step === 'audience' && (
            <>
              <fieldset>
                <legend>{t.audience}</legend>
                {(['all', 'plans', 'stores'] as const).map((k) => (
                  <label key={k} className="radio"><input type="radio" name="an-aud" checked={d.audience.type === k} onChange={() => set({ audience: { ...d.audience, type: k } })} />
                    {k === 'all' ? t.audAll : k === 'plans' ? t.audPlans : t.audStores}</label>
                ))}
              </fieldset>
              {d.audience.type === 'plans' && (
                <fieldset><legend>{t.plan}</legend>
                  <div className="adm-checkgrid">{PLANS.map((p) => (
                    <label key={p} className="check"><input type="checkbox" checked={d.audience.plans.includes(p)}
                      onChange={(e) => set({ audience: { ...d.audience, plans: e.target.checked ? [...d.audience.plans, p] : d.audience.plans.filter((x: PlanId) => x !== p) } })} /><Id>{PLAN_NAME[p]}</Id></label>
                  ))}</div>
                </fieldset>
              )}
              {d.audience.type === 'stores' && (
                <fieldset><legend>{t.audStores}</legend>
                  <div className="adm-checkgrid">{stores.filter((s) => s.status !== 'suspended').map((s) => (
                    <label key={s.id} className="check"><input type="checkbox" checked={d.audience.storeIds.includes(s.id)}
                      onChange={(e) => set({ audience: { ...d.audience, storeIds: e.target.checked ? [...d.audience.storeIds, s.id] : d.audience.storeIds.filter((x) => x !== s.id) } })} /><span className="adm-clamp">{s.name[lang]}</span></label>
                  ))}</div>
                </fieldset>
              )}
              <p className="strong" aria-live="polite">{t.recipients(recipients.length)} <span className="muted small">· {t.recipientsNote}</span></p>
            </>
          )}

          {step === 'preview' && (
            <>
              <p className="muted small">{t.previewNote}</p>
              <div className="grid-2">
                {(['ar', 'en'] as const).map((l) => (
                  <div key={l} className={`adm-preview ${d.kind}`} dir={l === 'ar' ? 'rtl' : 'ltr'} lang={l}>
                    <Icon name={d.kind === 'maintenance' ? 'clock' : 'announcements'} size={20} />
                    <div className="grow">
                      <p className="strong">{d.title[l] || '—'}</p>
                      <p className="small">{d.body[l] || '—'}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="small">{t.audience}: {t.recipients(recipients.length)}</p>
            </>
          )}

          {step === 'schedule' && (
            <div className="grid-2">
              <div className="field wide"><label htmlFor="an-at">{t.startAt}</label>
                <input id="an-at" type="datetime-local" className="input" value={d.at} min={NOW_LOCAL} aria-invalid={err('scheduleInPast') || undefined} onChange={(e) => set({ at: e.target.value })} /></div>
              {d.kind === 'maintenance' && (
                <div className="field wide"><label htmlFor="an-end">{t.windowEnd}</label>
                  <input id="an-end" type="datetime-local" className="input" value={d.windowEnd} min={d.at || NOW_LOCAL} aria-invalid={err('windowInvalid') || undefined} onChange={(e) => set({ windowEnd: e.target.value })} /></div>
              )}
            </div>
          )}

          <div className="actions adm-step-actions">
            {step !== 'compose' && <button type="button" className="btn" onClick={() => go(STEPS[STEPS.indexOf(step) - 1])}>{t.back}</button>}
            <button type="button" className="btn primary" onClick={next}>{step === 'schedule' ? t.scheduleBtn : t.next}</button>
          </div>
          <p className="muted small">{t.draftKept}</p>
        </div>
      </section>

      {confirm && (
        <Dialog title={t.scheduleTitle} onClose={close} footer={<>
          <button type="button" className="btn" onClick={close}>{t.cancel}</button>
          <button type="button" className="btn primary" onClick={() => { scheduleAnnouncement(d); flash(`${t.scheduled}: ${d.title[lang]}`, 'announcements'); navigate(href('/announcements')); }}>{t.scheduleBtn}</button>
        </>}>
          <p className="strong">{d.title[lang]}</p>
          <p>{t.scheduleScope(recipients.length, fmtLocal(d.at))}</p>
          {d.kind === 'maintenance' && <p>{t.maintenanceWindow}: <bdi dir="ltr">{fmtLocal(d.at)} → {fmtLocal(d.windowEnd)}</bdi></p>}
          <p className="small"><Sim /> {t.simData}</p>
        </Dialog>
      )}
    </>
  );
}
