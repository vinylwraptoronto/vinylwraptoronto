/** The block model produced from each live page's Elementor markup. */
export type Block =
  | { type: 'heading'; level: number; text: string; href?: string | null; style?: string | null }
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
  | { type: 'button'; text: string; href: string; style?: string | null }
  | { type: 'list'; items: { text: string; href?: string | null }[] }
  | { type: 'feature'; title: string; text: string; image?: string | null; alt?: string }
  | { type: 'cards'; cards: { title: string; href: string; image: string | null }[] }
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
      items: { src: string; title: string; tag: string }[];
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
    };

/** Sections carry the live template's own padding and container width; the
    homepage, for instance, is 35px/75px inside a 1400px container. */
export type Section = {
  id?: string | null;
  blocks: Block[];
  padding?: string | null;
  maxWidth?: string | null;
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
  published: string | null;
  kind: PageKind;
};
