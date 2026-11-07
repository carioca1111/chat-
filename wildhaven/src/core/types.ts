export type Vec = { x: number; z: number };
export type Species = "cervalho" | "rasteiro" | "coroador" | "cascarrumo" | "dunebrio" | "nivelio";
export type Action =
  | "explorar"
  | "pastar"
  | "beber"
  | "descansar"
  | "perseguir"
  | "atacar"
  | "fugir"
  | "migrar"
  | "morto";
export interface Creature extends Vec {
  id: string;
  species: Species;
  hp: number;
  hunger: number;
  thirst: number;
  energy: number;
  state: Action;
  goal: Vec;
  target?: string;
  cooldown: number;
  crossed: number;
}
export interface Stats {
  força: number;
  agilidade: number;
  resistência: number;
  percepção: number;
  inteligência: number;
  coragem: number;
}
export interface Hunter extends Vec {
  id: string;
  name: string;
  origin: string;
  personality: string;
  talent: string;
  limitation: string;
  affinity: string;
  natural: Readonly<Stats>;
  hp: number;
  maxHp: number;
  status:
    | "chegando"
    | "visitante"
    | "contratado"
    | "expedição"
    | "retornando"
    | "recuperando"
    | "recusado";
  phase: string;
  ownerId: string | null;
  equipment: string | null;
  target?: string;
  destination: Vec;
  cooldown: number;
  kills: number;
  haul: number;
  history: string[];
}
export interface Item {
  id: string;
  type: "spear";
  name: string;
  ownerId: string;
  equippedBy: string | null;
  attack: number;
}
export interface World {
  version: 1;
  seed: number;
  rng: number;
  tick: number;
  time: number;
  lastSaved: number;
  creatures: Creature[];
  hunters: Hunter[];
  items: Item[];
  resources: { wood: number; food: number; materials: number; coins: number };
  environment: Record<string, { cutAt: number }>;
  events: { time: number; text: string }[];
  audit: {
    id: string;
    tick: number;
    kind: string;
    entityId: string;
    from: string | null;
    to: string | null;
  }[];
  nextHunter: number;
}
// Future server-only transaction envelope. No local transfer/payment authority.
export interface Listing {
  id: string;
  entityId: string;
  sellerId: string;
  includesEquipment: boolean;
  currency: "DEMO";
  price: number;
  status: "open" | "closed";
  expectedRevision: number;
}
