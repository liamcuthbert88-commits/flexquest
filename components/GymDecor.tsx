import type { PlayAreaBounds } from "@/constants/zones";

/** Duplicates GymFloor3D.tsx's NEON_COLOR/CARDIO_BLUE by value rather than
 * importing them — this file already did that for CARDIO_ACCENT_COLOR below;
 * kept consistent rather than mixing import and duplicate-constant patterns
 * in the same file. */
const BRAND_COLOR = "#6B8F4E";
const CARDIO_ACCENT_COLOR = "#38BDF8";

const MIRROR_FRAME_COLOR = "#f2f3f5";
const MIRROR_GLASS_COLOR = "#c7cad1";
/** Wall is centered on minX/minZ with WALL_THICKNESS=0.3 (see GymFloor3D.tsx),
 * so its inner face sits 0.15 units toward the room from that center — this
 * clears it with a small additional gap. Reused for every wall-mounted panel
 * in this file (mirrors, TVs, posters, the brand emblem), not just mirrors. */
const WALL_MOUNT_INSET = 0.2;
const MIRROR_HEIGHT = 1.6;
const MIRROR_ELEVATION = 1.1;
const TV_ELEVATION = 2.0;
const POSTER_ELEVATION = 1.4;

const DECOR_WALL_INSET = 1.4;

type FacingAxis = "x" | "z";

/** A wall-mounted frame + inset surface — shared construction for mirrors,
 * TVs, and posters, which are all visually "a framed rectangle on the wall"
 * differentiated only by size/color/material. `facingAxis` picks which
 * dimension is "thin" (the wall's normal) without needing a rotation
 * transform: "x" for the left/right walls, "z" for the back/front walls. */
function FramedWallPanel({
  position,
  panelWidth,
  panelHeight,
  facingAxis,
  frameColor,
  surfaceColor,
  surfaceRoughness,
  surfaceMetalness,
  surfaceEmissiveIntensity = 0,
}: {
  position: [number, number, number];
  panelWidth: number;
  panelHeight: number;
  facingAxis: FacingAxis;
  frameColor: string;
  surfaceColor: string;
  surfaceRoughness: number;
  surfaceMetalness: number;
  surfaceEmissiveIntensity?: number;
}) {
  const frameThinDepth = 0.05;
  const surfaceThinDepth = 0.03;

  const frameArgs: [number, number, number] =
    facingAxis === "x"
      ? [frameThinDepth, panelHeight + 0.08, panelWidth + 0.08]
      : [panelWidth + 0.08, panelHeight + 0.08, frameThinDepth];

  const surfaceArgs: [number, number, number] =
    facingAxis === "x"
      ? [surfaceThinDepth, panelHeight, panelWidth]
      : [panelWidth, panelHeight, surfaceThinDepth];

  const surfaceOffset: [number, number, number] = facingAxis === "x" ? [0.03, 0, 0] : [0, 0, 0.03];

  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={frameArgs} />
        <meshStandardMaterial color={frameColor} roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={surfaceOffset}>
        <boxGeometry args={surfaceArgs} />
        <meshStandardMaterial
          color={surfaceColor}
          roughness={surfaceRoughness}
          metalness={surfaceMetalness}
          emissive={surfaceColor}
          emissiveIntensity={surfaceEmissiveIntensity}
        />
      </mesh>
    </group>
  );
}

function MirrorPanel({
  position,
  panelWidth,
  facingAxis,
}: {
  position: [number, number, number];
  panelWidth: number;
  facingAxis: FacingAxis;
}) {
  return (
    <FramedWallPanel
      position={position}
      panelWidth={panelWidth}
      panelHeight={MIRROR_HEIGHT}
      facingAxis={facingAxis}
      frameColor={MIRROR_FRAME_COLOR}
      surfaceColor={MIRROR_GLASS_COLOR}
      surfaceRoughness={0.05}
      surfaceMetalness={0.9}
    />
  );
}

/** A softly glowing screen — the closest achievable stand-in for "a TV
 * playing something" without any image/video rendering path in this
 * pipeline. Reads as "a screen that's on," not literal broadcast content. */
function TvScreen({ position, facingAxis }: { position: [number, number, number]; facingAxis: FacingAxis }) {
  return (
    <FramedWallPanel
      position={position}
      panelWidth={0.9}
      panelHeight={0.55}
      facingAxis={facingAxis}
      frameColor="#111318"
      surfaceColor="#9fd8ff"
      surfaceRoughness={0.3}
      surfaceMetalness={0.1}
      surfaceEmissiveIntensity={0.8}
    />
  );
}

