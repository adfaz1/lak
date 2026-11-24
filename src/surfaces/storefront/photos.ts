/* Product photos for the demo merchant. Only licensed photos from the shared set (dashboard/model/media.ts) that show
   the same kind of product are used; every other product shows a neutral placeholder. A photo shows one colour,
   so when the shopper picks another colour the page says which colour the photo shows. */
import { productPhoto } from '../dashboard/model/media';
import type { ColorId } from './domain';

const PHOTOS: Record<string, { photo: string; color?: ColorId }> = {
  'embroidered-abaya': { photo: 'p1', color: 'black' },
  'night-oud': { photo: 'p3' },
  'leather-tote': { photo: 'p4', color: 'camel' },
  'crepe-shayla': { photo: 'p12', color: 'olive' },
};

export function photoFor(productId: string, color?: ColorId, size: 'thumb' | 'large' = 'large'): { src: string; shownColor?: ColorId } | undefined {
  const m = PHOTOS[productId];
  const src = m && productPhoto(m.photo, size);
  if (!m || !src) return undefined;
  return { src, shownColor: color && m.color && color !== m.color ? m.color : undefined };
}

export const hasPhoto = (productId: string) => !!PHOTOS[productId];
