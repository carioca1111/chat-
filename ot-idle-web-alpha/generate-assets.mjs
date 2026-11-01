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

const W = 32, H = 32;
const empty = () => Array(W * H).fill(null);
const solid = (c) => Array(W * H).fill(c);
function rect(p, x, y, w, h, c) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    if (xx >= 0 && xx < W && yy >= 0 && yy < H) p[yy * W + xx] = c;
  }
}
function pixel(p, x, y, c) { if (x >= 0 && x < W && y >= 0 && y < H) p[y * W + x] = c; }

function noisy(base, a, b) {
  const p = solid(base);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if ((x * 17 + y * 31) % 29 === 0) p[y * W + x] = a;
    if ((x * 11 + y * 7) % 47 === 0) p[y * W + x] = b;
  }
  return p;
}
const grass = () => noisy([52, 110, 55], [67, 132, 64], [43, 92, 45]);
const dirt = () => noisy([119, 93, 58], [137, 107, 65], [96, 73, 46]);
const caveFloor = () => noisy([66, 66, 61], [78, 77, 69], [52, 52, 48]);
function water() {
  const p = solid([41, 91, 137]);
  for (let y = 3; y < 32; y += 7) rect(p, (y * 3) % 14, y, 13, 1, [65, 127, 173]);
  return p;
}
function wall() {
  const p = empty();
  rect(p, 0, 7, 32, 25, [111, 101, 84]);
  for (const y of [7, 15, 23]) rect(p, 0, y, 32, 2, [68, 62, 52]);
  for (let y = 9; y < 32; y += 8) {
    const off = ((Math.floor(y / 8) % 2) === 0) ? 0 : 8;
    for (let x = off; x < 32; x += 16) rect(p, x, y, 2, 6, [78, 71, 59]);
  }
  rect(p, 0, 5, 32, 3, [144, 132, 108]);
  return p;
}
function caveWall() {
  const p = empty();
  rect(p, 0, 6, 32, 26, [68, 64, 61]);
  rect(p, 0, 8, 32, 4, [47, 44, 42]);
  for (let x = 2; x < 32; x += 7) rect(p, x, 13 + (x % 3), 4, 15, [81, 76, 71]);
  return p;
}
function tree() {
  const p = empty();
  rect(p, 14, 19, 5, 11, [93, 58, 31]);
  rect(p, 6, 6, 21, 17, [35, 92, 43]);
  rect(p, 9, 3, 15, 17, [44, 116, 51]);
  rect(p, 12, 7, 9, 8, [61, 139, 62]);
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
  return p;
}
function potion() {
  const p = empty();
  rect(p, 12, 9, 8, 4, [195, 201, 205]);
  rect(p, 10, 13, 12, 14, [157, 45, 54]);
  rect(p, 12, 15, 8, 8, [222, 72, 82]);
  return p;
}
function coin() {
  const p = empty();
  rect(p, 9, 14, 14, 10, [191, 134, 30]);
  rect(p, 11, 12, 10, 12, [235, 187, 58]);
  rect(p, 14, 15, 4, 5, [255, 224, 106]);
  return p;
}
function sword() {
  const p = empty();
  for (let i = 0; i < 16; i++) rect(p, 15 + Math.floor(i / 8), 4 + i, 2, 2, [188, 198, 207]);
  rect(p, 10, 20, 12, 3, [168, 124, 45]);
  rect(p, 14, 22, 4, 7, [96, 61, 34]);
  return p;
}
function player(direction, phase) {
  const p = empty();
  const bob = phase ? 1 : 0;
  rect(p, 9, 27, 14, 3, [42, 42, 45]);
  rect(p, 11, 20 + bob, 4, 7, [52, 71, 118]);
  rect(p, 17, 20 + (phase ? 0 : 1), 4, 7, [52, 71, 118]);
  rect(p, 9, 10 + bob, 14, 12, [42, 119, 189]);
  rect(p, 11, 4 + bob, 10, 8, [210, 165, 118]);
  rect(p, 10, 2 + bob, 12, 4, [40, 32, 28]);
  if (direction === 0) rect(p, 13, 11 + bob, 6, 8, [91, 58, 37]);
  if (direction === 1) rect(p, 21, 12 + bob, 3, 6, [210, 165, 118]);
  if (direction === 2) { pixel(p, 13, 7 + bob, [20, 20, 20]); pixel(p, 18, 7 + bob, [20, 20, 20]); }
  if (direction === 3) rect(p, 8, 12 + bob, 3, 6, [210, 165, 118]);
  return p;
}
function rat(direction, phase) {
  const p = empty();
  const bob = phase ? 1 : 0;
  rect(p, 8, 17 + bob, 16, 8, [120, 87, 61]);
  rect(p, direction === 3 ? 5 : 18, 14 + bob, 9, 8, [145, 108, 77]);
  rect(p, 10, 24 + bob, 4, 3, [83, 57, 40]);
  rect(p, 19, 24 + bob, 4, 3, [83, 57, 40]);
  pixel(p, direction === 3 ? 7 : 23, 16 + bob, [240, 70, 70]);
  return p;
}
function wolf(direction, phase) {
  const p = empty();
  const bob = phase ? 1 : 0;
  rect(p, 7, 14 + bob, 18, 11, [112, 118, 123]);
  rect(p, direction === 3 ? 4 : 20, 10 + bob, 9, 9, [135, 141, 145]);
  rect(p, 9, 24 + bob, 4, 5, [73, 77, 82]);
  rect(p, 19, 24 + bob, 4, 5, [73, 77, 82]);
  rect(p, 5, 11 + bob, 4, 4, [78, 82, 87]);
  return p;
}
function slime(direction, phase) {
  const p = empty();
  const bob = phase ? 1 : 0;
  rect(p, 7, 15 + bob, 18, 12, [61, 154, 83]);
  rect(p, 10, 11 + bob, 12, 8, [77, 184, 98]);
  pixel(p, 13, 16 + bob, [15, 31, 18]);
  pixel(p, 19, 16 + bob, [15, 31, 18]);
  return p;
}
function brute(direction, phase) {
  const p = empty();
  const bob = phase ? 1 : 0;
  rect(p, 7, 8 + bob, 18, 17, [143, 63, 53]);
  rect(p, 10, 3 + bob, 12, 9, [187, 106, 78]);
  rect(p, 5, 13 + bob, 5, 10, [187, 106, 78]);
  rect(p, 22, 13 + bob, 5, 10, [187, 106, 78]);
  rect(p, 9, 24 + bob, 5, 6, [70, 58, 51]);
  rect(p, 18, 24 + bob, 5, 6, [70, 58, 51]);
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

const itemSprites = [grass(), wall(), rock(), chest(), dirt(), water(), tree(), caveFloor(), caveWall(), potion(), coin(), sword()];
const sprites = [...itemSprites];
const creatureFns = [player, rat, wolf, slime, brute];
const creatureSpriteIds = [];
for (const fn of creatureFns) {
  const ids = [];
  for (let phase = 0; phase < 2; phase++) for (let direction = 0; direction < 4; direction++) {
    sprites.push(fn(direction, phase));
    ids.push(sprites.length);
  }
  creatureSpriteIds.push(ids);
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
    thing([[0, 150], 30], frameGroup([5])),
    thing([[0, 150], 12, 15, 30], frameGroup([6])),
    thing([12, 13, 14, 15], frameGroup([7])),
    thing([[0, 155], 30], frameGroup([8])),
    thing([12, 13, 14, 15], frameGroup([9])),
    thing([16], frameGroup([10])),
    thing([5, 16], frameGroup([11])),
    thing([16], frameGroup([12])),
  ];
  const creatures = creatureSpriteIds.map(ids => thing([], frameGroup(ids, 4, 2)));
  return concat(
    u32(0x4c591e67),
    u16(111),
    u16(creatures.length),
    u16(0), u16(0),
    items,
    creatures,
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
  Buffer.from('Ascension OT Idle Alpha 0.2').copy(csd);
  const rootData = concat(Buffer.from([0]), u32(0), Buffer.from([1]), u16(140), u32(3), u32(3), u32(760), u32(2), csd);
  const children = concat(
    otbItem(1, 0, 100, 100, 150, 'grass'),
    otbItem(0, 1 | 2 | 4, 101, 101, undefined, 'stone wall'),
    otbItem(0, 64, 102, 102, undefined, 'rock'),
    otbItem(2, 16 | 32 | 64, 103, 103, undefined, 'chest'),
    otbItem(1, 0, 104, 104, 150, 'dirt'),
    otbItem(1, 1 | 4, 105, 105, 150, 'water'),
    otbItem(0, 1 | 2 | 4, 106, 106, undefined, 'tree'),
    otbItem(1, 0, 107, 107, 155, 'cave floor'),
    otbItem(0, 1 | 2 | 4, 108, 108, undefined, 'cave wall'),
    otbItem(0, 32 | 64, 109, 109, undefined, 'health potion'),
    otbItem(0, 32 | 64 | 128, 110, 110, undefined, 'gold coin'),
    otbItem(0, 32 | 64, 111, 111, undefined, 'iron sword'),
  );
  return concat(Buffer.alloc(4), node(rootData, children));
}

function buildOtbm() {
  const baseX = 100, baseY = 100, z = 7, width = 46, height = 30;
  const tiles = [];
  const treeSpots = new Set(['3,3','6,7','13,4','14,23','25,24','27,5','28,20','4,25','20,3','22,26']);
  const rockSpots = new Set(['18,20','24,11','35,8','39,20','42,11','32,23']);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const inCave = x >= 30 && x <= 44 && y >= 3 && y <= 26;
    const pathTile = (y >= 20 && y <= 22 && x >= 5 && x <= 31) || (x >= 27 && x <= 31 && y >= 14 && y <= 22);
    const inWater = x >= 2 && x <= 10 && y >= 2 && y <= 6;
    let ground = inCave ? 107 : (pathTile ? 104 : (inWater ? 105 : 100));
    const ids = [ground];
    const boundary = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    if (boundary) ids.push(101);

    const caveBorder = inCave && (x === 30 || x === 44 || y === 3 || y === 26) && !(x === 30 && y >= 14 && y <= 16);
    if (caveBorder) ids.push(108);

    const house1 = ((x === 3 || x === 12) && y >= 10 && y <= 18) || ((y === 10 || y === 18) && x >= 3 && x <= 12);
    const house2 = ((x === 16 || x === 25) && y >= 8 && y <= 16) || ((y === 8 || y === 16) && x >= 16 && x <= 25);
    const h1door = y === 18 && (x === 7 || x === 8);
    const h2door = y === 16 && (x === 20 || x === 21);
    if ((house1 && !h1door) || (house2 && !h2door)) ids.push(101);

    if (!inWater && !boundary && !house1 && !house2 && treeSpots.has(`${x},${y}`)) ids.push(106);
    if (!boundary && rockSpots.has(`${x},${y}`)) ids.push(102);
    if (x === 10 && y === 13) ids.push(103);
    if (x === 22 && y === 11) ids.push(103);
    if (x === 40 && y === 8) ids.push(103);

    const attrs = [Buffer.from([0x05, x, y])];
    for (const id of ids) attrs.push(Buffer.from([0x09]), u16(id));
    tiles.push(node(Buffer.concat(attrs)));
  }
  const area = node(concat(Buffer.from([0x04]), u16(baseX), u16(baseY), Buffer.from([z])), Buffer.concat(tiles));
  const mapData = node(Buffer.from([0x02]), area);
  const town = node(concat(Buffer.from([0x0d]), u32(1), str16('Ascension Camp'), u16(baseX + 7), u16(baseY + 22), Buffer.from([z])));
  const towns = node(Buffer.from([0x0c]), town);
  const root = concat(Buffer.from([0x00]), u32(1), u16(width), u16(height), u32(3), u32(760));
  return concat(Buffer.alloc(4), node(root, concat(mapData, towns)));
}

const files = {
  'Tibia.dat': buildDat(),
  'Tibia.spr': buildSpr(),
  'items.otb': buildOtb(),
  'world.otbm': buildOtbm(),
};
for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(outDir, name), data);
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ files: { dat: 'Tibia.dat', spr: 'Tibia.spr', otb: 'items.otb', otbm: 'world.otbm' } }, null, 2));
console.log('[assets] generated Alpha 0.2', Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.length])));
