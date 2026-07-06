# Exterior Scenery + Camera Bounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the visible void beyond the gym floor's walls with static exterior scenery (road, parking spaces, a bus stop) wrapping the building's growing rectangular footprint, and cap the camera's zoom-out so it can never see past that scenery into unfinished void again.

**Architecture:** A new self-contained file (`components/GymExterior.tsx`) holds four sub-components — a large static ground plane, a bounds-driven rectangular road loop, an instanced set of parking-space dividers, and one static bus-stop structure — mounted in `GymFloor3D.tsx` alongside the existing bounds-driven `TiledFloor`/`GymWalls`/`NeonPerimeter`. `CameraRig`'s existing height-clamp logic gains a matching radius ceiling computed from the same live bounds.

**Tech Stack:** `@react-three/fiber`, `three.js`, TypeScript. No test runner in this repo — verification is `npx tsc --noEmit` per task plus a final manual pass.

## Global Constraints

- Nothing in this feature is purchasable — `GymExterior` always renders fully, unconditionally, no gating on any purchase/unlock state.
- Road is static — no animated traffic, no NPC interaction, no tap-to-inspect. Pure decoration.
- No new lights — every new mesh uses `meshStandardMaterial`/plain color under the existing directional+ambient pair, matching this file's established avoid-extra-lights convention.
- `EXTERIOR_RING_WIDTH = 14` (exact value, `constants/zones.ts`) — how far the road/parking apron extends beyond the current play-area walls.
- The camera's `orbitRadius` must be clamped to `Math.max(width, depth) / 2 + EXTERIOR_RING_WIDTH` (computed from the live `boundsRef.current`, not a fixed constant) so the ceiling grows automatically as zones are purchased.
- No automated tests in this repo (no Jest, no `*.test.ts` anywhere) — each task verifies with `npx tsc --noEmit` (must exit 0); the final task is a manual pass.
- **Refinement over the spec, noted here for clarity:** the spec says both `ExteriorRoad` and `ParkingSpaces` need `TiledFloor`'s bounds-driven `key`-remount treatment. On closer inspection, only `ParkingSpaces` actually needs it — it's the only one of the two that uses an `InstancedMesh` (fixed instance count at mount). `ExteriorRoad` is four plain meshes with props computed from `bounds`; plain meshes re-render correctly with new props on every bounds change with no special handling. Task 2 below implements this refinement directly — do not add a `key` prop to `ExteriorRoad`.

---

### Task 1: `EXTERIOR_RING_WIDTH` constant

**Files:**
- Modify: `constants/zones.ts`

**Interfaces:**
- Produces: `export const EXTERIOR_RING_WIDTH = 14;` — consumed by Task 2 (`GymExterior.tsx`'s road/parking sizing) and Task 3 (`GymFloor3D.tsx`'s camera ceiling).

- [ ] **Step 1: Add the constant**

At the end of `constants/zones.ts` (after the existing `LOCKER_POSITION` export), add:

```ts
/** How far beyond the play-area walls the exterior apron (road, parking,
 * sidewalk) extends. Chosen generously — large enough that, combined with
 * the zoom-linked camera tilt (see GymFloor3D.tsx's getZoomLinkedPolar),
 * the ground plane comfortably fills the frame even at max zoom-out. An
 * empirically-tuned constant, same style as this file's other camera/scene
 * boundary values (e.g. MAX_CAMERA_HEIGHT) — adjust if playtesting shows
 * the apron's edge is still visible. */
export const EXTERIOR_RING_WIDTH = 14;
```

