import { formatInt } from '../../../core/format';
import { Money, PageHeader } from '../../../core/ui';
import { can, DATA_AS_OF, gmv, isActiveStore, revenueSummary, SERVICES, serviceStatus, TODAY } from '../domain';
import { AsOf, href, Icon, type Ctx } from '../kit';
import { changesStore, contentStore, deliveriesStore, disputesStore, kycStore, revenueStore, storesStore } from '../state';

export default function Overview({ t, lang, role }: Ctx) {
  const stores = storesStore.use();
  const rev = revenueSummary(revenueStore.use());
  const kyc = kycStore.use();
  const changes = changesStore.use();
  const disputes = disputesStore.use();
  const deliveries = deliveriesStore.use();
  const content = contentStore.use();
  const money = can(role, 'overview.money');
  const revRaw = revenueStore.get();

  const active = stores.filter((s) => isActiveStore(s, TODAY)).length;
  const live = stores.filter((s) => s.status !== 'suspended');
  const queue = [
    can(role, 'kyc.view') && { n: kyc.filter((a) => a.status === 'pending').length, label: t.qKyc, why: t.qKycWhy, to: href('/kyc', { status: 'pending' }), icon: 'kyc' },
    can(role, 'plans.view') && { n: changes.filter((c) => c.status === 'pending').length, label: t.qPlan, why: t.qPlanWhy, to: href('/plans', { tab: 'changes' }), icon: 'plans' },
    can(role, 'payments.view') && { n: disputes.filter((d) => d.state === 'open' || d.state === 'awaitingMerchant').length, label: t.qDisputes, why: t.qDisputesWhy, to: href('/payments', { tab: 'disputes' }), icon: 'payments' },
    can(role, 'shipping.view') && { n: deliveries.filter((d) => d.state === 'failed').length, label: t.qDeliveries, why: t.qDeliveriesWhy, to: href('/shipping', { tab: 'failed' }), icon: 'shipping' },
    can(role, 'content.view') && { n: content.filter((c) => c.state === 'review').length, label: t.qContent, why: t.qContentWhy, to: href('/content', { state: 'review' }), icon: 'content' },
    can(role, 'health.view') && { n: SERVICES.filter((s) => serviceStatus(s) !== 'ok').length, label: t.qHealth, why: t.qHealthWhy, to: href('/health'), icon: 'health' },
  ].filter((x): x is { n: number; label: string; why: string; to: string; icon: string } => !!x && x.n > 0);

  return (
    <>
      <PageHeader title={t.ovTitle} sub={t.ovSub} actions={<AsOf t={t} lang={lang} at={DATA_AS_OF} />} />

      {money ? (
        <section className="metrics adm-metrics" aria-label={t.revBreakdown}>
          <div className="card metric adm-metric-gmv"><span className="muted">{t.gmv}</span><strong><Money v={gmv(stores)} /></strong><small>{t.gmvNote}</small></div>
          <div className="card metric adm-metric-lak"><span className="muted">{t.lakRev}</span><strong><Money v={rev.lakRevenue30} /></strong><small>{t.lakRevNote}</small></div>
          <div className="card metric"><span className="muted">{t.mrr}</span><strong><Money v={rev.mrr} /></strong><small>{t.mrrNote}</small></div>
          <div className="card metric"><span className="muted">{t.arr}</span><strong><Money v={rev.arr} /></strong><small>{t.arrNote}</small></div>
        </section>
      ) : (
        <p className="adm-locked small"><Icon name="lock" size={16} /><span>{t.moneyHidden}</span></p>
      )}

      <div className="cols">
        <div className="col-main">
          <section className="card" aria-labelledby="ov-q">
            <div className="card-head"><h2 id="ov-q">{t.attention}</h2></div>
            <ul className="queue">
              {queue.length === 0 && <li><span className="muted">{t.qClear}</span></li>}
              {queue.map((q) => (
                <li key={q.label}>
                  <b className="n">{q.n}</b>
                  <div className="grow"><div className="strong">{q.label}</div><div className="muted small">{q.why}</div></div>
                  <a className="btn" href={q.to}><Icon name={q.icon} size={18} />&nbsp;{t.open}</a>
                </li>
              ))}
            </ul>
          </section>

          <section className="card" aria-labelledby="ov-c">
            <div className="card-head"><h2 id="ov-c">{t.counters}</h2></div>
            <div className="card-body">
              <dl className="adm-counters">
                <div><dt>{t.activeStores}</dt><dd>{formatInt(active)}</dd></div>
                <div><dt>{t.totalStores}</dt><dd>{formatInt(stores.length)}</dd></div>
                <div><dt>{t.onboarding}</dt><dd>{formatInt(stores.filter((s) => s.status === 'onboarding').length)}</dd></div>
                <div><dt>{t.suspended}</dt><dd>{formatInt(stores.filter((s) => s.status === 'suspended').length)}</dd></div>
                <div><dt>{t.orders30}</dt><dd>{formatInt(live.reduce((n, s) => n + s.orders30, 0))}</dd></div>
                <div><dt>{t.errors24}</dt><dd>{formatInt(stores.reduce((n, s) => n + s.errors24h, 0))}</dd></div>
              </dl>
              <p className="muted small">{t.activeDef}</p>
            </div>
          </section>
        </div>

        {money && (
          <div className="col-side">
            <section className="card" aria-labelledby="ov-r">
              <div className="card-head"><h2 id="ov-r">{t.revBreakdown}</h2></div>
              <div className="card-body">
                <div className="breakdown">
                  <div><span>{t.subs}</span><Money v={revRaw.subscriptions30} /></div>
                  <div><span>{t.addons}</span><Money v={revRaw.addons30} /></div>
                  <div><span>{t.oneTime}</span><Money v={revRaw.oneTime30} /></div>
                  <div className="sum"><span>{t.total}</span><Money v={rev.lakRevenue30} /></div>
                </div>
                <p className="muted small">{t.gmvExcluded} <Money v={gmv(stores)} /></p>
              </div>
            </section>
          </div>
        )}
      </div>
    </>
  );
}
