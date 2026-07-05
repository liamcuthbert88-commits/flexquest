import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import { Canvas, useFrame } from "@react-three/fiber/native";
import { AdditiveBlending, Color, InstancedMesh, Object3D, PerspectiveCamera, Vector3 } from "three";

import { colors, radius } from "@/constants/theme";
import { EQUIPMENT_CATALOG, getEquipmentWorldPosition } from "@/constants/equipment";
import { MAIN_FLOOR_ZONE_ID } from "@/constants/zones";
import { SMOOTHIE_BAR_RECHARGE_CASH, CLERK_RECHARGE_MULTIPLIER, JANITOR_SPEED_MULTIPLIER } from "@/constants/staff";
import { useUser } from "@/contexts/UserContext";
import { GymEquipment } from "@/components/GymEquipmentModels";
import { GymBackdrop } from "@/components/GymBackdrop";
import {
  GymNpcs,
  createInitialNpcs,
  getNpcId,
  getNpcStateLabel,
  NPC_NAMES,
  type NpcRuntime,
} from "@/components/GymNpcs";
import { GymStaff } from "@/components/GymStaff";
import { GymDecor } from "@/components/GymDecor";

type LocationMood = {
  ambientColor: string;
  ambientIntensity: number;
  directionalColor: string;
  directionalIntensity: number;
  backgroundColor: string;
  windowColor: string;
};

/** Ambient lighting mood per location tier — ties the visual atmosphere to
 * prestige progression instead of a real-world day/night clock, since that
 * would be invisible to whoever's testing right now regardless of when they
 * play. Keyed by constants/locations.ts ids, with `garage`'s mood doubling as
 * the fallback for any unrecognized id.
 *
 * `directionalIntensity` here is deliberately lower than it was before the
 * overhead LED wash light was added below — stacking this angled "key" light
 * at its original intensity on top of a bright overhead wash would blow out
 * highlights on lighter equipment materials. This light now mostly supplies
 * the location's color mood and shadow shape; the overhead light supplies
 * the actual brightness. */
const LOCATION_MOODS: Record<string, LocationMood> = {
  garage: {
    ambientColor: "#4b4f66",
    ambientIntensity: 0.4,
    directionalColor: "#aab0c8",
    directionalIntensity: 0.6,
    backgroundColor: "#101114",
    windowColor: "#8fa0c8",
  },
  warehouse: {
    ambientColor: "#6b5a46",
    ambientIntensity: 0.55,
    directionalColor: "#ffdca8",
    directionalIntensity: 0.75,
    backgroundColor: "#151009",
    windowColor: "#ffcf8a",
  },
  plaza: {
    ambientColor: "#7a4fae",
    ambientIntensity: 0.7,
    directionalColor: "#ffdcf7",
    directionalIntensity: 0.9,
    backgroundColor: "#160b1c",
    windowColor: "#f6a8ff",
  },
};

function getLocationMood(locationId: string): LocationMood {
  return LOCATION_MOODS[locationId] ?? LOCATION_MOODS.garage;
}

const BASE_ORBIT_RADIUS = 9;
const ORBIT_RADIUS_PER_ZONE = 3;
const RADIUS_EASE_SPEED = 1.5;
const ROTATE_SPEED = 0.005;
const MIN_POLAR = 0.2;
const MAX_POLAR = Math.PI / 2 - 0.05;
const NEON_COLOR = "#8B5CF6";
const CARDIO_BLUE = "#38BDF8";
const OVERHEAD_WASH_COLOR = "#f8f9fa";
const LED_FIXTURE_COLOR = "#ffffff";

const MIN_ZOOM_OFFSET = -4;
const MAX_ZOOM_OFFSET = 6;
const PINCH_ZOOM_SPEED = 0.02;
const TAP_MAX_DISTANCE_PX = 10;
const TAP_MAX_DURATION_MS = 300;
const HIT_RADIUS_PX = 44;
const CAMERA_FOV = 50;

const FLOOR_SIZE = 20;
const TILES_PER_SIDE = 8;
const TILE_SIZE = FLOOR_SIZE / TILES_PER_SIDE;
const TILE_SEAM_GAP = 0.06;

