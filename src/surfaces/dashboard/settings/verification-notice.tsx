// The payouts notice for store verification. One component, one status source (merchant/verification-store.ts),
// so every screen that mentions payouts says the same thing. Finance can mount <PayoutHoldNotice /> above payouts.
import { BadgeCheck } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { Badge, LinkButton, useTx } from '../../../ds/ui';
import { Alert } from '../../../ds/kit';
import { maskIban } from '../../merchant/finance';
import { STATUS_TONE, summary, type VStatus } from '../../merchant/verification';
import { verificationStore } from '../../merchant/verification-store';
import { settingsHref } from './common';

/** Nothing when verified (unless `always`); otherwise why payouts wait and the one action that releases them. */
export function PayoutHoldNotice({ always, action = true }: { always?: boolean; action?: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const v = verificationStore.use();
  const s = summary(v);
  if (!s.held) {
    if (!always) return null;
    return <Alert tone="ok" title={tx('المتجر موثّق والتحويلات تعمل', 'The store is verified and payouts are on')}>
      {v.form.iban ? tx(`تُحوَّل المبالغ إلى الحساب ${maskIban(v.form.iban)}.`, `Payouts go to account ${maskIban(v.form.iban)}.`) : null}
    </Alert>;
  }
  const cta = v.status === 'not_started' ? tx('ابدأ التوثيق', 'Start verification') : v.status === 'needs_info' || v.status === 'rejected' ? tx('أكمل التوثيق', 'Complete verification') : tx('حالة التوثيق', 'Verification status');
  return (
    <Alert tone={v.status === 'submitted' || v.status === 'under_review' ? 'info' : 'warn'} title={tx('التحويلات محجوزة حتى يُوثَّق المتجر', 'Payouts are held until the store is verified')}
      action={action ? <LinkButton size="sm" variant="secondary" href={settingsHref('verification')}>{cta}</LinkButton> : undefined}>
      {tx('المبيعات تُحصَّل وتبقى معلّقة، ولا يُحوَّل شيء لحسابك قبل التوثيق.', 'Sales are still collected and stay pending; nothing is paid to your bank before verification.')} {s.next[lang]}.
    </Alert>
  );
}

/** Compact status badge for headers and lists. */
export function VerificationBadge({ status }: { status?: VStatus }) {
  const tx = useTx();
  const v = verificationStore.use();
  const s = summary(status ? { ...v, status } : v);
  return <Badge tone={STATUS_TONE[s.status]} icon={s.status === 'verified' ? <BadgeCheck className="size-3.5" aria-hidden="true" /> : undefined}>{tx(s.label.ar, s.label.en)}</Badge>;
}
