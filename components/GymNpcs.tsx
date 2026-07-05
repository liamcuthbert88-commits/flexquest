import { useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber/native";
import type { Group } from "three";
import {
  EQUIPMENT_CATALOG,
  getEquipmentWorldPosition,
  type EquipmentCustomization,
} from "@/constants/equipment";
import { ZONE_LANDMARKS, MAIN_FLOOR_ZONE_ID, SMOOTHIE_BAR_POSITION, LOCKER_POSITION } from "@/constants/zones";

export const NPC_COLORS = ["#F97316", "#22D3EE", "#E879F9"];
/** Fixed, not randomized — an NPC should keep the same name every time it's selected. */
export const NPC_NAMES = ["Gains Goblin", "Rep Reaper", "Cardio Crusher"];

export const WALK_SPEED = 1.2;
const ARRIVAL_THRESHOLD = 0.15;
const WORKOUT_DURATION_SECONDS = 5;
const RECHARGE_DURATION_SECONDS = 2.5;
const ZONE_VISIT_DURATION_SECONDS = 3;
/** Chance an idle NPC wanders to an unlocked zone landmark instead of equipment. */
const ZONE_WANDER_CHANCE = 0.3;

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
};

export function createInitialNpcs(): NpcRuntime[] {
  return NPC_COLORS.map(() => ({
    state: "idle",
    position: [...LOCKER_POSITION],
    target: [...LOCKER_POSITION],
    targetEquipmentId: null,
    stateTimer: 0,
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
 * bonus applies to regular members only). */
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

  useFrame((_, delta) => {
    const npcs = npcRuntimesRef.current;
    for (let i = 0; i < npcs.length; i++) {
      updateNpc(
        npcs[i],
        delta,
        ownedIdsRef.current,
        unlockedZonesRef.current,
        occupancyRef.current,
        speedMultiplierRef.current,
        () => onRechargedRef.current(),
        equipmentCustomizationsRef.current
      );
      const group = groupRefs.current[i];
      if (group) {
        group.position.set(npcs[i].position[0], npcs[i].position[1], npcs[i].position[2]);
      }
    }
  });

  return (
    <>
      {NPC_COLORS.map((color, i) => {
        const isSelected = selectedNpcId === getNpcId(i);
        return (
          <group
            key={color}
            ref={(el) => {
              groupRefs.current[i] = el;
            }}
            position={LOCKER_POSITION}
          >
            <mesh position={[0, 0.5, 0]} castShadow>
              <capsuleGeometry args={[0.18, 0.4, 4, 8]} />
              <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} />
            </mesh>
            <mesh position={[0, 0.95, 0]} castShadow>
              <sphereGeometry args={[0.14, 12, 12]} />
              <meshStandardMaterial color="#e7c9a9" roughness={0.6} metalness={0} />
            </mesh>
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
