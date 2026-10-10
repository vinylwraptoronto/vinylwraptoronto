/**
 * The 3-year warranty is no longer advertised anywhere on the site.
 *
 * It was carried as its own panel in several places, all ported verbatim:
 *
 *   - the "3 Year Warranty *" icon box in the "Why Choose Us?" sidebar of the
 *     blog index, every category and brand archive, and every post (1,000+
 *     addresses, most of them posts, which render from D1 rather than from
 *     the files in this repo);
 *   - the same box, or a "3-year warranty" / "Warranty Included … 3 years of
 *     warranty" variant, in the feature rows of /contact/, the about page,
 *     /racing-stripes/, the landing pages and the location pages;
 *   - a "Warranty" heading over a one-line list on /contact/, mirroring the
 *     footer's own Warranty group (removed in Footer.astro).
 *
 * Dropping them here, before the renderer sees a page, reaches every one of
 * those whatever its source, and keeps the table of contents and heading
 * outline consistent with what is actually drawn. Prose that named the 3-year
 * term -- hero lines, landing-page FAQs, post copy -- was removed from the
 * page data and from D1 itself; scripts/check-warranty.mjs fails the build if
 * any of it comes back. scripts/index-pages.mjs skips the same panels.
 *
 * A row whose column held nothing but the removed box loses that column, and
 * the columns left over share the row: three thirds become two halves rather
 * than two thirds beside a hole (see share()).
 */
import type { Block, Section } from '../types';

type Cols = Extract<Block, { type: 'columns' }>['cols'];

/** "3 Year Warranty", "3-year warranty", "3 years of warranty". */
const THREE_YEAR = /\b(?:3|three)[\s-]*years?\b[^.]{0,20}?\bwarrant/i;

const isWarrantyFeature = (b: Block): boolean =>
  b.type === 'feature' && THREE_YEAR.test(`${b.title ?? ''} ${b.text ?? ''}`);

/** A "Warranty" heading whose only content is a list about the 3-year one. */
const isWarrantyHeading = (b: Block, next: Block | undefined): boolean =>
  b.type === 'heading' &&
  /^\s*warranty\s*$/i.test(b.text ?? '') &&
  next?.type === 'list' &&
  next.items.length > 0 &&
  next.items.every((i) => THREE_YEAR.test(i.text ?? ''));

/** Re-share one breakpoint's widths among the columns that are left.
 *
 *  A row that was a single line stays one: its widths are scaled up so the
 *  columns left fill it. A row that already wrapped (five 30% boxes, or four
 *  50% ones on a tablet) is laid out again from its per-line count: if the
 *  boxes left fit on one line by shrinking no more than a quarter, they do
 *  (four 25% boxes rather than three and an orphan); otherwise the widths hold
 *  and the row asks for its last line to be centred. */
function share(
  all: Cols,
  kept: Cols,
  key: 'width' | 'tabletWidth' | 'mobileWidth',
): { cols: Cols; centre: boolean } {
  const same = { cols: kept, centre: false };
  if (kept.some((c) => c[key] == null)) return same;
  const total = all.reduce((t, c) => t + (c[key] ?? 0), 0);
  const left = kept.reduce((t, c) => t + (c[key] ?? 0), 0);
  if (!left) return same;
  if (total <= 101) {
    return { cols: kept.map((c) => ({ ...c, [key]: +(((c[key] ?? 0) * total) / left).toFixed(3) })), centre: false };
  }
  const w = kept[0][key] ?? 0;
  if (!kept.every((c) => Math.abs((c[key] ?? 0) - w) < 0.5)) return same;
  const perLine = Math.max(1, Math.floor(100.5 / w));
  if (kept.length % perLine === 0) return same;
  const one = 100 / kept.length;
  if (one >= w * 0.75) return { cols: kept.map((c) => ({ ...c, [key]: +one.toFixed(3) })), centre: false };
  return { cols: kept, centre: true };
}

export function withoutWarrantyBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (isWarrantyFeature(b)) continue;
    if (isWarrantyHeading(b, blocks[i + 1])) {
      i++; // and the list under it
      continue;
    }
    if (b.type === 'columns') {
      const cols = b.cols.map((c) => ({ ...c, blocks: withoutWarrantyBlocks(c.blocks) }));
      /* Only a column this emptied goes; one that was already empty is a
         spacer the layout relies on. */
      let kept = cols.filter((c, j) => c.blocks.length > 0 || b.cols[j].blocks.length === 0);
      if (kept.length === 0) continue;
      if (kept.length === cols.length) {
        out.push({ ...b, cols });
        continue;
      }
      let centre = false;
      for (const key of ['width', 'tabletWidth', 'mobileWidth'] as const) {
        const r = share(b.cols, kept, key);
        kept = r.cols;
        centre ||= r.centre;
      }
      /* Centring goes through the row's flex settings, which the renderer
         also reads as "this row never stacks flush" -- already true of any
         row that wraps or sets its own mobile widths, so only those get it. */
      const total = b.cols.reduce((t, c) => t + (c.width ?? 100), 0);
      const neverFlush = total > 101 || b.cols.some((c) => c.mobileWidth != null);
      out.push({
        ...b,
        cols: kept,
        ...(centre && !b.flex && !b.equalRows && neverFlush ? { flex: { justify: 'center' } } : {}),
      });
      continue;
    }
    out.push(b);
  }
  return out;
}

export function withoutWarranty(sections: Section[]): Section[] {
  return sections.map((s) => ({ ...s, blocks: withoutWarrantyBlocks(s.blocks ?? []) }));
}
