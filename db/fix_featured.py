#!/usr/bin/env python3
"""Point each post's featured image at the og:image it declares.

blog_export.py took the first image in the body, which on 215 posts is a
-1024x538 thumbnail Elementor generated, not the full-size lead image. Existing
posts render og:image out of their preserved head_json, so nothing on the site
is wrong today -- but a post written through the authoring feature has no
preserved head, and would ship a thumbnail as its social image.
"""
import json, glob, os, re

REPO = '/home/user/vinylwraptoronto'
OUT = f'{os.path.dirname(os.path.abspath(__file__))}/fix_featured.sql'


def q(v):
    return "'" + v.replace("'", "''") + "'"


def og_of(d):
    for entry in (d.get('head') or {}).get('meta', []):
        if entry[0] == 'og:image':
            return entry[2]
    return None


stmts, paths, changed = [], set(), 0
for f in sorted(glob.glob(f'{REPO}/src/data/pages/*.json')):
    d = json.load(open(f))
    if d.get('kind') != 'post':
        continue
    og = og_of(d)
    if not og or not og.startswith('/wp-content/uploads/'):
        continue
    paths.add(og)
    changed += 1
    stmts.append(
        'UPDATE posts SET featured_id = (SELECT id FROM media WHERE path = '
        + q(og) + ') WHERE slug = ' + q(d['slug']) + ';')

head = ['INSERT OR IGNORE INTO media (path) VALUES ' +
        ', '.join('(' + q(p) + ')' for p in sorted(paths)) + ';']
open(OUT, 'w').write('\n'.join(head + stmts) + '\n')
print(f'distinct og:image paths {len(paths)}')
print(f'posts repointed         {changed}')
print(f'wrote {OUT}  ({os.path.getsize(OUT):,} bytes)')
