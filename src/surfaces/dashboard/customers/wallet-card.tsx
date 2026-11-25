// Customer profile: wallet balance, what expires soon, the latest movements with what caused them, and manual
// credit/debit (the same previewed flow as Marketing → Customer wallet). Rules: merchant/wallet.ts.
import { useState } from 'react';
import { Clock, Wallet } from 'lucide-react';
import { link } from '../../../core/router';
import { testStore } from '../../merchant/stores';
import { can } from '../../merchant/perms';
import type { Customer } from '../../merchant/workspace';
import { expiringSoon, walletBalance } from '../../merchant/wallet';
import { WALLET_TODAY, walletSettingsStore, walletStore } from '../../merchant/wallet-store';
import { Badge, Button, Card, CardHeader, Money, Ref, useTx } from '../../../ds/ui';
import { AdjustModal, KIND_TONE, useKindName } from '../marketing/wallet-parts';
import { Signed } from '../marketing/wallet';

export function WalletCard({ c }: { c: Customer }) {
  const tx = useTx();
  const kindName = useKindName();
  const role = testStore.use().role;
  const ledger = walletStore.use();
  const settings = walletSettingsStore.use();
  const [modal, setModal] = useState<'credit' | 'debit' | null>(null);
  const bal = walletBalance(ledger, c.id);
  const mine = ledger.filter((t) => t.customerId === c.id);
  const soon = expiringSoon(mine, WALLET_TODAY, 30);
  const manage = can(role, 'marketing.manage');
  return (
    <Card aria-labelledby="h-wal">
      <CardHeader id="h-wal" title={tx('المحفظة', 'Wallet')} action={<a href={link('/dashboard/marketing/wallet', { q: c.id })} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('السجل', 'Ledger')}</a>} />
      <div className="space-y-3 px-5 pb-5">
        <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
          <Wallet className="size-5 text-brand-600 dark:text-brand-300" aria-hidden="true" />
          <div className="min-w-0 flex-1"><p className="text-lg font-bold text-fg"><Money v={bal} /></p><p className="flex items-center gap-1 text-xs text-muted">{tx('رصيد قابل للصرف', 'Spendable credit')}{!settings.enabled && <Badge tone="gray">{tx('الدفع من المحفظة موقوف', 'Wallet payments off')}</Badge>}</p></div>
        </div>
        {soon.map((s) => (
          <p key={s.expires} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-300">
            <Clock className="size-3.5" aria-hidden="true" /><Money v={s.amount} /> {tx('ينتهي', 'expires')} <Ref>{s.expires}</Ref>
          </p>
        ))}
        {mine.length === 0 ? <p className="text-[13px] text-muted">{tx('لا حركات في محفظته.', 'No wallet movements.')}</p> : (
          <ul className="space-y-1.5 text-[13px]">
            {mine.slice(0, 4).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-muted"><Badge tone={KIND_TONE[t.kind]}>{kindName(t.kind)}</Badge>{t.orderRef && <> · <a className="hover:underline" href={link(`/dashboard/orders/${t.orderRef}`)}><Ref>#{t.orderRef}</Ref></a></>}</span>
                <Signed v={t.amount} />
              </li>
            ))}
          </ul>
        )}
        {manage && <div className="flex flex-wrap gap-2 pt-1"><Button size="sm" variant="secondary" onClick={() => setModal('credit')}>{tx('أضف رصيدًا', 'Add credit')}</Button>{bal > 0 && <Button size="sm" variant="ghost" onClick={() => setModal('debit')}>{tx('اخصم', 'Debit')}</Button>}</div>}
      </div>
      {modal && <AdjustModal customerId={c.id} dir={modal} onClose={() => setModal(null)} />}
    </Card>
  );
}
