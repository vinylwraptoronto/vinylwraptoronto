"""
Census one address on both sites and diff it.

The old site is the reference. Every count here is exact -- a page that had
eleven cards and has ten is a defect, not a rounding.

Scraped with Scrapling, which reaches both hosts over the session proxy where a
plain fetch does not. The HTML census below is the cheap half and runs over
every address; computed spacing and interaction checks need a real browser and
run separately, on a sample of each template.

Normalisation is the whole difficulty. The two sides legitimately differ in
ways that are not losses, and a census that does not account for them reports
hundreds of false positives and gets ignored:

  - hosts. The old site serves pages from vinylwraptoronto.com and images from
    the same host; the clone serves pages from astro.vinylwraptoronto.com and
    every image from img.vinylwraptoronto.com.
  - image sizes. WordPress writes -300x169 and -768x432 variants of one upload
    and either side may ask for a different one. Compared by base name.
  - whitespace and entities. &nbsp; against a space, &#8211; against the dash.

    python3 scripts/census.py --urls a.txt --out census.json [--workers 12]
"""
import argparse, html as htmllib, json, re, sys, unicodedata
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlsplit

from scrapling.fetchers import Fetcher

OLD_HOST = "vinylwraptoronto.com"
NEW_HOST = "astro.vinylwraptoronto.com"
IMG_HOST = "img.vinylwraptoronto.com"

# ---------------------------------------------------------------- normalising

WS = re.compile(r"\s+")
SIZE = re.compile(r"-\d{2,4}x\d{2,4}(?=\.\w+$)")
SCALED = re.compile(r"-scaled(?=\.\w+$)")
# The old site ran a WebP plugin that published name.jpg.webp beside name.jpg.
# Those are the same photograph; the clone serves the single-extension file.
DOUBLE_EXT = re.compile(r"\.(jpe?g|png|gif)\.webp$", re.I)


def norm_text(s: str) -> str:
    """Collapse whitespace, unify dashes and quotes, casefold."""
    s = htmllib.unescape(s or "")
    s = unicodedata.normalize("NFKC", s)
    s = s.replace("–", "-").replace("—", "-")
    s = s.replace("‘", "'").replace("’", "'")
    s = s.replace("“", '"').replace("”", '"')
    return WS.sub(" ", s).strip().casefold()


def norm_path(href: str, base: str) -> str:
    """An address as a comparable path: absolute, host-stripped, trailing slash."""
    if not href:
        return ""
    href = htmllib.unescape(href.strip())
    if href.startswith(("mailto:", "tel:", "javascript:", "#", "data:")):
        return href.split("?")[0].casefold()
    u = urlsplit(urljoin(base, href))
    if u.netloc and u.netloc.replace("www.", "") not in (OLD_HOST, NEW_HOST, IMG_HOST):
        return f"{u.scheme}://{u.netloc}{u.path}".casefold()  # a real third party
    p = u.path or "/"
    # A file under /wp-content/uploads on the old site is the same file served
    # from img.[domain] here, so both sides reduce to the upload's own path.
    p = re.sub(r"^/wp-content/uploads", "", p)
    if "." not in p.rsplit("/", 1)[-1] and not p.endswith("/"):
        p += "/"
    return p.casefold()


def norm_img(src: str, base: str) -> str:
    """An image as a comparable key: the upload's base name, size suffix gone."""
    if not src:
        return ""
    src = htmllib.unescape(src.strip())
    if src.startswith("data:"):
        return ""
    u = urlsplit(urljoin(base, src))
    p = u.path
    p = re.sub(r"^/wp-content/uploads", "", p)
    p = DOUBLE_EXT.sub(lambda m: "." + m.group(1), p)
    p = SIZE.sub("", p)
    p = SCALED.sub("", p)
    if u.netloc and u.netloc.replace("www.", "") not in (OLD_HOST, NEW_HOST, IMG_HOST):
        return f"{u.netloc}{p}".casefold()
    return p.casefold()


# ---------------------------------------------------------------- the censuses

STRIP = re.compile(
    r"<(script|style|noscript|template)\b[^>]*>.*?</\1>", re.S | re.I)
TAG = re.compile(r"<[^>]+>")
# Elementor hides these from sight; they are not lost content when absent.
HIDDEN_CLASS = re.compile(
    r"class=\"[^\"]*(elementor-screen-only|screen-reader-text|sr-only|visually-hidden)", re.I)


