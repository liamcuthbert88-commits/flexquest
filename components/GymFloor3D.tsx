import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { PanResponder, Platform, StyleSheet, Text, View } from "react-native";
import { Canvas, useFrame } from "@react-three/fiber/native";
import {
  AdditiveBlending,
  Color,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Vector3,
} from "three";

import { colors, radius } from "@/constants/theme";
import {
  EQUIPMENT_CATALOG,
  EQUIPMENT_GRID_TILE_SIZE as TILE_SIZE,
  getEquipmentWorldPosition,
  getEquipmentColor,
  getEquipmentRotationStep,
  gridToWorldPosition,
  type EquipmentCustomization,
} from "@/constants/equipment";
import { findNearestValidCell, getOccupiedCells, type GridCell } from "@/constants/equipmentGrid";
import {
  MAIN_FLOOR_ZONE_ID,
  getPlayAreaBounds,
  type PlayAreaBounds,
  SMOOTHIE_BAR_POSITION,
  LOCKER_POSITION,
} from "@/constants/zones";
import { SMOOTHIE_BAR_RECHARGE_CASH, CLERK_RECHARGE_MULTIPLIER, JANITOR_SPEED_MULTIPLIER } from "@/constants/staff";
import { useUser } from "@/contexts/UserContext";
import { GymEquipment } from "@/components/GymEquipmentModels";
import { GymBackdrop } from "@/components/GymBackdrop";
import {
  GymNpcs,
  createInitialNpcs,
  getNpcId,
  getNpcStateLabel,
  NPC_NAMES,
  type NpcRuntime,
} from "@/components/GymNpcs";
import { GymStaff } from "@/components/GymStaff";
import { GymDecor } from "@/components/GymDecor";

type LocationMood = {
  ambientColor: string;
  ambientIntensity: number;
  directionalColor: string;
  directionalIntensity: number;
  backgroundColor: string;
  windowColor: string;
};

/** Ambient lighting mood per location tier — ties the visual atmosphere to
 * prestige progression instead of a real-world day/night clock, since that
 * would be invisible to whoever's testing right now regardless of when they
 * play. Keyed by constants/locations.ts ids, with `garage`'s mood doubling as
 * the fallback for any unrecognized id.
 *
 * `directionalIntensity` here is deliberately lower than it was before the
 * overhead LED wash light was added below — stacking this angled "key" light
 * at its original intensity on top of a bright overhead wash would blow out
 * highlights on lighter equipment materials. This light now mostly supplies
 * the location's color mood and shadow shape; the overhead light supplies
 * the actual brightness. */
const LOCATION_MOODS: Record<string, LocationMood> = {
  garage: {
    ambientColor: "#4b4f66",
    ambientIntensity: 0.4,
    directionalColor: "#aab0c8",
    directionalIntensity: 0.6,
    backgroundColor: "#101114",
    windowColor: "#8fa0c8",
  },
  warehouse: {
    ambientColor: "#6b5a46",
    ambientIntensity: 0.55,
    directionalColor: "#ffdca8",
    directionalIntensity: 0.75,
    backgroundColor: "#151009",
    windowColor: "#ffcf8a",
  },
  plaza: {
    ambientColor: "#7a4fae",
    ambientIntensity: 0.7,
    directionalColor: "#ffdcf7",
    directionalIntensity: 0.9,
    backgroundColor: "#160b1c",
    windowColor: "#f6a8ff",
  },
};

function getLocationMood(locationId: string): LocationMood {
  return LOCATION_MOODS[locationId] ?? LOCATION_MOODS.garage;
}

const BASE_ORBIT_RADIUS = 9;
const ORBIT_RADIUS_PER_ZONE = 3;
const RADIUS_EASE_SPEED = 1.5;
/** Vertical (pitch) clamp — full horizontal rotation is unclamped (azimuth
 * wraps freely, 360°), but pitch stays soft-bounded so the camera can never
 * go beneath the floor (looking up from underneath) or all the way to a
 * perfect top-down view. MAX_POLAR just short of π/2 keeps camera height
 * (∝ cos(polar)) always slightly positive; MIN_POLAR keeps a diagonal
 * overview rather than a literal bird's-eye one. */
const MIN_POLAR = 0.2;
const MAX_POLAR = Math.PI / 2 - 0.05;
const NEON_COLOR = "#8B5CF6";
const CARDIO_BLUE = "#38BDF8";
const OVERHEAD_WASH_COLOR = "#f8f9fa";
const LED_FIXTURE_COLOR = "#ffffff";

const MIN_ZOOM_OFFSET = -4;
const MAX_ZOOM_OFFSET = 6;
/** Hard ceiling on camera height, independent of the polar/zoom easing above
 * — without it, zooming out far enough (BASE_ORBIT_RADIUS growing with
 * purchased zones, plus MAX_ZOOM_OFFSET) lifts the camera above the LED
 * array (y=6) and ceiling beams (y=6.6), looking down at their topside,
 * which reads as "seeing the roof" instead of staying under the fixtures
 * where only their floor shadows should be visible. Set just under the LED
 * array's height, not the beams', since the LED array is the denser/more
 * visually dominant of the two. */
const MAX_CAMERA_HEIGHT = 5.5;

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
const PINCH_ZOOM_SPEED = 0.02;
/** 1:1 — twisting two fingers 90° rotates the camera 90°, the natural direct-
 * manipulation feel for a twist gesture (matching e.g. iOS's photo pinch-
 * rotate), unlike pixel-based drag which needs an arbitrary scale. Only two
 * signals share the two-finger gesture (distance→zoom, twist→azimuth) —
 * pitch deliberately isn't a third one; see getZoomLinkedPolar below. */
const TWO_FINGER_ROTATE_SENSITIVITY = 1;
/** Eases the *rendered* azimuth toward the gesture's raw target every frame
 * instead of assigning it directly, unlike zoom (which does track fingers
 * exactly — a few stray pixels of pinch distance is imperceptible). Angle is
 * different: rotating the entire scene makes even sub-degree hand tremor
 * visible as a shudder, so a fast filter (still converging within a couple
 * of frames, not introducing felt lag) smooths that out while intentional
 * rotation still tracks essentially immediately. */
const AZIMUTH_EASE_RATE = 25;
/** Reference orbitRadius values the zoom-linked auto-tilt interpolates
 * between — CLOSE roughly matches the tightest zoom-in (BASE_ORBIT_RADIUS +
 * MIN_ZOOM_OFFSET), FAR comfortably covers the widest zoom-out across every
 * zone-unlock stage. */
const CLOSE_RADIUS_REFERENCE = 5;
const FAR_RADIUS_REFERENCE = 24;
const POLAR_EASE_RATE = 4;
const TAP_MAX_DISTANCE_PX = 10;
const TAP_MAX_DURATION_MS = 300;
const HIT_RADIUS_PX = 44;
/** Standard tycoon-game "press and hold to pick up" delay — long enough
 * that a normal tap or the start of a camera-pan drag doesn't accidentally
 * grab an item, short enough that deliberately holding on one doesn't feel
 * laggy. Cancelled if the finger moves more than TAP_MAX_DISTANCE_PX before
 * it fires (that's pan/orbit intent, not hold intent) or if a second finger
 * touches down (pinch intent). */
const HOLD_MOVE_DURATION_MS = 400;
const CAMERA_FOV = 50;

/** World units of pan per screen pixel dragged — the ground plane should
 * feel physically dragged under the finger, so this is deliberately 1:1-ish
 * rather than heavily damped. */
const PAN_SPEED = 0.02;
/** Converts gestureState's release velocity (px/ms, RN's PanResponder
 * convention) into world-units/sec for momentum integration — folds the
 * unit conversion (*1000ms/s) into the same per-pixel scale used for live
 * dragging, so a flick continues at the same felt speed it was released at. */
const PAN_VELOCITY_SCALE = PAN_SPEED * 1000;
/** Higher = the glide-to-a-stop happens faster. */
const MOMENTUM_DECAY_RATE = 3;
const MOMENTUM_STOP_THRESHOLD = 0.05;
/** Keeps the pan target from ever centering exactly on/past a wall — the
 * camera itself sits further out via orbitRadius, but the *target* shouldn't
 * be draggable all the way to the boundary. */
const PAN_BOUNDS_MARGIN = 2;

const FLOOR_SIZE = 20;
const TILES_PER_SIDE = 8;
const TILE_SEAM_GAP = 0.06;
/** Columns 1 and 6 (of 0-7) land at world x≈∓6.25 — deliberately not the
 * center columns, which would cut straight through the equipment cluster at
 * x:[-2,2]. These line up close to the Smoothie Bar (x=-6) and Locker Room
 * (x=6) instead, reading as "the path to the amenities" rather than a path
 * through the machines. */
const PATHWAY_COLUMNS = [1, 6];
/** Dark warm brown/tan — same undertone ratio as the original lighter tan
 * (0.42, 0.34, 0.24) so it still reads as a distinct "polished pathway"
 * against the surrounding rubber, just scaled down to match the floor's
 * new near-black baseline. At the old brightness this stood out as a
 * jarringly bright warm stripe once the rest of the floor darkened. */
const PATHWAY_COLOR: [number, number, number] = [0.1, 0.08, 0.055];
/** World-space x of the two pathway strips, derived once from the main
 * floor's original 8-column grid rather than recomputed per-bounds — every
 * zone boundary is a multiple of TILE_SIZE (2.5), so a tile's world x is
 * always on the same {..., -6.25, -3.75, ..., 3.75, 6.25, ...} lattice
 * regardless of which zones are unlocked, and these two values keep landing
 * on real tile centers even once TiledFloor spans past the main floor. */
