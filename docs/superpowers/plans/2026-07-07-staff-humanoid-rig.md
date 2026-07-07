# Staff Humanoid Rig + Movement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the humanoid rig (`NpcBody`) built for the 3 gym members to the 3 staff roles (Clerk, Trainer, Janitor), with their own leaner build and hand-swung props, without changing any member-facing behavior.

**Architecture:** `components/GymNpcBody.tsx` is refactored so `NpcBody` takes a `BodyPreset` (parameterized dimensions) and a `getIsWalking()` callback instead of a member-specific `NpcRuntime` object, plus an optional `rightHandProp` slot. `components/GymNpcs.tsx`'s one call site is updated to the new interface in the same task (an interface change and its only caller must land together or the branch won't compile). `components/GymStaff.tsx` is rewritten to mount `NpcBody` with the new `STAFF_BUILD` preset for all 3 roles, replacing the old capsule body entirely.

**Tech Stack:** React Native, `@react-three/fiber`, `three`, TypeScript. No test runner in this repo — verification is `npx tsc --noEmit` per task plus a final manual pass.

## Global Constraints

- This branch (`feature/npc-humanoid-rig`) already has the completed Phase A work: `components/GymNpcBody.tsx` exists with `NpcBody({ npc: NpcRuntime, shirtColor, accentColor })`, wired into `components/GymNpcs.tsx`, plus a `JOINT_OVERLAP` z-fighting fix. This plan builds on top of that, not from scratch.
- Every limb *length* (`upperArmLength`, `forearmLength`, `thighLength`, `shinLength`) and `footHeight` must be identical between `MEMBER_BUILD` and `STAFF_BUILD` — only width/depth differ. This keeps both builds the same overall height and means the vertical pivot layout is preset-independent in practice (though computed generically from `preset` either way).
- `getIsWalking` is a callback (`() => boolean`), not a snapshot value — this preserves the "always reads the live, current value" property the old `npc: NpcRuntime` prop had, without depending on `NpcRuntime`'s specific shape.
- `animationSeed` stays a plain `number` prop (not a callback) — it's set once per entity at creation and never changes for that entity's lifetime, so no staleness concern applies to it, unlike `state`.
- No behavior change for the 3 existing members — this is a pure interface refactor for them, not a feature change.
- Staff roles keep their existing single flat color per role (Clerk `#EF4444`, Trainer `#22C55E`, Janitor `#EAB308`) for both `shirtColor` and `accentColor` — no new color decisions.
- No `Math.random()` anywhere (matches this project's rule against randomness in anything needing stability) — `animationSeed` per staff role is a fixed literal.
- No automated tests exist in this repo — verification is `npx tsc --noEmit` exiting 0, plus a final manual pass (Task 3).

---

### Task 1: Refactor `NpcBody`'s interface (`GymNpcBody.tsx`) and update its call site (`GymNpcs.tsx`)

**Files:**
- Modify: `components/GymNpcBody.tsx` (full rewrite)
- Modify: `components/GymNpcs.tsx:444` (the one `<NpcBody>` call site)

**Interfaces:**
- Consumes: nothing from other tasks in this plan.
- Produces: `export type BodyPreset`, `export const MEMBER_BUILD: BodyPreset`, `export const STAFF_BUILD: BodyPreset`, `export function NpcBody({ getIsWalking, animationSeed, preset, shirtColor, accentColor, rightHandProp }: { getIsWalking: () => boolean; animationSeed: number; preset: BodyPreset; shirtColor: string; accentColor: string; rightHandProp?: ReactNode }): JSX.Element` — Task 2 mounts this with `preset={STAFF_BUILD}`.

**Why this task changes two files at once:** `NpcBody`'s prop interface is changing. `GymNpcs.tsx:444` is its only current caller. If only `GymNpcBody.tsx` changed, the branch would not compile (`GymNpcs.tsx` would still pass the old `npc={...}` prop to a component that no longer accepts it) — these two edits must land together for `npx tsc --noEmit` to pass at the end of this task, exactly the same discipline this plan's own Global Constraints call for.

- [ ] **Step 1: Rewrite `components/GymNpcBody.tsx` completely**

Replace the entire file with:

```tsx
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
```

Note: `rightHandProp` is attached only inside the **right** elbow pivot group (both the Trainer's clipboard and Janitor's mop sit on that side already, per the spec) — the left arm has no equivalent slot.

- [ ] **Step 2: Update `components/GymNpcs.tsx`'s `<NpcBody>` call site**

Change (currently `components/GymNpcs.tsx:444`):

```tsx
            <NpcBody npc={npcRuntimesRef.current[i]} shirtColor={color} accentColor={accentColor} />
```

to:

```tsx
            <NpcBody
              getIsWalking={() => {
                const s = npcRuntimesRef.current[i].state;
                return s === "walkingToEquipment" || s === "walkingToZone" || s === "walkingToBar";
              }}
              animationSeed={npcRuntimesRef.current[i].animationSeed}
              preset={MEMBER_BUILD}
              shirtColor={color}
              accentColor={accentColor}
            />
```

Then update the import line near the top of `components/GymNpcs.tsx` (currently `import { NpcBody } from "./GymNpcBody";`) to also bring in `MEMBER_BUILD`:

```ts
import { NpcBody, MEMBER_BUILD } from "./GymNpcBody";
```

- [ ] **Step 3: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
cd ~/FlexQuest && git add components/GymNpcBody.tsx components/GymNpcs.tsx
git commit -m "$(cat <<'EOF'
refactor: parameterize NpcBody with a BodyPreset, decouple from NpcRuntime

NpcBody now takes getIsWalking()/animationSeed/preset/rightHandProp
instead of the member-specific npc: NpcRuntime object, so GymStaff.tsx
(next task) can reuse it with its own build and hand-attached props.
getIsWalking is a callback rather than a snapshot, preserving the same
"always reads the live current value" property the old live-object
prop had, without depending on NpcRuntime's specific shape.

GymNpcs.tsx's call site is updated in this same commit since an
interface change and its only caller must land together for the
branch to compile — no behavior change for the 3 existing members.
EOF
)"
```

---

### Task 2: Rewrite `components/GymStaff.tsx` to mount `NpcBody`

**Files:**
- Modify: `components/GymStaff.tsx` (full rewrite)

**Interfaces:**
- Consumes: `NpcBody`, `STAFF_BUILD` from `./GymNpcBody` (Task 1).
- Produces: nothing new exported — `GymStaffProps`/`GymStaff` keep their existing external signature.

- [ ] **Step 1: Rewrite `components/GymStaff.tsx` completely**

Replace the entire file with:

```tsx
import { useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber/native";
import type { Group } from "three";
import {
  EQUIPMENT_CATALOG,
  getEquipmentWorldPosition,
  type EquipmentCustomization,
} from "@/constants/equipment";
import { ZONE_LANDMARKS, MAIN_FLOOR_ZONE_ID, SMOOTHIE_BAR_POSITION } from "@/constants/zones";
import { lerpAngle, moveToward } from "@/components/GymNpcs";
import { NpcBody, STAFF_BUILD } from "@/components/GymNpcBody";

const CLERK_PACE_RANGE = 0.8;
const CLERK_PACE_SPEED = 0.5;
const TRAINER_RETARGET_INTERVAL_SECONDS = 4;
const IRON_VAULT_CENTER: [number, number, number] = [-15, 0, -10];
const MAIN_FLOOR_LANDMARK: [number, number, number] = [0, 0, 6];
const ROTATION_SMOOTHING_RATE = 6;

/** Fixed per-role phase offsets for NpcBody's walk-cycle animation — not
 * randomized (this project avoids Math.random() for anything that needs
 * to stay stable), just distinct literals so the 3 staff don't visually
 * bob/swing in perfect unison with each other or with the 3 members. */
const CLERK_ANIMATION_SEED = 0.7;
const TRAINER_ANIMATION_SEED = 2.1;
const JANITOR_ANIMATION_SEED = 3.4;

type TrainerRuntime = {
  position: [number, number, number];
  target: [number, number, number];
  retargetTimer: number;
  /** Visual-only, same technique as GymNpcs.tsx — visible here thanks to
   * the clipboard prop's asymmetry, unlike a bare capsule. */
  facingAngle: number;
  /** Set from moveToward's own `arrived` return each frame below — read by
   * NpcBody's getIsWalking so its walk-cycle animation only runs while
   * actually mid-move, not while standing at (or just arrived at) a
   * target. */
  isWalking: boolean;
};

type JanitorRuntime = {
  position: [number, number, number];
  target: [number, number, number];
  landmarkIndex: number;
  facingAngle: number;
  isWalking: boolean;
};

type GymStaffProps = {
  hiredStaffIds: string[];
  unlockedZones: string[];
  occupancyRef: MutableRefObject<Record<string, boolean>>;
  equipmentCustomizations: Record<string, EquipmentCustomization>;
};

/** Separate from GymNpcs.tsx — each role's AI is qualitatively different
 * from the regular member work/recharge cycle (no state machine here, just
 * simple role-specific patrols), so it doesn't share that component's
 * state shape. Bodies are NpcBody with STAFF_BUILD (see GymNpcBody.tsx) —
 * same rig/animation as members, leaner proportions, role distinction
 * comes from color and (for the Trainer/Janitor) a hand-held prop. */
export function GymStaff({ hiredStaffIds, unlockedZones, occupancyRef, equipmentCustomizations }: GymStaffProps) {
  const clerkGroupRef = useRef<Group>(null);
  const trainerGroupRef = useRef<Group>(null);
  const janitorGroupRef = useRef<Group>(null);

  const trainerRuntime = useRef<TrainerRuntime>({
    position: [...IRON_VAULT_CENTER],
    target: [...IRON_VAULT_CENTER],
    retargetTimer: 0,
    facingAngle: 0,
    isWalking: false,
  });
  const janitorRuntime = useRef<JanitorRuntime>({
    position: [...MAIN_FLOOR_LANDMARK],
    target: [...MAIN_FLOOR_LANDMARK],
    landmarkIndex: 0,
    facingAngle: 0,
    isWalking: false,
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
                occupiedVaultEquipment[Math.floor(Math.random() * occupiedVaultEquipment.length)],
                equipmentCustomizations
              )
            : IRON_VAULT_CENTER;
      }

      const previousPosition = runtime.position;
      const { position, arrived } = moveToward(runtime.position, runtime.target, delta);
      runtime.position = position;
      runtime.isWalking = !arrived;

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
      runtime.isWalking = !arrived;
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
          <NpcBody
            getIsWalking={() => true}
            animationSeed={CLERK_ANIMATION_SEED}
            preset={STAFF_BUILD}
            shirtColor="#EF4444"
            accentColor="#EF4444"
          />
        </group>
      )}

      {isTrainerHired && (
        <group ref={trainerGroupRef} position={IRON_VAULT_CENTER}>
          <NpcBody
            getIsWalking={() => trainerRuntime.current.isWalking}
            animationSeed={TRAINER_ANIMATION_SEED}
            preset={STAFF_BUILD}
            shirtColor="#22C55E"
            accentColor="#22C55E"
            rightHandProp={
              <mesh position={[0.1, -0.05, 0.06]} castShadow>
                <boxGeometry args={[0.12, 0.16, 0.02]} />
                <meshStandardMaterial color="#8a6a45" roughness={0.6} metalness={0} />
              </mesh>
            }
          />
        </group>
      )}

      {isJanitorHired && (
        <group ref={janitorGroupRef} position={MAIN_FLOOR_LANDMARK}>
          <NpcBody
            getIsWalking={() => janitorRuntime.current.isWalking}
            animationSeed={JANITOR_ANIMATION_SEED}
            preset={STAFF_BUILD}
            shirtColor="#EAB308"
            accentColor="#EAB308"
            rightHandProp={
              <mesh position={[0.05, -0.2, 0]} rotation={[0, 0, 0.3]} castShadow>
                <cylinderGeometry args={[0.015, 0.015, 0.7, 8]} />
                <meshStandardMaterial color="#a8a29e" roughness={0.7} metalness={0.1} />
              </mesh>
            }
          />
        </group>
      )}
    </>
  );
}
```

Notes on what changed from the current file:
- `StaffBody` is removed entirely — `NpcBody` replaces it for all 3 roles.
- `trainerClipboardRef` (the old separate wiggle-animation ref) is removed — the clipboard no longer needs its own independent animation; it now moves by inheriting the arm's own walk-cycle rotation via `rightHandProp`.
- `TrainerRuntime`/`JanitorRuntime` each gain `isWalking: boolean` (initialized `false`, matching their existing spawn-at-rest behavior where `target` starts equal to `position`).
- Trainer's `moveToward` call now destructures `arrived` (previously discarded) and sets `runtime.isWalking = !arrived` — Janitor already destructured `arrived` for its landmark-advance logic; it now also feeds `isWalking` the same way.
- The clipboard/mop prop meshes keep their same visual geometry (`boxGeometry args={[0.12, 0.16, 0.02]}` / `cylinderGeometry args={[0.015, 0.015, 0.7, 8]}`) and the mop's existing grip-angle `rotation={[0, 0, 0.3]}`, just repositioned to a small offset relative to the hand attachment point (inside the right elbow pivot group) instead of the old outer-group-relative position.

- [ ] **Step 2: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/FlexQuest && git add components/GymStaff.tsx
git commit -m "$(cat <<'EOF'
feat: give staff the humanoid rig + hand-swung props

Clerk, Trainer, and Janitor now mount NpcBody with STAFF_BUILD instead
of the old capsule body — same rig/animation system the 3 members
already have, leaner proportions, hand-attached clipboard/mop that
swing naturally with arm articulation instead of sitting at a fixed
torso-relative spot. Movement behavior itself (patrol targets, pacing,
retargeting) is unchanged — this only adds limb animation on top of
motion that already existed.
EOF
)"
```

