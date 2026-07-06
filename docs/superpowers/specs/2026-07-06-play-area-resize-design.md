# Play-Area Resize — Design

## Goal

Replace the current lopsided, large zone-growth model with a small, uniform one: the gym starts at 8x8 tiles and grows by exactly 2 columns (X) and 2 rows (Z) with every zone purchased, regardless of which specific zone. This directly continues the perf work from the previous session (smaller floor -> fewer tiles, fewer ceiling LED rows, smaller shadow-casting area) and replaces an increasingly lopsided, hard-to-reason-about footprint with a small, predictable one.

## Current state

- `EQUIPMENT_GRID_TILE_SIZE` (`constants/equipment.ts`) = 2.5 world units per tile; `GymFloor3D.tsx` imports this as `TILE_SIZE` for floor tiling, so the two can never drift apart.
- `getPlayAreaBounds` (`constants/zones.ts`) starts every player at `MAIN_FLOOR_HALF_SIZE = 10` (a 20x20 unit / 8x8 tile floor — already matches the desired starting size, no change needed there) and then grows via 4 *independent, per-zone-id* `if` blocks with uneven, asymmetric deltas:
  - `cardio_deck`: `maxX -> 20` (+4 tiles, +X only)
  - `iron_vault`: `minX -> -20` (+4 tiles, -X), `minZ -> -15` (+2 tiles, -Z)
  - `facility_expansion_3`: `maxX -> 32` (+4.8 tiles, +X — **not a multiple of TILE_SIZE**, a pre-existing bug)
  - `facility_expansion_4`: `minX -> -32` (+4.8 tiles, -X — same bug), `minZ -> -25` (+4 tiles, -Z)
  - `maxZ` never moves (fixed at `+10`) — the entrance door is there (see the entrance-door spec), and can't move.
  - Max footprint today: 64x35 units (2240 sq. units), asymmetric, with two non-tile-aligned edges.
