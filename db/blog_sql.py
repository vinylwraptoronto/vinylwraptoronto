#!/usr/bin/env python3
"""Turn blog_rows.json into SQL for D1.

Ids are assigned here rather than left to autoincrement so the join tables can
reference them without a round trip per row.
"""
import json, os

SCRATCH = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(f'{SCRATCH}/blog_rows.json'))
OUT = f'{SCRATCH}/blog_seed.sql'


def qs(v):
    """A SQL string literal that is never NULL, for NOT NULL columns."""
    return "'" + (v or '').replace("'", "''") + "'"


def q(v):
    """A SQL literal. NULL for None, doubled quotes otherwise."""
    if v is None or v == '':
        return 'NULL'
    if isinstance(v, (int, float)):
        return str(v)
    if not isinstance(v, str):
        v = json.dumps(v, separators=(',', ':'))
    return "'" + v.replace("'", "''") + "'"


out = []
out.append('PRAGMA foreign_keys = ON;')

# --- authors --------------------------------------------------------------
author_id = {}
for i, a in enumerate(rows['authors'], start=1):
    author_id[a['name']] = i
    out.append(f"INSERT INTO authors (id, slug, name) VALUES ({i}, {q(a['slug'])}, {q(a['name'])});")

# --- terms ----------------------------------------------------------------
term_id = {}
for i, t in enumerate(rows['terms'], start=1):
    term_id[(t['taxonomy'], t['slug'])] = i
    out.append(
        'INSERT INTO terms (id, taxonomy, slug, name, description, wp_id) VALUES '
        f"({i}, {q(t['taxonomy'])}, {q(t['slug'])}, {q(t['name'])}, "
        f"{q(t.get('description'))}, {q(t.get('wp_id'))});")

# --- media ----------------------------------------------------------------
media_id = {}
for i, m in enumerate(rows['media'], start=1):
    media_id[m['path']] = i
    out.append(f"INSERT INTO media (id, path, alt) VALUES ({i}, {q(m['path'])}, {qs(m['alt'])});")

# --- posts ----------------------------------------------------------------
post_id = {}
for i, p in enumerate(rows['posts'], start=1):
    post_id[p['slug']] = i
    fid = media_id.get(p['featured_path'])
    aid = author_id.get(p['author_name'])
    out.append(
        'INSERT INTO posts (id, slug, title, seo_title, headline, excerpt, body_html, '
        'status, featured_id, author_id, published_at, modified_at, canonical_url, '
        'robots, head_json) VALUES ('
        f"{i}, {q(p['slug'])}, {q(p['title'])}, {q(p['seo_title'])}, {q(p['headline'])}, "
        f"{q(p['excerpt'])}, {qs(p['body_html'])}, "
        f"{q(p['status'])}, {fid if fid else 'NULL'}, {aid if aid else 'NULL'}, "
        f"{q(p['published_at'])}, {q(p['modified_at'])}, {q(p['canonical_url'])}, "
        f"{q(p['robots'])}, {q(p['head'])});")

# --- joins ----------------------------------------------------------------
seen = set()
for r in rows['post_terms']:
    pid = post_id.get(r['post_slug'])
    tid = term_id.get((r['taxonomy'], r['term_slug']))
    if pid and tid and (pid, tid) not in seen:
        seen.add((pid, tid))
        out.append(f'INSERT INTO post_terms (post_id, term_id) VALUES ({pid}, {tid});')

seen = set()
for r in rows['post_media']:
    pid = post_id.get(r['post_slug'])
    mid = media_id.get(r['path'])
    key = (pid, mid, r['role'])
    if pid and mid and key not in seen:
        seen.add(key)
        out.append(
            'INSERT INTO post_media (post_id, media_id, role) VALUES '
            f"({pid}, {mid}, {q(r['role'])});")

sql = '\n'.join(out) + '\n'
open(OUT, 'w').write(sql)
print(f'statements {len(out)}')
print(f'wrote {OUT}  ({len(sql):,} bytes)')
