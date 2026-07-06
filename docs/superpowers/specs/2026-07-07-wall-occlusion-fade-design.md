# Wall Occlusion Hide Design

## Context

`GymWalls` (`components/GymFloor3D.tsx`) currently fades its entire wall shell uniformly toward `MIN_WALL_OPACITY` (0.12) whenever the camera is within `WALL_FADE_DISTANCE` (3 units) of *any* wall plane — a single shared `wallMaterial`/`accentMaterial`/`pillarMaterial` set, faded in lockstep.

This doesn't solve the actual problem: the camera always orbits *outside* the whole rectangular room. Whichever 1-2 walls form the corner nearest the camera's current angle sit directly between the camera and the interior — and those walls stay fully opaque unless the camera happens to be literally close to them (within 3 units), even when the camera is further out but still looking straight through that near-side wall at equipment on the far side of the room.

Confirmed via user Q&A: both failure modes happen — (1) a near-side wall blocks far-side equipment while orbiting from a distance, and (2) even zoomed in close to a wall, the existing 12%-opacity floor still isn't transparent enough to see through comfortably.

## Revision History

An earlier version of this spec proposed occlusion-aware **fading** (same per-side idea, but fading to `MIN_OCCLUSION_OPACITY = 0.03` instead of fully hiding). The user rejected it as still not working, asking for a genuine rethink rather than a further number tweak. Reconsidered against how comparable games handle this exact camera style (RimWorld, The Sims, Prison Architect — all fully cull near-side walls in a "dollhouse" view rather than fade them) — confirmed with the user: **fully hide near-side walls**, not fade-to-near-zero. A technical reason this is the right call, not just a stylistic one: a wall material at `opacity: 0` is visually invisible but its mesh still **casts a shadow** (shadow-casting isn't affected by material opacity), which would produce a floating shadow with no visible caster — its own glitch, arguably worse than the original problem. True hiding (setting the mesh/group `visible = false`) avoids this because three.js skips both rendering and shadow-casting for invisible objects.

## Decisions (confirmed via user Q&A)

- Fade must be **occlusion-aware** (which side of the room the camera is currently on), not literal camera-to-wall-plane distance. Fully replaces the old distance-based mechanism.
- Near-side walls are **fully hidden** (not rendered, not shadow-casting) once faded out — not merely faded to a low opacity.
- Transition is a brief fade-then-hide (not an instant on/off pop): fade the wall's opacity down quickly, then hide it once nearly transparent; on the way back, un-hide immediately and fade the opacity back up, so the reveal is visible from the start rather than snapping to full opacity.

## Architecture

### `components/GymFloor3D.tsx`

Replace `GymWalls`' three shared materials (`wallMaterial`, `accentMaterial`, `pillarMaterial`) with one material pair per side, and wrap each side's panels + tagged pillars in its own group so visibility can be toggled per side:

```ts
const SIDES = ["front", "back", "left", "right"] as const;
type Side = (typeof SIDES)[number];
```

Each side (`front` = `maxZ`/entrance, `back` = `minZ`, `left` = `minX`, `right` = `maxX`) gets:
- its own `wallMaterial`/`accentMaterial` pair
- its own eased opacity ref
- a `<group ref={sideGroupRef}>` wrapping its panel(s) and tagged pillars, so `visible` can be toggled on the whole side at once

The front side's two panel pieces — the solid `frontLeft` `WallPanel` and the `WindowedWallSegment` flanking the entrance — both live inside the same front group and use the same front material pair, so they fade and hide in lockstep as one visual side.

Per-frame (`useFrame`), for each side:

```ts
const isNear = {
  front: camera.position.z > maxZ,
  back: camera.position.z < minZ,
  left: camera.position.x < minX,
  right: camera.position.x > maxX,
};

// for each side:
const target = isNear[side] ? 0 : 1;
opacityRef[side] += (target - opacityRef[side]) * Math.min(1, delta * HIDE_EASE_RATE);
sideMaterial[side].opacity = opacityRef[side];
sideAccentMaterial[side].opacity = opacityRef[side];

if (isNear[side] && opacityRef[side] < HIDE_OPACITY_THRESHOLD) {
  sideGroupRef[side].current.visible = false;
} else if (!isNear[side]) {
  sideGroupRef[side].current.visible = true;
}
```

`HIDE_EASE_RATE` is a faster ease than the old `WALL_FADE_EASE_RATE` (6) — a quick fade (a few frames) reads as "wall whooshing away," not a slow lazy fade. `HIDE_OPACITY_THRESHOLD` (e.g. 0.05) is the point at which the group actually gets hidden, after the material has visually faded out — avoiding a pop where a still-partially-opaque wall vanishes abruptly.

**Pillars**: each of the existing 8 pillar positions is tagged with the side(s) it structurally belongs to (4 true corners: two sides each; 2 entrance-flanking + 2 mid-span: one side each). Single-side pillars render inside that side's group, hidden/shown with it automatically. Corner pillars (belonging to two sides) render in their own small group, outside the 4 side groups, with their own visibility rule evaluated in the same per-frame loop: `cornerVisible = !(opacityRef[sideA] < HIDE_OPACITY_THRESHOLD && opacityRef[sideB] < HIDE_OPACITY_THRESHOLD)` — hidden only when *both* adjacent sides' opacity have dropped below the threshold (camera is near that exact corner), staying visible as long as at least one adjacent wall is still shown.

**Removed entirely**: `WALL_FADE_DISTANCE`, `WALL_FADE_LATERAL_MARGIN`, the old `MIN_WALL_OPACITY` (0.12) constant, and the old single distance-computation block in `GymWalls`' `useFrame`.

`EntranceDoor` (the glass double-door) is untouched — same reasoning as before: already semi-transparent by fixed design, never part of the old fade system, doesn't meaningfully block the view regardless of camera position.

## Error Handling

- **Camera literally inside the bounds** (all four `isNear` checks false simultaneously): unreachable in practice given existing zoom/height clamps — not specially handled.
- **Shadow-casting glitch avoided by construction**: hiding via group `visible = false` (not opacity alone) means three.js skips shadow-casting for hidden geometry — no floating-shadow artifact, which was the concrete technical reason to prefer hiding over fading in the first place.
- **Corner pillars**: visible as long as at least one adjacent side is shown; only hidden when both adjacent sides are hidden simultaneously (i.e., camera is near that exact corner) — never disappears while one of its two walls is still standing.
- **Front side's two panel pieces move together**: both inside the same front group, using the same front material, so there's no code path where they could desync.
- **Performance**: same reasoning as before — per-frame numeric `.opacity` writes plus an occasional boolean `.visible` write, no new draw calls when visible, and *fewer* when hidden (three.js skips hidden objects during traversal), so this is a net perf win over the always-rendered-but-faded approach, not a cost.

## Testing

No automated tests in this repo (no Jest, no `*.test.ts` anywhere — established convention throughout this project). Manual verification:

1. Orbit while zoomed out (no wall within the old close-range) — the near-side wall now fully disappears (not just fades) so far-side equipment is completely unobstructed. This is the actual complaint being fixed.
2. Zoom in close to one wall — it fades quickly then disappears entirely, no lingering shimmer/ghost.
3. Orbit through all four sides and each corner — only the 1-2 currently-near walls hide; the opposite far wall(s) stay solid throughout.
4. Confirm the entrance's solid-left-panel and windowed-right-segment fade/hide in exact sync.
5. Confirm corner pillars stay visible as long as one of their two adjacent walls is still shown, and only disappear when both are hidden (camera near that exact corner).
6. Confirm no floating-shadow artifact appears where a hidden wall used to be.
7. Confirm `EntranceDoor` glass is unaffected by this change.
8. Quick on-device FPS check — should be neutral-to-positive versus today (hidden geometry is skipped, not rendered-but-transparent).
