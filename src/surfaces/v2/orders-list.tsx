// Orders list, redesigned. Question it answers: "which orders need me, and what state is each one in?"
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLang } from '../../core/lang';
import { link, navigate, replace, type Route } from '../../core/router';
import { formatInt } from '../../core/format';
import { ordersStore } from '../merchant/stores';
import { VIEWS, VIEW_IDS, search, total, units, type BulkAction, type Order, type View } from '../merchant/domain';
import { EmptyState, Icon, Money, Ref, Skeleton, Thumb, ThumbStack, Toast, useTx } from './ui';
import { age, itemImage, reviewStore, vhref, useView } from './data';
import {
  CHANNELS, FULS, PAGE_SIZE, PAYS, SORTS, Layer, Menu, MenuItem, StageHints, StagePill, queryParams, readQuery, useLabels, useMedia, type ListQuery,
} from './orders-shared';
import { BulkDialog, undoConfirm, type BulkOutcome } from './orders-bulk';

/** Ref of the row to focus after the side panel closes (Escape or close button). */
export const focusAfterClose: { ref: string | null } = { ref: null };

const sorters: Record<ListQuery['sort'], (a: Order, b: Order) => number> = {
  new: (a, b) => a.hoursAgo - b.hoursAgo,
  old: (a, b) => b.hoursAgo - a.hoursAgo,
  high: (a, b) => total(b) - total(a),
  low: (a, b) => total(a) - total(b),
};

