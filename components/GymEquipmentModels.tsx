import { useEffect, useMemo, useRef, type ComponentType, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber/native";
import { MeshStandardMaterial, type Group, type Mesh } from "three";

const METAL_COLOR = "#4b4f58";
const METAL_PROPS = { color: METAL_COLOR, metalness: 0.8, roughness: 0.3 } as const;
const BAR_METAL_PROPS = { color: "#c7cad1", metalness: 0.9, roughness: 0.15 } as const;

const REP_CYCLE_SECONDS = 1.2;
const PARTICLE_POOL_SIZE = 4;
const PARTICLE_LIFETIME_SECONDS = 0.5;
const PARTICLE_RISE_DISTANCE = 0.6;
const PARTICLE_MAX_SCALE = 0.12;
/** +10% animation speed per level above 1 — upgraded machines visibly work faster. */
const SPEED_BONUS_PER_LEVEL = 0.1;

const CASH_GOLD_COLOR = "#FBBF24";
/** No per-machine "generated $X" event exists (income is one global 1s tick
 * in UserContext) — this reuses the same rep-cycle-complete moment the
 * effort particles already trigger on, just with a cash-themed payload. */
const CASH_PARTICLE_LIFETIME_SECONDS = 0.8;
const CASH_RISE_DISTANCE = 0.5;
const CASH_COIN_POOL_SIZE = 2;
const CASH_MICRO_POOL_SIZE = 4;
const CASH_MICRO_BURST_COUNT = 3;
const CASH_COIN_SCALE = 0.13;
const CASH_MICRO_SCALE = 0.055;
const CASH_MICRO_DRIFT_RADIUS = 0.22;

const GEAR_COLOR = "#4ADE80";
const GEAR_SPIN_SPEED = 4;

type EquipmentModelProps = {
  equipmentId: string;
  color: string;
  isTopEarner: boolean;
  level: number;
  occupancyRef: MutableRefObject<Record<string, boolean>>;
};

function getSpeedMultiplier(level: number): number {
  return 1 + (level - 1) * SPEED_BONUS_PER_LEVEL;
}

function getEffectiveRepCycle(level: number): number {
  return REP_CYCLE_SECONDS / getSpeedMultiplier(level);
}

/** A single shared material for a model's "signature" colored parts (weight
 * plates, padding, etc). Mutating one material each frame is far cheaper than
 * juggling a ref per mesh, and keeps every signature part pulsing in sync. */
function useSignatureMaterial(color: string, isTopEarner: boolean) {
  const material = useMemo(
    () => new MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3 }),
    [color]
  );

  useEffect(() => {
    material.emissive.set(isTopEarner ? color : "#000000");
    material.emissiveIntensity = isTopEarner ? 0.4 : 0;
  }, [material, isTopEarner, color]);

  useFrame(({ clock }) => {
    if (!isTopEarner) return;
    const pulse = (Math.sin(clock.elapsedTime * 3) + 1) / 2;
    material.emissiveIntensity = 0.4 + pulse * 1.2;
  });

  return material;
}

type ParticleSlot = { age: number; active: boolean };
type DriftParticleSlot = ParticleSlot & { angle: number };

/** Combines three effects that all key off the same "rep cycle completed
 * while occupied" moment, in one shared useFrame rather than three separate
 * subscriptions per equipment instance:
 *  - the original effort particles (equipment-colored orbs)
 *  - a cash burst (a gold coin + 3 micro-particles) standing in for actual
 *    income generation, which has no per-machine event of its own — income
 *    is a single global 1s tick in UserContext, so this reuses the existing
 *    rep-cycle trigger with a cash-themed payload instead
 *  - a low-poly spinning green status ring, visible only while occupied
 * All pools are small, fixed-size, and pre-allocated once — toggled
 * visible/invisible in place, never mounted/unmounted per rep. */
