// Settings → Invoice (`#/dashboard/settings/invoice`): customise the simplified tax invoice that orders → print renders
// (Salla audit 02 §2.5). Title, seller block, logo position/size, colour from the store identity, which order and
// product information shows, notes and terms, stamp and signature, the language rule and when it is sent (through the
// «Invoice» customer message), with a live preview on a real order and «restore defaults». ZATCA phase-1 fields are
// listed locked: they print on every invoice and no setting can remove them. Rules live in merchant/invoice.ts.
import { useMemo, useRef, useState } from 'react';
import { ImagePlus, Lock, Printer, RotateCcw, Trash2 } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link } from '../../../core/router';
import { invoiceConfigStore, logAction, noticesStore, ordersStore } from '../../merchant/stores';
import {
  FIELD_LABEL, INVOICE_LANGS, LEGAL_TITLE, LOCKED_FIELDS, NOTE_MAX, ORDER_FIELDS, PRODUCT_FIELDS, SEND_ON, STORE_FIELDS, TERMS_MAX, TITLE_MAX, contrastOnWhite, invoiceChanges,
  invoiceConfigFixture, validateInvoice, type ColourSource, type InvoiceConfig, type InvoiceError, type InvoiceLang, type LogoPos, type LogoSize, type OptionalField, type SendOn, type StampImage,
} from '../../merchant/invoice';
import { NOTICE_CHANNELS, payView, validVatNo } from '../../merchant/ops';
import { normaliseDigits } from '../../merchant/catalog';
import { Badge, Button, Card, CardHeader, InfoHint, Ref, Segmented, cn, useTx } from '../../../ds/ui';
import { Alert, Checkbox, Field, Input, Modal, SaveBar, Select, Simulated, Textarea, useToast } from '../../../ds/kit';
import { LeaveGuard, Section, useSave } from './common';
import { useSessionDraft } from './drafts';
import { InvoiceDoc, invoiceStore, useInvoiceSetup } from './invoice-doc';
import { useChannelName } from '../orders/notices-ui';

interface Draft { cfg: InvoiceConfig; seller: { vatNo: string; cr: string; address: string } }
const IMG_MAX = 300 * 1024;