const MAIN_FLOOR_HALF_SIZE = FLOOR_SIZE / 2;
const WALL_HEIGHT = 4;
const WALL_THICKNESS = 0.3;
const WALL_INSET_FROM_NEON = 0.3;
const PILLAR_SIZE = 0.4;
const WALL_COLOR = "#2a2a2e";
const PILLAR_COLOR = "#1e1e24";

export type PlayAreaBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** The enclosing shell has to grow with the facility instead of staying
 * fixed at the 20x20 main floor — Cardio Deck ([15,0,0], 10x20) and Iron
 * Vault ([-15,0,-10], 10x10) both extend well past that boundary once
 * unlocked, and a fixed-size box would either occlude them behind a wall or
 * need to ignore them. This mirrors the same `unlockedZones`-driven growth
 * the camera's orbit radius already does. */
function getPlayAreaBounds(unlockedZones: string[]): PlayAreaBounds {
  let minX = -MAIN_FLOOR_HALF_SIZE;
  let maxX = MAIN_FLOOR_HALF_SIZE;
  let minZ = -MAIN_FLOOR_HALF_SIZE;
  let maxZ = MAIN_FLOOR_HALF_SIZE;

  if (unlockedZones.includes("cardio_deck")) {
    maxX = 20;
  }
  if (unlockedZones.includes("iron_vault")) {
    minX = Math.min(minX, -20);
    minZ = Math.min(minZ, -15);
  }

  return { minX, maxX, minZ, maxZ };
}

export type NpcSnapshot = {
  name: string;
  stateLabel: string;
  stateTimerSeconds: number;
};

export type Selection =
  | { type: "equipment"; id: string }
  | { type: "npc"; id: string; getSnapshot: () => NpcSnapshot };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getTouchDistance(touches: { pageX: number; pageY: number }[]): number {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Projects a world position to screen pixel coordinates, replicating the
 * camera's own spherical position rather than reaching into the live Three.js
 * scene from outside the Canvas — self-contained, no dependency on R3F's
 * internal event/raycasting system (which we deliberately avoid; see below). */
function worldToScreen(
  worldPos: [number, number, number],
  azimuth: number,
  polar: number,
  orbitRadius: number,
  viewWidth: number,
  viewHeight: number
): { x: number; y: number } | null {
  if (viewWidth <= 0 || viewHeight <= 0) return null;

  const camera = new PerspectiveCamera(CAMERA_FOV, viewWidth / viewHeight, 0.1, 1000);
  camera.position.set(
    orbitRadius * Math.sin(polar) * Math.sin(azimuth),
    orbitRadius * Math.cos(polar),
    orbitRadius * Math.sin(polar) * Math.cos(azimuth)
  );
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const vector = new Vector3(worldPos[0], worldPos[1], worldPos[2]);
  vector.project(camera);

  if (vector.z > 1) return null;

  return {
    x: ((vector.x + 1) / 2) * viewWidth,
    y: ((1 - vector.y) / 2) * viewHeight,
  };
}

function findClosestSelection(
  tapX: number,
  tapY: number,
  ownedEquipment: typeof EQUIPMENT_CATALOG,
  npcRuntimes: NpcRuntime[],
  azimuth: number,
  polar: number,
  orbitRadius: number,
  viewWidth: number,
  viewHeight: number
): Selection | null {
  let best: Selection | null = null;
  let bestDistance = HIT_RADIUS_PX;

  for (const item of ownedEquipment) {
    const worldPos = getEquipmentWorldPosition(item);
    const screenPos = worldToScreen(
      [worldPos[0], 0.8, worldPos[2]],
      azimuth,
      polar,
      orbitRadius,
      viewWidth,
      viewHeight
    );
    if (!screenPos) continue;
    const distance = Math.hypot(screenPos.x - tapX, screenPos.y - tapY);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { type: "equipment", id: item.id };
    }
  }

  npcRuntimes.forEach((npc, index) => {
    const screenPos = worldToScreen(
      [npc.position[0], 0.6, npc.position[2]],
      azimuth,
      polar,
      orbitRadius,
      viewWidth,
      viewHeight
    );
    if (!screenPos) return;
    const distance = Math.hypot(screenPos.x - tapX, screenPos.y - tapY);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = {
        type: "npc",
        id: getNpcId(index),
        getSnapshot: () => ({
          name: NPC_NAMES[index],
          stateLabel: getNpcStateLabel(npc.state),
          stateTimerSeconds: npc.stateTimer,
        }),
      };
    }
  });

  return best;
}

