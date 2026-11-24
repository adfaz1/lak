// Store identity editor: logo, favicon, brand colour (with generated scale and contrast checks), typeface, button
// shape and header layout. Every change goes to the theme draft; shoppers see it only after publishing.
import { useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, ImagePlus, Trash2, Wand2 } from 'lucide-react';
import type { ButtonStyle, HeaderLayout, StoreFont, StoreIdentity } from '../../merchant/workspace';
import { logAction, themeStore } from '../../merchant/stores';
import { BUTTON_RADIUS, FONT_STACK, SCALE_STEPS, brandScale, isHex, mediaSrc } from '../../storefront/theme';
import { Badge, Button, Card, CardHeader, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input } from '../../../ds/kit';
import { AA, ACCENT_PRESETS, BUTTONS, FONTS, HEADERS, accentReport, accessibleAccent, draftIdentity, normHex, setIdentity } from './identity';
import { ACCEPT, readImage, type MediaError } from './media';
import { mediaStore } from './state';

export function useIdentityLabels() {
  const tx = useTx();
  return {
    font: (f: StoreFont) => ({ plex: tx('بلكس العربي', 'IBM Plex Arabic'), system: tx('خط الجهاز', 'Device font'), naskh: tx('نسخ', 'Naskh') })[f],
    fontNote: (f: StoreFont) => ({ plex: tx('مرفق مع المتجر', 'Bundled with the store'), system: tx('يختلف حسب جهاز العميل', 'Varies by shopper device'), naskh: tx('من الجهاز إن توفّر، وإلا خط بديل', 'From the device if present, else a fallback') })[f],
    button: (b: ButtonStyle) => ({ soft: tx('زوايا ناعمة', 'Soft corners'), pill: tx('دائري', 'Pill'), square: tx('حاد', 'Square') })[b],
    header: (h: HeaderLayout) => ({ classic: tx('الشعار ثم القائمة', 'Logo then menu'), centered: tx('شعار في المنتصف', 'Centred logo'), minimal: tx('مختصر بقائمة جانبية', 'Compact with side menu') })[h],
    key: (k: keyof StoreIdentity) => ({ logo: tx('الشعار', 'Logo'), favicon: tx('أيقونة المتصفح', 'Favicon'), accent: tx('لون العلامة', 'Brand colour'), font: tx('الخط', 'Typeface'), button: tx('شكل الأزرار', 'Button shape'), header: tx('ترتيب الرأس', 'Header layout') })[k],
  };
}

export function useMediaError() {
  const tx = useTx();
  return (e: MediaError) => ({
    type: tx('الصيغ المقبولة: PNG وJPG وWebP وSVG', 'Accepted: PNG, JPG, WebP and SVG'),
    size: tx('الحد 5 ميجابايت', 'Max 5 MB'),
    read: tx('تعذّرت قراءة الصورة. جرّب ملفًا آخر', 'The picture could not be read. Try another file'),
    small: tx('الصورة صغيرة جدًا', 'The picture is too small'),
  })[e];
}

export default function IdentityPanel({ store }: { store: string }) {
  const tx = useTx();
  const theme = themeStore.use();
  const id = draftIdentity(theme);
  const L = useIdentityLabels();
  const set = (p: Partial<StoreIdentity>) => themeStore.set((t) => setIdentity(t, p));

  return (
    <div className="space-y-6">
      <BrandAssets id={id} store={store} set={set} />
      <ColourCard accent={id.accent} set={set} />
      <Card aria-labelledby="h-style">
        <CardHeader id="h-style" title={tx('الخط والأزرار والرأس', 'Type, buttons and header')} hint={tx('خطوط بلا مضيف خارجي: واحد مرفق مع المتجر واثنان من جهاز العميل.', 'No external font host: one font ships with the store, two come from the shopper’s device.')} />
        <div className="space-y-5 border-t border-border px-5 py-4">
          <Choice label={tx('الخط', 'Typeface')} value={id.font} options={FONTS} onChange={(font) => set({ font })}
            render={(f) => <><span className="block text-lg font-semibold leading-tight" style={{ fontFamily: FONT_STACK[f] }}>{tx('عباية مطرّزة', 'Embroidered abaya')}</span><span className="mt-1 block text-xs font-semibold text-fg">{L.font(f)}</span><span className="block text-[11px] text-muted">{L.fontNote(f)}</span></>} />
          <Choice label={tx('شكل الأزرار', 'Button shape')} value={id.button} options={BUTTONS} onChange={(button) => set({ button })}
            render={(b) => <><span className="inline-flex h-8 items-center px-3 text-xs font-semibold text-white" style={{ background: isHex(id.accent) ? brandScale(id.accent)[600] : undefined, borderRadius: BUTTON_RADIUS[b] ?? '12px' }}>{tx('أضف للسلة', 'Add to bag')}</span><span className="mt-2 block text-xs font-semibold text-fg">{L.button(b)}</span></>} />
          <Choice label={tx('ترتيب الرأس', 'Header layout')} value={id.header} options={HEADERS} onChange={(header) => set({ header })}
            render={(h) => <><HeaderSketch h={h} /><span className="mt-2 block text-xs font-semibold text-fg">{L.header(h)}</span></>} />
        </div>
      </Card>
    </div>
  );
}

