// Publishing accounts: the app is published under the merchant's own Apple and Google developer accounts.
// Signing secrets stay on LAK's signing server and never reach this page or the browser.
import { useState } from 'react';
import { Check, Circle, KeyRound, Link2, Unlink } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Ref, cn, useTx } from '../../../ds/ui';
import { Alert, Modal, Simulated, useToast } from '../../../ds/kit';
import { PLATFORMS, type Platform } from '../../appmaker/domain';
import { Locked } from '../marketing/access';
import { StoreIcon } from './overview';
import { useAppData, useS } from './parts';
import { appStore } from './state';

const TEAM: Record<Platform, string> = { ios: 'Dar Nuwa Trading (7XK2M4Q9TA)', android: 'Dar Nuwa Trading · 4821-0937' };

export default function Accounts({ canManage }: { canManage: boolean }) {
  const tx = useTx();
  const S = useS();
  const toast = useToast();
  const { s } = useAppData();
  const [dlg, setDlg] = useState<{ p: Platform; to: 'connected' | 'missing' } | null>(null);
  const name = (p: Platform) => (p === 'ios' ? S.apple : S.google);

  return (
    <div className="space-y-6">
      <Alert tone="info" title={tx('أسرار التوقيع على الخادم', 'Signing secrets stay on the server')}>
        {tx('شهادات Apple ومفاتيح Android تُحفظ في خادم التوقيع لدى «لك»، ولا تُعرض أو تُخزَّن هنا. الربط يمنح صلاحية النشر فقط.', 'Apple certificates and Android keys live on LAK’s signing server and are never shown or stored here. Connecting grants publishing access only.')}
      </Alert>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {PLATFORMS.map((p) => {
          const on = s.accounts[p] === 'connected';
          const needs = p === 'ios' ? S.appleNeeds : S.googleNeeds;
          return (
            <Card key={p} aria-labelledby={`am-acc-${p}`}>
              <CardHeader id={`am-acc-${p}`} title={<span className="inline-flex items-center gap-2"><StoreIcon p={p} />{name(p)}</span>} action={<Badge tone={on ? 'green' : 'red'}>{on ? tx('متصل', 'Connected') : tx('غير متصل', 'Not connected')}</Badge>} />
              <div className="space-y-4 px-5 pb-5">
                {on ? <p className="text-sm"><span className="text-muted">{tx('الحساب: ', 'Account: ')}</span><Ref>{TEAM[p]}</Ref></p>
                  : <p className="text-sm text-amber-800 dark:text-amber-300">{tx('لا يمكن الإرسال لهذا المتجر حتى تربطه. المتجر الآخر غير متأثر.', 'You cannot submit to this store until it is connected. The other store is unaffected.')}</p>}
                <ul className="space-y-2">
                  {needs.map((n) => (
                    <li key={n} className="flex items-start gap-2 text-[13px] text-fg">
                      <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', on ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'border border-dashed border-border text-subtle')} aria-hidden="true">{on ? <Check className="size-3" /> : <Circle className="size-1.5 fill-current" />}</span>
                      {n}<span className="sr-only"> — {on ? tx('مكتمل', 'done') : tx('غير مكتمل', 'not done')}</span>
                    </li>
                  ))}
                </ul>
                {canManage
                  ? on ? <Button variant="secondary" size="sm" onClick={() => setDlg({ p, to: 'missing' })}><Unlink className="size-4" aria-hidden="true" />{tx('افصل', 'Disconnect')}</Button>
                    : <Button size="sm" onClick={() => setDlg({ p, to: 'connected' })}><Link2 className="size-4" aria-hidden="true" />{tx('اربط الحساب', 'Connect account')}</Button>
                  : <Locked>{tx('ربط الحسابات لمالك المتجر', 'Connecting accounts is for the store owner')}</Locked>}
              </div>
            </Card>
          );
        })}
      </div>

      {dlg && (
        <Modal title={dlg.to === 'connected' ? tx(`ربط ${name(dlg.p)}`, `Connect ${name(dlg.p)}`) : tx(`فصل ${name(dlg.p)}`, `Disconnect ${name(dlg.p)}`)} onClose={() => setDlg(null)}
          footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</Button>
            <Button variant={dlg.to === 'connected' ? 'primary' : 'danger'} onClick={() => {
              appStore.set((x) => ({ ...x, accounts: { ...x.accounts, [dlg.p]: dlg.to } }));
              toast({ tone: 'ok', text: dlg.to === 'connected' ? tx('رُبط الحساب (محاكاة)', 'Account connected (simulated)') : tx('فُصل الحساب (محاكاة)', 'Account disconnected (simulated)') });
              setDlg(null);
            }}>{dlg.to === 'connected' ? tx('اربط', 'Connect') : tx('افصل', 'Disconnect')}</Button></>}>
          {dlg.to === 'connected' ? (
            <>
              <p className="text-sm text-fg">{tx('تدعو «لك» إلى حسابك بصلاحية إصدار التطبيقات فقط. لا تُطلب كلمة مرورك.', 'You invite LAK to your account with release access only. Your password is never asked for.')}</p>
              <p className="flex items-center gap-2 text-[13px] text-muted"><KeyRound className="size-4" aria-hidden="true" />{tx('مفاتيح التوقيع تُنشأ على الخادم.', 'Signing keys are created on the server.')}</p>
            </>
          ) : <p className="text-sm text-fg">{S.disconnectBody}</p>}
          <Simulated />
        </Modal>
      )}
    </div>
  );
}
