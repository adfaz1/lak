// Product editor (v2): small field primitives shared by the sections. Labels are permanent; help and errors are linked to the input.
import { useState, type ReactNode } from 'react';
import { useLang } from '../../core/lang';
import type { DraftError } from '../merchant/catalog';
import { Icon, useTx } from './ui';
import { errId, swatchOf } from './product-model';

export function useErrText() {
  const tx = useTx();
  return (e?: DraftError) => e && ({
    required: tx('هذا الحقل مطلوب.', 'This field is required.'),
    money: tx('أدخل مبلغًا أكبر من صفر، مثل 290 أو 290.50.', 'Enter an amount above zero, like 290 or 290.50.'),
    compareAt: tx('يجب أن يكون أعلى من السعر، وإلا فاتركه فارغًا.', 'Must be higher than the price, or leave it empty.'),
    skuTaken: tx('هذا الـSKU مستخدم لمنتج آخر.', 'Another product already uses this SKU.'),
    skuFormat: tx('من 3 إلى 32 حرفًا لاتينيًا أو رقمًا أو شرطة.', '3–32 Latin letters, digits or hyphens.'),
    weight: tx('الوزن بالغرام، من 1 إلى 30000.', 'Weight in grams, from 1 to 30000.'),
    slug: tx('حروف لاتينية صغيرة وأرقام وشرطات فقط.', 'Lowercase Latin letters, digits and hyphens only.'),
    alt: tx('صف الصورة لمن لا يراها.', 'Describe the image for people who can’t see it.'),
    duplicate: tx('قيمة مكررة في القائمة.', 'This value is listed twice.'),
    stock: tx('عدد صحيح، صفر أو أكثر.', 'A whole number, 0 or more.'),
    skuRepeated: tx('مكرر في متغير آخر.', 'Repeated in another variant.'),
  })[e];
}

/** Short field name for the error summary. */
export function useFieldName() {
  const tx = useTx();
  return (k: string, variantName: (i: number) => string, n: (i: number) => string) => {
    if (k.startsWith('media.')) return tx(`النص البديل للصورة ${n(+k.split('.')[1] + 1)}`, `Alt text, image ${n(+k.split('.')[1] + 1)}`);
    if (k.startsWith('v.')) {
      const [, i, f] = k.split('.');
      const what = f === 'sku' ? 'SKU' : f === 'price' ? tx('السعر', 'price') : tx('الكمية', 'stock');
      return `${variantName(+i)} · ${what}`;
    }
    return ({
      nameAr: tx('الاسم بالعربية', 'Arabic name'), nameEn: tx('الاسم بالإنجليزية', 'English name'), price: tx('السعر', 'Price'),
      compareAt: tx('السعر قبل الخصم', 'Compare-at price'), cost: tx('التكلفة', 'Cost'), sku: 'SKU', stock: tx('الكمية الأولية', 'Initial quantity'),
      weight: tx('الوزن', 'Weight'), slug: tx('الرابط', 'URL handle'), colors: tx('الألوان', 'Colours'), sizes: tx('المقاسات', 'Sizes'),
    } as Record<string, string>)[k] ?? k;
  };
}

/** Field wrapper. `k` is the validation key; the input inside must set aria-describedby via `describedBy`. */
export function Field({ id, label, help, error, aside, children, k }: { id: string; label: ReactNode; help?: ReactNode; error?: string; aside?: ReactNode; children: ReactNode; k?: string }) {
  return (
    <div className="lk-field">
      <div className="lk-row lk-between" style={{ minHeight: 20 }}>
        <label className="lk-label" htmlFor={id}>{label}</label>
        {aside}
      </div>
      {children}
      {error ? <span className="lk-error" id={k ? errId(k) : `${id}-err`}><Icon name="alert" size="xs" />{error}</span>
        : help ? <span className="lk-help" id={`${id}-help`}>{help}</span> : null}
    </div>
  );
}
/** Saudi riyal glyph for input suffixes (same font as Money). */
export function Riyal() {
  const { lang } = useLang();
  return <span className="lk-suffix"><span className="lk-riyal" role="img" aria-label={lang === 'ar' ? 'ريال سعودي' : 'Saudi riyal'}>{'\uE900'}</span></span>;
}
export const describedBy = (id: string, k: string, hasError: boolean, hasHelp = false) =>
  hasError ? errId(k) : hasHelp ? `${id}-help` : undefined;

/** Character counter that warns near the limit. */
export function Counter({ n, max, ideal }: { n: number; max: number; ideal?: number }) {
  const over = ideal !== undefined && n > ideal;
  return <span className={`pe-counter lk-num${over ? ' warn' : ''}`} aria-hidden="true">{n}/{max}</span>;
}

/** Section card with an anchor used by the section index. */
/** Form section: a Somar title over a hairline; no box. */
export function Section({ id, title, sub, actions, children, tone }: { id: string; title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; tone?: 'error' }) {
  const tx = useTx();
  return (
    <section className={`pe-sec${tone === 'error' ? ' has-error' : ''}`} id={`sec-${id}`} aria-labelledby={`sec-${id}-h`}>
      <header className="pe-sec-h">
        <div className="lk-col lk-grow" style={{ gap: 4 }}>
          <h2 id={`sec-${id}-h`} className="pe-sec-t">{title}{tone === 'error' && <span className="pe-sec-flag">{tx('يحتاج تصحيحًا', 'Needs a fix')}</span>}</h2>
          {sub && <p className="lk-small lk-3">{sub}</p>}
        </div>
        {actions}
      </header>
      <div className="pe-sec-b">{children}</div>
    </section>
  );
}

/** Switch row with a label and an explanation. */
export function SwitchRow({ id, checked, onChange, label, help, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: ReactNode; help?: ReactNode; children?: ReactNode }) {
  return (
    <div className="pe-switchrow">
      <div className="lk-col lk-grow" style={{ gap: 2 }}>
        <label htmlFor={id} className="lk-strong">{label}</label>
        {help && <span className="lk-small lk-3" id={`${id}-help`}>{help}</span>}
        {children}
      </div>
      <input id={id} type="checkbox" role="switch" className="lk-switch" checked={checked} aria-describedby={help ? `${id}-help` : undefined} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

const COLOR_AR: Record<string, string> = { black: 'أسود', navy: 'كحلي', white: 'أبيض', beige: 'بيج', red: 'أحمر', green: 'أخضر', blue: 'أزرق', brown: 'بني', grey: 'رمادي', gray: 'رمادي', gold: 'ذهبي', pink: 'وردي', cream: 'كريمي', olive: 'زيتي' };
export function useColorName() {
  const { lang } = useLang();
  return (c: string) => (lang === 'ar' ? COLOR_AR[c.trim().toLowerCase()] ?? c : c);
}
export function Swatch({ color }: { color: string }) {
  const hex = swatchOf(color);
  return <span className={`pe-swatch${hex ? '' : ' none'}`} style={hex ? { background: hex } : undefined} aria-hidden="true" />;
}

/** Product photo with a quiet fallback when a file is missing. */
export function Photo({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const ok = src && broken !== src;
  return (
    <span className={`pe-photo${className ? ` ${className}` : ''}`}>
      {ok ? <img src={src} alt={alt} decoding="async" onError={() => setBroken(src!)} /> : <span className="pe-photo-none" role="img" aria-label={alt || undefined}><Icon name="image" /></span>}
    </span>
  );
}
