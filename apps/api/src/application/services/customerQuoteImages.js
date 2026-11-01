import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const quoteImageUrl = (value) => {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url.startsWith('/uploads/') || /[\\\x00-\x1f]/.test(url)) return '';
  try {
    const decoded = decodeURIComponent(url);
    if (/[\\\x00-\x1f]/.test(decoded) || decoded.split('/').some((part) => part === '..' || part === '.')) return '';
    return url;
  } catch { return ''; }
};

// Use only local catalog images. Never fetch a URL from a quote or resolve a
// symlink outside uploads. Resize a memory copy; original uploads stay intact.
export const loadQuoteImage = async (url, uploadRootDir) => {
  const safe = quoteImageUrl(url);
  if (!safe) return null;
  try {
    const root = await fs.realpath(uploadRootDir);
    const image = await fs.realpath(path.resolve(root, decodeURIComponent(safe.slice('/uploads/'.length))));
    if (!image.startsWith(root + path.sep)) return null;
    const stat = await fs.stat(image);
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024) return null;
    const buffer = await fs.readFile(image);
    // SVG/PDF input is not a catalog photo; raster formats include PNG/JPG/WebP.
    const processor = sharp(buffer, { limitInputPixels: 40000000 });
    const metadata = await processor.metadata();
    if (!['jpeg', 'png', 'webp', 'gif', 'heif', 'avif', 'tiff'].includes(metadata.format)) return null;
    return await processor.rotate().resize({ width: 240, height: 240, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).png().toBuffer();
  } catch { return null; }
};
