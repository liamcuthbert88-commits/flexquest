import { useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber/native";
import type { Group } from "three";

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

/** Every joint (elbow, knee, ankle) sits two differently-colored segments
 * end-to-end. Placed exactly flush, their faces are perfectly coincident —
 * a textbook z-fighting setup, camera-angle-independent, that reads as the
 * two colors flickering against each other right at the joint. Each child
 * segment's proximal (joint-facing) end is extended this far into its
 * parent instead, so the seam is always hidden inside solid geometry
 * rather than exactly at its surface. Small enough to stay invisible at
 * this model's scale, comfortably less than the shortest parent segment it
 * embeds into (true for both MEMBER_BUILD and STAFF_BUILD below). */
const JOINT_OVERLAP = 0.03;

/** All the tunable dimensions for one body build. Every limb *length*
 * (upperArmLength, forearmLength, thighLength, shinLength) and footHeight
 * must stay identical across every preset — only width/depth differ. That
 * keeps every build the same overall standing height, and keeps the
 * vertical pivot layout (see computeLayout below) consistent regardless of
 * which preset is in use. */
export type BodyPreset = {
  headRadius: number;
  chestWidth: number;
  chestHeight: number;
  chestDepth: number;
  waistWidth: number;
  waistHeight: number;
  waistDepth: number;
  upperArmLength: number;
  upperArmWidth: number;
  bicepRadius: number;
  forearmLength: number;
  forearmWidth: number;
  thighLength: number;
  thighWidth: number;
  shinLength: number;
  shinWidth: number;
  footWidth: number;
  footHeight: number;
  footDepth: number;
};

/** The gym members' muscular "gym rat" build — these are the exact
 * dimensions Phase A shipped with, now parameterized instead of hardcoded
 * module constants. */
export const MEMBER_BUILD: BodyPreset = {
  headRadius: 0.14,
  chestWidth: 0.42,
  chestHeight: 0.18,
  chestDepth: 0.22,
  waistWidth: 0.26,
  waistHeight: 0.14,
  waistDepth: 0.18,
  upperArmLength: 0.3,
  upperArmWidth: 0.11,
  bicepRadius: 0.08,
  forearmLength: 0.28,
  forearmWidth: 0.09,
  thighLength: 0.32,
  thighWidth: 0.14,
  shinLength: 0.3,
  shinWidth: 0.11,
  footWidth: 0.14,
  footHeight: 0.06,
  footDepth: 0.22,
};

/** Staff's leaner, average-adult build — same overall height as
 * MEMBER_BUILD (every length/footHeight value matches exactly), narrower
 * everywhere else. */
export const STAFF_BUILD: BodyPreset = {
  headRadius: 0.13,
  chestWidth: 0.32,
  chestHeight: 0.16,
  chestDepth: 0.19,
  waistWidth: 0.22,
  waistHeight: 0.14,
  waistDepth: 0.16,
  upperArmLength: 0.3,
  upperArmWidth: 0.08,
  bicepRadius: 0.055,
  forearmLength: 0.28,
  forearmWidth: 0.075,
  thighLength: 0.32,
  thighWidth: 0.11,
  shinLength: 0.3,
  shinWidth: 0.09,
  footWidth: 0.12,
  footHeight: 0.06,
  footDepth: 0.2,
};

type BodyLayout = {
  chestTopY: number;
  chestBottomY: number;
  waistTopY: number;
  waistBottomY: number;
  hipPivotY: number;
  hipPivotX: number;
  shoulderPivotY: number;
  shoulderPivotX: number;
};

/** Derives every vertical/horizontal pivot position from a preset's raw
 * dimensions — the same math Phase A had as module-level constants
 * (KNEE_PIVOT_Y, HIP_PIVOT_X, etc.), now a pure function so it works for
 * any preset. Built bottom-up so every segment sits flush against the one
 * below it, with the feet's bottom at y=0 (floor level, matching how the
 * outer group in GymNpcs.tsx/GymStaff.tsx positions the whole character). */
function computeLayout(preset: BodyPreset): BodyLayout {
  const kneePivotY = preset.footHeight + preset.shinLength;
  const hipPivotY = kneePivotY + preset.thighLength;
  const waistBottomY = hipPivotY;
  const waistTopY = waistBottomY + preset.waistHeight;
  const chestBottomY = waistTopY;
  const chestTopY = chestBottomY + preset.chestHeight;
  const shoulderPivotY = chestTopY - 0.06;
  const shoulderPivotX = preset.chestWidth / 2 + 0.02;
  const hipPivotX = preset.waistWidth / 2 - 0.03;
  return { chestTopY, chestBottomY, waistTopY, waistBottomY, hipPivotY, hipPivotX, shoulderPivotY, shoulderPivotX };
}

/** Eases a joint pivot group's local rotation toward `target`, guarded for
 * the first frame or two before the callback ref has fired. Shared by all
 * 8 joint pivots below — both the walk-cycle swing and the neutral-pose
 * ease-back use the same rate, so a walk-to-stop transition doesn't pop. */
function easeRotationX(ref: MutableRefObject<Group | null>, target: number, delta: number) {
  if (!ref.current) return;
  ref.current.rotation.x += (target - ref.current.rotation.x) * (1 - Math.exp(-JOINT_EASE_RATE * delta));
}

type NpcBodyProps = {
  /** Called fresh every frame inside this component's own useFrame — a
   * closure over a live ref/object (e.g. () => someRuntimeRef.current.state
   * === "walking...") always reads whatever is current at call time, not
   * creation time, which is what makes this safe even though neither
   * GymNpcs.tsx nor GymStaff.tsx re-render on every state change (their
   * state machines mutate runtime objects in place, not via setState). */
  getIsWalking: () => boolean;
  /** Set once per entity at creation and never changes for that entity's
   * lifetime — safe as a plain prop, no live-read concern applies here the
   * way it does for getIsWalking. */
  animationSeed: number;
  preset: BodyPreset;
  shirtColor: string;
  accentColor: string;
  /** Rendered inside the right elbow pivot group, positioned at the
   * forearm's distal (hand) end — inherits both shoulder and elbow
   * rotation automatically, so anything passed here swings naturally with
   * the arm. Omitted entirely for characters holding nothing. */
  rightHandProp?: ReactNode;
};

/** Segmented humanoid rig: tapered two-box torso, head, two-segment arms
 * (shoulder+elbow pivots, bicep bulge) and legs (hip+knee pivots), feet.
 * Runs its own useFrame, independent of its caller's — driven by
 * getIsWalking()/animationSeed (see NpcBodyProps' doc comments for why
 * this is safe), mutating its own joint pivot groups directly, exactly
 * like the outer group in GymNpcs.tsx/GymStaff.tsx already animates
 * position/rotation without React re-renders. */
export function NpcBody({
  getIsWalking,
  animationSeed,
  preset,
  shirtColor,
  accentColor,
  rightHandProp,
}: NpcBodyProps) {
  const layout = useMemo(() => computeLayout(preset), [preset]);

  const leftShoulderRef = useRef<Group | null>(null);
  const rightShoulderRef = useRef<Group | null>(null);
  const leftElbowRef = useRef<Group | null>(null);
  const rightElbowRef = useRef<Group | null>(null);
  const leftHipRef = useRef<Group | null>(null);
  const rightHipRef = useRef<Group | null>(null);
  const leftKneeRef = useRef<Group | null>(null);
  const rightKneeRef = useRef<Group | null>(null);

  useFrame(({ clock }, delta) => {
    const isWalking = getIsWalking();
    const phase = (clock.elapsedTime + animationSeed) * LIMB_SWING_FREQUENCY;

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
      <mesh position={[0, layout.chestTopY + preset.headRadius, 0]} castShadow>
        <sphereGeometry args={[preset.headRadius, 12, 12]} />
        <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} metalness={0} />
      </mesh>

      {/* Chest (wider, upper torso) */}
      <mesh position={[0, (layout.chestBottomY + layout.chestTopY) / 2, 0]} castShadow>
        <boxGeometry args={[preset.chestWidth, preset.chestHeight, preset.chestDepth]} />
        <meshStandardMaterial color={shirtColor} roughness={0.5} metalness={0.1} />
      </mesh>

      {/* Waist (narrower, lower torso) — stacked with the chest box to read
          as a tapered torso silhouette without custom (non-box) geometry. */}
      <mesh position={[0, (layout.waistBottomY + layout.waistTopY) / 2, 0]} castShadow>
        <boxGeometry args={[preset.waistWidth, preset.waistHeight, preset.waistDepth]} />
        <meshStandardMaterial color={shirtColor} roughness={0.5} metalness={0.1} />
      </mesh>

      {/* Left arm */}
      <group
        position={[-layout.shoulderPivotX, layout.shoulderPivotY, 0]}
        ref={(el) => { leftShoulderRef.current = el; }}
      >
        <mesh position={[0, -preset.upperArmLength / 2, 0]} castShadow>
          <boxGeometry args={[preset.upperArmWidth, preset.upperArmLength, preset.upperArmWidth]} />
          <meshStandardMaterial color={shirtColor} roughness={0.5} metalness={0.1} />
        </mesh>
        <mesh position={[0, -0.09, 0]} castShadow>
          <sphereGeometry args={[preset.bicepRadius, 10, 10]} />
          <meshStandardMaterial color={shirtColor} roughness={0.5} metalness={0.1} />
        </mesh>
        <group position={[0, -preset.upperArmLength, 0]} ref={(el) => { leftElbowRef.current = el; }}>
          <mesh position={[0, -preset.forearmLength / 2 + JOINT_OVERLAP / 2, 0]} castShadow>
            <boxGeometry args={[preset.forearmWidth, preset.forearmLength + JOINT_OVERLAP, preset.forearmWidth]} />
            <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} metalness={0} />
          </mesh>
        </group>
      </group>

      {/* Right arm (mirrored) */}
      <group
        position={[layout.shoulderPivotX, layout.shoulderPivotY, 0]}
        ref={(el) => { rightShoulderRef.current = el; }}
      >
        <mesh position={[0, -preset.upperArmLength / 2, 0]} castShadow>
          <boxGeometry args={[preset.upperArmWidth, preset.upperArmLength, preset.upperArmWidth]} />
          <meshStandardMaterial color={shirtColor} roughness={0.5} metalness={0.1} />
        </mesh>
        <mesh position={[0, -0.09, 0]} castShadow>
          <sphereGeometry args={[preset.bicepRadius, 10, 10]} />
          <meshStandardMaterial color={shirtColor} roughness={0.5} metalness={0.1} />
        </mesh>
        <group position={[0, -preset.upperArmLength, 0]} ref={(el) => { rightElbowRef.current = el; }}>
          <mesh position={[0, -preset.forearmLength / 2 + JOINT_OVERLAP / 2, 0]} castShadow>
            <boxGeometry args={[preset.forearmWidth, preset.forearmLength + JOINT_OVERLAP, preset.forearmWidth]} />
            <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} metalness={0} />
          </mesh>
          {rightHandProp && <group position={[0, -preset.forearmLength, 0]}>{rightHandProp}</group>}
        </group>
      </group>

      {/* Left leg */}
      <group position={[-layout.hipPivotX, layout.hipPivotY, 0]} ref={(el) => { leftHipRef.current = el; }}>
        <mesh position={[0, -preset.thighLength / 2, 0]} castShadow>
          <boxGeometry args={[preset.thighWidth, preset.thighLength, preset.thighWidth]} />
          <meshStandardMaterial color={accentColor} roughness={0.6} metalness={0.05} />
        </mesh>
        <group position={[0, -preset.thighLength, 0]} ref={(el) => { leftKneeRef.current = el; }}>
          <mesh position={[0, -preset.shinLength / 2 + JOINT_OVERLAP / 2, 0]} castShadow>
            <boxGeometry args={[preset.shinWidth, preset.shinLength + JOINT_OVERLAP, preset.shinWidth]} />
            <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} metalness={0} />
          </mesh>
          <mesh position={[0, -preset.shinLength - preset.footHeight / 2 + JOINT_OVERLAP / 2, 0.05]} castShadow>
            <boxGeometry args={[preset.footWidth, preset.footHeight + JOINT_OVERLAP, preset.footDepth]} />
            <meshStandardMaterial color={FOOT_COLOR} roughness={0.7} metalness={0.05} />
          </mesh>
        </group>
      </group>

      {/* Right leg (mirrored) */}
      <group position={[layout.hipPivotX, layout.hipPivotY, 0]} ref={(el) => { rightHipRef.current = el; }}>
        <mesh position={[0, -preset.thighLength / 2, 0]} castShadow>
          <boxGeometry args={[preset.thighWidth, preset.thighLength, preset.thighWidth]} />
          <meshStandardMaterial color={accentColor} roughness={0.6} metalness={0.05} />
        </mesh>
        <group position={[0, -preset.thighLength, 0]} ref={(el) => { rightKneeRef.current = el; }}>
          <mesh position={[0, -preset.shinLength / 2 + JOINT_OVERLAP / 2, 0]} castShadow>
            <boxGeometry args={[preset.shinWidth, preset.shinLength + JOINT_OVERLAP, preset.shinWidth]} />
            <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} metalness={0} />
          </mesh>
          <mesh position={[0, -preset.shinLength - preset.footHeight / 2 + JOINT_OVERLAP / 2, 0.05]} castShadow>
            <boxGeometry args={[preset.footWidth, preset.footHeight + JOINT_OVERLAP, preset.footDepth]} />
            <meshStandardMaterial color={FOOT_COLOR} roughness={0.7} metalness={0.05} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
