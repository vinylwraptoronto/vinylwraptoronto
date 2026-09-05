/**
 * Content analysis, in the shape Rank Math presents it.
 *
 * Imported by two callers that must agree: the browser runs it on every
 * keystroke so the score moves while you write, and the save route runs it
 * again on the server so the score that gets *stored* is one we computed. A
 * score posted by the client is a number the client chose.
 *
 * So this module is pure — no DOM, no fetch, no Node, nothing but standard
 * JavaScript — and it has to stay that way.
 *
 * Every regex here runs against a whole post on every keystroke. They are all
 * deliberately linear: no nested quantifiers, no alternation inside a repeat.
 * A pattern that backtracks would show up as the editor freezing while typing.
 */

export interface SeoInput {
  title: string;
  seoTitle: string;
  description: string;
  slug: string;
  bodyHtml: string;
  focusKeyword: string;
  extraKeywords?: string[];
}

export type SeoCheckStatus = 'good' | 'warn' | 'bad';

export interface SeoCheck {
  id: string;
  label: string;
  status: SeoCheckStatus;
  weight: number;
  group: 'basic' | 'additional' | 'title-readability' | 'content-readability';
}

export interface SeoReport {
  score: number;
  checks: SeoCheck[];
  stats: {
    words: number;
    readingTimeMinutes: number;
    keywordDensity: number;
    keywordCount: number;
    internalLinks: number;
    externalLinks: number;
    images: number;
    imagesMissingAlt: number;
    headings: number;
    titleLength: number;
    descriptionLength: number;
  };
}

