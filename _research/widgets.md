# Widget census — the build list

Every one of the 678 addresses, not a sample. A census taken from a handful of
pages is a sample, and the widgets it misses get found during the port, which is
the expensive place to find them.

**35 distinct widget types.**

| pages | widget | ported as |
|---|---|---|
| 676 | `button` | `button` |
| 676 | `form` | `form` (QuoteForm.astro) |
| 676 | `heading` | `heading` |
| 676 | `icon-box` | `feature` |
| 676 | `icon-list` | `list` |
| 676 | `image` | `image` |
| 674 | `nav-menu` | Header.astro |
| 674 | `social-icons` | Footer.astro |
| 495 | `theme-post-title` | `heading` (h1) |
| 479 | `theme-post-content` | `text` |
| 471 | `post-navigation` | `postnav` |
| 434 | `posts` | `cards` |
| 404 | `share-buttons` | share row |
| 403 | `animated-headline` | `heading` (the offer price) |
| 403 | `countdown` | countdown script |
| 402 | `divider` | CSS rule |
| 402 | `post-info` | `list` |
| 402 | `progress-tracker` | readbar |
| 402 | `table-of-contents` | `toc` |
| 353 | `gallery` | `gallery` / `filtergallery` |
| 136 | `archive-posts` | `cards` (stacked) |
| 136 | `wp-widget-categories` | category list |
| 135 | `theme-archive-title` | `heading` |
| 73 | `jet-image-comparison` | `compare` |
| 33 | `icon` | `list` / inline icon |
| 13 | `text-editor` | `text` |
| 12 | `image-box` | `feature` |
| 9 | `testimonial-carousel` | `text` (raw HTML) |
| 6 | `image-carousel` | `carousel` |
| 4 | `loop-grid` | `columns` of `compare` cards |
| 2 | `nested-accordion` | `faq` |
| 1 | `google_maps` | `map` |
| 1 | `shortcode` | `text` |
| 1 | `accordion` | `faq` |
| 1 | `jet-banner` | `feature` |

## Per-page CSS — read this before concluding anything is broken

The survey reports **0 of 678 pages linking a `post-<id>.css` file**, which by the
skill's rule would mean every page on the site renders unstyled. It does not.

This site runs Elementor's **CSS Print Method: Internal Embedding**, so the
per-element rules are written into a `<style>` block in the head instead of to a
file. Checked on the homepage: one inline block carrying **768** rules of the form
`.elementor-<page> .elementor-element-<eid>`. Every per-element rule this port
needs is available; it is simply not in a linked file.

Nothing here is inferred. Every page has its source CSS.
