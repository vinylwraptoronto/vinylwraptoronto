/**
 * The web stories, as the documents they are.
 *
 * A web story is not a page with a long body. It is an AMP document -- an
 * `<amp-story>` of full-screen `<amp-story-page>`s, each a stack of absolutely
 * positioned layers, driven by the AMP story runtime: one viewport at a time,
 * tap or arrow to advance, auto-advance after 10s, the entrance animations in
 * `<amp-story-animation>`, its own two Google fonts.
 *
 * The extractor read one as if it were an Elementor page and flattened its
 * layers into image, heading and text blocks, so the port drew it as an
 * ordinary article: 3,912px of stacked pictures against the original's single
 * 881px screen, no navigation, no layering, every caption at the site's body
 * size. No amount of page CSS turns that back into a story -- the runtime IS
 * the presentation.
 *
 * So the story is carried whole. This fetches each one's served HTML (the
 * plugin's own server-side-rendered AMP, already valid) and rewrites only what
 * has to change to live on this stack:
 *
 *   - upload addresses move to the image host, the same rewrite img() makes
 *     everywhere else -- the old server must not be referenced at all;
 *   - links to other pages on the site become site-relative, so a story on the
 *     preview hostname does not walk the reader off to the WordPress site;
 *   - the WordPress plumbing in the head (REST, oEmbed, XML-RPC, shortlink)
 *     goes, because those addresses do not exist here.
 *
 * The canonical, the structured data and the analytics block are left as the
 * original serves them, like every other page's head.
 *
 *   node scripts/pull-web-stories.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = 'https://vinylwraptoronto.com';
const IMG = (process.env.PUBLIC_IMG_BASE ?? 'https://img.vinylwraptoronto.com').replace(/\/+$/, '');
const OUT = 'src/data/stories';

const stories = fs.readdirSync('src/data/pages')
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join('src/data/pages', f), 'utf8')))
  .filter((p) => p.kind === 'story');

fs.mkdirSync(OUT, { recursive: true });

for (const story of stories) {
  const url = `${ORIGIN}/${story.slug}/`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) {
    console.error(`${url}: HTTP ${res.status} -- kept the copy already on disk`);
    process.exitCode = 1;
    continue;
  }
  let html = await res.text();
  if (!/<amp-story[\s>]/.test(html)) {
    console.error(`${url}: no <amp-story> in the response -- not written`);
    process.exitCode = 1;
    continue;
  }

  // WordPress plumbing: addresses that only exist on the old server.
  html = html.replace(
    /<link[^>]*(?:rel="(?:https:\/\/api\.w\.org\/|EditURI|shortlink)"|wp-json\/|xmlrpc\.php|comments\/feed\/)[^>]*>\s*/g,
    '',
  );

  // Uploads to the image host.
  html = html.split(`${ORIGIN}/wp-content/uploads/`).join(`${IMG}/`);

  // Links a reader can follow stay on this site. Only href attributes on
  // anchors: the canonical and the JSON-LD keep the absolute address, as every
  // other page's head does.
  html = html.replace(/(<a\b[^>]*\shref=")https:\/\/vinylwraptoronto\.com(\/[^"]*)"/g, '$1$2"');

  const leftover = html.match(/https:\/\/vinylwraptoronto\.com\/wp-content\/[^"' )]*/g);
  if (leftover) {
    console.error(`${url}: ${leftover.length} reference(s) to the old server remain -- not written`);
    process.exitCode = 1;
    continue;
  }

  const name = story.slug.replace(/^web-stories\//, '');
  fs.writeFileSync(path.join(OUT, `${name}.html`), html);
  const pages = (html.match(/<amp-story-page[\s>]/g) || []).length;
  console.log(`${story.slug}: ${pages} story pages, ${html.length} bytes`);
}
