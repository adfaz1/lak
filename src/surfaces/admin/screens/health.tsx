// Platform health (`#/admin/health`): per-service uptime, latency, errors, API volume; security events.
import { Activity, CheckCircle2, ShieldAlert, XOctagon, AlertTriangle } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { Alert, DataTable, PageHeader, type Column } from '../../../ds/kit';
import { Badge, Card, CardHeader, EmptyState, InfoHint, Ref, useTx, type Tone } from '../../../ds/ui';
import { SECURITY_EVENTS, SERVICES, serviceStatus, type Service } from '../domain';
import { SERVICE_STATUS } from '../i18n';
import { AsOf, pct, Stat, StateGate, Timeline, useFmt, useViewState } from '../ui';

const TONE: Record<'ok' | 'degraded' | 'down', Tone> = { ok: 'green', degraded: 'amber', down: 'red' };

export default function Health() {
  const tx = useTx();
  const { lang } = useLang();
  const f = useFmt();
  const state = useViewState();
  const services = state === 'empty' ? [] : SERVICES;
  const events = state === 'empty' ? [] : SECURITY_EVENTS;
  const counts = { ok: 0, degraded: 0, down: 0 };
  services.forEach((s) => { counts[serviceStatus(s)] += 1; });
  const header = <PageHeader title={tx('حالة المنصة', 'Platform health')} description={tx('لقطة غير مباشرة؛ الحدود مؤقتة حتى اعتماد أهداف الخدمة', 'A snapshot, not live; thresholds are placeholders until SLOs are approved')} meta={<AsOf />} />;
  if (state === 'loading' || state === 'error') return <StateGate state={state} header={header} what={{ ar: 'حالة المنصة', en: 'Platform health' }} refCode="SIM-ADM-MON-503" kind="cards" />;

  const cols: Column<Service>[] = [
    { key: 'name', header: tx('الخدمة', 'Service'), cell: (s) => s.name[lang] },
    { key: 'status', header: tx('الحالة', 'Status'), cell: (s) => <Badge tone={TONE[serviceStatus(s)]}>{SERVICE_STATUS[serviceStatus(s)][lang]}</Badge> },
    { key: 'up', header: tx('التوفر · 30 ي', 'Uptime · 30d'), align: 'end', cell: (s) => <bdi className="tabular-nums">{pct(s.uptime)}</bdi> },
    { key: 'p95', header: <span className="inline-flex items-center gap-1">p95<InfoHint>{tx('زمن الاستجابة الذي لا يتجاوزه 95% من الطلبات.', 'Response time 95% of requests stay under.')}</InfoHint></span>, align: 'end', cell: (s) => <bdi dir="ltr" className="tabular-nums">{f.n(s.p95)} ms</bdi> },
    { key: 'err', header: tx('الأخطاء · 24 س', 'Errors · 24h'), align: 'end', cell: (s) => <bdi className="tabular-nums">{pct(s.errors)}</bdi>, hideBelow: 'md' },
    { key: 'calls', header: tx('الطلبات · 24 س', 'Calls · 24h'), align: 'end', cell: (s) => <span className="tabular-nums">{f.n(s.calls24h)}</span>, hideBelow: 'lg' },
  ];
  return (
    <div className="space-y-6">
      {header}
      <section className="grid grid-cols-3 gap-3 sm:gap-4" aria-label={tx('ملخص الخدمات', 'Service summary')}>
        <Stat label={SERVICE_STATUS.ok[lang]} value={counts.ok} icon={<CheckCircle2 />} tint="from-emerald-500/15 text-emerald-600 dark:text-emerald-300" />
        <Stat label={SERVICE_STATUS.degraded[lang]} value={counts.degraded} icon={<AlertTriangle />} tint="from-amber-500/15 text-amber-600 dark:text-amber-300" />
        <Stat label={SERVICE_STATUS.down[lang]} value={counts.down} icon={<XOctagon />} tint="from-red-500/15 text-red-600 dark:text-red-300" />
      </section>
      <Card aria-labelledby="h-svc">
        <CardHeader id="h-svc" title={tx('الخدمات', 'Services')} hint={tx('متراجع: توفر أقل من 99.5% أو أخطاء فوق 1% أو p95 فوق 1.5 ث. متوقف: توفر أقل من 99%.', 'Degraded: uptime under 99.5%, errors over 1% or p95 over 1.5 s. Down: uptime under 99%.')} />
        {services.length === 0 ? <EmptyState icon={<Activity className="size-6" />} title={tx('لا بيانات مراقبة بعد', 'No monitoring data yet')} /> : (
          <div className="border-t border-border"><DataTable label={tx('الخدمات', 'Services')} rows={services} columns={cols} rowKey={(s) => s.id}
            card={(s) => <div><div className="flex items-baseline justify-between gap-2"><p className="text-sm font-semibold text-fg">{s.name[lang]}</p><Badge tone={TONE[serviceStatus(s)]}>{SERVICE_STATUS[serviceStatus(s)][lang]}</Badge></div><p className="text-xs text-muted"><bdi>{pct(s.uptime)}</bdi> · <bdi dir="ltr">p95 {f.n(s.p95)} ms</bdi> · <bdi>{pct(s.errors)}</bdi> {tx('أخطاء', 'errors')}</p></div>} /></div>
        )}
      </Card>
      <Card aria-labelledby="h-sec">
        <CardHeader id="h-sec" title={tx('أحداث أمنية', 'Security events')} />
        <div className="px-5 pb-4"><Alert tone="info">{tx('عنوان IP وحده ليس دليلًا على هجوم. كل حدث يحتاج تحقيقًا قبل أي استنتاج.', 'An IP address alone is not evidence of an attack. Each event needs investigation before any conclusion.')}</Alert></div>
        {events.length === 0 ? <EmptyState icon={<ShieldAlert className="size-6" />} title={tx('لا أحداث أمنية', 'No security events')} /> : (
          <Timeline items={events.map((e) => ({ key: e.at, when: f.dt(e.at), title: e.kind[lang], meta: <>{tx('المصدر', 'Source')} <Ref>{e.source}</Ref> · {tx('العدد', 'Count')} {f.n(e.count)}</>, note: e.note[lang] }))} />
        )}
      </Card>
    </div>
  );
}
