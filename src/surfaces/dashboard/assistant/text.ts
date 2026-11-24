// Shared labels and links for assistant drafts (page and home card).
import type { L } from '../../merchant/domain';
import { sectionHref } from '../pages';
import type { Draft } from './model';

export const DRAFT_TITLE: Record<Draft['kind'], L> = {
  transfer: { ar: 'تحويل مخزون بين المستودعات', en: 'Stock transfer between warehouses' },
  automation: { ar: 'مسار أتمتة جديد', en: 'A new automation' },
  carts: { ar: 'استرجاع السلال المتروكة', en: 'Recover abandoned carts' },
  orders: { ar: 'قائمة الطلبات المتأخرة', en: 'Late orders list' },
  analytics: { ar: 'التقارير', en: 'Reports' },
};

export const draftHref = (d: Draft) => sectionHref(d.section, d.path ?? '', d.query);
