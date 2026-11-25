// POS settings (`#/dashboard/pos/settings`, owner only): cashier PINs, discount limit per role (the merchant's own
// rule), receipt footer; and what LAK has not decided (hardware, terminal fees, POS pricing).
import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { logAction, teamStore } from '../../merchant/stores';
import { ROLES } from '../../merchant/perms';
import { canSell, validPin, type DiscountLimits } from '../../merchant/pos';
import { normaliseDigits } from '../../merchant/catalog';
import { Badge, Button, Card, CardHeader, useTx } from '../../../ds/ui';
import { Field, Input, Modal, SaveBar, useToast } from '../../../ds/kit';
import { roleName } from '../marketing/access';
import { useUnsaved } from '../unsaved';
import { posStore, setPos } from './state';
import { DecisionMark, Pending } from './parts';

export function PosSettings() {
  const tx = useTx();
  const toast = useToast();
  const s = posStore.use();
  const team = teamStore.use();
  const [limits, setLimits] = useState<Record<string, string>>(() => Object.fromEntries(ROLES.map((r) => [r, String(s.limits[r])])));
  const [note, setNote] = useState(s.receiptNote);
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [tried, setTried] = useState(false);
  const parsed = Object.fromEntries(ROLES.map((r) => [r, Number(normaliseDigits(limits[r] ?? ''))])) as DiscountLimits;
  const bad = ROLES.filter((r) => !/^\d{1,3}$/.test(normaliseDigits(limits[r] ?? '')) || parsed[r] > 100);
  const dirty = ROLES.some((r) => String(s.limits[r]) !== limits[r]) || note !== s.receiptNote;
  useUnsaved(dirty, { ar: 'إعدادات نقطة البيع', en: 'POS settings' });
  const save = () => {
    if (bad.length) return;
    setPos(() => ({ limits: parsed, receiptNote: note.trim() }));
    logAction('settings', { ar: 'حدّث حدود الخصم وإيصال نقطة البيع', en: 'Updated POS discount limits and receipt' }, { before: JSON.stringify(s.limits), after: JSON.stringify(parsed) });
    toast({ tone: 'ok', text: tx('حُفظت إعدادات نقطة البيع', 'POS settings saved') });
  };
  const member = team.members.find((m) => m.id === pinFor);
  const savePin = () => {
    setTried(true);
    if (!validPin(pin) || normaliseDigits(pin) !== normaliseDigits(pin2) || !pinFor) return;
    setPos((x) => ({ pins: { ...x.pins, [pinFor]: normaliseDigits(pin) } }));
    logAction('security', { ar: `ضبط رمز نقطة البيع لـ ${member?.name}`, en: `Set the POS PIN for ${member?.name}` }, { target: pinFor });
    toast({ tone: 'ok', text: tx('حُفظ الرمز', 'PIN saved') });
    setPinFor(null); setPin(''); setPin2(''); setTried(false);
  };
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={tx('رموز الكاشير', 'Cashier PINs')} hint={tx('رمز لكل موظف يبيع أو يعتمد. يُسجَّل كل بيع واسترداد باسمه.', 'One PIN per member who sells or approves. Every sale and refund is recorded under their name.')} />
        <ul className="divide-y divide-border">
          {team.members.filter((m) => m.status === 'active').map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <span className="font-semibold text-fg">{m.name}</span><Badge>{roleName(m.role, tx)}</Badge>
              {!canSell(m.role) && <span className="text-xs text-muted">{tx('يعتمد فقط', 'Approves only')}</span>}
              <span className="ms-auto text-xs text-muted">{s.pins[m.id] ? tx('رمز مضبوط', 'PIN set') : tx('بلا رمز', 'No PIN')}</span>
              <Button size="sm" variant="secondary" onClick={() => setPinFor(m.id)}><KeyRound className="size-4" aria-hidden="true" />{s.pins[m.id] ? tx('غيّر', 'Change') : tx('اضبط', 'Set')}</Button>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title={tx('حد الخصم لكل دور', 'Discount limit per role')} hint={tx('أعلى نسبة يعطيها الدور دون اعتماد مدير. قيمتك أنت.', 'Highest percent a role can give without a manager. Your own rule.')} />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          {ROLES.map((r) => <Field key={r} label={roleName(r, tx)} error={bad.includes(r) ? tx('من 0 إلى 100', '0 to 100') : null}>{(p) => <Input {...p} inputMode="numeric" dir="ltr" value={limits[r]} onChange={(e) => setLimits((l) => ({ ...l, [r]: e.target.value }))} />}</Field>)}
          <Field className="sm:col-span-2" label={tx('سطر في أسفل الإيصال', 'Receipt footer line')} optional>{(p) => <Input {...p} maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} placeholder={tx('مثال: الاستبدال خلال 7 أيام بالإيصال', 'e.g. exchanges within 7 days with receipt')} />}</Field>
        </div>
      </Card>
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2">{tx('ما لم تعتمده «لك» بعد', 'Not yet approved by LAK')}<DecisionMark what={tx('أجهزة نقطة البيع ورسومها وتسعيرها', 'POS hardware, fees and pricing')} /></span>} />
        <dl className="divide-y divide-border px-5 pb-4 text-sm">
          {[[tx('سعر نقطة البيع في باقات «لك»', 'POS price in LAK plans')], [tx('أجهزة الدفع والطابعات المدعومة', 'Supported terminals and printers')], [tx('رسوم العمليات الحضورية (مدى، Apple Pay)', 'In-person fees (mada, Apple Pay)')], [tx('العمل دون اتصال ومزامنة المخزون', 'Offline mode and stock sync')]].map(([k]) => <div key={k} className="flex items-center justify-between gap-3 py-2.5"><dt className="text-muted">{k}</dt><dd><Pending /></dd></div>)}
        </dl>
      </Card>
      <SaveBar dirty={dirty} error={bad.length ? tx('صحّح الحدود قبل الحفظ', 'Fix the limits before saving') : undefined} onSave={save} onDiscard={() => { setLimits(Object.fromEntries(ROLES.map((r) => [r, String(s.limits[r])]))); setNote(s.receiptNote); }} />
      {pinFor && (
        <Modal title={tx(`رمز ${member?.name}`, `PIN for ${member?.name}`)} onClose={() => setPinFor(null)} footer={<><Button variant="secondary" onClick={() => setPinFor(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={savePin}>{tx('احفظ الرمز', 'Save PIN')}</Button></>}>
          <Field label={tx('الرمز الجديد', 'New PIN')} error={tried && !validPin(pin) ? tx('من 4 إلى 6 أرقام', '4 to 6 digits') : null}>{(p) => <Input {...p} type="password" inputMode="numeric" dir="ltr" value={pin} onChange={(e) => setPin(e.target.value)} />}</Field>
          <Field label={tx('أعد الرمز', 'Repeat PIN')} error={tried && validPin(pin) && normaliseDigits(pin) !== normaliseDigits(pin2) ? tx('غير متطابق', 'Does not match') : null}>{(p) => <Input {...p} type="password" inputMode="numeric" dir="ltr" value={pin2} onChange={(e) => setPin2(e.target.value)} />}</Field>
        </Modal>
      )}
    </div>
  );
}
