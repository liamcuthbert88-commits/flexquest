# FlexQuest Graphics Roadmap

Audit of the 3D rendering pipeline as of the `graphics-overhaul-v1` commit. This
is an analysis document only — no gameplay or visual changes are made here.

Scope: `components/GymFloor3D.tsx`, `GymEquipmentModels.tsx`, `GymNpcs.tsx`,
`GymStaff.tsx`, `GymBackdrop.tsx`, `GymDecor.tsx`, and the dependency stack in
`package.json`.

## Status updates (since the original audit)

- **Item 1 (dpr cap): attempted, then reverted.** `@react-three/fiber/native`
  has no `dpr` prop at all (it hardcodes `dpr: PixelRatio.get()` internally,
  citing `expo/expo-three#39`). A resolution-scaling workaround was
  implemented (render the GL surface smaller, transform-scale it back up) but
  broke tap-to-select twice — once as a coordinate offset, once as a total
  selection failure — because it required a second, differently-sized `View`
  between the gesture responder and the `Canvas`, and RN's
  `locationX/locationY` resolve ambiguously once views like that are nested
  and transformed. Reverted in full; native pixel ratio is uncapped again.
  Correct input took priority over this optimization.
- **Items 2 & 3 (shadow-casting light count / shadow map tuning): done.**
  `EquipmentSpotlight` no longer casts shadows (`castShadow={false}`) — the
  visual spotlight cone is unchanged, but shadow-casting cost is now fixed at
  1 light regardless of equipment owned, not 1–7. The remaining shadow light
  has an explicit `shadow-mapSize={[1024,1024]}` and a frustum tightened to
  the largest possible play area instead of engine defaults.
- **Item 5 (instance `GymBackdrop`): done.** Its 16 buildings now render via
  two `InstancedMesh`es (bodies, window panes) instead of 32 separate meshes
  — same technique as `TiledFloor`, collapsing to 2 draw calls.
- **Items 4, 6–12: still open**, unchanged from the original audit below.

## New this pass (environment art, not performance)

Not part of the original performance audit, but changes an art-direction pass
made to the files this roadmap covers:
- `TiledFloor` now has a "pathway" strip (2 of its 8 tile columns get a
  distinct warm tone) — still one `InstancedMesh`, one material; only the
  per-instance color data changed, no new draw calls.
- `GymWalls` gained `WindowedWallSegment` — one wall segment (front-right) is
  now built from a sill + lintel + solid infill pieces around 2 glass
  openings, instead of one solid box. A few more static meshes on that one
  segment, no lights, no shadows added.
- `GymDecor`'s mirror wall went from 3 gapped panels to 2 large ones (a
  deliberate gap remains at the mid-span structural pillar, which a single
  continuous panel would otherwise clip through), plus a new `CheckInTerminal`
  prop. Same draw-call class as before — a few more static meshes, nothing
  that scales with anything.

## Character animation pass (`GymNpcs.tsx`, `GymStaff.tsx`)

Visual-only overhaul, not a performance pass — flagged here since it changes
per-frame cost slightly (a handful of extra `sin`/`atan2`/`exp` calls per
character per frame, negligible next to the shadow/fill-rate costs above) and
touches files this roadmap tracks.

**Architecture**: `updateNpc` (the state machine — arrival detection, state
transitions, timers, economic side effects like `onRecharged`) is completely
unchanged. A new visual layer runs *after* it each frame in `GymNpcs`' render
loop: it computes a `renderPosition` that exponentially eases toward the
logical `position` (frame-rate-independent, via `1 - Math.exp(-rate * delta)`,
not a naive linear lerp) instead of snapping to it, a `facingAngle` derived
from the logical movement delta and smoothed the same way (with shortest-path
wraparound via a new exported `lerpAngle`), and small additive per-state
animations (walk bob, an asymmetric "fast push / slow return" exertion curve
rather than a symmetric sine, idle lateral sway) driven by a deterministic
per-NPC `animationSeed` (index-derived, not `Math.random()`) so 3 NPCs never
animate in lockstep. None of this feeds back into the logical `position`,
`state`, or timers.

Two-tone clothing (a `CLOTHING_ACCENT_COLORS` palette cycled by index, applied
as a "shorts band" + "shirt front" panel) was added mainly to make the facing
rotation *visible* at all — a bare capsule+sphere is rotationally symmetric
and would show nothing when turned. The Trainer/Janitor in `GymStaff.tsx`
already had asymmetric props (clipboard, mop) so they only needed the
rotation system, not new geometry, applied via the same exported `lerpAngle`.

