import { TileType, FurnitureType, DEFAULT_COLS, DEFAULT_ROWS, TILE_SIZE, Direction } from '../types'
import type { TileType as TileTypeVal, OfficeLayout, PlacedFurniture, Seat, FurnitureInstance, FloorColor } from '../types'
import { getCatalogEntry } from './furnitureCatalog'
import { isWalkable } from './tileMap'
import { getColorizedSprite } from '../colorize'

/** Convert flat tile array from layout into 2D grid */
export function layoutToTileMap(layout: OfficeLayout): TileTypeVal[][] {
  const map: TileTypeVal[][] = []
  for (let r = 0; r < layout.rows; r++) {
    const row: TileTypeVal[] = []
    for (let c = 0; c < layout.cols; c++) {
      row.push(layout.tiles[r * layout.cols + c])
    }
    map.push(row)
  }
  return map
}

/** Convert placed furniture into renderable FurnitureInstance[] */
export function layoutToFurnitureInstances(furniture: PlacedFurniture[]): FurnitureInstance[] {
  // Pre-compute desk zY per tile so surface items can sort in front of desks
  const deskZByTile = new Map<string, number>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || !entry.isDesk) continue
    const deskZY = item.row * TILE_SIZE + entry.sprite.length
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const key = `${item.col + dc},${item.row + dr}`
        const prev = deskZByTile.get(key)
        if (prev === undefined || deskZY > prev) deskZByTile.set(key, deskZY)
      }
    }
  }

  const instances: FurnitureInstance[] = []
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const x = item.col * TILE_SIZE
    const y = item.row * TILE_SIZE
    const spriteH = entry.sprite.length
    let zY = y + spriteH

    // Chair z-sorting: ensure characters sitting on chairs render correctly
    if (entry.category === 'chairs') {
      if (entry.orientation === 'back') {
        // Back-facing chairs render IN FRONT of the seated character
        // (the chair back visually occludes the character behind it)
        zY = (item.row + 1) * TILE_SIZE + 1
      } else {
        // All other chairs: cap zY to first row bottom so characters
        // at any seat tile render in front of the chair
        zY = (item.row + 1) * TILE_SIZE
      }
    }

    // Surface items render in front of the desk they sit on
    if (entry.canPlaceOnSurfaces) {
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          const key = `${Math.round(item.col + dc)},${Math.round(item.row + dr)}`
          const deskZ = deskZByTile.get(key)
          if (deskZ !== undefined && deskZ + 0.5 > zY) zY = deskZ + 0.5
        }
      }
    }

    let sprite = entry.sprite
    if (item.color) {
      const { h, s, b: bv, c: cv } = item.color
      sprite = getColorizedSprite(`furn-${item.type}-${h}-${s}-${bv}-${cv}-${item.color.colorize ? 1 : 0}`, entry.sprite, item.color)
    }

    instances.push({
      uid: item.uid,
      sprite,
      x,
      y,
      zY,
      ...(entry.emoji ? { emoji: entry.emoji } : {}),
      ...(item.rotation ? { rotation: item.rotation } : {}),
      ...(entry.emojiScale ? { emojiScale: entry.emojiScale } : {}),
    })
  }
  return instances
}

/** Get all tiles blocked by furniture footprints, optionally excluding a set of tiles.
 *  Skips top backgroundTiles rows so characters can walk through them. */
export function getBlockedTiles(furniture: PlacedFurniture[], excludeTiles?: Set<string>): Set<string> {
  const tiles = new Set<string>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const bgRows = entry.backgroundTiles || 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue // skip background rows — characters can walk through
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const key = `${item.col + dc},${item.row + dr}`
        if (excludeTiles && excludeTiles.has(key)) continue
        tiles.add(key)
      }
    }
  }
  return tiles
}

/** Get tiles blocked for placement purposes — skips top backgroundTiles rows per item */
export function getPlacementBlockedTiles(furniture: PlacedFurniture[], excludeUid?: string): Set<string> {
  const tiles = new Set<string>()
  for (const item of furniture) {
    if (item.uid === excludeUid) continue
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const bgRows = entry.backgroundTiles || 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue // skip background rows
      for (let dc = 0; dc < entry.footprintW; dc++) {
        tiles.add(`${item.col + dc},${item.row + dr}`)
      }
    }
  }
  return tiles
}

