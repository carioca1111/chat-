import fs from 'node:fs/promises';
import path from 'node:path';

const START = 0xfe;
const END = 0xff;
const ESC = 0xfd;
const TILE_AREA = 0x04;
const GUEST_X = 655;
const GUEST_Y = 399;
const AREA_X = Math.floor(GUEST_X / 256) * 256;
const AREA_Y = Math.floor(GUEST_Y / 256) * 256;

const root = process.argv[2] || '/app/runtime/server';

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

function parseNode(buf, state) {
  if (buf[state.i++] !== START) throw new Error(`Expected node start at ${state.i - 1}`);
  const type = buf[state.i++];
  const props = [];
  const children = [];

  while (state.i < buf.length) {
    const b = buf[state.i++];
    if (b === ESC) {
      if (state.i >= buf.length) throw new Error('Dangling escape byte');
      props.push(buf[state.i++]);
      continue;
    }
    if (b === START) {
      state.i--;
      children.push(parseNode(buf, state));
      continue;
    }
    if (b === END) return { type, props: Buffer.from(props), children };
    props.push(b);
  }
  throw new Error('Unterminated OTBM node');
}

function escaped(buf) {
  const out = [];
  for (const b of buf) {
    if (b === START || b === END || b === ESC) out.push(ESC);
    out.push(b);
  }
  return Buffer.from(out);
}

function serializeNode(node, chunks) {
  chunks.push(Buffer.from([START, node.type]));
  chunks.push(escaped(node.props));
  for (const child of node.children) serializeNode(child, chunks);
  chunks.push(Buffer.from([END]));
}

let totalAreas = 0;
let keptAreas = 0;
const areas = [];

function crop(node) {
  const kept = [];
  for (const child of node.children) {
    if (child.type === TILE_AREA && child.props.length >= 5) {
      totalAreas++;
      const x = child.props.readUInt16LE(0);
      const y = child.props.readUInt16LE(2);
      const z = child.props[4];
      if (x === AREA_X && y === AREA_Y) {
        keptAreas++;
        areas.push(`${x},${y},${z}`);
        crop(child);
        kept.push(child);
      }
      continue;
    }
    crop(child);
    kept.push(child);
  }
  node.children = kept;
}

const files = await walk(root);
const mapPath = files.find(f => path.basename(f).toLowerCase() === 'dbzo.otbm');
if (!mapPath) throw new Error('DBZO.otbm not found under runtime server');

const original = await fs.readFile(mapPath);
if (original.length < 8) throw new Error(`OTBM file is too small: ${mapPath}`);

// Legacy OTBM files use a four-byte identifier before the first node. Depending
// on the writer/version this is commonly 0x00000000 rather than ASCII "OTBM".
// Preserve those bytes verbatim and parse the node tree beginning at offset 4.
console.log(`[map] OTBM identifier: ${original.subarray(0, 4).toString('hex')}`);
const state = { i: 4 };
const tree = parseNode(original, state);
if (state.i !== original.length) {
  throw new Error(`OTBM parser stopped early at ${state.i}/${original.length}`);
}

crop(tree);
if (keptAreas === 0) {
  throw new Error(`No tile areas found for Guest region ${AREA_X},${AREA_Y}`);
}

const chunks = [original.subarray(0, 4)];
serializeNode(tree, chunks);
const cropped = Buffer.concat(chunks);
const backupPath = mapPath.replace(/\.otbm$/i, '.full.otbm');
await fs.copyFile(mapPath, backupPath);
await fs.writeFile(mapPath, cropped);

console.log(`[map] original DBO Rox map: ${original.length} bytes`);
console.log(`[map] tile areas: kept ${keptAreas}/${totalAreas} for Guest sector x=${AREA_X}-${AREA_X + 255}, y=${AREA_Y}-${AREA_Y + 255}`);
console.log(`[map] kept floors: ${areas.join(' | ')}`);
console.log(`[map] Guest test map: ${cropped.length} bytes (${((cropped.length / original.length) * 100).toFixed(2)}% of original)`);
console.log(`[map] full original preserved at: ${backupPath}`);
