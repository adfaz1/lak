import { Fragment, useCallback, useState } from 'react';
import { Alert, Badge, Id, LinkTabs, PageHeader, Sim } from '../../../core/ui';
import { can, ENTITLEMENTS, planDiff, planWarnings, PLAN_NAME, PLANS, type FeatureGroup, type PlanChange } from '../domain';
import { entLabel, GROUP, ROLE_LABEL } from '../i18n';
import { flash, fmtDateTime, href, Locked, ReasonDialog, withQuery, type Ctx } from '../kit';
import { changesStore, decidePlan, storesStore } from '../state';
import { DiffList } from './stores';

export default function Plans(p: Ctx) {
  const { t, route } = p;
  const tab = route.query.get('tab') === 'changes' ? 'changes' : 'defs';
  const pending = changesStore.use().filter((c) => c.status === 'pending').length;
  return (
    <>
      <PageHeader title={t.plansTitle} sub={t.plansSub} />
      <LinkTabs label={t.plansTitle} items={[
        { href: withQuery('/plans', route, { tab: undefined }), label: t.tabDefs, current: tab === 'defs' },
        { href: withQuery('/plans', route, { tab: 'changes' }), label: <>{t.tabChanges} <span className="adm-chip-n">{pending}</span></>, current: tab === 'changes' },
      ]} />
      {tab === 'defs' ? <Definitions {...p} /> : <Changes {...p} />}
    </>
  );
}

