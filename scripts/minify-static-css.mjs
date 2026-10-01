/**
 * Postbuild step: losslessly minify the self-hosted font/icon stylesheets
 * that Astro copies verbatim from `public/` into `dist/`.
 *
 * Why: these are the four render-blocking <link rel="stylesheet"> files
 * loaded on every page (poppins.css, roboto.css, montserrat.css,
 * fontawesome.css). Astro's own bundled component CSS (the `_astro/*.css`
 * chunks) is already minified by Vite during `astro build`; these four are
 * not, because `public/` assets are copied as-is. Minifying only removes
 * whitespace and comments -- every @font-face rule, selector, property,
 * url(), and unicode-range stays byte-identical in content, so there is no
 * behavioural or visual change, only a smaller transfer/parse size.
 *
 * The readable, commented source stays in `public/fonts/*.css` for future
 * maintenance; only the built `dist/` copy is minified, post-build.
 *
 * Not run in `astro dev` and not part of `npm run check` -- wired into
 * `npm run build` only, after `astro build`.
 */
import { transform } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const files = ['poppins.css', 'roboto.css', 'montserrat.css', 'fontawesome.css'];
const dir = path.resolve('dist/fonts');

let totalBefore = 0;
let totalAfter = 0;

for (const name of files) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const { code, warnings } = await transform(before, {
    loader: 'css',
    minify: true,
    // Font Awesome's license banner is repeated once per vendor section;
    // keep exactly one copy (attribution preserved) instead of duplicating
    // it, rather than stripping it outright.
    legalComments: 'eof',
  });
  if (warnings.length) {
    console.error(`minify-static-css: ${name} produced warnings, leaving the file untouched:`);
    for (const w of warnings) console.error(' ', w.text);
    continue;
  }
  fs.writeFileSync(file, code);
  totalBefore += before.length;
  totalAfter += code.length;
  console.log(`minify-static-css: ${name} ${before.length} -> ${code.length} bytes`);
}

console.log(`minify-static-css: total ${totalBefore} -> ${totalAfter} bytes (${totalBefore - totalAfter} saved)`);
