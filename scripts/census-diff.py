"""
Diff a census: what the old page had that the new page does not.

Only losses are reported. The clone legitimately adds things -- reserved image
boxes, lazy attributes, the lightbox placeholder -- and a symmetric diff buries
the losses under them.

    python3 scripts/census-diff.py census.json [--full] [--limit 40]
"""
import argparse, json, re, sys
from collections import Counter, defaultdict

ap = argparse.ArgumentParser()
ap.add_argument("census")
ap.add_argument("--full", action="store_true", help="print every loss, not a sample")
ap.add_argument("--limit", type=int, default=12)
a = ap.parse_args()

def load(path):
    """JSON Lines, or a plain JSON array from the earlier format."""
    txt = open(path).read().strip()
    if txt.startswith("["):
        return json.loads(txt)
    return [json.loads(l) for l in txt.splitlines() if l.strip()]


recs = load(a.census)

# Third-party things the clone deliberately does not carry; each is on the sheet.
ALLOWED_LINK = re.compile(
    r"^(mailto:|tel:|javascript:|#|https?://(www\.)?(facebook|instagram|linkedin|twitter|x|youtube|pinterest|tumblr|reddit|wa\.me|api\.whatsapp)\.)", re.I)
# WordPress plumbing that has no counterpart in a static build.
WP_ONLY = re.compile(
    r"^/(wp-json|wp-admin|wp-login|xmlrpc|feed|comments/feed|\?|#)|(/feed/$)|^/wp-content/plugins/"
    # Cloudflare rewrites every mailto into this when email obfuscation is on.
    # The clone prints the address plainly, which is the same information.
    r"|^/cdn-cgi/", re.I)

# Third-party tracking. Counted on its own rather than as "a missing image" or
# "a missing iframe", because a pixel is not page content and the answer to a
# missing one is a tag manager, not a component.
TRACKER = re.compile(
    r"(facebook\.com/tr|googletagmanager\.com|google-analytics\.com|doubleclick|"
    r"googleadservices|bat\.bing\.com|hotjar|clarity\.ms|snap\.licdn)", re.I)

totals = Counter()
by_kind = defaultdict(list)
errors = []

