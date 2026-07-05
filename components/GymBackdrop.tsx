import { useMemo } from "react";

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
 * payoff beyond stat changes. */
export function GymBackdrop({ prestigeCount, windowColor }: BackdropProps) {
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

  return (
    <>
      {buildings.map((building, i) => (
        <group key={i} position={building.position}>
          <mesh position={[0, building.height / 2, 0]}>
            <boxGeometry args={[building.width, building.height, building.width]} />
            <meshStandardMaterial color="#1a1b22" roughness={0.9} metalness={0} />
          </mesh>
          <mesh position={[0, building.height * 0.65, building.width / 2 + 0.02]}>
            <planeGeometry args={[building.width * 0.3, building.width * 0.3]} />
            <meshBasicMaterial color={windowColor} transparent opacity={0.5} />
          </mesh>
        </group>
      ))}
    </>
  );
}
