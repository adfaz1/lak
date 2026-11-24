// Categories (`#/dashboard/products/categories`): the category tree the storefront menu follows. Create (top level or
// under a parent), rename (carried onto its products), reorder, hide from the store, delete (after moving its products).
// Rules: merchant/catalog.ts (validateCategory, categoryTree, renameCategory, moveToCategory) and ./model.
import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, FolderPlus, FolderTree, Pencil, Trash2 } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { categoryTree, moveToCategory, renameCategory, validateCategory, type Category } from '../../merchant/catalog';
import { can } from '../../merchant/perms';
import { categoriesStore, productsStore } from '../../merchant/stores';
import { Badge, Button, Card, EmptyState, ErrorState, InfoHint, LinkButton, Skeleton, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, PageHeader, Select, Switch, Textarea, useToast } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { useUnsaved } from '../unsaved';
import { deleteBlock, moveCategory, newCategoryId, productsIn, productsUnder, slugify } from './model';
import { CatalogNav, ReviewTools, phref, roleBadge, useRole } from './common';

interface Draft { id: string | null; nameAr: string; nameEn: string; parent: string; slug: string; descAr: string; descEn: string; seoTitle: string; seoDesc: string; visible: boolean }
const blank = (parent = ''): Draft => ({ id: null, nameAr: '', nameEn: '', parent, slug: '', descAr: '', descEn: '', seoTitle: '', seoDesc: '', visible: true });
const toDraft = (c: Category): Draft => ({ id: c.id, nameAr: c.name.ar, nameEn: c.name.en, parent: c.parent ?? '', slug: c.slug, descAr: c.desc.ar, descEn: c.desc.en, seoTitle: c.seo.title, seoDesc: c.seo.desc, visible: c.visible });
/** An unsaved category form survives leaving the page in this session. */
let kept: Draft | null = null;

