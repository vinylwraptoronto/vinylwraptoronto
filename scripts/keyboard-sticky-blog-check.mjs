// Real-keyboard regression (QA f864 closeout, sticky-keyboard-closeout-20261003):
// actual Tab/Shift+Tab traversal (not .focus()) to the colliding /blog/ card
// title and both StickyBar actions, with numeric focus-visible viewport
// bounds + non-intersection checks, real Enter/Space activation, tel: intent
// interception (no real call), and message-popup open/Escape-close/focus
// return. Also covers one sibling listing route for the shared `.cards` CSS.
//
// Runs the identical assertion sequence at two viewports -- mobile (where
// the collision was originally proven) and desktop (the sticky bar's pill
// is shorter/wider there but still bottom-pinned) -- so the
// scroll-padding-bottom fix in StickyBar.astro is proven at both sizes, not
// just the one that originally failed. No assertion threshold below is
// changed between the two passes; only the viewport and evidence filenames
// vary.
import fs from 'node:fs';
import path from 'node:path';
import { launchChromium } from './lib/browser.mjs';
import { serveDist } from './lib/static-site.mjs';

const EVIDENCE_DIR = 'D:/Codex/vinyl-external-evidence-20261002/sticky-keyboard-closeout-20261003';
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

function rectsIntersect(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
function inViewport(rect, vw, vh) {
  return rect.left >= 0 && rect.top >= 0 && rect.right <= vw && rect.bottom <= vh &&
    rect.width > 0 && rect.height > 0;
}

async function tabTo(page, matchFn, { shift = false, max = 60 } = {}) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab');
    const matched = await page.evaluate(matchFn);
    if (matched) return i + 1;
  }
  return -1;
}