function MachineActivityFX({
  equipmentId,
  occupancyRef,
  color,
  originY,
  repCycleSeconds,
}: {
  equipmentId: string;
  occupancyRef: MutableRefObject<Record<string, boolean>>;
  color: string;
  originY: number;
  repCycleSeconds: number;
}) {
  const effortSlots = useRef<ParticleSlot[]>(
    Array.from({ length: PARTICLE_POOL_SIZE }, () => ({ age: PARTICLE_LIFETIME_SECONDS, active: false }))
  );
  const effortMeshRefs = useRef<(Mesh | null)[]>([]);

  const coinSlots = useRef<ParticleSlot[]>(
    Array.from({ length: CASH_COIN_POOL_SIZE }, () => ({ age: CASH_PARTICLE_LIFETIME_SECONDS, active: false }))
  );
  const coinMeshRefs = useRef<(Mesh | null)[]>([]);

  const microSlots = useRef<DriftParticleSlot[]>(
    Array.from({ length: CASH_MICRO_POOL_SIZE }, () => ({
      age: CASH_PARTICLE_LIFETIME_SECONDS,
      active: false,
      angle: 0,
    }))
  );
  const microMeshRefs = useRef<(Mesh | null)[]>([]);

  const gearRef = useRef<Mesh>(null);
  const lastRepIndex = useRef(-1);

  useFrame(({ clock }, delta) => {
    const isOccupied = occupancyRef.current[equipmentId] ?? false;

    if (gearRef.current) {
      gearRef.current.visible = isOccupied;
      if (isOccupied) {
        gearRef.current.rotation.z += delta * GEAR_SPIN_SPEED;
      }
    }

    let repJustCompleted = false;
    if (isOccupied) {
      const repIndex = Math.floor(clock.elapsedTime / repCycleSeconds);
      if (repIndex !== lastRepIndex.current) {
        lastRepIndex.current = repIndex;
        repJustCompleted = true;
      }
    }

    if (repJustCompleted) {
      const freeEffort = effortSlots.current.find((slot) => !slot.active) ?? effortSlots.current[0];
      freeEffort.active = true;
      freeEffort.age = 0;

      const freeCoin = coinSlots.current.find((slot) => !slot.active) ?? coinSlots.current[0];
      freeCoin.active = true;
      freeCoin.age = 0;

      let spawned = 0;
      for (const slot of microSlots.current) {
        if (spawned >= CASH_MICRO_BURST_COUNT) break;
        if (!slot.active) {
          slot.active = true;
          slot.age = 0;
          slot.angle = Math.random() * Math.PI * 2;
          spawned++;
        }
      }
    }

    effortSlots.current.forEach((slot, i) => {
      const mesh = effortMeshRefs.current[i];
      if (!mesh) return;

      if (!slot.active) {
        mesh.visible = false;
        return;
      }

      slot.age += delta;
      if (slot.age >= PARTICLE_LIFETIME_SECONDS) {
        slot.active = false;
        mesh.visible = false;
        return;
      }

      const t = slot.age / PARTICLE_LIFETIME_SECONDS;
      mesh.visible = true;
      mesh.position.y = originY + t * PARTICLE_RISE_DISTANCE;
      const scale = (1 - t) * PARTICLE_MAX_SCALE;
      mesh.scale.set(scale, scale, scale);

      const material = mesh.material as MeshStandardMaterial;
      material.opacity = 1 - t;
    });

    coinSlots.current.forEach((slot, i) => {
      const mesh = coinMeshRefs.current[i];
      if (!mesh) return;

      if (!slot.active) {
        mesh.visible = false;
        return;
      }

      slot.age += delta;
      if (slot.age >= CASH_PARTICLE_LIFETIME_SECONDS) {
        slot.active = false;
        mesh.visible = false;
        return;
      }

      const t = slot.age / CASH_PARTICLE_LIFETIME_SECONDS;
      mesh.visible = true;
      mesh.position.y = originY + 0.3 + t * CASH_RISE_DISTANCE;
      const scale = (1 - t * 0.4) * CASH_COIN_SCALE;
      mesh.scale.set(scale, scale, scale);

      const material = mesh.material as MeshStandardMaterial;
      material.opacity = 1 - t;
    });

    microSlots.current.forEach((slot, i) => {
      const mesh = microMeshRefs.current[i];
      if (!mesh) return;

      if (!slot.active) {
        mesh.visible = false;
        return;
      }

      slot.age += delta;
      if (slot.age >= CASH_PARTICLE_LIFETIME_SECONDS) {
        slot.active = false;
        mesh.visible = false;
        return;
      }

      const t = slot.age / CASH_PARTICLE_LIFETIME_SECONDS;
      mesh.visible = true;
      mesh.position.x = Math.cos(slot.angle) * t * CASH_MICRO_DRIFT_RADIUS;
      mesh.position.y = originY + 0.3 + t * CASH_RISE_DISTANCE * 1.2;
      mesh.position.z = Math.sin(slot.angle) * t * CASH_MICRO_DRIFT_RADIUS;
      const scale = (1 - t) * CASH_MICRO_SCALE;
      mesh.scale.set(scale, scale, scale);

      const material = mesh.material as MeshStandardMaterial;
      material.opacity = 1 - t;
    });
  });

  return (
    <>
      {effortSlots.current.map((_, i) => (
        <mesh
          key={`effort-${i}`}
          ref={(el) => {
            effortMeshRefs.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={1.5}
            transparent
            opacity={0}
          />
        </mesh>
      ))}

      {coinSlots.current.map((_, i) => (
        <mesh
          key={`coin-${i}`}
          ref={(el) => {
            coinMeshRefs.current[i] = el;
          }}
          rotation={[Math.PI / 2, 0, 0]}
          visible={false}
        >
          <cylinderGeometry args={[1, 1, 0.25, 12]} />
          <meshStandardMaterial
            color={CASH_GOLD_COLOR}
            emissive={CASH_GOLD_COLOR}
            emissiveIntensity={1.2}
            metalness={0.7}
            roughness={0.25}
            transparent
            opacity={0}
          />
        </mesh>
      ))}

      {microSlots.current.map((_, i) => (
        <mesh
          key={`micro-${i}`}
          ref={(el) => {
            microMeshRefs.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[1, 6, 6]} />
          <meshStandardMaterial
            color={CASH_GOLD_COLOR}
            emissive={CASH_GOLD_COLOR}
            emissiveIntensity={1.5}
            transparent
            opacity={0}
          />
        </mesh>
      ))}

      <mesh ref={gearRef} position={[0, originY + 0.5, 0]} visible={false}>
        <torusGeometry args={[0.14, 0.045, 6, 6]} />
        <meshStandardMaterial
          color={GEAR_COLOR}
          emissive={GEAR_COLOR}
          emissiveIntensity={1}
        />
      </mesh>
    </>
  );
}

/** Structural rack frame holding three pairs of dumbbells along its base. */
function DumbbellRackModel({ equipmentId, color, isTopEarner, level, occupancyRef }: EquipmentModelProps) {
  const discMaterial = useSignatureMaterial(color, isTopEarner);

  return (
    <group>
      <mesh position={[-0.45, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 1.1, 12]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>
      <mesh position={[0.45, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 1.1, 12]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>
      <mesh position={[0, 1.05, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.9, 12]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>

      {[-0.3, 0, 0.3].map((z) => (
        <group key={z} position={[0, 0.17, z]} rotation={[0, 0, Math.PI / 2]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.025, 0.025, 0.3, 8]} />
            <meshStandardMaterial color="#2a2c33" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.17, 0]} material={discMaterial} castShadow>
            <cylinderGeometry args={[0.1, 0.1, 0.08, 16]} />
          </mesh>
          <mesh position={[0, -0.17, 0]} material={discMaterial} castShadow>
            <cylinderGeometry args={[0.1, 0.1, 0.08, 16]} />
          </mesh>
        </group>
      ))}

      <MachineActivityFX
        equipmentId={equipmentId}
        occupancyRef={occupancyRef}
        color={color}
        originY={0.3}
        repCycleSeconds={getEffectiveRepCycle(level)}
      />
    </group>
  );
}

/** Padded bench on metal legs, with support towers holding a barbell that
 * slides up and down while an NPC is using it. */
function BenchPressModel({ equipmentId, color, isTopEarner, level, occupancyRef }: EquipmentModelProps) {
  const signatureMaterial = useSignatureMaterial(color, isTopEarner);
  const barbellRef = useRef<Group>(null);
  const repCycleSeconds = getEffectiveRepCycle(level);

  useFrame(({ clock }) => {
    if (!barbellRef.current) return;
    const isOccupied = occupancyRef.current[equipmentId] ?? false;
    const lift = isOccupied
      ? Math.sin((clock.elapsedTime * (Math.PI * 2)) / repCycleSeconds) * 0.12
      : 0;
    barbellRef.current.position.y = 1.15 + lift;
  });

  const legPositions: [number, number][] = [
    [-0.12, -0.4],
    [0.12, -0.4],
    [-0.12, 0.4],
    [0.12, 0.4],
  ];

  return (
    <group>
      <mesh position={[0, 0.35, 0]} material={signatureMaterial} castShadow>
        <boxGeometry args={[0.35, 0.12, 1.1]} />
      </mesh>

      {legPositions.map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.14, z]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.28, 8]} />
          <meshStandardMaterial {...METAL_PROPS} />
        </mesh>
      ))}

      <mesh position={[0, 0.6, -0.55]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 1.2, 12]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>
      <mesh position={[0, 0.6, 0.55]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 1.2, 12]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>

      <group ref={barbellRef} position={[0, 1.15, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 1.3, 12]} />
          <meshStandardMaterial {...BAR_METAL_PROPS} />
        </mesh>
        <mesh position={[0, 0, -0.6]} rotation={[Math.PI / 2, 0, 0]} material={signatureMaterial} castShadow>
          <cylinderGeometry args={[0.16, 0.16, 0.08, 16]} />
        </mesh>
        <mesh position={[0, 0, 0.6]} rotation={[Math.PI / 2, 0, 0]} material={signatureMaterial} castShadow>
          <cylinderGeometry args={[0.16, 0.16, 0.08, 16]} />
        </mesh>
      </group>

      <MachineActivityFX
        equipmentId={equipmentId}
        occupancyRef={occupancyRef}
        color={color}
        originY={1.15}
        repCycleSeconds={repCycleSeconds}
      />
    </group>
  );
}