const PATHWAY_WORLD_X = PATHWAY_COLUMNS.map(
  (col) => (col - (TILES_PER_SIDE - 1) / 2) * TILE_SIZE
);

const WALL_HEIGHT = 4;
const WALL_THICKNESS = 0.3;
const WALL_INSET_FROM_NEON = 0.3;
const PILLAR_SIZE = 0.4;
const WALL_COLOR = "#2a2a2e";
const PILLAR_COLOR = "#1e1e24";
/** Always centered on world x=0, since the front wall (z=maxZ) is invariant
 * regardless of which zones are unlocked — a stable, sensible "front door"
 * location rather than one that drifts with the bounds' shifting midpoint. */
const ENTRANCE_GAP_WIDTH = 4;
const ACCENT_STRIPE_Y = 2.2;
const ACCENT_STRIPE_HEIGHT = 0.15;

/** Covers the largest possible play area (both zones unlocked: x spans
 * [-20,20], z spans [-15,10]) with margin, so the one remaining shadow-
 * casting light's map isn't wasted on empty space or clipped at the edges
 * as the facility grows. */
const SHADOW_FRUSTUM_HALF_SIZE = 25;

/** @react-three/fiber/native has no `dpr` prop at all — its Canvas hardcodes
 * `dpr: PixelRatio.get()` internally (see node_modules/@react-three/fiber/
 * native/dist/react-three-fiber-native.cjs.dev.js), with its own comment
 * citing https://github.com/expo/expo-three/issues/39: "expo-gl can only
 * render at native dpr/resolution." A resolution-scaling workaround (render
 * the GL surface smaller, then transform-scale the view back up) was tried
 * here and reverted — it required a second, differently-sized View between
 * the gesture responder and the Canvas, which broke tap-to-select twice in a
 * row (once as a coordinate offset, once as a total failure) because RN's
 * `locationX/locationY` resolve ambiguously once views like that are nested
 * and transformed. Correct input took priority over this optimization; see
 * GRAPHICS_ROADMAP.md item 1, which should be marked reverted rather than
 * done. Native pixel ratio is left uncapped. */

export type NpcSnapshot = {
  name: string;
  stateLabel: string;
  stateTimerSeconds: number;
};

export type Selection =
  | { type: "equipment"; id: string }
  | { type: "npc"; id: string; getSnapshot: () => NpcSnapshot };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Keeps the pan target inside the current play area (see
 * getPlayAreaBounds) with a margin so it never centers on/past a wall —
 * "never allowed to slide completely off the map or fly off into the
 * skybox backdrop," per the brief. */
function clampPanToBounds(
  x: number,
  z: number,
  bounds: PlayAreaBounds
): { x: number; z: number } {
  return {
    x: clamp(x, bounds.minX + PAN_BOUNDS_MARGIN, bounds.maxX - PAN_BOUNDS_MARGIN),
    z: clamp(z, bounds.minZ + PAN_BOUNDS_MARGIN, bounds.maxZ - PAN_BOUNDS_MARGIN),
  };
}

/** Shortest signed angular difference, handling the -π/π wraparound — same
 * technique as GymNpcs.tsx's lerpAngle, needed here so a two-finger twist
 * gesture crossing that boundary mid-gesture doesn't register as a ~360°
 * jump instead of the small rotation it actually was. */
function angleDifference(current: number, start: number): number {
  let diff = current - start;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/** Rotates a screen-space drag vector into the world-space XZ direction it
 * should pan the target along, given the camera's current azimuth — without
 * this, panning would only feel correct at azimuth=0.
 *
 * Rotates by *-azimuth*, not +azimuth — this is the fix for a real sign bug
 * that shipped earlier. The camera's own position is rotated BY azimuth
 * relative to world axes (`x = sin(polar)*sin(az)`, `z = sin(polar)*cos(az)`);
 * converting a screen-space vector (defined in the camera's rotated frame)
 * into world space means undoing that rotation, i.e. applying its inverse
 * (-azimuth), not reapplying the same rotation. The bug was invisible at
 * azimuth=0 (cos(0)=1, sin(0)=0 kills the cross terms either way — both the
 * correct and the incorrect sign reduce to the same identity there), which
 * is exactly why it only surfaced as "forward/back feels wrong after
 * rotating." Re-derived from three.js's own lookAt basis convention
 * (z-axis/backward = normalize(position-target), right = cross(worldUp,
 * z-axis)) rather than re-trusting the earlier informal derivation, and
 * confirmed numerically before shipping: at azimuth=90°, the old formula and
 * this one produce opposite signs for a given drag, while both agree at
 * azimuth=0 — exactly the divergence that would surface only after
 * rotating. */
function rotateDragToWorld(
  deltaX: number,
  deltaY: number,
  azimuth: number
): { worldX: number; worldZ: number } {
  const cosAz = Math.cos(azimuth);
  const sinAz = Math.sin(azimuth);
  return {
    worldX: deltaX * cosAz + deltaY * sinAz,
    worldZ: deltaY * cosAz - deltaX * sinAz,
  };
}

/** Zoom-linked pitch: closer (small orbitRadius) tilts toward MAX_POLAR — a
 * low, near-horizontal, immersive angle on the NPCs/equipment; further out
 * (large orbitRadius) tilts back toward MIN_POLAR — a top-down overview.
 * Interpolated, not snapped, by the caller easing toward this each frame.
 * Pitch is automatic rather than a third signal riding on the same
 * two-finger gesture as zoom/rotate — see the two-finger gesture handler's
 * comment for why. */
function getZoomLinkedPolar(orbitRadius: number): number {
  const t = clamp(
    (orbitRadius - CLOSE_RADIUS_REFERENCE) / (FAR_RADIUS_REFERENCE - CLOSE_RADIUS_REFERENCE),
    0,
    1
  );
  return MAX_POLAR + (MIN_POLAR - MAX_POLAR) * t;
}

type TrackedTouch = { identifier: string; pageX: number; pageY: number };

/** Finds the two specific fingers a two-finger gesture locked onto at its
 * start, by identifier rather than array position — `touches[0]`/`[1]`
 * are NOT guaranteed to keep referring to the same physical fingers across
 * move events. If either tracked finger isn't present (lifted, or a third
 * finger touched down and shuffled the array), returns null so the caller
 * can restart tracking cleanly rather than silently substitute the wrong
 * pair. Concretely, the bug this fixes: the angle between two touch points
 * flips ~180° if which one is "first" swaps between events (distance and
 * centroid are order-independent, but atan2(dy, dx) is not) — with no
 * change in finger position, the camera would suddenly spin. */
function findTrackedTouchPair(
  touches: TrackedTouch[],
  primaryId: string,
  secondaryId: string
): [TrackedTouch, TrackedTouch] | null {
  const primary = touches.find((t) => t.identifier === primaryId);
  const secondary = touches.find((t) => t.identifier === secondaryId);
  if (!primary || !secondary) return null;
  return [primary, secondary];
}

function getTouchDistance(touches: [TrackedTouch, TrackedTouch]): number {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getTouchAngle(touches: [TrackedTouch, TrackedTouch]): number {
  return Math.atan2(touches[1].pageY - touches[0].pageY, touches[1].pageX - touches[0].pageX);
}

/** Projects a world position to screen pixel coordinates, replicating the
 * camera's own spherical position (now including its panned target, not just
 * its orbit around the origin) rather than reaching into the live Three.js
 * scene from outside the Canvas — self-contained, no dependency on R3F's
 * internal event/raycasting system (which we deliberately avoid; see below).
 * The algorithm is unchanged from before panning existed; `targetX`/`targetZ`
 * are new required inputs, not a new approach — omitting them would silently
 * miscalculate hits the moment the camera pans away from the origin. */
function worldToScreen(
  worldPos: [number, number, number],
  azimuth: number,
  polar: number,
  orbitRadius: number,
  targetX: number,
  targetZ: number,
  viewWidth: number,
  viewHeight: number
): { x: number; y: number } | null {
  if (viewWidth <= 0 || viewHeight <= 0) return null;

  const camera = new PerspectiveCamera(CAMERA_FOV, viewWidth / viewHeight, 0.1, 1000);
  camera.position.set(
    targetX + orbitRadius * Math.sin(polar) * Math.sin(azimuth),
    orbitRadius * Math.cos(polar),
    targetZ + orbitRadius * Math.sin(polar) * Math.cos(azimuth)
  );
  camera.lookAt(targetX, 0, targetZ);
  camera.updateMatrixWorld();

  const vector = new Vector3(worldPos[0], worldPos[1], worldPos[2]);
  vector.project(camera);

  if (vector.z > 1) return null;

  return {
    x: ((vector.x + 1) / 2) * viewWidth,
    y: ((1 - vector.y) / 2) * viewHeight,
  };
}

/** The inverse of worldToScreen: given a screen pixel and the same camera
 * parameters (azimuth/polar/orbitRadius/targetX/targetZ — the camera orbits
 * a pannable ground-plane target, not the fixed origin, matching
 * worldToScreen exactly), finds where that pixel's ray intersects the
 * floor's y=0 plane. Used to turn a live finger position into a live world
 * X/Z while dragging an equipment item, replicating the camera the same
 * self-contained way worldToScreen already does rather than reaching into
 * R3F's internal raycasting system. targetX/targetZ are required, not
 * optional — omitting them would silently mis-track the drag ghost the
 * moment the camera has been panned away from the origin, exactly the
 * failure mode worldToScreen's own doc comment warns about. */
function screenToGroundPosition(
  screenX: number,
  screenY: number,
  azimuth: number,
  polar: number,
  orbitRadius: number,
  targetX: number,
  targetZ: number,
  viewWidth: number,
  viewHeight: number
): { x: number; z: number } | null {
  if (viewWidth <= 0 || viewHeight <= 0) return null;

  const camera = new PerspectiveCamera(CAMERA_FOV, viewWidth / viewHeight, 0.1, 1000);
  camera.position.set(
    targetX + orbitRadius * Math.sin(polar) * Math.sin(azimuth),
    orbitRadius * Math.cos(polar),
    targetZ + orbitRadius * Math.sin(polar) * Math.cos(azimuth)
  );
  camera.lookAt(targetX, 0, targetZ);
  camera.updateMatrixWorld();

  const ndcX = (screenX / viewWidth) * 2 - 1;
  const ndcY = -(screenY / viewHeight) * 2 + 1;

  const nearPoint = new Vector3(ndcX, ndcY, 0).unproject(camera);
  const farPoint = new Vector3(ndcX, ndcY, 1).unproject(camera);
  const direction = farPoint.clone().sub(nearPoint).normalize();

  // Intersect with the y=0 plane: nearPoint.y + t * direction.y = 0.
  if (Math.abs(direction.y) < 1e-6) return null;
  const t = -nearPoint.y / direction.y;
  if (t < 0) return null;

  return {
    x: nearPoint.x + direction.x * t,
    z: nearPoint.z + direction.z * t,
  };
}

function findClosestSelection(
  tapX: number,
  tapY: number,
  ownedEquipment: typeof EQUIPMENT_CATALOG,
  npcRuntimes: NpcRuntime[],
  azimuth: number,
  polar: number,
  orbitRadius: number,
  targetX: number,
  targetZ: number,
  viewWidth: number,
  viewHeight: number,
  equipmentCustomizations: Record<string, EquipmentCustomization>
): Selection | null {
  let best: Selection | null = null;
  let bestDistance = HIT_RADIUS_PX;

  for (const item of ownedEquipment) {
    const worldPos = getEquipmentWorldPosition(item, equipmentCustomizations);
    const screenPos = worldToScreen(
      [worldPos[0], 0.8, worldPos[2]],
      azimuth,
      polar,
      orbitRadius,
      targetX,
      targetZ,
      viewWidth,
      viewHeight
    );
    if (!screenPos) continue;
    const distance = Math.hypot(screenPos.x - tapX, screenPos.y - tapY);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { type: "equipment", id: item.id };
    }
  }

  npcRuntimes.forEach((npc, index) => {
    const screenPos = worldToScreen(
      [npc.position[0], 0.6, npc.position[2]],
      azimuth,
      polar,
      orbitRadius,
      targetX,
      targetZ,
      viewWidth,
      viewHeight
    );
    if (!screenPos) return;
    const distance = Math.hypot(screenPos.x - tapX, screenPos.y - tapY);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = {
        type: "npc",
        id: getNpcId(index),
        getSnapshot: () => ({
          name: NPC_NAMES[index],
          stateLabel: getNpcStateLabel(npc.state),
          stateTimerSeconds: npc.stateTimer,
        }),
      };
    }
  });

  return best;
}

