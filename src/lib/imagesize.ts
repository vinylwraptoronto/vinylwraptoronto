/**
 * An uploaded image's pixel size, read from its own header bytes.
 *
 * A masonry gallery reserves each tile's box from the file's ratio (see dimsOf
 * and tileOf in Blocks.astro). The imported photographs have theirs in
 * src/data/img-dims.json, measured by a script; a photograph added from
 * /admin/gallery/ arrives after that manifest was built, so its size is taken
 * here, at upload, and stored on its gallery row instead. Without it the tile
 * has no height until the picture decodes, and the column collapses under it.
 *
 * JPEG, PNG, GIF and WebP (lossy, lossless and extended). AVIF's size sits in
 * a nested box structure that is not worth parsing here: it returns null, and
 * the tile falls back to the browser's own sizing, as before.
 */
export function imageSize(buf: ArrayBuffer): { width: number; height: number } | null {
  const b = new Uint8Array(buf);
  const u16be = (o: number) => (b[o] << 8) | b[o + 1];
  const u16le = (o: number) => b[o] | (b[o + 1] << 8);
  const u24le = (o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
  const u32be = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const ok = (width: number, height: number) => (width > 0 && height > 0 ? { width, height } : null);

  // PNG: the IHDR chunk always comes first.
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return ok(u32be(16), u32be(20));
  }

  // GIF: logical screen size.
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return ok(u16le(6), u16le(8));
  }

  // WebP: RIFF....WEBP, then a VP8 / VP8L / VP8X chunk.
  if (b.length >= 30 && b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === 'VP8 ') return ok(u16le(26) & 0x3fff, u16le(28) & 0x3fff);
    if (chunk === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return ok((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
    }
    if (chunk === 'VP8X') return ok(u24le(24) + 1, u24le(27) + 1);
    return null;
  }

  // JPEG: walk the segments to the first start-of-frame marker. A phone
  // photograph is usually stored sideways with an EXIF orientation of 5-8,
  // which browsers apply, so the size is swapped to match what is drawn.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    let turned = false;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const marker = b[o + 1];
      if (marker === 0xff) { o++; continue; } // fill byte
      if (marker === 0xe1) turned = exifTurned(b, o + 4, u16be(o + 2) - 2) || turned;
      // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const w = u16be(o + 7);
        const h = u16be(o + 5);
        return turned ? ok(h, w) : ok(w, h);
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { o += 2; continue; }
      o += 2 + u16be(o + 2);
    }
    return null;
  }

  return null;
}

/** Whether an APP1 segment's EXIF orientation (tag 0x0112) is 5-8 -- a
    quarter turn, so the drawn picture is the stored one on its side. */
function exifTurned(b: Uint8Array, start: number, len: number): boolean {
  const end = Math.min(b.length, start + len);
  // "Exif\0\0", then a TIFF header.
  if (end - start < 14 || b[start] !== 0x45 || b[start + 1] !== 0x78 || b[start + 2] !== 0x69 || b[start + 3] !== 0x66) {
    return false;
  }
  const t = start + 6;
  const le = b[t] === 0x49 && b[t + 1] === 0x49;
  if (!le && !(b[t] === 0x4d && b[t + 1] === 0x4d)) return false;
  const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o: number) =>
    (le ? b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24) : (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const ifd = t + u32(t + 4);
  if (ifd + 2 > end) return false;
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > end) return false;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 5 && v <= 8;
    }
  }
  return false;
}