function BrandAssets({ id, store, set }: { id: StoreIdentity; store: string; set: (p: Partial<StoreIdentity>) => void }) {
  const tx = useTx();
  const lib = mediaStore.use();
  const logo = mediaSrc(id.logo, lib);
  const fav = mediaSrc(id.favicon, lib);
  return (
    <Card aria-labelledby="h-assets">
      <CardHeader id="h-assets" title={tx('الشعار وأيقونة المتصفح', 'Logo and favicon')} hint={tx('تُحفظ الصور في هذه الجلسة فقط ولا تُرفع لخادم في هذه المعاينة.', 'Pictures stay in this session only; nothing is uploaded to a server in this preview.')} />
      <div className="grid grid-cols-1 gap-5 border-t border-border px-5 py-4 md:grid-cols-2">
        <Upload kind="logo" label={tx('الشعار', 'Logo')} hint={tx('PNG أو SVG بخلفية شفافة', 'PNG or SVG, transparent background')} has={!!logo}
          onDone={(ref) => { set({ logo: ref }); logAction('store', { ar: 'رفع شعارًا جديدًا لمسودة المتجر', en: 'Uploaded a new logo to the store draft' }, { target: 'logo' }); }}
          onRemove={() => set({ logo: null })}
          preview={<div className="grid grid-cols-2 gap-2">
            <span className="grid h-16 place-items-center rounded-xl border border-border px-3" style={{ background: '#fffdf9', color: '#1e1b18' }}>{logo ? <img src={logo} alt={tx('الشعار على خلفية فاتحة', 'Logo on light')} className="max-h-10 max-w-full object-contain" /> : <span className="truncate text-sm font-bold">{store}</span>}</span>
            <span className="grid h-16 place-items-center rounded-xl border border-border px-3" style={{ background: '#1e1b18', color: '#f3ede6' }}>{logo ? <img src={logo} alt={tx('الشعار على خلفية داكنة', 'Logo on dark')} className="max-h-10 max-w-full object-contain" /> : <span className="truncate text-sm font-bold">{store}</span>}</span>
          </div>}
          empty={tx('بلا شعار يظهر اسم المتجر', 'Without a logo the store name shows')} />
        <Upload kind="favicon" label={tx('أيقونة المتصفح', 'Favicon')} hint={tx('مربعة، 64 بكسل على الأقل', 'Square, at least 64 px')} has={!!fav}
          onDone={(ref) => { set({ favicon: ref }); logAction('store', { ar: 'رفع أيقونة متصفح جديدة لمسودة المتجر', en: 'Uploaded a new favicon to the store draft' }, { target: 'favicon' }); }}
          onRemove={() => set({ favicon: null })}
          preview={<div className="flex h-16 items-end rounded-xl border border-border bg-surface-2 px-3">
            <span className="flex h-10 max-w-full min-w-0 items-center gap-2 rounded-t-lg border border-b-0 border-border bg-surface px-3 text-xs text-fg">
              {fav ? <img src={fav} alt="" className="size-4 shrink-0 rounded-sm" /> : <span className="size-4 shrink-0 rounded-sm bg-surface-2 ring-1 ring-border" aria-hidden="true" />}
              <span className="truncate">{store}</span>
            </span>
          </div>}
          empty={tx('بلا أيقونة يعرض المتصفح أيقونته الافتراضية', 'Without one the browser shows its default icon')} />
      </div>
    </Card>
  );
}

