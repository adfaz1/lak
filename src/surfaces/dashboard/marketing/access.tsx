// Shared by the marketing, automations, storefront and apps sections: role access states and a
// review-only role switch (so the no-permission states can be inspected). Roles come from merchant/perms.ts.
import { Lock } from 'lucide-react';
import { useReviewMode } from '../../../core/review';
import { ROLES, type Role } from '../../merchant/perms';
import { testStore } from '../../merchant/stores';
import { Card, EmptyState, LinkButton, Segmented, useTx } from '../../../ds/ui';
import { link } from '../../../core/router';

export const useRole = (): Role => testStore.use().role;

export function roleName(r: Role, tx: (a: string, e: string) => string) {
  return { owner: tx('المالك', 'Owner'), fulfilment: tx('التجهيز', 'Fulfilment'), finance: tx('المالية', 'Finance'), marketing: tx('التسويق', 'Marketing') }[r];
}

/** Whole page withheld: says why and where to go, without revealing the page's data. */
export function NoAccess({ title }: { title: string }) {
  const tx = useTx();
  const role = useRole();
  return (
    <Card>
      <EmptyState as="h2" icon={<Lock className="size-6" aria-hidden="true" />} title={title}
        action={<LinkButton variant="secondary" href={link('/dashboard')}>{tx('الرئيسية', 'Home')}</LinkButton>}>
        {tx(`دورك (${roleName(role, tx)}) لا يشمل هذا القسم. اطلب من مالك المتجر تعديل دورك.`, `Your role (${roleName(role, tx)}) does not include this section. Ask the store owner to change your role.`)}
      </EmptyState>
    </Card>
  );
}

/** A single action withheld: short reason in place of the button. */
export function Locked({ children }: { children: string }) {
  return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted"><Lock className="size-3.5" aria-hidden="true" />{children}</span>;
}

/** Review mode only: switch the simulated staff role to inspect permission states. */
export function ReviewRole() {
  const tx = useTx();
  const on = useReviewMode();
  const role = useRole();
  if (!on) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2">
      <span className="text-xs font-semibold text-muted">{tx('مراجعة: الدور', 'Review: role')}</span>
      <Segmented label={tx('الدور', 'Role')} value={role} onChange={(r) => testStore.set((t) => ({ ...t, role: r }))}
        options={ROLES.map((r) => ({ value: r, label: roleName(r, tx) }))} />
    </div>
  );
}
