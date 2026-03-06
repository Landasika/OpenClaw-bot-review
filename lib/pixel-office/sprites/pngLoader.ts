import type { SpriteData } from '../types'
import { setCharacterTemplates } from './spriteData'
import type { LoadedCharacterData } from './spriteData'
import { setWallSprites } from '../wallTiles'

/**
 * Load a PNG image and convert it to SpriteData (2D array of hex color strings).
 * Transparent pixels become '' (empty string).
 */
function pngToSpriteData(img: HTMLImageElement): SpriteData {
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, img.width, img.height)
  const { data, width, height } = imageData

  const result: string[][] = []
  for (let y = 0; y < height; y++) {
    const row: string[] = []
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
      if (a < 128) {
        row.push('')
      } else {
        row.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase())
      }
    }
    result.push(row)
  }
  return result
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * Extract a sub-region from a SpriteData array.
 */
function extractRegion(sprite: SpriteData, x: number, y: number, w: number, h: number): SpriteData {
  const result: string[][] = []
  for (let row = y; row < y + h; row++) {
    result.push(sprite[row].slice(x, x + w))
  }
  return result
}

/**
 * Parse a character PNG (112×96) into LoadedCharacterData.
 * Layout: 7 frames × 16px wide, 3 direction rows × 32px tall (24px sprite + 8px top padding).
 * Row 0 = down, Row 1 = up, Row 2 = right.
 * Frame order: walk1, walk2, walk3, type1, type2, read1, read2.
 */
function parseCharacterSheet(sheet: SpriteData): LoadedCharacterData {
  const FRAME_W = 16
  const FRAME_H = 32
  const extract = (frame: number, dirRow: number) =>
    extractRegion(sheet, frame * FRAME_W, dirRow * FRAME_H, FRAME_W, FRAME_H)

  return {
    down: [extract(0, 0), extract(1, 0), extract(2, 0), extract(3, 0), extract(4, 0), extract(5, 0), extract(6, 0)],
    up: [extract(0, 1), extract(1, 1), extract(2, 1), extract(3, 1), extract(4, 1), extract(5, 1), extract(6, 1)],
    right: [extract(0, 2), extract(1, 2), extract(2, 2), extract(3, 2), extract(4, 2), extract(5, 2), extract(6, 2)],
  }
}

/**
 * Load character PNGs from /assets/pixel-office/characters/ and register them.
 * Falls back silently to hardcoded templates if loading fails.
 */
export async function loadCharacterPNGs(): Promise<boolean> {
  try {
    const characters: LoadedCharacterData[] = []
    for (let i = 0; i < 6; i++) {
      const img = await loadImage(`/assets/pixel-office/characters/char_${i}.png`)
      const sheet = pngToSpriteData(img)
      characters.push(parseCharacterSheet(sheet))
    }
    setCharacterTemplates(characters)
    return true
  } catch (e) {
    console.warn('Failed to load character PNGs, using fallback templates:', e)
    return false
  }
}

/**
 * Load walls.png (64×128, 4×4 grid of 16×32 pieces) and register wall sprites.
 * 16 auto-tile sprites indexed by bitmask (N=1, E=2, S=4, W=8).
 * Grid layout: left-to-right, top-to-bottom → bitmask 0,1,2,...,15.
 */
export async function loadWallPNG(): Promise<boolean> {
  try {
    const img = await loadImage('/assets/pixel-office/walls.png')
    const sheet = pngToSpriteData(img)
    const PIECE_W = 16
    const PIECE_H = 32
    const COLS = 4
    const sprites: SpriteData[] = []
    for (let i = 0; i < 16; i++) {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      sprites.push(extractRegion(sheet, col * PIECE_W, row * PIECE_H, PIECE_W, PIECE_H))
    }
    setWallSprites(sprites)
    return true
  } catch (e) {
    console.warn('Failed to load walls.png, using fallback solid walls:', e)
    return false
  }
}
