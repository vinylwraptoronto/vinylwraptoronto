/** Verify the external authoring workflow without writing to remote D1. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'new-post-test-'));
const dimensions = JSON.parse(fs.readFileSync(path.join(root, 'src/data/img-dims.json'), 'utf8'));
const [featured, size] = Object.entries(dimensions).find(([, value]) => Array.isArray(value) && value.length === 2);
const db = new DatabaseSync(':memory:');

try {
  for (const name of ['0001_blog_schema.sql', '0002_render_tree.sql', '0004_admin_auth.sql', '0005_authoring_and_seo.sql']) {
    db.exec(fs.readFileSync(path.join(root, 'db/migrations', name), 'utf8'));
  }
  db.exec(`ALTER TABLE posts ADD COLUMN faq_json TEXT;
    INSERT INTO authors(slug,name) VALUES('test-author','Test Author');
    INSERT INTO terms(taxonomy,slug,name) VALUES('category','test-category','Test Category');`);
  fs.writeFileSync(path.join(temporary, 'body.html'), '<h2>Planning a fleet wrap</h2><p>Confirm the artwork and vehicle availability before scheduling the fleet.</p><div role="region" aria-label="Comparison" tabindex="0" onscroll="alert(1)"><table><caption>Comparison</caption><tr><th scope="col">Approach</th></tr></table></div><div role="button" tabindex="9">Other</div><script>alert(1)</script>');

  for (const variant of ['draft', 'default', 'invalid']) {
    const spec = {
      slug: 'test-new-post-' + variant,
      title: 'Test post', body: 'body.html', author: 'Test Author',
      featured, pageCss: '.test-post { color: #15334c; }',
      publishedAt: '2026-10-08T09:00:00-04:00',
      categories: ['Test Category'], tags: ['Test Tag'],
      ...(variant === 'default' ? {} : { status: variant === 'draft' ? 'draft' : 'unexpected' }),
    };
    const specPath = path.join(temporary, variant + '.json');
    const sqlPath = path.join(temporary, variant + '.sql');
    fs.writeFileSync(specPath, JSON.stringify(spec));
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/new-post.mjs'), specPath, '--out', sqlPath], { cwd: root, encoding: 'utf8' });
    if (variant === 'invalid') {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /status must be draft or published/);
      assert.equal(fs.existsSync(sqlPath), false);
      continue;
    }
    assert.equal(result.status, 0, result.stderr);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    db.exec(sql);
    db.exec(sql); // Re-running must neither duplicate nor change the post.
    const row = db.prepare('SELECT * FROM posts WHERE slug=?').get(spec.slug);
    assert.equal(row.status, variant === 'draft' ? 'draft' : 'published');
    assert.equal(row.published_at, variant === 'draft' ? null : spec.publishedAt);
    assert.equal(row.page_css, spec.pageCss);
    assert.match(row.body_html, /role="region" aria-label="Comparison" tabindex="0"/);
    assert.doesNotMatch(row.body_html, /onscroll|<script|role="button"|tabindex="9"/);
    assert.equal(row.canonical_url, null);
    const head = JSON.parse(row.head_json);
    const article = head.ld['@graph'].find((item) => item['@type'] === 'BlogPosting');
    assert.equal(article.mainEntityOfPage['@id'], 'https://vinylwraptoronto.com/' + spec.slug + '/');
    assert.equal(article.datePublished, variant === 'draft' ? undefined : spec.publishedAt);
    const hero = JSON.parse(row.sections_json)[0].blocks[0].cols[1].blocks[0];
    assert.equal(hero.width, size[0]);
    assert.equal(hero.height, size[1]);
    assert.equal(head.meta.find((item) => item[0] === 'og:image:width')[2], String(size[0]));
    assert.equal(db.prepare('SELECT count(*) AS n FROM posts WHERE slug=?').get(spec.slug).n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM post_terms WHERE post_id=?').get(row.id).n, 2);
  }
  console.log('PASS: draft publication gate, default publication, styles, image dimensions, terms, idempotency, inherited canonical and invalid status.');
} finally {
  db.close();
  const resolved = fs.realpathSync(temporary);
  assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('new-post-test-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
