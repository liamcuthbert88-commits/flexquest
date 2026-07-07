# NPC Humanoid Rig (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the gym NPCs' capsule bodies with a real, muscular humanoid rig that has animated limbs (walk cycle + idle neutral pose).

**Architecture:** A new file, `components/GymNpcBody.tsx`, owns the rig geometry and its own per-frame joint animation (shoulder/elbow/hip/knee pivot groups mutated directly via refs, matching this codebase's established ref-mutation animation style). `components/GymNpcs.tsx` mounts one `<NpcBody>` per NPC in place of today's inline capsule mesh block; its own outer-group locomotion/facing/bob animation is untouched.

**Tech Stack:** React Native, `@react-three/fiber`, `three`, TypeScript. No test runner in this repo — verification is `npx tsc --noEmit` per task plus a final manual pass.

## Global Constraints

- One shared muscular build for all 3 NPCs in this phase — no per-NPC proportions (that's a separate future phase).
- Two-segment limbs (upper arm + forearm, thigh + shin) that bend at elbow/knee — not single rigid swinging limbs.
- Muscle look: silhouette (wide shoulders/chest, narrow waist, thick limbs) plus an added bicep-bulge sphere on the upper arm.
- The `workingOut` animation stays exactly as it is today (existing generic exertion bob, computed in `GymNpcs.tsx`) — this plan does not touch it.
- No textures anywhere (matches the rest of the scene) — every segment is a plain primitive (`boxGeometry`/`sphereGeometry`) with a flat `meshStandardMaterial`.
- No `InstancedMesh` — only 3 NPCs, each needs independent per-frame joint rotation, which doesn't fit instancing's per-instance-matrix model as cleanly as plain meshes. Matches `components/GymEquipmentModels.tsx`'s precedent (one-off hierarchical mesh trees, all `castShadow`).
- Animation is driven by direct ref mutation inside `useFrame`, never React state/props changing every frame — matches every other animation in this codebase (outer-group position/rotation, wall-fade opacity, camera easing).
- No automated tests exist in this repo — verification is `npx tsc --noEmit` exiting 0, plus a final manual pass (Task 3).

---

### Task 1: `components/GymNpcBody.tsx` — rig geometry + joint animation

**Files:**
- Create: `components/GymNpcBody.tsx`

**Interfaces:**
- Consumes: `NpcRuntime` (type-only import from `components/GymNpcs.tsx` — type-only imports are erased at compile time, so this does not create a runtime circular dependency even though `GymNpcs.tsx` will import a value from this file in Task 2).
- Produces: `export function NpcBody({ npc, shirtColor, accentColor }: { npc: NpcRuntime; shirtColor: string; accentColor: string }): JSX.Element` — Task 2 mounts this directly.

**Design note on the `npc` prop (read this before writing Task 2):** `NpcBody` takes the whole live `NpcRuntime` object, not a destructured `state: NpcState` value. `GymNpcs.tsx` never calls React `setState` — its own state machine (`updateNpc`) mutates `npc.state` directly on the object (`npc.state = "workingOut"`, etc.), so `GymNpcs` itself never re-renders after mount. If `NpcBody` took a plain `state` prop, that prop's value would be frozen at whatever it was on the very first render, forever — it would never reflect a real state change. Passing the object reference itself works correctly instead: `npc` is the *same* object every frame (never reassigned, only its fields mutated in place), so reading `npc.state` fresh inside `NpcBody`'s own `useFrame` callback (which runs every frame regardless of React re-renders) always sees the live value. This is the same principle this file already uses for `ownedIdsRef.current = ownedEquipmentIds` — read a live reference inside `useFrame`, don't destructure a snapshot into a prop.

- [ ] **Step 1: Create the complete file**

Create `components/GymNpcBody.tsx`:

```tsx
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
  ref.current.rotation.x += (target - ref.current.rotation.x) * Math.min(1, delta * JOINT_EASE_RATE);
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
          <mesh position={[0, -FOREARM_LENGTH / 2, 0]} castShadow>
            <boxGeometry args={[FOREARM_WIDTH, FOREARM_LENGTH, FOREARM_WIDTH]} />
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
          <mesh position={[0, -FOREARM_LENGTH / 2, 0]} castShadow>
            <boxGeometry args={[FOREARM_WIDTH, FOREARM_LENGTH, FOREARM_WIDTH]} />
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
          <mesh position={[0, -SHIN_LENGTH / 2, 0]} castShadow>
            <boxGeometry args={[SHIN_WIDTH, SHIN_LENGTH, SHIN_WIDTH]} />
            <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} metalness={0} />
          </mesh>
          <mesh position={[0, -SHIN_LENGTH - FOOT_HEIGHT / 2, 0.05]} castShadow>
            <boxGeometry args={[FOOT_WIDTH, FOOT_HEIGHT, FOOT_DEPTH]} />
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
          <mesh position={[0, -SHIN_LENGTH / 2, 0]} castShadow>
            <boxGeometry args={[SHIN_WIDTH, SHIN_LENGTH, SHIN_WIDTH]} />
            <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} metalness={0} />
          </mesh>
          <mesh position={[0, -SHIN_LENGTH - FOOT_HEIGHT / 2, 0.05]} castShadow>
            <boxGeometry args={[FOOT_WIDTH, FOOT_HEIGHT, FOOT_DEPTH]} />
            <meshStandardMaterial color={FOOT_COLOR} roughness={0.7} metalness={0.05} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/FlexQuest && git add components/GymNpcBody.tsx
git commit -m "$(cat <<'EOF'
feat: add NpcBody — segmented humanoid rig with walk-cycle animation

New file, not yet wired into GymNpcs.tsx (Task 2). Rig: tapered
two-box torso, head, two-segment arms (shoulder+elbow pivots, bicep
bulge) and legs (hip+knee pivots), feet. Takes the live NpcRuntime
object (not a destructured state prop) since GymNpcs never calls
setState and its own state machine mutates npc.state in place — a
plain prop would freeze at mount. Joint pivots ease toward a sine-wave
walk-cycle target while walking, and back to neutral otherwise, via
direct ref mutation in its own useFrame.
EOF
)"
```

---

### Task 2: Wire `NpcBody` into `GymNpcs.tsx`

**Files:**
- Modify: `components/GymNpcs.tsx`

**Interfaces:**
- Consumes: `NpcBody` from `./GymNpcBody` (Task 1) — `<NpcBody npc={...} shirtColor={...} accentColor={...} />`.
- Produces: nothing new exported — `GymNpcs`'s own exports (`NPC_COLORS`, `NPC_NAMES`, `NpcState`, `NpcRuntime`, `createInitialNpcs`, `getNpcId`, `getNpcStateLabel`, `GymNpcs`) are unchanged.

- [ ] **Step 1: Import `NpcBody`**

Add this import near the top of `components/GymNpcs.tsx`, after the existing `import { ZONE_LANDMARKS, ...} from "@/constants/zones";` line:

```ts
import { NpcBody } from "./GymNpcBody";
```

- [ ] **Step 2: Replace the inline mesh block with `<NpcBody>`**

Change (currently the `GymNpcs` component's returned JSX):

```tsx
  return (
    <>
      {NPC_COLORS.map((color, i) => {
        const isSelected = selectedNpcId === getNpcId(i);
        const accentColor = getAccentColor(i);
        return (
          <group
            key={color}
            ref={(el) => {
              groupRefs.current[i] = el;
            }}
            position={LOCKER_POSITION}
          >
            <mesh position={[0, 0.5, 0]} castShadow>
              <capsuleGeometry args={[0.18, 0.4, 4, 8]} />
              <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} />
            </mesh>
            {/* Accent "shorts" band — two-tone activewear look. */}
            <mesh position={[0, 0.28, 0]} castShadow>
              <cylinderGeometry args={[0.185, 0.185, 0.16, 8]} />
              <meshStandardMaterial color={accentColor} roughness={0.6} metalness={0.05} />
            </mesh>
            {/* Accent "shirt front" panel — clothing variety, and the only
             * reason facing rotation is visible at all on an otherwise
             * rotationally-symmetric capsule body. */}
            <mesh position={[0, 0.58, 0.15]} castShadow>
              <boxGeometry args={[0.14, 0.18, 0.02]} />
              <meshStandardMaterial color={accentColor} roughness={0.6} metalness={0.05} />
            </mesh>
            <mesh position={[0, 0.95, 0]} castShadow>
              <sphereGeometry args={[0.14, 12, 12]} />
              <meshStandardMaterial color="#e7c9a9" roughness={0.6} metalness={0} />
            </mesh>
            {isSelected && (
              <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.28, 0.36, 24]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
```

to:

```tsx
  return (
    <>
      {NPC_COLORS.map((color, i) => {
        const isSelected = selectedNpcId === getNpcId(i);
        const accentColor = getAccentColor(i);
        return (
          <group
            key={color}
            ref={(el) => {
              groupRefs.current[i] = el;
            }}
            position={LOCKER_POSITION}
          >
            <NpcBody npc={npcRuntimesRef.current[i]} shirtColor={color} accentColor={accentColor} />
            {isSelected && (
              <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.28, 0.36, 24]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
```

`npc={npcRuntimesRef.current[i]}` passes the live `NpcRuntime` object reference itself, not a snapshot — see Task 1's design note for why this matters. `npcRuntimesRef` is already a prop this component receives (`MutableRefObject<NpcRuntime[]>`); nothing about it changes here.

- [ ] **Step 3: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
cd ~/FlexQuest && git add components/GymNpcs.tsx
git commit -m "$(cat <<'EOF'
feat: mount NpcBody in place of the old capsule NPC mesh block

Outer group's existing locomotion/facing/bob animation (getBobOffset,
getIdleGlanceOffset) and the selection ring are unchanged — only the
inline capsule/shorts-band/shirt-panel/head meshes are replaced with a
single NpcBody call, passed the live npc object so its internal
useFrame sees real state changes (see Task 1's design note).
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

- [ ] **Step 3: Observe the 3 NPCs' new silhouette**

Look at the Gym Floor.
Expected: a humanoid silhouette (torso, arms, legs, head) for each of the 3 NPCs — not the old capsule blob. Wide chest, narrow waist, visible bicep bulges.

- [ ] **Step 4: Watch a walking NPC**

Wait for or trigger an NPC to walk (to equipment, a zone, or the Smoothie Bar).
Expected: arms and legs swing convincingly and in sync with the existing footstep bob; elbows and knees bend forward only (never backward/hyperextended); no limb clips through the torso.

- [ ] **Step 5: Watch a state transition**

Watch an NPC transition from walking into `workingOut`, `idle`, or `recharging`.
Expected: joints ease smoothly back to a neutral standing pose — no visual pop or snap.

- [ ] **Step 6: Verify selection still works**

Tap an NPC.
Expected: the white selection ring still appears correctly under the new rig, at the same position as before.

- [ ] **Step 7: Verify shadows**

Look at the floor beneath a walking or standing NPC.
Expected: shadows still cast correctly from the new limb meshes (each `castShadow` mesh contributes).

- [ ] **Step 8: Spot-check performance**

Observe all 3 NPCs animating simultaneously (walking, idle, working out) for 15-20 seconds.
Expected: no visible stutter or frame-rate drop (mobile perf budget).

- [ ] **Step 9: Report results**

No commit for this task — it's verification only. If any expected behavior doesn't match, note which step failed and return to the relevant task above to fix before considering the plan complete.
