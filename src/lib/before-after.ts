/**
 * Before/after pairs added from /admin/before-after/, put in front of a
 * page's own pairs.
 *
 * /our-work/ holds 69 cards in its page data: a before/after slider, a title
 * linking to the project page and, on most, a View Pictures button. Pairs
 * added in the admin come from src/data/before-after.json (scripts/
 * pull-before-after.mjs) and are drawn as the same cards -- the first existing
 * card is the template for the column and its widgets, ids included, so the
 * page's own styling and the loop-grid card treatment apply unchanged.
 *
 * A pair with no project page shows its title unlinked and no button.
 */
import type { Block, PageData } from '../types';
import snapshot from '../data/before-after.json';

type StoredPair = {
  page: string;
  title: string;
  href: string | null;
  before: { src: string; alt: string; w?: number; h?: number };
  after: { src: string; alt: string; w?: number; h?: number };
};

const byPage = new Map<string, StoredPair[]>();
for (const p of snapshot as StoredPair[]) {
  if (!byPage.has(p.page)) byPage.set(p.page, []);
  byPage.get(p.page)!.push(p);
}

const isCardRow = (b: Block): b is Extract<Block, { type: 'columns' }> =>
  b.type === 'columns' && b.cols.some((c) => c.blocks?.[0]?.type === 'compare');

export function withBeforeAfter(page: PageData): PageData {
  const pairs = byPage.get(page.slug);
  if (!pairs?.length || !page.sections?.length) return page;

  let done = false;
  const sections = page.sections.map((s) => {
    if (done) return s;
    const at = (s.blocks ?? []).findIndex(isCardRow);
    if (at < 0) return s;
    const row = s.blocks[at] as Extract<Block, { type: 'columns' }>;
    const template = row.cols.find((c) => c.blocks?.[0]?.type === 'compare')!;
    const [compareT, headingT] = template.blocks as any[];
    const buttonT = row.cols.flatMap((c) => c.blocks ?? []).find((b: any) => b.type === 'button') as any;

    const cards = pairs.map((p, i) => ({
      ...template,
      blocks: [
        {
          ...compareT,
          pairs: [{
            before: { src: p.before.src, alt: p.before.alt, width: p.before.w ?? null, height: p.before.h ?? null },
            after: { src: p.after.src, alt: p.after.alt, width: p.after.w ?? null, height: p.after.h ?? null },
            beforeLabel: compareT.pairs?.[0]?.beforeLabel ?? 'Before',
            afterLabel: compareT.pairs?.[0]?.afterLabel ?? 'After',
          }],
        },
        {
          ...headingT,
          text: p.title,
          href: p.href,
          /* The existing titles are numbered 56a8ead-0 to -68; the added ones
             keep the base the page's own rules select, under their own index. */
          eid: headingT?.eid ? `${String(headingT.eid).replace(/-\d+$/, '')}-a${i}` : undefined,
        },
        ...(p.href && buttonT ? [{ ...buttonT, href: p.href }] : []),
      ],
    }));

    done = true;
    const blocks = [...s.blocks];
    blocks[at] = { ...row, cols: [...cards, ...row.cols] } as Block;
    return { ...s, blocks };
  });
  return done ? { ...page, sections } : page;
}
