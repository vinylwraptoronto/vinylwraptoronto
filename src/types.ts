/** The block model produced from each live page's Elementor markup. */
export type Block = (
  | {
      type: 'heading';
      level: number;
      text: string;
      href?: string | null;
      style?: string | null;
      /** Elementor lets a heading widget render as `p` or `div`. Set only in
          that case; forcing those to h2 gave them the kit's capitalize and put
          them in the document outline, where the original never had them. */
      tag?: string;
    }
  | { type: 'text'; html: string; style?: string | null }
  | {
      type: 'image';
      src: string;
      alt: string;
      width?: string | null;
      height?: string | null;
      href?: string | null;
      /** Sits in a zero-padding column on the live site, so it runs edge to edge. */
      full?: boolean;
    }
  | {
      type: 'button';
      text: string;
      /** Absent when the button opens a popup rather than navigating. */
      href?: string;
      /** The popup this button opens. Elementor encodes that as a base64 blob
          inside the href, which the port passed through verbatim — so 426
          buttons across 418 pages only appended a hash to the address. */
      popup?: string;
      style?: string | null;
      /** Font Awesome classes, e.g. "fas fa-phone-alt". */
      icon?: string | null;
    }
  | {
      type: 'list';
      items: { text: string; href?: string | null; icon?: string | null }[];
      style?: string | null;
      /** Elementor sets an icon-list's type and colour on the item text, not on
          the widget, so it needs a key of its own. */
      itemStyle?: string | null;
    }
  | {
      type: 'feature';
      title: string;
      text: string;
      image?: string | null;
      alt?: string;
      /** Font Awesome classes for the box's icon, and where it links. */
      icon?: string | null;
      iconHref?: string | null;
      /** The heading tag the original chose for the title. It is visible: the
          kit capitalizes h3 but not h4. */
      level?: number;
      style?: string | null;
      /* Same again for an icon-box: title and description are styled
         separately, and these are the widgets that sit on the tinted panels —
         without their own colour they came out body-ink on navy. */
      titleStyle?: string | null;
      textStyle?: string | null;
    }
  /* `alt` is the original's own alt text, which is not the card title: the port
     used the title and lost the description on 960 pages. An empty string is
     meaningful — the original marks decorative images that way. */
  | {
      type: 'cards';
      cards: {
        title: string;
        href: string;
        image: string | null;
        alt?: string;
        /* The original's post widget puts a byline, a date and a "Read More"
           link on every card. The port kept only the thumbnail and title. */
        author?: string;
        date?: string;
        more?: string;
        /* Theme-rendered taxonomy archives give each entry a paragraph of copy
           that the Elementor-keyed extractor never saw. */
        desc?: string;
        /** The card's term pill. Rendered as an ordinary link, it lost the
            9px white-on-pink badge the original paints. */
        badge?: string | null;
      }[];
      /* Elementor styles every posts-widget instance separately — the same
         "Read More" is Poppins 12px green on the blog index and Roboto 14px
         pink on a post page — so these come from the widget rather than from
         one hard-coded rule in the component. */
      /** Elementor declares the grid's column count per breakpoint; the port
          used a CSS auto-fill, which gave three or more where the original
          gives two and never stacked to one on a phone. */
      cols?: number | null;
      colsTablet?: number | null;
      colsMobile?: number | null;
      titleStyle?: string | null;
      metaStyle?: string | null;
      moreStyle?: string | null;
      descStyle?: string | null;
      badgeStyle?: string | null;
    }
  /* Both are built client-side on the live site, so they are regenerated at
     render time rather than ported as markup that would arrive empty. */
  | { type: 'toc'; title: string }
  | { type: 'categories'; title: string }
  /* The Elementor Pro quote form; fields are fixed site-wide, so only its
     position on the page is recorded. */
  | { type: 'form' }
  | { type: 'map'; src: string }
  /* Elementor's filterable gallery. It ships no <img>; the picture URLs are the
     lightbox anchor hrefs and `tag` indexes into `filters`. */
  | {
      type: 'filtergallery';
      filters: { index: string; label: string }[];
      items: { src: string; title: string; tag: string; alt?: string }[];
    }
  | {
      type: 'postnav';
      prev?: { href: string; text: string };
      next?: { href: string; text: string };
    }
  | { type: 'gallery'; images: { src: string; alt: string }[] }
  /* A real carousel. Timing and slides-per-view come from the widget's own
     data-settings, not from CSS. */
  | {
      type: 'carousel';
      images: { src: string; alt: string }[];
      perView: number;
      perViewMobile: number;
      gap: number;
      autoplay: boolean;
      delay: number;
      speed: number;
      pauseOnHover: boolean;
      infinite: boolean;
      dots: boolean;
    }
  | { type: 'faq'; items: { q: string; a: string }[] }
  | { type: 'video'; src: string }
  | {
      /* The jet-image-comparison before/after slider on wraps-before-after. */
      type: 'compare';
      pairs: {
        before: { src: string; alt: string };
        after: { src: string; alt: string };
        beforeLabel: string;
        afterLabel: string;
      }[];
    }
  | ColumnsBlock
) & {
  /** The Elementor id of the widget this block came from. It is rendered as
      `data-eid` so the page's own responsive rules have something to select. */
  eid?: string;
  /** The widget's own panel — background, padding, border, radius, shadow —
      declared on Elementor's `.elementor-widget-container`. Never read before,
      so the homepage's image captions lost their navy bar and green top border
      and painted white text on white. */
  box?: string | null;
  /** Breakpoints the original hides this widget at ("mobile", "tablet").
      Elementor expresses these as a class acted on by its global stylesheet,
      which the port never carried, so hidden widgets showed everywhere. */
  hide?: string[];
};

