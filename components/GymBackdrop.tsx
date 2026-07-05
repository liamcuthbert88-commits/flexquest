import { useEffect, useMemo, useRef } from "react";
import { InstancedMesh, Object3D } from "three";

const BUILDING_COUNT = 16;
const RING_RADIUS = 55;

type BackdropProps = {
  prestigeCount: number;
  windowColor: string;
};

type Building = {
  position: [number, number, number];
  height: number;
  width: number;
};

/** A distant, full-circle skyline silhouette — chosen instead of literal
 * walls/ceiling around the play area, since the camera can orbit a full
 * 360° and the floor's footprint grows with unlocked zones (up to ~50 units
 * across once both are bought), which would make close-fitting walls either
 * clip the camera or need constant refitting. A big, deterministic ring of
 * buildings sidesteps both problems and still reads as "a real place." Taller
 * and denser as prestigeCount grows, so franchise progression has a visible
 * payoff beyond stat changes.
 *
 * Rendered via two InstancedMeshes (building bodies, window panes) instead of
 * 16 separate groups of 2 meshes each — same technique as TiledFloor's tile
 * grid, collapsing 32 draw calls into 2. Each building has a different
 * height/width, achieved with a unit box/plane geometry scaled per-instance
 * via its transform matrix rather than a differently-sized geometry per
 * building. No per-instance color is needed here (every building/window
 * already shared one uniform color even before instancing), so this only
 * touches position/scale — matrices, not colors. */
export function GymBackdrop({ prestigeCount, windowColor }: BackdropProps) {
  const buildingMeshRef = useRef<InstancedMesh>(null);
  const windowMeshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  const buildings = useMemo<Building[]>(() => {
    const heightMultiplier = 1 + prestigeCount * 0.5;
    return Array.from({ length: BUILDING_COUNT }, (_, i) => {
      const angle = (i / BUILDING_COUNT) * Math.PI * 2;
      // Deterministic pseudo-variation from the index alone — no Math.random()
      // at render time, so the skyline doesn't reshuffle every re-render.
      const baseHeight = 4 + ((i * 7) % 5) * 2.4;
      return {
        position: [Math.sin(angle) * RING_RADIUS, 0, Math.cos(angle) * RING_RADIUS],
        height: baseHeight * heightMultiplier,
        width: 3 + ((i * 3) % 3),
      };
    });
  }, [prestigeCount]);

  useEffect(() => {
    const buildingMesh = buildingMeshRef.current;
    const windowMesh = windowMeshRef.current;
    if (!buildingMesh || !windowMesh) return;

    buildings.forEach((building, i) => {
      dummy.position.set(building.position[0], building.height / 2, building.position[2]);
      dummy.scale.set(building.width, building.height, building.width);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      buildingMesh.setMatrixAt(i, dummy.matrix);

      // Matches the original's fixed placement — no rotation to face the
      // play area, same as before instancing (not something this pass changes).
      dummy.position.set(
        building.position[0],
        building.height * 0.65,
        building.position[2] + building.width / 2 + 0.02
      );
      dummy.scale.set(building.width * 0.3, building.width * 0.3, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      windowMesh.setMatrixAt(i, dummy.matrix);
    });

    buildingMesh.instanceMatrix.needsUpdate = true;
    windowMesh.instanceMatrix.needsUpdate = true;
  }, [buildings, dummy]);

  return (
    <>
      <instancedMesh ref={buildingMeshRef} args={[undefined, undefined, BUILDING_COUNT]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1a1b22" roughness={0.9} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={windowMeshRef} args={[undefined, undefined, BUILDING_COUNT]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={windowColor} transparent opacity={0.5} />
      </instancedMesh>
    </>
  );
}
