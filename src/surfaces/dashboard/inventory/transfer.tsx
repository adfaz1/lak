// Transfer detail (`#/dashboard/inventory/transfers/<id>`, `new`): draft → sent → partial/full receipt → discrepancy.
// State changes go through merchant/inventory.ts (sendTransfer, receiveTransfer, closeWithDiscrepancy).
import { useMemo, useState } from 'react';
import { ArrowLeft, PackageSearch, Plus, Trash2, Truck, PackageCheck } from 'lucide-react';
import { navigate, replace } from '../../../core/router';
import { useLang } from '../../../core/lang';
import { LOCATIONS, LOC_IDS, type LocId } from '../../merchant/domain';
import { available, closeWithDiscrepancy, levelOf, receiveTransfer, sendTransfer, validateTransferDraft, type Transfer, type TransferError } from '../../merchant/inventory';
import { can } from '../../merchant/perms';
import { levelsStore, productsStore, stockLogStore, transfersStore } from '../../merchant/stores';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, PageHeader, Select, inputClass, useToast } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { ReviewTools, Stepper, ihref, roleBadge, useRole } from '../products/common';
import { discrepancyLog, infoFor, newTransfer, parseReceive, receiveAll, receiveLog, sendLog, skuInfo, stageOf, units } from './model';
import { SkuCell, T_TONE, useInvNames } from './parts';

