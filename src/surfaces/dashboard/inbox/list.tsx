// Inbox list: views as tabs (built-in + saved), search, filters, sort and page in the URL; selection with bulk
// assign / close (previewed first). Rendered full width, or as the left column while a case is open.
import { useState } from 'react';
import { ArrowUpDown, BookmarkPlus, CheckCheck, Inbox as InboxIcon, SearchX, UserRound, X } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { navigate, replace, type Route } from '../../../core/router';
import { formatInt } from '../../../core/format';
import { teamStore } from '../../merchant/stores';
import { CASE_STATUSES, CASE_TYPES, PRIORITIES, type Case } from '../../merchant/inbox';
import { BulkBar, Checkbox, Field, FilterChip, Input, Modal, Pagination, SearchInput, Tabs, useToast } from '../../../ds/kit';
import { Badge, Button, EmptyState, Ref, cn, useTx } from '../../../ds/ui';
import { VIEWS, SORTS, listCases, readQuery, sameParams, selectionIds, toParams, viewNameError, viewParams, type InboxQuery } from './model';
import { ihref, savedViewsStore } from './state';
import { PRIO_TONE, SlaChip, StatusBadge, TypeIcon, useInboxText } from './text';
import { BulkModal } from './modals';

export function CaseList({ route, all, me, now, current, canBulk }: { route: Route; all: Case[]; me: string; now: number; current?: string; canBulk: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const T = useInboxText();
  const toast = useToast();
  const members = teamStore.use().members.filter((m) => m.status === 'active');
  const saved = savedViewsStore.use()[me] ?? [];
  const lq = readQuery(route.query);
  const r = listCases(all, lq, me, now);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [bulk, setBulk] = useState<'assign' | 'close' | null>(null);
  const [saving, setSaving] = useState(false);
  const compact = !!current;
  const go = (p: Partial<InboxQuery>, mode: 'replace' | 'push' = 'push') => {
    const href = ihref(current ?? '', toParams(lq, { page: 1, ...p }));
    if (mode === 'replace') replace(href); else navigate(href);
  };
  const qs = toParams(lq);
  const caseHref = (id: string) => ihref(id, qs);
  const ids = selectionIds(r.rows, sel, allMatching);
  const count = ids.length;
  const clear = () => { setSel(new Set()); setAllMatching(false); };
  const pageAll = r.pageRows.length > 0 && r.pageRows.every((c) => sel.has(c.id));
  const cur = viewParams(lq);
  const savedHit = saved.find((v) => sameParams(v.params, cur));

  const viewTabs = [
    ...VIEWS.filter((v) => v !== 'all' || !compact).map((v) => ({ href: ihref(current ?? '', toParams({ ...lq, view: v, page: 1 })), label: T.view(v), current: lq.view === v && !savedHit, count: r.counts[v] })),
    ...saved.map((v) => ({ href: ihref(current ?? '', v.params), label: v.name, current: savedHit?.id === v.id })),
  ];

  const chips = [
    { key: 'type' as const, label: tx('النوع', 'Type'), options: CASE_TYPES.map((v) => ({ value: v, label: T.type(v) })) },
    { key: 'status' as const, label: tx('الحالة', 'Status'), options: CASE_STATUSES.map((v) => ({ value: v, label: T.status(v) })) },
    { key: 'prio' as const, label: tx('الأولوية', 'Priority'), options: PRIORITIES.map((v) => ({ value: v, label: T.prio(v) })) },
    { key: 'who' as const, label: tx('المسؤول', 'Assignee'), options: [...members.map((m) => ({ value: m.name, label: m.name === me ? tx(`${m.name} (أنا)`, `${m.name} (me)`) : m.name })), { value: '-', label: tx('غير مسند', 'Unassigned') }] },
  ];
  const onSelect = (id: string, on: boolean) => { setAllMatching(false); setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; }); };

  const toolbar = count > 0 && canBulk ? (
    <BulkBar count={count} onClear={clear} scope={
      <span className="flex flex-wrap items-center gap-x-2">
        {allMatching ? tx(`كل النتائج المطابقة (${formatInt(r.rows.length)})`, `All ${formatInt(r.rows.length)} matching`) : tx(`في هذه الصفحة من ${formatInt(r.rows.length)}`, `on this page, of ${formatInt(r.rows.length)}`)}
        {!allMatching && pageAll && r.rows.length > r.pageRows.length && <button type="button" className="font-semibold text-brand-700 hover:underline dark:text-brand-300" onClick={() => setAllMatching(true)}>{tx(`حدد الكل (${formatInt(r.rows.length)})`, `Select all ${formatInt(r.rows.length)}`)}</button>}
      </span>}>
      <Button size="sm" variant="secondary" onClick={() => setBulk('assign')}><UserRound className="size-4" aria-hidden="true" />{tx('إسناد', 'Assign')}</Button>
      <Button size="sm" variant="secondary" onClick={() => setBulk('close')}><CheckCheck className="size-4" aria-hidden="true" />{tx('إغلاق', 'Close')}</Button>
    </BulkBar>
  ) : (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className={cn('flex w-full', !compact && 'md:w-auto md:max-w-xs md:flex-1')}><SearchInput value={lq.q} onChange={(v) => go({ q: v }, 'replace')} placeholder={tx('رقم الحالة أو الطلب أو العميل', 'Case, order or customer')} /></div>
        <div className={cn('flex flex-wrap items-center gap-2', compact && 'w-full')}>
          {chips.map((c) => <FilterChip key={c.key} label={c.label} value={lq[c.key]} options={c.options} onChange={(v) => go({ [c.key]: v })} />)}
          <label className="relative inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-[13px] font-medium text-muted hover:text-fg">
            <ArrowUpDown className="size-3.5" aria-hidden="true" /><span>{T.sort(lq.sort)}</span>
            <select aria-label={tx('ترتيب', 'Sort')} value={lq.sort} onChange={(e) => go({ sort: e.target.value as InboxQuery['sort'] })} className="absolute inset-0 cursor-pointer opacity-0">
              {SORTS.map((s) => <option key={s} value={s}>{T.sort(s)}</option>)}
            </select>
          </label>
          {!savedHit && (r.filtered || lq.view !== 'open' || lq.sort !== 'due') && <Button size="sm" variant="ghost" onClick={() => setSaving(true)}><BookmarkPlus className="size-4" aria-hidden="true" />{tx('احفظ العرض', 'Save view')}</Button>}
          {savedHit && <Button size="sm" variant="ghost" onClick={() => { savedViewsStore.set((x) => ({ ...x, [me]: saved.filter((v) => v.id !== savedHit.id) })); toast({ tone: 'info', text: tx(`حُذف العرض «${savedHit.name}»`, `View “${savedHit.name}” removed`), action: { label: tx('تراجع', 'Undo'), run: () => savedViewsStore.set((x) => ({ ...x, [me]: [...(x[me] ?? []), savedHit] })) } }); }}><X className="size-4" aria-hidden="true" />{tx('احذف العرض', 'Remove view')}</Button>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-w-0">
      <div className="px-4 pt-2 sm:px-5"><Tabs label={tx('العروض', 'Views')} items={viewTabs} /></div>
      <div className="border-t border-border p-4 sm:px-5">{toolbar}</div>
      {r.rows.length === 0 ? (
        <div className="border-t border-border">
          {r.filtered ? (
            <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا حالات تطابق البحث', 'No cases match')}
              action={<Button variant="secondary" onClick={() => go({ q: '', type: '', status: '', prio: '', who: '' })}>{tx('امسح المرشحات', 'Clear filters')}</Button>}>
              {tx('جرّب رقم الطلب بدون #، أو اسم العميل.', 'Try the order number without #, or the customer name.')}
            </EmptyState>
          ) : (
            <EmptyState icon={<InboxIcon className="size-6" aria-hidden="true" />} title={lq.view === 'breach' ? tx('لا حالات متأخرة', 'Nothing past due') : lq.view === 'mine' ? tx('لا حالات مسندة لك', 'No cases assigned to you') : tx('لا حالات هنا', 'No cases here')}
              action={lq.view !== 'open' ? <Button variant="secondary" onClick={() => go({ view: 'open' })}>{tx('كل المفتوحة', 'All open cases')}</Button> : undefined}>
              {tx('كل ما يصل من العملاء بعد البيع يظهر هنا.', 'Everything customers send after a sale lands here.')}
            </EmptyState>
          )}
        </div>
      ) : (
        <>
          {canBulk && (
            <div className="flex items-center gap-3 border-t border-border bg-surface-2/40 px-4 py-2 sm:px-5">
              <Checkbox label={tx('حدد كل حالات الصفحة', 'Select all cases on this page')} checked={pageAll} indeterminate={!pageAll && r.pageRows.some((c) => sel.has(c.id))} onChange={(on) => r.pageRows.forEach((c) => onSelect(c.id, on))} />
              <span className="text-xs text-muted tabular-nums">{tx(`${formatInt(r.rows.length)} حالة`, `${formatInt(r.rows.length)} cases`)}</span>
            </div>
          )}
          <ul className="divide-y divide-border border-t border-border" aria-label={tx('الحالات', 'Cases')}>
            {r.pageRows.map((c) => {
              const last = c.messages.at(-1);
              const on = current === c.id;
              return (
                <li key={c.id} className={cn('relative flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2/50 sm:px-5', on && 'bg-brand-500/[.06]', sel.has(c.id) && 'bg-brand-500/[.04]')}>
                  {on && <span className="absolute inset-y-2 start-0 w-1 rounded-e-full bg-brand-600" aria-hidden="true" />}
                  {canBulk && <span className="pt-2"><Checkbox label={tx(`تحديد ${c.id}`, `Select ${c.id}`)} checked={sel.has(c.id) || allMatching} onChange={(v) => onSelect(c.id, v)} /></span>}
                  <a href={caseHref(c.id)} aria-current={on ? 'true' : undefined} className="flex min-w-0 flex-1 items-start gap-3">
                    <TypeIcon t={c.type} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn('truncate text-sm text-fg', c.status === 'new' ? 'font-bold' : 'font-semibold')}>{c.customer[lang]}</span>
                        <span className="shrink-0 text-[11px] text-muted"><Ref>{c.orderRef ? `#${c.orderRef}` : c.id}</Ref></span>
                      </span>
                      <span className="block truncate text-[13px] text-fg">{T.type(c.type)} · {c.subject[lang]}</span>
                      {last && <span className="mt-0.5 block truncate text-xs text-muted" dir="auto">{last.from === 'store' ? tx('أنت: ', 'You: ') : ''}{last.text}</span>}
                      <span className="mt-2 flex flex-wrap items-center gap-1.5">
                        <SlaChip c={c} now={now} />
                        {!compact && <StatusBadge s={c.status} />}
                        {(c.priority === 'urgent' || c.priority === 'high') && <Badge tone={PRIO_TONE[c.priority]}>{T.prio(c.priority)}</Badge>}
                        {c.assignee ? <span className="text-[11px] text-muted">{c.assignee}</span> : <span className="text-[11px] text-subtle">{tx('غير مسندة', 'Unassigned')}</span>}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          <Pagination page={r.page} pages={r.pages} total={r.rows.length} hrefFor={(p) => ihref(current ?? '', toParams(lq, { page: p }))} />
        </>
      )}
      {bulk && <BulkModal kind={bulk} all={all} ids={ids} onClose={(done) => { setBulk(null); if (done) clear(); }} />}
      {saving && <SaveViewModal me={me} params={cur} onClose={() => setSaving(false)} />}
    </div>
  );
}

function SaveViewModal({ me, params, onClose }: { me: string; params: Record<string, string>; onClose: () => void }) {
  const tx = useTx();
  const toast = useToast();
  const views = savedViewsStore.use()[me] ?? [];
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  const err = viewNameError(name, views);
  const save = () => {
    setTried(true);
    if (err) return;
    savedViewsStore.set((x) => ({ ...x, [me]: [...(x[me] ?? []), { id: `v${Date.now()}`, name: name.trim(), params }] }));
    toast({ tone: 'ok', text: tx(`حُفظ العرض «${name.trim()}» كتبويب`, `View “${name.trim()}” saved as a tab`) });
    onClose();
  };
  return (
    <Modal title={tx('احفظ هذا العرض', 'Save this view')} description={tx('يظهر تبويبًا لك وحدك، بالمرشحات والترتيب الحاليين.', 'It appears as a tab for you only, with the current filters and sort.')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={save}>{tx('احفظ', 'Save')}</Button></>}>
      <Field label={tx('اسم العرض', 'View name')} error={tried && err ? { empty: tx('اكتب اسمًا', 'Enter a name'), long: tx('30 حرفًا كحد أقصى', '30 characters at most'), taken: tx('الاسم مستخدم', 'Name already used') }[err] : null}>
        {(p) => <Input {...p} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />}
      </Field>
    </Modal>
  );
}
