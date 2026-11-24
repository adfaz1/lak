import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { navigate } from '../../core/router';
import { Money } from '../../core/ui';
import { total } from './domain';
import { canSee, can, canSeeSettings, type SettingsCat } from './perms';
import { ordersStore, productsStore, testStore } from './stores';
import { customerFixtures } from './workspace';
import { Icon, mhref, useL, useTx, type IconName } from './kit';
import { strings } from './i18n';
import { useLang } from '../../core/lang';

interface Result { id: string; group: string; label: string; meta?: React.ReactNode; href: string; icon: IconName }

const CUSTOMERS = customerFixtures();
const SENSITIVE = /(refund|استرد|استرجاع|delete|حذف|send|أرسل|ارسل|publish|انشر|نشر|cancel|ألغ|الغ)/i;

/** Global search and commands. Results navigate only; nothing sensitive runs from here. */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const tx = useTx();
  const l = useL();
  const { lang } = useLang();
  const t = strings[lang];
  const role = testStore.use().role;
  const orders = ordersStore.use();
  const products = productsStore.use();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => opener?.focus();
  }, []);

  const { results, hidden } = useMemo(() => {
    const needle = q.replace(new RegExp(SENSITIVE.source, 'gi'), ' ').trim().toLowerCase();
    const out: Result[] = [];
    const hiddenGroups: string[] = [];
    const cmd = (id: string, ar: string, en: string, href: string, icon: IconName, ok: boolean) => {
      const label = tx(ar, en);
      if (ok && (!needle || label.toLowerCase().includes(needle) || en.toLowerCase().includes(needle) || ar.includes(needle))) out.push({ id, group: tx('أوامر', 'Commands'), label, href, icon });
    };
    cmd('c-new', 'إنشاء منتج', 'Create product', mhref('products/new'), 'plus', can(role, 'product.edit'));
    cmd('c-imp', 'استيراد منتجات من CSV', 'Import products from CSV', mhref('products/import'), 'download', can(role, 'product.import'));
    cmd('c-needs', 'فتح الطلبات التي تحتاج تجهيزًا', 'Open orders that need fulfilment', mhref('orders', { view: 'needs' }), 'orders', canSee(role, 'orders'));
    cmd('c-late', 'فتح الطلبات المتأخرة', 'Open late orders', mhref('orders', { view: 'late' }), 'orders', canSee(role, 'orders'));
    cmd('c-adj', 'تعديل مخزون', 'Adjust stock', mhref('inventory'), 'inventory', can(role, 'inventory.adjust'));
    cmd('c-tr', 'تحويلات المخزون', 'Stock transfers', mhref('inventory', { tab: 'transfers' }), 'inventory', can(role, 'inventory.transfer'));
    cmd('c-coupon', 'إنشاء كوبون', 'Create coupon', mhref('marketing', { tab: 'coupons', create: '1' }), 'marketing', can(role, 'marketing.manage'));
    cmd('c-payouts', 'فتح التحويلات البنكية', 'Open payouts', mhref('finance', { tab: 'payouts' }), 'finance', canSee(role, 'finance'));
    cmd('c-team', 'دعوة عضو فريق', 'Invite a team member', mhref('settings/team'), 'team', can(role, 'team.manage'));
    cmd('c-help', 'فتح المساعدة', 'Open help', mhref('help'), 'help', true);

    if (needle) {
      const digits = needle.replace('#', '');
      if (canSee(role, 'orders')) {
        const exact = /^\d{4,6}$/.test(digits) ? orders.find((o) => o.ref === digits) : undefined;
        if (exact) out.unshift({ id: `open-${exact.ref}`, group: tx('أوامر', 'Commands'), label: tx(`فتح الطلب #${exact.ref}`, `Open order #${exact.ref}`), href: mhref(`orders/${exact.ref}`), icon: 'orders' });
        orders.filter((o) => o.ref.includes(digits) || o.customer.ar.includes(needle) || o.customer.en.toLowerCase().includes(needle)).slice(0, 5).forEach((o) => out.push({
          id: `o-${o.ref}`, group: tx('الطلبات', 'Orders'), label: `#${o.ref} · ${l(o.customer)}`, icon: 'orders', href: mhref(`orders/${o.ref}`),
          meta: <>{t.pay[o.pay]} · {t.ful[o.ful]} · <Money v={total(o)} /></>,
        }));
      } else hiddenGroups.push(tx('الطلبات', 'orders'));
      if (canSee(role, 'products')) {
        products.filter((p) => p.name.ar.includes(needle) || p.name.en.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle)
          || p.variants.some((v) => v.sku.toLowerCase().includes(needle))).slice(0, 5).forEach((p) => out.push({
          id: `p-${p.id}`, group: tx('المنتجات', 'Products'), label: l(p.name), icon: 'products', href: mhref(`products/${p.id}`), meta: <bdi dir="ltr">{p.sku}</bdi>,
        }));
      } else hiddenGroups.push(tx('المنتجات', 'products'));
      if (canSee(role, 'customers')) {
        CUSTOMERS.filter((c) => c.name.ar.includes(needle) || c.name.en.toLowerCase().includes(needle) || c.id.toLowerCase().includes(needle)).slice(0, 5).forEach((c) => out.push({
          id: `c-${c.id}`, group: tx('العملاء', 'Customers'), label: l(c.name), icon: 'customers', href: mhref(`customers/${c.id}`), meta: <>{l(c.city)} · <bdi dir="ltr">{c.id}</bdi></>,
        }));
      } else hiddenGroups.push(tx('العملاء', 'customers'));
      const cats: [SettingsCat, string, string][] = [['store', 'بيانات المتجر', 'Store details'], ['team', 'الفريق والصلاحيات', 'Team & permissions'], ['payments', 'المدفوعات', 'Payments'],
        ['shipping', 'الشحن', 'Shipping'], ['domains', 'النطاقات', 'Domains'], ['policies', 'السياسات', 'Policies'], ['notifications', 'الإشعارات', 'Notifications'], ['language', 'اللغة والمنطقة', 'Language & region']];
      cats.filter(([c, ar, en]) => canSeeSettings(role, c) && (ar.includes(needle) || en.toLowerCase().includes(needle))).forEach(([c, ar, en]) => out.push({
        id: `s-${c}`, group: tx('الإعدادات', 'Settings'), label: tx(ar, en), icon: 'settings', href: mhref(`settings/${c}`),
      }));
    }
    return { results: out, hidden: hiddenGroups };
  }, [q, role, orders, products, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setActive(0); }, [q]);
  const go = (r: Result) => { onClose(); navigate(r.href); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]); }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };
  const sensitive = SENSITIVE.test(q);
  let lastGroup = '';

  return (
    <div className="scrim m-palette-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="m-palette" role="dialog" aria-modal="true" aria-label={tx('البحث والأوامر', 'Search and commands')}>
        <div className="m-palette-input">
          <Icon name="search" />
          <input ref={input} className="grow" role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
            aria-label={tx('ابحث في الطلبات والمنتجات والعملاء والإعدادات', 'Search orders, products, customers and settings')}
            placeholder={tx('مرجع طلب، منتج، SKU، عميل، إعداد…', 'Order ref, product, SKU, customer, setting…')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
          <button type="button" className="btn small" onClick={onClose}>{tx('إغلاق', 'Close')}</button>
        </div>
        {sensitive && (
          <p className="m-palette-note" role="status"><Icon name="alert" size={16} /> {tx('البحث لا ينفذ إجراءات. الاسترداد والإرسال والنشر والحذف تبدأ من صفحتها بمعاينة وتأكيد.', 'Search never runs actions. Refunds, sending, publishing and deleting start from their own page with a preview and confirmation.')}</p>
        )}
        <ul id={listId} role="listbox" className="m-palette-list" aria-label={tx('النتائج', 'Results')}>
          {results.map((r, i) => {
            const head = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <li key={r.id} role="presentation">
                {head && <div className="m-palette-group" role="presentation">{head}</div>}
                <div id={`${listId}-${r.id}`} role="option" aria-selected={i === active} className="m-palette-item" onMouseEnter={() => setActive(i)} onClick={() => go(r)}>
                  <Icon name={r.icon} size={18} /><span className="grow">{r.label}</span>{r.meta && <span className="muted small">{r.meta}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        {q.trim() && results.length === 0 && <p className="m-palette-note" role="status">{tx(`لا نتائج لـ «${q}».`, `No results for “${q}”.`)}</p>}
        {hidden.length > 0 && <p className="m-palette-note small muted">{tx(`نتائج ${hidden.join('، ')} غير معروضة لأن دورك لا يشملها.`, `Results for ${hidden.join(', ')} are withheld because your role doesn’t include them.`)}</p>}
        <p className="m-palette-foot small muted">{tx('↑ ↓ للتنقل، Enter للفتح، Esc للإغلاق', '↑ ↓ to move, Enter to open, Esc to close')}</p>
      </div>
    </div>
  );
}
