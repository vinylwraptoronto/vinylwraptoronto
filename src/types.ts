/** The block model produced from each live page's Elementor markup. */
export type Block =
  | { type: 'heading'; level: number; text: string; href?: string | null }
  | { type: 'text'; html: string }
  | {
      type: 'image';
      src: string;
      alt: string;
      width?: string | null;
      height?: string | null;
      href?: string | null;
    }
  | { type: 'button'; text: string; href: string }
  | { type: 'list'; items: { text: string; href?: string | null }[] }
  | { type: 'feature'; title: string; text: string; image?: string | null; alt?: string }
  | { type: 'cards'; cards: { title: string; href: string; image: string | null }[] }
  /* Both are built client-side on the live site, so they are regenerated at
     render time rather than ported as markup that would arrive empty. */
  | { type: 'toc'; title: string }
  | { type: 'categories'; title: string }
  | {
      type: 'postnav';
      prev?: { href: string; text: string };
      next?: { href: string; text: string };
    }
  | { type: 'gallery'; images: { src: string; alt: string }[] }
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

export type Section = { id?: string | null; blocks: Block[] };

/** page | post | archive | story — archives carry the slugs they list. */
export type PageKind = 'page' | 'post' | 'archive' | 'story';

export type PageData = {
  slug: string;
  url: string;
  title: string;
  description: string;
  ogImage: string | null;
  robots?: string | null;
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