/* ------------------------------------------------------------------ *
 * Text handling
 * ------------------------------------------------------------------ */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', eacute: 'é', egrave: 'è', agrave: 'à',
  ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,9});/g, (whole, body: string) => {
    if (body.charCodeAt(0) === 35) {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      // Reject anything outside the range String.fromCodePoint accepts, and
      // surrogates, rather than throwing on a malformed entity.
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return whole;
      }
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Visible text: no markup, no script or style bodies, whitespace collapsed. */
export function plainText(html: string): string {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Accent- and case-insensitive form, so "Étobicoke" matches "etobicoke".
 *
 * NFD splits an accented letter into the letter plus its combining mark, and
 * the range below is the combining diacriticals block. Written as escapes
 * rather than the literal characters: as literals they are invisible in an
 * editor and survive exactly one careless copy-paste.
 */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A pattern matching the keyword as a phrase, on word boundaries.
 *
 * \b is no use here: an author's keyword can start or end with punctuation
 * ("c++ wrap"), where \b either fails or matches in the wrong place. Instead
 * the boundary is "not a letter or digit", checked with lookaround, which
 * behaves the same for ordinary words and does not break on symbols.
 */
function keywordPattern(keyword: string): RegExp | null {
  const folded = fold(keyword).trim();
  if (!folded) return null;
  // Any run of whitespace in the keyword matches any run in the text, so a
  // line break between two words still counts as the phrase.
  const body = folded.split(/\s+/).map(escapeRegex).join('[\\s\\-]+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'giu');
}

function countMatches(haystack: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  let n = 0;
  while (pattern.exec(haystack) !== null) {
    n++;
    // A zero-length match would loop forever; the patterns here cannot produce
    // one, but the guard costs nothing and removes the possibility.
    if (pattern.lastIndex === 0) break;
  }
  pattern.lastIndex = 0;
  return n;
}

function has(haystack: string, pattern: RegExp | null): boolean {
  if (!pattern) return false;
  pattern.lastIndex = 0;
  const found = pattern.test(haystack);
  pattern.lastIndex = 0;
  return found;
}

export function slugify(text: string): string {
  return fold(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

/* ------------------------------------------------------------------ *
 * The analysis
 * ------------------------------------------------------------------ */

export function analyse(input: SeoInput): SeoReport {
  const bodyHtml = input.bodyHtml || '';
  const text = plainText(bodyHtml);
  const foldedText = fold(text);
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;

  const pattern = keywordPattern(input.focusKeyword || '');
  const hasKeyword = pattern !== null;

  const keywordCount = pattern ? countMatches(foldedText, pattern) : 0;
  const density = words > 0 ? (keywordCount / words) * 100 : 0;

  // Structure, read straight off the markup rather than a parsed DOM: this has
  // to run identically in a Worker, which has no DOM at all.
  const headingTags = bodyHtml.match(/<h[2-6]\b[^>]*>/gi) ?? [];
  const headingText = fold(
    (bodyHtml.match(/<h[2-6]\b[^>]*>[\s\S]{0,600}?<\/h[2-6]>/gi) ?? []).join(' ').replace(/<[^>]*>/g, ' '),
  );

  const imgTags = bodyHtml.match(/<img\b[^>]*>/gi) ?? [];
  const alts = imgTags.map((t) => {
    const m = t.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
  });
  const imagesMissingAlt = alts.filter((a) => a === null || a.trim() === '').length;
  const altText = fold(alts.filter(Boolean).join(' '));

  const hrefs = (bodyHtml.match(/<a\b[^>]*\bhref\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi) ?? []).map((t) => {
    const m = t.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    return (m ? (m[1] ?? m[2] ?? m[3] ?? '') : '').trim();
  });
  let internalLinks = 0;
  let externalLinks = 0;
  for (const href of hrefs) {
    if (!href || href.startsWith('#')) continue;
    if (href.startsWith('/') || href.includes('vinylwraptoronto.com')) internalLinks++;
    else if (/^https?:\/\//i.test(href)) externalLinks++;
  }

  const seoTitle = input.seoTitle || input.title || '';
  const foldedTitle = fold(seoTitle);
  const description = input.description || '';
  const slug = input.slug || '';

  // The first tenth of the copy, which is where Rank Math wants the keyword.
  const opening = foldedText.slice(0, Math.max(120, Math.floor(foldedText.length * 0.1)));

  const checks: SeoCheck[] = [];
  const add = (
    id: string,
    group: SeoCheck['group'],
    weight: number,
    status: SeoCheckStatus,
    label: string,
  ) => checks.push({ id, group, weight, status, label });

  /* When no focus keyword is set, the keyword checks cannot pass and must not
     silently vanish either — a post with no keyword should not score as if it
     had one. They report 'warn' and still count, so the score is honest. */
  const noKeyword = (id: string, group: SeoCheck['group'], weight: number, what: string) =>
    add(id, group, weight, 'warn', `Set a focus keyword to check ${what}.`);

  /* ---- basic ---- */

  if (!hasKeyword) noKeyword('kw-title', 'basic', 3, 'the SEO title');
  else
    add('kw-title', 'basic', 3, has(foldedTitle, pattern) ? 'good' : 'bad',
      has(foldedTitle, pattern)
        ? 'The focus keyword is in the SEO title.'
        : 'The focus keyword is not in the SEO title.');

  if (!hasKeyword) noKeyword('kw-desc', 'basic', 3, 'the meta description');
  else
    add('kw-desc', 'basic', 3, has(fold(description), pattern) ? 'good' : 'bad',
      has(fold(description), pattern)
        ? 'The focus keyword is in the meta description.'
        : 'The focus keyword is not in the meta description.');

  if (!hasKeyword) noKeyword('kw-slug', 'basic', 3, 'the URL');
  else
    add('kw-slug', 'basic', 3, has(fold(slug.replace(/-/g, ' ')), pattern) ? 'good' : 'bad',
      has(fold(slug.replace(/-/g, ' ')), pattern)
        ? 'The focus keyword is in the URL.'
        : 'The focus keyword is not in the URL.');

  if (!hasKeyword) noKeyword('kw-opening', 'basic', 3, 'the opening');
  else
    add('kw-opening', 'basic', 3, has(opening, pattern) ? 'good' : 'bad',
      has(opening, pattern)
        ? 'The focus keyword appears near the start of the post.'
        : 'The focus keyword does not appear in the first tenth of the post.');

  if (!hasKeyword) noKeyword('kw-content', 'basic', 3, 'the content');
  else
    add('kw-content', 'basic', 3, keywordCount > 0 ? 'good' : 'bad',
      keywordCount > 0
        ? `The focus keyword appears ${keywordCount} time${keywordCount === 1 ? '' : 's'} in the content.`
        : 'The focus keyword does not appear in the content.');

  add('length', 'basic', 3,
    words >= 1000 ? 'good' : words >= 600 ? 'warn' : 'bad',
    words >= 1000
      ? `The post is ${words} words, which is a solid length.`
      : words >= 600
        ? `The post is ${words} words. Around 1,000 competes better.`
        : `The post is only ${words} words. Aim for at least 600.`);

  /* ---- additional ---- */

  if (!hasKeyword) noKeyword('kw-subheading', 'additional', 2, 'the subheadings');
  else
    add('kw-subheading', 'additional', 2, has(headingText, pattern) ? 'good' : 'bad',
      has(headingText, pattern)
        ? 'The focus keyword appears in a subheading.'
        : 'The focus keyword is in none of the subheadings.');

  if (!hasKeyword) noKeyword('kw-alt', 'additional', 2, 'the image alt text');
  else if (imgTags.length === 0)
    add('kw-alt', 'additional', 2, 'warn', 'There are no images, so the keyword cannot appear in alt text.');
  else
    add('kw-alt', 'additional', 2, has(altText, pattern) ? 'good' : 'warn',
      has(altText, pattern)
        ? 'The focus keyword appears in an image alt text.'
        : 'No image alt text mentions the focus keyword.');

  if (!hasKeyword) noKeyword('density', 'additional', 2, 'keyword density');
  else {
    const shown = density.toFixed(2);
    const status: SeoCheckStatus =
      density >= 0.5 && density <= 2.5 ? 'good' : density >= 0.25 && density <= 4 ? 'warn' : 'bad';
    add('density', 'additional', 2, status,
      status === 'good'
        ? `Keyword density is ${shown}%, which is in the ideal range.`
        : density > 2.5
          ? `Keyword density is ${shown}% — that reads as stuffing. Aim for 0.5–2.5%.`
          : `Keyword density is ${shown}% — too thin. Aim for 0.5–2.5%.`);
  }

  add('external', 'additional', 2, externalLinks > 0 ? 'good' : 'warn',
    externalLinks > 0
      ? `There ${externalLinks === 1 ? 'is 1 external link' : `are ${externalLinks} external links`}.`
      : 'There are no external links. Linking out to a source is a quality signal.');

  add('internal', 'additional', 2, internalLinks > 0 ? 'good' : 'bad',
    internalLinks > 0
      ? `There ${internalLinks === 1 ? 'is 1 internal link' : `are ${internalLinks} internal links`}.`
      : 'There are no links to other pages on this site.');

  add('alt-coverage', 'additional', 2,
    imgTags.length === 0 ? 'warn' : imagesMissingAlt === 0 ? 'good' : 'bad',
    imgTags.length === 0
      ? 'The post has no images. One or two help it get read.'
      : imagesMissingAlt === 0
        ? 'Every image has alt text.'
        : `${imagesMissingAlt} of ${imgTags.length} images have no alt text.`);

  /* ---- title readability ---- */

  const titleLength = seoTitle.length;
  add('title-length', 'title-readability', 2,
    titleLength >= 15 && titleLength <= 60 ? 'good' : titleLength === 0 ? 'bad' : 'warn',
    titleLength === 0
      ? 'There is no SEO title.'
      : titleLength > 60
        ? `The SEO title is ${titleLength} characters and will be cut off. Keep it under 60.`
        : titleLength < 15
          ? `The SEO title is only ${titleLength} characters.`
          : `The SEO title is ${titleLength} characters, which fits.`);

  if (!hasKeyword) noKeyword('kw-title-start', 'title-readability', 1, 'the start of the title');
  else {
    pattern!.lastIndex = 0;
    const at = foldedTitle.search(pattern!);
    const early = at >= 0 && at <= Math.max(1, Math.floor(foldedTitle.length / 2));
    add('kw-title-start', 'title-readability', 1, early ? 'good' : 'warn',
      early
        ? 'The focus keyword is near the beginning of the title.'
        : 'The focus keyword is late in the title. Earlier reads stronger.');
  }

  add('title-number', 'title-readability', 1, /\d/.test(seoTitle) ? 'good' : 'warn',
    /\d/.test(seoTitle)
      ? 'The title contains a number, which tends to get clicked.'
      : 'Titles with a number in them tend to get clicked more.');

  const descLength = description.length;
  add('desc-length', 'title-readability', 2,
    descLength >= 70 && descLength <= 160 ? 'good' : descLength === 0 ? 'bad' : 'warn',
    descLength === 0
      ? 'There is no meta description.'
      : descLength > 160
        ? `The description is ${descLength} characters and will be cut off. Keep it under 160.`
        : descLength < 70
          ? `The description is only ${descLength} characters. Use more of the space.`
          : `The description is ${descLength} characters, which fits.`);

  /* ---- content readability ---- */

  add('subheadings', 'content-readability', 2, headingTags.length > 0 ? 'good' : 'bad',
    headingTags.length > 0
      ? `The post uses ${headingTags.length} subheading${headingTags.length === 1 ? '' : 's'}.`
      : 'The post has no subheadings, so it reads as a wall of text.');

  const paragraphs = (bodyHtml.match(/<p\b[^>]*>[\s\S]{0,20000}?<\/p>/gi) ?? []).map((p) =>
    plainText(p).split(/\s+/).filter(Boolean).length,
  );
  const longParagraphs = paragraphs.filter((n) => n > 120).length;
  add('paragraphs', 'content-readability', 1, longParagraphs === 0 ? 'good' : 'warn',
    longParagraphs === 0
      ? 'No paragraph runs too long.'
      : `${longParagraphs} paragraph${longParagraphs === 1 ? ' is' : 's are'} over 120 words. Break them up.`);

  const hasList = /<(ul|ol)\b/i.test(bodyHtml);
  add('lists', 'content-readability', 1, hasList ? 'good' : 'warn',
    hasList ? 'The post uses a list, which is easy to scan.' : 'A list or two would make this easier to scan.');

  /* ---- score ---- */

  let earned = 0;
  let possible = 0;
  for (const c of checks) {
    possible += c.weight;
    if (c.status === 'good') earned += c.weight;
    else if (c.status === 'warn') earned += c.weight / 2;
  }
  const score = possible > 0 ? Math.round((100 * earned) / possible) : 0;

  return {
    score: Math.max(0, Math.min(100, score)),
    checks,
    stats: {
      words,
      readingTimeMinutes: Math.max(1, Math.round(words / 220)),
      keywordDensity: Number(density.toFixed(2)),
      keywordCount,
      internalLinks,
      externalLinks,
      images: imgTags.length,
      imagesMissingAlt,
      headings: headingTags.length,
      titleLength,
      descriptionLength: descLength,
    },
  };
}