export default function Categories() {
  const tx = useTx();
  const { lang } = useLang();
  const state = useDashState();
  const role = useRole();
  const canEdit = can(role, 'product.edit');
  const cats = categoriesStore.use();
  const products = productsStore.use();
  const toast = useToast();
  const [form, setForm] = useState<Draft | null>(kept);
  const [del, setDel] = useState<Category | null>(null);
  const tree = categoryTree(cats);
  const back = { href: phref(), label: tx('المنتجات', 'Products') };
  const header = (
    <PageHeader back={back} title={tx('الفئات', 'Categories')} description={state === 'live' ? tx(`${cats.length} فئة · ترتيبها هو ترتيب قائمة المتجر`, `${cats.length} categories · their order is the store menu order`) : undefined}
      meta={!canEdit ? roleBadge(tx) : undefined}
      actions={canEdit && <Button onClick={() => setForm(blank())}><FolderPlus className="size-4" aria-hidden="true" />{tx('أضف فئة', 'Add category')}</Button>} />
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<CatalogNav /><Skeleton className="h-96 rounded-2xl" /></div>;
  if (state === 'error') return <div className="space-y-6">{header}<CatalogNav /><Card><ErrorState as="h2" title={tx('تعذّر تحميل الفئات', 'Categories could not load')} onRetry={() => setDashState('live')}>{tx('لم يتغير شيء. المرجع SIM-CAT-503.', 'Nothing changed. Ref SIM-CAT-503.')}</ErrorState></Card></div>;
  const shown = state === 'empty' ? [] : tree;
  const toggle = (c: Category) => {
    categoriesStore.set((cs) => cs.map((x) => (x.id === c.id ? { ...x, visible: !x.visible, version: x.version + 1 } : x)));
    toast({ tone: 'ok', text: c.visible ? tx(`أُخفيت «${c.name.ar}» من قائمة المتجر`, `“${c.name.en}” hidden from the store menu`) : tx(`ظهرت «${c.name.ar}» في المتجر`, `“${c.name.en}” shown in the store`) });
  };

  return (
    <div className="space-y-6">
      {header}
      <CatalogNav />
      <Card>
        {shown.length === 0 ? (
          <EmptyState as="h2" icon={<FolderTree className="size-6" aria-hidden="true" />} title={tx('لا فئات بعد', 'No categories yet')}
            action={canEdit ? <Button onClick={() => setForm(blank())}>{tx('أضف فئة', 'Add category')}</Button> : undefined}>{tx('الفئات تنظّم قائمة متجرك وتصفية المنتجات.', 'Categories organise your store menu and product filters.')}</EmptyState>
        ) : (
          <ul className="divide-y divide-border" aria-label={tx('شجرة الفئات', 'Category tree')}>
            {shown.map(({ cat, depth }, i) => {
              const n = productsUnder(products, cats, cat).length;
              const siblings = shown.filter((t) => (t.cat.parent ?? null) === (cat.parent ?? null));
              const pos = siblings.findIndex((t) => t.cat.id === cat.id);
              const parentHidden = !!cat.parent && cats.find((x) => x.id === cat.parent)?.visible === false;
              return (
                <li key={cat.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5', depth && 'ps-10 sm:ps-12')}>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-fg">{depth ? <span className="text-subtle" aria-hidden="true">↳</span> : null}{cat.name[lang]}
                      {(!cat.visible || parentHidden) && <Badge tone="gray" icon={<EyeOff className="size-3" aria-hidden="true" />}>{tx('مخفية في المتجر', 'Hidden in store')}</Badge>}
                    </p>
                    <p className="text-xs text-muted"><bdi dir="ltr">/c/{cat.slug || slugify(cat.name.en)}</bdi> · <a className="font-medium text-brand-700 hover:underline dark:text-brand-300" href={phref('', { cat: cat.name.en.toLowerCase() })}>{tx(`${n} منتجات`, `${n} products`)}</a></p>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <Icon label={tx(`قدّم ${cat.name.ar}`, `Move ${cat.name.en} up`)} disabled={pos <= 0} onClick={() => categoriesStore.set((cs) => moveCategory(cs, cat.id, -1))}><ArrowUp className="size-4" /></Icon>
                      <Icon label={tx(`أخّر ${cat.name.ar}`, `Move ${cat.name.en} down`)} disabled={pos >= siblings.length - 1} onClick={() => categoriesStore.set((cs) => moveCategory(cs, cat.id, 1))}><ArrowDown className="size-4" /></Icon>
                      <Icon label={cat.visible ? tx(`أخفِ ${cat.name.ar} من المتجر`, `Hide ${cat.name.en} from the store`) : tx(`أظهر ${cat.name.ar}`, `Show ${cat.name.en}`)} onClick={() => toggle(cat)}>{cat.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}</Icon>
                      <Icon label={tx(`عدّل ${cat.name.ar}`, `Edit ${cat.name.en}`)} onClick={() => setForm(toDraft(cat))}><Pencil className="size-4" /></Icon>
                      <Icon label={tx(`احذف ${cat.name.ar}`, `Delete ${cat.name.en}`)} onClick={() => setDel(cat)}><Trash2 className="size-4" /></Icon>
                      {depth === 0 && <Button variant="ghost" size="sm" onClick={() => setForm(blank(cat.id))}><FolderPlus className="size-3.5" aria-hidden="true" />{tx('فرعية', 'Sub')}</Button>}
                    </div>
                  )}
                  <span className="sr-only">{i + 1}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <ReviewTools />
      {form && <CategoryForm initial={form} onClose={() => { kept = null; setForm(null); }} onKeep={(d) => { kept = d; }} />}
      {del && <DeleteModal cat={del} onClose={() => setDel(null)} />}
    </div>
  );
}

function Icon({ label, children, ...p }: { label: string; children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return <button type="button" aria-label={label} title={label} className="grid size-9 place-items-center rounded-lg border border-border text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40 [&_svg]:pointer-events-none" {...p}>{children}</button>;
}

function CategoryForm({ initial, onClose, onKeep }: { initial: Draft; onClose: () => void; onKeep: (d: Draft) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const cats = categoriesStore.use();
  const products = productsStore.use();
  const [d, setD] = useState(initial);
  const [tried, setTried] = useState(false);
  const orig = d.id ? cats.find((c) => c.id === d.id) : undefined;
  const base = orig ? toDraft(orig) : blank(initial.id ? '' : initial.parent);
  useUnsaved(JSON.stringify(d) !== JSON.stringify(base), { ar: 'نموذج الفئة', en: 'Category form' });
  const set = (p: Partial<Draft>) => { const n = { ...d, ...p }; setD(n); onKeep(n); };
  const id = d.id ?? newCategoryId(cats, d.nameEn);
  const name = { ar: d.nameAr.trim(), en: d.nameEn.trim() };
  const errs = validateCategory({ id, name, parent: d.parent || null, slug: d.slug.trim() }, cats);
  const msg = (k: keyof typeof errs) => tried && errs[k] ? ({ required: tx('مطلوب', 'Required'), taken: tx('مستخدم لفئة أخرى', 'Used by another category'), slug: tx('حروف لاتينية صغيرة وأرقام وشرطات', 'Lowercase letters, digits and hyphens'), parent: tx('فئة رئيسية فقط، ولا تكون الفئة أبًا لنفسها', 'Top-level only, and not itself') })[errs[k]!] : undefined;
  const renamed = orig && (orig.name.ar !== name.ar || orig.name.en.trim().toLowerCase() !== name.en.toLowerCase() || orig.name.en !== name.en);
  const affected = orig ? productsIn(products, orig).length : 0;
  const parents = cats.filter((c) => !c.parent && c.id !== d.id);
  const hasChildren = !!d.id && cats.some((c) => c.parent === d.id);
  const save = () => {
    setTried(true);
    if (Object.keys(errs).length) return;
    const fields = { name, parent: d.parent || null, slug: d.slug.trim() || slugify(name.en), desc: { ar: d.descAr, en: d.descEn }, seo: { title: d.seoTitle, desc: d.seoDesc }, visible: d.visible };
    if (orig) {
      categoriesStore.set((cs) => cs.map((c) => (c.id === orig.id ? { ...c, ...fields, version: c.version + 1 } : c)));
      if (renamed) productsStore.set((ps) => renameCategory(ps, orig.name, name));
    } else {
      const order = cats.filter((c) => (c.parent ?? '') === (d.parent || '')).length;
      categoriesStore.set((cs) => [...cs, { id, ...fields, order, version: 1 }]);
    }
    toast({ tone: 'ok', text: orig ? (renamed && affected ? tx(`حُفظت الفئة وتغيّر اسمها على ${affected} منتجات`, `Category saved and renamed on ${affected} products`) : tx('حُفظت الفئة', 'Category saved')) : tx(`أُضيفت «${name.ar}»`, `“${name.en}” added`) });
    onClose();
  };
  return (
    <Modal size="lg" title={orig ? tx('عدّل الفئة', 'Edit category') : d.parent ? tx('فئة فرعية جديدة', 'New subcategory') : tx('فئة جديدة', 'New category')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={save}>{orig ? tx('احفظ', 'Save') : tx('أضف الفئة', 'Add category')}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={tx('الاسم بالعربية', 'Name in Arabic')} error={msg('nameAr')}>{(p) => <Input {...p} dir="rtl" lang="ar" value={d.nameAr} onChange={(e) => set({ nameAr: e.target.value })} />}</Field>
        <Field label={tx('الاسم بالإنجليزية', 'Name in English')} error={msg('nameEn')}>{(p) => <Input {...p} dir="ltr" lang="en" value={d.nameEn} onChange={(e) => set({ nameEn: e.target.value })} />}</Field>
        <Field label={tx('داخل فئة', 'Inside')} error={msg('parent')} hint={hasChildren ? tx('لها فئات فرعية: تبقى رئيسية', 'Has subcategories: stays top-level') : undefined}>{(p) => (
          <Select {...p} value={d.parent} disabled={hasChildren} onChange={(e) => set({ parent: e.target.value })}>
            <option value="">{tx('— فئة رئيسية —', '— Top level —')}</option>
            {parents.map((c) => <option key={c.id} value={c.id}>{c.name[lang]}</option>)}
          </Select>
        )}</Field>
        <Field label={tx('الرابط', 'URL handle')} error={msg('slug')} optional>{(p) => <Input {...p} dir="ltr" value={d.slug} placeholder={slugify(d.nameEn) || 'abayas'} onChange={(e) => set({ slug: e.target.value })} />}</Field>
        <Field label={tx('الوصف بالعربية', 'Description in Arabic')} optional>{(p) => <Textarea {...p} dir="rtl" className="min-h-16" value={d.descAr} onChange={(e) => set({ descAr: e.target.value })} />}</Field>
        <Field label={tx('الوصف بالإنجليزية', 'Description in English')} optional>{(p) => <Textarea {...p} dir="ltr" className="min-h-16" value={d.descEn} onChange={(e) => set({ descEn: e.target.value })} />}</Field>
        <Field label={tx('عنوان الصفحة (SEO)', 'Page title (SEO)')} optional hint={<bdi dir="ltr">{d.seoTitle.length}/70</bdi>}>{(p) => <Input {...p} maxLength={70} value={d.seoTitle} onChange={(e) => set({ seoTitle: e.target.value })} />}</Field>
        <Field label={tx('وصف الصفحة (SEO)', 'Page description (SEO)')} optional hint={<bdi dir="ltr">{d.seoDesc.length}/160</bdi>}>{(p) => <Input {...p} maxLength={160} value={d.seoDesc} onChange={(e) => set({ seoDesc: e.target.value })} />}</Field>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-medium text-fg">
        <span className="inline-flex items-center gap-1">{tx('تظهر في قائمة المتجر', 'Shown in the store menu')}<InfoHint>{tx('الإخفاء لا يخفي المنتجات؛ تبقى في البحث وكل المنتجات.', 'Hiding does not hide products; they stay in search and “All products”.')}</InfoHint></span>
        <Switch checked={d.visible} onChange={(v) => set({ visible: v })} label={tx('تظهر في قائمة المتجر', 'Shown in the store menu')} />
      </label>
      {renamed && affected > 0 && <Alert tone="info">{tx(`سيتغير اسم الفئة على ${affected} منتجات وفي المتجر.`, `The category name changes on ${affected} products and in the store.`)}</Alert>}
    </Modal>
  );
}

function DeleteModal({ cat, onClose }: { cat: Category; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const cats = categoriesStore.use();
  const products = productsStore.use();
  const block = deleteBlock(cat, cats, products);
  const inIt = productsIn(products, cat);
  const others = cats.filter((c) => c.id !== cat.id);
  const [to, setTo] = useState('');
  const target = others.find((c) => c.id === to);
  const go = () => {
    if (block === 'children') return;
    if (block === 'products') {
      if (!target) return;
      productsStore.set((ps) => moveToCategory(ps, new Set(inIt.map((p) => p.id)), target.name).products);
    }
    categoriesStore.set((cs) => cs.filter((c) => c.id !== cat.id));
    toast({ tone: 'ok', text: block === 'products' && target ? tx(`نُقل ${inIt.length} منتجًا إلى «${target.name.ar}» وحُذفت الفئة`, `${inIt.length} products moved to “${target.name.en}” and the category deleted`) : tx('حُذفت الفئة', 'Category deleted') });
    onClose();
  };
  return (
    <Modal title={tx(`حذف «${cat.name.ar}»`, `Delete “${cat.name.en}”`)} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={go} disabled={block === 'children' || (block === 'products' && !target)}>{block === 'products' ? tx('انقل واحذف', 'Move and delete') : tx('احذف', 'Delete')}</Button></>}>
      {block === 'children' && <Alert tone="bad">{tx('لها فئات فرعية. انقلها أو احذفها أولًا.', 'It has subcategories. Move or delete them first.')}</Alert>}
      {block === 'products' && (
        <>
          <Alert tone="warn">{tx(`فيها ${inIt.length} منتجات. اختر فئة تنتقل إليها؛ لا يُحذف أي منتج.`, `It has ${inIt.length} products. Choose where they move; no product is deleted.`)}</Alert>
          <Field label={tx('انقل المنتجات إلى', 'Move products to')}>{(p) => <Select {...p} value={to} onChange={(e) => setTo(e.target.value)}><option value="">{tx('اختر…', 'Choose…')}</option>{others.map((c) => <option key={c.id} value={c.id}>{c.parent ? '— ' : ''}{c.name[lang]}</option>)}</Select>}</Field>
        </>
      )}
      {!block && <p className="text-sm text-muted">{tx('الفئة فارغة. تختفي من المتجر فورًا.', 'The category is empty. It leaves the store at once.')}</p>}
      <LinkButton variant="ghost" size="sm" href={phref('', { cat: cat.name.en.toLowerCase() })}>{tx('اعرض منتجاتها', 'Show its products')}</LinkButton>
    </Modal>
  );
}
