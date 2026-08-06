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
  return {
    d: Math.sqrt((dx - bax * h) ** 2 + (dy - bay * h) ** 2),
    h,
  };
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

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

const BG = [8, 10, 14];
const CYAN = [48, 210, 255];
const CYAN_CORE = [220, 248, 255];
const AMBER = [255, 168, 42];
const AMBER_CORE = [255, 236, 180];

// W3C maskable safe zone: circle radius = 40% of icon width (= 0.8 in [-1,1] coords).
// https://w3c.github.io/manifest/#icon-masks
const SAFE_ZONE_R = 0.8;

// Thick live-wire M path extent (including glow) kept inside the safe circle.
const LOGO_R = 0.92;
const TARGET_R = 0.74;
const FIT = TARGET_R / LOGO_R;

// Organic M as cubic Beziers: two soft arches, trailing curl with amber tip.
// Coordinates in logo space before FIT.
const BEZIERS = [
  // Left leg → left peak
  [-0.58, 0.46, -0.56, 0.12, -0.48, -0.28, -0.30, -0.50],
  // Left peak → center valley
  [-0.30, -0.50, -0.14, -0.18, -0.08, 0.18, 0.00, 0.34],
  // Center valley → right peak
  [0.00, 0.34, 0.10, 0.08, 0.18, -0.28, 0.34, -0.52],
  // Right peak → lower right
  [0.34, -0.52, 0.48, -0.22, 0.54, 0.12, 0.52, 0.40],
  // Trailing curl (amber tip lives here)
  [0.52, 0.40, 0.50, 0.56, 0.36, 0.58, 0.28, 0.46],
];

const WIRE_R = 0.118;
const CORE_R = 0.042;
const SAMPLES_PER_CURVE = 28;

const PATH = (() => {
  const pts = [];
  for (const [x0, y0, x1, y1, x2, y2, x3, y3] of BEZIERS) {
    for (let i = 0; i < SAMPLES_PER_CURVE; i++) {
      const t = i / SAMPLES_PER_CURVE;
      pts.push([cubic(x0, x1, x2, x3, t), cubic(y0, y1, y2, y3, t)]);
    }
  }
  const last = BEZIERS[BEZIERS.length - 1];
  pts.push([last[6], last[7]]);
  return pts;
})();

function nearestOnPath(px, py) {
  let bestD = Infinity;
  let bestT = 0;
  const n = PATH.length - 1;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = PATH[i];
    const [bx, by] = PATH[i + 1];
    const { d, h } = sdSegment(px, py, ax, ay, bx, by);
    if (d < bestD) {
      bestD = d;
      bestT = (i + h) / n;
    }
  }
  return { d: bestD, t: bestT };
}

/**
 * Maskable launcher icon: thick neon M live-wire with amber tip.
 * Background bleeds to edges; glyph stays within the W3C safe circle.
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

      const { d, t } = nearestOnPath(px, py);

      const amberMix = smoothstep(0.78, 0.98, t);
      const body = [
        lerp(CYAN[0], AMBER[0], amberMix),
        lerp(CYAN[1], AMBER[1], amberMix),
        lerp(CYAN[2], AMBER[2], amberMix),
      ];
      const core = [
        lerp(CYAN_CORE[0], AMBER_CORE[0], amberMix),
        lerp(CYAN_CORE[1], AMBER_CORE[1], amberMix),
        lerp(CYAN_CORE[2], AMBER_CORE[2], amberMix),
      ];

      const glow = Math.exp(-3.2 * Math.max(0, d - WIRE_R * 0.35));
      const glowCol = [
        lerp(10, body[0], 0.55 + amberMix * 0.2),
        lerp(18, body[1], 0.55),
        lerp(28, body[2], 0.55 - amberMix * 0.15),
      ];

      const opacityWire = smoothstep(WIRE_R + pixelSize, WIRE_R - pixelSize * 1.6, d);
      const opacityCore = smoothstep(CORE_R + pixelSize, CORE_R - pixelSize, d);

      let col = [...BG];
      col = mix(col, glowCol, glow * (0.34 + amberMix * 0.12));
      col = mix(col, body, opacityWire);
      col = mix(col, core, opacityCore * (0.75 + amberMix * 0.2));

      // Hot tip bloom near the curl end.
      if (t > 0.86) {
        const tipGlow = Math.exp(-7.5 * d) * smoothstep(0.86, 1, t);
        col = [
          col[0] + tipGlow * 70,
          col[1] + tipGlow * 36,
          col[2] + tipGlow * 6,
        ];
      }

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
