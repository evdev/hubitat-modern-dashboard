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

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix(bg, fg, alpha) {
  return [
    bg[0] * (1 - alpha) + fg[0] * alpha,
    bg[1] * (1 - alpha) + fg[1] * alpha,
    bg[2] * (1 - alpha) + fg[2] * alpha,
  ];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function sdArch(px, py, cx, cy, r) {
  const steps = 20;
  let distance = Infinity;
  for (let i = 0; i < steps; i++) {
    const a = Math.PI - (Math.PI * i) / steps;
    const b = Math.PI - (Math.PI * (i + 1)) / steps;
    distance = Math.min(
      distance,
      sdSegment(
        px,
        py,
        cx + Math.cos(a) * r,
        cy - Math.sin(a) * r,
        cx + Math.cos(b) * r,
        cy - Math.sin(b) * r,
      ),
    );
  }
  return distance;
}

// E1 Marque palette: silver m + gold dash on deep navy (no ring).
const BG = [8, 12, 20];
const SILVER_LO = [148, 158, 172];
const SILVER_HI = [236, 242, 248];
const GOLD_LO = [168, 118, 48];
const GOLD_HI = [236, 198, 118];

// W3C maskable safe zone: circle radius = 40% of icon width (= 0.8 in [-1,1] coords).
const SAFE_ZONE_R = 0.8;
const LOGO_R = 0.72;
const TARGET_R = 0.70;
const FIT = TARGET_R / LOGO_R;

const M_W = 0.095;
const DASH_W = 0.048;

/**
 * E1 Marque app icon: silver geometric m with a gold dash beneath — no ring.
 * Background bleeds to edges; glyph stays inside the W3C maskable safe circle.
 */
export function createIconPng(size) {
  const pixelSize = 2.0 / size;
  const rows = [];

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0;

    for (let x = 0; x < size; x++) {
      const sx = ((x + 0.5) / size) * 2 - 1;
      const sy = ((y + 0.5) / size) * 2 - 1;
      const px = sx / FIT;
      const py = sy / FIT;

      // Deep navy field with soft vignette.
      const field = Math.exp(-1.35 * (sx * sx + sy * sy));
      let col = mix(BG, [14, 22, 36], field * 0.65);

      // Silver marque "m": three legs + two rounded arches.
      const dM = Math.min(
        sdSegment(px, py, -0.36, 0.22, -0.36, -0.18),
        sdArch(px, py, -0.18, -0.18, 0.18),
        sdSegment(px, py, 0.0, -0.18, 0.0, 0.10),
        sdArch(px, py, 0.18, -0.18, 0.18),
        sdSegment(px, py, 0.36, -0.18, 0.36, 0.22),
      );
      const mA = smoothstep(M_W + pixelSize, M_W - pixelSize * 1.6, dM);
      // Metallic sheen: brighter toward center / upper-left light.
      const mShade = 0.35 + 0.55 * Math.max(0, 0.55 - Math.abs(px) * 0.55 - py * 0.25);
      const mCol = [
        lerp(SILVER_LO[0], SILVER_HI[0], mShade),
        lerp(SILVER_LO[1], SILVER_HI[1], mShade),
        lerp(SILVER_LO[2], SILVER_HI[2], mShade),
      ];

      // Soft contact shadow under the m.
      const dShadow = Math.min(
        sdSegment(px, py + 0.028, -0.36, 0.22, -0.36, -0.18),
        sdArch(px, py + 0.028, -0.18, -0.18, 0.18),
        sdSegment(px, py + 0.028, 0.0, -0.18, 0.0, 0.10),
        sdArch(px, py + 0.028, 0.18, -0.18, 0.18),
        sdSegment(px, py + 0.028, 0.36, -0.18, 0.36, 0.22),
      );
      const shadowA = smoothstep(M_W + 0.035, M_W - 0.01, dShadow) * 0.22;
      col = mix(col, [4, 8, 14], shadowA);
      col = mix(col, mCol, mA);

      // Gold dash under the m (mDash marque bar).
      const dDash = sdSegment(px, py, -0.30, 0.42, 0.30, 0.42);
      const dashA = smoothstep(DASH_W + pixelSize, DASH_W - pixelSize, dDash);
      const dashShade = 0.4 + 0.6 * Math.max(0, 1 - Math.abs(px) / 0.34);
      const dashCol = [
        lerp(GOLD_LO[0], GOLD_HI[0], dashShade),
        lerp(GOLD_LO[1], GOLD_HI[1], dashShade),
        lerp(GOLD_LO[2], GOLD_HI[2], dashShade),
      ];
      col = mix(col, dashCol, dashA);

      const i = 1 + x * 3;
      row[i] = Math.max(0, Math.min(255, Math.round(col[0])));
      row[i + 1] = Math.max(0, Math.min(255, Math.round(col[1])));
      row[i + 2] = Math.max(0, Math.min(255, Math.round(col[2])));
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
    pngChunk("IDAT", deflateSync(raw)),
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