function Upload({ kind, label, hint, has, preview, empty, onDone, onRemove }: { kind: 'logo' | 'favicon'; label: string; hint: string; has: boolean; preview: ReactNode; empty: string; onDone: (ref: string) => void; onRemove: () => void }) {
  const tx = useTx();
  const msg = useMediaError();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setError(null); setNote(null);
    const r = await readImage(f, kind);
    setBusy(false);
    if (input.current) input.current.value = '';
    if (!r.ok) { setError(msg(r.error)); return; }
    if (r.note === 'cropped') setNote(tx('قُصّت لمربع من المنتصف', 'Cropped to a centred square'));
    if (r.note === 'wide') setNote(tx('الشعار عريض جدًا وسيظهر صغيرًا في الرأس', 'Very wide logo: it will look small in the header'));
    onDone(r.ref);
  };
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-sm font-semibold text-fg">{label}</p>
      {preview}
      {!has && <p className="text-xs text-muted">{empty}</p>}
      <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void pick(e.target.files?.[0])} data-upload={kind} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}><ImagePlus className="size-4" aria-hidden="true" />{busy ? tx('جارٍ التجهيز…', 'Preparing…') : has ? tx('استبدل', 'Replace') : tx('ارفع', 'Upload')}</Button>
        {has && <Button variant="ghost" size="sm" onClick={() => { onRemove(); setNote(null); }}><Trash2 className="size-4" aria-hidden="true" />{tx('إزالة', 'Remove')}</Button>}
        <span className="text-[11px] text-muted">{hint}</span>
      </div>
      {error && <p className="text-xs font-medium text-red-700 dark:text-red-300" role="alert">{error}</p>}
      {note && <p className="text-xs text-amber-800 dark:text-amber-300" role="status">{note}</p>}
    </div>
  );
}