export function OrdersList({ route, selected, compact }: { route: Route; selected?: string; compact?: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const L = useLabels();
  const { dir, state } = useView();
  const stored = ordersStore.use();
  const phone = useMedia('(max-width: 720px)');
  const all = state === 'empty' ? [] : stored;
  const lq = readQuery(route);
  const go = (over: Partial<ListQuery>, how: 'push' | 'replace' = 'push') => {
    const href = vhref('orders', queryParams(lq, { page: 1, ...over }));
    if (how === 'replace') replace(href); else navigate(href);
  };

  // Base set: search + filters, before the saved view. View counts are computed on it so the numbers match what a click shows.
  const base = useMemo(() => search(all, 'all', lq.q, lq.ch).filter((o) => (!lq.pay || o.pay === lq.pay) && (!lq.ful || o.ful === lq.ful)), [all, lq.q, lq.ch, lq.pay, lq.ful]);
  const counts = useMemo(() => Object.fromEntries(VIEW_IDS.map((v) => [v, base.filter(VIEWS[v]).length])) as Record<View, number>, [base]);
  const rows = useMemo(() => base.filter(VIEWS[lq.view]).sort(sorters[lq.sort]), [base, lq.view, lq.sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(pages, lq.page);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtered = !!(lq.q || lq.ch || lq.pay || lq.ful);

  // Selection belongs to one page of one result set: changing scope or page clears it.
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [allMode, setAllMode] = useState(false);
  const scope = `${lq.view}|${lq.q}|${lq.ch}|${lq.pay}|${lq.ful}|${lq.sort}|${page}`;
  const lastScope = useRef(scope);
  useEffect(() => { if (lastScope.current !== scope) { lastScope.current = scope; setSel(new Set()); setAllMode(false); } }, [scope]);
  const pageAll = pageRows.length > 0 && pageRows.every((o) => sel.has(o.ref));
  const someOnPage = pageRows.some((o) => sel.has(o.ref));
  const toggle = (ref: string) => { setAllMode(false); setSel((s) => { const n = new Set(s); if (n.has(ref)) n.delete(ref); else n.add(ref); return n; }); };
  const togglePage = () => { setAllMode(false); setSel(pageAll ? new Set() : new Set(pageRows.map((o) => o.ref))); };
  const clearSel = () => { setSel(new Set()); setAllMode(false); };
  const selectedOrders = allMode ? rows : pageRows.filter((o) => sel.has(o.ref));
  const [bulk, setBulk] = useState<BulkAction | null>(null);
  const [toast, setToast] = useState<BulkOutcome | null>(null);
  const [sheet, setSheet] = useState(false);

  // Search: focused on arrival from the global search (?focus=search), bound to ?q= as you type.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (route.query.get('focus') === 'search') {
      searchRef.current?.focus();
      replace(vhref('orders', queryParams(lq)));
    }
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  // Return focus to the row after the side panel closes.
  useEffect(() => {
    if (!selected && focusAfterClose.ref) {
      const el = document.querySelector<HTMLElement>(`[data-ref="${focusAfterClose.ref}"] .ord-rowlink`);
      focusAfterClose.ref = null;
      el?.focus();
    }
  }, [selected]);

  const rowHref = (o: Order) => vhref(`orders/${o.ref}`, queryParams(lq, { page }));
  const viewTitle = lq.view === 'all' ? tx('الطلبات', 'Orders') : L.view(lq.view);
  const needs = all.filter(VIEWS.needs).length;

  const head = (
    <div className="lk-pagehead">
      <div className="lk-col lk-grow lk-gap-4">
        <h1 className="lk-h1">{tx('الطلبات', 'Orders')}</h1>
        <p className="lk-2 lk-small">
          {state === 'live' && all.length
            ? tx(`${formatInt(all.length)} طلبًا · ${needs} تحتاج تجهيزًا. الدفع والتجهيز والشحن حالات منفصلة؛ نعرض هنا المرحلة التي تهمك.`,
              `${formatInt(all.length)} orders · ${needs} need fulfilment. Payment, fulfilment and shipment are separate states; the list shows the one stage that matters.`)
            : tx('كل طلبات متجرك في مكان واحد.', 'Every order in your store, in one place.')}
        </p>
      </div>
      {state === 'live' && all.length > 0 && lq.view !== 'needs' && !compact && (
        <a className="lk-btn brand lg" href={vhref('orders', { view: 'needs' })}>{tx('جهّز الطلبات', 'Fulfil orders')}<span className="ord-btn-count">{needs}</span></a>
      )}
    </div>
  );

  const views = dir === 'a'
    ? (
      <nav className="lk-tabs ord-tabs" aria-label={tx('العروض المحفوظة', 'Saved views')}>
        {VIEW_IDS.map((v) => (
          <a key={v} href={vhref('orders', queryParams(lq, { view: v, page: 1 }))} aria-current={lq.view === v ? 'page' : undefined}>
            {L.view(v)}<span className={`lk-count${v === 'late' || v === 'payfail' ? (counts[v] ? ' ord-count-bad' : '') : ''}`}>{formatInt(counts[v])}</span>
          </a>
        ))}
      </nav>
    )
    : <Pipeline counts={counts} base={base} lq={lq} />;

  if (state === 'loading') return <div className="lk-page ord-page">{head}{dir === 'b' && <PipelineSkeleton />}<ListSkeleton compact={compact} dir={dir} phone={phone} /></div>;
  if (state === 'error') return (
    <div className="lk-page ord-page">{head}
      <div className="ord-state"><EmptyState tone="bad" icon="alert" title={tx('تعذّر تحميل الطلبات', 'Orders could not load')}
        action={<button type="button" className="lk-btn primary" onClick={() => reviewStore.set((s) => ({ ...s, state: 'live' }))}>{tx('أعد المحاولة', 'Try again')}</button>}>
        {tx('لم يضع شيء: الطلبات محفوظة، والمدفوعات والشحنات تعمل كالمعتاد. القائمة فقط لم تصل. المرجع: ', 'Nothing was lost: orders are saved and payments and shipments carry on as usual. Only this list failed to arrive. Reference: ')}<Ref>SIM-ORD-503</Ref>
      </EmptyState></div>
    </div>
  );
  if (all.length === 0) return (
    <div className="lk-page ord-page">{head}
      <div className="ord-state"><EmptyState icon="orders" title={tx('لا طلبات بعد', 'No orders yet')}
        action={<><a className="lk-btn primary" href={link('/store')}>{tx('افتح متجرك وشارك الرابط', 'Open your store and share the link')}</a><a className="lk-btn" href={vhref('products/p1')}>{tx('راجع منتجاتك', 'Review your products')}</a></>}>
        {tx('حين يطلب أول عميل، يظهر الطلب هنا مع حالة الدفع والتجهيز والشحن، ونخبرك بما يحتاجه منك.', 'When your first customer orders, it appears here with its payment, fulfilment and shipment state, and we tell you what it needs from you.')}
      </EmptyState></div>
    </div>
  );

  const filterChip = <T extends string>(key: 'ch' | 'pay' | 'ful', label: string, values: readonly T[], name: (v: T) => string) => {
    const cur = lq[key] as T | undefined;
    return (
      <Menu key={key} className={`ord-chip${cur ? ' on' : ''}`} align="start" label={tx(`تصفية حسب ${label}`, `Filter by ${label.toLowerCase()}`)}
        button={<><span>{label}{cur ? <>: <b>{name(cur)}</b></> : null}</span><Icon name="chevronDown" size="xs" /></>}>
        {(close) => <>
          <MenuItem onClick={() => { close(); go({ [key]: undefined }); }} hint={!cur ? <Icon name="check" size="xs" /> : undefined}>{tx('الكل', 'Any')}</MenuItem>
          {values.map((v) => <MenuItem key={v} onClick={() => { close(); go({ [key]: v }); }} hint={cur === v ? <Icon name="check" size="xs" /> : undefined}>{name(v)}</MenuItem>)}
        </>}
      </Menu>
    );
  };
  const activeFilters: { key: 'q' | 'ch' | 'pay' | 'ful'; label: ReactNode }[] = [
    ...(lq.q ? [{ key: 'q' as const, label: <>{tx('بحث', 'Search')}: <b>{tx(`«${lq.q}»`, `“${lq.q}”`)}</b></> }] : []),
    ...(lq.ch ? [{ key: 'ch' as const, label: <>{tx('القناة', 'Channel')}: <b>{L.channel(lq.ch)}</b></> }] : []),
    ...(lq.pay ? [{ key: 'pay' as const, label: <>{tx('الدفع', 'Payment')}: <b>{L.pay(lq.pay)}</b></> }] : []),
    ...(lq.ful ? [{ key: 'ful' as const, label: <>{tx('التجهيز', 'Fulfilment')}: <b>{L.ful(lq.ful)}</b></> }] : []),
  ];
  const clearAll = () => go({ q: '', ch: undefined, pay: undefined, ful: undefined });
  const nFilters = [lq.ch, lq.pay, lq.ful].filter(Boolean).length;

  const searchBox = (
    <label className="lk-affix ord-search">
      <Icon name="search" size="sm" />
      <span className="lk-sr">{tx('ابحث برقم الطلب أو اسم العميل', 'Search by order number or customer name')}</span>
      <input ref={searchRef} className="lk-input" type="search" value={lq.q} placeholder={tx('رقم الطلب أو اسم العميل', 'Order number or customer')}
        onChange={(e) => go({ q: e.target.value }, 'replace')} />
    </label>
  );
  const sortMenu = (
    <Menu className="ord-sort" label={tx('ترتيب', 'Sort')} button={<><span className="ord-sort-l">{L.sort(lq.sort)}</span><Icon name="chevronDown" size="xs" /></>}>
      {(close) => SORTS.map((s) => <MenuItem key={s} onClick={() => { close(); go({ sort: s }); }} hint={lq.sort === s ? <Icon name="check" size="xs" /> : undefined}>{L.sort(s)}</MenuItem>)}
    </Menu>
  );

  const anySel = allMode || sel.size > 0;
  const bulkBar = (
    <div className="ord-bulk" role="region" aria-label={tx('إجراء جماعي', 'Bulk actions')}>
      <input type="checkbox" className="ord-cb" checked={pageAll || allMode} ref={(el) => { if (el) el.indeterminate = !pageAll && !allMode && someOnPage; }}
        onChange={allMode ? clearSel : togglePage} aria-label={tx('تحديد كل طلبات الصفحة', 'Select every order on this page')} />
      <div className="ord-bulk-scope">
        {allMode ? (
          <>
            <span className="lk-strong">{tx(`كل الطلبات المطابقة محددة: ${formatInt(rows.length)}`, `All ${formatInt(rows.length)} matching orders selected`)}</span>
            <button type="button" className="ord-link" onClick={() => { setAllMode(false); setSel(new Set(pageRows.map((o) => o.ref))); }}>{tx(`حدد هذه الصفحة فقط (${pageRows.length})`, `Select this page only (${pageRows.length})`)}</button>
          </>
        ) : (
          <>
            <span className="lk-strong">{tx(`${sel.size} محدد في هذه الصفحة`, `${sel.size} selected on this page`)}</span>
            {rows.length > pageRows.length && <button type="button" className="ord-link" onClick={() => setAllMode(true)}>{tx(`حدد كل المطابقة (${formatInt(rows.length)})`, `Select all ${formatInt(rows.length)} matching`)}</button>}
          </>
        )}
      </div>
      <div className="ord-bulk-actions">
        <button type="button" className="lk-btn sm soft" onClick={() => setBulk('confirm')}>{tx('تأكيد الطلبات', 'Mark confirmed')}</button>
        <button type="button" className="lk-btn sm soft" onClick={() => setBulk('slips')}>{tx('طباعة قوائم التعبئة', 'Print packing slips')}</button>
        <button type="button" className="lk-btn sm icon ghost" onClick={clearSel} aria-label={tx('إلغاء التحديد', 'Clear selection')}><Icon name="close" size="sm" /></button>
      </div>
    </div>
  );

  const toolbar = phone ? (
    <div className="ord-toolbar">
      {searchBox}
      <button type="button" className={`lk-btn ord-filterbtn${nFilters ? ' on' : ''}`} onClick={() => setSheet(true)} aria-haspopup="dialog">
        {tx('تصفية', 'Filter')}{nFilters ? <span className="lk-count hot">{nFilters}</span> : null}
      </button>
    </div>
  ) : (
    <div className="ord-toolbar">
      {searchBox}
      <div className="ord-chips" role="group" aria-label={tx('عوامل التصفية', 'Filters')}>
        {filterChip('ch', tx('القناة', 'Channel'), CHANNELS, L.channel)}
        {filterChip('pay', tx('الدفع', 'Payment'), PAYS, L.pay)}
        {filterChip('ful', tx('التجهيز', 'Fulfilment'), FULS, L.ful)}
      </div>
      <span className="lk-grow" />
      {sortMenu}
    </div>
  );

  const summary = (filtered || lq.view !== 'all') && (
    <div className="ord-active" aria-live="polite">
      <span className="lk-small lk-2"><b className="lk-num">{formatInt(rows.length)}</b> {tx(`من ${formatInt(all.length)} طلب`, `of ${formatInt(all.length)} orders`)}{lq.view !== 'all' && <> · {L.view(lq.view)}</>}</span>
      {activeFilters.map((f) => (
        <button key={f.key} type="button" className="ord-token" onClick={() => go({ [f.key]: f.key === 'q' ? '' : undefined })} aria-label={tx('إزالة عامل التصفية', 'Remove filter')}>
          <span>{f.label}</span><Icon name="close" size="xs" />
        </button>
      ))}
      {(filtered || lq.view !== 'all') && <a className="ord-link" href={vhref('orders', queryParams(lq, { view: 'all', q: '', ch: undefined, pay: undefined, ful: undefined, page: 1 }))}>{tx('مسح الكل', 'Clear all')}</a>}
    </div>
  );

  const list = pageRows.length === 0 ? (
    <EmptyState icon="search" title={tx('لا طلبات تطابق هذا البحث', 'No orders match')}
      action={<a className="lk-btn" href={vhref('orders', queryParams(lq, { view: lq.view, q: '', ch: undefined, pay: undefined, ful: undefined, page: 1 }))} onClick={(e) => { e.preventDefault(); clearAll(); }}>{tx('امسح عوامل التصفية', 'Clear filters')}</a>}>
      {tx(`لا شيء في «${viewTitle}» بهذه الشروط. جرّب رقمًا آخر أو أزل عاملًا من عوامل التصفية.`, `Nothing in “${viewTitle}” with these conditions. Try another number or remove a filter.`)}
    </EmptyState>
  ) : phone ? (
    <ul className="ord-cards" aria-label={viewTitle}>
      {pageRows.map((o) => (
        <li key={o.ref} data-ref={o.ref} className={`ord-card${sel.has(o.ref) || allMode ? ' sel' : ''}`}>
          <input type="checkbox" className="ord-cb" checked={allMode || sel.has(o.ref)} onChange={() => toggle(o.ref)} aria-label={tx(`تحديد الطلب ${o.ref}`, `Select order ${o.ref}`)} />
          <a className="ord-rowlink ord-card-main" href={rowHref(o)}>
            <span className="ord-card-thumb"><Thumb src={itemImage(o.items[0])} alt={o.items[0].name[lang]} size="lg" />{o.items.length > 1 && <span className="ord-card-more">+{o.items.length - 1}</span>}</span>
            <span className="lk-col lk-grow" style={{ gap: 2 }}>
              <span className="lk-row lk-between"><span className="lk-strong"><Ref>#{o.ref}</Ref></span><Money v={total(o)} strong /></span>
              <span className="lk-small lk-truncate">{o.customer[lang]} <span className="lk-3">· {age(o.hoursAgo, lang)}</span></span>
              <span className="lk-row lk-wrap" style={{ gap: 6, marginTop: 4 }}><StagePill o={o} /><StageHints o={o} /></span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  ) : (
    <table className={`ord-table${compact ? ' compact' : ''}`}>
      <caption className="lk-sr">{viewTitle}</caption>
      <thead>
        <tr>
          <th scope="col" className="ord-c-cb"><input type="checkbox" className="ord-cb" checked={pageAll || allMode} ref={(el) => { if (el) el.indeterminate = !pageAll && !allMode && someOnPage; }}
            onChange={togglePage} aria-label={tx('تحديد كل طلبات الصفحة', 'Select every order on this page')} /></th>
          {!compact && <th scope="col" className="ord-c-items"><span className="lk-sr">{tx('المنتجات', 'Items')}</span></th>}
          <th scope="col" className="ord-c-order">{tx('الطلب', 'Order')}</th>
          <th scope="col">{tx('العميل', 'Customer')}</th>
          <th scope="col" className="ord-c-stage">{tx('المرحلة', 'Stage')}</th>
          <th scope="col" className="ord-c-end ord-c-total">{tx('الإجمالي', 'Total')}</th>
        </tr>
      </thead>
      <tbody>
        {pageRows.map((o) => {
          const isSel = allMode || sel.has(o.ref);
          return (
            <tr key={o.ref} data-ref={o.ref} className={`${isSel ? 'sel' : ''}${selected === o.ref ? ' cur' : ''}`} aria-current={selected === o.ref ? 'true' : undefined}>
              <td className="ord-c-cb"><input type="checkbox" className="ord-cb" checked={isSel} onChange={() => toggle(o.ref)} aria-label={tx(`تحديد الطلب ${o.ref}`, `Select order ${o.ref}`)} /></td>
              {!compact && <td className="ord-c-items"><ThumbStack items={o.items.map((i) => ({ src: itemImage(i), alt: i.name[lang] }))} max={3} /></td>}
              <td>
                <a className="ord-rowlink" href={rowHref(o)}><span className="lk-strong"><Ref>#{o.ref}</Ref></span></a>
                <div className="lk-micro lk-3 ord-sub">{age(o.hoursAgo, lang)}{!compact && <> · {L.channel(o.channel)}</>}</div>
              </td>
              <td className="ord-c-cust">
                <div className="lk-truncate">{o.customer[lang]}</div>
                <div className="lk-micro lk-3 lk-truncate">{o.city[lang]}</div>
              </td>
              <td><span className="ord-stage"><StagePill o={o} />{!compact && <StageHints o={o} />}</span></td>
              <td className="ord-c-end">
                <Money v={total(o)} strong />
                <div className="lk-micro lk-3 lk-num">{tx(`${units(o)} قطع`, `${units(o)} ${units(o) === 1 ? 'item' : 'items'}`)}</div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const pager = rows.length > 0 && (
    <nav className="ord-pager" aria-label={tx('الصفحات', 'Pages')}>
      <span className="lk-small lk-2 lk-num">{tx(`${formatInt((page - 1) * PAGE_SIZE + 1)}–${formatInt(Math.min(rows.length, page * PAGE_SIZE))} من ${formatInt(rows.length)}`, `${formatInt((page - 1) * PAGE_SIZE + 1)}–${formatInt(Math.min(rows.length, page * PAGE_SIZE))} of ${formatInt(rows.length)}`)}</span>
      <span className="lk-grow" />
      {page > 1 ? <a className="lk-btn sm icon" href={vhref('orders', queryParams(lq, { page: page - 1 }))} aria-label={tx('الصفحة السابقة', 'Previous page')}><Icon name="back" size="sm" /></a>
        : <span className="lk-btn sm icon" aria-disabled="true" aria-label={tx('الصفحة السابقة', 'Previous page')}><Icon name="back" size="sm" /></span>}
      <span className="lk-small lk-num ord-pageno" aria-current="page">{tx(`صفحة ${page} من ${formatInt(pages)}`, `Page ${page} of ${formatInt(pages)}`)}</span>
      {page < pages ? <a className="lk-btn sm icon" href={vhref('orders', queryParams(lq, { page: page + 1 }))} aria-label={tx('الصفحة التالية', 'Next page')}><Icon name="arrow" size="sm" /></a>
        : <span className="lk-btn sm icon" aria-disabled="true" aria-label={tx('الصفحة التالية', 'Next page')}><Icon name="arrow" size="sm" /></span>}
    </nav>
  );

  return (
    <div className={`lk-page ord-page${compact ? ' compact' : ''}`}>
      {!compact && head}
      {compact && <div className="lk-row"><h1 className="lk-h1 lk-grow">{tx('الطلبات', 'Orders')}</h1></div>}
      {dir === 'b' && views}
      <section className="ord-listcard" aria-label={viewTitle}>
        {dir === 'a' && views}
        {anySel && !phone ? bulkBar : toolbar}
        {summary}
        {list}
        {pager}
      </section>
      <Layer>
      {anySel && phone && <div className="ord-bulk-dock">{bulkBar}</div>}
      {sheet && <FilterSheet lq={lq} all={all} onClose={() => setSheet(false)} onApply={(over) => { setSheet(false); go(over); }} />}
      {bulk && <BulkDialog action={bulk} orders={selectedOrders} allMode={allMode} onClose={(outcome) => { setBulk(null); if (outcome && outcome.ok.length) { setToast(outcome); clearSel(); } }} />}
      {toast && (
        <Toast key={toast.id} onClose={() => setToast(null)}
          action={toast.action === 'confirm' ? <button type="button" className="lk-btn sm" onClick={() => { undoConfirm(toast.ok); setToast(null); }}>{tx('تراجع', 'Undo')}</button> : undefined}>
          {toast.action === 'confirm'
            ? tx(`أُكّد ${toast.ok.length} طلبًا.`, `${toast.ok.length} ${toast.ok.length === 1 ? 'order' : 'orders'} marked confirmed.`)
            : tx(`أُرسلت ${toast.ok.length} قائمة تعبئة للطابعة (محاكاة). الطباعة لا يمكن التراجع عنها.`, `${toast.ok.length} packing ${toast.ok.length === 1 ? 'slip' : 'slips'} sent to the printer (simulated). Printing cannot be undone.`)}
        </Toast>
      )}
      </Layer>
    </div>
  );
}

/** Direction B: the stage pipeline is the navigation. Each stage is a count you can act on. */
function Pipeline({ counts, base, lq }: { counts: Record<View, number>; base: Order[]; lq: ListQuery }) {
  const tx = useTx();
  const L = useLabels();
  const late = base.filter((o) => VIEWS.late(o));
  const stages: { v: View; tone: string; note: ReactNode }[] = [
    { v: 'needs', tone: 'brand', note: <Money v={base.filter(VIEWS.needs).reduce((s, o) => s + total(o), 0)} /> },
    { v: 'late', tone: counts.late ? 'bad' : 'idle', note: late.length ? tx('أكثر من 24 ساعة', 'Over 24 hours') : tx('لا متأخر', 'None late') },
    { v: 'payfail', tone: counts.payfail ? 'bad' : 'idle', note: tx('لا تُجهَّز', 'Do not fulfil') },
    { v: 'shipped', tone: 'info', note: tx('ملصق أو في الطريق أو سُلّم', 'Label, transit or delivered') },
    { v: 'returns', tone: counts.returns ? 'warn' : 'idle', note: tx('استرداد أو مرتجع', 'Refund or return') },
  ];
  const cells = [{ v: 'all' as View, tone: 'idle', note: tx('في كل المراحل', 'Across every stage') as ReactNode }, ...stages];
  return (
    <nav className="ord-pipe" aria-label={tx('مراحل الطلبات', 'Order stages')}>
      <ol>
        {cells.map((s) => (
          <li key={s.v}>
            <a href={vhref('orders', queryParams(lq, { view: s.v, page: 1 }))} aria-current={lq.view === s.v ? 'page' : undefined} className={`ord-pipe-st ${s.tone}`}>
              <span className="ord-pipe-l"><span className="ord-dot" aria-hidden="true" />{s.v === 'all' ? tx('كل الطلبات', 'All orders') : L.view(s.v)}</span>
              <span className="ord-pipe-n lk-figure">{formatInt(counts[s.v])}</span>
              <span className="lk-micro lk-3 lk-truncate">{s.note}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function PipelineSkeleton() {
  return <div className="ord-pipe" aria-hidden="true"><ol>{[0, 1, 2, 3, 4, 5].map((i) => <li key={i}><div className="ord-pipe-st"><Skeleton w="60%" /><Skeleton w="45%" h={30} /><Skeleton w="70%" h={10} /></div></li>)}</ol></div>;
}

function ListSkeleton({ compact, dir, phone }: { compact?: boolean; dir: 'a' | 'b'; phone: boolean }) {
  const tx = useTx();
  return (
    <section className="ord-listcard" role="status" aria-busy="true" aria-label={tx('جارٍ تحميل الطلبات', 'Loading orders')}>
      {dir === 'a' && <div className="lk-tabs ord-tabs" aria-hidden="true">{[56, 88, 52, 92, 60, 64].map((w, i) => <span key={i} style={{ padding: '14px 12px' }}><Skeleton w={w} h={14} /></span>)}</div>}
      <div className="ord-toolbar" aria-hidden="true"><Skeleton w={phone ? '70%' : 320} h={40} r={8} />{!phone && <><Skeleton w={96} h={32} r={99} /><Skeleton w={100} h={32} r={99} /><Skeleton w={110} h={32} r={99} /></>}</div>
      {phone ? (
        <ul className="ord-cards" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <li key={i} className="ord-card"><span className="ord-card-main"><Skeleton w={56} h={56} r={8} /><span className="lk-col lk-grow lk-gap-4"><Skeleton w="60%" /><Skeleton w="80%" h={12} /><Skeleton w={90} h={22} r={99} /></span></span></li>)}</ul>
      ) : (
        <table className={`ord-table${compact ? ' compact' : ''}`} aria-hidden="true">
          <tbody>
            {Array.from({ length: 10 }, (_, i) => (
              <tr key={i}>
                <td className="ord-c-cb"><Skeleton w={18} h={18} r={4} /></td>
                {!compact && <td className="ord-c-items"><span className="lk-row" style={{ gap: 0 }}><Skeleton w={32} h={32} r={8} /><Skeleton w={32} h={32} r={8} /></span></td>}
                <td><Skeleton w={64} /><div style={{ height: 6 }} /><Skeleton w={90} h={10} /></td>
                <td><Skeleton w={130} /><div style={{ height: 6 }} /><Skeleton w={80} h={10} /></td>
                <td><Skeleton w={96} h={24} r={99} /></td>
                <td className="ord-c-end"><Skeleton w={90} /><div style={{ height: 6 }} /><Skeleton w={40} h={10} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Phone: filters and sort in a bottom sheet with a live result count. Nothing changes until "Show results". */
function FilterSheet({ lq, all, onClose, onApply }: { lq: ListQuery; all: Order[]; onClose: () => void; onApply: (q: Partial<ListQuery>) => void }) {
  const tx = useTx();
  const L = useLabels();
  const [d, setD] = useState({ ch: lq.ch, pay: lq.pay, ful: lq.ful, sort: lq.sort, view: lq.view });
  const count = search(all, d.view, lq.q, d.ch).filter((o) => (!d.pay || o.pay === d.pay) && (!d.ful || o.ful === d.ful)).length;
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('keydown', k); opener?.focus(); };
  }, []);
  const group = <T extends string>(title: string, values: readonly T[], cur: T | undefined, set: (v: T | undefined) => void, name: (v: T) => string, any = true) => (
    <fieldset className="ord-sheet-g">
      <legend className="lk-label">{title}</legend>
      <div className="ord-sheet-opts">
        {any && <button type="button" aria-pressed={!cur} onClick={() => set(undefined)}>{tx('الكل', 'Any')}</button>}
        {values.map((v) => <button key={v} type="button" aria-pressed={cur === v} onClick={() => set(v)}>{name(v)}</button>)}
      </div>
    </fieldset>
  );
  return (
    <div className="lk-scrim ord-sheet-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ord-sheet" role="dialog" aria-modal="true" aria-label={tx('تصفية وترتيب', 'Filter and sort')} tabIndex={-1} ref={ref}>
        <div className="ord-sheet-grip" aria-hidden="true" />
        <header className="lk-row lk-between"><h2 className="lk-h2">{tx('تصفية وترتيب', 'Filter and sort')}</h2><button type="button" className="lk-btn icon ghost" onClick={onClose} aria-label={tx('إغلاق', 'Close')}><Icon name="close" /></button></header>
        <div className="ord-sheet-body">
          {group(tx('العرض', 'View'), VIEW_IDS, d.view, (v) => setD({ ...d, view: v ?? 'all' }), L.view, false)}
          {group(tx('القناة', 'Channel'), CHANNELS, d.ch, (v) => setD({ ...d, ch: v }), L.channel)}
          {group(tx('الدفع', 'Payment'), PAYS, d.pay, (v) => setD({ ...d, pay: v }), L.pay)}
          {group(tx('التجهيز', 'Fulfilment'), FULS, d.ful, (v) => setD({ ...d, ful: v }), L.ful)}
          {group(tx('الترتيب', 'Sort'), SORTS, d.sort, (v) => setD({ ...d, sort: v ?? 'new' }), L.sort, false)}
        </div>
        <footer className="ord-sheet-f">
          <button type="button" className="lk-btn" onClick={() => setD({ ch: undefined, pay: undefined, ful: undefined, sort: 'new', view: 'all' })}>{tx('مسح', 'Clear')}</button>
          <button type="button" className="lk-btn primary lk-grow" disabled={count === 0} onClick={() => onApply({ ...d, page: 1 })}>
            {count === 0 ? tx('لا نتائج', 'No results') : tx(`اعرض ${formatInt(count)} طلبًا`, `Show ${formatInt(count)} ${count === 1 ? 'order' : 'orders'}`)}
          </button>
        </footer>
      </div>
    </div>
  );
}

