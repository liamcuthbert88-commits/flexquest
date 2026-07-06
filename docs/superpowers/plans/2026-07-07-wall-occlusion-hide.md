# Wall Occlusion Hide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `GymWalls`' uniform camera-distance-based opacity fade with per-side occlusion-aware hiding, so whichever wall(s) currently sit between the camera and the room's interior are fully culled (not just faded), while the opposite wall(s) stay solid.

**Architecture:** `GymWalls` gains one material pair and one wrapper `<group>` per side (front/back/left/right), each independently faded toward 0 or 1 opacity and hidden/shown based on which side of the room the camera currently occupies. Corner pillars (shared between two adjacent sides) get their own dual-side visibility rule; single-side pillars render inside their side's group and inherit its visibility automatically.

**Tech Stack:** `@react-three/fiber`, `three.js`, TypeScript. No test runner in this repo — verification is `npx tsc --noEmit` per task plus a final manual pass.

## Global Constraints

- Near-side walls are fully hidden (`visible = false` on the group), not merely faded to a low opacity — this avoids a real bug the fade-only approach would have: material opacity doesn't affect shadow-casting, so a merely-faded wall would still cast a shadow with no visible caster.
- The old distance-based mechanism (`WALL_FADE_DISTANCE`, `WALL_FADE_LATERAL_MARGIN`, `MIN_WALL_OPACITY`) is removed entirely, not kept alongside the new one.
- Transition is fade-then-hide (not an instant pop): fade opacity down quickly, hide the group only once it's dropped below `HIDE_OPACITY_THRESHOLD`; on the way back, un-hide immediately so the fade-in starts from a visible state.
- Corner pillars stay visible as long as at least one of their two adjacent sides is still shown; single-side pillars render inside their side's own group and hide/show with it automatically — no separate visibility logic needed for those.
- `EntranceDoor` is untouched — out of scope, already semi-transparent by design.
- No automated tests in this repo (no Jest, no `*.test.ts` anywhere) — verify with `npx tsc --noEmit` (must exit 0); the final task is a manual pass.

---

### Task 1: Per-side occlusion hiding in `GymWalls`

**Files:**
- Modify: `components/GymFloor3D.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks — self-contained within this one file/function.
- Produces: nothing new exported — `GymWalls`' external signature (`{ bounds: PlayAreaBounds }`) is unchanged; this is an internal rewrite.

- [ ] **Step 1: Replace the old fade constants with the new `Side` type and hide constants**

Change (currently lines 136-149):

```ts
/** Distance (world units) from a wall plane within which it starts fading —
 * lets the camera get close to inspect equipment near a wall without that
 * wall blocking the view, while staying fully opaque (and visible as an
 * actual boundary) everywhere else. Only the wall(s) the camera is
 * currently near fade; the rest of the shell stays solid. */
const WALL_FADE_DISTANCE = 3;
/** Floor on faded opacity — kept above 0 so a near wall still reads as
 * "see-through" (translucent boundary) rather than vanishing outright. */
const MIN_WALL_OPACITY = 0.12;
/** How far past a wall's own span (along the wall) the camera can still be
 * and count as "near" it — covers the corner case, where the camera is close
 * to a wall just past where the perpendicular wall begins. */
const WALL_FADE_LATERAL_MARGIN = 1.5;
const WALL_FADE_EASE_RATE = 6;
```

to:

```ts
/** The four sides of the rectangular wall shell — GymWalls fades/hides each
 * independently based on which side the camera currently occupies, rather
 * than the whole shell fading in lockstep off literal camera-to-wall
 * distance (the old approach: it left near-side walls opaque and blocking
 * the view unless the camera happened to be within a few units of that
 * exact wall, even when clearly orbiting from outside looking through it). */
const SIDES = ["front", "back", "left", "right"] as const;
type Side = (typeof SIDES)[number];

/** Ease rate for the opacity fade that precedes hiding a near-side wall —
 * deliberately faster than a slow ambient fade, so it reads as the wall
 * "whooshing away" rather than lazily dissolving. */
const HIDE_EASE_RATE = 15;
/** Opacity floor below which a near-side wall's group is actually hidden
 * (`visible = false`) — waiting for the fade to mostly finish first avoids
 * a pop where a still-partly-opaque wall vanishes abruptly. Hiding (not
 * just fading to a low value) matters because material opacity has no
 * effect on shadow-casting: a wall left merely translucent would still
 * cast a shadow with no visible caster, which reads as a glitch. */
