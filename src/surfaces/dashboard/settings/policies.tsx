// Policies: returns, shipping, privacy and terms, each in the store's languages, as a draft and a live text.
// The online store shows the live text in the shopper's language (`#/store/page/<id>`); a draft never reaches it.
import { useEffect, useState } from 'react';
import { ExternalLink, Send } from 'lucide-react';
import { link, useRoute } from '../../../core/router';
import { logAction, settingsStore } from '../../merchant/stores';
import { normPolicy, type Policy, type PolicyId } from '../../merchant/workspace';
import type { L } from '../../../core/lang';
import { Badge, Button, InfoHint, useTx, type Tone } from '../../../ds/ui';
import { Alert, Field, Modal, SaveBar, Tabs, Textarea } from '../../../ds/kit';
import { useDashState } from '../review';
import { POLICY_IDS, POLICY_MIN, canPublish, policyHasDraft, policyMissingLangs, same, savePolicy } from './model';
import { LeaveGuard, Section, settingsHref, useSave } from './common';
import { useSessionDraft } from './drafts';

const NAME: Record<PolicyId, [string, string]> = { returns: ['الاسترجاع', 'Returns'], shipping: ['الشحن', 'Shipping'], privacy: ['الخصوصية', 'Privacy'], terms: ['الشروط والأحكام', 'Terms'] };
const TONE: Record<Policy['state'], Tone> = { published: 'green', draft: 'amber', missing: 'gray' };
const LANG_NAME = { ar: ['العربية', 'Arabic'], en: ['الإنجليزية', 'English'] } as const;

export default function PoliciesPage() {
  const tx = useTx();
  const route = useRoute();
  const empty = useDashState() === 'empty';
  const s = settingsStore.use();
  const stored = s.policies.map(normPolicy);
  const list: Policy[] = empty ? stored.map((p) => ({ ...p, text: { ar: '', en: '' }, live: null, state: 'missing' })) : stored;
  const q = route.query.get('p');
  const id: PolicyId = POLICY_IDS.includes(q as PolicyId) ? (q as PolicyId) : 'returns';
  const p = list.find((x) => x.id === id)!;
  const state = (s: Policy['state']) => ({ published: tx('منشورة', 'Published'), draft: tx('مسودة', 'Draft'), missing: tx('غير مكتوبة', 'Not written') })[s];
  return (
    <>
      <Alert tone="info">{tx('النص من كتابتك؛ «لك» لا تقدّم استشارة قانونية.', 'The text is yours; LAK does not give legal advice.')}</Alert>
      <Tabs label={tx('السياسات', 'Policies')} items={list.map((x) => ({
        href: settingsHref('policies', { p: x.id }), current: x.id === id,
        label: <span className="flex items-center gap-2">{tx(...NAME[x.id])}<span className={`size-1.5 rounded-full ${x.state === 'published' ? 'bg-emerald-500' : x.state === 'draft' ? 'bg-amber-500' : 'bg-subtle'}`} aria-label={state(x.state)} role="img" /></span>,
      }))} />
      <Editor key={`${p.id}-${empty}`} p={p} langs={s.storeLangs} name={tx(...NAME[p.id])}
        badge={<><Badge tone={TONE[p.state]}>{state(p.state)}</Badge>{p.state === 'published' && policyHasDraft(p) && <Badge tone="brand">{tx('تعديلات غير منشورة', 'Unpublished edits')}</Badge>}</>} />
    </>
  );
}

