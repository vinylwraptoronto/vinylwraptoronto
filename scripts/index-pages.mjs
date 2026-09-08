/**
 * Copy the site's own pages into D1 so /admin/pages/ can list and analyse them.
 *
 *   node scripts/index-pages.mjs
 *
 * Only `kind: 'page'` — the 60 real pages like /car-wraps/ and /contact/, not
 * the 478 posts (which live in D1 already) or the 1,079 archives (which are
 * generated listings nobody hand-writes metadata for).
 *
 * What it writes is DERIVED data: each page's current title, description and
 * an HTML rendering of its content, so the SEO analyser has something to score
 * and the list has something to show. It is safe to delete and regenerate at any time, and it
 * never touches page_seo, which holds the overrides an editor actually set.
 *
 * Run it after porting or changing page content. It is not part of the build:
 * the build consumes the overrides, not the index.
 *
 * Needs CLOUDFLARE_API_TOKEN (or CF_API_TOKEN).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || '47a82355b575e264047206a36c2cd05c';
const DB = process.env.BLOG_DB_ID || 'ed3116e7-7699-4d4d-8785-2ea67f81aed1';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;

if (!TOKEN) {
  console.error('No CLOUDFLARE_API_TOKEN / CF_API_TOKEN in the environment.');
  process.exit(1);
}

async function d1(sql, params = []) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    },
  );
  const body = await r.json().catch(() => null);
  if (!r.ok || !body?.success) {
    throw new Error(`D1 ${r.status}: ${JSON.stringify(body?.errors ?? body).slice(0, 300)}`);
  }
  return body.result[0];
}

/**
 * The page as HTML, in document order.
 *
 * Not stripped text. The analyser scores subheadings, internal and external
 * links, images and lists, and text with the markup removed contains none of
 * those -- every page scored badly and no edit could move it. The rich-text
 * blocks are already HTML; headings, images and lists are reconstructed around
 * them so the score reflects what the visitor actually gets.
 */
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function collect(node, out = []) {
  if (Array.isArray(node)) {
    for (const v of node) collect(v, out);
  } else if (node && typeof node === 'object') {
    switch (node.type) {
      case 'heading': {
        if (node.text) {
          // Level 1 is the page's own H1; the analyser counts h2-h6 as
          // subheadings, which is the distinction that matters to it.
          const tag = `h${Math.min(6, Math.max(1, node.level || 2))}`;
          out.push(`<${tag}>${esc(node.text)}</${tag}>`);
        }
        break;
      }
      case 'text':
        if (node.html) out.push(node.html);
        break;
      case 'image':
        if (node.src) out.push(`<img src="${esc(node.src)}" alt="${esc(node.alt || '')}" />`);
        break;
      case 'feature':
        if (node.title) out.push(`<h3>${esc(node.title)}</h3>`);
        if (node.text) out.push(`<p>${esc(node.text)}</p>`);
        if (node.image) out.push(`<img src="${esc(node.image)}" alt="${esc(node.alt || '')}" />`);
        break;
      case 'list':
        if (Array.isArray(node.items) && node.items.length) {
          out.push(
            '<ul>' +
              node.items
                .map((i) =>
                  i.href
                    ? `<li><a href="${esc(i.href)}">${esc(i.text || '')}</a></li>`
                    : `<li>${esc(i.text || '')}</li>`,
                )
                .join('') +
              '</ul>',
          );
        }
        break;
      case 'button':
        if (node.href) out.push(`<a href="${esc(node.href)}">${esc(node.text || '')}</a>`);
        break;
      case 'cards':
        if (Array.isArray(node.cards)) {
          for (const c of node.cards) {
            if (c.href) out.push(`<a href="${esc(c.href)}">${esc(c.title || '')}</a>`);
            if (c.image) out.push(`<img src="${esc(c.image)}" alt="${esc(c.alt || '')}" />`);
          }
        }
        break;
      default:
        break;
    }
    for (const key of ['blocks', 'cols', 'sections']) {
      if (node[key]) collect(node[key], out);
    }
  }
  return out;
}

/** Visible words only, for the word count shown in the list. */
const plain = (html) =>
  html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

const files = fs.readdirSync(path.join(ROOT, 'src/data/pages')).filter((f) => f.endsWith('.json'));
const pages = [];
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/pages', f), 'utf8'));
  if (d.kind !== 'page') continue;
  const html = collect(d.sections ?? []).join('\n');
  const text = plain(html);
  pages.push({
    slug: d.slug,
    title: d.title ?? '',
    description: d.description ?? '',
    ogImage: d.ogImage ?? null,
    words: text ? text.split(/\s+/).length : 0,
    html,
  });
}
pages.sort((a, b) => a.slug.localeCompare(b.slug));
console.log(`index-pages: ${pages.length} pages to index`);

/* Upserted one at a time rather than in one enormous statement: the body text
   of 60 pages is a few hundred KB, and a single request carrying all of it is
   the kind of thing that fails at the worst moment for no benefit. */
let done = 0;
for (const p of pages) {
  await d1(
    `INSERT INTO page_index (slug, title, description, og_image, words, body_html, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(slug) DO UPDATE SET
       title = excluded.title, description = excluded.description,
       og_image = excluded.og_image, words = excluded.words,
       body_html = excluded.body_html, indexed_at = datetime('now')`,
    [p.slug, p.title, p.description, p.ogImage, p.words, p.html],
  );
  done++;
  if (done % 20 === 0) console.log(`  ${done}/${pages.length}`);
}

// A page removed from the site should not linger in the list.
const slugs = pages.map((p) => `'${p.slug.replace(/'/g, "''")}'`).join(',');
const gone = await d1(`DELETE FROM page_index WHERE slug NOT IN (${slugs})`);
console.log(`index-pages: ${done} indexed, ${gone.meta.changes} stale row(s) removed`);
