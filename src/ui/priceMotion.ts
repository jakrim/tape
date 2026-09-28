import { displayedPriceDirection, formatDisplayPrice } from '../trading/format.ts';

export type PriceGlyph = { key: string; current: string; previous: string; changed: boolean };

// Anchor digits by decimal place. $999.99 -> $1,000.00 must keep ones aligned with ones.
function keyedGlyphs(label: string): { key: string; char: string }[] {
  const point = label.indexOf('.');
  return Array.from(label, (char, index) => ({
    char,
    key: char === '$' ? 'currency' : char === '-' || char === '—' ? 'sign'
      : point >= 0 && index > point ? `fraction-${index - point}`
      : char === '.' ? 'point' : `integer-${(point < 0 ? label.length : point) - index}`,
  }));
}

export function priceTransition(previous: number | undefined, current: number | undefined) {
  const label = current === undefined ? '—' : formatDisplayPrice(current);
  const before = new Map(keyedGlyphs(previous === undefined ? '—' : formatDisplayPrice(previous)).map((g) => [g.key, g.char]));
  const direction = displayedPriceDirection(previous, current);
  const glyphs: PriceGlyph[] = keyedGlyphs(label).map(({ key, char }) => ({
    key, current: char, previous: before.get(key) ?? char,
    changed: direction !== 0 && /\d/.test(char) && before.has(key) && before.get(key) !== char,
  }));
  return { label, direction, glyphs };
}
