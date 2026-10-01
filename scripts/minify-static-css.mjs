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
  if (!fs.existsSync(file)) {
    // QA finding: silently skipping a missing font/icon stylesheet let a
    // broken build (e.g. a renamed/removed public/fonts/*.css) pass build
    // and ship pages whose <link rel="stylesheet"> 404s. Fail loudly instead:
    // every one of these four files is expected to exist in dist/fonts
    // because Base.astro always links poppins.css/roboto.css/fontawesome.css
    // and conditionally links montserrat.css.
    console.error(`minify-static-css: expected font/icon stylesheet missing: ${file}`);
    process.exitCode = 1;
    continue;
  }
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
