// Packs the Quarky board STEP file into public/models/quarky.bin for the 3D view.
// Usage: cd tools/quarky && npm i occt-import-js@0.0.23 && cp <board>.stp board.stp && node pack.mjs && cp quarky.bin ../../public/models/
// (The STEP file itself is not in the repo: it is 25 MB.)
// Packs the STEP tessellation into one binary: JSON header + Float32 positions (mm) + Uint32 indices, one group per part.
import occtFactory from 'occt-import-js';
import { readFileSync, writeFileSync } from 'node:fs';
const occt = await occtFactory({ locateFile: f => new URL('node_modules/occt-import-js/dist/' + f, import.meta.url).pathname });
const res = occt.ReadStepFile(new Uint8Array(readFileSync('board.stp')), { linearDeflection: 0.12, angularDeflection: 0.35 });
if (!res.success) throw new Error('read failed');
const pos = [], idx = [], groups = []; let vBase = 0;
for (const m of res.meshes) {
  const p = m.attributes.position.array, ix = m.index.array;
  const vCount = p.length / 3, iStart = idx.length;
  for (let i = 0; i < p.length; i++) pos.push(p[i]);
  for (let i = 0; i < ix.length; i++) idx.push(ix[i] + vBase);
  groups.push({ name: m.name || '', color: m.color ? m.color.map(c => +c.toFixed(3)) : [0.6, 0.6, 0.6], iStart, iCount: ix.length });
  vBase += vCount;
}
const P = Float32Array.from(pos), I = Uint32Array.from(idx);
const header = Buffer.from(JSON.stringify({ units: 'mm', vertices: P.length / 3, triangles: I.length / 3, groups }));
const out = Buffer.alloc(8 + header.length + P.byteLength + I.byteLength);
out.writeUInt32LE(header.length, 0); out.writeUInt32LE(P.byteLength, 4);
header.copy(out, 8); Buffer.from(P.buffer).copy(out, 8 + header.length); Buffer.from(I.buffer).copy(out, 8 + header.length + P.byteLength);
writeFileSync('quarky.bin', out);
const bb = [0,1,2].map(k => [Math.min(...P.filter((_, i) => i % 3 === k)), Math.max(...P.filter((_, i) => i % 3 === k))]);
console.log('groups', groups.length, 'triangles', I.length / 3, 'vertices', P.length / 3, 'bytes', out.length, 'bbox mm', JSON.stringify(bb.map(b => b.map(v => +v.toFixed(1)))));
console.log('colours', [...new Set(groups.map(g => g.color.join(',')))].slice(0, 8).join(' | '));
