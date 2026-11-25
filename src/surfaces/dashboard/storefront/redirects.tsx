// Online store → Custom URLs (`#/dashboard/storefront/redirects`): old addresses that send shoppers to a product,
// category, page, landing page, article or an https link (301 permanent / 302 temporary). Loops, chains and broken
// targets (an archived product, an unpublished page) are found before shoppers hit them; a URL can be tested; many can be
// imported from a CSV with a row-by-row preview. The shopper store follows them for addresses it does not serve itself.
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, CornerDownLeft, Download, FileUp, Link2, Plus, Repeat, Search, Trash2, Wand2 } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { can, canSee } from '../../merchant/perms';
import { currentActor, logAction, settingsStore } from '../../merchant/stores';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, InfoHint, Segmented, Skeleton, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, BulkBar, DataTable, Field, FilterChip, Input, Modal, PageHeader, Pagination, SearchInput, Select, Simulated, Switch, Textarea, useToast, type Column } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { useUnsaved } from '../unsaved';
import { Locked, NoAccess, ReviewRole, useRole } from '../marketing/access';
import { storeBase } from './content';
import { useRCtx } from './redirect-ctx';
import { redirectsStore } from './state';
import { StoreTabs } from './nav';
import { RedirectTabs, SearchRedirects } from './search-redirects';
import {
  R_KINDS, applyImport, flatten, fromIssue, health, nextRedirectNum, normPath, parseCsv, targetIssue, targetPath, toCsv, trace, validHttps,
  type ImportRow, type RCtx, type RHealth, type RKind, type RTarget, type Redirect,
} from './redirects-model';

const PAGE = 20;
const H_TONE: Record<RHealth, Tone> = { ok: 'green', chain: 'amber', broken: 'red', loop: 'red', off: 'gray' };

export { useRCtx };

export function useRLabels() {
  const tx = useTx();
  return {
    kind: (k: RKind) => ({ product: tx('منتج', 'Product'), category: tx('تصنيف', 'Category'), page: tx('صفحة', 'Page'), landing: tx('صفحة هبوط', 'Landing page'), post: tx('مقال', 'Article'), url: tx('رابط خارجي', 'External link') })[k],
    health: (h: RHealth) => ({ ok: tx('يعمل', 'Working'), chain: tx('سلسلة تحويلات', 'Redirect chain'), broken: tx('الوجهة لا تعمل', 'Target not working'), loop: tx('حلقة', 'Loop'), off: tx('موقوف', 'Off') })[h],
    issue: (i: NonNullable<ReturnType<typeof targetIssue>>) => ({ missing: tx('الوجهة حُذفت', 'The target was deleted'), archived: tx('المنتج مؤرشف', 'The product is archived'), hidden: tx('الوجهة غير منشورة أو مخفية', 'The target is not published or is hidden'), url: tx('رابط https غير صالح', 'Not a valid https link') })[i],
  };
}

export default function RedirectsPage({ route }: { route: Route }) {
  const tx = useTx();
  const role = useRole();
  if (!canSee(role, 'storefront')) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('المتجر الإلكتروني غير متاح لدورك', 'The online store is not available for your role')} /></div>;
  // One list of redirects: old addresses, and search terms (the search report's «وجّه البحث» lands here too).
  if (route.query.get('src') === 'search') return <SearchRedirects route={route} />;
  return <RedirectList route={route} />;
}

