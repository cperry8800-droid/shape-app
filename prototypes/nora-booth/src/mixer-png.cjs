// Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced) + a noise probe: mean |Δ| between horizontal neighbours.
const fs = require('fs'), zlib = require('zlib');
function decode(file) {
  const b = fs.readFileSync(file); let o = 8, w, h, ct, idat = [];
  while (o < b.length) { const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; } if (type === 'IDAT') idat.push(d); o += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(w * h * bpp), stride = w * bpp;
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[y * stride + x - bpp] : 0, up = y ? px[(y - 1) * stride + x] : 0, c = (x >= bpp && y) ? px[(y - 1) * stride + x - bpp] : 0;
      let v = row[x]; if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1; else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      px[y * stride + x] = v & 255; } }
  return { w, h, bpp, px };
}
function lum(im, x, y) { const i = (y * im.w + x) * im.bpp; return 0.3 * im.px[i] + 0.59 * im.px[i + 1] + 0.11 * im.px[i + 2]; }
module.exports = { decode, lum };
if (require.main === module) {
  const [,, x0, y0, x1, y1, ...files] = process.argv;
  for (const f of files) { const im = decode(f); let t = 0, n = 0;
    for (let y = +y0; y < +y1; y++) for (let x = +x0; x < +x1; x++) { t += Math.abs(lum(im, x, y) - lum(im, x + 1, y)); n++; }
    console.log(f.split('/').pop(), (t / n).toFixed(2)); }
}