/** A framed flat accent panel standing in for wall art/motivational
 * posters — this pipeline has no text or image rendering anywhere, so this
 * is a deliberately abstract stand-in (a colored print), not literal copy. */
function PosterPanel({
  position,
  facingAxis,
  accentColor,
}: {
  position: [number, number, number];
  facingAxis: FacingAxis;
  accentColor: string;
}) {
  return (
    <FramedWallPanel
      position={position}
      panelWidth={0.6}
      panelHeight={0.85}
      facingAxis={facingAxis}
      frameColor="#1c1e24"
      surfaceColor={accentColor}
      surfaceRoughness={0.6}
      surfaceMetalness={0}
    />
  );
}

/** An abstract geometric mark (ring + disc) standing in for a logo — there's
 * no text/font rendering available in this pipeline, so this is a brand
 * *mark*, not a literal wordmark. Uses the same violet as the neon floor
 * trim and wall accent stripe for one consistent identity. */
function BrandEmblem({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <torusGeometry args={[0.35, 0.06, 8, 16]} />
        <meshStandardMaterial color={BRAND_COLOR} emissive={BRAND_COLOR} emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <circleGeometry args={[0.22, 24]} />
        <meshStandardMaterial color="#f2f3f5" roughness={0.4} metalness={0.1} />
      </mesh>
    </group>
  );
}

/** Front desk counter facing the entrance gap in the front wall. */
function ReceptionDesk({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 1.0, 0.6]} />
        <meshStandardMaterial color="#2f323b" roughness={0.5} metalness={0.15} />
      </mesh>
      <mesh position={[0, 1.03, 0]} castShadow>
        <boxGeometry args={[2.5, 0.06, 0.7]} />
        <meshStandardMaterial color="#e8ddc7" roughness={0.3} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.5, 0.31]}>
        <boxGeometry args={[2.1, 0.4, 0.02]} />
        <meshStandardMaterial color={BRAND_COLOR} roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.28, -0.55]} castShadow>
        <cylinderGeometry args={[0.16, 0.14, 0.55, 16]} />
        <meshStandardMaterial color="#2a2c33" roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

/** Digital check-in kiosk — a pole stand with an angled glowing screen,
 * standing in for a real check-in flow the same way TvScreen stands in for
 * broadcast content: no image/video rendering path exists here, so this
 * reads as "a terminal that's on," not literal interactive UI. */
function CheckInTerminal({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 1.0, 10]} />
        <meshStandardMaterial color="#2a2c33" roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, 1.05, 0]} rotation={[-0.15, 0, 0]} castShadow>
        <boxGeometry args={[0.32, 0.42, 0.03]} />
        <meshStandardMaterial color="#111318" roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[0, 1.05, 0.02]} rotation={[-0.15, 0, 0]}>
        <boxGeometry args={[0.26, 0.36, 0.01]} />
        <meshStandardMaterial color={BRAND_COLOR} emissive={BRAND_COLOR} emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

/** Potted plant — pot + a small cluster of overlapping foliage spheres.
 * Cheap, classic environment-art filler for otherwise-empty corners. */
function PottedPlant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.18, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.13, 0.36, 12]} />
        <meshStandardMaterial color="#3d2b1f" roughness={0.7} metalness={0} />
      </mesh>
      <mesh position={[0, 0.45, 0]} castShadow>
        <sphereGeometry args={[0.22, 8, 8]} />
        <meshStandardMaterial color="#2f6b3a" roughness={0.8} metalness={0} />
      </mesh>
      <mesh position={[0.1, 0.6, 0.05]} castShadow>
        <sphereGeometry args={[0.16, 8, 8]} />
        <meshStandardMaterial color="#3d8449" roughness={0.8} metalness={0} />
      </mesh>
      <mesh position={[-0.08, 0.58, -0.08]} castShadow>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshStandardMaterial color="#356b3d" roughness={0.8} metalness={0} />
      </mesh>
    </group>
  );
}

