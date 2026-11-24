// Notifications about the shopper's orders. Each names the store and links to the order.
import { Bell, Package, RotateCcw, Truck, PackageCheck } from 'lucide-react';
import { Button, Card, EmptyState, Ref, cn, useTx } from '../../../ds/ui';
import { marketStore, useScreen } from '../state';
import { fmtDate, sellerOf, useMk } from '../ui';
import { ListSkeleton, PageError, Title } from './common';

const ICON = { orderPlaced: Package, shipped: Truck, delivered: PackageCheck, returnRequested: RotateCcw, restock: Bell } as const;

export default function AlertsPage() {
  const { t, lang, go } = useMk();
  const tx = useTx();
  const screen = useScreen();
  const s = marketStore.use();
  const notes = screen === 'empty' ? [] : s.notes;
  const unread = notes.some((n) => !n.read);
  const markAll = () => marketStore.set((x) => ({ ...x, notes: x.notes.map((n) => ({ ...n, read: true })) }));
  return (
    <>
      <Title actions={unread && screen === 'live' ? <Button variant="secondary" size="sm" onClick={markAll}>{t.markAll}</Button> : undefined}>{t.notesTitle}</Title>
      {screen === 'error' ? <PageError title={tx('تعذّر تحميل الإشعارات', 'Notifications could not load')} refCode="SIM-MKT-NTF-503" />
        : screen === 'loading' ? <ListSkeleton n={4} />
        : notes.length === 0 ? <Card><EmptyState as="h2" icon={<Bell className="size-6" aria-hidden="true" />} title={t.notesEmpty}>{tx('نبلغك هنا بتقدم طلباتك من كل متجر.', 'We tell you here how your orders progress, store by store.')}</EmptyState></Card>
        : (
          <Card>
            <ul className="divide-y divide-border">
              {notes.map((n) => {
                const o = s.orders.find((x) => x.ref === n.ref);
                const seller = o && sellerOf(o.seller);
                const Icon = ICON[n.kind];
                return (
                  <li key={n.id}>
                    <a href={n.ref ? go(`/orders/${n.ref}`) : go('')} onClick={() => marketStore.set((x) => ({ ...x, notes: x.notes.map((y) => (y.id === n.id ? { ...y, read: true } : y)) }))}
                      className={cn('flex items-center gap-3 px-5 py-4 transition-colors hover:bg-surface-2/50', !n.read && 'bg-brand-500/[.04]')}>
                      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', n.read ? 'bg-surface-2 text-muted' : 'bg-brand-500/10 text-brand-700 dark:text-brand-300')}><Icon className="size-5" aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-sm text-fg', !n.read && 'font-semibold')}>{t.noteText[n.kind]}</span>
                        <span className="block truncate text-xs text-muted">{n.ref && <><Ref>{n.ref}</Ref> · </>}{seller ? `${seller.name[lang]} · ` : ''}{fmtDate(n.at, lang)}</span>
                      </span>
                      {!n.read && <span className="size-2.5 shrink-0 rounded-full bg-brand-600"><span className="sr-only">{t.unread}</span></span>}
                    </a>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
    </>
  );
}