export default function TransferDetail({ id, query }: { id: string; query: URLSearchParams }) {
  const tx = useTx();
  const state = useDashState();
  const transfers = transfersStore.use();
  const back = { href: ihref('', { tab: 'transfers' }), label: tx('التحويلات', 'Transfers') };
  const stored = transfers.find((t) => t.id === id);
  if (state === 'loading') return <div className="space-y-6" aria-busy="true"><PageHeader back={back} title={<Skeleton className="h-8 w-48" />} /><Skeleton className="h-10 w-full rounded-xl" /><Skeleton className="h-64 w-full rounded-2xl" /></div>;
  if (state === 'error') return <div className="space-y-6"><PageHeader back={back} title={tx('تحويل', 'Transfer')} /><Card><ErrorState as="h2" title={tx('تعذّر تحميل التحويل', 'The transfer could not load')} onRetry={() => setDashState('live')}>{tx('لم تتغير الكميات. المرجع SIM-TRF-503.', 'No quantities changed. Ref SIM-TRF-503.')}</ErrorState></Card></div>;
  if (id !== 'new' && !stored) return (
    <div className="space-y-6"><PageHeader back={back} title={tx('التحويل غير موجود', 'Transfer not found')} />
      <Card><EmptyState icon={<PackageSearch className="size-6" aria-hidden="true" />} title={tx('لا يوجد تحويل بهذا المرجع', 'No transfer with this reference')} action={<a className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300" href={back.href}>{tx('كل التحويلات', 'All transfers')}</a>} /></Card>
    </div>
  );
  return <Detail initial={stored ?? newTransfer(transfers, query.get('sku'), query.get('to'))} isNew={!stored} />;
}

function Detail({ initial, isNew }: { initial: Transfer; isNew: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const names = useInvNames();
  const toast = useToast();
  const role = useRole();
  const canT = can(role, 'inventory.transfer');
  const products = productsStore.use();
  const levels = levelsStore.use();
  const transfers = transfersStore.use();
  const info = useMemo(() => skuInfo(products), [products]);
  const [draft, setDraft] = useState<Transfer>(initial);
  const stored = transfers.find((x) => x.id === draft.id);
  const t = stored && stored.status !== 'draft' ? stored : draft;
  const editable = t.status === 'draft' && canT;
  const receiving = t.status === 'sent' || t.status === 'partial';
  const [recv, setRecv] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<'send' | 'receive' | 'close' | null>(null);
  const [closeNote, setCloseNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [addSku, setAddSku] = useState('');
  const check = validateTransferDraft(levels, t);
  const parsed = parseReceive(recv, t);
  const u = units(t);

  const errMsg = (e: TransferError) => ({
    empty: tx('أضف سطرًا بكمية واحدة على الأقل', 'Add at least one line with a quantity'), sameLoc: tx('المصدر والوجهة يجب أن يختلفا', 'Source and destination must differ'),
    insufficient: tx('الكمية تتجاوز المتاح في المصدر', 'Quantity exceeds what the source has available'), qty: tx('كميات غير صالحة', 'Invalid quantities'), state: tx('الحالة لا تسمح بهذا', 'The current state does not allow this'),
  })[e];
  const persist = (next: Transfer) => transfersStore.set((ts) => (ts.some((x) => x.id === next.id) ? ts.map((x) => (x.id === next.id ? next : x)) : [next, ...ts]));
  const edit = (patch: Partial<Transfer>) => { setDraft((d) => ({ ...d, ...patch })); setErr(null); };

  const saveDraft = () => { persist(draft); toast({ tone: 'ok', text: tx(`حُفظت مسودة ${draft.id}`, `Draft ${draft.id} saved`) }); if (isNew) replace(ihref(`transfers/${draft.id}`)); };
  const send = () => {
    setConfirm(null);
    const r = sendTransfer(levelsStore.get(), t);
    if (r.error) { setErr(errMsg(r.error)); return; }
    levelsStore.set(r.levels);
    persist(r.transfer);
    stockLogStore.set((lg) => [...sendLog(r.transfer, r.levels, 'You'), ...lg]);
    toast({ tone: 'ok', text: tx(`أُرسل ${t.id}`, `${t.id} sent`) });
    if (isNew) navigate(ihref(`transfers/${t.id}`));
  };
  const receive = () => {
    setConfirm(null);
    const r = receiveTransfer(levelsStore.get(), t, parsed.qty);
    if (r.error) { setErr(errMsg(r.error)); return; }
    levelsStore.set(r.levels);
    persist(r.transfer);
    stockLogStore.set((lg) => [...receiveLog(t, parsed.qty, r.levels, 'You'), ...lg]);
    setRecv([]); setErr(null);
    toast({ tone: 'ok', text: r.transfer.status === 'received' ? tx('اكتمل الاستلام', 'Fully received') : tx('سُجل استلام جزئي', 'Partial receipt recorded') });
  };
  const close = () => {
    setConfirm(null);
    const r = closeWithDiscrepancy(levelsStore.get(), t, closeNote.trim());
    if (r.error) { setErr(errMsg(r.error)); return; }
    levelsStore.set(r.levels);
    persist(r.transfer);
    stockLogStore.set((lg) => [...discrepancyLog(r.transfer, r.levels, 'You'), ...lg]);
  };

  const stage = stageOf(t.status);
  const stageNames = [tx('مسودة', 'Draft'), tx('مُرسل', 'Sent'), t.status === 'partial' ? tx('استلام جزئي', 'Partly received') : tx('الاستلام', 'Receiving'), t.status === 'closed' ? tx('مغلق بفرق', 'Closed with discrepancy') : tx('مستلم', 'Received')];
  const allSkus = [...new Set(levels.map((x) => x.sku))].filter((s) => !t.lines.some((l) => l.sku === s));
  const recvTotal = parsed.qty.reduce((s, n) => s + n, 0);

  const primary = editable ? <Button onClick={() => (check.error ? setErr(errMsg(check.error)) : setConfirm('send'))}><Truck className="size-4" aria-hidden="true" />{tx('أرسل التحويل', 'Send transfer')}</Button>
    : receiving && canT ? <Button onClick={() => (parsed.bad.length ? setErr(errMsg('qty')) : recvTotal === 0 ? setErr(tx('أدخل كمية مستلمة لسطر واحد على الأقل', 'Enter a received quantity for at least one line')) : setConfirm('receive'))}><PackageCheck className="size-4" aria-hidden="true" />{tx('سجّل الاستلام', 'Record receipt')}</Button> : null;

  return (
    <div className="space-y-6">
      <PageHeader back={{ href: ihref('', { tab: 'transfers' }), label: tx('التحويلات', 'Transfers') }}
        title={<>{tx('تحويل', 'Transfer')} <bdi dir="ltr">{t.id}</bdi></>}
        meta={<><Badge tone={T_TONE[t.status]}>{isNew && !stored ? tx('مسودة جديدة', 'New draft') : names.status(t.status)}</Badge><span className="text-[13px] text-muted tabular-nums">{tx(`${u.received} من ${u.qty} وحدة مستلمة`, `${u.received} of ${u.qty} units received`)}</span>{!canT && roleBadge(tx)}</>}
        actions={<>{editable && <Button variant="secondary" onClick={saveDraft}>{tx('احفظ المسودة', 'Save draft')}</Button>}{receiving && canT && <Button variant="secondary" onClick={() => setConfirm('close')}>{tx('أغلق بفرق', 'Close with discrepancy')}</Button>}{primary}</>} />

      <Card className="p-5"><Stepper steps={stageNames} current={stage.index} label={tx('مراحل التحويل', 'Transfer stages')} tone={t.status === 'closed' || t.status === 'partial' ? 'warn' : undefined} /></Card>

      {err && <Alert tone="bad">{err}{check.error === 'insufficient' && editable && <> · <bdi dir="ltr">{check.short.join(', ')}</bdi></>}</Alert>}
      {t.status === 'closed' && <Alert tone="warn" title={tx('أُغلق بفرق', 'Closed with a discrepancy')}>{t.discrepancy.map((d) => tx(`${infoFor(info, d.sku).name.ar}: ${d.units} لم تصل`, `${infoFor(info, d.sku).name.en}: ${d.units} not received`)).join(' · ')}{t.note && ` — ${t.note}`}</Alert>}
      {t.status === 'received' && <Alert tone="ok">{tx('وصلت كل الوحدات وأُضيفت إلى الموجود في الوجهة.', 'Every unit arrived and was added to on hand at the destination.')}</Alert>}

      <Card aria-labelledby="tr-h">
        <CardHeader id="tr-h" title={tx('المسار والأصناف', 'Route and items')} hint={tx('عند الإرسال تخرج الوحدات من المصدر وتظهر «واردة» في الوجهة حتى تُستلم. لا تُباع الواردة تلقائيًا.', 'On sending, units leave the source and show as incoming at the destination until received. Incoming units are never sold automatically.')} />
        <div className="flex flex-wrap items-end gap-3 px-5 pb-4">
          {(['from', 'to'] as const).map((k, i) => (
            <div key={k} className="flex w-full items-end gap-3 sm:w-auto">
              {i === 1 && <ArrowLeft className="mb-3 hidden size-4 text-subtle sm:block ltr:rotate-180" aria-hidden="true" />}
              <Field label={k === 'from' ? tx('من', 'From') : tx('إلى', 'To')} className="w-full sm:w-48">
                {(p) => <Select {...p} value={t[k]} disabled={!editable} onChange={(e) => edit({ [k]: e.target.value as LocId })}>{LOC_IDS.map((x) => <option key={x} value={x}>{LOCATIONS[x][lang]}</option>)}</Select>}
              </Field>
            </div>
          ))}
        </div>
        {t.lines.length === 0 ? <p className="border-t border-border px-5 py-6 text-center text-sm text-muted">{tx('لا أصناف بعد. أضف صنفًا أدناه.', 'No items yet. Add one below.')}</p> : (
          <ul className="divide-y divide-border border-t border-border">
            {t.lines.map((l, i) => {
              const src = levelOf(levels, l.sku, t.from);
              const short = editable && check.short.includes(l.sku);
              const outstanding = l.qty - l.received;
              return (
                <li key={l.sku} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1 basis-60"><SkuCell sku={l.sku} info={infoFor(info, l.sku)} sub={editable ? tx(`متاح في المصدر ${src ? available(src) : 0}`, `${src ? available(src) : 0} available at source`) : undefined} /></div>
                  {editable ? (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted" htmlFor={`tr-q-${i}`}>{tx('الكمية', 'Qty')}</label>
                      <input id={`tr-q-${i}`} className={inputClass} style={{ width: '5rem' }} dir="ltr" inputMode="numeric" value={String(l.qty)} aria-invalid={short || undefined}
                        onChange={(e) => edit({ lines: draft.lines.map((y, j) => (j === i ? { ...y, qty: Number(e.target.value.replace(/\D/g, '')) || 0 } : y)) })} />
                      <button type="button" aria-label={tx(`احذف ${l.sku}`, `Remove ${l.sku}`)} onClick={() => edit({ lines: draft.lines.filter((_, j) => j !== i) })} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"><Trash2 className="size-4" aria-hidden="true" /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 text-sm">
                      <span className="tabular-nums text-muted">{tx('مرسل', 'Sent')} <b className="text-fg">{l.qty}</b></span>
                      <span className="tabular-nums text-muted">{tx('مستلم', 'Received')} <b className={cn(l.received === l.qty ? 'text-emerald-700 dark:text-emerald-400' : 'text-fg')}>{l.received}</b></span>
                      {receiving && canT && (
                        outstanding > 0 ? (
                          <span className="flex items-center gap-2">
                            <label className="text-xs text-muted" htmlFor={`tr-r-${i}`}>{tx('استلم الآن', 'Receive now')}</label>
                            <input id={`tr-r-${i}`} className={inputClass} style={{ width: '5rem' }} dir="ltr" inputMode="numeric" placeholder={String(outstanding)} value={recv[i] ?? ''} aria-invalid={parsed.bad.includes(i) || undefined}
                              onChange={(e) => { const n = [...recv]; n[i] = e.target.value; setRecv(n); setErr(null); }} />
                          </span>
                        ) : <Badge tone="green">{tx('مكتمل', 'Complete')}</Badge>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {editable && (
          <div className="flex flex-wrap items-end gap-2 border-t border-border px-5 py-4">
            <Field label={tx('أضف صنفًا', 'Add an item')} className="min-w-0 flex-1 basis-64">
              {(p) => <Select {...p} value={addSku} onChange={(e) => setAddSku(e.target.value)}><option value="">{tx('اختر SKU…', 'Choose a SKU…')}</option>{allSkus.map((s) => { const n = infoFor(info, s); return <option key={s} value={s}>{s} — {n.name[lang]}{n.variant[lang] && ` · ${n.variant[lang]}`}</option>; })}</Select>}
            </Field>
            <Button variant="secondary" disabled={!addSku} onClick={() => { edit({ lines: [...draft.lines, { sku: addSku, qty: 1, received: 0 }] }); setAddSku(''); }}><Plus className="size-4" aria-hidden="true" />{tx('أضف', 'Add')}</Button>
          </div>
        )}
        {receiving && canT && <div className="border-t border-border px-5 py-3"><Button variant="ghost" size="sm" onClick={() => setRecv(receiveAll(t))}>{tx('املأ كل المتبقي', 'Fill all outstanding')}</Button></div>}
      </Card>

      <ReviewTools />

      {confirm === 'send' && (
        <Modal title={tx(`إرسال ${t.id}`, `Send ${t.id}`)} onClose={() => setConfirm(null)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={send}>{tx(`أرسل ${u.qty} وحدة`, `Send ${u.qty} units`)}</Button></>}>
          <p className="text-sm text-muted">{tx(`تخرج ${u.qty} وحدة من ${LOCATIONS[t.from].ar} الآن وتظهر «واردة» في ${LOCATIONS[t.to].ar} حتى تُستلم.`, `${u.qty} units leave the ${LOCATIONS[t.from].en} now and show as incoming at the ${LOCATIONS[t.to].en} until received.`)}</p>
          <p className="text-sm text-muted">{tx('بعد الإرسال لا يمكن تعديل الأصناف.', 'Items can’t be edited after sending.')}</p>
        </Modal>
      )}
      {confirm === 'receive' && (
        <Modal title={tx('تسجيل الاستلام', 'Record receipt')} onClose={() => setConfirm(null)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={receive}>{tx(`استلم ${recvTotal} وحدة`, `Receive ${recvTotal} units`)}</Button></>}>
          <ul className="space-y-1 text-sm">{t.lines.map((l, i) => parsed.qty[i] ? <li key={l.sku} className="flex justify-between gap-3"><span className="truncate text-fg">{infoFor(info, l.sku).name[lang]}</span><span className="tabular-nums text-muted">+{parsed.qty[i]}</span></li> : null)}</ul>
          <p className="text-sm text-muted">{tx(`تُضاف إلى الموجود في ${LOCATIONS[t.to].ar} وتُخصم من «الوارد».`, `Added to on hand at the ${LOCATIONS[t.to].en} and removed from incoming.`)}</p>
        </Modal>
      )}
      {confirm === 'close' && (
        <Modal title={tx('إغلاق التحويل بفرق', 'Close with a discrepancy')} onClose={() => setConfirm(null)}
          description={tx(`${u.qty - u.received} وحدة لم تصل.`, `${u.qty - u.received} units have not arrived.`)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" disabled={!closeNote.trim()} onClick={close}>{tx('أغلق وسجّل الفرق', 'Close and record')}</Button></>}>
          <p className="text-sm text-muted">{tx('تُزال الوحدات غير المستلمة من «الوارد» ولا تعود إلى المصدر تلقائيًا.', 'Units not received are removed from incoming and do not return to the source automatically.')}</p>
          <Field label={tx('السبب', 'Reason')}>{(p) => <Input {...p} value={closeNote} placeholder={tx('مثل: تلف أثناء النقل', 'e.g. damaged in transit')} onChange={(e) => setCloseNote(e.target.value)} />}</Field>
        </Modal>
      )}
    </div>
  );
}
