// Saved views on the orders list: built-in tabs plus the viewer's pinned views, "Save view" for the current
// search and filters, and a manager to open, rename, pin and delete. Each team member keeps their own views.
import { useState, type ReactNode } from 'react';
import { Bookmark, BookmarkPlus, Pencil, Pin, PinOff, Settings2, Trash2 } from 'lucide-react';
import { link, navigate } from '../../../core/router';
import { logAction } from '../../merchant/stores';
import type { Order } from '../../merchant/domain';
import { Field, Input, Modal, Switch, Tabs, useToast } from '../../../ds/kit';
import { Badge, Button, IconButton, useTx } from '../../../ds/ui';
import { activeFilters, listOrders, readQuery, type ListQuery } from './model';
import { MAX_PINNED, VIEW_NAME_MAX, addView, currentView, pinView, removeView, renameView, restoreView, savedViewsStore, viewNameError, viewParams, type SavedView, type ViewNameError } from './saved-views';
import { Menu, MenuButtonLabel, MenuItem, MenuNote, ohref, useLabels } from './ui';

type Tab = { href: string; label: ReactNode; current: boolean; count?: number };
// `sv` keeps the tab key unique when a built-in tab carries the same filters; the list ignores it.
const hrefOf = (v: SavedView) => link('/dashboard/orders', { ...v.params, sv: v.id });

export function SavedViewsBar({ lq, all, views, viewer, builtin }: { lq: ListQuery; all: Order[]; views: SavedView[]; viewer: string; builtin: Tab[] }) {
  const tx = useTx();
  const toast = useToast();
  const [dialog, setDialog] = useState<'save' | 'manage' | null>(null);
  const cur = currentView(views, lq);
  const setViews = (f: (v: SavedView[]) => SavedView[]) => savedViewsStore.set((m) => ({ ...m, [viewer]: f(m[viewer] ?? []) }));
  // Something worth saving: a search, a filter or a sort beyond the built-in tab, not already saved.
  const savable = !cur && (lq.q.trim() !== '' || activeFilters(lq) > 0 || lq.sort !== 'new');
  const pinned = views.filter((v) => v.pinned);
  const items: Tab[] = [
    ...builtin.map((b) => ({ ...b, current: b.current && !cur })),
    ...pinned.map((v) => ({ href: hrefOf(v), label: <span className="inline-flex items-center gap-1.5"><Bookmark className="size-3.5" aria-hidden="true" />{v.name}</span>, current: cur?.id === v.id, count: listOrders(all, readQuery(new URLSearchParams(v.params))).rows.length })),
  ];
  const del = (v: SavedView) => {
    const at = views.findIndex((x) => x.id === v.id);
    setViews((l) => removeView(l, v.id));
    logAction('orders', { ar: `حُذف عرض محفوظ «${v.name}»`, en: `Saved view “${v.name}” deleted` });
    toast({ tone: 'info', text: tx(`حُذف «${v.name}»`, `“${v.name}” deleted`), action: { label: tx('تراجع', 'Undo'), run: () => setViews((l) => restoreView(l, v, at)) } });
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1"><Tabs label={tx('العروض', 'Views')} items={items} /></div>
      <div className="flex shrink-0 items-center gap-1 pb-1.5">
        {savable && <Button size="sm" variant="ghost" onClick={() => setDialog('save')}><BookmarkPlus className="size-4" aria-hidden="true" />{tx('احفظ العرض', 'Save view')}</Button>}
        {cur && <Badge tone="brand" icon={<Bookmark className="size-3" aria-hidden="true" />}>{cur.name}</Badge>}
        <Menu label={tx('عروضي المحفوظة', 'My saved views')} size="sm" variant="ghost" align="start" button={<MenuButtonLabel icon={<Bookmark className="size-4" aria-hidden="true" />}>{tx(`عروضي${views.length ? ` (${views.length})` : ''}`, `My views${views.length ? ` (${views.length})` : ''}`)}</MenuButtonLabel>}>
          {(close) => <>
            {views.length === 0 && <MenuNote>{tx('ابحث أو صفِّ، ثم «احفظ العرض» ليظهر هنا.', 'Search or filter, then “Save view” to keep it here.')}</MenuNote>}
            {views.map((v) => <MenuItem key={v.id} icon={v.pinned ? <Pin className="size-4" /> : <Bookmark className="size-4" />} onClick={() => { close(); navigate(hrefOf(v)); }}>{v.name}</MenuItem>)}
            {views.length > 0 && <MenuItem icon={<Settings2 className="size-4" />} onClick={() => { close(); setDialog('manage'); }}>{tx('إدارة العروض', 'Manage views')}</MenuItem>}
          </>}
        </Menu>
      </div>
      {dialog === 'save' && <SaveViewModal lq={lq} views={views} onClose={(id, name) => {
        setDialog(null);
        if (id) toast({ tone: 'ok', text: tx(`حُفظ العرض «${name}»`, `View “${name}” saved`) });
      }} setViews={setViews} />}
      {dialog === 'manage' && <ManageViewsModal views={views} setViews={setViews} onDelete={del} onClose={() => setDialog(null)} />}
    </div>
  );
}

function useNameError() {
  const tx = useTx();
  return (e: ViewNameError | null) => (e === 'empty' ? tx('اكتب اسمًا', 'Enter a name') : e === 'long' ? tx(`حتى ${VIEW_NAME_MAX} حرفًا`, `Up to ${VIEW_NAME_MAX} characters`) : e === 'taken' ? tx('عندك عرض بهذا الاسم', 'You already have a view with this name') : null);
}

