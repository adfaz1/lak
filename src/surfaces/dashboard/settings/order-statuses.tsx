// Settings → Order statuses (`#/dashboard/settings/order-statuses`): sub-statuses under the main states where the
// team still works (awaiting payment, processing, ready to ship). Each has two names, a colour, whether setting it
// messages the customer (the shared «sub-status update» template in Customer messages) and whether reports count it.
// Archiving never rewrites orders that carry it. Rules in merchant/ops.ts.
import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, MessageSquare, Pencil, Plus, ListTree, BarChart3, EyeOff } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link } from '../../../core/router';
import { logAction, noticeCtx, noticesStore, ordersStore, subStatusesStore, testStore, currentActor } from '../../merchant/stores';
import {
  NOTICE_CHANNELS, SUB_MAX_PER_PARENT, SUB_NAME_MAX, SUB_PARENTS, SUB_TONES, composeNotice, nextSubId, subCounts, validateSub,
  type SubParent, type SubStatus, type SubTone,
} from '../../merchant/ops';
import { can } from '../../merchant/perms';
import { Alert, Field, Input, Modal, Select, Simulated, Switch } from '../../../ds/kit';
import { Badge, Button, IconButton, InfoHint, Segmented, cn, toneDot, useTx } from '../../../ds/ui';
import { useUnsaved } from '../unsaved';
import { Section, useSave } from './common';
import { useSessionDraft } from './drafts';
import { useMainStateName } from '../orders/substatus-ui';
import { useChannelName } from '../orders/notices-ui';

type Draft = { id?: string; parent: SubParent; name: { ar: string; en: string }; tone: SubTone; notify: boolean; inReports: boolean };
const blank = (parent: SubParent): Draft => ({ parent, name: { ar: '', en: '' }, tone: 'amber', notify: false, inReports: true });