function Editor({ p, name, badge, langs }: { p: Policy; name: string; badge: React.ReactNode; langs: { ar: boolean; en: boolean } }) {
  const tx = useTx();
  const [text, setText, clearDraft] = useSessionDraft<L>(`policy:${p.id}`, p.text);
  const [publishing, setPublishing] = useState(false);
  const [tried, setTried] = useState(false);
  const { saving, error, save, clearError } = useSave();
  useEffect(() => { if (!publishing) clearError(); }, [publishing]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !same(text, p.text);
  const missing = policyMissingLangs(text, langs);
  const ready = canPublish(text, langs);
  const shown = (['ar', 'en'] as const).filter((l) => langs[l]);
  const liveSame = !!p.live && same(text, p.live);
  const commit = (publish: boolean) => {
    settingsStore.set((x) => ({ ...x, policies: savePolicy(x.policies, p.id, text, publish) }));
    clearDraft();
    logAction('settings', publish ? { ar: `نشر سياسة ${NAME[p.id][0]}`, en: `Published the ${NAME[p.id][1].toLowerCase()} policy` } : { ar: `حفظ مسودة سياسة ${NAME[p.id][0]}`, en: `Saved a draft of the ${NAME[p.id][1].toLowerCase()} policy` }, { target: p.id });
  };
  return (
    <Section id="po-h" title={<>{tx(`سياسة ${name}`, `${name} policy`)}{badge}</>}
      hint={<InfoHint>{tx('المنشورة تظهر للعميل بلغته في صفحة السياسة بالمتجر وتنطبق على الطلبات الجديدة. حفظ مسودة لا يغيّر المنشور.', 'The published text shows in the shopper’s language on the store’s policy page and applies to new orders. Saving a draft doesn’t change what is published.')}</InfoHint>}
      action={<Button size="sm" disabled={liveSame} onClick={() => { setTried(true); if (ready) setPublishing(true); }}><Send className="size-4" aria-hidden="true" />{tx('انشر', 'Publish')}</Button>}>
      <LeaveGuard dirty={dirty} />
      <div className="grid gap-4 md:grid-cols-2">
        {shown.map((l) => {
          const n = text[l].trim().length;
          const short = n < POLICY_MIN;
          return (
            <Field key={l} label={tx(`النص · ${LANG_NAME[l][0]}`, `Text · ${LANG_NAME[l][1]}`)} error={tried && missing.includes(l) ? tx(`اكتب ${POLICY_MIN} حرفًا على الأقل`, `Write at least ${POLICY_MIN} characters`) : null}
              hint={<span className="tabular-nums">{short ? tx(`${n}/${POLICY_MIN} للنشر`, `${n}/${POLICY_MIN} to publish`) : tx(`${n} حرفًا`, `${n} characters`)}</span>}>
              {(f) => <Textarea {...f} rows={8} dir={l === 'ar' ? 'rtl' : 'ltr'} lang={l} value={text[l]} onChange={(e) => { setText({ ...text, [l]: e.target.value }); clearError(); }}
                placeholder={l === 'ar' ? 'اكتب السياسة كما ستظهر للعملاء' : 'Write the policy as shoppers will see it'} />}
            </Field>
          );
        })}
      </div>
      {p.live && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          {liveSame ? tx('المسودة مطابقة للمنشور.', 'The draft matches what is live.') : tx('العملاء يرون النص المنشور السابق حتى تنشر.', 'Shoppers see the previously published text until you publish.')}
          <a href={link(`/store/page/${p.id}`)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('افتح في المتجر', 'Open in store')}<ExternalLink className="size-3.5" aria-hidden="true" /></a>
        </p>
      )}
      <SaveBar dirty={dirty} saving={saving} error={error} saveLabel={tx('احفظ كمسودة', 'Save draft')} onDiscard={() => { setText(p.text); clearDraft(); clearError(); setTried(false); }}
        onSave={() => save(() => commit(false), tx('حُفظت المسودة؛ المنشور لم يتغير', 'Draft saved; the published text is unchanged'))} />
      {publishing && (
        <Modal size="lg" title={tx(`نشر سياسة ${name}`, `Publish ${name} policy`)} onClose={() => setPublishing(false)}
          description={tx('تظهر للعملاء فورًا في صفحة السياسة بالمتجر بلغة كل عميل، وتنطبق على الطلبات الجديدة فقط.', 'Shoppers see it immediately on the store’s policy page in their language; it applies to new orders only.')}
          footer={<><Button variant="secondary" onClick={() => setPublishing(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { setPublishing(false); save(() => commit(true), tx('نُشرت السياسة في المتجر', 'Policy published to the store')); }}>{tx('انشر في المتجر', 'Publish to store')}</Button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {shown.map((l) => (
              <figure key={l} className="min-w-0">
                <figcaption className="mb-1 text-xs font-semibold text-muted">{tx(`ما يراه عميل ${LANG_NAME[l][0]}`, `What a shopper in ${LANG_NAME[l][1]} sees`)}</figcaption>
                <blockquote dir={l === 'ar' ? 'rtl' : 'ltr'} lang={l} className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm text-fg">{text[l].trim()}</blockquote>
              </figure>
            ))}
          </div>
        </Modal>
      )}
    </Section>
  );
}
