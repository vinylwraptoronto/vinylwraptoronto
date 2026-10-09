/**
 * Post bodies that arrive as Markdown.
 *
 * `body_html` is HTML by contract -- the admin editor writes it and the 10XiD
 * portal's tool is told to -- but two posts written through the portal
 * (/pressure-wash-a-wrapped-car/, /replace-a-car-wrap-signs-of-wear-fading/)
 * arrived as Markdown. The sanitizer only knows tags, so it passed the text
 * through untouched and the page printed `## headings`, `**bold**`, table
 * pipes and `[label](url)` links as literal characters, with no heading for
 * the table of contents to link to and no clickable link.
 *
 * Rendered with micromark and its GFM extension -- the parser under Astro's
 * own Markdown pipeline (remark-parse / remark-gfm) -- so headings, lists,
 * tables, emphasis and links come out as the same elements a .md page would
 * get. Raw HTML inside the Markdown is not passed through (micromark escapes
 * it by default), and the result still goes through sanitizeHtml, so a
 * Markdown body is held to exactly the allowlist an HTML one is.
 */
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { sanitizeHtml } from './postdoc';
import type { Block, Section } from '../types';

/** Any element the editor or the importer writes. A body holding one is HTML. */
const HTML_ELEMENT = /<(p|h[1-6]|ul|ol|li|div|table|br|strong|em|b|i|a|img|figure|blockquote|span)\b[^>]*>/i;

/** Line-level Markdown: a heading, a list item, a table row or a fence. */
const MD_LINE = /^(#{1,6}\s+\S|[-*+]\s+\S|\d+[.)]\s+\S|\|.*\|\s*$|```|>\s)/m;
/** Inline Markdown: a link or strong emphasis. */
const MD_INLINE = /\[[^\]\n]+\]\((https?:|mailto:|tel:|\/|#)[^)\s]*\)|\*\*[^*\n]+\*\*/;

/**
 * Whether a body is Markdown rather than HTML: no HTML elements at all, and
 * Markdown syntax present. Plain prose with neither is left alone -- it renders
 * the same either way, and guessing would only risk changing it.
 */
export function isMarkdownBody(body: string): boolean {
  if (!body || HTML_ELEMENT.test(body)) return false;
  return MD_LINE.test(body) || MD_INLINE.test(body);
}

/** Markdown to sanitized HTML. */
export function markdownToHtml(body: string): string {
  return sanitizeHtml(micromark(body, { extensions: [gfm()], htmlExtensions: [gfmHtml()] }));
}

/** A body as the page should draw it: Markdown rendered, HTML untouched. */
export function bodyAsHtml(body: string): string {
  return isMarkdownBody(body) ? markdownToHtml(body) : body;
}

/** Every text block in a post's render tree, Markdown ones rendered. */
export function renderMarkdownBlocks(sections: Section[]): Section[] {
  let changed = false;
  const walk = (blocks: Block[]): Block[] =>
    blocks.map((b) => {
      if (b?.type === 'columns') {
        const cols = b.cols.map((c) => ({ ...c, blocks: walk(c.blocks ?? []) }));
        return { ...b, cols };
      }
      if (b?.type === 'text' && typeof b.html === 'string' && isMarkdownBody(b.html)) {
        changed = true;
        return { ...b, html: markdownToHtml(b.html) };
      }
      return b;
    });
  const out = sections.map((s) => (s?.blocks ? { ...s, blocks: walk(s.blocks) } : s));
  return changed ? out : sections;
}
