import { useCallback, useState } from 'react';
import { Alert, Badge, Id, LinkTabs, Money, PageHeader, Sim, type Tone } from '../../../core/ui';
import { can, DATA_AS_OF, DISPUTE_NEXT, fundOf, type Dispute, type DisputeState, type LedgerKind } from '../domain';
import { DISPUTE_ACTION, DISPUTE_KIND, DISPUTE_STATE, LEDGER_KIND, LEDGER_STATUS } from '../i18n';
import { AsOf, DataList, flash, fmtDate, fmtDateTime, href, Locked, ReasonDialog, withQuery, type Ctx } from '../kit';
import { disputesStore, ledgerStore, moveDispute, storesStore } from '../state';

const LEDGER_TONE: Record<string, Tone> = { captured: 'success', settled: 'success', pending: 'info', failed: 'danger', reversed: 'warning' };
const DISPUTE_TONE: Record<DisputeState, Tone> = { open: 'warning', awaitingMerchant: 'info', submitted: 'info', won: 'success', lost: 'danger' };
type Tab = 'ledger' | 'disputes' | 'gateways';

export default function Payments(p: Ctx) {
  const { t, lang, route } = p;
  const q = route.query.get('tab');
  const tab: Tab = q === 'disputes' || q === 'gateways' ? q : 'ledger';
  const open = disputesStore.use().filter((d) => d.state === 'open' || d.state === 'awaitingMerchant').length;
  return (
    <>
      <PageHeader title={t.payTitle} sub={t.paySub} actions={<AsOf t={t} lang={lang} at={DATA_AS_OF} />} />
      <LinkTabs label={t.payTitle} items={[
        { href: href('/payments'), label: t.tabLedger, current: tab === 'ledger' },
        { href: href('/payments', { tab: 'disputes' }), label: <>{t.tabDisputes} <span className="adm-chip-n">{open}</span></>, current: tab === 'disputes' },
        { href: href('/payments', { tab: 'gateways' }), label: t.tabGateways, current: tab === 'gateways' },
      ]} />
      {tab === 'ledger' && <Ledger {...p} />}
      {tab === 'disputes' && <Disputes {...p} />}
      {tab === 'gateways' && <Gateways {...p} />}
    </>
  );
}

function Ledger({ t, lang, route }: Ctx) {
  const ledger = ledgerStore.use();
  const stores = storesStore.use();
  const kind = (route.query.get('kind') ?? '') as LedgerKind | '';
  const rows = ledger.filter((e) => !kind || e.kind === kind);
  const name = (id: string) => stores.find((s) => s.id === id)?.name[lang] ?? id;
  return (
    <>
      <LinkTabs label={t.filterKind} items={(['', 'sale', 'refund', 'chargeback', 'payout', 'subscription'] as (LedgerKind | '')[]).map((k) => ({
        href: withQuery('/payments', route, { kind: k || undefined }), current: k === kind, label: k ? LEDGER_KIND[k][lang] : t.all,
      }))} />
      <section className="card">
        <DataList label={t.tabLedger} rows={rows} rowKey={(e) => e.ref} empty={<span>{t.noResults}</span>}
          cols={[
            { key: 'ref', primary: true, head: t.ref, cell: (e) => <span className="adm-rowlink"><Id>{e.ref}</Id><span className="muted small">{fmtDateTime(e.at, lang)}</span></span> },
            { key: 'store', head: t.store, cell: (e) => <a href={href(`/stores/${e.storeId}`)}>{name(e.storeId)}</a> },
            { key: 'kind', head: t.kind, cell: (e) => LEDGER_KIND[e.kind][lang] },
            { key: 'fund', head: t.fund, cell: (e) => <Badge tone={fundOf(e.kind) === 'lak' ? 'info' : 'neutral'}>{fundOf(e.kind) === 'lak' ? t.fundLak : t.fundMerchant}</Badge> },
            { key: 'method', head: t.method, cell: (e) => <Id>{e.method}</Id> },
            { key: 'amount', head: t.amount, end: true, cell: (e) => (e.kind === 'subscription' ? <span className="muted small">{t.priceTbd}</span> : <Money v={e.amount} />) },
            { key: 'status', head: t.status, cell: (e) => <span className="adm-cellstack"><Badge tone={LEDGER_TONE[e.status]}>{LEDGER_STATUS[e.status][lang]}</Badge>{e.flag && <span className="small adm-flag">{e.flag[lang]}</span>}</span> },
          ]} />
      </section>
    </>
  );
}