/** Open shelving frame holding a couple of rolled towels. */
function StorageShelf({ position }: { position: [number, number, number] }) {
  const shelfYs = [0.3, 0.65, 1.0];
  const towelYs = [0.65, 1.0];

  return (
    <group position={position}>
      <mesh position={[-0.35, 0.5, 0]} castShadow>
        <boxGeometry args={[0.04, 1.1, 0.4]} />
        <meshStandardMaterial color="#2a2c33" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0.35, 0.5, 0]} castShadow>
        <boxGeometry args={[0.04, 1.1, 0.4]} />
        <meshStandardMaterial color="#2a2c33" roughness={0.6} metalness={0.2} />
      </mesh>
      {shelfYs.map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow>
          <boxGeometry args={[0.74, 0.03, 0.4]} />
          <meshStandardMaterial color="#3a3d47" roughness={0.6} metalness={0.2} />
        </mesh>
      ))}
      {towelYs.map((y, i) => (
        <mesh
          key={y}
          position={[i === 0 ? -0.15 : 0.1, y + 0.08, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <cylinderGeometry args={[0.07, 0.07, 0.3, 10]} />
          <meshStandardMaterial color="#e8ddc7" roughness={0.8} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

/** Sleek cylinder tank on a dark base with a glowing accent ring. */
function WaterCoolerStation({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[0.5, 0.7, 0.5]} />
        <meshStandardMaterial color="#2a2c33" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.24, 0.6, 16]} />
        <meshStandardMaterial
          color="#dce8f0"
          roughness={0.15}
          metalness={0.1}
          transparent
          opacity={0.85}
        />
      </mesh>
      <mesh position={[0, 0.72, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.26, 0.02, 8, 16]} />
        <meshStandardMaterial
          color={CARDIO_ACCENT_COLOR}
          emissive={CARDIO_ACCENT_COLOR}
          emissiveIntensity={1.5}
        />
      </mesh>
    </group>
  );
}

/** Small angled rack holding tiered colored bumper plates. */
function WeightTree({ position }: { position: [number, number, number] }) {
  const plates: { color: string; offset: number; radius: number }[] = [
    { color: "#3B82F6", offset: 0.05, radius: 0.18 },
    { color: "#FACC15", offset: 0.14, radius: 0.15 },
    { color: "#22C55E", offset: 0.22, radius: 0.12 },
  ];

  return (
    <group position={position}>
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.15, 0.04, 12]} />
        <meshStandardMaterial color="#1c1e24" roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.5, 0]} rotation={[0, 0, 0.15]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 1.0, 8]} />
        <meshStandardMaterial color="#4b4f58" metalness={0.8} roughness={0.3} />
      </mesh>
      {plates.map((plate) => (
        <mesh
          key={plate.color}
          position={[plate.offset, 0.3 + plate.offset * 0.8, 0]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[plate.radius, plate.radius, 0.06, 16]} />
          <meshStandardMaterial color={plate.color} roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/** Open crate with rolled yoga mats tucked inside. */
function YogaBasket({ position }: { position: [number, number, number] }) {
  const matColors = ["#6B8F4E", "#38BDF8", "#4ADE80"];

  return (
    <group position={position}>
      <mesh position={[0, 0.02, 0]} castShadow>
        <boxGeometry args={[0.44, 0.03, 0.44]} />
        <meshStandardMaterial color="#5b3a29" roughness={0.7} metalness={0} />
      </mesh>
      <mesh position={[0, 0.15, 0.22]} castShadow>
        <boxGeometry args={[0.5, 0.3, 0.03]} />
        <meshStandardMaterial color="#5b3a29" roughness={0.7} metalness={0} />
      </mesh>
      <mesh position={[0, 0.15, -0.22]} castShadow>
        <boxGeometry args={[0.5, 0.3, 0.03]} />
        <meshStandardMaterial color="#5b3a29" roughness={0.7} metalness={0} />
      </mesh>
      <mesh position={[0.22, 0.15, 0]} castShadow>
        <boxGeometry args={[0.03, 0.3, 0.44]} />
        <meshStandardMaterial color="#5b3a29" roughness={0.7} metalness={0} />
      </mesh>
      <mesh position={[-0.22, 0.15, 0]} castShadow>
        <boxGeometry args={[0.03, 0.3, 0.44]} />
        <meshStandardMaterial color="#5b3a29" roughness={0.7} metalness={0} />
      </mesh>

      {matColors.map((color, i) => (
        <mesh
          key={color}
          position={[-0.1 + i * 0.1, 0.42, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <cylinderGeometry args={[0.07, 0.07, 0.4, 12]} />
          <meshStandardMaterial color={color} roughness={0.6} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

/** Simple slatted seating bench — flat seat + two end supports. */
function GymBench({
  position,
  rotationY = 0,
}: {
  position: [number, number, number];
  rotationY?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.35, 0.06, 1.1]} />
        <meshStandardMaterial color="#3a3d47" roughness={0.5} metalness={0.15} />
      </mesh>
      {[-0.4, 0.4].map((z) => (
        <mesh key={z} position={[0, 0.17, z]} castShadow>
          <boxGeometry args={[0.3, 0.34, 0.04]} />
          <meshStandardMaterial color="#1c1e24" roughness={0.6} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

/** Round wall clock with two hands — `facingAxis` orients its flat face
 * outward from whichever wall it's mounted on, same convention as
 * FramedWallPanel. */
function WallClock({
  position,
  facingAxis,
}: {
  position: [number, number, number];
  facingAxis: FacingAxis;
}) {
  const rotation: [number, number, number] =
    facingAxis === "x" ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];

  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.04, 24]} />
        <meshStandardMaterial color="#f2f3f5" roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0, 0.025]}>
        <circleGeometry args={[0.14, 24]} />
        <meshStandardMaterial color="#1c1e24" roughness={0.5} metalness={0} />
      </mesh>
      <mesh position={[0.02, 0.03, 0.03]} rotation={[0, 0, -0.3]}>
        <boxGeometry args={[0.01, 0.09, 0.005]} />
        <meshStandardMaterial color="#1c1e24" roughness={0.5} metalness={0} />
      </mesh>
      <mesh position={[0.03, 0.015, 0.03]} rotation={[0, 0, 0.6]}>
        <boxGeometry args={[0.008, 0.06, 0.005]} />
        <meshStandardMaterial color="#1c1e24" roughness={0.5} metalness={0} />
      </mesh>
    </group>
  );
}

/** Small wall-mounted speaker box — mounted high, well above every other
 * wall-mounted item (mirrors/TVs/posters top out at y=2.0). */
function WallSpeaker({
  position,
  facingAxis,
}: {
  position: [number, number, number];
  facingAxis: FacingAxis;
}) {
  const boxArgs: [number, number, number] =
    facingAxis === "x" ? [0.15, 0.28, 0.2] : [0.2, 0.28, 0.15];

  return (
    <mesh position={position} castShadow>
      <boxGeometry args={boxArgs} />
      <meshStandardMaterial color="#1c1e24" roughness={0.6} metalness={0.2} />
    </mesh>
  );
}

/** Wall-mounted fire extinguisher on a small bracket shelf. */
function FireExtinguisher({
  position,
  facingAxis,
}: {
  position: [number, number, number];
  facingAxis: FacingAxis;
}) {
  const rotation: [number, number, number] = facingAxis === "x" ? [0, 0, 0] : [0, Math.PI / 2, 0];

  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, -0.05, 0.05]} castShadow>
        <boxGeometry args={[0.16, 0.03, 0.08]} />
        <meshStandardMaterial color="#2a2c33" roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.08]} castShadow>
        <cylinderGeometry args={[0.06, 0.07, 0.32, 12]} />
        <meshStandardMaterial color="#d32f2f" roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.19, 0.08]} castShadow>
        <cylinderGeometry args={[0.025, 0.03, 0.06, 10]} />
        <meshStandardMaterial color="#1c1e24" roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

/** Freestanding wipe-down station — spray bottle + paper towel roll on a
 * pole-mounted shelf, distinct from WaterCoolerStation (that's for
 * hydration; this is for sanitizing equipment between uses). */
function CleaningStation({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.9, 8]} />
        <meshStandardMaterial color="#2a2c33" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[0.32, 0.1, 0.22]} />
        <meshStandardMaterial color="#f2f3f5" roughness={0.4} metalness={0.1} />
      </mesh>
      <mesh position={[-0.08, 0.97, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.02, 0.12, 10]} />
        <meshStandardMaterial color="#38BDF8" roughness={0.3} metalness={0.1} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0.08, 0.96, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.12, 12]} />
        <meshStandardMaterial color="#e8ddc7" roughness={0.7} metalness={0} />
      </mesh>
    </group>
  );
}

