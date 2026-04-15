const fs = require('fs');
const buf = fs.readFileSync('public/intro/beat-5.mp4');
let out = [];
for (let i = 0; i < Math.min(buf.length, 500000) - 4; i++) {
  const s = buf.toString('ascii', i, i + 4);
  if (s === 'avcC') {
    out.push(`avcC at ${i} profile=${buf[i+5]} level=${buf[i+7]}`);
  }
  if (s === 'tkhd') {
    const v = buf[i+4];
    const o = v === 1 ? 96 : 84;
    const w = buf.readUInt32BE(i + o) / 65536;
    const h = buf.readUInt32BE(i + o + 4) / 65536;
    out.push(`tkhd ${w}x${h}`);
  }
  if (s === 'mvhd') {
    const v = buf[i+4];
    const timescale = buf.readUInt32BE(i + (v === 1 ? 28 : 20));
    out.push(`mvhd timescale=${timescale}`);
  }
}
console.log(out.join('\n') || 'nothing found');
console.log('size:', buf.length);
