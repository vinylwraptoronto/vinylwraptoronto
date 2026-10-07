---
name: site-build-standards
description: House standards for every website TBOX Studio builds or ports — the header/nav layout every site uses, and the lessons learned porting vinylwraptoronto.com from Elementor to Astro (how Elementor actually lays things out, how to measure a port against the original honestly, and the process mistakes not to repeat). Load whenever building, porting, auditing or comparing a client site, building or changing a site header/nav, or running wp-migration / wp-clone-elementor-design / wp-12-rebuild-the-pages.
---

# Site build standards

Two parts. **Part 1 is a standard**: every site gets this header. **Part 2 is
what went wrong on Vinyl Wrap Toronto** and the rule that prevents each mistake.

---

## Part 1 — The header / nav bar (every site)

This is the approved layout. Build it this way on every site unless the client
explicitly asks otherwise, and when asked to audit or fix *other* parts of a
site, **leave the nav alone** — its labels, order and structure are decisions,
not drift.

**Alignment and white space**
- The bar is **boxed to the same content column as the page body and footer**
  (e.g. `width: min(1400px, 100% - 40px); margin-inline: auto`). The logo's left
  edge lines up with the content's left edge; the right-hand CTA lines up with
  the content's right edge.
- There is **always white space at both sides — a 20px gutter minimum at every
  width.** Never run the bar edge to edge; nothing touches the viewport edge.
- 10px vertical padding inside the bar.

**Logo**
- Size the logo on the `<img>` itself (desktop: about 12% of the bar, capped —
  153px on VWT), never as a percentage *column* around it. A column wider than
  the logo leaves an invisible gap that unbalances the bar.

**Menu spacing**
- The menu sits in a flexible middle area between the logo and the CTA
  (`flex: 1 1 auto; min-width: 0`) with **equal margin at both ends** (35px on
  VWT), and its items are **spread evenly** (`justify-content: space-between`).
  Equal gaps between items, equal space at each end. Never pack the items
  against the CTA or the logo with a hole on the other side.
- Step down before it can crowd: tighter item padding at ≤1366px, 14px type at
  ≤1240px, so there is always ≥20px of white space either side of the menu.
  Switch to the mobile menu at ≤1024px.

**Structure**
- Keep the top level short. Fold related items into dropdowns rather than
  adding top-level items (VWT: "Projects" lives under "Our Work"; "Tesla Wraps"
  lives under "Vehicle Wraps" after "Car Wraps", styled like its siblings).
- Dropdowns are **one column**. A sub-group gets a right caret just after its
  label and a **flyout that opens level with its own row**. No multi-column
  mega-menu grids. Row dividers and rounded corners match between dropdown and
  flyout; the hovered parent stays highlighted while the pointer is in its
  flyout.
- A parent with no page of its own is a `<button>`, not `<a href="#">`, styled
  identically to the links beside it. Anchor dropdowns so they never run off
  the screen at 1025px.
- Child combinators (`.nav > ul > li`) in the CSS so submenu rules don't leak.

**Behaviour**
- Sticky; slides away on scroll down and comes back on scroll up
  (`transform`, ~0.4s; no animation under `prefers-reduced-motion`).
- Mobile: the menu panel **floats over** the page (it never pushes content
  down) and slides open; tapping a parent row expands it; the panel keeps
  self-links that the desktop flyout omits.
- Brand-accent bottom rule and a soft shadow on the bar; hovers ease rather
  than snap.

**Check it** at 1440, 1280, 1025, 900 and 390: logo and CTA aligned with the
content edges, white space both sides, even gaps, no dropdown off-screen, the
mobile panel overlays the page.

---

## Part 2 — Lessons from porting vinylwraptoronto.com (Elementor → Astro)

### A. Measuring the port against the original

1. **Fresh load per width, never resize.** Load each page at each width
   separately. Elementor widgets (juxtapose sliders, TOC, galleries) do not
   re-lay-out on resize, so a resized measurement is wrong.
2. **Scroll slowly before measuring the original.** Lazy images inside
   inline-block links measure 0×0 until they load; a fast scroll made
   car-wrap-colours look +8% when it was −0.1%. Scroll in 200–300px steps with
   a pause, then wait ~2.5s.
3. **Measure content height, not box height, inside flex rows.** Stretched
   columns all report the tallest column's height. Use the last child's bottom
   plus padding.
4. **Account for things the port deliberately lacks**, e.g. the original's
   inline reCAPTCHA (72px) in every form. In a sidebar it only adds height when
   the sidebar is the taller column: `max(copy, side+72) − max(copy, side)`.
5. **Compare against the previous build, not only the original.** After every
   change, histogram per-route height deltas versus the last census. A cluster
   (for example "−110px on 390 routes") is a regression or a global fix; find out
   which before shipping.
