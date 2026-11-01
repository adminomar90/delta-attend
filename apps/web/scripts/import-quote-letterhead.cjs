// Extract the exact artwork from the supplied DOCX; never modify the source.
const fs = require('fs/promises');
const path = require('path');
const unzipper = require('unzipper');
const sharp = require('sharp');

(async () => {
  const source = process.argv[2];
  if (!source) throw Error('Usage: node apps/web/scripts/import-quote-letterhead.cjs <reference.docx>');
  const archive = await unzipper.Open.file(source);
  const part = archive.files.find((file) => file.path === 'word/media/image1.png');
  if (!part) throw Error('Reference letterhead artwork not found');
  const buffer = await part.buffer(), metadata = await sharp(buffer).metadata();
  if (metadata.width !== 3000 || metadata.height !== 4245) throw Error('Unexpected reference artwork dimensions');
  const destination = path.resolve(__dirname, '../public/brand');
  await fs.mkdir(destination, { recursive: true });
  for (const [name, crop] of [
    ['quote-template-header.png', { left: 0, top: 140, width: 3000, height: 478 }],
    ['quote-template-watermark.png', { left: 318, top: 1978, width: 2366, height: 539 }],
    ['quote-template-qr-panel.png', { left: 2320, top: 3823, width: 680, height: 422 }],
  ]) await sharp(buffer).extract(crop).png().toFile(path.join(destination, name));
  console.log('Imported original letterhead header, watermark and QR panel');
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
