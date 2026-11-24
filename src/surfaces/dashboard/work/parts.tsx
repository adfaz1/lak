// Text, icons and rows for work items, shared by the work centre page and the home's «يحتاجك الآن».
import type { ReactNode } from 'react';
import { AlarmClock, ArrowLeft, Boxes, CreditCard, Landmark, PackageCheck, PlugZap, RotateCcw, Workflow } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { productsStore } from '../../merchant/stores';
import { Money, ProductImage, LinkButton, cn, toneDot, useTx, type Tone } from '../../../ds/ui';
import { productIdForSku, skuPhoto } from '../model/media';
import { sectionHref } from '../pages';
import { locName, type WorkItem, type WorkKind } from './model';

const ICON: Record<WorkKind, ReactNode> = {
  late: <AlarmClock className="size-5" />, payfail: <CreditCard className="size-5" />, fulfil: <PackageCheck className="size-5" />,
  refunds: <RotateCcw className="size-5" />, stock: <Boxes className="size-5" />, settlement: <Landmark className="size-5" />,
  integration: <PlugZap className="size-5" />, automation: <Workflow className="size-5" />,
};
export const TINT: Record<Tone, string> = { red: 'bg-red-500/10 text-red-600 dark:text-red-400', brand: 'bg-brand-500/10 text-brand-600 dark:text-brand-300', amber: 'bg-amber-500/12 text-amber-700 dark:text-amber-300', green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', gray: 'bg-surface-2 text-muted' };
const toneOf = (x: WorkItem): Tone => (x.kind === 'fulfil' ? 'brand' : x.severity === 3 ? 'red' : x.severity === 2 ? 'amber' : 'sky');

export const itemHref = (x: WorkItem) => sectionHref(x.action.section, x.action.path ?? '', x.action.query);

export function useAgo() {
  const tx = useTx();
  return (h: number) => (h < 24 ? tx(`قبل ${h} س`, `${h}h ago`) : tx(`قبل ${Math.round(h / 24)} ي`, `${Math.round(h / 24)}d ago`));
}

/** Title, reason, call to action and money label of an item, in the viewer's language. */
export function useWorkText() {
  const tx = useTx();
  const { lang } = useLang();
  const products = productsStore.use();
  const ago = useAgo();
  const productName = (sku: string) => products.find((p) => p.id === productIdForSku(sku))?.name[lang] ?? sku;
  return (x: WorkItem) => {
    const f = x.facts;
    const age = x.oldestHours !== null ? tx(`الأقدم ${ago(x.oldestHours)}`, `oldest ${ago(x.oldestHours)}`) : '';
    switch (x.kind) {
      case 'late': return { title: tx('طلبات متأخرة عن التجهيز', 'Orders late to fulfil'), why: [tx('مدفوعة منذ أكثر من 24 ساعة ولم تُجهّز', 'Paid over 24 hours ago, not fulfilled'), age].filter(Boolean).join(' · '), cta: tx('جهّز الآن', 'Fulfil now'), money: tx('قيمة الطلبات', 'Order value') };
      case 'payfail': return { title: tx('مدفوعات لم تكتمل', 'Payments not completed'), why: [tx('رفض المزوّد الدفع أو لم يؤكده؛ لا يُجهّز الطلب قبل الدفع', 'The provider declined or did not confirm; not fulfilled until paid'), age].filter(Boolean).join(' · '), cta: tx('راجع', 'Review'), money: tx('غير محصّل', 'Not collected') };
      case 'fulfil': return { title: tx('طلبات جاهزة للتجهيز', 'Orders ready to fulfil'), why: [tx('مدفوعة وضمن مهلة 24 ساعة', 'Paid, within the 24-hour window'), age].filter(Boolean).join(' · '), cta: tx('ابدأ التجهيز', 'Start'), money: tx('قيمة الطلبات', 'Order value') };
      case 'refunds': return { title: tx('استردادات بانتظار المزوّد', 'Refunds awaiting provider'), why: tx('طُلبت ولم يؤكدها مزوّد الدفع بعد؛ العميل لم يستلم المبلغ', 'Requested, not yet confirmed by the provider; the customer has not been paid'), cta: tx('تابع', 'Track'), money: tx('مبالغ الاسترداد', 'Refund amount') };
      case 'stock': {
        const sku = String(f.sku);
        const where = locName(String(f.loc))[lang];
        const state = f.total === 0 ? tx('نفد من كل المستودعات', 'Sold out in every warehouse') : tx(`${f.available} متاح في ${where}`, `${f.available} left in ${where}`);
        const cover = f.cover !== null ? tx(`يكفي نحو ${f.cover} يوم بمعدل البيع`, `about ${f.cover} days at the sales rate`) : f.history === 'noSales' ? tx('لا مبيعات مسجلة', 'no recorded sales') : tx('سجل المبيعات أقل من 14 يومًا فلا تقدير', 'under 14 days of sales history, no estimate');
        const spare = Number(f.spare) > 0 ? tx(`فائض ${f.spare} في ${locName(String(f.from)).ar}`, `${f.spare} spare in ${locName(String(f.from)).en}`) : '';
        return { title: productName(sku), sub: sku, why: [state, cover, spare].filter(Boolean).join(' · '), cta: Number(f.spare) > 0 ? tx('حضّر تحويلًا', 'Draft a transfer') : tx('المخزون', 'Inventory'), money: tx('مبيعات قد تفوت خلال 7 أيام (تقدير)', 'Sales at risk in 7 days (estimate)') };
      }
      case 'settlement': return f.problem === 'diff'
        ? { title: tx(`التحويل ${f.payout} لا يطابق كشفه`, `Payout ${f.payout} does not match its statement`), why: tx('المبلغ المحوّل يختلف عن صافي العمليات في الكشف', 'The transferred amount differs from the statement net'), cta: tx('طابِق', 'Reconcile'), money: tx('الفرق', 'Difference') }
        : { title: tx(`التحويل ${f.payout} لم يصل بعد`, `Payout ${f.payout} has not arrived`), why: tx(`قيد التحويل منذ ${f.date}، أكثر من 3 أيام`, `In transit since ${f.date}, over 3 days`), cta: tx('افتح الكشف', 'Open statement'), money: tx('مبلغ التحويل', 'Payout amount') };
      case 'integration': {
        const name = x.subject?.[lang] ?? '';
        if (f.what === 'app') return { title: name, why: f.state === 'error' ? tx('الربط يفشل؛ توقفت المزامنة', 'The connection is failing; sync stopped') : tx('انتهت صلاحية الربط؛ يحتاج إعادة تفويض', 'Access expired; needs re-authorising'), cta: tx('أصلِح', 'Fix'), money: '' };
        if (f.what === 'provider') return { title: tx(`${name} يحتاج إجراءً`, `${name} needs action`), why: tx('المزوّد طلب بيانات؛ لا يظهر للعملاء في الدفع حتى تكتمل', 'The provider asked for details; customers cannot use it until done'), cta: tx('أكمل', 'Complete'), money: '' };
        return { title: tx(`النطاق ${name}`, `Domain ${name}`), why: tx('فشل التحقق من سجلات DNS؛ المتجر يعمل على الرابط المجاني', 'DNS verification failed; the store runs on the free link'), cta: tx('أصلِح', 'Fix'), money: '' };
      }
      case 'automation': return { title: tx(`«${x.subject?.ar}»: تشغيلات فشلت`, `“${x.subject?.en}”: failed runs`), why: tx(`${f.failed} فشل · آخر سبب: ${f.reasonAr}`, `${f.failed} failed · last reason: ${f.reasonEn}`), cta: tx('راجع السجل', 'Review log'), money: '' };
    }
  };
}

/** Counts shown next to an item: orders and customers affected. */
export function useImpact() {
  const tx = useTx();
  return (x: WorkItem) => [
    x.orders ? tx(`${x.orders} طلب`, `${x.orders} orders`) : null,
    x.customers ? tx(`${x.customers} عميل`, `${x.customers} customers`) : null,
  ].filter(Boolean).join(' · ');
}

/** Compact row with the look of the home's original task rows. */
export function WorkRow({ x, primary, aside }: { x: WorkItem; primary: boolean; aside?: ReactNode }) {
  const text = useWorkText()(x);
  const impact = useImpact()(x);
  const tone = toneOf(x);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', TINT[tone])} aria-hidden="true">{ICON[x.kind]}</span>
      <div className="min-w-0 flex-1 basis-40">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg"><span className={cn('size-1.5 shrink-0 rounded-full', toneDot[tone])} aria-hidden="true" /><span className="truncate">{text.title}</span></p>
        <p className="mt-0.5 text-xs text-muted">{[impact, text.why].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="flex w-full items-center justify-end gap-2 ps-15 sm:w-auto sm:gap-4 sm:ps-0">
        {x.money > 0 && <span className="me-auto flex min-w-0 flex-col items-start sm:me-0 sm:items-end"><Money v={x.money} className="text-sm font-semibold text-fg" /><span className="max-w-32 truncate text-[11px] text-subtle sm:max-w-none" title={text.money}>{text.money}</span></span>}
        {x.skus.length > 0 && (
          <div className="hidden -space-x-2 md:flex rtl:space-x-reverse" aria-hidden="true">
            {x.skus.slice(0, 3).map((s) => <ProductImage key={s} src={skuPhoto(s)} alt="" size={30} className="ring-2 ring-surface" />)}
          </div>
        )}
        {aside}
        <LinkButton href={itemHref(x)} variant={primary ? 'primary' : 'secondary'} size="sm">
          {text.cta}<ArrowLeft className="size-3.5 ltr:rotate-180" aria-hidden="true" />
        </LinkButton>
      </div>
    </li>
  );
}
