// Storefront side of the WhatsApp and QR/short-link apps: the floating WhatsApp button with a message prefilled for the
// page, and the short-link visit (`?lk=CODE`) that is counted, remembered for attribution and, for a coupon link,
// puts the coupon in the bag. Nothing renders unless the app is installed and on.
import { useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import { useLang } from '../../../../core/lang';
import type { Route } from '../../../../core/router';
import { cn } from '../../../../ds/ui';
import { freeAppsStore } from './registry';
import { buttonTarget, prefill, waMeLink, type WaPage } from './whatsapp-model';
import { linkCodeOf, type QrSettings } from './qr-model';
import { recordLinkVisit } from './integrations-state';
import { cartStore } from '../../../storefront/state';
import { useCatalog, useCategories } from '../../../storefront/data';

/** Count a short-link visit once per address; a coupon link applies its code to the bag. */
export function useLinkVisit(route: Route) {
  const code = linkCodeOf(route.query);
  useEffect(() => {
    if (!code) return;
    const apps = freeAppsStore.get();
    if (!apps.qr?.on) return;
    const l = ((apps.qr.settings as Partial<QrSettings>).links ?? []).find((x) => x.code === code && x.on);
    if (!l) return;
    recordLinkVisit(code);
    if (l.kind === 'coupon') cartStore.set((c) => ({ ...c, coupon: l.target }));
  }, [code]);
}

export function StoreWhatsApp({ route }: { route: Route }) {
  const { lang } = useLang();
  const apps = freeAppsStore.use();
  const catalog = useCatalog();
  const cats = useCategories();
  const t = buttonTarget(apps);
  if (!t || route.path[0] === 'checkout') return null;
  const [a, b] = route.path;
  const page: WaPage = a === 'p' ? 'product' : a === 'c' ? 'category' : a === 'cart' ? 'cart' : 'other';
  const name = a === 'p' ? catalog.find((p) => p.id === b)?.name[lang] : a === 'c' ? cats.find((c) => c.id === b)?.name[lang] : undefined;
  const text = prefill(t.s, lang, page, name);
  const label = lang === 'ar' ? 'راسلنا على واتساب' : 'Message us on WhatsApp';
  return (
    <a href={waMeLink(t.phone, text)} target="_blank" rel="noopener" aria-label={label} title={label} data-free-app="whatsapp"
      className={cn('fixed bottom-4 z-40 grid size-14 place-items-center rounded-full bg-[#1fa855] text-white shadow-pop transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2', t.s.button.side === 'start' ? 'start-4' : 'end-4')}>
      <MessageCircle className="size-7" aria-hidden="true" />
    </a>
  );
}