type PanVelocity = { x: number; z: number };

type CameraRigProps = {
  azimuthRef: MutableRefObject<number>;
  azimuthTargetRef: MutableRefObject<number>;
  polarRef: MutableRefObject<number>;
  targetRadius: number;
  currentRadiusRef: MutableRefObject<number>;
  zoomOffsetRef: MutableRefObject<number>;
  panXRef: MutableRefObject<number>;
  panZRef: MutableRefObject<number>;
  panVelocityRef: MutableRefObject<PanVelocity>;
  boundsRef: MutableRefObject<PlayAreaBounds>;
};

/** Orbits the camera around a pannable ground-plane target (not the fixed
 * origin), easing its zone-driven base distance toward `targetRadius` rather
 * than snapping (so unlocking a zone reads as pulling back to reveal it).
 * Zoom tracks fingers exactly (a few stray pixels of pinch distance is
 * imperceptible), but azimuth (`azimuthRef`) eases toward the gesture's raw
 * `azimuthTargetRef` instead of being assigned directly — rotating the whole
 * scene makes even sub-degree hand tremor read as a visible shudder, so a
 * fast filter (AZIMUTH_EASE_RATE) smooths that out while still converging
 * within a couple of frames, not introducing felt lag. Polar (pitch) is
 * zoom-linked (see getZoomLinkedPolar), eased toward that target the same
 * way, rather than a third manually-gestured signal riding the same two
 * fingers as zoom/rotate. Momentum from a released pan flick is integrated
 * and exponentially decayed here, clamped to the same play-area bounds as
 * live dragging so a fast flick can't fling the target past a wall. */
function CameraRig({
  azimuthRef,
  azimuthTargetRef,
  polarRef,
  targetRadius,
  currentRadiusRef,
  zoomOffsetRef,
  panXRef,
  panZRef,
  panVelocityRef,
  boundsRef,
}: CameraRigProps) {
  useFrame(({ camera }, delta) => {
    const velocity = panVelocityRef.current;
    if (Math.abs(velocity.x) > MOMENTUM_STOP_THRESHOLD || Math.abs(velocity.z) > MOMENTUM_STOP_THRESHOLD) {
      const clamped = clampPanToBounds(
        panXRef.current + velocity.x * delta,
        panZRef.current + velocity.z * delta,
        boundsRef.current
      );
      panXRef.current = clamped.x;
      panZRef.current = clamped.z;

      const decay = Math.exp(-MOMENTUM_DECAY_RATE * delta);
      panVelocityRef.current = { x: velocity.x * decay, z: velocity.z * decay };
    } else if (velocity.x !== 0 || velocity.z !== 0) {
      panVelocityRef.current = { x: 0, z: 0 };
    }

    currentRadiusRef.current +=
      (targetRadius - currentRadiusRef.current) * Math.min(1, delta * RADIUS_EASE_SPEED);

    azimuthRef.current +=
      angleDifference(azimuthTargetRef.current, azimuthRef.current) *
      Math.min(1, delta * AZIMUTH_EASE_RATE);

    const orbitRadius = currentRadiusRef.current + zoomOffsetRef.current;
    const targetPolar = getZoomLinkedPolar(orbitRadius);
    polarRef.current += (targetPolar - polarRef.current) * Math.min(1, delta * POLAR_EASE_RATE);
    // Larger polar = lower camera height (∝ cos(polar)) — flooring it here
    // (not capping the derived Y directly) keeps every other consumer of
    // polarRef.current (screenToWorld/worldToScreen for tap and placement
    // raycasting) consistent with what's actually rendered.
    const minPolarForHeightCap = Math.acos(clamp(MAX_CAMERA_HEIGHT / orbitRadius, -1, 1));
    polarRef.current = Math.max(polarRef.current, minPolarForHeightCap);

    const azimuth = azimuthRef.current;
    const polar = polarRef.current;
    const targetX = panXRef.current;
    const targetZ = panZRef.current;

    camera.position.x = targetX + orbitRadius * Math.sin(polar) * Math.sin(azimuth);
    camera.position.y = orbitRadius * Math.cos(polar);
    camera.position.z = targetZ + orbitRadius * Math.sin(polar) * Math.cos(azimuth);
    camera.lookAt(targetX, 0, targetZ);
  });

  return null;
}

/** Commercial rubber interlocking floor tiles — built from real geometry
 * rather than an image texture, since this project has no texture assets
 * anywhere and generating one at runtime would need a canvas-like drawing
 * surface that isn't reliably available in RN's native (non-web) runtime.
 * Uses a single InstancedMesh so every tile costs one draw call regardless
 * of count, with a small per-tile shade variation (deterministic from its
 * grid index, not per-frame random) and a visible gap between tiles for the
 * interlocking-seam look.
 *
 * Spans the *current* play area bounds rather than a fixed 20x20 main
 * floor — Cardio Deck and Iron Vault used to get their own distinct floor
 * surface (wood plank, bare concrete) once unlocked; this now tiles the
 * whole facility in one consistent material instead, so unlocking a zone
 * reads as "more of the same gym floor" rather than a visibly different
 * room bolted on. Every zone boundary in getPlayAreaBounds is a multiple of
 * TILE_SIZE (2.5), so tiles always land edge-to-edge across the whole
 * bounds with no fractional leftover strip, however far it's grown. The
 * instance count is fixed at mount time (InstancedMesh can't be resized in
 * place), so the caller must remount this via `key` when bounds change.
 * Two world-x positions (see PATHWAY_WORLD_X) get a distinct warm tone
 * instead of the dark rubber shade — a "polished pathway" strip through the
 * otherwise uniform workout-zone flooring, routed to avoid the equipment
 * cluster. Per-instance color varies, but all instances still share one
 * material, so roughness/metalness stay uniform across the floor —
 * InstancedMesh doesn't support per-instance material properties, only
 * per-instance color. */
