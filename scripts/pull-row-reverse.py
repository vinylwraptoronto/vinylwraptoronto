"""
Carry Elementor's `elementor-reverse-tablet` / `-mobile` onto each row of
columns.

Blocks.astro already draws `reverse` (the row stacks last column first at that
breakpoint), but nothing ever read it off the original. The category archive
template uses it: on a phone its sidebar column -- the categories list -- sits
ABOVE the posts, where the port put it under twelve cards. Every archive built
from that template (1,079 of them) shares the row.

Each row is matched to its Elementor section the same way pull-column-widths.py
matches columns: through the first widget inside its first column, whose
nearest ancestor column's section has as many columns as the row does.

Pages without a cached copy of the original take the value from another page
built from the same template, matched on the section id, which the template
fixes.

    python3 scripts/pull-row-reverse.py --cache DIR [--dry-run]
"""
import argparse, glob, json, os, re

from lxml import html as lhtml

PAGES = "src/data/pages"


def is_col(el):
    c = (el.get("class") or "").split()
    return "elementor-column" in c or ("e-con" in c and "e-child" in c)


def first_eid(blocks):
    for b in blocks:
        if b.get("eid"):
            return b["eid"]
        if b.get("type") == "columns":
            for c in b.get("cols", []):
                e = first_eid(c.get("blocks", []))
                if e:
                    return e
    return None


def rows(doc):
    """(section id, index among that section's rows, row block)."""
    for s in doc.get("sections", []):
        n = 0
        stack = list(s.get("blocks", []))
        while stack:
            b = stack.pop(0)
            if b.get("type") == "columns":
                yield s.get("id"), n, b
                n += 1
                for c in b.get("cols", []):
                    stack.extend(c.get("blocks", []))


def read(tree, row, by_id):
    cols = row.get("cols", [])
    for c in cols:
        el = by_id.get(first_eid(c.get("blocks", [])))
        if el is None:
            continue
        for anc in el.iterancestors():
            if not isinstance(anc.tag, str) or not is_col(anc):
                continue
            sec = anc.getparent()
            if sec is not None and "elementor-container" in (sec.get("class") or ""):
                sec = sec.getparent()
            sibs = [x for x in anc.getparent() if isinstance(x.tag, str) and is_col(x)]
            if len(sibs) != len(cols) or sec is None:
                continue
            return sorted(set(re.findall(r"elementor-reverse-(tablet|mobile)", sec.get("class") or "")))
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    files = sorted(glob.glob(f"{PAGES}/*.json"))
    found, by_template = {}, {}
    for f in files:
        cached = os.path.join(a.cache, os.path.basename(f)[:-5] + ".html")
        if not os.path.exists(cached):
            continue
        doc = json.load(open(f, encoding="utf8"))
        if doc.get("kind") in ("post", "story"):
            continue
        tree = lhtml.fromstring(open(cached, encoding="utf8", errors="replace").read())
        by_id = {el.get("data-id"): el for el in tree.iter() if isinstance(el.tag, str) and el.get("data-id")}
        for sid, i, row in rows(doc):
            got = read(tree, row, by_id)
            if got is not None:
                found[(f, sid, i)] = got
                if doc.get("kind") == "archive":
                    by_template.setdefault((sid, i), got)
    total = 0
    for f in files:
        raw = open(f, encoding="utf8").read()
        doc = json.loads(raw)
        if doc.get("kind") in ("post", "story"):
            continue
        changed = []
        for sid, i, row in rows(doc):
            got = found.get((f, sid, i))
            if got is None and doc.get("kind") == "archive":
                got = by_template.get((sid, i))
            if got is None:
                continue
            if (row.get("reverse") or []) != got:
                changed.append(f"{sid} row{i} reverse {row.get('reverse')!r} -> {got!r}")
                if got:
                    row["reverse"] = got
                else:
                    row.pop("reverse", None)
        if not changed:
            continue
        total += len(changed)
        if total <= 40 or not a.dry_run:
            print(f"/{doc['slug']}/:", *changed, sep="\n    ")
        if a.dry_run:
            continue
        pretty = raw.lstrip().startswith("{\n")
        out = (json.dumps(doc, ensure_ascii=False, indent=1) if pretty
               else json.dumps(doc, ensure_ascii=False, separators=(", ", ": ")))
        open(f, "w", encoding="utf8").write(out + ("\n" if raw.endswith("\n") else ""))
    print(f"\n{total} {'found' if a.dry_run else 'written'}")


if __name__ == "__main__":
    main()