/** Map chair orientation to character facing direction */
function orientationToFacing(orientation: string): Direction {
  switch (orientation) {
    case 'front': return Direction.DOWN
    case 'back': return Direction.UP
    case 'left': return Direction.LEFT
    case 'right': return Direction.RIGHT
    default: return Direction.DOWN
  }
}

/** Generate seats from chair furniture.
 *  Facing priority: 1) chair orientation, 2) adjacent desk, 3) forward (DOWN). */
export function layoutToSeats(furniture: PlacedFurniture[]): Map<string, Seat> {
  const seats = new Map<string, Seat>()

  // Build set of all desk tiles
  const deskTiles = new Set<string>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || !entry.isDesk) continue
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        deskTiles.add(`${item.col + dc},${item.row + dr}`)
      }
    }
  }

  const dirs: Array<{ dc: number; dr: number; facing: Direction }> = [
    { dc: 0, dr: -1, facing: Direction.UP },    // desk is above chair → face UP
    { dc: 0, dr: 1, facing: Direction.DOWN },   // desk is below chair → face DOWN
    { dc: -1, dr: 0, facing: Direction.LEFT },   // desk is left of chair → face LEFT
    { dc: 1, dr: 0, facing: Direction.RIGHT },   // desk is right of chair → face RIGHT
  ]

  // For each chair, every footprint tile becomes a seat.
  // Multi-tile chairs (e.g. 2-tile couches) produce multiple seats.
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || entry.category !== 'chairs') continue

    let seatCount = 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const tileCol = item.col + dc
        const tileRow = item.row + dr

        // Determine facing direction:
        // 1) Chair orientation takes priority
        // 2) Adjacent desk direction (use rounded coords for grid lookup)
        // 3) Default forward (DOWN)
        let facingDir: Direction = Direction.DOWN
        const roundedCol = Math.round(tileCol)
        const roundedRow = Math.round(tileRow)
        if (item.uid.startsWith('stool-r')) {
          facingDir = Direction.LEFT
        } else if (entry.orientation) {
          facingDir = orientationToFacing(entry.orientation)
        } else {
          for (const d of dirs) {
            if (deskTiles.has(`${roundedCol + d.dc},${roundedRow + d.dr}`)) {
              facingDir = d.facing
              break
            }
          }
        }

        // First seat uses chair uid (backward compat), subsequent use uid:N
        const seatUid = seatCount === 0 ? item.uid : `${item.uid}:${seatCount}`
        seats.set(seatUid, {
          uid: seatUid,
          seatCol: tileCol,
          seatRow: tileRow,
          facingDir,
          assigned: false,
        })
        seatCount++
      }
    }
  }

  return seats
}

/** Get the set of tiles occupied by seats (so they can be excluded from blocked tiles) */
export function getSeatTiles(seats: Map<string, Seat>): Set<string> {
  const tiles = new Set<string>()
  for (const seat of seats.values()) {
    tiles.add(`${Math.round(seat.seatCol)},${Math.round(seat.seatRow)}`)
  }
  return tiles
}

/** Default floor colors */
const DEFAULT_LEFT_ROOM_COLOR: FloorColor = { h: 35, s: 30, b: 15, c: 0 }  // warm beige (corridor)
const DEFAULT_RIGHT_ROOM_COLOR: FloorColor = { h: 25, s: 45, b: 5, c: 10 }  // warm brown (boss office)
const DEFAULT_CARPET_COLOR: FloorColor = { h: 280, s: 40, b: -5, c: 0 }     // purple (carpet)
const DEFAULT_DOORWAY_COLOR: FloorColor = { h: 35, s: 25, b: 10, c: 0 }     // tan (doorway)
const DEFAULT_LOUNGE_COLOR: FloorColor = { h: 200, s: 30, b: 10, c: 0 }     // cool blue (workspace, used in migration)

const RIGHT_WALL_STOOLS: ReadonlyArray<PlacedFurniture> = []

