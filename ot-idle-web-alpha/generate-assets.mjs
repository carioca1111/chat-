import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2];
if (!outDir) throw new Error('usage: node generate-assets.mjs <output-dir>');
fs.mkdirSync(outDir, { recursive: true });

const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const concat = (...parts) => Buffer.concat(parts.flat());
const NODE_START = 0xfe, NODE_END = 0xff, ESCAPE = 0xfd;

function escapeNodeData(buf) {
  const out = [];
  for (const byte of buf) {
    if (byte === ESCAPE || byte === NODE_START || byte === NODE_END) out.push(ESCAPE);
    out.push(byte);
  }
  return Buffer.from(out);
}

function node(data, children = Buffer.alloc(0)) {
  return concat(Buffer.from([NODE_START]), escapeNodeData(data), children, Buffer.from([NODE_END]));
}

function str16(text) {
  const b = Buffer.from(text, 'utf8');
  return concat(u16(b.length), b);
}

// ---------------------------------------------------------------------------
// Original 32x32 pixel assets. No Tibia DAT/SPR content is redistributed.
// ---------------------------------------------------------------------------
const W = 32, H = 32;
const empty = () => Array(W * H).fill(null);
const solid = (c) => Array(W * H).fill(c);
function rect(p, x, y, w, h, c) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    if (xx >= 0 && xx < W && yy >= 0 && yy < H) p[yy * W + xx] = c;
  }
}
function pixel(p, x, y, c) { if (x >= 0 && x < W && y >= 0 && y < H) p[y * W + x] = c; }

function grass() {
  const p = solid([52, 110, 55]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if ((x * 17 + y * 31) % 29 === 0) p[y * W + x] = [67, 132, 64];
    if ((x * 11 + y * 7) % 47 === 0) p[y * W + x] = [43, 92, 45];
  }
  return p;
}
function wall() {
  const p = empty();
  rect(p, 0, 8, 32, 24, [120, 109, 91]);
  for (const y of [8, 16, 24]) rect(p, 0, y, 32, 2, [78, 70, 58]);
  for (let y = 10; y < 32; y += 8) {
    const off = ((Math.floor(y / 8) % 2) === 0) ? 0 : 8;
    for (let x = off; x < 32; x += 16) rect(p, x, y, 2, 6, [85, 77, 63]);
  }
  rect(p, 0, 6, 32, 3, [148, 134, 112]);
  return p;
}
function rock() {
  const p = empty();
  rect(p, 7, 17, 18, 10, [93, 102, 105]);
  rect(p, 10, 13, 12, 8, [110, 119, 121]);
  rect(p, 12, 14, 5, 3, [140, 148, 148]);
  return p;
}
function chest() {
  const p = empty();
  rect(p, 6, 14, 20, 13, [121, 73, 30]);
  rect(p, 6, 12, 20, 5, [154, 95, 38]);
  rect(p, 14, 15, 4, 6, [218, 177, 63]);
  rect(p, 7, 20, 18, 2, [73, 42, 19]);
  return p;
}
function player(direction, phase) {
  const p = empty();
  const bob = phase ? 1 : 0;
  rect(p, 9, 27, 14, 3, [42, 42, 45]);
  rect(p, 11, 20 + bob, 4, 7, [52, 71, 118]);
  rect(p, 17, 20 + (phase ? 0 : 1), 4, 7, [52, 71, 118]);
  rect(p, 9, 10 + bob, 14, 12, [42, 119, 189]);
  rect(p, 9, 19 + bob, 14, 2, [37, 49, 65]);
  rect(p, 11, 4 + bob, 10, 8, [210, 165, 118]);
  rect(p, 10, 2 + bob, 12, 4, [40, 32, 28]);
  if (direction === 0) rect(p, 13, 11 + bob, 6, 8, [91, 58, 37]);
  if (direction === 1) rect(p, 21, 12 + bob, 3, 6, [210, 165, 118]);
  if (direction === 2) { pixel(p, 13, 7 + bob, [20, 20, 20]); pixel(p, 18, 7 + bob, [20, 20, 20]); }
  if (direction === 3) rect(p, 8, 12 + bob, 3, 6, [210, 165, 118]);
  return p;
}

function encodeSprite(p) {
  const chunks = [];
  let i = 0;
  while (i < p.length) {
    let transparent = 0;
    while (i < p.length && p[i] === null && transparent < 65535) { transparent++; i++; }
    const start = i;
    let colored = 0;
    while (i < p.length && p[i] !== null && colored < 65535) { colored++; i++; }
    chunks.push(u16(transparent), u16(colored));
    const rgb = Buffer.alloc(colored * 3);
    for (let j = 0; j < colored; j++) {
      const [r, g, b] = p[start + j];
      rgb[j * 3] = r; rgb[j * 3 + 1] = g; rgb[j * 3 + 2] = b;
    }
    chunks.push(rgb);
  }
  const data = Buffer.concat(chunks);
  return concat(Buffer.from([255, 0, 255]), u16(data.length), data);
}