/** Open cage of corner posts + cross beams around a central barbell that
 * slides up and down while an NPC is using it. */
function SquatRackModel({ equipmentId, color, isTopEarner, level, occupancyRef }: EquipmentModelProps) {
  const barMaterial = useSignatureMaterial(color, isTopEarner);
  const barbellRef = useRef<Group>(null);
  const repCycleSeconds = getEffectiveRepCycle(level);

  useFrame(({ clock }) => {
    if (!barbellRef.current) return;
    const isOccupied = occupancyRef.current[equipmentId] ?? false;
    const lift = isOccupied
      ? Math.sin((clock.elapsedTime * (Math.PI * 2)) / repCycleSeconds) * 0.1
      : 0;
    barbellRef.current.position.y = 1.1 + lift;
  });

  const postPositions: [number, number][] = [
    [-0.45, -0.45],
    [0.45, -0.45],
    [-0.45, 0.45],
    [0.45, 0.45],
  ];

  return (
    <group>
      {postPositions.map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.9, z]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 1.8, 12]} />
          <meshStandardMaterial {...METAL_PROPS} />
        </mesh>
      ))}

      {[0.3, 1.7].map((y) =>
        [-0.45, 0.45].map((z) => (
          <mesh key={`${y}-${z}`} position={[0, y, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 0.9, 12]} />
            <meshStandardMaterial {...METAL_PROPS} />
          </mesh>
        ))
      )}

      {[-0.45, 0.45].map((x) => (
        <mesh key={x} position={[x, 1.7, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.9, 12]} />
          <meshStandardMaterial {...METAL_PROPS} />
        </mesh>
      ))}

      <group ref={barbellRef} position={[0, 1.1, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={barMaterial} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.8, 12]} />
        </mesh>
      </group>

      <MachineActivityFX
        equipmentId={equipmentId}
        occupancyRef={occupancyRef}
        color={color}
        originY={1.1}
        repCycleSeconds={repCycleSeconds}
      />
    </group>
  );
}

