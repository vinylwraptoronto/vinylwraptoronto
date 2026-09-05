#!/usr/bin/env python3
"""Turn the ported static posts into rows for the blog database.

The static pages mix two different things: the post the author wrote, and the
template Elementor wrapped around it. Only the first belongs in a CMS -- the
table of contents, the related-posts grid, the quote form, the promo panel and
the prev/next links are rendered by the template on every post and would be
duplicated 478 times if stored.

So each post reduces to: its identity and SEO, one featured image, the body
HTML, its taxonomy terms, and the images the body references.
"""
import json, glob, html, os, re, collections

REPO = '/home/user/vinylwraptoronto'
SCRATCH = os.path.dirname(os.path.abspath(__file__))
OUT = f'{SCRATCH}/blog_rows.json'

# Widgets the template supplies on every post; never editorial content.
TEMPLATE_BLOCKS = {'toc', 'cards', 'form', 'postnav', 'filtergallery', 'compare'}


def load_posts():
    out = []
    for f in glob.glob(f'{REPO}/src/data/pages/*.json'):
        d = json.load(open(f))
        if d.get('kind') == 'post':
            out.append(d)
    return sorted(out, key=lambda d: d.get('published') or '')


def walk(node, want):
    """Every block of the wanted types, in document order."""
    found = []

    def rec(x):
        if isinstance(x, list):
            for v in x:
                rec(v)
        elif isinstance(x, dict):
            if x.get('type') in want:
                found.append(x)
            for k, v in x.items():
                if k in ('blocks', 'cols', 'sections'):
                    rec(v)
    rec(node)
    return found


def body_of(d):
    """The post body: the rich-text blocks, in order, joined."""
    parts = [b['html'] for b in walk(d.get('sections') or [], {'text'}) if b.get('html')]
    return '\n'.join(parts).strip()


def hero_of(d):
    """The lead image -- the first image block, else the og:image."""
    imgs = walk(d.get('sections') or [], {'image'})
    if imgs:
        return imgs[0].get('src'), imgs[0].get('alt') or ''
    return d.get('ogImage'), ''


def clean_title(t):
    t = html.unescape(t or '')
    return re.sub(r'\s*[-|]\s*Vinyl Wrap Toronto\s*$', '', t).strip()


def h1_of(d):
    """The on-page headline, which is not the SEO <title>."""
    for b in walk(d.get('sections') or [], {'heading'}):
        if b.get('level') == 1 and b.get('text'):
            return b['text']
    return None


posts = load_posts()
print(f'posts: {len(posts)}')

# ---- taxonomy ------------------------------------------------------------
api = {p['slug']: p for p in json.load(open(f'{SCRATCH}/api_posts.json'))}
cats = json.load(open(f'{SCRATCH}/tax_categories.json'))
brands = json.load(open(f'{SCRATCH}/tax_blogs_vehicles_brand.json'))
tags = json.load(open(f'{SCRATCH}/tax_tags.json')) if os.path.exists(f'{SCRATCH}/tax_tags.json') else []

# The tags export carries only id/count/slug -- no names. The real name is the
# H1 of each tag's own archive page, so it is read from there rather than
# title-cased out of the slug, which would invent 468 names.
tag_names = {}
for f in glob.glob(f'{REPO}/src/data/pages/tag__*.json'):
    d = json.load(open(f))
    slug = d['slug'].split('/', 1)[-1]
    h1 = next((b['text'] for b in walk(d.get('sections') or [], {'heading'})
               if b.get('level') == 1 and b.get('text')), None)
    if h1:
        tag_names[slug] = h1

terms = []
by_wp_id = {}
for kind, rows in (('category', cats), ('brand', brands), ('tag', tags)):
    for t in rows:
        rec = {
            'taxonomy': kind,
            'wp_id': t['id'],
            'slug': t['slug'],
            'name': (html.unescape(t.get('name') or '')
                     or (tag_names.get(t['slug']) if kind == 'tag' else '')
                     or t['slug']),
            'description': html.unescape(t.get('description') or '') or None,
        }
        terms.append(rec)
        by_wp_id[(kind, t['id'])] = t['slug']

# ---- authors -------------------------------------------------------------
author_names = sorted({p.get('author') for p in posts if p.get('author')})
authors = [{'name': n,
            'slug': re.sub(r'[^a-z0-9]+', '-', n.lower()).strip('-')}
           for n in author_names]

# ---- media ---------------------------------------------------------------
media = {}          # path -> row


def add_media(path, alt=''):
    if not path:
        return None
    path = path.strip()
    if not path.startswith('/'):
        return None
    row = media.setdefault(path, {'path': path, 'alt': alt or '', 'in_body': 0})
    if alt and not row['alt']:
        row['alt'] = alt
    return path


rows = []
post_terms = []
post_media = []

for d in posts:
    slug = d['slug']
    hero, hero_alt = hero_of(d)
    add_media(hero, hero_alt)
    body = body_of(d)

    # Images the body references, so the editor can show what a post uses.
    body_imgs = []
    for m in re.finditer(r'<img[^>]+src="([^"]+)"[^>]*>', body):
        src = m.group(1)
        alt = ''
        am = re.search(r'alt="([^"]*)"', m.group(0))
        if am:
            alt = am.group(1)
        if add_media(src, alt):
            media[src]['in_body'] += 1
            body_imgs.append(src)

    a = api.get(slug, {})
    for cid in a.get('categories') or []:
        s = by_wp_id.get(('category', cid))
        if s:
            post_terms.append({'post_slug': slug, 'taxonomy': 'category', 'term_slug': s})
    for bid in a.get('blogs_vehicles_brand') or []:
        s = by_wp_id.get(('brand', bid))
        if s:
            post_terms.append({'post_slug': slug, 'taxonomy': 'brand', 'term_slug': s})

    for p in dict.fromkeys(body_imgs):
        post_media.append({'post_slug': slug, 'path': p, 'role': 'body'})
    if hero:
        post_media.append({'post_slug': slug, 'path': hero, 'role': 'featured'})

    rows.append({
        'slug': slug,
        'title': clean_title(d.get('title')),
        'seo_title': html.unescape(d.get('title') or ''),
        'headline': h1_of(d),
        'excerpt': html.unescape(d.get('description') or ''),
        'body_html': body,
        'status': 'published',
        'featured_path': hero,
        'author_name': d.get('author'),
        'published_at': d.get('published'),
        'modified_at': d.get('modified'),
        'canonical_url': d.get('url'),
        'robots': d.get('robots'),
        # The original's own head tags and JSON-LD, kept whole so the rendered
        # page keeps the metadata it has today.
        'head': d.get('head'),
    })

payload = {
    'authors': authors,
    'terms': terms,
    'media': sorted(media.values(), key=lambda m: m['path']),
    'posts': rows,
    'post_terms': post_terms,
    'post_media': post_media,
}
json.dump(payload, open(OUT, 'w'), separators=(',', ':'))

print(f'authors      {len(authors)}')
print(f'terms        {len(terms)}   ' + str(dict(collections.Counter(t["taxonomy"] for t in terms))))
print(f'media        {len(media)}')
print(f'posts        {len(rows)}')
print(f'post_terms   {len(post_terms)}')
print(f'post_media   {len(post_media)}')
print(f'bodies empty {sum(1 for r in rows if not r["body_html"])}')
print(f'wrote {OUT}  ({os.path.getsize(OUT)} bytes)')