function TiledFloor({ bounds }: { bounds: PlayAreaBounds }) {
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const tileCountX = Math.round((bounds.maxX - bounds.minX) / TILE_SIZE);
  const tileCountZ = Math.round((bounds.maxZ - bounds.minZ) / TILE_SIZE);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    let index = 0;
    for (let row = 0; row < tileCountZ; row++) {
      for (let col = 0; col < tileCountX; col++) {
        const x = bounds.minX + TILE_SIZE / 2 + col * TILE_SIZE;
        const z = bounds.minZ + TILE_SIZE / 2 + row * TILE_SIZE;
        dummy.position.set(x, 0, z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);

        const isPathway = PATHWAY_WORLD_X.some((pathX) => Math.abs(x - pathX) < 0.01);
        if (isPathway) {
          mesh.setColorAt(index, new Color(...PATHWAY_COLOR));
        } else {
          // Dark charcoal/near-black interlocking rubber mat — real gym
          // rubber sits close to black (roughly #050505-#0a0a0a) with only
          // faint per-tile variation from manufacturing/wear, not the much
          // lighter mid-grey this used to be. The tiny blue-tinted delta
          // keeps that subtle variation (still reads as "interlocking
          // tiles," not a flat slab) without ever brightening a tile enough
          // to look washed out under the overhead wash light.
          const shade = 0.02 + ((row * 7 + col * 3) % 5) * 0.004;
          mesh.setColorAt(index, new Color(shade, shade, shade + 0.003));
        }
        index++;
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [dummy, bounds, tileCountX, tileCountZ]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, tileCountX * tileCountZ]}
      receiveShadow
      // three.js computes an InstancedMesh's frustum-culling bounding sphere
      // from its base geometry alone (one small tile plane at the local
      // origin) — it does NOT expand to cover where setMatrixAt actually
      // places every instance across the whole floor. That made the entire
      // floor randomly vanish while orbiting/panning: whenever that tiny,
      // wrongly-placed bounding sphere happened to fall outside the
      // frustum, three.js culled the *whole* mesh, even though the real,
      // visible tiles were still on-screen. Disabling culling for this one
      // object is the standard fix — it's a single draw call regardless of
      // instance count, so there's no meaningful cost to always drawing it.
      frustumCulled={false}
    >
      <planeGeometry args={[TILE_SIZE - TILE_SEAM_GAP, TILE_SIZE - TILE_SEAM_GAP]} />
      {/* Real rubber is a dielectric (metalness 0) and quite matte — high
          roughness (0.92) keeps specular highlights soft and diffuse, so
          the mat absorbs light the way real gym rubber does instead of
          gleaming like the old metalness:0.35 value did. */}
      <meshStandardMaterial roughness={0.92} metalness={0} />
    </instancedMesh>
  );
}

/** Fakes bloom on an emissive strip — there's no post-processing pipeline
 * available here (that ecosystem targets DOM/web canvases, not RN's native GL
 * backend), so a soft, additively-blended, oversized duplicate behind the
 * real strip is the cheap substitute. `depthWrite={false}` keeps it from
 * fighting the real strip's z-buffer at near-identical depth. */