function Disputes({ t, lang, role }: Ctx) {
  const disputes = disputesStore.use();
  const stores = storesStore.use();
  const [dlg, setDlg] = useState<{ d: Dispute; to: DisputeState } | null>(null);
  const close = useCallback(() => setDlg(null), []);
  const mayAct = can(role, 'payments.act');
  const name = (id: string) => stores.find((s) => s.id === id)?.name[lang] ?? id;
  const rows = [...disputes].sort((a, b) => a.due.localeCompare(b.due));
  return (
    <>
      {!mayAct && <Locked>{t.noPayAct}</Locked>}
      <section className="card">
        <DataList label={t.tabDisputes} rows={rows} rowKey={(d) => d.id} empty={<span>{t.noResults}</span>}
          cols={[
            { key: 'id', primary: true, head: t.ref, cell: (d) => <span className="adm-rowlink"><span className="strong">{DISPUTE_KIND[d.kind][lang]} <Id>{d.id}</Id></span><span className="muted small"><Id>{d.txn}</Id> · {name(d.storeId)}</span></span> },
            { key: 'reason', head: t.disputeReason, cell: (d) => d.reason[lang] },
            { key: 'amount', head: t.amount, end: true, cell: (d) => <Money v={d.amount} /> },
            { key: 'due', head: t.due, cell: (d) => fmtDate(d.due, lang) },
            { key: 'state', head: t.status, cell: (d) => <Badge tone={DISPUTE_TONE[d.state]}>{DISPUTE_STATE[d.state][lang]}</Badge> },
            { key: 'act', head: t.actions, cell: (d) => (mayAct && DISPUTE_NEXT[d.state].length > 0 ? (
              <span className="adm-rowactions">{DISPUTE_NEXT[d.state].map((to) => (
                <button key={to} type="button" className="btn small" onClick={() => setDlg({ d, to })}>{DISPUTE_ACTION[to][lang]}</button>
              ))}</span>
            ) : <span className="muted small">—</span>) },
          ]} />
      </section>
      {dlg && (
        <ReasonDialog t={t} lang={lang} optional title={t.moveTitle} confirmLabel={DISPUTE_ACTION[dlg.to][lang]} reasonLabel={t.moveNote} onClose={close}
          scope={<>
            <p className="strong">{DISPUTE_KIND[dlg.d.kind][lang]} <Id>{dlg.d.id}</Id> · <Money v={dlg.d.amount} /></p>
            <p>{DISPUTE_STATE[dlg.d.state][lang]} → {DISPUTE_STATE[dlg.to][lang]}</p>
            <p className="small"><Sim /> {t.moveScope}</p>
          </>}
          onConfirm={(note) => { const e = moveDispute(dlg.d.id, dlg.to, note); if (!e) flash(`${DISPUTE_ACTION[dlg.to][lang]}: ${dlg.d.id}`); return e; }} />
      )}
    </>
  );
}

function Gateways({ t }: Ctx) {
  const rows = [
    { k: t.gatewayRow, v: t.pendingContract, tone: 'warning' as Tone },
    { k: t.codRow, v: t.manualOnly, tone: 'neutral' as Tone },
    { k: t.bankRow, v: t.manualOnly, tone: 'neutral' as Tone },
    { k: t.einvRow, v: t.pendingContract, tone: 'warning' as Tone },
  ];
  return (
    <>
      <Alert tone="info">{t.gatewaysNote}</Alert>
      <section className="card">
        <ul className="queue">
          {rows.map((r) => <li key={r.k}><span className="grow strong">{r.k}</span><Badge tone={r.tone}>{r.v}</Badge></li>)}
        </ul>
      </section>
    </>
  );
}
