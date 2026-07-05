# Equipment Customization — Design

## Goal

Let the player edit each owned piece of equipment on the Gym Floor: reposition it, recolor it, and rotate it. Changes persist per-player, the same way purchases and equipment levels already do.

## Current state (why this needs a data-model change first)

`constants/equipment.ts` has three inconsistent, hardcoded position systems:

- **Main Floor**: `gridPosition: { row, col }` fed through `gridToWorldPosition()`, its own small grid independent of the floor's tile grid.
- **Iron Vault**: raw `zoneLocalPosition: [x, y, z]` offsets from the zone's world anchor — not a grid at all.
- **Cardio Deck**: no equipment and no position-mapping logic exists for it yet (`getEquipmentWorldPosition` would silently fall through to the Main Floor branch if an item were ever added there — a latent bug, currently unreachable).

Color and rotation aren't editable at all today — color is a fixed hex per catalog entry, rotation doesn't exist as a concept.

Separately, `GymFloor3D.tsx`'s `TiledFloor` was recently changed to render one continuous tile floor across the whole unlocked play area (`getPlayAreaBounds(unlockedZones)`), rather than a separate floor surface per zone. This spec's grid model follows that same philosophy.

## Data model: one continuous grid, not per-zone grids

Reject the three-separate-grids approach. Instead: **one grid spanning the current `getPlayAreaBounds(unlockedZones)`**, cell size matched to the floor's own tile size (`TILE_SIZE = 2.5`, from `GymFloor3D.tsx`) so each equipment item sits on exactly one floor tile — literally uniform with the flooring. As zones unlock, `getPlayAreaBounds` grows and more grid cells simply become valid, exactly mirroring how the tile floor visually grows. No per-zone anchor math, no separate coordinate systems to reconcile when an item moves from what used to be "Main Floor" into what used to be "Cardio Deck" — it's all one coordinate space.

`Equipment.zoneId` is dropped as a placement anchor. Position becomes a single `{ row, col }` — **but critically, these are absolute lattice coordinates centered on the fixed world origin, not 0-based indices from the current bounds' min corner.** `TiledFloor` internally indexes its own tiles from `bounds.minX`/`minZ`, and since `minX`/`minZ` grow more negative as zones like Iron Vault unlock, a 0-based index would silently point to a different world cell before and after that unlock — equipment would appear to jump for no reason the player caused. Instead:

```ts
worldX = col * TILE_SIZE + TILE_SIZE / 2; // TILE_SIZE = 2.5
worldZ = row * TILE_SIZE + TILE_SIZE / 2;
```

The `+ TILE_SIZE / 2` term is required, not optional: `TiledFloor` centers its tiles at `bounds.minX + TILE_SIZE/2 + n*TILE_SIZE`, not at `n*TILE_SIZE`. Since every bounds value is a multiple of `TILE_SIZE`, that's algebraically the same lattice as `TILE_SIZE/2 + col*TILE_SIZE` for integer `col` — but only with the half-tile offset included. Without it, equipment would sit exactly on the seam between two tiles instead of centered on one, defeating the "uniform with the flooring" goal. `col`/`row` can be any integer, positive or negative, and this lattice aligns exactly with `TiledFloor`'s tile centers everywhere, in every unlock state, forever — it never needs to shift.

### Valid-cell computation

A cell is placeable if, and only if:
1. It falls at least one tile's clearance inside `getPlayAreaBounds(unlockedZones)` (not just technically inside it) — this single margin rule handles the walls, corner pillars, *and* Iron Vault's two wireframe fence panels in one shot, since tracing their actual world coordinates shows the fence panels sit exactly on Iron Vault's own `minX`/`minZ` boundary edge — they're boundary features, not separate interior obstacles requiring their own exclusion entries.
2. It isn't within one tile of Smoothie Bar's footprint (world `[-6,0,-6]`) or Locker Room Door's footprint (world `[6,0,-6]`) — these *are* interior landmarks (not boundary-adjacent), so they need their own distance check.
3. It isn't already occupied by another owned equipment item (excluding the item currently being moved, if any).

This list is computed fresh whenever edit mode's Move sub-state opens, and again continuously during a drag (to highlight the nearest valid cell and to validate the drop).

## Interaction design

### Entry point

Tapping an owned equipment item already opens the existing inspector panel (`Selection` type, `type: "equipment"`). Add an **Edit** button there. Tapping it opens an edit panel with three controls: **Move**, **Colour**, **Rotate**.

