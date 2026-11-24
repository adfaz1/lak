import { useCallback, useState } from 'react';
import { formatInt } from '../../../core/format';
import { Alert, Badge, Id, Money, PageHeader, Sim, type Tone } from '../../../core/ui';
import {
  ACCESS_MINUTES, can, filterStores, isLive, planDiff, planWarnings, PLAN_NAME, PLANS, suspensionImpact,
  type PlanChange, type PlanId, type Store, type StoreStatus,
} from '../domain';
import { entLabel, ROLE_LABEL, STORE_STATUS } from '../i18n';
import { DataList, flash, fmtDate, fmtDateTime, href, Icon, Locked, NotFound, ReasonDialog, setQuery, type Ctx } from '../kit';
import { accessStore, beginAccess, changesStore, proposePlan, reactivate, storesStore, suspend } from '../state';

export const STORE_TONE: Record<StoreStatus, Tone> = { active: 'success', onboarding: 'info', suspended: 'danger' };
const DOMAIN_TONE = { verified: 'success', pending: 'warning', failed: 'danger' } as const;

export default function Stores(p: Ctx) {
  return p.route.path[0] ? <Detail key={p.route.path[0]} {...p} id={p.route.path[0]} /> : <List {...p} />;
}

function List({ t, lang, route }: Ctx) {
  const stores = storesStore.use();
  const q = route.query.get('q') ?? '';
  const status = (route.query.get('status') ?? '') as StoreStatus | '';
  const plan = (route.query.get('plan') ?? '') as PlanId | '';
  const rows = filterStores(stores, { q, status, plan });
  const filtered = !!(q || status || plan);

  return (
    <>
      <PageHeader title={t.storesTitle} sub={t.storesSub} />
      <div className="adm-filters" role="search">
        <div className="field adm-grow-field">
          <label htmlFor="st-q">{t.search}</label>
          <input id="st-q" className="input" type="search" placeholder={t.searchStores} value={q} onChange={(e) => setQuery('/stores', route, { q: e.target.value || undefined })} />
        </div>
        <div className="field">
          <label htmlFor="st-status">{t.status}</label>
          <select id="st-status" className="input" value={status} onChange={(e) => setQuery('/stores', route, { status: e.target.value || undefined })}>
            <option value="">{t.allStatus}</option>
            {(['active', 'onboarding', 'suspended'] as StoreStatus[]).map((s) => <option key={s} value={s}>{STORE_STATUS[s][lang]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="st-plan">{t.plan}</label>
          <select id="st-plan" className="input" value={plan} onChange={(e) => setQuery('/stores', route, { plan: e.target.value || undefined })}>
            <option value="">{t.allPlans}</option>
            {PLANS.map((p) => <option key={p} value={p}>{PLAN_NAME[p]}</option>)}
          </select>
        </div>
        {filtered && <a className="btn adm-filter-clear" href={href('/stores')}>{t.clearFilters}</a>}
      </div>
      <p className="muted small" aria-live="polite">{t.results(rows.length)}</p>
      <section className="card">
        <DataList label={t.storesTitle} rows={rows} rowKey={(s) => s.id}
          empty={<><span>{t.noResults}</span><a className="btn" href={href('/stores')}>{t.clearFilters}</a></>}
          cols={[
            { key: 'name', primary: true, head: t.store, cell: (s) => (
              <a className="adm-rowlink" href={href(`/stores/${s.id}`)}><span className="strong adm-clamp">{s.name[lang]}</span><span className="muted small">{s.merchant[lang]} · <Id>{s.id}</Id></span></a>) },
            { key: 'status', head: t.status, cell: (s) => <Badge tone={STORE_TONE[s.status]}>{STORE_STATUS[s.status][lang]}</Badge> },
            { key: 'plan', head: t.plan, cell: (s) => <Id>{PLAN_NAME[s.plan]}</Id> },
            { key: 'city', head: t.city, cell: (s) => s.city[lang] },
            { key: 'gmv', head: t.gmv30, end: true, cell: (s) => <Money v={s.gmv30} /> },
            { key: 'orders', head: t.orders30, end: true, cell: (s) => formatInt(s.orders30) },
            { key: 'last', head: t.lastOrder, cell: (s) => (s.lastOrder ? fmtDate(s.lastOrder, lang) : <span className="muted">{t.never}</span>) },
          ]} />
      </section>
    </>
  );
}

type DialogKind = 'suspend' | 'reactivate' | 'access' | 'plan' | null;

function Detail({ t, lang, role, id }: Ctx & { id: string }) {
  const store = storesStore.use().find((s) => s.id === id);
  const changes = changesStore.use();
  const sessions = accessStore.use();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const close = useCallback(() => setDialog(null), []);
  if (!store) return <NotFound t={t} back={href('/stores')} backLabel={t.storesTitle} />;

  const now = Date.now();
  const live = sessions.find((s) => isLive(s, now)) ?? null;
  const liveHere = live && live.storeId === store.id ? live : null;
  const pending = changes.find((c) => c.storeId === store.id && c.status === 'pending');
  const mine = sessions.filter((s) => s.storeId === store.id);
  const suspended = store.status === 'suspended';

  return (
    <>
      <a className="back" href={href('/stores')}><Icon name="arrow" size={18} />&nbsp;{t.backTo(t.storesTitle)}</a>
      <PageHeader title={<span className="title-row"><span className="adm-clamp">{store.name[lang]}</span> <Badge tone={STORE_TONE[store.status]}>{STORE_STATUS[store.status][lang]}</Badge></span>}
        sub={<>{store.merchant[lang]} · <Id>{store.id}</Id> · {store.category[lang]} · {store.city[lang]}</>} />

      {suspended && store.suspension && (
        <Alert tone="danger" title={`${t.suspendedSince}:`}>
          {store.suspension.kind === 'temporary' ? `${t.temporary} · ${store.suspension.days} ${lang === 'ar' ? 'يوم' : 'days'}` : t.indefinite} — {' '}
          {t.suspendedBy(ROLE_LABEL[store.suspension.by][lang], fmtDateTime(store.suspension.at, lang))}. <q>{store.suspension.reason}</q>
        </Alert>
      )}

      <div className="cols">
        <div className="col-main">
          {liveHere && <SupportView t={t} lang={lang} store={store} mode={liveHere.mode} />}

          <section className="card" aria-labelledby="sd-act">
            <div className="card-head"><h2 id="sd-act">{t.activity}</h2></div>
            <div className="card-body">
              <dl className="adm-counters">
                <div><dt>{t.gmv30}</dt><dd><Money v={store.gmv30} /></dd></div>
                <div><dt>{t.orders30}</dt><dd>{formatInt(store.orders30)}</dd></div>
                <div><dt>{t.visits}</dt><dd>{formatInt(store.visits30)}</dd></div>
                <div><dt>{t.openOrders}</dt><dd>{formatInt(store.openOrders)}</dd></div>
                <div><dt>{t.errors24}</dt><dd>{formatInt(store.errors24h)}</dd></div>
                <div><dt>{t.tickets}</dt><dd>{formatInt(store.tickets)}</dd></div>
              </dl>
              <p className="muted small">{t.lastOrder}: {store.lastOrder ? fmtDate(store.lastOrder, lang) : t.never} · {t.created}: {fmtDate(store.created, lang)}</p>
            </div>
          </section>

          <section className="card" aria-labelledby="sd-dom">
            <div className="card-head"><h2 id="sd-dom">{t.domain}</h2><Badge tone={DOMAIN_TONE[store.domain.state]}>{t.domainState[store.domain.state]}</Badge></div>
            <div className="card-body">
              <dl className="adm-facts">
                <div><dt>{t.domainKind[store.domain.kind]}</dt><dd><Id>{store.domain.host}</Id></dd></div>
                <div><dt>{t.platformAddress}</dt><dd><Id>{store.platformPath}</Id></dd></div>
                <div><dt>{t.products}</dt><dd>{formatInt(store.products)}</dd></div>
                <div><dt>{t.staff}</dt><dd>{formatInt(store.staff)}</dd></div>
              </dl>
            </div>
          </section>
        </div>

        <div className="col-side">
          <section className="card" aria-labelledby="sd-plan">
            <div className="card-head"><h2 id="sd-plan">{t.planCard}</h2><span className="adm-plan-pill"><Id>{PLAN_NAME[store.plan]}</Id></span></div>
            <div className="card-body">
              {pending ? (
                <Alert tone="info" title={t.pendingChange}>
                  <Id>{PLAN_NAME[pending.from]} → {PLAN_NAME[pending.to]}</Id> · {t.proposedBy} {ROLE_LABEL[pending.proposedBy][lang]}. <a href={href('/plans', { tab: 'changes' })}>{t.open}</a>
                </Alert>
              ) : can(role, 'plans.propose')
                ? <button type="button" className="btn" onClick={() => setDialog('plan')}>{t.changePlan}</button>
                : <Locked>{t.noPropose}</Locked>}
              <p className="muted small">{t.priceTbd}</p>
            </div>
          </section>

          <section className="card" aria-labelledby="sd-ax">
            <div className="card-head"><h2 id="sd-ax">{t.accessCard}</h2></div>
            <div className="card-body">
              <p className="small">{t.accessIntro}</p>
              {!can(role, 'stores.access') ? <Locked>{t.noAccessPerm}</Locked>
                : liveHere ? null
                : live ? <Locked>{t.accessOther}</Locked>
                : <button type="button" className="btn primary" onClick={() => setDialog('access')}><Icon name="shield" size={18} />&nbsp;{t.startAccess}</button>}
              {mine.length > 0 && (
                <>
                  <h3 className="adm-h3">{t.sessionHistory}</h3>
                  <ul className="log">
                    {mine.map((s) => (
                      <li key={s.id}><span className="when muted">{fmtDateTime(s.startedAt, lang)}</span>
                        <span className="grow">{ROLE_LABEL[s.by][lang]} · {s.mode === 'read' ? t.modeRead : t.modeWrite} · {t.minutes(s.minutes)}
                          {' '}<Badge tone={isLive(s, now) ? 'info' : 'neutral'}>{isLive(s, now) ? t.bannerTitle : (s.end === 'expired' ? (lang === 'ar' ? 'انتهت المدة' : 'Expired') : (lang === 'ar' ? 'أُنهيت' : 'Ended'))}</Badge></span></li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>

          <section className="card" aria-labelledby="sd-actions">
            <div className="card-head"><h2 id="sd-actions">{t.storeActions}</h2></div>
            <div className="card-body">
              {!can(role, 'stores.suspend') ? <Locked>{t.noSuspend}</Locked>
                : suspended ? <button type="button" className="btn primary" onClick={() => setDialog('reactivate')}>{t.reactivate}</button>
                : <button type="button" className="btn adm-danger-outline" onClick={() => setDialog('suspend')}>{t.suspend}</button>}
            </div>
          </section>
        </div>
      </div>

      {dialog === 'suspend' && <SuspendDialog t={t} lang={lang} store={store} onClose={close} />}
      {dialog === 'reactivate' && (
        <ReasonDialog t={t} lang={lang} title={t.reactivateTitle} confirmLabel={t.reactivate}
          scope={<><p className="strong">{store.name[lang]} · <Id>{store.id}</Id></p><p>{t.impReactivate}</p></>}
          onConfirm={(r) => { const e = reactivate(store.id, r); if (!e) flash(`${t.reactivate}: ${store.name[lang]}`); return e; }} onClose={close} />
      )}
      {dialog === 'access' && <AccessDialog t={t} lang={lang} role={role} store={store} onClose={close} />}
      {dialog === 'plan' && <PlanDialog t={t} lang={lang} store={store} onClose={close} />}
    </>
  );
}

function SuspendDialog({ t, lang, store, onClose }: { t: Ctx['t']; lang: Ctx['lang']; store: Store; onClose: () => void }) {
  const [kind, setKind] = useState<'temporary' | 'indefinite'>('temporary');
  const [days, setDays] = useState('7');
  const imp = suspensionImpact(store);
  return (
    <ReasonDialog t={t} lang={lang} title={t.suspendTitle} confirmLabel={t.suspend} danger onClose={onClose}
      scope={<>
        <p className="strong">{store.name[lang]} · <Id>{store.id}</Id></p>
        <h3 className="adm-h3">{t.impact}</h3>
        <ul className="adm-impact">
          <li><Icon name="stores" size={18} />{t.impStorefront}</li>
          <li><Icon name="payments" size={18} />{t.impCheckout}</li>
          <li><Icon name="shipping" size={18} />{t.impOrders(imp.openOrders)}</li>
          <li><Icon name="clock" size={18} /><span>{t.impPayout} <Money v={imp.pendingPayout} /></span></li>
          <li className="adm-impact-safe"><Icon name="check" size={18} />{t.impData(imp.products)}</li>
        </ul>
      </>}
      onConfirm={(r) => { const e = suspend(store.id, { kind, days: kind === 'temporary' ? Number(days) : undefined, reason: r }); if (!e) flash(`${t.suspend}: ${store.name[lang]}`); return e; }}>
      <fieldset>
        <legend>{t.duration}</legend>
        <label className="radio"><input type="radio" name="sus-kind" checked={kind === 'temporary'} onChange={() => setKind('temporary')} />{t.temporary}</label>
        <label className="radio"><input type="radio" name="sus-kind" checked={kind === 'indefinite'} onChange={() => setKind('indefinite')} />{t.indefinite}</label>
      </fieldset>
      {kind === 'temporary' && (
        <div className="field">
          <label htmlFor="sus-days">{t.days}</label>
          <input id="sus-days" className="input" type="number" inputMode="numeric" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
      )}
    </ReasonDialog>
  );
}

function AccessDialog({ t, lang, role, store, onClose }: { t: Ctx['t']; lang: Ctx['lang']; role: Ctx['role']; store: Store; onClose: () => void }) {
  const [mode, setMode] = useState<'read' | 'write'>('read');
  const [minutes, setMinutes] = useState(15);
  const write = can(role, 'stores.accessWrite');
  return (
    <ReasonDialog t={t} lang={lang} title={t.accessTitle} confirmLabel={t.startAccess} onClose={onClose}
      scope={<><p className="strong">{store.name[lang]} · <Id>{store.id}</Id></p><p>{t.accessScope}</p></>}
      onConfirm={(r) => { const e = beginAccess({ storeId: store.id, reason: r, minutes, mode }); if (!e) flash(`${t.bannerTitle}: ${store.name[lang]}`); return e; }}>
      <fieldset>
        <legend>{t.accessMode}</legend>
        <label className="radio"><input type="radio" name="ax-mode" checked={mode === 'read'} onChange={() => setMode('read')} />{t.readOnly}</label>
        <label className="radio" aria-disabled={!write || undefined}>
          <input type="radio" name="ax-mode" checked={mode === 'write'} disabled={!write} onChange={() => setMode('write')} />{t.readWrite}
        </label>
      </fieldset>
      <div className="field">
        <label htmlFor="ax-min">{t.duration}</label>
        <select id="ax-min" className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
          {ACCESS_MINUTES.map((m) => <option key={m} value={m}>{t.minutes(m)}</option>)}
        </select>
      </div>
    </ReasonDialog>
  );
}

function PlanDialog({ t, lang, store, onClose }: { t: Ctx['t']; lang: Ctx['lang']; store: Store; onClose: () => void }) {
  const [to, setTo] = useState<PlanId>(PLANS.find((p) => p !== store.plan)!);
  const [effective, setEffective] = useState<PlanChange['effective']>('renewal');
  const diff = planDiff(store.plan, to).filter((d) => d.change !== 'same');
  const warns = planWarnings(store, to);
  return (
    <ReasonDialog t={t} lang={lang} title={t.proposeTitle} confirmLabel={t.submitProposal} onClose={onClose}
      scope={<><p className="strong">{store.name[lang]} · <Id>{store.id}</Id></p><p>{t.proposeScope}</p></>}
      onConfirm={(r) => { const e = proposePlan(store.id, to, r, effective); if (!e) flash(`${t.pendingChange}: ${store.name[lang]}`); return e; }}>
      <div className="field">
        <label htmlFor="pl-to">{t.newPlan}</label>
        <select id="pl-to" className="input" value={to} onChange={(e) => setTo(e.target.value as PlanId)}>
          {PLANS.filter((p) => p !== store.plan).map((p) => <option key={p} value={p}>{PLAN_NAME[p]}</option>)}
        </select>
      </div>
      <fieldset>
        <legend>{t.effective}</legend>
        <label className="radio"><input type="radio" name="pl-eff" checked={effective === 'renewal'} onChange={() => setEffective('renewal')} />{t.effRenewal}</label>
        <label className="radio"><input type="radio" name="pl-eff" checked={effective === 'now'} onChange={() => setEffective('now')} />{t.effNow}</label>
      </fieldset>
      <h3 className="adm-h3">{t.diff}: <Id>{PLAN_NAME[store.plan]} → {PLAN_NAME[to]}</Id></h3>
      <p className="muted small">{t.diffOnlyChanges}</p>
      <DiffList t={t} lang={lang} rows={diff} />
      {warns.length > 0 && (
        <Alert tone="warning" title={t.warnings}>
          <ul className="adm-bullets">
            {warns.map((w, i) => <li key={i}>{w.kind === 'staffOver' ? t.warnStaff(w.count!, w.limit!) : t.warnFeature(w.feature!.label[lang])}</li>)}
          </ul>
        </Alert>
      )}
      <p className="small"><Sim /> {t.costLine}</p>
    </ReasonDialog>
  );
}

export function DiffList({ t, lang, rows }: { t: Ctx['t']; lang: Ctx['lang']; rows: ReturnType<typeof planDiff> }) {
  if (rows.length === 0) return <p className="muted">{t.noChange}</p>;
  return (
    <ul className="adm-diff">
      {rows.map((d) => (
        <li key={d.feature.id} className={d.change}>
          <span className="grow">{d.feature.label[lang]}</span>
          <span className="adm-diff-vals"><s>{entLabel(d.before, lang)}</s> <span aria-hidden="true">{lang === 'ar' ? '←' : '→'}</span> <b>{entLabel(d.after, lang)}</b></span>
          <Badge tone={d.change === 'gain' ? 'success' : 'danger'}>{d.change === 'gain' ? t.gain : t.loss}</Badge>
        </li>
      ))}
    </ul>
  );
}

function SupportView({ t, lang, store, mode }: { t: Ctx['t']; lang: Ctx['lang']; store: Store; mode: 'read' | 'write' }) {
  const n = Number(store.id.replace(/\D/g, '')) || 1;
  const orders = [0, 1, 2].map((i) => ({ ref: `#${10_400 + ((n * 7 + i * 13) % 97)}`, cust: lang === 'ar' ? 'ع••• م•••' : 'A••• M•••', amount: 15_000 + ((n + i * 31) % 40) * 1_250 }));
  return (
    <section className="card adm-supportview" aria-labelledby="sv-h">
      <div className="card-head"><h2 id="sv-h"><Icon name="shield" size={18} /> {t.supportView}</h2><Badge tone="info">{mode === 'read' ? t.modeRead : t.modeWrite}</Badge></div>
      <div className="card-body">
        <p className="muted small">{t.supportViewNote}</p>
        <h3 className="adm-h3">{t.recentOrders}</h3>
        {store.orders30 === 0 ? <p className="muted">{t.never}</p> : (
          <ul className="lines">
            {orders.map((o) => <li key={o.ref}><Id>{o.ref}</Id><span className="grow">{o.cust}</span><span className="amount"><Money v={o.amount} /></span></li>)}
          </ul>
        )}
        <h3 className="adm-h3">{t.settingsSummary}</h3>
        <dl className="adm-facts">
          <div><dt>{t.plan}</dt><dd><Id>{PLAN_NAME[store.plan]}</Id></dd></div>
          <div><dt>{t.domain}</dt><dd><Id>{store.domain.host}</Id></dd></div>
          <div><dt>{t.products}</dt><dd>{formatInt(store.products)}</dd></div>
        </dl>
        <button type="button" className="btn" disabled aria-describedby="sv-why">{t.editStoreName}</button>
        <p id="sv-why" className="muted small">{mode === 'read' ? t.writeDisabled : t.writeNote}</p>
      </div>
    </section>
  );
}