- [ ] **Step 2: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/FlexQuest && git add constants/zones.ts
git commit -m "feat: add EXTERIOR_RING_WIDTH constant for exterior scenery sizing"
```

---

### Task 2: `components/GymExterior.tsx`

**Files:**
- Create: `components/GymExterior.tsx`

**Interfaces:**
- Consumes: `EXTERIOR_RING_WIDTH` and `type PlayAreaBounds` from `@/constants/zones`; `ENTRANCE_GAP_WIDTH` is NOT imported (that constant lives in `components/GymFloor3D.tsx` itself, not exported from `constants/zones` — this task hardcodes the bus stop's offset as a local constant instead, see Step 5).
- Produces: `export function GymExterior({ bounds }: { bounds: PlayAreaBounds }): JSX.Element` — consumed by Task 3 (`GymFloor3D.tsx` mounts this).

- [ ] **Step 1: Create the file with imports and the ground plane**

Create `components/GymExterior.tsx`:

```ts
import { useEffect, useMemo, useRef } from "react";
import { InstancedMesh, Object3D } from "three";
import { EXTERIOR_RING_WIDTH, type PlayAreaBounds } from "@/constants/zones";

const GROUND_RADIUS = 60;
const GROUND_COLOR = "#0d0d10";

const ASPHALT_COLOR = "#26262b";
const ROAD_HEIGHT = 0.08;
const LANE_MARKING_COLOR = "#d8d4c8";
const LANE_MARKING_HEIGHT = 0.02;
const LANE_MARKING_THICKNESS = 0.2;

const PARKING_LINE_COLOR = "#e8e8e8";
const PARKING_LINE_THICKNESS = 0.15;
const PARKING_LINE_HEIGHT = 0.02;
/** World-unit spacing between parking-space divider lines — chosen close to
 * EQUIPMENT_GRID_TILE_SIZE (2.5) so the exterior's rhythm doesn't clash with
 * the interior grid's, without importing that constant across an unrelated
 * boundary (this file only needs a plausible parking-bay width, not the
 * literal equipment grid). */
const PARKING_SPACE_WIDTH = 3;

const BUS_STOP_POST_HEIGHT = 2.2;
const BUS_STOP_POST_RADIUS = 0.08;
const BUS_STOP_POST_COLOR = "#1e1e24";
const BUS_STOP_ROOF_COLOR = "#2a2a2e";
const BUS_STOP_ROOF_SIZE: [number, number, number] = [2.4, 0.1, 1.2];
const BUS_STOP_BENCH_COLOR = "#5a3d28";
const BUS_STOP_BENCH_SIZE: [number, number, number] = [1.2, 0.4, 0.4];
/** Matches GymFloor3D.tsx's own ENTRANCE_GAP_WIDTH (4) — duplicated here
 * rather than imported since it's a GymFloor3D-local constant, not exported
 * from constants/zones. Positions the bus stop just to the right of the
 * entrance gap, clear of the door itself. */
const ENTRANCE_GAP_WIDTH = 4;

/** One large, flat, static ground plane comfortably past GymBackdrop's
 * 55-unit skyline ring — fixes "visible void beyond the walls" outright,
 * regardless of the more detailed road/parking geometry's exact placement.
 * Fixed at world origin, not bounds-dependent: even at the largest building
 * footprint (worst-case corner ~36 units from origin), a 60-unit-radius
 * plane still covers it with margin, so there's no need to resize this as
 * zones unlock. */
function ExteriorGround() {
  return (
    <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[GROUND_RADIUS, 32]} />
      <meshStandardMaterial color={GROUND_COLOR} roughness={0.95} metalness={0} />
    </mesh>
  );
}
```

- [ ] **Step 2: Add `ExteriorRoad`**

Append to `components/GymExterior.tsx`:

```ts
/** A rectangular loop of asphalt strips just outside the play-area walls,
 * offset by EXTERIOR_RING_WIDTH — same 4-panel perimeter shape GymWalls
 * builds, just further out and flat instead of vertical. Each strip's long
 * dimension is extended by EXTERIOR_RING_WIDTH at both ends (not just
 * spanning its own side's length) so the four strips visually overlap at
 * the corners into a continuous loop — there's no CSG/boolean-union
 * available here (same constraint noted in GymFloor3D.tsx's
 * WindowedWallSegment), so overlapping straight pieces is the standard
 * workaround, the same technique GymWalls' own corner pillars use to cover
 * the seams between its wall panels. Plain meshes, not instanced — unlike
 * ParkingSpaces below, these don't need the InstancedMesh remount-on-bounds-
 * change treatment, since a plain mesh's size/position re-renders correctly
 * from props on every bounds change with no special handling. */