function shouldRemoveRightOfficeLegacyItems(item: PlacedFurniture): boolean {
  if (item.uid.startsWith('stool-r')) return true
  if (item.uid === 'plant-r1' || item.uid === 'lamp-r' || item.uid === 'cooler-r') return true
  if (item.type === FurnitureType.PLANT && item.col === 19 && item.row === 3) return true
  if (item.type === FurnitureType.LAMP && item.col === 19 && item.row === 7) return true
  if (item.type === FurnitureType.COOLER && item.col === 18 && item.row === 7) return true
  return false
}

function normalizeRightOfficeFurniture(furniture: PlacedFurniture[]): PlacedFurniture[] {
  const base = furniture.filter((item) => !shouldRemoveRightOfficeLegacyItems(item))
  return base
}

/**
 * Create the default office layout — compact 19×11 design:
 *
 *  col 0-2   : Left corridor (beige)
 *  col 3     : Wall with doorway (rows 3-5)
 *  col 4-12  : Central open workspace (teal, 2 rows of 3 desk-pairs)
 *  col 13    : Wall with doorway (rows 3-5)
 *  col 14-18 : Boss office (full purple carpet)
 *  rows 0/10 : Top/bottom outer walls
 */
export function createDefaultLayout(): OfficeLayout {
  const W = TileType.WALL
  const F1 = TileType.FLOOR_1   // corridor beige
  const F3 = TileType.FLOOR_3   // carpet purple
  const F4 = TileType.FLOOR_4   // doorway tan
  const F5 = TileType.FLOOR_5   // workspace teal

  const cols = 19
  const rows = 11

  const tiles: TileTypeVal[] = []
  const tileColors: Array<FloorColor | null> = []

  const WORKSPACE_COLOR: FloorColor  = { h: 190, s: 35, b: 12, c: 0 }
  const CORRIDOR_COLOR: FloorColor   = { h: 35,  s: 25, b: 18, c: 0 }
  const BOSS_CARPET_COLOR: FloorColor = { h: 280, s: 45, b: -5, c: 0 }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Outer border
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
        tiles.push(W); tileColors.push(null); continue
      }
      // Corridor | workspace divider (col 3), doorway rows 3-5
      if (c === 3) {
        if (r >= 3 && r <= 5) { tiles.push(F4); tileColors.push(DEFAULT_DOORWAY_COLOR) }
        else                  { tiles.push(W);  tileColors.push(null) }
        continue
      }
      // Workspace | boss office divider (col 13), doorway rows 3-5
      if (c === 13) {
        if (r >= 3 && r <= 5) { tiles.push(F4); tileColors.push(DEFAULT_DOORWAY_COLOR) }
        else                  { tiles.push(W);  tileColors.push(null) }
        continue
      }
      // Left corridor
      if (c < 3)  { tiles.push(F1); tileColors.push(CORRIDOR_COLOR); continue }
      // Central workspace
      if (c < 13) { tiles.push(F5); tileColors.push(WORKSPACE_COLOR); continue }
      // Boss office — full purple carpet
      tiles.push(F3); tileColors.push(BOSS_CARPET_COLOR)
    }
  }

  // ── desk helper: ONE chair below desk, PC on desk surface ──
  const deskPair = (id: string, baseCol: number, topRow: number): PlacedFurniture[] => {
    const deskRow = topRow + 1
    const botRow  = deskRow + 1
    const cx = baseCol + 0.5  // chair center
    // PC must be at integer col matching a desk tile so deskZByTile z-sort triggers
    return [
      { uid: `desk-${id}`,  type: FurnitureType.TABLE_WOOD_SM_HORIZONTAL, col: baseCol, row: deskRow },
      { uid: `chair-${id}`, type: FurnitureType.BENCH, col: cx,       row: botRow },
      { uid: `pc-${id}`,    type: FurnitureType.PC,    col: baseCol,  row: deskRow },
    ]
  }

  // Two rows of 3 desk-pairs: band A (topRow=1), band B (topRow=5)
  const workspaceDesks = [
    ...deskPair('a1', 4, 1), ...deskPair('a2', 7, 1), ...deskPair('a3', 10, 1),
    ...deskPair('b1', 4, 5), ...deskPair('b2', 7, 5), ...deskPair('b3', 10, 5),
  ]

  const furniture: PlacedFurniture[] = [
    // ── LEFT CORRIDOR ──
    { uid: 'plant-cor-1', type: FurnitureType.PLANT,       col: 1, row: 1 },
    { uid: 'lamp-cor-1',  type: FurnitureType.LAMP,        col: 1, row: 5 },
    { uid: 'plant-cor-2', type: FurnitureType.PLANT_SMALL, col: 1, row: 8 },

    // ── CENTRAL WORKSPACE ──
    // Top wall: clock only (whiteboard removed)
    { uid: 'clock-w',     type: FurnitureType.CLOCK,     col: 11, row: 0 },
    // Bookshelf on right inner wall
    { uid: 'bookshelf-w', type: FurnitureType.BOOKSHELF, col: 12, row: 4 },
    // 6 desk-pairs (1 chair each)
    ...workspaceDesks,

    // ── BOSS OFFICE ──
    { uid: 'clock-r',   type: FurnitureType.CLOCK,             col: 14,  row: 0    },
    { uid: 'library-r', type: FurnitureType.LIBRARY_GRAY_FULL, col: 16,  row: -0.5 },
    { uid: 'plant-boss-tr', type: FurnitureType.PLANT, col: 17, row: 2 },
    // Boss desk: BOSS_DESK (2×2 mahogany, footprint 2×2, col 15-16, row 3-4)
    { uid: 'desk-boss',    type: FurnitureType.BOSS_DESK,    col: 15, row: 3 },
    // Boss chair: 1×1 leather chair, centered behind desk top (col 16, row 2)
    { uid: 'chair-boss',   type: FurnitureType.BOSS_CHAIR,   col: 16, row: 2 },
    // Boss monitor: on desk surface — col 16 row 3 (right tile of desk top row)
    { uid: 'monitor-boss', type: FurnitureType.BOSS_MONITOR, col: 16, row: 3 },
    // Camera: on desk surface — col 15 row 4 (left tile of desk bottom row)
    { uid: 'camera-boss',  type: FurnitureType.CAMERA,       col: 15, row: 4 },
    // Small plant bottom-right corner
    { uid: 'plant-boss-br', type: FurnitureType.PLANT_SMALL, col: 17, row: 7 },
  ]

  return { version: 1, cols, rows, tiles, tileColors, furniture }
}

