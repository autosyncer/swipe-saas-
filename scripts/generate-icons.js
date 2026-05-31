const fs = require('fs')
const path = require('path')

const sizes = [72, 96, 128, 144, 152, 192, 384, 512]
const outputDir = path.join(process.cwd(), 'public', 'icons')

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

try {
  const { createCanvas } = require('canvas')

  sizes.forEach(size => {
    const canvas = createCanvas(size, size)
    const ctx = canvas.getContext('2d')

    // Background
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, size, size)

    // Green circle
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2)
    ctx.fillStyle = '#3ECF8E'
    ctx.fill()

    // S letter
    ctx.fillStyle = '#0f0f0f'
    ctx.font = `bold ${size * 0.45}px Arial`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('S', size / 2, size / 2)

    fs.writeFileSync(path.join(outputDir, `icon-${size}.png`), canvas.toBuffer('image/png'))
    console.log(`Generated icon-${size}.png`)
  })
} catch {
  // canvas not available — generate minimal valid PNGs using raw bytes
  console.log('canvas not available, generating minimal PNG placeholders...')

  // Minimal 1x1 green PNG (valid PNG, browsers will scale)
  // PNG signature + IHDR + IDAT + IEND for a solid #3ECF8E pixel
  function minimalPng(size) {
    // We'll create a simple solid-color PNG using Buffer
    // PNG header
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

    // IHDR chunk: width, height, bit depth 8, color type 2 (RGB), compression 0, filter 0, interlace 0
    const ihdrData = Buffer.alloc(13)
    ihdrData.writeUInt32BE(size, 0)
    ihdrData.writeUInt32BE(size, 4)
    ihdrData[8] = 8   // bit depth
    ihdrData[9] = 2   // color type RGB
    ihdrData[10] = 0  // compression
    ihdrData[11] = 0  // filter
    ihdrData[12] = 0  // interlace

    function crc32(buf) {
      let crc = 0xFFFFFFFF
      const table = []
      for (let i = 0; i < 256; i++) {
        let c = i
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
        table[i] = c
      }
      for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
      return (crc ^ 0xFFFFFFFF) >>> 0
    }

    function chunk(type, data) {
      const typeBytes = Buffer.from(type)
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
      const crcInput = Buffer.concat([typeBytes, data])
      const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(crcInput))
      return Buffer.concat([len, typeBytes, data, crcBuf])
    }

    const ihdr = chunk('IHDR', ihdrData)

    // Build raw image data: each row = filter byte (0) + RGB * size
    // Color: #1a1a1a background with #3ECF8E circle approximation — use #3ECF8E solid for simplicity
    const r = 0x3E, g = 0xCF, b = 0x8E
    const rowSize = 1 + size * 3
    const raw = Buffer.alloc(size * rowSize)
    for (let y = 0; y < size; y++) {
      raw[y * rowSize] = 0 // filter none
      for (let x = 0; x < size; x++) {
        // Simple circle logic
        const dx = x - size / 2, dy = y - size / 2
        const inCircle = Math.sqrt(dx * dx + dy * dy) < size * 0.42
        const pr = inCircle ? r : 0x1a
        const pg = inCircle ? g : 0x1a
        const pb = inCircle ? b : 0x1a
        raw[y * rowSize + 1 + x * 3] = pr
        raw[y * rowSize + 2 + x * 3] = pg
        raw[y * rowSize + 3 + x * 3] = pb
      }
    }

    const zlib = require('zlib')
    const compressed = zlib.deflateSync(raw)
    const idat = chunk('IDAT', compressed)
    const iend = chunk('IEND', Buffer.alloc(0))

    return Buffer.concat([sig, ihdr, idat, iend])
  }

  sizes.forEach(size => {
    const png = minimalPng(size)
    fs.writeFileSync(path.join(outputDir, `icon-${size}.png`), png)
    console.log(`Generated icon-${size}.png (${size}x${size})`)
  })
}

console.log('Done! Icons saved to public/icons/')
