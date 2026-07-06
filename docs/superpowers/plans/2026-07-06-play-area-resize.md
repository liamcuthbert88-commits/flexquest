# Play-Area Resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current lopsided, per-zone-id play-area growth with a uniform, count-based one — 8x8 tiles at start, +2 columns/+2 rows per zone owned (regardless of which one), maxing at 16x16 tiles instead of today's asymmetric 64x35-unit footprint.

**Architecture:** `getPlayAreaBounds` (`constants/zones.ts`) changes from 4 independent per-zone-id `if` blocks with hand-picked deltas to one formula keyed only on `unlockedZones.length`. Two equipment default grid positions move to stay inside the new (smaller) max bounds. Two zone-landmark literals and one decor literal move off assumptions about the old per-zone room shapes.

**Tech Stack:** TypeScript, no test framework in this repo — verification is throwaway Node scratch scripts (matching this repo's established pattern) plus `npx tsc --noEmit` and a headless-browser visual smoke test.

## Global Constraints

- `TILE_SIZE` is `EQUIPMENT_GRID_TILE_SIZE` (`constants/equipment.ts`) = `2.5` world units — never redefine it elsewhere; import it.
- `maxZ` never changes (fixed at `4 * TILE_SIZE` = `10`) — the entrance door lives there and cannot move.
- Every bounds edge must be an exact multiple of `TILE_SIZE` at every zone count 0-4.
- No change to `ZONE_CATALOG` cost/requiredLevel data, equipment cost/requiredLevel/cashPerSecond, or any staff/manager bonus logic — this plan only touches physical layout (bounds formula, grid positions, landmark/decor literals).
- Delete every throwaway scratch script (`/tmp/claude-scratch-*.js`) once its step's expected output is confirmed — don't leave them lying around.

---

### Task 1: Rewrite `getPlayAreaBounds` to the count-based formula

**Files:**
- Modify: `constants/zones.ts:47-84` (the `MAIN_FLOOR_HALF_SIZE` constant and `getPlayAreaBounds` function)

**Interfaces:**
- Consumes: `EQUIPMENT_GRID_TILE_SIZE` from `constants/equipment.ts` (new import).
- Produces: `getPlayAreaBounds(unlockedZones: string[]): PlayAreaBounds` — same signature as today, callers (`GymFloor3D.tsx`, `GymDecor.tsx`) need no changes.

- [ ] **Step 1: Replace the bounds function**

Read the current file first to confirm line numbers still match (`MAIN_FLOOR_HALF_SIZE` at line 51, `getPlayAreaBounds` at lines 58-84) — this plan was written against a specific commit and line numbers may have shifted.

Replace this block:

```ts
/** Half the Main Floor's 20x20 footprint (see GymFloor3D.tsx's FLOOR_SIZE) —
 * kept as a literal here rather than importing FLOOR_SIZE, since that
 * constant is about floor-tiling specifics, a different concern from the
 * play area's overall bounds. */
const MAIN_FLOOR_HALF_SIZE = 10;

/** The enclosing shell has to grow with the facility instead of staying
 * fixed at the 20x20 main floor — Cardio Deck ([15,0,0], 10x20) and Iron
 * Vault ([-15,0,-10], 10x10) both extend well past that boundary once
 * unlocked, and a fixed-size box would either occlude them behind a wall or
 * need to ignore them. */
export function getPlayAreaBounds(unlockedZones: string[]): PlayAreaBounds {
  let minX = -MAIN_FLOOR_HALF_SIZE;
  let maxX = MAIN_FLOOR_HALF_SIZE;
  let minZ = -MAIN_FLOOR_HALF_SIZE;
  let maxZ = MAIN_FLOOR_HALF_SIZE;

  if (unlockedZones.includes("cardio_deck")) {
    maxX = 20;
  }
  if (unlockedZones.includes("iron_vault")) {
    minX = Math.min(minX, -20);
    minZ = Math.min(minZ, -15);
  }
  // Both new tiers extend the same 3 directions the floor already grows in
  // (cardio_deck -> maxX, iron_vault -> minX/minZ) further, rather than
  // opening a 4th — maxZ is permanently fixed at MAIN_FLOOR_HALF_SIZE since
  // that's where the entrance door sits (see the entrance-door spec).
  if (unlockedZones.includes("facility_expansion_3")) {
    maxX = Math.max(maxX, 32);
  }
  if (unlockedZones.includes("facility_expansion_4")) {
    minX = Math.min(minX, -32);
    minZ = Math.min(minZ, -25);
  }

  return { minX, maxX, minZ, maxZ };
}
```

With:

```ts
/** Base half-size in tiles (not units) — 4 tiles each way from center is an
 * 8x8 tile (20x20 unit) starting floor. Kept in tiles, not units, since
 * every term in the formula below is naturally tile-denominated. */
const BASE_HALF_TILES = 4;
/** +1 tile each side of X per zone owned (2 columns total) — see the
 * 2026-07-06 play-area-resize design doc for the full rationale. */
const COLUMNS_PER_ZONE = 1;
/** +2 tiles on -Z per zone owned (2 rows total) — all on one side since
 * +Z (maxZ) is permanently fixed at the entrance wall and can never grow. */
const ROWS_PER_ZONE = 2;

/** The enclosing shell has to grow with the facility instead of staying
 * fixed at the 8x8-tile starting floor. Purely a function of *how many*
 * zones are owned, not which specific ones — every zone purchase adds the
 * same +2 columns (X, split 1 tile to each side) and +2 rows (Z, all on the
 * -Z side, since +Z/maxZ is fixed at the entrance wall and can never grow).
 * This means a future 5th zone tier needs zero changes here. */
export function getPlayAreaBounds(unlockedZones: string[]): PlayAreaBounds {
  const zonesOwned = unlockedZones.filter((id) => id !== MAIN_FLOOR_ZONE_ID).length;

  const halfWidthTiles = BASE_HALF_TILES + zonesOwned * COLUMNS_PER_ZONE;
  const minX = -halfWidthTiles * EQUIPMENT_GRID_TILE_SIZE;
  const maxX = halfWidthTiles * EQUIPMENT_GRID_TILE_SIZE;

  const minZ = -(BASE_HALF_TILES + zonesOwned * ROWS_PER_ZONE) * EQUIPMENT_GRID_TILE_SIZE;
  const maxZ = BASE_HALF_TILES * EQUIPMENT_GRID_TILE_SIZE;

  return { minX, maxX, minZ, maxZ };
}
```

Add the import at the top of the file (it currently has no imports):

```ts
import { EQUIPMENT_GRID_TILE_SIZE } from "./equipment";
```

- [ ] **Step 2: Write a throwaway scratch script verifying the new formula**

Write to `/tmp/claude-scratch-bounds.js`:

```js
const EQUIPMENT_GRID_TILE_SIZE = 2.5;
const BASE_HALF_TILES = 4;
const COLUMNS_PER_ZONE = 1;
const ROWS_PER_ZONE = 2;
const MAIN_FLOOR_ZONE_ID = "main_floor";

function getPlayAreaBounds(unlockedZones) {
  const zonesOwned = unlockedZones.filter((id) => id !== MAIN_FLOOR_ZONE_ID).length;
  const halfWidthTiles = BASE_HALF_TILES + zonesOwned * COLUMNS_PER_ZONE;
  const minX = -halfWidthTiles * EQUIPMENT_GRID_TILE_SIZE;
  const maxX = halfWidthTiles * EQUIPMENT_GRID_TILE_SIZE;
  const minZ = -(BASE_HALF_TILES + zonesOwned * ROWS_PER_ZONE) * EQUIPMENT_GRID_TILE_SIZE;
  const maxZ = BASE_HALF_TILES * EQUIPMENT_GRID_TILE_SIZE;
  return { minX, maxX, minZ, maxZ };
}

const expected = [
  { n: 0, minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  { n: 1, minX: -12.5, maxX: 12.5, minZ: -15, maxZ: 10 },
  { n: 2, minX: -15, maxX: 15, minZ: -20, maxZ: 10 },
  { n: 3, minX: -17.5, maxX: 17.5, minZ: -25, maxZ: 10 },
  { n: 4, minX: -20, maxX: 20, minZ: -30, maxZ: 10 },
];

let allOk = true;
for (const exp of expected) {
  const zones = Array.from({ length: exp.n }, (_, i) => `zone-${i}`);
  const bounds = getPlayAreaBounds(zones);
  const widthTiles = (bounds.maxX - bounds.minX) / EQUIPMENT_GRID_TILE_SIZE;
  const depthTiles = (bounds.maxZ - bounds.minZ) / EQUIPMENT_GRID_TILE_SIZE;
  const tileAligned =
    Number.isInteger(bounds.minX / EQUIPMENT_GRID_TILE_SIZE) &&
    Number.isInteger(bounds.maxX / EQUIPMENT_GRID_TILE_SIZE) &&
    Number.isInteger(bounds.minZ / EQUIPMENT_GRID_TILE_SIZE) &&
    Number.isInteger(bounds.maxZ / EQUIPMENT_GRID_TILE_SIZE);

  const matches =
    bounds.minX === exp.minX && bounds.maxX === exp.maxX &&
    bounds.minZ === exp.minZ && bounds.maxZ === exp.maxZ;

  console.log(
    `n=${exp.n}: bounds=${JSON.stringify(bounds)} widthTiles=${widthTiles} depthTiles=${depthTiles} tileAligned=${tileAligned} matches=${matches}`
  );
  if (!matches || !tileAligned) allOk = false;
}

console.log(allOk ? "PASS" : "FAIL");
process.exit(allOk ? 0 : 1);
```

- [ ] **Step 3: Run it and confirm expected output**

Run: `node /tmp/claude-scratch-bounds.js`

Expected output (5 lines then PASS):
```
n=0: bounds={"minX":-10,"maxX":10,"minZ":-10,"maxZ":10} widthTiles=8 depthTiles=8 tileAligned=true matches=true
n=1: bounds={"minX":-12.5,"maxX":12.5,"minZ":-15,"maxZ":10} widthTiles=10 depthTiles=10 tileAligned=true matches=true
n=2: bounds={"minX":-15,"maxX":15,"minZ":-20,"maxZ":10} widthTiles=12 depthTiles=12 tileAligned=true matches=true
n=3: bounds={"minX":-17.5,"maxX":17.5,"minZ":-25,"maxZ":10} widthTiles=14 depthTiles=14 tileAligned=true matches=true
n=4: bounds={"minX":-20,"maxX":20,"minZ":-30,"maxZ":10} widthTiles=16 depthTiles=16 tileAligned=true matches=true
PASS
```

If it doesn't match, fix the implementation in `constants/zones.ts` (not the scratch script) until it does.

Delete the scratch script once it passes: `rm /tmp/claude-scratch-bounds.js`

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git add constants/zones.ts
git commit -m "$(cat <<'EOF'
Rewrite play-area bounds to a uniform, count-based growth formula

Replaces 4 independent per-zone-id if-blocks with hand-picked, uneven
deltas (max footprint 64x35 units, two edges not aligned to TILE_SIZE)
with one formula keyed only on how many zones are owned: +1 tile each
side of X (2 columns) and +2 tiles on -Z (2 rows, since +Z/maxZ is
fixed at the entrance wall) per zone, regardless of which one. 8x8
tiles at start, 16x16 max (was asymmetric up to 64x35 units) — see
docs/superpowers/specs/2026-07-06-play-area-resize-design.md.

Every edge is now an exact multiple of TILE_SIZE by construction,
fixing a pre-existing misalignment on the two newest zone tiers as a
side effect. A future 5th zone tier needs zero changes to this
function.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Reposition the two equipment items that would fall outside the new max bounds

**Files:**
- Modify: `constants/equipment.ts` (two `gridPosition` fields)

**Interfaces:**
- Consumes: nothing new.
- Produces: no interface change — `Equipment.gridPosition` shape is unchanged, only two values move.

- [ ] **Step 1: Change the two grid positions**

In `constants/equipment.ts`, find the `functional-trainer-rig` entry (`gridPosition: { row: -2, col: 8 }`) and change `col: 8` to `col: 7`:

```ts
gridPosition: { row: -2, col: 7 },
```

Find the `olympic-platform-rack` entry (`gridPosition: { row: 0, col: 8 }`) and change `col: 8` to `col: 7`:

```ts
gridPosition: { row: 0, col: 7 },
```

- [ ] **Step 2: Write a throwaway scratch script verifying fit and no collisions**

Write to `/tmp/claude-scratch-equipment-fit.js`:

```js
const EQUIPMENT_GRID_TILE_SIZE = 2.5;

function gridToWorldPosition(row, col) {
  const x = col * EQUIPMENT_GRID_TILE_SIZE + EQUIPMENT_GRID_TILE_SIZE / 2;
  const z = row * EQUIPMENT_GRID_TILE_SIZE + EQUIPMENT_GRID_TILE_SIZE / 2;
  return [x, 0, z];
}

// (row, col) for all 12 catalog entries, post-fix
const positions = [
  { id: "rusty-dumbbell-rack", row: -1, col: -1 },
  { id: "commercial-bench-press", row: -1, col: 0 },
  { id: "squat-rack", row: -1, col: 1 },
  { id: "cardio-treadmill", row: 0, col: -1 },
  { id: "cable-crossover-tower", row: -4, col: -6 },
  { id: "lat-pulldown-machine", row: -5, col: -7 },
  { id: "smith-machine", row: -2, col: 4 },
  { id: "leg-press-machine", row: 0, col: 4 },
  { id: "rowing-machine", row: -2, col: 6 },
  { id: "assault-bike", row: 0, col: 6 },
  { id: "functional-trainer-rig", row: -2, col: 7 },
  { id: "olympic-platform-rack", row: 0, col: 7 },
];

// max bounds (n=4 zones owned, from Task 1's formula)
const maxBounds = { minX: -20, maxX: 20, minZ: -30, maxZ: 10 };
const halfCell = EQUIPMENT_GRID_TILE_SIZE / 2;

let allOk = true;

// Fit check: every item's grid cell must fall fully within max bounds
for (const item of positions) {
  const [x, , z] = gridToWorldPosition(item.row, item.col);
  const fitsX = x - halfCell >= maxBounds.minX && x + halfCell <= maxBounds.maxX;
  const fitsZ = z - halfCell >= maxBounds.minZ && z + halfCell <= maxBounds.maxZ;
  if (!fitsX || !fitsZ) {
    console.log(`FAIL fit: ${item.id} at (${x},${z}) fitsX=${fitsX} fitsZ=${fitsZ}`);
    allOk = false;
  }
}

// Collision check: no two items share the same (row, col)
const seen = new Map();
for (const item of positions) {
  const key = `${item.row},${item.col}`;
  if (seen.has(key)) {
    console.log(`FAIL collision: ${item.id} and ${seen.get(key)} both at (${item.row},${item.col})`);
    allOk = false;
  }
  seen.set(key, item.id);
}

console.log(`Checked ${positions.length} equipment items against max bounds`, JSON.stringify(maxBounds));
console.log(allOk ? "PASS" : "FAIL");
process.exit(allOk ? 0 : 1);
```

- [ ] **Step 3: Run it and confirm expected output**

Run: `node /tmp/claude-scratch-equipment-fit.js`

Expected output:
```
Checked 12 equipment items against max bounds {"minX":-20,"maxX":20,"minZ":-30,"maxZ":10}
PASS
```

If it fails, fix the grid positions in `constants/equipment.ts` (not the scratch script) until it passes.

Delete the scratch script once it passes: `rm /tmp/claude-scratch-equipment-fit.js`

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git add constants/equipment.ts
git commit -m "$(cat <<'EOF'
Move 2 equipment items off the new max play-area edge

Functional Trainer Rig and Olympic Platform Rack both sat at col:8
(world x=21.25), which falls outside the new max bounds (X: [-20,20])
from the play-area resize. Moved both to col:7 (unused, no collision)
— same rows, comfortably inside the new max width.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Reposition zone landmarks and the Iron-Vault-gated decor mirror

**Files:**
- Modify: `constants/zones.ts` (`ZONE_LANDMARKS`)
- Modify: `components/GymDecor.tsx` (one `MirrorPanel` position)

**Interfaces:**
- Consumes: `leftWallX` (already computed in `GymDecor.tsx`'s `GymDecor` function, `const leftWallX = bounds.minX + WALL_MOUNT_INSET;`).
- Produces: no interface change — `ZONE_LANDMARKS` keeps its `Record<string, [number, number, number]>` shape.

- [ ] **Step 1: Update `ZONE_LANDMARKS`**

In `constants/zones.ts`, find:

```ts
export const ZONE_LANDMARKS: Record<string, [number, number, number]> = {
  cardio_deck: [15, 0.3, 0],
  iron_vault: [-15, 0, -10],
};
```

Replace with:

```ts
/** Safely inside the base (n=0, 8x8 tile) bounds — the smallest the floor
 * can ever be — rather than a position tied to either zone's old, distinct
 * physical room shape (which no longer exists under the uniform per-zone
 * growth model). A player can buy zones in any order (purchase depends
 * only on level/cash, not on owning any other zone first), so a landmark
 * only needs to be valid regardless of how many zones are actually owned;
 * basing it on the smallest possible floor achieves that trivially. */
export const ZONE_LANDMARKS: Record<string, [number, number, number]> = {
  cardio_deck: [8, 0.3, 3],
  iron_vault: [-8, 0, -8],
};
```

- [ ] **Step 2: Update the Iron-Vault-gated mirror position in `GymDecor.tsx`**

Find:

```tsx
      {hasIronVault && (
        <MirrorPanel
          position={[-15, MIRROR_ELEVATION, bounds.minZ + WALL_MOUNT_INSET]}
          panelWidth={4}
          facingAxis="z"
        />
      )}
```

Replace the literal `-15` with the already-computed `leftWallX` (same expression the file's other left-wall decor already uses):

```tsx
      {hasIronVault && (
        <MirrorPanel
          position={[leftWallX, MIRROR_ELEVATION, bounds.minZ + WALL_MOUNT_INSET]}
          panelWidth={4}
          facingAxis="z"
        />
      )}
```

- [ ] **Step 3: Write a throwaway scratch script verifying both landmarks fit the base bounds**

Write to `/tmp/claude-scratch-landmarks.js`:

```js
const baseBounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
const landmarks = {
  cardio_deck: [8, 0.3, 3],
  iron_vault: [-8, 0, -8],
};

let allOk = true;
for (const [zoneId, [x, , z]] of Object.entries(landmarks)) {
  const fits = x >= baseBounds.minX && x <= baseBounds.maxX && z >= baseBounds.minZ && z <= baseBounds.maxZ;
  console.log(`${zoneId}: (${x},${z}) fits base bounds=${fits}`);
  if (!fits) allOk = false;
}

console.log(allOk ? "PASS" : "FAIL");
process.exit(allOk ? 0 : 1);
```

- [ ] **Step 4: Run it and confirm expected output**

Run: `node /tmp/claude-scratch-landmarks.js`

Expected output:
```
cardio_deck: (8,3) fits base bounds=true
iron_vault: (-8,-8) fits base bounds=true
PASS
```

Delete the scratch script once it passes: `rm /tmp/claude-scratch-landmarks.js`

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add constants/zones.ts components/GymDecor.tsx
git commit -m "$(cat <<'EOF'
Reposition zone landmarks and Iron Vault mirror off old room-shape literals

ZONE_LANDMARKS (NPC wander targets) and one decor mirror's X position
assumed Cardio Deck/Iron Vault's old, distinct physical room shapes —
no longer valid under the play-area resize's uniform per-zone growth.
Moved both landmarks to positions safely inside the base (n=0, 8x8
tile) bounds, the smallest the floor can ever be, so they're valid
regardless of purchase order or how many zones are owned. The mirror
now uses the already-computed leftWallX (bounds.minX + WALL_MOUNT_INSET)
instead of a hardcoded -15, so it always sits flush against the actual
current left wall.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Final integration pass

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 2: Confirm no orphaned scratch files**

Run: `ls /tmp/claude-scratch-*.js 2>/dev/null || echo "none left"`
Expected: `none left` — confirms every throwaway verification script from Tasks 1-3 was deleted as its step instructed.

- [ ] **Step 3: Headless visual smoke test**

Start the web dev server if not already running:

```bash
cd /home/liamcuthbert88/FlexQuest
npx expo start --web --port 8081 &
```

Wait for it to respond (`curl -sf http://localhost:8081`) before proceeding.

Drive it with Playwright. If no `playwright` package is available in this repo's own `node_modules`, reuse another local project's install rather than a fresh `npm install` (this repo has no test framework and doesn't need one added just for this smoke test) — e.g. `require('/home/liamcuthbert88/xeno-gains/node_modules/playwright')` if that path exists, otherwise find any sibling project under the user's home directory with `playwright` already installed. A minimal driver script:

```js
const { chromium } = require('/home/liamcuthbert88/xeno-gains/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('dialog', async (dialog) => { await dialog.accept(); });

  await page.goto('http://localhost:8081', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.getByText('Go to My Gym').click();
  await page.waitForTimeout(2000);
  await page.getByText('DEV 🔧').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/play-area-resize-0-zones.png' });

  await page.getByText('Shop', { exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByText('Facility Expansion Center').click();
  await page.waitForTimeout(500);

  // Buy all 4 zones one at a time, screenshotting the Gym Floor after each.
  const zonePrices = ['$50000', '$150000', '$400000', '$1000000'];
  for (let i = 0; i < zonePrices.length; i++) {
    await page.getByText(zonePrices[i], { exact: true }).last().click();
    await page.waitForTimeout(600);
    await page.getByText('Gym Floor', { exact: true }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `/tmp/play-area-resize-${i + 1}-zones.png` });
    await page.getByText('Shop', { exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByText('Facility Expansion Center').click();
    await page.waitForTimeout(500);
  }

  console.log('PAGE ERRORS:', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
```

Run it with `node`, then check the output and the 5 resulting screenshots (`/tmp/play-area-resize-0-zones.png` through `-4-zones.png`):

1. Printed `PAGE ERRORS:` must be `[]`.
2. `play-area-resize-0-zones.png` (0 zones owned): floor/walls render at the small starting size, no visual corruption.
3. `play-area-resize-1-zones.png` through `-4-zones.png`: the floor visibly grows a small, consistent amount after each single zone purchase (not the old large jumps) — walls, ceiling, entrance door, and reception desk all still render correctly at every step.
4. In the `-4-zones.png` (max size) screenshot, separately verify the two moved equipment items (Functional Trainer Rig, Olympic Platform Rack) by navigating to the Shop's Equipment tab, buying them, returning to Gym Floor, and confirming both render at their new position without clipping the wall or overlapping other equipment.

- [ ] **Step 4: Report**

Summarize what changed (bounds formula, 2 equipment repositions, 2 landmarks + 1 mirror reposition), confirm all verification steps passed, and note the new max footprint (16x16 tiles / 40x40 units, down from 64x35 units) as the expected performance benefit.
