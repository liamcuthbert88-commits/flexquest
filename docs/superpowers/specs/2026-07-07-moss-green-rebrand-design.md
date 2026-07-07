# Moss Green Rebrand + Neon Removal Design

## Context

User asked for a UI/UX visual style change. Scoping questions narrowed a very open-ended request down to two independent projects — this spec covers the first, smaller one.

Starting point: "I like the dark, but I don't like the neon or the voids, I want a full town in the background." The dark theme itself stays. Two concrete asks emerged:

1. Remove the neon aesthetic — both the 3D scene's glowing floor-perimeter trim/wall accent stripes, and the UI's core violet brand color.
2. Replace the abstract distant skyline with a much fuller, closer, more detailed town layer.

These are independent enough to ship separately. This spec is (1) only — a global recolor plus removal of neon-specific geometry. (2), the new town layer, is a separate, larger design effort with its own upcoming brainstorming round.

## Decisions (confirmed via user Q&A, including a visual comparison of 4 candidate colors)

- New brand color: **moss green, `#6B8F4E`** — chosen over steel blue, deep teal, and brick red alternatives shown side-by-side against the actual dark background.
- Applies to **both** the 3D scene's accent usage and the UI's core violet (`accentPrimary` in `constants/theme.ts`) — not just the 3D glow.
- Wall trim: **no trim at all** — both the glowing `NeonPerimeter` floor strip and `WallPanel`'s separate painted (non-glowing) accent stripe are removed entirely, not recolored.
- Every other place the old violet hex (`#8B5CF6`) appears anywhere in the codebase also updates to moss green, **including incidental/decorative uses** (e.g. a yoga-mat-basket decoration's color variety) — full consistency, not just "brand-labeled" usages.

## Architecture

### `constants/theme.ts`

```ts
accentPrimary: "#8B5CF6" → "#6B8F4E"
accentPrimaryMuted: "rgba(139, 92, 246, 0.16)" → "rgba(107, 143, 78, 0.16)"
```

Every 2D screen already reads these tokens (per this file's own header comment: "Keep every screen pulling from here so visual language stays consistent") — no per-screen changes needed, the whole UI updates from this one edit.

### `components/GymFloor3D.tsx`

- `NEON_COLOR` constant value changes from `"#8B5CF6"` to `"#6B8F4E"`. The constant itself is **kept** (not deleted) — after removing the wall-trim usages below, its one remaining reference is the drag-highlight-tile shown at the nearest valid drop cell while moving equipment (`PlacementGhost`), which is a real interactive affordance, not decorative neon, so it stays and simply recolors.
- **`NeonPerimeter` component removed entirely**, along with its single mount point in the scene tree. This removes the glowing floor-perimeter strips and their `GlowLayer` bloom-effect duplicates.
- **`WallPanel`'s accent stripe removed entirely**: the `accentOffset`/`accentMaterial` props and the stripe mesh they drive are deleted from `WallPanel`'s signature and body. All 4 call sites in `GymWalls` (one per side: front/back/left/right) drop those two props.
- **`GymWalls`' per-side `materials` record simplifies** from `{ wall, accent }` to just `{ wall }` per side — the `accent` `MeshStandardMaterial` creation and its per-frame opacity assignment (in the `useFrame` added by the wall-occlusion-hide work) are removed, since there's no longer an accent stripe to fade.
- `GlowLayer` itself is **not** removed — it's also used by `OverheadLedArray`'s ceiling LED fixtures, an unrelated feature untouched by this change.

### `components/GymDecor.tsx`

- `BRAND_COLOR` (a deliberate by-value duplicate of the old `NEON_COLOR`, per its own comment) changes from `"#8B5CF6"` to `"#6B8F4E"` — used for the wall-mounted brand emblem poster.
- `YogaBasket`'s `matColors` array: the `"#8B5CF6"` entry (one of 3 decorative mat colors) changes to `"#6B8F4E"` — purely incidental reuse of the old hex for decorative variety, changed anyway per the "full consistency" decision above.

### `components/InspectorPanel.tsx`

- `EQUIPMENT_COLOR_SWATCHES`: the violet entry changes to `"#6B8F4E"`. This array's own existing comment states it "reus[es] hex values already present in the game's equipment catalog and neon signage... keeps player recoloring visually consistent with the existing aesthetic" — updating it to the new brand color is exactly what that stated intent calls for once the brand color itself changes.

## Error Handling

- `WallPanel` has exactly one caller (`GymWalls`' 4 panel invocations) — confirmed via search, so the prop-signature change has no other call site to reconcile.
- `NeonPerimeter` has exactly one mount point — removing it leaves nothing dangling.
- `GlowLayer` is confirmed still needed by `OverheadLedArray` — not orphaned by removing `NeonPerimeter`'s usage of it.
- New `accentPrimaryMuted` rgba value is correctly derived from the new hex (`#6B8F4E` → `rgb(107, 143, 78)`).

## Testing

No automated tests in this repo (no Jest, no `*.test.ts` anywhere — established convention throughout this project). Manual verification:

1. Every 2D screen (top bar, shop, Inspector panel, workout tracker, XP progress bar) shows moss green instead of violet, consistently.
2. On the 3D Gym Floor: no stripe on any wall, no glowing floor-perimeter trim visible anywhere.
3. Equipment recolor swatches in the Inspector show moss green as one option, not violet.
4. The wall-mounted brand emblem poster (`GymDecor`) shows moss green.
5. The yoga-mat-basket decoration's third mat color shows moss green instead of violet.
6. Drag an owned equipment item to move it — the highlighted valid-drop-cell tile is moss green.
7. Ceiling LED fixtures (`OverheadLedArray`) still render normally — untouched, unrelated to this change.
8. A full visual scan of the app turns up zero remaining instances of the old violet.
