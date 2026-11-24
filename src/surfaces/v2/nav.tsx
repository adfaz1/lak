// The whole workspace map in one place: used by the side navigation (A), the "All sections" menu (both directions)
// and the merchant's pinned quick-access bar. Sections not redesigned yet open the current workspace and say so.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createStore } from '../../core/store';
import { link } from '../../core/router';
import { useLang, type L } from '../../core/lang';
import { Icon, useTx, type IconName } from './ui';
import { vhref } from './data';

export interface Dest { id: string; label: L; desc: L; href: string; redesigned?: boolean }
export interface Group { id: string; label: L; icon: IconName; tint: 'purple' | 'cyan' | 'indigo' | 'green' | 'peach'; items: Dest[] }

const m = (page: string) => link(`/merchant/${page}`);
const d = (id: string, ar: string, en: string, dar: string, den: string, href: string, redesigned = false): Dest => ({ id, label: { ar, en }, desc: { ar: dar, en: den }, href, redesigned });

export const GROUPS: Group[] = [
  { id: 'orders', label: { ar: 'الطلبات', en: 'Orders' }, icon: 'orders', tint: 'indigo', items: [
    d('orders', 'إدارة الطلبات', 'Manage orders', 'كل الطلبات، العروض المحفوظة والإجراءات الجماعية', 'All orders, saved views and bulk actions', vhref('orders'), true),
    d('late', 'الطلبات المتأخرة', 'Late orders', 'مدفوعة منذ أكثر من 24 ساعة ولم تُجهّز', 'Paid over 24h ago, not fulfilled', vhref('orders', { view: 'late' }), true),
    d('returns', 'المرتجعات والاستردادات', 'Returns and refunds', 'طلبات الإرجاع والاستردادات المعلقة', 'Return requests and pending refunds', vhref('orders', { view: 'returns' }), true),
    d('payfail', 'مدفوعات متعثرة', 'Failed payments', 'طلبات لم يُحصَّل مبلغها', 'Orders whose payment did not complete', vhref('orders', { view: 'payfail' }), true),
  ] },
  { id: 'catalog', label: { ar: 'المنتجات', en: 'Catalogue' }, icon: 'products', tint: 'purple', items: [
    d('product-edit', 'تحرير المنتج', 'Edit product', 'الصور والسعر والمخزون والخيارات', 'Photos, price, stock and variants', vhref('products/p1'), true),
    d('products', 'قائمة المنتجات', 'Products list', 'البحث والتعديل الجماعي', 'Search and bulk edit', m('products')),
    d('import', 'استيراد المنتجات', 'Import products', 'من ملف CSV مع معاينة الأخطاء', 'From CSV with an error preview', m('products/import')),
    d('inventory', 'المخزون والفروع', 'Inventory and locations', 'المتاح والمحجوز والتحويلات', 'Available, reserved and transfers', m('inventory')),
  ] },
  { id: 'customers', label: { ar: 'العملاء', en: 'Customers' }, icon: 'customers', tint: 'cyan', items: [
    d('customers', 'إدارة العملاء', 'Customers', 'الملفات والطلبات والموافقات', 'Profiles, orders and consent', m('customers')),
    d('segments', 'شرائح العملاء', 'Segments', 'العائدون، الجدد، الأعلى قيمة', 'Returning, new, high value', m('customers?segment=returning')),
  ] },
  { id: 'growth', label: { ar: 'التسويق والنمو', en: 'Marketing and growth' }, icon: 'marketing', tint: 'peach', items: [
    d('coupons', 'الكوبونات والعروض', 'Coupons and offers', 'الشروط والحدود ومعاينة الأثر', 'Conditions, limits and impact preview', m('marketing')),
    d('carts', 'السلال المتروكة', 'Abandoned carts', 'تذكير بموافقة العميل وتكلفة واضحة', 'Consent-based reminders with clear cost', m('marketing?tab=carts')),
    d('automations', 'الأتمتة', 'Automations', 'حدث، شروط، انتظار، إجراء', 'Event, conditions, wait, action', m('automations')),
  ] },
  { id: 'money', label: { ar: 'المالية والتقارير', en: 'Money and reports' }, icon: 'finance', tint: 'green', items: [
    d('finance', 'الأموال والتحويلات', 'Money and payouts', 'المحصل والمعلق والمتاح وكشف التسوية', 'Collected, pending, available and statements', m('finance')),
    d('analytics', 'التحليلات', 'Analytics', 'المبيعات والزيارات والتحويل', 'Sales, visits and conversion', m('analytics')),
  ] },
  { id: 'store', label: { ar: 'المتجر والقنوات', en: 'Store and channels' }, icon: 'store', tint: 'indigo', items: [
    d('theme', 'تصميم المتجر', 'Store design', 'الأقسام والمعاينة والنشر بإصدار', 'Sections, preview and versioned publish', m('storefront')),
    d('market', 'سوق لك', 'LAK marketplace', 'أهلية منتجاتك للإدراج', 'Listing eligibility for your products', link('/market/seller')),
    d('appmaker', 'تطبيق متجرك', 'Your store app', 'تطبيق تسوق بعلامتك لعملائك', 'A shopping app with your brand', link('/appmaker')),
    d('apps', 'التطبيقات', 'Apps', 'الربط والصلاحيات والبيانات', 'Connections, permissions and data', m('apps')),
  ] },
  { id: 'settings', label: { ar: 'الإعدادات', en: 'Settings' }, icon: 'settings', tint: 'cyan', items: [
    d('team', 'الفريق والصلاحيات', 'Team and permissions', 'الأدوار والدعوات والسجل', 'Roles, invites and log', m('settings/team')),
    d('payments', 'طرق الدفع', 'Payment methods', 'حالة كل مزوّد وتحققه', 'Each provider and its verification', m('settings/payments')),
    d('shipping', 'الشحن والتوصيل', 'Shipping and delivery', 'المناطق والأسعار والشحن المجاني', 'Zones, rates and free shipping', m('settings/shipping')),
    d('domains', 'النطاق', 'Domain', 'الرابط المجاني أو نطاقك الخاص', 'Free address or your own domain', m('settings/domains')),
    d('help', 'المساعدة والدعم', 'Help and support', 'مقالات وتذكرة دعم', 'Articles and a support ticket', m('help')),
  ] },
];
export const ALL: Dest[] = GROUPS.flatMap((g) => g.items);