function SaveViewModal({ lq, views, setViews, onClose }: { lq: ListQuery; views: SavedView[]; setViews: (f: (v: SavedView[]) => SavedView[]) => void; onClose: (id?: string, name?: string) => void }) {
  const tx = useTx();
  const L = useLabels();
  const nameErr = useNameError();
  const [name, setName] = useState('');
  const full = views.filter((v) => v.pinned).length >= MAX_PINNED;
  const [pin, setPin] = useState(!full);
  const [tried, setTried] = useState(false);
  const err = viewNameError(name, views);
  const nf = activeFilters(lq);
  const save = () => {
    setTried(true);
    if (err) return;
    const r = addView(views, name, viewParams(lq), pin, Date.now());
    if (!r.id) return;
    setViews(() => r.views);
    logAction('orders', { ar: `حُفظ عرض الطلبات «${name.trim()}»`, en: `Orders view “${name.trim()}” saved` });
    onClose(r.id, name.trim());
  };
  return (
    <Modal title={tx('حفظ العرض', 'Save view')} onClose={() => onClose()}
      footer={<><Button variant="secondary" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={save}><BookmarkPlus className="size-4" aria-hidden="true" />{tx('احفظ', 'Save')}</Button></>}>
      <Field label={tx('الاسم', 'Name')} error={tried ? nameErr(err) : null}>{(p) => <Input {...p} value={name} maxLength={VIEW_NAME_MAX + 5} autoFocus placeholder={tx('مثال: تحويلات الرياض', 'e.g. Riyadh transfers')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />}</Field>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <Badge tone="gray">{L.view(lq.view)}</Badge>
        {lq.q.trim() && <Badge tone="gray">{tx('بحث', 'Search')}: «{lq.q.trim()}»</Badge>}
        {nf > 0 && <Badge tone="gray">{tx(`${nf} مرشحات`, `${nf} filters`)}</Badge>}
        {lq.sort !== 'new' && <Badge tone="gray">{L.sort(lq.sort)}</Badge>}
      </div>
      <label className="flex items-center justify-between gap-3 text-sm text-fg">
        <span>{tx('ثبّته كتبويب', 'Pin as a tab')}{full && <span className="block text-xs text-muted">{tx(`حد التثبيت ${MAX_PINNED}؛ ألغِ تثبيت عرض آخر أولًا`, `Up to ${MAX_PINNED} pinned; unpin another first`)}</span>}</span>
        <Switch checked={pin} disabled={full} onChange={setPin} label={tx('ثبّته كتبويب', 'Pin as a tab')} />
      </label>
      <p className="text-xs text-muted">{tx('يظهر لك وحدك في هذه الجلسة.', 'Only you see it, in this session.')}</p>
    </Modal>
  );
}

function ManageViewsModal({ views, setViews, onDelete, onClose }: { views: SavedView[]; setViews: (f: (v: SavedView[]) => SavedView[]) => void; onDelete: (v: SavedView) => void; onClose: () => void }) {
  const tx = useTx();
  const nameErr = useNameError();
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [err, setErr] = useState<ViewNameError | null>(null);
  const full = views.filter((v) => v.pinned).length >= MAX_PINNED;
  const commit = () => {
    if (!editing) return;
    const r = renameView(views, editing.id, editing.name);
    if (r.error) { setErr(r.error); return; }
    setViews(() => r.views); setEditing(null); setErr(null);
    logAction('orders', { ar: `أُعيدت تسمية عرض إلى «${editing.name.trim()}»`, en: `View renamed to “${editing.name.trim()}”` });
  };
  return (
    <Modal title={tx('إدارة العروض', 'Manage views')} onClose={onClose} footer={<Button onClick={onClose}>{tx('تم', 'Done')}</Button>}>
      {views.length === 0 ? <p className="text-sm text-muted">{tx('لا عروض محفوظة.', 'No saved views.')}</p> : (
        <ul className="divide-y divide-border !rounded-xl !border !border-border">
          {views.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              {editing?.id === v.id ? (
                <form className="flex min-w-0 flex-1 flex-wrap items-start gap-2" onSubmit={(e) => { e.preventDefault(); commit(); }}>
                  <div className="min-w-0 flex-1"><Input aria-label={tx('الاسم الجديد', 'New name')} autoFocus value={editing.name} aria-invalid={!!err} onChange={(e) => { setEditing({ ...editing, name: e.target.value }); setErr(null); }} />
                    {err && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{nameErr(err)}</p>}</div>
                  <Button size="sm" type="submit">{tx('احفظ', 'Save')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setErr(null); }}>{tx('إلغاء', 'Cancel')}</Button>
                </form>
              ) : (
                <>
                  <a href={ohref('', v.params)} onClick={onClose} className="min-w-0 flex-1 truncate text-sm font-medium text-fg hover:underline">{v.name}</a>
                  <IconButton label={v.pinned ? tx(`ألغِ تثبيت ${v.name}`, `Unpin ${v.name}`) : tx(`ثبّت ${v.name}`, `Pin ${v.name}`)} disabled={!v.pinned && full} onClick={() => setViews((l) => pinView(l, v.id, !v.pinned))}>{v.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}</IconButton>
                  <IconButton label={tx(`أعد تسمية ${v.name}`, `Rename ${v.name}`)} onClick={() => setEditing({ id: v.id, name: v.name })}><Pencil className="size-4" /></IconButton>
                  <IconButton label={tx(`احذف ${v.name}`, `Delete ${v.name}`)} onClick={() => onDelete(v)}><Trash2 className="size-4" /></IconButton>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {full && <p className="text-xs text-muted">{tx(`ثبّتّ ${MAX_PINNED} عروض، وهو الحد.`, `${MAX_PINNED} views are pinned, the limit.`)}</p>}
    </Modal>
  );
}
