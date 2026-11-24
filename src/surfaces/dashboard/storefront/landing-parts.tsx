// Pieces of the landing-page editor: labels, the block editor, a sketch of the page in the store's own look, the share
// card with UTM links, and the results card (visits, interest, orders and revenue from the order book).
import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Copy, HelpCircle, Image as ImageIcon, ListChecks, Mail, Share2, ShoppingBag, Sparkles, Tag, Timer, Trash2, Upload } from 'lucide-react';
import type { L } from '../../../core/lang';
import type { Coupon } from '../../merchant/growth';
import { productsStore } from '../../merchant/stores';
import { Badge, Button, Card, CardHeader, IconButton, InfoHint, Money, cn, useTx, type Tone } from '../../../ds/ui';
import { Field, Input, Select, Simulated, Textarea, useToast } from '../../../ds/kit';
import { productPhoto } from '../model/media';
import { sectionHref } from '../pages';
import { mediaSrc } from '../../storefront/theme';
import { STORE_PALETTE as P } from './model';
import { mediaStore } from './state';
import { readImage } from './media';
import {
  FAQ_MAX, LP_BODY_MAX, LP_HEADING_MAX, UTM_SOURCES, blockProducts, countdownEnd, linkedCoupon, remaining, shareUrl,
  type BlockIssue, type LandingPage, type LpBlock, type LpCtx, type LpKind, type LpResult, type LpState, type LpWarning,
} from './landing-model';

export const LP_TONE: Record<LpState, Tone> = { draft: 'amber', scheduled: 'sky', live: 'green', ended: 'gray', off: 'gray' };
export const K_ICON: Record<LpKind, ReactNode> = {
  hero: <Sparkles className="size-4" aria-hidden="true" />, products: <ShoppingBag className="size-4" aria-hidden="true" />, countdown: <Timer className="size-4" aria-hidden="true" />,
  coupon: <Tag className="size-4" aria-hidden="true" />, faq: <HelpCircle className="size-4" aria-hidden="true" />, interest: <Mail className="size-4" aria-hidden="true" />,
};

export function useLpLabels() {
  const tx = useTx();
  return {
    state: (s: LpState) => ({ draft: tx('مسودة لم تُنشر', 'Draft, not published'), scheduled: tx('مجدولة', 'Scheduled'), live: tx('منشورة الآن', 'Live now'), ended: tx('انتهت', 'Ended'), off: tx('أُوقف نشرها', 'Unpublished') })[s],
    kind: (k: LpKind) => ({ hero: tx('واجهة الحملة', 'Hero'), products: tx('منتجات مختارة', 'Product picks'), countdown: tx('عدّاد لنهاية العرض', 'Countdown to offer end'), coupon: tx('كشف الكوبون', 'Coupon reveal'), faq: tx('أسئلة شائعة', 'FAQ'), interest: tx('قائمة المهتمين', 'Interest list') })[k],
    issue: (i: BlockIssue) => ({ heading: tx('العنوان مطلوب بلغات المتجر', 'Heading required in the store languages'), long: tx('النص أطول من المسموح', 'Text is too long'), noProducts: tx('لا منتجات معروضة أونلاين في هذا القسم', 'No products sold online in this block'), noEnd: tx('حدّد نهاية للعدّاد أو اربط عرضًا له تاريخ انتهاء', 'Set an end, or link an offer that ends'), endPast: tx('نهاية العدّاد قبل بدء الصفحة أو مضت', 'The countdown ends before the page starts, or has passed'), noCoupon: tx('اربط الصفحة بكوبون بكود (العروض التلقائية بلا كود)', 'Link a coupon with a code (automatic offers have none)'), faq: tx('أكمل كل سؤال وجوابه', 'Complete every question and answer'), image: tx('اختر صورة', 'Choose a picture') })[i],
    warning: (w: LpWarning, c?: Coupon) => ({
      couponDraft: tx(`الكوبون ${c?.code ?? ''} مسودة: لن يقبله الدفع حتى تفعّله`, `Coupon ${c?.code ?? ''} is a draft: checkout will reject it until you activate it`),
      couponPaused: tx(`الكوبون ${c?.code ?? ''} موقوف`, `Coupon ${c?.code ?? ''} is paused`),
      couponExpired: tx(`الكوبون ${c?.code ?? ''} منتهٍ`, `Coupon ${c?.code ?? ''} has expired`),
      couponLimit: tx(`الكوبون ${c?.code ?? ''} بلغ حد الاستخدام`, `Coupon ${c?.code ?? ''} reached its use limit`),
      couponNotStarted: tx(`الكوبون ${c?.code ?? ''} يبدأ ${c?.starts ?? ''} بعد بدء الصفحة`, `Coupon ${c?.code ?? ''} starts ${c?.starts ?? ''}, after the page`),
      couponEndsFirst: tx(`الكوبون ينتهي ${c?.ends ?? ''} قبل نهاية الصفحة`, `The coupon ends ${c?.ends ?? ''}, before the page does`),
      noEnd: tx('بلا تاريخ نهاية: تبقى منشورة حتى توقفها', 'No end date: stays live until you unpublish it'),
      hiddenProducts: tx('بعض المنتجات المختارة غير معروضة أونلاين ولن تظهر', 'Some picked products are not sold online and will not show'),
    })[w],
    when: (s: string) => (s ? s.replace('T', ' · ') : '—'),
  };
}

