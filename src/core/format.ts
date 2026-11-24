/** Money is always integer minor units (halalas). Never floats for balances. */
export function formatMoney(halalas: number): string {
  return (halalas / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatInt(n: number): string {
  return n.toLocaleString('en-US');
}

/** VAT contained in a VAT-inclusive amount at 15%. */
export function vatIncluded(halalas: number): number {
  return Math.round((halalas * 15) / 115);
}
