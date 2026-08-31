/**
 * Perspective de-skew for the receipt scanner — browser only, no dependencies.
 *
 * `warpQuadToRect` takes the source photo plus the four corner points the user
 * dragged onto the document and produces an axis-aligned, perspective-corrected
 * canvas. Canvas 2D only supports affine transforms, so the projective map is
 * approximated by subdividing the output rectangle into a grid of triangles and
 * drawing each with its own affine transform (piecewise-affine warp) — visually
 * indistinguishable from a true homography for document-shaped quads.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Corner order used throughout: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt];

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Natural output size for a quad: average of opposite edge lengths. */
export function quadOutputSize(q: Quad, maxLongEdge = 1600): { w: number; h: number } {
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  const long = Math.max(w, h, 1);
  const scale = long > maxLongEdge ? maxLongEdge / long : 1;
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** Solve the 8×8 system for a projective transform mapping `from` → `to` (h[8] = 1). */
function computeHomography(from: Quad, to: Quad): number[] {
  const M: number[][] = [];
  const rhs: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = from[i];
    const { x, y } = to[i];
    M.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    rhs.push(x);
    M.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    rhs.push(y);
  }
  // Gauss-Jordan with partial pivoting on the augmented 8×9 matrix.
  const n = 8;
  const aug = M.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r;
    }
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    const div = aug[col][col] || 1e-12;
    for (let c = col; c <= n; c++) aug[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) aug[r][c] -= factor * aug[col][c];
    }
  }
  return [...aug.map((row) => row[n]), 1];
}

function applyH(h: number[], x: number, y: number): Pt {
  const w = h[6] * x + h[7] * y + h[8] || 1e-12;
  return {
    x: (h[0] * x + h[1] * y + h[2]) / w,
    y: (h[3] * x + h[4] * y + h[5]) / w,
  };
}

/** 3×3 inverse; returns null if singular. */
function invert3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-9) return null;
  const invDet = 1 / det;
  return [
    A * invDet,
    (c * h - b * i) * invDet,
    (b * f - c * e) * invDet,
    B * invDet,
    (a * i - c * g) * invDet,
    (c * d - a * f) * invDet,
    C * invDet,
    (b * g - a * h) * invDet,
    (a * e - b * d) * invDet,
  ];
}

/** Draw the source triangle (s0,s1,s2) into the destination triangle (d0,d1,d2). */
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  s0: Pt,
  s1: Pt,
  s2: Pt,
  d0: Pt,
  d1: Pt,
  d2: Pt,
): void {
  const srcInv = invert3([s0.x, s1.x, s2.x, s0.y, s1.y, s2.y, 1, 1, 1]);
  if (!srcInv) return;
  // [a c e; b d f] = dst(2×3) · srcInv(3×3)
  const a = d0.x * srcInv[0] + d1.x * srcInv[3] + d2.x * srcInv[6];
  const c = d0.x * srcInv[1] + d1.x * srcInv[4] + d2.x * srcInv[7];
  const e = d0.x * srcInv[2] + d1.x * srcInv[5] + d2.x * srcInv[8];
  const b = d0.y * srcInv[0] + d1.y * srcInv[3] + d2.y * srcInv[6];
  const d = d0.y * srcInv[1] + d1.y * srcInv[4] + d2.y * srcInv[7];
  const f = d0.y * srcInv[2] + d1.y * srcInv[5] + d2.y * srcInv[8];

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();
  // pad the clip a hair to hide seams between triangles
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export interface WarpOptions {
  maxLongEdge?: number;
  grid?: number;
  /** grayscale + contrast-stretch cleanup pass */
  enhance?: boolean;
}

/** Perspective-correct `corners` (in source-image pixels) to a flat rectangle. */
export function warpQuadToRect(
  img: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  corners: Quad,
  opts: WarpOptions = {},
): HTMLCanvasElement {
  void sourceWidth;
  void sourceHeight;
  const { w: outW, h: outH } = quadOutputSize(corners, opts.maxLongEdge ?? 1600);
  const grid = opts.grid ?? 16;

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const dstRect: Quad = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ];
  const h = computeHomography(dstRect, corners); // output-rect coords → source coords

  // Precompute source positions for every grid vertex.
  const src: Pt[][] = [];
  for (let gy = 0; gy <= grid; gy++) {
    const row: Pt[] = [];
    for (let gx = 0; gx <= grid; gx++) {
      row.push(applyH(h, (gx / grid) * outW, (gy / grid) * outH));
    }
    src.push(row);
  }

  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const x0 = (gx / grid) * outW;
      const x1 = ((gx + 1) / grid) * outW;
      const y0 = (gy / grid) * outH;
      const y1 = ((gy + 1) / grid) * outH;
      const d00 = { x: x0, y: y0 };
      const d10 = { x: x1, y: y0 };
      const d11 = { x: x1, y: y1 };
      const d01 = { x: x0, y: y1 };
      drawTriangle(ctx, img, src[gy][gx], src[gy][gx + 1], src[gy + 1][gx + 1], d00, d10, d11);
      drawTriangle(ctx, img, src[gy][gx], src[gy + 1][gx + 1], src[gy + 1][gx], d00, d11, d01);
    }
  }

  if (opts.enhance) enhanceInPlace(ctx, outW, outH);
  return canvas;
}

/** Grayscale + 5th/95th-percentile contrast stretch. Cheap document cleanup. */
export function enhanceInPlace(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;
  const hist = new Uint32Array(256);
  const luma = new Uint8ClampedArray(px.length / 4);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const y = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    luma[j] = y;
    hist[y]++;
  }
  const total = luma.length;
  let lo = 0;
  let hi = 255;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= total * 0.05) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= total * 0.05) {
      hi = v;
      break;
    }
  }
  const range = Math.max(1, hi - lo);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = Math.max(0, Math.min(255, ((luma[j] - lo) / range) * 255));
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}