const t = (x: L | undefined, lang: 'ar' | 'en') => (x?.[lang] || x?.[lang === 'ar' ? 'en' : 'ar'] || '').trim();

/** A sketch of the landing page as shoppers see it, in the store's own palette. */
export function LandingPreview({ p, ctx, lang, mobile, label }: { p: LandingPage; ctx: LpCtx; lang: 'ar' | 'en'; mobile: boolean; label: string }) {
  const tx = useTx();
  const lib = mediaStore.use();
  const products = productsStore.use();
  const coupon = linkedCoupon(p, ctx.coupons);
  const photo = (ref: string | undefined) => mediaSrc(ref, lib) ?? (ref?.startsWith('p:') ? productPhoto(ref.slice(2), 'large') : undefined);
  const btn = { background: P.accent, color: '#fff', borderRadius: 8 };
  return (
    <div className={cn('mx-auto overflow-hidden rounded-xl border shadow-card', mobile ? 'max-w-[260px]' : 'max-w-full')} style={{ background: P.bg, color: P.ink, borderColor: P.line }} role="img" aria-label={label} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-h-[560px] space-y-2 overflow-y-auto p-2 scrollbar-thin">
        {p.draft.blocks.length === 0 && <p className="px-3 py-10 text-center text-xs" style={{ color: P.muted }}>{tx('أضف قسمًا لتبدأ', 'Add a block to start')}</p>}
        {p.draft.blocks.map((b) => {
          const h = t(b.heading, lang);
          switch (b.kind) {
            case 'hero': {
              const src = photo(b.image);
              return <div key={b.id} className="relative overflow-hidden rounded-lg" style={{ background: P.tile }}>
                {src ? <img src={src} alt="" className="h-36 w-full object-cover" loading="lazy" /> : <span className="block h-36" />}
                <div className="absolute inset-x-0 bottom-0 p-3" style={{ background: 'linear-gradient(transparent, rgb(30 27 24 / .8))' }}>
                  <p className="text-sm font-bold text-white">{h || '—'}</p>
                  {t(b.body, lang) && <p className="mt-0.5 line-clamp-2 text-[10px] text-white/85">{t(b.body, lang)}</p>}
                  <span className="mt-1.5 inline-block px-2.5 py-1 text-[10px] font-semibold" style={btn}>{t(b.cta, lang) || tx('تسوّق', 'Shop')}</span>
                </div>
              </div>;
            }
            case 'products': {
              const ids = blockProducts(b, p, ctx).slice(0, 4);
              return <div key={b.id} className="rounded-lg p-2" style={{ background: P.paper }}><p className="mb-2 text-xs font-bold">{h}</p>
                {ids.length ? <div className="grid grid-cols-2 gap-2">{ids.map((id) => { const pr = products.find((x) => x.id === id); const src = productPhoto(id); return <div key={id} className="min-w-0">{src ? <img src={src} alt="" className="aspect-square w-full rounded-md object-cover" loading="lazy" /> : <span className="block aspect-square rounded-md" style={{ background: P.tile }} />}<p className="mt-1 truncate text-[10px]">{pr?.name[lang]}</p></div>; })}</div>
                  : <p className="py-3 text-center text-[10px]" style={{ color: P.muted }}>{tx('لا منتجات', 'No products')}</p>}</div>;
            }
            case 'countdown': {
              const end = countdownEnd(b, p, ctx.coupons);
              const r = remaining(Number.isNaN(end) ? 0 : end, ctx.now);
              return <div key={b.id} className="rounded-lg p-3 text-center" style={{ background: P.ink, color: '#f6efe4' }}><p className="text-[11px] font-bold">{h}</p>
                <p className="mt-1.5 flex justify-center gap-2 font-mono text-sm tabular-nums" dir="ltr">{Number.isNaN(end) ? '— — —' : [r.d, r.h, r.m].map((n, i) => <span key={i} className="rounded px-1.5 py-0.5" style={{ background: 'rgb(255 255 255 / .12)' }}>{String(n).padStart(2, '0')}</span>)}</p></div>;
            }
            case 'coupon': return <div key={b.id} className="rounded-lg border-2 border-dashed p-3 text-center" style={{ borderColor: P.accent }}><p className="text-[11px] font-bold">{h}</p>
              <span className="mt-1.5 inline-block px-3 py-1 text-[10px] font-semibold" style={btn}>{coupon && !coupon.auto ? tx('اكشف الكود', 'Reveal code') : tx('بلا كوبون', 'No coupon')}</span></div>;
            case 'faq': return <div key={b.id} className="rounded-lg p-2" style={{ background: P.paper }}><p className="mb-1.5 text-xs font-bold">{h}</p>
              {(b.faq ?? []).slice(0, 3).map((f, i) => <p key={i} className="truncate border-t py-1 text-[10px]" style={{ borderColor: P.line }}>{t(f.q, lang) || '—'}</p>)}</div>;
            case 'interest': return <div key={b.id} className="rounded-lg p-3 text-center" style={{ background: P.sand }}><p className="text-xs font-bold">{h}</p>
              <div className="mx-auto mt-2 flex max-w-48 gap-1"><span className="h-6 flex-1 rounded border" style={{ background: P.paper, borderColor: P.line }} /><span className="h-6 w-12" style={btn} /></div></div>;
          }
        })}
      </div>
    </div>
  );
}

