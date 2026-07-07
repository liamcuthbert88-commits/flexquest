# Staff Humanoid Rig + Movement Design

## Context

Follow-up to the just-shipped NPC humanoid rig (Phase A, `feature/npc-humanoid-rig`, PR #7, still open): the 3 named gym members got a real jointed rig with walk-cycle animation. This spec extends that same treatment to the 3 staff roles — Clerk (Dan), Trainer (Sarah), Janitor (Bob), in `components/GymStaff.tsx` — which today still use the old capsule+sphere body.

Staff already move (confirmed by reading `components/GymStaff.tsx`): the Clerk paces back and forth at the Smoothie Bar via a continuous sine oscillation, the Trainer walks toward occupied Iron Vault equipment (or the vault's center when nothing's occupied), and the Janitor patrols between the main floor and unlocked-zone landmarks — all using the same `moveToward`/facing-angle technique `GymNpcs.tsx` uses. This spec does not add new movement behavior; it applies the humanoid rig's walk-cycle animation to movement staff already have.

Two things beyond a straight visual swap came out of scoping:
1. Staff get their own leaner, more "average adult" build, distinct from the members' bulkier "gym rat" build — confirmed via a side-by-side proportions sketch in the visual companion.
2. The Trainer's clipboard and Janitor's mop move from fixed torso-relative props to swinging naturally from the hand, now that there's an arm to attach them to.

This branch depends on `feature/npc-humanoid-rig` (not yet merged) — it must be built on top of it, not off `master`.

## Decisions (confirmed via user Q&A, including a visual proportions comparison)

- This is "apply the walk-cycle rig to existing movement," not new movement behavior.
- Staff get a genuinely separate, independently-tuned proportion set (not a uniform width-scale of the member build) — same overall height as members, narrower/leaner everywhere else.
- Props (clipboard, mop) attach to the hand and swing with arm articulation, rather than staying at a fixed position on the torso.

## Architecture

### `components/GymNpcBody.tsx` (refactored)

Decouples `NpcBody` from `GymNpcs.tsx`'s `NpcRuntime` type entirely, so `GymStaff.tsx` can use it without needing the member-specific state shape.

```ts
export type BodyPreset = {
  headRadius: number;
  chestWidth: number; chestHeight: number; chestDepth: number;
  waistWidth: number; waistHeight: number; waistDepth: number;
  upperArmLength: number; upperArmWidth: number; bicepRadius: number;
  forearmLength: number; forearmWidth: number;
  thighLength: number; thighWidth: number;
  shinLength: number; shinWidth: number;
  footWidth: number; footHeight: number; footDepth: number;
};

export const MEMBER_BUILD: BodyPreset = {
  headRadius: 0.14,
  chestWidth: 0.42, chestHeight: 0.18, chestDepth: 0.22,
  waistWidth: 0.26, waistHeight: 0.14, waistDepth: 0.18,
  upperArmLength: 0.3, upperArmWidth: 0.11, bicepRadius: 0.08,
  forearmLength: 0.28, forearmWidth: 0.09,
  thighLength: 0.32, thighWidth: 0.14,
  shinLength: 0.3, shinWidth: 0.11,
  footWidth: 0.14, footHeight: 0.06, footDepth: 0.22,
};

export const STAFF_BUILD: BodyPreset = {
  headRadius: 0.13,
  chestWidth: 0.32, chestHeight: 0.16, chestDepth: 0.19,
  waistWidth: 0.22, waistHeight: 0.14, waistDepth: 0.16,
  upperArmLength: 0.3, upperArmWidth: 0.08, bicepRadius: 0.055,
  forearmLength: 0.28, forearmWidth: 0.075,
  thighLength: 0.32, thighWidth: 0.11,
  shinLength: 0.3, shinWidth: 0.09,
  footWidth: 0.12, footHeight: 0.06, footDepth: 0.2,
};
```

Every limb *length* (`upperArmLength`, `forearmLength`, `thighLength`, `shinLength`) and `footHeight` is identical between the two presets — only width/depth (and the torso's own height, since the taper look comes from width contrast, not height) differ. This keeps both builds the same overall standing height, and means the vertical pivot layout (`kneePivotY`, `hipPivotY`, `waistTopY`, `chestTopY`, `shoulderPivotY`) is **identical** between presets — only the horizontal pivot offsets (`shoulderPivotX`, `hipPivotX`, which depend on `chestWidth`/`waistWidth`) differ.

`NpcBody`'s prop shape changes:

```ts
type NpcBodyProps = {
  getIsWalking: () => boolean;
  animationSeed: number;
  preset: BodyPreset;
  shirtColor: string;
  accentColor: string;
  rightHandProp?: ReactNode;
};
```

- `npc: NpcRuntime` is removed. `getIsWalking` is a callback, not a snapshot — a closure over a live object/ref reads whatever is current at *call* time, not creation time, so this preserves the exact same "always sees real state changes" guarantee the live-object-prop design had, just decoupled from `NpcRuntime` specifically. `NpcBody`'s own `useFrame` calls `getIsWalking()` each frame instead of reading `npc.state` directly.
- All the pivot-position math (currently module-level constants like `KNEE_PIVOT_Y`, `HIP_PIVOT_X`) becomes a small pure function of `preset`, computed once via `useMemo` — same math, now parameterized instead of hardcoded.
- `rightHandProp` renders as a child inside the right elbow pivot group, positioned at the forearm's distal (hand) end — it inherits both the shoulder and elbow rotation automatically, so anything passed here swings naturally with the arm. Only a right-hand slot exists (both current props — clipboard, mop — sit on that side already); no left-hand slot since nothing needs one yet (YAGNI).

### `components/GymNpcs.tsx` (small adjustment)

The `<NpcBody>` call updates to the new prop shape — no behavior change, same live-read guarantee, just via closure instead of object reference:

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

### `components/GymStaff.tsx` (rewritten body rendering)

`StaffBody` (the old capsule+sphere function) is removed entirely. Each role mounts `<NpcBody>` directly in its existing `<group>`, with `preset={STAFF_BUILD}` and both `shirtColor` and `accentColor` set to that role's existing single flat color (Clerk `#EF4444`, Trainer `#22C55E`, Janitor `#EAB308`) — matches today's "one color per role" identity exactly, no new color decisions introduced.

- **Clerk:** `getIsWalking={() => true}` — the Clerk is in continuous motion via the sine-pace whenever rendered, never at rest, so the walk cycle should always run. `animationSeed` gets a fixed literal (e.g. `0.7`) — no `Math.random()`, matching this project's rule against randomness in anything needing stability.
- **Trainer:** `TrainerRuntime` gains a new field, `isWalking: boolean` (default `false`). The existing `useFrame` block's `moveToward` call, which today discards its `arrived` return, is updated to destructure it and set `runtime.isWalking = !arrived` each frame — same pattern `JanitorRuntime` already uses for `arrived`, just also stored for `NpcBody` to read. `getIsWalking={() => trainerRuntime.current.isWalking}`. `rightHandProp` is the clipboard, repositioned from its old outer-group-relative offset (`[0.22, 0.6, 0.12]`) to a small local offset representing the hand position inside the elbow pivot, keeping its existing `rotation` for grip angle.
- **Janitor:** Same treatment — `JanitorRuntime` gains `isWalking: boolean` (default `false`), set from the `arrived` it already destructures (`runtime.isWalking = !arrived`, added alongside the existing landmark-advance logic). `getIsWalking={() => janitorRuntime.current.isWalking}`. `rightHandProp` is the mop, repositioned the same way, keeping its existing `rotation={[0, 0, 0.3]}` grip angle.

## Error Handling

- No user input or external data feeds this system — nothing to validate.
- `MEMBER_BUILD`/`STAFF_BUILD` are stable module-level constants (never recreated per render), so the `useMemo`-derived pivot math only recomputes if a genuinely different preset object is passed — never spuriously.
- `rightHandProp` is optional; when omitted (Clerk holds nothing), nothing extra renders — ordinary optional-child handling, no null-guard needed beyond that.
- `TrainerRuntime.isWalking`/`JanitorRuntime.isWalking` default to `false` at creation, matching their existing spawn-at-rest behavior (both start with `target` equal to their own initial `position`).
- The joint-overlap z-fighting fix (`JOINT_OVERLAP`, already shipped on `feature/npc-humanoid-rig`) is preset-independent — it applies automatically to staff's smaller proportions too, since it's the same rig code, just parameterized by different width/length numbers.

## Testing

No automated tests in this repo. Manual verification:

1. Regression-check the 3 members still walk-cycle correctly after `NpcBody`'s prop-interface refactor (`npc` → `getIsWalking`/`animationSeed`/`preset`).
2. Clerk (if hired): humanoid rig, continuously limb-animated while pacing at the Smoothie Bar — never stands still.
3. Trainer (if hired): walks with limb animation toward occupied Iron Vault equipment; the clipboard now swings naturally from the hand instead of sitting at a fixed torso-relative spot.
4. Janitor (if hired): patrols zone landmarks with limb animation; the mop swings naturally from the hand.
5. Staff visibly show the leaner "staff build" silhouette, distinct from the bulkier member build.
6. Shadows still cast correctly from the new staff rigs.
7. No z-fighting at staff joints either (same fix, different scale — worth a manual check since `JOINT_OVERLAP` was originally tuned against member proportions).
8. `npx tsc --noEmit` exits clean.
