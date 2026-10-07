/**
 * The single-post template's own layout, applied to every post at render.
 *
 * Posts render from D1 (src/data/posts.json), and the extractor that seeded
 * D1 kept each post's content but not all of the template's layout around it.
 * Those values belong to Elementor template 11665's elements, whose ids are the
 * same on every post, so they are restated here once, keyed by those ids,
 * rather than written into 402 database rows -- and a post written in /admin
 * gets them too.
 *
 * Every value is the template's own, read off the original's per-element rules
 * and checked against its render at 1440, 900 and 390:
 *
 *   525602a  an empty section between the hero and the body: 20px of bottom
 *            padding around an empty column's 10+10 -- 40px of white. The
 *            extractor drops empty sections, so it is carried as the body
 *            section's top padding, which is the same 40px of the same white.
 *   b45e69d  the body row is `elementor-column-gap-no` -- no gutter between the
 *            copy and the sidebar -- and goes 70/30 at tablet (74.87/25 above).
 *            The copy column is padded 20px, 15 at tablet and 10 on a phone,
 *            where the port padded it 10 at every width and opened a 20px
 *            gutter, so its copy ran 16px wider than the original's and wrapped
 *            differently all the way down.
 */
import type { Section } from '../types';

/** The byline as the template draws it: Elementor's post-info widget
    (7e4e00b), in the sidebar under the offer's Claim Now button -- the author
    linking to their archive, then the date, each behind a pink 14px icon. The
    port had lifted it out into a bar above the hero, which the original does
    not have, and which made every post 53px taller. */
export type PostMeta = { author?: string | null; authorHref?: string; date?: string | null };

export function applyPostTemplate(sections: Section[], meta: PostMeta = {}): Section[] {
  /* Only where the spacer section itself did not survive: on posts where
     525602a carries content (a gallery above the body) it renders as its own
     section, and adding its 40px again put every such post 40px long. */
  const spacerKept = sections.some((s) => s?.id === '525602a');
  return sections.map((s) => {
    if (s?.id !== 'b45e69d') return s;
    const blocks = (s.blocks ?? []).map((b: any) => {
      if (b?.type !== 'columns' || (b.cols ?? []).length !== 2) return b;
      const [copy, side] = b.cols;
      const info = [
        meta.author ? { text: meta.author, href: meta.authorHref ?? null, icon: 'far fa-user-circle' } : null,
        meta.date ? { text: meta.date, icon: 'fas fa-calendar' } : null,
      ].filter(Boolean);
      const sideBlocks = [...(side.blocks ?? [])];
      /* The share buttons (4075310) under "Share This Post", which the
         extractor dropped -- a 52px panel at desktop, 65 on a phone. */
      const shareAt = sideBlocks.findIndex((x: any) => x?.eid === 'fb4c9cb');
      if (shareAt >= 0 && !sideBlocks.some((x: any) => x?.eid === '4075310')) {
        sideBlocks.splice(shareAt + 1, 0, {
          type: 'shareicons', eid: '4075310', networks: ['facebook', 'twitter', 'linkedin', 'whatsapp'],
        } as any);
      }
      if (info.length && !sideBlocks.some((x: any) => x?.eid === '7e4e00b')) {
        const at = sideBlocks.findIndex((x: any) => x?.eid === 'e4d3235');
        sideBlocks.splice(at >= 0 ? at + 1 : sideBlocks.length, 0, {
          type: 'list', eid: '7e4e00b', items: info,
          itemStyle: 'font-family:"Poppins", Sans-serif;font-weight:400',
        } as any);
      }
      return {
        ...b,
        gap: 0,
        cols: [
          { ...copy, tabletWidth: 70, padding: '20px', padT: '15px', padM: '10px' },
          { ...side, tabletWidth: 30, blocks: sideBlocks },
        ],
      };
    });
    return { ...s, padding: spacerKept ? s.padding : '40px 0px 40px 0px', blocks };
  });
}

/** Layout read off the original for posts that are pages in all but name.
 *
 * The seven /locations-served/ pages are a custom post type, so they render
 * from D1 like the blog -- but each is a hand-built Elementor page, not the
 * blog template, and none of the per-page layout harvests (per-breakpoint
 * heights and padding, column insets, image boxes, the testimonial carousel)
 * ever reached them: the hero stayed 640px tall on a phone where the original
 * is 165, and three reviews stacked as one paragraph.
 *
 * src/data/post-layout.json carries only those layout fields, as operations
 * anchored on each section's id and, below it, on the block's position, type
 * and element id (written by running the harvesters over the seed pages). An
 * operation whose anchor no longer matches -- the post was edited in /admin
 * and the block moved or changed -- is skipped, so an edit is never
 * overwritten with the original's structure. */
import postLayout from '../data/post-layout.json';

type Op = {
  sec?: string; path?: (string | number)[]; type?: string; eid?: string | null;
  set?: Record<string, unknown>; replace?: unknown;
};

export function applyPostLayout(slug: string, sections: Section[]): Section[] {
  const ops = (postLayout as Record<string, Op[]>)[slug];
  if (!ops?.length) return sections;
  const out: Section[] = structuredClone(sections);
  for (const op of ops) {
    if (!op.sec) continue;
    const sec = out.find((s) => s?.id === op.sec) as any;
    if (!sec) continue;
    if (!op.path?.length) {
      if (op.type === 'section' && op.set) Object.assign(sec, op.set);
      continue;
    }
    // Walk to the parent of the target, then check the target is what the
    // operation was written against.
    let parent: any = sec.blocks;
    for (const k of op.path.slice(0, -1)) parent = parent?.[k as any];
    const key = op.path[op.path.length - 1] as any;
    const node = parent?.[key];
    if (!node) continue;
    const kindOk = op.type === 'col' ? Array.isArray(node.blocks) && !node.type : node.type === op.type;
    if (!kindOk || (op.eid && node.eid !== op.eid)) continue;
    if (op.replace) parent[key] = op.replace;
    else if (op.set) Object.assign(node, op.set);
  }
  return out;
}

