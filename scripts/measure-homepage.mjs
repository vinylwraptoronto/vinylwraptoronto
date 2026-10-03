/**
 * One-off evidence-capture script for the homepage Lighthouse baseline.
 *
 * Runs Lighthouse against a given origin (local static dist OR a live URL)
 * for BOTH mobile and desktop form factors, 3 runs each, and writes every
 * raw JSON report plus a compact summary (per-run scores + medians) to the
 * evidence directory. Not wired into `npm run check` -- this is a manual
 * measurement tool for the Lighthouse-95 task, kept out of CI gating.
 *
 * Usage:
 *   node scripts/measure-homepage.mjs <origin> <path> <label> <outDir>
 *
 * Example:
 *   node scripts/measure-homepage.mjs http://127.0.0.1:8163 / local-preview-before _evidence/lighthouse-20261001
 */
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import { launch } from 'chrome-launcher';
import fs from 'node:fs';
import path from 'node:path';

const [, , origin, route = '/', label = 'run', outDir = '_evidence/lighthouse'] = process.argv;
if (!origin) {
  console.error('Usage: node scripts/measure-homepage.mjs <origin> [path] [label] [outDir]');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const url = origin + route;
const RUNS = 3;

async function runOne(formFactor, chrome) {
  const options = {
    port: chrome.port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  };
  const config = formFactor === 'desktop' ? desktopConfig : undefined;
  if (formFactor === 'mobile') options.formFactor = 'mobile';
  const result = await lighthouse(url, options, config);
  return result.lhr;
}

const summary = { url, label, generatedAt: new Date().toISOString(), mobile: [], desktop: [] };

const chrome = await launch({ chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'] });
try {
  for (const formFactor of ['mobile', 'desktop']) {
    for (let i = 1; i <= RUNS; i++) {
      const lhr = await runOne(formFactor, chrome);
      const scores = Object.fromEntries(
        Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)])
      );
      summary[formFactor].push(scores);
      const file = path.join(outDir, `${label}-${formFactor}-run${i}.json`);
      fs.writeFileSync(file, JSON.stringify(lhr, null, 2));
      console.log(`${label} ${formFactor} run${i}: perf=${scores.performance} a11y=${scores.accessibility} bp=${scores['best-practices']} seo=${scores.seo}`);
    }
  }
} finally {
  try { await chrome.kill(); }
  catch (error) { console.warn(`Chrome cleanup warning: ${error.code || error.message}`); }
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[1]; // n=3
}

const medians = {};
for (const formFactor of ['mobile', 'desktop']) {
  medians[formFactor] = {};
  for (const cat of ['performance', 'accessibility', 'best-practices', 'seo']) {
    medians[formFactor][cat] = median(summary[formFactor].map((s) => s[cat]));
  }
}
summary.medians = medians;

fs.writeFileSync(path.join(outDir, `${label}-summary.json`), JSON.stringify(summary, null, 2));
console.log(`\n${label} MEDIANS:`);
console.log(`  mobile:  perf=${medians.mobile.performance} a11y=${medians.mobile.accessibility} bp=${medians.mobile['best-practices']} seo=${medians.mobile.seo}`);
console.log(`  desktop: perf=${medians.desktop.performance} a11y=${medians.desktop.accessibility} bp=${medians.desktop['best-practices']} seo=${medians.desktop.seo}`);
