// Before / after: the same three screens in the current workspace and in the redesign, with what changed and why it is faster.
import { useState } from 'react';
import { useTx, Icon } from './ui';
import { vhref } from './data';
import { Page } from './index';
import './compare.css';

type Shot = 'home' | 'orders' | 'order' | 'product';

export default function Compare() {
  const tx = useTx();
  const [device, setDevice] = useState<'desk' | 'phone'>('desk');
  const rows: { id: Shot; title: string; href: string; points: { before: string; after: string }[] }[] = [
    {
      id: 'home', title: tx('الرئيسية', 'Home'), href: vhref(''),
      points: [
        { before: tx('أربع بطاقات أرقام متساوية تسبق المهام؛ العين تبدأ بالأرقام لا بما يحتاج قرارًا.', 'Four equal number cards come before the tasks; the eye starts with figures, not decisions.'), after: tx('العنوان يقول كم أمرًا يحتاجك، والطابور أول ما تراه، مرتب حسب أثر المال والوقت، مع إجراء أساسي واحد واضح.', 'The heading says how many things need you, and the queue comes first, ranked by money and time impact, with one clear primary action.') },
        { before: tx('كل مهمة سطر نصي وزر بنفس الوزن.', 'Every task is a text line with an equal-weight button.'), after: tx('كل مهمة: أيقونة بمستوى الخطورة، العدد، المبلغ المتأثر، السبب، صور المنتجات المعنية، وزر بفعل محدد.', 'Each task shows severity icon, count, money at stake, the reason, the products involved and a specific verb.') },
        { before: tx('الرسم بلا قيمة عند المرور ولا بديل جدولي واضح.', 'The chart has no hover value and no obvious table alternative.'), after: tx('رسم لصافي 14 يومًا مكتملًا مع قيمة عند المرور أو التركيز، وتبديل إلى جدول.', '14 complete days of net sales with values on hover or focus, and a switch to a table.') },
      ],
    },
    {
      id: 'orders', title: tx('قائمة الطلبات', 'Orders list'), href: vhref('orders'),
      points: [
        { before: tx('البحث والعروض والتصفية في صفوف منفصلة، والحالات الثلاث أعمدة نصية متجاورة.', 'Search, views and filters sit in separate rows; the three states are adjacent text columns.'), after: tx('شريط أدوات واحد، عروض بأعداد، ومرحلة واحدة مقروءة لكل طلب بأيقونة ولون ونص، مع مؤشرات صغيرة حين تختلف الحالات.', 'One toolbar, views with counts, and one readable stage per order (icon, colour and label), with small indicators when states differ.') },
        { before: tx('لا صور منتجات؛ التاجر يقرأ الأسماء ليتعرف على الطلب.', 'No product images; the merchant reads names to recognise an order.'), after: tx('صور المنتجات في كل صف تجعل التعرف على الطلب فوريًا.', 'Product photos in every row make an order recognisable at a glance.') },
        { before: tx('التفاصيل صفحة منفصلة؛ الرجوع يعيد بناء القائمة.', 'Detail is a separate page; going back rebuilds the list.'), after: tx('في الاتجاه A تفتح التفاصيل بجانب القائمة دون فقد مكانك.', 'In direction A, detail opens beside the list without losing your place.') },
      ],
    },
    {
      id: 'order', title: tx('تفاصيل الطلب', 'Order detail'), href: vhref('orders/10482'),
      points: [
        { before: tx('الإجراء التالي بطاقة بين بطاقات بنفس الوزن.', 'The next action is one card among equal cards.'), after: tx('الإجراء التالي زر أساسي في رأس الطلب، والحالات الثلاث منفصلة ومقروءة.', 'The next action is the primary button in the order header; the three states are separate and readable.') },
        { before: tx('المنتجات أسماء ونصوص فقط.', 'Items are names and text only.'), after: tx('المنتجات بصورها ورمز SKU والكمية، والمبلغ مفصل حتى الصافي بعد الاسترداد.', 'Items with photos, SKU and quantity; money broken down to the net after refunds.') },
      ],
    },
    {
      id: 'product', title: tx('تحرير المنتج', 'Product editing'), href: vhref('products/p1'),
      points: [
        { before: tx('نموذج طويل بأقسام متساوية، والوسائط مربعات نصية.', 'A long form of equal sections; media are text boxes.'), after: tx('الأساسيات أولًا، معرض صور حقيقي بترتيب ونص بديل، وبطاقة معاينة حية للمتجر.', 'Basics first, a real photo gallery with ordering and alt text, and a live storefront card.') },
        { before: tx('الهامش والربح غير ظاهرين أثناء التسعير.', 'Margin and profit are not visible while pricing.'), after: tx('الهامش والربح يُحسبان مباشرة أثناء الكتابة.', 'Margin and profit update as you type.') },
      ],
    },
  ];
  const sfx = device === 'desk' ? 'ar-1440' : 'en-390';
  return (
    <Page>
      <div className="lk-pagehead">
        <div className="lk-col lk-grow lk-gap-4">
          <span className="lk-eyebrow">{tx('مقارنة قبل وبعد', 'Before and after')}</span>
          <h1 className="lk-display">{tx('ما الذي أصبح أوضح وأسرع', 'What became clearer and faster')}</h1>
          <p className="lk-2">{tx('نفس البيانات ونفس القواعد في الحالتين. الصور من الرابط المنشور.', 'Same data and rules in both. Screenshots are from the deployed preview.')}</p>
        </div>
        <div className="lk-seg" role="group" aria-label={tx('الجهاز', 'Device')}>
          <button type="button" aria-pressed={device === 'desk'} onClick={() => setDevice('desk')}>{tx('كمبيوتر · عربي', 'Desktop · Arabic')}</button>
          <button type="button" aria-pressed={device === 'phone'} onClick={() => setDevice('phone')}>{tx('جوال · إنجليزي', 'Phone · English')}</button>
        </div>
      </div>
      {rows.map((r) => (
        <section key={r.id} className="lk-card cmp" aria-labelledby={`cmp-${r.id}`}>
          <div className="lk-card-h"><h2 id={`cmp-${r.id}`} className="lk-h2 lk-grow">{r.title}</h2><a className="lk-btn sm" href={r.href}>{tx('جرّب الشاشة الجديدة', 'Try the new screen')}<Icon name="chevron" size="sm" /></a></div>
          <div className={`cmp-shots ${device}`}>
            <figure><figcaption className="lk-eyebrow">{tx('قبل', 'Before')}</figcaption><img src={`/review/before-${r.id}-${sfx}.png`} alt={tx(`${r.title} قبل`, `${r.title}, before`)} loading="lazy" /></figure>
            <figure><figcaption className="lk-eyebrow after">{tx('بعد', 'After')}</figcaption><img src={`/review/after-${r.id}-${sfx}.png`} alt={tx(`${r.title} بعد`, `${r.title}, after`)} loading="lazy" /></figure>
          </div>
          <ul className="cmp-points">
            {r.points.map((p, i) => (
              <li key={i}><span className="cmp-before"><Icon name="close" size="xs" />{p.before}</span><span className="cmp-after"><Icon name="check" size="xs" />{p.after}</span></li>
            ))}
          </ul>
        </section>
      ))}
    </Page>
  );
}
