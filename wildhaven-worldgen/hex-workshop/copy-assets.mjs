import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const here=dirname(fileURLToPath(import.meta.url));
const worldgen=resolve(here,'..');
await mkdir(resolve(here,'public'),{recursive:true});
const assets = {
  'biomes.png':'outputs/biomes.png',
  'regions.json':'outputs/regions.json',
  'forest-metadata.json':'hex-scenes/H_5_7/metadata.json'
};
for(const [name,path] of Object.entries(assets)) {
  await copyFile(resolve(worldgen,path),resolve(here,'public',name));
  console.log('Prepared',name);
}

// The repository tracks the GLB as losslessly Brotli-compressed bytes to keep the Git tree small.
const compressed = await readFile(resolve(worldgen,'hex-scenes/H_5_7/forest-temperate.glb.br'));
await writeFile(resolve(here,'public/forest-temperate.glb'),brotliDecompressSync(compressed));
console.log('Restored 3D GLB mesh');
