// Subscriptions & plans (`#/admin/plans`, `?tab=changes`): entitlement matrix (prices not approved) and
// plan-change requests that a role other than the proposer approves.
import { Fragment, useState } from 'react';
import { CheckCircle2, Layers, Minus, XCircle } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { Alert, PageHeader, Tabs, useToast } from '../../../ds/kit';
import { Badge, Button, Card, CardHeader, EmptyState, InfoHint, LinkButton, cn, useTx, type Tone } from '../../../ds/ui';
import { can, ENTITLEMENTS, planDiff, planWarnings, PLAN_NAME, PLANS, type FeatureGroup, type PlanChange } from '../domain';
import { entLabel, GROUP, ROLE_LABEL } from '../i18n';
import { changesStore, decidePlan, storesStore } from '../state';
import { ahref, Facts, Locked, qhref, ReasonModal, StateGate, useFmt, useViewState } from '../ui';
import { PlanDiff, PlanWarnings } from './stores';
import type { ScreenProps } from '../index';

export default function Plans(p: ScreenProps) {
  const tx = useTx();
  const state = useViewState();
  const tab = p.route.query.get('tab') === 'changes' ? 'changes' : 'defs';
  const pending = changesStore.use().filter((c) => c.status === 'pending').length;
  const header = (
    <>
      <PageHeader title={tx('الاشتراكات والخطط', 'Subscriptions & plans')} description={tx('أسماء عمل: Basic وPlus وPro وSpecial حتى اعتماد الهوية', 'Working names Basic, Plus, Pro, Special until branding is approved')} />
      <Tabs label={tx('أقسام الخطط', 'Plan sections')} items={[
        { href: qhref('plans', p.route, { tab: undefined }), label: tx('تعريف الخطط', 'Plan definitions'), current: tab === 'defs' },
        { href: qhref('plans', p.route, { tab: 'changes' }), label: tx('طلبات التغيير', 'Change requests'), current: tab === 'changes', count: pending },
      ]} />
    </>
  );
  if (state === 'loading' || state === 'error') return <StateGate state={state} header={header} what={{ ar: 'الخطط', en: 'Plans' }} refCode="SIM-ADM-PLN-503" />;
  return <div className="space-y-6">{header}{tab === 'defs' ? <Definitions /> : <Changes {...p} />}</div>;
}

