// Deterministically resize the supplied official artwork; no redrawing or cropping.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

async function main() {
  const publicDir = path.resolve(__dirname, '../public');
  const source = path.join(publicDir, 'brand/delta-plus-pwa-source.jpeg');
  const icon = (size) => sharp(source).rotate().resize(size, size, { fit: 'contain', background: '#0d182e' }).removeAlpha().png().toBuffer();
  for (const [name, size] of [['favicon-32x32.png', 32], ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['maskable-icon-192.png', 192], ['maskable-icon-512.png', 512]]) {
    await fs.writeFile(path.join(publicDir, name), await icon(size));
  }
  // ICO directory containing PNG images, supported by current Windows browsers.
  const sizes = [16, 32, 48, 64], images = await Promise.all(sizes.map(icon));
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16;
    header[entry] = size; header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(images[index].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += images[index].length;
  });
  await fs.writeFile(path.join(publicDir, 'favicon.ico'), Buffer.concat([header, ...images]));
  console.log('Generated 6 PNG icons and a multi-size favicon from the official Delta Plus artwork.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