type CameraRigProps = {
  azimuthRef: MutableRefObject<number>;
  polarRef: MutableRefObject<number>;
  targetRadius: number;
  currentRadiusRef: MutableRefObject<number>;
  zoomOffsetRef: MutableRefObject<number>;
};

/** Orbits the camera, easing its zone-driven base distance toward
 * `targetRadius` rather than snapping (so unlocking a zone reads as pulling
 * back to reveal it), while pinch-zoom is applied directly on top with no lag,
 * since that's active real-time manipulation and should track fingers exactly. */
function CameraRig({ azimuthRef, polarRef, targetRadius, currentRadiusRef, zoomOffsetRef }: CameraRigProps) {
  useFrame(({ camera }, delta) => {
    currentRadiusRef.current +=
      (targetRadius - currentRadiusRef.current) * Math.min(1, delta * RADIUS_EASE_SPEED);

    const azimuth = azimuthRef.current;
    const polar = polarRef.current;
    const orbitRadius = currentRadiusRef.current + zoomOffsetRef.current;

    camera.position.x = orbitRadius * Math.sin(polar) * Math.sin(azimuth);
    camera.position.y = orbitRadius * Math.cos(polar);
    camera.position.z = orbitRadius * Math.sin(polar) * Math.cos(azimuth);
    camera.lookAt(0, 0, 0);
  });

  return null;
}

/** Commercial rubber interlocking floor tiles — built from real geometry
 * rather than an image texture, since this project has no texture assets
 * anywhere and generating one at runtime would need a canvas-like drawing
 * surface that isn't reliably available in RN's native (non-web) runtime.
 * Uses a single InstancedMesh so all 64 tiles cost one draw call regardless
 * of count, with a small per-tile shade variation (deterministic from its
 * grid index, not per-frame random) and a visible gap between tiles for the
 * interlocking-seam look. gridHelper's divisions are set to match TILES_PER_SIDE
 * so its lines land exactly on the tile seams instead of crossing them. */
function TiledFloor() {
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    let index = 0;
    for (let row = 0; row < TILES_PER_SIDE; row++) {
      for (let col = 0; col < TILES_PER_SIDE; col++) {
        const x = (col - (TILES_PER_SIDE - 1) / 2) * TILE_SIZE;
        const z = (row - (TILES_PER_SIDE - 1) / 2) * TILE_SIZE;
        dummy.position.set(x, 0, z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);

        const shade = 0.16 + ((row * 7 + col * 3) % 5) * 0.012;
        mesh.setColorAt(index, new Color(shade, shade, shade + 0.008));
        index++;
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [dummy]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, TILES_PER_SIDE * TILES_PER_SIDE]}
      receiveShadow
    >
      <planeGeometry args={[TILE_SIZE - TILE_SEAM_GAP, TILE_SIZE - TILE_SEAM_GAP]} />
      <meshStandardMaterial roughness={0.4} metalness={0.35} />
    </instancedMesh>
  );
}

/** Fakes bloom on an emissive strip — there's no post-processing pipeline
 * available here (that ecosystem targets DOM/web canvases, not RN's native GL
 * backend), so a soft, additively-blended, oversized duplicate behind the
 * real strip is the cheap substitute. `depthWrite={false}` keeps it from
 * fighting the real strip's z-buffer at near-identical depth. */
