# Wall Occlusion Fade Design

## Context

`GymWalls` (`components/GymFloor3D.tsx`) currently fades its entire wall shell uniformly toward `MIN_WALL_OPACITY` (0.12) whenever the camera is within `WALL_FADE_DISTANCE` (3 units) of *any* wall plane — a single shared `wallMaterial`/`accentMaterial`/`pillarMaterial` set, faded in lockstep.

This doesn't solve the actual problem: the camera always orbits *outside* the whole rectangular room. Whichever 1-2 walls form the corner nearest the camera's current angle sit directly between the camera and the interior — and those walls stay fully opaque unless the camera happens to be literally close to them (within 3 units), even when the camera is further out but still looking straight through that near-side wall at equipment on the far side of the room.

Confirmed via user Q&A: both failure modes happen — (1) a near-side wall blocks far-side equipment while orbiting from a distance, and (2) even zoomed in close to a wall, the existing 12%-opacity floor still isn't transparent enough to see through comfortably.

## Decisions (confirmed via user Q&A)

- Fade must be **occlusion-aware** (which side of the room the camera is currently on), not literal camera-to-wall-plane distance. This fully replaces the old distance-based mechanism — a close-up camera is just an extreme case of "camera is on that wall's side," so no need to keep both systems.
- The near-side wall(s) should fade to **nearly invisible** (not the old 12% floor) — new constant `MIN_OCCLUSION_OPACITY = 0.03`.

## Architecture

### `components/GymFloor3D.tsx`

Replace `GymWalls`' three shared materials (`wallMaterial`, `accentMaterial`, `pillarMaterial`) with one material pair per side:

```ts
const SIDES = ["front", "back", "left", "right"] as const;
type Side = (typeof SIDES)[number];
```

Each side (`front` = `maxZ`/entrance, `back` = `minZ`, `left` = `minX`, `right` = `maxX`) gets its own `wallMaterial`/`accentMaterial` pair and its own eased opacity ref (four of each, instead of one shared set). The front side's two panel pieces — the solid `frontLeft` `WallPanel` and the `WindowedWallSegment` flanking the entrance — both use the *same* front material pair, so they fade in lockstep as one visual side rather than independently.

Per-frame (`useFrame`), for each side, determine whether the camera is currently on that side:

```ts
const isNear = {
  front: camera.position.z > maxZ,
  back: camera.position.z < minZ,
  left: camera.position.x < minX,
  right: camera.position.x > maxX,
};
```

For each side: `targetOpacity = isNear[side] ? MIN_OCCLUSION_OPACITY : 1`, eased toward that target every frame using the same lerp rate the old system already used (`WALL_FADE_EASE_RATE`), so crossing from one side to another (e.g. orbiting from front-facing to right-facing) still fades smoothly rather than popping.

**Pillars**: each of the existing 8 pillar positions is tagged with the side(s) it structurally belongs to — the 4 true corners belong to two sides each (e.g. `(minX, minZ)` belongs to `left` and `back`); the 2 entrance-flanking pillars and 2 mid-span pillars belong to one side each. A pillar's rendered opacity is the *more transparent* (lower) of its tagged side(s)' current opacity, so a corner pillar never stands out as a solid post next to a wall that's faded away.

**Removed entirely** (superseded by the above, not kept alongside it): `WALL_FADE_DISTANCE`, `WALL_FADE_LATERAL_MARGIN`, the old `MIN_WALL_OPACITY` (0.12) constant and its associated distance-computation block in `GymWalls`' `useFrame`.

**New constant**: `MIN_OCCLUSION_OPACITY = 0.03` — near-invisible but not literally `0`, matching the original system's "still reads as a see-through boundary, not a vanished object" reasoning, just tuned much lower per the user's "nearly invisible" preference.

`EntranceDoor` (the glass double-door) is untouched — it was never part of the old fade system either (already semi-transparent by fixed design, no accent stripe, per its existing comment), and doesn't meaningfully block the view regardless of camera position.

## Error Handling

- **Camera literally inside the bounds** (all four `isNear` checks false simultaneously, reading every wall as "far"/opaque): unreachable in practice given the existing zoom/height clamps that keep the camera outside the shell by construction — not specially handled, same implicit assumption the old system already made.
- **Corner cases correctly fade two sides at once**: when the camera sits near an actual corner, both adjacent walls read `isNear`, and both fade — this is correct behavior (both genuinely sit between camera and interior from a corner angle), not a bug to guard against.
- **Front side's two panel pieces must move together**: both consume the same front material pair, so there's no code path where the solid panel and windowed segment could desync.
- **Performance**: eight materials instead of three is still just per-frame numeric `.opacity` writes on already-`transparent: true` materials — no new draw calls, no render-pipeline change, negligible cost difference from today.

## Testing

No automated tests in this repo (no Jest, no `*.test.ts` anywhere — established convention throughout this project). Manual verification:

1. Orbit while zoomed out (no wall within the old close-range) — the near-side wall now fades near-invisible so far-side equipment stays visible. This is the actual complaint being fixed.
2. Zoom in close to one wall — it fades near-invisible (stronger than the old 12% floor).
3. Orbit through all four sides and each corner — only the 1-2 currently-near walls fade; the opposite far wall(s) stay solid throughout.
4. Confirm the entrance's solid-left-panel and windowed-right-segment fade in exact sync.
5. Confirm corner/mid-span pillars fade correctly — no solid post standing out against an already-faded wall.
6. Confirm `EntranceDoor` glass is unaffected by this change.
7. Quick on-device FPS check — no regression from the extra materials.
