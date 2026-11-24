// Service inbox (`#/dashboard/inbox`, one case at `/inbox/<id>`): one list for every after-sale conversation —
// complaints, return requests, product questions, shipping problems, negative reviews and messages — each linked to
// its order and customer. Desktop: list and case side by side; phone: list → case. Filters and views in the URL.
import { useEffect, useState } from 'react';
import { Download, Inbox as InboxIcon, Lock, MessageSquareReply, Plus, SearchX } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { navigate, type Route } from '../../../core/router';
import { formatInt } from '../../../core/format';
import { sla } from '../../merchant/inbox';
import { logAction } from '../../merchant/stores';
import { PageHeader, useToast } from '../../../ds/kit';
import { Button, Card, EmptyState, ErrorState, LinkButton, Skeleton, cn, useTx } from '../../../ds/ui';
import { setDashState, useDashState } from '../review';
import { download } from '../orders/bulk';
import { useActor } from '../orders/ui';
import { casesCsv, listCases, readQuery, toParams } from './model';
import { ihref, useCases } from './state';
import { CaseList } from './list';
import { CaseView, useCasePerms } from './case';
import { CannedModal, NewCaseModal } from './modals';

/** Re-render every minute so reply clocks stay honest. */
function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export default function Inbox({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const state = useDashState();
  const perms = useCasePerms();
  const who = useActor();
  const now = useNow();
  const { all: live, src } = useCases();
  const [dlg, setDlg] = useState<'canned' | 'new' | null>(null);
  const all = state === 'empty' ? [] : live;
  const id = route.path[0];
  const lq = readQuery(route.query);
  const listHref = ihref('', toParams(lq));
  const open = all.filter((c) => c.status !== 'resolved');
  const late = open.filter((c) => sla(c, now).state === 'breached').length;

  const header = (
    <PageHeader title={tx('صندوق الخدمة', 'Service inbox')}
      description={all.length ? tx(`${formatInt(open.length)} مفتوحة${late ? ` · ${formatInt(late)} تجاوزت المهلة` : ''}`, `${formatInt(open.length)} open${late ? ` · ${formatInt(late)} past due` : ''}`) : undefined}
      actions={perms.manage && state !== 'error' ? <div className="flex items-center gap-2">
        <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => setDlg('canned')}><MessageSquareReply className="size-4" aria-hidden="true" />{tx('الردود الجاهزة', 'Canned replies')}</Button>
        {all.length > 0 && <Button variant="ghost" className="hidden md:inline-flex" onClick={() => { const rows = listCases(all, lq, who.name, now).rows; download(`cases-${new Date().toISOString().slice(0, 10)}.csv`, casesCsv(rows, lang, now)); logAction('orders', { ar: `تصدير ${rows.length} حالة`, en: `Exported ${rows.length} case(s)` }); toast({ tone: 'ok', text: tx(`نُزّل ملف فيه ${formatInt(rows.length)} حالة`, `Downloaded ${formatInt(rows.length)} case(s)`) }); }}><Download className="size-4" aria-hidden="true" />{tx('تصدير', 'Export')}</Button>}
        <Button className="bg-brand-gradient hover:opacity-95" onClick={() => setDlg('new')}><Plus className="size-4" aria-hidden="true" />{tx('حالة جديدة', 'New case')}</Button>
      </div> : undefined} />
  );
  const dialogs = <>
    {dlg === 'canned' && <CannedModal onClose={() => setDlg(null)} />}
    {dlg === 'new' && <NewCaseModal onClose={(nid) => { setDlg(null); if (nid) { toast({ tone: 'ok', text: tx(`فُتحت الحالة ${nid}`, `Case ${nid} opened`) }); navigate(ihref(nid, toParams(lq))); } }} />}
  </>;

  if (!perms.manage) return (
    <div className="space-y-6">{header}<Card><EmptyState as="h2" icon={<Lock className="size-6" aria-hidden="true" />} title={tx('لا تملك صلاحية صندوق الخدمة', 'You do not have access to the service inbox')}>{tx('اطلب من مالك المتجر إضافة الطلبات أو مراسلة العملاء إلى دورك.', 'Ask the store owner to add orders or customer messaging to your role.')}</EmptyState></Card></div>
  );
  if (state === 'error') return (
    <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل الحالات', 'Cases could not load')} onRetry={() => setDashState('live')}>{tx('لم يتغير شيء في الحالات أو الطلبات. المرجع SIM-INBOX-503.', 'Nothing changed in cases or orders. Ref SIM-INBOX-503.')}</ErrorState></Card></div>
  );
  if (state === 'loading') return (
    <div className="space-y-6" aria-busy="true">{header}
      <Card className="divide-y divide-border">{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex items-start gap-3 px-5 py-4"><Skeleton className="size-9 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-2/3" /><Skeleton className="h-5 w-24" /></div></div>)}</Card>
    </div>
  );
  if (!all.length) return (
    <div className="space-y-6">{header}<Card><EmptyState as="h2" icon={<InboxIcon className="size-6" aria-hidden="true" />} title={tx('لا رسائل من العملاء بعد', 'No customer messages yet')}
      action={<LinkButton variant="secondary" href="#/store">{tx('افتح متجرك', 'Open your store')}</LinkButton>}>
      {tx('تصل هنا الشكاوى وأسئلة المنتجات ومشاكل الشحن من صفحات المتجر، مع التقييمات المنخفضة والمرتجعات.', 'Complaints, product questions and shipping problems arrive here from the store, with low reviews and returns.')}
    </EmptyState></Card>{dialogs}</div>
  );

  const c = id ? all.find((x) => x.id === id) : undefined;
  return (
    <div className="space-y-6">
      <div className={cn(id && 'hidden lg:block')}>{header}</div>
      <div className={cn('grid gap-6', id && 'lg:grid-cols-[320px_minmax(0,1fr)]')}>
        <Card className={cn('min-w-0 self-start', id && 'hidden lg:block')}>
          <CaseList route={route} all={all} me={who.name} now={now} current={id} canBulk={perms.manage} />
        </Card>
        {id && (c ? <CaseView key={c.id} c={c} all={all} src={src} now={now} backHref={listHref} /> : (
          <Card><EmptyState as="h2" icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا حالة بهذا الرقم', 'No case with this number')} action={<LinkButton variant="secondary" href={listHref}>{tx('كل الحالات', 'All cases')}</LinkButton>}>{id}</EmptyState></Card>
        ))}
      </div>
      {dialogs}
    </div>
  );
}