function GlowLayer({
  position,
  size,
  color,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={[size[0] * 1.8, size[1] * 3, size[2] * 3]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.25}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Purely visual — bright emissive fixture meshes, not real light sources.
 * The actual illumination comes from the overhead directionalLight in
 * GymFloorScene; adding a real light per fixture here would mean several more
 * shadow-casting/lit sources, which this project has consistently avoided for
 * mobile RAM/perf reasons (see the shared-material and particle-pool patterns
 * elsewhere). Three parallel rows running the depth of the main floor,
 * mirroring a real commercial gym's ceiling grid. */
function OverheadLedArray() {
  const rows: number[] = [-6, 0, 6];
  const fixtureSize: [number, number, number] = [0.4, 0.12, 16];

  return (
    <>
      {rows.map((x) => (
        <mesh key={x} position={[x, 6, 0]}>
          <boxGeometry args={fixtureSize} />
          <meshStandardMaterial
            color={LED_FIXTURE_COLOR}
            emissive={LED_FIXTURE_COLOR}
            emissiveIntensity={2}
          />
        </mesh>
      ))}
      {rows.map((x) => (
        <GlowLayer key={`glow-${x}`} position={[x, 6, 0]} size={fixtureSize} color={LED_FIXTURE_COLOR} />
      ))}
    </>
  );
}

/** Static neon tube glow tracing the floor's perimeter — inset from the
 * enclosing walls (rather than sitting flush/coincident with them) so it
 * reads as trim molding at the wall's base, not a shape colliding with it.
 * Its bounds always match GymWalls' current bounds, so the trim keeps
 * framing the room correctly as the shell grows with unlocked zones. */
function NeonPerimeter({ bounds }: { bounds: PlayAreaBounds }) {
  const innerMinX = bounds.minX + WALL_INSET_FROM_NEON;
  const innerMaxX = bounds.maxX - WALL_INSET_FROM_NEON;
  const innerMinZ = bounds.minZ + WALL_INSET_FROM_NEON;
  const innerMaxZ = bounds.maxZ - WALL_INSET_FROM_NEON;
  const width = innerMaxX - innerMinX;
  const depth = innerMaxZ - innerMinZ;
  const centerX = (innerMinX + innerMaxX) / 2;
  const centerZ = (innerMinZ + innerMaxZ) / 2;

  const strips: { position: [number, number, number]; size: [number, number, number] }[] = [
    { position: [centerX, 0.05, innerMinZ], size: [width, 0.06, 0.12] },
    { position: [centerX, 0.05, innerMaxZ], size: [width, 0.06, 0.12] },
    { position: [innerMinX, 0.05, centerZ], size: [0.12, 0.06, depth] },
    { position: [innerMaxX, 0.05, centerZ], size: [0.12, 0.06, depth] },
  ];

  return (
    <>
      {strips.map((strip, i) => (
        <mesh key={i} position={strip.position}>
          <boxGeometry args={strip.size} />
          <meshStandardMaterial color={NEON_COLOR} emissive={NEON_COLOR} emissiveIntensity={1.5} />
        </mesh>
      ))}
      {strips.map((strip, i) => (
        <GlowLayer key={`glow-${i}`} position={strip.position} size={strip.size} color={NEON_COLOR} />
      ))}
    </>
  );
}

/** The enclosing shell itself — 4 walls sized to `bounds` (see
 * getPlayAreaBounds) plus corner pillars for structural mass. Kept
 * deliberately low (WALL_HEIGHT=4, well under the LED array at y=6) and
 * open-topped: the camera orbits from outside/above this boundary at a
 * radius that grows in step with it, and a taller or roofed shell would risk
 * clipping the camera's view at shallow polar angles, or blocking the
 * top-down view the whole game is built around. */
function GymWalls({ bounds }: { bounds: PlayAreaBounds }) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const wallY = WALL_HEIGHT / 2;

  const corners: [number, number][] = [
    [minX, minZ],
    [maxX, minZ],
    [minX, maxZ],
    [maxX, maxZ],
  ];

  return (
    <group>
      <mesh position={[centerX, wallY, minZ]} castShadow receiveShadow>
        <boxGeometry args={[width + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh position={[centerX, wallY, maxZ]} castShadow receiveShadow>
        <boxGeometry args={[width + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh position={[minX, wallY, centerZ]} castShadow receiveShadow>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, depth + WALL_THICKNESS]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh position={[maxX, wallY, centerZ]} castShadow receiveShadow>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, depth + WALL_THICKNESS]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.85} metalness={0.05} />
      </mesh>

      {corners.map(([x, z], i) => (
        <mesh key={i} position={[x, wallY, z]} castShadow>
          <boxGeometry args={[PILLAR_SIZE, WALL_HEIGHT + 0.3, PILLAR_SIZE]} />
          <meshStandardMaterial color={PILLAR_COLOR} roughness={0.7} metalness={0.15} />
        </mesh>
      ))}
    </group>
  );
}

/** Smoothie Bar counter + stools — always present, not tied to any purchase. */
function SmoothieBar() {
  return (
    <group position={[-6, 0, -6]}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.9, 0.6]} />
        <meshStandardMaterial color="#e8ddc7" roughness={0.25} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.92, 0]} castShadow>
        <boxGeometry args={[1.7, 0.06, 0.7]} />
        <meshStandardMaterial color="#3d2b1f" roughness={0.4} metalness={0.1} />
      </mesh>
      {[-0.6, 0.6].map((x) => (
        <mesh key={x} position={[x, 0.3, 0.7]} castShadow>
          <cylinderGeometry args={[0.18, 0.15, 0.6, 16]} />
          <meshStandardMaterial color="#2a2c33" roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/** Locker Room Door Block — a fixed environmental landmark, not purchasable. */
function LockerRoomDoor() {
  return (
    <group position={[6, 0, -6]}>
      <mesh position={[0, 1.0, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 2.0, 0.15]} />
        <meshStandardMaterial color="#2f323b" roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 1.0, 0.08]} castShadow>
        <boxGeometry args={[0.85, 1.7, 0.03]} />
        <meshStandardMaterial color="#3a3d47" roughness={0.4} metalness={0.25} />
      </mesh>
      <mesh position={[0.32, 1.0, 0.12]} castShadow>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshStandardMaterial color="#c7cad1" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

/** Cardio Deck — a raised wood-panel platform extending off the right side,
 * with a thin neon-blue under-glow strip along its base. */
function CardioDeckZone() {
  return (
    <group position={[15, 0, 0]}>
      <mesh position={[0, 0.3, 0]} receiveShadow>
        <boxGeometry args={[10, 0.2, 20]} />
        <meshStandardMaterial color="#8a6a45" roughness={0.5} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[10.1, 0.05, 20.1]} />
        <meshStandardMaterial color={CARDIO_BLUE} emissive={CARDIO_BLUE} emissiveIntensity={1.5} />
      </mesh>
      <GlowLayer position={[0, 0.18, 0]} size={[10.1, 0.05, 20.1]} color={CARDIO_BLUE} />
    </group>
  );
}

/** Iron Vault — a ground-level concrete section enclosed by wireframe
 * "chain-link" panels (a subdivided plane rendered with wireframe:true gives
 * a diamond-grid look without needing a real texture asset). */
function IronVaultZone() {
  // Positions are local to this group (already translated to the vault's
  // world position below) — an "open" cage, so only the back + left sides
  // are fenced, matching the squat rack's own open-cage look.
  const fencePositions: { position: [number, number, number]; rotation: [number, number, number] }[] = [
    { position: [0, 1, -5], rotation: [0, 0, 0] },
    { position: [-5, 1, 0], rotation: [0, Math.PI / 2, 0] },
  ];

  return (
    <group position={[-15, 0, -10]}>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[10, 0.04, 10]} />
        <meshStandardMaterial color="#3a3a3d" roughness={0.9} metalness={0.05} />
      </mesh>

      {fencePositions.map((fence, i) => (
        <mesh key={i} position={fence.position} rotation={fence.rotation}>
          <planeGeometry args={[10, 2, 10, 4]} />
          <meshStandardMaterial color="#9aa0ac" wireframe />
        </mesh>
      ))}
    </group>
  );
}

/** Shadow-casting spotlight aimed straight down at one piece of equipment. */
function EquipmentSpotlight({ position }: { position: [number, number, number] }) {
  return (
    <spotLight
      position={[position[0], 4, position[2]]}
      target-position={position}
      angle={0.4}
      penumbra={0.5}
      intensity={2}
      castShadow
    />
  );
}

type GymFloorSceneProps = {
  onSelect?: (selection: Selection | null) => void;
};

function GymFloorScene({ onSelect }: GymFloorSceneProps) {
  const { purchasedEquipmentIds, unlockedZones, equipmentLevels, hiredStaffIds, addCash, currentLocationId, prestigeCount } =
    useUser();

  const ownedEquipment = EQUIPMENT_CATALOG.filter((item) =>
    purchasedEquipmentIds.includes(item.id)
  );
  const maxCashPerSecond = Math.max(0, ...ownedEquipment.map((item) => item.cashPerSecond));
  const purchasedZoneCount = unlockedZones.filter((id) => id !== MAIN_FLOOR_ZONE_ID).length;
  const targetOrbitRadius = BASE_ORBIT_RADIUS + purchasedZoneCount * ORBIT_RADIUS_PER_ZONE;
  const mood = getLocationMood(currentLocationId);
  const playAreaBounds = useMemo(() => getPlayAreaBounds(unlockedZones), [unlockedZones]);

  const janitorSpeedMultiplier = hiredStaffIds.includes("cleaner_bob") ? JANITOR_SPEED_MULTIPLIER : 1;
  const smoothieBarRechargeCash = hiredStaffIds.includes("clerk_dan")
    ? Math.round(SMOOTHIE_BAR_RECHARGE_CASH * CLERK_RECHARGE_MULTIPLIER)
    : SMOOTHIE_BAR_RECHARGE_CASH;

  const azimuthRef = useRef(0);
  const polarRef = useRef(Math.PI / 3.2);
  const currentRadiusRef = useRef(targetOrbitRadius);
  const zoomOffsetRef = useRef(0);
  const lastPan = useRef({ dx: 0, dy: 0 });
  const wasMultiTouchRef = useRef(false);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(0);
  const gestureStartTimeRef = useRef(0);
  const layoutSizeRef = useRef({ width: 0, height: 0 });
  const npcRuntimesRef = useRef<NpcRuntime[]>(createInitialNpcs());
  // Shared, mutated-not-re-rendered: NPCs write which equipment they're
  // working out at; equipment models read it to decide whether to animate.
  const occupancyRef = useRef<Record<string, boolean>>({});

  const [selection, setSelection] = useState<Selection | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const ownedEquipmentRef = useRef(ownedEquipment);
  ownedEquipmentRef.current = ownedEquipment;

  // Defensive: a prestige reset can sell equipment out from under an active
  // selection — clear it rather than showing a stale inspector for it.
  useEffect(() => {
    if (selection?.type === "equipment" && !purchasedEquipmentIds.includes(selection.id)) {
      setSelection(null);
      onSelectRef.current?.(null);
    }
  }, [selection, purchasedEquipmentIds]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          lastPan.current = { dx: 0, dy: 0 };
          wasMultiTouchRef.current = false;
          pinchStartDistanceRef.current = null;
          gestureStartTimeRef.current = Date.now();
        },
        onPanResponderMove: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches;

          if (touches.length >= 2) {
            const distance = getTouchDistance(touches);
            if (pinchStartDistanceRef.current === null) {
              pinchStartDistanceRef.current = distance;
              pinchStartZoomRef.current = zoomOffsetRef.current;
            } else {
              const delta = distance - pinchStartDistanceRef.current;
              zoomOffsetRef.current = clamp(
                pinchStartZoomRef.current - delta * PINCH_ZOOM_SPEED,
                MIN_ZOOM_OFFSET,
                MAX_ZOOM_OFFSET
              );
            }
            wasMultiTouchRef.current = true;
            return;
          }

          if (wasMultiTouchRef.current) {
            // Just dropped from two touches to one — reset the drag baseline
            // to the current cumulative delta so the orbit doesn't jump.
            lastPan.current = { dx: gestureState.dx, dy: gestureState.dy };
            wasMultiTouchRef.current = false;
            pinchStartDistanceRef.current = null;
          }

          const deltaX = gestureState.dx - lastPan.current.dx;
          const deltaY = gestureState.dy - lastPan.current.dy;
          lastPan.current = { dx: gestureState.dx, dy: gestureState.dy };

          azimuthRef.current -= deltaX * ROTATE_SPEED;
          polarRef.current = clamp(polarRef.current - deltaY * ROTATE_SPEED, MIN_POLAR, MAX_POLAR);
        },
        onPanResponderRelease: (evt, gestureState) => {
          wasMultiTouchRef.current = false;
          pinchStartDistanceRef.current = null;

          const elapsed = Date.now() - gestureStartTimeRef.current;
          const isTap =
            Math.abs(gestureState.dx) < TAP_MAX_DISTANCE_PX &&
            Math.abs(gestureState.dy) < TAP_MAX_DISTANCE_PX &&
            elapsed < TAP_MAX_DURATION_MS &&
            evt.nativeEvent.touches.length === 0;

          if (!isTap) return;

          const { width, height } = layoutSizeRef.current;
          const result = findClosestSelection(
            evt.nativeEvent.locationX,
            evt.nativeEvent.locationY,
            ownedEquipmentRef.current,
            npcRuntimesRef.current,
            azimuthRef.current,
            polarRef.current,
            currentRadiusRef.current + zoomOffsetRef.current,
            width,
            height
          );
          setSelection(result);
          onSelectRef.current?.(result);
        },
      }),
    []
  );

  return (
    <View
      style={styles.canvasWrapper}
      onLayout={(event) => {
        layoutSizeRef.current = {
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        };
      }}
      {...panResponder.panHandlers}
    >
      <Canvas shadows camera={{ position: [0, 6, 9], fov: CAMERA_FOV }}>
        <color attach="background" args={[mood.backgroundColor]} />
        <ambientLight color={mood.ambientColor} intensity={mood.ambientIntensity} />
        <directionalLight
          position={[5, 8, 5]}
          color={mood.directionalColor}
          intensity={mood.directionalIntensity}
          castShadow
        />
        {/* Bright commercial-gym overhead wash — pure white, straight down,
            no shadows of its own (the angled mood light above already casts
            the scene's shadows; a second shadow-casting light would double
            the shadow-map render cost for no real visual gain here). */}
        <directionalLight
          position={[0, 15, 0]}
          color={OVERHEAD_WASH_COLOR}
          intensity={1.4}
          castShadow={false}
        />

        <GymBackdrop prestigeCount={prestigeCount} windowColor={mood.windowColor} />

        <TiledFloor />
        <gridHelper args={[FLOOR_SIZE, TILES_PER_SIDE, "#3a3d47", "#2a2c33"]} />

        <GymWalls bounds={playAreaBounds} />
        <GymDecor bounds={playAreaBounds} unlockedZones={unlockedZones} />
        <OverheadLedArray />
        <NeonPerimeter bounds={playAreaBounds} />
        <SmoothieBar />
        <LockerRoomDoor />
        {unlockedZones.includes("cardio_deck") && <CardioDeckZone />}
        {unlockedZones.includes("iron_vault") && <IronVaultZone />}

        {ownedEquipment.map((item) => {
          const position = getEquipmentWorldPosition(item);
          const isTopEarner = maxCashPerSecond > 0 && item.cashPerSecond === maxCashPerSecond;
          const isSelected = selection?.type === "equipment" && selection.id === item.id;
          return (
            <group key={item.id} position={position}>
              <GymEquipment
                equipmentId={item.id}
                color={item.color}
                isTopEarner={isTopEarner}
                isSelected={isSelected}
                level={equipmentLevels[item.id] ?? 1}
                occupancyRef={occupancyRef}
              />
            </group>
          );
        })}

        {ownedEquipment.map((item) => (
          <EquipmentSpotlight
            key={`spot-${item.id}`}
            position={getEquipmentWorldPosition(item)}
          />
        ))}

        <GymNpcs
          npcRuntimesRef={npcRuntimesRef}
          ownedEquipmentIds={purchasedEquipmentIds}
          unlockedZones={unlockedZones}
          occupancyRef={occupancyRef}
          selectedNpcId={selection?.type === "npc" ? selection.id : null}
          speedMultiplier={janitorSpeedMultiplier}
          onRecharged={() => addCash(smoothieBarRechargeCash)}
        />

        <GymStaff
          hiredStaffIds={hiredStaffIds}
          unlockedZones={unlockedZones}
          occupancyRef={occupancyRef}
        />

        <CameraRig
          azimuthRef={azimuthRef}
          polarRef={polarRef}
          targetRadius={targetOrbitRadius}
          currentRadiusRef={currentRadiusRef}
          zoomOffsetRef={zoomOffsetRef}
        />
      </Canvas>
    </View>
  );
}

type BoundaryState = { hasError: boolean };

class GymFloorErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("GymFloor3D failed to render:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={[styles.canvasWrapper, styles.fallback]}>
          <Text style={styles.fallbackText}>3D preview unavailable on this device</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

type GymFloor3DProps = {
  onSelect?: (selection: Selection | null) => void;
};

export function GymFloor3D({ onSelect }: GymFloor3DProps) {
  return (
    <GymFloorErrorBoundary>
      <GymFloorScene onSelect={onSelect} />
    </GymFloorErrorBoundary>
  );
}

const styles = StyleSheet.create({
  canvasWrapper: {
    flex: 1,
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  fallbackText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    textAlign: "center",
  },
});
