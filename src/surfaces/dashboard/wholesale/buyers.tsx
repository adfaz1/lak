// Wholesale buyers (`#/dashboard/wholesale`, `?status=&q=`): business accounts with CR and VAT checked, approval with
// a reason to reject, customer group and payment terms per buyer. `/apply` previews the form buyers fill (simulated:
// the storefront does not host it yet) and its submission lands here as a pending application.
import { useState, type InputHTMLAttributes } from 'react';
import { Building2, CheckCircle2, SearchX, UserPlus, XCircle } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { logAction, currentActor } from '../../merchant/stores';
import { cleanBuyer, decideBuyer, nextBuyerId, TERMS, validateBuyer, type Buyer, type BuyerError, type BuyerField, type BuyerStatus, type TermsId } from '../../merchant/wholesale';
import { Badge, Button, Card, EmptyState, LinkButton, Ref, useTx, type Tone } from '../../../ds/ui';
import { Alert, DataTable, Drawer, Field, Input, Modal, SearchInput, Select, Simulated, Tabs, Textarea, useToast } from '../../../ds/kit';
import { useUnsaved } from '../unsaved';
import { setWs, wsStore } from './state';
import { Row } from '../pos/parts';

export const STATUS_TONE: Record<BuyerStatus, Tone> = { pending: 'amber', approved: 'green', rejected: 'red', suspended: 'gray' };
export function useWsLabels() {
  const tx = useTx();
  return {
    status: (s: BuyerStatus) => ({ pending: tx('بانتظار الموافقة', 'Awaiting approval'), approved: tx('معتمد', 'Approved'), rejected: tx('مرفوض', 'Rejected'), suspended: tx('موقوف', 'Suspended') })[s],
    terms: (t: TermsId) => ({ prepaid: tx('دفع مسبق قبل الشحن', 'Prepaid before shipping'), net15: tx('آجل 15 يومًا', 'Net 15 days'), net30: tx('آجل 30 يومًا', 'Net 30 days'), net60: tx('آجل 60 يومًا', 'Net 60 days') })[t],
    err: (e: BuyerError | undefined, f: BuyerField) => e && ({
      required: tx('مطلوب', 'Required'),
      format: f === 'cr' ? tx('السجل التجاري 10 أرقام', 'CR is 10 digits') : f === 'vat' ? tx('الرقم الضريبي 15 رقمًا', 'VAT number is 15 digits') : f === 'phone' ? tx('جوال سعودي: 05xxxxxxxx', 'Saudi mobile: 05xxxxxxxx') : tx('بريد غير صحيح', 'Invalid email'),
      pattern: tx('يبدأ وينتهي بالرقم 3', 'Starts and ends with 3'),
      taken: tx('مسجّل لحساب آخر', 'Already on another account'),
    })[e],
  };
}

const EMPTY = { company: '', cr: '', vat: '', contact: '', phone: '', email: '', city: '', address: '' };
type Form = typeof EMPTY;

/** The buyer form, shared by «add buyer» and the application preview. */
function BuyerFields({ f, set, errors }: { f: Form; set: (f: Form) => void; errors: Partial<Record<BuyerField, BuyerError>> }) {
  const tx = useTx();
  const L = useWsLabels();
  const fields: [BuyerField, string, string, Partial<InputHTMLAttributes<HTMLInputElement>>?][] = [
    ['company', tx('اسم المنشأة', 'Company name'), ''], ['cr', tx('السجل التجاري', 'Commercial registration'), '', { inputMode: 'numeric', dir: 'ltr' }],
    ['vat', tx('الرقم الضريبي', 'VAT number'), '', { inputMode: 'numeric', dir: 'ltr' }], ['contact', tx('اسم المسؤول', 'Contact person'), ''],
    ['phone', tx('الجوال', 'Mobile'), '', { inputMode: 'tel', dir: 'ltr' }], ['email', tx('البريد', 'Email'), '', { inputMode: 'email', dir: 'ltr' }],
    ['city', tx('المدينة', 'City'), ''], ['address', tx('العنوان الوطني', 'National address'), ''],
  ];
  return <div className="grid gap-4 sm:grid-cols-2">{fields.map(([k, label, , extra]) => <Field key={k} label={label} error={L.err(errors[k], k)}>{(p) => <Input {...p} {...extra} value={f[k]} onChange={(e) => set({ ...f, [k]: e.target.value })} />}</Field>)}</div>;
}