function Definitions({ t, lang }: Ctx) {
  const stores = storesStore.use();
  const groups = [...new Set(ENTITLEMENTS.map((f) => f.group))] as FeatureGroup[];
  return (
    <>
      <Alert tone="info">{t.noPrices}</Alert>
      <section className="card">
        <div className="table-wrap adm-matrix" role="region" aria-label={t.tabDefs} tabIndex={0}>
          <table>
            <caption className="sr">{t.tabDefs}</caption>
            <thead>
              <tr>
                <th scope="col">{t.feature}</th>
                {PLANS.map((p) => (
                  <th key={p} scope="col">
                    <span className="adm-plan-head"><Id>{PLAN_NAME[p]}</Id><span className="adm-price-tbd">{t.priceTbd}</span>
                      <span className="muted small">{t.storesOnPlan(stores.filter((s) => s.plan === p).length)}</span></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g}>
                  <tr className="adm-group-row"><th colSpan={5} scope="colgroup">{GROUP[g][lang]}</th></tr>
                  {ENTITLEMENTS.filter((f) => f.group === g).map((f) => (
                    <tr key={f.id}>
                      <th scope="row">{f.label[lang]}</th>
                      {PLANS.map((p) => {
                        const v = f.v[p];
                        return <td key={p} className={v === false ? 'adm-ent-no' : 'adm-ent-yes'}>{v === false ? <><span className="adm-ent-dash" aria-hidden="true">—</span><span className="sr">{entLabel(v, lang)}</span></> : entLabel(v, lang)}</td>;
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-body">
          <p className="muted small">{t.unlimitedNote}</p>
          <p className="muted small">{t.sourceTiers}</p>
          <p className="muted small">— = {entLabel(false, lang)}</p>
        </div>
      </section>
      <section className="card" aria-labelledby="pl-conf">
        <div className="card-head"><h2 id="pl-conf">{t.conflicts}</h2></div>
        <div className="card-body">
          <ol className="adm-bullets numbered">
            <li>{t.conflict1}</li><li>{t.conflict2}</li><li>{t.conflict3}</li><li>{t.conflict4}</li>
          </ol>
        </div>
      </section>
    </>
  );
}

const TONE = { pending: 'warning', approved: 'success', rejected: 'danger' } as const;

function Changes({ t, lang, role }: Ctx) {
  const changes = changesStore.use();
  const stores = storesStore.use();
  const [dialog, setDialog] = useState<{ c: PlanChange; approve: boolean } | null>(null);
  const close = useCallback(() => setDialog(null), []);
  const statusLabel = { pending: t.pendingChange, approved: lang === 'ar' ? 'معتمد' : 'Approved', rejected: lang === 'ar' ? 'مرفوض' : 'Rejected' };

  if (changes.length === 0) return <div className="card"><div className="empty"><span>{t.changesEmpty}</span><a className="btn" href={href('/stores')}>{t.storesTitle}</a></div></div>;

  return (
    <>
      <ul className="adm-cards">
        {changes.map((c) => {
          const store = stores.find((s) => s.id === c.storeId);
          const name = store?.name[lang] ?? c.storeId;
          const canDecide = can(role, 'plans.approve') && c.proposedBy !== role;
          const warns = store ? planWarnings({ ...store, plan: c.from }, c.to) : [];
          return (
            <li key={c.id} className="card">
              <div className="card-head">
                <h2><a href={href(`/stores/${c.storeId}`)}>{name}</a> · <Id>{PLAN_NAME[c.from]} → {PLAN_NAME[c.to]}</Id></h2>
                <Badge tone={TONE[c.status]}>{statusLabel[c.status]}</Badge>
              </div>
              <div className="card-body">
                <dl className="adm-facts">
                  <div><dt>{t.proposedBy}</dt><dd>{ROLE_LABEL[c.proposedBy][lang]} · {fmtDateTime(c.proposedAt, lang)}</dd></div>
                  <div><dt>{t.effective}</dt><dd>{c.effective === 'now' ? t.effNow : t.effRenewal}</dd></div>
                  <div><dt>{t.reason.split(' (')[0]}</dt><dd>{c.reason}</dd></div>
                  {c.decidedBy && <div><dt>{t.by}</dt><dd>{ROLE_LABEL[c.decidedBy][lang]} · {fmtDateTime(c.decidedAt!, lang)}{c.note && <> — {c.note}</>}</dd></div>}
                </dl>
                <details className="adm-details">
                  <summary>{t.diff}</summary>
                  <DiffList t={t} lang={lang} rows={planDiff(c.from, c.to).filter((d) => d.change !== 'same')} />
                </details>
                {c.status === 'pending' && warns.length > 0 && (
                  <Alert tone="warning" title={t.warnings}>
                    <ul className="adm-bullets">{warns.map((w, i) => <li key={i}>{w.kind === 'staffOver' ? t.warnStaff(w.count!, w.limit!) : t.warnFeature(w.feature!.label[lang])}</li>)}</ul>
                  </Alert>
                )}
                {c.status === 'pending' && (canDecide ? (
                  <div className="actions">
                    <button type="button" className="btn primary" onClick={() => setDialog({ c, approve: true })}>{t.approvePlan}</button>
                    <button type="button" className="btn adm-danger-outline" onClick={() => setDialog({ c, approve: false })}>{t.rejectPlan}</button>
                  </div>
                ) : <Locked>{t.noApprove}</Locked>)}
              </div>
            </li>
          );
        })}
      </ul>
      {dialog && (
        <ReasonDialog t={t} lang={lang} title={dialog.approve ? t.approvePlanTitle : t.rejectPlanTitle} confirmLabel={dialog.approve ? t.approvePlan : t.rejectPlan}
          danger={!dialog.approve} optional={dialog.approve} reasonLabel={dialog.approve ? t.approveNote : undefined} onClose={close}
          scope={<>
            <p className="strong">{stores.find((s) => s.id === dialog.c.storeId)?.name[lang]} · <Id>{PLAN_NAME[dialog.c.from]} → {PLAN_NAME[dialog.c.to]}</Id></p>
            <p>{dialog.c.effective === 'now' ? t.effNow : t.effRenewal}</p>
            <p className="small"><Sim /> {t.costLine}</p>
          </>}
          onConfirm={(note) => { const e = decidePlan(dialog.c.id, dialog.approve, note); if (!e) flash(dialog.approve ? t.approvePlan : t.rejectPlan); return e; }} />
      )}
    </>
  );
}
