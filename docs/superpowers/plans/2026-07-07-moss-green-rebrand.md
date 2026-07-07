# Moss Green Rebrand + Neon Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's violet brand color with moss green everywhere it appears, and remove all neon-glow wall trim from the 3D Gym Floor.

**Architecture:** A global color-value swap across four files (theme tokens + three components that duplicate/reuse the old hex by value), plus a structural removal of two pieces of 3D geometry (`NeonPerimeter`'s glowing floor strips, `WallPanel`'s painted accent stripe) that exist specifically to render the "neon trim" now being dropped.

**Tech Stack:** React Native, `@react-three/fiber`, TypeScript. No test runner in this repo — verification is `npx tsc --noEmit` per task plus a final manual pass.

## Global Constraints

- New brand color: **moss green, `#6B8F4E`**, replacing the old violet `#8B5CF6` everywhere it appears — including incidental/decorative uses, not just brand-labeled ones (confirmed: this also covers `GymDecor.tsx`'s yoga-mat-basket color variety).
- `accentPrimaryMuted` in `constants/theme.ts` must be recomputed as the new color's rgba: `#6B8F4E` → `rgb(107, 143, 78)`.
- Wall trim is removed entirely, not recolored — both `NeonPerimeter` (the glowing floor-perimeter strips) and `WallPanel`'s separate painted accent stripe.
- `GymFloor3D.tsx`'s `NEON_COLOR` constant is **kept** (not deleted) — after removing the wall-trim usages, its one remaining use is the drag-highlight-tile shown while moving equipment (`PlacementGhost`), a real interactive affordance that just recolors along with everything else.
- `GlowLayer` (the shared bloom-effect component) is **not** removed — it's also used by `OverheadLedArray`'s ceiling LED fixtures, unrelated to this change.
- No automated tests in this repo (no Jest, no `*.test.ts` anywhere) — each task verifies with `npx tsc --noEmit` (must exit 0); the final task is a manual pass.

---

### Task 1: Recolor pass — theme tokens, brand emblem, yoga mats, equipment swatch

**Files:**
- Modify: `constants/theme.ts`
- Modify: `components/GymDecor.tsx`
- Modify: `components/InspectorPanel.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing new exported — pure color-value changes across three files that don't otherwise interact with Task 2.

- [ ] **Step 1: Recolor `constants/theme.ts`**

Change (currently lines 15-16):

```ts
  accentPrimary: "#8B5CF6",
  accentPrimaryMuted: "rgba(139, 92, 246, 0.16)",
```

to:

```ts
  accentPrimary: "#6B8F4E",
  accentPrimaryMuted: "rgba(107, 143, 78, 0.16)",
```

- [ ] **Step 2: Recolor `components/GymDecor.tsx`'s `BRAND_COLOR`**

Change (currently line 7):

```ts
const BRAND_COLOR = "#8B5CF6";
```

to:

```ts
const BRAND_COLOR = "#6B8F4E";
```

- [ ] **Step 3: Recolor `components/GymDecor.tsx`'s `YogaBasket` mat colors**

Change (currently inside `YogaBasket`, the line reading):

```ts
  const matColors = ["#8B5CF6", "#38BDF8", "#4ADE80"];
```

to:

```ts
  const matColors = ["#6B8F4E", "#38BDF8", "#4ADE80"];
```

- [ ] **Step 4: Recolor `components/InspectorPanel.tsx`'s equipment color swatch**

Change (currently the `EQUIPMENT_COLOR_SWATCHES` array, which reads):

```ts
const EQUIPMENT_COLOR_SWATCHES = [
  "#FBBF24",
  "#C084FC",
  "#2DD4BF",
  "#38BDF8",
  "#F472B6",
  "#A3E635",
  "#8B5CF6",
  "#F8F9FA",
];
```

to:

```ts
const EQUIPMENT_COLOR_SWATCHES = [
  "#FBBF24",
  "#C084FC",
  "#2DD4BF",
  "#38BDF8",
  "#F472B6",
  "#A3E635",
  "#6B8F4E",
  "#F8F9FA",
];
```

(Only the 7th entry, `"#8B5CF6"`, changes — every other swatch stays exactly as-is.)

- [ ] **Step 5: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 6: Commit**

```bash
cd ~/FlexQuest && git add constants/theme.ts components/GymDecor.tsx components/InspectorPanel.tsx
git commit -m "$(cat <<'EOF'
feat: recolor brand violet to moss green

Covers the shared theme tokens (every 2D screen updates automatically),
GymDecor's brand emblem poster and yoga-mat-basket decoration, and the
Inspector's equipment recolor swatch — full consistency, including
incidental/decorative reuses of the old hex, not just brand-labeled ones.
EOF
)"
```

---

### Task 2: Remove neon wall trim from `GymFloor3D.tsx`

**Files:**
- Modify: `components/GymFloor3D.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 — independent file.
- Produces: nothing new exported — internal removal/simplification.

