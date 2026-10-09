/**
 * Hand-checked descriptions for gallery images, keyed by the image's stable
 * upload path (src/data/gallery-alt-overrides.json). Applied after the D1
 * snapshot is read, so a normal `pull-galleries` refresh cannot revert them and
 * a tokenless build renders the identical text. D1 is never written, and the
 * visible `title` (the link tooltip) stays exactly as D1 has it.
 *
 * Kept free of imports so scripts/gallery-alt-check.mjs can exercise it.
 */
type Item = { src: string; title?: string; tag?: string; alt?: string };

export function applyAltOverrides<T extends Item>(items: T[], map: Record<string, string>): T[] {
  let changed = false;
  const out = items.map((it) => {
    const alt = map[it.src];
    if (!alt || it.alt === alt) return it;
    changed = true;
    return { ...it, alt };
  });
  return changed ? out : items;
}
