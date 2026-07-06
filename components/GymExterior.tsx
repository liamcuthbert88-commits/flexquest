import { useEffect, useMemo, useRef } from "react";
import { InstancedMesh, Object3D } from "three";
import { EXTERIOR_RING_WIDTH, type PlayAreaBounds } from "@/constants/zones";

const GROUND_RADIUS = 60;
const GROUND_COLOR = "#0d0d10";

const ASPHALT_COLOR = "#26262b";
const ROAD_HEIGHT = 0.08;
const LANE_MARKING_COLOR = "#d8d4c8";
const LANE_MARKING_HEIGHT = 0.02;
const LANE_MARKING_THICKNESS = 0.2;

const PARKING_LINE_COLOR = "#e8e8e8";
const PARKING_LINE_THICKNESS = 0.15;
const PARKING_LINE_HEIGHT = 0.02;
/** World-unit spacing between parking-space divider lines — chosen close to
 * EQUIPMENT_GRID_TILE_SIZE (2.5) so the exterior's rhythm doesn't clash with
 * the interior grid's, without importing that constant across an unrelated
 * boundary (this file only needs a plausible parking-bay width, not the
 * literal equipment grid). */
const PARKING_SPACE_WIDTH = 3;

const BUS_STOP_POST_HEIGHT = 2.2;
const BUS_STOP_POST_RADIUS = 0.08;
const BUS_STOP_POST_COLOR = "#1e1e24";
const BUS_STOP_ROOF_COLOR = "#2a2a2e";
const BUS_STOP_ROOF_SIZE: [number, number, number] = [2.4, 0.1, 1.2];
const BUS_STOP_BENCH_COLOR = "#5a3d28";
const BUS_STOP_BENCH_SIZE: [number, number, number] = [1.2, 0.4, 0.4];
/** Matches GymFloor3D.tsx's own ENTRANCE_GAP_WIDTH (4) — duplicated here
 * rather than imported since it's a GymFloor3D-local constant, not exported
 * from constants/zones. Positions the bus stop just to the right of the
 * entrance gap, clear of the door itself. */
const ENTRANCE_GAP_WIDTH = 4;

/** One large, flat, static ground plane comfortably past GymBackdrop's
 * 55-unit skyline ring — fixes "visible void beyond the walls" outright,
 * regardless of the more detailed road/parking geometry's exact placement.
 * Fixed at world origin, not bounds-dependent: even at the largest building
 * footprint (worst-case corner ~36 units from origin), a 60-unit-radius
 * plane still covers it with margin, so there's no need to resize this as
 * zones unlock. */
function ExteriorGround() {
  return (
    <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[GROUND_RADIUS, 32]} />
      <meshStandardMaterial color={GROUND_COLOR} roughness={0.95} metalness={0} />
    </mesh>
  );
}

/** A rectangular loop of asphalt strips just outside the play-area walls,
 * offset by EXTERIOR_RING_WIDTH — same 4-panel perimeter shape GymWalls
 * builds, just further out and flat instead of vertical. Each strip's long
 * dimension is extended by EXTERIOR_RING_WIDTH at both ends (not just
 * spanning its own side's length) so the four strips visually overlap at
 * the corners into a continuous loop — there's no CSG/boolean-union
 * available here (same constraint noted in GymFloor3D.tsx's
 * WindowedWallSegment), so overlapping straight pieces is the standard
 * workaround, the same technique GymWalls' own corner pillars use to cover
 * the seams between its wall panels. Plain meshes, not instanced — unlike
 * ParkingSpaces below, these don't need the InstancedMesh remount-on-bounds-
 * change treatment, since a plain mesh's size/position re-renders correctly
 * from props on every bounds change with no special handling. */
