# Comparing computed styles across the two DOMs — and why the numbers lie

The skill's core check is a computed-style diff, element by element, at three
widths, on the grounds that a rebuild reaches for `px` where Elementor emits `vw`
and the two agree at exactly one width. That check was built and run here. It
found nothing real, and the way it failed is worth recording, because the next
person will build the same thing.

## What happened

Four successive refinements of the matching, on the same two pages:

| matching | differences flagged | unit-class errors |
|---|---|---|
| wrapper `data-id` ↔ element `data-eid` | 480 | 27 |
| descend to the widget's content element | 197 | 3 |
| flatten wrapper + container + content | 85 | 7 |
| inherited properties from the content node | 85 | 7 |

Every sample checked by hand at every stage was structural. Ten in a row.

## Why

**Elementor splits one widget's styling across three nodes; the port collapses it
onto one.** The outer wrapper carries alignment, `> .elementor-widget-container`
carries the box — background, padding, border — and the content element inside
carries the type. A heading whose navy box the original puts on the container and
the port puts on the `<h3>` renders identically and compares as four separate
defects: background, padding, border-width and margin.

Concretely, from the original's own stylesheet:

```
.elementor-element-77803728 > .elementor-widget-container {
  background-color: var(--e-global-color-d077a13);
  padding: 11px; border-width: 3px 0 0 0 }
.elementor-element-77803728 .elementor-heading-title { font-size: 16px }
```

Two nodes, two halves of one widget. No single node on the old side is the
counterpart of the port's one element.

The residual 85 are the same shape. The last two checked were image widgets whose
`<a>` inherits the theme's pink link colour on the original and grey here — a
colour nobody can see, because the anchor contains only a photograph.

## What this means

**A computed-style diff across two structurally different DOMs is not a defect
detector.** It is a source of confident, specific, plausible findings that are
all wrong, and each one costs a real investigation to dismiss. It should not gate
anything.

The checks on the same run that DO hold, and that did their job:

```
broken images ............... 0 on every page, both sites
horizontal overflow at 390 .. none
elements left at opacity 0 .. 0
page height, old vs new ..... within a few per cent on every page
visible text ................ matches once measured with checkVisibility()
```

Those are the ones worth keeping. `census-render.mjs` now carries all four
corrections, so a future run starts from the honest version rather than
rediscovering this.

## The one real bug this exercise did find

It was in the measuring tool, not the site: the visible-text walker checked
`display`, `visibility` and `opacity` by walking ancestors. A collapsed
`<details>` hides its panel with `content-visibility`, which that walk cannot
see — and a `Range` inside such a subtree still returns a non-zero rect. The
paint-protection page's ten collapsed FAQ answers were therefore counted as 209
words of visible copy the original did not have. `checkVisibility()` settles it:
the FAQ is correctly collapsed, matching the original, whose ten accordion tabs
are all `aria-expanded="false"`.

---

# Working the homepage, page by page

Five defects, all found by looking at banded captures of the two homepages side
by side and then measuring what the pictures raised. None of them would ever
have surfaced from a content check: every one is a rule the extractor dropped or
put on the wrong node, so the markup and the copy were already correct.

| What | Original | Port, before | Fixed by |
|---|---|---|---|
| Colour-guides button icon | right of the label | left | `iconRight` on the block; `flex-direction: row-reverse` |
| Nav dropdown caret | 16px, 10px wide, 10px from the label | 12px, 7.5px wide, 6px gap | dropped the invented `font-size`, gap to the measured 10px |
| Trusted By strip | 255px tall | 201px | carousel now applies its own `box`; pagination reserves its 30px gutter |
| Trusted By logos | 1px `rgba(153,204,51,.35)` border, 5px radius, on each image | no border; radius on the widget instead | `imgStyle` on the block |
| Hero buttons | ~450px apart, each centred in its own half | adjacent, 14px apart | `space-around` on a row of two or more |

After them the homepage tracks the original within 77px over 7,300, and its
heading positions are within 10-40px for the whole upper two thirds.

## Two findings that are NOT the homepage's, and must not be swept

Both are global defaults standing in for per-element values Elementor writes and
the extractor never carried. Each is correct to fix, and each touches all 678
pages, so each belongs to the page-by-page pass with measurements behind it --
not to a blanket edit made from one page's evidence.

**`.sec { padding: 34px 0 }`.** Elementor sections have no default vertical
padding; all of it is per-element. Where our data carries a section's real
padding it is used, but where the original has none we impose 34px. The homepage
banner was the visible case: the original is 560px (a 540px image plus a 20px
widget margin) and the port made it 600. Fixed here by giving that one section
its measured `padding` in the data, which is the per-page shape the general fix
should take.

**`.col { row-gap: 20px }`.** Same story one level down. The tile captions on
the original sit 5px under their photo, from the image widget's own
`margin-bottom`; the port has no such margin in its data and a blanket 20px
column gap stands in, so every tile shows 15px more white than the original.
Section totals still match, so it costs no layout -- only the look.

The real repair for both is to carry per-element margins out of the original's
CSS rather than approximate them with a container default. Until then, do not
change either constant from a single page's measurement: a value that fixes one
page moves every other page by the same amount, in whichever direction.

## What the carousel taught about scoping

A blanket `padding: 15px 0 45px` on `.carou`, inferred from the homepage alone,
was measured making `/lp/`, `/lp-truck-wraps/` and the Mustang page worse while
fixing the homepage. Of the nine carousels on the site only the two on the
homepage layout carry any padding at all, and it was already in their data --
the carousel was simply the one block type whose renderer never applied `box`.
The gutter is the part that generalises, because it follows the pagination
setting the block already records.

## A measurement artifact worth not repeating

Scrolling to `document.body.scrollHeight` in one jump does not load a long
page's lazy images: nothing in the middle ever comes near the viewport. Measured
that way the Trusted By strip read zero-height with six unloaded logos, and the
span around it read 190px short. Stepped in 700px increments, the same span is
7px. Every script in this folder now steps.