export function Buyers({ route, canManage }: { route: Route; canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const L = useWsLabels();
  const toast = useToast();
  const s = wsStore.use();
  const status = (route.query.get('status') ?? 'all') as BuyerStatus | 'all';
  const q = route.query.get('q') ?? '';
  const open = route.query.get('b');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<Form>(EMPTY);
  const [tried, setTried] = useState(false);
  const [decide, setDecide] = useState<'rejected' | 'suspended' | null>(null);
  const [note, setNote] = useState('');
  useUnsaved(adding && Object.values(f).some((v) => v.trim()), { ar: 'حساب مشترٍ جديد', en: 'New buyer account' });
  const go = (patch: Record<string, string | undefined>) => replace(link('/dashboard/wholesale', { status: status === 'all' ? undefined : status, q: q || undefined, b: open ?? undefined, ...patch }));
  const errors = tried ? validateBuyer(f, s.buyers) : {};
  const rows = s.buyers.filter((b) => (status === 'all' || b.status === status) && (!q.trim() || [b.company, b.cr, b.vat, b.contact].some((x) => x.toLowerCase().includes(q.trim().toLowerCase()))));
  const counts = { all: s.buyers.length, pending: s.buyers.filter((b) => b.status === 'pending').length, approved: s.buyers.filter((b) => b.status === 'approved').length, suspended: s.buyers.filter((b) => b.status === 'suspended').length, rejected: s.buyers.filter((b) => b.status === 'rejected').length };
  const buyer = s.buyers.find((b) => b.id === open);

  const add = () => {
    setTried(true);
    if (Object.keys(validateBuyer(f, s.buyers)).length) return;
    const id = nextBuyerId(s.buyers);
    const b: Buyer = { ...cleanBuyer(f), id, group: s.groups[0]?.id ?? '', status: 'approved', terms: s.settings.terms[0] ?? 'prepaid', source: 'merchant', at: Date.now(), decided: { by: currentActor().name, at: Date.now(), note: tx('أضافه التاجر', 'Added by the merchant') } };
    setWs((x) => ({ buyers: [b, ...x.buyers] }));
    logAction('store', { ar: `أضاف مشتري جملة ${b.company}`, en: `Added wholesale buyer ${b.company}` }, { target: id });
    toast({ tone: 'ok', text: tx('أُضيف المشتري ومُعتمد', 'Buyer added and approved') });
    setAdding(false); setF(EMPTY); setTried(false);
  };
  const apply = (to: 'approved' | 'rejected' | 'suspended') => {
    if (!buyer) return;
    const next = decideBuyer(buyer, to, currentActor().name, note, Date.now());
    if (!next) return setTried(true);
    setWs((x) => ({ buyers: x.buyers.map((b) => (b.id === buyer.id ? next : b)) }));
    logAction('store', { ar: `${L.status(to)}: ${buyer.company}${note.trim() ? ` (${note.trim()})` : ''}`, en: `${({ approved: 'Approved', rejected: 'Rejected', suspended: 'Suspended' })[to]} buyer ${buyer.company}${note.trim() ? ` (${note.trim()})` : ''}` }, { target: buyer.id, before: buyer.status, after: to });
    toast({ tone: 'ok', text: tx(`${L.status(to)} · أُبلغ المشتري بالبريد (محاكاة)`, `${({ approved: 'Approved', rejected: 'Rejected', suspended: 'Suspended' })[to]} · buyer emailed (simulated)`) });
    setDecide(null); setNote(''); setTried(false);
  };
  const update = (patch: Partial<Buyer>, what: string) => {
    if (!buyer) return;
    setWs((x) => ({ buyers: x.buyers.map((b) => (b.id === buyer.id ? { ...b, ...patch } : b)) }));
    logAction('store', { ar: `عدّل ${what} لـ ${buyer.company}`, en: `Changed ${what} for ${buyer.company}` }, { target: buyer.id });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={(v) => go({ q: v || undefined })} placeholder={tx('المنشأة أو السجل أو الرقم الضريبي', 'Company, CR or VAT number')} />
        <div className="ms-auto flex gap-2">
          <LinkButton variant="secondary" href={link('/dashboard/wholesale/apply')}>{tx('نموذج طلب الحساب', 'Application form')}</LinkButton>
          {canManage && <Button onClick={() => setAdding(true)}><UserPlus className="size-4" aria-hidden="true" />{tx('أضف مشتريًا', 'Add buyer')}</Button>}
        </div>
      </div>
      <Tabs label={tx('حالة المشترين', 'Buyer status')} items={(['all', 'pending', 'approved', 'suspended', 'rejected'] as const).map((x) => ({ href: link('/dashboard/wholesale', { status: x === 'all' ? undefined : x, q: q || undefined }), current: status === x, count: counts[x], label: x === 'all' ? tx('الكل', 'All') : L.status(x) }))} />
      <Card>
        {s.buyers.length === 0 ? (
          <EmptyState as="h2" icon={<Building2 className="size-6" aria-hidden="true" />} title={tx('لا مشترين جملة بعد', 'No wholesale buyers yet')}
            action={<>{canManage && <Button onClick={() => setAdding(true)}>{tx('أضف مشتريًا', 'Add buyer')}</Button>}<LinkButton variant="secondary" href={link('/dashboard/wholesale/apply')}>{tx('جرّب نموذج الطلب', 'Try the application form')}</LinkButton></>}>
            {tx('المنشآت تطلب حسابًا بسجلها ورقمها الضريبي، وتعتمدها قبل أن ترى أسعار الجملة.', 'Businesses apply with their CR and VAT number; you approve them before they see wholesale prices.')}
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا نتائج', 'No results')} action={<Button variant="secondary" onClick={() => replace(link('/dashboard/wholesale'))}>{tx('امسح التصفية', 'Clear filters')}</Button>} />
        ) : (
          <DataTable label={tx('مشترو الجملة', 'Wholesale buyers')} rows={rows} rowKey={(b) => b.id} href={(b) => link('/dashboard/wholesale', { status: status === 'all' ? undefined : status, q: q || undefined, b: b.id })}
            columns={[
              { key: 'c', header: tx('المنشأة', 'Company'), cell: (b) => b.company },
              { key: 'cr', header: tx('السجل', 'CR'), cell: (b) => <Ref>{b.cr}</Ref>, hideBelow: 'md' },
              { key: 'vat', header: tx('الرقم الضريبي', 'VAT'), cell: (b) => <Ref>{b.vat}</Ref>, hideBelow: 'lg' },
              { key: 'g', header: tx('المجموعة', 'Group'), cell: (b) => s.groups.find((g) => g.id === b.group)?.name[lang] ?? '—', hideBelow: 'md' },
              { key: 'st', header: tx('الحالة', 'Status'), cell: (b) => <Badge tone={STATUS_TONE[b.status]}>{L.status(b.status)}</Badge> },
            ]}
            card={(b) => <div className="flex items-center justify-between gap-3 text-sm"><div className="min-w-0"><p className="font-semibold text-fg">{b.company}</p><p className="text-xs text-muted"><Ref>{b.vat}</Ref></p></div><Badge tone={STATUS_TONE[b.status]}>{L.status(b.status)}</Badge></div>} />
        )}
      </Card>

      {adding && (
        <Modal size="lg" title={tx('مشترٍ جديد', 'New buyer')} description={tx('تضيفه بنفسك فيُعتمد مباشرة.', 'Added by you, so it is approved at once.')} onClose={() => setAdding(false)}
          footer={<><Button variant="secondary" onClick={() => setAdding(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={add}>{tx('أضف المشتري', 'Add buyer')}</Button></>}>
          <BuyerFields f={f} set={setF} errors={errors} />
        </Modal>
      )}
      {buyer && (
        <Drawer title={buyer.company} onClose={() => go({ b: undefined })}
          footer={canManage ? <>
            {buyer.status !== 'approved' && buyer.status !== 'rejected' && <Button className="flex-1" onClick={() => apply('approved')}><CheckCircle2 className="size-4" aria-hidden="true" />{buyer.status === 'suspended' ? tx('أعد التفعيل', 'Reactivate') : tx('اعتمد', 'Approve')}</Button>}
            {buyer.status === 'pending' && <Button variant="secondary" onClick={() => setDecide('rejected')}><XCircle className="size-4" aria-hidden="true" />{tx('ارفض', 'Reject')}</Button>}
            {buyer.status === 'approved' && <Button variant="secondary" onClick={() => setDecide('suspended')}>{tx('أوقف الحساب', 'Suspend')}</Button>}
          </> : undefined}>
          <Badge tone={STATUS_TONE[buyer.status]}>{L.status(buyer.status)}</Badge>
          <div className="divide-y divide-border">
            <Row label={tx('السجل التجاري', 'CR')}><Ref>{buyer.cr}</Ref></Row>
            <Row label={tx('الرقم الضريبي', 'VAT number')}><Ref>{buyer.vat}</Ref></Row>
            <Row label={tx('المسؤول', 'Contact')}>{buyer.contact}</Row>
            <Row label={tx('الجوال', 'Mobile')}><Ref>{buyer.phone}</Ref></Row>
            <Row label={tx('البريد', 'Email')}><Ref>{buyer.email}</Ref></Row>
            <Row label={tx('العنوان', 'Address')}>{buyer.address}، {buyer.city}</Row>
            <Row label={tx('المصدر', 'Source')}>{buyer.source === 'form' ? tx('نموذج الطلب', 'Application form') : tx('أضافه التاجر', 'Added by merchant')}</Row>
            {buyer.decided && <Row label={tx('آخر قرار', 'Last decision')}>{buyer.decided.by}{buyer.decided.note && ` · ${buyer.decided.note}`}</Row>}
          </div>
          <Field label={tx('مجموعة الأسعار', 'Price group')}>{(p) => <Select {...p} disabled={!canManage} value={buyer.group} onChange={(e) => update({ group: e.target.value }, tx('المجموعة', 'group'))}>{s.groups.map((g) => <option key={g.id} value={g.id}>{g.name[lang]}</option>)}</Select>}</Field>
          <Field label={tx('شروط الدفع', 'Payment terms')} hint={tx('من الشروط التي تتيحها في الإعدادات', 'From the terms you offer in settings')}>{(p) => <Select {...p} disabled={!canManage} value={buyer.terms} onChange={(e) => update({ terms: e.target.value as TermsId }, tx('شروط الدفع', 'payment terms'))}>{TERMS.filter((t) => s.settings.terms.includes(t) || t === buyer.terms).map((t) => <option key={t} value={t}>{L.terms(t)}</option>)}</Select>}</Field>
        </Drawer>
      )}
      {decide && buyer && (
        <Modal title={decide === 'rejected' ? tx(`رفض ${buyer.company}`, `Reject ${buyer.company}`) : tx(`إيقاف ${buyer.company}`, `Suspend ${buyer.company}`)} description={decide === 'rejected' ? tx('يصل السبب للمشتري بالبريد.', 'The buyer receives the reason by email.') : tx('لن يرى أسعار الجملة ولا يطلب عرضًا حتى تعيد تفعيله. الطلبات القائمة لا تتغير.', 'They lose wholesale prices and quotes until reactivated. Existing orders are unchanged.')} onClose={() => setDecide(null)}
          footer={<><Button variant="secondary" onClick={() => setDecide(null)}>{tx('رجوع', 'Back')}</Button><Button variant="danger" onClick={() => apply(decide)}>{decide === 'rejected' ? tx('ارفض الطلب', 'Reject application') : tx('أوقف الحساب', 'Suspend account')}</Button></>}>
          <Field label={tx('السبب', 'Reason')} optional={decide === 'suspended'} error={tried && decide === 'rejected' && !note.trim() ? tx('السبب مطلوب للرفض', 'A reason is required to reject') : null}>{(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('البريد للمشتري محاكاة.', 'The email to the buyer is simulated.')}</p>
        </Modal>
      )}
    </div>
  );
}

/** What a business buyer fills to ask for a wholesale account. Submitting creates a pending application. */
export function ApplyPreview() {
  const tx = useTx();
  const toast = useToast();
  const s = wsStore.use();
  const [f, setF] = useState<Form>(EMPTY);
  const [tried, setTried] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  useUnsaved(Object.values(f).some((v) => v.trim()) && !sent, { ar: 'نموذج طلب حساب جملة', en: 'Wholesale application form' });
  const errors = tried ? validateBuyer(f, s.buyers) : {};
  const submit = () => {
    setTried(true);
    if (Object.keys(validateBuyer(f, s.buyers)).length) return;
    const id = nextBuyerId(s.buyers);
    setWs((x) => ({ buyers: [{ ...cleanBuyer(f), id, group: x.groups[0]?.id ?? '', status: x.settings.approval ? 'pending' : 'approved', terms: x.settings.terms[0] ?? 'prepaid', source: 'form', at: Date.now() }, ...x.buyers] }));
    logAction('store', { ar: `طلب حساب جملة جديد: ${f.company}`, en: `New wholesale application: ${f.company}` }, { target: id });
    toast({ tone: 'ok', text: tx('وصل الطلب للتاجر', 'Application received') });
    setSent(id); setF(EMPTY); setTried(false);
  };
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Alert tone="info" title={tx('هذا ما يراه المشتري', 'This is what the buyer sees')}>{tx('النموذج لا يُستضاف في متجرك بعد؛ جرّبه هنا ويصل الطلب لقائمة المشترين.', 'The form is not hosted on your store yet; try it here and the application lands in your buyer list.')} <Simulated /></Alert>
      {sent && <Alert tone="ok" title={tx('أُرسل الطلب', 'Application sent')} action={<LinkButton size="sm" variant="secondary" href={link('/dashboard/wholesale', { b: sent })}>{tx('افتحه', 'Open it')}</LinkButton>}>{s.settings.approval ? tx('ينتظر موافقتك قبل أن يرى المشتري أسعار الجملة.', 'It waits for your approval before the buyer sees wholesale prices.') : tx('الموافقة التلقائية مفعّلة في الإعدادات.', 'Auto-approval is on in settings.')}</Alert>}
      <Card className="p-5">
        <h2 className="mb-4 text-[15px] font-semibold text-fg">{tx('اطلب حساب جملة', 'Apply for a wholesale account')}</h2>
        <BuyerFields f={f} set={setF} errors={errors} />
        <div className="mt-5 flex justify-end"><Button onClick={submit}>{tx('أرسل الطلب', 'Submit application')}</Button></div>
      </Card>
    </div>
  );
}
