// Product imagery: one mapping from SKU to the licensed photo that shows exactly that product.
// Credits: public/products/credits.json (rendered at /products/credits.html).

const SKU_TO_PRODUCT: [prefix: string, id: string][] = [
  ['ABY', 'p1'], ['SHL', 'p2'], ['OUD', 'p3'], ['BAG', 'p4'], ['WLT', 'p5'], ['COF', 'p6'],
  ['THB', 'p7'], ['MAT', 'p8'], ['INC', 'p9'], ['GFT', 'p10'], ['DAT', 'p11'], ['SCF', 'p12'],
];
/** p7 (thobe) has no suitable licensed photo; p10 is a digital gift card. Both render a neutral placeholder. */
const HAS_PHOTO = new Set(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p8', 'p9', 'p11', 'p12']);

export const productIdForSku = (sku: string): string | undefined => SKU_TO_PRODUCT.find(([p]) => sku.startsWith(p))?.[1];

export function productPhoto(id: string | undefined, size: 'thumb' | 'large' = 'thumb'): string | undefined {
  return id && HAS_PHOTO.has(id) ? `/products/${size === 'thumb' ? 'thumb/' : ''}${id}.jpg` : undefined;
}
export const skuPhoto = (sku: string, size: 'thumb' | 'large' = 'thumb') => productPhoto(productIdForSku(sku), size);
