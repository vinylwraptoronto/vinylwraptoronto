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

/* The before/after project template's title (d632582): 35px Poppins 500,
   capitalised, centred, in the brand navy. 67 of the 69 projects carry it on
   the block; two (/wraps-before-after/tesla-model-s-wrap-satin-flip-psychedelic/
   and .../tesla-model-y-full-car-wrap-colour-change/) came across with no style,
   so they fell back to the kit's 40px h1 -- 40/40 on a phone where the
   original is 35/35. The style is the template's, so it is restated here. */
const PROJECT_TITLE = 'd632582';
const PROJECT_TITLE_STYLE =
  'text-align:center;font-family:"Poppins", Sans-serif;font-size:35px;color:var( --e-global-color-8c22d81 );font-weight:500;text-transform:capitalize';

function withTemplateTitle(sections: Section[]): Section[] {
  const walk = (blocks: any[]): any[] =>
    blocks.map((b) => {
      if (b?.type === 'columns') return { ...b, cols: b.cols.map((c: any) => ({ ...c, blocks: walk(c.blocks ?? []) })) };
      if (b?.type === 'heading' && b.eid === PROJECT_TITLE && !b.style) return { ...b, style: PROJECT_TITLE_STYLE };
      return b;
    });
  return sections.map((s) => (s?.blocks ? { ...s, blocks: walk(s.blocks) } : s));
}

/* The hero (aad5b5a): the navy title column beside the featured image. The
   template centres the row's columns vertically (`align-items: center` on
   the section's widget wraps), so the title sits in the middle of the navy
   box, and gives the title column (6a05303) a 2px pink bottom border. The
   port top-aligned the title and drew no border. Posts written through the
   10XiD portal carry the same hero without the template's ids, so it is also
   recognised by shape: a first section whose row is a navy column holding
   only an h1, beside a column holding only an image.
   The row itself is `elementor-column-gap-no` with the title column's own 5px
   right margin; the port's 20px gutter made the title column 5px narrower,
   enough to wrap a long title onto a third line. A 5px gutter puts it within
   2.5px of the original's width. */
const HERO_BORDER = 'border-style:solid;border-width:0px 0px 2px 0px;border-color:var( --e-global-color-f32bb28 )';

function isHeroRow(b: any): boolean {
  if (b?.type !== 'columns' || (b.cols ?? []).length !== 2) return false;
  const [title, image] = b.cols;
  const t = title.blocks ?? [];
  const i = image.blocks ?? [];
  if (t[0]?.eid === 'cc1fcc1') return true;
  return (
    /d077a13|#15334c/i.test(String(title.background ?? '')) &&
    t.length === 1 && t[0]?.type === 'heading' && t[0]?.level === 1 &&
    i.length === 1 && i[0]?.type === 'image'
  );
}

function withHero(sections: Section[]): Section[] {
  return sections.map((s, n) => {
    if (s?.id !== 'aad5b5a' && !(n === 0 && !s?.id)) return s;
    return {
      ...s,
      blocks: (s.blocks ?? []).map((b: any) => {
        if (!isHeroRow(b)) return b;
        const [title, ...rest] = b.cols;
        return {
          ...b,
          valign: b.valign ?? 'middle',
          gap: b.gap ?? 5,
          cols: [{ ...title, border: title.border ?? HERO_BORDER }, ...rest],
        };
      }),
    };
  });
}