async function runViewport(browser, origin, viewport, label) {
  const log = [];
  const record = (...a) => { console.log(`[${label}]`, ...a); log.push(a.map(String).join(' ')); };
  let exitCode = 0;

  const page = await browser.newPage({ viewport });

  // Intercept tel: links at the browser-event level: capture intended
  // target, prevent real navigation/dialer invocation, never place a call.
  await page.exposeFunction('__telIntercepts', () => {});
  await page.addInitScript(() => {
    window.__telCaptured = [];
    document.addEventListener('click', (e) => {
      const a = e.target && e.target.closest && e.target.closest('a[href^="tel:"]');
      if (a) {
        window.__telCaptured.push(a.getAttribute('href'));
        e.preventDefault();
      }
    }, true);
  });

  // --- 1. /blog/: real Tab traversal to the colliding card title link ---
  await page.goto(origin + '/blog/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100); // StickyBar fade-in settle (data-shown)
  await page.keyboard.press('Tab'); // enter document from browser chrome baseline
  const CARD_SELECTOR = 'li:nth-child(3) .card-title a';
  const stepsToCard = await tabTo(page, () => {
    const a = document.querySelector('li:nth-child(3) .card-title a');
    return !!a && document.activeElement === a;
  }, { max: 80 });
  record('blog: Tab steps to colliding card title:', stepsToCard);
  if (stepsToCard === -1) { exitCode = 1; record('FAIL: never reached card title via real Tab'); }

  const cardGeom = await page.evaluate(() => {
    const a = document.activeElement;
    const bar = document.querySelector('[data-sticky-bar] .sb-pill');
    return {
      card: a ? a.getBoundingClientRect().toJSON() : null,
      bar: bar ? bar.getBoundingClientRect().toJSON() : null,
      vw: window.innerWidth, vh: window.innerHeight,
      activeTag: a ? a.tagName : null,
    };
  });
  record('blog card focus geometry:', JSON.stringify(cardGeom));
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `focus-card-${label}.png`) }).catch(() => {});
  const cardInBounds = cardGeom.card && inViewport(cardGeom.card, cardGeom.vw, cardGeom.vh);
  const cardNoOverlap = cardGeom.card && cardGeom.bar && !rectsIntersect(cardGeom.card, cardGeom.bar);
  record('blog card in-viewport bounds:', cardInBounds, '| non-intersection with sticky bar:', cardNoOverlap);
  if (!cardInBounds || !cardNoOverlap) { exitCode = 1; record('FAIL: card focus geometry'); }

  // Shift+Tab back off the card title to prove reverse traversal also works.
  // (The card's own thumbnail link is tabindex="-1" by design -- it
  // duplicates the title link's href, see Blocks.astro -- so reverse
  // traversal is expected to land on an earlier card's title, not the
  // current card's thumb.)
  await page.keyboard.press('Shift+Tab');
  const activeAfterShiftTab = await page.evaluate(() => ({
    tag: document.activeElement.tagName,
    isPrevCardTitle: document.activeElement.closest('.card-title') != null,
    isSameCard: document.activeElement === document.querySelector('li:nth-child(3) .card-title a'),
  }));
  record('blog: Shift+Tab off card title ->', JSON.stringify(activeAfterShiftTab));
  if (activeAfterShiftTab.isSameCard) { exitCode = 1; record('FAIL: Shift+Tab did not move focus backward'); }

  // Re-tab forward to the card title and activate with Enter -> real navigation.
  await tabTo(page, () => document.activeElement === document.querySelector('li:nth-child(3) .card-title a'), { max: 10 });
  const expectedHref = await page.evaluate((sel) => document.querySelector(sel).href, CARD_SELECTOR);
  await Promise.all([
    page.waitForURL(expectedHref, { timeout: 8000 }).catch(() => {}),
    page.keyboard.press('Enter'),
  ]);
  await page.waitForLoadState('domcontentloaded');
  const navigatedUrl = page.url();
  record('blog card Enter activation -> navigated to:', navigatedUrl, '(expected', expectedHref, ')');
  if (navigatedUrl !== expectedHref) { exitCode = 1; record('FAIL: card Enter did not navigate to its own href'); }

  // --- 2. /blog/: StickyBar call + message actions via real Tab ---
  await page.goto(origin + '/blog/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  await page.keyboard.press('Tab');
  const stepsToCall = await tabTo(page, () => document.activeElement && document.activeElement.classList &&
    document.activeElement.classList.contains('sb-btn--call'), { max: 100 });
  record('blog: Tab steps to StickyBar call action:', stepsToCall);
  const callGeom = await page.evaluate(() => {
    const el = document.activeElement;
    const bar = document.querySelector('[data-sticky-bar] .sb-pill');
    const rect = el.getBoundingClientRect().toJSON();
    const barRect = bar.getBoundingClientRect().toJSON();
    return { rect, vw: window.innerWidth, vh: window.innerHeight, selfIsInsideBar: rectWithin(rect, barRect) };
    function rectWithin(r, b) { return r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1; }
  });
  record('blog call-button focus geometry:', JSON.stringify(callGeom));
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `focus-call-${label}.png`) }).catch(() => {});
  const callInBounds = inViewport(callGeom.rect, callGeom.vw, callGeom.vh);
  record('call button in-viewport bounds:', callInBounds, '| contained within its own pill (expected overlap with OWN bar, not foreign element):', callGeom.selfIsInsideBar);
  if (!callInBounds) { exitCode = 1; record('FAIL: call button focus geometry out of viewport'); }

  await page.evaluate(() => { window.__telCaptured.length = 0; });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const telCaptured = await page.evaluate(() => window.__telCaptured.slice());
  const urlAfterTel = page.url();
  record('tel intercept captured:', JSON.stringify(telCaptured), '| page url unchanged (no real call/navigation):', urlAfterTel.includes('/blog/'));
  if (!telCaptured.length || !telCaptured[0].startsWith('tel:')) { exitCode = 1; record('FAIL: tel: intent not captured'); }

  // Continue tabbing to the message button.
  const stepsToMsg = await tabTo(page, () => document.activeElement && document.activeElement.classList &&
    document.activeElement.classList.contains('sb-btn--msg'), { max: 10 });
  record('blog: Tab steps from call to message action:', stepsToMsg);
  const msgGeom = await page.evaluate(() => {
    const el = document.activeElement;
    const bar = document.querySelector('[data-sticky-bar] .sb-pill');
    return { rect: el.getBoundingClientRect().toJSON(), barRect: bar.getBoundingClientRect().toJSON(), vw: window.innerWidth, vh: window.innerHeight };
  });
  const msgInBounds = inViewport(msgGeom.rect, msgGeom.vw, msgGeom.vh);
  record('message button in-viewport bounds:', msgInBounds, JSON.stringify(msgGeom));
  if (!msgInBounds) { exitCode = 1; record('FAIL: message button focus geometry'); }

  // Space activates the button (native <button> default activation key) -> popup opens.
  await page.keyboard.press(' ');
  await page.waitForTimeout(200);
  const popupOpen = await page.evaluate(() => {
    const pop = document.getElementById('popup-quote');
    return pop ? !pop.hidden : false;
  });
  record('message Space activation -> popup-quote open:', popupOpen);
  if (!popupOpen) { exitCode = 1; record('FAIL: popup did not open on Space'); }
  const focusInsideModal = await page.evaluate(() => {
    const pop = document.getElementById('popup-quote');
    return pop ? pop.contains(document.activeElement) : false;
  });
  record('focus moved inside modal on open:', focusInsideModal);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `modal-open-${label}.png`) }).catch(() => {});

  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const popupClosedAndFocusReturned = await page.evaluate(() => {
    const pop = document.getElementById('popup-quote');
    const msgBtn = document.querySelector('.sb-btn--msg');
    return { hidden: pop ? pop.hidden : null, focusReturned: document.activeElement === msgBtn };
  });
  record('Escape close + focus return:', JSON.stringify(popupClosedAndFocusReturned));
  if (!popupClosedAndFocusReturned.hidden || !popupClosedAndFocusReturned.focusReturned) {
    exitCode = 1; record('FAIL: Escape close/focus-return contract broken');
  }

  // --- 3. Sibling route sanity (shared .cards CSS, same aspect-ratio fix) ---
  await page.goto(origin + '/car-wraps/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  await page.keyboard.press('Tab');
  const stepsSibling = await tabTo(page, () => {
    const a = document.querySelector('.card-title a');
    return !!a && document.activeElement === a;
  }, { max: 100 });
  record('/car-wraps/ sibling: Tab steps to first card title:', stepsSibling);
  const siblingGeom = await page.evaluate(() => {
    const a = document.activeElement;
    const bar = document.querySelector('[data-sticky-bar] .sb-pill');
    return { card: a ? a.getBoundingClientRect().toJSON() : null, bar: bar ? bar.getBoundingClientRect().toJSON() : null, vw: window.innerWidth, vh: window.innerHeight };
  });
  record('/car-wraps/ sibling card geometry:', JSON.stringify(siblingGeom));
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `focus-sibling-${label}.png`) }).catch(() => {});
  const sibInBounds = siblingGeom.card && inViewport(siblingGeom.card, siblingGeom.vw, siblingGeom.vh);
  const sibNoOverlap = siblingGeom.card && siblingGeom.bar && !rectsIntersect(siblingGeom.card, siblingGeom.bar);
  record('/car-wraps/ sibling card geometry inBounds:', sibInBounds, 'noOverlap:', sibNoOverlap);
  if (stepsSibling === -1 || !sibInBounds || !sibNoOverlap) { exitCode = 1; record('FAIL: sibling route card focus geometry'); }

  await page.close();

  record('EXIT CODE:', exitCode);
  fs.writeFileSync(path.join(EVIDENCE_DIR, `keyboard-check-${label}.log`), log.join('\n') + '\n');
  return exitCode;
}

const browser = await launchChromium();
let exitCode = 0;
try {
  const { server, origin } = await serveDist(4321);
  try {
    // Mobile: 390x844, where the collision was originally proven (QA f864).
    const mobileExit = await runViewport(browser, origin, { width: 390, height: 844 }, 'mobile-390x844');
    // Desktop: 1440x900, where the StickyBar pill is a different shape/height
    // (measured 55px vs mobile's 56px, see StickyBar.astro comment) but still
    // bottom-pinned, so the same native focus-scroll collision class could in
    // principle reproduce there too.
    const desktopExit = await runViewport(browser, origin, { width: 1440, height: 900 }, 'desktop-1440x900');
    exitCode = mobileExit || desktopExit;
  } finally {
    server.close();
  }
} finally {
  await browser.close();
}

console.log('OVERALL EXIT CODE:', exitCode, '(mobile + desktop combined)');
process.exit(exitCode);
