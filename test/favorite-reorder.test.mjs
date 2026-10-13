import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function loadFavoriteReorderPlaceholderIndex() {
  const src = readFileSync(join(root, "src/app.js"), "utf8");
  const start = src.indexOf("function favoriteReorderPlaceholderIndex(");
  if (start < 0) throw new Error("favoriteReorderPlaceholderIndex missing from src/app.js");
  const brace = src.indexOf("{", start);
  let depth = 0;
  let end = brace;
  for (; end < src.length; end++) {
    const ch = src[end];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end++;
        break;
      }
    }
  }
  const fnSrc = src.slice(start, end);
  return new Function(`${fnSrc}\nreturn favoriteReorderPlaceholderIndex;`)();
}

const indexAt = loadFavoriteReorderPlaceholderIndex();

const B = { left: 110, top: 0, right: 210, bottom: 100 };
const C = { left: 0, top: 110, right: 100, bottom: 210 };
const D = { left: 110, top: 110, right: 210, bottom: 210 };
const tiles = [B, C, D];

function pt(r) {
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}

test("hovering a tile moves the placeholder into that tile's occupied cell", () => {
  const b = pt(B);
  const c = pt(C);
  const d = pt(D);
  assert(indexAt(tiles, 0, b.x, b.y) === 1, "hover B occupies B (placeholder moves after B)");
  assert(indexAt(tiles, 0, B.left + 10, B.top + 10) === 1, "hover upper-left of B occupies B");
  assert(indexAt(tiles, 0, c.x, c.y) === 2, "hover C occupies C");
  assert(indexAt(tiles, 0, d.x, d.y) === 3, "hover D occupies D / append after last in-row");
});

test("hovering the original gap leaves the placeholder in place", () => {
  assert(indexAt(tiles, 0, 50, 50) === 0, "hover original cell keeps placeholder");
});

test("reordering handles earlier slots, the end of the grid, and an empty grid", () => {
  const b = pt(B);
  assert(indexAt(tiles, 0, 160, 250) === 3, "below last tile appends");
  assert(indexAt(tiles, 3, 160, 250) === 3, "already at end stays at end");
  assert(indexAt(tiles, 2, b.x, b.y) === 0, "hover B from later slot occupies B");
  assert(indexAt([], 0, 10, 10) === 0, "empty grid stays at 0");
});
