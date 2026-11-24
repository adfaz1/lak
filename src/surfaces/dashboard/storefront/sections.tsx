// Homepage sections in the draft: reorder, show/hide, heading, per-section settings (picture, product source, text,
// link), remove with undo, and add from the section library. The announcement bar has its own editor.
import { useRef, useState, type ReactNode } from 'react';
import {
  AlignLeft, ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, Grid3x3, Image as ImageIcon, ImagePlus, LayoutGrid, Mail, Megaphone, MessageSquareQuote,
  Play, Plus, RectangleHorizontal, Sparkles, Tag, Trash2,
} from 'lucide-react';
import type { Section, SectionKind } from '../../merchant/workspace';
import { collectionsStore, levelsStore, logAction, productsStore, reviewsStore, themeStore } from '../../merchant/stores';
import { categoriesOf, toStoreProducts } from '../../storefront/bridge';
import { mediaSrc } from '../../storefront/theme';
import { Badge, Button, Card, CardHeader, IconButton, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, Field, Input, Modal, Select, Switch, Textarea, useToast } from '../../../ds/kit';
import { productPhoto } from '../model/media';
import { sectionHref } from '../pages';
import { BODY_MAX, HEADING_MAX, changeOf, discardDraft, move, pendingChanges, sectionIssue, updateSection, type SectionIssue } from './model';
import { LIBRARY, addSection, libraryBlock, realReviews, removeSection } from './identity';
import { readImage } from './media';
import { useMediaError } from './identity-panel';
import { mediaStore } from './state';

export const K_ICON: Record<SectionKind, ReactNode> = {
  announcement: <Megaphone className="size-4" />, hero: <ImageIcon className="size-4" />, featured: <Sparkles className="size-4" />, categories: <LayoutGrid className="size-4" />,
  offers: <Tag className="size-4" />, video: <Play className="size-4" />, newsletter: <Mail className="size-4" />, grid: <Grid3x3 className="size-4" />,
  banner: <RectangleHorizontal className="size-4" />, testimonials: <MessageSquareQuote className="size-4" />, richtext: <AlignLeft className="size-4" />,
};
export const C_TONE: Record<string, Tone> = { moved: 'sky', shown: 'green', hidden: 'gray', edited: 'brand', added: 'green', removed: 'red' };

export function useKindLabels() {
  const tx = useTx();
  const kind = (k: SectionKind) => ({
    announcement: tx('شريط إعلان', 'Announcement bar'), hero: tx('بانر رئيسي', 'Hero banner'), featured: tx('منتجات مميزة', 'Featured products'), categories: tx('التصنيفات', 'Categories'),
    offers: tx('العروض', 'Offers'), video: tx('فيديو', 'Video'), newsletter: tx('النشرة البريدية', 'Newsletter'), grid: tx('شبكة منتجات', 'Product grid'),
    banner: tx('بانر بصورة', 'Image banner'), testimonials: tx('آراء العملاء', 'Testimonials'), richtext: tx('نص', 'Rich text'),
  })[k];
  const desc = (k: SectionKind) => ({
    announcement: '', hero: tx('صورة كبيرة وعنوان وزر', 'Large picture, heading and button'), featured: tx('المنتجات المخفّضة ثم الأعلى ترتيبًا', 'Sale items, then your top-ranked'),
    categories: tx('بطاقة لكل فئة', 'A tile per category'), offers: tx('الكوبون الحالي ومنتجات التخفيض', 'Current coupon and sale items'),
    video: tx('لا رفع فيديو بعد: يظهر نصًا', 'No video upload yet: shows as text'), newsletter: tx('اشتراك بالبريد بموافقة', 'Email sign-up with consent'),
    grid: tx('منتجات فئة أو مجموعة', 'Products from a category or collection'), banner: tx('صورة ونص ورابط', 'Picture, text and link'),
    testimonials: tx('تقييمات منشورة حقيقية فقط', 'Real published reviews only'), richtext: tx('فقرة عن متجرك', 'A paragraph about your store'),
  })[k];
  const change = (k: string) => ({ moved: tx('نُقل', 'Moved'), shown: tx('أُظهر', 'Shown'), hidden: tx('أُخفي', 'Hidden'), edited: tx('عُدّل', 'Edited'), added: tx('أُضيف', 'Added'), removed: tx('أُزيل', 'Removed') } as Record<string, string>)[k];
  const issue = (i: SectionIssue) => ({
    empty: tx('اكتب عنوانًا', 'Enter a heading'), long: tx(`الحد ${HEADING_MAX} حرفًا`, `Max ${HEADING_MAX} characters`), source: tx('اختر فئة أو مجموعة', 'Choose a category or collection'),
    image: tx('اختر صورة', 'Choose a picture'), body: tx(`اكتب النص (حتى ${BODY_MAX} حرف)`, `Write the text (up to ${BODY_MAX} characters)`), link: tx('رابط غير صالح', 'Invalid link'),
    colours: tx('الألوان غير واضحة للقراءة', 'Colours are not readable'), schedule: tx('النهاية قبل البداية', 'End is before start'),
  })[i];
  return { kind, desc, change, issue };
}

