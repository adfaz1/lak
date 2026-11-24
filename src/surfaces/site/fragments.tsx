import { vatIncluded } from '../../core/format';
import { Badge, Id, Money } from '../../core/ui';
import type { L } from './domain';
import { Frame, Icon, useSite } from './kit';

/* Real UI fragments built from core components, used as product evidence on marketing pages.
   They render example data and say so; they are not screenshots and not live numbers. */

const T = {
  ar: {
    order: 'طلب', customer: 'العميل', pay: 'الدفع', ful: 'التجهيز', ship: 'الشحنة',
    paid: 'مدفوع', needsPrep: 'يحتاج تجهيزًا', noShip: 'لم تُنشأ', subtotal: 'المنتجات', shipping: 'الشحن', total: 'الإجمالي', vat: 'يشمل ضريبة القيمة المضافة',
    orderTitle: 'تفاصيل طلب', moneyTitle: 'أموال هذا الأسبوع', stockTitle: 'المخزون حسب المستودع',
    collected: 'حصّله مزود الدفع', pendingSettle: 'بانتظار التسوية', refunded: 'أُعيد للعملاء', fees: 'رسوم المزود', feesV: 'حسب عقد المزود',
    ref: 'مرجع', sku: 'SKU', product: 'المنتج', riyadh: 'الرياض', jeddah: 'جدة', available: 'المتاح', reserved: 'محجوز',
    low: 'منخفض', out: 'نفد', ok: 'متوفر',
    timeline: 'حالات الطلب المستقلة',
    s1: 'بدأ الدفع', s1d: 'العميل في صفحة المزود', s2: 'أكّد المزود الدفع', s2d: 'المصدر: إشعار المزود، لا صفحة الشكر', s3: 'جُهّز الطلب', s3d: 'حالة تجهيز منفصلة', s4: 'أُنشئت الشحنة', s4d: 'رقم بوليصة من الناقل', s5: 'طُلب استرداد', s5d: 'مبلغ وطريقة ومرجع قبل التأكيد',
    loyaltyTitle: 'قاعدة نقاط الولاء', earn: 'نقطة لكل 10 ر.س على الطلبات المسلّمة', holdNote: 'معلقة حتى انتهاء مهلة الإرجاع (14 يومًا)', pendingPts: 'نقاط معلقة', availablePts: 'نقاط متاحة', cancelledPts: 'أُلغيت بسبب استرداد',
    campaignTitle: 'مسودة حملة', channel: 'القناة', budget: 'ميزانية المنصة الإعلانية', budgetNote: 'تُدفع للمنصة الإعلانية مباشرة', lakFee: 'رسوم لك', lakFeeV: 'بانتظار الاعتماد', launch: 'إطلاق الحملة', launchWhy: 'غير متاح في هذه المعاينة: لا يوجد ربط حقيقي بحساب إعلاني.', draft: 'مسودة', days: '14 يومًا',
  },
  en: {
    order: 'Order', customer: 'Customer', pay: 'Payment', ful: 'Fulfilment', ship: 'Shipment',
    paid: 'Paid', needsPrep: 'Needs preparing', noShip: 'Not created', subtotal: 'Items', shipping: 'Shipping', total: 'Total', vat: 'Includes VAT',
    orderTitle: 'Order detail', moneyTitle: 'Money this week', stockTitle: 'Stock by warehouse',
    collected: 'Collected by provider', pendingSettle: 'Pending settlement', refunded: 'Returned to customers', fees: 'Provider fees', feesV: 'Per provider contract',
    ref: 'Ref', sku: 'SKU', product: 'Product', riyadh: 'Riyadh', jeddah: 'Jeddah', available: 'Available', reserved: 'Reserved',
    low: 'Low', out: 'Out', ok: 'In stock',
    timeline: 'Independent order states',
    s1: 'Payment started', s1d: 'Customer is on the provider page', s2: 'Provider confirmed payment', s2d: 'Source: provider notice, not the thank-you page', s3: 'Order prepared', s3d: 'A separate fulfilment state', s4: 'Shipment created', s4d: 'Label number from the carrier', s5: 'Refund requested', s5d: 'Amount, method and reference before confirming',
    loyaltyTitle: 'Loyalty points rule', earn: '1 point per SAR 10 on delivered orders', holdNote: 'Pending until the return window closes (14 days)', pendingPts: 'Pending points', availablePts: 'Available points', cancelledPts: 'Cancelled by a refund',
    campaignTitle: 'Campaign draft', channel: 'Channel', budget: 'Ad platform budget', budgetNote: 'Paid to the ad platform directly', lakFee: 'LAK fee', lakFeeV: 'Awaiting approval', launch: 'Launch campaign', launchWhy: 'Not available in this preview: there is no real ad account connection.', draft: 'Draft', days: '14 days',
  },
};

const useF = () => { const { lang } = useSite(); return { lang, f: T[lang] }; };

const ORDER = {
  ref: '#10482', customer: { ar: 'نورة ع.', en: 'Noura A.' } as L,
  lines: [
    { name: { ar: 'عطر عود 50 مل', en: 'Oud perfume 50 ml' } as L, qty: 1, price: 24500 },
    { name: { ar: 'تغليف هدية', en: 'Gift wrap' } as L, qty: 1, price: 1500 },
  ],
  shipping: 2500,
};