A new `EQUIPMENT_NPC_OFFSETS` lookup (visual-only) nudges the render position
while `workingOut` to roughly match each hand-built model's actual seat/belt/
handle height (e.g., the Bench Press's ~0.4 seat height, the Lat Pulldown's
seat position) instead of always standing flat on the floor beside the
equipment. Cost: negligible — a handful of extra static meshes per character,
some cheap trig per frame, no new lights, shadows, or draw-call scaling.

## Screen layout restructure (`app/tycoon.tsx`, new `GymTopBar.tsx`/`GymBottomNav.tsx`)

Note on scope: the request asked to rewrite "App.tsx or the main screen
wrapper." Neither exists as a single top-level container — this project uses
Expo Router (`app/` directory, file-based routes; `app/_layout.tsx` is just
the root `Stack`), and the tycoon experience is its own route,
`app/tycoon.tsx`. That's the file rewritten here; navigation between *routes*
(Home, Workout, Tycoon) is unchanged, only the internal layout of the tycoon
route itself.

**Architecture**: `app/tycoon.tsx` now renders `GymTopBar` (fixed, showing
cash/gym level/member count — the full detailed Gym Level card with the
renown bar and prestige button moved to the Shop page, since it's more
detail than a "clean, minimal" bar should carry), a page area gated by a new
`activePage` state (`"gymFloor" | "shop" | "leaderboard" | "challenges"`),
and `GymBottomNav` (fixed). All state/handlers (`handlePurchaseResult`,
`handleCollectTap`, `injectDevRiches`, etc.) are unchanged — only the JSX
layout around them moved. The existing 5-way shop category tabs
(Equipment/Upgrades/Managers/Zones/Staff) are untouched and now nest inside
the "Shop" page rather than sharing space with the Gym Floor canvas.

**3D rendering pause**: `GymFloor3D` is conditionally rendered
(`{activePage === "gymFloor" && <GymFloor3D .../>}`) rather than kept mounted
with a toggled `frameloop` prop. This was a deliberate choice over the
alternative (keep mounted, flip `frameloop="never"`/`"always"`): a full
unmount guarantees zero GL context, zero `useFrame` calls, and zero shadow/
particle/NPC work while on any other tab — the most complete version of
"pause" available, and simpler to reason about without a device to verify
`frameloop` toggling behaves correctly under repeated switches. The
trade-offs, both expected rather than bugs: NPC positions, camera angle/zoom,
and any 3D selection reset each time the tab is left and returned to (this
screen explicitly clears `selection` on tab-away in `handleSelectPage`, so
the Inspector Panel never shows stale state against a freshly-mounted, blank-
selection scene); and the Smoothie Bar Clerk's small recharge-cash bonus
pauses while away, since it fires off an NPC actually completing a recharge
cycle. The core `cashPerSecond` tick lives in `UserContext` at the app root
and is entirely unaffected — it was never coupled to NPCs being simulated.

Also dropped: the scroll-linked parallax on the old Gym Level card (from the
UI-polish pass a few phases back). It doesn't have a coherent equivalent in
the new layout — that card is no longer a fixed header sitting above content
that scrolls beneath it; it's now itself part of the Shop page's own
scrollable content.

## Camera system: free panning replaces manual orbit rotation (`GymFloor3D.tsx`)

Note on the request's suggested implementation: `@react-three/drei` is not a
dependency of this project (see the architecture section below), and its
`OrbitControls` is DOM-only regardless of any `/native` import path — this
was decided against explicitly, early in the project. This pass extends the
existing hand-rolled `PanResponder`/`CameraRig` system instead of introducing
that dependency.

**This is a deliberate interaction-model change, not an addition on top of
the old one.** Previously: 1-finger drag rotated `azimuth`/`polar` around a
fixed origin; 2-finger pinch zoomed. Now: 1-finger drag **pans** a ground-
plane target (`panXRef`/`panZRref`) that the camera orbits around instead of
the origin; 2-finger pinch still zooms. `azimuth`/`polar` control described
below (zoom-linked auto-tilt, no manual rotation) was superseded one phase
later — see "Camera rotation restored" further down — by manual two-finger
rotate/tilt. Left in place as a record of how the system evolved rather than
rewritten away, per this project's practice elsewhere in this doc.

