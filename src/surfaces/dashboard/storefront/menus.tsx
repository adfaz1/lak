// Online store → Menus (`#/dashboard/storefront/menus`): the store header and footer navigation. Items link to
// categories, pages, products, policies, store pages or an external address; order by dragging or with the arrows.
// Edits save to a draft automatically; shoppers see the menus only after "Review and publish".
import { useMemo, useState, type DragEvent } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, GripVertical, Link2, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { can, canSee } from '../../merchant/perms';
import { levelsStore, logAction, productsStore, settingsStore } from '../../merchant/stores';
import { POLICY_IDS } from '../settings/model';
import { Badge, Button, Card, CardHeader, ErrorState, IconButton, Skeleton, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, PageHeader, Select, useToast } from '../../../ds/kit';
import { linkContext } from '../../storefront/bridge';
import { STORE_PALETTE as P } from './model';
import { useDashState, setDashState } from '../review';
import { Locked, NoAccess, ReviewRole, useRole } from '../marketing/access';
import {
  LABEL_MAX, MENU_IDS, MENU_MAX, linkIssue, menuDiff, menuErrors, menuHasErrors, menusDirty, moveItem, publishMenus, resolveMenu, targetName, validUrl,
  type LinkContext, type LinkTarget, type MenuId, type MenuItem,
} from './content';
import { contentStore } from './state';
import { StoreTabs } from './nav';

type Kind = LinkTarget['kind'];
const KINDS: Kind[] = ['category', 'page', 'product', 'policy', 'all', 'home', 'track', 'account', 'url'];

function useKindLabel() {
  const tx = useTx();
  return (k: Kind) => ({ category: tx('تصنيف', 'Category'), page: tx('صفحة', 'Page'), product: tx('منتج', 'Product'), policy: tx('سياسة', 'Policy'), all: tx('كل المنتجات', 'All products'), home: tx('الرئيسية', 'Home'), track: tx('تتبع الطلب', 'Order tracking'), account: tx('حساب العميل', 'Customer account'), url: tx('رابط خارجي', 'External link') })[k];
}

