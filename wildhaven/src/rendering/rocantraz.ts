import * as T from "three";
import type { Action } from "../core/types";

/**
 * ROCANTRAZ v2 — original mid-poly apex predator, two ecotypes.
 * Real sculpted loft surfaces, layered osteoderms and independently articulated
 * shoulder/elbow/wrist, hip/knee/ankle, jaw, neck and eight tail segments.
 * Faces +Z. All animations are baked to glTF transform tracks, not images.
 */
export type RocantrazVariant = "forest" | "desert";
export const ROCANTRAZ_VARIANTS: readonly RocantrazVariant[] = ["forest", "desert"];
export const ROCANTRAZ_ANIMATIONS = [
  "idle", "walk", "stalk", "run", "charge", "bite", "swipe",
  "roar", "feed", "defend", "rest", "die",
] as const;
export type RocantrazAnimation = typeof ROCANTRAZ_ANIMATIONS[number];
type Bone = T.Group;
type Palette = {
  hide: number; shoulder: number; armor: number; trim: number;
  spine: number; belly: number; crevice: number; horn: number;
  fang: number; eye: number; lichen: number; accent: number;
};
const palettes: Record<RocantrazVariant, Palette> = {
  forest: {
    hide: 0x485a47, shoulder: 0x627453, armor: 0x758367,
    trim: 0x9ba481, spine: 0x939982, belly: 0x92947b,
    crevice: 0x26342e, horn: 0xc2b9a0, fang: 0xd9ccad,
    eye: 0xe3b85f, lichen: 0x657f43, accent: 0x3c5143,
  },
  desert: {
    hide: 0x995a3d, shoulder: 0xb97851, armor: 0xc58b5b,
    trim: 0xe2b88b, spine: 0xbd7953, belly: 0xd1b48b,
    crevice: 0x52372d, horn: 0xe2d0a9, fang: 0xe9d4b3,
    eye: 0xf2b25a, lichen: 0xaa633c, accent: 0x854b34,
  },
};
const shared: Record<string, T.BufferGeometry> = {
  ico: new T.IcosahedronGeometry(1, 1),
  low: new T.IcosahedronGeometry(1, 0),
  round: new T.SphereGeometry(1, 12, 10),
  cone: new T.ConeGeometry(1, 1, 8),
  box: new T.BoxGeometry(1, 1, 1),
};
const materials = new Map<number, T.MeshStandardMaterial>();
function mat(color: number) {
  let found = materials.get(color);
  if (!found) {
    found = new T.MeshStandardMaterial({
      color, roughness: 0.94, metalness: 0.02,
      flatShading: true, side: T.FrontSide,
    });
    materials.set(color, found);
  }
  return found;
}
function part(
  parent: T.Object3D, type: keyof typeof shared, color: number,
  p: [number, number, number], s: [number, number, number],
  r: [number, number, number] = [0, 0, 0],
): T.Mesh {
  const obj = new T.Mesh(shared[type], mat(color));
  obj.position.set(...p);
  obj.scale.set(...s);
  obj.rotation.set(...r);
  obj.castShadow = obj.receiveShadow = true;
  parent.add(obj);
  return obj;
}
function sculpt(parent: T.Object3D, geo: T.BufferGeometry, color: number) {
  geo.computeVertexNormals();
  const mesh = new T.Mesh(geo, mat(color));
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function rigPart(parent: T.Object3D, name: string, x: number, y: number, z: number) {
  const b = new T.Group();
  b.name = name;
  b.position.set(x, y, z);
  parent.add(b);
  return b;
}

/** Organic-yet-faceted cross sections along the spine's Y axis. */
function loftY(parent: T.Object3D, rings: number[][], color: number, n = 14) {
  const coords: number[] = [];
  const indices: number[] = [];
  for (const [y, cx, cz, rx, rz] of rings)
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2;
      coords.push(cx + rx * Math.cos(a), y, cz + rz * Math.sin(a));
    }
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < n; j++) {
      const a = i*n+j, b = i*n+(j+1)%n, c=(i+1)*n+j, d=(i+1)*n+(j+1)%n;
      indices.push(a,b,c,b,d,c);
    }
  const low = coords.length/3, upper=low+1;
  coords.push(rings[0][1], rings[0][0], rings[0][2]);
  coords.push(rings[rings.length-1][1], rings[rings.length-1][0], rings[rings.length-1][2]);
  for(let j=0;j<n;j++){
    indices.push(low,(j+1)%n,j);
    const k=(rings.length-1)*n;
    indices.push(upper,k+j,k+(j+1)%n);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(coords,3));
  g.setIndex(indices);
  return sculpt(parent,g,color);
}
/** Cross sections along +Z for muzzles, forearms, shoulder plates and tail. */
function loftZ(parent: T.Object3D, rings: number[][], color: number, n=12) {
  const coords: number[] = [], ids: number[] = [];
  for(const [z,cx,cy,rx,ry] of rings)
    for(let j=0;j<n;j++){
      const a=j*2*Math.PI/n;
      coords.push(cx+rx*Math.cos(a),cy+ry*Math.sin(a),z);
    }
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<n;j++){
    const a=i*n+j,b=i*n+(j+1)%n,c=(i+1)*n+j,d=(i+1)*n+(j+1)%n;
    ids.push(a,c,b,b,c,d);
  }
  const lo=coords.length/3,hi=lo+1;
  coords.push(rings[0][1],rings[0][2],rings[0][0]);
  const end=rings[rings.length-1];
  coords.push(end[1],end[2],end[0]);
  for(let j=0;j<n;j++){
    ids.push(lo,j,(j+1)%n);
    const q=(rings.length-1)*n;
    ids.push(hi,q+(j+1)%n,q+j);
  }
  const g=new T.BufferGeometry();
  g.setAttribute("position",new T.Float32BufferAttribute(coords,3));
  g.setIndex(ids);
  return sculpt(parent,g,color);
}
/** Curved tapered muscle with radial cross sections perpendicular to path. */
function muscle(
  parent: T.Object3D, centers: number[][], color: number, sides=10,
) {
  const points=centers.map(p=>new T.Vector3(p[0],p[1],p[2]));
  const vertices: number[]=[], ids:number[]=[];
  const up=new T.Vector3(0,0,1);
  const alternate=new T.Vector3(0,1,0);
  for(let i=0;i<centers.length;i++){
    const tangent=points[Math.min(i+1,points.length-1)].clone()
      .sub(points[Math.max(0,i-1)]).normalize();
    const reference=Math.abs(tangent.dot(up))>0.9?alternate:up;
    const u=new T.Vector3().crossVectors(tangent,reference).normalize();
    const v=new T.Vector3().crossVectors(tangent,u).normalize();
    for(let j=0;j<sides;j++){
      const a=j/sides*2*Math.PI;
      const pos=points[i].clone().addScaledVector(u,Math.cos(a)*centers[i][3])
        .addScaledVector(v,Math.sin(a)*centers[i][3]*(centers[i][4]||1));
      vertices.push(pos.x,pos.y,pos.z);
    }
  }
  for(let i=0;i<centers.length-1;i++)for(let j=0;j<sides;j++){
    const a=i*sides+j,b=i*sides+(j+1)%sides,c=(i+1)*sides+j,d=(i+1)*sides+(j+1)%sides;
    ids.push(a,b,c,b,d,c);
  }
  const first=vertices.length/3,last=first+1;
  vertices.push(...points[0].toArray(), ...points[points.length-1].toArray());
  for(let j=0;j<sides;j++){
    ids.push(first,(j+1)%sides,j);
    const k=(centers.length-1)*sides;
    ids.push(last,k+j,k+(j+1)%sides);
  }
  const g=new T.BufferGeometry();
  g.setAttribute("position",new T.Float32BufferAttribute(vertices,3));
  g.setIndex(ids);
  return sculpt(parent,g,color);
}
/** Tapered 3D shard (polyhedron), no transparent planes. */
function shard(
  parent: T.Object3D, color: number, origin: [number,number,number],
  tip: [number,number,number], width: number, thickness: number,
) {
  const [x,y,z]=origin,[tx,ty,tz]=tip;
  const verts=[
    x-width,y,z, x+width,y,z,
    x,y+thickness,z+thickness,
    x,y-thickness,z-thickness,
    tx,ty,tz,
  ];
  const ids=[0,1,2,0,3,1,0,2,4,1,4,2,0,4,3,1,3,4];
  const g=new T.BufferGeometry();
  g.setAttribute("position",new T.Float32BufferAttribute(verts,3));
  g.setIndex(ids);
  return sculpt(parent,g,color);
}
function tooth(parent: T.Object3D, color:number, x:number,y:number,z:number,
  length:number, upward=false){
  shard(parent,color,[x,y,z],[x*0.94,y+(upward?length:-length),z+0.06],
    length*0.24,length*0.20);
}
export interface RocantrazRig {
  variant:RocantrazVariant;
  body:Bone; neck:Bone; head:Bone; jaw:Bone;
  leftLeg:Bone;rightLeg:Bone;leftKnee:Bone;rightKnee:Bone;
  leftFoot:Bone;rightFoot:Bone;
  leftArm:Bone;rightArm:Bone;leftElbow:Bone;rightElbow:Bone;
  leftHand:Bone;rightHand:Bone;tail:Bone[];
  crest:Bone[];eyes:T.Mesh[];
}
function buildLeg(body:Bone, side:-1|1,p:Palette){
  const label=side<0?"Left":"Right";
  const hip=rigPart(body,"Rocantraz_"+label+"Hip",side*0.83,2.17,-0.43);
  muscle(hip,[
    [0,0,0,0.49],[side*0.09,-0.25,0.03,0.66],
    [side*0.12,-0.60,-0.08,0.60],
    [side*0.13,-0.92,0.10,0.44],
    [side*0.14,-1.07,0.30,0.31],
  ],p.hide);
  part(hip,"ico",p.armor,[side*0.24,-0.18,-0.14],[0.52,0.61,0.36],[0,0,side*0.24]);
  part(hip,"ico",p.trim,[side*0.39,-0.45,-0.21],[0.27,0.34,0.20]);
  const knee=rigPart(hip,"Rocantraz_"+label+"Knee",side*0.14,-1.04,0.31);
  part(knee,"ico",p.armor,[0,-0.02,0.18],[0.39,0.32,0.47]);
  muscle(knee,[
    [0,0,0,0.34],[0.01,-0.23,0.03,0.40],
    [0.01,-0.53,-0.08,0.34],
    [0,-0.84,0.12,0.27],[0,-0.99,0.20,0.20],
  ],p.hide);
  part(knee,"ico",p.trim,[0,-0.57,0.15],[0.27,0.32,0.18]);
  const foot=rigPart(knee,"Rocantraz_"+label+"Ankle",0,-0.98,0.21);
  loftZ(foot,[
    [-0.19,0,0.13,0.31,0.22],[0.14,0,0.09,0.37,0.20],
    [0.60,0,0.05,0.46,0.17],[0.89,0,0.06,0.38,0.15],
  ],p.hide);
  part(foot,"ico",p.armor,[0,0.21,0.29],[0.31,0.13,0.42]);
  for(let i=0;i<4;i++){
    const x=(i-1.5)*0.23;
    muscle(foot,[[x*0.67,0.09,0.62,0.14],
      [x,0.055,0.91,0.12],[x*1.1,0.02,1.05,0.075]],p.hide,8);
    shard(foot,p.fang,[x*1.1,0.07,1.03],
      [x*1.14,-0.10,1.32],0.08,0.07);
  }
  return {hip,knee,foot};
}
function buildArm(body:Bone,side:-1|1,p:Palette) {
  const label=side<0?"Left":"Right";
  const arm=rigPart(body,"Rocantraz_"+label+"Shoulder",side*1.30,3.80,0.56);
  muscle(arm,[
    [0,0,0,0.51],
    [side*0.12,-0.28,0.09,0.60],
    [side*0.28,-0.58,0.18,0.50],
    [side*0.37,-0.79,0.31,0.35],
  ],p.hide);
  part(arm,"ico",p.armor,[side*0.19,0.04,-0.12],[0.67,0.47,0.63]);
  part(arm,"ico",p.trim,[side*0.36,-0.13,0.05],[0.41,0.19,0.46],[0,0,side*0.16]);
  for(let i=0;i<3;i++){
    shard(arm,p.spine,[side*(0.48+i*0.05),0.28-i*0.19,-0.18],
      [side*(0.91+i*0.13),0.48-i*0.16,-0.79],0.16,0.14);
  }
  const elbow=rigPart(arm,"Rocantraz_"+label+"Elbow",side*0.37,-0.77,0.30);
  muscle(elbow,[
    [0,0,0,0.34],[side*0.13,-0.26,0.15,0.44],
    [side*0.17,-0.52,0.33,0.34],
    [side*0.18,-0.73,0.45,0.25],
  ],p.hide);
  part(elbow,"ico",p.armor,[side*0.11,-0.19,0.03],[0.37,0.26,0.36]);
  const hand=rigPart(elbow,"Rocantraz_"+label+"Wrist",side*0.18,-0.71,0.45);
  part(hand,"ico",p.hide,[0,-0.06,0.13],[0.31,0.23,0.32]);
  for(let i=0;i<4;i++){
    const x=(i-1.5)*0.16;
    muscle(hand,[[x*0.65,-0.06,0.21,0.11],
      [x,-0.19,0.36,0.10],[x*1.08,-0.24,0.48,0.07]],p.hide,8);
    shard(hand,p.fang,[x*1.07,-0.21,0.43],
      [x*1.15,-0.54,0.60],0.065,0.075);
  }
  return {arm,elbow,hand};
}
function buildHead(neck:Bone,p:Palette,rig:RocantrazRig,variant:RocantrazVariant){
  const head=rigPart(neck,"Rocantraz_Head",0,0.35,0.40);
  // Long low skull, powerful zygomatic arches, brow shield and wedge muzzle.
  loftZ(head,[
    [-0.45,0,0.12,0.49,0.42],
    [-0.10,0,0.20,0.72,0.56],
    [0.27,0,0.24,0.82,0.58],
    [0.67,0,0.17,0.69,0.40],
    [1.05,0,0.03,0.57,0.30],
    [1.48,0,-0.06,0.48,0.23],
    [1.82,0,-0.12,0.40,0.20],
    [2.04,0,-0.13,0.34,0.16],
  ],p.hide,16);
  // Bony brow ridge with thick inset eye socket, not simple googly eyes.
  part(head,"ico",p.armor,[0,0.59,0.34],[0.78,0.25,0.79],[-0.11,0,0]);
  for(const side of [-1,1] as const){
    part(head,"ico",p.armor,[side*0.58,0.31,0.54],[0.26,0.26,0.60],
      [0,side*0.12,side*0.11]);
    part(head,"ico",p.crevice,[side*0.65,0.23,0.84],[0.13,0.14,0.31]);
    rig.eyes.push(part(head,"ico",p.eye,[side*0.742,0.27,0.89],
      [0.08,0.07,0.14]));
    part(head,"ico",p.trim,[side*0.38,0.04,1.24],
      [0.18,0.09,0.56],[0,side*0.04,0]);
    part(head,"ico",p.crevice,[side*0.25,-0.01,1.92],
      [0.095,0.04,0.062]);
    // Back-swept keratin horns that integrate into the skull plate.
    shard(head,p.horn,[side*0.53,0.64,-0.10],
      [side*(variant==="desert"?1.07:0.94),1.27,-0.65],0.30,0.25);
    shard(head,p.spine,[side*0.69,0.40,-0.22],
      [side*1.07,0.90,-0.96],0.22,0.19);
    for(let i=0;i<7;i++){
      const z=0.87+i*0.17;
      const x=0.43-(i/7)*0.075;
      tooth(head,p.fang,side*x,-0.22-i*0.012,z,
        i===1?0.24:0.14+i%3*0.025);
    }
  }
  // Upper palate and separated fully articulated heavy lower jaw.
  part(head,"ico",p.crevice,[0,-0.32,0.97],[0.49,0.08,0.91]);
  const jaw=rigPart(head,"Rocantraz_Jaw",0,-0.27,0.49);
  loftZ(jaw,[
    [0,0,-0.25,0.43,0.17],
    [0.36,0,-0.34,0.51,0.22],
    [0.85,0,-0.34,0.47,0.17],
    [1.20,0,-0.30,0.42,0.13],
    [1.60,0,-0.27,0.31,0.12],
  ],p.belly);
  part(jaw,"ico",p.crevice,[0,-0.19,0.74],[0.44,0.045,0.72]);
  for(const side of [-1,1] as const)for(let i=0;i<6;i++){
    tooth(jaw,p.fang,side*(0.40-i*0.013),-0.13,0.28+i*0.22,
      i===0?0.22:0.12+(i%3)*0.03,true);
  }
  shard(jaw,p.horn,[-0.38,-0.18,0.92],[-0.56,0.05,1.15],0.09,0.10);
  shard(jaw,p.horn,[0.38,-0.18,0.92],[0.56,0.05,1.15],0.09,0.10);
  return {head,jaw};
}
function buildTail(body:Bone,p:Palette){
  const joints:Bone[]=[];
  let parent:Bone=body;
  for(let i=0;i<8;i++){
    const radius=(0.77-i*0.089);
    const z=i===0?-0.99:-0.75;
    const b=rigPart(parent,"Rocantraz_Tail_"+i,0,i===0?2.52:(i<3?0.02:0.05),z);
    loftZ(b,[
      [-0.93,0,-0.10,radius*0.68,radius*0.59],
      [-0.73,0,0.00,radius*0.83,radius*0.75],
      [-0.37,0,0.02,radius,radius*0.91],
      [-0.07,0,0,radius*0.94,radius*0.82],
      [0.09,0,0,radius*0.77,radius*0.67],
    ],i%2?p.hide:p.armor,12);
    part(b,"ico",p.trim,[0,radius*0.70,-0.31],
      [radius*0.60,0.07,radius*0.75]);
    shard(b,p.spine,[0,radius*0.68,-0.42],
      [0,radius*(i<4?2.06:1.72),-0.90],
      radius*0.50,radius*0.29);
    if(i>=4)for(const side of [-1,1] as const)
      shard(b,p.horn,[side*radius*0.61,0,-0.42],
        [side*radius*1.43,0.18,-0.82],radius*0.28,radius*0.18);
    joints.push(b);
    parent=b;
  }
  shard(parent,p.horn,[0,0,-0.84],[0,0.08,-1.67],0.16,0.19);
  return joints;
}
function makeArmor(body:Bone,p:Palette,v:RocantrazVariant){
  // The tapered trunk has a deep ribcage and a narrow pelvic section.
  loftY(body,[
    [1.91,0,-0.36,0.54,0.55],
    [2.11,0,-0.39,0.93,0.77],
    [2.43,0,-0.31,1.04,0.87],
    [2.82,0,-0.17,0.96,0.89],
    [3.17,0,-0.11,1.17,0.91],
    [3.59,0,-0.06,1.46,1.01],
    [3.91,0,-0.09,1.55,1.03],
    [4.26,0,-0.01,1.24,0.91],
    [4.48,0,0.08,0.72,0.58],
  ],p.hide,18);
  // V-shaped ventral dermal armor follows a chestbone, no circular belly ball.
  loftY(body,[
    [2.15,0,0.56,0.32,0.25],
    [2.42,0,0.61,0.63,0.35],
    [2.95,0,0.77,0.82,0.35],
    [3.39,0,0.82,1.02,0.31],
    [3.84,0,0.80,1.12,0.30],
    [4.16,0,0.68,0.70,0.32],
  ],p.belly,14);
  // Deep colored rib gaps under a sweep of overlapping side osteoderms.
  for(let side of [-1,1] as const){
    for(let i=0;i<6;i++){
      const y=4.13-i*0.35;
      const sx=(1.24-i*0.055);
      part(body,"ico",i%2?p.armor:p.shoulder,
        [side*sx,y,0.49-i*0.055],
        [0.32+i*0.015,0.24,0.67],
        [0,side*0.16,side*(0.08+i*0.025)]);
      shard(body,p.trim,[side*(sx+0.1),y+0.10,0.15],
        [side*(sx+0.42),y+0.18,-0.57],
        0.12,0.16);
    }
    part(body,"ico",p.armor,[side*1.30,3.99,-0.28],
      [0.55,0.56,0.92],[0.08,side*0.12,side*0.13]);
    shard(body,p.spine,[side*1.33,4.22,-0.37],
      [side*1.87,5.01,-1.22],0.31,0.29);
  }
  // Dominant serrated dorsal silhouette of interlocking sweeping plates.
  for(let i=0;i<10;i++){
    const z=0.72-i*0.27;
    const y=4.32-i*0.06;
    const size=(i<5?0.91+i*0.13:1.47-(i-5)*0.14);
    shard(body,i%2?p.trim:p.spine,[0,y,z],
      [0,y+size,z-0.42-size*0.34],0.29+size*0.11,0.22);
    if(i%2===0)for(const side of [-1,1] as const)
      shard(body,p.armor,[side*0.50,y-0.19,z-0.09],
        [side*0.92,y+0.35,z-0.62],0.19,0.18);
  }
  // Ribbed shoulder and sternum armor, independent faceplates.
  for(let row=0;row<4;row++){
    const y=3.84-row*0.36;
    for(const side of [-1,1] as const)
      part(body,"ico",row%2?p.trim:p.armor,
        [side*(0.48+row*0.065),y,1.01-row*0.037],
        [0.50-row*0.042,0.22,0.12],[0,side*0.18,side*0.08]);
  }
  part(body,"ico",p.crevice,[0,3.50,1.12],[0.12,0.65,0.10]);
  if(v==="forest"){
    // Raised lichen geometry clings to crevices, avoids covering entire body.
    for(let i=0;i<36;i++){
      const y=2.48+(i%9)*0.22;
      const side=i%2?-1:1;
      const a=i*2.39996;
      const x=side*(0.82+(i%5)*0.14);
      const z=-0.26+Math.sin(a)*0.44;
      part(body,"low",i%4?p.lichen:p.accent,[x,y,z],
        [0.11+(i%3)*0.025,0.03,0.12+(i%4)*0.028],
        [0,Math.sin(a)*0.45,0.1]);
    }
  } else {
    for(let i=0;i<9;i++){
      const y=3.70-i*0.15;
      for(const side of [-1,1] as const)
        part(body,"ico",i%2?p.armor:p.trim,
          [side*(1.21-(i%4)*0.10),y,-0.15-i*0.045],
          [0.21,0.055,0.39],
          [0.05,0,side*0.10]);
    }
  }
}
export function createRocantraz(variant:RocantrazVariant):T.Group {
  const p=palettes[variant];
  const root=new T.Group();
  root.name="Wildhaven_Rocantraz_"+variant;
  const body=rigPart(root,"Rocantraz_Body",0,0,0);
  makeArmor(body,p,variant);
  const neck=rigPart(body,"Rocantraz_Neck",0,4.04,0.45);
  muscle(neck,[[0,0,-0.09,0.72],[0,0.24,0.14,0.73],
    [0,0.47,0.37,0.58],[0,0.67,0.54,0.42]],p.hide,14);
  part(neck,"ico",p.armor,[0,0.24,-0.20],[0.69,0.56,0.53]);
  const rig:RocantrazRig={
    variant,body,neck,head:neck,jaw:neck,
    leftLeg:body,rightLeg:body,leftKnee:body,rightKnee:body,
    leftFoot:body,rightFoot:body,
    leftArm:body,rightArm:body,leftElbow:body,rightElbow:body,
    leftHand:body,rightHand:body,
    tail:[],crest:[],eyes:[],
  };
  const leftLeg=buildLeg(body,-1,p),rightLeg=buildLeg(body,1,p);
  rig.leftLeg=leftLeg.hip;rig.leftKnee=leftLeg.knee;rig.leftFoot=leftLeg.foot;
  rig.rightLeg=rightLeg.hip;rig.rightKnee=rightLeg.knee;rig.rightFoot=rightLeg.foot;
  const leftArm=buildArm(body,-1,p),rightArm=buildArm(body,1,p);
  rig.leftArm=leftArm.arm;rig.leftElbow=leftArm.elbow;rig.leftHand=leftArm.hand;
  rig.rightArm=rightArm.arm;rig.rightElbow=rightArm.elbow;rig.rightHand=rightArm.hand;
  ({head:rig.head,jaw:rig.jaw}=buildHead(neck,p,rig,variant));
  rig.tail=buildTail(body,p);
  root.userData.rocantraz=variant;
  root.userData.rig=rig;
  root.userData.previewAnimation=null;
  root.scale.setScalar(1.0);
  return root;
}
function mode(action:Action,walking:boolean):RocantrazAnimation{
  if(action==="morto")return "die";
  if(action==="perseguir")return "run";
  if(action==="atacar")return "bite";
  if(action==="pastar")return "feed";
  if(action==="descansar")return "rest";
  return walking?"walk":"idle";
}
const cyc=(t:number)=>Math.sin(t*2*Math.PI);
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
/**
 * Heavy gait with contralateral counter-rotation, knee flexion during swing,
 * planted ankle correction, shoulder follow-through and delayed tail inertia.
 */