function ExteriorRoad({ bounds }: { bounds: PlayAreaBounds }) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const extendedWidth = maxX - minX + EXTERIOR_RING_WIDTH * 2;
  const extendedDepth = maxZ - minZ + EXTERIOR_RING_WIDTH * 2;

  const strips: { position: [number, number, number]; size: [number, number, number] }[] = [
    // Front (entrance side, +Z)
    {
      position: [centerX, ROAD_HEIGHT / 2, maxZ + EXTERIOR_RING_WIDTH / 2],
      size: [extendedWidth, ROAD_HEIGHT, EXTERIOR_RING_WIDTH],
    },
    // Back (-Z)
    {
      position: [centerX, ROAD_HEIGHT / 2, minZ - EXTERIOR_RING_WIDTH / 2],
      size: [extendedWidth, ROAD_HEIGHT, EXTERIOR_RING_WIDTH],
    },
    // Left (-X)
    {
      position: [minX - EXTERIOR_RING_WIDTH / 2, ROAD_HEIGHT / 2, centerZ],
      size: [EXTERIOR_RING_WIDTH, ROAD_HEIGHT, extendedDepth],
    },
    // Right (+X)
    {
      position: [maxX + EXTERIOR_RING_WIDTH / 2, ROAD_HEIGHT / 2, centerZ],
      size: [EXTERIOR_RING_WIDTH, ROAD_HEIGHT, extendedDepth],
    },
  ];

  // Lane markings: one centerline stripe per strip, running along that
  // strip's long axis. Front/back strips are wide along X (marking is a
  // long-X, thin-Z box); left/right strips are wide along Z (marking is a
  // long-Z, thin-X box).
  const laneMarkings: { position: [number, number, number]; size: [number, number, number] }[] = [
    {
      position: [centerX, ROAD_HEIGHT + LANE_MARKING_HEIGHT / 2, maxZ + EXTERIOR_RING_WIDTH / 2],
      size: [extendedWidth, LANE_MARKING_HEIGHT, LANE_MARKING_THICKNESS],
    },
    {
      position: [centerX, ROAD_HEIGHT + LANE_MARKING_HEIGHT / 2, minZ - EXTERIOR_RING_WIDTH / 2],
      size: [extendedWidth, LANE_MARKING_HEIGHT, LANE_MARKING_THICKNESS],
    },
    {
      position: [minX - EXTERIOR_RING_WIDTH / 2, ROAD_HEIGHT + LANE_MARKING_HEIGHT / 2, centerZ],
      size: [LANE_MARKING_THICKNESS, LANE_MARKING_HEIGHT, extendedDepth],
    },
    {
      position: [maxX + EXTERIOR_RING_WIDTH / 2, ROAD_HEIGHT + LANE_MARKING_HEIGHT / 2, centerZ],
      size: [LANE_MARKING_THICKNESS, LANE_MARKING_HEIGHT, extendedDepth],
    },
  ];

  return (
    <group>
      {strips.map((strip, i) => (
        <mesh key={i} position={strip.position} receiveShadow>
          <boxGeometry args={strip.size} />
          <meshStandardMaterial color={ASPHALT_COLOR} roughness={0.9} metalness={0} />
        </mesh>
      ))}
      {laneMarkings.map((marking, i) => (
        <mesh key={i} position={marking.position}>
          <boxGeometry args={marking.size} />
          <meshStandardMaterial color={LANE_MARKING_COLOR} roughness={0.7} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}
```

- [ ] **Step 3: Add `ParkingSpaces`**

Append to `components/GymExterior.tsx`:

```ts
/** Evenly-spaced parking-bay divider lines along the front road strip (the
 * entrance side), one InstancedMesh so the count costs a single draw call
 * regardless of how many spaces the current bounds produce — same technique
 * TiledFloor uses for its tile grid. Each divider is a thin box perpendicular
 * to the road's long axis, i.e. its long dimension runs along Z (matching
 * the road strip's own Z depth), not X. */
function ParkingSpaces({ bounds }: { bounds: PlayAreaBounds }) {
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  const { minX, maxX, maxZ } = bounds;
  const extendedWidth = maxX - minX + EXTERIOR_RING_WIDTH * 2;
  const startX = minX - EXTERIOR_RING_WIDTH;
  const count = Math.floor(extendedWidth / PARKING_SPACE_WIDTH) + 1;
  const lineZ = maxZ + EXTERIOR_RING_WIDTH / 2;
  const lineLength = EXTERIOR_RING_WIDTH * 0.7;

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < count; i++) {
      const x = startX + i * PARKING_SPACE_WIDTH;
      dummy.position.set(x, ROAD_HEIGHT + PARKING_LINE_HEIGHT / 2, lineZ);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  }, [dummy, count, startX, lineZ]);

  return (
    <instancedMesh
      key={`${bounds.minX}-${bounds.maxX}-${bounds.minZ}-${bounds.maxZ}`}
      ref={meshRef}
      args={[undefined, undefined, count]}
      frustumCulled={false}
    >
      <boxGeometry args={[PARKING_LINE_THICKNESS, PARKING_LINE_HEIGHT, lineLength]} />
      <meshStandardMaterial color={PARKING_LINE_COLOR} roughness={0.7} metalness={0} />
    </instancedMesh>
  );
}
```

Note the `key` prop on `<instancedMesh>` — this is the `TiledFloor`-style remount-on-bounds-change treatment. `frustumCulled={false}` matches `TiledFloor`'s own reasoning (an `InstancedMesh`'s auto-computed bounding sphere doesn't expand to cover per-instance placement, so it can be wrongly culled — see `TiledFloor`'s comment in `GymFloor3D.tsx`).

- [ ] **Step 4: Add `BusStop`**

Append to `components/GymExterior.tsx`:

```ts
/** One static bus-stop structure (2 posts, a roof, a bench) — no instancing
 * needed since only one exists. Fixed at a position derived from the
 * entrance gap and EXTERIOR_RING_WIDTH, both of which don't change with
 * zone purchases (the entrance side, maxZ, is permanently invariant per
 * constants/zones.ts), so the bus stop never needs to move or resize. */
function BusStop({ bounds }: { bounds: PlayAreaBounds }) {
  const x = ENTRANCE_GAP_WIDTH / 2 + 3;
  const z = bounds.maxZ + EXTERIOR_RING_WIDTH + 2;
  const postXOffset = BUS_STOP_ROOF_SIZE[0] / 2 - 0.15;

  return (
    <group position={[x, 0, z]}>
      {[-postXOffset, postXOffset].map((offsetX) => (
        <mesh key={offsetX} position={[offsetX, BUS_STOP_POST_HEIGHT / 2, 0]} castShadow>
          <cylinderGeometry args={[BUS_STOP_POST_RADIUS, BUS_STOP_POST_RADIUS, BUS_STOP_POST_HEIGHT, 8]} />
          <meshStandardMaterial color={BUS_STOP_POST_COLOR} roughness={0.6} metalness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, BUS_STOP_POST_HEIGHT, 0]} castShadow>
        <boxGeometry args={BUS_STOP_ROOF_SIZE} />
        <meshStandardMaterial color={BUS_STOP_ROOF_COLOR} roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh position={[0, BUS_STOP_BENCH_SIZE[1] / 2, 0]} castShadow>
        <boxGeometry args={BUS_STOP_BENCH_SIZE} />
        <meshStandardMaterial color={BUS_STOP_BENCH_COLOR} roughness={0.8} metalness={0} />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 5: Add the exported `GymExterior` wrapper**

Append to `components/GymExterior.tsx`:

```ts
type GymExteriorProps = { bounds: PlayAreaBounds };

/** Always renders unconditionally — nothing here is purchasable or gated on
 * any unlock state. Purely passive scenery, present from the very first
 * launch. */
export function GymExterior({ bounds }: GymExteriorProps) {
  return (
    <>
      <ExteriorGround />
      <ExteriorRoad bounds={bounds} />
      <ParkingSpaces bounds={bounds} />
      <BusStop bounds={bounds} />
    </>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0, no errors. (`GymExterior.tsx` isn't imported/mounted anywhere yet, so an unused-export warning is not expected — TypeScript doesn't flag unused exports by default, only unused local variables, and there are none here.)

- [ ] **Step 7: Commit**

```bash
cd ~/FlexQuest && git add components/GymExterior.tsx
git commit -m "$(cat <<'EOF'
feat: add GymExterior component (road, parking, bus stop)

Self-contained, bounds-driven exterior scenery — not yet mounted
anywhere (next task wires it into GymFloor3D.tsx).
EOF
)"
```

---

### Task 3: Mount `GymExterior` and add the camera ceiling

**Files:**
- Modify: `components/GymFloor3D.tsx`

**Interfaces:**
- Consumes: `GymExterior` from `@/components/GymExterior` (Task 2); `EXTERIOR_RING_WIDTH` from `@/constants/zones` (Task 1).
- Produces: nothing new — this is the integration task.

- [ ] **Step 1: Import `GymExterior` and `EXTERIOR_RING_WIDTH`**

In `components/GymFloor3D.tsx`, add a new import after the existing `import { GymDecor } from "@/components/GymDecor";` line (near the top, alongside the other `@/components/*` imports):

```ts
import { GymDecor } from "@/components/GymDecor";
import { GymExterior } from "@/components/GymExterior";
```

And extend the existing `@/constants/zones` import (currently):

```ts
import {
  MAIN_FLOOR_ZONE_ID,
  getPlayAreaBounds,
  type PlayAreaBounds,
  SMOOTHIE_BAR_POSITION,
} from "@/constants/zones";
```

to:

```ts
import {
  MAIN_FLOOR_ZONE_ID,
  getPlayAreaBounds,
  type PlayAreaBounds,
  SMOOTHIE_BAR_POSITION,
  EXTERIOR_RING_WIDTH,
} from "@/constants/zones";
```

- [ ] **Step 2: Mount `<GymExterior>` alongside `<TiledFloor>`/`<GymWalls>`/`<NeonPerimeter>`**

Find the JSX block mounting these three (currently around `components/GymFloor3D.tsx:1760-1775`, inside `GymFloorScene`'s returned `<Canvas>`):

```tsx
        <TiledFloor
          key={`${playAreaBounds.minX}-${playAreaBounds.maxX}-${playAreaBounds.minZ}-${playAreaBounds.maxZ}`}
          bounds={playAreaBounds}
        />
        <GymWalls bounds={playAreaBounds} />
        <NeonPerimeter bounds={playAreaBounds} />
```

Add `<GymExterior>` immediately before `<TiledFloor>` (so it renders first — behind/around everything else, since it's the outermost layer):

```tsx
        <GymExterior bounds={playAreaBounds} />
        <TiledFloor
          key={`${playAreaBounds.minX}-${playAreaBounds.maxX}-${playAreaBounds.minZ}-${playAreaBounds.maxZ}`}
          bounds={playAreaBounds}
        />
        <GymWalls bounds={playAreaBounds} />
        <NeonPerimeter bounds={playAreaBounds} />
```

(Use whatever exact surrounding text is actually in the file — the line numbers above are from before this task's edit; confirm the three existing tags match before inserting.)

- [ ] **Step 3: Add the camera orbit-radius ceiling in `CameraRig`**

In `CameraRig`'s `useFrame` callback (currently `components/GymFloor3D.tsx:571-614`), change:

```ts
    const orbitRadius = currentRadiusRef.current + zoomOffsetRef.current;
    const targetPolar = getZoomLinkedPolar(orbitRadius);
```

to:

```ts
    const rawOrbitRadius = currentRadiusRef.current + zoomOffsetRef.current;
    const bounds = boundsRef.current;
    const maxOrbitRadius =
      Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + EXTERIOR_RING_WIDTH;
    const orbitRadius = Math.min(rawOrbitRadius, maxOrbitRadius);
    const targetPolar = getZoomLinkedPolar(orbitRadius);
```

Every other use of `orbitRadius` later in the same callback (the height-cap clamp, the final `camera.position.x/y/z` assignment) already reads the `orbitRadius` local variable, not `currentRadiusRef.current + zoomOffsetRef.current` directly — so this single substitution propagates the ceiling everywhere it needs to apply, with no other lines to change.

- [ ] **Step 4: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 5: Commit**

```bash
cd ~/FlexQuest && git add components/GymFloor3D.tsx
git commit -m "$(cat <<'EOF'
feat: mount exterior scenery, cap camera zoom-out to its outer edge

GymExterior now renders alongside the existing bounds-driven floor/wall/
trim components. CameraRig's orbitRadius is capped at
Math.max(width, depth) / 2 + EXTERIOR_RING_WIDTH (recomputed from live
bounds every frame) so the camera can never see past the new scenery
into unfinished void, at any zone-progression stage.
EOF
)"
```

---

### Task 4: Manual verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full-project typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 2: Start the app**

Run: `cd ~/FlexQuest && npx expo start --tunnel --dev-client` (this project requires the custom EAS dev client, not Expo Go — SDK 57 isn't yet supported by Expo Go's published build)
Expected: Metro starts, tunnel connects, app loads on the installed dev client without crashing.

- [ ] **Step 3: Verify no void at 0 zones owned**

On the Gym Floor tab with no zones purchased (smallest building), zoom out fully and orbit around.
Expected: no visible flat-background-color gap between the floor's edge and the new road/ground — ground and road fill the view at every angle.

- [ ] **Step 4: Verify resize on zone purchase**

Buy a zone (e.g. Cardio Deck) so the bounds grow. Return to the Gym Floor tab.
Expected: road/parking markings reposition to the new, larger wall boundary with no clipping through walls and no seam/gap at the corners.

- [ ] **Step 5: Verify at max zones**

Buy all remaining zones (largest building). Repeat the zoom-out/orbit check from Step 3.
Expected: same — no void, no clipping, road loop fully surrounds the larger building.

- [ ] **Step 6: Verify the camera ceiling**

Try to zoom out past the previous maximum.
Expected: camera stops at the new ceiling; nothing unfinished or empty is visible beyond the road/ground.

- [ ] **Step 7: Verify the bus stop**

Look toward the entrance side (+Z, beyond the front road). Confirm one bus-stop structure (roof, 2 posts, bench) renders there, doesn't clip through the entrance door or walls, and doesn't move when zones are bought/sold (prestige reset).

- [ ] **Step 8: Quick performance check**

While orbiting/zooming with the new exterior visible, watch for visible frame-rate stutter compared to before this change.
Expected: no noticeable hitch — the new geometry uses at most 2 draw calls beyond what already existed (1 InstancedMesh for parking lines, a handful of plain meshes for road/bus-stop), consistent with this file's existing perf budget.

- [ ] **Step 9: Report results**

No commit for this task — it's verification only. If any expected behavior doesn't match, note which step failed and return to the relevant task above to fix before considering the plan complete.