/** Low tilted running belt (vibrates while active), angled console rails,
 * and a small dashboard panel. */
function TreadmillModel({ equipmentId, color, isTopEarner, level, occupancyRef }: EquipmentModelProps) {
  const dashboardMaterial = useSignatureMaterial(color, isTopEarner);
  const beltRef = useRef<Mesh>(null);
  const speedMultiplier = getSpeedMultiplier(level);

  useFrame(({ clock }) => {
    if (!beltRef.current) return;
    const isOccupied = occupancyRef.current[equipmentId] ?? false;
    const vibration = isOccupied ? Math.sin(clock.elapsedTime * 40 * speedMultiplier) * 0.008 : 0;
    beltRef.current.position.y = 0.15 + vibration;
  });

  return (
    <group>
      <mesh ref={beltRef} position={[0, 0.15, 0.1]} rotation={[0.08, 0, 0]} castShadow>
        <boxGeometry args={[0.45, 0.08, 1.3]} />
        <meshStandardMaterial color="#1c1e24" roughness={0.6} metalness={0.1} />
      </mesh>

      <mesh position={[-0.16, 0.55, -0.5]} rotation={[0.55, 0, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.85, 10]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>
      <mesh position={[0.16, 0.55, -0.5]} rotation={[0.55, 0, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.85, 10]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>

      <mesh
        position={[0, 0.95, -0.78]}
        rotation={[0.3, 0, 0]}
        material={dashboardMaterial}
        castShadow
      >
        <boxGeometry args={[0.34, 0.18, 0.05]} />
      </mesh>

      <MachineActivityFX
        equipmentId={equipmentId}
        occupancyRef={occupancyRef}
        color={color}
        originY={0.5}
        repCycleSeconds={getEffectiveRepCycle(level)}
      />
    </group>
  );
}

/** Wide top archway over two slider columns, each with a pulley handle. */
function CableCrossoverTowerModel({ equipmentId, color, isTopEarner, level, occupancyRef }: EquipmentModelProps) {
  const handleMaterial = useSignatureMaterial(color, isTopEarner);

  return (
    <group>
      <mesh position={[-0.6, 1.0, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 2.0, 12]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>
      <mesh position={[0.6, 1.0, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 2.0, 12]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>
      <mesh position={[0, 2.0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 1.3, 12]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>

      <mesh
        position={[-0.6, 0.9, 0.15]}
        rotation={[Math.PI / 2, 0, 0]}
        material={handleMaterial}
        castShadow
      >
        <cylinderGeometry args={[0.03, 0.03, 0.22, 8]} />
      </mesh>
      <mesh
        position={[0.6, 0.9, 0.15]}
        rotation={[Math.PI / 2, 0, 0]}
        material={handleMaterial}
        castShadow
      >
        <cylinderGeometry args={[0.03, 0.03, 0.22, 8]} />
      </mesh>

      <MachineActivityFX
        equipmentId={equipmentId}
        occupancyRef={occupancyRef}
        color={color}
        originY={0.9}
        repCycleSeconds={getEffectiveRepCycle(level)}
      />
    </group>
  );
}

/** Seat + overhead support arm holding a wide handle bar on a thin cable. */
function LatPulldownMachineModel({ equipmentId, color, isTopEarner, level, occupancyRef }: EquipmentModelProps) {
  const handleMaterial = useSignatureMaterial(color, isTopEarner);

  return (
    <group>
      <mesh position={[0, 0.25, 0.3]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.5, 10]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>
      <mesh position={[0, 0.52, 0.3]} castShadow>
        <boxGeometry args={[0.3, 0.08, 0.3]} />
        <meshStandardMaterial color="#2a2c33" roughness={0.7} metalness={0.1} />
      </mesh>

      <mesh position={[0, 1.0, 0.3]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 2.0, 12]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>
      <mesh position={[0, 2.0, -0.1]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.9, 12]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>

      <mesh position={[0, 1.75, -0.45]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.5, 6]} />
        <meshStandardMaterial color="#111318" metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh
        position={[0, 1.5, -0.45]}
        rotation={[0, 0, Math.PI / 2]}
        material={handleMaterial}
        castShadow
      >
        <cylinderGeometry args={[0.03, 0.03, 0.7, 12]} />
      </mesh>

      <MachineActivityFX
        equipmentId={equipmentId}
        occupancyRef={occupancyRef}
        color={color}
        originY={1.5}
        repCycleSeconds={getEffectiveRepCycle(level)}
      />
    </group>
  );
}

// Keyed by the ids in constants/equipment.ts — each model is hand-built for
// one specific catalog entry, not a generic renderer.
const MODELS_BY_EQUIPMENT_ID: Record<string, ComponentType<EquipmentModelProps>> = {
  "rusty-dumbbell-rack": DumbbellRackModel,
  "commercial-bench-press": BenchPressModel,
  "squat-rack": SquatRackModel,
  "cardio-treadmill": TreadmillModel,
  "cable-crossover-tower": CableCrossoverTowerModel,
  "lat-pulldown-machine": LatPulldownMachineModel,
};

type GymEquipmentProps = {
  equipmentId: string;
  color: string;
  isTopEarner: boolean;
  isSelected: boolean;
  level: number;
  occupancyRef: MutableRefObject<Record<string, boolean>>;
};

/** Lv1-4 cool cyan, Lv5-9 electric gold, Lv10+ cyber radiant pink. */
function getTierColor(level: number): string {
  if (level >= 10) return "#F472B6";
  if (level >= 5) return "#FBBF24";
  return "#22D3EE";
}

/** Shared, generic selection indicator — a bright ring at the base, colored
 * by tier — rather than something each hand-built model would implement itself. */
function SelectionRing({ level }: { level: number }) {
  const tierColor = getTierColor(level);
  return (
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.55, 0.68, 32]} />
      <meshBasicMaterial color={tierColor} transparent opacity={0.9} />
    </mesh>
  );
}

export function GymEquipment({
  equipmentId,
  color,
  isTopEarner,
  isSelected,
  level,
  occupancyRef,
}: GymEquipmentProps) {
  const Model = MODELS_BY_EQUIPMENT_ID[equipmentId];
  if (!Model) return null;
  return (
    <>
      <Model
        equipmentId={equipmentId}
        color={color}
        isTopEarner={isTopEarner}
        level={level}
        occupancyRef={occupancyRef}
      />
      {isSelected && <SelectionRing level={level} />}
    </>
  );
}
