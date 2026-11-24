import type { ReactNode } from 'react';
import { useLang } from '../../core/lang';
import { link } from '../../core/router';
import { Badge } from '../../core/ui';
import type { L } from './domain';
import { strings } from './i18n';

/* Small site-local building blocks shared by the pages. */

export const site = (path = '', query?: Record<string, string | undefined>) => link(`/site${path ? `/${path}` : ''}`, query);

export function useSite() {
  const { lang, dir } = useLang();
  return { lang, dir, t: strings[lang], tr: (l: L) => l[lang] };
}

type IconName = 'arrow' | 'check' | 'minus' | 'search' | 'menu' | 'close' | 'box' | 'wallet' | 'layers' | 'clock' | 'lock' | 'info' | 'chevron' | 'mail' | 'phone' | 'pin';

const PATHS: Record<IconName, ReactNode> = {
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  minus: <path d="M6 12h12" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  box: <><path d="M4 8l8-4 8 4v8l-8 4-8-4z" /><path d="M4 8l8 4 8-4M12 12v8" /></>,
  wallet: <><rect x="3.5" y="6" width="17" height="13" rx="2" /><path d="M3.5 10h17M15.5 14.5h2" /></>,
  layers: <><path d="M12 4l8 4-8 4-8-4z" /><path d="M4 12l8 4 8-4M4 16l8 4 8-4" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5l3 2" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>,
  chevron: <path d="M9 6l6 6-6 6" />,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></>,
  phone: <path d="M6.5 4h3l1.5 4-2 1.5a10 10 0 005.5 5.5l1.5-2 4 1.5v3a2 2 0 01-2 2A15 15 0 014.5 6a2 2 0 012-2z" />,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
};

/** Inline stroke icon. Direction icons (arrow, chevron) flip in RTL via the `site-flip` class. */
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const flip = name === 'arrow' || name === 'chevron';
  return (
    <svg className={flip ? 'site-icon site-flip' : 'site-icon'} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

/** Capability status. "demo" = built in this prototype; "planned" = in the blueprint, not available. */
export function Status({ s }: { s: 'demo' | 'planned' | 'pending' }) {
  const { t } = useSite();
  if (s === 'demo') return <Badge tone="info">{t.available}</Badge>;
  if (s === 'pending') return <Badge tone="warning">{t.awaitingApproval}</Badge>;
  return <Badge>{t.planned}</Badge>;
}

/** Frame around a real UI fragment built from core components, labelled as example data. */
export function Frame({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  const { t } = useSite();
  return (
    <figure className="site-frame">
      <div className="site-frame-bar">
        <span className="site-frame-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="site-frame-title">{title}</span>
        <span className="site-frame-tag">{t.exampleData}</span>
      </div>
      <div className="site-frame-body">{children}</div>
      {note && <figcaption className="site-frame-note">{note}</figcaption>}
    </figure>
  );
}

/** Standard page intro: eyebrow, h1 (focused on navigation), lead. */
export function Intro({ eyebrow, title, lead, children }: { eyebrow?: string; title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="site-intro">
      {eyebrow && <p className="site-eyebrow">{eyebrow}</p>}
      <h1 className="site-h1" tabIndex={-1} data-page-heading>{title}</h1>
      {lead && <p className="site-lead">{lead}</p>}
      {children}
    </header>
  );
}

export function Section({ id, eyebrow, title, lead, children, tone }: { id: string; eyebrow?: string; title: string; lead?: ReactNode; children: ReactNode; tone?: 'tint' | 'ink' }) {
  return (
    <section className={`site-section${tone ? ` site-section-${tone}` : ''}`} aria-labelledby={id}>
      <div className="site-wrap">
        <div className="site-section-head">
          {eyebrow && <p className="site-eyebrow">{eyebrow}</p>}
          <h2 className="site-h2" id={id}>{title}</h2>
          {lead && <p className="site-section-lead">{lead}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

/** Notice that a block is a draft or awaiting an approved source. */
export function Pending({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="site-pending" role="note">
      <Icon name="info" />
      <div><strong>{title}</strong>{children && <p>{children}</p>}</div>
    </div>
  );
}

/** Scroll to and focus an in-page heading (anchors cannot be used with the hash router). */
export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.scrollIntoView({ block: 'start' });
  el.focus({ preventScroll: true });
}
