/**
 * Carry the Elementor image widget's own Width control (`_width` is the
 * container; this is the widget setting "Width" under Style > Image).
 *
 * Elementor writes it into the page's inline post CSS as
 *
 *     .elementor-element-509a115c img { width: 70%; }
 *     @media (max-width:1024px) { ...same selector... { width: 100%; } }
 *     @media (max-width:767px)  { ...same selector... { width: 100%; } }
 *
 * The extractor dropped it, so every such image drew at its column's full
 * width -- 690px against the original's 490px on /commercial-vehicle-wraps/.
 *
 * Stored on the image block as `imgWidth: { d?, t?, m? }` (desktop, tablet
 * <=1024px, mobile <=767px), only for widgets whose original declares one.
 *
 *     node scripts/pull-image-widths.mjs --dry-run
 *     node scripts/pull-image-widths.mjs
 *     node scripts/pull-image-widths.mjs --only commercial-vehicle-wraps
 */
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = 'https://vinylwraptoronto.com';
const DIR = 'src/data/pages';
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const only = args.includes('--only') ? args.slice(args.indexOf('--only') + 1) : null;

/** id -> {d,t,m} from every <style> block of the page. */
export function widthsFromHtml(html) {
  const out = {};
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const stack = [];
  let buf = '';
  for (const ch of css) {
    if (ch === '{') {
      stack.push(buf.trim());
      buf = '';
    } else if (ch === '}') {
      const body = buf.trim();
      const sel = stack.pop() ?? '';
      if (body && !sel.startsWith('@')) {
        const wm = /(?:^|;)\s*width\s*:\s*([\d.]+(?:%|px|vw))\s*(?:!important)?\s*(?:;|$)/.exec(body);
        const media = stack.find((s) => s.startsWith('@media')) ?? '';
        const bp = !media ? 'd' : /max-width:\s*767px/.test(media) ? 'm' : /max-width:\s*1024px/.test(media) ? 't' : null;
        if (wm && bp) {
          for (const s of sel.split(',')) {
            const m = /\.elementor-element-([0-9a-f]{7,8})\s+img$/.exec(s.trim());
            if (m) (out[m[1]] ??= {})[bp] = wm[1];
          }
        }
      }
      buf = '';
    } else buf += ch;
  }
  return out;
}

const walk = (o, fn) => {
  if (Array.isArray(o)) o.forEach((v) => walk(v, fn));
  else if (o && typeof o === 'object') {
    if (o.type === 'image' && o.eid) fn(o);
    Object.values(o).forEach((v) => walk(v, fn));
  }
};

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
const todo = [];
for (const f of files) {
  const slug = f.replace(/\.json$/, '');
  if (only && !only.includes(slug)) continue;
  const data = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  let has = false;
  walk(data, () => (has = true));
  if (has) todo.push({ f, slug, data });
}

let changed = 0, blocks = 0, failed = 0, i = 0;
const worker = async () => {
  while (i < todo.length) {
    const { f, slug, data } = todo[i++];
    const url = data.url;
    let html;
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (!r.ok) throw new Error(r.status);
      html = await r.text();
    } catch (e) {
      failed++;
      console.error(`FAIL ${url} ${e.message}`);
      continue;
    }
    const w = widthsFromHtml(html);
    let touched = false;
    walk(data, (b) => {
      const v = w[b.eid];
      if (v) {
        blocks++;
        if (JSON.stringify(b.imgWidth) !== JSON.stringify(v)) { b.imgWidth = v; touched = true; }
      }
    });
    if (touched) {
      changed++;
      console.log(`${slug}`);
      if (!dry) fs.writeFileSync(path.join(DIR, f), JSON.stringify(data));
    }
  }
};
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`pages fetched ${todo.length}, failed ${failed}, blocks with imgWidth ${blocks}, files ${dry ? 'would change' : 'changed'} ${changed}`);
