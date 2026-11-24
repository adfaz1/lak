// Shared inventory view parts (names, status tones, product cell).
import type { ReactNode } from 'react';
import { useLang } from '../../../core/lang';
import type { LogReason, TransferStatus } from '../../merchant/inventory';
import { ProductImage, Ref, useTx, type Tone } from '../../../ds/ui';
import { skuPhoto } from '../model/media';
import type { SkuInfo } from './model';

export const T_TONE: Record<TransferStatus, Tone> = { draft: 'gray', sent: 'sky', partial: 'amber', received: 'green', closed: 'amber' };

export function useInvNames() {
  const tx = useTx();
  return {
    reason: (r: LogReason) => ({ received: tx('استلام من مورد', 'Received from supplier'), count: tx('تصحيح جرد', 'Count correction'), damaged: tx('تالف', 'Damaged'), returned: tx('مرتجع من عميل', 'Customer return'),
      other: tx('أخرى', 'Other'), transferOut: tx('تحويل صادر', 'Transfer out'), transferIn: tx('تحويل وارد', 'Transfer in'), discrepancy: tx('فرق تحويل', 'Transfer discrepancy'), fulfilled: tx('تجهيز طلب', 'Order fulfilled') })[r],
    status: (s: TransferStatus) => ({ draft: tx('مسودة', 'Draft'), sent: tx('مُرسل', 'Sent'), partial: tx('استلام جزئي', 'Partly received'), received: tx('مستلم بالكامل', 'Fully received'), closed: tx('مغلق بفرق', 'Closed with discrepancy') })[s],
  };
}

/** Product cell used by every inventory table. */
export function SkuCell({ sku, info, sub }: { sku: string; info: SkuInfo; sub?: ReactNode }) {
  const { lang } = useLang();
  return (
    <span className="flex items-center gap-3">
      <ProductImage src={skuPhoto(sku)} alt={info.name[lang]} size={40} />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-fg">{info.name[lang]}{info.variant && <span className="font-normal text-muted"> · {info.variant}</span>}</span>
        <span className="block text-xs font-normal text-muted"><Ref>{sku}</Ref>{sub && <> · {sub}</>}</span>
      </span>
    </span>
  );
}

