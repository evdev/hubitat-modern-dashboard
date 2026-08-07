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

// Soft plaque palette (Concept D-app v3).
const BG = [12, 14, 18];
const RING = [72, 80, 92];
const RING_HI = [118, 128, 142];
const ENAMEL = [48, 58, 74];
const ENAMEL_HI = [62, 74, 94];
const M_BODY = [236, 240, 244];
const M_SHADE = [198, 206, 216];
const GOLD = [201, 155, 130];
const GOLD_HI = [232, 196, 172];

// W3C maskable safe zone: circle radius = 40% of icon width (= 0.8 in [-1,1] coords).
const SAFE_ZONE_R = 0.8;
const LOGO_R = 0.78;
const TARGET_R = 0.74;
const FIT = TARGET_R / LOGO_R;

const RING_OUTER = 0.70;
const RING_INNER = 0.56;
const M_W = 0.078;
const GOLD_W = 0.038;

/**
 * Soft Maserati-plaque app icon: circular enamel ring, luminous M, rose-gold stroke.
 * Background bleeds to edges; emblem stays inside the W3C maskable safe circle.
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
      const r = Math.hypot(px, py);

      // Soft radial vignette on the app field.
      const field = Math.exp(-1.1 * (sx * sx + sy * sy));
      let col = mix(BG, [18, 22, 30], field * 0.55);

      // Enamel disc.
      const dDisc = r - RING_INNER;
      const enamelA = smoothstep(pixelSize, -pixelSize, dDisc);
      const enamelShade = 0.5 + 0.35 * (-py * 0.4 - px * 0.15);
      const enamelCol = [
        lerp(ENAMEL[0], ENAMEL_HI[0], enamelShade),
        lerp(ENAMEL[1], ENAMEL_HI[1], enamelShade),
        lerp(ENAMEL[2], ENAMEL_HI[2], enamelShade),
      ];
      col = mix(col, enamelCol, enamelA);

      // Gunmetal ring (annulus).
      const dRing = Math.abs(r - (RING_OUTER + RING_INNER) * 0.5) - (RING_OUTER - RING_INNER) * 0.5;
      const ringA = smoothstep(pixelSize * 1.4, -pixelSize, dRing);
      const ringShade = 0.42 + 0.5 * Math.max(0, -py * 0.55 - px * 0.2);
      const ringCol = [
        lerp(RING[0], RING_HI[0], ringShade),
        lerp(RING[1], RING_HI[1], ringShade),
        lerp(RING[2], RING_HI[2], ringShade),
      ];
      col = mix(col, ringCol, ringA);

      // Soft inner rim highlight on the ring.
      const dInnerRim = Math.abs(r - RING_INNER) - 0.012;
      const rimA = smoothstep(0.02 + pixelSize, 0.02 - pixelSize, dInnerRim) * enamelA;
      col = mix(col, RING_HI, rimA * 0.35);

      // Geometric plaque M (four thick strokes).
      const dM = Math.min(
        sdSegment(px, py, -0.30, 0.30, -0.30, -0.36),
        sdSegment(px, py, -0.30, -0.36, 0.00, 0.20),
        sdSegment(px, py, 0.00, 0.20, 0.30, -0.36),
        sdSegment(px, py, 0.30, -0.36, 0.30, 0.30),
      );
      const mA = smoothstep(M_W + pixelSize, M_W - pixelSize * 1.5, dM);
      const mShade = 0.55 + 0.45 * Math.max(0, -py * 0.5 - px * 0.15);
      const mCol = [
        lerp(M_SHADE[0], M_BODY[0], mShade),
        lerp(M_SHADE[1], M_BODY[1], mShade),
        lerp(M_SHADE[2], M_BODY[2], mShade),
      ];

      // Soft contact shadow under the M.
      const dShadow = Math.min(
        sdSegment(px, py + 0.03, -0.30, 0.30, -0.30, -0.36),
        sdSegment(px, py + 0.03, -0.30, -0.36, 0.00, 0.20),
        sdSegment(px, py + 0.03, 0.00, 0.20, 0.30, -0.36),
        sdSegment(px, py + 0.03, 0.30, -0.36, 0.30, 0.30),
      );
      const shadowA = smoothstep(M_W + 0.04, M_W - 0.02, dShadow) * enamelA * 0.28;
      col = mix(col, [20, 24, 32], shadowA);
      col = mix(col, mCol, mA);

      // Rose-gold accent stroke (right-inner diagonal, slightly taller).
      const dGold = sdSegment(px, py, 0.04, 0.10, 0.34, -0.48);
      const goldA = smoothstep(GOLD_W + pixelSize, GOLD_W - pixelSize, dGold);
      const goldShade = 0.45 + 0.55 * Math.max(0, -py);
      const goldCol = [
        lerp(GOLD[0], GOLD_HI[0], goldShade),
        lerp(GOLD[1], GOLD_HI[1], goldShade),
        lerp(GOLD[2], GOLD_HI[2], goldShade),
      ];
      col = mix(col, goldCol, goldA);

      // Tiny gold pip at bottom of ring (plaque detail).
      const dPip = Math.hypot(px, py - 0.62);
      const pipA = smoothstep(0.028 + pixelSize, 0.028 - pixelSize, dPip);
      col = mix(col, GOLD, pipA * 0.9);

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
