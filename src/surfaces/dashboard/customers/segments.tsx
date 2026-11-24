// Saved segments (`#/dashboard/customers/segments/<id|new>`): rules on spend, orders, last order, city, consent and
// product bought, with a live count and sample before saving. A saved segment becomes a tab in the customer list and
// an audience for broadcasts. Unsaved input is kept for the tab session.
import { useMemo, useState } from 'react';
import { Plus, Trash2, Users, SearchX } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { createStore } from '../../../core/store';
import { link, navigate } from '../../../core/router';
import { customersStore, logAction, ordersStore, segmentsStore } from '../../merchant/stores';
import { SEG_FIELDS, SEG_OPS, type SegField, type SegRule, type SavedSegment } from '../../merchant/workspace';
import { CITIES } from '../../merchant/domain';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, IconButton, InfoHint, LinkButton, Money, useTx } from '../../../ds/ui';
import { Field, Input, Modal, PageHeader, SaveBar, Select, useToast } from '../../../ds/kit';
import { useUnsaved } from '../unsaved';
import { TODAY } from '../marketing/model';
import { customerRows, emptyRule, inSaved, segmentOk, segmentProblems } from './model';

interface Draft { name: string; rules: SegRule[] }
const draftsStore = createStore.key('dashboard.segmentDrafts')<Record<string, Draft>>(() => ({}));
const LIST = link('/dashboard/customers');

