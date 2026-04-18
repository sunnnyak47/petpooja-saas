/**
 * Icon Generator for Petpooja ERP Desktop App
 * 
 * Generates placeholder PNG icons without any native dependencies.
 * Uses raw PNG encoding (zlib deflate) so it works anywhere Node.js runs.
 *
 * Generated files:
 *   - assets/icon.png      (512×512) — main app icon
 *   - assets/tray-icon.png (22×22)   — system tray icon
 *
 * Run: node scripts/generate-icons.js
 */

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const ASSETS_DIR = path.join(__dirname, '../assets')

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true })
}

/**
 * Encodes a raw RGBA pixel array into a valid PNG file buffer.
 * Implements the PNG spec: signature + IHDR + IDAT + IEND chunks.
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba - flat RGBA array (width * height * 4 bytes)
 * @returns {Buffer} PNG file buffer
 */
function encodePNG(width, height, rgba) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR chunk: width, height, bit depth, color type (RGBA=6)
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8  // bit depth
  ihdrData[9] = 6  // color type: RGBA
  ihdrData[10] = 0 // compression
  ihdrData[11] = 0 // filter
  ihdrData[12] = 0 // interlace

  // Build raw scanlines (filter type 0 = None prepended per row)
  const scanlines = Buffer.alloc((1 + width * 4) * height)
  for (let y = 0; y < height; y++) {
    scanlines[y * (1 + width * 4)] = 0 // filter byte
    rgba.copy(scanlines, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4)
  }

  const compressed = zlib.deflateSync(scanlines, { level: 6 })

  /**
   * Creates a PNG chunk: 4-byte length + 4-byte type + data + 4-byte CRC
   */
  function makeChunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeB = Buffer.from(type, 'ascii')
    const crc = crc32(Buffer.concat([typeB, data]))
    const crcB = Buffer.alloc(4)
    crcB.writeUInt32BE(crc >>> 0)
    return Buffer.concat([len, typeB, data, crcB])
  }

  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Simple CRC-32 implementation for PNG chunk integrity.
 */
function crc32(buf) {
  const table = makeCRCTable()
  let crc = 0xffffffff
  for (const byte of buf) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff]
  }
  return (crc ^ 0xffffffff)
}

function makeCRCTable() {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    t[n] = c
  }
  return t
}

/**
 * Generates an RGBA pixel array for the Petpooja icon.
 * Orange rounded-rect background with white "PP" initials.
 * @param {number} size
 * @returns {Uint8Array} RGBA pixels
 */
function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.16

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4

      // Determine if inside rounded rectangle
      const dx = Math.max(radius - x, 0, x - (size - radius))
      const dy = Math.max(radius - y, 0, y - (size - radius))
      const dist = Math.sqrt(dx * dx + dy * dy)
      const insideRect = dist <= radius

      if (!insideRect) {
        // Transparent outside
        pixels[idx + 3] = 0
        continue
      }

      // Orange background
      pixels[idx]     = 249 // R
      pixels[idx + 1] = 115 // G
      pixels[idx + 2] = 22  // B
      pixels[idx + 3] = 255

      // Simple "P" letter pixels for large icons (size >= 64)
      // Draw a centered white rectangle block as letter approximation
      if (size >= 64) {
        const lx = x - cx
        const ly = y - cy
        const relX = lx / size
        const relY = ly / size

        // Vertical stroke of P
        if (relX > -0.18 && relX < -0.06 && relY > -0.28 && relY < 0.28) {
          pixels[idx] = 255; pixels[idx+1] = 255; pixels[idx+2] = 255
        }
        // Horizontal strokes of P (top, middle, and bowl)
        if (relX > -0.18 && relX < 0.12 && relY > -0.28 && relY < -0.16) {
          pixels[idx] = 255; pixels[idx+1] = 255; pixels[idx+2] = 255
        }
        if (relX > -0.18 && relX < 0.12 && relY > -0.04 && relY < 0.06) {
          pixels[idx] = 255; pixels[idx+1] = 255; pixels[idx+2] = 255
        }
        // Right curve of P bowl (approximate with rect)
        if (relX > 0.04 && relX < 0.16 && relY > -0.28 && relY < 0.06) {
          pixels[idx] = 255; pixels[idx+1] = 255; pixels[idx+2] = 255
        }
      }
    }
  }

  return Buffer.from(pixels)
}

console.log('\n🎨 Generating Petpooja ERP icons (pure JS, no native deps)...\n')

// Generate 512×512 main icon
const icon512 = drawIcon(512)
const png512 = encodePNG(512, 512, icon512)
fs.writeFileSync(path.join(ASSETS_DIR, 'icon.png'), png512)
console.log('✅ Generated: icon.png (512×512)')

// Generate 22×22 tray icon (just orange square with white dot pattern)
const icon22 = drawIcon(22)
const png22 = encodePNG(22, 22, icon22)
fs.writeFileSync(path.join(ASSETS_DIR, 'tray-icon.png'), png22)
console.log('✅ Generated: tray-icon.png (22×22)')

console.log('\n✨ All icons generated in /desktop/assets/')
console.log('💡 For production, replace these with professionally designed icons.')
console.log('   Use https://www.electronforge.io/guides/create-and-add-icons for .ico/.icns\n')