---

### Task 3: Manual verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full-project typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 2: Start the app**

Run: `cd ~/FlexQuest && npx expo start --tunnel --dev-client` (this project requires the custom EAS dev client, not Expo Go)
Expected: Metro starts, tunnel connects, app loads on the installed dev client without crashing.

- [ ] **Step 3: Regression-check the 3 members**

Observe the 3 gym members on the Gym Floor.
Expected: walk cycle, idle sway, and state transitions all look exactly as they did before this plan (this task's Task 1 changed `NpcBody`'s interface but not its behavior for members).

- [ ] **Step 4: Verify the Clerk (hire if not already)**

Observe the Clerk at the Smoothie Bar.
Expected: humanoid rig with the leaner staff build; continuously limb-animated while pacing back and forth — never a static/frozen pose.

- [ ] **Step 5: Verify the Trainer (hire if not already)**

Observe the Trainer patrol toward occupied Iron Vault equipment (or the vault's center if nothing's occupied).
Expected: humanoid rig, walk-cycle limb animation while moving, joints ease to neutral when arrived/standing; the clipboard now swings naturally from the hand instead of sitting fixed against the torso.

- [ ] **Step 6: Verify the Janitor (hire if not already)**

Observe the Janitor patrol between the main floor and unlocked-zone landmarks.
Expected: same as the Trainer — walk-cycle animation while moving, neutral pose while arrived; the mop swings naturally from the hand.

- [ ] **Step 7: Compare builds side by side**

With at least one member and one staff character visible at the same time.
Expected: staff visibly read as leaner/less bulky than members, at the same overall height — not a scaled-down copy, a genuinely different silhouette.

- [ ] **Step 8: Verify shadows and no z-fighting**

Look at the floor beneath each staff character, and closely at their joints (elbow, knee, ankle).
Expected: shadows cast correctly; no flickering/z-fighting at any joint (same `JOINT_OVERLAP` fix as members, now also applied at staff's smaller scale).

- [ ] **Step 9: Report results**

No commit for this task — it's verification only. If any expected behavior doesn't match, note which step failed and return to the relevant task above to fix before considering the plan complete.
