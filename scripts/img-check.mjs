/**
 * Requests every distinct image the built pages point at, over HTTPS, against
 * the real image host — the same requests a browser makes.
 *
 * The static sweep can only prove the URLs were *shaped* correctly. This proves
 * the bytes are actually there, that the Cloudflare transform rule maps the
 * hostname onto the right bucket, and that responses come back through
 * Cloudflare (`cf-cache-status` present) rather than direct from Backblaze,
 * which would be billed egress.
 *
 * Reads dist-img-keys.json, written by sweep.mjs. Run the sweep first.
 */
import fs from 'node:fs';

const BASE = (process.env.PUBLIC_IMG_BASE ?? 'https://img.vinylwraptoronto.com').replace(/\/+$/, '');
const CONCURRENCY = Number(process.env.IMG_CHECK_CONCURRENCY ?? 24);

if (!fs.existsSync('dist-img-keys.json')) {
  console.error('dist-img-keys.json not found — run `node scripts/sweep.mjs` first.');
  process.exit(1);
}
const keys = JSON.parse(fs.readFileSync('dist-img-keys.json', 'utf8'));
console.log(`checking ${keys.length} distinct images against ${BASE}`);

const notProxied = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** null on success, otherwise a reason. */
async function head(key) {
  try {
    // HEAD, so the check does not pull 367 MB through the network.
    const r = await fetch(`${BASE}/${key}`, { method: 'HEAD', redirect: 'follow' });
    if (r.status !== 200) return `${r.status}`;
    if (!r.headers.get('cf-cache-status')) notProxied.push(key);
    return null;
  } catch (err) {
    return `ERR ${err.message}`;
  }
}

async function pass(list, concurrency) {
  const failed = [];
  const queue = [...list];
  let done = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
        const why = await head(key);
        if (why) failed.push([key, why]);
        if (++done % 250 === 0) process.stdout.write(`  ${done}/${list.length}\r`);
      }
    }),
  );
  return failed;
}

// The outbound proxy drops connections under parallel load, which shows up as
// sporadic 503s and socket errors on a different set of keys each run. A
// failure only counts if it survives a slow, serial retry.
let failures = await pass(keys, CONCURRENCY);
if (failures.length) {
  console.log(`\n${failures.length} to re-check serially...`);
  const retry = [];
  for (const [key] of failures) {
    await sleep(120);
    const why = await head(key);
    if (why) retry.push([key, why]);
  }
  failures = retry;
}

console.log(
  `\nchecked: ${keys.length}   failures: ${failures.length}   not through Cloudflare: ${notProxied.length}`,
);
if (failures.length)
  console.log('\nFAILED:\n  ' + failures.slice(0, 30).map(([k, w]) => `${w}  ${k}`).join('\n  '));
if (notProxied.length) console.log('\nNOT PROXIED:\n  ' + notProxied.slice(0, 10).join('\n  '));

process.exit(failures.length || notProxied.length ? 1 : 0);
