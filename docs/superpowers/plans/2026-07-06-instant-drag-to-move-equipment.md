# Instant Drag-to-Move Equipment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 400ms hold-timer and 3-tap Inspector "Move" button with zero-delay drag-to-move: once an item is selected, dragging from its screen position immediately repositions it.

**Architecture:** `GymFloor3D.tsx`'s `PanResponder` gains a hit-test at gesture-grant time against the currently-selected equipment item, replacing the `setTimeout`-based hold entirely. The `placingEquipmentId`/`onPlacementSettled` prop pair (which only ever existed to support the Inspector's Move button) is removed end-to-end — from `GymFloor3D`'s props, from `app/tycoon.tsx`'s state and JSX, and from `InspectorPanel`'s props and UI (Move button replaced by a static hint).

**Tech Stack:** React Native `PanResponder`, `@react-three/fiber`, TypeScript. No test runner in this repo — verification is `npx tsc --noEmit` per task plus a final manual pass.

## Global Constraints

- The hold-timer (`HOLD_MOVE_DURATION_MS`, `holdTimeoutRef`, `holdStartPositionRef`) is deleted entirely, not shortened.
- Hit-test radius for "is this touch-down on the selected item" reuses the existing `HIT_RADIUS_PX` constant — no new constant.
- The Inspector's "Move" button and `onStartMove` prop are removed; replaced with a static hint reading exactly `"Drag on the floor to move"`, shown whenever an equipment item is selected — **not** gated behind `isEditing` (Color/Rotate stay `isEditing`-gated; only Move decouples from it).
- No automated tests — this repo has zero test infrastructure (no Jest, no `*.test.ts` anywhere). Each task verifies with `npx tsc --noEmit` (must exit 0); the final task runs the spec's 8 manual scenarios.
- Every prop removed from one file's type must have its call site removed too — no dangling prop passed to a component that no longer declares it (TypeScript's JSX excess-property check would fail this at compile time, which is exactly the ordering this plan's task sequence protects against).

---

### Task 1: Grant-time hit-test replaces the hold-timer in `GymFloor3D.tsx`

**Files:**
- Modify: `components/GymFloor3D.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks — this task is self-contained within one file.
- Produces: `GymFloorSceneProps` and `GymFloor3DProps` no longer declare `placingEquipmentId`/`onPlacementSettled` — Tasks 2 and 3 (InspectorPanel, tycoon.tsx) depend on this removal being in place before they remove their own call sites, since removing a call site for a prop that still exists is harmless, but this task's removal must land in the same task or before — this plan sequences it first specifically so Tasks 2/3 build on a codebase where the props are already gone from the type, and their own diffs are pure removals with no leftover type errors to chase.

- [ ] **Step 1: Add `selectionRef` mirror**

In `components/GymFloor3D.tsx`, immediately after the existing `moveEquipmentRef` mirror (currently at line 1427-1428, `const moveEquipmentRef = useRef(moveEquipment); moveEquipmentRef.current = moveEquipment;`), add:

```ts
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
```

This must come after the `const [selection, setSelection] = useState<Selection | null>(null);` declaration (line 1411) — placing it right after `moveEquipmentRef`'s mirror (which is already after that declaration) satisfies this.

- [ ] **Step 2: Delete the hold-timer refs and simplify `getActivePlacementId`**

Replace this block (currently lines 1439-1458):

```ts
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
```

with:

```ts
  // Instant drag-to-move: once an item is the active `selection`, a drag
  // starting on its own screen position (checked at grant time, in
  // onPanResponderGrant below) arms `internalHoldIdRef` immediately — no
  // timer. `internalHoldIdRef` is the sole source of truth for "what's
  // being placed right now."
  const internalHoldIdRef = useRef<string | null>(null);

  function getActivePlacementId(): string | null {
    return internalHoldIdRef.current;
  }
```

- [ ] **Step 3: Replace the hold-timer scheduling in `onPanResponderGrant` with an immediate hit-test**

Replace this block (currently lines 1485-1523, inside `onPanResponderGrant: (evt) => { ... }`, after the existing `panVelocityRef.current = { x: 0, z: 0 };` line):

```ts
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
```

with:

```ts
          // Instant drag-to-move: if an equipment item is already selected,
          // check whether this touch-down landed on its current screen
          // position. If so, arm move mode immediately — no delay, no
          // Inspector round-trip. Dragging that starts anywhere else (or
          // when nothing/an NPC is selected) falls through to normal
          // tap/pan handling below, unaffected.
          if (selectionRef.current?.type === "equipment") {
            const item = ownedEquipmentRef.current.find(
              (entry) => entry.id === selectionRef.current!.id
            );
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
        },
```

- [ ] **Step 4: Remove the now-dead hold-timer cancellation check in `onPanResponderMove`**

Delete this block entirely (currently lines 1587-1597, inside `onPanResponderMove`, immediately before `const placingId = getActivePlacementId();`):

```ts
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

