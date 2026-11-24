// Design: identity (name, icon, splash), colour, home screen sections and product display, in-app features.
// Edits save to the draft automatically and update the phone at once. Tags say whether a change ships as a
// settings update or needs a new version through store review.
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Eye, Image as ImageIcon, LayoutList, Megaphone, Plus, Sparkles, Star, Tags, Trash2, Undo2 } from 'lucide-react';
import { useLang, type L } from '../../../core/lang';
import type { Route } from '../../../core/router';
import { Badge, Button, Card, CardHeader, IconButton, InfoHint, Segmented, cn, useTx } from '../../../ds/ui';
import { Field, Input, Modal, Switch, useToast } from '../../../ds/kit';
import {
  FEATURE_KEYS, MAX_SECTIONS, NAME_MAX, SECTION_TYPES, addSection, canAdd, classifyChange, liveConfig, moveSection, nameIssues, removeSection,
  type SectionType,
} from '../../appmaker/domain';
import { ACCENTS, ICONS, SPLASHES } from '../../appmaker/fixtures';
import { strings } from '../../appmaker/i18n';
import { accentIssue, contrast, isHex, monogram } from './model';
import { IconArt } from './phone';
import { ChangeTag, PreviewPanel, useAppData, useS } from './parts';
import { appStore, updDraft } from './state';

const S_ICON: Record<SectionType, ReactNode> = {
  hero: <ImageIcon className="size-4" />, categories: <Tags className="size-4" />, featured: <Sparkles className="size-4" />,
  banner: <Megaphone className="size-4" />, newArrivals: <Star className="size-4" />, bestSellers: <LayoutList className="size-4" />,
};
const TITLE_MAX = 40;