const HIDE_OPACITY_THRESHOLD = 0.05;
```

- [ ] **Step 2: Update `WallPanel`'s stale doc comment**

Change (currently lines 977-979, inside `WallPanel`'s props type):

```ts
  /** Shared, not per-panel — GymWalls fades every panel's opacity in lockstep
   * off one useFrame by mutating these materials directly, so all panels
   * must point at the same instances rather than each owning their own. */
  wallMaterial: MeshStandardMaterial;
  accentMaterial: MeshStandardMaterial;
```

to:

```ts
  /** Shared per side, not globally — GymWalls fades/hides each side's shell
   * independently by mutating that side's own material instances directly,
   * so every panel belonging to the same side must point at the same
   * instances rather than each owning their own. */
  wallMaterial: MeshStandardMaterial;
  accentMaterial: MeshStandardMaterial;
```

- [ ] **Step 3: Replace the entire `GymWalls` function**

Replace the whole function (currently lines 1161-1274, from `function GymWalls({ bounds }: { bounds: PlayAreaBounds }) {` through its closing `}`) with:

```ts
type PillarSpec = { position: [number, number]; sides: Side[] };

/** The enclosing shell itself — walls sized to `bounds` (see
 * getPlayAreaBounds), corner + mid-span pillars for structural mass, a
 * painted accent stripe doubling as branding, and a gap in the front wall
 * (always at world x=0, since z=maxZ is invariant regardless of which zones
 * are unlocked) reading as the facility's entrance. Kept deliberately low
 * (WALL_HEIGHT=4, well under the LED array at y=6) and open-topped: the
 * camera orbits from outside/above this boundary at a radius that grows in
 * step with it, and a taller or roofed shell would risk clipping the
 * camera's view at shallow polar angles, or blocking the top-down view the
 * whole game is built around.
 *
 * Each of the four sides fades and fully hides independently (see the
 * useFrame below) whenever the camera currently sits on that side — the
 * wall(s) between the camera and the interior disappear instead of merely
 * fading, so equipment on the far side of the room is never occluded no
 * matter how the camera is oriented. */
