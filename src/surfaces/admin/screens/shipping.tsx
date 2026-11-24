import { useCallback, useState } from 'react';
import { Badge, Id, LinkTabs, PageHeader, Sim, type Tone } from '../../../core/ui';
import { can, DATA_AS_OF, DELIVERY_NEXT, type DeliveryState, type FailedDelivery } from '../domain';
import { CARRIER_STATUS, DELIVERY_ACTION, DELIVERY_STATE } from '../i18n';
import { AsOf, DataList, flash, fmtDate, fmtDateTime, href, Locked, pct, ReasonDialog, withQuery, type Ctx } from '../kit';
import { carriersStore, deliveriesStore, moveDelivery, storesStore } from '../state';

const CARRIER_TONE: Record<string, Tone> = { operational: 'success', degraded: 'warning', down: 'danger' };
const DELIVERY_TONE: Record<DeliveryState, Tone> = { failed: 'danger', reattempt: 'info', returning: 'warning', resolved: 'success' };

export default function Shipping(p: Ctx) {
  const { t, lang, route } = p;
  const tab = route.query.get('tab') === 'failed' ? 'failed' : 'carriers';
  const failed = deliveriesStore.use().filter((d) => d.state === 'failed').length;
  return (
    <>
      <PageHeader title={t.shipTitle} sub={t.shipSub} actions={<AsOf t={t} lang={lang} at={DATA_AS_OF} />} />
      <LinkTabs label={t.shipTitle} items={[
        { href: withQuery('/shipping', route, { tab: undefined }), label: t.tabCarriers, current: tab === 'carriers' },
        { href: withQuery('/shipping', route, { tab: 'failed' }), label: <>{t.tabFailed} <span className="adm-chip-n">{failed}</span></>, current: tab === 'failed' },
      ]} />
      {tab === 'carriers' ? <Carriers {...p} /> : <Failed {...p} />}
    </>
  );
}

function Carriers({ t, lang }: Ctx) {
  const carriers = carriersStore.use();
  return (
    <section className="card">
      <DataList label={t.tabCarriers} rows={carriers} rowKey={(c) => c.id}
        cols={[
          { key: 'name', primary: true, head: t.carrier, cell: (c) => <span className="adm-rowlink"><span className="strong">{c.name[lang]}</span><span className="muted small">{t.dataAsOf} {fmtDateTime(c.asOf, lang)}</span></span> },
          { key: 'status', head: t.status, cell: (c) => <Badge tone={CARRIER_TONE[c.status]}>{CARRIER_STATUS[c.status][lang]}</Badge> },
          { key: 'cov', head: t.coverage, end: true, cell: (c) => c.cities },
          { key: 'sla', head: t.sla, end: true, cell: (c) => c.slaDays },
          { key: 'ontime', head: t.onTime, end: true, cell: (c) => (c.status === 'down' ? <span className="muted small">{t.noRate}</span> : <bdi>{pct(c.onTime)}</bdi>) },
          { key: 'comp', head: t.complaints, end: true, cell: (c) => c.complaints },
        ]} />
    </section>
  );
}

function Failed({ t, lang, role }: Ctx) {
  const rows = deliveriesStore.use();
  const stores = storesStore.use();
  const carriers = carriersStore.use();
  const [dlg, setDlg] = useState<{ d: FailedDelivery; to: DeliveryState } | null>(null);
  const close = useCallback(() => setDlg(null), []);
  const mayAct = can(role, 'shipping.act');
  return (
    <>
      {!mayAct && <Locked>{t.noShipAct}</Locked>}
      <section className="card">
        <DataList label={t.tabFailed} rows={rows} rowKey={(d) => d.id}
          cols={[
            { key: 'id', primary: true, head: t.ref, cell: (d) => <span className="adm-rowlink"><Id>{d.id}</Id><a className="small" href={href(`/stores/${d.storeId}`)}>{stores.find((s) => s.id === d.storeId)?.name[lang]}</a></span> },
            { key: 'carrier', head: t.carrier, cell: (d) => carriers.find((c) => c.id === d.carrierId)?.name[lang] },
            { key: 'city', head: t.city, cell: (d) => d.city[lang] },
            { key: 'reason', head: t.failReason, cell: (d) => d.reason[lang] },
            { key: 'att', head: t.attempts, end: true, cell: (d) => d.attempts },
            { key: 'since', head: t.since, cell: (d) => fmtDate(d.since, lang) },
            { key: 'state', head: t.status, cell: (d) => <Badge tone={DELIVERY_TONE[d.state]}>{DELIVERY_STATE[d.state][lang]}</Badge> },
            { key: 'act', head: t.actions, cell: (d) => (mayAct && DELIVERY_NEXT[d.state].length ? (
              <span className="adm-rowactions">{DELIVERY_NEXT[d.state].map((to) => (
                <button key={to} type="button" className="btn small" onClick={() => setDlg({ d, to })}>{DELIVERY_ACTION[to][lang]}</button>
              ))}</span>
            ) : <span className="muted small">—</span>) },
          ]} />
      </section>
      {dlg && (
        <ReasonDialog t={t} lang={lang} title={DELIVERY_ACTION[dlg.to][lang]} confirmLabel={DELIVERY_ACTION[dlg.to][lang]} optional={dlg.to !== 'returning'}
          danger={dlg.to === 'returning'} reasonLabel={dlg.to === 'returning' ? undefined : t.moveNote} onClose={close}
          scope={<>
            <p className="strong"><Id>{dlg.d.id}</Id> · {stores.find((s) => s.id === dlg.d.storeId)?.name[lang]}</p>
            <p>{DELIVERY_STATE[dlg.d.state][lang]} → {DELIVERY_STATE[dlg.to][lang]}</p>
            <p className="small"><Sim /> {lang === 'ar' ? 'لا يُرسل طلب فعلي للناقل.' : 'No request is sent to the carrier.'}</p>
          </>}
          onConfirm={(note) => { const e = moveDelivery(dlg.d.id, dlg.to, note); if (!e) flash(`${DELIVERY_ACTION[dlg.to][lang]}: ${dlg.d.id}`); return e; }} />
      )}
    </>
  );
}