- [ ] **Step 1: Recolor `NEON_COLOR`**

Change (currently line 118):

```ts
const NEON_COLOR = "#8B5CF6";
```

to:

```ts
const NEON_COLOR = "#6B8F4E";
```

This constant is kept — its one remaining use after this task (the drag-highlight-tile in `PlacementGhost`, around line 1414) is a real interactive affordance, not decorative neon trim, so it stays and simply picks up the new color.

- [ ] **Step 2: Remove the `NeonPerimeter` function entirely**

Delete the whole function (currently lines 908-943, including its doc comment):

```ts
/** Static neon tube glow tracing the floor's perimeter — inset from the
 * enclosing walls (rather than sitting flush/coincident with them) so it
 * reads as trim molding at the wall's base, not a shape colliding with it.
 * Its bounds always match GymWalls' current bounds, so the trim keeps
 * framing the room correctly as the shell grows with unlocked zones. */
function NeonPerimeter({ bounds }: { bounds: PlayAreaBounds }) {
  const innerMinX = bounds.minX + WALL_INSET_FROM_NEON;
  const innerMaxX = bounds.maxX - WALL_INSET_FROM_NEON;
  const innerMinZ = bounds.minZ + WALL_INSET_FROM_NEON;
  const innerMaxZ = bounds.maxZ - WALL_INSET_FROM_NEON;
  const width = innerMaxX - innerMinX;
  const depth = innerMaxZ - innerMinZ;
  const centerX = (innerMinX + innerMaxX) / 2;
  const centerZ = (innerMinZ + innerMaxZ) / 2;

  const strips: { position: [number, number, number]; size: [number, number, number] }[] = [
    { position: [centerX, 0.05, innerMinZ], size: [width, 0.06, 0.12] },
    { position: [centerX, 0.05, innerMaxZ], size: [width, 0.06, 0.12] },
    { position: [innerMinX, 0.05, centerZ], size: [0.12, 0.06, depth] },
    { position: [innerMaxX, 0.05, centerZ], size: [0.12, 0.06, depth] },
  ];

  return (
    <>
      {strips.map((strip, i) => (
        <mesh key={i} position={strip.position}>
          <boxGeometry args={strip.size} />
          <meshStandardMaterial color={NEON_COLOR} emissive={NEON_COLOR} emissiveIntensity={1.5} />
        </mesh>
      ))}
      {strips.map((strip, i) => (
        <GlowLayer key={`glow-${i}`} position={strip.position} size={strip.size} color={NEON_COLOR} />
      ))}
    </>
  );
}
```

- [ ] **Step 3: Remove `<NeonPerimeter>`'s mount point**

Delete this line from the scene's JSX (currently in `GymFloorScene`'s returned `<Canvas>`, alongside the other environment components):

```tsx
        <NeonPerimeter bounds={playAreaBounds} />
```

Leave every sibling line around it (e.g. `<GymWalls bounds={playAreaBounds} />`, `<SmoothieBar />`) untouched — only this one line is removed.

- [ ] **Step 4: Remove `WallPanel`'s accent stripe entirely**

Change (currently lines 952-995):

