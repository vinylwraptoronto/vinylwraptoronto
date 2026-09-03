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
  | { type: 'feature'; title: string; text: string }
  | { type: 'gallery'; images: { src: string; alt: string }[] }
  | { type: 'faq'; items: { q: string; a: string }[] }
  | { type: 'video'; src: string };

export type Section = { id?: string | null; blocks: Block[] };

export type PageData = {
  slug: string;
  url: string;
  title: string;
  description: string;
  ogImage: string | null;
  sections: Section[];
};
