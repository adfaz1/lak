/* Product photos come from the merchant's licensed set (dashboard/model/media.ts), by merchant product id; products
   without a licensed photo show a neutral placeholder. A photo shows one colour, so when the shopper picks another
   colour the page says which colour the photo shows. */
import { productPhoto } from '../dashboard/model/media';

/** The colour each licensed photo actually shows, for products sold in several colours. */
const SHOWN: Record<string, string> = { p1: 'Black' };

export function photoFor(productId: string, color?: string, size: 'thumb' | 'large' = 'large'): { src: string; shownColor?: string } | undefined {
  const src = productPhoto(productId, size);
  if (!src) return undefined;
  const shown = SHOWN[productId];
  return { src, shownColor: color && shown && color.toLowerCase() !== shown.toLowerCase() ? shown : undefined };
}

export const hasPhoto = (productId: string) => !!productPhoto(productId);