const SETTINGS: SectionKind[] = ['hero', 'grid', 'banner', 'richtext', 'testimonials', 'video'];

export default function SectionsPanel({ empty }: { empty: boolean }) {
  const tx = useTx();
  const toast = useToast();
  const theme = themeStore.use();
  const { kind, change, issue } = useKindLabels();
  const [open, setOpen] = useState<string | null>(null);
  const [lib, setLib] = useState(false);
  const draft = empty ? [] : theme.draft;
  const list = draft.filter((s) => s.kind !== 'announcement');
  const changes = pendingChanges(theme);
  const removed = changes.filter((c) => c.kind === 'removed').map((c) => theme.published.sections.find((s) => s.id === c.id)!).filter(Boolean);

  const remove = (s: Section) => {
    const at = theme.draft.findIndex((x) => x.id === s.id);
    themeStore.set((t) => removeSection(t, s.id));
    logAction('store', { ar: `أزال قسم «${s.heading}» من مسودة الصفحة الرئيسية`, en: `Removed the “${s.heading}” section from the homepage draft` }, { target: s.id });
    toast({ tone: 'ok', text: tx('أُزيل القسم من المسودة', 'Section removed from the draft'), action: { label: tx('تراجع', 'Undo'), run: () => themeStore.set((t) => (t.draft.some((x) => x.id === s.id) ? t : { ...t, draft: [...t.draft.slice(0, at), s, ...t.draft.slice(at)] })) } });
  };
  const restore = (s: Section) => themeStore.set((t) => {
    const i = t.published.sections.findIndex((x) => x.id === s.id);
    const after = t.published.sections.slice(0, i).reverse().find((x) => t.draft.some((d) => d.id === x.id));
    const j = after ? t.draft.findIndex((d) => d.id === after.id) + 1 : 0;
    return { ...t, draft: [...t.draft.slice(0, j), { ...s }, ...t.draft.slice(j)] };
  });

  return (
    <Card aria-labelledby="h-sections">
      <CardHeader id="h-sections" title={tx('أقسام الصفحة الرئيسية', 'Homepage sections')} hint={tx('التعديلات تُحفظ في المسودة تلقائيًا ولا يراها العملاء حتى تنشر.', 'Edits save to the draft automatically and stay invisible to shoppers until you publish.')}
        action={<div className="flex items-center gap-1">
          {changes.length > 0 && <Button variant="ghost" size="sm" onClick={() => themeStore.set(discardDraft)}>{tx('تجاهل المسودة', 'Discard draft')}</Button>}
          <Button variant="secondary" size="sm" onClick={() => setLib(true)}><Plus className="size-4" aria-hidden="true" />{tx('أضف قسمًا', 'Add section')}</Button>
        </div>} />
      {list.length === 0 ? (
        <div className="border-t border-border px-5 py-8 text-center">
          <p className="text-sm text-muted">{tx('لا أقسام في الصفحة الرئيسية.', 'No homepage sections.')}</p>
          {!empty && <Button className="mt-3" variant="secondary" size="sm" onClick={() => setLib(true)}><Plus className="size-4" aria-hidden="true" />{tx('أضف قسمًا', 'Add section')}</Button>}
        </div>
      ) : (
        <ol className="divide-y divide-border border-t border-border">
          {list.map((s, i) => {
            const ch = changeOf(theme, s.id);
            const err = sectionIssue(s);
            const headErr = err === 'empty' || err === 'long' ? issue(err) : null;
            const other = err && !headErr ? issue(err) : null;
            const expandable = SETTINGS.includes(s.kind);
            const isOpen = open === s.id;
            const idx = theme.draft.findIndex((x) => x.id === s.id);
            return (
              <li key={s.id} className={cn(!s.visible && 'bg-surface-2/40')} data-section={s.kind}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5">
                  <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', s.visible ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300' : 'bg-surface-2 text-subtle')} aria-hidden="true">{K_ICON[s.kind]}</span>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted"><span className="tabular-nums">{i + 1}.</span>{kind(s.kind)}{ch && <Badge tone={C_TONE[ch]} className="h-5 px-2 text-[11px]">{change(ch)}</Badge>}{other && <Badge tone="amber" className="h-5 px-2 text-[11px]">{other}</Badge>}</p>
                    <Field label={<span className="sr-only">{tx(`عنوان ${kind(s.kind)}`, `${kind(s.kind)} heading`)}</span>} className="mt-1 space-y-1" error={headErr}>
                      {(p) => <Input {...p} className="h-9" dir="auto" value={s.heading} onChange={(e) => themeStore.set((t) => updateSection(t, s.id, { heading: e.target.value }))} />}
                    </Field>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <span className="me-1.5 inline-flex items-center gap-2 text-xs text-muted">{s.visible ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}<Switch checked={s.visible} label={tx(`إظهار ${kind(s.kind)}`, `Show ${kind(s.kind)}`)} onChange={(v) => themeStore.set((t) => updateSection(t, s.id, { visible: v }))} /></span>
                    <IconButton label={tx(`انقل ${kind(s.kind)} للأعلى`, `Move ${kind(s.kind)} up`)} disabled={i === 0} className="disabled:opacity-30" onClick={() => themeStore.set((t) => move(t, s.id, -1))}><ArrowUp className="size-4" aria-hidden="true" /></IconButton>
                    <IconButton label={tx(`انقل ${kind(s.kind)} للأسفل`, `Move ${kind(s.kind)} down`)} disabled={i === list.length - 1} className="disabled:opacity-30" onClick={() => themeStore.set((t) => move(t, s.id, 1))}><ArrowDown className="size-4" aria-hidden="true" /></IconButton>
                    {expandable && <IconButton label={tx(`إعدادات ${kind(s.kind)}`, `${kind(s.kind)} settings`)} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)}><ChevronDown className={cn('size-4 transition-transform', isOpen && 'rotate-180')} aria-hidden="true" /></IconButton>}
                    <IconButton label={tx(`أزل ${kind(s.kind)}`, `Remove ${kind(s.kind)}`)} onClick={() => remove(s)}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
                  </div>
                </div>
                {expandable && isOpen && <div className="border-t border-dashed border-border bg-surface-2/30 px-4 py-4 sm:px-5"><SectionSettings s={s} at={idx} /></div>}
              </li>
            );
          })}
        </ol>
      )}
      {removed.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <p className="mb-2 text-xs font-semibold text-muted">{tx('أُزيلت من المسودة (منشورة حاليًا)', 'Removed from the draft (still live)')}</p>
          <ul className="flex flex-wrap gap-2">{removed.map((s) => <li key={s.id}><Button variant="secondary" size="sm" onClick={() => restore(s)}>{K_ICON[s.kind]}<span className="max-w-40 truncate">{s.heading}</span>· {tx('استعد', 'Restore')}</Button></li>)}</ul>
        </div>
      )}
      {lib && <LibraryModal onClose={() => setLib(false)} onAdded={(id) => { setLib(false); setOpen(id); }} />}
    </Card>
  );
}