type GymDecorProps = {
  bounds: PlayAreaBounds;
  unlockedZones: string[];
};

/** All interior decor in one place, distributed across the walls/floor that
 * are otherwise bare rather than piling everything onto one — a seamless
 * two-panel mirror wall + amenity line + storage on the left wall, reception
 * desk + check-in terminal + brand emblem + plants + a bench at the entrance
 * (front wall), TVs/posters + a speaker on the right wall, a bench + speaker
 * + wall clock + fire extinguisher rounding out the back/side walls, a
 * cleaning station on the open floor near the equipment cluster. Everything
 * wall/left/right-relative is positioned from `bounds` rather than fixed
 * coordinates, so it all slides outward the same way the walls/neon trim do
 * as zones unlock. Geometry stays deliberately simple (boxes, cylinders,
 * circles, one torus) — no new materials/textures, same cost class as the
 * rest of the scene's decor. */
export function GymDecor({ bounds, unlockedZones }: GymDecorProps) {
  const leftWallX = bounds.minX + WALL_MOUNT_INSET;
  const rightWallX = bounds.maxX - WALL_MOUNT_INSET;
  const spanZ = bounds.maxZ - bounds.minZ;
  const rightWallZs = [bounds.minZ + spanZ * 0.25, bounds.minZ + spanZ * 0.5, bounds.minZ + spanZ * 0.75];

  // Two large mirror panels spanning nearly the whole left wall — reads as
  // one seamless mirror wall rather than the old 3 separate gapped panels.
  // GymWalls.tsx puts a mid-span structural pillar at exactly the wall's
  // center z, so a single continuous panel there would clip straight
  // through it; splitting into two panels with a deliberate gap at the
  // pillar reads as an intentional architectural break (a real mirror wall
  // interrupted by a support column), not a bug.
  const pillarZ = (bounds.minZ + bounds.maxZ) / 2;
  const cornerMargin = 0.3;
  const pillarClearance = 0.5;
  const mirrorSegment1Start = bounds.minZ + cornerMargin;
  const mirrorSegment1End = pillarZ - pillarClearance / 2;
  const mirrorSegment1Width = mirrorSegment1End - mirrorSegment1Start;
  const mirrorSegment1Z = (mirrorSegment1Start + mirrorSegment1End) / 2;
  const mirrorSegment2Start = pillarZ + pillarClearance / 2;
  const mirrorSegment2End = bounds.maxZ - cornerMargin;
  const mirrorSegment2Width = mirrorSegment2End - mirrorSegment2Start;
  const mirrorSegment2Z = (mirrorSegment2Start + mirrorSegment2End) / 2;

  const decorX = bounds.minX + DECOR_WALL_INSET;
  const hasIronVault = unlockedZones.includes("iron_vault");

  const entranceZ = bounds.maxZ - 2;
  const entranceWallInsetZ = bounds.maxZ - WALL_MOUNT_INSET;

  return (
    <>
      <MirrorPanel
        position={[leftWallX, MIRROR_ELEVATION, mirrorSegment1Z]}
        panelWidth={mirrorSegment1Width}
        facingAxis="x"
      />
      <MirrorPanel
        position={[leftWallX, MIRROR_ELEVATION, mirrorSegment2Z]}
        panelWidth={mirrorSegment2Width}
        facingAxis="x"
      />

      {hasIronVault && (
        <MirrorPanel
          position={[leftWallX, MIRROR_ELEVATION, bounds.minZ + WALL_MOUNT_INSET]}
          panelWidth={4}
          facingAxis="z"
        />
      )}

      <WaterCoolerStation position={[decorX, 0, -4]} />
      <WeightTree position={[decorX, 0, 0]} />
      <YogaBasket position={[decorX, 0, 4]} />
      <StorageShelf position={[decorX, 0, -7]} />

      <TvScreen position={[rightWallX, TV_ELEVATION, rightWallZs[0]]} facingAxis="x" />
      <PosterPanel position={[rightWallX, POSTER_ELEVATION, rightWallZs[1]]} facingAxis="x" accentColor="#F97316" />
      <TvScreen position={[rightWallX, TV_ELEVATION, rightWallZs[2]]} facingAxis="x" />

      {/* Flanking the door against the solid wall segment, not blocking the
       * doorway itself — see docs/superpowers/specs/2026-07-06-entrance-door-
       * and-npc-lifecycle-design.md. */}
      <ReceptionDesk position={[-3.2, 0, entranceZ]} />
      <CheckInTerminal position={[-1.7, 0, entranceZ - 0.3]} />
      <PottedPlant position={[-1.9, 0, entranceZ]} />
      <PottedPlant position={[1.9, 0, entranceZ]} />
      <BrandEmblem position={[-4, 2.5, entranceWallInsetZ]} />

      {/* New this pass: bench, wall clock, speakers, fire safety, cleaning
       * station — placed in the open floor/wall space nothing above already
       * occupies (the entrance waiting area, the bare back-wall center, high
       * on the side walls, and the open floor just outside the equipment
       * cluster). */}
      <GymBench position={[3.2, 0, entranceZ]} rotationY={Math.PI / 2} />

      <WallClock position={[0, 2.6, bounds.minZ + WALL_MOUNT_INSET]} facingAxis="z" />

      <WallSpeaker position={[leftWallX, 3.5, 0]} facingAxis="x" />
      <WallSpeaker position={[rightWallX, 3.5, 0]} facingAxis="x" />

      <FireExtinguisher position={[-2.6, 1.0, entranceWallInsetZ]} facingAxis="z" />

      <CleaningStation position={[3, 0, -3]} />
    </>
  );
}