6. **Run the full census before shipping a global CSS change.** Spot checks miss
   regressions (one round took posts from 127 to 205 out of range until a
   sidebar bug was found).
7. **Don't copy production defects.** For example, images stretched by an
   inline `width:1200px;height:630px`, or a lost `&nbsp;` in stored content.
   Leave them, and name them in the report.
8. **Know your probes' blind spots.** A text-matching drift probe can't follow
   sections built from widgets without text. Fall back to comparing element
   boxes (`getBoundingClientRect` of the column, row and widget chain).

### B. How Elementor actually lays things out (port these exactly)

- **Widgets are flex items.** Margins inside a widget can't collapse out of it,
  so a text widget that ends in a `<p>` is 0.9rem (14.4px) taller than its text.
  Never add `p:last-child{margin-bottom:0}`.
- **The 20px widget gap belongs to widgets.** Widget to widget is 20px. Inner
  sections stacked back to back are **flush**. Inner sections carry their own
  margins, min-height and content alignment (`content-middle`), and these must
  survive flattening.
- **Classic section columns** use 10px padding each (`column-gap-default`), with no
  flex gap. Stacked on a phone they sit **flush**, with no row gap.
  `elementor-col-33` is 33.333%, not 33%.
- **A column's own margin** lives on `.elementor-element-populated`. Carry its
  vertical sides.
- **Widget box** (`> .elementor-widget-container` margin, padding, background).
  *Every* block type must apply it: galleries, sliders, comparisons and post
  navigation included.
- **Buttons have no margin of their own.** Never add a default.
- **Icon lists**: *Space Between* is split half below each item and half above
  the next. The default is **none**. Harvest it per widget and per breakpoint.
- **Icon boxes**: the icon is **50px at line-height 1** unless the widget sets a
  size. Harvest the sized ones.
- **Linked image**: Elementor's `<a>` is inline-block, so a percentage width is
  a percentage of the image's own width. Cap it at the `width` attribute rather
  than copying the inline-block, which goes 0×0 before a lazy image loads.
- **Heading widgets** have zero margin whatever tag they render as (p, div, h*).
- **Gutenberg spacers** (`div.wp-block-spacer`) in post content are real height.
  Keep them.
- **Instagram embeds**: keep `blockquote.instagram-media` with its permalink,
  and load `embed.js` only on pages that have one.
- **TOC widget**: honour `exclude_headings_by_selector` (sidebar, related
  posts). With no headings it still draws its box, with "No headings were found
  on this page."
- **Theme-rendered pages** (body without an `elementor-page-` class) sit in
  Hello's `.site-main`:
  - widths: 500 / 600 / 800 / 1140px from 576 / 768 / 992 / 1200;
  - below 576: full width with 10px padding;
  - thumbnails at their `width` attribute.
- **Shortcode widgets** (e.g. Rank Math's sitemap) take the theme's system font,
  not the kit font.
- **Template sidebars**: look for inner sections the extractor flattened. On
  VWT the navy "Limited Time Offer" panel lost its background, so its white
  price was invisible. Read every template visually at 1440 and 390, not just
  its numbers.

### C. Process and tooling

- **Harvest, don't hand-edit.** For each property class, write a
  `scripts/pull-*.py` that reads the original's per-element rules (`rules()`,
  `bp()`, `decl()`) and writes a JSON overlay. Key it by element id, or by the
  first widget id when the extractor drops the container's id. Apply it at
  render, so database content (D1 posts) is never edited. Drop keys that
  conflict between pages.
- **Probe the whole site before writing a fix** (how many widgets, pages and
  breakpoints it touches), and prefer the fix that matches Elementor's model
  over a per-page patch.
- **Keep data diffs small.** Rewrite page JSON in its original serialisation
  (e.g. compact `", "`/`": "` separators, no trailing newline).
- **Don't commit build-regenerated snapshots** (posts.json, blog-index.json,
  categories.json, post-additions.json). `git checkout` them before committing.
- **Astro templates**:
  - No TypeScript generics (`Record<…>`) inside template expressions; move them
    to the frontmatter.
  - Cast JSON imports `as unknown as T`.
  - Scoped CSS needs `:global()` for `set:html` content.
- **Shell**: never `pkill -f` / `pgrep -f` a pattern that also appears in your
  own command line. It kills your own shell (exit 144). Use the `[p]attern`
  trick.
- **Long jobs**: run the local server and the census in one background command.
  Wait with an `until` loop rather than `sleep`.
- **Before every push**: `astro check`, the full `npm run build` (with the SEO
  lint), `verify.mjs`, `behaviour.mjs`.
- **After merge**: confirm the Deploy workflow succeeded, then `curl` a marker
  from the live site to prove the change is live.
- **Report honestly.** A route table with per-width deltas, an explicit list of
  what is still out of range and why (deliberate, a production defect, a
  measurement artifact), and nothing called fixed until it has been measured.