/** One block's fields. */
export function BlockCard({ b, i, n, p, ctx, issue, onChange, onMove, onRemove, coupons, langs, products, readOnly }: {
  b: LpBlock; i: number; n: number; p: LandingPage; ctx: LpCtx; issue: BlockIssue | null; onChange: (x: LpBlock) => void; onMove: (d: -1 | 1) => void; onRemove: () => void;
  coupons: Coupon[]; langs: ('ar' | 'en')[]; products: { id: string; name: L; live: boolean }[]; readOnly?: boolean;
}) {
  const tx = useTx();
  const L = useLpLabels();
  const [open, setOpen] = useState(!!issue || b.kind === 'hero');
  const [upErr, setUpErr] = useState('');
  const lname = (l: 'ar' | 'en') => (l === 'ar' ? tx('العربية', 'Arabic') : tx('الإنجليزية', 'English'));
  const setL = (k: 'heading' | 'body' | 'cta', l: 'ar' | 'en', v: string) => onChange({ ...b, [k]: { ...(b[k] ?? { ar: '', en: '' }), [l]: v } });
  const coupon = linkedCoupon(p, coupons);
  const end = b.kind === 'countdown' ? countdownEnd(b, p, coupons) : Number.NaN;
  const picked = b.productIds ?? [];
  return (
    <li className={cn('rounded-xl border bg-surface', issue ? 'border-red-300 dark:border-red-500/50' : 'border-border')}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">{K_ICON[b.kind]}</span>
        <button type="button" className="min-w-0 flex-1 text-start" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="block truncate text-sm font-semibold text-fg">{L.kind(b.kind)}</span>
          <span className={cn('block truncate text-xs', issue ? 'text-red-600 dark:text-red-400' : 'text-muted')} dir="auto">{issue ? L.issue(issue) : (b.heading.ar || b.heading.en || '—')}</span>
        </button>
        {!readOnly && <>
          <IconButton label={tx('أعلى', 'Move up')} disabled={i === 0} onClick={() => onMove(-1)}><ArrowUp className="size-4" aria-hidden="true" /></IconButton>
          <IconButton label={tx('أسفل', 'Move down')} disabled={i === n - 1} onClick={() => onMove(1)}><ArrowDown className="size-4" aria-hidden="true" /></IconButton>
          <IconButton label={tx('احذف القسم', 'Remove block')} onClick={onRemove}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
        </>}
      </div>
      {open && (
        <fieldset disabled={readOnly} className="space-y-4 border-t border-border px-3 py-4">
          <legend className="sr-only">{L.kind(b.kind)}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {langs.map((l) => (
              <Field key={l} label={tx(`العنوان · ${lname(l)}`, `Heading · ${lname(l)}`)} hint={<bdi dir="ltr">{b.heading[l].length}/{LP_HEADING_MAX}</bdi>}>
                {(f) => <Input {...f} dir={l === 'ar' ? 'rtl' : 'ltr'} lang={l} value={b.heading[l]} maxLength={LP_HEADING_MAX + 10} onChange={(e) => setL('heading', l, e.target.value)} />}
              </Field>
            ))}
          </div>
          {(b.kind === 'hero' || b.kind === 'interest') && (
            <div className="grid gap-3 sm:grid-cols-2">
              {langs.map((l) => (
                <Field key={l} label={tx(`سطر قصير · ${lname(l)}`, `Short line · ${lname(l)}`)} optional hint={<bdi dir="ltr">{(b.body?.[l] ?? '').length}/{LP_BODY_MAX}</bdi>}>
                  {(f) => <Textarea {...f} rows={2} dir={l === 'ar' ? 'rtl' : 'ltr'} lang={l} value={b.body?.[l] ?? ''} onChange={(e) => setL('body', l, e.target.value)} />}
                </Field>
              ))}
            </div>
          )}
          {b.kind === 'hero' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {langs.map((l) => (
                <Field key={l} label={tx(`نص الزر · ${lname(l)}`, `Button text · ${lname(l)}`)}>
                  {(f) => <Input {...f} dir={l === 'ar' ? 'rtl' : 'ltr'} lang={l} value={b.cta?.[l] ?? ''} maxLength={24} onChange={(e) => setL('cta', l, e.target.value)} />}
                </Field>
              ))}
              <Field label={tx('الصورة', 'Picture')} error={upErr || null}>
                {(f) => (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select {...f} value={b.image?.startsWith('p:') ? b.image : b.image ? 'upload' : ''} onChange={(e) => e.target.value !== 'upload' && onChange({ ...b, image: e.target.value || undefined })} className="min-w-0 flex-1">
                      <option value="">{tx('بلا صورة', 'No picture')}</option>
                      {b.image && !b.image.startsWith('p:') && <option value="upload">{tx('صورة مرفوعة', 'Uploaded picture')}</option>}
                      {products.filter((x) => productPhoto(x.id)).map((x) => <option key={x.id} value={`p:${x.id}`}>{x.name.ar} · {x.name.en}</option>)}
                    </Select>
                    <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2">
                      <Upload className="size-4" aria-hidden="true" />{tx('ارفع', 'Upload')}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={async (e) => {
                        const file = e.target.files?.[0]; e.target.value = '';
                        if (!file) return;
                        const r = await readImage(file, 'image');
                        if (r.ok) { setUpErr(''); onChange({ ...b, image: r.ref }); } else setUpErr(r.error === 'size' ? tx('الحد 5 ميغابايت', 'Max 5 MB') : r.error === 'type' ? tx('PNG أو JPG أو WebP', 'PNG, JPG or WebP') : r.error === 'small' ? tx('الصورة صغيرة جدًا', 'Picture too small') : tx('تعذّرت قراءة الصورة', 'Could not read the picture'));
                      }} />
                    </label>
                  </div>
                )}
              </Field>
            </div>
          )}
          {b.kind === 'products' && (
            <div className="space-y-3">
              {p.link.kind === 'collection' && (
                <Field label={tx('المصدر', 'Source')}>
                  {(f) => <Select {...f} value={b.pick ?? 'manual'} onChange={(e) => onChange({ ...b, pick: e.target.value as 'linked' | 'manual' })}>
                    <option value="linked">{tx('المجموعة المرتبطة بالصفحة', 'The page’s linked collection')}</option>
                    <option value="manual">{tx('اختيار يدوي', 'Pick by hand')}</option>
                  </Select>}
                </Field>
              )}
              {(b.pick ?? 'manual') === 'manual' ? (
                <>
                  <Field label={tx('أضف منتجًا', 'Add a product')} hint={tx(`${picked.length} مختار · الحد 8`, `${picked.length} picked · max 8`)}>
                    {(f) => <Select {...f} value="" disabled={picked.length >= 8} onChange={(e) => e.target.value && onChange({ ...b, productIds: [...picked, e.target.value] })}>
                      <option value="">{tx('اختر…', 'Choose…')}</option>
                      {products.filter((x) => x.live && !picked.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name.ar} · {x.name.en}</option>)}
                    </Select>}
                  </Field>
                  {picked.length > 0 && <ul className="flex flex-wrap gap-2">{picked.map((id) => { const x = products.find((y) => y.id === id); return (
                    <li key={id} className={cn('inline-flex items-center gap-1.5 rounded-full border py-1 ps-3 pe-1 text-xs', x?.live ? 'border-border text-fg' : 'border-amber-300 text-amber-800 dark:text-amber-300')}>
                      <span className="max-w-40 truncate">{x ? x.name.ar : id}</span>{!x?.live && <span>· {tx('غير معروض', 'not on sale')}</span>}
                      <button type="button" className="grid size-6 place-items-center rounded-full hover:bg-surface-2" aria-label={tx('أزل', 'Remove')} onClick={() => onChange({ ...b, productIds: picked.filter((y) => y !== id) })}>×</button>
                    </li>); })}</ul>}
                </>
              ) : <p className="text-xs text-muted">{tx(`${blockProducts(b, p, ctx).length} منتج معروض من المجموعة`, `${blockProducts(b, p, ctx).length} products on sale from the collection`)}</p>}
            </div>
          )}
          {b.kind === 'countdown' && (
            <Field label={<>{tx('ينتهي في', 'Ends at')}<InfoHint>{tx('اتركه فارغًا ليتبع نهاية العرض المرتبط.', 'Leave empty to follow the linked offer’s end.')}</InfoHint></>} optional
              hint={!b.until && !Number.isNaN(end) ? tx(`يتبع نهاية ${coupon?.code ?? 'الصفحة'}: ${new Date(end).toLocaleString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' })}`, `Follows ${coupon?.code ?? 'the page'}’s end: ${new Date(end).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' })}`) : undefined}>
              {(f) => <Input {...f} type="datetime-local" dir="ltr" value={b.until ?? ''} onChange={(e) => onChange({ ...b, until: e.target.value })} />}
            </Field>
          )}
          {b.kind === 'coupon' && (
            <p className="flex items-center gap-2 text-sm text-fg"><Tag className="size-4 text-muted" aria-hidden="true" />
              {coupon && !coupon.auto ? <>{tx('يكشف الكود', 'Reveals code')} <bdi dir="ltr" className="rounded-md border border-dashed border-border px-1.5 font-mono text-xs">{coupon.code}</bdi>{tx('، ويضيفه للسلة بضغطة', ', and adds it to the bag in one tap')}</> : tx('اربط الصفحة بكوبون من «مرتبطة بـ».', 'Link the page to a coupon under “Linked to”.')}</p>
          )}
          {b.kind === 'faq' && (
            <div className="space-y-3">
              {(b.faq ?? []).map((q, k) => (
                <div key={k} className="space-y-2 rounded-lg bg-surface-2/60 p-3">
                  <div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted">{tx(`سؤال ${k + 1}`, `Question ${k + 1}`)}</span>
                    <Button variant="ghost" size="sm" onClick={() => onChange({ ...b, faq: (b.faq ?? []).filter((_, j) => j !== k) })}>{tx('احذف', 'Remove')}</Button></div>
                  {langs.map((l) => (
                    <div key={l} className="grid gap-2 sm:grid-cols-2">
                      <Input aria-label={tx(`السؤال · ${lname(l)}`, `Question · ${lname(l)}`)} placeholder={tx(`السؤال · ${lname(l)}`, `Question · ${lname(l)}`)} dir={l === 'ar' ? 'rtl' : 'ltr'} value={q.q[l]} onChange={(e) => onChange({ ...b, faq: (b.faq ?? []).map((x, j) => (j === k ? { ...x, q: { ...x.q, [l]: e.target.value } } : x)) })} />
                      <Input aria-label={tx(`الجواب · ${lname(l)}`, `Answer · ${lname(l)}`)} placeholder={tx(`الجواب · ${lname(l)}`, `Answer · ${lname(l)}`)} dir={l === 'ar' ? 'rtl' : 'ltr'} value={q.a[l]} onChange={(e) => onChange({ ...b, faq: (b.faq ?? []).map((x, j) => (j === k ? { ...x, a: { ...x.a, [l]: e.target.value } } : x)) })} />
                    </div>
                  ))}
                </div>
              ))}
              <Button variant="secondary" size="sm" disabled={(b.faq ?? []).length >= FAQ_MAX} onClick={() => onChange({ ...b, faq: [...(b.faq ?? []), { q: { ar: '', en: '' }, a: { ar: '', en: '' } }] })}><ListChecks className="size-4" aria-hidden="true" />{tx('أضف سؤالًا', 'Add a question')}</Button>
            </div>
          )}
          {b.kind === 'interest' && <p className="flex items-center gap-2 text-xs text-muted">{tx('يجمع البريد أو الجوال مع الموافقة على التواصل؛ لا يُرسل شيء في هذه النسخة.', 'Collects email or mobile with consent to contact; nothing is sent in this preview.')}<Simulated /></p>}
        </fieldset>
      )}
    </li>
  );
}