```

(Leave `const placingId = getActivePlacementId();` and everything after it untouched — only the block above is removed.)

- [ ] **Step 5: Remove the now-dead hold-timer cancellation check in `onPanResponderRelease`**

Delete this block (currently lines 1669-1672, inside `onPanResponderRelease`, immediately before `const placingIdOnRelease = getActivePlacementId();`):

```ts
          if (holdTimeoutRef.current) {
            clearTimeout(holdTimeoutRef.current);
            holdTimeoutRef.current = null;
          }

```

- [ ] **Step 6: Remove the `onPlacementSettledRef` call in the release handler's commit branch**

Change (currently lines 1674-1686):

```ts
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
```

to:

```ts
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
            return;
          }
```

(Only the `onPlacementSettledRef.current();` line is removed.)

- [ ] **Step 7: Remove `HOLD_MOVE_DURATION_MS`**

Delete the now-unused constant (currently line 179):

```ts
const HOLD_MOVE_DURATION_MS = 400;
```

- [ ] **Step 8: Remove `placingEquipmentId`/`onPlacementSettled` from `GymFloorSceneProps` and the component signature**

Change (currently lines 1336-1342):

```ts
type GymFloorSceneProps = {
  onSelect?: (selection: Selection | null) => void;
  placingEquipmentId: string | null;
  onPlacementSettled: () => void;
};