export default function MenusPage() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const role = useRole();
  const state = useDashState();
  const content = contentStore.use();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const settings = settingsStore.use();
  const kindLabel = useKindLabel();
  const [editing, setEditing] = useState<{ menu: MenuId; item: MenuItem | null } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [drag, setDrag] = useState<{ menu: MenuId; from: number } | null>(null);
  const ctx = useMemo(() => linkContext(products, levels, content.pages, settings.policies), [products, levels, content.pages, settings.policies]);

  if (!canSee(role, 'storefront')) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('المتجر الإلكتروني غير متاح لدورك', 'The online store is not available for your role')} /></div>;
  const canPub = can(role, 'theme.publish');
  const m = content.menus;
  const errors = menuErrors(m.draft);
  const dirty = menusDirty(m);
  const setDraft = (menu: MenuId, items: MenuItem[]) => contentStore.set((c) => ({ ...c, menus: { ...c.menus, draft: { ...c.menus.draft, [menu]: items } } }));

  const header = (
    <>
      <PageHeader title={tx('قوائم المتجر', 'Store menus')} description={tx('روابط رأس المتجر وتذييله', 'Links in the store header and footer')}
        meta={<><Badge tone="green">{tx(`المنشور: الإصدار ${m.version}`, `Live: version ${m.version}`)}</Badge><Badge tone={dirty ? 'brand' : 'gray'}>{dirty ? tx('المسودة فيها تغييرات', 'Draft has changes') : tx('المسودة مطابقة', 'Draft matches live')}</Badge></>}
        actions={canPub ? <Button disabled={!dirty || menuHasErrors(errors)} onClick={() => setPublishing(true)}><Upload className="size-4" aria-hidden="true" />{tx('راجع وانشر', 'Review and publish')}</Button> : <Locked>{tx('النشر للمالك', 'Publishing is for the Owner')}</Locked>} />
      <StoreTabs current="menus" />
      <ReviewRole />
    </>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<div className="grid gap-6 lg:grid-cols-2" role="status" aria-label="Loading">{[0, 1].map((i) => <Card key={i} className="space-y-3 p-5">{[0, 1, 2, 3].map((j) => <Skeleton key={j} className="h-11 w-full rounded-xl" />)}</Card>)}</div></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل القوائم', 'Menus could not load')} onRetry={() => setDashState('live')}>{tx('قوائم متجرك المنشورة تعمل كما هي. المرجع SIM-MENU-503.', 'Your live store menus keep working. Ref SIM-MENU-503.')}</ErrorState></Card></div>;
  const empty = state === 'empty';

  const issueText = (i: MenuItem) => {
    const issue = linkIssue(i.target, ctx);
    return issue === 'missing' ? tx('الوجهة لم تعد موجودة؛ لن يظهر', 'Target no longer exists; hidden')
      : issue === 'unpublished' ? tx('الوجهة غير منشورة؛ لن يظهر حتى تُنشر', 'Target not published; hidden until it is')
        : issue === 'url' ? tx('رابط غير صالح (https فقط)', 'Invalid link (https only)') : null;
  };
  const onDrop = (menu: MenuId, to: number) => (e: DragEvent) => {
    e.preventDefault();
    if (!drag || drag.menu !== menu) return;
    setDraft(menu, moveItem(m.draft[menu], drag.from, to));
    setDrag(null);
  };
  const title = (id: MenuId) => (id === 'header' ? tx('قائمة الرأس', 'Header menu') : tx('قائمة التذييل', 'Footer menu'));

  return (
    <div className="space-y-6">
      {header}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="min-w-0 space-y-6 xl:col-span-3">
          {MENU_IDS.map((id) => {
            const items = empty ? [] : m.draft[id];
            return (
              <Card key={id} aria-labelledby={`mn-${id}`}>
                <CardHeader id={`mn-${id}`} title={title(id)} hint={id === 'header' ? tx('تظهر أعلى كل صفحة وفي قائمة الجوال.', 'Shown at the top of every page and in the phone menu.') : tx('تظهر في عمود «خدمة العملاء» أسفل الصفحات. السياسات لها عمودها الخاص.', 'Shown in the “Customer care” column at the foot of pages. Policies keep their own column.')}
                  action={<Button size="sm" variant="secondary" disabled={items.length >= MENU_MAX[id]} onClick={() => setEditing({ menu: id, item: null })}><Plus className="size-4" aria-hidden="true" />{tx('أضف رابطًا', 'Add link')}</Button>} />
                {errors[id] && <div className="px-5 pb-3"><Alert tone="warn">{tx(`الحد ${MENU_MAX[id]} روابط في هذه القائمة.`, `This menu takes up to ${MENU_MAX[id]} links.`)}</Alert></div>}
                {items.length === 0 ? (
                  <p className="border-t border-border px-5 py-6 text-sm text-muted">{id === 'header' ? tx('القائمة فارغة: يعرض المتجر التصنيفات تلقائيًا.', 'Empty: the store shows your categories automatically.') : tx('القائمة فارغة: يعرض المتجر «تتبع الطلب» و«حسابي».', 'Empty: the store shows “Track order” and “My account”.')}</p>
                ) : (
                  <ol className="divide-y divide-border border-t border-border" aria-label={title(id)}>
                    {items.map((i, idx) => {
                      const name = targetName(i.target, ctx);
                      const shown = { ar: i.label.ar || name.ar, en: i.label.en || name.en };
                      const issue = issueText(i);
                      return (
                        <li key={i.id} draggable onDragStart={() => setDrag({ menu: id, from: idx })} onDragOver={(e) => e.preventDefault()} onDrop={onDrop(id, idx)} onDragEnd={() => setDrag(null)}
                          className={cn('flex items-center gap-2 px-3 py-2.5 sm:px-4', drag?.menu === id && drag.from === idx && 'opacity-50')}>
                          <GripVertical className="size-4 shrink-0 cursor-grab text-subtle max-sm:hidden" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-fg">{shown[lang]}</p>
                            <p className="flex min-w-0 items-center gap-1 truncate text-xs text-muted"><Link2 className="size-3 shrink-0" aria-hidden="true" />{kindLabel(i.target.kind)}{i.target.kind !== 'all' && i.target.kind !== 'home' && i.target.kind !== 'track' && i.target.kind !== 'account' && <> · <bdi className="truncate">{i.target.kind === 'url' ? i.target.url : name[lang]}</bdi></>}</p>
                            {issue && <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300"><AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />{issue}</p>}
                          </div>
                          <IconButton label={tx(`انقل «${shown[lang]}» للأعلى`, `Move “${shown[lang]}” up`)} disabled={idx === 0} className="disabled:opacity-30" onClick={() => setDraft(id, moveItem(items, idx, idx - 1))}><ArrowUp className="size-4" aria-hidden="true" /></IconButton>
                          <IconButton label={tx(`انقل «${shown[lang]}» للأسفل`, `Move “${shown[lang]}” down`)} disabled={idx === items.length - 1} className="disabled:opacity-30" onClick={() => setDraft(id, moveItem(items, idx, idx + 1))}><ArrowDown className="size-4" aria-hidden="true" /></IconButton>
                          <IconButton label={tx(`عدّل «${shown[lang]}»`, `Edit “${shown[lang]}”`)} onClick={() => setEditing({ menu: id, item: i })}><Pencil className="size-4" aria-hidden="true" /></IconButton>
                          <IconButton label={tx(`احذف «${shown[lang]}»`, `Remove “${shown[lang]}”`)} className="text-red-700 dark:text-red-400" onClick={() => setDraft(id, items.filter((x) => x.id !== i.id))}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Card>
            );
          })}
          {dirty && <p className="flex flex-wrap items-center gap-2 text-xs text-muted">{tx('التعديلات محفوظة في المسودة ولا يراها العملاء حتى تنشر.', 'Edits are saved to the draft and stay invisible to shoppers until you publish.')}
            <Button variant="ghost" size="sm" onClick={() => contentStore.set((c) => ({ ...c, menus: { ...c.menus, draft: JSON.parse(JSON.stringify(c.menus.live)) } }))}>{tx('تجاهل المسودة', 'Discard draft')}</Button></p>}
        </div>
        <div className="min-w-0 xl:col-span-2"><MenuPreview ctx={ctx} header={empty ? [] : m.draft.header} footer={empty ? [] : m.draft.footer} store={settings.store.name} /></div>
      </div>

      {editing && <ItemModal ctx={ctx} item={editing.item} onClose={() => setEditing(null)} onSave={(item) => {
        const list = m.draft[editing.menu];
        setDraft(editing.menu, list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]);
        setEditing(null);
      }} />}
      {publishing && (() => {
        const diffs = MENU_IDS.map((id) => ({ id, changes: menuDiff(m.live[id], m.draft[id], ctx) })).filter((d) => d.changes.length);
        const hidden = MENU_IDS.flatMap((id) => m.draft[id].filter((i) => linkIssue(i.target, ctx)));
        const word = (k: string) => ({ added: tx('أُضيف', 'Added'), removed: tx('حُذف', 'Removed'), moved: tx('تغيّر', 'Changed'), edited: tx('عُدّل', 'Edited') } as Record<string, string>)[k];
        return (
          <Modal size="lg" title={tx(`نشر القوائم (الإصدار ${m.version + 1})`, `Publish menus (version ${m.version + 1})`)} onClose={() => setPublishing(false)}
            description={tx('يرى العملاء القوائم الجديدة فورًا في كل صفحات المتجر.', 'Shoppers see the new menus immediately on every store page.')}
            footer={<><Button variant="secondary" onClick={() => setPublishing(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => {
              contentStore.set((c) => ({ ...c, menus: publishMenus(c.menus, new Date().toISOString()) }));
              logAction('store', { ar: `نشر الإصدار ${m.version + 1} من قوائم المتجر`, en: `Published store menus version ${m.version + 1}` }, { before: `v${m.version}`, after: `v${m.version + 1}` });
              setPublishing(false);
              toast({ tone: 'ok', text: tx('نُشرت القوائم في المتجر', 'Menus published to the store') });
            }}><Upload className="size-4" aria-hidden="true" />{tx('انشر للعملاء', 'Publish to shoppers')}</Button></>}>
            {diffs.map((d) => (
              <div key={d.id}>
                <p className="mb-1.5 text-xs font-semibold text-muted">{title(d.id)}</p>
                <ul className="space-y-1 text-sm">{d.changes.map((c, i) => <li key={i} className="flex items-center gap-2"><Badge tone={c.kind === 'removed' ? 'red' : c.kind === 'added' ? 'green' : 'sky'}>{word(c.kind)}</Badge><span className="text-fg">{c.label[lang]}</span></li>)}</ul>
              </div>
            ))}
            {hidden.length > 0 && <Alert tone="warn">{tx(`${hidden.length} رابط لن يظهر لأن وجهته غير منشورة أو غير موجودة.`, `${hidden.length} link${hidden.length > 1 ? 's' : ''} won’t show because the target is unpublished or missing.`)}</Alert>}
            <MenuPreview ctx={ctx} header={m.draft.header} footer={m.draft.footer} store={settings.store.name} compact />
          </Modal>
        );
      })()}
    </div>
  );
}

/** What shoppers will see, drawn in the store's own colours from the draft (only links that would work). */
function MenuPreview({ ctx, header, footer, store, compact }: { ctx: LinkContext; header: MenuItem[]; footer: MenuItem[]; store: string; compact?: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const h = resolveMenu(header, ctx);
  const f = resolveMenu(footer, ctx);
  return (
    <figure className={cn('overflow-hidden rounded-2xl border border-border', !compact && 'xl:sticky xl:top-24')} aria-label={tx('معاينة القوائم', 'Menus preview')}>
      <figcaption className="flex items-center justify-between gap-2 bg-surface px-4 py-2.5 text-xs font-semibold text-muted">{tx('معاينة المسودة', 'Draft preview')}<span className="font-normal">{tx('بألوان متجرك', 'In your store’s colours')}</span></figcaption>
      <div style={{ background: P.bg, color: P.ink }} className="text-[13px]">
        <div style={{ borderColor: P.line, background: P.paper }} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-y px-4 py-3">
          <span className="text-base font-bold">{store}</span>
          {(h.length ? h : [{ id: 'auto', label: { ar: 'التصنيفات تلقائيًا', en: 'Categories (automatic)' } }]).map((x) => <span key={x.id} style={{ color: P.muted }}>{x.label[lang]}</span>)}
        </div>
        <div className="h-16" aria-hidden="true" />
        <div style={{ borderColor: P.line, background: P.paper }} className="border-t px-4 py-4">
          <p className="mb-2 text-xs font-semibold">{tx('خدمة العملاء', 'Customer care')}</p>
          <ul className="space-y-1.5" style={{ color: P.muted }}>{(f.length ? f : [{ id: 'a', label: { ar: 'تتبع الطلب', en: 'Track order' } }, { id: 'b', label: { ar: 'حسابي', en: 'My account' } }]).map((x) => <li key={x.id}>{x.label[lang]}</li>)}</ul>
        </div>
      </div>
    </figure>
  );
}

function ItemModal({ ctx, item, onClose, onSave }: { ctx: LinkContext; item: MenuItem | null; onClose: () => void; onSave: (i: MenuItem) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const kindLabel = useKindLabel();
  const [kind, setKind] = useState<Kind>(item?.target.kind ?? 'category');
  const first = (k: Kind): string => k === 'category' ? ctx.categories[0]?.id ?? '' : k === 'page' ? ctx.pages[0]?.id ?? '' : k === 'product' ? ctx.products[0]?.id ?? '' : k === 'policy' ? 'returns' : '';
  const [ref, setRef] = useState<string>(item && 'id' in item.target ? item.target.id : first(item?.target.kind ?? 'category'));
  const [url, setUrl] = useState(item?.target.kind === 'url' ? item.target.url : 'https://');
  const [label, setLabel] = useState(item?.label ?? { ar: '', en: '' });
  const [tried, setTried] = useState(false);
  const target: LinkTarget = kind === 'url' ? { kind, url: url.trim() } : kind === 'category' || kind === 'page' || kind === 'product' ? { kind, id: ref } : kind === 'policy' ? { kind, id: ref as never } : { kind } as LinkTarget;
  const name = targetName(target, ctx);
  const issue = linkIssue(target, ctx);
  const urlBad = kind === 'url' && !validUrl(url);
  const longLabel = label.ar.length > LABEL_MAX || label.en.length > LABEL_MAX;
  const options: { value: string; label: string; note?: string }[] = kind === 'category' ? ctx.categories.map((c) => ({ value: c.id, label: c.name[lang] }))
    : kind === 'page' ? ctx.pages.map((p) => ({ value: p.id, label: (p.live ?? p.draft).title[lang] || p.slug, note: linkIssue({ kind: 'page', id: p.id }, ctx) ? tx('غير منشورة', 'not published') : undefined }))
      : kind === 'product' ? ctx.products.map((p) => ({ value: p.id, label: p.name[lang], note: p.live ? undefined : tx('لا يُباع أونلاين', 'not sold online') }))
        : kind === 'policy' ? POLICY_IDS.map((id) => ({ value: id, label: targetName({ kind: 'policy', id }, ctx)[lang], note: linkIssue({ kind: 'policy', id }, ctx) ? tx('غير منشورة', 'not published') : undefined }))
          : [];
  return (
    <Modal title={item ? tx('تعديل الرابط', 'Edit link') : tx('رابط جديد', 'New link')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { setTried(true); if (urlBad || longLabel || (options.length === 0 && kind !== 'url' && ['category', 'page', 'product'].includes(kind))) return; onSave({ id: item?.id ?? `m${Date.now()}`, label: { ar: label.ar.trim(), en: label.en.trim() }, target }); }}>{item ? tx('حدّث في المسودة', 'Update draft') : tx('أضف إلى المسودة', 'Add to draft')}</Button></>}>
      <Field label={tx('يفتح', 'Opens')}>
        {(f) => <Select {...f} value={kind} onChange={(e) => { const k = e.target.value as Kind; setKind(k); setRef(first(k)); }}>{KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}</Select>}
      </Field>
      {options.length > 0 && (
        <Field label={kindLabel(kind)}>
          {(f) => <Select {...f} value={ref} onChange={(e) => setRef(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}{o.note ? ` (${o.note})` : ''}</option>)}</Select>}
        </Field>
      )}
      {kind === 'url' && (
        <Field label={tx('العنوان', 'Address')} error={tried && urlBad ? tx('رابط يبدأ بـ https:// أو mailto: أو tel:', 'A link starting with https://, mailto: or tel:') : null}>
          {(f) => <Input {...f} dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />}
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {(['ar', 'en'] as const).map((l) => (
          <Field key={l} optional label={tx(`النص · ${l === 'ar' ? 'العربية' : 'الإنجليزية'}`, `Label · ${l === 'ar' ? 'Arabic' : 'English'}`)} error={tried && label[l].length > LABEL_MAX ? tx(`${LABEL_MAX} حرفًا كحد أقصى`, `${LABEL_MAX} characters maximum`) : null}>
            {(f) => <Input {...f} dir={l === 'ar' ? 'rtl' : 'ltr'} lang={l} value={label[l]} placeholder={name[l]} onChange={(e) => setLabel({ ...label, [l]: e.target.value })} />}
          </Field>
        ))}
      </div>
      {issue && issue !== 'url' && <Alert tone="warn">{issue === 'unpublished' ? tx('الوجهة غير منشورة: يُحفظ الرابط لكنه لا يظهر للعملاء حتى تُنشر.', 'The target isn’t published: the link is saved but won’t show until it is.') : tx('الوجهة غير موجودة.', 'The target doesn’t exist.')}</Alert>}
    </Modal>
  );
}