function GymWalls({ bounds }: { bounds: PlayAreaBounds }) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const centerZ = (minZ + maxZ) / 2;
  const wallY = WALL_HEIGHT / 2;
  const halfThickness = WALL_THICKNESS / 2 + 0.02;

  const entranceLeftX = -ENTRANCE_GAP_WIDTH / 2;
  const entranceRightX = ENTRANCE_GAP_WIDTH / 2;
  const frontLeftWidth = entranceLeftX - minX;
  const frontRightWidth = maxX - entranceRightX;
  const frontLeftCenterX = (minX + entranceLeftX) / 2;
  const frontRightCenterX = (entranceRightX + maxX) / 2;

  // Entrance-flanking and mid-span pillars belong to exactly one side each
  // — rendered inside that side's group below, so they hide/show with it
  // automatically with no separate visibility logic needed.
  const singleSidePillars: PillarSpec[] = [
    { position: [entranceLeftX, maxZ], sides: ["front"] },
    { position: [entranceRightX, maxZ], sides: ["front"] },
    { position: [minX, centerZ], sides: ["left"] },
    { position: [maxX, centerZ], sides: ["right"] },
  ];
  // True corner pillars belong to two sides — rendered outside any single
  // side's group, with their own dual-side visibility rule in useFrame
  // below (hidden only once BOTH adjacent sides are hidden).
  const cornerPillars: PillarSpec[] = [
    { position: [minX, minZ], sides: ["back", "left"] },
    { position: [maxX, minZ], sides: ["back", "right"] },
    { position: [minX, maxZ], sides: ["front", "left"] },
    { position: [maxX, maxZ], sides: ["front", "right"] },
  ];

  // One material pair per side (not one shared globally) — lets each side
  // fade/hide independently. Every panel belonging to the same side still
  // shares that side's one material instance, so mutating it once in
  // useFrame updates every panel on that side in lockstep.
  const materials = useMemo(() => {
    const result = {} as Record<Side, { wall: MeshStandardMaterial; accent: MeshStandardMaterial }>;
    for (const side of SIDES) {
      result[side] = {
        wall: new MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.85, metalness: 0.05, transparent: true }),
        accent: new MeshStandardMaterial({ color: NEON_COLOR, roughness: 0.6, metalness: 0.1, transparent: true }),
      };
    }
    return result;
  }, []);
  const pillarMaterial = useMemo(
    () => new MeshStandardMaterial({ color: PILLAR_COLOR, roughness: 0.7, metalness: 0.15, transparent: true }),
    []
  );

  const opacityRef = useRef<Record<Side, number>>({ front: 1, back: 1, left: 1, right: 1 });
  const groupRefs = useRef<Record<Side, Group | null>>({ front: null, back: null, left: null, right: null });
  const cornerPillarRefs = useRef<(Object3D | null)[]>([]);

  /** Per side, hides that side's wall group whenever the camera is
   * currently on that side (i.e., that wall sits between the camera and
   * the room's interior) — fully culled once faded out, not just
   * translucent, so it neither renders nor casts a shadow while hidden.
   * The opposite side(s) always stay solid, so the shell still reads as
   * an enclosed room from any angle. The brief opacity fade
   * (HIDE_EASE_RATE) runs before the group is actually hidden/shown, so
   * the transition doesn't pop. */
  useFrame(({ camera }, delta) => {
    const isNear: Record<Side, boolean> = {
      front: camera.position.z > maxZ,
      back: camera.position.z < minZ,
      left: camera.position.x < minX,
      right: camera.position.x > maxX,
    };

    for (const side of SIDES) {
      const target = isNear[side] ? 0 : 1;
      opacityRef.current[side] += (target - opacityRef.current[side]) * Math.min(1, delta * HIDE_EASE_RATE);
      materials[side].wall.opacity = opacityRef.current[side];
      materials[side].accent.opacity = opacityRef.current[side];

      const group = groupRefs.current[side];
      if (group) {
        if (isNear[side] && opacityRef.current[side] < HIDE_OPACITY_THRESHOLD) {
          group.visible = false;
        } else if (!isNear[side]) {
          group.visible = true;
        }
      }
    }

    cornerPillars.forEach((pillar, i) => {
      const mesh = cornerPillarRefs.current[i];
      if (!mesh) return;
      const [sideA, sideB] = pillar.sides;
      const bothHidden =
        opacityRef.current[sideA] < HIDE_OPACITY_THRESHOLD && opacityRef.current[sideB] < HIDE_OPACITY_THRESHOLD;
      mesh.visible = !bothHidden;
    });
  });

  return (
    <group>
      <group ref={(el) => { groupRefs.current.back = el; }}>
        <WallPanel
          position={[(minX + maxX) / 2, wallY, minZ]}
          size={[width + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]}
          accentOffset={[0, 0, halfThickness]}
          wallMaterial={materials.back.wall}
          accentMaterial={materials.back.accent}
        />
      </group>

      <group ref={(el) => { groupRefs.current.front = el; }}>
        <WallPanel
          position={[frontLeftCenterX, wallY, maxZ]}
          size={[frontLeftWidth, WALL_HEIGHT, WALL_THICKNESS]}
          accentOffset={[0, 0, -halfThickness]}
          wallMaterial={materials.front.wall}
          accentMaterial={materials.front.accent}
        />
        <WindowedWallSegment
          centerX={frontRightCenterX}
          width={frontRightWidth}
          z={maxZ}
          wallMaterial={materials.front.wall}
        />
        {singleSidePillars
          .filter((p) => p.sides[0] === "front")
          .map((p, i) => (
            <mesh key={i} position={[p.position[0], wallY, p.position[1]]} castShadow material={pillarMaterial}>
              <boxGeometry args={[PILLAR_SIZE, WALL_HEIGHT + 0.3, PILLAR_SIZE]} />
            </mesh>
          ))}
      </group>

      <EntranceDoor z={maxZ} />

      <group ref={(el) => { groupRefs.current.left = el; }}>
        <WallPanel
          position={[minX, wallY, centerZ]}
          size={[WALL_THICKNESS, WALL_HEIGHT, depth + WALL_THICKNESS]}
          accentOffset={[halfThickness, 0, 0]}
          wallMaterial={materials.left.wall}
          accentMaterial={materials.left.accent}
        />
        {singleSidePillars
          .filter((p) => p.sides[0] === "left")
          .map((p, i) => (
            <mesh key={i} position={[p.position[0], wallY, p.position[1]]} castShadow material={pillarMaterial}>
              <boxGeometry args={[PILLAR_SIZE, WALL_HEIGHT + 0.3, PILLAR_SIZE]} />
            </mesh>
          ))}
      </group>

      <group ref={(el) => { groupRefs.current.right = el; }}>
        <WallPanel
          position={[maxX, wallY, centerZ]}
          size={[WALL_THICKNESS, WALL_HEIGHT, depth + WALL_THICKNESS]}
          accentOffset={[-halfThickness, 0, 0]}
          wallMaterial={materials.right.wall}
          accentMaterial={materials.right.accent}
        />
        {singleSidePillars
          .filter((p) => p.sides[0] === "right")
          .map((p, i) => (
            <mesh key={i} position={[p.position[0], wallY, p.position[1]]} castShadow material={pillarMaterial}>
              <boxGeometry args={[PILLAR_SIZE, WALL_HEIGHT + 0.3, PILLAR_SIZE]} />
            </mesh>
          ))}
      </group>

      {cornerPillars.map((pillar, i) => (
        <mesh
          key={i}
          ref={(el) => { cornerPillarRefs.current[i] = el; }}
          position={[pillar.position[0], wallY, pillar.position[1]]}
          castShadow
          material={pillarMaterial}
        >
          <boxGeometry args={[PILLAR_SIZE, WALL_HEIGHT + 0.3, PILLAR_SIZE]} />
        </mesh>
      ))}
    </group>
  );
}
```

Note on ordering: `<EntranceDoor z={maxZ} />` is placed between the front group and the left group in this replacement, matching where it sits in the original function's return (originally right after the `WindowedWallSegment`/before the left `WallPanel`) — this is a plain positional render-order detail with no visual effect (siblings in a `<group>` don't depth-sort by JSX order), included only so the diff stays close to the original structure for readability.

- [ ] **Step 4: Confirm `Group` and `Object3D` are already imported (already verified — informational)**

Both `Group` and `Object3D` are already present in the file's existing multi-line `three` import block (lines 12-20, alongside `AdditiveBlending`, `Color`, `InstancedMesh`, `MeshStandardMaterial`, `PerspectiveCamera`, `Vector3`) — confirmed directly, no new import needed for this task.

- [ ] **Step 5: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 6: Commit**

```bash
cd ~/FlexQuest && git add components/GymFloor3D.tsx
git commit -m "$(cat <<'EOF'
feat: hide near-side walls instead of fading them, per side