function RedirectList({ route }: { route: Route }) {
  const tx = useTx();
  const toast = useToast();
  const role = useRole();
  const state = useDashState();
  const list = redirectsStore.use();
  const ctx = useRCtx();
  const R = useRLabels();
  const settings = settingsStore.use();
  const canEdit = can(role, 'theme.publish');
  const q = route.query.get('q') ?? '';
  const hf = route.query.get('health') ?? '';
  const pg = Math.max(1, Number(route.query.get('page')) || 1);
  const [edit, setEdit] = useState<string | null>(() => route.query.get('edit'));
  const [dlg, setDlg] = useState<'import' | 'bulkOff' | 'bulkDelete' | null>(() => (route.query.get('dlg') === 'import' ? 'import' : null));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const go = (patch: Record<string, string | undefined>) => replace(link('/dashboard/storefront/redirects', { q: q || undefined, health: hf || undefined, ...patch }));
  const empty = state === 'empty';
  const all = empty ? [] : list;
  const healthOf = useMemo(() => new Map(all.map((r) => [r.id, health(r, all, ctx)])), [all, ctx]);
  const counts = (h: RHealth) => all.filter((r) => healthOf.get(r.id) === h).length;
  const filtered = all.filter((r) => (!hf || healthOf.get(r.id) === hf) && (!q.trim() || `${r.from} ${targetPath(r.to, ctx) ?? ''}`.toLowerCase().includes(normPath(q) || q.toLowerCase())));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const rows = filtered.slice((Math.min(pg, pages) - 1) * PAGE, Math.min(pg, pages) * PAGE);
  const who = currentActor().name;
  const header = (
    <>
      <PageHeader title={tx('روابط مخصصة', 'Custom URLs')} description={tx('حوّل الروابط القديمة لمكانها الجديد دون أن يفقد العميل طريقه', 'Send old addresses to their new place so shoppers never hit a dead end')}
        actions={canEdit ? <>
          <Button variant="secondary" onClick={() => setDlg('import')}><FileUp className="size-4" aria-hidden="true" />{tx('استيراد CSV', 'Import CSV')}</Button>
          <Button onClick={() => setEdit('new')}><Plus className="size-4" aria-hidden="true" />{tx('رابط جديد', 'New redirect')}</Button>
        </> : <Locked>{tx('التعديل للمالك', 'Editing is for the Owner')}</Locked>} />
      <StoreTabs current="redirects" />
      <ReviewRole />
    </>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<Card className="space-y-3 p-5" role="status" aria-label="Loading">{[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-6 w-16 rounded-full" /></div>)}</Card></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل الروابط المخصصة', 'Custom URLs could not load')} onRetry={() => setDashState('live')}>{tx('التحويلات الحالية تعمل في متجرك كما هي. المرجع SIM-URL-503.', 'Existing redirects keep working in your store. Ref SIM-URL-503.')}</ErrorState></Card></div>;

  const toggle = (r: Redirect) => {
    redirectsStore.set((l) => l.map((x) => (x.id === r.id ? { ...x, on: !x.on, at: new Date().toISOString(), by: who } : x)));
    logAction('store', { ar: `${r.on ? 'أوقف' : 'فعّل'} التحويل ${r.from}`, en: `${r.on ? 'Turned off' : 'Turned on'} redirect ${r.from}` }, { target: r.from, before: r.on ? 'on' : 'off', after: r.on ? 'off' : 'on' });
  };
  const fix = (r: Redirect) => {
    const to = flatten(r, list, ctx);
    if (!to) return;
    const before = list;
    redirectsStore.set((l) => l.map((x) => (x.id === r.id ? { ...x, to, at: new Date().toISOString(), by: who } : x)));
    logAction('store', { ar: `اختصر سلسلة التحويل ${r.from} إلى خطوة واحدة`, en: `Shortened redirect chain ${r.from} to one hop` }, { target: r.from });
    toast({ tone: 'ok', text: tx('صار التحويل خطوة واحدة', 'The redirect is now one hop'), action: { label: tx('تراجع', 'Undo'), run: () => redirectsStore.set(before) } });
  };
  const target = (r: Redirect) => {
    const path = targetPath(r.to, ctx);
    const nm = r.to.kind === 'url' ? r.to.url : r.to.kind === 'product' ? ctx.products.find((x) => x.id === (r.to as { id: string }).id)?.name : r.to.kind === 'category' ? ctx.categories.find((x) => x.id === (r.to as { id: string }).id)?.name
      : r.to.kind === 'page' ? ctx.pages.find((x) => x.id === (r.to as { id: string }).id)?.name : r.to.kind === 'landing' ? ctx.landings.find((x) => x.id === (r.to as { id: string }).id)?.name : ctx.posts.find((x) => x.id === (r.to as { id: string }).id)?.name;
    return <span className="min-w-0"><span className="block truncate text-fg" dir="auto">{R.kind(r.to.kind)} · {nm ?? tx('محذوف', 'deleted')}</span><bdi dir="ltr" className="block truncate text-xs text-muted">{path ?? '—'}</bdi></span>;
  };
  const healthCell = (r: Redirect) => {
    const h = healthOf.get(r.id)!;
    const issue = targetIssue(r.to, ctx);
    return <span className="flex flex-wrap items-center gap-1.5"><Badge tone={H_TONE[h]}>{R.health(h)}</Badge>{h === 'broken' && issue && <span className="text-xs text-muted">{R.issue(issue)}</span>}
      {h === 'chain' && canEdit && <Button size="sm" variant="ghost" onClick={() => fix(r)}><Wand2 className="size-3.5" aria-hidden="true" />{tx('اختصر', 'Shorten')}</Button>}</span>;
  };
  const cols: Column<Redirect>[] = [
    { key: 'from', header: tx('الرابط القديم', 'Old address'), cell: (r) => <button type="button" className="max-w-[16rem] truncate text-start font-mono text-[13px] font-semibold text-fg hover:underline" onClick={() => setEdit(r.id)}><bdi dir="ltr">{r.from}</bdi></button> },
    { key: 'to', header: tx('الوجهة', 'Goes to'), cell: target },
    { key: 'code', header: <>{tx('النوع', 'Type')}<InfoHint>{tx('301 دائم: محركات البحث تنقل ترتيب الرابط القديم للجديد. 302 مؤقت: للحملات، ويبقى القديم مفهرسًا.', '301 permanent: search engines move the old link’s ranking to the new one. 302 temporary: for campaigns; the old one stays indexed.')}</InfoHint></>, hideBelow: 'md', cell: (r) => <Badge tone={r.code === 301 ? 'brand' : 'sky'}>{r.code}</Badge> },
    { key: 'health', header: tx('الحالة', 'Status'), cell: healthCell },
    { key: 'hits', header: tx('الزيارات', 'Hits'), align: 'end', hideBelow: 'lg', cell: (r) => <span className="tabular-nums text-muted">{r.hits.toLocaleString('en-US')}</span> },
    { key: 'on', header: <span className="sr-only">{tx('مفعّل', 'On')}</span>, align: 'end', cell: (r) => <Switch checked={r.on} disabled={!canEdit} label={tx(`تفعيل ${r.from}`, `Turn on ${r.from}`)} onChange={() => toggle(r)} /> },
  ];
  const bad = counts('loop') + counts('broken');
  const selRows = all.filter((r) => sel.has(r.id));

  return (
    <div className="space-y-6">
      {header}
      <RedirectTabs current="url" />
      {bad > 0 && !hf && <Alert tone="warn" title={tx(`${bad} تحويل لا يوصل العميل لوجهته`, `${bad} redirect${bad > 1 ? 's' : ''} don’t get shoppers where they should`)} action={<Button size="sm" variant="secondary" onClick={() => go({ health: counts('broken') ? 'broken' : 'loop', page: undefined })}>{tx('اعرضها', 'Show them')}</Button>}>
        {tx('منتج أُرشف أو صفحة أُخفيت بعد إنشاء التحويل. عدّل الوجهة أو أوقف التحويل.', 'A product was archived or a page hidden after the redirect was made. Change the target or turn the redirect off.')}</Alert>}
      <TestUrl list={all} ctx={ctx} base={storeBase(settings.domain)} />
      {all.length === 0 ? (
        <Card><EmptyState as="h2" icon={<Link2 className="size-6" aria-hidden="true" />} title={tx('لا روابط مخصصة', 'No custom URLs')}
          action={canEdit ? <Button onClick={() => setEdit('new')}><Plus className="size-4" aria-hidden="true" />{tx('أضف أول تحويل', 'Add your first redirect')}</Button> : undefined}>
          {tx('عند نقل متجرك أو تغيير رابط منتج، حوّل الرابط القديم حتى لا يرى العميل «غير موجودة».', 'When you move your store or change a product link, redirect the old address so shoppers never see “not found”.')}
        </EmptyState></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <SearchInput value={q} onChange={(v) => go({ q: v || undefined, page: undefined })} placeholder={tx('ابحث بالرابط', 'Search by address')} />
            <FilterChip label={tx('الحالة', 'Status')} value={hf} onChange={(v) => go({ health: v || undefined, page: undefined })} options={(['ok', 'chain', 'broken', 'loop', 'off'] as RHealth[]).map((h) => ({ value: h, label: `${R.health(h)} (${counts(h)})` }))} />
            <Button size="sm" variant="ghost" className="ms-auto" onClick={() => { const blob = new Blob([`﻿${toCsv(list, ctx)}`], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'redirects.csv'; a.click(); window.setTimeout(() => URL.revokeObjectURL(a.href), 1000); }}><Download className="size-4" aria-hidden="true" />{tx('تصدير', 'Export')}</Button>
          </div>
          {sel.size > 0 && canEdit && (
            <div className="border-b border-border p-3"><BulkBar count={sel.size} scope={tx('من هذه الصفحة', 'on this page')} onClear={() => setSel(new Set())}>
              <Button size="sm" variant="secondary" onClick={() => setDlg('bulkOff')}>{tx('أوقف', 'Turn off')}</Button>
              <Button size="sm" variant="secondary" onClick={() => setDlg('bulkDelete')}><Trash2 className="size-4" aria-hidden="true" />{tx('احذف', 'Delete')}</Button>
            </BulkBar></div>
          )}
          {filtered.length === 0 ? (
            <EmptyState icon={<Search className="size-6" aria-hidden="true" />} title={tx('لا روابط تطابق', 'No redirects match')} action={<Button variant="secondary" onClick={() => go({ q: undefined, health: undefined, page: undefined })}>{tx('امسح التصفية', 'Clear filters')}</Button>} />
          ) : (
            <>
              <DataTable label={tx('الروابط المخصصة', 'Custom URLs')} rows={rows} rowKey={(r) => r.id} columns={cols}
                selected={canEdit ? sel : undefined} onSelect={canEdit ? (k, on) => setSel((s) => { const n = new Set(s); if (k === '*') { rows.forEach((r) => (on ? n.add(r.id) : n.delete(r.id))); } else if (on) n.add(k); else n.delete(k); return n; }) : undefined}
                card={(r) => (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2"><button type="button" className="min-w-0 flex-1 truncate text-start font-mono text-[13px] font-semibold text-fg" onClick={() => setEdit(r.id)}><bdi dir="ltr">{r.from}</bdi></button><Badge tone={r.code === 301 ? 'brand' : 'sky'}>{r.code}</Badge><Switch checked={r.on} disabled={!canEdit} label={tx(`تفعيل ${r.from}`, `Turn on ${r.from}`)} onChange={() => toggle(r)} /></div>
                    <div className="flex items-start gap-2 text-sm"><CornerDownLeft className="mt-0.5 size-4 shrink-0 text-subtle ltr:-scale-x-100" aria-hidden="true" />{target(r)}</div>
                    {healthCell(r)}
                  </div>
                )} />
              <Pagination page={Math.min(pg, pages)} pages={pages} total={filtered.length} hrefFor={(n) => link('/dashboard/storefront/redirects', { q: q || undefined, health: hf || undefined, page: String(n) })} />
            </>
          )}
        </Card>
      )}

      {edit && <RedirectEditor key={edit} id={edit} ctx={ctx} onClose={() => setEdit(null)} />}
      {dlg === 'import' && <ImportDialog ctx={ctx} onClose={() => setDlg(null)} />}
      {(dlg === 'bulkOff' || dlg === 'bulkDelete') && (
        <Modal title={dlg === 'bulkOff' ? tx(`إيقاف ${sel.size} تحويل`, `Turn off ${sel.size} redirects`) : tx(`حذف ${sel.size} تحويل`, `Delete ${sel.size} redirects`)} onClose={() => setDlg(null)}
          description={tx('من يفتح هذه الروابط يرى «الصفحة غير موجودة».', 'Anyone opening these addresses sees “page not found”.')}
          footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => {
            const before = list; const ids = [...sel]; const n = ids.length;
            redirectsStore.set((l) => (dlg === 'bulkOff' ? l.map((x) => (ids.includes(x.id) ? { ...x, on: false } : x)) : l.filter((x) => !ids.includes(x.id))));
            logAction('store', { ar: `${dlg === 'bulkOff' ? 'أوقف' : 'حذف'} ${n} تحويل`, en: `${dlg === 'bulkOff' ? 'Turned off' : 'Deleted'} ${n} redirects` }, { target: selRows.map((r) => r.from).join(', ').slice(0, 120) });
            setSel(new Set()); setDlg(null);
            toast({ tone: 'ok', text: tx('تم', 'Done'), action: { label: tx('تراجع', 'Undo'), run: () => redirectsStore.set(before) } });
          }}>{dlg === 'bulkOff' ? tx('أوقف', 'Turn off') : tx('احذف', 'Delete')}</Button></>}>
          <ul className="max-h-48 space-y-1 overflow-y-auto font-mono text-xs text-fg">{selRows.map((r) => <li key={r.id}><bdi dir="ltr">{r.from}</bdi> · <span className="tabular-nums text-muted">{tx(`${r.hits} زيارة`, `${r.hits} hits`)}</span></li>)}</ul>
        </Modal>
      )}
    </div>
  );
}

/** Type any address: see where the store sends it, hop by hop. */
function TestUrl({ list, ctx, base }: { list: Redirect[]; ctx: RCtx; base: string }) {
  const tx = useTx();
  const [v, setV] = useState('');
  const [path, setPath] = useState('');
  const t = path ? trace(path, list, ctx) : null;
  return (
    <Card aria-labelledby="r-test">
      <CardHeader id="r-test" title={tx('اختبر رابطًا', 'Test an address')} hint={tx('الصق رابطًا كاملًا أو مسارًا. نتبع التحويلات كما يفعل المتجر.', 'Paste a full link or a path. We follow redirects the way the store does.')} />
      <form className="flex flex-wrap items-end gap-2 px-5 pb-4" onSubmit={(e) => { e.preventDefault(); setPath(normPath(v)); }}>
        <div className="min-w-0 flex-1"><Input aria-label={tx('الرابط', 'Address')} dir="ltr" value={v} placeholder={`${base}/products/black-abaya`} onChange={(e) => setV(e.target.value)} /></div>
        <Button type="submit" variant="secondary" disabled={!v.trim()}>{tx('اختبر', 'Test')}</Button>
      </form>
      {t && (
        <div className="space-y-2 border-t border-border px-5 py-4 text-sm" role="status">
          <p className="font-mono text-xs text-muted"><bdi dir="ltr">{path}</bdi></p>
          {t.hops.map((h, i) => <p key={i} className="flex items-center gap-2"><Badge tone={h.code === 301 ? 'brand' : 'sky'}>{h.code}</Badge><bdi dir="ltr" className="truncate font-mono text-xs text-fg">{h.to}</bdi></p>)}
          <p className={cn('flex items-center gap-1.5 font-semibold', t.loop || t.tooLong || (!t.served && !t.external) ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400')}>
            {t.loop ? <><Repeat className="size-4" aria-hidden="true" />{tx('حلقة: التحويلات تعود لنفسها', 'Loop: the redirects come back to themselves')}</>
              : t.tooLong ? <><AlertTriangle className="size-4" aria-hidden="true" />{tx('أكثر من 10 تحويلات متتالية', 'More than 10 redirects in a row')}</>
                : t.external ? tx('ينتهي برابط خارجي', 'Ends at an external link')
                  : t.served ? (t.hops.length ? tx(`يصل خلال ${t.hops.length} ${t.hops.length > 1 ? 'تحويلات' : 'تحويل'}`, `Arrives after ${t.hops.length} redirect${t.hops.length > 1 ? 's' : ''}`) : tx('صفحة يخدمها المتجر مباشرة (لا تحويل)', 'A page the store serves directly (no redirect)'))
                    : t.hops.length ? tx('يصل إلى صفحة غير موجودة', 'Ends on a page that does not exist') : tx('لا تحويل لهذا الرابط: يرى العميل «غير موجودة»', 'No redirect for this address: shoppers see “not found”')}
          </p>
          {t.hops.length > 1 && !t.loop && <p className="text-xs text-muted">{tx('السلاسل تبطئ الصفحة وتضعف SEO. اختصرها من الجدول.', 'Chains slow the page and weaken SEO. Shorten them from the table.')}</p>}
        </div>
      )}
    </Card>
  );
}

const blank = (): Redirect => ({ id: '', from: '', to: { kind: 'product', id: '' }, code: 301, on: true, hits: 0, at: '', by: '' });

function RedirectEditor({ id, ctx, onClose }: { id: string; ctx: RCtx; onClose: () => void }) {
  const tx = useTx();
  const toast = useToast();
  const R = useRLabels();
  const { lang } = useLang();
  const list = redirectsStore.use();
  const saved = id === 'new' ? null : list.find((r) => r.id === id) ?? null;
  const [r, setR] = useState<Redirect>(() => saved ?? blank());
  const [fromText, setFromText] = useState(saved?.from ?? '');
  const [tried, setTried] = useState(false);
  const dirty = JSON.stringify(r) !== JSON.stringify(saved ?? blank()) || fromText !== (saved?.from ?? '');
  useUnsaved(dirty, { ar: 'تعديل تحويل', en: 'Redirect edit' });
  if (id !== 'new' && !saved) return <Modal title={tx('التحويل غير موجود', 'Redirect not found')} onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>{tx('إغلاق', 'Close')}</Button>} />;
  const from = normPath(fromText);
  const fi = fromIssue(from, list, ctx, saved?.id);
  const tIssue = r.to.kind === 'url' ? (validHttps(r.to.url) ? null : 'url') : (r.to as { id: string }).id ? targetIssue(r.to, ctx) : 'missing';
  const candidate: Redirect = { ...r, from, id: saved?.id ?? '__new', on: true };
  const others = list.filter((x) => x.id !== saved?.id);
  const t = from && !fi && (!tIssue || tIssue === 'archived' || tIssue === 'hidden') ? trace(from, [...others, candidate], ctx) : null;
  const loop = (!!from && targetPath(r.to, ctx) === from) || (!!t && (t.loop || t.tooLong));
  const chain = !!t && !loop && t.hops.length > 1;
  const block = !!fi || (!!tIssue && tIssue !== 'archived' && tIssue !== 'hidden') || loop;
  const opts = (k: RKind) => k === 'product' ? ctx.products.filter((p) => !p.archived) : k === 'category' ? ctx.categories : k === 'page' ? ctx.pages : k === 'landing' ? ctx.landings : k === 'post' ? ctx.posts : [];
  const save = () => {
    setTried(true);
    if (block) return;
    const now = new Date().toISOString();
    const who = currentActor().name;
    if (saved) redirectsStore.set((l) => l.map((x) => (x.id === saved.id ? { ...r, from, at: now, by: who } : x)));
    else redirectsStore.set((l) => [{ ...r, from, id: `r${nextRedirectNum(l)}`, at: now, by: who }, ...l]);
    logAction('store', { ar: `${saved ? 'عدّل' : 'أضاف'} التحويل ${from} ← ${targetPath(r.to, ctx)} (${r.code})`, en: `${saved ? 'Edited' : 'Added'} redirect ${from} → ${targetPath(r.to, ctx)} (${r.code})` }, { target: from, before: saved ? `${saved.from} → ${targetPath(saved.to, ctx)}` : undefined, after: `${from} → ${targetPath(r.to, ctx)}` });
    toast({ tone: 'ok', text: saved ? tx('حُفظ التحويل', 'Redirect saved') : tx('أُضيف التحويل ويعمل الآن', 'Redirect added and working') });
    setR(saved ?? blank()); setFromText(from);
    onClose();
  };
  const fiText = fi ? ({ empty: tx('أدخل الرابط القديم', 'Enter the old address'), format: tx('رابط غير صالح (بلا مسافات، 200 حرف كحد)', 'Not a valid address (no spaces, 200 characters max)'), served: tx('هذا رابط يخدمه المتجر الآن؛ التحويل منه لن يعمل', 'The store serves this address now; a redirect from it would never run'), duplicate: tx('يوجد تحويل لهذا الرابط', 'This address already has a redirect') })[fi] : null;
  return (
    <Modal size="lg" title={saved ? tx('تعديل تحويل', 'Edit redirect') : tx('تحويل جديد', 'New redirect')} onClose={onClose}
      footer={<>
        {saved && <Button variant="ghost" className="me-auto text-red-700 dark:text-red-400" onClick={() => { const before = list; redirectsStore.set((l) => l.filter((x) => x.id !== saved.id)); logAction('store', { ar: `حذف التحويل ${saved.from}`, en: `Deleted redirect ${saved.from}` }, { target: saved.from }); toast({ tone: 'ok', text: tx('حُذف التحويل', 'Redirect deleted'), action: { label: tx('تراجع', 'Undo'), run: () => redirectsStore.set(before) } }); onClose(); }}><Trash2 className="size-4" aria-hidden="true" />{tx('احذف', 'Delete')}</Button>}
        <Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={save} disabled={tried && block}>{tx('احفظ', 'Save')}</Button>
      </>}>
      <Field label={tx('الرابط القديم', 'Old address')} error={tried || (from && fi && fi !== 'empty') ? fiText : null} hint={from ? <>{tx('يُحفظ كـ', 'Saved as')} <bdi dir="ltr" className="font-mono">{from}</bdi></> : tx('مسار أو رابط كامل', 'A path or a full link')}>
        {(f) => <Input {...f} dir="ltr" value={fromText} placeholder="/old-product" onChange={(e) => setFromText(e.target.value)} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tx('نوع الوجهة', 'Target type')}>
          {(f) => <Select {...f} value={r.to.kind} onChange={(e) => { const k = e.target.value as RKind; setR({ ...r, to: k === 'url' ? { kind: 'url', url: '' } : { kind: k, id: '' } as RTarget }); }}>
            {R_KINDS.map((k) => <option key={k} value={k}>{R.kind(k)}</option>)}
          </Select>}
        </Field>
        {r.to.kind === 'url' ? (
          <Field label={tx('الرابط الخارجي', 'External link')} error={tried && tIssue ? R.issue('url') : null}>
            {(f) => <Input {...f} dir="ltr" value={(r.to as { url: string }).url} placeholder="https://" onChange={(e) => setR({ ...r, to: { kind: 'url', url: e.target.value.trim() } })} />}
          </Field>
        ) : (
          <Field label={R.kind(r.to.kind)} error={tried && tIssue === 'missing' ? tx('اختر الوجهة', 'Choose the target') : null}>
            {(f) => <Select {...f} value={(r.to as { id: string }).id} onChange={(e) => setR({ ...r, to: { kind: r.to.kind, id: e.target.value } as RTarget })}>
              <option value="">{tx('اختر…', 'Choose…')}</option>
              {opts(r.to.kind).map((o) => <option key={o.id} value={o.id}>{o.name}{'served' in o && !o.served ? ` (${tx('غير منشور', 'not live')})` : ''}</option>)}
            </Select>}
          </Field>
        )}
      </div>
      <Field label={<>{tx('النوع', 'Type')}<InfoHint>{tx('301 للنقل الدائم (يحفظ ترتيب البحث). 302 للحملات المؤقتة.', '301 for permanent moves (keeps search ranking). 302 for temporary campaigns.')}</InfoHint></>}>
        {() => <Segmented label={tx('النوع', 'Type')} value={String(r.code) as '301' | '302'} onChange={(v) => setR({ ...r, code: v === '302' ? 302 : 301 })} options={[{ value: '301', label: tx('301 دائم', '301 permanent') }, { value: '302', label: tx('302 مؤقت', '302 temporary') }]} />}
      </Field>
      {tIssue === 'archived' || tIssue === 'hidden' ? <Alert tone="warn">{R.issue(tIssue)} · {tx('سيرى العميل «غير موجودة» حتى تعود.', 'Shoppers will see “not found” until it is back.')}</Alert> : null}
      {loop && <Alert tone="bad" title={tx('هذا يصنع حلقة', 'This makes a loop')}>{tx('الوجهة تحوّل في النهاية إلى الرابط القديم نفسه. اختر وجهة أخرى.', 'The target eventually redirects back to the old address. Choose another target.')}</Alert>}
      {chain && t && <Alert tone="warn" title={tx(`سلسلة من ${t.hops.length} تحويلات`, `A chain of ${t.hops.length} redirects`)}>{tx('الأفضل أن يشير التحويل للوجهة الأخيرة مباشرة:', 'Better to point straight at the final target:')} <bdi dir="ltr" className="font-mono text-xs">{t.final}</bdi></Alert>}
      {from && !fi && !tIssue && !loop && <p className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2/60 px-3 py-2 text-sm"><bdi dir="ltr" className="font-mono text-xs">{from}</bdi><ArrowLeftRight className="size-3.5 text-subtle" aria-hidden="true" /><bdi dir="ltr" className="font-mono text-xs">{targetPath(r.to, ctx)}</bdi><Badge tone={r.code === 301 ? 'brand' : 'sky'}>{r.code}</Badge><span className="text-xs text-muted">{lang === 'ar' ? 'يعمل فور الحفظ' : 'Works as soon as you save'}</span></p>}
      <Simulated />
    </Modal>
  );
}

function ImportDialog({ ctx, onClose }: { ctx: RCtx; onClose: () => void }) {
  const tx = useTx();
  const toast = useToast();
  const list = redirectsStore.use();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileErr, setFileErr] = useState('');
  useUnsaved(!!text.trim(), { ar: 'استيراد تحويلات', en: 'Redirect import' });
  const err = (e: ImportRow['error']) => ({ from: tx('رابط قديم غير صالح', 'Invalid old address'), served: tx('رابط يخدمه المتجر', 'Served by the store'), to: tx('وجهة غير موجودة', 'Target not found'), code: tx('النوع 301 أو 302', 'Type must be 301 or 302'), repeat: tx('مكرر في الملف', 'Repeated in the file'), columns: tx('عمودان على الأقل', 'At least two columns') })[e!];
  const ok = rows?.filter((r) => r.state !== 'error') ?? [];
  const n = { add: rows?.filter((r) => r.state === 'new').length ?? 0, upd: rows?.filter((r) => r.state === 'update').length ?? 0, bad: rows?.filter((r) => r.state === 'error').length ?? 0 };
  return (
    <Modal size="lg" title={tx('استيراد تحويلات من CSV', 'Import redirects from CSV')} onClose={onClose}
      description={tx('ثلاثة أعمدة: الرابط القديم، الوجهة، النوع (301 افتراضيًا). لا يُضاف شيء قبل التأكيد.', 'Three columns: old address, target, type (301 by default). Nothing is added before you confirm.')}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button>
        {rows ? <Button disabled={!ok.length} onClick={() => {
          const before = list;
          redirectsStore.set((l) => applyImport(l, rows, new Date().toISOString(), currentActor().name));
          logAction('store', { ar: `استورد ${n.add} تحويلًا وحدّث ${n.upd}`, en: `Imported ${n.add} redirects and updated ${n.upd}` });
          toast({ tone: 'ok', text: tx(`أُضيف ${n.add} وحُدّث ${n.upd}`, `${n.add} added, ${n.upd} updated`), action: { label: tx('تراجع', 'Undo'), run: () => redirectsStore.set(before) } });
          setText(''); onClose();
        }}>{tx(`أضف ${n.add} وحدّث ${n.upd}`, `Add ${n.add}, update ${n.upd}`)}</Button>
          : <Button disabled={!text.trim()} onClick={() => setRows(parseCsv(text, list, ctx))}>{tx('عاين', 'Preview')}</Button>}</>}>
      {!rows ? (
        <>
          <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2">
            <FileUp className="size-4" aria-hidden="true" />{tx('اختر ملف CSV', 'Choose a CSV file')}
            <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (f.size > 512 * 1024) { setFileErr(tx('الحد 512 كيلوبايت', 'Max 512 KB')); return; } setFileErr(''); setText((await f.text()).replace(/^﻿/, '')); }} />
          </label>
          {fileErr && <p className="text-xs font-medium text-red-600 dark:text-red-400">{fileErr}</p>}
          <Field label={tx('أو الصق الأسطر', 'Or paste the rows')}>{(f) => <Textarea {...f} rows={7} dir="ltr" className="font-mono text-xs" value={text} placeholder={'from,to,code\n/old-abaya,/p/p1,301\n/eid,/lp/ramadan,302\n/ig,https://www.instagram.com/,302'} onChange={(e) => setText(e.target.value)} />}</Field>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2"><Badge tone="green">{tx(`${n.add} جديد`, `${n.add} new`)}</Badge><Badge tone="brand">{tx(`${n.upd} تحديث`, `${n.upd} update`)}</Badge>{n.bad > 0 && <Badge tone="red">{tx(`${n.bad} خطأ يُتجاهل`, `${n.bad} errors skipped`)}</Badge>}
            <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setRows(null)}>{tx('عدّل النص', 'Edit text')}</Button></div>
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border text-xs">
            {rows.map((r) => (
              <li key={r.line} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2', r.state === 'error' && 'bg-red-500/5')}>
                <span className="w-8 text-muted tabular-nums">{r.line}</span>
                <bdi dir="ltr" className="min-w-0 flex-1 truncate font-mono text-fg">{r.state === 'error' ? r.raw : `${r.from} → ${r.to ? targetPath(r.to, ctx) : ''}`}</bdi>
                {r.state === 'error' ? <span className="font-medium text-red-700 dark:text-red-400">{err(r.error)}</span> : <Badge tone={r.state === 'new' ? 'green' : 'brand'}>{r.state === 'new' ? tx('جديد', 'New') : tx('يستبدل الحالي', 'Replaces current')} · {r.code}</Badge>}
              </li>
            ))}
          </ul>
          {rows.length === 0 && <p className="text-sm text-muted">{tx('لا أسطر في الملف.', 'No rows in the file.')}</p>}
        </>
      )}
    </Modal>
  );
}