/** Serialize layout to JSON string */
export function serializeLayout(layout: OfficeLayout): string {
  return JSON.stringify(layout)
}

/** Deserialize layout from JSON string, migrating old tile types if needed */
export function deserializeLayout(json: string): OfficeLayout | null {
  try {
    const obj = JSON.parse(json)
    if (obj && obj.version === 1 && Array.isArray(obj.tiles) && Array.isArray(obj.furniture)) {
      return migrateLayout(obj as OfficeLayout)
    }
  } catch { /* ignore parse errors */ }
  return null
}

/**
 * Ensure layout has tileColors. If missing, generate defaults based on tile types.
 * Exported for use by message handlers that receive layouts over the wire.
 */
export function migrateLayoutColors(layout: OfficeLayout): OfficeLayout {
  return migrateLayout(layout)
}

/**
 * Migrate old layouts that use legacy tile types (TILE_FLOOR=1, WOOD_FLOOR=2, CARPET=3, DOORWAY=4)
 * to the new pattern-based system. If tileColors is already present, no migration needed.
 */
function migrateLayout(layout: OfficeLayout): OfficeLayout {
  if (layout.tileColors && layout.tileColors.length === layout.tiles.length) {
    const furniture = normalizeRightOfficeFurniture(layout.furniture)
    const furnitureChanged =
      furniture.length !== layout.furniture.length ||
      furniture.some((item, index) => item !== layout.furniture[index])
    if (!furnitureChanged) return layout
    return { ...layout, furniture }
  }

  // Check if any tiles use old values (1-4) — these map directly to FLOOR_1-4
  // but need color assignments
  const tileColors: Array<FloorColor | null> = []
  for (const tile of layout.tiles) {
    switch (tile) {
      case 0: // WALL
        tileColors.push(null)
        break
      case 1: // was TILE_FLOOR → FLOOR_1 beige
        tileColors.push(DEFAULT_LEFT_ROOM_COLOR)
        break
      case 2: // was WOOD_FLOOR → FLOOR_2 brown
        tileColors.push(DEFAULT_RIGHT_ROOM_COLOR)
        break
      case 3: // was CARPET → FLOOR_3 purple
        tileColors.push(DEFAULT_CARPET_COLOR)
        break
      case 4: // was DOORWAY → FLOOR_4 tan
        tileColors.push(DEFAULT_DOORWAY_COLOR)
        break
      default:
        // New tile types (5-7) without colors — use neutral gray
        tileColors.push(tile > 0 ? { h: 0, s: 0, b: 0, c: 0 } : null)
    }
  }

  const furniture = normalizeRightOfficeFurniture(layout.furniture)
  return { ...layout, tileColors, furniture }
}