function ColourCard({ accent, set }: { accent: string; set: (p: Partial<StoreIdentity>) => void }) {
  const tx = useTx();
  const [text, setText] = useState(accent);
  const [last, setLast] = useState(accent);
  if (last !== accent) { setLast(accent); setText(accent); }
  const valid = isHex(accent);
  const rep = valid ? accentReport(accent) : null;
  const scale = valid ? brandScale(accent) : null;
  const fix = valid && rep && !rep.ok ? accessibleAccent(accent) : null;
  const typed = (v: string) => { setText(v); const h = normHex(v); set({ accent: h ?? v }); };
  const row = (labelAr: string, labelEn: string, ratio: number) => (
    <li className="flex items-center gap-2 text-[13px]">
      {ratio >= AA ? <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> : <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />}
      <span className="min-w-0 flex-1 text-fg">{tx(labelAr, labelEn)}</span>
      <bdi dir="ltr" className={cn('tabular-nums font-semibold', ratio >= AA ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-800 dark:text-amber-300')}>{ratio.toFixed(1)}:1</bdi>
    </li>
  );
  return (
    <Card aria-labelledby="h-colour">
      <CardHeader id="h-colour" title={tx('لون العلامة', 'Brand colour')} hint={tx('نولّد من اللون الواحد درجات للأزرار والروابط والوضع الداكن، ونفحص وضوح النص بمعيار 4.5:1.', 'One colour generates the shades for buttons, links and dark mode; text readability is checked against 4.5:1.')}
        action={rep && <Badge tone={rep.ok ? 'green' : 'amber'}>{rep.ok ? tx('واضح للقراءة', 'Readable') : tx('يحتاج تعديلًا', 'Needs a fix')}</Badge>} />
      <div className="space-y-4 border-t border-border px-5 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={tx('اللون', 'Colour')} hint={tx('مثل #84603d', 'e.g. #84603d')} className="w-40 space-y-1" error={!valid ? tx('اكتب لونًا بصيغة #rrggbb', 'Enter a colour as #rrggbb') : null}>
            {(p) => <Input {...p} dir="ltr" value={text} maxLength={9} spellCheck={false} onChange={(e) => typed(e.target.value)} className="font-mono" />}
          </Field>
          <label className="mb-[3px] inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border px-2 text-[13px] text-muted hover:bg-surface-2">
            <input type="color" value={valid ? accent : '#84603d'} onChange={(e) => typed(e.target.value)} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
            {tx('منتقي', 'Picker')}
          </label>
        </div>
        <div role="radiogroup" aria-label={tx('ألوان جاهزة', 'Ready colours')} className="flex flex-wrap gap-2">
          {ACCENT_PRESETS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={accent === c} aria-label={c} title={c} onClick={() => typed(c)}
              className={cn('grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-surface transition', accent === c ? 'ring-2 ring-fg' : 'hover:ring-2 hover:ring-border')} style={{ background: c }}>
              {accent === c && <Check className="size-4 text-white" aria-hidden="true" />}
            </button>
          ))}
        </div>
        {scale && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">{tx('الدرجات المولّدة', 'Generated shades')}</p>
            <ol className="flex overflow-hidden rounded-xl border border-border" aria-label={tx('الدرجات المولّدة', 'Generated shades')}>
              {SCALE_STEPS.map((k) => <li key={k} className="h-9 min-w-0 flex-1" style={{ background: scale[k] }} title={`${k} ${scale[k]}`}><span className="sr-only">{k} {scale[k]}</span></li>)}
            </ol>
            <div className="mt-1 flex justify-between text-[10px] text-subtle tabular-nums" dir="ltr"><span>50</span><span>600</span><span>900</span></div>
          </div>
        )}
        {rep && (
          <ul className="space-y-1.5 rounded-xl border border-border p-3">
            {row('نص أبيض على الأزرار', 'White text on buttons', rep.button)}
            {row('الروابط على خلفية الصفحة', 'Links on the page', rep.link)}
            {row('الروابط في الوضع الداكن', 'Links in dark mode', rep.dark)}
          </ul>
        )}
        {fix && (
          <Alert tone="warn" action={<Button size="sm" variant="secondary" onClick={() => typed(fix)}><Wand2 className="size-4" aria-hidden="true" />{tx('استخدم', 'Use')} <bdi dir="ltr" className="font-mono">{fix}</bdi></Button>}>
            {tx('بعض النصوص لن تُقرأ بوضوح بهذا اللون. أقرب لون واضح من نفس الدرجة:', 'Some text will be hard to read in this colour. The nearest readable colour of the same hue:')} <span className="inline-block size-3 rounded-full align-middle ring-1 ring-border" style={{ background: fix }} aria-hidden="true" />
          </Alert>
        )}
      </div>
    </Card>
  );
}

function Choice<T extends string>({ label, value, options, onChange, render }: { label: string; value: T; options: T[]; onChange: (v: T) => void; render: (v: T) => ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-fg">{label}</legend>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)}
            className={cn('relative min-w-0 rounded-xl border p-3 text-start transition-colors', value === o ? 'border-brand-500 bg-brand-500/5 ring-2 ring-brand-500/20' : 'border-border hover:bg-surface-2/60')}>
            {value === o && <Check className="absolute top-2 end-2 size-4 text-brand-600 dark:text-brand-300" aria-hidden="true" />}
            {render(o)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function HeaderSketch({ h }: { h: HeaderLayout }) {
  const bar = <span className="h-1 w-5 rounded bg-subtle/50" />;
  const logo = <span className="h-2 w-8 rounded bg-fg/70" />;
  return (
    <span className="block rounded-lg border border-border bg-surface-2/60 p-2" aria-hidden="true">
      {h === 'centered' ? (
        <span className="flex flex-col items-center gap-1.5">{logo}<span className="flex gap-1.5">{bar}{bar}{bar}</span></span>
      ) : h === 'minimal' ? (
        <span className="flex items-center justify-between">{logo}<span className="flex flex-col gap-0.5"><span className="h-0.5 w-3 rounded bg-fg/60" /><span className="h-0.5 w-3 rounded bg-fg/60" /><span className="h-0.5 w-3 rounded bg-fg/60" /></span></span>
      ) : (
        <span className="flex items-center gap-2">{logo}<span className="flex gap-1.5">{bar}{bar}{bar}</span></span>
      )}
    </span>
  );
}
