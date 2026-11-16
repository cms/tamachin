// Herramientas de las pruebas: un servidor de archivos para el repo, Chrome sin interfaz (Playwright con el Chrome instalado)
// y una página del juego con acceso a sus variables internas.
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');                 // capturas de pantalla (no se versiona)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function playwright() {
  try { return require('playwright-core'); } catch (e) { /* sigue */ }
  if (process.env.PLAYWRIGHT_CORE) return require(process.env.PLAYWRIGHT_CORE);
  throw new Error('Falta playwright-core: ejecuta `npm install` en la raíz del repo.');
}

// Sirve la raíz del repo en un puerto libre de 127.0.0.1.
function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(REPO, rel);
    if (!file.startsWith(REPO + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: 'http://127.0.0.1:' + server.address().port + '/' })));
}

async function launch() {
  const args = ['--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'];   // la música y los efectos corren, pero no suenan en la compu
  if (process.platform === 'darwin') args.push('--use-angle=metal');
  return playwright().chromium.launch({ channel: 'chrome', headless: true, args });
}

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 800 } };

// Abre el juego. `expose` son nombres de variables internas de la IIFE (p. ej. 'player, scene') que quedan en window.__dbg.
// `init` corre antes de que cargue la página (para preparar localStorage). Devuelve { ctx, page, errors, E }.
async function openGame(T, opts = {}) {
  const ctx = opts.ctx || await T.browser.newContext(opts.device || DESKTOP);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('error: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) errors.push('http ' + r.status() + ' ' + r.url()); });
  page.on('requestfailed', (r) => errors.push('falló ' + r.url() + ' ' + ((r.failure() || {}).errorText || '')));
  if (opts.expose) {
    const src = fs.readFileSync(path.join(REPO, 'game.js'), 'utf8');
    const hook = 'window.__dbg = { ' + opts.expose + ' };\nwindow.__tamachin = {';
    if (!src.includes('window.__tamachin = {')) throw new Error('game.js ya no tiene "window.__tamachin = {"');
    const body = src.replace('window.__tamachin = {', hook);
    await page.route('**/game.js', (r) => r.fulfill({ body, contentType: 'application/javascript' }));
  }
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto(T.url + (opts.query || ''));
  await page.waitForFunction(() => !!window.__tamachin, null, { timeout: 30000 });
  await sleep(opts.settle || 1200);
  if (opts.help !== true) await page.evaluate(() => { document.querySelector('#help').hidden = true; });
  const E = (f, a) => page.evaluate(f, a);
  return { ctx, page, errors, E };
}

// Toques reales (CDP): Playwright solo sabe tocar, no arrastrar con varios dedos.
async function touchscreen(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  return (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
}

// Raycast cámara→Tamachin contra la escena (la página debe exponer scene, camera, player, occluders, house).
// Devuelve qué tapa: 'edificio', 'casa', 'árbol' (InstancedMesh), 'otro' o null. El raycast no sabe de planos de corte ni del
// shader: lo cortado se descarta a mano, pero los árboles del norte agachados no, así que ahí 'árbol' puede ser falso.
const BLOCKER = () => {
  const D = window.__dbg, rc = new THREE.Raycaster(), own = new Set(); rc.camera = D.camera; D.player.T.group.traverse((o) => own.add(o));
  const houseMats = [D.house.mWalls, D.house.mFront, D.house.mRoof, D.house.mShelf, D.house.doorMat];
  window.__blocker = (h = 0.75) => {
    const P = D.player, t = new THREE.Vector3(P.pos.x, P.pos.y + h * P.T.scale, P.pos.z), d = t.clone().sub(D.camera.position), L = d.length();
    d.normalize(); rc.set(D.camera.position, d); rc.far = L - 0.9;
    for (const hit of rc.intersectObjects(D.scene.children, true)) {
      const o = hit.object; if (own.has(o) || o.isSprite || !o.visible) continue;
      let m = o.material; if (Array.isArray(m)) m = m[hit.face ? hit.face.materialIndex : 0];
      if (!m || m.side === THREE.BackSide || (m.transparent && m.opacity < 0.5)) continue;
      if (m.clippingPlanes && m.clippingPlanes.some((p) => p.distanceToPoint(hit.point) < 0)) continue;   // la parte cortada no se dibuja
      const at = [hit.point.x, hit.point.y, hit.point.z].map((v) => v.toFixed(1)).join(',');
      if (D.occluders.some((q) => q.mats.includes(m))) return 'edificio@' + at;
      if (houseMats.includes(m)) return 'casa@' + at;
      return (o.isInstancedMesh ? 'árbol@' : 'otro@') + at;
    }
    return null;
  };
};

module.exports = { REPO, OUT, sleep, serve, launch, openGame, touchscreen, BLOCKER, PHONE, DESKTOP };