export default function InvoiceSettings() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const savedCfg = invoiceConfigStore.use();
  const savedSeller = invoiceStore.use();
  const orders = ordersStore.use();
  const notices = noticesStore.use();
  const chName = useChannelName();
  const setup = useInvoiceSetup();
  const base = useMemo<Draft>(() => ({ cfg: savedCfg, seller: savedSeller }), [savedCfg, savedSeller]);
  const [d, setD, clearD] = useSessionDraft<Draft>('settings:invoice', base);
  const [tried, setTried] = useState(false);
  const [restore, setRestore] = useState(false);
  const { saving, error, save, clearError } = useSave();
  const dirty = JSON.stringify(d) !== JSON.stringify(base);
  const cfg = d.cfg;
  const errs = validateInvoice(cfg);
  const vatOk = validVatNo(d.seller.vatNo);
  const addrOk = !!d.seller.address.trim();
  const has = (e: InvoiceError) => tried && errs.includes(e);
  const set = (p: Partial<InvoiceConfig>) => { setD({ ...d, cfg: { ...cfg, ...p } }); clearError(); };
  const setSeller = (p: Partial<Draft['seller']>) => { setD({ ...d, seller: { ...d.seller, ...p } }); clearError(); };
  const toggle = (k: OptionalField, on: boolean) => set({ show: { ...cfg.show, [k]: on } });

  // Preview on a real order: recent paid orders, first one in English if any, so the language rule can be checked.
  const sample = useMemo(() => orders.filter((o) => payView(o) !== 'failed' && !o.cancelled).slice(0, 25), [orders]);
  const [ref, setRef] = useState(sample[0]?.ref ?? '');
  const order = sample.find((o) => o.ref === ref) ?? sample[0];
  const langs = order ? setup.langsFor(cfg, order) : ['ar' as const];
  const accent = setup.accentFor(cfg);
  const channels = NOTICE_CHANNELS.filter((c) => notices.channels.invoice?.[c]);

  const msg: Record<InvoiceError, string> = {
    titleAr: tx(`يجب أن يحتوي على «${LEGAL_TITLE.ar}»`, `Must contain “${LEGAL_TITLE.ar}”`), titleEn: tx(`يجب أن يحتوي على «${LEGAL_TITLE.en}»`, `Must contain “${LEGAL_TITLE.en}”`),
    titleLong: tx(`${TITLE_MAX} حرفًا كحد أقصى`, `${TITLE_MAX} characters at most`), issuedLong: tx('80 حرفًا كحد أقصى', '80 characters at most'),
    notesLong: tx(`${NOTE_MAX} حرف كحد أقصى`, `${NOTE_MAX} characters at most`), termsLong: tx(`${TERMS_MAX} حرف كحد أقصى`, `${TERMS_MAX} characters at most`),
    colour: tx('لون بصيغة ‎#RRGGBB', 'A colour like #RRGGBB'), contrast: tx('فاتح جدًا على الورق الأبيض؛ اختر لونًا أغمق', 'Too light on white paper; pick a darker colour'),
  };
  const onSave = () => {
    setTried(true);
    if (errs.length || !vatOk || !addrOk) return;
    save(() => {
      const now = new Date().toISOString();
      const changed = invoiceChanges(savedCfg, cfg);
      invoiceConfigStore.set({ ...cfg, title: { ar: cfg.title.ar.trim(), en: cfg.title.en.trim() }, version: savedCfg.version + (changed.length ? 1 : 0), savedAt: now, savedBy: setup.seller.name });
      invoiceStore.set({ vatNo: normaliseDigits(d.seller.vatNo).replace(/\s/g, ''), cr: normaliseDigits(d.seller.cr).trim(), address: d.seller.address.trim() });
      logAction('settings', { ar: `عدّل الفاتورة: ${changed.join('، ') || 'بيانات البائع'}`, en: `Edited the invoice: ${changed.join(', ') || 'seller details'}` }, { after: `v${savedCfg.version + (changed.length ? 1 : 0)}` });
      clearD(); setTried(false);
    }, tx('حُفظت الفاتورة؛ تُطبع بها كل الفواتير من الآن', 'Invoice saved; every invoice prints with it from now on'));
  };

  const fieldGroup = (title: string, keys: OptionalField[]) => (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold text-muted">{title}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {keys.map((k) => (
          <label key={k} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-[13px] text-fg">
            <Checkbox checked={cfg.show[k]} onChange={(on) => toggle(k, on)} label={FIELD_LABEL[k][lang]} />{FIELD_LABEL[k][lang]}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <>
      <LeaveGuard dirty={dirty} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:items-start">
        <div className="min-w-0 space-y-6">
          <Card aria-labelledby="inv-legal">
            <CardHeader id="inv-legal" title={<span className="flex items-center gap-1.5"><Lock className="size-4 text-muted" aria-hidden="true" />{tx('حقول نظامية لا تُحذف', 'Legal fields you cannot remove')}</span>}
              hint={tx('متطلبات الفاتورة الضريبية المبسطة في المرحلة الأولى من الفوترة الإلكترونية. تظهر في كل فاتورة مهما غيّرت.', 'Required on a simplified tax invoice in e-invoicing phase 1. They print on every invoice whatever you change.')} />
            <ul className="grid gap-1.5 px-5 pb-5 sm:grid-cols-2">
              {LOCKED_FIELDS.map((f) => (
                <li key={f.id} className="flex items-center gap-2 rounded-lg bg-surface-2/60 px-2.5 py-2 text-[13px] text-fg">
                  <Checkbox checked onChange={() => toast({ tone: 'info', text: tx(`«${f.label.ar}» إلزامي في الفاتورة الضريبية`, `“${f.label.en}” is required on a tax invoice`) })} label={tx(`${f.label.ar} (إلزامي)`, `${f.label.en} (required)`)} />
                  <span className="min-w-0 flex-1">{f.label[lang]}</span><Lock className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                </li>
              ))}
            </ul>
          </Card>

          <Section id="inv-title" title={tx('العنوان والبائع', 'Title and seller')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tx('العنوان بالعربية', 'Title in Arabic')} error={has('titleAr') ? msg.titleAr : has('titleLong') ? msg.titleLong : null} hint={tx('يمكنك الإضافة، لا الحذف', 'You can add, not remove')}>
                {(p) => <Input {...p} dir="rtl" value={cfg.title.ar} maxLength={TITLE_MAX + 10} onChange={(e) => set({ title: { ...cfg.title, ar: e.target.value } })} />}
              </Field>
              <Field label={tx('العنوان بالإنجليزية', 'Title in English')} error={has('titleEn') ? msg.titleEn : null}>
                {(p) => <Input {...p} dir="ltr" value={cfg.title.en} maxLength={TITLE_MAX + 10} onChange={(e) => set({ title: { ...cfg.title, en: e.target.value } })} />}
              </Field>
              <Field label={tx('الرقم الضريبي', 'VAT number')} error={tried && !vatOk ? tx('15 رقمًا يبدأ وينتهي بـ 3', '15 digits, starting and ending with 3') : null}>
                {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.seller.vatNo} onChange={(e) => setSeller({ vatNo: e.target.value })} />}
              </Field>
              <Field label={tx('السجل التجاري', 'Commercial registration')} optional>
                {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.seller.cr} onChange={(e) => setSeller({ cr: e.target.value })} />}
              </Field>
              <Field label={tx('عنوان البائع', 'Seller address')} error={tried && !addrOk ? tx('مطلوب في الفاتورة', 'Required on the invoice') : null} className="sm:col-span-2">
                {(p) => <Input {...p} value={d.seller.address} onChange={(e) => setSeller({ address: e.target.value })} />}
              </Field>
              <Field label={tx('سطر «صادرة من» (عربي)', '“Issued by” line (Arabic)')} optional error={has('issuedLong') ? msg.issuedLong : null}>
                {(p) => <Input {...p} dir="rtl" value={cfg.issuedBy.ar} placeholder={tx('مثال: فرع الرياض', 'e.g. Riyadh branch')} onChange={(e) => set({ issuedBy: { ...cfg.issuedBy, ar: e.target.value } })} />}
              </Field>
              <Field label={tx('سطر «صادرة من» (إنجليزي)', '“Issued by” line (English)')} optional>
                {(p) => <Input {...p} dir="ltr" value={cfg.issuedBy.en} placeholder="Riyadh branch" onChange={(e) => set({ issuedBy: { ...cfg.issuedBy, en: e.target.value } })} />}
              </Field>
            </div>
            <p className="mt-3 text-xs text-muted">{tx('اسم البائع من بيانات المتجر.', 'The seller name comes from store details.')} <a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={link('/dashboard/settings/store')}>{tx('بيانات المتجر', 'Store details')}</a></p>
          </Section>

          <Section id="inv-look" title={tx('الشعار والألوان', 'Logo and colours')}>
            <label className="flex items-center gap-2 text-sm text-fg"><Checkbox checked={cfg.logo.show} onChange={(v) => set({ logo: { ...cfg.logo, show: v } })} label={tx('اعرض الشعار', 'Show the logo')} />{tx('اعرض الشعار', 'Show the logo')}</label>
            {!setup.logo && cfg.logo.show && <p className="mt-1 text-xs text-muted">{tx('لا شعار في هوية المتجر؛ يظهر اسم المتجر بلون الهوية.', 'No logo in the store identity; the store name shows in the identity colour.')} <a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={link('/dashboard/storefront/theme')}>{tx('هوية المتجر', 'Store identity')}</a></p>}
            <div className="mt-3 flex flex-wrap gap-4">
              <Segmented label={tx('الموضع', 'Position')} value={cfg.logo.pos} onChange={(v: LogoPos) => set({ logo: { ...cfg.logo, pos: v } })} options={[{ value: 'start', label: tx('البداية', 'Start') }, { value: 'center', label: tx('الوسط', 'Centre') }, { value: 'end', label: tx('النهاية', 'End') }]} />
              <Segmented label={tx('الحجم', 'Size')} value={cfg.logo.size} onChange={(v: LogoSize) => set({ logo: { ...cfg.logo, size: v } })} options={[{ value: 's', label: tx('صغير', 'Small') }, { value: 'm', label: tx('متوسط', 'Medium') }, { value: 'l', label: tx('كبير', 'Large') }]} />
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <Segmented label={tx('اللون', 'Colour')} value={cfg.colour.source} onChange={(v: ColourSource) => set({ colour: { ...cfg.colour, source: v } })} options={[{ value: 'identity', label: tx('من هوية المتجر', 'From store identity') }, { value: 'custom', label: tx('لون آخر', 'Other colour') }, { value: 'mono', label: tx('أسود', 'Black') }]} />
              {cfg.colour.source === 'custom' && (
                <div className="flex items-center gap-2">
                  <input type="color" aria-label={tx('اختر اللون', 'Pick colour')} value={/^#[0-9a-f]{6}$/i.test(cfg.colour.custom) ? cfg.colour.custom : '#000000'} onChange={(e) => set({ colour: { ...cfg.colour, custom: e.target.value } })} className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-surface" />
                  <Input aria-label={tx('رمز اللون', 'Colour code')} dir="ltr" className="w-28" value={cfg.colour.custom} aria-invalid={has('colour') || has('contrast') || undefined} onChange={(e) => set({ colour: { ...cfg.colour, custom: e.target.value } })} />
                </div>
              )}
              <span className="flex items-center gap-1.5 text-xs text-muted"><span className="size-4 rounded-full border border-border" style={{ background: accent }} aria-hidden="true" /><bdi dir="ltr">{accent}</bdi>{cfg.colour.source === 'identity' && <Badge>{tx('يتبع الهوية', 'Follows identity')}</Badge>}</span>
            </div>
            {(has('colour') || has('contrast') || (cfg.colour.source === 'custom' && contrastOnWhite(cfg.colour.custom) > 0 && contrastOnWhite(cfg.colour.custom) < 3)) && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{has('colour') ? msg.colour : msg.contrast}</p>}
          </Section>

          <Section id="inv-fields" title={<>{tx('ما يظهر في الفاتورة', 'What the invoice shows')}<InfoHint>{tx('اختيارية؛ الحقول النظامية أعلاه تبقى دائمًا.', 'Optional; the legal fields above always stay.')}</InfoHint></>}>
            <div className="space-y-4">
              {fieldGroup(tx('المنتجات', 'Products'), PRODUCT_FIELDS)}
              {fieldGroup(tx('الطلب والعميل', 'Order and customer'), ORDER_FIELDS)}
              {fieldGroup(tx('المتجر', 'Store'), STORE_FIELDS)}
            </div>
            {cfg.show.customerPhone && <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">{tx('جوال العميل يظهر لكل من يرى الفاتورة الورقية (مثل المندوب).', 'The customer’s mobile shows to anyone who sees the paper invoice (e.g. the courier).')}</p>}
          </Section>

          <Section id="inv-notes" title={tx('الملاحظات والشروط', 'Notes and terms')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tx('ملاحظة (عربي)', 'Note (Arabic)')} optional error={has('notesLong') ? msg.notesLong : null} hint={<span className="tabular-nums">{cfg.notes.ar.length}/{NOTE_MAX}</span>}>
                {(p) => <Textarea {...p} dir="rtl" rows={3} value={cfg.notes.ar} placeholder={tx('مثال: شكرًا لتسوقك معنا', 'e.g. Thank you for shopping with us')} onChange={(e) => set({ notes: { ...cfg.notes, ar: e.target.value } })} />}
              </Field>
              <Field label={tx('ملاحظة (إنجليزي)', 'Note (English)')} optional hint={<span className="tabular-nums">{cfg.notes.en.length}/{NOTE_MAX}</span>}>
                {(p) => <Textarea {...p} dir="ltr" rows={3} value={cfg.notes.en} onChange={(e) => set({ notes: { ...cfg.notes, en: e.target.value } })} />}
              </Field>
              <Field label={tx('الشروط (عربي)', 'Terms (Arabic)')} optional error={has('termsLong') ? msg.termsLong : null} hint={<span className="tabular-nums">{cfg.terms.ar.length}/{TERMS_MAX}</span>}>
                {(p) => <Textarea {...p} dir="rtl" rows={3} value={cfg.terms.ar} placeholder={tx('مثال: الاسترجاع خلال 7 أيام بحالته الأصلية', 'e.g. Returns within 7 days in original condition')} onChange={(e) => set({ terms: { ...cfg.terms, ar: e.target.value } })} />}
              </Field>
              <Field label={tx('الشروط (إنجليزي)', 'Terms (English)')} optional hint={<span className="tabular-nums">{cfg.terms.en.length}/{TERMS_MAX}</span>}>
                {(p) => <Textarea {...p} dir="ltr" rows={3} value={cfg.terms.en} onChange={(e) => set({ terms: { ...cfg.terms, en: e.target.value } })} />}
              </Field>
            </div>
          </Section>

          <Section id="inv-stamp" title={<>{tx('الختم والتوقيع', 'Stamp and signature')}<InfoHint>{tx('صورة PNG أو JPG أو SVG حتى 300 كيلوبايت. تُحفظ في هذه الجلسة فقط (محاكاة رفع).', 'A PNG, JPG or SVG up to 300 KB. Kept in this session only (simulated upload).')}</InfoHint></>}>
            <div className="grid gap-4 sm:grid-cols-2">
              <ImagePick label={tx('الختم', 'Stamp')} value={cfg.stamp} onChange={(v) => set({ stamp: v })} />
              <ImagePick label={tx('التوقيع', 'Signature')} value={cfg.signature} onChange={(v) => set({ signature: v })} />
            </div>
          </Section>

          <Section id="inv-send" title={tx('اللغة والإرسال', 'Language and sending')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tx('لغة الفاتورة', 'Invoice language')}>
                {(p) => <Select {...p} value={cfg.lang} onChange={(e) => set({ lang: e.target.value as InvoiceLang })}>
                  {INVOICE_LANGS.map((x) => <option key={x} value={x}>{{ customer: tx('لغة العميل', 'Customer’s language'), bilingual: tx('عربي وإنجليزي معًا', 'Arabic and English together'), ar: tx('العربية دائمًا', 'Always Arabic'), en: tx('الإنجليزية دائمًا', 'Always English') }[x]}</option>)}
                </Select>}
              </Field>
              <Field label={tx('متى تُرسل للعميل', 'When it is sent')}>
                {(p) => <Select {...p} value={cfg.sendOn} onChange={(e) => set({ sendOn: e.target.value as SendOn })}>
                  {SEND_ON.map((x) => <option key={x} value={x}>{{ manual: tx('يدويًا من الطلب فقط', 'Only by hand from the order'), paid: tx('تلقائيًا عند تأكيد الدفع', 'Automatically when payment is confirmed'), delivered: tx('تلقائيًا عند التسليم', 'Automatically on delivery') }[x]}</option>)}
                </Select>}
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{tx('القنوات من رسالة «الفاتورة» في إشعارات العملاء:', 'Channels from the «Invoice» customer message:')}</span>
              {channels.length ? channels.map((c) => <Badge key={c} tone="brand">{chName(c)}</Badge>) : <Badge tone="amber">{tx('لا قناة مفعّلة', 'No channel on')}</Badge>}
              <a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={link('/dashboard/settings/notifications', { tab: 'customers', event: 'invoice' })}>{tx('عدّل القوالب والقنوات', 'Edit templates and channels')}</a>
              <Simulated />
            </div>
            {cfg.sendOn !== 'manual' && !channels.length && <div className="mt-3"><Alert tone="warn">{tx('لن تصل الفاتورة لأحد: فعّل قناة لرسالة «الفاتورة».', 'The invoice will reach no one: turn on a channel for the «Invoice» message.')}</Alert></div>}
            {cfg.sendOn !== 'manual' && <p className="mt-2 text-xs text-muted">{tx('تُرسل مرة واحدة لكل طلب، وتظهر في «رسائل العميل» داخل الطلب.', 'Sent once per order, and listed under the order’s customer messages.')}</p>}
          </Section>
        </div>

        <div className="min-w-0 xl:sticky xl:top-24">
          <Card aria-labelledby="inv-prev">
            <CardHeader id="inv-prev" title={tx('معاينة حية', 'Live preview')} hint={tx('هذه هي الفاتورة كما تُطبع لهذا الطلب، قبل الحفظ.', 'This is the invoice exactly as it prints for this order, before saving.')}
              action={<Button variant="ghost" size="sm" onClick={() => setRestore(true)}><RotateCcw className="size-4" aria-hidden="true" />{tx('الافتراضي', 'Defaults')}</Button>} />
            <div className="space-y-3 px-5 pb-5">
              <div className="flex flex-wrap items-center gap-2">
                <Select aria-label={tx('طلب المعاينة', 'Preview order')} className="w-auto min-w-0 flex-1 sm:flex-none" value={order?.ref ?? ''} onChange={(e) => setRef(e.target.value)}>
                  {sample.map((o) => <option key={o.ref} value={o.ref}>#{o.ref} · {o.customer[lang]}{o.lang ? ` · ${o.lang.toUpperCase()}` : ''}</option>)}
                </Select>
                <Badge>{langs.length > 1 ? tx('ثنائية اللغة', 'Bilingual') : langs[0] === 'ar' ? tx('بالعربية', 'In Arabic') : tx('بالإنجليزية', 'In English')}</Badge>
                {order && <a href={link('/dashboard/orders/print', { doc: 'invoice', refs: order.ref })} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300"><Printer className="size-4" aria-hidden="true" />{tx('صفحة الطباعة', 'Print page')}</a>}
              </div>
              {dirty && <p className="text-xs text-amber-700 dark:text-amber-400">{tx('المعاينة تعرض تعديلات غير محفوظة؛ الفواتير المطبوعة لا تتغير قبل الحفظ.', 'The preview shows unsaved edits; printed invoices do not change until you save.')}</p>}
              {order ? (
                <div className="scrollbar-thin overflow-x-auto rounded-xl border border-border bg-white p-4 shadow-sm sm:p-6">
                  <InvoiceDoc o={order} seller={{ ...setup.seller, vatNo: d.seller.vatNo, cr: d.seller.cr, address: d.seller.address, demoVat: setup.seller.demoVat }} cfg={cfg} accent={accent} logo={setup.logo} langs={langs} customers={setup.customers} />
                </div>
              ) : <p className="text-sm text-muted">{tx('لا طلبات مدفوعة للمعاينة بعد.', 'No paid orders to preview yet.')}</p>}
              <p className="text-xs text-muted">{tx('مرجع الطلب', 'Order ref')} {order && <Ref>#{order.ref}</Ref>} · {tx(`الإصدار المحفوظ v${savedCfg.version}`, `Saved version v${savedCfg.version}`)}</p>
            </div>
          </Card>
        </div>
      </div>
      {restore && (
        <Modal title={tx('استعادة الإعدادات الافتراضية؟', 'Restore defaults?')} onClose={() => setRestore(false)}
          description={tx('يعيد العنوان والشكل والحقول والملاحظات ولغة الإرسال إلى الافتراضي في المسودة. بيانات البائع لا تتغير. لا يُحفظ شيء قبل «احفظ».', 'Resets title, look, fields, notes and sending to the defaults in your draft. Seller details stay. Nothing is saved until you press Save.')}
          footer={<><Button variant="secondary" onClick={() => setRestore(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { setD({ ...d, cfg: { ...invoiceConfigFixture(), version: savedCfg.version } }); setRestore(false); }}>{tx('استعد في المسودة', 'Restore in draft')}</Button></>} />
      )}
      <SaveBar dirty={dirty || !!error} saving={saving} error={error ?? (tried && (errs.length || !vatOk || !addrOk) ? tx('صحّح ما هو معلّم ثم احفظ', 'Fix what is marked, then save') : undefined)} onSave={onSave} onDiscard={() => { clearD(); setTried(false); clearError(); }} />
    </>
  );
}

function ImagePick({ label, value, onChange }: { label: string; value: StampImage | null; onChange: (v: StampImage | null) => void }) {
  const tx = useTx();
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const take = (file: File | undefined) => {
    setErr(null);
    if (!file) return;
    if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type)) { setErr(tx('PNG أو JPG أو SVG فقط', 'PNG, JPG or SVG only')); return; }
    if (file.size > IMG_MAX) { setErr(tx('أكبر من 300 كيلوبايت', 'Larger than 300 KB')); return; }
    const reader = new FileReader();
    reader.onload = () => onChange({ url: String(reader.result), name: file.name });
    reader.onerror = () => setErr(tx('تعذّرت قراءة الملف؛ جرّب مرة أخرى', 'Could not read the file; try again'));
    reader.readAsDataURL(file);
  };
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-fg">{label}</p>
      <div className={cn('flex items-center gap-3 rounded-xl border border-dashed p-3', err ? 'border-red-400' : 'border-border')}>
        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-white">{value ? <img src={value.url} alt="" className="max-h-full max-w-full object-contain" /> : <ImagePlus className="size-5 text-neutral-400" aria-hidden="true" />}</span>
        <div className="min-w-0 flex-1">
          {value ? <p className="truncate text-xs text-muted"><bdi>{value.name}</bdi></p> : <p className="text-xs text-muted">{tx('لا صورة', 'No image')}</p>}
          <div className="mt-1 flex gap-1">
            <Button size="sm" variant="secondary" onClick={() => input.current?.click()}>{value ? tx('استبدل', 'Replace') : tx('ارفع صورة', 'Upload')}</Button>
            {value && <Button size="sm" variant="ghost" onClick={() => onChange(null)} aria-label={tx(`احذف ${label}`, `Remove ${label}`)}><Trash2 className="size-4" aria-hidden="true" /></Button>}
          </div>
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/svg+xml" className="sr-only" tabIndex={-1} aria-label={label} onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {err && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{err}</p>}
    </div>
  );
}
