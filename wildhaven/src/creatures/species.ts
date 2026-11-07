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
    diet: "herbivore" | "carnivore" | "detritivore";
    habitat: "forest" | "desert" | "snow";
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
    diet: "herbivore",
    habitat: "forest",
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
    diet: "carnivore",
    habitat: "forest",
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
    diet: "carnivore",
    habitat: "forest",
  },
  cascarrumo: {
    name: "Cascarrumo", hp: 9, speed: 1.35, damage: 0, range: 0,
    food: 1, color: 0x66523a, scale: 0.83,
    diet: "detritivore", habitat: "forest",
  },
  dunebrio: {
    name: "Dunébrio", hp: 11, speed: 1.7, damage: 0, range: 0,
    food: 1, color: 0x986443, scale: 0.84,
    diet: "detritivore", habitat: "desert",
  },
  nivelio: {
    name: "Nivélio", hp: 5, speed: 1.8, damage: 0, range: 0,
    food: 1, color: 0x577c8c, scale: 0.67,
    diet: "detritivore", habitat: "snow",
  },
};
