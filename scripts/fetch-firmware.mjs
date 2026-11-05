// Puts the firmware and manifest into public/firmware before the build, so dist/ contains them.
//  - GitHub Pages workflow: tools/build_firmware.sh already wrote public/firmware/ → nothing to do.
//  - Vercel (or a local build without arduino-cli): downloads them from the published Pages site.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join('public', 'firmware');
if (existsSync(join(dir, 'manifest.json'))) { console.log('firmware: already built, skipping download'); process.exit(0); }

const base = (process.env.FIRMWARE_URL || 'https://viren-robot.github.io/Steam_CAR/firmware/').replace(/\/?$/, '/');
try {
  const res = await fetch(base + 'manifest.json');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const manifest = await res.json();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  for (const f of manifest.firmware) {
    const r = await fetch(base + f.file);
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${f.file}`);
    writeFileSync(join(dir, f.file), Buffer.from(await r.arrayBuffer()));
  }
  console.log(`firmware: downloaded ${manifest.firmware.length} images from ${base}`);
} catch (e) {
  console.warn(`firmware: could not download from ${base} (${e.message}). The Flash tab will say so.`);
}