### Colour

8 fixed swatches, reusing hex values already present in the game rather than introducing new ones: `#FBBF24`, `#C084FC`, `#2DD4BF`, `#38BDF8`, `#F472B6`, `#A3E635`, the signature violet `#8B5CF6`, and white `#F8F9FA`. Tapping a swatch applies instantly with a live preview on the model.

### Rotate

A single "Rotate" button steps `rotationStep` through `0 → 1 → 2 → 3 → 0`, each step = 90°. Applied as `rotation={[0, rotationStep * (Math.PI / 2), 0]}` on the equipment's wrapping `<group>` in `GymFloor3D.tsx` — no changes needed inside the individual `GymEquipmentModels` components, since models already have distinct, non-symmetric front/back geometry (e.g. the treadmill's belt, the bench's angle) that will visibly respond to a Y-axis rotation.

### Move

Tapping **Move** enters a "placing" sub-state, distinct from normal camera control:

- Single-finger drag is redirected from camera-pan to repositioning a ghost/translucent copy of the item. Each frame, the finger's screen position is raycast onto the floor's `y=0` plane (reusing/extending the existing `worldToScreen` math in reverse) to get a live world X/Z position.
- The nearest valid cell (per the computation above) highlights as the ghost is dragged.
- Two-finger pinch/rotate/tilt continues to control the camera as normal during a drag — useful for zooming out to see across what used to be separate zones.
- Releasing over a valid cell commits the move there. Releasing over an invalid or occupied cell snaps the ghost back to the item's original cell (no-op).
- This hooks into the existing `PanResponder`'s single-finger branch (which already distinguishes 1-touch from 2-touch gestures for camera pan vs. pinch/rotate) rather than introducing a parallel gesture system — avoiding the class of gesture-priority bug already hit and fixed once this session (browser pinch-zoom vs. in-scene camera pinch).
- Exiting edit mode (Done, or tapping elsewhere) returns single-finger drag to normal camera panning.

## Persistence

New per-user state in `UserContext`, following the exact pattern already used for `equipmentLevels`:

```ts
equipmentCustomizations: Record<string, {
  row: number;
  col: number;
  color: string;
  rotationStep: 0 | 1 | 2 | 3;
}>
```

- Saved via the existing debounced AsyncStorage saver (`createDebouncedSaver`) — no new persistence plumbing.
- `getEquipmentWorldPosition`, and a new color/rotation resolver, both become: **catalog default, overridden by this record if present.** An item with no entry in `equipmentCustomizations` renders exactly as it does today.
- All 6 existing catalog items (4 on `gridPosition` with spacing 2, 2 on Iron Vault's `zoneLocalPosition`) get migrated to plain world-grid `{ row, col }` catalog defaults on the new 2.5-unit lattice. Their old positions used a spacing-2 grid that doesn't land exactly on a 2.5-unit lattice, so each migrates to its **nearest available** lattice cell — not an exact-position preservation. Verified by computing every item's actual 2D shift distance (not just per-axis): three Main Floor items (`rusty-dumbbell-rack`, `commercial-bench-press`, `cardio-treadmill`) shift ~1.06-1.46 units; `squat-rack` shifts ~1.90 units — its old position sits exactly between two of its neighbors' claimed cells on the new lattice, an unavoidable consequence of migrating a spacing-2 layout onto a spacing-2.5 one (confirmed by exhaustively checking neighboring cell assignments: 1.90 is the best achievable for that item, not an arbitrary choice). All shifts stay under one tile width (2.5) — noticeable if you look for it, but not a visible "wrong place" relocation.
- NPC/staff walk-targets already route through `getEquipmentWorldPosition`, so a moved item is automatically walked-to correctly with no separate change required in `GymNpcs`/`GymStaff`.
- A prestige reset (which already clears stale equipment selection, see `GymFloor3D.tsx`'s existing defensive `useEffect`) should also clear `equipmentCustomizations`, consistent with how it clears `purchasedEquipmentIds`.

## Out of scope

- Editing fixed landmarks (Smoothie Bar, Locker Room Door, walls, decor) — only items in `EQUIPMENT_CATALOG` are editable.
- Free/continuous rotation or free-drag (non-grid-snapped) placement — both were explicitly decided against in favor of simplicity and guaranteed no-overlap.
- Any change to how equipment is purchased, leveled, or its `cashPerSecond`/`cost`/`requiredLevel` economics.