function SectionSettings({ s }: { s: Section; at: number }) {
  const tx = useTx();
  const set = (p: Partial<Section>) => themeStore.set((t) => updateSection(t, s.id, p));
  const products = productsStore.use();
  const levels = levelsStore.use();
  const cols = collectionsStore.use();
  const reviews = reviewsStore.use();
  const cats = categoriesOf(toStoreProducts(products, levels));
  const { issue } = useKindLabels();
  const err = sectionIssue(s);
  const lang = tx('ar', 'en') as 'ar' | 'en';
  if (s.kind === 'grid') return (
    <Field label={tx('مصدر المنتجات', 'Product source')} error={err === 'source' ? issue('source') : null}>
      {(p) => <Select {...p} value={s.source ?? ''} onChange={(e) => set({ source: e.target.value || undefined })}>
        <option value="">{tx('اختر…', 'Choose…')}</option>
        <optgroup label={tx('الفئات', 'Categories')}>{cats.map((c) => <option key={c.id} value={`cat:${c.id}`}>{c.name[lang]} ({c.count})</option>)}</optgroup>
        <optgroup label={tx('المجموعات', 'Collections')}>{cols.map((c) => <option key={c.id} value={`col:${c.id}`} disabled={!c.visible}>{c.name[lang]}{c.visible ? '' : tx(' (مخفية)', ' (hidden)')}</option>)}</optgroup>
      </Select>}
    </Field>
  );
  if (s.kind === 'testimonials') {
    const n = realReviews(reviews);
    return n ? <p className="text-sm text-fg">{tx(`يعرض أحدث التقييمات المنشورة (4 نجوم فأكثر): ${n} متاحة.`, `Shows the newest published reviews (4★+): ${n} available.`)} <a className="font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300" href={sectionHref('marketing', 'reviews')}>{tx('التقييمات', 'Reviews')}</a></p>
      : <Alert tone="warn">{tx('لا تقييمات منشورة الآن، فلن يظهر القسم للعملاء.', 'No published reviews now, so shoppers will not see this section.')}</Alert>;
  }
  if (s.kind === 'video') return <Alert tone="info">{tx('رفع الفيديو غير متاح بعد. يرى العملاء العنوان ونصًا عن متجرك بدل مشغّل.', 'Video upload is not available yet. Shoppers see the heading and a text about your store instead of a player.')}</Alert>;
  return (
    <div className="space-y-4">
      {(s.kind === 'hero' || s.kind === 'banner') && <ImagePicker value={s.image} onChange={(image) => set({ image })} error={err === 'image' ? issue('image') : null} />}
      <Field label={s.kind === 'richtext' ? tx('النص', 'Text') : tx('سطر تحت العنوان', 'Line under the heading')} optional={s.kind !== 'richtext'} hint={<bdi dir="ltr">{(s.body ?? '').length} / {BODY_MAX}</bdi>} error={err === 'body' ? issue('body') : null}>
        {(p) => <Textarea {...p} dir="auto" value={s.body ?? ''} rows={s.kind === 'richtext' ? 5 : 2} onChange={(e) => set({ body: e.target.value || undefined })} />}
      </Field>
      {s.kind !== 'richtext' && (
        <Field label={tx('الرابط', 'Link')} optional hint={tx('مثل /c/abayas أو https://', 'e.g. /c/abayas or https://')} error={err === 'link' ? issue('link') : null}>
          {(p) => <Input {...p} dir="ltr" value={s.link ?? ''} placeholder="/c/…" onChange={(e) => set({ link: e.target.value.trim() || undefined })} />}
        </Field>
      )}
    </div>
  );
}