- Equipment default placement (`constants/equipment.ts`, `gridPosition: {row, col}`, converted to world space via `gridToWorldPosition`) is **independent of zone ownership** — `buyEquipment` (`contexts/UserContext.tsx`) only checks `requiredLevel` and `cash`, never `unlockedZones`. An equipment item's `zoneId` field is a pure data tag consumed only by Sarah's staff bonus calculation (2x earnings for `zoneId === "iron_vault"` items) — it has no effect on purchasability or physical placement. This means shrinking the physical bounds is safe from a game-mechanics standpoint; it only affects layout.
- `ZONE_LANDMARKS` (`constants/zones.ts`): `cardio_deck: [15, 0.3, 0]`, `iron_vault: [-15, 0, -10]` — fixed NPC-wander-target literals, used by `GymNpcs.tsx` and `GymStaff.tsx` (Bob the janitor's zone-visiting logic). Chosen when each zone had its own distinct physical room shape; under the new uniform-growth model, zones no longer correspond to a specific location, so these literals need to move to positions safe regardless of purchase order.
- `GymDecor.tsx` has one fixed literal tied to the old Iron Vault room shape: a wall mirror at `position={[-15, MIRROR_ELEVATION, bounds.minZ + WALL_MOUNT_INSET]}`, gated on `hasIronVault`. Everything else in that file is already `bounds`-relative and needs no change.

## New bounds formula

`getPlayAreaBounds` becomes a pure function of **how many zones are owned** (a count), not which specific ones:

```ts
const zonesOwned = unlockedZones.filter((id) => id !== MAIN_FLOOR_ZONE_ID).length;
const minX = -(4 + zonesOwned) * TILE_SIZE;
const maxX = (4 + zonesOwned) * TILE_SIZE;
const minZ = -(4 + zonesOwned * 2) * TILE_SIZE;
const maxZ = 4 * TILE_SIZE; // fixed forever — entrance wall
```

(`TILE_SIZE` imported from `constants/equipment.ts`, same constant `GymFloor3D.tsx` already uses — not redefined here.)

Resulting sizes (tiles, then units):

| Zones owned | Tiles (W x D) | Units (W x D) |
|---|---|---|
| 0 (start) | 8 x 8 | 20 x 20 |
| 1 | 10 x 10 | 25 x 25 |
| 2 | 12 x 12 | 30 x 30 |
| 3 | 14 x 14 | 35 x 35 |
| 4 (max) | 16 x 16 | 40 x 40 |

Max footprint drops from 2240 sq. units (today) to 1600 sq. units, and every edge is now an exact multiple of `TILE_SIZE` by construction — the two non-aligned edges from `facility_expansion_3`/`4` are fixed as a side effect, not a separately-tracked task.

This also means `ZONE_CATALOG` entries no longer need any bespoke per-zone bounds logic — a 5th future tier would need zero changes to `getPlayAreaBounds`.

## Equipment repositioning

At max size (n=4, `X: [-20, 20]`), two equipment items' current `gridPosition.col: 8` (world x = 21.25) would sit outside the new bounds:

- **Functional Trainer Rig** (`functional-trainer-rig`): `{row: -2, col: 8}` -> `{row: -2, col: 7}`
- **Olympic Platform Rack** (`olympic-platform-rack`): `{row: 0, col: 8}` -> `{row: 0, col: 7}`

`col: 7` is currently unused (verified against all 12 equipment items' grid positions), so this introduces no collision. All other equipment (including the two `iron_vault`-tagged items reaching out to `col: -7`) already fit within the new max bounds on both axes — verified by computing world position for every catalog entry against the n=4 bounds above.

No other equipment moves.

## Landmark repositioning

Both existing landmarks move to positions safely inside the base (n=0, 8x8 tile) bounds — the smallest the floor can ever be — rather than assuming a specific former room shape. This is a stronger guarantee than "safe once that zone is owned": since a player could buy zones in any order (purchase depends only on level/cash, not on owning any other specific zone first), a landmark only needs to be valid regardless of how many zones are actually owned, and basing it on the smallest possible floor achieves that trivially:

- `cardio_deck`: `[15, 0.3, 0]` -> `[8, 0.3, 3]` (well inside even the base 8x8 floor, so valid regardless of purchase order)
- `iron_vault`: `[-15, 0, -10]` -> `[-8, 0, -8]` (same rationale)

`GymDecor.tsx`'s Iron-Vault-gated mirror position changes from the literal `-15` to the already-computed `leftWallX` variable (`bounds.minX + WALL_MOUNT_INSET`, same expression the file's other left-wall decor already uses), so it always sits flush against the actual current left wall regardless of zone count.

## Out of scope

- Re-validating equipment placement against zone-purchase order (a player can already buy high-level equipment without owning its tagged zone today — a pre-existing latent edge case, not introduced or worsened by this change, and not fixed here).
- Any change to zone cost, required level, or the `ZONE_CATALOG` data itself — only the physical bounds those purchases produce.
- Any change to `MAX_LED_ROWS` (from the previous perf pass) — the smaller max floor width naturally produces fewer LED rows now anyway; the cap remains as a safety net.
- Any visual/thematic redesign of what "Cardio Deck" or "Iron Vault" mean now that they're not distinct rooms — they remain purchase-menu flavor text and equipment/staff-bonus tags only, which was already true today.

## Verification approach

Pure-logic changes (bounds formula, static position literals) — no rendering assertions possible without a device. Verify via a throwaway scratch script (matching this repo's established pattern, since there's no test framework):

1. Compute `getPlayAreaBounds` for zonesOwned 0..4, confirm the table above.
2. Confirm every edge at every zone count is an exact multiple of `TILE_SIZE`.
3. Compute world position for all 12 equipment items' (post-fix) `gridPosition`, confirm every one falls strictly within the n=4 (max) bounds.
4. Confirm no two equipment items share a `(row, col)` pair (collision check), before and after the two moved items.
5. Confirm both new landmark positions fall within the n=0 (smallest/base) bounds.

Then: type-check, and a headless-browser visual smoke test (buy zones incrementally, screenshot each step) to catch any gross rendering regression — same method used for the camera-height and wall-fade work earlier this session.