```ts
function WallPanel({
  position,
  size,
  accentOffset,
  wallMaterial,
  accentMaterial,
}: {
  position: [number, number, number];
  size: [number, number, number];
  /** Offset (along the wall's own normal, toward the room) for the painted
   * accent stripe overlaid on this panel — different per wall since each
   * faces a different direction. */
  accentOffset: [number, number, number];
  /** Shared per side, not globally — GymWalls fades/hides each side's shell
   * independently by mutating that side's own material instances directly,
   * so every panel belonging to the same side must point at the same
   * instances rather than each owning their own. */
  wallMaterial: MeshStandardMaterial;
  accentMaterial: MeshStandardMaterial;
}) {
  const accentPosition: [number, number, number] = [
    position[0] + accentOffset[0],
    ACCENT_STRIPE_Y,
    position[2] + accentOffset[2],
  ];
  const accentSize: [number, number, number] =
    size[0] > size[2] ? [size[0] - PILLAR_SIZE, ACCENT_STRIPE_HEIGHT, 0.02] : [0.02, ACCENT_STRIPE_HEIGHT, size[2] - PILLAR_SIZE];

  return (
    <>
      <mesh position={position} castShadow receiveShadow material={wallMaterial}>
        <boxGeometry args={size} />
      </mesh>
      {/* Painted brand accent stripe — reuses the same signature violet as
       * the neon floor trim so the branding reads as one consistent
       * identity, rather than introducing a second competing color. Plain
       * matte paint, not emissive: this pass is about environment detail,
       * not new rendering techniques, so it doesn't need its own GlowLayer. */}
      <mesh position={accentPosition} material={accentMaterial}>
        <boxGeometry args={accentSize} />
      </mesh>
    </>
  );
}
```

to:

```ts
function WallPanel({
  position,
  size,
  wallMaterial,
}: {
  position: [number, number, number];
  size: [number, number, number];
  /** Shared per side, not globally — GymWalls fades/hides each side's shell
   * independently by mutating that side's own material instance directly,
   * so every panel belonging to the same side must point at the same
   * instance rather than each owning their own. */
  wallMaterial: MeshStandardMaterial;
}) {
  return (
    <mesh position={position} castShadow receiveShadow material={wallMaterial}>
      <boxGeometry args={size} />
    </mesh>
  );
}
```

- [ ] **Step 5: Simplify `GymWalls`' per-side materials — drop `.accent`**

Change (currently lines 1196-1205):

```ts
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
```

to:

```ts
  const materials = useMemo(() => {
    const result = {} as Record<Side, { wall: MeshStandardMaterial }>;
    for (const side of SIDES) {
      result[side] = {
        wall: new MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.85, metalness: 0.05, transparent: true }),
      };
    }
    return result;
  }, []);
```

- [ ] **Step 6: Drop the accent-opacity assignment in `useFrame`**

Change (currently lines 1231-1235, inside the `for (const side of SIDES)` loop):

```ts
    for (const side of SIDES) {
      const target = isNear[side] ? 0 : 1;
      opacityRef.current[side] += (target - opacityRef.current[side]) * Math.min(1, delta * HIDE_EASE_RATE);
      materials[side].wall.opacity = opacityRef.current[side];
      materials[side].accent.opacity = opacityRef.current[side];
```

to:

```ts
    for (const side of SIDES) {
      const target = isNear[side] ? 0 : 1;
      opacityRef.current[side] += (target - opacityRef.current[side]) * Math.min(1, delta * HIDE_EASE_RATE);
      materials[side].wall.opacity = opacityRef.current[side];
```

(The rest of that loop body — the `group.visible` hide/show logic immediately below — is unchanged.)

- [ ] **Step 7: Drop `accentOffset`/`accentMaterial` from all 4 `<WallPanel>` call sites**

Change each of the 4 calls (currently at the `back`, `front`, `left`, `right` groups):

```tsx
        <WallPanel
          position={[(minX + maxX) / 2, wallY, minZ]}
          size={[width + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]}
          accentOffset={[0, 0, halfThickness]}
          wallMaterial={materials.back.wall}
          accentMaterial={materials.back.accent}
        />
```

```tsx
        <WallPanel
          position={[frontLeftCenterX, wallY, maxZ]}
          size={[frontLeftWidth, WALL_HEIGHT, WALL_THICKNESS]}
          accentOffset={[0, 0, -halfThickness]}
          wallMaterial={materials.front.wall}
          accentMaterial={materials.front.accent}
        />
```

