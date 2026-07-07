# NPC Humanoid Rig (Phase A) Design

## Context

User asked for FlexQuest's gym NPCs to look like real, muscular "gym rats" instead of their current abstract shapes, with each of the 3 named NPCs (`Gains Goblin`, `Rep Reaper`, `Cardio Crusher`, from `components/GymNpcs.tsx`'s `NPC_NAMES`) getting a distinct look and personality.

Scoping questions revealed this is really three separable projects:

1. **Phase A (this spec):** A real humanoid rig with animated limbs, replacing today's capsule-body NPCs. One shared muscular build for now.
2. **Phase B (future):** 3 distinct body-proportion presets (bulkier/leaner/balanced) layered onto Phase A's rig.
3. **Phase C (future):** 6 distinct per-equipment exercise animations (bench press, squat rack, treadmill, etc.), replacing today's generic exertion bob during `workingOut`.

Personality (flavor text shown in the Inspector panel + behavior tweaks to the state machine) is deferred until Phases A-C are done, since it builds on the finished, visually-distinct bodies.

This spec covers Phase A only.

## Current State

`components/GymNpcs.tsx` renders each of the 3 NPCs as: one capsule (body, flat NPC-specific color), one cylinder (shorts band, accent color), one box (shirt-front panel, accent color), one sphere (head, fixed skin tone `#e7c9a9`), plus a selection ring when tapped. The whole thing is one `<group>` per NPC whose position/rotation is driven every frame by `GymNpcs`' own `useFrame`, using `getBobOffset` (walk bob / exertion bob / idle sway) and `getIdleGlanceOffset` (idle head-turn) — both pure functions of `(state, animationSeed, elapsedTime)`. Everything animates via direct ref mutation (`group.position.set(...)`, `group.rotation.y = ...`), never React re-renders. This project has no textures anywhere and no imported/rigged 3D models — every visual element (gym equipment, decor, backdrop buildings) is hand-built from primitive geometry (`components/GymEquipmentModels.tsx` is the closest precedent: one-off hierarchical `<mesh>` trees, all `castShadow`, no instancing).

## Decisions (confirmed via user Q&A, including a visual proportions sketch)

- Personality means both flavor text (Inspector panel) **and** behavior tweaks to the state machine — but that's out of scope for this spec (Phase A only covers the body/rig).
- Rig detail: segmented primitives with **fully animated limbs** (not a static pose) — two-segment arms/legs (upper arm + forearm, thigh + shin) that bend at elbow/knee, not single rigid swinging limbs.
- Muscle look: silhouette (wide shoulders, thick limbs, narrow waist) **plus** an added bicep-bulge shape on the upper arm — confirmed via a front-view SVG sketch shown in the visual companion.
- One shared muscular build for all 3 NPCs in Phase A. Per-NPC distinct proportions are Phase B.
- The `workingOut` animation stays exactly as it is today (the existing generic exertion bob) — distinct per-equipment exercise animations are Phase C.

## Architecture

### `components/GymNpcBody.tsx` (new file)

Owns the rig geometry and its own joint animation — a rendering responsibility, separate from `GymNpcs.tsx`'s state-machine/locomotion responsibility.

```ts
export function NpcBody({
  state,
  animationSeed,
  shirtColor,
  accentColor,
}: {
  state: NpcState;
  animationSeed: number;
  shirtColor: string;
  accentColor: string;
}): JSX.Element
```

Rig, built entirely from boxes/cylinders/spheres (no textures, matching the rest of the scene), every mesh `castShadow`, no `InstancedMesh` (only 3 NPCs total, each needs independent per-frame joint rotation — instancing is for many *identical, non-individually-animated* objects, which doesn't fit here; this matches `GymEquipmentModels.tsx`'s precedent of one-off hierarchical mesh trees for hand-built characters/objects):

- **Torso:** tapered box — wide at the chest, narrow at the waist — `shirtColor`.
- **Head:** sphere, fixed skin tone `#e7c9a9` (unchanged from today), unaffected by any NPC-specific color.
- **2× arm**, each a nested pivot hierarchy:
  - Shoulder pivot group (this is what rotates for the swing) containing: upper-arm box + a bicep-bulge sphere layered on it, both `shirtColor`.
  - Nested inside the shoulder pivot: an elbow pivot group containing the forearm box, skin tone.
