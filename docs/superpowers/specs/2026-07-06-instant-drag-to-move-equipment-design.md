# Instant Drag-to-Move Equipment Design

## Context

Moving equipment on the 3D Gym Floor currently has two paths, both slow/fiddly:

1. **Press-and-hold directly on an item** (`components/GymFloor3D.tsx`) — a 400ms timer (`HOLD_MOVE_DURATION_MS`) must elapse, finger held still, before the drag ghost appears.
2. **Inspector panel route** — tap the item (selects it, opens Inspector), tap "Edit" (toggles edit mode, reveals Color/Rotate/Move buttons), tap "Move" (arms placement mode). Three taps before a drag can even start.

Both were named as the problem: the hold delay feels laggy, and the Inspector route has too many steps.

## Decision (confirmed via user Q&A)

Tapping an item selects it, same as today. While it's the active selection, a drag that **starts on that item's current screen position** enters move mode immediately — zero delay, no intermediate taps. The 400ms hold-timer path is removed entirely, not shortened. The Inspector's explicit "Move" button is removed (replaced by a "Drag to move" hint), since selection alone now arms dragging.

## Architecture

### `components/GymFloor3D.tsx` (`GymFloorScene`)

A new `selectionRef` mirrors the existing local `selection` state (`useState<Selection | null>`, declared at line 1411), following the same ref-mirror pattern already used for `ownedEquipmentRef`/`equipmentCustomizationsRef`/etc. — needed because `onPanResponderGrant`'s closure otherwise sees a stale `selection` from whenever the `PanResponder` was memoized, not the current one.

`onPanResponderGrant` gains a hit-test, inserted after its existing setup (resetting `lastPan`, `wasMultiTouchRef`, `gestureStartTimeRef`, etc.) and *replacing* the current hold-timer scheduling entirely:

```ts
if (selectionRef.current?.type === "equipment") {
  const item = ownedEquipmentRef.current.find((entry) => entry.id === selectionRef.current!.id);
  if (item) {
    const worldPos = getEquipmentWorldPosition(item, equipmentCustomizationsRef.current);
    const screenPos = worldToScreen(
      [worldPos[0], 0.8, worldPos[2]],
      azimuthRef.current,
      polarRef.current,
      currentRadiusRef.current + zoomOffsetRef.current,
      panXRef.current,
      panZRef.current,
      layoutSizeRef.current.width,
      layoutSizeRef.current.height
    );
    if (screenPos) {
      const distance = Math.hypot(
        screenPos.x - evt.nativeEvent.locationX,
        screenPos.y - evt.nativeEvent.locationY
      );
      if (distance < HIT_RADIUS_PX) {
        internalHoldIdRef.current = item.id;
        dragWorldPositionRef.current = [worldPos[0], 0.8, worldPos[2]];
        dragTargetCellRef.current = null;
        setGhostRenderTick((tick) => tick + 1);
      }
    }
  }
}
```

No `setTimeout` anywhere in this path — `HOLD_MOVE_DURATION_MS`, `holdTimeoutRef`, and `holdStartPositionRef` are deleted, along with the cancellation checks in `onPanResponderMove`/`onPanResponderRelease` that existed only to cancel that timer.

`getActivePlacementId()` simplifies from:
```ts
function getActivePlacementId(): string | null {
  return placingEquipmentIdRef.current ?? internalHoldIdRef.current;
}
```
to:
```ts
function getActivePlacementId(): string | null {
  return internalHoldIdRef.current;
}
```
— the `placingEquipmentIdRef` half is removed along with the prop it mirrored. Every other read site (`onPanResponderMove`'s placement branch, `onPanResponderRelease`'s commit branch) is unchanged; they already call `getActivePlacementId()` rather than reading either ref directly.

`GymFloorSceneProps` and the outer `GymFloor3DProps` both drop `placingEquipmentId` and `onPlacementSettled`. `onPlacementSettledRef` is deleted; the release handler's commit branch (`moveEquipmentRef.current(...)`, clearing drag refs, bumping `ghostRenderTick`) is unchanged except it no longer calls `onPlacementSettledRef.current()`.

### `app/tycoon.tsx`

Removed: `placingEquipmentId` state (`useState<string | null>(null)`), the `placingEquipmentId`/`onPlacementSettled` props passed to `<GymFloor3D>`, and the `onStartMove` prop passed to `<InspectorPanel>`.

### `components/InspectorPanel.tsx`

The "Move" button (`onPress={() => onStartMove(equipmentItem.id)}`) and the `onStartMove: (equipmentId: string) => void` prop are removed. In its place, a static hint reading `"Drag on the floor to move"`, rendered whenever the panel is showing an equipment item's details, *not* gated behind `isEditing`. Color/Rotate stay exactly as they are today, inside the `isEditing` block — only Move decouples from the Edit toggle, since it's no longer a button at all.

## Error Handling

- **Stale selection** (item sold via prestige reset mid-session): already defensively cleared — the existing effect at `GymFloor3D.tsx:1462-1467` nulls `selection` the moment `purchasedEquipmentIds` no longer includes it, so the grant-time hit-test can't fire against a sold item's stale position.
- **Selected item off-screen** (camera panned/rotated away, or behind the view frustum): `worldToScreen` already returns `null` in that case (existing contract, unchanged); the new hit-test just treats `null` as "no hit" and falls through to normal tap/pan handling. No new failure mode.
- **Two-finger gesture starting mid-arm**: unaffected — `onPanResponderMove`'s pinch/rotate branch is still checked before the placement branch, exactly as today; arming at grant doesn't change move-handling order.
- **Accepted edge case (not a defect):** tapping an *already-selected* item a second time now arms move-mode at grant instead of merely reconfirming selection. Since the finger hasn't moved between grant and release, `findNearestValidCell` resolves to the item's own current cell, so release calls `moveEquipmentRef.current(id, sameRow, sameCol)` — a no-op in effect (an item's own occupied cell is excluded from its own collision check, via `getOccupiedCells(..., equipmentId)`), just technically a trivial same-position "move" rather than a pure no-op tap. No visible or functional difference; documented here rather than silently glossed over.

## Testing

No automated tests in this repo (no Jest, no `*.test.ts` anywhere — established convention throughout this project). Manual verification:

1. Tap an item → Inspector opens, "Drag to move" hint visible immediately, no Edit tap required.
2. Immediately drag from that item (no pause) → ghost appears with zero delay, follows the finger, snaps to the nearest valid grid cell as it moves.
3. Release over a valid cell → item moves there instantly.
4. Release over an invalid/occupied cell → item stays exactly where it was.
5. Select an item, then start a drag *elsewhere* on screen (not on the item) → camera pans normally; the item does not move.
6. Select an item, then tap elsewhere (a genuine tap, not a drag) → normal reselect/deselect behavior, unaffected by this change.
7. Open Edit mode on a selected item → Color/Rotate buttons still present; no Move button; hint text visible whether or not Edit mode is toggled.
8. Two-finger pinch/rotate still works normally both while dragging an item and while just orbiting the camera.
