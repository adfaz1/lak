// Online-store sub-navigation: homepage & theme, pages, menus, SEO, and the domain (which lives in Settings).
import { SearchX } from 'lucide-react';
import { link } from '../../../core/router';
import { Card, EmptyState, LinkButton, useTx } from '../../../ds/ui';
import { PageHeader, Tabs } from '../../../ds/kit';
import { sectionHref } from '../pages';

export type StoreTab = 'theme' | 'themes' | 'pages' | 'landing' | 'blog' | 'menus' | 'redirects' | 'seo';
export const storeHref = (tab?: StoreTab | string, q?: Record<string, string | undefined>) => link(`/dashboard/storefront${tab && tab !== 'theme' ? `/${tab}` : ''}`, q);

export function StoreTabs({ current }: { current: StoreTab }) {
  const tx = useTx();
  return (
    <Tabs label={tx('أقسام المتجر الإلكتروني', 'Online store sections')} items={[
      { href: storeHref('theme'), label: tx('الصفحة الرئيسية', 'Homepage'), current: current === 'theme' },
      { href: storeHref('themes'), label: tx('متجر الثيمات', 'Theme store'), current: current === 'themes' },
      { href: storeHref('pages'), label: tx('الصفحات', 'Pages'), current: current === 'pages' },
      { href: storeHref('landing'), label: tx('صفحات الهبوط', 'Landing pages'), current: current === 'landing' },
      { href: storeHref('blog'), label: tx('المدونة', 'Blog'), current: current === 'blog' },
      { href: storeHref('menus'), label: tx('القوائم', 'Menus'), current: current === 'menus' },
      { href: storeHref('redirects'), label: tx('روابط مخصصة', 'Custom URLs'), current: current === 'redirects' },
      { href: storeHref('seo'), label: tx('محركات البحث', 'SEO'), current: current === 'seo' },
      { href: sectionHref('settings', 'domains'), label: tx('النطاق', 'Domain'), current: false },
      { href: sectionHref('calendar'), label: tx('تقويم التسويق', 'Marketing calendar'), current: false },
    ]} />
  );
}

export function SubNotFound() {
  const tx = useTx();
  return (
    <div className="space-y-6">
      <PageHeader back={{ href: storeHref(), label: tx('المتجر الإلكتروني', 'Online store') }} title={tx('صفحة غير موجودة', 'Page not found')} />
      <Card><EmptyState as="h2" icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا يوجد قسم بهذا الاسم في المتجر الإلكتروني', 'The online store has no section with this name')}
        action={<LinkButton variant="secondary" href={storeHref()}>{tx('المتجر الإلكتروني', 'Online store')}</LinkButton>} /></Card>
    </div>
  );
}
