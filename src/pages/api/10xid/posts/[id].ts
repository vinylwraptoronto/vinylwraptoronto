import type { APIRoute } from 'astro';
import { guardPortalRead, jsonResponse } from '../../../../lib/adminroute';
import { effective, readSettings } from '../../../../lib/settings';

/**
 * One post, for the 10XiD portal's editor. Signed portal requests only.
 *
 * `form` is the post exactly as /api/admin/posts/save reads it: the same field
 * names, filled the same way /admin/posts/[id] fills its form. The save route
 * replaces every column on update, and a field left out is a field cleared —
 * an absent `robots_index` is a noindex — so the portal sends back every field
 * it was given, including the ones it does not show.
 *
 * `new` returns the defaults a new post starts from (lib/settings.ts).
 */
export const prerender = false;

type FormValue = string | string[];

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) === Array.isArray(fallback) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

export const GET: APIRoute = async ({ request, locals, url, params }) => {
  const guard = await guardPortalRead(request, locals, url);
  if (!guard.ok) return guard.response;
  const { db } = guard.ctx;

  const raw = params.id ?? '';
  const isNew = raw === 'new';
  const id = isNew ? 0 : Number(raw);
  if (!isNew && (!Number.isInteger(id) || id <= 0)) return jsonResponse({ error: 'Bad post id.' }, 400);

  const post = isNew
    ? null
    : await db
        .prepare(
          `SELECT p.*, m.path AS featured_path, o.path AS og_image_path
             FROM posts p
             LEFT JOIN media m ON m.id = p.featured_id
             LEFT JOIN media o ON o.id = p.og_image_id
            WHERE p.id = ?`,
        )
        .bind(id)
        .first<Record<string, unknown>>();
  if (!isNew && !post) return jsonResponse({ error: 'That post no longer exists.' }, 404);

  const [authors, categories, brands, tags, chosen] = await Promise.all([
    db.prepare('SELECT id, name FROM authors ORDER BY name').all<{ id: number; name: string }>(),
    db.prepare("SELECT id, name FROM terms WHERE taxonomy='category' ORDER BY name").all<{ id: number; name: string }>(),
    db.prepare("SELECT id, name FROM terms WHERE taxonomy='brand' ORDER BY name").all<{ id: number; name: string }>(),
    db.prepare("SELECT id, name FROM terms WHERE taxonomy='tag' ORDER BY name").all<{ id: number; name: string }>(),
    isNew
      ? Promise.resolve({ results: [] as { term_id: number }[] })
      : db.prepare('SELECT term_id FROM post_terms WHERE post_id = ?').bind(id).all<{ term_id: number }>(),
  ]);
  const chosenIds = new Set(chosen.results.map((r) => r.term_id));
  // Categories and brands go back as ids, tags by name: the admin form's split.
  const tagIds = new Set(tags.results.map((t) => t.id));

  const settings = await readSettings(db);
  const defaultAuthorName = effective(settings, 'default_author');
  const defaultAuthorId = defaultAuthorName
    ? String(authors.results.find((a) => a.name === defaultAuthorName)?.id ?? '')
    : '';

  const s = (key: string): string => {
    const v = post?.[key];
    return v === null || v === undefined ? '' : String(v);
  };

  const form: Record<string, FormValue> = {
    ...(isNew ? {} : { id: String(id) }),
    title: s('title'),
    slug: s('slug'),
    headline: s('headline'),
    seo_title: s('seo_title'),
    excerpt: s('excerpt'),
    // The admin form starts the meta description from the excerpt column too.
    meta_description: s('excerpt'),
    body_html: s('body_html'),
    status: post ? s('status') : effective(settings, 'default_post_status'),
    author_id: post ? s('author_id') : defaultAuthorId,
    published_at: s('published_at').slice(0, 10),
    featured: s('featured_path'),
    focus_keyword: s('focus_keyword'),
    canonical_url: s('canonical_url'),
    og_title: s('og_title'),
    og_description: s('og_description'),
    og_image: post ? s('og_image_path') : effective(settings, 'default_social_image'),
    twitter_card: s('twitter_card') || 'summary_large_image',
    twitter_title: s('twitter_title'),
    twitter_description: s('twitter_description'),
    schema_type: post ? s('schema_type') : effective(settings, 'default_schema_type'),
    breadcrumb_title: s('breadcrumb_title'),
    robots_advanced: parseJson<string[]>(post?.robots_advanced, []),
    extra_keyword: parseJson<string[]>(post?.extra_keywords, []),
    faq_q: parseJson<{ q: string; a: string }[]>(post?.faq_json, []).map((f) => f.q),
    faq_a: parseJson<{ q: string; a: string }[]>(post?.faq_json, []).map((f) => f.a),
    term: [...chosenIds].filter((t) => !tagIds.has(t)).map(String),
    tag: tags.results.filter((t) => chosenIds.has(t.id)).map((t) => t.name),
  };
  // Present means on, as with a checkbox; absent means off.
  if (!post || post.robots_index !== 0) form.robots_index = '1';
  if (!post || post.robots_follow !== 0) form.robots_follow = '1';

  return jsonResponse({
    id: isNew ? null : id,
    origin: post ? s('origin') : 'authored',
    seoScore: post?.seo_score ?? null,
    updatedAt: post ? s('updated_at') : null,
    address: post ? `${url.origin}/${s('slug')}/` : null,
    form,
    options: {
      authors: authors.results,
      categories: categories.results,
      brands: brands.results,
    },
  });
};