export function applyPostTemplate(stored: Section[], meta: PostMeta = {}): Section[] {
  const sections = withHero(withTemplateTitle(stored));
  /* Only where the spacer section itself did not survive: on posts where
     525602a carries content (a gallery above the body) it renders as its own
     section, and adding its 40px again put every such post 40px long. */
  const spacerKept = sections.some((s) => s?.id === '525602a');
  return sections.map((s) => {
    /* #related_blogs, which the TOC widget excludes. */
    if (s?.id === '1e5fc85') return { ...s, tocSkip: true };
    /* The hero's title column (6a05303) is padded 10px on a phone, inside
       which the title widget keeps its own 20px either side: the title wraps
       at 325px there, where the port's ran it to 350 and a long title came
       out a line short. */
    if (s?.id === 'aad5b5a') {
      return {
        ...s,
        blocks: (s.blocks ?? []).map((b: any) => b?.type === 'columns' && b.cols?.[0]?.blocks?.[0]?.eid === 'cc1fcc1' && !b.cols[0].padM
          ? { ...b, cols: [{ ...b.cols[0], padM: '10px' }, ...b.cols.slice(1)] }
          : b),
      };
    }
    if (s?.id !== 'b45e69d') return s;
    const blocks = (s.blocks ?? []).map((b: any) => {
      if (b?.type !== 'columns' || (b.cols ?? []).length !== 2) return b;
      const [copy, side] = b.cols;
      const info = [
        meta.author ? { text: meta.author, href: meta.authorHref ?? null, icon: 'far fa-user-circle' } : null,
        meta.date ? { text: meta.date, icon: 'fas fa-calendar' } : null,
      ].filter(Boolean);
      let sideBlocks = [...(side.blocks ?? [])];
      /* The sidebar's form (8d506b0) is not the site-wide one: name, email,
         phone, photos and a three-line message, under a "Request Estimate"
         button set in 18px capitalised text. The port rendered the site-wide
         field set, with the wrap-type checkboxes and the vehicle select. */
      sideBlocks = sideBlocks.map((x: any) => x?.type === 'form' && x?.eid === '8d506b0' && !x.fields
        ? { ...x, fields: ['name', 'email', 'phone', 'photos', 'message'], rows: 3,
            submit: 'Request Estimate', submitCase: 'capitalize', submitSize: '18px', radius: '3px' }
        : x);
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
      /* The Limited Time Offer is an inner section of its own (48d21ce): a
         navy panel with 5px corners, 15px of padding around a column padded
         10px, 10px between its widgets and 25px below it. The extractor kept
         the widgets and dropped the panel, so the offer's white heading and
         price sat invisible on the sidebar's grey. Done last, so the byline
         above still finds the Claim Now button it goes under. */
      const offerFrom = sideBlocks.findIndex((x: any) => x?.eid === '6026500');
      const offerTo = sideBlocks.findIndex((x: any) => x?.eid === 'e4d3235');
      if (offerFrom >= 0 && offerTo >= offerFrom) {
        sideBlocks = [
          ...sideBlocks.slice(0, offerFrom),
          {
            type: 'columns', gap: 0,
            /* 25px below, of which the sidebar's own 20px widget gap is most. */
            margin: '0px 0px 5px 0px',
            cols: [{
              width: 100, background: 'var( --e-global-color-d077a13 )',
              padding: '25px 10px 25px 10px', radius: '5px', widgetGap: 10,
              /* The price keeps the theme's h3 margins, 8px above and 16px
                 below, inside its widget; a column zeroes a heading's own. */
              blocks: sideBlocks.slice(offerFrom, offerTo + 1).map((x: any) =>
                x?.eid === 'a36b238' && !x.box ? { ...x, box: 'margin:8px 0px 16px 0px' } : x),
            }],
          } as any,
          ...sideBlocks.slice(offerTo + 1),
        ];
      }
      return {
        ...b,
        gap: 0,
        cols: [
          { ...copy, tabletWidth: 70, padding: '20px', padT: '15px', padM: '10px' },
          /* #blog_sidebar, which the TOC widget excludes. */
          { ...side, tabletWidth: 30, blocks: sideBlocks, tocSkip: true },
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
import { renderMarkdownBlocks } from './markdown';

type Op = {
  sec?: string; path?: (string | number)[]; type?: string; eid?: string | null;
  set?: Record<string, unknown>; replace?: unknown;
};

export function applyPostLayout(slug: string, stored: Section[]): Section[] {
  /* A body written as Markdown is drawn as the HTML it describes -- see
     src/lib/markdown.ts. Here because the page and the 10XiD preview both
     start from this step. */
  const sections = renderMarkdownBlocks(stored);
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

