import { useCallback, useState } from 'react';
import { Alert, Badge, Id, LinkTabs, PageHeader, type Tone } from '../../../core/ui';
import { can, docsComplete, PLAN_NAME, type Application, type KycDecision, type KycStatus } from '../domain';
import { DOC, DOC_STATE, ENTITY, KYC_STATUS, ROLE_LABEL, ROLE_PERSON } from '../i18n';
import { DataList, flash, fmtDateTime, href, Icon, Locked, NotFound, ReasonDialog, setQuery, withQuery, type Ctx } from '../kit';
import { kycDecide, kycStore, logDocView, roleStore } from '../state';

export const KYC_TONE: Record<KycStatus, Tone> = { pending: 'warning', info: 'info', approved: 'success', rejected: 'danger' };
const DOC_TONE = { ok: 'success', missing: 'danger', expired: 'danger', unreadable: 'warning' } as const;

export default function Kyc(p: Ctx) {
  return p.route.path[0] ? <Detail key={p.route.path[0]} {...p} id={p.route.path[0]} /> : <Queue {...p} />;
}

function Queue({ t, lang, route }: Ctx) {
  const apps = kycStore.use();
  const status = (route.query.get('status') ?? '') as KycStatus | '';
  const q = route.query.get('q') ?? '';
  const ql = q.trim().toLowerCase();
  const rows = apps
    .filter((a) => (!status || a.status === status) && (!ql || [a.id, a.store.ar, a.store.en, a.merchant.ar, a.merchant.en].some((x) => x.toLowerCase().includes(ql))))
    .sort((a, b) => a.submitted.localeCompare(b.submitted));
  const statuses: (KycStatus | '')[] = ['', 'pending', 'info', 'approved', 'rejected'];

  return (
    <>
      <PageHeader title={t.kycTitle} sub={t.kycSub} />
      <div className="toolbar">
        <LinkTabs label={t.status} items={statuses.map((s) => ({
          href: withQuery('/kyc', route, { status: s || undefined }), current: s === status,
          label: <>{s ? KYC_STATUS[s][lang] : t.all} <span className="adm-chip-n">{apps.filter((a) => !s || a.status === s).length}</span></>,
        }))} />
        <div className="field adm-search">
          <label htmlFor="kyc-q" className="sr">{t.search}</label>
          <input id="kyc-q" className="input" type="search" placeholder={t.search} value={q} onChange={(e) => setQuery('/kyc', route, { q: e.target.value || undefined })} />
        </div>
      </div>
      <p className="muted small" aria-live="polite">{t.results(rows.length)}</p>
      <section className="card">
        <DataList label={t.kycTitle} rows={rows} rowKey={(a) => a.id}
          empty={<><span>{t.noResults}</span><a className="btn" href={href('/kyc')}>{t.clearFilters}</a></>}
          cols={[
            { key: 'store', primary: true, head: t.store, cell: (a) => (
              <a className="adm-rowlink" href={href(`/kyc/${a.id}`)}><span className="strong">{a.store[lang]}</span><span className="muted small">{a.merchant[lang]} · <Id>{a.id}</Id></span></a>) },
            { key: 'type', head: t.type, cell: (a) => ENTITY[a.type][lang] },
            { key: 'city', head: t.city, cell: (a) => a.city[lang] },
            { key: 'plan', head: t.requestedPlan, cell: (a) => <Id>{PLAN_NAME[a.plan]}</Id> },
            { key: 'sub', head: t.submitted, cell: (a) => fmtDateTime(a.submitted, lang) },
            { key: 'docs', head: t.docs, cell: (a) => <Badge tone={docsComplete(a) ? 'success' : 'warning'}>{t.docsOk(a.docs.filter((d) => d.state === 'ok').length, a.docs.length)}</Badge> },
            { key: 'status', head: t.status, cell: (a) => <Badge tone={KYC_TONE[a.status]}>{KYC_STATUS[a.status][lang]}</Badge> },
          ]} />
      </section>
    </>
  );
}

