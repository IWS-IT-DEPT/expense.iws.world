import sharp from "sharp";

const src = "public/brand/company-logos.png";
const { data, info } = await sharp(src).greyscale().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;

const NEAR_WHITE = 245;
const rowHasInk = [];
const colHasInk = new Array(width).fill(false);

for (let y = 0; y < height; y++) {
  let ink = false;
  for (let x = 0; x < width; x++) {
    if (data[y * width + x] < NEAR_WHITE) {
      ink = true;
      colHasInk[x] = true;
    }
  }
  rowHasInk.push(ink);
}

function bands(arr) {
  const out = [];
  let start = -1;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] && start < 0) start = i;
    else if (!arr[i] && start >= 0) {
      out.push([start, i - 1]);
      start = -1;
    }
  }
  if (start >= 0) out.push([start, arr.length - 1]);
  return out.filter(([a, b]) => b - a > 15); // ignore specks
}

console.log("row bands:", bands(rowHasInk));
console.log("col bands:", bands(colHasInk));