/** An Elementor row: columns side by side, each with its own percentage width.
    93% of pages have at least one. The extractor used to flatten them into a
    single stream of blocks, so every row rendered as a vertical stack. */
export type ColumnsBlock = {
  type: 'columns';
  /** `background` is set only where the column sits on its own colour, and
      `padding` rides along with it — a navy panel needs the original's inset
      or its widgets run into the edge. */
  cols: {
    width: number;
    blocks: Block[];
    background?: string | null;
    padding?: string | null;
  }[];
};

/** Sections carry the live template's own padding and container width; the
    homepage, for instance, is 35px/75px inside a 1400px container. */
export type Section = {
  id?: string | null;
  blocks: Block[];
  padding?: string | null;
  maxWidth?: string | null;
  /** The section's own background. Most are #ffffff and match the default, but
      ~7% are navy, near-black or a tint — and the widgets inside those already
      carry the original's white text, so without this they were white on white. */
  background?: string | null;
  /** A section can carry a photograph rather than a colour. The
      /locations-served/ banner sections hold no widgets at all, so the port
      dropped them and the pages opened straight on the navy title block. */
  bgImage?: string | null;
  bgSize?: string | null;
  bgPosition?: string | null;
  bgRepeat?: string | null;
  /** Declared on the inner container, so a restored banner has a height. */
  minHeight?: string | null;
};

/** page | post | archive | story — archives carry the slugs they list. */
export type PageKind = 'page' | 'post' | 'archive' | 'story';

/** The original's own head tags and Yoast JSON-LD graph, carried per page.
    The port previously hand-wrote a subset of the head and invented two of the
    values it did emit, so the head is taken from the source instead of guessed.
    `generator` is deliberately absent: it names the WordPress and Yoast
    versions, which an Astro build cannot truthfully claim. */
export type HeadData = {
  meta?: Record<string, string>;
  ld?: unknown;
};

export type PageData = {
  slug: string;
  /** The page's own responsive rules, keyed by each block's `eid`. Elementor
      keeps 19% of its per-widget CSS inside a breakpoint; the extractor used to
      drop all of it, which made the port a desktop-only rendering. */
  css?: string;
  url: string;
  title: string;
  description: string;
  ogImage: string | null;
  robots?: string | null;
  head?: HeadData;
  kind: PageKind;
  sections: Section[];
  published?: string | null;
  modified?: string | null;
  author?: string | null;
  /** archive only: the addresses this page lists, newest first */
  members?: string[];
};

export type Summary = {
  slug: string;
  title: string;
  description: string;
  image: string | null;
  /** The original's alt text for `image`; the title is not a description. */
  alt?: string;
  published: string | null;
  kind: PageKind;
};
