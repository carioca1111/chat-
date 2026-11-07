import type { Creature, Vec } from "../core/types";

/**
 * One predator species, two regional ecotypes. These numbers are design
 * targets for Wildhaven, not claims about real-world animals.
 */
export const ROCANTRAZ = {
  id: "rocantraz",
  commonName: "Rocantraz",
  niche: "apex-predator",
  rarity: "very-rare",
  social: "solitary",
  ecology: {
    adultHeightM: [4, 6],
    adultLengthM: [8, 12],
    adultMassKg: [6000, 12000],
    lifespanYears: [60, 100],
    clutchEggs: [1, 3],
    maturityYears: [14, 20],
    territoryKm2: [50, 200],
    diet: ["large herbivores", "medium carnivores", "carrion"],
    role: "controls larger herbivore populations; seasonal carcasses feed scavengers",
  },
  senses: {
    horizontalFovDeg: 270,
    focusedFovDeg: 120,
    visionIsDirectional: true,
    smellKmConceptual: 1.5,
    hearing: "high",
    motionDetection: "excellent",
  },
  speedKmh: {
    walking: [4, 8],
    sustained: [20, 30],
    burst: [40, 55],
    burstSeconds: [4, 7],
  },
  behavior: {
    huntsWhenHungerAbove: 32,
    sightRangeUnits: 44,
    scentRangeUnits: 14,
    stalkUntilUnits: 17,
    patrolRadiusUnits: 48,
    simulatedBurstSpeedUnitsS: 6.6,
    simulatedStalkSpeedUnitsS: 1.25,
    dissuasion: ["roar", "posture", "tail-slam"],
    tactical: ["scan", "stalk", "charge", "bite", "swipe", "feed", "recover"],
    attackOnlyInRangeUnits: 3.8,
    avoidsLongPursuits: true,
  },
  variants: {
    forest: {
      name: "Rocantraz da Floresta",
      habitats: ["tropical-forest", "temperate-forest", "mountain-forest", "mountains"],
      primaryStrategy: "camouflaged ambush between rocks, trees and ledges",
      palette: ["moss green", "limestone gray", "dark charcoal"],
      climateTolerance: "humid / mild / cool highlands",
    },
    desert: {
      name: "Rocantraz das Dunas",
      habitats: ["desert", "rocky-desert", "dry-canyons"],
      primaryStrategy: "ridge scouting, crepuscular tracking and short explosive charge",
      palette: ["sand", "rust", "burnt umber"],
      climateTolerance: "hot dry areas; shelters during peak heat",
    },
  },
} as const;

export function rocantrazSees(
  predator: Pick<Creature, "x" | "z" | "goal">,
  prey: Vec,
): boolean {
  const dx = prey.x - predator.x;
  const dz = prey.z - predator.z;
  const range = Math.hypot(dx, dz);
  if (range < 0.00001) return true;
  if (range <= ROCANTRAZ.behavior.scentRangeUnits) return true;
  if (range > ROCANTRAZ.behavior.sightRangeUnits) return false;
  const vx = predator.goal.x - predator.x;
  const vz = predator.goal.z - predator.z;
  const forward = Math.hypot(vx, vz);
  if (forward < 0.00001) return true; // stationary, turning its head
  const cosAngle = Math.max(-1, Math.min(1, (dx * vx + dz * vz) / (range * forward)));
  return Math.acos(cosAngle) <= ROCANTRAZ.senses.horizontalFovDeg * Math.PI / 360;
}