```tsx
        <WallPanel
          position={[minX, wallY, centerZ]}
          size={[WALL_THICKNESS, WALL_HEIGHT, depth + WALL_THICKNESS]}
          accentOffset={[halfThickness, 0, 0]}
          wallMaterial={materials.left.wall}
          accentMaterial={materials.left.accent}
        />
```

```tsx
        <WallPanel
          position={[maxX, wallY, centerZ]}
          size={[WALL_THICKNESS, WALL_HEIGHT, depth + WALL_THICKNESS]}
          accentOffset={[-halfThickness, 0, 0]}
          wallMaterial={materials.right.wall}
          accentMaterial={materials.right.accent}
        />
```

to (each drops only its `accentOffset` and `accentMaterial` lines — `position`, `size`, and `wallMaterial` are unchanged on all 4):

```tsx
        <WallPanel
          position={[(minX + maxX) / 2, wallY, minZ]}
          size={[width + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]}
          wallMaterial={materials.back.wall}
        />
```

```tsx
        <WallPanel
          position={[frontLeftCenterX, wallY, maxZ]}
          size={[frontLeftWidth, WALL_HEIGHT, WALL_THICKNESS]}
          wallMaterial={materials.front.wall}
        />
```

```tsx
        <WallPanel
          position={[minX, wallY, centerZ]}
          size={[WALL_THICKNESS, WALL_HEIGHT, depth + WALL_THICKNESS]}
          wallMaterial={materials.left.wall}
        />
```

```tsx
        <WallPanel
          position={[maxX, wallY, centerZ]}
          size={[WALL_THICKNESS, WALL_HEIGHT, depth + WALL_THICKNESS]}
          wallMaterial={materials.right.wall}
        />
```

- [ ] **Step 8: Remove the now-dead `halfThickness` declaration**

`halfThickness` (currently `const halfThickness = WALL_THICKNESS / 2 + 0.02;`, near the top of `GymWalls`) was used *only* by the four `accentOffset` props just removed in Step 7 — confirmed no other reference to it exists anywhere in `GymWalls`. Delete its declaration entirely:

```ts
  const halfThickness = WALL_THICKNESS / 2 + 0.02;
```

- [ ] **Step 9: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 10: Commit**

```bash
cd ~/FlexQuest && git add components/GymFloor3D.tsx
git commit -m "$(cat <<'EOF'
feat: remove neon wall trim, recolor remaining accent to moss green

Removes NeonPerimeter (glowing floor-perimeter strips) and WallPanel's
painted accent stripe entirely — walls are now fully plain. NEON_COLOR
itself is kept (recolored to moss green) since its one remaining use,
the drag-highlight-tile shown while moving equipment, is a real
interactive affordance, not decorative neon. GlowLayer is untouched —
still used by the ceiling LED fixtures, an unrelated feature.
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

- [ ] **Step 3: Verify every 2D screen**

Check the top bar, shop/upgrade cards, Inspector panel, workout tracker, and XP progress bar.
Expected: all show moss green (`#6B8F4E`) wherever the old violet appeared — no violet remaining anywhere in the UI.

- [ ] **Step 4: Verify the 3D Gym Floor has no wall trim**

Look at any wall from up close and from a distance.
Expected: no glowing floor-perimeter strip anywhere, no painted stripe on any wall panel — walls are fully plain.

- [ ] **Step 5: Verify the equipment recolor swatch**

Select an owned equipment item, open Edit mode, look at the color swatches.
Expected: one swatch shows moss green instead of violet; the other 7 are unchanged.

- [ ] **Step 6: Verify the brand emblem poster and yoga mats**

Find the wall-mounted brand emblem poster and a yoga-mat-basket decoration (via `GymDecor`).
Expected: both show moss green instead of violet.

- [ ] **Step 7: Verify the drag-highlight-tile**

Move an owned equipment item (tap-select then drag, or long-press per the current mechanism).
Expected: the highlighted valid-drop-cell tile is moss green.

- [ ] **Step 8: Verify ceiling LEDs are unaffected**

Look at the ceiling LED fixtures.
Expected: unchanged — still their existing white/LED color, untouched by this change.

- [ ] **Step 9: Report results**

No commit for this task — it's verification only. If any expected behavior doesn't match, note which step failed and return to the relevant task above to fix before considering the plan complete.
