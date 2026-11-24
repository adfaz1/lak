// Shared pieces of the App Maker section: links, data hook, preview panel, change tags, checklist, issue box.
import { useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Circle, Layers, Play, RefreshCw } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { Badge, Button, Card, CardHeader, LinkButton, Segmented, cn, useTx } from '../../../ds/ui';
import { levelsStore, ordersStore, productsStore, settingsStore } from '../../merchant/stores';
import { ISSUES, type AppConfig, type CheckId, type IssueCode } from '../../appmaker/domain';
import { strings } from '../../appmaker/i18n';
import { appCatalog, effectivePlan, parseOs, parseScreen, type OS, type PageId, type Screen } from './model';
import { Phone, PhoneNote } from './phone';
import { appStore } from './state';

/** Link inside the section: `ah('releases', ['r3'])` → `#/dashboard/appmaker/releases/r3`. */
export const ah = (page: PageId = 'overview', rest: string[] = [], q?: Record<string, string | undefined>) =>
  link(`/dashboard/appmaker${page === 'overview' ? '' : `/${page}`}${rest.map((r) => `/${encodeURIComponent(r)}`).join('')}`, q);

export const useS = () => strings[useLang().lang];

/** Everything the pages read: section state with the store's plan, and the app catalogue from the store. */
export function useAppData() {
  const s = appStore.use();
  const storePlan = settingsStore.use().plan;
  const products = productsStore.use();
  const levels = levelsStore.use();
  const orders = ordersStore.use();
  const plan = effectivePlan(storePlan, s.planOverride);
  return { s, plan, storePlan, products, levels, orders, catalog: appCatalog(products, levels), store: settingsStore.use().store.name };
}

/** Binary change (new version + store review) vs settings update (reaches installed apps at next launch). */
export function ChangeTag({ kind }: { kind: 'binary' | 'config' }) {
  const tx = useTx();
  return kind === 'binary'
    ? <Badge tone="amber" icon={<Layers className="size-3" aria-hidden="true" />}>{tx('إصدار جديد', 'New version')}</Badge>
    : <Badge tone="sky" icon={<RefreshCw className="size-3" aria-hidden="true" />}>{tx('تحديث إعدادات', 'Settings update')}</Badge>;
}

const CHECK_PAGE: Record<CheckId, { page: PageId; q?: Record<string, string> }> = {
  plan: { page: 'overview', q: { focus: 'plan' } }, identity: { page: 'design' }, layout: { page: 'design', q: { focus: 'home' } }, listing: { page: 'listing' }, accounts: { page: 'accounts' },
};

export function Checklist({ checks }: { checks: { id: CheckId; ok: boolean }[] }) {
  const S = useS();
  const tx = useTx();
  return (
    <ul className="divide-y divide-border">
      {checks.map((c) => (
        <li key={c.id} className="flex min-h-12 items-center gap-3 px-5 py-2">
          <span className={cn('grid size-6 shrink-0 place-items-center rounded-full', c.ok ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'border border-dashed border-amber-500 text-amber-700 dark:text-amber-300')} aria-hidden="true">
            {c.ok ? <Check className="size-3.5" /> : <Circle className="size-2 fill-current" />}
          </span>
          <span className="min-w-0 flex-1 text-sm text-fg">{S.checks[c.id]}<span className="sr-only"> — {c.ok ? tx('مكتمل', 'done') : tx('غير مكتمل', 'not done')}</span></span>
          {!c.ok && <a href={ah(CHECK_PAGE[c.id].page, [], CHECK_PAGE[c.id].q)} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('أكمل', 'Fix')}</a>}
        </li>
      ))}
    </ul>
  );
}

export function IssueBox({ code }: { code: IssueCode }) {
  const S = useS();
  const tx = useTx();
  const it = S.issueText[code];
  const meta = ISSUES[code];
  const target = meta.fix === 'listing' ? ah('listing') : meta.fix === 'accounts' ? ah('accounts') : meta.fix === 'layout' ? ah('design', [], { focus: 'features' }) : null;
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4" role="group" aria-label={it.title}>
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200"><AlertTriangle className="size-4 shrink-0" aria-hidden="true" />{it.title}{meta.binary && <ChangeTag kind="binary" />}</p>
      <dl className="mt-2 space-y-1.5 text-[13px]">
        <div><dt className="inline font-semibold text-fg">{tx('السبب: ', 'Cause: ')}</dt><dd className="inline text-muted">{it.cause}</dd></div>
        <div><dt className="inline font-semibold text-fg">{tx('المعالجة: ', 'Fix: ')}</dt><dd className="inline text-muted">{it.fix}</dd></div>
      </dl>
      {target && <LinkButton variant="secondary" size="sm" className="mt-3" href={target}>{S.fixLinks[meta.fix as 'listing' | 'accounts' | 'layout']}</LinkButton>}
    </div>
  );
}

/** The phone preview card. Device, screen and product live in the URL so reload and deep links keep them. */
export function PreviewPanel({ route, base, config, title, action, note }: { route: Route; base: string; config: AppConfig; title?: ReactNode; action?: ReactNode; note?: ReactNode }) {
  const tx = useTx();
  const { catalog } = useAppData();
  const [splash, setSplash] = useState(0);
  const os = parseOs(route.query.get('os'));
  const screen = parseScreen(route.query.get('screen'));
  const productId = route.query.get('p') ?? undefined;
  const go = (patch: Record<string, string | undefined>) => {
    const cur: Record<string, string> = {};
    route.query.forEach((v, k) => { cur[k] = v; });
    replace(link(base, { ...cur, ...patch }));
  };
  return (
    <Card aria-labelledby="am-pv-h" className="lg:sticky lg:top-24">
      <CardHeader id="am-pv-h" title={title ?? tx('معاينة حية', 'Live preview')} hint={tx('معاينة على الويب بألوان متجرك ومنتجاته. لا تثبت سلوك التطبيق الأصلي على iOS أو Android؛ ذلك يُختبر على الأجهزة بعد البناء.', 'A web preview in your store’s colours and products. It does not prove native iOS or Android behaviour; that is tested on devices after the build.')}
        action={action} />
      <div className="space-y-4 px-5 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented<OS> label={tx('الجهاز', 'Device')} value={os} onChange={(v) => go({ os: v === 'ios' ? undefined : v })} options={[{ value: 'ios', label: 'iOS' }, { value: 'android', label: 'Android' }]} />
          <Button variant="ghost" size="sm" onClick={() => setSplash((k) => k + 1)}><Play className="size-4" aria-hidden="true" />{tx('شاشة الافتتاح', 'Splash')}</Button>
        </div>
        <Phone config={config} catalog={catalog} os={os} screen={screen} productId={productId} splashKey={splash}
          onNav={(sc: Screen, id?: string) => go({ screen: sc === 'home' ? undefined : sc, p: sc === 'product' ? id ?? productId : undefined })} />
        <PhoneNote>{note ?? tx('معاينة ويب للتوضيح. الدفع معطّل فيها.', 'Web preview for illustration. Checkout is disabled.')}</PhoneNote>
      </div>
    </Card>
  );
}
