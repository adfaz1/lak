import type { L } from '../../../core/lang';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Badge, cn } from '../../../ds/ui';
import { Crumbs, H1, PANEL, WRAP, to, useS } from '../kit';

export const POLICY_IDS = ['shipping', 'returns', 'privacy', 'terms'] as const;
type PolicyId = (typeof POLICY_IDS)[number];

/** Sample policy text for the fixture merchant. Real merchants write and approve their own. */
const BODY: Record<PolicyId, L[]> = {
  shipping: [
    { ar: 'نوصل داخل المملكة العربية السعودية فقط. يجهز الطلب خلال يوم عمل واحد من تأكيد الدفع أو تأكيد طلب الدفع عند الاستلام.', en: 'We deliver within Saudi Arabia only. Orders are prepared within one business day of payment confirmation, or of confirming a cash-on-delivery order.' },
    { ar: 'التوصيل العادي 25 ر.س ومجاني للطلبات من 300 ر.س بعد الخصم. التوصيل السريع 45 ر.س للمدن الرئيسية. الاستلام من معرض العليا بالرياض مجاني.', en: 'Standard delivery is SAR 25, free on orders from SAR 300 after discount. Express delivery is SAR 45 in major cities. Pickup at the Al Olaya showroom in Riyadh is free.' },
    { ar: 'مواعيد التوصيل المعروضة تقديرية: وقت التجهيز + مدة النقل المعتادة لمدينتك، ولا تُحتسب الجمعة والسبت. قد تتأخر الشحنات في المواسم.', en: 'Delivery dates shown are estimates: handling time plus the typical transit time to your city, excluding Friday and Saturday. Shipments may take longer in peak seasons.' },
  ],
  returns: [
    { ar: 'يمكنك طلب استرجاع الملابس والحقائب غير المستخدمة وبحالتها الأصلية خلال 14 يومًا من التسليم، من صفحة الطلب.', en: 'You can request a return of unworn clothing and bags in their original condition within 14 days of delivery, from the order page.' },
    { ar: 'العطور المفتوحة لا تُسترجع لأسباب صحية. القطع التالفة أو المختلفة عن الوصف تُستبدل أو يُسترد مبلغها كاملًا.', en: 'Opened fragrance cannot be returned for hygiene reasons. Damaged items or items not as described are replaced or fully refunded.' },
    { ar: 'يبدأ الاسترداد بعد استلام القطع وفحصها، إلى وسيلة الدفع الأصلية، أو إلى حساب بنكي للطلبات المدفوعة عند الاستلام. رسوم الشحن لا تُسترد.', en: 'Refunds start once items are received and inspected, to the original payment method, or to a bank account for cash-on-delivery orders. Shipping fees are not refunded.' },
  ],
  privacy: [
    { ar: 'نستخدم اسمك وجوالك وعنوانك لتوصيل طلبك والتواصل بشأنه فقط. لا نبيع بياناتك.', en: 'We use your name, mobile and address only to deliver your order and contact you about it. We do not sell your data.' },
    { ar: 'بيانات البطاقة تُدخل لدى مزود الدفع ولا تصل إلى المتجر.', en: 'Card details are entered with the payment provider and never reach the store.' },
  ],
  terms: [
    { ar: 'الأسعار بالريال السعودي وتشمل ضريبة القيمة المضافة 15%. يكتمل الطلب بعد تأكيد الدفع من المزود، أو بتأكيد طلب الدفع عند الاستلام.', en: 'Prices are in Saudi riyals and include 15% VAT. An order is complete once the provider confirms payment, or once a cash-on-delivery order is confirmed.' },
    { ar: 'الدفع عند الاستلام متاح للطلبات حتى 1,000 ر.س، وبحد طلبين غير مدفوعين لكل عميل، وتضاف رسوم 10 ر.س.', en: 'Cash on delivery is available for orders up to SAR 1,000, with at most two unpaid orders per customer, and a SAR 10 fee.' },
  ],
};

export default function PolicyPage({ id }: { id: PolicyId }) {
  const { t, l, lang } = useS();
  const name = (x: PolicyId) => ({ shipping: t.pShipping, returns: t.pReturns, privacy: t.pPrivacy, terms: t.pTerms })[x];
  const Arrow = lang === 'ar' ? ArrowLeft : ArrowRight;
  return (
    <div className={cn(WRAP, 'max-w-3xl py-6 sm:py-10')}>
      <Crumbs items={[{ label: t.home, href: to() }, { label: name(id) }]} />
      <h1 className={H1}>{name(id)}</h1>
      <p className="mt-2"><Badge>{t.sampleText}</Badge></p>
      <div className="mt-8 space-y-5 text-[15px] leading-loose text-fg/90">{BODY[id].map((p) => <p key={p.en}>{l(p)}</p>)}</div>
      <nav aria-label={t.policies} className="mt-12 grid gap-2 border-t border-border pt-6 sm:grid-cols-3">
        {POLICY_IDS.filter((x) => x !== id).map((x) => (
          <a key={x} href={to(`/page/${x}`)} className={cn(PANEL, 'flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium hover:border-fg/30')}>{name(x)}<Arrow className="size-4 text-muted" aria-hidden="true" /></a>
        ))}
      </nav>
    </div>
  );
}