Replaces the old whole-shell distance-based fade with per-side
occlusion: whichever wall(s) the camera currently sits on (i.e. sit
between it and the room's interior) fade quickly then fully hide, so
equipment on the far side of the room is never blocked regardless of
camera angle. Fixes both reported failure modes (near wall blocking
far-side view while orbiting; and old 12% opacity floor not being
transparent enough up close) by removing the distance-based mechanism
entirely rather than tuning its numbers further.
EOF
)"
```

---

### Task 2: Manual verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full-project typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 2: Start the app**

Run: `cd ~/FlexQuest && npx expo start --tunnel --dev-client` (this project requires the custom EAS dev client, not Expo Go)
Expected: Metro starts, tunnel connects, app loads on the installed dev client without crashing.

- [ ] **Step 3: Verify far-side visibility while orbiting from a distance**

On the Gym Floor tab, orbit the camera around at a middle zoom level (not extremely close to any wall) so that some equipment sits near the far side of the room relative to the camera's current angle.
Expected: the near-side wall (between camera and that equipment) is not visible at all — fully disappeared, not faded — and the far-side equipment is completely unobstructed.

- [ ] **Step 4: Verify close-up hiding**

Zoom in close to one specific wall.
Expected: that wall fades quickly then fully disappears — no lingering shimmer, ghost, or partial-opacity artifact.

- [ ] **Step 5: Verify only the near side(s) are affected**

While orbiting through all four sides and each of the four corners.
Expected: only the 1-2 currently-near walls ever hide; the opposite far wall(s) stay fully solid throughout — the room never reads as "all walls gone" or "nothing enclosing it."

- [ ] **Step 6: Verify the entrance's two front pieces move together**

Orbit toward the front (entrance) side.
Expected: the solid left panel and the windowed right segment fade and hide in exact sync — never one hidden while the other is still visible.

- [ ] **Step 7: Verify corner pillar behavior**

Orbit so only ONE of a corner pillar's two adjacent walls is hidden (not both).
Expected: that corner pillar stays visible. Then orbit so BOTH adjacent walls are hidden (camera near that exact corner).
Expected: the corner pillar also disappears.

- [ ] **Step 8: Verify no floating-shadow artifact**

With a wall hidden (from Step 3 or 4), look at the floor/equipment area where that wall's shadow would have fallen.
Expected: no shadow shape is visible where the hidden wall used to be — confirms hiding (not just fading) correctly skips shadow-casting too.

- [ ] **Step 9: Verify `EntranceDoor` is unaffected**

Look at the glass entrance door directly.
Expected: unchanged from before this change — still its own fixed semi-transparency, not tied to the front side's hide/show state.

- [ ] **Step 10: Quick performance check**

While orbiting/zooming continuously.
Expected: no visible frame-rate stutter compared to before this change (should be neutral-to-better, since hidden geometry is skipped during rendering rather than drawn-but-transparent).

- [ ] **Step 11: Report results**

No commit for this task — it's verification only. If any expected behavior doesn't match, note which step failed and return to Task 1 to fix before considering the plan complete.