function Detail({ t, lang, role, id }: Ctx & { id: string }) {
  const app = kycStore.use().find((a) => a.id === id);
  const [dialog, setDialog] = useState<KycDecision | null>(null);
  const [openDoc, setOpenDoc] = useState<number | null>(null);
  const close = useCallback(() => setDialog(null), []);
  if (!app) return <NotFound t={t} back={href('/kyc')} backLabel={t.kycTitle} />;

  const decided = app.status === 'approved' || app.status === 'rejected';
  const mayDecide = can(role, 'kyc.decide');
  const mayDocs = can(role, 'kyc.docs');
  const complete = docsComplete(app);
  const titles: Record<KycDecision, string> = { approve: t.approveTitle, reject: t.rejectTitle, info: t.infoTitle };
  const scopes: Record<KycDecision, string> = { approve: t.approveScope, reject: t.rejectScope, info: t.infoScope };
  const labels: Record<KycDecision, string> = { approve: t.approve, reject: t.reject, info: t.requestInfo };
  const evLabel = { submitted: t.evSubmitted, info: t.evInfo, approve: t.evApprove, reject: t.evReject, resubmitted: t.evResubmitted };

  const toggleDoc = (i: number) => {
    if (openDoc === i) { setOpenDoc(null); return; }
    setOpenDoc(i);
    logDocView(app.id, DOC[app.docs[i].kind]);
  };

  return (
    <>
      <a className="back" href={href('/kyc')}><Icon name="arrow" size={18} />&nbsp;{t.backTo(t.kycTitle)}</a>
      <PageHeader title={<span className="title-row">{app.store[lang]} <Badge tone={KYC_TONE[app.status]}>{KYC_STATUS[app.status][lang]}</Badge></span>}
        sub={<>{t.appDetail} <Id>{app.id}</Id> · {t.submitted} {fmtDateTime(app.submitted, lang)}</>} />

      {app.flags.map((f) => <Alert key={f.en} tone="warning" title={t.flags}>{f[lang]}</Alert>)}

      <div className="cols">
        <div className="col-main">
          <section className="card" aria-labelledby="kyc-docs">
            <div className="card-head"><h2 id="kyc-docs">{t.docs}</h2><Badge tone={complete ? 'success' : 'warning'}>{t.docsOk(app.docs.filter((d) => d.state === 'ok').length, app.docs.length)}</Badge></div>
            <ul className="adm-docs">
              {app.docs.map((d, i) => (
                <li key={d.kind}>
                  <div className="adm-doc-row">
                    <div className="grow">
                      <div className="strong">{DOC[d.kind][lang]}</div>
                      <div className="muted small"><Id>{d.ref}</Id>{d.expires && <> · {t.expires} <Id>{d.expires}</Id></>}</div>
                    </div>
                    <Badge tone={DOC_TONE[d.state]}>{DOC_STATE[d.state][lang]}</Badge>
                    {d.state !== 'missing' && (mayDocs
                      ? <button type="button" className="btn small" aria-expanded={openDoc === i} onClick={() => toggleDoc(i)}>{openDoc === i ? t.hideDoc : t.viewDoc}</button>
                      : <span className="adm-lockchip" title={t.docRestricted}><Icon name="lock" size={16} /><span className="sr">{t.docRestricted}</span></span>)}
                  </div>
                  {openDoc === i && (
                    <div className="adm-docview" aria-label={DOC[d.kind][lang]}>
                      <span className="sim">{lang === 'ar' ? 'محاكاة' : 'Simulated'}</span>
                      <p className="strong">{DOC[d.kind][lang]} · <Id>{d.ref}</Id></p>
                      <p className="muted small">{t.docPreview}</p>
                      <p className="adm-watermark">{t.docWatermark(ROLE_PERSON[roleStore.get()][lang], fmtDateTime(Date.now(), lang))}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!mayDocs && <div className="card-body"><Locked>{t.docRestricted}</Locked></div>}
          </section>

          <section className="card" aria-labelledby="kyc-h">
            <div className="card-head"><h2 id="kyc-h">{t.history}</h2></div>
            <div className="card-body">
              <ol className="log">
                {[...app.events].reverse().map((e, i) => (
                  <li key={i}>
                    <span className="when muted">{fmtDateTime(e.at, lang)}</span>
                    <span className="grow"><span className="strong">{evLabel[e.kind]}</span>{e.by && <span className="muted"> · {ROLE_LABEL[e.by][lang]}</span>}
                      {e.reason && <span className="adm-reason-quote">{e.reason}</span>}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>

        <div className="col-side">
          <section className="card" aria-labelledby="kyc-dec">
            <div className="card-head"><h2 id="kyc-dec">{t.decision}</h2></div>
            <div className="card-body">
              {decided ? (
                <>
                  <p className="muted">{t.decided}</p>
                  {app.status === 'approved' && app.storeId && <a className="btn" href={href(`/stores/${app.storeId}`)}>{t.openStore}</a>}
                </>
              ) : mayDecide ? (
                <>
                  <div className="adm-stack">
                    <button type="button" className="btn primary" disabled={!complete} aria-describedby={!complete ? 'kyc-blocked' : undefined} onClick={() => setDialog('approve')}>{t.approve}</button>
                    <button type="button" className="btn" onClick={() => setDialog('info')}>{t.requestInfo}</button>
                    <button type="button" className="btn adm-danger-outline" onClick={() => setDialog('reject')}>{t.reject}</button>
                  </div>
                  {!complete && <p id="kyc-blocked" className="muted small">{t.approveBlocked}</p>}
                </>
              ) : <Locked>{t.noDecide}</Locked>}
            </div>
          </section>
          <Summary app={app} t={t} lang={lang} />
        </div>
      </div>

      {dialog && (
        <ReasonDialog t={t} lang={lang} title={titles[dialog]} confirmLabel={labels[dialog]} danger={dialog === 'reject'}
          reasonLabel={dialog === 'info' ? t.infoReasonLabel : undefined}
          scope={<><p className="strong">{app.store[lang]} · <Id>{app.id}</Id></p><p>{scopes[dialog]}</p></>}
          onConfirm={(reason) => { const e = kycDecide(app.id, dialog, reason); if (!e) flash(`${labels[dialog]}: ${app.store[lang]}`); return e; }}
          onClose={close} />
      )}
    </>
  );
}

function Summary({ app, t, lang }: { app: Application; t: Ctx['t']; lang: Ctx['lang'] }) {
  return (
    <section className="card" aria-labelledby="kyc-sum">
      <div className="card-head"><h2 id="kyc-sum">{t.appDetail}</h2></div>
      <div className="card-body">
        <dl className="adm-facts">
          <div><dt>{t.merchant}</dt><dd>{app.merchant[lang]}</dd></div>
          <div><dt>{t.type}</dt><dd>{ENTITY[app.type][lang]}</dd></div>
          <div><dt>{t.city}</dt><dd>{app.city[lang]}</dd></div>
          <div><dt>{t.requestedPlan}</dt><dd><Id>{PLAN_NAME[app.plan]}</Id></dd></div>
          <div><dt>{t.contact}</dt><dd><Id>{app.email}</Id><br /><Id>{app.phone}</Id></dd></div>
        </dl>
      </div>
    </section>
  );
}