**Bounded panning**: the pan target is clamped every move (not just on
release) to `getPlayAreaBounds(unlockedZones)` — the same bounds the walls,
neon trim, and decor already use — inset by a small margin (`PAN_BOUNDS_MARGIN`)
so the target can't center exactly on/past a wall. Reuses existing bounds
logic rather than introducing separate boundary constants.

**Momentum**: `onPanResponderRelease` reads RN's own `gestureState.vx/vy`
(release velocity, already provided by `PanResponder`, not hand-estimated)
and seeds a `panVelocityRef` that `CameraRig` integrates and exponentially
decays (`Math.exp(-MOMENTUM_DECAY_RATE * delta)`) each frame, clamped to the
same bounds as live dragging. Starting a new touch zeroes any residual
velocity immediately (standard "grab to stop" behavior). Momentum is only
armed when the released gesture was a genuine single-finger pan — not a tap,
and not a release following a pinch, since a pinch's `vx/vy` reflects the two
touches' average motion rather than a coherent pan intent.

**Zoom-linked pitch ("angle interpolation")**: `getZoomLinkedPolar(orbitRadius)`
maps the current zoom distance to a target pitch — near `MAX_POLAR` (low,
near-horizontal) when zoomed in close, near `MIN_POLAR` (top-down overview)
when zoomed out — and `CameraRig` eases `polarRef` toward that target every
frame (`1 - Math.exp(-POLAR_EASE_RATE * delta)`, the same frame-rate-
independent smoothing pattern used for the NPC animation work) rather than
snapping to it.

**Hit-testing**: `worldToScreen`/`findClosestSelection` needed two new
required parameters, `targetX`/`targetZ` — not a changed algorithm. The
throwaway replica camera these functions build for tap projection has to
know where the real camera's look-at target currently is; leaving it hard-
coded at the origin (its old, always-correct assumption pre-panning) would
silently miscalculate every tap the moment the camera pans away from (0,0).
Both functions still do exactly what they did before: project world
positions through a temporary camera and compare screen-space distance to
the tap — only their inputs changed to stay correct. This project has hit
exactly this class of coordinate-space bug twice before (the dpr workaround's
`locationX/locationY` ambiguity, both attempts), which is why this was
treated carefully rather than assumed to not matter.

## Camera rotation restored: two-finger twist + tilt (`GymFloor3D.tsx`)

One phase after panning replaced manual rotation, manual rotation came back
— as a separate gesture channel rather than reverting panning. The two-
finger gesture that already drove pinch-zoom now drives three signals
simultaneously, all derived from the same two touch points each move event:
distance change → zoom (unchanged), twist angle → azimuth (new, full 360°,
never clamped), average vertical movement of both touches → pitch (new,
clamped). This is a standard, well-established multi-touch technique (the
same idea behind resize+rotate in any photo editor) — geometrically, two
touch points carry four raw values (two X/Y pairs), which is enough
independent information to extract distance, angle, and centroid position
all at once without them interfering with each other.

**Desktop right-click fallback — not implemented, flagged rather than
attempted.** `PanResponder` is a touch-oriented API; RN's synthetic pointer
events it receives from a mouse click carry no accessible "which button was
pressed" property, and this project has no separate DOM mouse-event path
wired to the canvas. Faking right-click detection through `PanResponder`
would be guesswork with no way to verify it on a device or browser in this
environment, unlike the touch gestures below, whose underlying math could at
least be checked numerically. Given the project's primary target has been
mobile touch throughout, this was left undone rather than shipped unverified.

**Twist → azimuth**: `getTouchAngle` computes `atan2(dy, dx)` of the line
between the two touches; the gesture start captures that angle and the
azimuth at that moment, and every subsequent move applies
`azimuth = startAzimuth + angleDifference(currentAngle, startAngle)`.
`angleDifference` is a small new helper doing the same shortest-path -π/π
wraparound as `GymNpcs.tsx`'s `lerpAngle` — without it, a twist that happens
to cross that boundary mid-gesture would register as a ~360° snap instead of
the few-degree rotation it actually was. Verified numerically (not just
algebraically) before shipping: `angleDifference(-170°, 170°)` returns `+20°`,
not the naive `-340°`. No clamp on the result — full continuous 360°
rotation, per the brief.