function GymFloorScene({ onSelect, placingEquipmentId, onPlacementSettled }: GymFloorSceneProps) {
```

to:

```ts
type GymFloorSceneProps = {
  onSelect?: (selection: Selection | null) => void;
};

function GymFloorScene({ onSelect }: GymFloorSceneProps) {
```

- [ ] **Step 9: Remove `placingEquipmentId`/`onPlacementSettled` from `GymFloor3DProps` and the outer component**

Change (currently lines 1912-1933):

```ts
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
```

to:

```ts
type GymFloor3DProps = {
  onSelect?: (selection: Selection | null) => void;
};

export function GymFloor3D({ onSelect }: GymFloor3DProps) {
  return (
    <GymFloorErrorBoundary>
      <GymFloorScene onSelect={onSelect} />
    </GymFloorErrorBoundary>
  );
}
```

- [ ] **Step 10: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: this will **fail** at this point — `app/tycoon.tsx` still passes `placingEquipmentId`/`onPlacementSettled` to `<GymFloor3D>` and `onStartMove` to `<InspectorPanel>` (removed from `InspectorPanel`'s props in Task 2, not yet touched here). That's expected and resolved by Task 3, which removes those call sites. Confirm the **only** errors reported are excess-property/missing-prop errors on `app/tycoon.tsx`'s `<GymFloor3D>` JSX (for `placingEquipmentId`/`onPlacementSettled`) — if you see any other error, or an error inside `components/GymFloor3D.tsx` itself, stop and report BLOCKED; that would mean this task's own diff has a bug, not just the expected downstream gap.

- [ ] **Step 11: Commit**

```bash
cd ~/FlexQuest && git add components/GymFloor3D.tsx
git commit -m "$(cat <<'EOF'
feat: instant drag-to-move, replacing the 400ms hold-timer

Once an item is selected, a drag starting on its screen position now
arms move mode immediately at gesture-grant time, instead of waiting on
a stationary hold. The placingEquipmentId/onPlacementSettled prop pair
(the Inspector-driven half of the old dual-path system) is removed from
this file's props — call sites in app/tycoon.tsx and InspectorPanel.tsx
are cleaned up in the next two tasks.
EOF
)"
```

---

### Task 2: Remove Move button from `InspectorPanel.tsx`, add drag hint

**Files:**
- Modify: `components/InspectorPanel.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `InspectorPanel`'s `Props` type no longer includes `onStartMove` — Task 3 (`app/tycoon.tsx`) depends on this removal before it removes the corresponding call site.

- [ ] **Step 1: Remove `onStartMove` from `Props`**

Change (currently lines 26-35):

```ts
type Props = {
  selection: Selection | null;
  onClose: () => void;
  onUpgrade: (equipmentId: string) => void;
  onSetColor: (equipmentId: string, color: string) => void;
  onRotate: (equipmentId: string) => void;
  onStartMove: (equipmentId: string) => void;
  isEditing: boolean;
  onToggleEdit: () => void;
};
```

to:

```ts
type Props = {
  selection: Selection | null;
  onClose: () => void;
  onUpgrade: (equipmentId: string) => void;
  onSetColor: (equipmentId: string, color: string) => void;
  onRotate: (equipmentId: string) => void;
  isEditing: boolean;
  onToggleEdit: () => void;
};
```

- [ ] **Step 2: Remove `onStartMove` from the destructured props**

Change (currently lines 37-46):

```ts
export function InspectorPanel({
  selection,
  onClose,
  onUpgrade,
  onSetColor,
  onRotate,
  onStartMove,
  isEditing,
  onToggleEdit,
}: Props) {
```

to:

```ts
export function InspectorPanel({
  selection,
  onClose,
  onUpgrade,
  onSetColor,
  onRotate,
  isEditing,
  onToggleEdit,
}: Props) {
```

- [ ] **Step 3: Replace the Move button with a hint, add hint below the Edit toggle**

Change (currently lines 114-153):

```ts
          <Pressable style={styles.editToggleButton} onPress={onToggleEdit}>
            <Ionicons
              name={isEditing ? "checkmark-done-outline" : "create-outline"}
              size={16}
              color={colors.accentPrimary}
            />
            <Text style={styles.editToggleText}>{isEditing ? "Done Editing" : "Edit"}</Text>
          </Pressable>

          {isEditing && (
            <View style={styles.editSection}>
              <Text style={styles.statLabel}>Colour</Text>
              <View style={styles.swatchRow}>
                {EQUIPMENT_COLOR_SWATCHES.map((swatch) => (
                  <Pressable
                    key={swatch}
                    style={[styles.swatch, { backgroundColor: swatch }]}
                    onPress={() => onSetColor(equipmentItem.id, swatch)}
                  />
                ))}
              </View>

              <View style={styles.editButtonRow}>
                <Pressable
                  style={styles.editActionButton}
                  onPress={() => onRotate(equipmentItem.id)}
                >
                  <Ionicons name="refresh-outline" size={16} color={colors.textPrimary} />
                  <Text style={styles.editActionButtonText}>Rotate</Text>
                </Pressable>
                <Pressable
                  style={styles.editActionButton}
                  onPress={() => onStartMove(equipmentItem.id)}
                >
                  <Ionicons name="swap-horizontal-outline" size={16} color={colors.textPrimary} />
                  <Text style={styles.editActionButtonText}>Move</Text>
                </Pressable>
              </View>
            </View>
          )}
```

to:

```ts
          <Pressable style={styles.editToggleButton} onPress={onToggleEdit}>
            <Ionicons
              name={isEditing ? "checkmark-done-outline" : "create-outline"}
              size={16}
              color={colors.accentPrimary}
            />
            <Text style={styles.editToggleText}>{isEditing ? "Done Editing" : "Edit"}</Text>
          </Pressable>

          <View style={styles.moveHintRow}>
            <Ionicons name="move-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.moveHintText}>Drag on the floor to move</Text>
          </View>

          {isEditing && (
            <View style={styles.editSection}>
              <Text style={styles.statLabel}>Colour</Text>
              <View style={styles.swatchRow}>
                {EQUIPMENT_COLOR_SWATCHES.map((swatch) => (
                  <Pressable
                    key={swatch}
                    style={[styles.swatch, { backgroundColor: swatch }]}
                    onPress={() => onSetColor(equipmentItem.id, swatch)}
                  />
                ))}
              </View>

              <View style={styles.editButtonRow}>
                <Pressable
                  style={styles.editActionButton}
                  onPress={() => onRotate(equipmentItem.id)}
                >
                  <Ionicons name="refresh-outline" size={16} color={colors.textPrimary} />
                  <Text style={styles.editActionButtonText}>Rotate</Text>
                </Pressable>
              </View>
            </View>
          )}
```

Note `editButtonRow` now wraps a single button instead of two — left as-is (it's a `flexDirection: "row"` container, which renders a single flex child correctly without modification; not worth a style change for one remaining item).

- [ ] **Step 4: Add the two new styles**

In the `StyleSheet.create` block, add after `editToggleText` (currently ending at line 319, `},`):

```ts
  moveHintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: 2,
  },
  moveHintText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.textSecondary,
  },
```

- [ ] **Step 5: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: same expected failure as Task 1's Step 10 — `app/tycoon.tsx` still passes `onStartMove` to `<InspectorPanel>`, which no longer accepts it. Confirm the only new error (beyond the ones already expected from Task 1) is on `app/tycoon.tsx`'s `<InspectorPanel>` JSX for the excess `onStartMove` prop.

- [ ] **Step 6: Commit**

```bash
cd ~/FlexQuest && git add components/InspectorPanel.tsx
git commit -m "$(cat <<'EOF'
feat: remove Move button, add drag hint to Inspector panel

Dragging now works immediately once an item is selected (see the
GymFloor3D change), so the explicit Move button is redundant. Replaced
with a static "Drag on the floor to move" hint, shown regardless of
whether Edit mode is toggled — only Color/Rotate stay Edit-gated.
EOF
)"
```

---

### Task 3: Remove `placingEquipmentId` plumbing from `app/tycoon.tsx`

**Files:**
- Modify: `app/tycoon.tsx`

**Interfaces:**
- Consumes: `GymFloor3DProps` no longer declaring `placingEquipmentId`/`onPlacementSettled` (Task 1); `InspectorPanel`'s `Props` no longer declaring `onStartMove` (Task 2).
- Produces: nothing new — this is the final cleanup task, resolving the typecheck failures Tasks 1 and 2 each expected.

- [ ] **Step 1: Remove the `placingEquipmentId` state declaration**

Delete (currently line 89):

```ts
  const [placingEquipmentId, setPlacingEquipmentId] = useState<string | null>(null);
```

- [ ] **Step 2: Remove the props passed to `<GymFloor3D>`**

Change (currently lines 212-219):

```ts
            <GymFloor3D
              onSelect={(next) => {
                setSelection(next);
                setIsEditingEquipment(false);
              }}
              placingEquipmentId={placingEquipmentId}
              onPlacementSettled={() => setPlacingEquipmentId(null)}
            />
```

to:

```ts
            <GymFloor3D
              onSelect={(next) => {
                setSelection(next);
                setIsEditingEquipment(false);
              }}
            />
```

- [ ] **Step 3: Remove the `onStartMove` prop passed to `<InspectorPanel>`**

Change (currently lines 220-232):

```ts
            <InspectorPanel
              selection={selection}
              onClose={() => {
                setSelection(null);
                setIsEditingEquipment(false);
              }}
              isEditing={isEditingEquipment}
              onToggleEdit={() => setIsEditingEquipment((prev) => !prev)}
              onSetColor={setEquipmentColor}
              onRotate={rotateEquipment}
              onStartMove={(equipmentId) => setPlacingEquipmentId(equipmentId)}
              onUpgrade={handleUpgradeEquipment}
            />
```

to:

```ts
            <InspectorPanel
              selection={selection}
              onClose={() => {
                setSelection(null);
                setIsEditingEquipment(false);
              }}
              isEditing={isEditingEquipment}
              onToggleEdit={() => setIsEditingEquipment((prev) => !prev)}
              onSetColor={setEquipmentColor}
              onRotate={rotateEquipment}
              onUpgrade={handleUpgradeEquipment}
            />
```

- [ ] **Step 4: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0, no errors. All three files' changes are now complete and mutually consistent.

- [ ] **Step 5: Commit**

```bash
cd ~/FlexQuest && git add app/tycoon.tsx
git commit -m "$(cat <<'EOF'
refactor: remove placingEquipmentId plumbing from tycoon screen

Dead state now that GymFloor3D arms move mode from selection alone and
InspectorPanel no longer has a Move button to trigger it.
EOF
)"
```

---

### Task 4: Manual verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full-project typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 2: Start the app**

Run: `cd ~/FlexQuest && npx expo start --tunnel --dev-client` (this project requires the custom EAS dev client, not Expo Go — SDK 57 isn't yet supported by Expo Go's published build)
Expected: Metro starts, tunnel connects, app loads on the installed dev client without crashing.

- [ ] **Step 3: Verify instant drag from selection**

On the Gym Floor tab, tap an owned equipment item. Confirm the Inspector opens with the "Drag on the floor to move" hint visible immediately (no need to tap Edit). Immediately (no pause) drag from that item's position.
Expected: the drag ghost appears with zero delay and follows the finger, snapping to the nearest valid grid cell as it moves.

- [ ] **Step 4: Verify commit and reject**

Release the drag over a clearly valid, empty cell.
Expected: the item moves there instantly.

Repeat, this time releasing over a cell occupied by another item (or outside the play area bounds).
Expected: the item stays exactly at its original position.

- [ ] **Step 5: Verify camera panning still works with a selection active**

With an item selected, start a drag from a different part of the screen (not on the selected item).
Expected: the camera pans/orbits normally; the selected item does not move.

- [ ] **Step 6: Verify plain tap-elsewhere still works**

With an item selected, tap a different spot with no drag (a quick tap, not a hold).
Expected: normal reselect/deselect behavior — either a different item becomes selected, or the Inspector closes if the tap hit nothing.

- [ ] **Step 7: Verify Edit mode still works for Color/Rotate**

Tap an item, tap "Edit". Confirm Color swatches and a "Rotate" button are present, and there is no "Move" button anywhere in the panel.

- [ ] **Step 8: Verify two-finger gestures still work during a drag**

Start dragging a selected item with one finger, then add a second finger to pinch-zoom or twist-rotate the camera mid-drag.
Expected: camera zoom/rotation responds normally; releasing back to one finger resumes the item drag without a jump.

- [ ] **Step 9: Report results**

No commit for this task — it's verification only. If any expected behavior doesn't match, note which step failed and return to the relevant task above to fix before considering the plan complete.