// Sprite order for creatures is phase-major, then direction (N/E/S/W).
const sprites = [grass(), wall(), rock(), chest()];
for (let phase = 0; phase < 2; phase++) for (let direction = 0; direction < 4; direction++) {
  sprites.push(player(direction, phase));
}

function buildSpr() {
  const count = sprites.length;
  const header = Buffer.alloc(4 + 2 + count * 4);
  header.writeUInt32LE(0x12345678, 0);
  header.writeUInt16LE(count, 4);
  const chunks = [];
  let offset = header.length;
  sprites.forEach((p, i) => {
    const enc = encodeSprite(p);
    header.writeUInt32LE(offset, 6 + i * 4);
    chunks.push(enc);
    offset += enc.length;
  });
  return concat(header, chunks);
}

function frameGroup(spriteIds, patternX = 1, animationPhases = 1) {
  const b = [Buffer.from([1, 1, 1, patternX, 1, 1, animationPhases])];
  for (const sid of spriteIds) b.push(u16(sid));
  return Buffer.concat(b);
}
function thing(attrs, frame) {
  const b = [];
  for (const attr of attrs) {
    if (Array.isArray(attr)) b.push(Buffer.from([attr[0]]), u16(attr[1]));
    else b.push(Buffer.from([attr]));
  }
  b.push(Buffer.from([0xff]), frame);
  return Buffer.concat(b);
}
function buildDat() {
  const items = [
    thing([[0, 150], 30], frameGroup([1])),
    thing([12, 13, 14, 15], frameGroup([2])),
    thing([16], frameGroup([3])),
    thing([4, 16], frameGroup([4])),
  ];
  const creature = thing([], frameGroup([5, 6, 7, 8, 9, 10, 11, 12], 4, 2));
  return concat(
    u32(0x4c591e67),
    u16(103), // item ids 100..103
    u16(1),   // one creature lookType (id 1)
    u16(0), u16(0),
    items,
    creature,
  );
}

function otbAttrU16(type, value) { return concat(Buffer.from([type]), u16(2), u16(value)); }
function otbName(name) { const b = Buffer.from(name); return concat(Buffer.from([0x12]), u16(b.length), b); }
function otbItem(group, flags, serverId, clientId, speed, name) {
  const attrs = [otbAttrU16(0x10, serverId), otbAttrU16(0x11, clientId)];
  if (speed !== undefined) attrs.push(otbAttrU16(0x14, speed));
  if (name) attrs.push(otbName(name));
  return node(concat(Buffer.from([group]), u32(flags), attrs));
}
function buildOtb() {
  const csd = Buffer.alloc(128);
  Buffer.from('Ascension OT Idle Alpha 0.1').copy(csd);
  const rootData = concat(
    Buffer.from([0]), u32(0), Buffer.from([1]), u16(140),
    u32(3), u32(3), u32(760), u32(1), csd,
  );
  const children = concat(
    otbItem(1, 0, 100, 100, 150, 'grass'),
    otbItem(0, 1 | 2 | 4, 101, 101, undefined, 'wall'),
    otbItem(0, 64, 102, 102, undefined, 'rock'),
    otbItem(2, 16 | 32 | 64, 103, 103, undefined, 'chest'),
  );
  return concat(Buffer.alloc(4), node(rootData, children));
}

function buildOtbm() {
  const baseX = 100, baseY = 100, z = 7, width = 30, height = 18;
  const tiles = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const ids = [100];
    const boundary = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    const internal = (x === 10 && y >= 3 && y <= 13 && y !== 8)
      || (y === 6 && x >= 15 && x <= 24 && x !== 19);
    if (boundary || internal) ids.push(101);
    if ([[5, 5], [7, 12], [21, 10], [24, 4]].some(([xx, yy]) => xx === x && yy === y)) ids.push(102);
    if (x === 24 && y === 13) ids.push(103);
    const attrs = [Buffer.from([0x05, x, y])];
    for (const id of ids) attrs.push(Buffer.from([0x09]), u16(id));
    tiles.push(node(Buffer.concat(attrs)));
  }
  const area = node(concat(Buffer.from([0x04]), u16(baseX), u16(baseY), Buffer.from([z])), Buffer.concat(tiles));
  const mapData = node(Buffer.from([0x02]), area);
  const town = node(concat(
    Buffer.from([0x0d]), u32(1), str16('Rookgaard'),
    u16(baseX + 4), u16(baseY + 4), Buffer.from([z]),
  ));
  const towns = node(Buffer.from([0x0c]), town);
  const root = concat(
    Buffer.from([0x00]), u32(1), u16(width), u16(height), u32(3), u32(760),
  );
  return concat(Buffer.alloc(4), node(root, concat(mapData, towns)));
}

const files = {
  'Tibia.dat': buildDat(),
  'Tibia.spr': buildSpr(),
  'items.otb': buildOtb(),
  'world.otbm': buildOtbm(),
};
for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(outDir, name), data);
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({
  files: { dat: 'Tibia.dat', spr: 'Tibia.spr', otb: 'items.otb', otbm: 'world.otbm' },
}, null, 2));

console.log('[assets] generated', Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.length])));
