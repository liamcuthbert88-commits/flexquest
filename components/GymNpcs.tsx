import { useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber/native";
import type { Group } from "three";
import {
  EQUIPMENT_CATALOG,
  getEquipmentWorldPosition,
  type EquipmentCustomization,
} from "@/constants/equipment";
import { ZONE_LANDMARKS, MAIN_FLOOR_ZONE_ID, SMOOTHIE_BAR_POSITION, LOCKER_POSITION } from "@/constants/zones";
import { NpcBody } from "./GymNpcBody";

export const NPC_COLORS = ["#F97316", "#22D3EE", "#E879F9"];
/** Fixed, not randomized — an NPC should keep the same name every time it's selected. */
export const NPC_NAMES = ["Gains Goblin", "Rep Reaper", "Cardio Crusher"];

/** Accent trim (shorts band + shirt-front panel) distinct from each NPC's
 * primary shirt color above — a small curated set of athletic tones (dark
 * track, neon yellow, neon green, navy, heather gray) cycled by index rather
 * than hand-paired 1:1, so the assignment stays correct if the roster ever
 * changes size instead of needing a matching manual entry per NPC. */
const CLOTHING_ACCENT_COLORS = ["#1c1e24", "#facc15", "#4ade80", "#0f172a", "#64748b"];

function getAccentColor(index: number): string {
  return CLOTHING_ACCENT_COLORS[index % CLOTHING_ACCENT_COLORS.length];
}
export const WALK_SPEED = 1.2;
const ARRIVAL_THRESHOLD = 0.15;
const WORKOUT_DURATION_SECONDS = 5;
const RECHARGE_DURATION_SECONDS = 2.5;
const ZONE_VISIT_DURATION_SECONDS = 3;
/** Chance an idle NPC wanders to an unlocked zone landmark instead of equipment. */
const ZONE_WANDER_CHANCE = 0.3;

// --- Visual-only tuning below: locomotion smoothing, facing, idle/exertion
// animation. None of this feeds back into updateNpc's state machine, arrival
// detection, or timers — it only affects how the already-decided logical
// state is rendered. ---
const POSITION_SMOOTHING_RATE = 8;
const ROTATION_SMOOTHING_RATE = 6;
const WALK_BOB_FREQUENCY = 6;
const WALK_BOB_AMPLITUDE = 0.025;
const EXERTION_CYCLE_SECONDS = 0.9;
const EXERTION_BOB_AMPLITUDE = 0.05;
const IDLE_SWAY_FREQUENCY = 0.6;
const IDLE_SWAY_AMPLITUDE = 0.02;
const IDLE_GLANCE_FREQUENCY = 0.35;
const IDLE_GLANCE_AMPLITUDE = 0.35;

type NpcAttachmentOffset = { y: number; z: number };

/** How far an NPC's rendered position sits relative to an owned machine's
 * own base position while working out — matched to each hand-built model's
 * actual seat/handle/belt height (see GymEquipmentModels.tsx) instead of
 * always standing flat on the floor beside it. Visual-only: doesn't touch
 * occupancy, timers, or arrival detection, only where the character appears
 * relative to the (unmoved) equipment position. */
const EQUIPMENT_NPC_OFFSETS: Record<string, NpcAttachmentOffset> = {
  "rusty-dumbbell-rack": { y: 0, z: 0.35 },
  "commercial-bench-press": { y: 0.4, z: 0 },
  "squat-rack": { y: 0, z: 0 },
  "cardio-treadmill": { y: 0.15, z: -0.15 },
  "cable-crossover-tower": { y: 0, z: 0.2 },
  "lat-pulldown-machine": { y: 0.5, z: 0.3 },
};
const DEFAULT_NPC_OFFSET: NpcAttachmentOffset = { y: 0, z: 0 };

function getEquipmentNpcOffset(equipmentId: string | null): NpcAttachmentOffset {
  if (!equipmentId) return DEFAULT_NPC_OFFSET;
  return EQUIPMENT_NPC_OFFSETS[equipmentId] ?? DEFAULT_NPC_OFFSET;
}

export type NpcState =
  | "idle"
  | "walkingToEquipment"
  | "workingOut"
  | "walkingToZone"
  | "atZone"
  | "walkingToBar"
  | "recharging";

export type NpcRuntime = {
  state: NpcState;
  position: [number, number, number];
  target: [number, number, number];
  targetEquipmentId: string | null;
  stateTimer: number;
  /** Everything below is visual-only — read by the render loop, never by
   * updateNpc's state-machine logic. */
  renderPosition: [number, number, number];
  facingAngle: number;
  /** Deterministic per-NPC phase offset (not Math.random(), matching this
   * project's rule against randomness in anything that needs to stay
   * stable) — spreads otherwise-identical looping animations across a
   * couple of seconds so multiple NPCs never bob/sway in perfect unison. */
  animationSeed: number;
};

export function createInitialNpcs(): NpcRuntime[] {
  return NPC_COLORS.map((_, index) => ({
    state: "idle",
    position: [...LOCKER_POSITION],
    target: [...LOCKER_POSITION],
    targetEquipmentId: null,
    stateTimer: 0,
    renderPosition: [...LOCKER_POSITION],
    facingAngle: 0,
    animationSeed: index * 2.39,
  }));
}

export function getNpcId(index: number): string {
  return `npc-${index}`;
}

export function getNpcStateLabel(state: NpcState): string {
  switch (state) {
    case "idle":
      return "Wandering the floor";
    case "walkingToEquipment":
      return "Heading to a machine";
    case "workingOut":
      return "Training";
    case "walkingToZone":
      return "Exploring the facility";
    case "atZone":
      return "Taking in the view";
    case "walkingToBar":
      return "Heading to the Smoothie Bar";
    case "recharging":
      return "Recharging at Smoothie Bar";
  }
}

function pickRandomEquipmentId(ownedIds: string[]): string | null {
  const owned = EQUIPMENT_CATALOG.filter((item) => ownedIds.includes(item.id));
  if (owned.length === 0) return null;
  return owned[Math.floor(Math.random() * owned.length)].id;
}

function pickRandomZoneLandmark(unlockedZones: string[]): [number, number, number] | null {
  const wanderable = unlockedZones.filter((id) => id !== MAIN_FLOOR_ZONE_ID && ZONE_LANDMARKS[id]);
  if (wanderable.length === 0) return null;
  const zoneId = wanderable[Math.floor(Math.random() * wanderable.length)];
  return ZONE_LANDMARKS[zoneId];
}

/** Shared by regular member NPCs and GymStaff.tsx's role-specific patrols so
 * both use identical arrival/step math. `speedMultiplier` defaults to 1 for
 * staff (whose own walk speed isn't affected by the Janitor's bonus — that
 * bonus applies to regular members only). Unchanged by this pass — the
 * logical step/arrival math that drives state transitions and economic
 * timing stays exactly as it was. */
export function moveToward(
  current: [number, number, number],
  target: [number, number, number],
  delta: number,
  speedMultiplier = 1
): { position: [number, number, number]; arrived: boolean } {
  const dx = target[0] - current[0];
  const dz = target[2] - current[2];
  const distance = Math.sqrt(dx * dx + dz * dz);

  if (distance <= ARRIVAL_THRESHOLD) {
    return { position: target, arrived: true };
  }

  const step = Math.min(WALK_SPEED * speedMultiplier * delta, distance);
  return {
    position: [current[0] + (dx / distance) * step, current[1], current[2] + (dz / distance) * step],
    arrived: false,
  };
}

/** Shortest-path angle interpolation (handles the -π/π wraparound so a
 * character never spins the long way around) — exported so GymStaff.tsx's
 * Trainer/Janitor can use the same turning smoothness. */
export function lerpAngle(current: number, target: number, factor: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * factor;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeInQuad(t: number): number {
  return t * t;
}

/** Per-state idle/walk/exertion animation, purely additive on top of the
 * smoothed render position — never touches the logical position. Walking
 * gets a light footstep-like bob; working out gets an asymmetric "fast
 * push, slower controlled return" shape instead of a symmetric sine, per the
 * requested exertion-phase feel; waiting states get a slow lateral weight
 * shift instead of a vertical bob, so each state reads visually distinct. */
function getBobOffset(
  state: NpcState,
  animationSeed: number,
  elapsedTime: number
): { x: number; y: number } {
  const t = elapsedTime + animationSeed;

  switch (state) {
    case "walkingToEquipment":
    case "walkingToZone":
    case "walkingToBar":
      return { x: 0, y: Math.abs(Math.sin(t * WALK_BOB_FREQUENCY)) * WALK_BOB_AMPLITUDE };
    case "workingOut": {
      const cyclePosition = (t % EXERTION_CYCLE_SECONDS) / EXERTION_CYCLE_SECONDS;
      const shaped =
        cyclePosition < 0.3
          ? easeOutQuad(cyclePosition / 0.3)
          : 1 - easeInQuad((cyclePosition - 0.3) / 0.7);
      return { x: 0, y: shaped * EXERTION_BOB_AMPLITUDE };
    }
    case "idle":
    case "atZone":
    case "recharging":
      return { x: Math.sin(t * IDLE_SWAY_FREQUENCY) * IDLE_SWAY_AMPLITUDE, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

/** A small idle "glancing around" rotation layered on top of the frozen
 * facing angle while waiting — only visible because of the shirt-front
 * accent panel below (a bare capsule+sphere has no asymmetry to show
 * rotation at all, which is also why regular walking/turning needed the
 * facing-angle system to be paired with that panel in the first place). */
function getIdleGlanceOffset(state: NpcState, animationSeed: number, elapsedTime: number): number {
  if (state !== "idle" && state !== "atZone" && state !== "recharging") return 0;
  return Math.sin((elapsedTime + animationSeed) * IDLE_GLANCE_FREQUENCY) * IDLE_GLANCE_AMPLITUDE;
}

function updateNpc(
  npc: NpcRuntime,
  delta: number,
  ownedIds: string[],
  unlockedZones: string[],
  occupancy: Record<string, boolean>,
  speedMultiplier: number,
  onRecharged: () => void,
  equipmentCustomizations: Record<string, EquipmentCustomization>
) {
  // Defensive: a prestige reset can clear owned equipment out from under an
  // NPC that's mid-workout or mid-walk toward it. Send them home instead of
  // walking to/lingering at equipment that no longer exists.
  if (
    (npc.state === "walkingToEquipment" || npc.state === "workingOut") &&
    npc.targetEquipmentId &&
    !ownedIds.includes(npc.targetEquipmentId)
  ) {
    occupancy[npc.targetEquipmentId] = false;
    npc.targetEquipmentId = null;
    npc.state = "idle";
  }

  switch (npc.state) {
    case "idle": {
      if (Math.random() < ZONE_WANDER_CHANCE) {
        const landmark = pickRandomZoneLandmark(unlockedZones);
        if (landmark) {
          npc.target = landmark;
          npc.state = "walkingToZone";
          break;
        }
      }

      const equipmentId = pickRandomEquipmentId(ownedIds);
      if (!equipmentId) break;
      const equipment = EQUIPMENT_CATALOG.find((item) => item.id === equipmentId);
      if (!equipment) break;

      npc.targetEquipmentId = equipmentId;
      npc.target = getEquipmentWorldPosition(equipment, equipmentCustomizations);
      npc.state = "walkingToEquipment";
      break;
    }
    case "walkingToEquipment": {
      const { position, arrived } = moveToward(npc.position, npc.target, delta, speedMultiplier);
      npc.position = position;
      if (arrived) {
        npc.state = "workingOut";
        npc.stateTimer = 0;
        if (npc.targetEquipmentId) {
          occupancy[npc.targetEquipmentId] = true;
        }
      }
      break;
    }
    case "workingOut": {
      npc.stateTimer += delta;
      if (npc.stateTimer >= WORKOUT_DURATION_SECONDS) {
        if (npc.targetEquipmentId) {
          occupancy[npc.targetEquipmentId] = false;
        }
        npc.target = SMOOTHIE_BAR_POSITION;
        npc.state = "walkingToBar";
      }
      break;
    }
    case "walkingToZone": {
      const { position, arrived } = moveToward(npc.position, npc.target, delta, speedMultiplier);
      npc.position = position;
      if (arrived) {
        npc.state = "atZone";
        npc.stateTimer = 0;
      }
      break;
    }
    case "atZone": {
      npc.stateTimer += delta;
      if (npc.stateTimer >= ZONE_VISIT_DURATION_SECONDS) {
        npc.state = "idle";
      }
      break;
    }
    case "walkingToBar": {
      const { position, arrived } = moveToward(npc.position, npc.target, delta, speedMultiplier);
      npc.position = position;
      if (arrived) {
        npc.state = "recharging";
        npc.stateTimer = 0;
      }
      break;
    }
    case "recharging": {
      npc.stateTimer += delta;
      if (npc.stateTimer >= RECHARGE_DURATION_SECONDS) {
        npc.state = "idle";
        onRecharged();
      }
      break;
    }
  }
}

type GymNpcsProps = {
  npcRuntimesRef: MutableRefObject<NpcRuntime[]>;
  ownedEquipmentIds: string[];
  unlockedZones: string[];
  occupancyRef: MutableRefObject<Record<string, boolean>>;
  selectedNpcId: string | null;
  /** 1.05 when the Janitor is hired, else 1 — his ambient bonus applies to
   * regular members, not to his own patrol speed. */
  speedMultiplier: number;
  /** Fired once per NPC each time it finishes a recharge cycle at the bar —
   * a discrete event, not a per-frame callback. */
  onRecharged: () => void;
  equipmentCustomizations: Record<string, EquipmentCustomization>;
};

export function GymNpcs({
  npcRuntimesRef,
  ownedEquipmentIds,
  unlockedZones,
  occupancyRef,
  selectedNpcId,
  speedMultiplier,
  onRecharged,
  equipmentCustomizations,
}: GymNpcsProps) {
  const groupRefs = useRef<(Group | null)[]>([]);
  const ownedIdsRef = useRef(ownedEquipmentIds);
  ownedIdsRef.current = ownedEquipmentIds;
  const unlockedZonesRef = useRef(unlockedZones);
  unlockedZonesRef.current = unlockedZones;
  const speedMultiplierRef = useRef(speedMultiplier);
  speedMultiplierRef.current = speedMultiplier;
  const onRechargedRef = useRef(onRecharged);
  onRechargedRef.current = onRecharged;
  const equipmentCustomizationsRef = useRef(equipmentCustomizations);
  equipmentCustomizationsRef.current = equipmentCustomizations;

  useFrame(({ clock }, delta) => {
    const npcs = npcRuntimesRef.current;
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      const previousPosition = npc.position;

      updateNpc(
        npc,
        delta,
        ownedIdsRef.current,
        unlockedZonesRef.current,
        occupancyRef.current,
        speedMultiplierRef.current,
        () => onRechargedRef.current(),
        equipmentCustomizationsRef.current
      );

      // --- Visual-only from here: smoothing, facing, idle/exertion animation ---
      const attachmentOffset =
        npc.state === "workingOut" ? getEquipmentNpcOffset(npc.targetEquipmentId) : DEFAULT_NPC_OFFSET;
      const targetX = npc.position[0];
      const targetY = npc.position[1] + attachmentOffset.y;
      const targetZ = npc.position[2] + attachmentOffset.z;

      const followFactor = 1 - Math.exp(-POSITION_SMOOTHING_RATE * delta);
      npc.renderPosition = [
        npc.renderPosition[0] + (targetX - npc.renderPosition[0]) * followFactor,
        npc.renderPosition[1] + (targetY - npc.renderPosition[1]) * followFactor,
        npc.renderPosition[2] + (targetZ - npc.renderPosition[2]) * followFactor,
      ];

      const dx = npc.position[0] - previousPosition[0];
      const dz = npc.position[2] - previousPosition[2];
      if (Math.sqrt(dx * dx + dz * dz) > 0.001) {
        const targetAngle = Math.atan2(dx, dz);
        const rotationFactor = 1 - Math.exp(-ROTATION_SMOOTHING_RATE * delta);
        npc.facingAngle = lerpAngle(npc.facingAngle, targetAngle, rotationFactor);
      }

      const bob = getBobOffset(npc.state, npc.animationSeed, clock.elapsedTime);
      const idleGlance = getIdleGlanceOffset(npc.state, npc.animationSeed, clock.elapsedTime);

      const group = groupRefs.current[i];
      if (group) {
        group.position.set(
          npc.renderPosition[0] + bob.x,
          npc.renderPosition[1] + bob.y,
          npc.renderPosition[2]
        );
        group.rotation.y = npc.facingAngle + idleGlance;
      }
    }
  });

  return (
    <>
      {NPC_COLORS.map((color, i) => {
        const isSelected = selectedNpcId === getNpcId(i);
        const accentColor = getAccentColor(i);
        return (
          <group
            key={color}
            ref={(el) => {
              groupRefs.current[i] = el;
            }}
            position={LOCKER_POSITION}
          >
            <NpcBody npc={npcRuntimesRef.current[i]} shirtColor={color} accentColor={accentColor} />
            {isSelected && (
              <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.28, 0.36, 24]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}
