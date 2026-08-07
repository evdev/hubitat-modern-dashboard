import { deflateSync } from "node:zlib";

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function sdSegment(px, py, ax, ay, bx, by) {
  const dx = px - ax;
  const dy = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const len2 = bax * bax + bay * bay;
  const h = len2 > 0 ? Math.max(0, Math.min(1, (dx * bax + dy * bay) / len2)) : 0;
  return Math.sqrt((dx - bax * h) ** 2 + (dy - bay * h) ** 2);
}

/** Distance to an upper semicircle arc (screen +y down; arc bows toward -y). */
function sdUpperArc(px, py, cx, cy, r) {
  const qx = px - cx;
  const qy = py - cy;
  if (qy > 0) {
    const dL = Math.hypot(qx + r, qy);
    const dR = Math.hypot(qx - r, qy);
    return Math.min(dL, dR);
  }
  return Math.abs(Math.hypot(qx, qy) - r);
}

// E1 Marque palette: flat silver m + flat gold dash on a flat deep navy field.
// No vignette, no blurred drop shadow, no continuous gradients — every region is a
// single flat tone (plus one hard-edged highlight facet) so the icon stays crisp at
// any scale, including Android's splash-screen and adaptive-icon upscaling.
const BG = [10, 14, 22];
const SILVER = [214, 221, 230];
const SILVER_HILITE = [246, 249, 252];
const GOLD = [214, 168, 88];
const GOLD_HILITE = [244, 214, 150];

// W3C maskable safe zone: circle radius = 40% of icon width (= 0.8 in [-1,1] coords).
const SAFE_ZONE_R = 0.8;
const LOGO_R = 0.72;
// Fill more of the safe zone so splash / home-screen glyphs read larger and sharper.
const TARGET_R = 0.76;
const FIT = TARGET_R / LOGO_R;

const M_W = 0.1;
const DASH_W = 0.05;
const SS = 4; // 4×4 supersampling for clean, single-pixel-wide edge anti-aliasing.

function marqueDist(px, py) {
  return Math.min(
    sdSegment(px, py, -0.36, 0.22, -0.36, -0.18),
    sdUpperArc(px, py, -0.18, -0.18, 0.18),
    sdSegment(px, py, 0.0, -0.18, 0.0, 0.1),
    sdUpperArc(px, py, 0.18, -0.18, 0.18),
    sdSegment(px, py, 0.36, -0.18, 0.36, 0.22),
  );
}

function sampleAt(sx, sy) {
  const px = sx / FIT;
  const py = sy / FIT;

  let col = BG;

  const dM = marqueDist(px, py);
  if (dM <= M_W) {
    // Hard-edged top-left highlight facet (no gradient blend) so the metal stays flat
    // and crisp instead of reading as a soft glow.
    col = px - py < -0.05 ? SILVER_HILITE : SILVER;
  }

  const dDash = sdSegment(px, py, -0.3, 0.42, 0.3, 0.42);
  if (dDash <= DASH_W) {
    col = px < -0.08 ? GOLD_HILITE : GOLD;
  }

  return col;
}

/**
 * E1 Marque app icon: flat silver m with a flat gold dash beneath — no ring, no
 * vignette, no blurred shadow. Background bleeds to edges; glyph stays inside the
 * W3C maskable safe circle. Rendered with 4× supersampling so Android splash /
 * launcher / adaptive-icon upscales stay sharp instead of reading as hazy.
 */
export function createIconPng(size) {
  const rows = [];

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0;

    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let oy = 0; oy < SS; oy++) {
        for (let ox = 0; ox < SS; ox++) {
          const sx = ((x + (ox + 0.5) / SS) / size) * 2 - 1;
          const sy = ((y + (oy + 0.5) / SS) / size) * 2 - 1;
          const c = sampleAt(sx, sy);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const n = SS * SS;
      const i = 1 + x * 3;
      row[i] = Math.max(0, Math.min(255, Math.round(r / n)));
      row[i + 1] = Math.max(0, Math.min(255, Math.round(g / n)));
      row[i + 2] = Math.max(0, Math.min(255, Math.round(b / n)));
    }
    rows.push(row);
  }

  const raw = Buffer.concat(rows);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function iconBase64(size) {
  return createIconPng(size).toString("base64");
}

/** Max distance from center of the logo in screen space (for QA). */
export function logoScreenRadius() {
  return LOGO_R * FIT;
}