function ImagePicker({ value, onChange, error }: { value?: string; onChange: (v: string) => void; error: string | null }) {
  const tx = useTx();
  const msg = useMediaError();
  const lib = mediaStore.use();
  const products = productsStore.use();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [upErr, setUpErr] = useState<string | null>(null);
  const lang = tx('ar', 'en') as 'ar' | 'en';
  const photos = products.filter((p) => productPhoto(p.id)).slice(0, 8).map((p) => ({ ref: `p:${p.id}`, src: productPhoto(p.id)!, name: p.name[lang] }));
  const uploads = Object.entries(lib).filter(([, m]) => m.kind === 'image').map(([id, m]) => ({ ref: `m:${id}`, src: m.url, name: m.name }));
  const opts = [...uploads, ...photos];
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-fg">{tx('الصورة', 'Picture')}</legend>
      <div role="radiogroup" aria-label={tx('الصورة', 'Picture')} className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="grid aspect-square place-items-center rounded-lg border border-dashed border-border text-muted hover:bg-surface-2" aria-label={tx('ارفع صورة', 'Upload a picture')}>
          <span className="flex flex-col items-center gap-1 text-[11px]"><ImagePlus className="size-5" aria-hidden="true" />{busy ? '…' : tx('ارفع', 'Upload')}</span>
        </button>
        {opts.map((o) => (
          <button key={o.ref} type="button" role="radio" aria-checked={value === o.ref} aria-label={o.name} title={o.name} onClick={() => onChange(o.ref)}
            className={cn('relative overflow-hidden rounded-lg ring-offset-2 ring-offset-surface', value === o.ref ? 'ring-2 ring-brand-500' : 'hover:opacity-90')}>
            <img src={o.src} alt="" className="aspect-square w-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" data-upload="image"
        onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setBusy(true); setUpErr(null); const r = await readImage(f, 'image'); setBusy(false); e.target.value = ''; if (!r.ok) setUpErr(msg(r.error)); else onChange(r.ref); }} />
      {(upErr || error) && <p className="mt-1.5 text-xs font-medium text-red-700 dark:text-red-300" role="alert">{upErr ?? error}</p>}
      {value?.startsWith('m:') && !mediaSrc(value, lib) && <p className="mt-1.5 text-xs text-amber-800 dark:text-amber-300">{tx('الصورة المرفوعة لم تعد في هذه الجلسة؛ اختر غيرها.', 'The uploaded picture is no longer in this session; choose another.')}</p>}
    </fieldset>
  );
}

