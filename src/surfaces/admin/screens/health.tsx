import { formatInt } from '../../../core/format';
import { Alert, Badge, Id, PageHeader, type Tone } from '../../../core/ui';
import { DATA_AS_OF, SECURITY_EVENTS, SERVICES, serviceStatus } from '../domain';
import { SERVICE_STATUS } from '../i18n';
import { AsOf, DataList, fmtDateTime, pct, type Ctx } from '../kit';

const TONE: Record<'ok' | 'degraded' | 'down', Tone> = { ok: 'success', degraded: 'warning', down: 'danger' };

export default function Health({ t, lang }: Ctx) {
  const counts = { ok: 0, degraded: 0, down: 0 };
  SERVICES.forEach((s) => { counts[serviceStatus(s)] += 1; });
  return (
    <>
      <PageHeader title={t.healthTitle} sub={t.healthSub} actions={<AsOf t={t} lang={lang} at={DATA_AS_OF} />} />
      <section className="metrics" aria-label={t.healthTitle}>
        {(['ok', 'degraded', 'down'] as const).map((k) => (
          <div key={k} className="card metric"><span className="muted">{SERVICE_STATUS[k][lang]}</span><strong>{counts[k]}</strong><small>{t.service}</small></div>
        ))}
      </section>
      <section className="card">
        <DataList label={t.healthTitle} rows={SERVICES} rowKey={(s) => s.id}
          cols={[
            { key: 'name', primary: true, head: t.service, cell: (s) => <span className="strong">{s.name[lang]}</span> },
            { key: 'status', head: t.status, cell: (s) => <Badge tone={TONE[serviceStatus(s)]}>{SERVICE_STATUS[serviceStatus(s)][lang]}</Badge> },
            { key: 'up', head: t.uptime, end: true, cell: (s) => <bdi>{pct(s.uptime)}</bdi> },
            { key: 'p95', head: t.p95, end: true, cell: (s) => <bdi dir="ltr">{formatInt(s.p95)} ms</bdi> },
            { key: 'err', head: t.errorRate, end: true, cell: (s) => <bdi>{pct(s.errors)}</bdi> },
            { key: 'calls', head: t.calls, end: true, cell: (s) => formatInt(s.calls24h) },
          ]} />
      </section>
      <section className="card" aria-labelledby="sec-h">
        <div className="card-head"><h2 id="sec-h">{t.security}</h2></div>
        <div className="card-body">
          <Alert tone="info">{t.securityNote}</Alert>
          <ul className="log">
            {SECURITY_EVENTS.map((e) => (
              <li key={e.at}>
                <span className="when muted">{fmtDateTime(e.at, lang)}</span>
                <span className="grow"><span className="strong">{e.kind[lang]}</span> · {t.source}: <Id>{e.source}</Id> · {t.count}: {formatInt(e.count)}
                  <span className="muted small adm-block">{e.note[lang]}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