- **2× leg**, mirroring the arm structure:
  - Hip pivot group (rotates for the swing) containing: thigh box, `accentColor` (today's "shorts" color).
  - Nested inside the hip pivot: a knee pivot group containing the shin box, skin tone.
- **2× feet:** small boxes, fixed dark color, attached under each leg's knee pivot.

### Joint animation

`NpcBody` runs its **own** `useFrame`, independent of `GymNpcs.tsx`'s. It's driven only by `state` and `animationSeed` — both cheap values that change infrequently (state only transitions on state-machine events, not every frame) — and reads `clock.elapsedTime` itself. Every joint pivot group is a plain ref, mutated directly (`.rotation.x = ...`) every frame — no React re-render, exactly matching how the outer group already animates today. Each ref mutation is guarded with a null check (`if (ref.current) { ... }`) in case a callback ref hasn't fired yet on the very first frame.

**Walking states** (`walkingToEquipment`, `walkingToZone`, `walkingToBar`):
- Shoulder and hip pivots rotate via `Math.sin(t * WALK_BOB_FREQUENCY)` (reusing the existing `WALK_BOB_FREQUENCY` constant from `GymNpcs.tsx` so limb swing stays in sync with the existing footstep bob), with left/right mirrored and arm/leg on opposite sides moving together (natural gait: left leg forward pairs with right arm forward).
- Elbow and knee pivots rotate via a phase-related, rectified (one-directional) function derived from the same base phase, so they bend forward only and never hyperextend backward through the torso.

**Every other state:** joint pivots ease back toward neutral (`rotation.x = 0`) using the same exponential-ease style already used for position smoothing elsewhere in this file (`1 - Math.exp(-rate * delta)`), so a walk-to-stop transition doesn't visually pop.

### `components/GymNpcs.tsx` (modified)

- The outer group's existing position/rotation.y animation (locomotion, facing, whole-body bob/idle-sway/glance via `getBobOffset`/`getIdleGlanceOffset`) is **completely unchanged**.
- The inline capsule/shorts-band/shirt-panel/head mesh block is replaced with a single `<NpcBody state={npc.state} animationSeed={npc.animationSeed} shirtColor={color} accentColor={accentColor} />`, nested inside the same outer `<group>`.
- The selection ring stays inline in `GymNpcs.tsx`, unchanged — it's a ground decal unrelated to the body rig.
- `getBobOffset`, `getIdleGlanceOffset`, `NPC_COLORS`, `NPC_NAMES`, `NpcState`, `NpcRuntime`, `createInitialNpcs`, `getNpcId`, `getNpcStateLabel`, `updateNpc` — all unchanged.

## Error Handling

- No user input or external data feeds this system — nothing to validate. `state` is always a valid `NpcState`; `animationSeed` is always a number set once at NPC creation.
- Joint-pivot ref mutations in `NpcBody`'s `useFrame` are guarded with a null check, matching the existing outer-group pattern, in case a ref callback hasn't fired on the very first frame.
- Joint angles are always derived from bounded trig functions (`Math.sin`, clamped/rectified for elbow/knee) — no possibility of a runaway or NaN value regardless of how long `elapsedTime` grows over a play session.

## Testing

No automated tests in this repo (no Jest, no `*.test.ts` anywhere). Manual verification:

1. Launch the app, observe the 3 NPCs on the Gym Floor — confirm a humanoid silhouette (torso/arms/legs/head), not the old capsule blob.
2. Watch an NPC walk to equipment, a zone, or the Smoothie Bar — arms and legs swing convincingly; elbows and knees bend forward only, no hyperextension or clipping through the torso.
3. Watch an NPC transition from a walking state into `workingOut`/`idle`/`recharging` — joints ease back to a neutral standing pose, no visual pop.
4. Tap an NPC — the selection ring still appears correctly under the new rig.
5. Confirm shadows still cast correctly from the new limb meshes.
6. Spot-check frame rate with all 3 NPCs animating simultaneously — no visible stutter (mobile perf budget).
7. `npx tsc --noEmit` exits clean.