def census(body: str, base: str) -> dict:
    """Everything comparable that can be read out of the HTML alone."""
    doc = body

    # --- head ---
    title = (re.search(r"<title[^>]*>(.*?)</title>", doc, re.S | re.I) or [None, ""])[1]
    desc = re.search(
        r"<meta[^>]+name=[\"']description[\"'][^>]+content=[\"']([^\"']*)", doc, re.I)

    # --- headings, in document order ---
    heads = [(f"h{m.group(1)}", norm_text(TAG.sub(" ", m.group(2))))
             for m in re.finditer(r"<h([1-6])\b[^>]*>(.*?)</h\1>", doc, re.S | re.I)]
    heads = [h for h in heads if h[1]]

    # --- links ---
    links = sorted({norm_path(m.group(1), base)
                    for m in re.finditer(r"<a\b[^>]+href=[\"']([^\"']+)", doc, re.I)} - {""})

    # --- images: <img src>, srcset, <source>, and CSS url() ---
    imgs = set()
    for m in re.finditer(r"<img\b[^>]*?\ssrc=[\"']([^\"']+)", doc, re.I):
        imgs.add(norm_img(m.group(1), base))
    for m in re.finditer(r"\ssrcset=[\"']([^\"']+)", doc, re.I):
        for cand in m.group(1).split(","):
            imgs.add(norm_img(cand.strip().split(" ")[0], base))
    for m in re.finditer(r"url\((['\"]?)([^)'\"]+)\1\)", doc, re.I):
        u = m.group(2)
        if re.search(r"\.(jpe?g|png|webp|gif|svg|avif)", u, re.I):
            imgs.add(norm_img(u, base))
    # Elementor galleries carry the file on data-thumbnail / the tile's link
    for m in re.finditer(r"data-(?:thumbnail|src|full)=[\"']([^\"']+)", doc, re.I):
        imgs.add(norm_img(m.group(1), base))
    imgs = sorted(imgs - {""})

    # --- form fields ---
    fields = sorted({
        (m.group(1) or "").casefold()
        for m in re.finditer(r"<(?:input|select|textarea)\b[^>]*?\sname=[\"']([^\"']+)", doc, re.I)
    } - {""})

    # --- text, with the deliberately hidden parts removed ---
    visible = STRIP.sub(" ", doc)
    # drop elements whose class marks them screen-reader-only (one level, no nesting)
    visible = re.sub(
        r"<(\w+)\b[^>]*" + HIDDEN_CLASS.pattern + r"[^>]*>.*?</\1>", " ", visible, flags=re.S | re.I)
    words = norm_text(TAG.sub(" ", visible))
    # sentence-ish blocks, so a diff names something a person can find
    blocks = sorted({b.strip() for b in re.split(r"(?<=[.!?:])\s+|\s{2,}", words) if len(b.strip()) > 12})

    return {
        "title": norm_text(title),
        "description": norm_text(desc.group(1) if desc else ""),
        "headings": heads,
        "links": links,
        "images": imgs,
        "fields": fields,
        "text_blocks": blocks,
        # The whole page as one normalised string. A block is only "missing" if
        # it is absent from THIS -- re-joining the split blocks loses adjacency,
        # so a sentence the clone merely wraps differently reads as lost.
        "text_full": words,
        "word_count": len(words.split()),
        "jsonld": len(re.findall(r"application/ld\+json", doc, re.I)),
        "iframes": sorted({norm_path(m.group(1), base) for m in
                           re.finditer(r"<iframe\b[^>]+src=[\"']([^\"']+)", doc, re.I)} - {""}),
    }


def fetch(url: str, tries: int = 3):
    last = None
    for _ in range(tries):
        try:
            r = Fetcher.get(url, timeout=60, stealthy_headers=True)
            if r.status == 200:
                return r.body if isinstance(r.body, str) else r.body.decode("utf8", "replace")
            last = f"status {r.status}"
        except Exception as e:                                   # transient; retry
            last = f"{type(e).__name__}: {e}"
    return None if last is None else RuntimeError(last)


def one(path: str) -> dict:
    old_url = f"https://{OLD_HOST}{path}"
    new_url = f"https://{NEW_HOST}{path}"
    o = fetch(old_url)
    n = fetch(new_url)
    rec = {"path": path}
    if not isinstance(o, str):
        rec["old_error"] = str(o)
    if not isinstance(n, str):
        rec["new_error"] = str(n)
    if isinstance(o, str):
        rec["old"] = census(o, old_url)
    if isinstance(n, str):
        rec["new"] = census(n, new_url)
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--urls", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=12)
    a = ap.parse_args()

    paths = [l.strip() for l in open(a.urls) if l.strip()]

    # Written a line at a time, and already-done addresses are skipped on a
    # re-run. The first attempt at this died two thirds of the way through and
    # took every result with it, because it held everything in memory and wrote
    # once at the end.
    import os
    done = set()
    if os.path.exists(a.out):
        for line in open(a.out):
            try:
                done.add(json.loads(line)["path"])
            except Exception:
                pass
    todo = [p for p in paths if p not in done]
    print(f"census over {len(todo)} addresses ({len(done)} already done), "
          f"{a.workers} at a time", file=sys.stderr)
    with open(a.out, "a") as fh, ThreadPoolExecutor(a.workers) as ex:
        for i, rec in enumerate(ex.map(one, todo), 1):
            fh.write(json.dumps(rec) + "\n")
            fh.flush()
            if i % 25 == 0:
                print(f"  {i}/{len(todo)}", file=sys.stderr)
    print(f"written {a.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