export function animateRocantraz(root:T.Group,time:number,walking:boolean,action:Action){
  const r=root.userData.rig as RocantrazRig|undefined;
  if(!r)return;
  const requested=root.userData.previewAnimation as RocantrazAnimation|null;
  const a=requested||mode(action,walking);
  const moving=["walk","stalk","run","charge"].includes(a);
  const running=a==="run"||a==="charge";
  const stalking=a==="stalk";
  const speed=running?2.05:stalking?0.46:0.78;
  const t=time*speed;
  const theta=time*2*Math.PI*speed;
  const amplitude=running?0.56:stalking?0.15:0.35;
  const left=Math.sin(theta),right=Math.sin(theta+Math.PI);
  const lLift=Math.pow(Math.max(0,left),2),rLift=Math.pow(Math.max(0,right),2);
  const strike=Math.pow(Math.max(0,Math.sin(time*2*Math.PI*1.05)),2);
  const dead=a==="die",rest=a==="rest",feeding=a==="feed";
  const roaring=a==="roar",bite=a==="bite",swipe=a==="swipe",defend=a==="defend";
  // One-shot actions develop over time instead of snapping to a static pose.
  const deathProgress=clamp(time/1.45);
  const deathFall=deathProgress*deathProgress*(3-2*deathProgress);
  const roarOpen=clamp(time/0.42)*clamp((2.32-time)/0.38);
  const defensivePulse=Math.sin(Math.min(time,2.4)*Math.PI*0.9);
  const lean=stalking?0.19:a==="charge"?0.29:a==="run"?0.17:0;
  r.body.position.y=dead?-0.64*deathFall:rest?-0.48:stalking?-0.24:
    moving?0.075*Math.cos(theta*2):0.022*Math.sin(time*2.3);
  r.body.rotation.x=dead?0.23*deathFall:rest?0.13:lean;
  r.body.rotation.z=dead?0.73*deathFall:moving?0.031*Math.sin(theta):0;
  r.body.rotation.y=moving?0.020*Math.sin(theta):0.008*Math.sin(time*0.55);
  r.leftLeg.rotation.x=dead?-0.45*deathFall:rest?-0.73:moving?left*amplitude:0;
  r.rightLeg.rotation.x=dead?0.36*deathFall:rest?-0.73:moving?right*amplitude:0;
  r.leftKnee.rotation.x=dead?0.55*deathFall:rest?1.01:moving?0.16+lLift*(running?0.85:0.61):0.08;
  r.rightKnee.rotation.x=dead?0.40*deathFall:rest?1.01:moving?0.16+rLift*(running?0.85:0.61):0.08;
  r.leftFoot.rotation.x=dead?0.19:rest?-0.12:moving?
    -r.leftLeg.rotation.x*0.44-r.leftKnee.rotation.x*0.56:0;
  r.rightFoot.rotation.x=dead?0.19:rest?-0.12:moving?
    -r.rightLeg.rotation.x*0.44-r.rightKnee.rotation.x*0.56:0;
  const armSwing=moving?(stalking?0.06:running?0.30:0.17):0.02;
  r.leftArm.rotation.x=dead?0.46:rest?0.23:swipe?-1.05*strike:
    defend?-0.48:moving?-right*armSwing:-0.15+Math.sin(time*1.2)*0.025;
  r.rightArm.rotation.x=dead?0.40:rest?0.23:swipe?-1.25*(1-strike):
    defend?-0.48:moving?-left*armSwing:-0.15+Math.sin(time*1.2+1)*0.025;
  r.leftArm.rotation.z=dead?-0.10:swipe?-0.32:defend?-0.24:-0.06;
  r.rightArm.rotation.z=dead?0.13:swipe?0.32:defend?0.24:0.06;
  r.leftElbow.rotation.x=dead?0.13:swipe?0.66+strike*0.50:
    defend?-0.15:0.23;
  r.rightElbow.rotation.x=dead?0.13:swipe?0.66+(1-strike)*0.50:
    defend?-0.15:0.23;
  r.leftHand.rotation.x=swipe?-strike*0.22:0.04;
  r.rightHand.rotation.x=swipe?-(1-strike)*0.22:0.04;
  r.neck.rotation.x=roaring?-0.25*roarOpen:bite?0.14+0.24*strike:
    feeding?0.29:stalking?0.03:dead?0.27:
    -Math.sin(time*1.1)*0.018;
  r.head.rotation.x=roaring?-0.23*roarOpen:bite?0.10+strike*0.26:
    feeding?0.35:dead?0.18:rest?0.13:
    moving?-0.04*Math.sin(theta):0.01*Math.sin(time*1.3);
  r.head.position.z=0.40+(bite?0.32*strike:roaring?0.045:0);
  r.head.rotation.y=dead?0.14:0.035*Math.sin(time*0.65);
  r.jaw.rotation.x=roaring?0.87*roarOpen:bite?0.65*(1-strike):
    feeding?0.24*(0.5+0.5*Math.sin(time*11)):
    dead?0.13:0.02;
  // Seven downstream segments delay the root movement like a heavy whip.
  r.tail.forEach((b,i)=>{
    const wave=time*(running?3.4:1.1)-i*0.34;
    b.rotation.y=dead?0.08*Math.sin(i):moving?
      Math.sin(wave)*(running?0.14:0.09):Math.sin(wave)*0.045;
    b.rotation.x=dead?0.13*deathFall:rest?-0.03:
      0.015+Math.sin(time*1.3-i*0.30)*0.026;
    b.rotation.z=moving?Math.sin(theta-i*0.4)*0.025:0;
  });
  // Preserve eye geometry dimensions; eyelid effect by scaling only Y.
  for(const eye of r.eyes)
    eye.scale.y=0.07*(rest?0.26:stalking?0.72:dead?0.14:1);
  // Head/chest expansion for the roar, restrained breathing at idle.
  r.neck.scale.setScalar(roaring?1+roarOpen*(0.025+0.013*Math.sin(time*9)):1);
  if(defend){
    r.body.rotation.x=-0.10+defensivePulse*0.045;
    r.leftFoot.rotation.x=-0.08*defensivePulse;
    r.rightFoot.rotation.x=0.08*defensivePulse;
  }
}
export function rocantrazBones(r:RocantrazRig):Bone[]{
  return [r.body,r.neck,r.head,r.jaw,
    r.leftLeg,r.leftKnee,r.leftFoot,r.rightLeg,r.rightKnee,r.rightFoot,
    r.leftArm,r.leftElbow,r.leftHand,r.rightArm,r.rightElbow,r.rightHand,
    ...r.tail];
}
/** Bake deform-less skeletal transforms as genuine glTF AnimationClips. */
export function rocantrazClips(model:T.Group):T.AnimationClip[]{
  const r=model.userData.rig as RocantrazRig;
  const bones=rocantrazBones(r);
  const previous=model.userData.previewAnimation;
  const clips:T.AnimationClip[]=[];
  for(const animation of ROCANTRAZ_ANIMATIONS){
    const duration=animation==="run"||animation==="charge"?0.49:
      animation==="walk"?1.28:animation==="stalk"?2.1:
      animation==="roar"?2.3:animation==="die"?1.5:2.4;
    const frames=37;
    const times:number[]=[];
    const positions=new Map<string,number[]>();
    const rotations=new Map<string,number[]>();
    const scales=new Map<string,number[]>();
    for(const b of bones){
      positions.set(b.name,[]);
      rotations.set(b.name,[]);
      scales.set(b.name,[]);
    }
    for(let i=0;i<frames;i++){
      const time=duration*i/(frames-1);
      times.push(time);
      model.userData.previewAnimation=animation;
      animateRocantraz(model,time,true,"explorar");
      for(const b of bones){
        const v=b.position,q=b.quaternion,s=b.scale;
        positions.get(b.name)!.push(v.x,v.y,v.z);
        rotations.get(b.name)!.push(q.x,q.y,q.z,q.w);
        scales.get(b.name)!.push(s.x,s.y,s.z);
      }
    }
    const tracks:T.KeyframeTrack[]=[];
    for(const b of bones){
      tracks.push(new T.VectorKeyframeTrack(
        b.name+".position",times,positions.get(b.name)!));
      tracks.push(new T.QuaternionKeyframeTrack(
        b.name+".quaternion",times,rotations.get(b.name)!));
      tracks.push(new T.VectorKeyframeTrack(
        b.name+".scale",times,scales.get(b.name)!));
    }
    clips.push(new T.AnimationClip("Rocantraz_"+animation,duration,tracks));
  }
  model.userData.previewAnimation=previous;
  animateRocantraz(model,0,false,"explorar");
  return clips;
}