/** The merchant's pinned destinations, in their order. Persisted for the session (prototype). */
export const pinsStore = createStore.key('v2.pins')<string[]>(() => ['orders', 'product-edit', 'finance', 'coupons', 'theme', 'team']);
export const togglePin = (id: string) => pinsStore.set((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

/** "All sections" mega menu: search inside it, pin to quick access, one keystroke away. */
export function AllMenu({ onClose }: { onClose: () => void }) {
  const { lang } = useLang();
  const tx = useTx();
  const pins = pinsStore.use();
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus(); };
  }, []);
  const groups = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return GROUPS;
    return GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => norm(`${i.label.ar} ${i.label.en} ${i.desc.ar} ${i.desc.en} ${g.label.ar} ${g.label.en}`).includes(n)) })).filter((g) => g.items.length);
  }, [q]);
  return (
    <div className="lk-scrim nav-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="nav-mega" role="dialog" aria-modal="true" aria-label={tx('كل الأقسام', 'All sections')}>
        <div className="nav-mega-head">
          <div className="lk-affix lk-grow">
            <Icon name="search" size="sm" />
            <input ref={input} className="lk-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('اكتب للبحث في الأقسام: كوبون، شحن، فريق…', 'Type to find a section: coupon, shipping, team…')} aria-label={tx('البحث في الأقسام', 'Search sections')} />
          </div>
          <button type="button" className="lk-btn icon ghost" aria-label={tx('إغلاق', 'Close')} onClick={onClose}><Icon name="close" /></button>
        </div>
        <p className="lk-micro lk-3 nav-mega-tip"><Icon name="spark" size="xs" /> {tx('ثبّت أي قسم بالنجمة ليظهر في «وصول سريع» على الرئيسية.', 'Pin any section with the star to show it in Quick access on Home.')}</p>
        {groups.length === 0 ? <p className="lk-2" style={{ padding: '24px 4px' }}>{tx('لا قسم بهذا الاسم.', 'No section by that name.')}</p> : (
          <div className="nav-mega-grid">
            {groups.map((g) => (
              <section key={g.id} aria-labelledby={`mg-${g.id}`}>
                <h3 id={`mg-${g.id}`} className="nav-mega-g"><span className={`lk-ic sm ${g.tint}`}><Icon name={g.icon} size="sm" /></span>{g.label[lang]}</h3>
                <ul>
                  {g.items.map((i) => {
                    const pinned = pins.includes(i.id);
                    return (
                      <li key={i.id} className="nav-mega-item">
                        <a href={i.href} onClick={onClose}>
                          <span className="lk-strong">{i.label[lang]}</span>
                          {!i.redesigned && <span className="nav-old">{tx('الإصدار الحالي', 'current')}</span>}
                          <span className="lk-micro lk-3">{i.desc[lang]}</span>
                        </a>
                        <button type="button" className={`nav-pin${pinned ? ' on' : ''}`} aria-pressed={pinned} aria-label={pinned ? tx(`إلغاء تثبيت ${i.label.ar}`, `Unpin ${i.label.en}`) : tx(`تثبيت ${i.label.ar} في الوصول السريع`, `Pin ${i.label.en} to quick access`)} onClick={() => togglePin(i.id)}>
                          <svg viewBox="0 0 24 24" className="lk-icon sm" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></svg>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Side navigation for direction A: every group, collapsible, with the current section open. */
export function SideGroups({ current }: { current: string }) {
  const { lang } = useLang();
  const tx = useTx();
  const owner = GROUPS.find((g) => g.items.some((i) => i.id === current))?.id;
  const [open, setOpen] = useState<string[]>(owner ? [owner] : ['orders']);
  return (
    <div className="nav-side">
      {GROUPS.map((g) => {
        const isOpen = open.includes(g.id);
        return (
          <div key={g.id} className="nav-side-g">
            <button type="button" className="nav-side-h" aria-expanded={isOpen} onClick={() => setOpen((o) => (isOpen ? o.filter((x) => x !== g.id) : [...o, g.id]))}>
              <Icon name={g.icon} /><span className="lk-grow">{g.label[lang]}</span><Icon name="chevronDown" size="sm" />
            </button>
            {isOpen && (
              <ul>
                {g.items.map((i) => (
                  <li key={i.id}><a className="nav-side-l" href={i.href} aria-current={current === i.id ? 'page' : undefined}>
                    <span className="lk-grow">{i.label[lang]}</span>{!i.redesigned && <span className="nav-old" title={tx('لم يُعَد تصميمه بعد', 'Not redesigned yet')}>{tx('الحالي', 'current')}</span>}
                  </a></li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Pinned quick access for Home. */
export function QuickAccess() {
  const { lang } = useLang();
  const tx = useTx();
  const pins = pinsStore.use();
  const [all, setAll] = useState(false);
  const items = pins.map((id) => ({ dest: ALL.find((x) => x.id === id), group: GROUPS.find((g) => g.items.some((i) => i.id === id)) })).filter((x) => x.dest && x.group);
  return (
    <section className="lk-card nav-quick" aria-labelledby="qa-h">
      <div className="lk-card-h flat">
        <span className="lk-ic sm purple"><Icon name="spark" size="sm" /></span>
        <h2 id="qa-h" className="lk-h2 lk-grow">{tx('وصول سريع', 'Quick access')}</h2>
        <button type="button" className="lk-btn sm ghost" onClick={() => setAll(true)}>{tx('تخصيص', 'Customise')}</button>
      </div>
      <div className="nav-quick-row">
        {items.length === 0 ? <p className="lk-small lk-2">{tx('لم تثبّت أي قسم بعد.', 'Nothing pinned yet.')}</p> : items.map(({ dest, group }) => (
          <a key={dest!.id} className="nav-quick-i" href={dest!.href}>
            <span className={`lk-ic sm ${group!.tint}`}><Icon name={group!.icon} size="sm" /></span>
            <span className="lk-small lk-strong">{dest!.label[lang]}</span>
          </a>
        ))}
      </div>
      {all && <AllMenu onClose={() => setAll(false)} />}
    </section>
  );
}