export default function SegmentEditor({ id, canManage }: { id: string; canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const saved = segmentsStore.use();
  const drafts = draftsStore.use();
  const customers = customersStore.use();
  const orders = ordersStore.use();
  const isNew = id === 'new';
  const base = saved.find((s) => s.id === id);
  const initial: Draft = base ? { name: base.name[lang], rules: base.rules } : { name: '', rules: [emptyRule()] };
  const d = drafts[id] ?? initial;
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const [tried, setTried] = useState(false);
  const [del, setDel] = useState(false);
  useUnsaved(dirty, { ar: 'تعديلات الشريحة', en: 'Segment edits' });

  const rows = useMemo(() => customerRows(customers, orders), [customers, orders]);
  const p = segmentProblems(d.name, d.rules, saved.filter((s) => s.id !== id).flatMap((s) => [s.name.ar, s.name.en]));
  const ok = segmentOk(p);
  const probe: SavedSegment = { id: 'probe', name: { ar: d.name, en: d.name }, rules: d.rules.filter((_, i) => !p.rules.includes(i)), by: '', at: '' };
  const hits = useMemo(() => inSaved(rows, orders, probe), [rows, orders, JSON.stringify(probe.rules)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isNew && !base) return (
    <Card><EmptyState as="h1" icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا توجد شريحة بهذا المعرف', 'No segment with this id')} action={<LinkButton variant="secondary" href={LIST}>{tx('العملاء', 'Customers')}</LinkButton>} /></Card>
  );

  const set = (x: Partial<Draft>) => draftsStore.set((all) => ({ ...all, [id]: { ...d, ...x } }));
  const setRule = (i: number, r: Partial<SegRule>) => set({ rules: d.rules.map((x, j) => (j === i ? { ...x, ...r } : x)) });
  const discard = () => { draftsStore.set((all) => { const n = { ...all }; delete n[id]; return n; }); setTried(false); };
  const save = () => {
    setTried(true);
    if (!ok) return;
    const name = { ar: d.name.trim(), en: d.name.trim() };
    const nid = base?.id ?? `SG-${Math.max(1, ...saved.map((s) => Number(s.id.replace(/\D/g, '')) || 0)) + 1}`;
    const seg: SavedSegment = { id: nid, name: base ? { ...base.name, [lang]: d.name.trim() } : name, rules: d.rules, by: tx('أنت', 'You'), at: TODAY };
    segmentsStore.set((l) => (base ? l.map((s) => (s.id === nid ? seg : s)) : [...l, seg]));
    logAction('marketing', base ? { ar: `عدّل الشريحة «${d.name.trim()}»`, en: `Edited segment “${d.name.trim()}”` } : { ar: `أنشأ الشريحة «${d.name.trim()}»`, en: `Created segment “${d.name.trim()}”` }, { target: nid, after: `${hits.length}` });
    discard();
    toast({ tone: 'ok', text: tx(`حُفظت الشريحة: ${hits.length} عميلًا الآن`, `Segment saved: ${hits.length} customers now`) });
    navigate(link('/dashboard/customers', { seg: `custom:${nid}` }));
  };
  const remove = () => {
    segmentsStore.set((l) => l.filter((s) => s.id !== id));
    logAction('marketing', { ar: `حذف الشريحة «${base!.name[lang]}»`, en: `Deleted segment “${base!.name[lang]}”` }, { target: id });
    discard();
    navigate(LIST);
  };

  const fieldName = (f: SegField) => ({ spent: tx('الإنفاق (ر.س)', 'Spent (SAR)'), orders: tx('الطلبات المدفوعة', 'Paid orders'), lastDays: tx('أيام منذ آخر طلب', 'Days since last order'), city: tx('المدينة', 'City'), emailConsent: tx('موافقة البريد', 'Email consent'), smsConsent: tx('موافقة الرسائل', 'SMS consent'), product: tx('اشترى منتجًا (رمز SKU)', 'Bought a product (SKU)') })[f];
  const opName = (o: SegRule['op']) => ({ gte: tx('على الأقل', 'at least'), lte: tx('على الأكثر', 'at most'), is: tx('يساوي', 'is') })[o];
  const nameErr = tried && p.name ? (p.name === 'empty' ? tx('اكتب اسمًا', 'Enter a name') : tx('الاسم مستخدم', 'Name already used')) : null;

  return (
    <div className="space-y-6 pb-20">
      <PageHeader back={{ href: LIST, label: tx('العملاء', 'Customers') }} title={isNew ? tx('شريحة جديدة', 'New segment') : base!.name[lang]}
        description={tx('قواعد على سجل الطلبات والموافقات فقط', 'Rules on order history and consent only')}
        actions={!isNew && canManage ? <Button variant="secondary" onClick={() => setDel(true)}><Trash2 className="size-4" aria-hidden="true" />{tx('احذف', 'Delete')}</Button> : undefined} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <fieldset disabled={!canManage} className="min-w-0 space-y-6 lg:col-span-2">
          <Card aria-labelledby="h-sname">
            <CardHeader id="h-sname" title={tx('الاسم', 'Name')} />
            <div className="px-5 pb-5"><Field label={tx('اسم الشريحة', 'Segment name')} error={nameErr}>{(f) => <Input {...f} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder={tx('مثال: عملاء الرياض الموافقون', 'e.g. Consenting Riyadh customers')} />}</Field></div>
          </Card>
          <Card aria-labelledby="h-rules">
            <CardHeader id="h-rules" title={tx('القواعد', 'Rules')} hint={tx('يجب أن تتحقق كل القواعد. الإنفاق بعد الاستردادات المؤكدة.', 'Every rule must hold. Spend is after confirmed refunds.')} />
            <ul className="space-y-3 px-5 pb-4">
              {d.rules.map((r, i) => {
                const bad = tried && p.rules.includes(i);
                return (
                  <li key={i} className="grid grid-cols-1 items-end gap-3 rounded-xl bg-surface-2/60 p-3 sm:grid-cols-[1fr_9rem_1fr_auto]">
                    <Field label={tx('الحقل', 'Field')}>{(f) => <Select {...f} value={r.field} onChange={(e) => { const field = e.target.value as SegField; setRule(i, { field, op: SEG_OPS[field][0], value: field === 'emailConsent' || field === 'smsConsent' ? 'yes' : field === 'city' ? 'Riyadh' : '' }); }}>{SEG_FIELDS.map((x) => <option key={x} value={x}>{fieldName(x)}</option>)}</Select>}</Field>
                    <Field label={tx('الشرط', 'Condition')}>{(f) => <Select {...f} value={r.op} onChange={(e) => setRule(i, { op: e.target.value as SegRule['op'] })}>{SEG_OPS[r.field].map((o) => <option key={o} value={o}>{opName(o)}</option>)}</Select>}</Field>
                    <Field label={tx('القيمة', 'Value')} error={bad ? tx('قيمة غير صالحة', 'Invalid value') : null}>
                      {(f) => r.field === 'city' ? <Select {...f} value={r.value} onChange={(e) => setRule(i, { value: e.target.value })}>{CITIES.map((c) => <option key={c.en} value={c.en}>{c[lang]}</option>)}</Select>
                        : r.field === 'emailConsent' || r.field === 'smsConsent' ? <Select {...f} value={r.value} onChange={(e) => setRule(i, { value: e.target.value })}><option value="yes">{tx('نعم', 'Yes')}</option><option value="no">{tx('لا', 'No')}</option></Select>
                          : <Input {...f} dir="ltr" inputMode={r.field === 'product' ? 'text' : 'numeric'} value={r.value} placeholder={r.field === 'product' ? 'OUD-' : '0'} onChange={(e) => setRule(i, { value: r.field === 'product' ? e.target.value.toUpperCase() : e.target.value })} />}
                    </Field>
                    <IconButton label={tx('احذف القاعدة', 'Remove rule')} onClick={() => set({ rules: d.rules.filter((_, j) => j !== i) })}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
                  </li>
                );
              })}
            </ul>
            <div className="px-5 pb-5">
              <Button variant="secondary" size="sm" disabled={d.rules.length >= 6} onClick={() => set({ rules: [...d.rules, emptyRule()] })}><Plus className="size-3.5" aria-hidden="true" />{tx('أضف قاعدة', 'Add rule')}</Button>
              {tried && p.none && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{tx('أضف قاعدة واحدة على الأقل', 'Add at least one rule')}</p>}
            </div>
          </Card>
        </fieldset>

        <Card aria-labelledby="h-count" className="lg:sticky lg:top-24 lg:self-start">
          <CardHeader id="h-count" title={tx('من يطابق الآن', 'Who matches now')} hint={tx('العدد يُحسب مباشرة من العملاء والطلبات الحالية، ويتغير معها بعد الحفظ.', 'Counted live from current customers and orders, and keeps updating after saving.')} />
          <div className="space-y-4 px-5 pb-5">
            <div className="flex items-baseline gap-2"><Users className="size-5 self-center text-brand-600" aria-hidden="true" /><span className="text-3xl font-bold tabular-nums text-fg">{hits.length}</span><span className="text-sm text-muted">{tx(`من ${rows.length} عميلًا`, `of ${rows.length} customers`)}</span></div>
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              <span>{tx('موافقة البريد', 'Email consent')}: <b className="tabular-nums text-fg">{hits.filter((h) => h.c.consent.email).length}</b></span>
              <span>{tx('موافقة الرسائل', 'SMS consent')}: <b className="tabular-nums text-fg">{hits.filter((h) => h.c.consent.sms).length}</b></span>
            </p>
            {hits.length === 0 ? <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">{tx('لا أحد يطابق هذه القواعد', 'Nobody matches these rules')}</p> : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {hits.slice(0, 5).map((h) => <li key={h.c.id} className="flex items-center gap-2.5 px-3 py-2"><Avatar name={h.c.name[lang]} /><span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{h.c.name[lang]}</span><Money v={h.spent} className="text-xs text-muted" /></li>)}
                {hits.length > 5 && <li className="px-3 py-2 text-xs text-muted">{tx(`و${hits.length - 5} آخرين`, `and ${hits.length - 5} more`)}</li>}
              </ul>
            )}
            <p className="flex items-center gap-1 text-xs text-muted"><Badge tone="gray">{tx('برو', 'Pro')}</Badge>{tx('تُستخدم جمهورًا للرسائل الجماعية', 'Usable as a broadcast audience')}<InfoHint>{tx('استهداف الشرائح في الحملات من باقة برو. هذا حد في الباقة وليس صلاحية.', 'Targeting segments in campaigns needs the Pro plan. A plan limit, not a permission.')}</InfoHint></p>
          </div>
        </Card>
      </div>
      {canManage && <SaveBar dirty={dirty || isNew} onSave={save} onDiscard={isNew ? () => { discard(); navigate(LIST); } : discard} saveLabel={tx('احفظ الشريحة', 'Save segment')}
        error={tried && !ok ? tx('صحّح الحقول قبل الحفظ', 'Fix the fields before saving') : undefined} />}
      {del && base && (
        <Modal title={tx(`حذف «${base.name[lang]}»`, `Delete “${base.name[lang]}”`)} onClose={() => setDel(false)}
          footer={<><Button variant="secondary" onClick={() => setDel(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={remove}><Trash2 className="size-4" aria-hidden="true" />{tx('احذف', 'Delete')}</Button></>}>
          <ul className="space-y-1.5 text-sm text-fg"><li>{tx('لا يُحذف أي عميل؛ تُحذف القاعدة فقط.', 'No customer is deleted; only the rule.')}</li><li>{tx('الحملات المرسلة لها تبقى في السجل.', 'Campaigns already sent to it stay in the history.')}</li></ul>
        </Modal>
      )}
    </div>
  );
}
