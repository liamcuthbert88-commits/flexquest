# Exterior Scenery + Camera Bounds Design

## Context

The 3D Gym Floor's camera orbits/pans/zooms around a play area that only covers the `getPlayAreaBounds(unlockedZones)` rectangle — the tiled gym floor, walls, and neon trim all stop exactly at that boundary. Beyond it there's nothing until `GymBackdrop`'s distant 55-unit-radius skyline ring (a pure silhouette). Zoomed out or panned far enough, the camera can currently see past the floor's edge into that empty gap — flat background color, no ground, no detail. This reads as broken/unfinished.

The building's footprint is a growing **rectangle**, not a circle: X grows symmetrically as zones unlock (±1 tile per zone), Z only grows on the far side (`minZ` shrinks), while the entrance side (`maxZ`) is permanently fixed regardless of how many zones are owned (existing invariant, see `constants/zones.ts`).

## Decisions (confirmed via user Q&A)

- The camera issue **is** the empty-void gap beyond the tiled floor when zoomed out — not clipping/underground/other camera bugs.
- Road is **static** (asphalt, lane markings, curb) — no animated traffic. Matches this project's consistent perf-conscious patterns (capped LED rows, instanced meshes everywhere repeated geometry appears, no extra lights).
- Car park spots and bus stop are **decorative only** — no NPC interaction, no tap-to-inspect, no gameplay logic.
- Scenery wraps the building **all the way around (360°)**, not just the entrance side.
- **Nothing about this is purchasable.** The exterior is always fully present from the start, free — passive scenery only. The bounds-tracking described below exists solely so the exterior doesn't clip through the building's own walls as *other* purchases (zone unlocks) grow the building outward; it is not itself a purchasable or unlockable feature.

## Architecture

### `constants/zones.ts`

One new constant:

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

### `components/GymExterior.tsx` (new file)

New file rather than growing `GymFloor3D.tsx` further (already a very large file) — this is a self-contained, bounds-driven set of exterior meshes with no interaction logic, a clean unit boundary.

```ts
type GymExteriorProps = { bounds: PlayAreaBounds };

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

- **`ExteriorGround`**: one large flat plane, radius 60 (comfortably past `GymBackdrop`'s 55-unit skyline ring so there's no gap before it), a dark neutral ground material. This alone fixes "visible void" — everywhere the camera can possibly see now has *some* ground, regardless of the more detailed road/parking geometry's exact placement. Mounted once, not bounds-dependent (unlike the road/parking below) — it only needs to be big enough to always exceed the building, not resized as the building grows.
- **`ExteriorRoad`**: a rectangular loop of asphalt-textured segments, offset `EXTERIOR_RING_WIDTH` outside the current `bounds` — same 4-panel perimeter construction `GymWalls` already uses (`components/GymFloor3D.tsx`'s `GymWalls` function), just further out, different material (asphalt, not painted wall), with simple lane-marking geometry (thin light-colored stripes) down the centerline of each segment.
- **`ParkingSpaces`**: an `InstancedMesh` of thin rectangular line markings (single draw call regardless of count — same technique `TiledFloor` already uses for its tile grid), laid out along one long side of the road loop.
- **`BusStop`**: one static structure (roof panel + 2 support posts + a bench — a handful of plain meshes, no instancing needed since only one exists), positioned at a fixed offset from the entrance wall (`maxZ`, which never moves regardless of zones owned) so it always sits in a sensible, stable spot relative to the building's front.

### `components/GymFloor3D.tsx`

Mount `<GymExterior bounds={playAreaBounds} />` in `GymFloorScene`'s JSX alongside the existing `<TiledFloor>`/`<GymWalls>`/`<NeonPerimeter>` (same `bounds` prop, same position in the render tree — outside the walls, so it renders behind/around them). `ExteriorRoad`/`ParkingSpaces` need the same bounds-driven remount-via-`key` treatment `TiledFloor` already uses (`` key={`${bounds.minX}-${bounds.maxX}-${bounds.minZ}-${bounds.maxZ}`} ``), since their `InstancedMesh` instance counts are fixed at mount and can't resize in place when a zone unlock changes `bounds`.

**Camera ceiling** (in `CameraRig`'s existing `useFrame`, right alongside the current `MAX_CAMERA_HEIGHT` clamp): cap the effective `orbitRadius` so it can never put the camera past the exterior's outer edge, computed fresh each frame from the already-live `boundsRef.current` (no new ref needed):

```ts
const maxOrbitRadius =
  Math.max(boundsRef.current.maxX - boundsRef.current.minX, boundsRef.current.maxZ - boundsRef.current.minZ) / 2 +
  EXTERIOR_RING_WIDTH;
const orbitRadius = Math.min(currentRadiusRef.current + zoomOffsetRef.current, maxOrbitRadius);
```

Uses the larger of width/depth as a conservative circle-approximation radius (the building is a rectangle, not a circle — this errs generous rather than exact, consistent with the ground plane's own generous-sizing philosophy rather than precise per-angle frustum math). Grows automatically as `bounds` grows with zone purchases, same as the ground/wall geometry it's protecting the view of.

## Error Handling

- **Zone unlock mid-session**: `ExteriorRoad`/`ParkingSpaces` resize via the same `key`-remount approach `TiledFloor` already uses — no new failure mode, same established pattern.
- **Camera ceiling feeling more restrictive than today's actual range**: `EXTERIOR_RING_WIDTH` (14) is chosen to keep `maxOrbitRadius` comfortably above the current system's existing practical max (today's `MAX_ZOOM_OFFSET`/`ORBIT_RADIUS_PER_ZONE` ceiling), so the new cap is a safety guarantee for the visual-completeness goal, not a felt zoom restriction. If playtesting shows otherwise, `EXTERIOR_RING_WIDTH` is the single value to increase.
- **`BusStop` collision with interior geometry**: fixed offset from the invariant entrance wall (`maxZ`) keeps it in the new ring area only, never overlapping the entrance door, `NeonPerimeter` trim, or pathway columns.
- **No new lights**: all new meshes use `meshStandardMaterial`/plain color, lit by the existing single directional + ambient light pair — matches this file's consistent avoid-extra-lights convention (documented inline at `OverheadLedArray`'s comment on shadow-casting light budget).

## Testing

No automated tests in this repo (no Jest, no `*.test.ts` anywhere — established convention throughout this project). Manual verification:

1. Zoom out fully at 0 zones owned (smallest building) — no visible void/background-color gap; ground and road fill the view.
2. Buy a zone (bounds grow) — exterior ring resizes/repositions with no clipping or seam against the new wall position.
3. Buy all 4 zones (largest building) — repeat check.
4. Try to zoom out past the new ceiling — camera stops there; nothing unfinished visible beyond the apron.
5. Orbit a full 360° at various zoom levels — road loop and parking markings render correctly on all four sides, no gaps at corners.
6. Bus stop renders once near the entrance, no clipping through the door/walls.
7. Quick on-device FPS eyeball check — confirm no visible hitch from the new geometry.
