// «خصّص» on the home: headline figures, cards (show/hide and order), shortcuts and saved views, for this viewer and role.
// Saved in this browser per role; "Restore defaults" brings back the role's starting layout.
import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { Button, cn, useTx } from '../../../ds/ui';
import { Alert, Checkbox, Modal, useToast } from '../../../ds/kit';
import type { Role } from '../../merchant/perms';
import { CARD_IDS, FIGURE_IDS, MAX_SHORTCUTS, MAX_VIEWS, cardAllowed, figureAllowed, moveIn, sameWs, toggleIn, type CardId, type FigureId, type Workspace } from '../model/home';
import { GROUPS, TOOLS, canUseTool } from '../model/tools';
import { useUnsaved } from '../unsaved';
import { defaultWorkspace, resetWorkspace, saveWorkspace } from './state';

export function useFigureLabels() {
  const tx = useTx();
  return {
    net: tx('صافي المبيعات', 'Net sales'), orders: tx('الطلبات', 'Orders'), aov: tx('متوسط قيمة الطلب', 'Average order value'),
    conversion: tx('معدل التحويل', 'Conversion rate'), toFulfil: tx('بانتظار التجهيز', 'To fulfil'), available: tx('الرصيد المتاح', 'Available balance'),
  } satisfies Record<FigureId, string>;
}
export function useCardLabels() {
  const tx = useTx();
  return {
    work: tx('يحتاجك الآن', 'Needs you now'), today: tx('اليوم', 'Today'), assistant: tx('المساعد', 'Assistant'), sales: tx('رسم صافي المبيعات', 'Net sales chart'),
    top: tx('الأكثر مبيعًا', 'Best sellers'), recent: tx('أحدث الطلبات', 'Latest orders'), stock: tx('مخزون يقترب من النفاد', 'Running low'),
  } satisfies Record<CardId, string>;
}