/** How the page looks when shared (WhatsApp, X, Snapchat) and the tracked links per channel. */
export function ShareCard({ p, base, title, desc, image }: { p: LandingPage; base: string; title: string; desc: string; image?: string }) {
  const tx = useTx();
  const toast = useToast();
  const lib = mediaStore.use();
  const src = mediaSrc(image, lib) ?? (image?.startsWith('p:') ? productPhoto(image.slice(2), 'large') : undefined);
  const copy = async (u: string) => {
    try { await navigator.clipboard.writeText(u); toast({ tone: 'ok', text: tx('نُسخ الرابط', 'Link copied') }); } catch { toast({ tone: 'bad', text: tx('تعذّر النسخ؛ حدّد الرابط وانسخه يدويًا', 'Could not copy; select the link and copy it') }); }
  };
  const SRC: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', snapchat: 'Snapchat', x: 'X', tiktok: 'TikTok', sms: 'SMS', email: tx('البريد', 'Email') };
  return (
    <Card aria-labelledby="lp-share">
      <CardHeader id="lp-share" title={tx('المشاركة والتتبّع', 'Sharing and tracking')} hint={tx('كل رابط يحمل utm_campaign ومصدره، فتُنسب الطلبات القادمة منه إلى هذه الصفحة.', 'Each link carries utm_campaign and its source, so orders that come from it are credited to this page.')} />
      <div className="space-y-4 px-5 pb-5">
        <figure className="overflow-hidden rounded-xl border border-border bg-surface-2/50">
          <figcaption className="sr-only">{tx('معاينة المشاركة', 'Share preview')}</figcaption>
          {src ? <img src={src} alt="" className="h-44 w-full object-cover" loading="lazy" /> : <div className="grid h-32 place-items-center text-xs text-muted"><ImageIcon className="size-5" aria-hidden="true" />{tx('بلا صورة مشاركة: تُستخدم صورة الواجهة', 'No share image: the hero picture is used')}</div>}
          <div className="space-y-0.5 p-3"><p className="truncate text-[11px] uppercase text-muted"><bdi dir="ltr">{base.replace('https://', '')}</bdi></p><p className="line-clamp-1 text-sm font-semibold text-fg" dir="auto">{title || '—'}</p><p className="line-clamp-2 text-xs text-muted" dir="auto">{desc || '—'}</p></div>
        </figure>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {UTM_SOURCES.map((s) => { const u = shareUrl(base, p, s); return (
            <li key={s} className="flex items-center gap-2 px-3 py-2">
              <Share2 className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
              <span className="w-20 shrink-0 text-[13px] font-medium text-fg">{SRC[s]}</span>
              <bdi dir="ltr" className="min-w-0 flex-1 truncate text-xs text-muted">{u.replace('https://', '')}</bdi>
              <IconButton label={tx(`انسخ رابط ${SRC[s]}`, `Copy ${SRC[s]} link`)} onClick={() => copy(u)}><Copy className="size-4" aria-hidden="true" /></IconButton>
            </li>); })}
        </ul>
      </div>
    </Card>
  );
}

