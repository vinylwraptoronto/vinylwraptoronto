import type { APIRoute } from 'astro';
import { guardWrite, jsonResponse } from '../../../../lib/adminroute';
import { analyse } from '../../../../lib/seo';

/**
 * Save one page's SEO overrides.
 *
 * The slug is checked against page_index rather than trusted, so this cannot
 * create an override row for an address that is not a real page — a row for a
 * slug the site does not serve would be invisible, permanent and confusing.
 *
 * As with posts, the score is recomputed here from the page's own indexed text
 * and that result is stored. The browser runs the same analyser for live
 * feedback, but a score arriving in the request body is a number the client
 * chose.
 *
 * Every field is optional and a blank one clears the override, which restores
 * whatever the page was ported with. That is what makes this safe to
 * experiment with: nothing here can permanently lose the original metadata,
 * because the original is never overwritten.
 */
export const prerender = false;

const str = (form: FormData, key: string, max: number): string =>
  String(form.get(key) ?? '').trim().slice(0, max);

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const guard = await guardWrite(request, locals, cookies, url);
  if (!guard.ok) return guard.response;
  const { db, session } = guard.ctx;
  const form = guard.form;

  const slug = String(form.get('slug') ?? '').trim().slice(0, 300);
  const page = await db
    .prepare('SELECT slug, title, description, body_html FROM page_index WHERE slug = ?')
    .bind(slug)
    .first<{ slug: string; title: string; description: string | null; body_html: string }>();
  if (!page) return jsonResponse({ error: 'That is not a page on this site.' }, 404);

  const seoTitle = str(form, 'seo_title', 200);
  const metaDescription = str(form, 'meta_description', 320);
  const focusKeyword = str(form, 'focus_keyword', 120);
  const canonical = str(form, 'canonical_url', 400);
  const ogImage = str(form, 'og_image', 400);
  const twitterCard = str(form, 'twitter_card', 40);

  if (canonical && !/^https?:\/\/[^\s]+$/i.test(canonical)) {
    return jsonResponse({ error: 'The canonical URL must be a full http:// or https:// address.' }, 400);
  }
  if (ogImage && !ogImage.startsWith('/wp-content/uploads/')) {
    return jsonResponse({ error: 'The social image must be a path beginning /wp-content/uploads/.' }, 400);
  }
  if (twitterCard && !['summary', 'summary_large_image'].includes(twitterCard)) {
    return jsonResponse({ error: 'Unknown Twitter card type.' }, 400);
  }

  const advanced = form
    .getAll('robots_advanced')
    .map(String)
    .filter((f) => ['noarchive', 'nosnippet', 'noimageindex'].includes(f));

  /* Scored against what the page will actually serve: the override where one
     was given, otherwise the ported value. Scoring a blank field as blank
     would report a problem the visitor will never see. */
  const report = analyse({
    title: seoTitle || page.title,
    seoTitle: seoTitle || page.title,
    description: metaDescription || page.description || '',
    slug,
    bodyHtml: page.body_html,
    focusKeyword,
  });

  const nul = (v: string) => (v ? v : null);

  await db
    .prepare(
      `INSERT INTO page_seo (
         slug, seo_title, meta_description, focus_keyword, seo_score, seo_checks_json,
         canonical_url, robots_index, robots_follow, robots_advanced,
         og_title, og_description, og_image,
         twitter_card, twitter_title, twitter_description,
         updated_at, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
       ON CONFLICT(slug) DO UPDATE SET
         seo_title = excluded.seo_title,
         meta_description = excluded.meta_description,
         focus_keyword = excluded.focus_keyword,
         seo_score = excluded.seo_score,
         seo_checks_json = excluded.seo_checks_json,
         canonical_url = excluded.canonical_url,
         robots_index = excluded.robots_index,
         robots_follow = excluded.robots_follow,
         robots_advanced = excluded.robots_advanced,
         og_title = excluded.og_title,
         og_description = excluded.og_description,
         og_image = excluded.og_image,
         twitter_card = excluded.twitter_card,
         twitter_title = excluded.twitter_title,
         twitter_description = excluded.twitter_description,
         updated_at = datetime('now'),
         updated_by = excluded.updated_by`,
    )
    .bind(
      slug,
      nul(seoTitle),
      nul(metaDescription),
      nul(focusKeyword),
      report.score,
      JSON.stringify(report.checks),
      nul(canonical),
      form.get('robots_index') !== null ? 1 : 0,
      form.get('robots_follow') !== null ? 1 : 0,
      advanced.length ? JSON.stringify(advanced) : null,
      nul(str(form, 'og_title', 200)),
      nul(str(form, 'og_description', 320)),
      nul(ogImage),
      nul(twitterCard),
      nul(str(form, 'twitter_title', 200)),
      nul(str(form, 'twitter_description', 320)),
      session.userId,
    )
    .run();

  return jsonResponse({ ok: true, slug, score: report.score });
};