function GlowLayer({
  position,
  size,
  color,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={[size[0] * 1.8, size[1] * 3, size[2] * 3]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.25}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Purely visual — bright emissive fixture meshes, not real light sources.
 * The actual illumination comes from the overhead directionalLight in
 * GymFloorScene; adding a real light per fixture here would mean several more
 * shadow-casting/lit sources, which this project has consistently avoided for
 * mobile RAM/perf reasons (see the shared-material and particle-pool patterns
 * elsewhere). Parallel rows spanning the *current* play area bounds (not a
 * fixed main-floor footprint) so the ceiling still reads as evenly lit once
 * Cardio Deck/Iron Vault unlock and the floor grows well past the original
 * 20x20 — the actual light (the overhead directionalLight) was always
 * spatially uniform since directional lights don't fall off with distance,
 * but these fixture meshes previously stayed fixed to the original
 * footprint, so the ceiling visually looked unlit over any newly-unlocked
 * zone even though the floor beneath it wasn't actually darker. */
function OverheadLedArray({ bounds }: { bounds: PlayAreaBounds }) {
  const rowSpacing = 6;
  const rowMargin = 2;
  const rowCount = Math.max(3, Math.round((bounds.maxX - bounds.minX - rowMargin * 2) / rowSpacing) + 1);
  const rows: number[] = Array.from({ length: rowCount }, (_, i) =>
    rowCount === 1
      ? (bounds.minX + bounds.maxX) / 2
      : bounds.minX + rowMargin + (i * (bounds.maxX - bounds.minX - rowMargin * 2)) / (rowCount - 1)
  );
  const rowCenterZ = (bounds.minZ + bounds.maxZ) / 2;
  const rowLength = bounds.maxZ - bounds.minZ - rowMargin * 2;
  const fixtureSize: [number, number, number] = [0.4, 0.12, rowLength];

  return (
    <>
      {rows.map((x) => (
        <mesh key={x} position={[x, 6, rowCenterZ]}>
          <boxGeometry args={fixtureSize} />
          <meshStandardMaterial
            color={LED_FIXTURE_COLOR}
            emissive={LED_FIXTURE_COLOR}
            emissiveIntensity={2}
          />
        </mesh>
      ))}
      {rows.map((x) => (
        <GlowLayer key={`glow-${x}`} position={[x, 6, rowCenterZ]} size={fixtureSize} color={LED_FIXTURE_COLOR} />
      ))}
    </>
  );
}

/** Exposed structural beams crossing the LED rows — cheap, static geometry
 * that reads as "real industrial ceiling" instead of an empty void above the
 * light fixtures. Fixed over the main floor rather than bounds-driven: these
 * are ambient overhead flavor, not part of the room's actual boundary, so
 * they don't need to track zone expansion the way walls/neon trim do. */
function CeilingBeams() {
  const beamZs = [-6, 0, 6];
  return (
    <>
      {beamZs.map((z) => (
        <mesh key={z} position={[0, 6.6, z]} castShadow>
          <boxGeometry args={[18, 0.3, 0.3]} />
          <meshStandardMaterial color="#3a3d47" roughness={0.7} metalness={0.2} />
        </mesh>
      ))}
    </>
  );
}

const FAN_POSITIONS: [number, number][] = [
  [-3, -3],
  [3, 3],
];
const FAN_HEIGHT = 6.3;
const FAN_SPIN_SPEED = 6;

/** Slowly spinning ceiling fans — always animating regardless of gameplay
 * state (ambient environment detail, not tied to equipment occupancy), one
 * shared useFrame updating both rather than a subscription per fan. */
function CeilingFans() {
  const bladeGroupRefs = useRef<(Group | null)[]>([]);

  useFrame((_, delta) => {
    bladeGroupRefs.current.forEach((group) => {
      if (group) group.rotation.y += delta * FAN_SPIN_SPEED;
    });
  });

  return (
    <>
      {FAN_POSITIONS.map(([x, z], i) => (
        <group key={i} position={[x, FAN_HEIGHT, z]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.15, 12]} />
            <meshStandardMaterial color="#2a2c33" roughness={0.5} metalness={0.4} />
          </mesh>
          <group
            ref={(el) => {
              bladeGroupRefs.current[i] = el;
            }}
          >
            {[0, 1, 2, 3].map((blade) => (
              <mesh
                key={blade}
                position={[0.35, 0, 0]}
                rotation={[0, (blade * Math.PI) / 2, 0]}
                castShadow
              >
                <boxGeometry args={[0.6, 0.03, 0.15]} />
                <meshStandardMaterial color="#3a3d47" roughness={0.6} metalness={0.2} />
              </mesh>
            ))}
          </group>
        </group>
      ))}
    </>
  );
}

/** Flat ceiling vent grates — static detail, tucked away from the LED rows
 * and fans so nothing overlaps. */
function CeilingVents() {
  const positions: [number, number][] = [
    [8, 8],
    [-8, -8],
  ];
  return (
    <>
      {positions.map(([x, z], i) => (
        <group key={i} position={[x, 6.55, z]}>
          <mesh>
            <boxGeometry args={[1.2, 0.05, 0.8]} />
            <meshStandardMaterial color="#1c1e24" roughness={0.6} metalness={0.3} />
          </mesh>
          {[-0.4, -0.13, 0.13, 0.4].map((offset) => (
            <mesh key={offset} position={[offset, -0.026, 0]}>
              <boxGeometry args={[0.04, 0.01, 0.75]} />
              <meshStandardMaterial color="#0d0e12" roughness={0.7} metalness={0.2} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

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

/** The enclosing shell itself — 4 walls sized to `bounds` (see
 * getPlayAreaBounds) plus corner pillars for structural mass. Kept
 * deliberately low (WALL_HEIGHT=4, well under the LED array at y=6) and
 * open-topped: the camera orbits from outside/above this boundary at a
 * radius that grows in step with it, and a taller or roofed shell would risk
 * clipping the camera's view at shallow polar angles, or blocking the
 * top-down view the whole game is built around. */
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
  /** Shared, not per-panel — GymWalls fades every panel's opacity in lockstep
   * off one useFrame by mutating these materials directly, so all panels
   * must point at the same instances rather than each owning their own. */
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

const WINDOW_COUNT = 2;
const WINDOW_WIDTH = 2.0;
const WINDOW_SILL_HEIGHT = 1.0;
const WINDOW_TOP_HEIGHT = 3.3;
const WINDOW_MARGIN = 0.6;
const WINDOW_GLASS_COLOR = "#9fd8ff";
const WINDOW_FRAME_COLOR = "#1c1e24";

/** Floor-to-near-ceiling window bays cut into one wall segment (built from a
 * sill piece, a lintel piece, and solid infill between/around the openings
 * — there's no CSG/boolean-subtract available here, so "cutting a hole"
 * means building the solid wall AROUND a gap rather than punching through
 * one) with a lightly tinted, semi-transparent glass pane in each opening.
 * The distant skyline (GymBackdrop) is already rendered at a large radius
 * behind everything, so it becomes visible through the gap without any
 * extra work. No accent stripe on this segment — the windows are the
 * feature here, matching how a real facility wouldn't stripe across glass. */
function WindowedWallSegment({
  centerX,
  width,
  z,
  wallMaterial,
}: {
  centerX: number;
  width: number;
  z: number;
  /** Same shared, GymWalls-owned material as the other panels — the solid
   * infill here fades in lockstep with the rest of the shell. The window
   * frame/glass stay as they are; they're not what blocks the view. */
  wallMaterial: MeshStandardMaterial;
}) {
  const usableWidth = width - WINDOW_MARGIN * 2;
  const spacing = usableWidth / WINDOW_COUNT;
  const leftEdge = centerX - width / 2 + WINDOW_MARGIN;
  const windowXs = Array.from({ length: WINDOW_COUNT }, (_, i) => leftEdge + spacing * (i + 0.5));

  const segmentLeft = centerX - width / 2;
  const segmentRight = centerX + width / 2;
  const edgeBounds = [
    segmentLeft,
    ...windowXs.flatMap((windowX) => [windowX - WINDOW_WIDTH / 2, windowX + WINDOW_WIDTH / 2]),
    segmentRight,
  ];
  const solidPieces: { start: number; end: number }[] = [];
  for (let i = 0; i < edgeBounds.length; i += 2) {
    solidPieces.push({ start: edgeBounds[i], end: edgeBounds[i + 1] });
  }

  return (
    <group>
      <mesh position={[centerX, WINDOW_SILL_HEIGHT / 2, z]} castShadow receiveShadow material={wallMaterial}>
        <boxGeometry args={[width, WINDOW_SILL_HEIGHT, WALL_THICKNESS]} />
      </mesh>
      <mesh
        position={[centerX, (WINDOW_TOP_HEIGHT + WALL_HEIGHT) / 2, z]}
        castShadow
        receiveShadow
        material={wallMaterial}
      >
        <boxGeometry args={[width, WALL_HEIGHT - WINDOW_TOP_HEIGHT, WALL_THICKNESS]} />
      </mesh>

      {solidPieces.map((piece, i) => (
        <mesh
          key={i}
          position={[(piece.start + piece.end) / 2, (WINDOW_SILL_HEIGHT + WINDOW_TOP_HEIGHT) / 2, z]}
          castShadow
          receiveShadow
          material={wallMaterial}
        >
          <boxGeometry args={[piece.end - piece.start, WINDOW_TOP_HEIGHT - WINDOW_SILL_HEIGHT, WALL_THICKNESS]} />
        </mesh>
      ))}

      {windowXs.map((windowX, i) => (
        <group key={i} position={[windowX, (WINDOW_SILL_HEIGHT + WINDOW_TOP_HEIGHT) / 2, z]}>
          <mesh castShadow>
            <boxGeometry
              args={[WINDOW_WIDTH + 0.1, WINDOW_TOP_HEIGHT - WINDOW_SILL_HEIGHT + 0.1, 0.05]}
            />
            <meshStandardMaterial color={WINDOW_FRAME_COLOR} roughness={0.5} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
            <boxGeometry args={[WINDOW_WIDTH, WINDOW_TOP_HEIGHT - WINDOW_SILL_HEIGHT, 0.02]} />
            <meshStandardMaterial
              color={WINDOW_GLASS_COLOR}
              roughness={0.05}
              metalness={0.3}
              transparent
              opacity={0.35}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** The enclosing shell itself — walls sized to `bounds` (see
 * getPlayAreaBounds), corner + mid-span pillars for structural mass, a
 * painted accent stripe doubling as branding, and a gap in the front wall
 * (always at world x=0, since z=maxZ is invariant regardless of which zones
 * are unlocked) reading as the facility's entrance. Kept deliberately low
 * (WALL_HEIGHT=4, well under the LED array at y=6) and open-topped: the
 * camera orbits from outside/above this boundary at a radius that grows in
 * step with it, and a taller or roofed shell would risk clipping the
 * camera's view at shallow polar angles, or blocking the top-down view the
 * whole game is built around. */
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

  const pillarPositions: [number, number][] = [
    [minX, minZ],
    [maxX, minZ],
    [minX, maxZ],
    [maxX, maxZ],
    [entranceLeftX, maxZ],
    [entranceRightX, maxZ],
    [minX, centerZ],
    [maxX, centerZ],
  ];

  // Shared across every panel/pillar below, not one material per mesh — lets
  // a single useFrame fade the whole shell in lockstep by mutating .opacity
  // on just these three instances instead of re-rendering N meshes.
  const wallMaterial = useMemo(
    () => new MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.85, metalness: 0.05, transparent: true }),
    []
  );
  const accentMaterial = useMemo(
    () => new MeshStandardMaterial({ color: NEON_COLOR, roughness: 0.6, metalness: 0.1, transparent: true }),
    []
  );
  const pillarMaterial = useMemo(
    () => new MeshStandardMaterial({ color: PILLAR_COLOR, roughness: 0.7, metalness: 0.15, transparent: true }),
    []
  );

  const wallOpacityRef = useRef(1);

  /** Fades the entire shell uniformly (not per-individual-wall) toward
   * MIN_WALL_OPACITY whenever the camera is within WALL_FADE_DISTANCE of any
   * one wall plane — moving in close to inspect equipment near a wall
   * shouldn't have that wall block the view, but the shell should read as
   * fully solid the rest of the time. "Near a wall" is plane-distance
   * clamped to that wall's own span (plus a small corner margin), so being
   * close to one wall doesn't also fade the unrelated far side. */
  useFrame(({ camera }, delta) => {
    const distances: number[] = [];
    if (camera.position.x >= minX - WALL_FADE_LATERAL_MARGIN && camera.position.x <= maxX + WALL_FADE_LATERAL_MARGIN) {
      distances.push(Math.abs(camera.position.z - minZ), Math.abs(camera.position.z - maxZ));
    }
    if (camera.position.z >= minZ - WALL_FADE_LATERAL_MARGIN && camera.position.z <= maxZ + WALL_FADE_LATERAL_MARGIN) {
      distances.push(Math.abs(camera.position.x - minX), Math.abs(camera.position.x - maxX));
    }
    const nearestWallDistance = distances.length > 0 ? Math.min(...distances) : Infinity;
    const targetOpacity = clamp(nearestWallDistance / WALL_FADE_DISTANCE, MIN_WALL_OPACITY, 1);

    wallOpacityRef.current += (targetOpacity - wallOpacityRef.current) * Math.min(1, delta * WALL_FADE_EASE_RATE);
    wallMaterial.opacity = wallOpacityRef.current;
    accentMaterial.opacity = wallOpacityRef.current;
    pillarMaterial.opacity = wallOpacityRef.current;
  });

  return (
    <group>
      <WallPanel
        position={[(minX + maxX) / 2, wallY, minZ]}
        size={[width + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]}
        accentOffset={[0, 0, halfThickness]}
        wallMaterial={wallMaterial}
        accentMaterial={accentMaterial}
      />
      <WallPanel
        position={[frontLeftCenterX, wallY, maxZ]}
        size={[frontLeftWidth, WALL_HEIGHT, WALL_THICKNESS]}
        accentOffset={[0, 0, -halfThickness]}
        wallMaterial={wallMaterial}
        accentMaterial={accentMaterial}
      />
      <WindowedWallSegment
        centerX={frontRightCenterX}
        width={frontRightWidth}
        z={maxZ}
        wallMaterial={wallMaterial}
      />
      <WallPanel
        position={[minX, wallY, centerZ]}
        size={[WALL_THICKNESS, WALL_HEIGHT, depth + WALL_THICKNESS]}
        accentOffset={[halfThickness, 0, 0]}
        wallMaterial={wallMaterial}
        accentMaterial={accentMaterial}
      />
      <WallPanel
        position={[maxX, wallY, centerZ]}
        size={[WALL_THICKNESS, WALL_HEIGHT, depth + WALL_THICKNESS]}
        accentOffset={[-halfThickness, 0, 0]}
        wallMaterial={wallMaterial}
        accentMaterial={accentMaterial}
      />

      {pillarPositions.map(([x, z], i) => (
        <mesh key={i} position={[x, wallY, z]} castShadow material={pillarMaterial}>
          <boxGeometry args={[PILLAR_SIZE, WALL_HEIGHT + 0.3, PILLAR_SIZE]} />
        </mesh>
      ))}
    </group>
  );
}

/** Smoothie Bar counter + stools — always present, not tied to any purchase. */
function SmoothieBar() {
  return (
    <group position={SMOOTHIE_BAR_POSITION}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.9, 0.6]} />
        <meshStandardMaterial color="#e8ddc7" roughness={0.25} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.92, 0]} castShadow>
        <boxGeometry args={[1.7, 0.06, 0.7]} />
        <meshStandardMaterial color="#3d2b1f" roughness={0.4} metalness={0.1} />
      </mesh>
      {[-0.6, 0.6].map((x) => (
        <mesh key={x} position={[x, 0.3, 0.7]} castShadow>
          <cylinderGeometry args={[0.18, 0.15, 0.6, 16]} />
          <meshStandardMaterial color="#2a2c33" roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/** Locker Room Door Block — a fixed environmental landmark, not purchasable. */
function LockerRoomDoor() {
  return (
    <group position={LOCKER_POSITION}>
      <mesh position={[0, 1.0, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 2.0, 0.15]} />
        <meshStandardMaterial color="#2f323b" roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 1.0, 0.08]} castShadow>
        <boxGeometry args={[0.85, 1.7, 0.03]} />
        <meshStandardMaterial color="#3a3d47" roughness={0.4} metalness={0.25} />
      </mesh>
      <mesh position={[0.32, 1.0, 0.12]} castShadow>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshStandardMaterial color="#c7cad1" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

/** Cardio Deck — shares the same tiled floor as the rest of the facility
 * (see TiledFloor); a thin neon-blue border traces the zone's perimeter to
 * mark its footprint, matching NeonPerimeter's own border-strip technique
 * rather than a full glowing slab. A previous version covered the *entire*
 * 10x20 zone with one bright emissive plane (plus GlowLayer's additive
 * bloom scaled to that same full size) — harmless against the old
 * medium-grey floor, but read as a glaring, out-of-place blue rectangle
 * once the tile floor darkened to near-black rubber. Thin border strips at
 * a much lower emissive intensity keep the zone identifiable without
 * fighting the now much darker, more uniform-reading floor. */
function CardioDeckZone() {
  const halfWidth = 5;
  const halfDepth = 10;
  const stripThickness = 0.15;

  const strips: { position: [number, number, number]; size: [number, number, number] }[] = [
    { position: [0, 0.04, -halfDepth], size: [halfWidth * 2, 0.05, stripThickness] },
    { position: [0, 0.04, halfDepth], size: [halfWidth * 2, 0.05, stripThickness] },
    { position: [-halfWidth, 0.04, 0], size: [stripThickness, 0.05, halfDepth * 2] },
    { position: [halfWidth, 0.04, 0], size: [stripThickness, 0.05, halfDepth * 2] },
  ];

  return (
    <group position={[15, 0, 0]}>
      {strips.map((strip, i) => (
        <mesh key={i} position={strip.position}>
          <boxGeometry args={strip.size} />
          <meshStandardMaterial color={CARDIO_BLUE} emissive={CARDIO_BLUE} emissiveIntensity={0.5} />
        </mesh>
      ))}
      {strips.map((strip, i) => (
        <GlowLayer key={`glow-${i}`} position={strip.position} size={strip.size} color={CARDIO_BLUE} />
      ))}
    </group>
  );
}

/** Illuminates one piece of equipment with a downward spotlight cone —
 * deliberately NOT `castShadow` (see the perf note on GRAPHICS_ROADMAP.md
 * item 2): shadow-casting cost here used to scale directly with how much
 * equipment a player owned, up to 6 simultaneous shadow-casting lights on a
 * fully built-out gym, on top of the always-on key light below. The key
 * light's shadow already covers every piece of equipment regardless of
 * ownership count, so this spotlight keeps its visual "spotlighted machine"
 * glow/pool of light while no longer adding its own shadow pass — shadow
 * cost is now fixed at one light, not 1-to-7 depending on progress. */
function EquipmentSpotlight({ position }: { position: [number, number, number] }) {
  return (
    <spotLight
      position={[position[0], 4, position[2]]}
      target-position={position}
      angle={0.4}
      penumbra={0.5}
      intensity={2}
      castShadow={false}
    />
  );
}

/** Translucent stand-in shown at the live drag position while an equipment
 * item is being moved, plus a highlighted tile at the nearest valid drop
 * cell — not the item's actual detailed model, matching how other
 * lightweight visual affordances in this file (GlowLayer, selection ring)
 * favor simple geometry over reusing a heavy model for a transient effect. */
function PlacementGhost({
  dragPosition,
  targetCell,
  color,
}: {
  dragPosition: [number, number, number];
  targetCell: { row: number; col: number } | null;
  color: string;
}) {
  return (
    <>
      <mesh position={dragPosition}>
        <boxGeometry args={[1.4, 1.4, 1.4]} />
        <meshStandardMaterial color={color} transparent opacity={0.5} />
      </mesh>
      {targetCell && (
        <mesh
          position={gridToWorldPosition(targetCell.row, targetCell.col)}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[TILE_SIZE - TILE_SEAM_GAP, TILE_SIZE - TILE_SEAM_GAP]} />
          <meshBasicMaterial color={NEON_COLOR} transparent opacity={0.4} />
        </mesh>
      )}
    </>
  );
}

type GymFloorSceneProps = {
  onSelect?: (selection: Selection | null) => void;
  placingEquipmentId: string | null;
  onPlacementSettled: () => void;
};

function GymFloorScene({ onSelect, placingEquipmentId, onPlacementSettled }: GymFloorSceneProps) {
  const {
    purchasedEquipmentIds,
    unlockedZones,
    equipmentLevels,
    hiredStaffIds,
    addCash,
    currentLocationId,
    prestigeCount,
    equipmentCustomizations,
    moveEquipment,
  } = useUser();

  const ownedEquipment = EQUIPMENT_CATALOG.filter((item) =>
    purchasedEquipmentIds.includes(item.id)
  );
  const maxCashPerSecond = Math.max(0, ...ownedEquipment.map((item) => item.cashPerSecond));
  const purchasedZoneCount = unlockedZones.filter((id) => id !== MAIN_FLOOR_ZONE_ID).length;
  const targetOrbitRadius = BASE_ORBIT_RADIUS + purchasedZoneCount * ORBIT_RADIUS_PER_ZONE;
  const mood = getLocationMood(currentLocationId);
  const playAreaBounds = useMemo(() => getPlayAreaBounds(unlockedZones), [unlockedZones]);

  const janitorSpeedMultiplier = hiredStaffIds.includes("cleaner_bob") ? JANITOR_SPEED_MULTIPLIER : 1;
  const smoothieBarRechargeCash = hiredStaffIds.includes("clerk_dan")
    ? Math.round(SMOOTHIE_BAR_RECHARGE_CASH * CLERK_RECHARGE_MULTIPLIER)
    : SMOOTHIE_BAR_RECHARGE_CASH;

  // azimuthRef is the eased, actually-rendered value (see CameraRig);
  // azimuthTargetRef is the raw, directly gesture-driven value it eases
  // toward — split so rotation can filter hand-tremor jitter without
  // introducing felt lag (see AZIMUTH_EASE_RATE).
  const azimuthRef = useRef(0);
  const azimuthTargetRef = useRef(0);
  const polarRef = useRef(Math.PI / 3.2);
  const currentRadiusRef = useRef(targetOrbitRadius);
  const zoomOffsetRef = useRef(0);
  // Pan target (ground-plane XZ) the camera orbits around — replaces the
  // fixed-origin orbit. Starts at the origin, same as the old fixed target,
  // so the initial view is unchanged; only subsequent dragging moves it.
  const panXRef = useRef(0);
  const panZRef = useRef(0);
  const panVelocityRef = useRef<PanVelocity>({ x: 0, z: 0 });
  const boundsRef = useRef(playAreaBounds);
  boundsRef.current = playAreaBounds;
  const lastPan = useRef({ dx: 0, dy: 0 });
  const wasMultiTouchRef = useRef(false);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(0);
  // Two-finger gesture also drives rotation (twist → azimuthTarget, no
  // clamp, full 360°) alongside zoom — both derived from the same two
  // touch points each move event. Tracked by touch *identifier*, not array
  // position (primary/secondaryTouchIdRef) — touches[0]/[1] are not
  // guaranteed to keep referring to the same physical fingers across move
  // events, and the angle calculation (unlike distance) is order-sensitive:
  // if the array order ever swaps mid-gesture, the twist angle flips ~180°
  // with no actual finger movement, snapping the camera. Locking onto
  // specific identifiers at gesture start and looking them up by identity
  // each move avoids that.
  const pinchStartAngleRef = useRef(0);
  const pinchStartAzimuthRef = useRef(0);
  const primaryTouchIdRef = useRef<string | null>(null);
  const secondaryTouchIdRef = useRef<string | null>(null);
  const gestureStartTimeRef = useRef(0);
  const layoutSizeRef = useRef({ width: 0, height: 0 });
  const npcRuntimesRef = useRef<NpcRuntime[]>(createInitialNpcs());
  // Shared, mutated-not-re-rendered: NPCs write which equipment they're
  // working out at; equipment models read it to decide whether to animate.
  const occupancyRef = useRef<Record<string, boolean>>({});

  const [selection, setSelection] = useState<Selection | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const ownedEquipmentRef = useRef(ownedEquipment);
  ownedEquipmentRef.current = ownedEquipment;
  // panResponder below is built via useMemo(..., []) — a persistent closure
  // created once — so anything inside it that can change over time (bounds
  // as zones unlock, customizations as items move/recolor, moveEquipment's
  // own closured state each UserProvider render) needs the same ref-mirror
  // treatment as onSelectRef/ownedEquipmentRef above, or the drag handler
  // would silently validate/commit against stale data from mount time.
  // boundsRef itself is already declared above (it doubles as the pan-
  // target clamp bounds for panXRef/panZRef) — reused here rather than
  // redeclared, since both features need the exact same current value.
  const equipmentCustomizationsRef = useRef(equipmentCustomizations);
  equipmentCustomizationsRef.current = equipmentCustomizations;
  const moveEquipmentRef = useRef(moveEquipment);
  moveEquipmentRef.current = moveEquipment;

  // Live drag state for the Move interaction — a ref (not state) since it
  // updates every touch-move frame; ghostPositionForRender mirrors it into
  // state only at a throttled rate suitable for a re-render (see the drag
  // handler below), the same pattern this file already uses for azimuth
  // easing (ref for the hot path, occasional state for what needs to
  // actually re-render).
  const dragWorldPositionRef = useRef<[number, number, number] | null>(null);
  const dragTargetCellRef = useRef<GridCell | null>(null);
  const [ghostRenderTick, setGhostRenderTick] = useState(0);
  const placingEquipmentIdRef = useRef(placingEquipmentId);
  placingEquipmentIdRef.current = placingEquipmentId;
  const onPlacementSettledRef = useRef(onPlacementSettled);
  onPlacementSettledRef.current = onPlacementSettled;
  // Press-and-hold-to-move: a second, independent way into the same ghost-
  // drag flow above, alongside the Inspector's Edit -> Move button
  // (`placingEquipmentIdRef`, driven by the parent's state). This one never
  // needs to leave GymFloor3D — holding a finger on an owned item's screen
  // position starts the drag directly, no panel needed, matching how most
  // tycoon games let you grab an object. `internalHoldIdRef` is the second
  // source of truth for "what's being placed right now"; every read site
  // that used to check `placingEquipmentIdRef.current` alone now checks
  // both (see `getActivePlacementId` below).
  const internalHoldIdRef = useRef<string | null>(null);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStartPositionRef = useRef({ x: 0, y: 0 });

  function getActivePlacementId(): string | null {
    return placingEquipmentIdRef.current ?? internalHoldIdRef.current;
  }

  // Defensive: a prestige reset can sell equipment out from under an active
  // selection — clear it rather than showing a stale inspector for it.
  useEffect(() => {
    if (selection?.type === "equipment" && !purchasedEquipmentIds.includes(selection.id)) {
      setSelection(null);
      onSelectRef.current?.(null);
    }
  }, [selection, purchasedEquipmentIds]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          lastPan.current = { dx: 0, dy: 0 };
          wasMultiTouchRef.current = false;
          pinchStartDistanceRef.current = null;
          primaryTouchIdRef.current = null;
          secondaryTouchIdRef.current = null;
          gestureStartTimeRef.current = Date.now();
          // Starting a new touch cancels any residual momentum glide —
          // standard "grab to stop" behavior.
          panVelocityRef.current = { x: 0, z: 0 };

          // Press-and-hold-to-move: schedule a hit-test at this exact
          // screen position, timed to fire only if the finger is still
          // down and hasn't moved (see the cancellation checks in
          // onPanResponderMove/Release) by the time it fires.
          holdStartPositionRef.current = {
            x: evt.nativeEvent.locationX,
            y: evt.nativeEvent.locationY,
          };
          if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
          holdTimeoutRef.current = setTimeout(() => {
            holdTimeoutRef.current = null;
            if (wasMultiTouchRef.current || getActivePlacementId()) return;

            const { width, height } = layoutSizeRef.current;
            const hit = findClosestSelection(
              holdStartPositionRef.current.x,
              holdStartPositionRef.current.y,
              ownedEquipmentRef.current,
              npcRuntimesRef.current,
              azimuthRef.current,
              polarRef.current,
              currentRadiusRef.current + zoomOffsetRef.current,
              panXRef.current,
              panZRef.current,
              width,
              height,
              equipmentCustomizationsRef.current
            );
            if (!hit || hit.type !== "equipment") return;

            const item = ownedEquipmentRef.current.find((entry) => entry.id === hit.id);
            if (!item) return;

            internalHoldIdRef.current = hit.id;
            const holdPosition = getEquipmentWorldPosition(item, equipmentCustomizationsRef.current);
            dragWorldPositionRef.current = [holdPosition[0], 0.8, holdPosition[2]];
            dragTargetCellRef.current = null;
            setGhostRenderTick((tick) => tick + 1);
          }, HOLD_MOVE_DURATION_MS);
        },
        onPanResponderMove: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches;

          if (touches.length >= 2) {
            let tracked: [TrackedTouch, TrackedTouch] | null = null;

            if (pinchStartDistanceRef.current !== null) {
              // Mid-gesture: look up the *same two fingers* by identifier,
              // not by array position — see the ref declarations' comment
              // for why position-based lookup can flip the twist angle.
              tracked = findTrackedTouchPair(
                touches,
                primaryTouchIdRef.current!,
                secondaryTouchIdRef.current!
              );
            }

            if (!tracked) {
              // Either this is the first move of a new two-finger gesture,
              // or one of the tracked fingers vanished (lifted, or a third
              // finger reshuffled the array) — lock onto whichever two
              // fingers are present now and restart tracking from here
              // rather than risk using a stale/wrong pair.
              primaryTouchIdRef.current = touches[0].identifier;
              secondaryTouchIdRef.current = touches[1].identifier;
              tracked = [touches[0], touches[1]];
              pinchStartDistanceRef.current = getTouchDistance(tracked);
              pinchStartZoomRef.current = zoomOffsetRef.current;
              pinchStartAngleRef.current = getTouchAngle(tracked);
              pinchStartAzimuthRef.current = azimuthTargetRef.current;
            } else {
              const distance = getTouchDistance(tracked);
              const angle = getTouchAngle(tracked);

              const distanceDelta = distance - pinchStartDistanceRef.current!;
              zoomOffsetRef.current = clamp(
                pinchStartZoomRef.current - distanceDelta * PINCH_ZOOM_SPEED,
                MIN_ZOOM_OFFSET,
                MAX_ZOOM_OFFSET
              );

              // Twist → azimuth target, full 360°, no clamp — angleDifference
              // handles the -π/π wraparound so a twist crossing that
              // boundary mid-gesture doesn't register as a ~360° jump. The
              // *target* is set directly; CameraRig eases the rendered
              // azimuthRef toward it to filter hand-tremor jitter.
              const angleDelta = angleDifference(angle, pinchStartAngleRef.current);
              azimuthTargetRef.current =
                pinchStartAzimuthRef.current + angleDelta * TWO_FINGER_ROTATE_SENSITIVITY;
            }
            wasMultiTouchRef.current = true;
            return;
          }

          if (wasMultiTouchRef.current) {
            // Just dropped from two touches to one — reset the drag baseline
            // to the current cumulative delta so the pan doesn't jump.
            lastPan.current = { dx: gestureState.dx, dy: gestureState.dy };
            wasMultiTouchRef.current = false;
            pinchStartDistanceRef.current = null;
          }

          // The finger has moved enough that this is clearly a pan/orbit
          // drag, not a stationary hold — cancel the pending long-press
          // hit-test so it doesn't fire later and hijack the drag.
          if (holdTimeoutRef.current) {
            const movedX = evt.nativeEvent.locationX - holdStartPositionRef.current.x;
            const movedY = evt.nativeEvent.locationY - holdStartPositionRef.current.y;
            if (Math.hypot(movedX, movedY) > TAP_MAX_DISTANCE_PX) {
              clearTimeout(holdTimeoutRef.current);
              holdTimeoutRef.current = null;
            }
          }

          const placingId = getActivePlacementId();
          if (placingId) {
            // Placement mode: single-finger drag repositions a ghost
            // preview instead of orbiting the camera. Two-finger
            // pinch/rotate (handled above, before this branch) still works
            // normally, so the player can zoom out mid-drag to see across
            // what used to be separate zones.
            //
            // `placingId` is captured into this local const (rather than
            // reading `placingEquipmentIdRef.current` again below) so its
            // type narrows from `string | null` to `string` for the calls
            // below — TypeScript's control-flow narrowing on a mutable
            // ref's `.current` property isn't guaranteed to persist across
            // multiple reads the way a local const's narrowing is.
            const { width, height } = layoutSizeRef.current;
            const ground = screenToGroundPosition(
              evt.nativeEvent.locationX,
              evt.nativeEvent.locationY,
              azimuthRef.current,
              polarRef.current,
              currentRadiusRef.current + zoomOffsetRef.current,
              panXRef.current,
              panZRef.current,
              width,
              height
            );
            if (ground) {
              dragWorldPositionRef.current = [ground.x, 0.8, ground.z];
              const occupied = getOccupiedCells(
                ownedEquipmentRef.current,
                equipmentCustomizationsRef.current,
                placingId
              );
              dragTargetCellRef.current = findNearestValidCell(
                ground.x,
                ground.z,
                boundsRef.current,
                occupied
              );
              setGhostRenderTick((tick) => tick + 1);
            }
            return;
          }

          const deltaX = gestureState.dx - lastPan.current.dx;
          const deltaY = gestureState.dy - lastPan.current.dy;
          lastPan.current = { dx: gestureState.dx, dy: gestureState.dy };

          // Free ground-plane panning, rotated by the camera's current
          // azimuth so a drag that pulls the floor toward the viewer keeps
          // doing that regardless of which way the camera is currently
          // facing — without this, panning would only feel correct at
          // azimuth=0, and would move along the wrong world axis once the
          // camera's been rotated (exactly the bug this is meant to avoid).
          // Clamped every move, not just on release, so the target can
          // never even momentarily overshoot the play area while dragging.
          const { worldX, worldZ } = rotateDragToWorld(deltaX, deltaY, azimuthRef.current);
          const panned = clampPanToBounds(
            panXRef.current - worldX * PAN_SPEED,
            panZRef.current - worldZ * PAN_SPEED,
            boundsRef.current
          );
          panXRef.current = panned.x;
          panZRef.current = panned.z;
        },
        onPanResponderRelease: (evt, gestureState) => {
          const wasPanning = !wasMultiTouchRef.current;
          wasMultiTouchRef.current = false;
          pinchStartDistanceRef.current = null;

          if (holdTimeoutRef.current) {
            clearTimeout(holdTimeoutRef.current);
            holdTimeoutRef.current = null;
          }

          const placingIdOnRelease = getActivePlacementId();
          if (placingIdOnRelease) {
            const targetCell = dragTargetCellRef.current;
            if (targetCell) {
              moveEquipmentRef.current(placingIdOnRelease, targetCell.row, targetCell.col);
            }
            dragWorldPositionRef.current = null;
            dragTargetCellRef.current = null;
            internalHoldIdRef.current = null;
            setGhostRenderTick((tick) => tick + 1);
            onPlacementSettledRef.current();
            return;
          }

          const elapsed = Date.now() - gestureStartTimeRef.current;
          const isTap =
            Math.abs(gestureState.dx) < TAP_MAX_DISTANCE_PX &&
            Math.abs(gestureState.dy) < TAP_MAX_DISTANCE_PX &&
            elapsed < TAP_MAX_DURATION_MS &&
            evt.nativeEvent.touches.length === 0;

          if (isTap) {
            const { width, height } = layoutSizeRef.current;
            const result = findClosestSelection(
              evt.nativeEvent.locationX,
              evt.nativeEvent.locationY,
              ownedEquipmentRef.current,
              npcRuntimesRef.current,
              azimuthRef.current,
              polarRef.current,
              currentRadiusRef.current + zoomOffsetRef.current,
              panXRef.current,
              panZRef.current,
              width,
              height,
              equipmentCustomizationsRef.current
            );
            setSelection(result);
            onSelectRef.current?.(result);
          } else if (wasPanning) {
            // Flick momentum — only for a genuine single-finger pan release,
            // not one ending from a pinch (gestureState.vx/vy during a pinch
            // reflects the two touches' average motion, not a coherent pan
            // intent). Rotated by the current azimuth for the same reason
            // live dragging is — a flick released while the camera is
            // rotated should still glide in the direction it visually
            // looked like it was heading, not along fixed world axes. RN's
            // PanResponder velocity is px/ms; PAN_VELOCITY_SCALE folds in
            // both the ms->s conversion and the same per-pixel scale live
            // dragging uses, so a flick continues at its released speed.
            const { worldX, worldZ } = rotateDragToWorld(
              gestureState.vx,
              gestureState.vy,
              azimuthRef.current
            );
            panVelocityRef.current = {
              x: -worldX * PAN_VELOCITY_SCALE,
              z: -worldZ * PAN_VELOCITY_SCALE,
            };
          }
        },
      }),
    []
  );

  return (
    <View
      style={styles.canvasWrapper}
      onLayout={(event) => {
        layoutSizeRef.current = {
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        };
      }}
      {...panResponder.panHandlers}
    >
      <Canvas shadows camera={{ position: [0, 6, 9], fov: CAMERA_FOV }}>
        <color attach="background" args={[mood.backgroundColor]} />
        <ambientLight color={mood.ambientColor} intensity={mood.ambientIntensity} />
        {/* The only shadow-casting light in the scene now (see
            EquipmentSpotlight's comment) — its shadow map is explicitly
            sized and its frustum tightened to the largest possible play area
            (both zones unlocked, ~40x25 units) rather than left at three.js's
            defaults, which would otherwise waste resolution on empty space
            or clip shadows at the edges as the facility grows. */}
        <directionalLight
          position={[5, 8, 5]}
          color={mood.directionalColor}
          intensity={mood.directionalIntensity}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-SHADOW_FRUSTUM_HALF_SIZE}
          shadow-camera-right={SHADOW_FRUSTUM_HALF_SIZE}
          shadow-camera-top={SHADOW_FRUSTUM_HALF_SIZE}
          shadow-camera-bottom={-SHADOW_FRUSTUM_HALF_SIZE}
          shadow-camera-near={0.5}
          shadow-camera-far={50}
          // The shadow map's 1024x1024 resolution is fixed, but the area it
          // covers has grown a lot as zones unlock (up to ~40x25 units) —
          // coarser texels-per-tile makes shadow-acne self-shadowing
          // artifacts on the large flat floor more visible, which can read
          // as flickering as the camera moves and different acne patterns
          // fall under it. normalBias (rather than a plain depth bias)
          // offsets along the surface normal, which holds up better on a
          // mostly-flat floor viewed from many different angles.
          shadow-normalBias={0.02}
        />
        {/* Bright commercial-gym overhead wash — pure white, straight down,
            no shadows of its own (the angled mood light above already casts
            the scene's shadows; a second shadow-casting light would double
            the shadow-map render cost for no real visual gain here). */}
        <directionalLight
          position={[0, 15, 0]}
          color={OVERHEAD_WASH_COLOR}
          intensity={1.4}
          castShadow={false}
        />

        <GymBackdrop prestigeCount={prestigeCount} windowColor={mood.windowColor} />

        <TiledFloor
          key={`${playAreaBounds.minX}-${playAreaBounds.maxX}-${playAreaBounds.minZ}-${playAreaBounds.maxZ}`}
          bounds={playAreaBounds}
        />
        <gridHelper args={[FLOOR_SIZE, TILES_PER_SIDE, "#3a3d47", "#2a2c33"]} />

        <GymWalls bounds={playAreaBounds} />
        <GymDecor bounds={playAreaBounds} unlockedZones={unlockedZones} />
        <OverheadLedArray bounds={playAreaBounds} />
        <CeilingBeams />
        <CeilingFans />
        <CeilingVents />
        <NeonPerimeter bounds={playAreaBounds} />
        <SmoothieBar />
        <LockerRoomDoor />
        {unlockedZones.includes("cardio_deck") && <CardioDeckZone />}

        {ownedEquipment.map((item) => {
          const position = getEquipmentWorldPosition(item, equipmentCustomizations);
          const rotationStep = getEquipmentRotationStep(item, equipmentCustomizations);
          const isTopEarner = maxCashPerSecond > 0 && item.cashPerSecond === maxCashPerSecond;
          const isSelected = selection?.type === "equipment" && selection.id === item.id;
          return (
            <group key={item.id} position={position} rotation={[0, rotationStep * (Math.PI / 2), 0]}>
              <GymEquipment
                equipmentId={item.id}
                color={getEquipmentColor(item, equipmentCustomizations)}
                isTopEarner={isTopEarner}
                isSelected={isSelected}
                level={equipmentLevels[item.id] ?? 1}
                occupancyRef={occupancyRef}
              />
            </group>
          );
        })}

        {ownedEquipment.map((item) => (
          <EquipmentSpotlight
            key={`spot-${item.id}`}
            position={getEquipmentWorldPosition(item, equipmentCustomizations)}
          />
        ))}

        <GymNpcs
          npcRuntimesRef={npcRuntimesRef}
          ownedEquipmentIds={purchasedEquipmentIds}
          unlockedZones={unlockedZones}
          occupancyRef={occupancyRef}
          selectedNpcId={selection?.type === "npc" ? selection.id : null}
          speedMultiplier={janitorSpeedMultiplier}
          onRecharged={() => addCash(smoothieBarRechargeCash)}
          equipmentCustomizations={equipmentCustomizations}
        />

        <GymStaff
          hiredStaffIds={hiredStaffIds}
          unlockedZones={unlockedZones}
          occupancyRef={occupancyRef}
          equipmentCustomizations={equipmentCustomizations}
        />

        {getActivePlacementId() && dragWorldPositionRef.current && (
          <PlacementGhost
            dragPosition={dragWorldPositionRef.current}
            targetCell={dragTargetCellRef.current}
            color={getEquipmentColor(
              EQUIPMENT_CATALOG.find((entry) => entry.id === getActivePlacementId())!,
              equipmentCustomizations
            )}
          />
        )}

        <CameraRig
          azimuthRef={azimuthRef}
          azimuthTargetRef={azimuthTargetRef}
          polarRef={polarRef}
          targetRadius={targetOrbitRadius}
          currentRadiusRef={currentRadiusRef}
          zoomOffsetRef={zoomOffsetRef}
          panXRef={panXRef}
          panZRef={panZRef}
          panVelocityRef={panVelocityRef}
          boundsRef={boundsRef}
        />
      </Canvas>
    </View>
  );
}

type BoundaryState = { hasError: boolean };

class GymFloorErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("GymFloor3D failed to render:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={[styles.canvasWrapper, styles.fallback]}>
          <Text style={styles.fallbackText}>3D preview unavailable on this device</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

type GymFloor3DProps = {
  onSelect?: (selection: Selection | null) => void;
  /** Non-null while the player is actively dragging this equipment item to
   * a new cell — redirects single-finger drag from camera-orbit to
   * repositioning a ghost preview of the item instead. */
  placingEquipmentId?: string | null;
  /** Fired once the drag ends, whether the move committed or was
   * cancelled — lets the parent clear its own "is placing" state. */
  onPlacementSettled?: () => void;
};

export function GymFloor3D({ onSelect, placingEquipmentId, onPlacementSettled }: GymFloor3DProps) {
  return (
    <GymFloorErrorBoundary>
      <GymFloorScene
        onSelect={onSelect}
        placingEquipmentId={placingEquipmentId ?? null}
        onPlacementSettled={onPlacementSettled ?? (() => {})}
      />
    </GymFloorErrorBoundary>
  );
}

const styles = StyleSheet.create({
  canvasWrapper: {
    flex: 1,
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    // `touchAction` isn't in RN's ViewStyle type (native has no such
    // concept) but react-native-web forwards it straight through to CSS —
    // web-only, and only Platform.select's web branch applies it. Without
    // this, the browser's own default touch handling (pan-scroll, pinch-
    // zoom) still fires alongside our PanResponder gestures on this exact
    // element even with the `+html.tsx` viewport meta's user-scalable=no,
    // since that meta only stops the page-level zoom, not per-element
    // touch scrolling. `none` hands both gestures entirely to PanResponder.
    ...Platform.select({ web: { touchAction: "none" } as object, default: {} }),
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  fallbackText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    textAlign: "center",
  },
});