/** Visits (simulated), interest sign-ups and orders/revenue attributed from the order book. */
export function ResultsCard({ r, code, state }: { r: LpResult; code?: string; state: LpState }) {
  const tx = useTx();
  const stat = (label: string, value: ReactNode, hint?: ReactNode) => (
    <div className="min-w-0 rounded-xl bg-surface-2/60 p-3"><p className="flex items-center gap-1 text-xs text-muted">{label}{hint}</p><p className="mt-1 text-lg font-bold text-fg tabular-nums">{value}</p></div>
  );
  return (
    <Card aria-labelledby="lp-res">
      <CardHeader id="lp-res" title={tx('النتائج', 'Results')} hint={tx(`الطلب يُنسب للصفحة إذا استُخدم كودها${code ? ` (${code})` : ''} أو جاء العميل منها خلال 7 أيام. يُحسب مرة واحدة؛ الملغى والفاشل لا يُحسبان.`, `An order is credited when it used the page’s code${code ? ` (${code})` : ''} or the shopper came from the page within 7 days. Counted once; cancelled and failed orders are excluded.`)} />
      <div className="grid grid-cols-2 gap-2 px-5 pb-3">
        {stat(tx('الزيارات', 'Visits'), r.visits.toLocaleString('en-US'), <Badge tone="gray" className="ms-1">{tx('محاكاة', 'Simulated')}</Badge>)}
        {stat(tx('المهتمون', 'Interest sign-ups'), r.interest)}
        {stat(tx('الطلبات', 'Orders'), r.orders)}
        {stat(tx('الإيراد', 'Revenue'), <Money v={r.revenue} />)}
      </div>
      <div className="space-y-2 border-t border-border px-5 py-3 text-xs text-muted">
        <p>{r.conversion === null ? tx('لا زيارات بعد', 'No visits yet') : tx(`التحويل ${r.conversion}٪ · ${r.byCoupon} بالكود · ${r.byVisit} من الزيارة`, `Conversion ${r.conversion}% · ${r.byCoupon} by code · ${r.byVisit} from a visit`)}</p>
        {r.refs.length > 0 ? <p className="flex flex-wrap gap-1.5">{r.refs.slice(0, 8).map((ref) => <a key={ref} href={sectionHref('orders', ref)} className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg hover:underline">#{ref}</a>)}</p>
          : <p>{state === 'live' ? tx('لا طلبات منسوبة بعد. افتح الصفحة في المتجر واطلب منها لترى النسبة هنا.', 'No credited orders yet. Open the page in the store and order from it to see attribution here.') : tx('تظهر الطلبات بعد النشر.', 'Orders appear once it is live.')}</p>}
      </div>
    </Card>
  );
}
