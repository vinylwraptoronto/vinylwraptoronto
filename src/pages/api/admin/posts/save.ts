import type { APIRoute } from 'astro';
import { guardWrite, jsonResponse } from '../../../../lib/adminroute';
import { analyse } from '../../../../lib/seo';
import {
  buildHead,
  buildSections,
  excerptFrom,
  robotsString,
  sanitizeHtml,
  type PostDoc,
} from '../../../../lib/postdoc';

/**
 * Create or update a post.
 *
 * Three things here are deliberate and worth keeping:
 *
 * 1. The SEO score is recomputed on the server from the submitted content and
 *    that result is what gets stored. The browser runs the same analyser for
 *    live feedback, but a score arriving in the request body is a number the
 *    client picked.
 *
 * 2. `sections_json` is only rebuilt for posts written here. An imported post's
 *    render tree is its full Elementor layout -- galleries, before/after
 *    sliders, the sidebar -- while its `body_html` is only the text blocks that
 *    were extracted from it. Rebuilding one from the other would silently throw
 *    the rest of the page away, so it takes an explicit `relayout` flag, and
 *    the post is marked as authored from then on.
 *
 * 3. The previous state is written to post_revisions before the update, not
 *    after, so a save that fails half way cannot lose what was there.
 */
export const prerender = false;

const MAX_BODY = 400_000;