function ExteriorRoad({ bounds }: { bounds: PlayAreaBounds }) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const extendedWidth = maxX - minX + EXTERIOR_RING_WIDTH * 2;
  const extendedDepth = maxZ - minZ + EXTERIOR_RING_WIDTH * 2;

  const strips: { position: [number, number, number]; size: [number, number, number] }[] = [
    // Front (entrance side, +Z)
    {
      position: [centerX, ROAD_HEIGHT / 2, maxZ + EXTERIOR_RING_WIDTH / 2],
      size: [extendedWidth, ROAD_HEIGHT, EXTERIOR_RING_WIDTH],
    },
    // Back (-Z)
    {
      position: [centerX, ROAD_HEIGHT / 2, minZ - EXTERIOR_RING_WIDTH / 2],
      size: [extendedWidth, ROAD_HEIGHT, EXTERIOR_RING_WIDTH],
    },
    // Left (-X)
    {
      position: [minX - EXTERIOR_RING_WIDTH / 2, ROAD_HEIGHT / 2, centerZ],
      size: [EXTERIOR_RING_WIDTH, ROAD_HEIGHT, extendedDepth],
    },
    // Right (+X)
    {
      position: [maxX + EXTERIOR_RING_WIDTH / 2, ROAD_HEIGHT / 2, centerZ],
      size: [EXTERIOR_RING_WIDTH, ROAD_HEIGHT, extendedDepth],
    },
  ];

  // Lane markings: one centerline stripe per strip, running along that
  // strip's long axis. Front/back strips are wide along X (marking is a
  // long-X, thin-Z box); left/right strips are wide along Z (marking is a
  // long-Z, thin-X box).
  const laneMarkings: { position: [number, number, number]; size: [number, number, number] }[] = [
    {
      position: [centerX, ROAD_HEIGHT + LANE_MARKING_HEIGHT / 2, maxZ + EXTERIOR_RING_WIDTH / 2],
      size: [extendedWidth, LANE_MARKING_HEIGHT, LANE_MARKING_THICKNESS],
    },
    {
      position: [centerX, ROAD_HEIGHT + LANE_MARKING_HEIGHT / 2, minZ - EXTERIOR_RING_WIDTH / 2],
      size: [extendedWidth, LANE_MARKING_HEIGHT, LANE_MARKING_THICKNESS],
    },
    {
      position: [minX - EXTERIOR_RING_WIDTH / 2, ROAD_HEIGHT + LANE_MARKING_HEIGHT / 2, centerZ],
      size: [LANE_MARKING_THICKNESS, LANE_MARKING_HEIGHT, extendedDepth],
    },
    {
      position: [maxX + EXTERIOR_RING_WIDTH / 2, ROAD_HEIGHT + LANE_MARKING_HEIGHT / 2, centerZ],
      size: [LANE_MARKING_THICKNESS, LANE_MARKING_HEIGHT, extendedDepth],
    },
  ];

  return (
    <group>
      {strips.map((strip, i) => (
        <mesh key={i} position={strip.position} receiveShadow>
          <boxGeometry args={strip.size} />
          <meshStandardMaterial color={ASPHALT_COLOR} roughness={0.9} metalness={0} />
        </mesh>
      ))}
      {laneMarkings.map((marking, i) => (
        <mesh key={i} position={marking.position}>
          <boxGeometry args={marking.size} />
          <meshStandardMaterial color={LANE_MARKING_COLOR} roughness={0.7} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

/** Evenly-spaced parking-bay divider lines along the front road strip (the
 * entrance side), one InstancedMesh so the count costs a single draw call
 * regardless of how many spaces the current bounds produce — same technique
 * TiledFloor uses for its tile grid. Each divider is a thin box perpendicular
 * to the road's long axis, i.e. its long dimension runs along Z (matching
 * the road strip's own Z depth), not X. */
function ParkingSpaces({ bounds }: { bounds: PlayAreaBounds }) {
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  const { minX, maxX, maxZ } = bounds;
  const extendedWidth = maxX - minX + EXTERIOR_RING_WIDTH * 2;
  const startX = minX - EXTERIOR_RING_WIDTH;
  const count = Math.floor(extendedWidth / PARKING_SPACE_WIDTH) + 1;
  const lineZ = maxZ + EXTERIOR_RING_WIDTH / 2;
  const lineLength = EXTERIOR_RING_WIDTH * 0.7;

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < count; i++) {
      const x = startX + i * PARKING_SPACE_WIDTH;
      dummy.position.set(x, ROAD_HEIGHT + PARKING_LINE_HEIGHT / 2, lineZ);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  }, [dummy, count, startX, lineZ]);

  return (
    <instancedMesh
      key={`${bounds.minX}-${bounds.maxX}-${bounds.minZ}-${bounds.maxZ}`}
      ref={meshRef}
      args={[undefined, undefined, count]}
      frustumCulled={false}
    >
      <boxGeometry args={[PARKING_LINE_THICKNESS, PARKING_LINE_HEIGHT, lineLength]} />
      <meshStandardMaterial color={PARKING_LINE_COLOR} roughness={0.7} metalness={0} />
    </instancedMesh>
  );
}

/** One static bus-stop structure (2 posts, a roof, a bench) — no instancing
 * needed since only one exists. Fixed at a position derived from the
 * entrance gap and EXTERIOR_RING_WIDTH, both of which don't change with
 * zone purchases (the entrance side, maxZ, is permanently invariant per
 * constants/zones.ts), so the bus stop never needs to move or resize. */
function BusStop({ bounds }: { bounds: PlayAreaBounds }) {
  const x = ENTRANCE_GAP_WIDTH / 2 + 3;
  const z = bounds.maxZ + EXTERIOR_RING_WIDTH + 2;
  const postXOffset = BUS_STOP_ROOF_SIZE[0] / 2 - 0.15;

  return (
    <group position={[x, 0, z]}>
      {[-postXOffset, postXOffset].map((offsetX) => (
        <mesh key={offsetX} position={[offsetX, BUS_STOP_POST_HEIGHT / 2, 0]} castShadow>
          <cylinderGeometry args={[BUS_STOP_POST_RADIUS, BUS_STOP_POST_RADIUS, BUS_STOP_POST_HEIGHT, 8]} />
          <meshStandardMaterial color={BUS_STOP_POST_COLOR} roughness={0.6} metalness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, BUS_STOP_POST_HEIGHT, 0]} castShadow>
        <boxGeometry args={BUS_STOP_ROOF_SIZE} />
        <meshStandardMaterial color={BUS_STOP_ROOF_COLOR} roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh position={[0, BUS_STOP_BENCH_SIZE[1] / 2, 0]} castShadow>
        <boxGeometry args={BUS_STOP_BENCH_SIZE} />
        <meshStandardMaterial color={BUS_STOP_BENCH_COLOR} roughness={0.8} metalness={0} />
      </mesh>
    </group>
  );
}

type GymExteriorProps = { bounds: PlayAreaBounds };

/** Always renders unconditionally — nothing here is purchasable or gated on
 * any unlock state. Purely passive scenery, present from the very first
 * launch. */
export function GymExterior({ bounds }: GymExteriorProps) {
  return (
    <>
      <ExteriorGround />
      <ExteriorRoad bounds={bounds} />
      <ParkingSpaces bounds={bounds} />
      <BusStop bounds={bounds} />
    </>
  );
}
