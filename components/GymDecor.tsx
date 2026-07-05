import type { PlayAreaBounds } from "@/components/GymFloor3D";

const MIRROR_FRAME_COLOR = "#f2f3f5";
const MIRROR_GLASS_COLOR = "#c7cad1";
/** Wall is centered on minX/minZ with WALL_THICKNESS=0.3 (see GymFloor3D.tsx),
 * so its inner face sits 0.15 units toward the room from that center — this
 * clears it with a small additional gap. */
const MIRROR_WALL_INSET = 0.2;
const MIRROR_HEIGHT = 1.6;
const MIRROR_ELEVATION = 1.1;

const DECOR_WALL_INSET = 1.4;
const CARDIO_ACCENT_COLOR = "#38BDF8";

type FacingAxis = "x" | "z";

/** A framed wall mirror — a white-bordered backing box with a smaller,
 * high-specular glass box offset slightly toward the room so it reads as
 * sitting in front of the frame rather than flush with it. `facingAxis`
 * picks which dimension is "thin" (the wall's normal) without needing a
 * rotation transform: "x" for the left/right walls, "z" for the back wall. */
function MirrorPanel({
  position,
  panelWidth,
  facingAxis,
}: {
  position: [number, number, number];
  panelWidth: number;
  facingAxis: FacingAxis;
}) {
  const frameThinDepth = 0.05;
  const glassThinDepth = 0.03;

  const frameArgs: [number, number, number] =
    facingAxis === "x"
      ? [frameThinDepth, MIRROR_HEIGHT + 0.08, panelWidth + 0.08]
      : [panelWidth + 0.08, MIRROR_HEIGHT + 0.08, frameThinDepth];

  const glassArgs: [number, number, number] =
    facingAxis === "x"
      ? [glassThinDepth, MIRROR_HEIGHT, panelWidth]
      : [panelWidth, MIRROR_HEIGHT, glassThinDepth];

  const glassOffset: [number, number, number] = facingAxis === "x" ? [0.03, 0, 0] : [0, 0, 0.03];

  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={frameArgs} />
        <meshStandardMaterial color={MIRROR_FRAME_COLOR} roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={glassOffset}>
        <boxGeometry args={glassArgs} />
        <meshStandardMaterial color={MIRROR_GLASS_COLOR} roughness={0.05} metalness={0.9} />
      </mesh>
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
  const matColors = ["#8B5CF6", "#38BDF8", "#4ADE80"];

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

type GymDecorProps = {
  bounds: PlayAreaBounds;
  unlockedZones: string[];
};

/** All interior decor in one place: mirrors along the left wall (always) and
 * the back wall behind Iron Vault (only once that zone is unlocked, since
 * before that the back wall sits right where the Smoothie Bar/Locker Room
 * already are), plus a small line of amenities set back from the left wall.
 * Everything is positioned from `bounds` rather than fixed coordinates, so it
 * all slides outward the same way the walls/neon trim do as zones unlock.
 * Geometry is deliberately simple (boxes, cylinders, one torus) — no new
 * materials/textures, same cost class as the rest of the scene's decor. */
export function GymDecor({ bounds, unlockedZones }: GymDecorProps) {
  const leftWallX = bounds.minX + MIRROR_WALL_INSET;
  const leftMirrorZs = [
    bounds.minZ + (bounds.maxZ - bounds.minZ) * 0.25,
    bounds.minZ + (bounds.maxZ - bounds.minZ) * 0.5,
    bounds.minZ + (bounds.maxZ - bounds.minZ) * 0.75,
  ];

  const decorX = bounds.minX + DECOR_WALL_INSET;
  const hasIronVault = unlockedZones.includes("iron_vault");

  return (
    <>
      {leftMirrorZs.map((z) => (
        <MirrorPanel
          key={z}
          position={[leftWallX, MIRROR_ELEVATION, z]}
          panelWidth={2.2}
          facingAxis="x"
        />
      ))}

      {hasIronVault && (
        <MirrorPanel
          position={[-15, MIRROR_ELEVATION, bounds.minZ + MIRROR_WALL_INSET]}
          panelWidth={4}
          facingAxis="z"
        />
      )}

      <WaterCoolerStation position={[decorX, 0, -4]} />
      <WeightTree position={[decorX, 0, 0]} />
      <YogaBasket position={[decorX, 0, 4]} />
    </>
  );
}
