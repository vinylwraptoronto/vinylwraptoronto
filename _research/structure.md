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