**Two-finger vertical drag → pitch**: the average Y of both touches at
gesture start vs. current gives a vertical delta, scaled by
`TWO_FINGER_TILT_SPEED` and clamped to the same `MIN_POLAR`/`MAX_POLAR`
bounds pitch has always had (never beneath the floor, never a perfect
top-down view — see the comment above those constants). This replaces last
phase's zoom-linked auto-tilt entirely; pitch is manual again, the same as
azimuth, both direct/unlagged like zoom already was (no easing — all three
are active real-time manipulation and should track fingers exactly, per the
same rationale `CameraRig`'s doc comment already gave for zoom).

**Cohesive interpolation — pan now rotates with azimuth.** This is the part
that actually required new math, not just gesture wiring. Once azimuth can
change, last phase's pan formula (`panX -= deltaX * PAN_SPEED`, assuming the
camera always faces azimuth=0) becomes wrong: dragging "forward" after a
180° rotation would move the target along the same fixed world axis as
before — backward relative to the new view, precisely the bug item 3 in the
request describes. Fixed with a new `rotateDragToWorld(deltaX, deltaY,
azimuth)`, a standard 2D rotation matrix applied to the screen-space drag
vector before it's used, derived directly from `CameraRig`'s own position
formula so the two can't drift apart. Applied in three places that all
needed it: live 1-finger panning, momentum's velocity seeding (a flick
released mid-rotation now glides in the direction it visually looked headed,
not along stale world axes), and nowhere else — the 2-finger gesture's own
zoom/rotate/tilt maths don't route through it, since those already work
directly in screen/gesture space.

Verified numerically, since none of this can be exercised by touch in this
environment: at azimuth=0 the rotation reduces to the exact identity the old
formula used (`worldX=deltaX, worldZ=deltaY`); at an arbitrary azimuth the
transform preserves the drag vector's magnitude (confirming it's a proper
rotation, not introducing any scaling); at azimuth=90°, dragging right
resolves to `worldZ≈10, worldX≈0` as hand-derived from the position formula.
All four checks passed before this was considered done. What's *not*
verified, and can't be without a real device: whether the direction feels
right in the hand — that twist-clockwise rotates the view clockwise (not the
reverse) and drag-forward pulls the floor toward the viewer at every
rotation, not just the ones checked by hand. If either feels backward on
device, it's a one-line sign flip in `rotateDragToWorld` or the twist-angle
assignment, not a structural fix.

## Pan-direction sign bug fixed (`GymFloor3D.tsx`, `rotateDragToWorld`)

Reported symptom: "once you've rotated, forward and back isn't the same."
That phrasing was the key clue — the previous verification (see "Cohesive
interpolation" above) only checked azimuth=0 and azimuth=90°, but happened
to spot-check exactly the one angle (0°) where a real sign error is
invisible and get lucky at the other (90° was actually checked correctly by
hand at the time, but the *shipped code* had the bug — the hand-check and
the code had silently diverged). Root cause: `rotateDragToWorld` rotated the
screen-space drag vector by **+azimuth**, reapplying the camera's own
rotation, when it needed to rotate by **-azimuth**, undoing it — converting
a vector from the camera's rotated frame into world space requires the
inverse transform, not the same one. At azimuth=0, `cos(0)=1, sin(0)=0` kills
the cross terms regardless of which sign is used, so +azimuth and -azimuth
formulas are indistinguishable there — which is exactly why this only
surfaced as "forward/back is wrong after rotating" rather than being wrong
from the start.

Re-derived from scratch using three.js's own `Object3D.lookAt` basis
convention (not re-trusting the earlier informal reasoning): backward axis
= `normalize(position - target)`, right axis = `cross(worldUp, backward)`.
Verified two ways before shipping: (1) at azimuth=90° specifically, the old
and new formulas produce opposite signs for the same drag input — confirmed
numerically, not just algebraically; (2) swept the *entire* 0-360° range in
15° steps, independently computing the camera's actual geometric "right"
vector at each angle and checking the fixed formula's implied pan direction
stays exactly antiparallel to it throughout — max deviation across the full
sweep was `2.22e-16` (floating-point noise, i.e. exact). The previous
verification pass checked 2 points and missed this; this one checks the
whole domain the bug could hide in.

## Camera bug fix + control scheme simplification (`GymFloor3D.tsx`)

**Real bug found and fixed: touch tracking by array position, not
identity.** `getTouchDistance`/`getTouchAngle` (and the now-removed
`getTouchCentroidY`) all read `touches[0]`/`touches[1]` directly. RN's
`touches` array is not guaranteed to keep the same physical finger at the
same index across move events. Distance and centroid are order-independent
so a swap wouldn't have shown there, but `atan2(dy, dx)` for the twist angle
is order-sensitive — swapping which touch is "first" flips the computed
angle by ~180°. Reproduced numerically before fixing: two synthetic frames
with the *same two fingers*, ~5px of real movement, but reordered in the
array, produced a −177.1° angle delta under the old approach — the camera
would suddenly spin from what looked like almost no motion. Fixed by
tracking two fingers by their RN-assigned `identifier` (a `string`, not a
`number` — confirmed against `NativeTouchEvent`'s actual type, which the
first implementation attempt got wrong and `tsc` caught immediately) rather
than array slot: `primaryTouchIdRef`/`secondaryTouchIdRef` lock onto specific
identifiers when a two-finger gesture (re)starts, and
`findTrackedTouchPair` looks those same two up by identity every subsequent
move. If either tracked finger isn't found (lifted, or a third finger
reshuffled the array), tracking restarts cleanly from whichever two fingers
are currently present rather than silently computing from the wrong pair.
Re-ran the same synthetic reorder through the new path afterward: 2.86°,
matching the actual finger movement.

