import { useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber/native";
import type { Group } from "three";
import type { NpcRuntime } from "./GymNpcs";

/** Matches GymNpcs.tsx's WALK_BOB_FREQUENCY by value rather than importing
 * it — GymNpcs.tsx imports NpcBody (a value) from this file, so importing a
 * value back would create a circular import; this codebase's established
 * pattern for that situation (see GymDecor.tsx's BRAND_COLOR comment) is to
 * duplicate the constant by value instead. Kept equal so limb swing stays
 * in sync with the existing footstep bob. */
const LIMB_SWING_FREQUENCY = 6;
const LIMB_SWING_AMPLITUDE = 0.6;
const ELBOW_KNEE_BEND_AMPLITUDE = 0.9;
/** Phase offset so the elbow/knee bend peaks during the forward part of the
 * swing rather than at its extremes. */
const ELBOW_KNEE_PHASE_OFFSET = 0.5;
/** How quickly a joint eases toward its target rotation each frame —
 * applies both when easing into the walk-cycle targets and when easing
 * back to neutral (rotation 0) in every non-walking state. */
const JOINT_EASE_RATE = 8;

const SKIN_COLOR = "#e7c9a9";
const FOOT_COLOR = "#2a2a2e";

const HEAD_RADIUS = 0.14;
const CHEST_WIDTH = 0.42;
const CHEST_HEIGHT = 0.18;
const CHEST_DEPTH = 0.22;
const WAIST_WIDTH = 0.26;
const WAIST_HEIGHT = 0.14;
const WAIST_DEPTH = 0.18;
const UPPER_ARM_LENGTH = 0.3;
const UPPER_ARM_WIDTH = 0.11;
const BICEP_RADIUS = 0.08;
const FOREARM_LENGTH = 0.28;
const FOREARM_WIDTH = 0.09;
const THIGH_LENGTH = 0.32;
const THIGH_WIDTH = 0.14;
const SHIN_LENGTH = 0.3;
const SHIN_WIDTH = 0.11;
const FOOT_WIDTH = 0.14;
const FOOT_HEIGHT = 0.06;
const FOOT_DEPTH = 0.22;
/** Every joint below (elbow, knee, ankle) sits two differently-colored
 * segments end-to-end. Placed exactly flush, their faces are perfectly
 * coincident — a textbook z-fighting setup, camera-angle-independent,
 * that reads as the two colors flickering against each other right at the
 * joint. Each child segment's proximal (joint-facing) end is extended this
 * far into its parent instead, so the seam is always hidden inside solid
 * geometry rather than exactly at its surface. Small enough to stay
 * invisible at this model's scale, comfortably less than the shortest
 * parent segment it embeds into. */
const JOINT_OVERLAP = 0.03;

// --- Vertical layout, built bottom-up so every segment sits flush against
// the one below it, with the feet's bottom at y=0 (floor level, matching
// how the outer group in GymNpcs.tsx positions the whole NPC). ---
const KNEE_PIVOT_Y = FOOT_HEIGHT + SHIN_LENGTH;
const HIP_PIVOT_Y = KNEE_PIVOT_Y + THIGH_LENGTH;
const WAIST_BOTTOM_Y = HIP_PIVOT_Y;
const WAIST_TOP_Y = WAIST_BOTTOM_Y + WAIST_HEIGHT;
const CHEST_BOTTOM_Y = WAIST_TOP_Y;
const CHEST_TOP_Y = CHEST_BOTTOM_Y + CHEST_HEIGHT;
const SHOULDER_PIVOT_Y = CHEST_TOP_Y - 0.06;
const SHOULDER_PIVOT_X = CHEST_WIDTH / 2 + 0.02;
const HIP_PIVOT_X = WAIST_WIDTH / 2 - 0.03;

/** Eases a joint pivot group's local rotation toward `target`, guarded for
 * the first frame or two before the callback ref has fired. Shared by all
 * 8 joint pivots below — both the walk-cycle swing and the neutral-pose
 * ease-back use the same rate, so a walk-to-stop transition doesn't pop. */
function easeRotationX(ref: MutableRefObject<Group | null>, target: number, delta: number) {
  if (!ref.current) return;
  ref.current.rotation.x += (target - ref.current.rotation.x) * (1 - Math.exp(-JOINT_EASE_RATE * delta));
}

type NpcBodyProps = {
  npc: NpcRuntime;
  shirtColor: string;
  accentColor: string;
};

/** Segmented humanoid rig: tapered two-box torso, head, two-segment arms
 * (shoulder+elbow pivots, bicep bulge) and legs (hip+knee pivots), feet.
 * Runs its own useFrame, independent of GymNpcs.tsx's — driven by the live
 * `npc` object (see the Design Note in this task's plan entry for why a
 * plain `state` prop would not work here), mutating its own joint pivot
 * groups directly, exactly like the outer group in GymNpcs.tsx already
 * animates position/rotation without React re-renders. */
export function NpcBody({ npc, shirtColor, accentColor }: NpcBodyProps) {
  const leftShoulderRef = useRef<Group | null>(null);
  const rightShoulderRef = useRef<Group | null>(null);
  const leftElbowRef = useRef<Group | null>(null);
  const rightElbowRef = useRef<Group | null>(null);
  const leftHipRef = useRef<Group | null>(null);
  const rightHipRef = useRef<Group | null>(null);
  const leftKneeRef = useRef<Group | null>(null);
  const rightKneeRef = useRef<Group | null>(null);

  useFrame(({ clock }, delta) => {
    const isWalking =
      npc.state === "walkingToEquipment" || npc.state === "walkingToZone" || npc.state === "walkingToBar";
    const phase = (clock.elapsedTime + npc.animationSeed) * LIMB_SWING_FREQUENCY;

    const leftShoulderTarget = isWalking ? Math.sin(phase) * LIMB_SWING_AMPLITUDE : 0;
    const rightShoulderTarget = isWalking ? -Math.sin(phase) * LIMB_SWING_AMPLITUDE : 0;
    const leftHipTarget = isWalking ? -Math.sin(phase) * LIMB_SWING_AMPLITUDE : 0;
    const rightHipTarget = isWalking ? Math.sin(phase) * LIMB_SWING_AMPLITUDE : 0;
    const leftElbowTarget = isWalking
      ? Math.max(0, Math.sin(phase + ELBOW_KNEE_PHASE_OFFSET)) * ELBOW_KNEE_BEND_AMPLITUDE
      : 0;
    const rightElbowTarget = isWalking
      ? Math.max(0, Math.sin(-phase + ELBOW_KNEE_PHASE_OFFSET)) * ELBOW_KNEE_BEND_AMPLITUDE
      : 0;
    const leftKneeTarget = isWalking
      ? Math.max(0, Math.sin(-phase + ELBOW_KNEE_PHASE_OFFSET)) * ELBOW_KNEE_BEND_AMPLITUDE
      : 0;
    const rightKneeTarget = isWalking
      ? Math.max(0, Math.sin(phase + ELBOW_KNEE_PHASE_OFFSET)) * ELBOW_KNEE_BEND_AMPLITUDE
      : 0;

    easeRotationX(leftShoulderRef, leftShoulderTarget, delta);
    easeRotationX(rightShoulderRef, rightShoulderTarget, delta);
    easeRotationX(leftHipRef, leftHipTarget, delta);
    easeRotationX(rightHipRef, rightHipTarget, delta);
    easeRotationX(leftElbowRef, leftElbowTarget, delta);
    easeRotationX(rightElbowRef, rightElbowTarget, delta);
    easeRotationX(leftKneeRef, leftKneeTarget, delta);
    easeRotationX(rightKneeRef, rightKneeTarget, delta);
  });

  return (
    <group>
      {/* Head */}
      <mesh position={[0, CHEST_TOP_Y + HEAD_RADIUS, 0]} castShadow>
        <sphereGeometry args={[HEAD_RADIUS, 12, 12]} />
        <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} metalness={0} />
      </mesh>

      {/* Chest (wider, upper torso) */}
      <mesh position={[0, (CHEST_BOTTOM_Y + CHEST_TOP_Y) / 2, 0]} castShadow>
        <boxGeometry args={[CHEST_WIDTH, CHEST_HEIGHT, CHEST_DEPTH]} />
        <meshStandardMaterial color={shirtColor} roughness={0.5} metalness={0.1} />
      </mesh>

      {/* Waist (narrower, lower torso) — stacked with the chest box to read
          as a tapered torso silhouette without custom (non-box) geometry. */}
      <mesh position={[0, (WAIST_BOTTOM_Y + WAIST_TOP_Y) / 2, 0]} castShadow>
        <boxGeometry args={[WAIST_WIDTH, WAIST_HEIGHT, WAIST_DEPTH]} />
        <meshStandardMaterial color={shirtColor} roughness={0.5} metalness={0.1} />
      </mesh>

      {/* Left arm */}
      <group position={[-SHOULDER_PIVOT_X, SHOULDER_PIVOT_Y, 0]} ref={(el) => { leftShoulderRef.current = el; }}>
        <mesh position={[0, -UPPER_ARM_LENGTH / 2, 0]} castShadow>
          <boxGeometry args={[UPPER_ARM_WIDTH, UPPER_ARM_LENGTH, UPPER_ARM_WIDTH]} />
          <meshStandardMaterial color={shirtColor} roughness={0.5} metalness={0.1} />
        </mesh>
        <mesh position={[0, -0.09, 0]} castShadow>
          <sphereGeometry args={[BICEP_RADIUS, 10, 10]} />
          <meshStandardMaterial color={shirtColor} roughness={0.5} metalness={0.1} />
        </mesh>
        <group position={[0, -UPPER_ARM_LENGTH, 0]} ref={(el) => { leftElbowRef.current = el; }}>
          <mesh position={[0, -FOREARM_LENGTH / 2 + JOINT_OVERLAP / 2, 0]} castShadow>
            <boxGeometry args={[FOREARM_WIDTH, FOREARM_LENGTH + JOINT_OVERLAP, FOREARM_WIDTH]} />
            <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} metalness={0} />
          </mesh>
        </group>
      </group>

      {/* Right arm (mirrored) */}
      <group position={[SHOULDER_PIVOT_X, SHOULDER_PIVOT_Y, 0]} ref={(el) => { rightShoulderRef.current = el; }}>
        <mesh position={[0, -UPPER_ARM_LENGTH / 2, 0]} castShadow>
          <boxGeometry args={[UPPER_ARM_WIDTH, UPPER_ARM_LENGTH, UPPER_ARM_WIDTH]} />
          <meshStandardMaterial color={shirtColor} roughness={0.5} metalness={0.1} />
        </mesh>
        <mesh position={[0, -0.09, 0]} castShadow>
          <sphereGeometry args={[BICEP_RADIUS, 10, 10]} />
          <meshStandardMaterial color={shirtColor} roughness={0.5} metalness={0.1} />
        </mesh>
        <group position={[0, -UPPER_ARM_LENGTH, 0]} ref={(el) => { rightElbowRef.current = el; }}>
          <mesh position={[0, -FOREARM_LENGTH / 2 + JOINT_OVERLAP / 2, 0]} castShadow>
            <boxGeometry args={[FOREARM_WIDTH, FOREARM_LENGTH + JOINT_OVERLAP, FOREARM_WIDTH]} />
            <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} metalness={0} />
          </mesh>
        </group>
      </group>

      {/* Left leg */}
      <group position={[-HIP_PIVOT_X, HIP_PIVOT_Y, 0]} ref={(el) => { leftHipRef.current = el; }}>
        <mesh position={[0, -THIGH_LENGTH / 2, 0]} castShadow>
          <boxGeometry args={[THIGH_WIDTH, THIGH_LENGTH, THIGH_WIDTH]} />
          <meshStandardMaterial color={accentColor} roughness={0.6} metalness={0.05} />
        </mesh>
        <group position={[0, -THIGH_LENGTH, 0]} ref={(el) => { leftKneeRef.current = el; }}>
          <mesh position={[0, -SHIN_LENGTH / 2 + JOINT_OVERLAP / 2, 0]} castShadow>
            <boxGeometry args={[SHIN_WIDTH, SHIN_LENGTH + JOINT_OVERLAP, SHIN_WIDTH]} />
            <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} metalness={0} />
          </mesh>
          <mesh position={[0, -SHIN_LENGTH - FOOT_HEIGHT / 2 + JOINT_OVERLAP / 2, 0.05]} castShadow>
            <boxGeometry args={[FOOT_WIDTH, FOOT_HEIGHT + JOINT_OVERLAP, FOOT_DEPTH]} />
            <meshStandardMaterial color={FOOT_COLOR} roughness={0.7} metalness={0.05} />
          </mesh>
        </group>
      </group>

      {/* Right leg (mirrored) */}
      <group position={[HIP_PIVOT_X, HIP_PIVOT_Y, 0]} ref={(el) => { rightHipRef.current = el; }}>
        <mesh position={[0, -THIGH_LENGTH / 2, 0]} castShadow>
          <boxGeometry args={[THIGH_WIDTH, THIGH_LENGTH, THIGH_WIDTH]} />
          <meshStandardMaterial color={accentColor} roughness={0.6} metalness={0.05} />
        </mesh>
        <group position={[0, -THIGH_LENGTH, 0]} ref={(el) => { rightKneeRef.current = el; }}>
          <mesh position={[0, -SHIN_LENGTH / 2 + JOINT_OVERLAP / 2, 0]} castShadow>
            <boxGeometry args={[SHIN_WIDTH, SHIN_LENGTH + JOINT_OVERLAP, SHIN_WIDTH]} />
            <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} metalness={0} />
          </mesh>
          <mesh position={[0, -SHIN_LENGTH - FOOT_HEIGHT / 2 + JOINT_OVERLAP / 2, 0.05]} castShadow>
            <boxGeometry args={[FOOT_WIDTH, FOOT_HEIGHT + JOINT_OVERLAP, FOOT_DEPTH]} />
            <meshStandardMaterial color={FOOT_COLOR} roughness={0.7} metalness={0.05} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
