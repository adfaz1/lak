// One affiliate (`#/dashboard/marketing/affiliates/<id>`): tracked link and code, totals, every credited order with its
// commission state, statement export, invitation (simulated), pause/resume and edit. Also used for influencers' statements.
import { useState } from 'react';
import { Download, Pause, Pencil, Play, Send, UserX } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link } from '../../../core/router';
import { logAction, productsStore } from '../../merchant/stores';
import { partnerTotals, type CommissionLine, type Partner } from '../../merchant/growth';
import { Badge, Button, Card, CardHeader, EmptyState, Money, Ref, useTx } from '../../../ds/ui';
import { DataTable, Modal, PageHeader, Simulated, useToast, type Column } from '../../../ds/kit';
import { Kpi } from './loyalty';
import { ExampleTag, LinkCodeCard, PartnerModal, StateBadge, rateLabel, useCommission } from './affiliate-parts';
import { commissionRulesStore, partnerVisitsStore, partnersStore } from './affiliates-store';
import { exportStatement } from './affiliates';

export default function AffiliateDetail({ id, canManage }: { id: string; canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const p = partnersStore.use().find((x) => x.id === id && x.kind === 'affiliate');
  const products = productsStore.use();
  const rules = commissionRulesStore.use();
  const visits = partnerVisitsStore.use();
  const { lines: all, returnDays } = useCommission();
  const [edit, setEdit] = useState(false);
  const [invite, setInvite] = useState(false);
  const back = { href: link('/dashboard/marketing/affiliates'), label: tx('المسوقون', 'Affiliates') };
  if (!p) return (
    <div className="space-y-6"><PageHeader back={back} title={tx('المسوّق غير موجود', 'Affiliate not found')} />
      <Card><EmptyState as="h2" icon={<UserX className="size-6" aria-hidden="true" />} title={tx('ربما حُذف أو الرابط خاطئ', 'It may have been removed, or the link is wrong')} /></Card></div>
  );
  const lines = all.filter((l) => l.partnerId === p.id);
  const t = partnerTotals(lines);
  const setStatus = (status: Partner['status']) => {
    partnersStore.set((l) => l.map((x) => (x.id === p.id ? { ...x, status } : x)));
    logAction('marketing', { ar: `${status === 'paused' ? 'إيقاف' : 'تفعيل'} المسوّق ${p.name}`, en: `${status === 'paused' ? 'Paused' : 'Activated'} affiliate ${p.name}` }, { target: p.id, before: p.status, after: status });
    toast({ tone: 'ok', text: status === 'paused' ? tx('أُوقف. الرابط والكود لا يحتسبان طلبات جديدة.', 'Paused. The link and code credit no new orders.') : tx('صار نشطًا.', 'Now active.') });
  };
  const sendInvite = () => {
    logAction('marketing', { ar: `إعادة إرسال دعوة ${p.name} (محاكاة)`, en: `Resent invitation to ${p.name} (simulated)` }, { target: p.id });
    setInvite(false);
    toast({ tone: 'ok', text: tx('أُرسلت الدعوة (محاكاة).', 'Invitation sent (simulated).') });
  };
  const cols: Column<CommissionLine>[] = [
    { key: 'r', header: tx('الطلب', 'Order'), cell: (l) => <a className="font-semibold text-fg hover:text-brand-700" href={link(`/dashboard/orders/${l.ref}`)}>#<Ref>{l.ref}</Ref></a> },
    { key: 'v', header: tx('المصدر', 'Source'), hideBelow: 'md', cell: (l) => <span className="text-[13px] text-muted">{l.via === 'code' ? tx('كود', 'Code') : tx('رابط', 'Link')}</span> },
    { key: 's', header: tx('الحالة', 'State'), cell: (l) => <span className="flex flex-wrap items-center gap-1"><StateBadge s={l.state} />{l.flags.includes('self') && <Badge tone="red">{tx('شراء ذاتي', 'Self-referral')}</Badge>}{l.flags.includes('refund') && <Badge tone="gray">{tx('استرداد', 'Refund')}</Badge>}</span> },
    { key: 'b', header: tx('المبيعات', 'Sales'), align: 'end', hideBelow: 'md', cell: (l) => <Money v={l.revenue} /> },
    { key: 'a', header: tx('العمولة', 'Commission'), align: 'end', cell: (l) => <Money v={l.amount} /> },
  ];
  const statusText = { invited: tx('مدعو', 'Invited'), active: tx('نشط', 'Active'), paused: tx('موقوف', 'Paused') }[p.status];
  return (
    <div className="space-y-6 pb-20">
      <PageHeader back={back} title={<span className="flex flex-wrap items-center gap-2">{p.name}{p.example && <ExampleTag />}<Badge tone={p.status === 'active' ? 'green' : p.status === 'invited' ? 'sky' : 'gray'}>{statusText}</Badge></span>}
        meta={<span className="text-xs text-muted">{[p.email, p.phone].filter(Boolean).join(' · ')} · {tx(`أُضيف ${p.addedAt}`, `Added ${p.addedAt}`)}</span>}
        actions={canManage ? <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setEdit(true)}><Pencil className="size-4" aria-hidden="true" />{tx('تعديل', 'Edit')}</Button>
          {p.status === 'invited' && <Button variant="secondary" onClick={() => setInvite(true)}><Send className="size-4" aria-hidden="true" />{tx('أعد الدعوة', 'Resend invite')}</Button>}
          {p.status === 'paused' ? <Button variant="secondary" onClick={() => setStatus('active')}><Play className="size-4" aria-hidden="true" />{tx('فعّل', 'Activate')}</Button> : <Button variant="secondary" onClick={() => setStatus('paused')}><Pause className="size-4" aria-hidden="true" />{tx('أوقف', 'Pause')}</Button>}
          <Button onClick={() => exportStatement(p, all, lang)}><Download className="size-4" aria-hidden="true" />{tx('صدّر الكشف', 'Export statement')}</Button>
        </div> : <Button onClick={() => exportStatement(p, all, lang)}><Download className="size-4" aria-hidden="true" />{tx('صدّر الكشف', 'Export statement')}</Button>} />

      <section aria-label={tx('ملخص المسوّق', 'Affiliate summary')} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label={tx('زيارات الرابط', 'Link visits')} hint={tx('في هذه الجلسة (محاكاة).', 'In this session (simulated).')} value={visits[p.code] ?? 0} />
        <Kpi label={tx('طلبات ومبيعات', 'Orders · sales')} value={<span className="flex flex-wrap items-baseline gap-2">{t.orders}<span className="text-sm font-medium text-muted"><Money v={t.revenue} /></span></span>} />
        <Kpi label={tx('معلّقة', 'Pending')} hint={tx(`حتى انتهاء مهلة الإرجاع (${returnDays} يومًا).`, `Until the return window ends (${returnDays} days).`)} value={<Money v={t.pending} />} />
        <Kpi label={tx('معتمدة · مدفوعة', 'Approved · paid')} value={<span className="flex flex-wrap items-baseline gap-2"><Money v={t.approved - t.clawback} /><span className="text-sm font-medium text-muted"><Money v={t.paid} /></span></span>} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="h-stmt">
          <CardHeader id="h-stmt" title={tx('كشف الحساب', 'Statement')} hint={tx('كل طلب محتسب لهذا المسوّق، بعمولته وحالتها. الاسترداد يخفض العمولة أو يلغيها.', 'Every order credited to this affiliate, its commission and state. Refunds lower or reverse it.')} />
          {lines.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">{tx('لا طلبات بعد. شارك الرابط أو الكود.', 'No orders yet. Share the link or code.')}</p> : (
            <div className="border-t border-border">
              <DataTable label={tx('كشف الحساب', 'Statement')} rows={lines} columns={cols} rowKey={(l) => l.ref}
                card={(l) => <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-fg">#<Ref>{l.ref}</Ref></p><p className="mt-1"><StateBadge s={l.state} /></p></div><Money v={l.amount} /></div>} />
            </div>
          )}
        </Card>
        <div className="space-y-6">
          <Card aria-labelledby="h-link"><CardHeader id="h-link" title={tx('الرابط والكود', 'Link & code')} /><LinkCodeCard p={p} products={products} /></Card>
          <Card aria-labelledby="h-rate"><CardHeader id="h-rate" title={tx('العمولة', 'Commission')} />
            <p className="px-5 pb-5 text-sm text-fg">{rateLabel(p.rate, rules.base, tx)} · <span className="text-muted">{tx(`احتساب ${rules.cookieDays} يومًا بعد النقر`, `${rules.cookieDays}-day credit window`)}</span></p></Card>
        </div>
      </div>
      {edit && <PartnerModal kind="affiliate" editing={p} onClose={() => setEdit(false)} />}
      {invite && (
        <Modal title={tx('إعادة إرسال الدعوة', 'Resend the invitation')} onClose={() => setInvite(false)} footer={<><Button variant="secondary" onClick={() => setInvite(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={sendInvite}>{tx('أرسل', 'Send')}</Button></>}>
          <p className="text-sm text-fg">{tx(`إلى ${p.email ?? p.phone}: رابطك ${'#/store?ref=' + p.code}`, `To ${p.email ?? p.phone}: your link ${'#/store?ref=' + p.code}`)}</p>
          <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('لا تُرسل رسالة فعلية في هذا العرض.', 'No real message is sent in this demo.')}</p>
        </Modal>
      )}
    </div>
  );
}