export default function OrderStatuses() {
  const tx = useTx();
  const { lang } = useLang();
  const state = useMainStateName();
  const subs = subStatusesStore.use();
  const orders = ordersStore.use();
  const role = testStore.use().role;
  const manage = can(role, 'order.fulfil');
  const counts = useMemo(() => subCounts(orders), [orders]);
  const [draft, setDraft, clearDraft] = useSessionDraft<Draft | null>('settings.subStatus', null);
  const [archive, setArchive] = useState<SubStatus | null>(null);

  const reported = subs.filter((s) => s.inReports && counts[s.id]);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-muted">
          {tx('الحالات الرئيسية ثابتة؛ الفرعية توضّح أين وصل العمل.', 'Main states are fixed; sub-statuses say where the work is.')}
          <InfoHint>{tx('الحالة الفرعية تنتهي تلقائيًا عندما يتغير الدفع أو التجهيز أو الشحن، فلا تتعارض مع التقارير ورسائل العميل. يمكن لقواعد التشغيل ضبطها.', 'A sub-status ends by itself when payment, fulfilment or shipment changes, so it never contradicts reports or customer messages. Operating rules can set it.')}</InfoHint>
        </p>
        {manage && <Button onClick={() => setDraft(blank('processing'))}><Plus className="size-4" aria-hidden="true" />{tx('حالة فرعية جديدة', 'New sub-status')}</Button>}
      </div>

      {reported.length > 0 && (
        <Section id="h-sub-now" title={tx('الطلبات الآن', 'Orders now')} hint={<InfoHint>{tx('الحالات المحسوبة في التقارير فقط. اضغط لفتح الطلبات.', 'Only sub-statuses counted in reports. Click to open the orders.')}</InfoHint>}>
          <ul className="flex flex-wrap gap-2">
            {reported.map((s) => (
              <li key={s.id}><a href={link('/dashboard/orders', { sub: s.id })} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-[13px] hover:border-brand-300">
                <span className={cn('size-2 rounded-full', toneDot[s.tone])} aria-hidden="true" /><span className="text-fg">{s.name[lang]}</span><span className="font-semibold tabular-nums text-fg">{counts[s.id]}</span>
              </a></li>
            ))}
          </ul>
        </Section>
      )}

      {SUB_PARENTS.map((p) => {
        const list = subs.filter((s) => s.parent === p);
        const live = list.filter((s) => !s.archived);
        return (
          <Section key={p} id={`h-sub-${p}`} flush
            title={<><span>{state(p)}</span><span className="text-xs font-normal text-muted tabular-nums">{live.length}/{SUB_MAX_PER_PARENT}</span></>}
            action={manage && live.length < SUB_MAX_PER_PARENT ? <Button size="sm" variant="secondary" onClick={() => setDraft(blank(p))}><Plus className="size-3.5" aria-hidden="true" />{tx('أضف', 'Add')}</Button> : undefined}>
            {list.length === 0 ? (
              <div className="px-5 pb-4"><p className="text-sm text-muted">{tx('لا حالات فرعية. الطلبات تظهر بالحالة الرئيسية فقط.', 'No sub-statuses. Orders show the main state only.')}</p></div>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {list.map((s) => (
                  <li key={s.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3', s.archived && 'opacity-60')}>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2"><Badge tone={s.tone} icon={<ListTree className="size-3" aria-hidden="true" />}>{s.name[lang]}</Badge><span className="text-xs text-muted" dir={lang === 'ar' ? 'ltr' : 'rtl'}>{s.name[lang === 'ar' ? 'en' : 'ar']}</span>{s.archived && <Badge>{tx('مؤرشفة', 'Archived')}</Badge>}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        {s.notify ? <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-200"><MessageSquare className="size-3.5" aria-hidden="true" />{tx('يُبلَّغ العميل', 'Customer notified')}</span> : <span className="inline-flex items-center gap-1"><EyeOff className="size-3.5" aria-hidden="true" />{tx('داخلية', 'Internal')}</span>}
                        <span className="inline-flex items-center gap-1"><BarChart3 className="size-3.5" aria-hidden="true" />{s.inReports ? tx('في التقارير', 'In reports') : tx('خارج التقارير', 'Not in reports')}</span>
                        <a href={link('/dashboard/orders', { sub: s.id })} className="tabular-nums hover:text-fg">{tx(`${counts[s.id] ?? 0} طلب الآن`, `${counts[s.id] ?? 0} orders now`)}</a>
                      </p>
                    </div>
                    {manage && <div className="flex items-center gap-1">
                      {!s.archived && <IconButton label={tx(`عدّل ${s.name.ar}`, `Edit ${s.name.en}`)} onClick={() => setDraft({ id: s.id, parent: s.parent, name: { ...s.name }, tone: s.tone, notify: s.notify, inReports: s.inReports })}><Pencil className="size-4" aria-hidden="true" /></IconButton>}
                      <IconButton label={s.archived ? tx(`استرجع ${s.name.ar}`, `Restore ${s.name.en}`) : tx(`أرشف ${s.name.ar}`, `Archive ${s.name.en}`)} onClick={() => setArchive(s)}>{s.archived ? <ArchiveRestore className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}</IconButton>
                    </div>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        );
      })}

      <p className="text-[13px] text-muted">
        {tx('نص رسالة العميل واحد لكل الحالات الفرعية: ', 'One customer message for every sub-status: ')}
        <a href={link('/dashboard/settings/notifications', { tab: 'customers', event: 'subStatus' })} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('«تحديث على طلبك» في رسائل العملاء', '“Update on your order” in Customer messages')}</a>
      </p>

      {draft && <Editor draft={draft} setDraft={setDraft} close={clearDraft} subs={subs} />}
      {archive && <ArchiveModal s={archive} n={counts[archive.id] ?? 0} onClose={() => setArchive(null)} />}
    </>
  );
}

function Editor({ draft, setDraft, close, subs }: { draft: Draft; setDraft: (d: Draft) => void; close: () => void; subs: SubStatus[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const state = useMainStateName();
  const chName = useChannelName();
  const cfg = noticesStore.use();
  const orders = ordersStore.use();
  const { saving, error, save } = useSave();
  const [tried, setTried] = useState(false);
  const [pv, setPv] = useState<'ar' | 'en'>(lang);
  const orig = draft.id ? subs.find((s) => s.id === draft.id) : undefined;
  const dirty = !orig ? !!(draft.name.ar || draft.name.en) : JSON.stringify([orig.parent, orig.name, orig.tone, orig.notify, orig.inReports]) !== JSON.stringify([draft.parent, draft.name, draft.tone, draft.notify, draft.inReports]);
  useUnsaved(dirty, { ar: 'حالة فرعية', en: 'Sub-status' });
  const e = validateSub({ id: draft.id, parent: draft.parent, name: draft.name }, subs);
  const used = orig ? orders.some((o) => o.sub?.id === orig.id) : false;
  const msg = (l: 'ar' | 'en') => ({ nameAr: tx('اكتب الاسم بالعربية', 'Enter the Arabic name'), nameEn: tx('اكتب الاسم بالإنجليزية', 'Enter the English name'), long: tx(`حتى ${SUB_NAME_MAX} حرفًا`, `Up to ${SUB_NAME_MAX} characters`), taken: tx('الاسم مستخدم تحت هذه الحالة', 'Name already used under this state'), chars: tx('بلا الرمز |', 'Without the | character'), limit: '' })[e[l]!];
  const channels = NOTICE_CHANNELS.filter((c) => cfg.channels.subStatus?.[c]);
  const sample = orders.find((o) => !o.cancelled) ?? orders[0];
  const preview = sample && draft.notify ? composeNotice({ ...sample, sub: { id: 'x', parent: draft.parent, name: { ar: draft.name.ar || '…', en: draft.name.en || '…' }, notify: true, at: 0, by: '' } }, 'subStatus', cfg, noticeCtx(sample), currentActor(), { only: ['sms'], lang: pv })[0] : null;
  const toneName: Record<SubTone, string> = { brand: tx('بنفسجي', 'Violet'), sky: tx('أزرق', 'Blue'), amber: tx('كهرماني', 'Amber'), green: tx('أخضر', 'Green'), red: tx('أحمر', 'Red'), gray: tx('رمادي', 'Grey') };

  const submit = () => {
    setTried(true);
    if (Object.keys(e).length) return;
    save(() => {
      const by = currentActor().name;
      const name = { ar: draft.name.ar.trim().replace(/\s+/g, ' '), en: draft.name.en.trim().replace(/\s+/g, ' ') };
      if (orig) {
        subStatusesStore.set((l) => l.map((s) => (s.id === orig.id ? { ...s, parent: draft.parent, name, tone: draft.tone, notify: draft.notify, inReports: draft.inReports, by, at: Date.now() } : s)));
        logAction('settings', { ar: `عدّل الحالة الفرعية «${name.ar}»`, en: `Edited sub-status “${name.en}”` }, { target: orig.id, before: `${orig.name.ar}|${orig.notify}|${orig.inReports}`, after: `${name.ar}|${draft.notify}|${draft.inReports}` });
      } else {
        const id = nextSubId(subStatusesStore.get());
        subStatusesStore.set((l) => [...l, { id, parent: draft.parent, name, tone: draft.tone, notify: draft.notify, inReports: draft.inReports, by, at: Date.now() }]);
        logAction('settings', { ar: `أضاف الحالة الفرعية «${name.ar}» تحت «${state(draft.parent)}»`, en: `Added sub-status “${name.en}” under “${state(draft.parent)}”` }, { target: id });
      }
      close();
    }, orig ? tx('حُفظت الحالة الفرعية', 'Sub-status saved') : tx('أُضيفت الحالة الفرعية', 'Sub-status added'));
  };

  return (
    <Modal size="lg" title={orig ? tx(`تعديل «${orig.name.ar}»`, `Edit “${orig.name.en}”`) : tx('حالة فرعية جديدة', 'New sub-status')} onClose={close}
      footer={<><Button variant="secondary" onClick={close}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={saving} onClick={submit}>{saving ? tx('جارٍ الحفظ…', 'Saving…') : tx('احفظ', 'Save')}</Button></>}>
      <div className="space-y-4">
        {error && <Alert tone="bad">{error}</Alert>}
        {tried && e.form === 'limit' && <Alert tone="warn">{tx(`الحد ${SUB_MAX_PER_PARENT} حالات فرعية لكل حالة. أرشف واحدة أولًا.`, `The limit is ${SUB_MAX_PER_PARENT} per state. Archive one first.`)}</Alert>}
        <Field label={tx('تحت الحالة', 'Under the state')} hint={used ? tx('مستخدمة في طلبات؛ لا تُنقل', 'Used on orders; cannot move') : undefined}>
          {(p) => <Select {...p} disabled={used} value={draft.parent} onChange={(x) => setDraft({ ...draft, parent: x.target.value as SubParent })}>{SUB_PARENTS.map((s) => <option key={s} value={s}>{state(s)}</option>)}</Select>}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={tx('الاسم بالعربية', 'Arabic name')} error={tried && e.ar ? msg('ar') : null}>
            {(p) => <Input {...p} dir="rtl" maxLength={SUB_NAME_MAX + 8} value={draft.name.ar} onChange={(x) => setDraft({ ...draft, name: { ...draft.name, ar: x.target.value } })} placeholder="مثال: بانتظار النقش" />}
          </Field>
          <Field label={tx('الاسم بالإنجليزية', 'English name')} error={tried && e.en ? msg('en') : null}>
            {(p) => <Input {...p} dir="ltr" maxLength={SUB_NAME_MAX + 8} value={draft.name.en} onChange={(x) => setDraft({ ...draft, name: { ...draft.name, en: x.target.value } })} placeholder="e.g. Awaiting engraving" />}
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-semibold text-fg">{tx('اللون', 'Colour')}</legend>
          <div className="flex flex-wrap gap-2">
            {SUB_TONES.map((t) => (
              <button key={t} type="button" aria-pressed={draft.tone === t} onClick={() => setDraft({ ...draft, tone: t })}
                className={cn('inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-medium', draft.tone === t ? 'border-brand-500 bg-brand-500/10 text-fg' : 'border-border text-muted hover:text-fg')}>
                <span className={cn('size-3 rounded-full', toneDot[t])} aria-hidden="true" />{toneName[t]}
              </button>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted">{tx('كما تظهر في الطلبات:', 'As shown on orders:')} <Badge tone={draft.tone} icon={<ListTree className="size-3" aria-hidden="true" />}>{draft.name[lang] || tx('الاسم', 'Name')}</Badge></p>
        </fieldset>
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-3 text-sm text-fg"><span>{tx('تُحسب في التقارير وعدّادات الطلبات', 'Count it in reports and order counts')}</span><Switch checked={draft.inReports} onChange={(v) => setDraft({ ...draft, inReports: v })} label={tx('تُحسب في التقارير وعدّادات الطلبات', 'Count it in reports and order counts')} /></div>
          <div className="flex items-center justify-between gap-3 text-sm text-fg"><span>{tx('أبلغ العميل عند ضبطها', 'Notify the customer when it is set')}</span><Switch checked={draft.notify} onChange={(v) => setDraft({ ...draft, notify: v })} label={tx('أبلغ العميل عند ضبطها', 'Notify the customer when it is set')} /></div>
          {draft.notify && (channels.length ? (
            <div className="space-y-2 rounded-xl bg-surface-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-muted">{tx(`ما يصل العميل (${channels.map(chName).join('، ')})`, `What the customer gets (${channels.map(chName).join(', ')})`)}</p>
                <Segmented label={tx('لغة المعاينة', 'Preview language')} value={pv} onChange={setPv} options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} />
              </div>
              {preview && <p className="rounded-2xl rounded-ss-sm bg-surface px-3 py-2 text-sm text-fg shadow-card" dir={pv === 'ar' ? 'rtl' : 'ltr'}>{preview.body}</p>}
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted"><Simulated />{tx('يُرسل عند ضبطها من الطلب أو جماعيًا أو بقاعدة؛ يمكن إيقافه لكل إجراء.', 'Sent when set from the order, in bulk or by a rule; can be skipped per action.')}</p>
              <a href={link('/dashboard/settings/notifications', { tab: 'customers', event: 'subStatus' })} className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('عدّل نص الرسالة وقنواتها', 'Edit the message and its channels')}</a>
            </div>
          ) : <Alert tone="warn">{tx('رسالة «تحديث على طلبك» مطفأة في كل القنوات؛ لن يصل العميل شيء حتى تفعّل قناة.', '“Update on your order” is off on every channel; nothing reaches the customer until you turn one on.')}</Alert>)}
        </div>
      </div>
    </Modal>
  );
}

function ArchiveModal({ s, n, onClose }: { s: SubStatus; n: number; onClose: () => void }) {
  const tx = useTx();
  const restore = !!s.archived;
  const go = () => {
    subStatusesStore.set((l) => l.map((x) => (x.id === s.id ? { ...x, archived: !restore } : x)));
    logAction('settings', restore ? { ar: `استرجع الحالة الفرعية «${s.name.ar}»`, en: `Restored sub-status “${s.name.en}”` } : { ar: `أرشف الحالة الفرعية «${s.name.ar}»`, en: `Archived sub-status “${s.name.en}”` }, { target: s.id });
    onClose();
  };
  return (
    <Modal title={restore ? tx(`استرجاع «${s.name.ar}»`, `Restore “${s.name.en}”`) : tx(`أرشفة «${s.name.ar}»`, `Archive “${s.name.en}”`)} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={go}>{restore ? tx('استرجع', 'Restore') : tx('أرشف', 'Archive')}</Button></>}>
      <ul className="list-disc space-y-1.5 ps-5 text-sm text-fg">
        {restore ? <li>{tx('تعود متاحة للطلبات والقواعد.', 'It becomes available to orders and rules again.')}</li> : <>
          <li>{tx('لا تُعرض لطلبات جديدة ولا تضبطها القواعد.', 'Not offered for new orders; rules stop setting it.')}</li>
          <li>{n ? tx(`${n} طلب يحملها الآن ويبقى عليها حتى تتغير حالته.`, `${n} orders carry it now and keep it until they move on.`) : tx('لا طلبات تحملها الآن.', 'No orders carry it now.')}</li>
          <li>{tx('السجل لا يتغير.', 'History is unchanged.')}</li>
        </>}
      </ul>
    </Modal>
  );
}