function Definitions() {
  const tx = useTx();
  const { lang } = useLang();
  const stores = storesStore.use();
  const groups = [...new Set(ENTITLEMENTS.map((f) => f.group))] as FeatureGroup[];
  return (
    <>
      <Alert tone="info" title={tx('لا أسعار هنا', 'No prices here')}>{tx('الأسعار والعمولات والأسعار الإقليمية وقواعد التجديد قرارات تجارية بانتظار الاعتماد. المزايا من سجل واحد يملكه الخادم.', 'Prices, commissions, regional pricing and renewal rules are business decisions awaiting approval. Entitlements come from one registry the backend must own.')}</Alert>
      <Card>
        <div className="scrollbar-thin relative max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[640px] text-sm" aria-label={tx('مزايا الخطط', 'Plan entitlements')}>
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-3 text-start text-xs font-semibold text-muted">{tx('الميزة', 'Feature')}</th>
                {PLANS.map((p) => (
                  <th key={p} scope="col" className="px-4 py-3 text-start">
                    <span className="block text-sm font-bold text-fg"><bdi>{PLAN_NAME[p]}</bdi></span>
                    <span className="block text-[11px] font-medium text-amber-700 dark:text-amber-300">{tx('السعر بانتظار الاعتماد', 'Price to be approved')}</span>
                    <span className="block text-[11px] font-normal text-muted">{tx(`${stores.filter((s) => s.plan === p).length} متاجر`, `${stores.filter((s) => s.plan === p).length} stores`)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g}>
                  <tr className="bg-surface-2/70"><th colSpan={5} scope="colgroup" className="px-4 py-2 text-start text-xs font-semibold text-muted">{GROUP[g][lang]}</th></tr>
                  {ENTITLEMENTS.filter((f) => f.group === g).map((f) => (
                    <tr key={f.id} className="border-b border-border last:border-0">
                      <th scope="row" className="px-4 py-2.5 text-start font-medium text-fg">{f.label[lang]}</th>
                      {PLANS.map((p) => {
                        const v = f.v[p];
                        return (
                          <td key={p} className="px-4 py-2.5">
                            {v === false ? <><Minus className="size-4 text-subtle" aria-hidden="true" /><span className="sr-only">{entLabel(v, lang)}</span></>
                              : v === true ? <><CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /><span className="sr-only">{entLabel(v, lang)}</span></>
                                : <span className="text-[13px] text-fg">{entLabel(v, lang)}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="flex items-center gap-1 border-t border-border px-5 py-3 text-xs text-muted">
          {tx('* «غير محدود» صياغة المصدر', '* “Unlimited” is source wording')}
          <InfoHint>{tx('الحدود التقنية والاستخدام العادل تُعرّف في عقد المنتج. المصدر يسمّي Basic «مجاني» وSpecial «مؤسسات» ولم يُعتمد أي منهما.', 'Technical and fair-use limits are set in the product contract. The source labels Basic “Free” and Special “Enterprise”; neither is approved.')}</InfoHint>
        </p>
      </Card>
      <Card aria-labelledby="pl-conf">
        <CardHeader id="pl-conf" title={tx('تعارضات تحتاج حسمًا', 'Conflicts to settle')} hint={tx('من مقارنة صفحات المخطط؛ تمنع تثبيت المزايا قبل القرار.', 'From comparing blueprint pages; they block fixing entitlements until decided.')} />
        <ol className="list-decimal space-y-2 px-5 pb-5 ps-10 text-sm text-fg marker:text-muted">
          <li>{tx('اختيار الثيم في كل الخطط مقابل منشئ الثيمات من Plus: حدّد الفرق.', 'Theme selection on all plans vs Theme Builder from Plus: define the difference.')}</li>
          <li>{tx('إنشاء شحنة في كل الخطط مقابل بوالص وأسطول لك من Plus: كيف تشحن Basic؟', 'Create shipment on all plans vs LAK labels/fleet from Plus: how does Basic ship?')}</li>
          <li>{tx('الموظفون في كل الخطط مقابل الأدوار من Pro: العزل الأساسي لا يكون ترقية مدفوعة.', 'Staff on all plans vs roles from Pro: basic isolation must not be a paid upgrade.')}</li>
          <li>{tx('الجملة مذكورة لكل الخطط في موضع ومن Plus في آخر.', 'Wholesale listed as all plans in one place and Plus+ in another.')}</li>
        </ol>
      </Card>
    </>
  );
}

const TONE: Record<PlanChange['status'], Tone> = { pending: 'amber', approved: 'green', rejected: 'red' };

function Changes({ role }: ScreenProps) {
  const tx = useTx();
  const { lang } = useLang();
  const f = useFmt();
  const toast = useToast();
  const state = useViewState();
  const stored = changesStore.use();
  const changes = state === 'empty' ? [] : stored;
  const stores = storesStore.use();
  const [dlg, setDlg] = useState<{ c: PlanChange; approve: boolean } | null>(null);
  const status = { pending: tx('بانتظار الاعتماد', 'Awaiting approval'), approved: tx('معتمد', 'Approved'), rejected: tx('مرفوض', 'Rejected') };

  if (changes.length === 0) return (
    <Card><EmptyState as="h2" icon={<Layers className="size-6" aria-hidden="true" />} title={tx('لا طلبات تغيير خطة', 'No plan change requests')}
      action={can(role, 'stores.view') ? <LinkButton variant="secondary" href={ahref('stores')}>{tx('افتح المتاجر', 'Open stores')}</LinkButton> : undefined}>
      {tx('يُقترح التغيير من صفحة المتجر، ثم يعتمده دور آخر.', 'A change is proposed from a store page, then another role approves it.')}
    </EmptyState></Card>
  );

  const name = (id: string) => stores.find((s) => s.id === id)?.name[lang] ?? id;
  return (
    <>
      {!can(role, 'plans.approve') && <Locked>{tx('الاعتماد للمالية أو المالك، وليس للدور الذي اقترح.', 'Approval is for Finance or Owner, and never the proposing role.')}</Locked>}
      <ul className="space-y-4">
        {changes.map((c) => {
          const store = stores.find((s) => s.id === c.storeId);
          const canDecide = can(role, 'plans.approve') && c.proposedBy !== role;
          const warns = store ? planWarnings({ ...store, plan: c.from }, c.to) : [];
          return (
            <li key={c.id}>
              <Card>
                <CardHeader title={<span className="min-w-0"><a className="hover:underline" href={ahref(`stores/${c.storeId}`)}>{name(c.storeId)}</a> · <bdi>{PLAN_NAME[c.from]} → {PLAN_NAME[c.to]}</bdi></span>} action={<Badge tone={TONE[c.status]}>{status[c.status]}</Badge>} />
                <div className="space-y-4 px-5 pb-5">
                  <Facts cols={3} items={[
                    { label: tx('اقترحه', 'Proposed by'), value: `${ROLE_LABEL[c.proposedBy][lang]} · ${f.dt(c.proposedAt)}` },
                    { label: tx('السريان', 'Takes effect'), value: c.effective === 'now' ? tx('فور الاعتماد', 'Right after approval') : tx('عند التجديد القادم', 'At next renewal') },
                    { label: tx('القرار', 'Decision'), value: c.decidedBy ? `${ROLE_LABEL[c.decidedBy][lang]} · ${f.dt(c.decidedAt!)}` : '—' },
                  ]} />
                  <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">«{c.reason}»{c.note && <> · {tx('ملاحظة القرار', 'Decision note')}: «{c.note}»</>}</p>
                  <details className="group">
                    <summary className="cursor-pointer text-[13px] font-semibold text-brand-700 dark:text-brand-300">{tx('قبل / بعد', 'Before / after')}</summary>
                    <div className="mt-3"><PlanDiff from={c.from} to={c.to} rows={planDiff(c.from, c.to).filter((d) => d.change !== 'same')} /></div>
                  </details>
                  {c.status === 'pending' && warns.length > 0 && <PlanWarnings warns={warns} />}
                  {c.status === 'pending' && (canDecide ? (
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => setDlg({ c, approve: true })}><CheckCircle2 className="size-4" aria-hidden="true" />{tx('اعتمد التغيير', 'Approve change')}</Button>
                      <Button variant="secondary" onClick={() => setDlg({ c, approve: false })}><XCircle className="size-4" aria-hidden="true" />{tx('ارفض', 'Reject')}</Button>
                    </div>
                  ) : c.proposedBy === role ? <Locked>{tx('اقترحت هذا التغيير بدورك الحالي؛ يعتمده دور آخر.', 'You proposed this with your current role; another role must approve.')}</Locked> : null)}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      {dlg && (
        <ReasonModal title={dlg.approve ? tx('اعتماد تغيير الخطة', 'Approve plan change') : tx('رفض تغيير الخطة', 'Reject plan change')}
          confirmLabel={dlg.approve ? tx('اعتمد', 'Approve') : tx('ارفض', 'Reject')} danger={!dlg.approve} optional={dlg.approve} onClose={() => setDlg(null)}
          target={<><p className="font-semibold text-fg">{name(dlg.c.storeId)}</p><p className="text-xs text-muted"><bdi>{PLAN_NAME[dlg.c.from]} → {PLAN_NAME[dlg.c.to]}</bdi> · {dlg.c.effective === 'now' ? tx('فور الاعتماد', 'Right after approval') : tx('عند التجديد القادم', 'At next renewal')}</p></>}
          onConfirm={(note) => { const e = decidePlan(dlg.c.id, dlg.approve, note); if (!e) toast({ tone: 'ok', text: dlg.approve ? tx('اعتُمد التغيير (محاكاة)', 'Change approved (simulated)') : tx('رُفض التغيير', 'Change rejected') }); return e; }}>
          <p className={cn('text-sm', dlg.approve ? 'text-fg' : 'text-muted')}>{dlg.approve
            ? (dlg.c.effective === 'now' ? tx('تتغير خطة المتجر الآن في البيانات التجريبية. لا تحصيل ولا استرداد.', 'The store’s plan changes now in demo data. No charge or refund.') : tx('ينتظر التغيير التجديد القادم (خادم الفوترة). المتجر لا يتغير الآن.', 'The change waits for the next renewal (billing backend). The store does not change now.'))
            : tx('يبقى المتجر على خطته الحالية.', 'The store stays on its current plan.')}</p>
        </ReasonModal>
      )}
    </>
  );
}
