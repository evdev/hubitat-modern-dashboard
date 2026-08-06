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
  const h = Math.max(0, Math.min(1, (dx * bax + dy * bay) / (bax * bax + bay * bay)));
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

const BG = [11, 13, 18];
const PANEL = [22, 26, 36];
const ACCENT = [91, 140, 255];
const ON = [255, 184, 107];

// W3C maskable safe zone: circle radius = 40% of icon width (= 0.8 in [-1,1] coords).
// https://w3c.github.io/manifest/#icon-masks
const SAFE_ZONE_R = 0.8;

// Logo SDF extent from center (roof peak corner is the tightest bound).
const LOGO_R = 0.82;
const FIT = SAFE_ZONE_R / LOGO_R;

/**
 * Maskable launcher icon sized to W3C safe-zone spec.
 * Background bleeds to edges; symbol scaled to fill the safe circle.
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

      // Decorative panel — may clip at mask edge (non-essential per W3C).
      const panelHalf = 0.92;
      const panelR = 0.14;
      const ddx = Math.max(0, Math.abs(sx) - panelHalf + panelR);
      const ddy = Math.max(0, Math.abs(sy) - panelHalf + panelR);
      const dPanel = Math.sqrt(ddx * ddx + ddy * ddy) - panelR;
      const opacityPanel = smoothstep(0.02 + pixelSize, 0.02 - pixelSize, dPanel);

      // House
      const dRoofL = sdSegment(px, py, -0.58, -0.08, 0.0, -0.62);
      const dRoofR = sdSegment(px, py, 0.0, -0.62, 0.58, -0.08);
      const dWallL = sdSegment(px, py, -0.58, -0.08, -0.58, 0.54);
      const dWallR = sdSegment(px, py, 0.58, -0.08, 0.58, 0.54);
      const dFloor = sdSegment(px, py, -0.58, 0.54, 0.58, 0.54);
      const dHouse = Math.min(dRoofL, dRoofR, dWallL, dWallR, dFloor);
      const opacityHouse = smoothstep(0.026 + pixelSize, 0.026 - pixelSize, dHouse);

      const inHouse = px >= -0.58 && px <= 0.58 && py >= -0.08 && py <= 0.54
        && py >= -0.08 - (px / 0.58) * 0.54;
      const opacityHouseFill = inHouse ? 0.28 : 0;

      // Bulb
      const dCircle = Math.abs(Math.sqrt(px * px + (py + 0.04) * (py + 0.04)) - 0.26);
      const dCircleUpper = py <= 0.02 ? dCircle : 1e9;
      const dTaperL = sdSegment(px, py, -0.25, 0.02, -0.11, 0.24);
      const dTaperR = sdSegment(px, py, 0.25, 0.02, 0.11, 0.24);
      const dBulbGlass = Math.min(dCircleUpper, dTaperL, dTaperR);
      const opacityBulb = smoothstep(0.02 + pixelSize, 0.02 - pixelSize, dBulbGlass);

      const dBase = Math.min(
        sdSegment(px, py, -0.11, 0.26, 0.11, 0.26),
        sdSegment(px, py, -0.09, 0.30, 0.09, 0.30)
      );
      const opacityBase = smoothstep(0.018 + pixelSize, 0.018 - pixelSize, dBase);

      const dTrack = sdSegment(px, py, 0.0, -0.15, 0.0, 0.11);
      const opacityTrack = smoothstep(0.016 + pixelSize, 0.016 - pixelSize, dTrack);
      const dActive = sdSegment(px, py, 0.0, 0.11, 0.0, -0.02);
      const opacityActive = smoothstep(0.016 + pixelSize, 0.016 - pixelSize, dActive);
      const dThumb = Math.sqrt(px * px + (py + 0.02) * (py + 0.02));
      const opacityThumb = smoothstep(0.068 + pixelSize, 0.068 - pixelSize, dThumb);
      const opacityCore = smoothstep(0.032 + pixelSize, 0.032 - pixelSize, dThumb);
      const glow = Math.exp(-3.6 * dThumb);

      let col = [...BG];
      col = mix(col, PANEL, opacityPanel);
      col = mix(col, ACCENT, opacityHouseFill);
      col = mix(col, ACCENT, opacityHouse);
      col = mix(col, [34, 43, 61], opacityTrack);
      col = mix(col, ON, opacityActive);
      col = mix(col, [122, 162, 255], opacityBase);
      col = mix(col, [251, 252, 247], opacityBulb);
      col = mix(col, ON, opacityThumb);
      col = mix(col, [255, 255, 255], opacityCore);
      col = [col[0] + glow * 85, col[1] + glow * 52, col[2] + glow * 14];

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