// ── Interaction Points ──────────────────────────────────────────

export interface InteractionPoint {
  col: number
  row: number
  facingDir: Direction
  furnitureType: string
}

/** Furniture types that idle characters can interact with */
const INTERACTABLE_TYPES = new Set([
  FurnitureType.COOLER, FurnitureType.WATER_COOLER,
  FurnitureType.BOOKSHELF, FurnitureType.LIBRARY_GRAY_FULL,
  FurnitureType.WHITEBOARD, FurnitureType.FRIDGE,
  FurnitureType.DECO_3,
])

/** Get interaction points adjacent to interactable furniture */
export function getInteractionPoints(
  furniture: PlacedFurniture[], tileMap: TileTypeVal[][], blockedTiles: Set<string>,
): InteractionPoint[] {
  const points: InteractionPoint[] = []
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || !INTERACTABLE_TYPES.has(item.type as any)) continue
    // Check tiles along the bottom edge + 1 row below the furniture
    for (let dc = 0; dc < entry.footprintW; dc++) {
      const belowCol = Math.round(item.col + dc)
      const belowRow = Math.round(item.row + entry.footprintH)
      if (isWalkable(belowCol, belowRow, tileMap, blockedTiles)) {
        points.push({ col: belowCol, row: belowRow, facingDir: Direction.UP, furnitureType: item.type })
      }
    }
    // Check tiles along the left edge
    for (let dr = 0; dr < entry.footprintH; dr++) {
      const leftCol = Math.round(item.col - 1)
      const leftRow = Math.round(item.row + dr)
      if (isWalkable(leftCol, leftRow, tileMap, blockedTiles)) {
        points.push({ col: leftCol, row: leftRow, facingDir: Direction.RIGHT, furnitureType: item.type })
      }
    }
    // Check tiles along the right edge
    for (let dr = 0; dr < entry.footprintH; dr++) {
      const rightCol = Math.round(item.col + entry.footprintW)
      const rightRow = Math.round(item.row + dr)
      if (isWalkable(rightCol, rightRow, tileMap, blockedTiles)) {
        points.push({ col: rightCol, row: rightRow, facingDir: Direction.LEFT, furnitureType: item.type })
      }
    }
  }

  // Photograph interaction points — idle characters can stop to admire it (row 1, facing up)
  // Avoid cols 15-16 which overlap with whiteboard-r interaction points
  // Duplicate points to increase weight in the random selection pool
  for (let c = 12; c <= 14; c++) {
    if (isWalkable(c, 1, tileMap, blockedTiles)) {
      points.push({ col: c, row: 1, facingDir: Direction.UP, furnitureType: 'photograph' })
      points.push({ col: c, row: 1, facingDir: Direction.UP, furnitureType: 'photograph' })
    }
  }

  return points
}

// ── Doorway Tiles ───────────────────────────────────────────────

/** Find all doorway (FLOOR_4) tiles in the layout */
export function getDoorwayTiles(layout: OfficeLayout): Array<{ col: number; row: number }> {
  const tiles: Array<{ col: number; row: number }> = []
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      if (layout.tiles[r * layout.cols + c] === TileType.FLOOR_4) {
        tiles.push({ col: c, row: r })
      }
    }
  }
  return tiles
}
