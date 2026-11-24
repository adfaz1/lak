// Policies: returns, shipping, privacy and terms, each as a draft or published text.
import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { useRoute } from '../../../core/router';
import { settingsStore } from '../../merchant/stores';
import type { Policy, PolicyId } from '../../merchant/workspace';
import { Badge, Button, InfoHint, useTx, type Tone } from '../../../ds/ui';
import { Alert, Field, Modal, SaveBar, Tabs, Textarea } from '../../../ds/kit';
import { useDashState } from '../review';
import { POLICY_IDS, POLICY_MIN, canPublish, savePolicy } from './model';
import { LeaveGuard, Section, settingsHref, useSave } from './common';

const NAME: Record<PolicyId, [string, string]> = { returns: ['الاسترجاع', 'Returns'], shipping: ['الشحن', 'Shipping'], privacy: ['الخصوصية', 'Privacy'], terms: ['الشروط والأحكام', 'Terms'] };
const TONE: Record<Policy['state'], Tone> = { published: 'green', draft: 'amber', missing: 'gray' };

export default function PoliciesPage() {
  const tx = useTx();
  const route = useRoute();
  const empty = useDashState() === 'empty';
  const stored = settingsStore.use().policies;
  const list: Policy[] = empty ? stored.map((p) => ({ ...p, text: '', state: 'missing' })) : stored;
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
      <Editor key={`${p.id}-${empty}`} p={p} name={tx(...NAME[p.id])} badge={<Badge tone={TONE[p.state]}>{state(p.state)}</Badge>} />
    </>
  );
}

function Editor({ p, name, badge }: { p: Policy; name: string; badge: React.ReactNode }) {
  const tx = useTx();
  const [text, setText] = useState(p.text);
  const [publishing, setPublishing] = useState(false);
  const { saving, error, save, clearError } = useSave();
  useEffect(() => setText(p.text), [p.text]);
  const dirty = text !== p.text;
  const ready = canPublish(text);
  const commit = (publish: boolean) => settingsStore.set((x) => ({ ...x, policies: savePolicy(x.policies, p.id, text, publish) }));
  return (
    <Section id="po-h" title={<>{tx(`سياسة ${name}`, `${name} policy`)}{badge}</>}
      hint={<InfoHint>{tx('المنشورة تظهر في تذييل المتجر وصفحة الدفع وتنطبق على الطلبات الجديدة. حفظ مسودة لا يغيّر المنشور.', 'Published text appears in the store footer and checkout and applies to new orders. Saving a draft doesn’t change what is published.')}</InfoHint>}
      action={<Button size="sm" disabled={!ready || (p.state === 'published' && !dirty)} onClick={() => setPublishing(true)}><Send className="size-4" aria-hidden="true" />{tx('انشر', 'Publish')}</Button>}>
      <LeaveGuard dirty={dirty} />
      <Field label={tx('النص', 'Text')} hint={<span className="tabular-nums">{ready ? tx(`${text.trim().length} حرفًا`, `${text.trim().length} characters`) : tx(`اكتب ${POLICY_MIN} حرفًا على الأقل للنشر`, `Write at least ${POLICY_MIN} characters to publish`)}</span>}>
        {(f) => <Textarea {...f} rows={8} value={text} onChange={(e) => { setText(e.target.value); clearError(); }} placeholder={tx('اكتب السياسة كما ستظهر للعملاء', 'Write the policy as shoppers will see it')} />}
      </Field>
      <SaveBar dirty={dirty} saving={saving} error={error} saveLabel={tx('احفظ كمسودة', 'Save draft')} onDiscard={() => { setText(p.text); clearError(); }}
        onSave={() => save(() => commit(false), tx('حُفظت المسودة؛ المنشور لم يتغير', 'Draft saved; the published text is unchanged'))} />
      {publishing && (
        <Modal title={tx(`نشر سياسة ${name}`, `Publish ${name} policy`)} onClose={() => setPublishing(false)}
          description={tx('تظهر للعملاء فورًا في تذييل المتجر وصفحة الدفع، وتنطبق على الطلبات الجديدة فقط.', 'Shoppers see it immediately in the store footer and checkout; it applies to new orders only.')}
          footer={<><Button variant="secondary" onClick={() => setPublishing(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { setPublishing(false); save(() => commit(true), tx('نُشرت السياسة', 'Policy published')); }}>{tx('انشر في المتجر', 'Publish to store')}</Button></>}>
          <blockquote className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm text-fg">{text.trim()}</blockquote>
        </Modal>
      )}
    </Section>
  );
}
