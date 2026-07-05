import { useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber/native";
import type { Group } from "three";
import { EQUIPMENT_CATALOG, getEquipmentWorldPosition } from "@/constants/equipment";
import { ZONE_LANDMARKS, MAIN_FLOOR_ZONE_ID } from "@/constants/zones";
import { lerpAngle, moveToward, SMOOTHIE_BAR_POSITION } from "@/components/GymNpcs";

const CLERK_PACE_RANGE = 0.8;
const CLERK_PACE_SPEED = 0.5;
const TRAINER_RETARGET_INTERVAL_SECONDS = 4;
const IRON_VAULT_CENTER: [number, number, number] = [-15, 0, -10];
const MAIN_FLOOR_LANDMARK: [number, number, number] = [0, 0, 6];
const ROTATION_SMOOTHING_RATE = 6;

type TrainerRuntime = {
  position: [number, number, number];
  target: [number, number, number];
  retargetTimer: number;
  /** Visual-only, same technique as GymNpcs.tsx — visible here thanks to the
   * clipboard prop's asymmetry, unlike a bare capsule. */
  facingAngle: number;
};

type JanitorRuntime = {
  position: [number, number, number];
  target: [number, number, number];
  landmarkIndex: number;
  facingAngle: number;
};

/** Regular capsule+head rig, matching GymNpcs — the role distinction comes
 * from uniform color and (for the Trainer/Janitor) one small prop mesh. */
function StaffBody({ color }: { color: string }) {
  return (
    <>
      <mesh position={[0, 0.5, 0]} castShadow>
        <capsuleGeometry args={[0.18, 0.4, 4, 8]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshStandardMaterial color="#e7c9a9" roughness={0.6} metalness={0} />
      </mesh>
    </>
  );
}

type GymStaffProps = {
  hiredStaffIds: string[];
  unlockedZones: string[];
  occupancyRef: MutableRefObject<Record<string, boolean>>;
};

/** Separate from GymNpcs.tsx — each role's AI is qualitatively different from
 * the regular member work/recharge cycle (no state machine here, just simple
 * role-specific patrols), so it doesn't share that component's state shape. */
export function GymStaff({ hiredStaffIds, unlockedZones, occupancyRef }: GymStaffProps) {
  const clerkGroupRef = useRef<Group>(null);
  const trainerGroupRef = useRef<Group>(null);
  const trainerClipboardRef = useRef<Group>(null);
  const janitorGroupRef = useRef<Group>(null);

  const trainerRuntime = useRef<TrainerRuntime>({
    position: [...IRON_VAULT_CENTER],
    target: [...IRON_VAULT_CENTER],
    retargetTimer: 0,
    facingAngle: 0,
  });
  const janitorRuntime = useRef<JanitorRuntime>({
    position: [...MAIN_FLOOR_LANDMARK],
    target: [...MAIN_FLOOR_LANDMARK],
    landmarkIndex: 0,
    facingAngle: 0,
  });

  const hiredStaffIdsRef = useRef(hiredStaffIds);
  hiredStaffIdsRef.current = hiredStaffIds;
  const unlockedZonesRef = useRef(unlockedZones);
  unlockedZonesRef.current = unlockedZones;

  const isClerkHired = hiredStaffIds.includes("clerk_dan");
  const isTrainerHired = hiredStaffIds.includes("coach_sarah");
  const isJanitorHired = hiredStaffIds.includes("cleaner_bob");

  useFrame(({ clock }, delta) => {
    if (clerkGroupRef.current) {
      const x = SMOOTHIE_BAR_POSITION[0] + Math.sin(clock.elapsedTime * CLERK_PACE_SPEED) * CLERK_PACE_RANGE;
      const z = SMOOTHIE_BAR_POSITION[2] - 0.5;
      clerkGroupRef.current.position.set(x, 0, z);
    }

    if (hiredStaffIdsRef.current.includes("coach_sarah")) {
      const runtime = trainerRuntime.current;
      runtime.retargetTimer += delta;

      if (runtime.retargetTimer >= TRAINER_RETARGET_INTERVAL_SECONDS) {
        runtime.retargetTimer = 0;
        const occupiedVaultEquipment = EQUIPMENT_CATALOG.filter(
          (item) => item.zoneId === "iron_vault" && occupancyRef.current[item.id]
        );
        runtime.target =
          occupiedVaultEquipment.length > 0
            ? getEquipmentWorldPosition(
                occupiedVaultEquipment[Math.floor(Math.random() * occupiedVaultEquipment.length)]
              )
            : IRON_VAULT_CENTER;
      }

      const previousPosition = runtime.position;
      const { position } = moveToward(runtime.position, runtime.target, delta);
      runtime.position = position;

      const dx = position[0] - previousPosition[0];
      const dz = position[2] - previousPosition[2];
      if (Math.sqrt(dx * dx + dz * dz) > 0.001) {
        const targetAngle = Math.atan2(dx, dz);
        runtime.facingAngle = lerpAngle(
          runtime.facingAngle,
          targetAngle,
          1 - Math.exp(-ROTATION_SMOOTHING_RATE * delta)
        );
      }

      if (trainerGroupRef.current) {
        trainerGroupRef.current.position.set(position[0], position[1], position[2]);
        trainerGroupRef.current.rotation.y = runtime.facingAngle;
      }
      if (trainerClipboardRef.current) {
        trainerClipboardRef.current.rotation.z = Math.sin(clock.elapsedTime * 2) * 0.15;
      }
    }

    if (hiredStaffIdsRef.current.includes("cleaner_bob")) {
      const runtime = janitorRuntime.current;
      const landmarks: [number, number, number][] = [
        MAIN_FLOOR_LANDMARK,
        ...unlockedZonesRef.current
          .filter((id) => id !== MAIN_FLOOR_ZONE_ID && ZONE_LANDMARKS[id])
          .map((id) => ZONE_LANDMARKS[id]),
      ];

      const previousPosition = runtime.position;
      const { position, arrived } = moveToward(runtime.position, runtime.target, delta);
      runtime.position = position;
      if (arrived) {
        runtime.landmarkIndex = (runtime.landmarkIndex + 1) % landmarks.length;
        runtime.target = landmarks[runtime.landmarkIndex];
      }

      const dx = position[0] - previousPosition[0];
      const dz = position[2] - previousPosition[2];
      if (Math.sqrt(dx * dx + dz * dz) > 0.001) {
        const targetAngle = Math.atan2(dx, dz);
        runtime.facingAngle = lerpAngle(
          runtime.facingAngle,
          targetAngle,
          1 - Math.exp(-ROTATION_SMOOTHING_RATE * delta)
        );
      }

      if (janitorGroupRef.current) {
        janitorGroupRef.current.position.set(position[0], position[1], position[2]);
        janitorGroupRef.current.rotation.y = runtime.facingAngle;
      }
    }
  });

  return (
    <>
      {isClerkHired && (
        <group ref={clerkGroupRef} position={SMOOTHIE_BAR_POSITION}>
          <StaffBody color="#EF4444" />
        </group>
      )}

      {isTrainerHired && (
        <group ref={trainerGroupRef} position={IRON_VAULT_CENTER}>
          <StaffBody color="#22C55E" />
          <group ref={trainerClipboardRef} position={[0.22, 0.6, 0.12]}>
            <mesh castShadow>
              <boxGeometry args={[0.12, 0.16, 0.02]} />
              <meshStandardMaterial color="#8a6a45" roughness={0.6} metalness={0} />
            </mesh>
          </group>
        </group>
      )}

      {isJanitorHired && (
        <group ref={janitorGroupRef} position={MAIN_FLOOR_LANDMARK}>
          <StaffBody color="#EAB308" />
          <mesh position={[0.15, 0.6, 0]} rotation={[0, 0, 0.3]} castShadow>
            <cylinderGeometry args={[0.015, 0.015, 0.7, 8]} />
            <meshStandardMaterial color="#a8a29e" roughness={0.7} metalness={0.1} />
          </mesh>
        </group>
      )}
    </>
  );
}
