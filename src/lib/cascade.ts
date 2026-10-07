/**
 * A page's breakpoint CSS in the order Elementor writes it: widest first.
 *
 * Each page carries its widgets' breakpoint overrides as `@media` blocks with
 * `!important` declarations, and two blocks that both match a phone are
 * settled by source order. Elementor emits its tablet rules (max-width:1024px)
 * before its mobile ones (max-width:767px), so the mobile value wins on a
 * phone. The extractor wrote them the other way round on 869 of the 870 pages
 * and posts that carry both -- so at 390px every widget with a tablet AND a
 * mobile value took the tablet one. The posts' H1 is 21px at tablet and 25px
 * on a phone, and every post rendered it at 21.
 *
 * This reorders the top-level blocks rather than the data: plain rules first,
 * then `min-width` blocks, then `max-width` blocks from widest to narrowest,
 * each group otherwise in its original order.
 */
export function widestFirst(css: string): string {
  if (!css || !css.includes('@media')) return css;
  const blocks: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        blocks.push(css.slice(start, i + 1));
        start = i + 1;
      }
    }
  }
  const tail = css.slice(start);
  // Unbalanced input is left exactly as it was rather than half-reordered.
  if (depth !== 0 || tail.trim()) return css;

  const rank = (b: string): [number, number] => {
    const head = b.slice(0, b.indexOf('{'));
    if (!head.trim().startsWith('@media')) return [0, 0];
    const max = /max-width:\s*(\d+)/.exec(head);
    if (max) return [2, -Number(max[1])];
    return [1, 0];
  };
  return blocks
    .map((b, i) => ({ b, i, r: rank(b) }))
    .sort((x, y) => x.r[0] - y.r[0] || x.r[1] - y.r[1] || x.i - y.i)
    .map((x) => x.b)
    .join('');
}
