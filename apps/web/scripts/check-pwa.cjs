const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const sharp = require('sharp');

const publicDir = path.resolve(__dirname, '../public');
const expectedIcons = new Map([['/favicon-32x32.png', 32], ['/apple-touch-icon.png', 180], ['/icon-192.png', 192], ['/icon-512.png', 512], ['/maskable-icon-192.png', 192], ['/maskable-icon-512.png', 512]]);

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(publicDir, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.id, '/'); assert.equal(manifest.start_url, '/'); assert.equal(manifest.scope, '/');
  assert.equal(manifest.name, 'Delta Plus'); assert.equal(manifest.short_name, 'Delta+'); assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.prefer_related_applications, false);
  for (const size of [192, 512]) for (const purpose of ['any', 'maskable']) assert.ok(manifest.icons.some((icon) => icon.sizes === `${size}x${size}` && icon.purpose === purpose));
  for (const [name, size] of expectedIcons) {
    const file = path.join(publicDir, name.slice(1)), metadata = await sharp(file).metadata();
    assert.equal(metadata.format, 'png'); assert.equal(metadata.width, size); assert.equal(metadata.height, size); assert.equal(metadata.hasAlpha, false);
    if (name.includes('maskable')) {
      const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true }); let pixels = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const index = (y * size + x) * info.channels, r = data[index], g = data[index + 1], b = data[index + 2];
        // White lettering and the lime '+' must survive the standard safe-circle crop.
        if ((r > 190 && g > 190 && b > 190) || (r > 130 && g > 160 && b < 120)) {
          pixels++;
          assert.ok(Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) <= size * 0.4, `${name}: brand outside maskable safe area`);
        }
      }
      assert.ok(pixels > 50);
    }
  }
  const ico = await fs.readFile(path.join(publicDir, 'favicon.ico'));
  assert.equal(ico.readUInt16LE(0), 0); assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 4);
  for (let index = 0; index < 4; index++) {
    const entry = 6 + index * 16, length = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
    assert.equal((await sharp(ico.subarray(offset, offset + length)).metadata()).width, ico[entry]);
  }
  console.log('PASS manifest, PNG sizes, ICO images and maskable brand safe area');

  const handlers = new Map(); let shownNotification;
  const sandbox = {
    URL, Response,
    fetch: async (request, options) => { assert.equal(options.cache, 'no-store'); return new Response('fresh-network-data'); },
    caches: new Proxy({}, { get() { throw new Error('Worker must not use Cache Storage'); } }),
    indexedDB: new Proxy({}, { get() { throw new Error('Worker must not store user data'); } }),
    self: { location: { origin: 'https://delta.test' }, skipWaiting: async () => {}, clients: { claim: async () => {}, matchAll: async () => [] },
      registration: { showNotification: async (title, options) => { shownNotification = { title, options }; } },
      addEventListener: (name, handler) => handlers.set(name, handler) },
  };
  vm.runInNewContext(await fs.readFile(path.join(publicDir, 'sw-notifications.js'), 'utf8'), sandbox);
  for (const [url, mode, method] of [['https://delta.test/api/auth/me', 'navigate', 'GET'], ['https://delta.test/api/inventory', 'cors', 'POST'], ['https://delta.test/_next/static/main.js', 'cors', 'GET'], ['https://delta.test/uploads/private.pdf', 'navigate', 'GET'], ['https://api.delta.test/private', 'navigate', 'GET']]) {
    let intercepted = false;
    handlers.get('fetch')({ request: { url, mode, method }, respondWith: () => { intercepted = true; } }); assert.equal(intercepted, false, url);
  }
  let response;
  handlers.get('fetch')({ request: { url: 'https://delta.test/warehouses', mode: 'navigate', method: 'GET' }, respondWith: (value) => { response = value; } });
  assert.equal(await (await response).text(), 'fresh-network-data');
  sandbox.fetch = async () => { throw new Error('offline'); };
  handlers.get('fetch')({ request: { url: 'https://delta.test/login', mode: 'navigate', method: 'GET' }, respondWith: (value) => { response = value; } });
  const offline = await response;
  assert.equal(offline.status, 503); assert.equal(offline.headers.get('Cache-Control'), 'no-store');
  assert.ok((await offline.text()).includes('لا يوجد اتصال بالشبكة'));
  let push;
  handlers.get('push')({ data: { json: () => ({ title: 'Existing push still works' }) }, waitUntil: (value) => { push = value; } }); await push;
  assert.equal(shownNotification.title, 'Existing push still works'); assert.equal(shownNotification.options.icon, '/icon-192.png');
  console.log('PASS network-only navigation, API/auth/data bypass, offline fallback and existing push');

  if (process.argv[2]) {
    const base = new URL(process.argv[2]);
    assert.ok(base.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Use HTTPS outside localhost');
    const result = await fetch(new URL('/manifest.webmanifest', base));
    assert.equal(result.status, 200); assert.match(result.headers.get('content-type'), /application\/manifest\+json/);
    assert.match(result.headers.get('cache-control'), /max-age=0/); assert.deepEqual(await result.json(), manifest);
    for (const [name, size] of expectedIcons) {
      const asset = await fetch(new URL(name, base)); assert.equal(asset.status, 200, name); assert.match(asset.headers.get('content-type'), /image\/png/);
      assert.equal((await sharp(Buffer.from(await asset.arrayBuffer())).metadata()).width, size);
    }
    const favicon = await fetch(new URL('/favicon.ico', base)); assert.equal(favicon.status, 200); assert.equal(Buffer.from(await favicon.arrayBuffer()).readUInt16LE(2), 1);
    const worker = await fetch(new URL('/sw-notifications.js', base)); assert.equal(worker.status, 200); assert.match(worker.headers.get('cache-control'), /no-store/); assert.equal(worker.headers.get('service-worker-allowed'), '/');
    for (const page of ['/', '/login', '/network-documentation']) {
      const html = await (await fetch(new URL(page, base))).text();
      assert.match(html, /<link[^>]+rel="manifest"[^>]+href="\/manifest.webmanifest"/);
      assert.match(html, /<link[^>]+rel="apple-touch-icon"[^>]+href="\/apple-touch-icon.png"/);
      assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
      assert.match(html, /name="apple-mobile-web-app-title" content="Delta Plus"/);
      assert.match(html, /name="theme-color" content="#0d182e"/);
    }
    console.log(`PASS live manifest, all icon URLs, SW headers and shared page metadata at ${base.origin}`);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