for r in recs:
    p = r["path"]
    if "old" not in r or "new" not in r:
        errors.append((p, r.get("old_error", "-"), r.get("new_error", "-")))
        continue
    o, n = r["old"], r["new"]
    totals["pages"] += 1

    # --- headings: the outline, in order ---
    if o["headings"] != n["headings"]:
        oh = [h[1] for h in o["headings"]]
        nh = set(h[1] for h in n["headings"])
        missing = [h for h in oh if h not in nh]
        if missing:
            totals["heading_text"] += len(missing)
            by_kind["heading missing"].append((p, missing[:4]))
        elif [h[0] for h in o["headings"]] != [h[0] for h in n["headings"]]:
            totals["heading_level"] += 1
            by_kind["heading level/order differs"].append(
                (p, f'old {"".join(x[0][1] for x in o["headings"])} / new {"".join(x[0][1] for x in n["headings"])}'))

    # --- links ---
    on = set(o["links"]); nn = set(n["links"])
    lost = sorted(x for x in on - nn
                  if not ALLOWED_LINK.match(x) and not WP_ONLY.match(x))
    if lost:
        totals["links"] += len(lost)
        by_kind["link missing"].append((p, lost[:6]))

    # --- images ---
    oi = set(o["images"]); ni = set(n["images"])
    losti = sorted(oi - ni)
    track = [x for x in losti if TRACKER.search(x)]
    losti = [x for x in losti if not TRACKER.search(x)]
    if track:
        totals["trackers"] += len(track)
        by_kind["tracking pixel missing"].append((p, track))
    if losti:
        totals["images"] += len(losti)
        by_kind["image missing"].append((p, losti[:6]))

    # --- form fields ---
    of = set(o["fields"]); nf = set(n["fields"])
    lostf = sorted(x for x in of - nf if not x.startswith(("_wp", "wp", "action", "post_id", "referer", "queried", "form_id", "form_fields")))
    if lostf:
        totals["fields"] += len(lostf)
        by_kind["form field missing"].append((p, lostf))

    # --- iframes (maps, video) ---
    lostframe = sorted(set(o["iframes"]) - set(n["iframes"]))
    tf = [x for x in lostframe if TRACKER.search(x)]
    lostframe = [x for x in lostframe if not TRACKER.search(x)]
    if tf:
        totals["trackers"] += len(tf)
        by_kind["tracking pixel missing"].append((p, tf))
    if lostframe:
        totals["iframes"] += len(lostframe)
        by_kind["iframe missing"].append((p, lostframe[:3]))

    # --- text blocks ---
    ob = set(o["text_blocks"]); nb = set(n["text_blocks"])
    # Word coverage, not substring containment. Exact matching on a sentence
    # reports two things that are not losses and swamps the ones that are: the
    # clone inserts a skip-to-content link mid-string, and the OLD page carries
    # Cloudflare's email-obfuscation placeholder where the clone prints the real
    # address. Either one breaks a substring test on a block that is fully
    # present. A block whose words are nearly all on the new page is not lost.
    nwords = set(n.get("text_full", "").split())
    lostb = []
    for b in sorted(ob - nb):
        if len(b) <= 25:
            continue
        w = [x for x in b.split() if len(x) > 2]
        if not w:
            continue
        present = sum(1 for x in w if x in nwords) / len(w)
        if present < 0.65:
            lostb.append(f"{b}   [{present:.0%} of its words present]")
    if lostb:
        totals["text"] += len(lostb)
        by_kind["text missing"].append((p, lostb[:4]))

    # --- word count, as a backstop for wholesale loss ---
    if o["word_count"] and n["word_count"] < o["word_count"] * 0.9:
        totals["wordcount"] += 1
        by_kind["word count down >10%"].append(
            (p, f'old {o["word_count"]} / new {n["word_count"]}'))

    if o["jsonld"] and not n["jsonld"]:
        totals["jsonld"] += 1
        by_kind["json-ld lost"].append((p, f'old {o["jsonld"]} blocks'))

    if o["title"] != n["title"]:
        totals["title"] += 1
        by_kind["title differs"].append((p, f'old "{o["title"][:60]}" / new "{n["title"][:60]}"'))

    if o["description"] and o["description"] != n["description"]:
        totals["description"] += 1
        by_kind["description differs"].append(
            (p, f'old "{o["description"][:50]}" / new "{n["description"][:50]}"'))

print("\nCENSUS DIFF — what the old page had and the new one does not\n")
print(f"  pages compared ................ {totals['pages']}")
print(f"  pages not fetched ............. {len(errors)}")
for k, label in [
    ("heading_text", "headings missing"),
    ("heading_level", "heading outline differs"),
    ("links", "links missing"),
    ("images", "images missing"),
    ("fields", "form fields missing"),
    ("iframes", "iframes missing"),
    ("text", "text blocks missing"),
    ("wordcount", "pages losing >10% of words"),
    ("jsonld", "pages losing JSON-LD"),
    ("trackers", "tracking tags missing"),
    ("title", "titles differing"),
    ("description", "descriptions differing"),
]:
    print(f"  {label:.<30} {totals[k]}")

if errors:
    print("\nNOT FETCHED")
    for p, oe, ne in errors[: a.limit]:
        print(f"  {p}\n     old: {str(oe)[:90]}\n     new: {str(ne)[:90]}")

for kind, rows in sorted(by_kind.items(), key=lambda kv: -len(kv[1])):
    print(f"\n{kind.upper()}  ({len(rows)} pages)")
    for p, detail in (rows if a.full else rows[: a.limit]):
        print(f"  {p}")
        if isinstance(detail, list):
            for d in detail:
                print(f"      {str(d)[:150]}")
        else:
            print(f"      {str(detail)[:150]}")
    if not a.full and len(rows) > a.limit:
        print(f"  … and {len(rows) - a.limit} more pages")