**Control scheme simplified: tilt removed from the two-finger gesture,
zoom-linked auto-tilt restored.** Two phases ago, pitch was zoom-linked and
automatic. One phase ago, the request for two-finger rotation was read as
also wanting pitch under direct twist-gesture control, so it became a third
signal (average vertical drag of both touches) riding the same two-finger
gesture as zoom and rotate. Reconsidered this pass: mobile tycoon/city-
builder games in this genre (Township, Hay Day, SimCity BuildIt) mostly
either skip free camera rotation entirely or use a discrete snap-rotate
button — none stack a third continuous signal onto the same two-finger
gesture as zoom. Pinch-to-zoom plus twist-to-rotate on the same two fingers
is itself a proven, standard combination (the same idea behind any photo
editor's resize+rotate); adding tilt as a third simultaneous signal was the
least-proven part of the previous design and the most likely source of a
control feeling "off" — two independent signals per gesture is more legible
than three. Reverted pitch to the zoom-linked automatic behavior from two
phases ago (`getZoomLinkedPolar`, restored rather than rewritten), which
still satisfies "soft boundary limits on vertical pitch" from that request
automatically, just not via manual two-finger drag. `TWO_FINGER_TILT_SPEED`
and its associated centroid/polar-start refs were removed rather than left
disabled, since they'd otherwise be dead code.

**Rotation jitter filtering.** Zoom is still applied directly with no
smoothing (a few stray pixels of pinch distance is imperceptible), but
azimuth is now split into a raw gesture-driven `azimuthTargetRef` and an
eased, actually-rendered `azimuthRef` that `CameraRig` eases toward it every
frame (`AZIMUTH_EASE_RATE = 25`, using the same shortest-path
`angleDifference` the wraparound handling already needed, not a naive linear
interpolation that could take the long way around near ±π). Rotating the
entire scene makes even sub-degree hand tremor read as a visible shudder in
a way pinch-distance jitter doesn't, so this one signal gets filtering the
others don't. Checked the convergence isn't introducing felt lag before
shipping: simulating a 0.5 rad step target at 60fps, the eased value reaches
93% of target within 5 frames (~83ms) — fast enough to track an intentional
twist, slow enough to average out single-frame tremor. Hit-testing
(`findClosestSelection`, called on tap release) reads the same eased
`azimuthRef`, not the raw target, which is the correct behavior for a tap:
`isTap` requires minimal movement, so no rotation gesture was in flight and
the two values are already equal by the time a tap can register.

## 1. Current Graphics Architecture

**Stack**: `@react-three/fiber` v9.6.1 (`/native` entry point) + `three`
v0.185.1, on top of `expo-gl`'s native WebGL context. No `@react-three/drei`
(its `OrbitControls` and other DOM-oriented helpers don't run on RN — this was
a deliberate call made early in the project). No `@react-three/postprocessing`.
No texture, font, or 3D-model assets of any kind — **every visual in the scene
is procedural primitive geometry** (box/cylinder/sphere/torus/plane/ring/
instancedMesh) composed directly in JSX. This has been a consistent
architectural choice across the project, not an oversight: canvas-based
texture generation isn't reliably available in RN's native (non-web) runtime,
so the project has stayed asset-free rather than risk it.

**Scene composition** (`GymFloor3D.tsx`'s `GymFloorScene`, rendered inside a
single `<Canvas shadows>`):
- `GymBackdrop` — 16-building distant skyline ring (radius 55), grows with
  `prestigeCount`
- `TiledFloor` — one `InstancedMesh` of 64 tile planes
- `GymWalls` — 4 walls + 4 corner pillars, sized dynamically from
  `getPlayAreaBounds(unlockedZones)`
- `GymDecor` — mirrors + amenities, also bounds-driven
- `OverheadLedArray` — 3 emissive fixture strips + `GlowLayer` fakes
- `NeonPerimeter` — 4 emissive trim strips + `GlowLayer` fakes, bounds-driven
- Static landmarks: `SmoothieBar`, `LockerRoomDoor`
- Conditional zone decor: `CardioDeckZone`, `IronVaultZone`
- Per-owned-equipment: a `GymEquipment` model (one of 6 hand-built models) +
  an `EquipmentSpotlight` (`spotLight`, `castShadow`)
- `GymNpcs` — up to 3 member NPCs, one shared `useFrame` loop
- `GymStaff` — up to 3 specialized staff, one shared `useFrame` loop
- `CameraRig` — drives the actual `<Canvas>` camera every frame

**Camera system**: a single hand-rolled orbit camera, not `drei`'s
`OrbitControls`. Spherical coordinates (`azimuth`, `polar`, `radius`) driven
by a raw RN `PanResponder` co-located in `GymFloorScene` — one-finger drag
rotates, two-finger pinch zooms (via manual `nativeEvent.touches` distance
tracking), and a tap under a distance/duration threshold triggers selection.
`radius` has two components: a zone-driven target that *eases* toward its
goal (`RADIUS_EASE_SPEED`), and a pinch-driven offset applied with no easing
(direct manipulation shouldn't lag). FOV is fixed at 50°; near/far planes are
R3F `Canvas` defaults.

Tap-to-select does **not** use R3F's native touch/raycasting event system
(`createTouchEvents`, which does exist in `@react-three/fiber/native`) —
that was deliberately avoided because it would compete with the custom
`PanResponder` for touch-responder ownership. Instead, `worldToScreen()`
constructs a **second, throwaway `PerspectiveCamera`** matching the real
camera's current spherical position and projects candidate world positions to
screen space manually, called once per tap (not per frame).

**Lighting**: 4 fixed light sources, plus one more **per owned equipment
item**:
- `ambientLight` — mood color/intensity, keyed by `currentLocationId`
  (garage/warehouse/plaza)
- `directionalLight` ("key") — mood color/intensity, position `[5,8,5]`,
  `castShadow`
- `directionalLight` ("overhead wash") — fixed near-white, position
  `[0,15,0]`, intensity 1.4, `castShadow={false}`
- `spotLight` per owned equipment (`EquipmentSpotlight`) — intensity 2,
  **`castShadow`** — so a fully-built-out gym (6 machines) has **7
  simultaneous shadow-casting lights**

**Shadows**: enabled globally via `<Canvas shadows>` (three.js default:
`PCFShadowMap`). No shadow map size, camera frustum, or shadow bias is
explicitly configured anywhere — every shadow-casting light uses whatever
three.js/R3F defaults apply. Shadow casters: walls, pillars, most equipment
meshes, NPC/staff capsules. Shadow receivers: `TiledFloor`, walls, a handful
of static landmark meshes.

**Materials**: almost entirely `MeshStandardMaterial` (metalness/roughness
PBR workflow), with `MeshBasicMaterial` for unlit elements (glow layers,
selection rings, mirror glass — see Weaknesses). Two sharing patterns exist:
`useSignatureMaterial` (one memoized material per equipment instance, mutated
in `useFrame` for the top-earner pulse) and `TiledFloor`'s `InstancedMesh`
(one material, 64 instances via `setColorAt`). **Everywhere else, materials
are declared inline in JSX** (e.g. `<meshStandardMaterial {...METAL_PROPS}/>`
repeated per mesh) — R3F allocates a new `Material` instance per JSX
occurrence, so identical-looking materials are not actually the same object.

**Model/texture loading**: none. No `useGLTF`, no `useLoader`, no `useTexture`,
no font/glyph rendering. This is why recent phases substituted a 3D coin for
a "$" glyph and a spinning ring for "ACTIVE" text — there's no text-rendering
path in this pipeline at all.

**Post-processing**: none. The "bloom" seen on neon/LED elements
(`GlowLayer`) is a hand-authored fake: an oversized (1.8×/3×/3×), low-opacity,
additively-blended duplicate mesh placed behind the real emissive geometry,
with `depthWrite={false}`. It is applied per-object by whoever writes that
object's code, not as a global effect.

**Environment rendering**: `GymBackdrop`'s skyline ring is the entire
environment. No skybox, no gradient, no HDRI, no fog. The background is a
single flat `<color attach="background">`, mood-tinted per location.

## 2. Weaknesses

- **No device-pixel-ratio cap.** `<Canvas>` has no `dpr` prop, so R3F renders
  at the device's native pixel ratio. On a 3× phone screen this is 9× the
  fragment-shading work of a capped `dpr={[1,2]}` setup, for no perceptible
  quality gain on a phone-sized viewport.
- **Shadow-casting light count scales with equipment owned, unbounded.** Every
  purchased machine adds a `castShadow` spotlight on top of the always-on
  "key" directional light. A fully upgraded gym runs 7 shadow-casting lights
  simultaneously, each requiring its own shadow-map depth pass. This is very
  likely the single largest performance liability in the current pipeline,
  and it gets worse the more successful the player is at the core game loop —
  the opposite of what you'd want.
- **No explicit shadow map configuration.** Every light falls back to
  three.js defaults for shadow map resolution and camera frustum. Nothing is
  sized to the actual play area, so shadow resolution is likely being spent
  on empty space as often as on the floor.
- **Materials are not deduplicated.** `METAL_PROPS`/`BAR_METAL_PROPS` and
  similar shared-looking material definitions are spread into a fresh
  `<meshStandardMaterial>` at every call site rather than referencing one
  `useMemo`'d `Material` object. `GymBackdrop`'s 16 buildings and `GymDecor`'s
  mirrors/amenities do the same. This means dozens of materially-identical
  `Material` instances exist purely because of how they're declared, each
  adding avoidable GPU state-change and JS/GC overhead.
- **`GymBackdrop` isn't instanced.** 16 buildings × 2 meshes each (box +
  window plane) = 32 draw calls for scenery that's visually identical in
  structure to `TiledFloor`, which *is* instanced. This is the same problem
  `TiledFloor` already solved, just not applied here.
- **No environment map.** Nothing in the scene reflects anything except the
  4 direct lights. This is a real problem specifically for the mirrors added
  in the last phase (`roughness=0.05, metalness=0.9`) and any other
  high-metalness surface (chrome equipment bars) — physically, a surface that
  shiny should show a reflection of the room; here it can only ever show a
  small specular highlight from a light position, so mirrors currently read
  as "very shiny gray plastic," not glass.
- **No atmospheric fog.** The skyline ring sits at a fixed radius (55) against
  a flat background color with nothing softening the transition. There's
  likely a visible hard edge where the backdrop geometry meets open background
  color, rather than a natural depth-fade.
- **No tone mapping / color grading decision has been made.** Whatever R3F's
  default tone mapping produces is what ships — nobody has deliberately
  chosen a "look" at the render-pipeline level.
- **Two independently-maintained cameras.** `CameraRig` drives the real
  `<Canvas>` camera; `worldToScreen()` constructs a *separate* throwaway
  `PerspectiveCamera` with its own hardcoded FOV/near/far to replicate it for
  tap hit-testing. These aren't linked by a shared constant beyond `CAMERA_FOV`
  — if the real camera's near/far or FOV ever changes without updating the
  hit-test camera to match, tap-to-select would silently start missing/hitting
  wrong targets, with no compiler or runtime signal that it broke.
- **`frameloop` is left at its default ("always").** R3F re-renders every
  frame continuously regardless of whether anything changed. In this scene's
  common case (NPCs/staff usually moving, some equipment usually occupied,
  camera easing after a zone unlock) this may not save much in practice, but
  it's worth measuring rather than assuming — see roadmap.
- **`GlowLayer` doubles draw calls for every emissive element** (currently 8
  instances: 4 neon strips + 1 Cardio Deck strip + 3 LED fixtures), and each
  is a transparent, additively-blended quad — more expensive per-pixel than
  opaque geometry and can't use early-Z rejection.

## 3–6. Recommended Improvements

Ordered by impact (highest first). "FPS impact" is a qualitative/rough
estimate based on known mobile-GL cost patterns (shadow passes and fill-rate
being the usual dominant costs on phone GPUs) — none of this has been
profiled on-device yet, and profiling before/after each change is the right
way to confirm these estimates rather than trust them blindly.

| # | Improvement | Impact | Difficulty | Est. FPS impact | Files likely touched |
|---|---|---|---|---|---|
| 1 | Cap `dpr` on `<Canvas>` (e.g. `dpr={[1, 2]}`) | High | Trivial | Large win on high-density phones (potentially cuts fragment work several-fold); visually unnoticeable on phone screens | `GymFloor3D.tsx` |
| 2 | Cap/limit shadow-casting `EquipmentSpotlight`s — e.g. only the current top-earner casts a shadow, or spotlights stop casting shadows past N owned machines | High | Low–Medium | Directly removes the bottleneck that scales worst with player progress; likely the biggest single lever available | `GymFloor3D.tsx` |
| 3 | Explicitly size shadow maps and shadow-camera frustums to the actual play area instead of defaults (`shadow-mapSize`, tightened `shadow-camera-*`) | Medium–High | Low | Improves both shadow quality *and* cost — currently likely wasting resolution on empty space | `GymFloor3D.tsx` |
| 4 | Deduplicate materials — `useMemo` shared `Material` objects for `METAL_PROPS`/`BAR_METAL_PROPS`-style repeats, `GymBackdrop` buildings, `GymDecor` mirrors/amenities | Medium | Low–Medium | Modest but real reduction in GPU state changes and JS/GC churn; compounds as more equipment/decor is added | `GymEquipmentModels.tsx`, `GymBackdrop.tsx`, `GymDecor.tsx` |
| 5 | Instance `GymBackdrop`'s 16 buildings via `InstancedMesh` (same technique as `TiledFloor`) | Medium | Low–Medium | Collapses 32 draw calls to 2; backdrop is background-only so the visual risk is minimal | `GymBackdrop.tsx` |
| 6 | Add distance fog (`<fog attach="fog">`) to blend the skyline into the background color | Medium (visual, not perf) | Trivial | ~Neutral on FPS; meaningful improvement to perceived depth/atmosphere for very low cost | `GymFloor3D.tsx` |
| 7 | Measure, then consider `frameloop="demand"` with manual `invalidate()` calls on the pieces that actually change | Medium (situational) | Medium–High | Unclear until measured — this scene animates almost continuously (NPCs, particles, gear spin) whenever anything's occupied, so real savings depend on how often the scene is genuinely idle | `GymFloor3D.tsx` and anywhere driving continuous animation |
| 8 | Add a real environment map so metalness-heavy materials (mirrors, chrome bars) actually reflect the room | High (visual) | High | No FPS cost if done as a small static/baked cubemap; this is the correct fix for mirrors specifically requested in the last phase, but needs either a first-ever texture asset or a procedural cubemap render, both new territory for this project | `GymFloor3D.tsx`, `GymDecor.tsx`, possibly a new asset |
| 9 | Investigate a real post-processing pipeline (`@react-three/postprocessing`) for true screen-space bloom | High (visual) | High, with real compatibility risk | Unknown FPS cost until tested; **this ecosystem targets DOM/web canvases and has not been verified to work under `expo-gl`'s native context** — treat as a research spike, not a committed task, given this project's history of web-oriented libraries turning out incompatible with the native runtime (`drei`'s `OrbitControls`, `react-native-web`'s `Alert.alert`) | Potentially all 3D files if adopted |
| 10 | Texture-based material detail (roughness/normal maps) | High (visual) | High | Would need an asset pipeline this project has never had; out of scope until 8/9 are resolved | All model files |
| 11 | LOD for distant geometry | Low | Low | Current geometry is already cheap enough that this is unlikely to matter | `GymBackdrop.tsx` |
| 12 | Single-source-of-truth camera constants shared between `CameraRig` and `worldToScreen`'s hit-test camera | Low (perf), Medium (robustness) | Low | No FPS impact; fixes a latent correctness bug rather than a graphics one | `GymFloor3D.tsx` |

## Suggested order of operations

Items 1–3 are the highest-leverage, lowest-risk changes and don't touch
anything visual in a way a player would notice except smoother framerates —
a reasonable first PR. Item 4–6 are good cleanup to bundle with any future
decor/equipment work rather than a dedicated pass. Items 8–9 are real
investments that should each get their own design discussion before
implementation, given the asset-pipeline and compatibility-risk questions
they raise. Item 7 needs on-device measurement before deciding whether it's
worth the complexity at all.
