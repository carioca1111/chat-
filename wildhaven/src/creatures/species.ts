import type { Species } from "../core/types";
export const SPECIES: Record<
  Species,
  {
    name: string;
    hp: number;
    speed: number;
    damage: number;
    range: number;
    food: number;
    color: number;
    scale: number;
  }
> = {
  cervalho: {
    name: "Cervalho",
    hp: 38,
    speed: 3,
    damage: 3,
    range: 1.7,
    food: 5,
    color: 0xc6a66d,
    scale: 1,
  },
  rasteiro: {
    name: "Rasteiro",
    hp: 32,
    speed: 3.6,
    damage: 5,
    range: 1.5,
    food: 7,
    color: 0xb96944,
    scale: 0.8,
  },
  coroador: {
    name: "Coroador",
    hp: 105,
    speed: 2.8,
    damage: 12,
    range: 2.5,
    food: 16,
    color: 0x526e65,
    scale: 1.75,
  },
};