export function OrderFragment() {
  const { lang, f } = useF();
  const items = ORDER.lines.reduce((s, l) => s + l.qty * l.price, 0);
  const total = items + ORDER.shipping;
  return (
    <Frame title={f.orderTitle}>
      <div className="site-frag">
        <div className="site-frag-head">
          <span className="strong">{f.order} <Id>{ORDER.ref}</Id></span>
          <span className="muted small">{f.customer}: {ORDER.customer[lang]}</span>
        </div>
        <dl className="site-states">
          <div><dt>{f.pay}</dt><dd><Badge tone="success">{f.paid}</Badge></dd></div>
          <div><dt>{f.ful}</dt><dd><Badge tone="warning">{f.needsPrep}</Badge></dd></div>
          <div><dt>{f.ship}</dt><dd><Badge>{f.noShip}</Badge></dd></div>
        </dl>
        <ul className="lines">
          {ORDER.lines.map((l) => (
            <li key={l.name.en}><span className="grow">{l.name[lang]} <span className="muted">× {l.qty}</span></span><span className="amount"><Money v={l.qty * l.price} /></span></li>
          ))}
        </ul>
        <div className="breakdown">
          <div><span>{f.subtotal}</span><Money v={items} /></div>
          <div><span>{f.shipping}</span><Money v={ORDER.shipping} /></div>
          <div className="sum"><span>{f.total}</span><Money v={total} /></div>
          <div className="muted small"><span>{f.vat}</span><Money v={vatIncluded(total)} /></div>
        </div>
      </div>
    </Frame>
  );
}

export function MoneyFragment() {
  const { f } = useF();
  const rows: { label: string; v: number; tone: 'success' | 'info' | 'neutral' }[] = [
    { label: f.collected, v: 342000, tone: 'success' },
    { label: f.pendingSettle, v: 118500, tone: 'info' },
    { label: f.refunded, v: -18500, tone: 'neutral' },
  ];
  return (
    <Frame title={f.moneyTitle}>
      <div className="site-frag">
        <ul className="site-money">
          {rows.map((r) => (
            <li key={r.label}><Badge tone={r.tone}>{r.label}</Badge><strong><Money v={r.v} /></strong></li>
          ))}
          <li><span className="muted">{f.fees}</span><span className="muted small">{f.feesV}</span></li>
        </ul>
        <p className="muted small">{f.ref}: <Id>STL-2026-W47</Id></p>
      </div>
    </Frame>
  );
}

export function StockFragment() {
  const { lang, f } = useF();
  const rows = [
    { sku: 'OUD-50', name: { ar: 'عطر عود 50 مل', en: 'Oud perfume 50 ml' } as L, r: 14, j: 6, res: 3 },
    { sku: 'MSK-100', name: { ar: 'مسك أبيض 100 مل', en: 'White musk 100 ml' } as L, r: 2, j: 1, res: 1 },
    { sku: 'BKH-SET', name: { ar: 'طقم بخور', en: 'Incense set' } as L, r: 0, j: 0, res: 0 },
  ];
  return (
    <Frame title={f.stockTitle}>
      <ul className="site-stock">
        {rows.map((r) => {
          const avail = r.r + r.j - r.res;
          const tone = avail <= 0 ? 'danger' : avail <= 3 ? 'warning' : 'success';
          return (
            <li key={r.sku}>
              <div className="site-stock-name"><span className="strong">{r.name[lang]}</span><span className="muted small">{f.sku} <Id>{r.sku}</Id></span></div>
              <dl className="site-stock-nums">
                <div><dt>{f.riyadh}</dt><dd>{r.r}</dd></div>
                <div><dt>{f.jeddah}</dt><dd>{r.j}</dd></div>
                <div><dt>{f.reserved}</dt><dd>{r.res}</dd></div>
                <div><dt>{f.available}</dt><dd className="strong">{avail}</dd></div>
              </dl>
              <Badge tone={tone}>{tone === 'danger' ? f.out : tone === 'warning' ? f.low : f.ok}</Badge>
            </li>
          );
        })}
      </ul>
    </Frame>
  );
}

export function PaymentStatesFragment() {
  const { f } = useF();
  const steps = [
    { t: f.s1, d: f.s1d, done: true }, { t: f.s2, d: f.s2d, done: true }, { t: f.s3, d: f.s3d, done: true },
    { t: f.s4, d: f.s4d, done: false }, { t: f.s5, d: f.s5d, done: false },
  ];
  return (
    <Frame title={f.timeline}>
      <ol className="site-timeline">
        {steps.map((s) => (
          <li key={s.t} data-done={s.done || undefined}>
            <span className="site-dot" aria-hidden="true">{s.done && <Icon name="check" size={14} />}</span>
            <div><span className="strong">{s.t}</span><span className="muted small">{s.d}</span></div>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

export function LoyaltyFragment() {
  const { f } = useF();
  return (
    <Frame title={f.loyaltyTitle}>
      <div className="site-frag">
        <p className="strong">{f.earn}</p>
        <p className="muted small">{f.holdNote}</p>
        <ul className="site-money">
          <li><Badge tone="info">{f.pendingPts}</Badge><strong>240</strong></li>
          <li><Badge tone="success">{f.availablePts}</Badge><strong>1,120</strong></li>
          <li><Badge>{f.cancelledPts}</Badge><strong>−60</strong></li>
        </ul>
      </div>
    </Frame>
  );
}

export function CampaignFragment() {
  const { f } = useF();
  return (
    <Frame title={f.campaignTitle}>
      <div className="site-frag">
        <div className="site-frag-head"><span className="strong">{f.channel}: <bdi>TikTok</bdi></span><Badge>{f.draft}</Badge></div>
        <div className="breakdown">
          <div><span>{f.budget} · {f.days}</span><Money v={150000} /></div>
          <div className="muted small"><span>{f.budgetNote}</span></div>
          <div><span>{f.lakFee}</span><span className="muted">{f.lakFeeV}</span></div>
        </div>
        <button type="button" className="btn primary" disabled aria-describedby="site-launch-why">{f.launch}</button>
        <p className="muted small" id="site-launch-why">{f.launchWhy}</p>
      </div>
    </Frame>
  );
}