export default function Design({ route }: { route: Route }) {
  const tx = useTx();
  const S = useS();
  const { lang } = useLang();
  const toast = useToast();
  const { s } = useAppData();
  const d = s.draft;
  const live = liveConfig(s.releases);
  const change = live ? classifyChange(live, d) : null;
  const [discard, setDiscard] = useState(false);
  const [msg, setMsg] = useState('');
  const issues = nameIssues(d.name);
  const letter = monogram(d.name, lang);

  useEffect(() => {
    const f = route.query.get('focus');
    if (f === 'home' || f === 'features') document.getElementById(`am-${f}`)?.scrollIntoView({ block: 'start' });
  }, [route.query]);

  const label = (t: SectionType) => S.sectionTypes[t];
  const move = (id: string, delta: number, i: number) => {
    updDraft((x) => ({ ...x, sections: moveSection(x.sections, id, delta) }));
    setMsg(S.moved(d.sections[i].title[lang] || label(d.sections[i].type), i + delta + 1));
  };
  const add = (type: SectionType) => {
    const title: L = { ar: strings.ar.sectionTypes[type], en: strings.en.sectionTypes[type] };
    updDraft((x) => ({ ...x, sections: addSection(x.sections, { id: `s${Date.now().toString(36)}`, type, title }) }));
    setMsg(S.added(label(type)));
  };
  const remove = (id: string, i: number) => {
    const sec = d.sections[i];
    updDraft((x) => ({ ...x, sections: removeSection(x.sections, id) }));
    toast({ tone: 'info', text: S.removed(sec.title[lang] || label(sec.type)), action: { label: tx('تراجع', 'Undo'), run: () => updDraft((x) => ({ ...x, sections: [...x.sections.slice(0, i), sec, ...x.sections.slice(i)] })) } });
  };
  const nameErr = (k: keyof L) => (issues[k] === 'required' ? tx('اكتب اسم التطبيق', 'Enter the app name') : issues[k] === 'tooLong' ? tx(`الحد ${NAME_MAX} حرفًا`, `Max ${NAME_MAX} characters`) : null);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <p className="sr-only" role="status" aria-live="polite">{msg}</p>
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />{tx('يُحفظ في المسودة تلقائيًا', 'Saved to draft automatically')}</span>
          {change && change.kind !== 'none' && <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setDiscard(true)}><Undo2 className="size-4" aria-hidden="true" />{tx('تجاهل تعديلات المسودة', 'Discard draft edits')}</Button>}
        </div>

        <Card aria-labelledby="am-id">
          <CardHeader id="am-id" title={tx('الهوية', 'Identity')} hint={tx('الاسم والأيقونة وشاشة الافتتاح جزء من ملف التطبيق؛ تغييرها بعد النشر يحتاج إصدارًا جديدًا ومراجعة المتاجر.', 'Name, icon and splash are part of the app file; changing them after launch needs a new version and store review.')} action={<ChangeTag kind="binary" />} />
          <div className="space-y-5 px-5 pb-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(['ar', 'en'] as const).map((k) => (
                <Field key={k} label={k === 'ar' ? tx('الاسم بالعربية', 'Name in Arabic') : tx('الاسم بالإنجليزية', 'Name in English')} error={nameErr(k)} hint={<bdi dir="ltr">{d.name[k].trim().length} / {NAME_MAX}</bdi>}>
                  {(p) => <Input {...p} dir={k === 'ar' ? 'rtl' : 'ltr'} lang={k} value={d.name[k]} onChange={(e) => updDraft((x) => ({ ...x, name: { ...x.name, [k]: e.target.value } }))} />}
                </Field>
              ))}
            </div>
            <fieldset>
              <legend className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-fg">{tx('الأيقونة', 'Icon')}<InfoHint>{tx('مولّدة من اسم متجرك وألوانه. الملف النهائي 1024×1024 يُنشأ عند البناء. رفع شعار خاص غير متاح بعد.', 'Generated from your store name and colours. The final 1024×1024 file is produced at build. Uploading your own logo is not available yet.')}</InfoHint></legend>
              <div className="flex flex-wrap gap-2">
                {ICONS.map((ic, i) => (
                  <label key={ic.id} className={cn('cursor-pointer rounded-2xl p-1.5 ring-2 transition-colors has-[:focus-visible]:ring-brand-500', d.iconId === ic.id ? 'ring-brand-600' : 'ring-transparent hover:ring-border')}>
                    <input className="sr-only" type="radio" name="am-icon" checked={d.iconId === ic.id} onChange={() => updDraft((x) => ({ ...x, iconId: ic.id }))} aria-label={tx(`أيقونة ${i + 1}`, `Icon ${i + 1}`)} />
                    <IconArt tile={ic} letter={letter} size={52} />
                  </label>
                ))}
              </div>
            </fieldset>
            <Swatches legend={tx('لون شاشة الافتتاح', 'Splash colour')} name="am-splash" values={SPLASHES} value={d.splash} onChange={(c) => updDraft((x) => ({ ...x, splash: c }))} />
          </div>
        </Card>

        <AccentCard />

        <Card aria-labelledby="am-home" id="am-home" className="scroll-mt-24">
          <CardHeader id="am-home-h" title={tx('الشاشة الرئيسية', 'Home screen')} hint={tx('رتّب الأقسام بالأسهم. تصل كتحديث إعدادات للتطبيقات المثبتة عند فتحها التالي.', 'Order sections with the arrows. Ships as a settings update to installed apps at their next launch.')} action={<ChangeTag kind="config" />} />
          {d.sections.length === 0 ? (
            <p className="border-t border-border px-5 py-6 text-sm text-muted">{tx('لا أقسام بعد. أضف قسمًا يعرض منتجات.', 'No sections yet. Add one that shows products.')}</p>
          ) : (
            <ol className="divide-y divide-border border-t border-border">
              {d.sections.map((sec, i) => (
                <li key={sec.id} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap sm:px-5">
                  <span className="mt-6 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300" aria-hidden="true">{S_ICON[sec.type]}</span>
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted"><span className="tabular-nums">{i + 1}.</span>{label(sec.type)}<InfoHint>{S.sectionHelp[sec.type]}</InfoHint></p>
                    <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {(['ar', 'en'] as const).map((k) => (
                        <Field key={k} className="space-y-1" label={<span className="sr-only">{tx(`عنوان ${label(sec.type)} ${k === 'ar' ? 'بالعربية' : 'بالإنجليزية'}`, `${label(sec.type)} title in ${k === 'ar' ? 'Arabic' : 'English'}`)}</span>}
                          error={!sec.title[k].trim() ? tx('اكتب عنوانًا', 'Enter a title') : null}>
                          {(p) => <Input {...p} className="h-9" dir={k === 'ar' ? 'rtl' : 'ltr'} lang={k} maxLength={TITLE_MAX} placeholder={k === 'ar' ? 'العنوان بالعربية' : 'Title in English'} value={sec.title[k]}
                            onChange={(e) => updDraft((x) => ({ ...x, sections: x.sections.map((y) => (y.id === sec.id ? { ...y, title: { ...y.title, [k]: e.target.value } } : y)) }))} />}
                        </Field>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 sm:mt-5">
                    <IconButton label={S.moveUp(label(sec.type))} disabled={i === 0} className="disabled:opacity-30" onClick={() => move(sec.id, -1, i)}><ArrowUp className="size-4" aria-hidden="true" /></IconButton>
                    <IconButton label={S.moveDown(label(sec.type))} disabled={i === d.sections.length - 1} className="disabled:opacity-30" onClick={() => move(sec.id, 1, i)}><ArrowDown className="size-4" aria-hidden="true" /></IconButton>
                    <IconButton label={S.remove(label(sec.type))} className="hover:text-red-600" onClick={() => remove(sec.id, i)}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="space-y-3 border-t border-border px-5 py-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-fg">{tx('أضف قسمًا', 'Add a section')}<span className="text-xs font-normal text-muted tabular-nums">{d.sections.length}/{MAX_SECTIONS}</span></p>
            <div className="flex flex-wrap gap-2">
              {SECTION_TYPES.map((t) => {
                const ok = canAdd(d.sections, t);
                return <Button key={t} variant="secondary" size="sm" disabled={!ok.ok} title={!ok.ok ? (ok.reason === 'single' ? tx('يُستخدم مرة واحدة', 'Used once only') : tx(`الحد ${MAX_SECTIONS} أقسام`, `Max ${MAX_SECTIONS} sections`)) : undefined} onClick={() => add(t)}><Plus className="size-3.5" aria-hidden="true" />{label(t)}</Button>;
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">{tx('عرض المنتجات', 'Product display')}<ChangeTag kind="config" /></span>
              <Segmented label={tx('عرض المنتجات', 'Product display')} value={d.productLayout} onChange={(v) => updDraft((x) => ({ ...x, productLayout: v }))}
                options={[{ value: 'grid', label: tx('شبكة', 'Grid') }, { value: 'list', label: tx('قائمة', 'List') }]} />
            </div>
          </div>
        </Card>

        <Card aria-labelledby="am-features-h" id="am-features" className="scroll-mt-24">
          <CardHeader id="am-features-h" title={tx('ميزات داخل التطبيق', 'In-app features')} hint={S.featuresHint} action={<ChangeTag kind="binary" />} />
          <ul className="divide-y divide-border border-t border-border">
            {FEATURE_KEYS.map((k) => (
              <li key={k} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1 text-sm font-medium text-fg"><span className="inline-flex items-center gap-1">{S.featureNames[k]}<InfoHint>{S.featureHelp[k]}</InfoHint></span></span>
                {live && live.features[k] !== d.features[k] && <Badge tone="brand">{tx('عُدّل', 'Edited')}</Badge>}
                <Switch checked={d.features[k]} label={S.featureNames[k]} onChange={(v) => updDraft((x) => ({ ...x, features: { ...x.features, [k]: v } }))} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="min-w-0" id="am-preview">
        <PreviewPanel route={route} base="/dashboard/appmaker/design" config={d} />
      </div>
      <Button className="fixed bottom-4 end-4 z-20 shadow-pop lg:hidden" onClick={() => document.getElementById('am-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><Eye className="size-4" aria-hidden="true" />{tx('المعاينة', 'Preview')}</Button>

      {discard && live && (
        <Modal title={tx('تجاهل تعديلات المسودة', 'Discard draft edits')} onClose={() => setDiscard(false)}
          footer={<><Button variant="secondary" onClick={() => setDiscard(false)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => { const prev = s.draft; updDraft(() => live); setDiscard(false); toast({ tone: 'ok', text: tx('عادت المسودة إلى ما لدى العملاء', 'Draft reset to what customers have'), action: { label: tx('تراجع', 'Undo'), run: () => updDraft(() => prev) } }); }}>{tx('تجاهل التعديلات', 'Discard edits')}</Button></>}>
          <p className="text-sm text-fg">{tx('تعود الهوية والألوان والأقسام والميزات إلى ما لدى العملاء الآن. بيانات المتجر لا تتغير.', 'Identity, colours, sections and features return to what customers have now. The store listing does not change.')}</p>
        </Modal>
      )}
    </div>
  );
}

function Swatches({ legend, name, values, value, onChange }: { legend: ReactNode; name: string; values: string[]; value: string; onChange: (v: string) => void }) {
  const tx = useTx();
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-semibold text-fg">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((c) => (
          <label key={c} className={cn('grid size-10 cursor-pointer place-items-center rounded-full ring-2 ring-offset-2 ring-offset-[var(--surface)] has-[:focus-visible]:ring-brand-500', value.toLowerCase() === c.toLowerCase() ? 'ring-brand-600' : 'ring-transparent')}>
            <input className="sr-only" type="radio" name={name} checked={value.toLowerCase() === c.toLowerCase()} onChange={() => onChange(c)} aria-label={tx(`اللون ${c}`, `Colour ${c}`)} />
            <span className="size-8 rounded-full ring-1 ring-black/10" style={{ background: c }} aria-hidden="true" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Accent colour: presets or any hex. Low contrast on white is flagged, since links and buttons use it. */
function AccentCard() {
  const tx = useTx();
  const { s } = useAppData();
  const accent = s.draft.accent;
  const [text, setText] = useState(accent);
  useEffect(() => { setText(accent); }, [accent]);
  const typed = text.trim().startsWith('#') ? text.trim() : `#${text.trim()}`;
  const issue = isHex(typed) ? accentIssue(typed) : 'invalid';
  return (
    <Card aria-labelledby="am-acc">
      <CardHeader id="am-acc" title={tx('لون الأزرار والروابط', 'Button and link colour')} hint={tx('يصل كتحديث إعدادات دون مراجعة المتاجر. الخطوط ثابتة في هذه النسخة.', 'Ships as a settings update without store review. Fonts are fixed in this version.')} action={<ChangeTag kind="config" />} />
      <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
        <Swatches legend={<span className="sr-only">{tx('ألوان جاهزة', 'Presets')}</span>} name="am-accent" values={ACCENTS} value={accent} onChange={(c) => updDraft((x) => ({ ...x, accent: c }))} />
        <Field label={tx('لون مخصص', 'Custom colour')} className="w-40" error={text.trim() && issue === 'invalid' ? tx('مثال: #84603D', 'Example: #84603D') : null}
          hint={issue === 'lowContrast' ? undefined : <bdi dir="ltr">{isHex(typed) ? `${contrast(typed, '#ffffff')}:1` : ''}</bdi>}>
          {(p) => <Input {...p} dir="ltr" value={text} maxLength={7} onChange={(e) => { setText(e.target.value); const v = e.target.value.trim().startsWith('#') ? e.target.value.trim() : `#${e.target.value.trim()}`; if (isHex(v)) appStore.set((x) => ({ ...x, draft: { ...x.draft, accent: v.toLowerCase() } })); }} />}
        </Field>
      </div>
      {issue === 'lowContrast' && <p className="border-t border-border px-5 py-3 text-xs font-medium text-amber-800 dark:text-amber-300" role="status">{tx(`التباين مع الأبيض ${contrast(typed, '#ffffff')}:1، أقل من 4.5:1. قد يصعب قراءة الروابط.`, `Contrast with white is ${contrast(typed, '#ffffff')}:1, below 4.5:1. Links may be hard to read.`)}</p>}
    </Card>
  );
}
