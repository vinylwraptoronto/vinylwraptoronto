/**
 * Postbuild guard: /fonts/files/fa-brands-400-subset.woff2 carries only the
 * Font Awesome 5.15.3 brand glyphs this site draws (a lossless glyph-outline
 * subset of fa-brands-400.woff2: fonttools pyftsubset, no hinting/features;
 * outlines + advances verified identical to the original for each glyph).
 * The full 81.6 KB brands file stays on disk as the woff/ttf fallback source.
 *
 * Fails the build if any built page uses a `fab fa-*` class whose codepoint is
 * not in the subset, so a new brand icon can never render as a missing glyph.
 * To add one: re-subset with that codepoint and extend KEPT below.
 */
import fs from 'node:fs';
import path from 'node:path';

const KEPT = { // class -> codepoint in the subset
  'fa-facebook': 'f09a', 'fa-instagram': 'f16d', 'fa-linkedin': 'f08c', 'fa-pinterest': 'f0d2',
  'fa-reddit': 'f1a1', 'fa-tumblr': 'f173', 'fa-twitter': 'f099', 'fa-whatsapp': 'f232',
  'fa-whatsapp-square': 'f40c', 'fa-youtube': 'f167',
};
const dist = path.resolve('dist');
const css = fs.readFileSync(path.join(dist, 'fonts', 'fontawesome.css'), 'utf8');
if (!css.includes('fa-brands-400-subset.woff2')) { console.error('check-fa-brands-subset: css does not point at the subset'); process.exit(1); }
const bad = new Set();
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p);
  else if (e.name.endsWith('.html')) {
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/class="([^"]*)"/g)) {
      const t = m[1].split(/\s+/);
      if (!t.includes('fab')) continue;
      for (const c of t) if (/^fa-/.test(c) && !/^fa-(lg|xs|sm|[0-9]+x|fw|spin|pulse|border|li|ul|stack.*|inverse|rotate.*|flip.*|pull.*)$/.test(c) && !KEPT[c]) bad.add(`${c} (${path.relative(dist, p)})`);
    }
  } } };
walk(dist);
if (bad.size) { console.error(`check-fa-brands-subset: brand icons missing from the subset: ${[...bad].slice(0, 10).join(', ')}`); process.exit(1); }
console.log('check-fa-brands-subset: ok');