export function Customise({ role, ws, onClose }: { role: Role; ws: Workspace; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const [d, setD] = useState<Workspace>(ws);
  const dirty = !sameWs(d, ws);
  useUnsaved(dirty, { ar: 'تخصيص الرئيسية', en: 'Home customisation' });
  const fig = useFigureLabels();
  const card = useCardLabels();
  const roleName = { owner: tx('المالك', 'Owner'), fulfilment: tx('التجهيز', 'Fulfilment'), finance: tx('المالية', 'Finance'), marketing: tx('التسويق', 'Marketing') }[role];

  const figures = FIGURE_IDS.filter((x) => figureAllowed(role, x));
  const cards = [...d.cards, ...CARD_IDS.filter((x) => !d.cards.includes(x) && cardAllowed(role, x))];
  const tools = TOOLS.filter((x) => canUseTool(x, role));
  const views = tools.filter((x) => x.query);
  const sameAsDefault = sameWs(d, defaultWorkspace(role));

  const save = () => {
    const ok = saveWorkspace(role, d);
    toast({ tone: ok ? 'ok' : 'info', text: ok ? tx('حُفظ التخصيص لهذا الدور في هذا المتصفح', 'Saved for this role in this browser') : tx('طُبّق التخصيص لهذه الجلسة فقط؛ المتصفح لا يسمح بالحفظ', 'Applied for this session only; the browser blocks saving') });
    onClose();
  };
  const restore = () => { resetWorkspace(role); toast({ tone: 'ok', text: tx('عادت الرئيسية إلى افتراضي الدور', 'Home is back to the role default') }); onClose(); };

  return (
    <Modal size="lg" title={tx('خصّص الرئيسية', 'Customise home')} description={tx(`لدور ${roleName}، في هذا المتصفح فقط. لا يغيّر رئيسية زملائك.`, `For the ${roleName} role, in this browser only. Your colleagues’ home does not change.`)} onClose={onClose}
      footer={<>
        <Button variant="ghost" className="me-auto" onClick={restore} disabled={sameAsDefault && sameWs(ws, defaultWorkspace(role))}>{tx('استعد الافتراضي', 'Restore defaults')}</Button>
        <Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button>
        <Button onClick={save} disabled={!dirty || d.figures.length === 0}>{tx('احفظ', 'Save')}</Button>
      </>}>
      <Section title={tx('الأرقام الرئيسية', 'Headline figures')} note={tx('واحد على الأقل', 'At least one')}>
        <div className="grid gap-2 sm:grid-cols-2">
          {figures.map((x) => <Check key={x} label={fig[x]} checked={d.figures.includes(x)} onChange={() => setD({ ...d, figures: FIGURE_IDS.filter((f) => (f === x ? !d.figures.includes(x) : d.figures.includes(f))) })} />)}
        </div>
        {d.figures.length === 0 && <Alert tone="warn">{tx('اختر رقمًا واحدًا على الأقل.', 'Choose at least one figure.')}</Alert>}
      </Section>

      <Section title={tx('البطاقات وترتيبها', 'Cards and their order')}>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {cards.map((x) => {
            const on = d.cards.includes(x);
            const i = d.cards.indexOf(x);
            return (
              <li key={x} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1"><Check label={card[x]} checked={on} onChange={() => setD({ ...d, cards: toggleIn(d.cards, x) })} /></div>
                <button type="button" disabled={!on || i === 0} onClick={() => setD({ ...d, cards: moveIn(d.cards, x, -1) })} aria-label={tx(`انقل «${card[x]}» للأعلى`, `Move “${card[x]}” up`)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"><ArrowUp className="size-4" aria-hidden="true" /></button>
                <button type="button" disabled={!on || i === d.cards.length - 1} onClick={() => setD({ ...d, cards: moveIn(d.cards, x, 1) })} aria-label={tx(`انقل «${card[x]}» للأسفل`, `Move “${card[x]}” down`)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"><ArrowDown className="size-4" aria-hidden="true" /></button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={tx('اختصارات', 'Shortcuts')} note={tx(`${d.shortcuts.length} من ${MAX_SHORTCUTS}`, `${d.shortcuts.length} of ${MAX_SHORTCUTS}`)}>
        <div className="space-y-3">
          {GROUPS.map((g) => {
            const list = tools.filter((x) => x.group === g.id && !x.query);
            if (!list.length) return null;
            return (
              <div key={g.id}>
                <p className="mb-1.5 text-xs font-medium text-muted">{g.label[lang]}</p>
                <div className="flex flex-wrap gap-2">
                  {list.map((x) => {
                    const on = d.shortcuts.includes(x.id);
                    const full = !on && d.shortcuts.length >= MAX_SHORTCUTS;
                    return <button key={x.id} type="button" aria-pressed={on} disabled={full} onClick={() => setD({ ...d, shortcuts: toggleIn(d.shortcuts, x.id, MAX_SHORTCUTS) })}
                      className={cn('inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium transition-colors disabled:opacity-40', on ? 'border-brand-300 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-border text-fg hover:border-brand-300')}>{x.label[lang]}</button>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title={tx('عروض محفوظة', 'Saved views')} note={tx(`${d.views.length} من ${MAX_VIEWS}`, `${d.views.length} of ${MAX_VIEWS}`)}>
        <div className="flex flex-wrap gap-2">
          {views.map((x) => {
            const on = d.views.includes(x.id);
            const full = !on && d.views.length >= MAX_VIEWS;
            return <button key={x.id} type="button" aria-pressed={on} disabled={full} onClick={() => setD({ ...d, views: toggleIn(d.views, x.id, MAX_VIEWS) })}
              className={cn('inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium transition-colors disabled:opacity-40', on ? 'border-brand-300 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-border text-fg hover:border-brand-300')}>{x.label[lang]}</button>;
          })}
        </div>
      </Section>
    </Modal>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 flex w-full items-baseline justify-between gap-2 text-sm font-semibold text-fg"><span>{title}</span>{note && <span className="text-xs font-normal text-subtle">{note}</span>}</legend>
      {children}
    </fieldset>
  );
}

/** Checkbox with its visible label; the whole row toggles it. */
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm text-fg">
      <Checkbox label={label} checked={checked} onChange={onChange} />
      <span className="min-w-0 truncate">{label}</span>
    </label>
  );
}
