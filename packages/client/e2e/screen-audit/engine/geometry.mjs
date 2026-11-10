/** Geometry helpers shared by the rules; they read a snapshot written by `collect.mjs`. */

export function ancestors(snapshot, index) {
  const chain = [];
  for (let current = snapshot.elements[index]?.parent ?? -1; current >= 0; current = snapshot.elements[current].parent)
    chain.push(current);
  return chain;
}

export function insideHorizontalScroller(snapshot, index) {
  return ancestors(snapshot, index).some((ancestor) => snapshot.elements[ancestor].scrollableX);
}

export function insideScroller(snapshot, index) {
  return snapshot.scroller ? ancestors(snapshot, index).includes(snapshot.scroller.index) : false;
}

export function intersect(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

export function viewportBox(snapshot) {
  return { x: 0, y: 0, w: snapshot.viewport.width, h: snapshot.viewport.height };
}

const mediaTags = new Set(["img", "canvas", "video", "input", "textarea", "select", "iframe"]);

/**
 * The visible leaves of the first screen height: text runs (by their text box), controls, icons and media, cut to the
 * viewport. `content` excludes the elements the project declares as navigation chrome.
 */
export function viewportLeaves(snapshot, { content = false } = {}) {
  const view = viewportBox(snapshot);
  const leaves = [];
  snapshot.elements.forEach((entry, index) => {
    if (content && entry.chrome) return;
    let rect = null;
    let kind = null;
    if (entry.textRect) {
      rect = entry.textRect;
      kind = "text";
    } else if (entry.interactive && !entry.insideInteractive) {
      rect = entry.visibleRect;
      kind = "action";
    } else if (entry.isSvg || mediaTags.has(entry.tag)) {
      rect = entry.visibleRect;
      kind = "media";
    }
    if (!rect) return;
    const visible = intersect(intersect(rect, entry.visibleRect), view);
    if (visible.w < 1 || visible.h < 1) return;
    leaves.push({ index, entry, kind, rect: visible });
  });
  return leaves;
}

/** Marks the cells of a grid of `cell` pixels covered by the rectangles. */
export function raster(snapshot, rects, cell) {
  const columns = Math.ceil(snapshot.viewport.width / cell);
  const rows = Math.ceil(snapshot.viewport.height / cell);
  const grid = Array.from({ length: rows }, () => new Uint8Array(columns));
  for (const rect of rects) {
    const left = Math.max(0, Math.floor(rect.x / cell));
    const right = Math.min(columns - 1, Math.ceil((rect.x + rect.w) / cell) - 1);
    const top = Math.max(0, Math.floor(rect.y / cell));
    const bottom = Math.min(rows - 1, Math.ceil((rect.y + rect.h) / cell) - 1);
    for (let row = top; row <= bottom; row++) for (let column = left; column <= right; column++) grid[row][column] = 1;
  }
  return { grid, columns, rows };
}

/** Largest rectangle of empty cells, by the histogram method; returns its cell rectangle. */
export function largestEmptyRectangle({ grid, columns }) {
  const heights = new Array(columns).fill(0);
  let best = { area: 0, x: 0, y: 0, w: 0, h: 0 };
  grid.forEach((row, rowIndex) => {
    for (let column = 0; column < columns; column++) heights[column] = row[column] ? 0 : heights[column] + 1;
    const stack = [];
    for (let column = 0; column <= columns; column++) {
      const height = column === columns ? 0 : heights[column];
      let start = column;
      while (stack.length && stack[stack.length - 1].height >= height) {
        const top = stack.pop();
        const area = top.height * (column - top.start);
        if (area > best.area)
          best = { area, x: top.start, y: rowIndex - top.height + 1, w: column - top.start, h: top.height };
        start = top.start;
      }
      stack.push({ start, height });
    }
  });
  return best;
}

export function describe(entry) {
  const label = entry.ariaLabel || entry.textContent || entry.text || entry.placeholder;
  return label ? `${entry.key} « ${label.slice(0, 60)} »` : entry.key;
}
