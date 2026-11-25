// Shift (`#/dashboard/pos/shift`): the open drawer's expected cash by method, paid in / paid out with a reason,
// and close with a count by note and coin, the variance and a required note when it does not balance.
// Held sales (`#/dashboard/pos/held`) live here too: resume (rechecks stock) or discard.
import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, PauseCircle, PlayCircle, Trash2, Wallet } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, navigate } from '../../../core/router';
import { allLocations } from '../../merchant/domain';
import { levelsStore, logAction, ordersStore } from '../../merchant/stores';
import { parseMoney } from '../../merchant/catalog';
import { closeShift, countTotal, DENOMS, openShiftAt, shiftSummary, shortLines, totals } from '../../merchant/pos';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, Money, Ref, cn, useTx } from '../../../ds/ui';
import { Alert, DataTable, Field, Input, Modal, Textarea, useToast } from '../../../ds/kit';
import { useUnsaved } from '../unsaved';
import { posStore, setPos } from './state';
import { Row } from './parts';

const fmt = (t: number, lang: 'ar' | 'en') => new Date(t).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export function ShiftPage({ canManage }: { canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const s = posStore.use();
  const orders = ordersStore.use();
  const loc = s.session?.loc;
  const open = loc ? openShiftAt(s.shifts, loc) : undefined;
  const [move, setMove] = useState<'in' | 'out' | null>(null);
  const [mAmount, setMAmount] = useState('');
  const [mReason, setMReason] = useState('');
  const [closing, setClosing] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  useUnsaved(closing && Object.values(counts).some((v) => v.trim()), { ar: 'عدّ الدرج لم يُحفظ', en: 'Drawer count not saved' });
  const history = s.shifts.filter((x) => x.closed);

  const addMove = () => {
    const a = parseMoney(mAmount);
    if (!open || !move || a === null || a <= 0 || !mReason.trim()) return setTried(true);
    setPos((x) => ({ shifts: x.shifts.map((sh) => (sh.id === open.id ? { ...sh, moves: [...sh.moves, { kind: move, amount: a, reason: mReason.trim(), at: Date.now(), by: open.cashier.name }] } : sh)) }));
    logAction('finance', { ar: `${move === 'in' ? 'إيداع' : 'سحب'} نقدي ${(a / 100).toFixed(2)} ر.س في ${open.id}: ${mReason.trim()}`, en: `Cash ${move === 'in' ? 'paid in' : 'paid out'} ${(a / 100).toFixed(2)} SAR in ${open.id}: ${mReason.trim()}` }, { target: open.id });
    setMove(null); setMAmount(''); setMReason(''); setTried(false);
  };
  const cnt = Object.fromEntries(DENOMS.map((d) => [String(d), Number((counts[String(d)] ?? '').replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)) || 0)]));
  const counted = countTotal(cnt);
  const sum = open ? shiftSummary(open, orders) : null;
  const variance = sum ? counted - sum.expected : 0;
  const doClose = () => {
    if (!open) return;
    setTried(true);
    const r = closeShift(open, orders, cnt, note, Date.now());
    if (r.error) return;
    setPos((x) => ({ shifts: x.shifts.map((sh) => (sh.id === open.id ? r.shift : sh)), session: null }));
    logAction('finance', { ar: `أغلق الوردية ${open.id}: المعدود ${(counted / 100).toFixed(2)}، الفرق ${(variance / 100).toFixed(2)} ر.س`, en: `Closed shift ${open.id}: counted ${(counted / 100).toFixed(2)}, variance ${(variance / 100).toFixed(2)} SAR` }, { target: open.id, before: (sum!.expected / 100).toFixed(2), after: (counted / 100).toFixed(2) });
    toast({ tone: variance ? 'info' : 'ok', text: variance ? tx('أُغلقت الوردية بفرق مسجّل', 'Shift closed with a recorded variance') : tx('أُغلقت الوردية متوازنة', 'Shift closed, balanced') });
    setClosing(false); setCounts({}); setNote(''); setTried(false);
  };

  return (
    <div className="space-y-6">
      {open && sum ? (
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Wallet className="size-4" aria-hidden="true" />{tx('الوردية الحالية', 'Current shift')} <Ref>{open.id}</Ref></span>}
            action={<Badge tone="green">{tx('مفتوحة', 'Open')}</Badge>} />
          <div className="grid gap-6 px-5 pb-5 md:grid-cols-2">
            <div className="divide-y divide-border">
              <Row label={tx('الكاشير والموقع', 'Cashier and location')}>{open.cashier.name} · {allLocations().find((l) => l.id === open.loc)?.name[lang]}</Row>
              <Row label={tx('فُتحت', 'Opened')}>{fmt(open.openedAt, lang)}</Row>
              <Row label={tx('عدد المبيعات', 'Sales')}><span className="tabular-nums">{sum.sales}</span></Row>
              <Row label={tx('صافي المبيعات', 'Net sales')}><Money v={sum.gross} /></Row>
              <Row label={tx('بطاقة', 'Card')}><Money v={sum.card} /></Row>
              <Row label={tx('رابط دفع', 'Payment link')}><Money v={sum.link} /></Row>
              {sum.credit > 0 && <Row label={tx('رصيد استبدال', 'Exchange credit')}><Money v={sum.credit} /></Row>}
            </div>
            <div className="divide-y divide-border">
              <Row label={tx('النقد الافتتاحي', 'Opening cash')}><Money v={open.float} /></Row>
              <Row label={tx('نقد مستلم', 'Cash taken')}><Money v={sum.cash} /></Row>
              <Row label={tx('باقٍ أُعيد', 'Change given')}><span className="inline-flex">−<Money v={sum.change} /></span></Row>
              <Row label={tx('استردادات نقدية', 'Cash refunds')}><span className="inline-flex">−<Money v={sum.refunds} /></span></Row>
              {open.moves.map((m, i) => <Row key={i} label={`${m.kind === 'in' ? tx('إيداع', 'Paid in') : tx('سحب', 'Paid out')}: ${m.reason}`}><span className="inline-flex">{m.kind === 'in' ? '+' : '−'}<Money v={m.amount} /></span></Row>)}
              <Row strong label={tx('المتوقع في الدرج', 'Expected in drawer')}><Money v={sum.expected} /></Row>
            </div>
          </div>
          {canManage && <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
            <Button variant="secondary" onClick={() => setMove('in')}><ArrowDownToLine className="size-4" aria-hidden="true" />{tx('إيداع نقد', 'Pay in')}</Button>
            <Button variant="secondary" onClick={() => setMove('out')}><ArrowUpFromLine className="size-4" aria-hidden="true" />{tx('سحب نقد', 'Pay out')}</Button>
            <Button className="ms-auto" onClick={() => setClosing(true)}>{tx('أغلق الوردية', 'Close shift')}</Button>
          </div>}
        </Card>
      ) : (
        <Card><EmptyState as="h2" icon={<Wallet className="size-6" aria-hidden="true" />} title={tx('لا وردية مفتوحة هنا', 'No open shift here')}
          action={<Button onClick={() => navigate(link('/dashboard/pos'))}>{tx('افتح الكاشير', 'Open the register')}</Button>}>{tx('تُفتح الوردية بعد الدخول بالرمز.', 'A shift opens after signing in with a PIN.')}</EmptyState></Card>
      )}

      <Card>
        <CardHeader title={tx('الورديات المغلقة', 'Closed shifts')} hint={tx('كل إغلاق يحفظ المعدود والمتوقع والفرق وملاحظته.', 'Each close keeps the counted, expected, variance and note.')} />
        {history.length === 0 ? <EmptyState title={tx('لا ورديات مغلقة بعد', 'No closed shifts yet')} /> : (
          <DataTable label={tx('الورديات المغلقة', 'Closed shifts')} rows={history} rowKey={(r) => r.id}
            columns={[
              { key: 'id', header: tx('الوردية', 'Shift'), cell: (r) => <Ref>{r.id}</Ref> },
              { key: 'who', header: tx('الكاشير', 'Cashier'), cell: (r) => <span>{r.cashier.name} · {allLocations().find((l) => l.id === r.loc)?.name[lang]}</span> },
              { key: 'at', header: tx('أُغلقت', 'Closed'), cell: (r) => fmt(r.closed!.at, lang), hideBelow: 'md' },
              { key: 'exp', header: tx('المتوقع', 'Expected'), align: 'end', cell: (r) => <Money v={r.closed!.expected} /> },
              { key: 'cnt', header: tx('المعدود', 'Counted'), align: 'end', cell: (r) => <Money v={r.closed!.counted} /> },
              { key: 'var', header: tx('الفرق', 'Variance'), align: 'end', cell: (r) => <Variance v={r.closed!.variance} /> },
            ]}
            card={(r) => <div className="flex items-center justify-between gap-3 text-sm"><div><p className="font-semibold text-fg"><Ref>{r.id}</Ref> · {r.cashier.name}</p><p className="text-xs text-muted">{fmt(r.closed!.at, lang)}{r.closed!.note && ` · ${r.closed!.note}`}</p></div><Variance v={r.closed!.variance} /></div>} />
        )}
      </Card>

      {move && (
        <Modal title={move === 'in' ? tx('إيداع نقد في الدرج', 'Pay cash into the drawer') : tx('سحب نقد من الدرج', 'Pay cash out of the drawer')} onClose={() => setMove(null)}
          footer={<><Button variant="secondary" onClick={() => setMove(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={addMove}>{tx('سجّل', 'Record')}</Button></>}>
          <Field label={tx('المبلغ (ر.س)', 'Amount (SAR)')} error={tried && !(parseMoney(mAmount) ?? 0) ? tx('مبلغ غير صحيح', 'Invalid amount') : null}>{(p) => <Input {...p} inputMode="decimal" dir="ltr" value={mAmount} onChange={(e) => setMAmount(e.target.value)} />}</Field>
          <Field label={tx('السبب', 'Reason')} error={tried && !mReason.trim() ? tx('اكتب السبب', 'Give a reason') : null}>{(p) => <Input {...p} value={mReason} onChange={(e) => setMReason(e.target.value)} placeholder={move === 'in' ? tx('مثال: فكّة من البنك', 'e.g. change from the bank') : tx('مثال: شراء مستلزمات', 'e.g. supplies')} />}</Field>
        </Modal>
      )}
      {closing && open && sum && (
        <Modal size="lg" title={tx(`إغلاق ${open.id}`, `Close ${open.id}`)} description={tx('عُدّ الدرج حسب الفئة.', 'Count the drawer by note and coin.')} onClose={() => setClosing(false)}
          footer={<><Button variant="secondary" onClick={() => setClosing(false)}>{tx('رجوع', 'Back')}</Button><Button onClick={doClose}>{tx('أغلق وسجّل', 'Close and record')}</Button></>}>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DENOMS.map((d) => (
              <li key={d}><Field label={<Money v={d} />}>{(p) => <Input {...p} inputMode="numeric" dir="ltr" value={counts[String(d)] ?? ''} placeholder="0" onChange={(e) => setCounts((c) => ({ ...c, [String(d)]: e.target.value }))} />}</Field></li>
            ))}
          </ul>
          <div className="divide-y divide-border rounded-xl border border-border px-4">
            <Row label={tx('المعدود', 'Counted')}><Money v={counted} /></Row>
            {counted > 0 && <Row label={tx('المتوقع', 'Expected')}><Money v={sum.expected} /></Row>}
            {counted > 0 && <Row strong label={tx('الفرق', 'Variance')}><Variance v={variance} /></Row>}
          </div>
          {counted > 0 && variance !== 0 && <Field label={tx('سبب الفرق', 'Why it differs')} error={tried && !note.trim() ? tx('مطلوب عند وجود فرق', 'Required when there is a variance') : null}>{(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>}
          <p className="text-xs text-muted">{tx('بعد الإغلاق يُطلب الدخول بالرمز وفتح وردية جديدة.', 'After closing, sign in with a PIN and open a new shift.')}</p>
        </Modal>
      )}
    </div>
  );
}

function Variance({ v }: { v: number }) {
  const tx = useTx();
  return <span className={cn('inline-flex items-center gap-1 font-semibold', v === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{v === 0 ? tx('متوازن', 'Balanced') : <>{v > 0 ? '+' : '−'}<Money v={Math.abs(v)} /></>}</span>;
}

export function HeldPage() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const s = posStore.use();
  const levels = levelsStore.use();
  const [replace, setReplace] = useState<string | null>(null);
  const loc = s.session?.loc;
  const list = s.held;
  const resume = (id: string) => {
    const h = s.held.find((x) => x.id === id);
    if (!h) return;
    if (s.cart.lines.length && replace !== id) return setReplace(id);
    setPos((x) => ({ cart: h.cart, tenders: [], exchange: null, held: x.held.filter((y) => y.id !== id) }));
    logAction('orders', { ar: `استأنف البيع المعلّق ${id}`, en: `Resumed held sale ${id}` }, { target: id });
    setReplace(null);
    navigate(link('/dashboard/pos'));
  };
  const drop = (id: string) => {
    const h = s.held.find((x) => x.id === id)!;
    setPos((x) => ({ held: x.held.filter((y) => y.id !== id) }));
    toast({ tone: 'info', text: tx(`حُذف ${id}`, `${id} discarded`), action: { label: tx('تراجع', 'Undo'), run: () => setPos((x) => ({ held: [h, ...x.held] })) } });
  };
  if (!list.length) return <Card><EmptyState as="h2" icon={<PauseCircle className="size-6" aria-hidden="true" />} title={tx('لا مبيعات معلّقة', 'No held sales')}>{tx('علّق بيعًا من الكاشير لتخدم عميلًا آخر ثم استأنفه من هنا.', 'Hold a sale at the register to serve someone else, then resume it here.')}</EmptyState></Card>;
  return (
    <Card>
      <ul className="divide-y divide-border">
        {list.map((h) => {
          const t = totals(h.cart);
          const short = loc ? shortLines(h.cart, levels, h.loc) : [];
          return (
            <li key={h.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg"><Ref>{h.id}</Ref> · {h.cart.lines.map((l) => `${l.qty}× ${l.name[lang]}`).join('، ')}</p>
                <p className="text-xs text-muted">{h.by} · {fmt(h.at, lang)} · {allLocations().find((l) => l.id === h.loc)?.name[lang]}{h.note && ` · ${h.note}`}</p>
                {short.length > 0 && <p className="text-xs text-red-600">{tx('بعض الأصناف لم تعد متاحة بالكمية نفسها', 'Some lines are no longer available in that quantity')}</p>}
              </div>
              <Money v={t.total} className="font-semibold text-fg" />
              <Button size="sm" onClick={() => resume(h.id)} disabled={!loc || h.loc !== loc} title={h.loc !== loc ? tx('عُلّق في موقع آخر', 'Held at another location') : undefined}><PlayCircle className="size-4" aria-hidden="true" />{tx('استأنف', 'Resume')}</Button>
              <IconButton label={tx('احذف', 'Discard')} onClick={() => drop(h.id)}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
            </li>
          );
        })}
      </ul>
      {replace && (
        <Modal title={tx('السلة الحالية ليست فارغة', 'The current cart is not empty')} onClose={() => setReplace(null)}
          footer={<><Button variant="secondary" onClick={() => setReplace(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => resume(replace)}>{tx('استبدل السلة', 'Replace the cart')}</Button></>}>
          <Alert tone="warn">{tx('علّق السلة الحالية أولًا إن أردت الاحتفاظ بها؛ الاستبدال يحذفها.', 'Hold the current cart first to keep it; replacing discards it.')}</Alert>
        </Modal>
      )}
    </Card>
  );
}

