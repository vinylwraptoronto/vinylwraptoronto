#!/usr/bin/env python3
"""Add the render tree to each post row.

The editorial columns (title, body_html, featured, terms) are what an editor
edits. They are not, on their own, enough to redraw a post: 312 of the 318
filterable galleries are distinct, and all 69 before/after comparisons are, so
rendering from the editorial columns alone would silently strip content from
387 of the 478 posts.

`sections_json` is therefore the document as it renders -- the same tree the
static build uses -- and `page_css` the post's own responsive rules. `layout`
records which template furniture the post carries, so the authoring feature can
compose the same shape for a new post instead of guessing.
"""
import json, glob, os, collections

REPO = '/home/user/vinylwraptoronto'
OUT = f'{os.path.dirname(os.path.abspath(__file__))}/blog_render.sql'

CHROME = {'toc', 'cards', 'form', 'postnav'}


def q(v):
    if v is None or v == '':
        return 'NULL'
    if not isinstance(v, str):
        v = json.dumps(v, separators=(',', ':'))
    return "'" + v.replace("'", "''") + "'"


def types_of(sections):
    seen = []

    def rec(x):
        if isinstance(x, list):
            for v in x:
                rec(v)
        elif isinstance(x, dict):
            if x.get('type'):
                seen.append(x['type'])
            for k, v in x.items():
                if k in ('blocks', 'cols', 'sections'):
                    rec(v)
    rec(sections)
    return set(seen)


posts = []
for f in glob.glob(f'{REPO}/src/data/pages/*.json'):
    d = json.load(open(f))
    if d.get('kind') == 'post':
        posts.append(d)
posts.sort(key=lambda d: d.get('published') or '')

out = []
layouts = collections.Counter()
for i, d in enumerate(posts, start=1):
    present = types_of(d.get('sections') or [])
    # A short name for the template furniture this post carries.
    if 'compare' in present:
        layout = 'comparison'
    elif CHROME <= present:
        layout = 'standard'
    else:
        layout = 'minimal'
    if 'filtergallery' in present:
        layout += '+gallery'
    layouts[layout] += 1
    out.append(
        'UPDATE posts SET sections_json = ' + q(d.get('sections')) +
        ', page_css = ' + q(d.get('css')) +
        ', layout = ' + q(layout) +
        ' WHERE slug = ' + q(d['slug']) + ';')

open(OUT, 'w').write('\n'.join(out) + '\n')
print(f'posts updated: {len(out)}')
print('layouts:', dict(layouts))
print(f'wrote {OUT}  ({os.path.getsize(OUT):,} bytes)')
