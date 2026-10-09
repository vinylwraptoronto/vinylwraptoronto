/**
 * Carry each icon box's own icon colour and title spacing.
 *
 * The port draws every icon-box icon in the brand green. The original sets
 * the colour per widget --
 *
 *   .elementor-element-ID.elementor-view-default .elementor-icon {
 *     fill: var(--e-global-color-f32bb28); color: var(--e-global-color-f32bb28) }
 *
 * -- and on most pages that is the pink, the navy or the lime, not the green:
 * 64 of the site's icon boxes were the wrong colour.
 *
 * The same goes for the space under the title -- Elementor's "Title Bottom
 * Space" -- which the port draws at 16px everywhere and the Tesla pages, for
 * one, set to 5px, so each of their boxes came out 11px tall.
 *
 * Read by cascade rather than from the stylesheet text, because the rule that
 * wins is what matters: each live page is loaded, every icon box's computed
 * colour and title margin are read, and only the ones that differ from the
 * port's defaults are written -- the colour as the kit token it resolves to.
 *
 * Writes src/data/icon-box.json,
 * `{ id: { color?: "var(--e-global-color-…)", titleGap?: "5px" } }`.
 *
 *   node scripts/pull-icon-box.mjs /contact/ /lp/ ...   (default: every page
 *   that carries an icon box)
 */
import fs from 'node:fs';
import path from 'node:path';
import { launchChromium } from './lib/browser.mjs';

const OUT = 'src/data/icon-box.json';
const ORIGIN = 'https://vinylwraptoronto.com';
const DEFAULT = 'rgb(20, 162, 120)'; // --e-global-color-8c22d81, the port's default
const TITLE_GAP = '16px'; // .feature h3/h4 margin-bottom, the port's default
const TOKENS = {
  'rgb(255, 0, 153)': 'var(--e-global-color-f32bb28)',
  'rgb(21, 51, 76)': 'var(--e-global-color-d077a13)',
  'rgb(153, 204, 51)': 'var(--e-global-color-a8178e9)',
  'rgb(20, 162, 120)': 'var(--e-global-color-8c22d81)',
};

const paths = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync('src/data/pages')
  .map((f) => JSON.parse(fs.readFileSync(path.join('src/data/pages', f), 'utf8')))
  .filter((d) => d.kind === 'page' && JSON.stringify(d.sections).includes('"type":"feature"'))
  .map((d) => (d.slug && d.slug !== 'index' ? `/${d.slug.replace(/^\/|\/$/g, '')}/` : '/'));

const out = {};
const browser = await launchChromium({ headless: true });
for (const p of paths) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(ORIGIN + p, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(1500);
  const found = await page.evaluate(() => {
    const o = {};
    document.querySelectorAll('.elementor-widget-icon-box').forEach((e) => {
      const i = e.querySelector('.elementor-icon');
      const t = e.querySelector('.elementor-icon-box-title');
      if (!i) return;
      /* Only a title with a description under it: the margin is the space
         between the two, and on a lone title it moves nothing. */
      const gap = t && e.querySelector('.elementor-icon-box-description') ? getComputedStyle(t).marginBottom : null;
      o[e.dataset.id] = [getComputedStyle(i).color, gap];
    });
    return o;
  });
  await page.close();
  let colours = 0;
  let gaps = 0;
  for (const [id, [rgb, gap]] of Object.entries(found)) {
    const entry = {};
    if (rgb !== DEFAULT) { entry.color = TOKENS[rgb] ?? rgb; colours++; }
    if (gap && gap !== TITLE_GAP) { entry.titleGap = gap; gaps++; }
    if (Object.keys(entry).length) out[id] = entry;
  }
  console.log(`${p}: ${Object.keys(found).length} icon boxes, ${colours} not green, ${gaps} with their own title spacing`);
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${Object.keys(out).length} icon boxes to ${OUT}`);
