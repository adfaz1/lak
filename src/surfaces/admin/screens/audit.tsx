// Audit log (`#/admin/audit?action=&role=`): every admin action in this session, newest first, with reason and detail.
import { ScrollText } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { DataTable, FilterChip, PageHeader, Pagination, type Column } from '../../../ds/kit';
import { Badge, Card, EmptyState, InfoHint, Ref, useTx } from '../../../ds/ui';
import { ROLES, type AuditAction, type AuditEntry, type RoleId } from '../domain';
import { AUDIT_ACTION, ROLE_LABEL } from '../i18n';
import { listAudit } from '../model';
import { auditStore } from '../state';
import { NoResults, qhref, StateGate, useFmt, useQueryNav, useViewState } from '../ui';
import type { ScreenProps } from '../index';

const SENSITIVE: AuditAction[] = ['kycReject', 'storeSuspended', 'planRejected', 'announcementCancelled', 'payoutHeld', 'docViewed', 'accessStarted'];

export default function Audit({ route }: ScreenProps) {
  const tx = useTx();
  const { lang } = useLang();
  const f = useFmt();
  const state = useViewState();
  const stored = auditStore.use();
  const all = state === 'empty' ? [] : stored;
  const action = (route.query.get('action') ?? '') as AuditAction | '';
  const role = (route.query.get('role') ?? '') as RoleId | '';
  const r = listAudit(all, { action: action in AUDIT_ACTION ? action : '', role: ROLES.includes(role as RoleId) ? role : '', page: Number(route.query.get('page') ?? 1) });
  const go = useQueryNav('audit', route);
  const present = [...new Set(all.map((e) => e.action))];

  const header = <PageHeader title={<span className="inline-flex items-center gap-1.5">{tx('سجل الإجراءات', 'Audit log')}<InfoHint>{tx('في الإنتاج يكتبه الخادم ولا يُعدَّل. هنا يغطي إجراءات هذه الجلسة فقط.', 'In production the server writes it and it cannot be edited. Here it covers this session only.')}</InfoHint></span>}
    description={state === 'live' && all.length ? tx(`${all.length} إجراء في هذه الجلسة · الأحدث أولًا`, `${all.length} actions this session · newest first`) : undefined} />;
  if (state === 'loading' || state === 'error') return <StateGate state={state} header={header} what={{ ar: 'السجل', en: 'The audit log' }} refCode="SIM-ADM-AUD-503" />;
  if (all.length === 0) return (
    <div className="space-y-6">{header}<Card><EmptyState as="h2" icon={<ScrollText className="size-6" aria-hidden="true" />} title={tx('لا إجراءات في هذه الجلسة بعد', 'No actions in this session yet')}>
      {tx('القرارات والتعليق والوصول المفوّض والتصدير وتبديل الأدوار تظهر هنا.', 'Decisions, suspensions, supported access, exports and role switches appear here.')}
    </EmptyState></Card></div>
  );

  const cols: Column<AuditEntry>[] = [
    { key: 'action', header: tx('الإجراء', 'Action'), cell: (e) => <span className="font-semibold text-fg">{AUDIT_ACTION[e.action][lang]}<span className="block text-xs font-normal text-muted">{f.dt(e.at)}</span></span> },
    { key: 'role', header: tx('الدور', 'Role'), cell: (e) => <Badge tone={SENSITIVE.includes(e.action) ? 'amber' : 'gray'}>{ROLE_LABEL[e.role][lang]}</Badge> },
    { key: 'target', header: tx('الهدف', 'Target'), cell: (e) => <span className="block max-w-56 truncate">{e.targetLabel[lang]}<span className="block text-xs text-muted"><Ref>{e.target}</Ref></span></span> },
    { key: 'detail', header: tx('التفصيل', 'Detail'), cell: (e) => (e.detail ? <bdi>{e.detail[lang]}</bdi> : <span className="text-subtle">—</span>), hideBelow: 'md' },
    { key: 'reason', header: tx('السبب', 'Reason'), cell: (e) => (e.reason ? <span className="block max-w-72 text-muted">«{e.reason}»</span> : <span className="text-subtle">—</span>), hideBelow: 'lg' },
  ];
  return (
    <div className="space-y-6">
      {header}
      <Card>
        <div className="flex flex-wrap items-center gap-2 p-4 sm:px-5">
          <FilterChip label={tx('الإجراء', 'Action')} value={action} options={present.map((a) => ({ value: a, label: AUDIT_ACTION[a][lang] }))} onChange={(v) => go({ action: v || undefined })} />
          <FilterChip label={tx('الدور', 'Role')} value={role} options={ROLES.map((x) => ({ value: x, label: ROLE_LABEL[x][lang] }))} onChange={(v) => go({ role: v || undefined })} />
        </div>
        {r.rows.length === 0 ? <NoResults onClear={() => go({ action: undefined, role: undefined })} /> : (
          <>
            <div className="border-t border-border"><DataTable label={tx('سجل الإجراءات', 'Audit log')} rows={r.pageRows} columns={cols} rowKey={(e) => e.id}
              card={(e) => <div><div className="flex items-baseline justify-between gap-2"><p className="text-sm font-semibold text-fg">{AUDIT_ACTION[e.action][lang]}</p><Badge tone={SENSITIVE.includes(e.action) ? 'amber' : 'gray'}>{ROLE_LABEL[e.role][lang]}</Badge></div><p className="text-xs text-muted">{e.targetLabel[lang]} · {f.dt(e.at)}{e.detail && <> · <bdi>{e.detail[lang]}</bdi></>}</p>{e.reason && <p className="mt-1 text-xs text-muted">«{e.reason}»</p>}</div>} /></div>
            <Pagination page={r.page} pages={r.pages} total={r.rows.length} hrefFor={(p) => qhref('audit', route, { page: String(p) })} />
          </>
        )}
      </Card>
    </div>
  );
}