function LibraryModal({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const tx = useTx();
  const theme = themeStore.use();
  const reviews = reviewsStore.use();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const { kind, desc } = useKindLabels();
  const n = realReviews(reviews);
  const firstCat = categoriesOf(toStoreProducts(products, levels))[0];
  const [pick, setPick] = useState<SectionKind | null>(null);
  const defaults = (k: SectionKind): Omit<Section, 'id' | 'visible'> => {
    const base = { kind: k, heading: kind(k) };
    if (k === 'grid') return { ...base, heading: firstCat ? firstCat.name[tx('ar', 'en') as 'ar' | 'en'] : kind(k), source: firstCat ? `cat:${firstCat.id}` : undefined };
    if (k === 'banner') return { ...base, heading: tx('جديد الموسم', 'New this season'), image: 'p:p2', link: firstCat ? `/c/${firstCat.id}` : undefined };
    if (k === 'hero') return { ...base, heading: tx('تشكيلتنا الجديدة', 'Our new collection'), image: 'p:p1' };
    if (k === 'testimonials') return { ...base, heading: tx('ماذا يقول عملاؤنا', 'What our customers say') };
    if (k === 'richtext') return { ...base, heading: tx('عن متجرنا', 'About our store'), body: tx('اكتب هنا قصة متجرك وما يميّز منتجاتك.', 'Tell your store’s story and what makes your products special.') };
    return base;
  };
  const add = () => {
    if (!pick) return;
    const t = addSection(themeStore.get(), defaults(pick));
    const added = t.draft.find((s) => !themeStore.get().draft.some((x) => x.id === s.id))!;
    themeStore.set(t);
    logAction('store', { ar: `أضاف قسم «${kind(pick)}» لمسودة الصفحة الرئيسية`, en: `Added a “${kind(pick)}” section to the homepage draft` }, { target: added.id });
    onAdded(added.id);
  };
  return (
    <Modal size="lg" title={tx('أضف قسمًا للصفحة الرئيسية', 'Add a homepage section')} description={tx('يُضاف للمسودة قبل النشرة البريدية، ويمكنك نقله.', 'Added to the draft before the newsletter; you can move it.')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={!pick} onClick={add}><Plus className="size-4" aria-hidden="true" />{tx('أضف للمسودة', 'Add to draft')}</Button></>}>
      <div role="radiogroup" aria-label={tx('مكتبة الأقسام', 'Section library')} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {LIBRARY.map(({ kind: k }) => {
          const block = libraryBlock(k, theme.draft, n);
          return (
            <button key={k} type="button" role="radio" aria-checked={pick === k} disabled={!!block} onClick={() => setPick(k)}
              className={cn('flex min-w-0 items-start gap-3 rounded-xl border p-3 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-60', pick === k ? 'border-brand-500 bg-brand-500/5 ring-2 ring-brand-500/20' : 'border-border hover:bg-surface-2/60')}>
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300" aria-hidden="true">{K_ICON[k]}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-fg">{kind(k)}</span>
                <span className="block text-xs text-muted">{block === 'already' ? tx('موجود في الصفحة', 'Already on the page') : block === 'noReviews' ? tx('يحتاج تقييمًا منشورًا واحدًا على الأقل', 'Needs at least one published review') : desc(k)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