const str = (form: FormData, key: string, max = 300): string =>
  String(form.get(key) ?? '').trim().slice(0, max);

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const guard = await guardWrite(request, locals, cookies, url);
  if (!guard.ok) return guard.response;
  const { db, session } = guard.ctx;
  const form = guard.form;

  const idRaw = str(form, 'id', 20);
  const id = idRaw ? Number(idRaw) : 0;
  if (idRaw && (!Number.isInteger(id) || id <= 0)) return jsonResponse({ error: 'Bad post id.' }, 400);

  const title = str(form, 'title', 200);
  if (!title) return jsonResponse({ error: 'A title is required.' }, 400);

  let slug = str(form, 'slug', 180).toLowerCase().replace(/^\/+|\/+$/g, '');
  if (!slug) return jsonResponse({ error: 'A permalink is required.' }, 400);
  if (!/^[a-z0-9][a-z0-9\-/]*$/.test(slug)) {
    return jsonResponse({ error: 'The permalink may hold lowercase letters, digits, hyphens and slashes.' }, 400);
  }

  const bodyRaw = String(form.get('body_html') ?? '');
  if (bodyRaw.length > MAX_BODY) return jsonResponse({ error: 'That post is too large to store.' }, 413);
  const bodyHtml = sanitizeHtml(bodyRaw);

  const status = str(form, 'status', 20);
  if (!['draft', 'published', 'scheduled', 'archived'].includes(status)) {
    return jsonResponse({ error: 'Unknown status.' }, 400);
  }

  // The slug is the address. Two posts cannot share one.
  const clash = await db
    .prepare('SELECT id FROM posts WHERE slug = ? AND id != ?')
    .bind(slug, id)
    .first<{ id: number }>();
  if (clash) return jsonResponse({ error: `Another post already uses /${slug}/.` }, 409);

  const existing = id
    ? await db
        .prepare('SELECT * FROM posts WHERE id = ?')
        .bind(id)
        .first<Record<string, unknown>>()
    : null;
  if (id && !existing) return jsonResponse({ error: 'That post no longer exists.' }, 404);

  const origin = (existing?.origin as string) ?? 'authored';
  const bodyChanged = !!existing && String(existing.body_html ?? '') !== bodyHtml;
  const relayout = str(form, 'relayout', 5) === '1';

  if (origin === 'imported' && bodyChanged && !relayout) {
    return jsonResponse(
      {
        error:
          'This post was imported from the old site, and its page is built from the original ' +
          'Elementor layout — galleries, before/after sliders and the sidebar. Saving an edited ' +
          'body rebuilds the page from your text and loses that layout. Confirm to go ahead.',
        needsRelayout: true,
      },
      409,
    );
  }

  /* ---- media ---- */

  const mediaId = async (path: string): Promise<number | null> => {
    const clean = path.trim();
    if (!clean.startsWith('/wp-content/uploads/')) return null;
    const row = await db.prepare('SELECT id FROM media WHERE path = ?').bind(clean).first<{ id: number }>();
    if (row) return row.id;
    await db.prepare('INSERT OR IGNORE INTO media (path) VALUES (?)').bind(clean).run();
    const added = await db.prepare('SELECT id FROM media WHERE path = ?').bind(clean).first<{ id: number }>();
    return added?.id ?? null;
  };

  const featuredPath = str(form, 'featured', 400);
  const featuredId = featuredPath ? await mediaId(featuredPath) : null;
  const ogPath = str(form, 'og_image', 400);
  const ogImageId = ogPath ? await mediaId(ogPath) : null;

  /* ---- the editorial record ---- */

  const excerpt = str(form, 'excerpt', 320) || excerptFrom(bodyHtml);
  const metaDescription = str(form, 'meta_description', 320) || excerpt;
  const seoTitle = str(form, 'seo_title', 200) || title;
  const focusKeyword = str(form, 'focus_keyword', 120);
  const publishedDate = str(form, 'published_at', 20);
  const authorRaw = str(form, 'author_id', 20);
  const authorId = authorRaw ? Number(authorRaw) : null;

  const advanced = form
    .getAll('robots_advanced')
    .map(String)
    .filter((f) => ['noarchive', 'nosnippet', 'noimageindex'].includes(f));

  const doc: PostDoc = {
    slug,
    title,
    headline: str(form, 'headline', 200) || title,
    seoTitle,
    excerpt: metaDescription,
    bodyHtml,
    featuredPath: featuredPath || null,
    featuredAlt: title,
    publishedAt: publishedDate || ((existing?.published_at as string | null) ?? null),
    modifiedAt: null, // set from datetime('now') below, so one clock decides
    canonicalUrl: str(form, 'canonical_url', 400) || null,
    focusKeyword,
    ogTitle: str(form, 'og_title', 200) || null,
    ogDescription: str(form, 'og_description', 320) || null,
    ogImagePath: ogPath || null,
    twitterCard: str(form, 'twitter_card', 40) || 'summary_large_image',
    twitterTitle: str(form, 'twitter_title', 200) || null,
    twitterDescription: str(form, 'twitter_description', 320) || null,
    schemaType: str(form, 'schema_type', 40) || 'BlogPosting',
    breadcrumbTitle: str(form, 'breadcrumb_title', 200) || null,
    robotsIndex: form.get('robots_index') !== null,
    robotsFollow: form.get('robots_follow') !== null,
    robotsAdvanced: advanced,
  };

  // Our own analysis of what was actually submitted.
  const report = analyse({
    title,
    seoTitle,
    description: metaDescription,
    slug,
    bodyHtml,
    focusKeyword,
  });

  const willRelayout = origin === 'authored' || relayout || !existing;
  const sectionsJson = willRelayout ? JSON.stringify(buildSections(doc)) : null;
  const headJson = JSON.stringify(buildHead(doc));
  const robots = robotsString(doc);
  const nextOrigin = willRelayout ? 'authored' : origin;

  /* ---- keep the previous version ---- */

  if (existing) {
    const words = analyse({
      title: String(existing.title ?? ''),
      seoTitle: '',
      description: '',
      slug: '',
      bodyHtml: String(existing.body_html ?? ''),
      focusKeyword: '',
    }).stats.words;
    await db
      .prepare(
        `INSERT INTO post_revisions (post_id, snapshot_json, title, words, author_id)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, JSON.stringify(existing), String(existing.title ?? ''), words, session.userId)
      .run();
  }

  /* ---- write ---- */

  const shared = [
    slug, title, seoTitle, doc.headline, excerpt, bodyHtml, status,
    featuredId, authorId, publishedDate || null,
    doc.canonicalUrl, robots, headJson,
    focusKeyword || null, report.score, JSON.stringify(report.checks),
    doc.ogTitle, doc.ogDescription, ogImageId,
    doc.twitterCard, doc.twitterTitle, doc.twitterDescription,
    doc.schemaType, doc.breadcrumbTitle,
    doc.robotsIndex ? 1 : 0, doc.robotsFollow ? 1 : 0, JSON.stringify(advanced),
    nextOrigin, session.userId,
  ];

  let postId = id;
  if (existing) {
    await db
      .prepare(
        `UPDATE posts SET
           slug = ?, title = ?, seo_title = ?, headline = ?, excerpt = ?, body_html = ?, status = ?,
           featured_id = ?, author_id = ?, published_at = ?,
           canonical_url = ?, robots = ?, head_json = ?,
           focus_keyword = ?, seo_score = ?, seo_checks_json = ?,
           og_title = ?, og_description = ?, og_image_id = ?,
           twitter_card = ?, twitter_title = ?, twitter_description = ?,
           schema_type = ?, breadcrumb_title = ?,
           robots_index = ?, robots_follow = ?, robots_advanced = ?,
           origin = ?, updated_by = ?,
           modified_at = datetime('now'), updated_at = datetime('now')
           ${sectionsJson === null ? '' : ', sections_json = ?'}
         WHERE id = ?`,
      )
      .bind(...shared, ...(sectionsJson === null ? [] : [sectionsJson]), id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO posts (
           slug, title, seo_title, headline, excerpt, body_html, status,
           featured_id, author_id, published_at,
           canonical_url, robots, head_json,
           focus_keyword, seo_score, seo_checks_json,
           og_title, og_description, og_image_id,
           twitter_card, twitter_title, twitter_description,
           schema_type, breadcrumb_title,
           robots_index, robots_follow, robots_advanced,
           origin, updated_by,
           sections_json, modified_at
         ) VALUES (${new Array(29).fill('?').join(', ')}, ?, datetime('now'))`,
      )
      .bind(...shared, sectionsJson)
      .run();
    const created = await db.prepare('SELECT id FROM posts WHERE slug = ?').bind(slug).first<{ id: number }>();
    postId = created?.id ?? 0;
    if (!postId) return jsonResponse({ error: 'The post was written but could not be read back.' }, 500);
  }

  /* ---- taxonomy ---- */

  const terms = form.getAll('term').map((t) => Number(String(t))).filter((n) => Number.isInteger(n) && n > 0);
  await db.prepare('DELETE FROM post_terms WHERE post_id = ?').bind(postId).run();
  for (const termId of terms.slice(0, 60)) {
    await db
      .prepare('INSERT OR IGNORE INTO post_terms (post_id, term_id) VALUES (?, ?)')
      .bind(postId, termId)
      .run();
  }

  return jsonResponse({ id: postId, slug, score: report.score, relaidOut: willRelayout });
};
