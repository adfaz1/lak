import { Badge, Id, PageHeader } from '../../../core/ui';
import type { AuditAction } from '../domain';
import { AUDIT_ACTION, ROLE_LABEL } from '../i18n';
import { DataList, fmtDateTime, setQuery, type Ctx } from '../kit';
import { auditStore } from '../state';

const DESTRUCTIVE: AuditAction[] = ['kycReject', 'storeSuspended', 'planRejected', 'announcementCancelled'];

export default function Audit({ t, lang, route }: Ctx) {
  const all = auditStore.use();
  const action = (route.query.get('action') ?? '') as AuditAction | '';
  const rows = all.filter((e) => !action || e.action === action);
  const present = [...new Set(all.map((e) => e.action))];
  return (
    <>
      <PageHeader title={t.auditTitle} sub={t.auditSub} />
      {all.length > 0 && (
        <div className="adm-filters">
          <div className="field">
            <label htmlFor="au-action">{t.filterAction}</label>
            <select id="au-action" className="input" value={action} onChange={(e) => setQuery('/audit', route, { action: e.target.value || undefined })}>
              <option value="">{t.allActions}</option>
              {present.map((a) => <option key={a} value={a}>{AUDIT_ACTION[a][lang]}</option>)}
            </select>
          </div>
          <p className="muted small" aria-live="polite">{t.results(rows.length)}</p>
        </div>
      )}
      <section className="card">
        <DataList label={t.auditTitle} rows={rows} rowKey={(e) => e.id}
          empty={<span>{all.length === 0 ? t.auditEmpty : t.noResults}</span>}
          cols={[
            { key: 'action', primary: true, head: t.action, cell: (e) => (
              <span className="adm-rowlink"><span className="strong">{AUDIT_ACTION[e.action][lang]}</span>
                <span className="muted small">{fmtDateTime(e.at, lang)}</span></span>) },
            { key: 'role', head: t.role, cell: (e) => <Badge tone={DESTRUCTIVE.includes(e.action) ? 'warning' : 'neutral'}>{ROLE_LABEL[e.role][lang]}</Badge> },
            { key: 'target', head: t.target, cell: (e) => <span className="adm-cellstack"><span>{e.targetLabel[lang]}</span><span className="muted small"><Id>{e.target}</Id></span></span> },
            { key: 'detail', head: t.detail, cell: (e) => (e.detail ? <bdi>{e.detail[lang]}</bdi> : '—') },
            { key: 'reason', head: t.reason.split(' (')[0], cell: (e) => (e.reason ? <q>{e.reason}</q> : <span className="muted">—</span>) },
          ]} />
      </section>
    </>
  );
}
