// Finance: the customer-wallet liability. Store credit is money the store owes customers until it is spent or expires,
// so it sits next to the money states rather than inside them. Rules: merchant/wallet.ts walletLiability().
import { Wallet } from 'lucide-react';
import { link } from '../../../core/router';
import { testStore } from '../../merchant/stores';
import { canSee } from '../../merchant/perms';
import { walletLiability } from '../../merchant/wallet';
import { WALLET_TODAY, walletStore } from '../../merchant/wallet-store';
import { Card, InfoHint, Money, useTx } from '../../../ds/ui';

export function WalletLiabilityCard({ empty }: { empty?: boolean }) {
  const tx = useTx();
  const role = testStore.use().role;
  const ledger = walletStore.use();
  if (empty) return null;
  const li = walletLiability(ledger, WALLET_TODAY, 30);
  const parts: [string, number][] = [[tx('من استردادات', 'From refunds'), li.bySource.refund], [tx('كاش باك', 'Cashback'), li.bySource.cashback], [tx('إضافات يدوية', 'Manual credit'), li.bySource.credit + li.bySource.other]];
  return (
    <Card aria-labelledby="h-wliab" className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted" aria-hidden="true"><Wallet className="size-5" /></span>
          <div>
            <h2 id="h-wliab" className="flex items-center gap-1 text-[13px] font-medium text-muted">{tx('رصيد محافظ العملاء (التزام)', 'Customer wallet credit (liability)')}<InfoHint>{tx('رصيد غير مصروف وغير منتهٍ: لم يُخصم من تحويلاتك وليس إيرادًا جديدًا، لكن العملاء يستطيعون الدفع به. يقل عند الصرف أو الانتهاء.', 'Unspent, unexpired store credit: not deducted from payouts and not new revenue, but customers can pay with it. Falls when spent or expired.')}</InfoHint></h2>
            <p className="mt-1 text-xl font-bold tracking-tight text-fg sm:text-2xl"><Money v={li.outstanding} /></p>
            <p className="mt-0.5 text-xs text-muted">{tx(`${li.customers} عميل`, `${li.customers} customers`)}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-4">
          <div><dt className="text-muted">{tx('ينتهي خلال 30 يومًا', 'Expiring in 30 days')}</dt><dd className="font-semibold text-amber-700 dark:text-amber-300"><Money v={li.soon} /></dd></div>
          {parts.map(([k, v]) => <div key={k}><dt className="text-muted">{k}</dt><dd className="font-semibold text-fg"><Money v={v} /></dd></div>)}
        </dl>
      </div>
      {canSee(role, 'marketing') && <a href={link('/dashboard/marketing/wallet')} className="mt-3 inline-block text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('سجل المحفظة', 'Wallet ledger')}</a>}
    </Card>
  );
}
