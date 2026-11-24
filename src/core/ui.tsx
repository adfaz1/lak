import { useEffect, useRef, type ReactNode } from 'react';
import { formatMoney } from './format';
import { useLang } from './lang';

/* Shared UI kit. Surfaces compose these and the classes in core/styles.css; they do not define their own tokens. */

export function Money({ v }: { v: number }) {
  const { lang } = useLang();
  return <span className="money"><bdi>{formatMoney(v)}</bdi> {lang === 'ar' ? 'ر.س' : 'SAR'}</span>;
}

/** Identifiers (order refs, SKUs, phones, emails) stay left-to-right inside Arabic text. */
export function Id({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
/** Status badge: tone is carried by a shape + the label, never colour alone. */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="grow"><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Card({ title, actions, children, pad = true, id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; pad?: boolean; id?: string }) {
  return (
    <section className="card" aria-labelledby={title && id ? id : undefined}>
      {title && <div className="card-head"><h2 id={id}>{title}</h2>{actions}</div>}
      <div className={pad ? 'card-body' : undefined}>{children}</div>
    </section>
  );
}

export function Metric({ label, value, note }: { label: ReactNode; value: ReactNode; note?: ReactNode }) {
  return <div className="card metric"><span className="muted">{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

export function Field({ id, label, hint, error, children }: { id: string; label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="error" id={`${id}-err`} role="alert">{error}</span>}
    </div>
  );
}

/** Tabs/saved views rendered as links so the selection lives in the URL. */
export function LinkTabs({ label, items }: { label: string; items: { href: string; label: ReactNode; current: boolean }[] }) {
  return (
    <div className="views" role="group" aria-label={label}>
      {items.map((i) => <a key={i.href} className="chip" href={i.href} aria-current={i.current ? 'true' : undefined}>{i.label}</a>)}
    </div>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><span>{children}</span>{action}</div>;
}

export function Alert({ tone = 'danger', title, children }: { tone?: 'danger' | 'warning' | 'info' | 'success'; title?: ReactNode; children?: ReactNode }) {
  return <div className={`alert ${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>{title && <b>{title} </b>}{children}</div>;
}

/** Marks an action or figure as simulated. Put it next to financial and external operations. */
export function Sim() {
  const { lang } = useLang();
  return <span className="sim">{lang === 'ar' ? 'محاكاة' : 'Simulated'}</span>;
}

/** Modal confirmation. States the action, its scope and consequence; returns focus to the opener on close. */
export function Dialog({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus(); };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <h2>{title}</h2>
        <div className="dialog-body">{children}</div>
        <div className="actions">{footer}</div>
      </div>
    </div>
  );
}

/** Sticky bar for unsaved edits: says what is pending and offers save / discard. */
export function SaveBar({ message, onSave, onDiscard, saveLabel, discardLabel }: { message: ReactNode; onSave: () => void; onDiscard: () => void; saveLabel: string; discardLabel: string }) {
  return (
    <div className="save-bar" role="region" aria-live="polite">
      <span className="grow">{message}</span>
      <button type="button" className="btn" onClick={onDiscard}>{discardLabel}</button>
      <button type="button" className="btn primary" onClick={onSave}>{saveLabel}</button>
    </div>
  );
}
